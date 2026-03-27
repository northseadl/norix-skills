// Workshop — the main serve loop
// Hub is a DUMB PIPE. It does exactly 3 things:
//   1. Route messages (meeting room + DM HTTP API)
//   2. Report facts (agent session ended → post event)
//   3. Execute explicit agent commands (merge, wake, done)
//
// Hub does NOT:
//   - Infer intent from agent output
//   - Auto-assign tasks
//   - Auto-merge branches
//   - Auto-route messages based on content analysis
//   - Make any decisions

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, exec as execCb } from "node:child_process";

import { MeetingRoom } from "./meeting.mjs";
import { Board } from "./board.mjs";
import { wakeAgent, resumeAgent } from "./agents.mjs";
import { buildLeaderPrompt, buildWorkerPrompt, buildInspectorPrompt, buildResumePrompt } from "./prompts.mjs";
import { mergeRoleToIntegration, propagateToAllWorktrees, createIntegrationBranch, createIntegrationWorktree } from "./integration.mjs";
import { createRoleWorktrees, ensureGitRepo, revParse, appendWorktreeExcludePattern } from "./git_worktree.mjs";
import { loadSdks } from "./engines.mjs";
import { log } from "./logger.mjs";
import { writeTextAtomic } from "./atomic.mjs";

// ─── Main Serve Function ───

