#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_ROLES, parseCommaList, expandRoleSpecs, parseGlobalArgs, printUsage } from "./lib/cli.mjs";
import { writeJsonAtomic, writeTextAtomic } from "./lib/atomic.mjs";
import { loadRoleTemplate, getRoleType } from "./lib/roles.mjs";
import { buildAssignPrompt, buildReplyPrompt } from "./lib/prompt.mjs";
import {
    createRoleWorktrees,
    ensureGitRepo,
    getWorktreeStatus,
    isWorktreeClean,
    removeRoleWorktrees,
    revParse,
} from "./lib/git_worktree.mjs";
import { loadSdks, parseTeamStatus, runCodexSession, resumeCodexSession, runClaudeSession, resumeClaudeSession } from "./lib/engines.mjs";
import { log, fatal } from "./lib/logger.mjs";
import {
    digestPath,
    logsDir,
    portPath,
    reportsDir,
    runDir,
    runsRootDir,
    signalPath,
    statusPath,
    ticketsDir,
} from "./lib/paths.mjs";
import { generateDigest, generateSignal, generateStatus } from "./lib/reporter.mjs";
import { dequeueNextForRole, enqueueAssign, enqueueReply, ensureQueueDirs, markProcessed, countPendingByRole } from "./lib/queue.mjs";
import {
    generateRunId,
    findLatestRunId,
    listRunIds,
    loadOrInitStore,
    loadRunMeta,
    saveCheckpointFile,
    saveRunMeta,
    saveStateFile,
    initStateFromRunMeta,
} from "./lib/store.mjs";
import { openBrowser, startServer } from "./lib/server.mjs";
import { ensureBlackboardDirs, writeContract, appendDecision, appendChangelog, writePlanRevision, updateTeamDigest, buildTeamContext } from "./lib/blackboard.mjs";
import { extractArtifacts, generateChangelogEntry } from "./lib/extractor.mjs";
import { WORKFLOW_PRESETS, initWorkflow, resolveReadyPhases, markRoleDone, activatePhase, resetPhase, getWorkflowSummary } from "./lib/workflow.mjs";
import { analyzeFindings } from "./lib/review_loop.mjs";
import { createIntegrationBranch, mergeRoleToIntegration, propagateToAllWorktrees } from "./lib/integration.mjs";
import { extractDiscussionEntries, createThread, addThreadResponse, ensureThreadsDir } from "./lib/discussion.mjs";
import { Scheduler } from "./lib/scheduler.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function deriveTicketStatus(teamStatus) {
    if (teamStatus === "DONE") return "done";
    if (teamStatus === "BLOCKED") return "blocked";
    if (teamStatus === "FAILED") return "failed";
    return "needs_review";
}

function slugify(input) {
    const s = String(input || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return s || "ticket";
}

function pad3(n) {
    const v = String(n);
    return v.padStart(3, "0");
}

function parseTicketIdAndTitle(md, fallbackPath) {
    const h = md.match(/^#\s*(\d{1,6})\s*(?:[·:-]\s*)?(.*)$/m);
    if (h) {
        return { id: pad3(h[1]), title: (h[2] || "").trim() || null };
    }
    const bn = basename(fallbackPath || "");
    const m = bn.match(/^(\d{1,6})[-_ ]/);
    if (m) return { id: pad3(m[1]), title: null };
    return { id: null, title: null };
}

function validateRole(role) {
    if (!/^[a-z][a-z0-9_-]*$/.test(role)) {
        throw new Error(`invalid role: ${role}`);
    }
}

/**
 * Resolve a role type (e.g. "backend") to an available instance.
 * If the exact instance is specified (e.g. "backend-1"), use it directly.
 * If a type is specified (e.g. "backend"), find an idle instance of that type.
 * Returns the resolved instance name or the original role if no instances.
 */
function resolveRoleInstance(store, roleInput) {
    const state = store.getState();
    // If exact instance exists, use it
    if (state.roles[roleInput]) return roleInput;

    // Find instances matching this role type
    const instances = Object.keys(state.roles).filter(
        (r) => getRoleType(r) === roleInput,
    );
    if (instances.length === 0) return roleInput; // fallback
    if (instances.length === 1) return instances[0];

    // Prefer idle instances, then by queue depth
    const idle = instances.filter((r) => state.roles[r].status === "idle");
    if (idle.length > 0) {
        // Pick the one with lowest queue depth
        idle.sort((a, b) => (state.roles[a].queueDepth || 0) - (state.roles[b].queueDepth || 0));
        return idle[0];
    }
    // All busy — pick least loaded
    instances.sort((a, b) => (state.roles[a].queueDepth || 0) - (state.roles[b].queueDepth || 0));
    return instances[0];
}

async function writeReports(cwd, store) {
    const meta = store.getMeta();
    const state = store.getState();
    const runId = state.runId;
    await mkdir(runDir(cwd, runId), { recursive: true });

    const signal = generateSignal(state);
    const digest = generateDigest(state, meta.roles);
    const status = generateStatus(state, meta);

    await Promise.all([
        writeTextAtomic(signalPath(cwd, runId), signal),
        writeTextAtomic(digestPath(cwd, runId), digest),
        writeTextAtomic(statusPath(cwd, runId), status),
    ]);
}

async function refreshQueueDepths(cwd, store) {
    const runId = store.getState().runId;
    const counts = await countPendingByRole(cwd, runId);
    for (const role of store.getMeta().roles) {
        const depth = counts[role] || 0;
        store.updateRole(role, { queueDepth: depth });
    }
}

function parseInitArgs(args, fatalFn) {
    const out = { baseRef: "HEAD", roles: DEFAULT_ROLES, worktreeRoot: "" };
    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case "--base":
                if (i + 1 >= args.length) fatalFn("--base requires a value");
                out.baseRef = args[++i];
                i++;
                break;
            case "--roles":
                if (i + 1 >= args.length) fatalFn("--roles requires a value");
                out.roles = expandRoleSpecs(parseCommaList(args[++i]));
                i++;
                break;
            case "--worktree-root":
                if (i + 1 >= args.length) fatalFn("--worktree-root requires a value");
                out.worktreeRoot = args[++i];
                i++;
                break;
            default:
                fatalFn(`Unknown init option: ${args[i]}`);
        }
    }
    if (!out.roles || out.roles.length === 0) out.roles = DEFAULT_ROLES;
    for (const r of out.roles) validateRole(r);
    return out;
}

