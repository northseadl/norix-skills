// Engine adapters — Codex and Claude SDK bridging for SWE team roles

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { log, fatal } from "./logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve codex binary from system PATH.
 * This decouples the bundle from node_modules — no npm install required
 * as long as `codex` is globally installed.
 */
function resolveCodexBinary() {
    const name = process.platform === "win32" ? "codex.exe" : "codex";
    const cmd = process.platform === "win32" ? "where" : "which";
    try {
        return execFileSync(cmd, [name], {
            encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
        }).trim().split("\n")[0];
    } catch {
        return null;
    }
}

// ─── SDK Mode Mappings ───

export const CODEX_MODE_MAP = {
    suggest: { approvalPolicy: "on-request" },
    "auto-edit": { approvalPolicy: "on-failure" },
    "full-auto": { approvalPolicy: "never" },
};

export const CLAUDE_MODE_MAP = {
    suggest: "default",
    "auto-edit": "acceptEdits",
    "full-auto": "bypassPermissions",
};

// ─── Lazy SDK Loading ───

const _sdkCache = { codex: null, claude: null, opencode: null };

export async function loadSdks({ needsCodex, needsClaude, needsOpencode }, dryRun) {
    const sdks = { codex: null, claude: null, opencode: null };
    if (dryRun) return sdks;

    if (needsCodex && !_sdkCache.codex) {
        try {
            const mod = await import("@openai/codex-sdk");
            const codexPathOverride = resolveCodexBinary();
            _sdkCache.codex = new mod.Codex(codexPathOverride ? { codexPathOverride } : {});
        } catch (err) {
            const pathBin = resolveCodexBinary();
            if (pathBin) {
                fatal(
                    `Codex binary found at ${pathBin} but SDK failed to load: ${err.message}`,
                );
            }
            fatal(
                `Cannot load @openai/codex-sdk: ${err.message}\n  Install: npm install -g @openai/codex`,
            );
        }
    }
    if (needsClaude && !_sdkCache.claude) {
        try {
            _sdkCache.claude = await import("@anthropic-ai/claude-agent-sdk");
        } catch (err) {
            fatal(
                `Cannot load @anthropic-ai/claude-agent-sdk: ${err.message}\n  Run: cd ${resolve(__dirname, "../..")} && npm install`,
            );
        }
    }
    if (needsOpencode && !_sdkCache.opencode) {
        try {
            const mod = await import("@opencode-ai/sdk");
            // Connect to existing OpenCode server — do NOT start a new one.
            // createOpencode() spawns a server and conflicts if OpenCode is already running.
            const baseUrl = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
            const client = mod.createOpencodeClient({ baseUrl });
            // Verify connectivity
            await client.session.list();
            _sdkCache.opencode = client;
            log("INFO", `OpenCode client connected to ${baseUrl}`);
        } catch (err) {
            fatal(
                `Cannot connect to OpenCode: ${err.message}\n  Ensure OpenCode is running (opencode) and accessible at ${process.env.OPENCODE_URL || "http://127.0.0.1:4096"}`,
            );
        }
    }
    sdks.codex = _sdkCache.codex;
    sdks.claude = _sdkCache.claude;
    sdks.opencode = _sdkCache.opencode;
    return sdks;
}

// ─── Codex Session ───

export async function runCodexSession(codex, prompt, { approvalMode, sandboxMode, workingDirectory, onEvent }) {
    const sdkMode = CODEX_MODE_MAP[approvalMode] || CODEX_MODE_MAP["suggest"];
    const thread = codex.startThread({
        approvalPolicy: sdkMode.approvalPolicy,
        sandboxMode: sandboxMode || "danger-full-access",
        workingDirectory,
    });

    let finalResponse = "";
    let usage = null;

    const streamed = await thread.runStreamed(prompt);
    for await (const event of streamed.events) {
        const fmt = formatCodexEvent(event);
        if (fmt && onEvent) onEvent(fmt);

        if (event.type === "item.completed" && event.item?.type === "agent_message") {
            finalResponse = event.item.text || "";
        }
        if (event.type === "turn.completed") {
            usage = event.usage || null;
        }
        if (event.type === "turn.failed") {
            throw new Error(event.error?.message || "turn.failed");
        }
    }

    return { finalResponse, usage, threadId: thread.id };
}

