// Engine adapters — Codex and Claude SDK bridging with retry and timeout

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log, fatal } from "./logger.mjs";
import { withRetry } from "./retry.mjs";
import { extractEstimate } from "./dag.mjs";

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

// ─── Timeout Configuration ───

const TIMEOUT_MAP = {
    S: 30 * 60 * 1000,
    M: 60 * 60 * 1000,
    L: 120 * 60 * 1000,
};

// ─── Token Budget Thresholds ───

const TOKEN_WARN_THRESHOLDS = {
    S: 500_000,
    M: 1_000_000,
    L: 2_000_000,
};

// ─── SDK Loading ───

/**
 * Lazy-load only the SDK engines actually needed.
 * @param {{needsCodex: boolean, needsClaude: boolean}} engineInfo
 * @param {boolean} dryRun
 * @returns {Promise<{codex: any, claude: any}>}
 */
export async function loadSdks(engineInfo, dryRun) {
    const sdks = { codex: null, claude: null };
    if (dryRun) return sdks;

    if (engineInfo.needsCodex) {
        try {
            const mod = await import("@openai/codex-sdk");
            sdks.codex = new mod.Codex();
        } catch (err) {
            fatal(
                `Cannot load @openai/codex-sdk: ${err.message}\n  Run: cd ${resolve(__dirname, "../..")} && npm install`,
            );
        }
    }
    if (engineInfo.needsClaude) {
        try {
            sdks.claude = await import("@anthropic-ai/claude-agent-sdk");
        } catch (err) {
            fatal(
                `Cannot load @anthropic-ai/claude-agent-sdk: ${err.message}\n  Run: cd ${resolve(__dirname, "../..")} && npm install`,
            );
        }
    }
    return sdks;
}

// ─── Event Formatting ───

function formatCodexEvent(event) {
    switch (event.type) {
        case "item.started":
            if (event.item.type === "command_execution")
                return { icon: "▶", text: `cmd: ${event.item.command}` };
            if (event.item.type === "file_change") {
                const f = event.item.changes
                    ?.map((c) => `${c.kind} ${c.path}`)
                    .join(", ");
                return f ? { icon: "✏", text: f } : null;
            }
            if (event.item.type === "agent_message")
                return { icon: "💬", text: event.item.text.slice(0, 150) };
            if (event.item.type === "reasoning")
                return { icon: "·", text: "reasoning..." };
            return null;
        case "item.completed":
            if (event.item.type === "command_execution")
                return { icon: "✓", text: `exit=${event.item.exit_code ?? "?"}` };
            if (event.item.type === "file_change")
                return { icon: "✓", text: `patch ${event.item.status}` };
            return null;
        case "turn.completed":
            return {
                icon: "▪",
                text: `tokens: in=${event.usage.input_tokens} cached=${event.usage.cached_input_tokens} out=${event.usage.output_tokens}`,
            };
        case "turn.failed":
            return { icon: "✗", text: event.error.message };
        default:
            return null;
    }
}

// ─── Task Dispatch ───

/**
 * Dispatch a single task with retry and timeout.
 * @param {object} sdks
 * @param {object} task
 * @param {object} config
 * @param {import('./store.mjs').StateStore} store
 * @returns {Promise<{taskId: number, success: boolean, threadId?: string, error?: string, dryRun?: boolean}>}
 */
