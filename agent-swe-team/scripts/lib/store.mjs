import { EventEmitter } from "node:events";
import { readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { writeJsonAtomic } from "./atomic.mjs";
import {
    checkpointPath,
    runMetaPath,
    runDir,
    runsRootDir,
    statePath,
} from "./paths.mjs";

export function generateRunId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function findLatestRunId(cwd) {
    const root = runsRootDir(cwd);
    if (!existsSync(root)) return null;
    const entries = await readdir(root, { withFileTypes: true });
    const runs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => b.localeCompare(a));
    return runs[0] || null;
}

export async function listRunIds(cwd) {
    const root = runsRootDir(cwd);
    if (!existsSync(root)) return [];
    const entries = await readdir(root, { withFileTypes: true });
    return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => b.localeCompare(a));
}

export async function loadRunMeta(cwd, runId) {
    const p = runMetaPath(cwd, runId);
    if (!existsSync(p)) return null;
    return JSON.parse(await readFile(p, "utf-8"));
}

export async function saveRunMeta(cwd, runId, meta) {
    await writeJsonAtomic(runMetaPath(cwd, runId), meta);
}

export async function loadStateFile(cwd, runId) {
    const p = statePath(cwd, runId);
    if (!existsSync(p)) return null;
    return JSON.parse(await readFile(p, "utf-8"));
}

export async function saveStateFile(cwd, runId, state) {
    await writeJsonAtomic(statePath(cwd, runId), state);
}

export async function loadCheckpointFile(cwd, runId) {
    const p = checkpointPath(cwd, runId);
    if (!existsSync(p)) return null;
    return JSON.parse(await readFile(p, "utf-8"));
}

export async function saveCheckpointFile(cwd, runId, checkpoint) {
    await writeJsonAtomic(checkpointPath(cwd, runId), checkpoint);
}

export function initStateFromRunMeta(meta) {
    const roles = Object.fromEntries(
        (meta.roles || []).map((role) => [
            role,
            {
                role,
                status: "idle", // idle|running|blocked|attention
                branch: `team/${meta.runId}/${role}`,
                worktreeRel: join(meta.worktreeRootRel, role),
                threadId: null,
                current: null,
                last: null,
                lastError: null,
                queueDepth: 0,
                git: null,
                events: [],
            },
        ]),
    );

    return {
        version: 2,
        runId: meta.runId,
        phase: "idle",
        createdAt: meta.createdAt,
        updatedAt: new Date().toISOString(),
        dashboard: { port: null, url: null },
        goal: meta.goal || "",
        roles,
        tickets: {},
    };
}

function trimEvents(arr, limit = 200) {
    if (!Array.isArray(arr)) return [];
    if (arr.length <= limit) return arr;
    return arr.slice(arr.length - limit);
}

export class TeamStore extends EventEmitter {
    #meta;
    #state;

    constructor(meta, state) {
        super();
        this.#meta = meta;
        this.#state = state;
    }

    getMeta() {
        return this.#meta;
    }

    getState() {
        return this.#state;
    }

    setPhase(phase) {
        this.#state.phase = phase;
        this.#state.updatedAt = new Date().toISOString();
        this.emit("update", { type: "phase", phase, ts: Date.now() });
    }

    setDashboard(port) {
        this.#state.dashboard = {
            port,
            url: port ? `http://localhost:${port}` : null,
        };
        this.#state.updatedAt = new Date().toISOString();
        this.emit("update", { type: "dashboard", port, ts: Date.now() });
    }

    updateRole(role, updates) {
        const r = this.#state.roles?.[role];
        if (!r) return;
        Object.assign(r, updates);
        this.#state.updatedAt = new Date().toISOString();
        this.emit("update", { type: "role_update", role, updates, ts: Date.now() });
    }

    addRoleEvent(role, event) {
        const r = this.#state.roles?.[role];
        if (!r) return;
        r.events = trimEvents([...(r.events || []), event], 200);
        this.#state.updatedAt = new Date().toISOString();
        this.emit("update", { type: "role_event", role, event, ts: Date.now() });
    }

    upsertTicket(ticketId, updates) {
        const t = this.#state.tickets?.[ticketId] || { id: ticketId };
        Object.assign(t, updates);
        this.#state.tickets[ticketId] = t;
        this.#state.updatedAt = new Date().toISOString();
        this.emit("update", { type: "ticket_update", ticketId, updates, ts: Date.now() });
    }

    toCheckpoint() {
        const roles = {};
        for (const [role, r] of Object.entries(this.#state.roles || {})) {
            roles[role] = {
                status: r.status,
                threadId: r.threadId,
                current: r.current
                    ? {
                        ticketId: r.current.ticketId,
                        ticketPath: r.current.ticketPath,
                        estimate: r.current.estimate,
                        assignedAt: r.current.assignedAt,
                        startedAt: r.current.startedAt,
                        finishedAt: r.current.finishedAt,
                        teamStatus: r.current.teamStatus,
                        reportPath: r.current.reportPath,
                    }
                    : null,
                lastError: r.lastError,
                git: r.git,
                branch: r.branch,
                worktreeRel: r.worktreeRel,
            };
        }

        const tickets = {};
        for (const [id, t] of Object.entries(this.#state.tickets || {})) {
            tickets[id] = {
                id: t.id,
                title: t.title,
                path: t.path,
                role: t.role,
                status: t.status,
                teamStatus: t.teamStatus,
                threadId: t.threadId,
                reportPath: t.reportPath,
                updatedAt: t.updatedAt,
                depends_on: t.depends_on || [],
                category: t.category || null,
                priority: t.priority || 3,
                role_type: t.role_type || null,
            };
        }

        return {
            version: 2,
            runId: this.#state.runId,
            phase: this.#state.phase,
            createdAt: this.#state.createdAt,
            updatedAt: this.#state.updatedAt,
            goal: this.#state.goal || "",
            roles,
            tickets,
        };
    }
}

export async function loadOrInitStore(cwd, runId) {
    const meta = await loadRunMeta(cwd, runId);
    if (!meta) return null;

    const stateFile = await loadStateFile(cwd, runId);
    if (stateFile) return new TeamStore(meta, stateFile);

    const checkpoint = await loadCheckpointFile(cwd, runId);
    const state = initStateFromRunMeta(meta);
    if (checkpoint?.roles) {
        for (const [role, r] of Object.entries(checkpoint.roles)) {
            if (!state.roles[role]) continue;
            Object.assign(state.roles[role], r);
        }
    }
    if (checkpoint?.tickets) {
        state.tickets = checkpoint.tickets;
    }
    return new TeamStore(meta, state);
}

export async function removeRunData(cwd, runId, { dryRun } = {}) {
    const dir = runDir(cwd, runId);
    if (!existsSync(dir)) return;
    if (dryRun) return;
    await rm(dir, { recursive: true, force: true });
}
