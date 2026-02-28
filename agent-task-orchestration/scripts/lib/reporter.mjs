// Reporter — generates signal, digest, and status files for Strategist consumption

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatElapsed } from "./store.mjs";

/**
 * Generate 1-line signal for Strategist consumption (~20 tokens).
 *
 * Formats:
 *   RUNNING 3/5 57%
 *   ATTENTION T2 failed:rate_limit retry:2/3
 *   COMPLETED 5/5 100% elapsed=12m
 *   FATAL all_failed check:digest.txt
 *
 * @param {object} state
 * @returns {string}
 */
function generateSignal(state) {
    const tasks = Object.values(state.tasks);
    const total = tasks.length;
    const succeeded = tasks.filter((t) => t.status === "success").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    const running = tasks.filter((t) => t.status === "running").length;
    const done = succeeded + failed + tasks.filter((t) => t.status === "skipped").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const elapsed = formatElapsed((state.endTime || Date.now()) - state.startTime);

    if (state.phase === "completed") {
        return `COMPLETED ${done}/${total} ${pct}% elapsed=${elapsed}`;
    }

    if (state.phase === "failed") {
        if (failed === total) return `FATAL all_failed check:digest.txt`;
        // Identify the most recent failure for attention
        const failedTask = tasks.find(
            (t) => t.status === "failed" && t.retryCount >= 3,
        );
        if (failedTask) {
            return `ATTENTION T${failedTask.id} failed:${failedTask.error?.slice(0, 30) || "unknown"} retry:${failedTask.retryCount}/3`;
        }
        return `FAILED ${succeeded}/${total} ok ${failed} failed elapsed=${elapsed}`;
    }

    // Running state — check if any task needs attention
    const attentionTask = tasks.find(
        (t) => t.status === "failed" && t.retryCount > 0,
    );
    if (attentionTask) {
        return `ATTENTION T${attentionTask.id} failed:${attentionTask.error?.slice(0, 30) || "unknown"} retry:${attentionTask.retryCount}/3`;
    }

    // Token budget warning — surface ⚠ events
    const tokenTask = tasks.find(
        (t) => t.status === "running" && t.events?.some((e) => e.icon === "⚠"),
    );
    if (tokenTask) {
        return `ATTENTION T${tokenTask.id} token_budget_exceeded active=${running}`;
    }

    return `RUNNING ${done}/${total} ${pct}%${running > 0 ? ` active=${running}` : ""}`;
}

/**
 * Generate ≤5 line digest for Strategist consumption (~80 tokens).
 * @param {object} state
 * @returns {string}
 */
function generateDigest(state) {
    const tasks = Object.values(state.tasks);
    const batches = state.dag.batches;
    const lines = [];

    // Batch summary lines
    for (let i = 0; i < batches.length; i++) {
        const batchTasks = batches[i].map((id) => state.tasks[id]).filter(Boolean);
        const parts = batchTasks.map((t) => {
            const icon =
                t.status === "success"
                    ? "✓"
                    : t.status === "failed"
                        ? "✗"
                        : t.status === "running"
                            ? "▶"
                            : "·";
            const dur = t.endTime && t.startTime
                ? formatElapsed(t.endTime - t.startTime)
                : "";
            const info = t.error ? `(${t.error.slice(0, 20)})` : dur ? `(${dur})` : "";
            const retry = t.retryCount > 0 ? `,r${t.retryCount}` : "";
            return `${icon}T${t.id}${info}${retry}`;
        });
        const done = batchTasks.filter(
            (t) => t.status === "success" || t.status === "failed" || t.status === "skipped",
        ).length;
        lines.push(`batch=${i + 1} | ${parts.join(" ")} | ${done}/${batchTasks.length} done`);
    }

    // Token summary
    let totalIn = 0;
    let totalOut = 0;
    for (const t of tasks) {
        if (t.usage) {
            totalIn += t.usage.input || 0;
            totalOut += t.usage.output || 0;
        }
    }
    if (totalIn > 0) {
        const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
        lines.push(`tokens: in=${fmtK(totalIn)} out=${fmtK(totalOut)}`);
    }

    // Next action hint
    const failedTasks = tasks.filter((t) => t.status === "failed");
    const pendingTasks = tasks.filter((t) => t.status === "pending");
    if (failedTasks.length > 0) {
        const ids = failedTasks.map((t) => `T${t.id}`).join(",");
        lines.push(`next: ${ids} need retry or skip`);
    } else if (pendingTasks.length > 0) {
        lines.push(`next: ${pendingTasks.length} tasks pending`);
    }

    return lines.slice(0, 5).join("\n");
}

/**
 * Write all report files atomically.
 * @param {import('./store.mjs').StateStore} store
 * @param {string} runDir
 * @param {number} [port]
 */
export async function writeReports(store, runDir, port) {
    const state = store.getState();

    const writes = [
        // Signal file (~20 tokens)
        writeFile(join(runDir, "signal"), generateSignal(state), "utf-8"),
        // Digest file (~80 tokens)
        writeFile(join(runDir, "digest.txt"), generateDigest(state), "utf-8"),
        // Full status.txt (backward compatible)
        writeFile(
            join(runDir, "status.txt"),
            store.renderCompactStatus() +
            (port ? `\ndashboard=http://localhost:${port}` : ""),
            "utf-8",
        ),
    ];

    await Promise.all(writes).catch(() => { });
}
