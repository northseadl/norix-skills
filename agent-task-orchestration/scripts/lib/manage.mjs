import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { log } from "./logger.mjs";
import { StateStore } from "./store.mjs";
import { LOGS_ROOT } from "./cli.mjs";

export function generateRunId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function findLatestRun(taskDir) {
    const logsDir = join(taskDir, LOGS_ROOT);
    if (!existsSync(logsDir)) return null;
    const entries = await readdir(logsDir, { withFileTypes: true });
    const runs = entries
        .filter((e) => e.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));
    return runs.length > 0 ? runs[0].name : null;
}

export async function listRuns(taskDir) {
    const logsDir = join(taskDir, LOGS_ROOT);
    if (!existsSync(logsDir)) {
        log("INFO", "No run history");
        return;
    }
    const entries = await readdir(logsDir, { withFileTypes: true });
    const runs = entries
        .filter((e) => e.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));
    if (runs.length === 0) {
        log("INFO", "No run history");
        return;
    }
    console.log(`\n  ${runs.length} runs (${logsDir})\n`);
    for (const run of runs) {
        const summaryPath = join(logsDir, run.name, "summary.json");
        const checkpointPath = join(logsDir, run.name, "checkpoint.json");
        let info = "";
        if (existsSync(summaryPath)) {
            try {
                const summary = JSON.parse(await readFile(summaryPath, "utf-8"));
                const tasks = summary.tasks || [];
                const s = tasks.filter((t) => t.status === "success").length;
                const f = tasks.filter((t) => t.status === "failed").length;
                info = `  ${summary.phase || "?"}  ${summary.duration || "?"}  ✓${s} ✗${f}  ${summary.config?.approvalMode || ""}`;
            } catch { } // eslint-disable-line no-empty
        }
        const resumable = existsSync(checkpointPath) ? " [resumable]" : "";
        console.log(`  ${run.name}${info}${resumable}`);
    }
    console.log("");
}

export async function cleanRuns(taskDir, keep) {
    const logsDir = join(taskDir, LOGS_ROOT);
    if (!existsSync(logsDir)) {
        log("INFO", "Nothing to clean");
        return;
    }
    const entries = await readdir(logsDir, { withFileTypes: true });
    const runs = entries
        .filter((e) => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));
    const toRemove =
        keep > 0 ? runs.slice(0, Math.max(0, runs.length - keep)) : runs;
    if (toRemove.length === 0) {
        log("INFO", "Nothing to clean");
        return;
    }
    for (const run of toRemove) {
        await rm(join(logsDir, run.name), { recursive: true, force: true });
        log("INFO", `Removed: ${run.name}`);
    }
    log("INFO", `Cleaned: ${toRemove.length} removed, ${runs.length - toRemove.length} kept`);
}

function httpGetJson(port, path) {
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            { hostname: "127.0.0.1", port, path, timeout: 2000 },
            (res) => {
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        reject(new Error("invalid json"));
                    }
                });
            },
        );
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("timeout"));
        });
        req.end();
    });
}

export async function showStatus(taskDir, runId) {
    if (!runId) {
        runId = await findLatestRun(taskDir);
        if (!runId) {
            log("INFO", "No run history");
            return;
        }
    }
    const runDir = join(taskDir, LOGS_ROOT, runId);
    if (!existsSync(runDir)) {
        log("ERROR", `Run ${runId} not found`);
        return;
    }

    // Strategy 1: live HTTP via port file
    const portFile = join(runDir, "port");
    if (existsSync(portFile)) {
        try {
            const port = parseInt(await readFile(portFile, "utf-8"), 10);
            const state = await httpGetJson(port, "/api/state");
            const tmpStore = new StateStore(
                state.config,
                Object.values(state.tasks),
                state.dag.batches,
                state.dag.edges,
                state.runId,
                runDir,
            );
            for (const [id, t] of Object.entries(state.tasks)) {
                tmpStore.updateTask(parseInt(id, 10), t);
            }
            console.log(tmpStore.renderCompactStatus());
            console.log(`dashboard=http://localhost:${port}`);
            return;
        } catch {
            /* server not running, fall through */
        }
    }

    // Strategy 2: status.txt
    const statusFile = join(runDir, "status.txt");
    if (existsSync(statusFile)) {
        console.log(await readFile(statusFile, "utf-8"));
        return;
    }

    // Strategy 3: signal + digest
    const signalFile = join(runDir, "signal");
    if (existsSync(signalFile)) {
        console.log(await readFile(signalFile, "utf-8"));
        const digestFile = join(runDir, "digest.txt");
        if (existsSync(digestFile)) {
            console.log("---");
            console.log(await readFile(digestFile, "utf-8"));
        }
        return;
    }

    log("INFO", `Run ${runId} has no status data`);
}