function parseTicketNewArgs(args, fatalFn) {
    const out = { id: "", title: "", outPath: "" };
    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case "--id":
                if (i + 1 >= args.length) fatalFn("--id requires a value");
                out.id = args[++i];
                i++;
                break;
            case "--title":
                if (i + 1 >= args.length) fatalFn("--title requires a value");
                out.title = args[++i];
                i++;
                break;
            case "--out":
                if (i + 1 >= args.length) fatalFn("--out requires a value");
                out.outPath = args[++i];
                i++;
                break;
            default:
                fatalFn(`Unknown ticket new option: ${args[i]}`);
        }
    }
    if (!out.title) fatalFn("--title is required");
    return out;
}

function parseAssignArgs(args, fatalFn) {
    const out = { ticketPath: "", role: "", estimate: "M" };
    let i = 0;
    while (i < args.length) {
        if (!args[i].startsWith("-") && !out.ticketPath) {
            out.ticketPath = args[i];
            i++;
            continue;
        }
        switch (args[i]) {
            case "--role":
                if (i + 1 >= args.length) fatalFn("--role requires a value");
                out.role = args[++i];
                i++;
                break;
            case "--estimate":
                if (i + 1 >= args.length) fatalFn("--estimate requires a value");
                out.estimate = String(args[++i]).toUpperCase();
                i++;
                break;
            default:
                fatalFn(`Unknown assign option: ${args[i]}`);
        }
    }
    if (!out.ticketPath) fatalFn("assign requires <ticketPath>");
    if (!out.role) fatalFn("--role is required");
    validateRole(out.role);
    if (!["S", "M", "L"].includes(out.estimate)) fatalFn("--estimate must be S|M|L");
    return out;
}

function parseReplyArgs(args, fatalFn) {
    const out = { role: "", text: "" };
    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case "--role":
                if (i + 1 >= args.length) fatalFn("--role requires a value");
                out.role = args[++i];
                i++;
                break;
            case "--text":
                if (i + 1 >= args.length) fatalFn("--text requires a value");
                out.text = args[++i];
                i++;
                break;
            default:
                fatalFn(`Unknown reply option: ${args[i]}`);
        }
    }
    if (!out.role) fatalFn("--role is required");
    validateRole(out.role);
    if (!out.text) fatalFn("--text is required");
    return out;
}

function parseCleanArgs(args, fatalFn) {
    const out = { keepBranches: false, force: false };
    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case "--keep-branches":
                out.keepBranches = true;
                i++;
                break;
            case "--force":
                out.force = true;
                i++;
                break;
            default:
                fatalFn(`Unknown clean option: ${args[i]}`);
        }
    }
    return out;
}

async function cmdInit(global, args) {
    await ensureGitRepo(global.cwd);

    const runId = generateRunId();
    const createdAt = new Date().toISOString();
    const baseSha = await revParse(global.cwd, args.baseRef);
    const roles = args.roles;

    const defaultWorktreeRootRel = join(".agent-team", "worktrees", runId);
    const requested = args.worktreeRoot || defaultWorktreeRootRel;
    const requestedAbs = resolve(global.cwd, requested);
    const relToCwd = relative(global.cwd, requestedAbs);
    if (relToCwd.startsWith("..")) {
        fatal(`--worktree-root must be under --cwd (got: ${requested})`);
    }
    const worktreeRootRel = relToCwd || ".";
    const worktreeRootAbs = resolve(global.cwd, worktreeRootRel);

    await mkdir(runsRootDir(global.cwd), { recursive: true });
    await mkdir(ticketsDir(global.cwd), { recursive: true });
    await mkdir(runDir(global.cwd, runId), { recursive: true });
    await mkdir(reportsDir(global.cwd, runId), { recursive: true });
    await mkdir(logsDir(global.cwd, runId), { recursive: true });
    await ensureQueueDirs(global.cwd, runId);
    await ensureBlackboardDirs(global.cwd, runId);
    await ensureThreadsDir(global.cwd, runId);

    const meta = {
        version: 2,
        runId,
        createdAt,
        baseRef: args.baseRef,
        baseSha,
        roles,
        worktreeRootRel,
        goal: args.goal || "",
    };

    const state = initStateFromRunMeta(meta);

    if (!global.dryRun) {
        // Create integration branch
        log("INFO", `Creating integration branch: integration/${runId}`);
        await createIntegrationBranch(global.cwd, runId, baseSha);

        log("INFO", `Creating ${roles.length} role worktrees under ${worktreeRootRel}`);
        await createRoleWorktrees({
            cwd: global.cwd,
            runId,
            baseSha,
            roles,
            worktreeRootAbs,
            dryRun: false,
        });
    } else {
        log("INFO", "[dry-run] Skipping git worktree add; planned commands:");
        console.log(`  git branch integration/${runId} ${baseSha}`);
        for (const role of roles) {
            const branch = `team/${runId}/${role}`;
            const wtPath = join(worktreeRootAbs, role);
            console.log(`  git worktree add -b ${branch} ${wtPath} ${baseSha}`);
        }
    }

    await saveRunMeta(global.cwd, runId, meta);
    await saveStateFile(global.cwd, runId, state);
    await saveCheckpointFile(global.cwd, runId, {
        version: 2,
        runId,
        phase: state.phase,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        roles: Object.fromEntries(Object.entries(state.roles).map(([k, v]) => [k, { ...v, events: [] }])),
        tickets: state.tickets,
    });

    await writeTextAtomic(signalPath(global.cwd, runId), generateSignal(state));
    await writeTextAtomic(digestPath(global.cwd, runId), generateDigest(state, roles));
    await writeTextAtomic(statusPath(global.cwd, runId), generateStatus(state, meta));

    log("INFO", `Run created: ${runId}`);
    log("INFO", `Integration branch: integration/${runId}`);
    log("INFO", `Tip: add runtime dir to your project .gitignore: echo \".agent-team/\" >> ${join(global.cwd, ".gitignore")}`);
    console.log("");
    console.log(`signal: ${signalPath(global.cwd, runId)}`);
    console.log(`digest: ${digestPath(global.cwd, runId)}`);
    console.log(`status: ${statusPath(global.cwd, runId)}`);
}

