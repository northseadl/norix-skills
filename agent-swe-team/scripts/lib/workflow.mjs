// Workflow Engine — declarative phase definitions with auto-trigger

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeJsonAtomic } from "./atomic.mjs";
import { workflowPath } from "./paths.mjs";
import { log } from "./logger.mjs";

// ─── Preset Templates ───

const PRESETS = {
    fullstack: {
        phases: [
            {
                id: "design",
                roles: ["architect"],
                autoTrigger: "on_start",
                outputs: ["contracts"],
            },
            {
                id: "implement",
                roles: ["backend", "frontend"],
                parallel: true,
                dependsOn: ["design"],
                inputs: ["contracts"],
                outputs: ["api_surface", "components"],
            },
            {
                id: "verify",
                roles: ["qa"],
                dependsOn: ["implement"],
                inputs: ["changelog", "contracts"],
                outputs: ["findings"],
            },
            {
                id: "review",
                roles: ["reviewer"],
                dependsOn: ["verify"],
                inputs: ["changelog", "contracts", "findings"],
                outputs: ["approval"],
                onChangesRequested: "loop_to_implement",
            },
        ],
    },
    "backend-only": {
        phases: [
            {
                id: "implement",
                roles: ["backend"],
                autoTrigger: "on_start",
                outputs: ["api_surface"],
            },
            {
                id: "verify",
                roles: ["qa"],
                dependsOn: ["implement"],
                inputs: ["changelog"],
                outputs: ["findings"],
            },
            {
                id: "review",
                roles: ["reviewer"],
                dependsOn: ["verify"],
                inputs: ["changelog", "findings"],
                outputs: ["approval"],
            },
        ],
    },
    "frontend-only": {
        phases: [
            {
                id: "implement",
                roles: ["frontend"],
                autoTrigger: "on_start",
                outputs: ["components"],
            },
            {
                id: "verify",
                roles: ["qa"],
                dependsOn: ["implement"],
                inputs: ["changelog"],
                outputs: ["findings"],
            },
        ],
    },
    hotfix: {
        phases: [
            {
                id: "fix",
                roles: ["backend"],
                autoTrigger: "on_start",
                outputs: [],
            },
            {
                id: "verify",
                roles: ["qa"],
                dependsOn: ["fix"],
                inputs: ["changelog"],
                outputs: ["findings"],
            },
        ],
    },
};

// ─── Workflow State ───

export function initWorkflowState(workflowDef) {
    const phases = {};
    for (const phase of workflowDef.phases) {
        const roleStatuses = {};
        for (const role of phase.roles) {
            roleStatuses[role] = "pending"; // pending|running|done|failed
        }
        phases[phase.id] = {
            status: "pending", // pending|ready|running|done|failed
            roles: roleStatuses,
        };
    }
    return { phases, reviewLoopCount: 0 };
}

// ─── Load / Save ───

export async function loadWorkflow(cwd, runId) {
    const p = workflowPath(cwd, runId);
    if (!existsSync(p)) return null;
    return JSON.parse(await readFile(p, "utf-8"));
}

export async function saveWorkflow(cwd, runId, workflow) {
    await writeJsonAtomic(workflowPath(cwd, runId), workflow);
}

export function getPreset(name) {
    return PRESETS[name] || null;
}

export function listPresets() {
    return Object.keys(PRESETS);
}

// ─── Phase Resolution ───

/**
 * Determine which phases are ready to run based on dependencies.
 * @param {object} workflowDef - The workflow definition (phases array)
 * @param {object} workflowState - Current workflow state
 * @returns {string[]} - IDs of phases that are ready
 */
export function resolveReadyPhases(workflowDef, workflowState) {
    const ready = [];
    for (const phase of workflowDef.phases) {
        const ps = workflowState.phases[phase.id];
        if (!ps || ps.status !== "pending") continue;

        // Check all dependencies are done
        const deps = phase.dependsOn || [];
        const allDepsDone = deps.every(
            (depId) => workflowState.phases[depId]?.status === "done",
        );

        // Check auto-trigger on start
        const isAutoStart = phase.autoTrigger === "on_start" && deps.length === 0;

        if (allDepsDone || isAutoStart) {
            ready.push(phase.id);
        }
    }
    return ready;
}

/**
 * Mark a role within a phase as done.
 * If all roles in the phase are done, mark the phase as done.
 * @returns {{ phaseCompleted: boolean, phaseId: string }}
 */
export function markRoleDone(workflowDef, workflowState, role) {
    for (const phase of workflowDef.phases) {
        const ps = workflowState.phases[phase.id];
        if (!ps || ps.status !== "running") continue;
        if (!ps.roles[role] || ps.roles[role] !== "running") continue;

        ps.roles[role] = "done";

        // Check if all roles in this phase are done
        const allDone = phase.roles.every((r) => ps.roles[r] === "done");
        if (allDone) {
            ps.status = "done";
            log("INFO", `Phase '${phase.id}' completed (all roles done)`);
            return { phaseCompleted: true, phaseId: phase.id };
        }
        return { phaseCompleted: false, phaseId: phase.id };
    }
    return { phaseCompleted: false, phaseId: null };
}

/**
 * Mark a phase as running and its roles as running.
 */
export function activatePhase(workflowState, phaseId, roles) {
    const ps = workflowState.phases[phaseId];
    if (!ps) return;
    ps.status = "running";
    for (const r of roles) {
        if (ps.roles[r] !== undefined) {
            ps.roles[r] = "running";
        }
    }
}

/**
 * Check if the entire workflow is complete.
 */
export function isWorkflowComplete(workflowDef, workflowState) {
    return workflowDef.phases.every(
        (p) => workflowState.phases[p.id]?.status === "done",
    );
}

/**
 * Get a phase definition by ID.
 */
export function getPhase(workflowDef, phaseId) {
    return workflowDef.phases.find((p) => p.id === phaseId) || null;
}

/**
 * Reset a phase back to pending (for review loop).
 */
export function resetPhase(workflowState, phaseId, roles) {
    const ps = workflowState.phases[phaseId];
    if (!ps) return;
    ps.status = "pending";
    for (const r of roles) {
        if (ps.roles[r] !== undefined) {
            ps.roles[r] = "pending";
        }
    }
}
