// Team Blackboard — shared knowledge layer for cross-role awareness

import { mkdir, readFile, readdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeTextAtomic, writeJsonAtomic } from "./atomic.mjs";
import {
    blackboardDir,
    blackboardContractsDir,
    blackboardDecisionsPath,
    blackboardChangelogPath,
    blackboardTeamDigestPath,
} from "./paths.mjs";
import { getRoleType } from "./roles.mjs";

// ─── Initialization ───

export async function ensureBlackboardDirs(cwd, runId) {
    await mkdir(blackboardDir(cwd, runId), { recursive: true });
    await mkdir(blackboardContractsDir(cwd, runId), { recursive: true });
}

// ─── Write Operations (called by Hub after role completes) ───

/**
 * Write a contract artifact to the blackboard.
 * @param {string} cwd
 * @param {string} runId
 * @param {{ role: string, ticketId: string, type: string, content: string }} artifact
 */
export async function writeContract(cwd, runId, artifact) {
    await ensureBlackboardDirs(cwd, runId);
    const filename = `${artifact.ticketId}-${artifact.role}-${artifact.type}.md`;
    const filePath = join(blackboardContractsDir(cwd, runId), filename);
    const header = `# ${artifact.type} from ${artifact.role} (ticket ${artifact.ticketId})\n\n`;
    await writeTextAtomic(filePath, header + artifact.content + "\n");
}

/**
 * Append a decision to the decisions log.
 */
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

/**
 * Append a changelog entry.
 */
export async function appendChangelog(cwd, runId, { role, ticketId, summary }) {
    await ensureBlackboardDirs(cwd, runId);
    const line = `- **${role}** (${ticketId}): ${summary} [${new Date().toISOString()}]\n`;
    await appendFile(blackboardChangelogPath(cwd, runId), line, "utf-8");
}

/**
 * Regenerate the team-digest.md from current state.
 */
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
        const ticket = r.current?.ticketId ? ` (ticket ${r.current.ticketId})` : "";
        lines.push(`- **${role}**: ${status}${ticket}`);
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
}

// ─── Read Operations (used by Prompt Enricher) ───

/**
 * Read all decisions from the JSONL file.
 */
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

/**
 * Read all contracts from the contracts directory.
 */
export async function readContracts(cwd, runId) {
    const dir = blackboardContractsDir(cwd, runId);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const contracts = [];
    for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".md")) continue;
        const content = await readFile(join(dir, e.name), "utf-8");
        // Parse role and ticketId from filename: ticketId-role-type.md
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

/**
 * Read changelog text.
 */
export async function readChangelog(cwd, runId) {
    const p = blackboardChangelogPath(cwd, runId);
    if (!existsSync(p)) return "";
    return readFile(p, "utf-8");
}

/**
 * Build team context for a specific role's prompt injection.
 * Filters by role TYPE (not instance) so backend-1 and backend-2
 * both get the architect + frontend contracts but not each other's.
 */
export async function buildTeamContext(cwd, runId, role) {
    const roleType = getRoleType(role);
    const decisions = await readDecisions(cwd, runId);
    const allContracts = await readContracts(cwd, runId);
    const changelog = await readChangelog(cwd, runId);

    // Filter contracts: exclude contracts from same role TYPE
    const relevantContracts = allContracts.filter((c) => getRoleType(c.role) !== roleType);

    // Context relevance rules per role TYPE
    const contextRules = {
        architect: { includeContracts: false, includeChangelog: false, maxDecisions: 5 },
        backend: { includeContracts: true, includeChangelog: false, maxDecisions: 10 },
        frontend: { includeContracts: true, includeChangelog: false, maxDecisions: 10 },
        qa: { includeContracts: true, includeChangelog: true, maxDecisions: 5 },
        reviewer: { includeContracts: true, includeChangelog: true, maxDecisions: 10 },
    };
    const rules = contextRules[roleType] || { includeContracts: true, includeChangelog: true, maxDecisions: 10 };

    return {
        decisions: decisions.slice(-rules.maxDecisions),
        contracts: rules.includeContracts ? truncateContracts(relevantContracts, 2000) : [],
        changelog: rules.includeChangelog ? truncateText(changelog, 500) : "",
        findings: [],
    };
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
            // Include truncated version
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