async function cmdTicketNew(global, args) {
    const tdir = ticketsDir(global.cwd);
    await mkdir(tdir, { recursive: true });

    let id = args.id ? String(args.id).replace(/^0+/, "") : "";
    if (id && !/^\d+$/.test(id)) fatal("--id must be numeric");

    if (!id) {
        const entries = existsSync(tdir) ? await readdir(tdir, { withFileTypes: true }) : [];
        let max = 0;
        for (const e of entries) {
            if (!e.isFile()) continue;
            const m = e.name.match(/^(\d{1,6})[-_ ]/);
            if (!m) continue;
            max = Math.max(max, parseInt(m[1], 10));
        }
        id = String(max + 1);
    }

    const id3 = pad3(id);
    const slug = slugify(args.title);
    const outPath =
        args.outPath
            ? resolve(global.cwd, args.outPath)
            : join(tdir, `${id3}-${slug}.md`);

    const template = `# ${id3} · ${args.title}

<!-- ticket-meta
depends_on: []
role_type: frontend
estimate: M
priority: 3
-->

## Goal Context

What team-level goal does this ticket advance?

## Context
- Background:
- Constraints:
- References (files/links):

## Scope (precise)
- In-scope:
- Out-of-scope:

## Deliverables
- Files to add/modify:
- Commands to run:

## Acceptance
- [ ] ...
- [ ] ...

## Notes to Role
- Role-specific hints, file paths, style references
`;

    await writeTextAtomic(outPath, template);
    log("INFO", `Ticket created: ${outPath}`);
}

async function resolveRunIdOrFatal(cwd, runIdArg) {
    if (runIdArg) return runIdArg;
    const latest = await findLatestRunId(cwd);
    if (!latest) fatal("No runs found. Run: init");
    return latest;
}

async function cmdAssign(global, args) {
    const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
    const meta = await loadRunMeta(global.cwd, runId);
    if (!meta) fatal(`Run not found: ${runId}`);

    // Resolve role type to instance (e.g., "backend" → "backend-1")
    const store = await loadOrInitStore(global.cwd, runId);
    const resolvedRole = resolveRoleInstance(store, args.role);
    if (!meta.roles.includes(resolvedRole)) {
        // Check if any instance of this role type exists
        const typeInstances = meta.roles.filter((r) => getRoleType(r) === args.role);
        if (typeInstances.length === 0) {
            fatal(`Role '${args.role}' not in run roles: ${meta.roles.join(", ")}`);
        }
    }

    const absTicket = isAbsolute(args.ticketPath) ? args.ticketPath : resolve(global.cwd, args.ticketPath);
    if (!existsSync(absTicket)) fatal(`ticket not found: ${absTicket}`);

    const relTicket = relative(global.cwd, absTicket);
    const { path } = await enqueueAssign(global.cwd, runId, {
        role: resolvedRole,
        ticketPath: relTicket,
        estimate: args.estimate,
    });
    log("INFO", `Enqueued: ${path} (resolved instance: ${resolvedRole})`);
}

async function cmdReply(global, args) {
    const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
    const meta = await loadRunMeta(global.cwd, runId);
    if (!meta) fatal(`Run not found: ${runId}`);

    // For reply, resolve role to the blocked instance
    const store = await loadOrInitStore(global.cwd, runId);
    let resolvedRole = args.role;
    if (!meta.roles.includes(resolvedRole)) {
        // If role type given, find the blocked instance
        const typeInstances = meta.roles.filter((r) => getRoleType(r) === args.role);
        const blockedInstance = typeInstances.find((r) => store.getState().roles[r]?.status === "blocked");
        if (blockedInstance) {
            resolvedRole = blockedInstance;
        } else if (typeInstances.length > 0) {
            resolvedRole = typeInstances[0];
        } else {
            fatal(`Role '${args.role}' not in run roles: ${meta.roles.join(", ")}`);
        }
    }

    const { path } = await enqueueReply(global.cwd, runId, {
        role: resolvedRole,
        text: args.text,
    });
    log("INFO", `Enqueued: ${path} (resolved instance: ${resolvedRole})`);
}