export async function serve(cwd, opts) {
    const {
        runId,
        goal,
        roles,         // ["leader", "worker:2", "inspector"]
        baseRef = "HEAD",
        engine = "codex",
        approvalMode = "full-auto",
        sandboxMode = "danger-full-access",
        port: requestedPort = 0,
        dryRun = false,
        maxPulses = 3,
    } = opts;

    await ensureGitRepo(cwd);
    const baseSha = await revParse(cwd, baseRef);

    // Expand role specs: "worker:2" → ["worker-1", "worker-2"]
    const expanded = expandRoles(roles);
    const workshopDir = join(cwd, ".workshop");

    const meeting = new MeetingRoom(workshopDir);
    const board = new Board(workshopDir);

    await meeting.init();
    await board.init(runId, goal);

    // Load engine SDK
    const engineInfo = { needsCodex: engine === "codex", needsClaude: engine === "claude" };
    const sdks = await loadSdks(engineInfo, dryRun);

    // Create integration branch + dedicated worktree for merge operations
    const worktreeRoot = join(cwd, ".workshop", "worktrees", runId);
    let integrationWorktreePath = null;
    if (!dryRun) {
        await createIntegrationBranch(cwd, runId, baseSha);
        log("INFO", `Integration branch: integration/${runId}`);
        integrationWorktreePath = await createIntegrationWorktree(cwd, runId, worktreeRoot);
    }

    // Create worktrees only for workers. Leader coordinates; inspector reviews integration output.
    const workerRoles = expanded.filter((r) => r.role === "worker");
    if (!dryRun && workerRoles.length > 0) {
        const wtResults = await createRoleWorktrees({
            cwd,
            runId,
            baseSha,
            roles: workerRoles.map((r) => r.name),
            worktreeRootAbs: worktreeRoot,
            dryRun: false,
        });

        // Register agents on board
        for (const r of workerRoles) {
            const wt = wtResults[r.name];
            await board.registerAgent(r.name, {
                role: r.role,
                worktreeRel: relative(cwd, wt.worktreePath),
                branch: wt.branch,
            });
            // Exclude workshop files from git tracking in worktrees
            await appendWorktreeExcludePattern(wt.worktreePath, ".workshop*");
            await appendWorktreeExcludePattern(wt.worktreePath, ".teamwork.py");

            // Pre-install dependencies
            if (existsSync(join(wt.worktreePath, "package.json"))) {
                try {
                    execSync("npm install --prefer-offline --no-audit 2>/dev/null", {
                        cwd: wt.worktreePath, timeout: 60_000,
                    });
                    log("INFO", `Deps installed for ${r.name}`);
                } catch { log("WARN", `Deps install failed for ${r.name} (non-fatal)`); }
            }
        }
    }

    // Register leader (no worktree — leader coordinates, doesn't code)
    const leaderRole = expanded.find((r) => r.role === "leader");
    const leaderName = leaderRole?.name || "leader";
    if (leaderRole) await board.registerAgent(leaderName, { role: "leader" });

    // Register inspectors without dedicated worktrees. They inspect the integration checkout.
    const inspectorRoles = expanded.filter((r) => r.role === "inspector");
    for (const inspector of inspectorRoles) {
        await board.registerAgent(inspector.name, { role: inspector.role });
    }

    // In dry-run, workers aren't registered via worktree creation — register them here
    if (dryRun) {
        for (const r of workerRoles) {
            await board.registerAgent(r.name, { role: r.role });
        }
    }

    await board.setPhase("running");

    // Build shared context
    const ctx = {
        cwd, runId, goal, baseSha, engine, approvalMode, sandboxMode, dryRun, maxPulses, sdks,
        meeting, board, integrationWorktreePath,
    };

    // ── @mention auto-wake callback ──
    // When a message @mentions an agent, inject new messages into their session.
    // This is mechanical routing, not a decision.
    // IMPORTANT: newMsgs is passed by meeting.post() — do NOT re-read from meeting
    // because cursor is already advanced at that point.
    meeting.onMention = (agentName, newMsgs, triggerMsg) => {
        if (agentName === "__all__") {
            // @all → wake all idle agents with new context
            for (const [name, a] of Object.entries(board.data.agents)) {
                if (a.status === "idle" && name !== triggerMsg.from) {
                    wakeAgentWithMeetingContext(ctx, name, newMsgs);
                }
            }
            return;
        }
        const agent = board.getAgent(agentName);
        if (!agent || agent.status === "running") return;
        log("INFO", `@${agentName} mentioned by ${triggerMsg.from} → auto-waking`);
        wakeAgentWithMeetingContext(ctx, agentName, newMsgs);
    };

    // ─── HTTP Server ───

    const server = createServer(async (req, resp) => {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;
        const cors = { "Access-Control-Allow-Origin": "*" };
        const noStore = { "Cache-Control": "no-store" };
        const json = { "Content-Type": "application/json; charset=utf-8" };

        // CORS preflight
        if (req.method === "OPTIONS") {
            resp.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
            resp.end();
            return;
        }

        try {
            // ── Meeting Room ──
            if (path === "/meeting" && req.method === "POST") {
                const body = await readBody(req);
                const { from, content } = body;
                if (!from || !content) return respond(resp, 400, { error: "from and content required" });
                const msg = await meeting.post(from, content);
                return respond(resp, 201, msg);
            }

            if (path === "/meeting" && req.method === "GET") {
                const since = parseInt(url.searchParams.get("since") || "0", 10);
                const all = await meeting.readAll();
                return respond(resp, 200, all.slice(since));
            }

            // ── DM (Private Pipe) ──
            if (path === "/dm" && req.method === "POST") {
                const body = await readBody(req);
                const { from, to, content } = body;
                if (!from || !to || !content) return respond(resp, 400, { error: "from, to, content required" });
                const msg = await meeting.sendDM(from, to, content);
                return respond(resp, 201, msg);
            }

            if (path === "/dm" && req.method === "GET") {
                const a = url.searchParams.get("a") || "";
                const b = url.searchParams.get("b") || "";
                if (!a || !b) return respond(resp, 400, { error: "a and b required" });
                const msgs = await meeting.readDMs(a, b);
                return respond(resp, 200, msgs);
            }

            // ── Board (Task Panel) ──
            if (path === "/board" && req.method === "GET") {
                const format = url.searchParams.get("format");
                if (format === "text") {
                    resp.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors, ...noStore });
                    resp.end(board.toBoardView());
                    return;
                }
                return respond(resp, 200, board.toJSON());
            }

            if (path === "/board/task" && req.method === "POST") {
                const body = await readBody(req);
                const { title, assignee } = body;
                if (!title) return respond(resp, 400, { error: "title required" });
                const task = await board.addTask(title, assignee || null);
                return respond(resp, 201, task);
            }

            // PATCH /board/task/:id
            if (path.startsWith("/board/task/") && req.method === "PATCH" && !path.endsWith("/complete") && !path.endsWith("/start")) {
                const taskId = parseInt(path.split("/").pop(), 10);
                if (isNaN(taskId)) return respond(resp, 400, { error: "invalid task id" });
                const body = await readBody(req);
                const updated = await board.updateTask(taskId, body);
                if (!updated) return respond(resp, 404, { error: "task not found" });
                return respond(resp, 200, updated);
            }

            // POST /board/task/:id/complete — marks task done + context compression
            if (path.match(/^\/board\/task\/\d+\/complete$/) && req.method === "POST") {
                const taskId = parseInt(path.split("/")[3], 10);
                const body = await readBody(req);
                const { summary = "" } = body;

                // Find the agent who owns this task
                const task = board.getTask(taskId);
                if (!task) return respond(resp, 404, { error: "task not found" });

                const agentName = task.assignee;
                if (!agentName) return respond(resp, 400, { error: "task has no assignee" });

                const currentTask = board.getCurrentTask(agentName);
                if (!currentTask || currentTask.id !== taskId) {
                    return respond(resp, 409, {
                        error: "task not current for agent",
                        currentTaskId: currentTask?.id || null,
                    });
                }

                const completed = await board.completeCurrentTask(agentName, taskId, summary);
                if (!completed) return respond(resp, 409, { error: "task not current for agent" });

                // Post completion event to meeting room
                await meeting.post(agentName, `任务 #${completed.id} "${completed.title}" 完成。摘要: ${summary}`);
                await meeting.postEvent(`${agentName} 完成任务 #${completed.id}，进入空闲，等待下一个任务`);

                return respond(resp, 200, { ok: true, task: completed });
            }

            // POST /board/task/:id/start — sets task as agent's current active task
            if (path.match(/^\/board\/task\/\d+\/start$/) && req.method === "POST") {
                const taskId = parseInt(path.split("/")[3], 10);
                const task = board.getTask(taskId);
                if (!task) return respond(resp, 404, { error: "task not found" });
                if (!task.assignee) return respond(resp, 400, { error: "task has no assignee" });

                const started = await board.startTask(task.assignee, taskId);
                if (!started) return respond(resp, 400, { error: "cannot start task" });

                return respond(resp, 200, { ok: true, task: started });
            }

            // ── Agent Commands (explicit, agent-initiated) ──

            // Wake an agent — send a prompt and start/resume their session
            if (path === "/wake" && req.method === "POST") {
                const body = await readBody(req);
                const { agent: agentName, prompt: customPrompt } = body;
                if (!agentName) return respond(resp, 400, { error: "agent required" });

                const agentInfo = board.getAgent(agentName);
                if (!agentInfo) return respond(resp, 404, { error: `agent ${agentName} not found` });
                if (agentInfo.status === "running") return respond(resp, 409, { error: `${agentName} already running` });

                const prompt = customPrompt
                    ? customPrompt.replace(/\$PORT/g, ctx.portStr || "")
                    : await buildFreshPromptForAgent(ctx, agentName);

                // Respond immediately, execute async
                respond(resp, 202, { ok: true, agent: agentName, action: "waking" });

                // Fire and forget — Hub just starts the session
                const agentCtx = { ...ctx };
                if (agentInfo.threadId) {
                    resumeAgent(agentCtx, agentName, prompt).catch((err) => {
                        log("ERROR", `resume ${agentName} failed: ${err.message}`);
                    });
                } else {
                    wakeAgent(agentCtx, agentName, prompt).catch((err) => {
                        log("ERROR", `wake ${agentName} failed: ${err.message}`);
                    });
                }
                return;
            }

            // Send a message to an agent (resume their thread with new context)
            if (path === "/send" && req.method === "POST") {
                const body = await readBody(req);
                const { agent: agentName, content } = body;
                if (!agentName || !content) return respond(resp, 400, { error: "agent and content required" });

                const agentInfo = board.getAgent(agentName);
                if (!agentInfo) return respond(resp, 404, { error: `agent ${agentName} not found` });
                if (agentInfo.status === "running") return respond(resp, 409, { error: `${agentName} is busy` });

                respond(resp, 202, { ok: true, agent: agentName, action: "sending" });

                if (agentInfo.threadId) {
                    const mtNew = await meeting.peekNew(agentName);
                    const dmNew = await meeting.readNewDMs(agentName, "leader");
                    const prompt = buildResumePrompt({
                        agentName,
                        meetingMessages: mtNew,
                        dmMessages: [...dmNew, { from: "direct", ts: new Date().toISOString(), content }],
                        board,
                    });

                    resumeAgent({ ...ctx }, agentName, prompt).catch((err) => {
                        log("ERROR", `send to ${agentName} failed: ${err.message}`);
                    });
                } else {
                    const prompt = await buildFreshPromptForAgent(ctx, agentName, { directMessage: content });
                    wakeAgent({ ...ctx }, agentName, prompt).catch((err) => {
                        log("ERROR", `send to ${agentName} failed: ${err.message}`);
                    });
                }
                return;
            }

            // Merge — explicitly triggered by an agent
            if (path === "/merge" && req.method === "POST") {
                const body = await readBody(req);
                const { agent: agentName } = body;
                if (!agentName) return respond(resp, 400, { error: "agent required" });

                const agentInfo = board.getAgent(agentName);
                if (!agentInfo || !agentInfo.branch) return respond(resp, 404, { error: `agent ${agentName} not found or no branch` });

                if (!ctx.integrationWorktreePath) return respond(resp, 500, { error: "integration worktree not initialized" });
                const result = await mergeRoleToIntegration(ctx.integrationWorktreePath, runId, agentName, agentInfo.branch);
                await board.recordMerge(agentName, result);

                if (result.success) {
                    await meeting.postEvent(`${agentName} 的工作已合并到 integration/${runId}`);
                    result.propagation = await propagateMergeToIdleAgents(ctx, agentName);
                } else {
                    await meeting.postEvent(`${agentName} 的合并失败: ${result.conflicted ? "冲突" : result.message}`);
                }

                return respond(resp, 200, result);
            }

            // Done — end the run
            if (path === "/done" && req.method === "POST") {
                await board.setPhase("completed");
                await meeting.postEvent("运行已完成");
                stopping = true;
                return respond(resp, 200, { ok: true, signal: "COMPLETED" });
            }

            // ── Status / Signal ──
            if (path === "/signal" && req.method === "GET") {
                const phase = board.data.phase;
                resp.writeHead(200, { "Content-Type": "text/plain", ...cors, ...noStore });
                resp.end(phase === "completed" ? "COMPLETED" : "RUNNING");
                return;
            }

            // ── Dashboard ──
            if (path === "/" || path === "/index.html") {
                // Priority: custom > bundled
                // Priority: custom dashboard in .workshop/ → inlined at build time
                const customPath = join(cwd, ".workshop", "dashboard.html");
                let dashContent;
                if (existsSync(customPath)) {
                    dashContent = await readFile(customPath, "utf-8");
                } else if (typeof __DASHBOARD_HTML__ !== "undefined") {
                    // Inlined by esbuild at build time — zero file dependency
                    dashContent = __DASHBOARD_HTML__;
                } else {
                    // Dev fallback: search relative to source file
                    const scriptDir = dirname(fileURLToPath(import.meta.url));
                    const candidates = [
                        join(scriptDir, "dashboard.html"),
                        join(scriptDir, "..", "dashboard.html"),
                        join(scriptDir, "..", "..", "dashboard.html"),
                    ];
                    const dashPath = candidates.find(p => existsSync(p));
                    if (!dashPath) {
                        respond(resp, 404, "text/plain", "dashboard.html not found");
                        return;
                    }
                    dashContent = await readFile(dashPath, "utf-8");
                }
                resp.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...noStore });
                resp.end(dashContent);
                return;
            }

            // ── SSE Events ──
            if (path === "/events") {
                resp.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive", ...cors, ...noStore });
                resp.flushHeaders();
                const snapshot = { type: "snapshot", board: board.toJSON() };
                resp.write(`data: ${JSON.stringify(snapshot)}\n\n`);
                const hb = setInterval(() => resp.write(": ping\n\n"), 15_000);
                // Poll for board changes
                let lastUpdate = board.data.updatedAt;
                const poll = setInterval(async () => {
                    await board.reload();
                    if (board.data.updatedAt !== lastUpdate) {
                        lastUpdate = board.data.updatedAt;
                        resp.write(`data: ${JSON.stringify({ type: "update", board: board.toJSON() })}\n\n`);
                    }
                }, 3_000);
                req.on("close", () => { clearInterval(hb); clearInterval(poll); });
                return;
            }

            resp.writeHead(404, { ...noStore });
            resp.end("Not Found");

        } catch (err) {
            log("ERROR", `HTTP ${path}: ${err.message}`);
            respond(resp, 500, { error: err.message });
        }
    });

    let stopping = false;

    const { port: actualPort } = await new Promise((res) => {
        server.listen(requestedPort, () => res({ port: server.address().port }));
    });

    const portStr = String(actualPort);

    // Save port file for agents to discover
    await writeTextAtomic(join(workshopDir, "port"), portStr);
    const dashUrl = `http://localhost:${actualPort}`;
    log("INFO", `Workshop Hub started: ${dashUrl}`);

    // Store port in ctx for @mention helper
    ctx.portStr = portStr;

    // Auto-open dashboard in browser
    execCb(`open "${dashUrl}"`, (err) => {
        if (err) log("WARN", `Could not auto-open browser: ${err.message}`);
    });

    // ── Auto-wake Leader ──
    if (goal && !dryRun) {
        const leaderAgent = board.getAgent(leaderName);
        if (leaderAgent) {
            log("INFO", `Waking Leader (${leaderName}) with goal: "${goal.slice(0, 80)}"`);
            const prompt = await buildFreshPromptForAgent(ctx, leaderName);
            wakeAgent(ctx, leaderName, prompt).catch((err) => {
                log("ERROR", `Leader wake failed: ${err.message}`);
            });
        }
    }

    // ── Main Loop ──
    // Just monitor. No automatic actions.
    const tick = setInterval(async () => {
        if (stopping) {
            clearInterval(tick);
            log("INFO", "Shutting down...");
            server.close();
            process.exit(0);
        }
        // Reload board from disk (in case agents wrote to it via HTTP)
        await board.reload();
    }, 5_000);

    // Graceful shutdown
    const shutdown = () => {
        stopping = true;
        clearInterval(tick);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep alive
    await new Promise(() => { });
}

