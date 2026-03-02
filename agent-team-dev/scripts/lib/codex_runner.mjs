const CODEX_APPROVAL_MAP = {
    suggest: "on-request",
    "auto-edit": "on-failure",
    "full-auto": "never",
};

let _codex = null;

async function getCodex() {
    if (_codex) return _codex;
    const mod = await import("@openai/codex-sdk");
    _codex = new mod.Codex();
    return _codex;
}

export function approvalPolicyFor(mode) {
    return CODEX_APPROVAL_MAP[mode] || CODEX_APPROVAL_MAP["suggest"];
}

export async function startThread({ approvalMode, sandboxMode, workingDirectory }) {
    const codex = await getCodex();
    return codex.startThread({
        approvalPolicy: approvalPolicyFor(approvalMode),
        sandboxMode,
        workingDirectory,
    });
}

export async function resumeThread({ threadId, approvalMode, sandboxMode, workingDirectory }) {
    const codex = await getCodex();
    return codex.resumeThread(threadId, {
        approvalPolicy: approvalPolicyFor(approvalMode),
        sandboxMode,
        workingDirectory,
    });
}

export async function runTurnStreamed(thread, prompt, { onEvent } = {}) {
    const { events } = await thread.runStreamed(prompt);
    let finalResponse = "";
    let usage = null;
    let failure = null;

    for await (const event of events) {
        if (onEvent) onEvent(event);

        if (event.type === "item.completed" && event.item?.type === "agent_message") {
            finalResponse = event.item.text || "";
        }
        if (event.type === "turn.completed") {
            usage = event.usage || null;
        }
        if (event.type === "turn.failed") {
            failure = event.error?.message || "turn.failed";
        }
    }

    if (failure) throw new Error(failure);
    return { finalResponse, usage, threadId: thread.id };
}

export function parseTeamStatus(text) {
    if (!text) return null;
    const matches = text.match(/TEAM_STATUS\\s*=\\s*(DONE|BLOCKED|NEEDS_REVIEW|FAILED)/gi);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1];
    const v = last.split("=").pop().trim().toUpperCase();
    return v;
}

export function formatCodexEvent(event) {
    if (!event || !event.type) return null;
    if (event.type === "item.started") {
        if (event.item?.type === "command_execution") {
            return { kind: "cmd", text: `cmd: ${String(event.item.command || "").slice(0, 200)}` };
        }
        if (event.item?.type === "file_change") {
            const files =
                event.item.changes?.map((c) => `${c.kind} ${c.path}`).join(", ") || "file_change";
            return { kind: "file", text: files.slice(0, 200) };
        }
        if (event.item?.type === "agent_message") {
            const preview = String(event.item.text || "").replace(/\\n/g, " ").slice(0, 200);
            return { kind: "msg", text: preview };
        }
        return null;
    }
    if (event.type === "item.completed") {
        if (event.item?.type === "command_execution") {
            return {
                kind: "cmd_result",
                text: `cmd exit=${event.item.exit_code ?? "?"}`,
            };
        }
        if (event.item?.type === "file_change") {
            return { kind: "file_result", text: `file_change ${event.item.status || ""}`.trim() };
        }
        return null;
    }
    if (event.type === "turn.completed") {
        const u = event.usage || {};
        return {
            kind: "usage",
            text: `tokens in=${u.input_tokens ?? 0} cached=${u.cached_input_tokens ?? 0} out=${u.output_tokens ?? 0}`,
        };
    }
    if (event.type === "turn.failed") {
        return { kind: "error", text: String(event.error?.message || "turn.failed").slice(0, 200) };
    }
    return null;
}