async function cmdListRuns(global) {
    const runs = await listRunIds(global.cwd);
    if (runs.length === 0) {
        log("INFO", "No runs");
        return;
    }
    console.log(`\n${runs.length} runs (${runsRootDir(global.cwd)})\n`);
    for (const runId of runs) {
        const meta = await loadRunMeta(global.cwd, runId);
        const checkpoint = existsSync(join(runDir(global.cwd, runId), "checkpoint.json")) ? " [resumable]" : "";
        if (!meta) {
            console.log(`- ${runId}${checkpoint}`);
            continue;
        }
        console.log(`- ${runId} base=${meta.baseRef} roles=${(meta.roles || []).join(",")}${checkpoint}`);
    }
    console.log("");
}

async function cmdStatus(global) {
    const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
    const sp = signalPath(global.cwd, runId);
    const dp = digestPath(global.cwd, runId);
    const pp = portPath(global.cwd, runId);

    if (existsSync(sp)) console.log(await readFile(sp, "utf-8"));
    if (existsSync(dp)) {
        console.log("---");
        console.log(await readFile(dp, "utf-8"));
    }
    if (existsSync(pp)) {
        const port = String(await readFile(pp, "utf-8")).trim();
        if (port) console.log(`dashboard=http://localhost:${port}`);
    }
}

async function cmdClean(global, args) {
    const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
    const meta = await loadRunMeta(global.cwd, runId);
    if (!meta) fatal(`Run not found: ${runId}`);

    const worktreeRootAbs = resolve(global.cwd, meta.worktreeRootRel);
    const { planned, executed } = await removeRoleWorktrees({
        cwd: global.cwd,
        runId,
        roles: meta.roles,
        worktreeRootAbs,
        keepBranches: args.keepBranches,
        force: args.force,
        dryRun: global.dryRun,
    });

    if (!args.force) {
        console.log("Planned worktree removals (add --force to execute):");
        for (const p of planned) console.log(`- ${p.role}: ${p.worktreePath} (branch ${p.branch})`);
        return;
    }

    if (!global.dryRun) {
        await rm(runDir(global.cwd, runId), { recursive: true, force: true }).catch(() => { });
        await rm(worktreeRootAbs, { recursive: true, force: true }).catch(() => { });
    }
    log("INFO", executed ? "Clean done" : "Clean skipped");
}

async function appendRoleLog(cwd, runId, role, line) {
    const p = join(logsDir(cwd, runId), `${role}.log`);
    await appendFile(p, line + "\n", "utf-8").catch(() => { });
}