// ─── @mention auto-wake helper ───

async function wakeAgentWithMeetingContext(ctx, agentName, meetingMsgs) {
    const { board, meeting } = ctx;
    const agentInfo = board.getAgent(agentName);
    if (!agentInfo || agentInfo.status === "running") return;

    if (agentInfo.threadId) {
        // Use messages passed directly from the onMention callback.
        // Do NOT call meeting.readNew() here — the cursor was already advanced
        // inside meeting.post() before the callback fired, so readNew() would
        // return an empty array and the agent would silently not wake.
        const wrapped = meeting.wrapMessages(meetingMsgs, { label: "会议室 @提及" });
        if (!wrapped) return;
        const prompt = `---\n${wrapped}\n\n继续你的工作。根据新消息决定下一步行动。\n---`;
        const promptWithPort = prompt.replace(/\$PORT/g, ctx.portStr || "");
        resumeAgent(ctx, agentName, promptWithPort).catch((err) => {
            log("ERROR", `@mention resume ${agentName} failed: ${err.message}`);
        });
    } else {
        const prompt = await buildFreshPromptForAgent(ctx, agentName);
        wakeAgent(ctx, agentName, prompt).catch((err) => {
            log("ERROR", `@mention wake ${agentName} failed: ${err.message}`);
        });
    }
}

