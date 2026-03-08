// Workflow Engine — phase management with multi-instance awareness and ticket DAG integration

import { log } from "./logger.mjs";
import { getRoleType } from "./roles.mjs";

// ─── Preset Workflow Templates ───

export const WORKFLOW_PRESETS = {
    fullstack: {
        phases: [
            { id: "design", roles: ["architect"], autoTrigger: "on_start" },
            { id: "implement", roles: ["backend", "frontend"], dependsOn: ["design"] },
            { id: "verify", roles: ["qa"], dependsOn: ["implement"] },
            { id: "review", roles: ["reviewer"], dependsOn: ["implement"] },
        ],
    },
    "frontend-only": {
        phases: [
            { id: "design", roles: ["architect"], autoTrigger: "on_start" },
            { id: "implement", roles: ["frontend"], dependsOn: ["design"] },
            { id: "verify", roles: ["qa"], dependsOn: ["implement"] },
            { id: "review", roles: ["reviewer"], dependsOn: ["implement"] },
        ],
    },
    "backend-only": {
        phases: [
            { id: "implement", roles: ["backend"], autoTrigger: "on_start" },
            { id: "verify", roles: ["qa"], dependsOn: ["implement"] },
            { id: "review", roles: ["reviewer"], dependsOn: ["implement"] },
        ],
    },
    hotfix: {
        phases: [
            { id: "fix", roles: ["backend", "frontend"], autoTrigger: "on_start" },
            { id: "verify", roles: ["qa"], dependsOn: ["fix"] },
        ],
    },
};

// ─── Instance-Aware Initialization ───

/**
 * Expand role types to instance names using run metadata.
 * e.g. "frontend" with meta.roles ["frontend-1","frontend-2"] → ["frontend-1","frontend-2"]
 * @param {string[]} roleTypes - Role types from preset (e.g. ["frontend"])
 * @param {string[]} actualRoles - Actual role instances from run meta
 * @returns {string[]} - Expanded instance names
 */
function expandRoleInstances(roleTypes, actualRoles) {
    const expanded = [];
    for (const rt of roleTypes) {
        const matches = actualRoles.filter((r) => getRoleType(r) === rt);
        if (matches.length > 0) {
            expanded.push(...matches);
        } else {
            expanded.push(rt); // No expansion needed (single instance)
        }
    }
    return expanded;
}

/**
 * Initialize workflow state from a preset, expanding role types to instances.
 * @param {string} presetName
 * @param {string[]} actualRoles - Role instances from run meta (e.g. ["frontend-1","frontend-2","qa"])
 * @returns {{ def: object, state: object }}
 */
export function initWorkflow(presetName, actualRoles) {
    const preset = WORKFLOW_PRESETS[presetName];
    if (!preset) {
        log("WARN", `Unknown workflow preset: ${presetName}, using fullstack`);
        return initWorkflow("fullstack", actualRoles);
    }

    // Expand phases with actual role instances
    const expandedPhases = preset.phases.map((phase) => ({
        ...phase,
        expandedRoles: expandRoleInstances(phase.roles, actualRoles),
    }));

    const phases = {};
    for (const phase of expandedPhases) {
        const roleStatuses = {};
        for (const role of phase.expandedRoles) {
            roleStatuses[role] = "pending";
        }
        phases[phase.id] = {
            status: "pending",
            roles: roleStatuses,
        };
    }

    return {
        def: { ...preset, phases: expandedPhases },
        state: {
            preset: presetName,
            phases,
            createdAt: new Date().toISOString(),
        },
    };
}

/**
 * Load an existing workflow (def + state).
 */
export function loadWorkflow(savedDef, savedState) {
    return { def: savedDef, state: savedState };
}

// ─── Phase Resolution ───

/**
 * Determine which phases are ready to run based on dependencies.
 * @returns {string[]} - IDs of phases that are ready
 */
export function resolveReadyPhases(workflowDef, workflowState) {
    const ready = [];
    for (const phase of workflowDef.phases) {
        const ps = workflowState.phases[phase.id];
        if (!ps || ps.status !== "pending") continue;

        const deps = phase.dependsOn || [];
        const allDepsDone = deps.every(
            (depId) => workflowState.phases[depId]?.status === "done",
        );

        const isAutoStart = phase.autoTrigger === "on_start" && deps.length === 0;

        if (allDepsDone || isAutoStart) {
            ready.push(phase.id);
        }
    }
    return ready;
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
 * Mark a role within a phase as done.
 * Uses instance name matching (e.g. "frontend-1") directly.
 * Falls back to roleType matching for backward compatibility.
 * @returns {{ phaseCompleted: boolean, phaseId: string }}
 */
export function markRoleDone(workflowDef, workflowState, role) {
    for (const phase of workflowDef.phases) {
        const ps = workflowState.phases[phase.id];
        if (!ps || ps.status !== "running") continue;

        // Direct instance match
        if (ps.roles[role] === "running") {
            ps.roles[role] = "done";
            return checkPhaseCompletion(phase, ps);
        }

        // Fallback: roleType match (for single-instance roles)
        const roleType = getRoleType(role);
        if (ps.roles[roleType] === "running") {
            ps.roles[roleType] = "done";
            return checkPhaseCompletion(phase, ps);
        }
    }
    return { phaseCompleted: false, phaseId: null };
}

function checkPhaseCompletion(phase, ps) {
    const allRoles = phase.expandedRoles || phase.roles;
    const allDone = allRoles.every((r) => ps.roles[r] === "done");
    if (allDone) {
        ps.status = "done";
        log("INFO", `Phase '${phase.id}' completed (all roles done)`);
        return { phaseCompleted: true, phaseId: phase.id };
    }
    return { phaseCompleted: false, phaseId: phase.id };
}

/**
 * Reset a phase back to pending (for review loop re-work).
 */
export function resetPhase(workflowState, phaseId) {
    const ps = workflowState.phases[phaseId];
    if (!ps) return;
    ps.status = "pending";
    for (const r of Object.keys(ps.roles)) {
        ps.roles[r] = "pending";
    }
}

// ─── Workflow Status ───

/**
 * Get a summary of the workflow status.
 */
export function getWorkflowSummary(workflowDef, workflowState) {
    const phases = (workflowDef.phases || []).map((phase) => {
        const ps = workflowState.phases[phase.id] || {};
        const roles = Object.entries(ps.roles || {}).map(([r, s]) => `${r}:${s}`);
        return {
            id: phase.id,
            status: ps.status || "unknown",
            roles: roles.join(", "),
        };
    });
    return phases;
}