async function handleAssign(global, store, role, req) {
    const meta = store.getMeta();
    const runId = store.getState().runId;
    const roleState = store.getState().roles[role];
    const ticketAbs = resolve(global.cwd, req.ticketPath);
    const ticketMd = await readFile(ticketAbs, "utf-8");
    const { id, title } = parseTicketIdAndTitle(ticketMd, ticketAbs);
    const ticketId = id || req.requestId;

    const reportPathAbs = join(reportsDir(global.cwd, runId), `${ticketId}-${role}.md`);
    const reportPathRel = relative(global.cwd, reportPathAbs);

    store.updateRole(role, {
        status: "running",
        lastError: null,
        current: {
            ticketId,
            ticketPath: req.ticketPath,
            estimate: req.estimate || "M",
            assignedAt: req.createdAt,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            teamStatus: null,
            reportPath: reportPathRel,
        },
    });

    store.upsertTicket(ticketId, {
        id: ticketId,
        title: title || null,
        path: req.ticketPath,
        role,
        status: "running",
        teamStatus: null,
        reportPath: reportPathRel,
        updatedAt: new Date().toISOString(),
    });

    const worktreeAbs = resolve(global.cwd, roleState.worktreeRel);
    const branch = roleState.branch;

    if (global.dryRun) {
        const body = `# ${ticketId} · (dry-run)\n\n## Report\n- Ticket: ${ticketId}\n- Role: ${role}\n- Branch: ${branch}\n- Worktree: ${worktreeAbs}\n- Commits:\n  - (dry-run)\n- Tests:\n  - (dry-run)\n- Notes:\n  - simulated\n- Questions:\n  - none\n\nTEAM_STATUS=DONE\n`;
        await writeTextAtomic(reportPathAbs, body);
        store.updateRole(role, {
            status: "idle",
            threadId: null,
            last: { ticketId, teamStatus: "DONE", finishedAt: new Date().toISOString() },
            current: null,
        });
        store.upsertTicket(ticketId, { status: "done", teamStatus: "DONE", updatedAt: new Date().toISOString() });
        return { ok: true, result: { teamStatus: "DONE", dryRun: true } };
    }

    if (!existsSync(worktreeAbs)) {
        store.updateRole(role, { status: "attention", lastError: "missing_worktree" });
        store.upsertTicket(ticketId, { status: "failed", teamStatus: "FAILED", updatedAt: new Date().toISOString() });
        await writeTextAtomic(reportPathAbs, `# ${ticketId} (${role})\n\nERROR: missing worktree: ${worktreeAbs}\n\nTEAM_STATUS=FAILED\n`);
        return { ok: false, error: "missing_worktree" };
    }

    const clean = await isWorktreeClean(worktreeAbs);
    if (!clean) {
        const gitInfo = await getWorktreeStatus({ worktreePathAbs: worktreeAbs, baseSha: meta.baseSha });
        store.updateRole(role, { status: "attention", git: gitInfo, lastError: "dirty_worktree" });
        store.upsertTicket(ticketId, { status: "failed", teamStatus: "FAILED", updatedAt: new Date().toISOString() });
        await writeTextAtomic(reportPathAbs, `# ${ticketId} (${role})\n\nERROR: dirty_worktree\n\nTEAM_STATUS=FAILED\n`);
        return { ok: false, result: { teamStatus: "FAILED", error: "dirty_worktree" } };
    }

    const roleTemplate = await loadRoleTemplate(role);
    const { teamContext, goalContext, discussionContext } = await buildTeamContext(global.cwd, runId, role, store.getState(), meta);
    const prompt = buildAssignPrompt({
        role,
        roleTemplate,
        ticketMarkdown: ticketMd,
        runMeta: meta,
        worktreePathAbs: worktreeAbs,
        branch,
        baseSha: meta.baseSha,
        approvalMode: global.approvalMode,
        teamContext,
        goalContext,
        discussionContext,
    });

    let finalText = "";
    let usage = null;
    const turnStart = Date.now();

    const onEvent = (fmt) => {
        store.addRoleEvent(role, { ts: Date.now(), ...fmt });
        appendRoleLog(global.cwd, runId, role, `[${new Date().toISOString()}] ${fmt.kind} ${fmt.text}`);
    };

    const engineOpts = {
        approvalMode: global.approvalMode,
        sandboxMode: global.sandboxMode,
        workingDirectory: worktreeAbs,
        onEvent,
    };

    try {
        const runFn = global.engine === "claude" ? runClaudeSession : runCodexSession;
        const sdk = global.engine === "claude" ? global.sdks.claude : global.sdks.codex;
        const out = await runFn(sdk, prompt, engineOpts);
        finalText = out.finalResponse || "";
        usage = out.usage || null;
        store.updateRole(role, { threadId: out.threadId || null });
    } catch (err) {
        const msg = err.message || String(err);
        store.updateRole(role, { status: "attention", lastError: msg });
        store.upsertTicket(ticketId, { status: "failed", teamStatus: "FAILED", updatedAt: new Date().toISOString() });
        await writeTextAtomic(reportPathAbs, `# ${ticketId} (${role})\n\nERROR: ${msg}\n\nTEAM_STATUS=FAILED\n`);
        return { ok: false, error: msg };
    } finally {
        const durSec = ((Date.now() - turnStart) / 1000).toFixed(1);
        store.addRoleEvent(role, { ts: Date.now(), kind: "turn", text: `turn_done ${durSec}s` });
    }

    const teamStatus = parseTeamStatus(finalText) || "NEEDS_REVIEW";
    const ticketStatus = deriveTicketStatus(teamStatus);

    const gitInfo = await getWorktreeStatus({ worktreePathAbs: worktreeAbs, baseSha: meta.baseSha });
    store.updateRole(role, { git: gitInfo });

    const report = `# ${ticketId} · ${role}\n\n${finalText}\n`;
    await writeTextAtomic(reportPathAbs, report);

    store.upsertTicket(ticketId, {
        status: ticketStatus,
        teamStatus,
        threadId: store.getState().roles[role].threadId,
        reportPath: reportPathRel,
        updatedAt: new Date().toISOString(),
    });

    // ── Blackboard: extract artifacts and update shared knowledge ──
    if (teamStatus === "DONE" || teamStatus === "NEEDS_REVIEW") {
        await processRoleCompletion(global.cwd, runId, role, ticketId, finalText, store);
    }

    if (teamStatus === "BLOCKED") {
        store.updateRole(role, {
            status: "blocked",
            current: { ...store.getState().roles[role].current, finishedAt: new Date().toISOString(), teamStatus },
        });
    } else {
        store.updateRole(role, {
            status: "idle",
            last: { ticketId, teamStatus, finishedAt: new Date().toISOString(), usage },
            current: null,
            threadId: null,
        });
    }

    return { ok: teamStatus !== "FAILED", result: { teamStatus, ticketStatus } };
}

