// Goal Tracker — team-level goal awareness, progress tracking, and ticket DAG resolution

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeTextAtomic } from "./atomic.mjs";
import { log } from "./logger.mjs";

// ─── Ticket Meta Parsing ───

/**
 * Parse ticket-meta from a ticket markdown file.
 * Looks for HTML comment block: <!-- ticket-meta ... -->
 * @returns {{ depends_on: string[], role_type: string, estimate: string, priority: number } | null}
 */
export function parseTicketMeta(ticketContent) {
    const match = ticketContent.match(/<!--\s*ticket-meta\s*([\s\S]*?)-->/);
    if (!match) return null;

    const block = match[1];
    const meta = {};
    for (const line of block.split("\n")) {
        const kv = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
        if (!kv) continue;
        const [, key, rawVal] = kv;
        let val = rawVal.trim();
        // Parse array values: [a, b, c]
        if (val.startsWith("[") && val.endsWith("]")) {
            val = val
                .slice(1, -1)
                .split(",")
                .map((s) => s.trim().replace(/['"]/g, ""))
                .filter(Boolean);
        }
        meta[key] = val;
    }

    return {
        depends_on: Array.isArray(meta.depends_on) ? meta.depends_on : [],
        role_type: meta.role_type || null,
        estimate: meta.estimate || "M",
        priority: parseInt(meta.priority, 10) || 3,
    };
}

// ─── Ticket DAG ───

/**
 * Build a dependency graph from all tickets in state.
 * @param {object} state - TeamStore state with tickets
 * @returns {{ ready: string[], waiting: Map<string, string[]>, done: string[] }}
 */
export function resolveTicketDAG(state) {
    const tickets = state.tickets || {};
    const done = [];
    const waiting = new Map();
    const ready = [];

    for (const [id, ticket] of Object.entries(tickets)) {
        if (ticket.status === "done" || ticket.teamStatus === "DONE") {
            done.push(id);
            continue;
        }
        const deps = ticket.depends_on || [];
        const unmetDeps = deps.filter(
            (depId) => {
                const dep = tickets[depId];
                return !dep || (dep.status !== "done" && dep.teamStatus !== "DONE");
            },
        );
        if (unmetDeps.length > 0) {
            waiting.set(id, unmetDeps);
        } else if (ticket.status !== "running" && ticket.status !== "assigned") {
            ready.push(id);
        }
    }

    // Sort ready by priority (lower number = higher priority)
    ready.sort((a, b) => (tickets[a]?.priority || 3) - (tickets[b]?.priority || 3));

    return { ready, waiting, done };
}

/**
 * Check if a specific ticket's dependencies are all satisfied.
 */
export function areDepsMet(state, ticketId) {
    const ticket = state.tickets?.[ticketId];
    if (!ticket) return false;
    const deps = ticket.depends_on || [];
    return deps.every((depId) => {
        const dep = state.tickets?.[depId];
        return dep && (dep.status === "done" || dep.teamStatus === "DONE");
    });
}

// ─── Progress Tracking ───

/**
 * Compute team progress from ticket states.
 * @returns {{ categories: object, overall: number, active: object[] }}
 */
export function computeProgress(state) {
    const tickets = state.tickets || {};
    const categories = {};
    const active = [];

    for (const [id, t] of Object.entries(tickets)) {
        const cat = t.category || "uncategorized";
        if (!categories[cat]) categories[cat] = { done: 0, total: 0 };
        categories[cat].total++;
        if (t.status === "done" || t.teamStatus === "DONE") {
            categories[cat].done++;
        }
        if (t.status === "running" || t.status === "assigned") {
            const role = t.role || "?";
            const elapsed = t.assignedAt
                ? Math.floor((Date.now() - new Date(t.assignedAt).getTime()) / 60000)
                : 0;
            active.push({ id, role, status: t.status, elapsed: `${elapsed}m` });
        }
    }

    const totalTickets = Object.keys(tickets).length;
    const doneTickets = Object.values(tickets).filter(
        (t) => t.status === "done" || t.teamStatus === "DONE",
    ).length;
    const overall = totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0;

    return { categories, overall, active };
}

// ─── Goal File Generation ───

/**
 * Generate/update the goal.md file on the Blackboard.
 * @param {string} cwd
 * @param {string} runId
 * @param {object} state
 * @param {{ goal: string }} meta
 */
export async function updateGoalFile(cwd, runId, state, meta) {
    const { categories, overall, active } = computeProgress(state);
    const { ready, waiting, done } = resolveTicketDAG(state);
    const tickets = state.tickets || {};

    const lines = [`# Team Goal\n`];
    lines.push(`> ${meta.goal || "No goal defined"}\n`);

    // Progress table
    lines.push(`## Progress (${overall}%)\n`);
    lines.push(`| Category | Done | Total | % |`);
    lines.push(`|:---|:---|:---|:---|`);
    for (const [cat, { done: d, total: t }] of Object.entries(categories)) {
        const pct = t > 0 ? Math.round((d / t) * 100) : 0;
        lines.push(`| ${cat} | ${d} | ${t} | ${pct}% |`);
    }

    // Active work
    if (active.length > 0) {
        lines.push(`\n## Active Work\n`);
        for (const a of active) {
            lines.push(`- **${a.role}**: ticket ${a.id} — ${a.status} (${a.elapsed})`);
        }
    }

    // DAG status
    lines.push(`\n## Ticket DAG\n`);
    lines.push(`- ✅ Done: ${done.join(", ") || "none"}`);
    lines.push(`- 🟢 Ready: ${ready.join(", ") || "none"}`);
    if (waiting.size > 0) {
        const waitEntries = [...waiting.entries()]
            .map(([id, deps]) => `${id}(→${deps.join(",")})`)
            .join(", ");
        lines.push(`- ⏳ Waiting: ${waitEntries}`);
    }

    const goalPath = join(cwd, ".agent-team", "runs", runId, "blackboard", "goal.md");
    await writeTextAtomic(goalPath, lines.join("\n") + "\n");
}
