// StateStore — centralized state management with Checkpoint persistence

import { EventEmitter } from "node:events";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { log } from "./logger.mjs";

const STATUS_ICONS = {
    pending: "⏳",
    queued: "📋",
    running: "🔄",
    success: "✅",
    failed: "❌",
    skipped: "⏭",
};

// ─── Formatting Helpers ───

export function formatElapsed(ms) {
    if (!ms || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return s % 60 > 0 ? `${m}m${s % 60}s` : `${m}m`;
}

function formatTokens(usage) {
    if (!usage) return "";
    const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n));
    return `${fmt(usage.input)}/${fmt(usage.output)}`;
}

// ─── StateStore ───

export class StateStore extends EventEmitter {
    #state;
    #runDir;

    /**
     * @param {object} config
     * @param {Array} tasks
     * @param {number[][]} batches
     * @param {Array<[number,number]>} edges
     * @param {string} runId
     * @param {string} runDir
     */
    constructor(config, tasks, batches, edges, runId, runDir) {
        super();
        this.#runDir = runDir;
        this.#state = {
            runId,
            config: {
                approvalMode: config.approvalMode,
                parallel: config.parallel,
                concurrency: config.concurrency,
                cwd: config.cwd,
                dryRun: config.dryRun,
            },
            phase: "initializing",
            startTime: Date.now(),
            endTime: null,
            tasks: Object.fromEntries(
                tasks.map((t) => [
                    t.id,
                    {
                        id: t.id,
                        file: t.file,
                        engine: t.engine,
                        deps: t.deps,
                        status: "pending",
                        startTime: null,
                        endTime: null,
                        threadId: null,
                        events: [],
                        usage: null,
                        error: null,
                        retryCount: 0,
                    },
                ]),
            ),
            dag: { batches, edges },
        };
    }

    getState() {
        return this.#state;
    }

    setPhase(phase) {
        this.#state.phase = phase;
        if (phase === "completed" || phase === "failed") {
            this.#state.endTime = Date.now();
        }
        this.emit("update", { type: "phase", phase, endTime: this.#state.endTime });
    }

    updateTask(taskId, updates) {
        const task = this.#state.tasks[taskId];
        if (!task) return;
        Object.assign(task, updates);
        this.emit("update", { type: "task_update", taskId, updates });
    }

    addTaskEvent(taskId, event) {
        const task = this.#state.tasks[taskId];
        if (!task) return;
        task.events.push(event);
        this.emit("update", { type: "task_event", taskId, event });
    }

    // ─── Checkpoint — persist minimal recoverable snapshot ───

    async writeCheckpoint() {
        const snap = {
            runId: this.#state.runId,
            version: 2,
            resumable: true,
            config: this.#state.config,
            dag: this.#state.dag,
            tasks: Object.fromEntries(
                Object.entries(this.#state.tasks).map(([id, t]) => [
                    id,
                    {
                        file: t.file,
                        engine: t.engine,
                        deps: t.deps,
                        status: t.status,
                        threadId: t.threadId,
                        error: t.error,
                        retryCount: t.retryCount || 0,
                        usage: t.usage,
                        startTime: t.startTime,
                        endTime: t.endTime,
                    },
                ]),
            ),
            startTime: this.#state.startTime,
            lastCheckpoint: new Date().toISOString(),
        };
        const path = join(this.#runDir, "checkpoint.json");
        const tmp = path + ".tmp";
        await writeFile(tmp, JSON.stringify(snap, null, 2), "utf-8");
        // Atomic rename to avoid partial writes
        const { rename } = await import("node:fs/promises");
        await rename(tmp, path);
    }

    /**
     * Restore state from a checkpoint — skip successful tasks, reset failed to pending.
     * @param {string} checkpointPath
     * @returns {Promise<{skipped: number[], retrying: number[]}>}
     */
    static async loadCheckpoint(checkpointPath) {
        const raw = await readFile(checkpointPath, "utf-8");
        return JSON.parse(raw);
    }

    /**
     * Apply checkpoint restore — mark successful tasks and identify retryable ones.
     * @param {object} checkpoint
     * @param {{retryFailed?: boolean, retryIds?: number[]}} opts
     * @returns {{skipped: number[], retrying: number[]}}
     */
    applyCheckpoint(checkpoint, opts = {}) {
        const skipped = [];
        const retrying = [];

        for (const [id, saved] of Object.entries(checkpoint.tasks)) {
            const taskId = parseInt(id, 10);
            if (saved.status === "success") {
                this.updateTask(taskId, {
                    status: "success",
                    threadId: saved.threadId,
                    usage: saved.usage,
                    startTime: saved.startTime,
                    endTime: saved.endTime,
                });
                skipped.push(taskId);
            } else if (saved.status === "failed") {
                const shouldRetry =
                    opts.retryFailed || opts.retryIds?.includes(taskId);
                if (shouldRetry) {
                    this.updateTask(taskId, {
                        status: "pending",
                        error: null,
                        retryCount: saved.retryCount || 0,
                    });
                    retrying.push(taskId);
                } else {
                    this.updateTask(taskId, {
                        status: "failed",
                        error: saved.error,
                        retryCount: saved.retryCount || 0,
                    });
                    skipped.push(taskId);
                }
            }
            // pending tasks remain pending
        }

        return { skipped, retrying };
    }

    // ─── Compact status rendering ───

    renderCompactStatus() {
        const state = this.#state;
        const now = Date.now();
        const elapsed = formatElapsed((state.endTime || now) - state.startTime);
        const tasks = Object.values(state.tasks);
        const done = tasks.filter(
            (t) =>
                t.status === "success" ||
                t.status === "failed" ||
                t.status === "skipped",
        ).length;

        const lines = [];
        lines.push(`run=${state.runId} phase=${state.phase} elapsed=${elapsed}`);
        for (const t of tasks) {
            const icon = STATUS_ICONS[t.status] || "?";
            const dur = t.startTime
                ? formatElapsed((t.endTime || now) - t.startTime)
                : "—";
            const tok = formatTokens(t.usage);
            const retry = t.retryCount > 0 ? ` retry=${t.retryCount}` : "";
            const err = t.error ? ` err=${t.error.slice(0, 60)}` : "";
            lines.push(
                `T${t.id} ${icon} ${t.status.padEnd(7)} ${dur.padEnd(6)} ${tok}${retry}${err}`,
            );
        }
        lines.push(
            `progress=${done}/${tasks.length} (${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%)`,
        );
        return lines.join("\n");
    }
}

// ─── Summary ───

export async function writeSummary(store, runDir) {
    const state = store.getState();
    const report = {
        runId: state.runId,
        timestamp: new Date().toISOString(),
        config: state.config,
        phase: state.phase,
        duration: state.endTime
            ? `${((state.endTime - state.startTime) / 1000).toFixed(1)}s`
            : null,
        dag: state.dag,
        tasks: Object.values(state.tasks).map((t) => ({
            id: t.id,
            file: t.file,
            engine: t.engine,
            status: t.status,
            duration:
                t.startTime && t.endTime
                    ? `${((t.endTime - t.startTime) / 1000).toFixed(1)}s`
                    : null,
            threadId: t.threadId,
            usage: t.usage,
            error: t.error,
            retryCount: t.retryCount,
        })),
    };
    const p = join(runDir, "summary.json");
    await writeFile(p, JSON.stringify(report, null, 2), "utf-8");
    return p;
}