async function handleReply(global, store, role, req) {
    const meta = store.getMeta();
    const runId = store.getState().runId;
    const roleState = store.getState().roles[role];

    if (global.dryRun) {
        store.addRoleEvent(role, { ts: Date.now(), kind: "msg", text: "[dry-run] reply ignored" });
        return { ok: false, error: "dry_run_reply_not_supported" };
    }

    const needsThread = global.engine === "codex";
    if (needsThread && (!roleState?.threadId || !roleState?.current?.ticketPath)) {
        store.updateRole(role, { status: "attention", lastError: "no_active_thread" });
        return { ok: false, error: "no_active_thread" };
    }

    const ticketAbs = resolve(global.cwd, roleState.current.ticketPath);
    const ticketMd = await readFile(ticketAbs, "utf-8");
    const ticketId = roleState.current.ticketId || roleState.current.ticketPath;

    const worktreeAbs = resolve(global.cwd, roleState.worktreeRel);
    const branch = roleState.branch;

    if (!existsSync(worktreeAbs)) {
        store.updateRole(role, { status: "attention", lastError: "missing_worktree" });
        return { ok: false, error: "missing_worktree" };
    }
    const roleTemplate = await loadRoleTemplate(role);
    const { teamContext, goalContext, discussionContext } = await buildTeamContext(global.cwd, runId, role, store.getState(), meta);
    const prompt = buildReplyPrompt({
        role,
        roleTemplate,
        leaderText: req.text,
        ticketMarkdown: ticketMd,
        runMeta: meta,
        worktreePathAbs: worktreeAbs,
        branch,
        baseSha: meta.baseSha,
        teamContext,
        goalContext,
        discussionContext,
    });

    // Archive BLOCKED→Reply decision to blackboard
    await appendDecision(global.cwd, runId, {
        role,
        ticketId,
        question: `(${role} was BLOCKED)`,
        answer: req.text.slice(0, 200),
    });

    const onEvent = (fmt) => {
        store.addRoleEvent(role, { ts: Date.now(), ...fmt });
        appendRoleLog(global.cwd, runId, role, `[${new Date().toISOString()}] ${fmt.kind} ${fmt.text}`);
    };

    const engineOpts = {
        approvalMode: global.approvalMode,
        sandboxMode: global.sandboxMode,
        workingDirectory: worktreeAbs,
        onEvent,
    };

    let finalText = "";
    let usage = null;
    try {
        const resumeFn = global.engine === "claude" ? resumeClaudeSession : resumeCodexSession;
        const sdk = global.engine === "claude" ? global.sdks.claude : global.sdks.codex;
        const out = await resumeFn(sdk, roleState.threadId, prompt, engineOpts);
        finalText = out.finalResponse || "";
        usage = out.usage || null;
    } catch (err) {
        const msg = err.message || String(err);
        store.updateRole(role, { status: "attention", lastError: msg });
        store.upsertTicket(ticketId, { status: "failed", teamStatus: "FAILED", updatedAt: new Date().toISOString() });
        return { ok: false, error: msg };
    }

    const teamStatus = parseTeamStatus(finalText) || "NEEDS_REVIEW";
    const ticketStatus = deriveTicketStatus(teamStatus);

    const reportPathAbs = resolve(global.cwd, roleState.current.reportPath);
    const report = `# ${ticketId} · ${role}\n\n${finalText}\n`;
    await writeTextAtomic(reportPathAbs, report);

    const gitInfo = await getWorktreeStatus({ worktreePathAbs: worktreeAbs, baseSha: meta.baseSha });
    store.updateRole(role, { git: gitInfo });

    store.upsertTicket(ticketId, {
        status: ticketStatus,
        teamStatus,
        updatedAt: new Date().toISOString(),
    });

    // Blackboard: extract artifacts and update shared knowledge (same as handleAssign)
    if (teamStatus === "DONE" || teamStatus === "NEEDS_REVIEW") {
        await processRoleCompletion(global.cwd, runId, role, ticketId, finalText, store);
    }

    if (teamStatus === "BLOCKED") {
        store.updateRole(role, {
            status: "blocked",
            current: { ...roleState.current, teamStatus, finishedAt: new Date().toISOString() },
        });
    } else {
        store.updateRole(role, {
            status: "idle",
            last: { ticketId, teamStatus, finishedAt: new Date().toISOString(), usage },
            current: null,
            threadId: null,
        });
    }

    return { ok: teamStatus !== "FAILED", result: { teamStatus, ticketStatus } };
}

async function cmdServe(global) {
    const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
    const store = await loadOrInitStore(global.cwd, runId);
    if (!store) fatal(`Run not found: ${runId}`);

    // Load SDK based on engine selection
    const engineInfo = {
        needsCodex: global.engine === "codex",
        needsClaude: global.engine === "claude",
    };
    global.sdks = await loadSdks(engineInfo, global.dryRun);
    log("INFO", `Engine: ${global.engine}`);

    await mkdir(reportsDir(global.cwd, runId), { recursive: true });
    await mkdir(logsDir(global.cwd, runId), { recursive: true });
    await ensureQueueDirs(global.cwd, runId);
    await ensureBlackboardDirs(global.cwd, runId);

    // Load or initialize workflow
    const workflowStatePath = join(runDir(global.cwd, runId), "workflow.json");
    let workflowData = null;
    if (existsSync(workflowStatePath)) {
        try {
            workflowData = JSON.parse(await readFile(workflowStatePath, "utf-8"));
            log("INFO", `Workflow loaded: ${workflowData.def.phases.length} phases`);
        } catch { /* proceed without workflow */ }
    }
    // Attach to store so processRoleCompletion uses the same in-memory instance
    store._workflow = workflowData;

    // Initialize Scheduler
    const scheduler = new Scheduler(store, global.cwd, runId, {
        onAssign: async (role, ticketPath) => {
            const relTicket = relative(global.cwd, ticketPath);
            await enqueueAssign(global.cwd, runId, { role, ticketPath: relTicket, estimate: "M" });
            log("INFO", `Scheduler auto-assigned ${role} to ${ticketPath}`);
        },
        onSignal: async (signal) => {
            await writeTextAtomic(signalPath(global.cwd, runId), signal);
            log("INFO", `Scheduler signal: ${signal}`);
        },
    });
    store._scheduler = scheduler;

    const { server, port } = await startServer(store, global.port, __dirname);
    store.setDashboard(port);
    store.setPhase("running");
    await writeTextAtomic(portPath(global.cwd, runId), String(port));

    const url = `http://localhost:${port}`;
    log("INFO", `Hub started: ${url}`);
    if (!global.noOpen) openBrowser(url);

    let stopping = false;
    const roleWorkers = [];

    const tick = async () => {
        await refreshQueueDepths(global.cwd, store);
        // Process scheduler events (progressive merge, dependency resolution, etc.)
        const schedulerResult = await scheduler.processEvents();
        for (const action of schedulerResult.actions) {
            log("INFO", `Scheduler action: ${action.type}${action.role ? ` role=${action.role}` : ""}`);
        }
        await saveStateFile(global.cwd, runId, store.getState());
        await saveCheckpointFile(global.cwd, runId, store.toCheckpoint());
        await writeReports(global.cwd, store);
    };

    const interval = setInterval(() => {
        // Periodic tick for idle detection and convergence checking
        scheduler.pushEvent({ type: "tick" });
        tick().catch(() => { });
    }, 5000);

    await tick();

    for (const role of store.getMeta().roles) {
        roleWorkers.push(
            (async () => {
                while (!stopping) {
                    const r = store.getState().roles[role];
                    const blocked = r?.status === "blocked";
                    const preferType = blocked ? "reply" : "assign";
                    const allowTypes = blocked ? ["reply"] : ["assign", "reply"];
                    const item = await dequeueNextForRole(global.cwd, runId, role, { preferType, allowTypes });
                    if (!item) {
                        await sleep(750);
                        continue;
                    }
                    const { req, processingPath } = item;
                    let result = null;
                    let ok = false;
                    let error = null;
                    try {
                        if (req.type === "assign") {
                            result = await handleAssign(global, store, role, req);
                            ok = Boolean(result?.ok);
                        } else if (req.type === "reply") {
                            result = await handleReply(global, store, role, req);
                            ok = Boolean(result?.ok);
                        } else {
                            error = `unknown request type: ${req.type}`;
                        }
                    } catch (err) {
                        error = err.message || String(err);
                    } finally {
                        await markProcessed(global.cwd, runId, processingPath, {
                            ok: ok && !error,
                            result: result?.result || null,
                            error: error || result?.error || null,
                        });
                        await tick().catch(() => { });
                    }
                }
            })(),
        );
    }

    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        log("INFO", "Shutting down...");
        clearInterval(interval);
        await writeTextAtomic(portPath(global.cwd, runId), "").catch(() => { });
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1500).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