export async function resumeCodexSession(codex, threadId, prompt, { approvalMode, sandboxMode, workingDirectory, onEvent }) {
    const sdkMode = CODEX_MODE_MAP[approvalMode] || CODEX_MODE_MAP["suggest"];
    const thread = codex.resumeThread(threadId, {
        approvalPolicy: sdkMode.approvalPolicy,
        sandboxMode: sandboxMode || "danger-full-access",
        workingDirectory,
    });

    let finalResponse = "";
    let usage = null;

    const streamed = await thread.runStreamed(prompt);
    for await (const event of streamed.events) {
        const fmt = formatCodexEvent(event);
        if (fmt && onEvent) onEvent(fmt);

        if (event.type === "item.completed" && event.item?.type === "agent_message") {
            finalResponse = event.item.text || "";
        }
        if (event.type === "turn.completed") {
            usage = event.usage || null;
        }
        if (event.type === "turn.failed") {
            throw new Error(event.error?.message || "turn.failed");
        }
    }

    return { finalResponse, usage, threadId: thread.id };
}

// ─── Claude Session ───

export async function runClaudeSession(sdk, prompt, { approvalMode, workingDirectory, onEvent }) {
    const permissionMode = CLAUDE_MODE_MAP[approvalMode] || CLAUDE_MODE_MAP["full-auto"];

    let finalResponse = "";
    let accumulatedText = ""; // Safety net: accumulate text from streaming assistant messages
    let usage = null;

    const opts = {
        cwd: workingDirectory,
        permissionMode,
        systemPrompt: { type: "preset", preset: "claude_code" },
        disallowedTools: ["ToolSearch"],
        settingSources: ["user", "project"],
        maxTurns: 50,
    };

    // bypassPermissions requires this safety flag
    if (permissionMode === "bypassPermissions") {
        opts.allowDangerouslySkipPermissions = true;
    }

    const q = sdk.query({ prompt, options: opts });
    let sessionId = null;

    for await (const msg of q) {
        // Capture session_id for potential resume
        if (msg.session_id && !sessionId) sessionId = msg.session_id;

        if (msg.type === "system" && msg.subtype === "init") {
            if (onEvent) onEvent({ kind: "init", text: `init model=${msg.model}` });
        }
        if (msg.type === "assistant") {
            // Check for API-level errors (auth, billing, rate limit)
            if (msg.error) {
                if (onEvent) onEvent({ kind: "error", text: `API error: ${msg.error}` });
                if (msg.error === "authentication_failed" || msg.error === "billing_error") {
                    throw new Error(`Claude API error: ${msg.error}`);
                }
                // rate_limit, server_error — log but don't throw (SDK may retry)
            }
            const textBlocks = msg.message?.content?.filter((b) => b.type === "text") || [];
            const toolBlocks = msg.message?.content?.filter((b) => b.type === "tool_use") || [];
            if (textBlocks.length > 0) {
                const text = textBlocks.map((b) => b.text).join(" ");
                accumulatedText += text + "\n";
                if (onEvent) onEvent({ kind: "msg", text: text.slice(0, 200).replace(/\n/g, " ") });
            }
            for (const tb of toolBlocks) {
                const toolName = tb.name || "tool";
                const input = typeof tb.input === "string" ? tb.input.slice(0, 80) : JSON.stringify(tb.input || {}).slice(0, 80);
                if (onEvent) onEvent({ kind: "cmd", text: `${toolName}: ${input}` });
            }
        }
        if (msg.type === "result") {
            // Check for error results (max_turns, execution errors)
            if (msg.is_error) {
                const errors = msg.errors?.join("; ") || msg.subtype || "unknown error";
                if (onEvent) onEvent({ kind: "error", text: `Session error: ${errors}` });
                // Still try to extract any partial response from accumulated text
                if (accumulatedText.trim()) {
                    finalResponse = accumulatedText.trim();
                }
                break;
            }
            const u = msg.usage || {};
            usage = { input_tokens: u.input_tokens || 0, cached_input_tokens: u.cache_read_input_tokens || 0, output_tokens: u.output_tokens || 0 };
            // Extract final response: SDK returns string (not Array)
            if (msg.result) {
                if (typeof msg.result === "string") {
                    finalResponse = msg.result;
                } else if (Array.isArray(msg.result)) {
                    // Legacy/future-proof: handle array format
                    const textParts = msg.result.filter((b) => b.type === "text");
                    finalResponse = textParts.map((b) => b.text).join("\n") || "";
                }
            }
            // Fallback: if result extraction failed, use accumulated text
            if (!finalResponse && accumulatedText.trim()) {
                finalResponse = accumulatedText.trim();
            }
            if (onEvent) {
                onEvent({
                    kind: "usage",
                    text: `tokens in=${u.input_tokens || 0} cached=${u.cache_read_input_tokens || 0} out=${u.output_tokens || 0}`,
                });
            }
        }
    }

    return { finalResponse, usage, threadId: sessionId };
}

