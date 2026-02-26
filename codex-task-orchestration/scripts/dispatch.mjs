#!/usr/bin/env node

// Codex Orchestrator — 本地编排服务 + 实时 Dashboard
// Usage: node dispatch.mjs <task-dir> [options]

import { createServer, request as httpRequest } from "node:http";
import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { join, basename, dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { exec } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Constants ───

const VALID_MODES = ["suggest", "auto-edit", "full-auto"];
const MODE_TO_SDK = {
  suggest: { approvalPolicy: "on-request", sandboxMode: "workspace-write" },
  "auto-edit": { approvalPolicy: "on-failure", sandboxMode: "workspace-write" },
  "full-auto": { approvalPolicy: "never", sandboxMode: "workspace-write" },
};

function generateRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ─── Logging ───

function log(level, ...args) {
  const time = new Date().toTimeString().slice(0, 8);
  const prefix = `[${time}] [${level}]`;
  if (level === "ERROR" || level === "FATAL") {
    console.error(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

function fatal(msg) {
  log("FATAL", msg);
  process.exit(1);
}

// ─── CLI Parsing ───

function parseArgs(argv) {
  const config = {
    taskDir: "",
    dryRun: false,
    parallel: false,
    approvalMode: "suggest",
    concurrency: 4,
    cwd: process.cwd(),
    port: 0,
    noOpen: false,
    clean: false,
    cleanKeep: 0,
    list: false,
    status: false,
    statusRunId: "",
  };

  let i = 2;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--dry-run":
        config.dryRun = true;
        i++;
        break;
      case "--parallel":
        config.parallel = true;
        i++;
        break;
      case "--approval-mode":
        if (i + 1 >= argv.length) fatal("--approval-mode requires a value");
        config.approvalMode = argv[++i];
        i++;
        break;
      case "--concurrency":
        if (i + 1 >= argv.length) fatal("--concurrency requires a value");
        config.concurrency = parseInt(argv[++i], 10);
        i++;
        break;
      case "--cwd":
        if (i + 1 >= argv.length) fatal("--cwd requires a value");
        config.cwd = resolve(argv[++i]);
        i++;
        break;
      case "--port":
        if (i + 1 >= argv.length) fatal("--port requires a value");
        config.port = parseInt(argv[++i], 10);
        i++;
        break;
      case "--no-open":
        config.noOpen = true;
        i++;
        break;
      case "--clean":
        config.clean = true;
        if (i + 1 < argv.length && /^\d+$/.test(argv[i + 1])) {
          config.cleanKeep = parseInt(argv[++i], 10);
        }
        i++;
        break;
      case "--list":
        config.list = true;
        i++;
        break;
      case "--status":
        config.status = true;
        if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
          config.statusRunId = argv[++i];
        }
        i++;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      default:
        if (argv[i].startsWith("-")) fatal(`未知选项: ${argv[i]}`);
        config.taskDir = argv[i];
        i++;
    }
  }
  return config;
}

function printUsage() {
  console.log(`
Codex Orchestrator — 本地任务编排服务 + 实时监控面板

用法: node dispatch.mjs <task-dir> [选项]

参数:
  task-dir                包含任务规格文件 (T*.md) 的目录

选项:
  --dry-run               预览执行计划，不实际调度
  --parallel              并行执行无依赖的任务 (默认: 顺序)
  --approval-mode MODE    suggest|auto-edit|full-auto (默认: suggest)
  --concurrency N         最大并行 Codex 会话数 (默认: 4)
  --cwd DIR               Codex Agent 的工作目录 (默认: 当前目录)
  --port PORT             Dashboard 端口 (默认: 随机)
  --no-open               不自动打开浏览器

监督:
  --status [RUN-ID]       查询运行状态 (默认: 最近一次)

管理:
  --list                  列出所有历史运行记录
  --clean [N]             清理历史记录 (保留最近 N 条，默认全清)
  -h, --help              显示帮助

示例:
  node dispatch.mjs ./tasks/ --dry-run
  node dispatch.mjs ./tasks/ --parallel --concurrency 2
  node dispatch.mjs ./tasks/ --status
  node dispatch.mjs ./tasks/ --list
  node dispatch.mjs ./tasks/ --clean 5
`);
}

// ─── Run Management ───

const LOGS_ROOT = ".dispatch-logs";

async function listRuns(taskDir) {
  const logsDir = join(taskDir, LOGS_ROOT);
  if (!existsSync(logsDir)) {
    log("INFO", "无历史运行记录");
    return;
  }

  const entries = await readdir(logsDir, { withFileTypes: true });
  const runs = entries.filter((e) => e.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));

  if (runs.length === 0) {
    log("INFO", "无历史运行记录");
    return;
  }

  console.log(`\n  共 ${runs.length} 条运行记录 (${logsDir})\n`);
  for (const run of runs) {
    const summaryPath = join(logsDir, run.name, "summary.json");
    let info = "";
    if (existsSync(summaryPath)) {
      try {
        const summary = JSON.parse(await readFile(summaryPath, "utf-8"));
        const tasks = summary.tasks || [];
        const s = tasks.filter((t) => t.status === "success").length;
        const f = tasks.filter((t) => t.status === "failed").length;
        info = `  ${summary.phase || "?"}  ${summary.duration || "?"}  ✓${s} ✗${f}  ${summary.config?.approvalMode || ""}`;
      } catch { }
    }
    console.log(`  ${run.name}${info}`);
  }
  console.log("");
}

