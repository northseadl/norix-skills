// Reactive Scheduler — event-driven task scheduling replacing FIFO queue processing
// Core: dependency resolution, auto-merge propagation, BLOCKED classification, idle detection

import { log } from "./logger.mjs";
import { resolveTicketDAG, areDepsMet } from "./goal_tracker.mjs";
import { mergeRoleToIntegration, propagateToAllWorktrees } from "./integration.mjs";
import { getRoleType } from "./roles.mjs";

// ─── Scheduler State ───

/**
 * @typedef {Object} SchedulerEvent
 * @property {string} type - "ticket_done" | "role_blocked" | "role_idle" | "tick"
 * @property {string} [role]
 * @property {string} [ticketId]
 * @property {object} [data]
 */

export class Scheduler {
    #store;
    #cwd;
    #runId;
    #eventQueue = [];
    #waitingTickets = new Map(); // ticketId → { deps: string[], role_type: string }
    #onAssign; // callback(role, ticketPath) → Promise
    #onSignal; // callback(signal) → void

    constructor(store, cwd, runId, { onAssign, onSignal }) {
        this.#store = store;
        this.#cwd = cwd;
        this.#runId = runId;
        this.#onAssign = onAssign;
        this.#onSignal = onSignal;
    }

    /**
     * Push an event for the scheduler to process.
     */
    pushEvent(event) {
        this.#eventQueue.push(event);
    }

    /**
     * Process all queued events. Called periodically by the Hub serve loop.
     * @returns {{ actions: object[] }}
     */
    async processEvents() {
        const events = this.#eventQueue.splice(0);
        const actions = [];

        for (const event of events) {
            switch (event.type) {
                case "ticket_done":
                    actions.push(...(await this.#handleTicketDone(event)));
                    break;
                case "role_blocked":
                    actions.push(...(await this.#handleRoleBlocked(event)));
                    break;
                case "role_idle":
                    actions.push(...this.#handleRoleIdle(event));
                    break;
                case "tick":
                    actions.push(...this.#handleTick());
                    break;
            }
        }

        return { actions };
    }

    // ─── Event Handlers ───

    async #handleTicketDone(event) {
        const { role, ticketId } = event;
        const actions = [];
        const state = this.#store.getState();
        const roleState = state.roles?.[role];

        // Step 1: Merge role branch to integration
        if (roleState?.branch) {
            const mergeResult = await mergeRoleToIntegration(
                this.#cwd, this.#runId, role, roleState.branch,
            );
            if (mergeResult.conflicted) {
                this.#onSignal?.(`MERGE_CONFLICT role=${role} ticket=${ticketId}`);
                actions.push({ type: "merge_conflict", role, ticketId });
                return actions;
            }
            actions.push({ type: "merged", role, ticketId });

            // Step 2: Propagate to downstream worktrees
            const rebaseResults = await propagateToAllWorktrees(
                this.#cwd, this.#runId, state, role,
            );
            for (const r of rebaseResults) {
                if (!r.success) {
                    log("WARN", `Rebase failed for ${r.role}: ${r.message}`);
                }
            }
            actions.push({ type: "propagated", results: rebaseResults });
        }

        // Step 3: Check if any waiting tickets are now ready
        const nowReady = this.#resolveWaiters(ticketId);
        for (const readyTicket of nowReady) {
            const assignedRole = this.#pickRoleForTicket(readyTicket);
            if (assignedRole) {
                actions.push({
                    type: "auto_assign",
                    role: assignedRole,
                    ticketId: readyTicket.id,
                    reason: `dependency ${ticketId} completed`,
                });
                // Trigger actual assignment
                if (this.#onAssign) {
                    await this.#onAssign(assignedRole, readyTicket.path);
                }
            }
        }

        return actions;
    }

    async #handleRoleBlocked(event) {
        const { role, ticketId, report } = event;
        const actions = [];
        const state = this.#store.getState();

        // Classify BLOCKED reason
        const blockType = this.#classifyBlock(ticketId, report, state);

        if (blockType === "dependency") {
            // Auto-resolve: put ticket in waiting queue
            const ticket = state.tickets?.[ticketId];
            const deps = ticket?.depends_on || [];
            this.#waitingTickets.set(ticketId, {
                deps,
                role_type: ticket?.role_type || getRoleType(role),
                path: ticket?.path,
                id: ticketId,
            });
            log("INFO", `Ticket ${ticketId} → waiting queue (deps: ${deps.join(",")})`);
            actions.push({ type: "auto_wait", ticketId, deps });
            // Role becomes idle, ready for other work
            this.#store.updateRole(role, { status: "idle" });
        } else {
            // Decision block — escalate to Leader
            this.#onSignal?.(`ATTENTION role=${role} blocked ticket=${ticketId} type=decision`);
            actions.push({ type: "escalate", role, ticketId });
        }

        return actions;
    }

    #handleRoleIdle(event) {
        const { role } = event;
        const actions = [];
        const state = this.#store.getState();

        // Check if there are ready tickets for this role type
        const roleType = getRoleType(role);
        const { ready } = resolveTicketDAG(state);
        const matchingTickets = ready.filter((tid) => {
            const t = state.tickets?.[tid];
            return t?.role_type === roleType;
        });

        if (matchingTickets.length > 0) {
            actions.push({
                type: "idle_has_work",
                role,
                availableTickets: matchingTickets,
            });
        }

        return actions;
    }

    #handleTick() {
        const actions = [];
        const state = this.#store.getState();
        const roles = state.roles || {};

        // Detect prolonged IDLE (>300s)
        const idleRoles = [];
        const blockedRoles = [];
        const runningRoles = [];

        for (const [role, r] of Object.entries(roles)) {
            if (r.status === "idle") idleRoles.push(role);
            if (r.status === "blocked") blockedRoles.push(role);
            if (r.status === "running") runningRoles.push(role);
        }

        const totalRoles = Object.keys(roles).length;
        const idleRatio = totalRoles > 0 ? idleRoles.length / totalRoles : 0;

        if (idleRatio > 0.5 && runningRoles.length > 0) {
            actions.push({
                type: "utilization_warning",
                idle: idleRoles,
                running: runningRoles,
                blocked: blockedRoles,
            });
        }

        // Check convergence
        const { ready, waiting, done } = resolveTicketDAG(state);
        const allTickets = Object.keys(state.tickets || {});
        if (allTickets.length > 0 && done.length === allTickets.length) {
            actions.push({ type: "all_done" });
            this.#onSignal?.("COMPLETED");
        }

        return actions;
    }