async function buildFreshPromptForAgent(ctx, agentName, { directMessage = "" } = {}) {
    const { board, meeting, goal, cwd, runId, baseSha, integrationWorktreePath } = ctx;
    let agentInfo = board.getAgent(agentName);
    if (!agentInfo) throw new Error(`agent ${agentName} not found`);

    if (agentInfo.role === "worker") {
        await board.ensureCurrentTask(agentName);
        agentInfo = board.getAgent(agentName);
    }

    const meetingHistory = await meeting.readAll();
    let prompt;

    if (agentInfo.role === "leader") {
        prompt = buildLeaderPrompt({
            goal,
            board,
            meetingHistory,
            cwd,
            runId,
            agents: Object.entries(board.data.agents).map(([name, info]) => ({ name, ...info })),
        });
    } else if (agentInfo.role === "inspector") {
        prompt = await buildInspectorPrompt({
            board,
            meetingHistory,
            goal,
            cwd,
            runId,
            baseSha,
            integrationWorktreePath: integrationWorktreePath || cwd,
        });
    } else {
        const worktreePath = agentInfo.worktreeRel ? resolve(cwd, agentInfo.worktreeRel) : cwd;
        const dmHistory = await meeting.readDMs("leader", agentName);
        prompt = buildWorkerPrompt({
            agentName,
            board,
            meetingHistory,
            dmHistory,
            worktreePath,
            branch: agentInfo.branch,
            goal,
        });
    }

    prompt = prompt.replace(/\$PORT/g, ctx.portStr || "");
    if (directMessage) {
        prompt += `\n\n## 直接消息\n${directMessage}`;
    }
    return prompt;
}

