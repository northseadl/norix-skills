// Discussion Thread Engine — real-time inter-role communication
// Inspired by brainstorm's Discussion Space, adapted for code collaboration.

import { mkdir, readFile, readdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeTextAtomic } from "./atomic.mjs";
import { log } from "./logger.mjs";

// ─── Paths ───

function threadsDir(cwd, runId) {
    return join(cwd, ".agent-team", "runs", runId, "blackboard", "threads");
}

function threadPath(cwd, runId, threadId) {
    return join(threadsDir(cwd, runId), `${threadId}.md`);
}

// ─── Thread Management ───

let _threadCounter = 0;

export async function ensureThreadsDir(cwd, runId) {
    const dir = threadsDir(cwd, runId);
    await mkdir(dir, { recursive: true });
    // Recover counter from existing threads
    if (existsSync(dir)) {
        const entries = await readdir(dir);
        const ids = entries
            .filter((f) => f.endsWith(".md"))
            .map((f) => parseInt(f.split("-")[0], 10))
            .filter(Number.isFinite);
        _threadCounter = ids.length > 0 ? Math.max(...ids) : 0;
    }
}

/**
 * Create a new discussion thread.
 * @param {string} cwd
 * @param {string} runId
 * @param {{ role: string, topic: string, position: string, evidence?: string, question?: string }}
 * @returns {{ threadId: string, path: string }}
 */
export async function createThread(cwd, runId, { role, topic, position, evidence, question }) {
    await ensureThreadsDir(cwd, runId);
    _threadCounter++;
    const id = String(_threadCounter).padStart(3, "0");
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const threadId = `${id}-${slug}`;

    const lines = [
        `# Thread ${id}: ${topic}`,
        "",
        `**Status**: open`,
        `**Created**: ${new Date().toISOString()}`,
        `**Started by**: ${role}`,
        "",
        "---",
        "",
        `## ${role} (opening)`,
        "",
        `**Position**: ${position}`,
    ];
    if (evidence) lines.push(`**Evidence**: ${evidence}`);
    if (question) lines.push(`**Question**: ${question}`);
    lines.push("");

    const p = threadPath(cwd, runId, threadId);
    await writeTextAtomic(p, lines.join("\n") + "\n");
    log("INFO", `Discussion thread created: ${threadId} by ${role}`);
    return { threadId, path: p };
}

/**
 * Append a response to an existing thread.
 * @param {string} cwd
 * @param {string} runId
 * @param {{ threadId: string, role: string, type: string, content: string }}
 *   type: "respond" | "challenge" | "build" | "agree" | "resolve"
 */
export async function addThreadResponse(cwd, runId, { threadId, role, type, content }) {
    const p = threadPath(cwd, runId, threadId);
    if (!existsSync(p)) {
        log("WARN", `Thread not found: ${threadId}`);
        return;
    }

    const typeEmoji = {
        respond: "💬",
        challenge: "⚡",
        build: "🔨",
        agree: "✅",
        resolve: "🏁",
    };

    const entry = [
        "",
        `## ${role} (${typeEmoji[type] || "💬"} ${type})`,
        `*${new Date().toISOString()}*`,
        "",
        content,
        "",
    ].join("\n");

    await appendFile(p, entry, "utf-8");

    // If resolved, update status
    if (type === "resolve") {
        const raw = await readFile(p, "utf-8");
        const updated = raw.replace("**Status**: open", "**Status**: resolved");
        await writeTextAtomic(p, updated);
    }

    log("INFO", `Thread ${threadId}: ${role} ${type}`);
}

/**
 * Read all threads (summaries only — topic + status + participant count).
 * Used for prompt injection — avoids loading full thread content.
 */
export async function readThreadSummaries(cwd, runId) {
    const dir = threadsDir(cwd, runId);
    if (!existsSync(dir)) return [];

    const entries = await readdir(dir, { withFileTypes: true });
    const summaries = [];

    for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".md")) continue;
        const content = await readFile(join(dir, e.name), "utf-8");
        const titleMatch = content.match(/^# Thread \d+: (.+)$/m);
        const statusMatch = content.match(/\*\*Status\*\*: (\w+)/);
        const participants = new Set(
            [...content.matchAll(/^## (\S+) \(/gm)].map((m) => m[1]),
        );
        summaries.push({
            threadId: e.name.replace(".md", ""),
            topic: titleMatch?.[1] || "?",
            status: statusMatch?.[1] || "open",
            participants: [...participants],
            messageCount: (content.match(/^## /gm) || []).length,
        });
    }

    return summaries;
}

/**
 * Read recent thread messages for context injection.
 * Returns the last N messages across all open threads.
 */
export async function readRecentMessages(cwd, runId, { maxThreads = 3, maxCharsPerThread = 500 } = {}) {
    const dir = threadsDir(cwd, runId);
    if (!existsSync(dir)) return "";

    const entries = await readdir(dir, { withFileTypes: true });
    const openThreads = [];

    for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".md")) continue;
        const content = await readFile(join(dir, e.name), "utf-8");
        if (content.includes("**Status**: open")) {
            openThreads.push({ name: e.name, content });
        }
    }

    // Take most recent threads
    const recent = openThreads.slice(-maxThreads);
    return recent
        .map((t) => {
            const truncated = t.content.length > maxCharsPerThread
                ? t.content.slice(-maxCharsPerThread) + "\n...(truncated)"
                : t.content;
            return truncated;
        })
        .join("\n---\n");
}

// ─── Extraction from Role Reports ───

/**
 * Extract discussion entries from a role's report text.
 * Looks for ## Discussion section with structured sub-entries.
 */
export function extractDiscussionEntries(reportText) {
    if (!reportText) return [];
    const entries = [];

    // Match "### New Thread: <topic>" blocks
    const newThreadPattern = /### New Thread:\s*(.+)\n([\s\S]*?)(?=###|\n## [^D]|$)/gi;
    for (const match of reportText.matchAll(newThreadPattern)) {
        const topic = match[1].trim();
        const body = match[2].trim();
        const posMatch = body.match(/\*\*(?:My )?Position\*\*:\s*(.+)/i);
        const eviMatch = body.match(/\*\*Evidence\*\*:\s*(.+)/i);
        const queMatch = body.match(/\*\*Question\*\*:\s*(.+)/i);
        entries.push({
            action: "create",
            topic,
            position: posMatch?.[1] || body.slice(0, 200),
            evidence: eviMatch?.[1] || null,
            question: queMatch?.[1] || null,
        });
    }

    // Match "### Response to Thread #N" blocks
    const responsePattern = /### Response to Thread\s*#?(\d+)\s*(?:\((.+?)\))?\s*\n([\s\S]*?)(?=###|\n## [^D]|$)/gi;
    for (const match of reportText.matchAll(responsePattern)) {
        entries.push({
            action: "respond",
            threadNum: parseInt(match[1], 10),
            type: match[2]?.trim().toLowerCase() || "respond",
            content: match[3].trim(),
        });
    }

    return entries;
}
