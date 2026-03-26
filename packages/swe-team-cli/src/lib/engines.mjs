// Engine adapters — Codex and Claude SDK bridging for SWE team roles

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log, fatal } from "./logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const _sdkCache = { codex: null, claude: null };

export async function loadSdks({ needsCodex, needsClaude }, dryRun) {
    const sdks = { codex: null, claude: null };
    if (dryRun) return sdks;

    if (needsCodex && !_sdkCache.codex) {
        try {
            const mod = await import("@openai/codex-sdk");
            _sdkCache.codex = new mod.Codex();
        } catch (err) {
            fatal(
                `Cannot load @openai/codex-sdk: ${err.message}\n  Run: cd ${resolve(__dirname, "../..")} && npm install`,
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
    sdks.codex = _sdkCache.codex;
    sdks.claude = _sdkCache.claude;
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