async function propagateMergeToIdleAgents(ctx, mergedAgentName) {
    const { board, meeting, cwd, runId } = ctx;
    const state = collectRoleSyncState(board);
    const propagation = await propagateToAllWorktrees(cwd, runId, state, mergedAgentName);

    for (const sync of propagation) {
        const currentAgent = board.getAgent(sync.role);
        if (!currentAgent) continue;

        if (!sync.success) {
            await board.updateAgent(sync.role, {
                status: "blocked",
                lastError: sync.message,
            });
            await meeting.postEvent(
                `${sync.role} 与 integration/${runId} 同步失败，已标记 blocked: ${String(sync.message || "").slice(0, 200)}`,
            );
            continue;
        }

        if (currentAgent.status === "blocked") {
            await board.updateAgent(sync.role, { status: "idle", lastError: "" });
            await meeting.postEvent(`${sync.role} 已重新同步到 integration/${runId}，可继续工作`);
        }
    }

    return propagation;
}

function collectRoleSyncState(board) {
    const roles = {};
    for (const [name, agent] of Object.entries(board.data.agents)) {
        if (!agent.worktreeRel) continue;
        roles[name] = { worktreeRel: agent.worktreeRel, status: agent.status };
    }
    return { roles };
}

// ─── Helpers ───