async function cleanRuns(taskDir, keep) {
  const logsDir = join(taskDir, LOGS_ROOT);
  if (!existsSync(logsDir)) {
    log("INFO", "无需清理");
    return;
  }

  const entries = await readdir(logsDir, { withFileTypes: true });
  const runs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

  const toRemove = keep > 0 ? runs.slice(0, Math.max(0, runs.length - keep)) : runs;

  if (toRemove.length === 0) {
    log("INFO", "无需清理");
    return;
  }

  for (const run of toRemove) {
    await rm(join(logsDir, run.name), { recursive: true, force: true });
    log("INFO", `已删除: ${run.name}`);
  }
  log("INFO", `清理完成: 删除 ${toRemove.length} 条，保留 ${runs.length - toRemove.length} 条`);
}

// ─── Compact Status ───

const STATUS_ICONS = { pending: "⏳", queued: "📋", running: "🔄", success: "✅", failed: "❌", skipped: "⏭" };

function formatElapsed(ms) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 > 0 ? `${m}m${s % 60}s` : `${m}m`;
}

function formatTokens(usage) {
  if (!usage) return "";
  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
  return `${fmt(usage.input)}/${fmt(usage.output)}`;
}

function renderCompactStatus(state) {
  const now = Date.now();
  const elapsed = formatElapsed((state.endTime || now) - state.startTime);
  const tasks = Object.values(state.tasks);
  const done = tasks.filter((t) => t.status === "success" || t.status === "failed" || t.status === "skipped").length;

  const lines = [];
  lines.push(`run=${state.runId} phase=${state.phase} elapsed=${elapsed}`);
  for (const t of tasks) {
    const icon = STATUS_ICONS[t.status] || "?";
    const dur = t.startTime ? formatElapsed((t.endTime || now) - t.startTime) : "—";
    const tok = formatTokens(t.usage);
    const err = t.error ? ` err=${t.error.slice(0, 60)}` : "";
    lines.push(`T${t.id} ${icon} ${t.status.padEnd(7)} ${dur.padEnd(6)} ${tok}${err}`);
  }
  lines.push(`progress=${done}/${tasks.length} (${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%)`);
  return lines.join("\n");
}

function httpGetJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path, timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error("invalid json")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function findLatestRun(taskDir) {
  const logsDir = join(taskDir, LOGS_ROOT);
  if (!existsSync(logsDir)) return null;
  const entries = await readdir(logsDir, { withFileTypes: true });
  const runs = entries.filter((e) => e.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
  return runs.length > 0 ? runs[0].name : null;
}

async function showStatus(taskDir, runId) {
  if (!runId) {
    runId = await findLatestRun(taskDir);
    if (!runId) { log("INFO", "无运行记录"); return; }
  }

  const runDir = join(taskDir, LOGS_ROOT, runId);
  if (!existsSync(runDir)) { log("ERROR", `运行 ${runId} 不存在`); return; }

  // Strategy 1: try live HTTP API via port file
  const portFile = join(runDir, "port");
  if (existsSync(portFile)) {
    try {
      const port = parseInt(await readFile(portFile, "utf-8"), 10);
      const state = await httpGetJson(port, "/api/state");
      const status = renderCompactStatus(state);
      console.log(status);
      console.log(`dashboard=http://localhost:${port}`);
      return;
    } catch { /* server not running, fall through */ }
  }

  // Strategy 2: read status.txt (written periodically during run)
  const statusFile = join(runDir, "status.txt");
  if (existsSync(statusFile)) {
    console.log(await readFile(statusFile, "utf-8"));
    return;
  }

  // Strategy 3: reconstruct from state.json
  const stateFile = join(runDir, "state.json");
  if (existsSync(stateFile)) {
    const state = JSON.parse(await readFile(stateFile, "utf-8"));
    console.log(renderCompactStatus(state));
    return;
  }

  log("INFO", `运行 ${runId} 无状态数据`);
}

async function writeStatusFile(store, runDir, port) {
  const status = renderCompactStatus(store.getState());
  const withDash = port ? `${status}\ndashboard=http://localhost:${port}` : status;
  await writeFile(join(runDir, "status.txt"), withDash, "utf-8").catch(() => { });
}

// ─── Task Parsing ───

function extractId(filename) {
  const m = basename(filename).match(/^T(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractDeps(content) {
  const line = content.split("\n").find((l) => l.includes("← T"));
  if (!line) return [];
  return [...line.matchAll(/T(\d+)/g)].map((m) => parseInt(m[1], 10));
}

async function loadTasks(taskDir) {
  const entries = await readdir(taskDir);
  const files = entries.filter((f) => /^T\d+.*\.md$/.test(f)).sort();
  const tasks = [];
  for (const file of files) {
    const filePath = join(taskDir, file);
    const content = await readFile(filePath, "utf-8");
    const id = extractId(file);
    if (id === null) {
      log("WARN", `跳过无法解析 ID 的文件: ${file}`);
      continue;
    }
    tasks.push({ id, file, filePath, content, deps: extractDeps(content) });
  }
  return tasks;
}

// ─── DAG ───

function topologicalBatches(tasks) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const completed = new Set();
  const remaining = new Set(tasks.map((t) => t.id));
  const batches = [];

  for (const task of tasks) {
    for (const dep of task.deps) {
      if (!taskMap.has(dep)) {
        log("WARN", `T${task.id} 依赖不存在的 T${dep}，视为已满足`);
        completed.add(dep);
      }
    }
  }

  while (remaining.size > 0) {
    const batch = [];
    for (const id of remaining) {
      if (taskMap.get(id).deps.every((d) => completed.has(d))) batch.push(id);
    }
    if (batch.length === 0) {
      throw new Error(`死锁: ${[...remaining].map((id) => `T${id}`).join(", ")} 存在循环依赖`);
    }
    batches.push(batch);
    for (const id of batch) {
      completed.add(id);
      remaining.delete(id);
    }
  }
  return batches;
}

function buildEdges(tasks) {
  const edges = [];
  for (const task of tasks) {
    for (const dep of task.deps) edges.push([dep, task.id]);
  }
  return edges;
}

// ─── State Store ───

class StateStore extends EventEmitter {
  #state;

  constructor(config, tasks, batches, edges, runId) {
    super();
    this.#state = {
      runId,
      config: {
        approvalMode: config.approvalMode,
        parallel: config.parallel,
        concurrency: config.concurrency,
        cwd: config.cwd,
        dryRun: config.dryRun,
      },
      phase: "initializing",
      startTime: Date.now(),
      endTime: null,
      tasks: Object.fromEntries(
        tasks.map((t) => [
          t.id,
          {
            id: t.id,
            file: t.file,
            deps: t.deps,
            status: "pending",
            startTime: null,
            endTime: null,
            threadId: null,
            events: [],
            usage: null,
            error: null,
          },
        ]),
      ),
      dag: { batches, edges },
    };
  }

  getState() {
    return this.#state;
  }

  setPhase(phase) {
    this.#state.phase = phase;
    if (phase === "completed" || phase === "failed") {
      this.#state.endTime = Date.now();
    }
    this.emit("update", { type: "phase", phase, endTime: this.#state.endTime });
  }

  updateTask(taskId, updates) {
    const task = this.#state.tasks[taskId];
    if (!task) return;
    Object.assign(task, updates);
    this.emit("update", { type: "task_update", taskId, updates });
  }

  addTaskEvent(taskId, event) {
    const task = this.#state.tasks[taskId];
    if (!task) return;
    task.events.push(event);
    this.emit("update", { type: "task_event", taskId, event });
  }
}

// ─── HTTP Server + SSE ───

async function startServer(store, port) {
  const dashboardPath = join(__dirname, "dashboard.html");
  let dashboardHtml = "<html><body><h1>dashboard.html not found</h1></body></html>";
  if (existsSync(dashboardPath)) {
    dashboardHtml = await readFile(dashboardPath, "utf-8");
  } else {
    log("WARN", "dashboard.html 未找到 — 使用占位页面");
  }

  return new Promise((res) => {
    const server = createServer((req, resp) => {
      if (req.url === "/" || req.url === "/index.html") {
        resp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        resp.end(dashboardHtml);
      } else if (req.url === "/api/state") {
        resp.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        resp.end(JSON.stringify(store.getState()));
      } else if (req.url === "/api/events") {
        resp.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        resp.flushHeaders();
        resp.write(`data: ${JSON.stringify({ type: "snapshot", state: store.getState() })}\n\n`);

        const onUpdate = (event) => resp.write(`data: ${JSON.stringify(event)}\n\n`);
        store.on("update", onUpdate);
        const hb = setInterval(() => resp.write(": ping\n\n"), 15000);
        req.on("close", () => {
          clearInterval(hb);
          store.off("update", onUpdate);
        });
      } else {
        resp.writeHead(404);
        resp.end("Not Found");
      }
    });

    server.listen(port, () => res({ server, port: server.address().port }));
  });
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`);
}

// ─── Codex Dispatcher ───

function formatEvent(event) {
  switch (event.type) {
    case "item.started":
      if (event.item.type === "command_execution") return { icon: "▶", text: `cmd: ${event.item.command}` };
      if (event.item.type === "file_change") {
        const f = event.item.changes?.map((c) => `${c.kind} ${c.path}`).join(", ");
        return f ? { icon: "✏", text: f } : null;
      }
      if (event.item.type === "agent_message") return { icon: "💬", text: event.item.text.slice(0, 150) };
      if (event.item.type === "reasoning") return { icon: "·", text: "推理中..." };
      return null;
    case "item.completed":
      if (event.item.type === "command_execution") return { icon: "✓", text: `exit=${event.item.exit_code ?? "?"}` };
      if (event.item.type === "file_change") return { icon: "✓", text: `patch ${event.item.status}` };
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

async function dispatchTask(codex, task, config, store) {
  store.updateTask(task.id, { status: "running", startTime: Date.now() });
  log("INFO", `T${task.id}: ${task.file}`);

  if (config.dryRun) {
    const sdk = MODE_TO_SDK[config.approvalMode];
    store.addTaskEvent(task.id, {
      ts: Date.now(),
      icon: "◇",
      text: `[预演] approvalPolicy="${sdk.approvalPolicy}"`,
    });
    await new Promise((r) => setTimeout(r, 200));
    store.updateTask(task.id, { status: "success", endTime: Date.now() });
    return { taskId: task.id, success: true, dryRun: true };
  }

  const prompt = `根据以下 Task Spec 执行任务:\n\n${task.content}`;
  const sdkMode = MODE_TO_SDK[config.approvalMode];
  const thread = codex.startThread({
    approvalPolicy: sdkMode.approvalPolicy,
    sandboxMode: sdkMode.sandboxMode,
    workingDirectory: config.cwd,
  });

  try {
    const streamed = await thread.runStreamed(prompt);
    for await (const event of streamed.events) {
      const fmt = formatEvent(event);
      if (fmt) {
        store.addTaskEvent(task.id, { ts: Date.now(), ...fmt });
        log("INFO", `  T${task.id} | ${fmt.icon} ${fmt.text}`);
      }
      if (event.type === "turn.completed") {
        store.updateTask(task.id, {
          usage: { input: event.usage.input_tokens, cached: event.usage.cached_input_tokens, output: event.usage.output_tokens },
        });
      }
    }
    store.updateTask(task.id, { status: "success", endTime: Date.now(), threadId: thread.id });
    log("INFO", `T${task.id} 完成`);
    return { taskId: task.id, success: true, threadId: thread.id };
  } catch (err) {
    store.updateTask(task.id, { status: "failed", endTime: Date.now(), error: err.message, threadId: thread.id });
    store.addTaskEvent(task.id, { ts: Date.now(), icon: "✗", text: err.message });
    log("ERROR", `T${task.id} 失败: ${err.message}`);
    return { taskId: task.id, success: false, error: err.message };
  }
}

// ─── Execution Strategies ───

async function runSequential(codex, tasks, config, store) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const batches = store.getState().dag.batches;
  const results = [];
  let failedId = null;

  for (const batch of batches) {
    for (const id of batch) {
      if (failedId !== null) {
        store.updateTask(id, { status: "skipped" });
        log("SKIP", `T${id} 跳过 (上游 T${failedId} 失败)`);
        results.push({ taskId: id, success: false, skipped: true });
        continue;
      }
      const result = await dispatchTask(codex, taskMap.get(id), config, store);
      results.push(result);
      if (!result.success && !result.dryRun) failedId = id;
    }
  }
  return results;
}

async function runParallel(codex, tasks, config, store) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const batches = store.getState().dag.batches;
  const results = [];
  const failedIds = new Set();

  for (const batch of batches) {
    const runnable = [];
    for (const id of batch) {
      const task = taskMap.get(id);
      if (task.deps.some((d) => failedIds.has(d))) {
        store.updateTask(id, { status: "skipped" });
        log("SKIP", `T${id} 跳过 (上游依赖失败)`);
        results.push({ taskId: id, success: false, skipped: true });
      } else {
        store.updateTask(id, { status: "queued" });
        runnable.push(task);
      }
    }
    const br = await pooled(runnable, config.concurrency, (t) => dispatchTask(codex, t, config, store));
    for (const r of br) {
      results.push(r);
      if (!r.success && !r.dryRun) failedIds.add(r.taskId);
    }
  }
  return results;
}

async function pooled(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = fn(item).then((r) => { executing.delete(p); return r; });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

// ─── Summary ───

async function writeSummary(store, runDir) {
  const state = store.getState();
  const report = {
    runId: state.runId,
    timestamp: new Date().toISOString(),
    config: state.config,
    phase: state.phase,
    duration: state.endTime ? `${((state.endTime - state.startTime) / 1000).toFixed(1)}s` : null,
    dag: state.dag,
    tasks: Object.values(state.tasks).map((t) => ({
      id: t.id,
      file: t.file,
      status: t.status,
      duration: t.startTime && t.endTime ? `${((t.endTime - t.startTime) / 1000).toFixed(1)}s` : null,
      threadId: t.threadId,
      usage: t.usage,
      error: t.error,
    })),
  };
  const p = join(runDir, "summary.json");
  await writeFile(p, JSON.stringify(report, null, 2), "utf-8");
  return p;
}

// ─── Main ───

async function main() {
  const config = parseArgs(process.argv);

  if (!config.taskDir) fatal("需要指定 task-dir 参数，使用 --help 查看用法。");
  if (!existsSync(config.taskDir)) fatal(`${config.taskDir} 不存在`);

  // Management commands (no server needed)
  if (config.status) {
    await showStatus(config.taskDir, config.statusRunId);
    return;
  }
  if (config.list) {
    await listRuns(config.taskDir);
    return;
  }
  if (config.clean) {
    await cleanRuns(config.taskDir, config.cleanKeep);
    return;
  }

  // Validate
  if (!VALID_MODES.includes(config.approvalMode))
    fatal(`无效的 approval-mode '${config.approvalMode}'，可选: ${VALID_MODES.join(", ")}`);

  // Load tasks
  const tasks = await loadTasks(config.taskDir);
  if (tasks.length === 0) fatal(`在 ${config.taskDir} 中未找到任务文件 (T*.md)`);

  const batches = topologicalBatches(tasks);
  const edges = buildEdges(tasks);

  // Run isolation: each dispatch gets a unique runId
  const runId = generateRunId();
  const runDir = join(config.taskDir, LOGS_ROOT, runId);
  await mkdir(runDir, { recursive: true });

  // State
  const store = new StateStore(config, tasks, batches, edges, runId);

  // Server
  const { server, port } = await startServer(store, config.port);
  const url = `http://localhost:${port}`;

  // Write port file so --status can connect to live server
  await writeFile(join(runDir, "port"), String(port), "utf-8");

  // Periodically write compact status file for Agent polling (cat-friendly)
  const statusInterval = setInterval(() => writeStatusFile(store, runDir, port), 5000);
  await writeStatusFile(store, runDir, port);

  // Keep process alive — server.listen alone should suffice, this is a safety net
  const keepAlive = setInterval(() => { }, 1 << 30);

  log("INFO", "┌──────────────────────────────────┐");
  log("INFO", "│  Codex Orchestrator              │");
  log("INFO", "└──────────────────────────────────┘");
  log("INFO", `面板:     ${url}`);
  log("INFO", `运行 ID:  ${runId}`);
  log("INFO", `任务:     ${tasks.length} 个`);
  log("INFO", `模式:     ${config.approvalMode}`);
  log("INFO", `并行:     ${config.parallel ? `是 (×${config.concurrency})` : "否"}`);
  log("INFO", `预演:     ${config.dryRun ? "是" : "否"}`);
  log("INFO", `DAG:      ${batches.map((b) => b.map((id) => `T${id}`).join("+")).join(" → ")}`);
  log("INFO", `日志:     ${runDir}`);
  console.log("");

  if (!config.noOpen) openBrowser(url);

  // SDK init
  let codex = null;
  if (!config.dryRun) {
    try {
      const sdk = await import("@openai/codex-sdk");
      codex = new sdk.Codex();
    } catch (err) {
      fatal(`无法加载 @openai/codex-sdk: ${err.message}\n  运行: cd ${resolve(__dirname, "..")} && npm install`);
    }
  }

  // Dispatch
  store.setPhase("running");
  const results = config.parallel
    ? await runParallel(codex, tasks, config, store)
    : await runSequential(codex, tasks, config, store);

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  store.setPhase(failed > 0 ? "failed" : "completed");
  const summaryPath = await writeSummary(store, runDir);

  // Persist full state + final status for later review
  await writeFile(join(runDir, "state.json"), JSON.stringify(store.getState(), null, 2), "utf-8");
  await writeStatusFile(store, runDir, port);

  console.log("");
  log("INFO", `── 结果 ──`);
  log("INFO", `✓ ${succeeded} 通过 | ✗ ${failed} 失败 | ⏭ ${skipped} 跳过`);
  log("INFO", `报告:  ${summaryPath}`);
  log("INFO", `面板:  ${url}`);
  log("INFO", `按 Ctrl+C 停止服务`);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("INFO", "正在关闭...");
    clearInterval(keepAlive);
    clearInterval(statusInterval);
    // Remove port file so --status falls back to status.txt
    await rm(join(runDir, "port"), { force: true }).catch(() => { });
    server.close(() => process.exit(failed > 0 ? 1 : 0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => fatal(err.message));