    // ─── Internal Helpers ───

    #resolveWaiters(completedTicketId) {
        const nowReady = [];

        for (const [ticketId, waiter] of this.#waitingTickets.entries()) {
            const remainingDeps = waiter.deps.filter((d) => d !== completedTicketId);
            if (remainingDeps.length === 0) {
                nowReady.push(waiter);
                this.#waitingTickets.delete(ticketId);
            } else {
                waiter.deps = remainingDeps;
            }
        }

        return nowReady;
    }

    #classifyBlock(ticketId, report, state) {
        const ticket = state.tickets?.[ticketId];
        const deps = ticket?.depends_on || [];

        // If ticket has declared dependencies and they're not met, it's a dependency block
        if (deps.length > 0 && !areDepsMet(state, ticketId)) {
            return "dependency";
        }

        // Heuristic: check report text for dependency-like keywords
        if (report) {
            const depPatterns = [
                /directory .* does not exist/i,
                /module .* not found/i,
                /depends on .* which is not/i,
                /waiting for .* to complete/i,
                /prerequisite .* missing/i,
            ];
            for (const p of depPatterns) {
                if (p.test(report)) return "dependency";
            }
        }

        return "decision";
    }

    #pickRoleForTicket(ticket) {
        const state = this.#store.getState();
        const targetType = ticket.role_type;

        // Find idle roles of matching type
        for (const [role, r] of Object.entries(state.roles || {})) {
            if (getRoleType(role) === targetType && r.status === "idle") {
                return role;
            }
        }

        return null;
    }
}
