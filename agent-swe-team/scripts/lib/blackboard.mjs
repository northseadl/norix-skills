// Living Blackboard — the team's shared consciousness
// Extends original blackboard with goal tracking, discussion context, and codemap.

import { mkdir, readFile, readdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeTextAtomic } from "./atomic.mjs";
import {
    blackboardDir,
    blackboardContractsDir,
    blackboardDecisionsPath,
    blackboardChangelogPath,
    blackboardTeamDigestPath,
} from "./paths.mjs";
import { getRoleType } from "./roles.mjs";
import { readThreadSummaries, readRecentMessages } from "./discussion.mjs";
import { updateGoalFile, computeProgress, resolveTicketDAG } from "./goal_tracker.mjs";

// ─── Initialization ───

export async function ensureBlackboardDirs(cwd, runId) {
    await mkdir(blackboardDir(cwd, runId), { recursive: true });
    await mkdir(blackboardContractsDir(cwd, runId), { recursive: true });
    await mkdir(join(blackboardDir(cwd, runId), "threads"), { recursive: true });
    await mkdir(join(blackboardDir(cwd, runId), "plan-revisions"), { recursive: true });
}

// ─── Write Operations (called by Hub after role completes) ───

export async function writeContract(cwd, runId, artifact) {
    await ensureBlackboardDirs(cwd, runId);
    const filename = `${artifact.ticketId}-${artifact.role}-${artifact.type}.md`;
    const filePath = join(blackboardContractsDir(cwd, runId), filename);
    const header = `# ${artifact.type} from ${artifact.role} (ticket ${artifact.ticketId})\n\n`;
    await writeTextAtomic(filePath, header + artifact.content + "\n");
}

export async function appendDecision(cwd, runId, { role, question, answer, ticketId }) {
    await ensureBlackboardDirs(cwd, runId);
    const entry = JSON.stringify({
        ts: new Date().toISOString(),
        role,
        ticketId: ticketId || null,
        question,
        answer,
    });
    await appendFile(blackboardDecisionsPath(cwd, runId), entry + "\n", "utf-8");
}

export async function appendChangelog(cwd, runId, { role, ticketId, summary }) {
    await ensureBlackboardDirs(cwd, runId);
    const line = `- **${role}** (${ticketId}): ${summary} [${new Date().toISOString()}]\n`;
    await appendFile(blackboardChangelogPath(cwd, runId), line, "utf-8");
}

/**
 * Write a plan revision proposal from a role.
 */
export async function writePlanRevision(cwd, runId, { role, ticketId, content }) {
    await ensureBlackboardDirs(cwd, runId);
    const id = Date.now();
    const filename = `${id}-${role}.md`;
    const filePath = join(blackboardDir(cwd, runId), "plan-revisions", filename);
    const header = `# Plan Revision from ${role} (ticket ${ticketId})\n*${new Date().toISOString()}*\n\n`;
    await writeTextAtomic(filePath, header + content + "\n");
    return { id, path: filePath };
}

// ─── Team Digest (regenerated from current state) ───

export async function updateTeamDigest(cwd, runId, state, meta) {
    await ensureBlackboardDirs(cwd, runId);
    const lines = [`# Team Digest\n`];
    lines.push(`Run: ${runId} | Phase: ${state.phase}\n`);

    // Role status
    lines.push(`## Roles\n`);
    for (const role of meta.roles || []) {
        const r = state.roles?.[role];
        if (!r) continue;
        const status = r.status?.toUpperCase() || "UNKNOWN";
        const ticket = r.current?.ticketId ? ` ticket=${r.current.ticketId}` : "";
        const queue = r.queueDepth ? ` q=${r.queueDepth}` : "";
        lines.push(`- **${role}**: ${status}${ticket}${queue}`);
    }

    // Progress summary
    const { overall, active } = computeProgress(state);
    lines.push(`\n## Progress: ${overall}%\n`);
    if (active.length > 0) {
        for (const a of active) {
            lines.push(`- ${a.role}: ${a.id} (${a.status}, ${a.elapsed})`);
        }
    }

    // Ticket DAG summary
    const { ready, waiting, done } = resolveTicketDAG(state);
    lines.push(`\n## Tickets: ${done.length} done, ${ready.length} ready, ${waiting.size} waiting\n`);

    // Thread summaries
    const threads = await readThreadSummaries(cwd, runId);
    if (threads.length > 0) {
        lines.push(`\n## Discussions\n`);
        for (const t of threads.slice(-5)) {
            lines.push(`- [${t.status}] ${t.topic} (${t.messageCount} msgs, ${t.participants.join(",")})`);
        }
    }

    // Recent decisions
    const decisions = await readDecisions(cwd, runId);
    if (decisions.length > 0) {
        lines.push(`\n## Recent Decisions\n`);
        for (const d of decisions.slice(-5)) {
            lines.push(`- [${d.role}] ${d.question} → **${d.answer}**`);
        }
    }

    // Changelog
    const changelog = await readChangelog(cwd, runId);
    if (changelog) {
        lines.push(`\n## Changelog\n`);
        lines.push(changelog.split("\n").slice(-8).join("\n"));
    }

    await writeTextAtomic(blackboardTeamDigestPath(cwd, runId), lines.join("\n") + "\n");

    // Also update goal.md
    await updateGoalFile(cwd, runId, state, meta);
}

