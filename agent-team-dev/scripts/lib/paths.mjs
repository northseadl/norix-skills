import { join, resolve } from "node:path";

export function resolveCwd(cwdArg) {
    return resolve(cwdArg || process.cwd());
}

export function rootDir(cwd) {
    return join(cwd, ".agent-team");
}

export function ticketsDir(cwd) {
    return join(rootDir(cwd), "tickets");
}

export function runsRootDir(cwd) {
    return join(rootDir(cwd), "runs");
}

export function runDir(cwd, runId) {
    return join(runsRootDir(cwd), runId);
}

export function runMetaPath(cwd, runId) {
    return join(runDir(cwd, runId), "run.json");
}

export function statePath(cwd, runId) {
    return join(runDir(cwd, runId), "state.json");
}

export function checkpointPath(cwd, runId) {
    return join(runDir(cwd, runId), "checkpoint.json");
}

export function portPath(cwd, runId) {
    return join(runDir(cwd, runId), "port");
}

export function signalPath(cwd, runId) {
    return join(runDir(cwd, runId), "signal");
}

export function digestPath(cwd, runId) {
    return join(runDir(cwd, runId), "digest.txt");
}

export function statusPath(cwd, runId) {
    return join(runDir(cwd, runId), "status.txt");
}

export function queueDir(cwd, runId) {
    return join(runDir(cwd, runId), "queue");
}

export function queuePendingDir(cwd, runId) {
    return join(queueDir(cwd, runId), "pending");
}

export function queueProcessingDir(cwd, runId) {
    return join(queueDir(cwd, runId), "processing");
}

export function queueProcessedDir(cwd, runId) {
    return join(queueDir(cwd, runId), "processed");
}

export function reportsDir(cwd, runId) {
    return join(runDir(cwd, runId), "reports");
}

export function logsDir(cwd, runId) {
    return join(runDir(cwd, runId), "logs");
}

export function worktreesRootDir(cwd, runId) {
    return join(rootDir(cwd), "worktrees", runId);
}