// Note: Claude does not support thread resume in the same way as Codex.
// For BLOCKED→Reply, we start a new session with the full context.
export async function resumeClaudeSession(sdk, _threadId, prompt, opts) {
    return runClaudeSession(sdk, prompt, opts);
}

// ─── OpenCode Session ───
// Architecture notes (verified empirically):
//   - prompt() (sync) returns after the FIRST step — does NOT wait for the full agentic loop
//   - promptAsync() triggers inference + tool execution correctly
//   - session.status() is broken (always returns {})
//   - Completion signal: poll messages() until last assistant message has info.finish === "stop"
//   - Multi-step sessions produce multiple assistant messages (finish: "tool-calls" → ... → "stop")

export async function runOpencodeSession(client, prompt, { workingDirectory, onEvent }) {
    if (onEvent) onEvent({ kind: "init", text: `init model=opencode` });

    const sessionRes = await client.session.create({ query: { directory: workingDirectory } });
    if (sessionRes.error) throw new Error("OpenCode session.create failed: " + JSON.stringify(sessionRes.error));
    const sessionId = sessionRes.data.id;
    log("INFO", `OpenCode session created: ${sessionId}`);

    return _executeOpencodePrompt(client, sessionId, prompt, workingDirectory, onEvent);
}

export async function resumeOpencodeSession(client, threadId, prompt, { workingDirectory, onEvent }) {
    if (onEvent) onEvent({ kind: "init", text: `resume opencode session=${threadId.slice(0, 20)}` });
    return _executeOpencodePrompt(client, threadId, prompt, workingDirectory, onEvent);
}

const OPENCODE_POLL_INTERVAL = 3_000;  // 3s between polls
const OPENCODE_TIMEOUT = 10 * 60_000;  // 10 min max per prompt