// ─── Read Operations (used by Prompt Enricher) ───

export async function readDecisions(cwd, runId) {
    const p = blackboardDecisionsPath(cwd, runId);
    if (!existsSync(p)) return [];
    const raw = await readFile(p, "utf-8");
    return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            try { return JSON.parse(line); }
            catch { return null; }
        })
        .filter(Boolean);
}

export async function readContracts(cwd, runId) {
    const dir = blackboardContractsDir(cwd, runId);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const contracts = [];
    for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".md")) continue;
        const content = await readFile(join(dir, e.name), "utf-8");
        const match = e.name.match(/^(.+?)-(\w+)-(\w+)\.md$/);
        contracts.push({
            filename: e.name,
            ticketId: match?.[1] || "?",
            role: match?.[2] || "?",
            type: match?.[3] || "?",
            content,
        });
    }
    return contracts;
}

export async function readChangelog(cwd, runId) {
    const p = blackboardChangelogPath(cwd, runId);
    if (!existsSync(p)) return "";
    return readFile(p, "utf-8");
}

/**
 * Build full team context for a role's prompt injection (Three-Layer Cognitive Model).
 * Returns: teamContext + goalContext + discussionContext
 */
export async function buildTeamContext(cwd, runId, role, state, meta) {
    const roleType = getRoleType(role);
    const decisions = await readDecisions(cwd, runId);
    const allContracts = await readContracts(cwd, runId);
    const changelog = await readChangelog(cwd, runId);

    // Filter contracts by role type (exclude same-type contracts)
    const relevantContracts = allContracts.filter((c) => getRoleType(c.role) !== roleType);

    // Context relevance rules per role type
    const contextRules = {
        architect: { includeContracts: false, includeChangelog: false, maxDecisions: 5 },
        backend: { includeContracts: true, includeChangelog: false, maxDecisions: 10 },
        frontend: { includeContracts: true, includeChangelog: false, maxDecisions: 10 },
        qa: { includeContracts: true, includeChangelog: true, maxDecisions: 5 },
        reviewer: { includeContracts: true, includeChangelog: true, maxDecisions: 10 },
    };
    const rules = contextRules[roleType] || { includeContracts: true, includeChangelog: true, maxDecisions: 10 };

    // Team context (Layer 3 - Environment)
    const teamContext = {
        decisions: decisions.slice(-rules.maxDecisions),
        contracts: rules.includeContracts ? truncateContracts(relevantContracts, 2000) : [],
        changelog: rules.includeChangelog ? truncateText(changelog, 500) : "",
        findings: [],
    };

    // Goal context (Layer 1 - Goal)
    const { categories, overall, active } = computeProgress(state);
    const { ready, waiting, done } = resolveTicketDAG(state);
    const progressLines = Object.entries(categories)
        .map(([cat, { done: d, total: t }]) => `${cat}: ${d}/${t}`)
        .join(" | ");
    const dagLines = [
        `Done: ${done.join(", ") || "none"}`,
        `Ready: ${ready.join(", ") || "none"}`,
        waiting.size > 0
            ? `Waiting: ${[...waiting.entries()].map(([id, deps]) => `${id}(→${deps.join(",")})`).join(", ")}`
            : null,
    ].filter(Boolean).join("\n");

    const goalContext = {
        goal: meta.goal || "No goal defined",
        progress: `Overall: ${overall}% | ${progressLines}`,
        dagStatus: dagLines,
    };

    // Discussion context (Layer 3 - Environment)
    const discussionContext = await readRecentMessages(cwd, runId, {
        maxThreads: 3,
        maxCharsPerThread: 400,
    });

    return { teamContext, goalContext, discussionContext };
}

// ─── Token Budget Helpers ───

function truncateText(text, maxChars) {
    if (!text || text.length <= maxChars) return text || "";
    return text.slice(-maxChars) + "\n...(truncated)";
}

function truncateContracts(contracts, maxTotalChars) {
    let total = 0;
    const result = [];
    for (const c of contracts) {
        const len = c.content?.length || 0;
        if (total + len > maxTotalChars) {
            const remaining = maxTotalChars - total;
            if (remaining > 100) {
                result.push({ ...c, content: c.content.slice(0, remaining) + "\n...(truncated)" });
            }
            break;
        }
        total += len;
        result.push(c);
    }
    return result;
}
