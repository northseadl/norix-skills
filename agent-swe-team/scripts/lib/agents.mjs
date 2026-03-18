// Agents — session execution engine
// Handles starting, resuming, and renewing agent sessions.
// Hub calls these functions. ALL decisions come from agents, not from here.
//
// Key lifecycle:
//   1. wake(agent, prompt) → start new session
//   2. resume(agent, prompt) → continue existing thread
//   3. onSessionEnd → capture output, update board, notify meeting room
//
// Hub does NOT infer intent or auto-assign. It only:
//   - Captures agent output → posts to meeting room
//   - Detects session ended → posts factual event to meeting room
//   - Updates board agent status (running → idle)

import { existsSync } from "node:fs";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    runCodexSession, resumeCodexSession,
    runClaudeSession, resumeClaudeSession,
} from "./engines.mjs";
import { log } from "./logger.mjs";
import { writeTextAtomic } from "./atomic.mjs";

// ─── Session Execution ───

/**
 * Wake an agent with an initial prompt. Starts a new engine session.
 * Returns the agent output and session metadata.
 */
export async function wakeAgent(ctx, agentName, prompt) {
    const { board, meeting } = ctx;
    const agent = board.getAgent(agentName);
    if (!agent) throw new Error(`Agent not found: ${agentName}`);

    const workingDirectory = agent.worktreeRel
        ? resolve(ctx.cwd, agent.worktreeRel)
        : ctx.cwd;

    await board.updateAgent(agentName, { status: "running" });

    const logPath = join(ctx.cwd, ".workshop", "logs", `${agentName}.log`);
    await mkdir(join(ctx.cwd, ".workshop", "logs"), { recursive: true });

    const onEvent = (fmt) => {
        const line = `[${new Date().toISOString()}] ${fmt.kind} ${fmt.text}\n`;
        appendFile(logPath, line, "utf-8").catch(() => { });
    };

    const engineOpts = {
        approvalMode: ctx.approvalMode,
        sandboxMode: ctx.sandboxMode,
        workingDirectory,
        onEvent,
    };

    let result;
    try {
        const sdk = ctx.engine === "claude" ? ctx.sdks.claude : ctx.sdks.codex;
        const runFn = ctx.engine === "claude" ? runClaudeSession : runCodexSession;
        result = await runFn(sdk, prompt, engineOpts);
    } catch (err) {
        const msg = err.message || String(err);
        log("ERROR", `${agentName}: session failed — ${msg}`);
        await board.updateAgent(agentName, { status: "idle", lastError: msg });
        await meeting.postEvent(`${agentName} 的会话异常终止: ${msg.slice(0, 200)}`);
        return { ok: false, error: msg };
    }

    // Session ended — capture output and update state
    const output = result.finalResponse || "";
    const threadId = result.threadId || null;

    // Update board
    await board.updateAgent(agentName, {
        status: "idle",
        threadId,
        lastOutput: output.slice(0, 2000),
    });


    // Post factual idle event — Hub does NOT decide what to do about it.
    // Leader will see this and decide.
    await meeting.postEvent(`${agentName} 的会话结束，进入空闲状态`);

    // Write full output to report file
    const reportPath = join(ctx.cwd, ".workshop", "reports", `${agentName}-${Date.now()}.md`);
    await mkdir(join(ctx.cwd, ".workshop", "reports"), { recursive: true });
    await writeTextAtomic(reportPath, `# ${agentName} Report\n\n${output}\n`);

    log("INFO", `${agentName}: session ended, status=idle, threadId=${threadId ? "yes" : "none"}`);

    return { ok: true, output, threadId, usage: result.usage };
}

/**
 * Resume an agent's existing thread with a new prompt.
 * Used for: Leader sending DMs, meeting room updates, etc.
 */
export async function resumeAgent(ctx, agentName, prompt) {
    const { board, meeting } = ctx;
    const agent = board.getAgent(agentName);
    if (!agent) throw new Error(`Agent not found: ${agentName}`);

    const workingDirectory = agent.worktreeRel
        ? resolve(ctx.cwd, agent.worktreeRel)
        : ctx.cwd;

    await board.updateAgent(agentName, { status: "running" });

    const logPath = join(ctx.cwd, ".workshop", "logs", `${agentName}.log`);
    const onEvent = (fmt) => {
        const line = `[${new Date().toISOString()}] ${fmt.kind} ${fmt.text}\n`;
        appendFile(logPath, line, "utf-8").catch(() => { });
    };

    const engineOpts = {
        approvalMode: ctx.approvalMode,
        sandboxMode: ctx.sandboxMode,
        workingDirectory,
        onEvent,
    };

    let result;
    try {
        const sdk = ctx.engine === "claude" ? ctx.sdks.claude : ctx.sdks.codex;
        const threadId = agent.threadId;

        if (threadId && ctx.engine === "codex") {
            result = await resumeCodexSession(sdk, threadId, prompt, engineOpts);
        } else {
            // Claude doesn't support thread resume; start new session with context
            const runFn = ctx.engine === "claude" ? runClaudeSession : runCodexSession;
            result = await runFn(sdk, prompt, engineOpts);
        }
    } catch (err) {
        const msg = err.message || String(err);
        log("ERROR", `${agentName}: resume failed — ${msg}`);
        await board.updateAgent(agentName, { status: "idle", lastError: msg });
        await meeting.postEvent(`${agentName} 的会话异常终止: ${msg.slice(0, 200)}`);
        return { ok: false, error: msg };
    }

    const output = result.finalResponse || "";
    const threadId = result.threadId || null;

    await board.updateAgent(agentName, {
        status: "idle",
        threadId,
        lastOutput: output.slice(0, 2000),
    });


    await meeting.postEvent(`${agentName} 的会话结束，进入空闲状态`);

    const reportPath = join(ctx.cwd, ".workshop", "reports", `${agentName}-${Date.now()}.md`);
    await writeTextAtomic(reportPath, `# ${agentName} Report\n\n${output}\n`);

    log("INFO", `${agentName}: resume ended, status=idle`);

    return { ok: true, output, threadId, usage: result.usage };
}