async function readBody(req) {
    let body = "";
    for await (const chunk of req) body += chunk;
    try { return JSON.parse(body); } catch { return {}; }
}

function respond(resp, status, data) {
    resp.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
    });
    resp.end(JSON.stringify(data, null, 2));
}

// Pre-assigned human names — makes the team feel like real people.
// Git branch uses URL-encoded names; @mention regex supports CJK.
const WORKER_NAMES = [
    "晨曦", "瑞琪", "海洋", "明泽", "雨飞",
    "思语", "子涵", "骏豪", "天磊", "维林",
    "奕辰", "晓木", "凌风", "博雅", "清河",
    "涵宇", "泽凯", "若溪", "一鸣", "轩逸",
];
const LEADER_NAMES = ["大山"];
const INSPECTOR_NAMES = ["鹰眼"];

function expandRoles(specs) {
    const result = [];
    let workerIdx = 0;
    for (const spec of specs) {
        const [name, countStr] = spec.split(":");
        const count = parseInt(countStr || "1", 10);
        const role = name === "leader" ? "leader" : name === "inspector" ? "inspector" : "worker";

        if (role === "leader") {
            result.push({ name: LEADER_NAMES[0], role });
        } else if (role === "inspector") {
            result.push({ name: INSPECTOR_NAMES[0], role });
        } else if (count <= 1) {
            const humanName = WORKER_NAMES[workerIdx++ % WORKER_NAMES.length];
            result.push({ name: humanName, role });
        } else {
            for (let i = 0; i < count; i++) {
                const humanName = WORKER_NAMES[workerIdx++ % WORKER_NAMES.length];
                result.push({ name: humanName, role });
            }
        }
    }
    return result;
}