export async function dispatchTask(sdks, task, config, store) {
    store.updateTask(task.id, { status: "running", startTime: Date.now() });
    log("INFO", `T${task.id}: ${task.file} [${task.engine}]`);

    if (config.dryRun) {
        const info =
            task.engine === "claude"
                ? `permissionMode="${CLAUDE_MODE_MAP[config.approvalMode]}"`
                : `approvalPolicy="${CODEX_MODE_MAP[config.approvalMode].approvalPolicy}"`;
        const estimate = extractEstimate(task.content);
        store.addTaskEvent(task.id, {
            ts: Date.now(),
            icon: "◇",
            text: `[dry-run] engine=${task.engine} ${info} timeout=${estimate}`,
        });
        await new Promise((r) => setTimeout(r, 200));
        store.updateTask(task.id, { status: "success", endTime: Date.now() });
        return { taskId: task.id, success: true, dryRun: true };
    }

    const estimate = extractEstimate(task.content);
    const timeout = TIMEOUT_MAP[estimate] || TIMEOUT_MAP.M;

    try {
        const result = await Promise.race([
            withRetry(
                async () => {
                    if (task.engine === "claude") {
                        return await runClaudeSession(sdks.claude, task, config, store, estimate);
                    }
                    return await runCodexSession(sdks.codex, task, config, store, estimate);
                },
                {
                    onRetry: (attempt, delay, err) => {
                        const delaySec = (delay / 1000).toFixed(1);
                        log(
                            "WARN",
                            `T${task.id} retry ${attempt}/3 in ${delaySec}s — ${err.message}`,
                        );
                        store.updateTask(task.id, {
                            retryCount: attempt,
                            status: "running",
                        });
                        store.addTaskEvent(task.id, {
                            ts: Date.now(),
                            icon: "🔄",
                            text: `retry ${attempt}/3 in ${delaySec}s: ${err.message.slice(0, 80)}`,
                        });
                    },
                },
            ),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error(`timeout after ${timeout / 60000}min (estimate=${estimate})`)),
                    timeout,
                ),
            ),
        ]);
        return result;
    } catch (err) {
        store.updateTask(task.id, {
            status: "failed",
            endTime: Date.now(),
            error: err.message,
        });
        store.addTaskEvent(task.id, {
            ts: Date.now(),
            icon: "✗",
            text: err.message,
        });
        log("ERROR", `T${task.id} failed: ${err.message}`);
        return { taskId: task.id, success: false, error: err.message };
    }
}

// ─── Codex Session ───

async function runCodexSession(codex, task, config, store, estimate) {
    const prompt = task.content;
    const sdkMode = CODEX_MODE_MAP[config.approvalMode];
    const thread = codex.startThread({
        approvalPolicy: sdkMode.approvalPolicy,
        sandboxMode: sdkMode.sandboxMode,
        workingDirectory: config.cwd,
    });

    let totalTokens = 0;
    const tokenThreshold = TOKEN_WARN_THRESHOLDS[estimate] || TOKEN_WARN_THRESHOLDS.M;
    let tokenWarned = false;

    const streamed = await thread.runStreamed(prompt);
    for await (const event of streamed.events) {
        const fmt = formatCodexEvent(event);
        if (fmt) {
            store.addTaskEvent(task.id, { ts: Date.now(), ...fmt });
            log("INFO", `  T${task.id} | ${fmt.icon} ${fmt.text}`);
        }
        if (event.type === "turn.completed") {
            const usage = {
                input: event.usage.input_tokens,
                cached: event.usage.cached_input_tokens,
                output: event.usage.output_tokens,
            };
            totalTokens = usage.input + usage.output;
            store.updateTask(task.id, { usage });

            if (!tokenWarned && totalTokens > tokenThreshold) {
                tokenWarned = true;
                log("WARN", `T${task.id} token budget exceeded: ${totalTokens} > ${tokenThreshold}`);
                store.addTaskEvent(task.id, {
                    ts: Date.now(),
                    icon: "⚠",
                    text: `token budget exceeded: ${totalTokens} > ${tokenThreshold}`,
                });
            }
        }
    }
    store.updateTask(task.id, {
        status: "success",
        endTime: Date.now(),
        threadId: thread.id,
    });
    log("INFO", `T${task.id} done`);
    return { taskId: task.id, success: true, threadId: thread.id };
}

// ─── Claude Session ───