// ─── Post-Completion Processing (Blackboard + Workflow + Review Loop) ───

async function processRoleCompletion(cwd, runId, role, ticketId, reportText, store) {
    // 1. Extract artifacts from report
    const artifacts = extractArtifacts(reportText, role, ticketId);
    for (const artifact of artifacts) {
        if (artifact.type === "contracts" || artifact.type === "api_surface") {
            await writeContract(cwd, runId, artifact);
            log("INFO", `Blackboard: wrote ${artifact.type} from ${role}`);
        }
        if (artifact.type === "decisions") {
            await appendDecision(cwd, runId, {
                role,
                ticketId,
                question: `(from ${role} report)`,
                answer: artifact.content.slice(0, 200),
            });
        }
        if (artifact.type === "plan_revision") {
            await writePlanRevision(cwd, runId, {
                role,
                ticketId,
                content: artifact.content,
            });
            log("INFO", `Plan Revision proposed by ${role}`);
        }
    }

    // 2. Extract and process discussion entries
    const discussionEntries = extractDiscussionEntries(reportText);
    for (const entry of discussionEntries) {
        if (entry.action === "create") {
            await createThread(cwd, runId, {
                role,
                topic: entry.topic,
                position: entry.position,
                evidence: entry.evidence,
                question: entry.question,
            });
        } else if (entry.action === "respond") {
            // Find matching thread by number
            const threadId = String(entry.threadNum).padStart(3, "0");
            // Best-effort match — prefix search
            const { readdir } = await import("node:fs/promises");
            const threadsPath = join(cwd, ".agent-team", "runs", runId, "blackboard", "threads");
            if (existsSync(threadsPath)) {
                const files = await readdir(threadsPath);
                const match = files.find((f) => f.startsWith(threadId));
                if (match) {
                    await addThreadResponse(cwd, runId, {
                        threadId: match.replace(".md", ""),
                        role,
                        type: entry.type || "respond",
                        content: entry.content,
                    });
                }
            }
        }
    }

    // 3. Append changelog
    const changelogEntry = generateChangelogEntry(role, ticketId, reportText);
    await appendChangelog(cwd, runId, changelogEntry);

    // 4. Progressive merge: merge role branch to integration
    const roleState = store.getState().roles[role];
    if (roleState?.branch) {
        const mergeResult = await mergeRoleToIntegration(cwd, runId, role, roleState.branch);
        if (mergeResult.success) {
            log("INFO", `Progressive merge: ${role} → integration/${runId}`);
            // Propagate to downstream worktrees
            await propagateToAllWorktrees(cwd, runId, store.getState(), role);
            log("INFO", `Propagated integration to active worktrees`);
        } else if (mergeResult.conflicted) {
            log("WARN", `Merge conflict: ${role} → integration/${runId}. Signaling Leader.`);
            await writeTextAtomic(
                signalPath(cwd, runId),
                `MERGE_CONFLICT role=${role} ticket=${ticketId}`,
            );
        }
    }

    // 5. Push scheduler event (if scheduler is attached)
    if (store._scheduler) {
        store._scheduler.pushEvent({ type: "ticket_done", role, ticketId });
    }

    // 6. Update team digest + goal
    await updateTeamDigest(cwd, runId, store.getState(), store.getMeta());

    // 7. Workflow phase advancement
    const workflowData = store._workflow;
    if (workflowData?.def && workflowData?.state) {
        const { phaseCompleted, phaseId } = markRoleDone(workflowData.def, workflowData.state, role);
        if (phaseCompleted) {
            log("INFO", `Workflow: phase '${phaseId}' completed`);

            // Review Loop: if review phase completed, check findings
            const phase = workflowData.def.phases.find((p) => p.id === phaseId);
            if (phase?.roles?.includes("reviewer")) {
                const findingItems = artifacts.filter((a) => a.type === "finding_item");
                const result = analyzeFindings(findingItems, workflowData.state.reviewLoopCount || 0);

                if (result.action === "fix_and_re_review") {
                    workflowData.state.reviewLoopCount = (workflowData.state.reviewLoopCount || 0) + 1;
                    log("INFO", `Review Loop: round ${workflowData.state.reviewLoopCount}`);

                    resetPhase(workflowData.state, phaseId);
                    const verifyPhase = workflowData.def.phases.find((p) => p.id === "verify");
                    if (verifyPhase) resetPhase(workflowData.state, "verify");

                    for (const ft of result.fixTickets) {
                        const resolvedFixRole = resolveRoleInstance(store, ft.role);
                        const fixTicketPath = join(cwd, ".agent-team", "tickets", `fix-r${workflowData.state.reviewLoopCount}-${resolvedFixRole}.md`);
                        await writeTextAtomic(fixTicketPath, ft.ticketContent);
                        await enqueueAssign(cwd, runId, {
                            role: resolvedFixRole,
                            ticketPath: relative(cwd, fixTicketPath),
                            estimate: "S",
                        });
                    }
                } else if (result.action === "escalate") {
                    log("WARN", `Review Loop: ESCALATED — ${result.reason}`);
                    store.setPhase("attention");
                } else {
                    log("INFO", `Review Loop: APPROVED — workflow complete`);
                }
            }

            // Auto-trigger ready phases
            const readyPhases = resolveReadyPhases(workflowData.def, workflowData.state);
            for (const readyId of readyPhases) {
                const readyPhase = workflowData.def.phases.find((p) => p.id === readyId);
                if (!readyPhase) continue;
                activatePhase(workflowData.state, readyId, readyPhase.expandedRoles || readyPhase.roles);
                log("INFO", `Workflow: auto-triggering phase '${readyId}'`);
            }

            // Check full completion
            const allDone = workflowData.def.phases.every(
                (p) => workflowData.state.phases[p.id]?.status === "done",
            );
            if (allDone) {
                store.setPhase("completed");
                log("INFO", "Workflow: ALL PHASES COMPLETE");
            }
        }
    }
}