async function _executeOpencodePrompt(client, sessionId, prompt, workingDirectory, onEvent) {
    // Fire promptAsync — triggers inference + tool execution
    const res = await client.session.promptAsync({
        path: { id: sessionId },
        query: { directory: workingDirectory },
        body: { parts: [{ type: "text", text: prompt }] },
    });
    if (res.error) throw new Error("OpenCode promptAsync failed: " + JSON.stringify(res.error));

    // Poll messages until the agentic loop completes (last assistant finish === "stop")
    const start = Date.now();
    let lastReportedMsgCount = 0;

    while (Date.now() - start < OPENCODE_TIMEOUT) {
        await new Promise(r => setTimeout(r, OPENCODE_POLL_INTERVAL));

        let msgs;
        try {
            const msgsRes = await client.session.messages({ path: { id: sessionId } });
            msgs = msgsRes.data || [];
        } catch {
            continue; // transient error, retry
        }

        // Report new tool activity to the event log
        if (onEvent && msgs.length > lastReportedMsgCount) {
            for (const msg of msgs.slice(lastReportedMsgCount)) {
                if (msg.info?.role !== "assistant") continue;
                for (const p of (msg.parts || [])) {
                    if (p.type === "tool" && p.state?.status === "completed") {
                        const toolName = p.tool || "tool";
                        const input = JSON.stringify(p.state?.input || {}).slice(0, 100);
                        onEvent({ kind: "cmd", text: `${toolName}: ${input}` });
                    }
                    if (p.type === "text" && p.text) {
                        onEvent({ kind: "msg", text: p.text.slice(0, 200).replace(/\n/g, " ") });
                    }
                }
            }
            lastReportedMsgCount = msgs.length;
        }

        // Check if the last assistant message has finish === "stop"
        const assistantMsgs = msgs.filter(m => m.info?.role === "assistant");
        if (assistantMsgs.length === 0) continue;

        const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
        if (lastAssistant.info?.finish === "stop") {
            // Agentic loop complete — extract final response from ALL assistant messages
            let finalResponse = "";
            const totalUsage = { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 };

            for (const msg of assistantMsgs) {
                const parts = msg.parts || [];
                // Primary: non-empty text parts
                const textParts = parts.filter(p => p.type === "text" && p.text);
                if (textParts.length > 0) {
                    finalResponse += textParts.map(p => p.text).join("\n") + "\n";
                } else {
                    // Fallback: reasoning parts (model often puts responses here)
                    const reasoning = parts.filter(p => p.type === "reasoning" && p.text);
                    if (reasoning.length > 0) {
                        finalResponse += reasoning.map(p => p.text).join("\n") + "\n";
                    }
                }
                const tokens = msg.info?.tokens || {};
                totalUsage.input_tokens += tokens.input || 0;
                totalUsage.output_tokens += tokens.output || 0;
                totalUsage.cached_input_tokens += tokens.cache?.read || 0;
            }

            finalResponse = finalResponse.trim();

            if (onEvent) {
                onEvent({ kind: "usage", text: `tokens in=${totalUsage.input_tokens} cached=${totalUsage.cached_input_tokens} out=${totalUsage.output_tokens}` });
            }

            log("INFO", `OpenCode session ${sessionId} completed: ${assistantMsgs.length} steps, ${totalUsage.output_tokens} output tokens`);
            return { finalResponse, usage: totalUsage, threadId: sessionId };
        }
    }

    // Timeout — extract whatever we have
    log("WARN", `OpenCode session ${sessionId} timed out after ${OPENCODE_TIMEOUT / 1000}s`);
    const msgsRes = await client.session.messages({ path: { id: sessionId } });
    const msgs = msgsRes.data || [];
    const assistantMsgs = msgs.filter(m => m.info?.role === "assistant");
    let finalResponse = "";
    for (const msg of assistantMsgs) {
        const parts = msg.parts || [];
        const textParts = parts.filter(p => p.type === "text" && p.text);
        if (textParts.length > 0) {
            finalResponse += textParts.map(p => p.text).join("\n") + "\n";
        } else {
            const reasoning = parts.filter(p => p.type === "reasoning" && p.text);
            if (reasoning.length > 0) finalResponse += reasoning.map(p => p.text).join("\n") + "\n";
        }
    }
    return { finalResponse: finalResponse.trim(), usage: { input_tokens: 0, output_tokens: 0 }, threadId: sessionId };
}

// ─── Event Formatting ───

function formatCodexEvent(event) {
    if (!event || !event.type) return null;
    switch (event.type) {
        case "item.started":
            if (event.item?.type === "command_execution") {
                return { kind: "cmd", text: `cmd: ${String(event.item.command || "").slice(0, 200)}` };
            }
            if (event.item?.type === "file_change") {
                const files =
                    event.item.changes?.map((c) => `${c.kind} ${c.path}`).join(", ") || "file_change";
                return { kind: "file", text: files.slice(0, 200) };
            }
            if (event.item?.type === "agent_message") {
                const preview = String(event.item.text || "").replace(/\n/g, " ").slice(0, 200);
                return { kind: "msg", text: preview };
            }
            return null;
        case "item.completed":
            if (event.item?.type === "command_execution") {
                return { kind: "cmd_result", text: `cmd exit=${event.item.exit_code ?? "?"}` };
            }
            if (event.item?.type === "file_change") {
                return { kind: "file_result", text: `file_change ${event.item.status || ""}`.trim() };
            }
            return null;
        case "turn.completed": {
            const u = event.usage || {};
            return {
                kind: "usage",
                text: `tokens in=${u.input_tokens ?? 0} cached=${u.cached_input_tokens ?? 0} out=${u.output_tokens ?? 0}`,
            };
        }
        case "turn.failed":
            return { kind: "error", text: String(event.error?.message || "turn.failed").slice(0, 200) };
        default:
            return null;
    }
}