async function runClaudeSession(sdk, task, config, store, estimate) {
    const prompt = task.content;
    const permissionMode =
        CLAUDE_MODE_MAP[config.approvalMode] || CLAUDE_MODE_MAP["full-auto"];

    let totalTokens = 0;
    const tokenThreshold = TOKEN_WARN_THRESHOLDS[estimate] || TOKEN_WARN_THRESHOLDS.M;
    let tokenWarned = false;

    const q = sdk.query({
        prompt,
        options: {
            cwd: config.cwd,
            permissionMode,
            systemPrompt: { type: "preset", preset: "claude_code" },
            disallowedTools: ["ToolSearch"],
            settingSources: ["user", "project"],
            maxTurns: 50,
        },
    });

    for await (const msg of q) {
        if (msg.type === "system" && msg.subtype === "init") {
            log(
                "INFO",
                `  T${task.id} | INIT model=${msg.model} tools=${msg.tools?.length || 0}`,
            );
            store.addTaskEvent(task.id, {
                ts: Date.now(),
                icon: "▶",
                text: `init model=${msg.model}`,
            });
        }
        if (msg.type === "assistant") {
            const textBlocks =
                msg.message.content?.filter((b) => b.type === "text") || [];
            const toolBlocks =
                msg.message.content?.filter((b) => b.type === "tool_use") || [];
            if (textBlocks.length > 0) {
                const preview = textBlocks
                    .map((b) => b.text)
                    .join(" ")
                    .slice(0, 100)
                    .replace(/\n/g, " ");
                log("INFO", `  T${task.id} | MSG ${preview}`);
                store.addTaskEvent(task.id, {
                    ts: Date.now(),
                    icon: "💬",
                    text: preview,
                });
            }
            for (const tb of toolBlocks) {
                const toolName = tb.name || "tool";
                const input =
                    typeof tb.input === "string"
                        ? tb.input.slice(0, 80)
                        : JSON.stringify(tb.input || {}).slice(0, 80);
                log("INFO", `  T${task.id} | RUN ${toolName}: ${input}`);
                store.addTaskEvent(task.id, {
                    ts: Date.now(),
                    icon: "▶",
                    text: `${toolName}: ${input}`,
                });
            }
        }
        if (msg.type === "result") {
            const usage = msg.usage || {};
            totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
            store.updateTask(task.id, {
                usage: {
                    input: usage.input_tokens || 0,
                    cached: 0,
                    output: usage.output_tokens || 0,
                },
            });
            log(
                "INFO",
                `  T${task.id} | tokens: in=${usage.input_tokens || 0} out=${usage.output_tokens || 0}`,
            );

            if (!tokenWarned && totalTokens > tokenThreshold) {
                tokenWarned = true;
                log("WARN", `T${task.id} token budget exceeded: ${totalTokens} > ${tokenThreshold}`);
                store.addTaskEvent(task.id, {
                    ts: Date.now(),
                    icon: "⚠",
                    text: `token budget exceeded: ${totalTokens} > ${tokenThreshold}`,
                });
            }
        }
    }

    store.updateTask(task.id, { status: "success", endTime: Date.now() });
    log("INFO", `T${task.id} done`);
    return { taskId: task.id, success: true };
}

// ─── Execution Strategies ───

/**
 * Pooled concurrency limiter.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<any>} fn
 */
async function pooled(items, limit, fn) {
    const results = [];
    const executing = new Set();
    for (const item of items) {
        const p = fn(item).then((r) => {
            executing.delete(p);
            return r;
        });
        executing.add(p);
        results.push(p);
        if (executing.size >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
}

/**
 * Run tasks sequentially, respecting DAG batch order.
 */
export async function runSequential(sdks, tasks, config, store) {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const batches = store.getState().dag.batches;
    const results = [];
    let failedId = null;

    for (const batch of batches) {
        for (const id of batch) {
            const task = taskMap.get(id);
            if (store.getState().tasks[id]?.status === "success") {
                log("INFO", `T${id} already completed (resumed) — skipping`);
                results.push({ taskId: id, success: true, resumed: true });
                continue;
            }
            if (failedId !== null) {
                store.updateTask(id, { status: "skipped" });
                log("SKIP", `T${id} skipped (upstream T${failedId} failed)`);
                results.push({ taskId: id, success: false, skipped: true });
                continue;
            }
            const result = await dispatchTask(sdks, task, config, store);
            results.push(result);
            if (!result.success && !result.dryRun) failedId = id;
        }
    }
    return results;
}

/**
 * Run tasks in parallel within batches, respecting DAG dependencies.
 */
export async function runParallel(sdks, tasks, config, store) {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const batches = store.getState().dag.batches;
    const results = [];
    const failedIds = new Set();

    for (const batch of batches) {
        const runnable = [];
        for (const id of batch) {
            if (store.getState().tasks[id]?.status === "success") {
                log("INFO", `T${id} already completed (resumed) — skipping`);
                results.push({ taskId: id, success: true, resumed: true });
                continue;
            }
            const task = taskMap.get(id);
            if (task.deps.some((d) => failedIds.has(d))) {
                store.updateTask(id, { status: "skipped" });
                log("SKIP", `T${id} skipped (upstream dependency failed)`);
                results.push({ taskId: id, success: false, skipped: true });
            } else {
                store.updateTask(id, { status: "queued" });
                runnable.push(task);
            }
        }
        const br = await pooled(runnable, config.concurrency, (t) =>
            dispatchTask(sdks, t, config, store),
        );
        for (const r of br) {
            results.push(r);
            if (!r.success && !r.dryRun) failedIds.add(r.taskId);
        }
    }
    return results;
}
