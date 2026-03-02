import { mkdir, readdir, readFile, unlink, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";

import { writeJsonAtomic } from "./atomic.mjs";
import { queuePendingDir, queueProcessingDir, queueProcessedDir } from "./paths.mjs";

function randId() {
    return Math.random().toString(16).slice(2, 10);
}

function nowStamp() {
    return String(Date.now());
}

export async function ensureQueueDirs(cwd, runId) {
    const dirs = [
        queuePendingDir(cwd, runId),
        queueProcessingDir(cwd, runId),
        queueProcessedDir(cwd, runId),
    ];
    for (const d of dirs) await mkdir(d, { recursive: true });
}

export async function enqueueAssign(cwd, runId, { role, ticketPath, estimate }) {
    await ensureQueueDirs(cwd, runId);
    const req = {
        type: "assign",
        requestId: `${nowStamp()}-${randId()}`,
        role,
        ticketPath,
        estimate: estimate || "M",
        createdAt: new Date().toISOString(),
    };
    const name = `${nowStamp()}-${role}-assign-${randId()}.json`;
    const p = join(queuePendingDir(cwd, runId), name);
    await writeJsonAtomic(p, req);
    return { path: p, request: req };
}

export async function enqueueReply(cwd, runId, { role, text }) {
    await ensureQueueDirs(cwd, runId);
    const req = {
        type: "reply",
        requestId: `${nowStamp()}-${randId()}`,
        role,
        text,
        createdAt: new Date().toISOString(),
    };
    const name = `${nowStamp()}-${role}-reply-${randId()}.json`;
    const p = join(queuePendingDir(cwd, runId), name);
    await writeJsonAtomic(p, req);
    return { path: p, request: req };
}

async function listPending(cwd, runId) {
    const dir = queuePendingDir(cwd, runId);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
}

export async function countPendingByRole(cwd, runId) {
    const files = await listPending(cwd, runId);
    const counts = {};
    for (const f of files) {
        const m = f.match(/^\d+-([a-z0-9_-]+)-(assign|reply)-/);
        if (!m) continue;
        const role = m[1];
        counts[role] = (counts[role] || 0) + 1;
    }
    return counts;
}

export async function dequeueNextForRole(cwd, runId, role, { preferType, allowTypes } = {}) {
    await ensureQueueDirs(cwd, runId);
    const files = await listPending(cwd, runId);
    const matching = files.filter((f) => f.includes(`-${role}-`));
    if (matching.length === 0) return null;

    const allowed = Array.isArray(allowTypes) && allowTypes.length > 0 ? allowTypes : ["assign", "reply"];
    const filtered = matching.filter((f) => allowed.some((t) => f.includes(`-${t}-`)));
    if (filtered.length === 0) return null;

    const pick = (type) =>
        filtered.find((f) => f.includes(`-${type}-`)) || null;

    const chosen =
        (preferType && pick(preferType)) || pick("reply") || pick("assign") || filtered[0];
    if (!chosen) return null;

    const pendingPath = join(queuePendingDir(cwd, runId), chosen);
    const processingPath = join(queueProcessingDir(cwd, runId), chosen);
    try {
        await rename(pendingPath, processingPath);
    } catch {
        return null; // claimed by another worker
    }

    const raw = await readFile(processingPath, "utf-8");
    const req = JSON.parse(raw);
    return { req, processingPath, fileName: chosen };
}

export async function markProcessed(cwd, runId, processingPath, { ok, result, error }) {
    await ensureQueueDirs(cwd, runId);
    const fileName = basename(processingPath);
    let req = null;
    try {
        req = JSON.parse(await readFile(processingPath, "utf-8"));
    } catch {
        /* ignore */
    }

    const out = {
        ...(req || {}),
        processedAt: new Date().toISOString(),
        ok: Boolean(ok),
        result: result || null,
        error: error || null,
    };

    const processedPath = join(queueProcessedDir(cwd, runId), fileName);
    await writeJsonAtomic(processedPath, out);
    await unlink(processingPath).catch(() => { });
}
