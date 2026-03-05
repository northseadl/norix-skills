// Engine adapters — Codex and Claude SDK bridging for SWE team roles

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log, fatal } from "./logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── SDK Mode Mappings ───

export const CODEX_MODE_MAP = {
    suggest: { approvalPolicy: "on-request", sandboxMode: "workspace-write" },
    "auto-edit": { approvalPolicy: "on-failure", sandboxMode: "workspace-write" },
    "full-auto": { approvalPolicy: "never", sandboxMode: "workspace-write" },
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
        sandboxMode: sdkMode.sandboxMode || sandboxMode,
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
        sandboxMode: sdkMode.sandboxMode || sandboxMode,
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
    let usage = null;

    const q = sdk.query({
        prompt,
        options: {
            cwd: workingDirectory,
            permissionMode,
            systemPrompt: { type: "preset", preset: "claude_code" },
            disallowedTools: ["ToolSearch"],
            settingSources: ["project"],
            maxTurns: 50,
        },
    });

    for await (const msg of q) {
        if (msg.type === "system" && msg.subtype === "init") {
            if (onEvent) onEvent({ kind: "init", text: `init model=${msg.model}` });
        }
        if (msg.type === "assistant") {
            const textBlocks = msg.message.content?.filter((b) => b.type === "text") || [];
            const toolBlocks = msg.message.content?.filter((b) => b.type === "tool_use") || [];
            if (textBlocks.length > 0) {
                const preview = textBlocks.map((b) => b.text).join(" ").slice(0, 200).replace(/\n/g, " ");
                if (onEvent) onEvent({ kind: "msg", text: preview });
            }
            for (const tb of toolBlocks) {
                const toolName = tb.name || "tool";
                const input = typeof tb.input === "string" ? tb.input.slice(0, 80) : JSON.stringify(tb.input || {}).slice(0, 80);
                if (onEvent) onEvent({ kind: "cmd", text: `${toolName}: ${input}` });
            }
        }
        if (msg.type === "result") {
            const u = msg.usage || {};
            usage = { input_tokens: u.input_tokens || 0, cached_input_tokens: 0, output_tokens: u.output_tokens || 0 };
            // Extract final response from result
            if (msg.result) {
                const textParts = Array.isArray(msg.result) ? msg.result.filter((b) => b.type === "text") : [];
                finalResponse = textParts.map((b) => b.text).join("\n") || "";
            }
            if (onEvent) {
                onEvent({
                    kind: "usage",
                    text: `tokens in=${u.input_tokens || 0} out=${u.output_tokens || 0}`,
                });
            }
        }
    }

    return { finalResponse, usage, threadId: null };
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

// ─── Status Parsing ───

export function parseTeamStatus(text) {
    if (!text) return null;
    const matches = text.match(/TEAM_STATUS\s*=\s*(DONE|BLOCKED|NEEDS_REVIEW|FAILED)/gi);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1];
    const v = last.split("=").pop().trim().toUpperCase();
    return v;
}