// ─── Workflow Command ───

async function cmdWorkflow(global, args) {
    if (args[0] === "create") {
        const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
        const meta = await loadRunMeta(global.cwd, runId);
        if (!meta) fatal(`Run not found: ${runId}`);
        let template = "fullstack";
        for (let i = 1; i < args.length; i++) {
            if (args[i] === "--template" && i + 1 < args.length) {
                template = args[++i];
            }
        }
        if (!WORKFLOW_PRESETS[template]) {
            fatal(`Unknown workflow template: ${template}. Available: ${Object.keys(WORKFLOW_PRESETS).join(", ")}`);
        }
        const { def, state } = initWorkflow(template, meta.roles);
        const wfData = { def, state };
        await writeJsonAtomic(join(runDir(global.cwd, runId), "workflow.json"), wfData);
        log("INFO", `Workflow created: ${template} (${def.phases.length} phases)`);
        for (const p of def.phases) {
            const deps = p.dependsOn?.join(", ") || "(start)";
            const roles = p.expandedRoles || p.roles;
            console.log(`  ${p.id}: roles=[${roles.join(",")}] depends=[${deps}]`);
        }
        return;
    }
    if (args[0] === "status") {
        const runId = await resolveRunIdOrFatal(global.cwd, global.runId);
        const wfPath = join(runDir(global.cwd, runId), "workflow.json");
        if (!existsSync(wfPath)) { log("INFO", "No workflow defined for this run."); return; }
        const wfData = JSON.parse(await readFile(wfPath, "utf-8"));
        const summary = getWorkflowSummary(wfData.def, wfData.state);
        console.log(`\nWorkflow (${summary.length} phases):\n`);
        for (const p of summary) {
            console.log(`  ${p.id}: ${p.status.toUpperCase()} [${p.roles}]`);
        }
        console.log("");
        return;
    }
    fatal("Usage: workflow create --template <name> | workflow status");
}

async function main() {
    const { config: global, rest } = parseGlobalArgs(process.argv, fatal);
    if (global.help || rest.length === 0) {
        printUsage();
        return;
    }

    const cmd = rest[0];
    const args = rest.slice(1);

    switch (cmd) {
        case "init":
            await cmdInit(global, parseInitArgs(args, fatal));
            return;
        case "serve":
            await cmdServe(global);
            return;
        case "ticket":
            if (args[0] !== "new") fatal("Usage: ticket new --title ... [--id NNN] [--out PATH]");
            await cmdTicketNew(global, parseTicketNewArgs(args.slice(1), fatal));
            return;
        case "assign":
            await cmdAssign(global, parseAssignArgs(args, fatal));
            return;
        case "reply":
            await cmdReply(global, parseReplyArgs(args, fatal));
            return;
        case "workflow":
            await cmdWorkflow(global, args);
            return;
        case "status":
            await cmdStatus(global);
            return;
        case "list-runs":
            await cmdListRuns(global);
            return;
        case "clean":
            await cmdClean(global, parseCleanArgs(args, fatal));
            return;
        default:
            fatal(`Unknown command: ${cmd}`);
    }
}

main().catch((err) => fatal(err.stack || err.message));
