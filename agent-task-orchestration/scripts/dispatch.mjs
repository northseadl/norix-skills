#!/usr/bin/env node

// Task Orchestrator — CLI entry point
// Delegates to modular lib/ components for DAG scheduling, engine bridging,
// retry resilience, checkpoint persistence, and tiered reporting.

import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { execSync } from "node:child_process";

import { log, fatal } from "./lib/logger.mjs";
import { loadTasks, topologicalBatches, buildEdges, resolveEngines } from "./lib/dag.mjs";
import { StateStore, writeSummary } from "./lib/store.mjs";
import { loadSdks, runSequential, runParallel } from "./lib/engines.mjs";
import { startServer, openBrowser } from "./lib/server.mjs";
import { writeReports } from "./lib/reporter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_MODES = ["suggest", "auto-edit", "full-auto"];
const VALID_ENGINES = ["codex", "claude"];
const LOGS_ROOT = ".dispatch-logs";

// ─── CLI Parsing ───

function parseArgs(argv) {
  const config = {
    taskDir: "",
    dryRun: false,
    parallel: false,
    approvalMode: "suggest",
    engine: "codex",
    concurrency: 4,
    cwd: process.cwd(),
    port: 0,
    noOpen: false,
    clean: false,
    cleanKeep: 0,
    list: false,
    status: false,
    statusRunId: "",
    // Resume support
    resume: false,
    resumeRunId: "",
    retryFailed: false,
    retryIds: [],
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
      case "--engine":
        if (i + 1 >= argv.length) fatal("--engine requires a value");
        config.engine = argv[++i];
        if (!VALID_ENGINES.includes(config.engine))
          fatal(`Invalid engine '${config.engine}', use: ${VALID_ENGINES.join(", ")}`);
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
      case "--resume":
        config.resume = true;
        if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
          config.resumeRunId = argv[++i];
        }
        i++;
        break;
      case "--retry-failed":
        config.retryFailed = true;
        i++;
        break;
      case "--retry":
        if (i + 1 >= argv.length) fatal("--retry requires task IDs (e.g. T2,T5)");
        config.retryIds = argv[++i]
          .replace(/T/gi, "")
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        i++;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      default:
        if (argv[i].startsWith("-")) fatal(`Unknown option: ${argv[i]}`);
        config.taskDir = argv[i];
        i++;
    }
  }
  return config;
}

function printUsage() {
  console.log(`
Task Orchestrator — Resilient multi-agent task scheduling with real-time dashboard

Usage: node dispatch.mjs <task-dir> [options]

Arguments:
  task-dir                Directory containing task spec files (T*.md)

Execution:
  --dry-run               Preview execution plan without dispatching
  --parallel              Run independent tasks in parallel (default: sequential)
  --approval-mode MODE    suggest|auto-edit|full-auto (default: suggest)
  --engine ENGINE         Default engine: codex|claude (default: codex)
                          Each T*.md can override via engine: line
  --concurrency N         Max parallel sessions (default: 4)
  --cwd DIR               Agent working directory (default: current)
  --port PORT             Dashboard port (default: random)
  --no-open               Don't auto-open browser

Recovery:
  --resume [RUN-ID]       Resume from last checkpoint (default: latest run)
  --retry-failed          When resuming, retry all failed tasks
  --retry T2,T5           When resuming, retry only specified tasks

Monitoring:
  --status [RUN-ID]       Query run status (default: latest)

Management:
  --list                  List all historical runs
  --clean [N]             Clean history (keep latest N, default: all)
  -h, --help              Show this help

Signal files (for Agent polling):
  cat {dir}/.dispatch-logs/{runId}/signal       # 1-line status (~20 tokens)
  cat {dir}/.dispatch-logs/{runId}/digest.txt   # 5-line summary (~80 tokens)
  cat {dir}/.dispatch-logs/{runId}/status.txt   # Full status (~500 tokens)

Examples:
  node dispatch.mjs ./tasks/ --dry-run
  node dispatch.mjs ./tasks/ --parallel --engine claude --approval-mode full-auto
  node dispatch.mjs ./tasks/ --resume --retry-failed
  node dispatch.mjs ./tasks/ --status
`);
}

// ─── Run Management ───

function generateRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function findLatestRun(taskDir) {
  const logsDir = join(taskDir, LOGS_ROOT);
  if (!existsSync(logsDir)) return null;
  const entries = await readdir(logsDir, { withFileTypes: true });
  const runs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name));
  return runs.length > 0 ? runs[0].name : null;
}

async function listRuns(taskDir) {
  const logsDir = join(taskDir, LOGS_ROOT);
  if (!existsSync(logsDir)) {
    log("INFO", "No run history");
    return;
  }
  const entries = await readdir(logsDir, { withFileTypes: true });
  const runs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name));
  if (runs.length === 0) {
    log("INFO", "No run history");
    return;
  }
  console.log(`\n  ${runs.length} runs (${logsDir})\n`);
  for (const run of runs) {
    const summaryPath = join(logsDir, run.name, "summary.json");
    const checkpointPath = join(logsDir, run.name, "checkpoint.json");
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
    const resumable = existsSync(checkpointPath) ? " [resumable]" : "";
    console.log(`  ${run.name}${info}${resumable}`);
  }
  console.log("");
}

async function cleanRuns(taskDir, keep) {
  const logsDir = join(taskDir, LOGS_ROOT);
  if (!existsSync(logsDir)) {
    log("INFO", "Nothing to clean");
    return;
  }
  const entries = await readdir(logsDir, { withFileTypes: true });
  const runs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const toRemove =
    keep > 0 ? runs.slice(0, Math.max(0, runs.length - keep)) : runs;
  if (toRemove.length === 0) {
    log("INFO", "Nothing to clean");
    return;
  }
  for (const run of toRemove) {
    await rm(join(logsDir, run.name), { recursive: true, force: true });
    log("INFO", `Removed: ${run.name}`);
  }
  log("INFO", `Cleaned: ${toRemove.length} removed, ${runs.length - toRemove.length} kept`);
}

// ─── Status Query ───

function httpGetJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path, timeout: 2000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("invalid json"));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

async function showStatus(taskDir, runId) {
  if (!runId) {
    runId = await findLatestRun(taskDir);
    if (!runId) {
      log("INFO", "No run history");
      return;
    }
  }
  const runDir = join(taskDir, LOGS_ROOT, runId);
  if (!existsSync(runDir)) {
    log("ERROR", `Run ${runId} not found`);
    return;
  }

  // Strategy 1: live HTTP via port file
  const portFile = join(runDir, "port");
  if (existsSync(portFile)) {
    try {
      const port = parseInt(await readFile(portFile, "utf-8"), 10);
      const state = await httpGetJson(port, "/api/state");
      // Reconstruct a temporary store just for rendering
      const tmpStore = new StateStore(
        state.config,
        Object.values(state.tasks),
        state.dag.batches,
        state.dag.edges,
        state.runId,
        runDir,
      );
      // Sync state
      for (const [id, t] of Object.entries(state.tasks)) {
        tmpStore.updateTask(parseInt(id, 10), t);
      }
      console.log(tmpStore.renderCompactStatus());
      console.log(`dashboard=http://localhost:${port}`);
      return;
    } catch {
      /* server not running, fall through */
    }
  }

  // Strategy 2: status.txt
  const statusFile = join(runDir, "status.txt");
  if (existsSync(statusFile)) {
    console.log(await readFile(statusFile, "utf-8"));
    return;
  }

  // Strategy 3: signal + digest
  const signalFile = join(runDir, "signal");
  if (existsSync(signalFile)) {
    console.log(await readFile(signalFile, "utf-8"));
    const digestFile = join(runDir, "digest.txt");
    if (existsSync(digestFile)) {
      console.log("---");
      console.log(await readFile(digestFile, "utf-8"));
    }
    return;
  }

  log("INFO", `Run ${runId} has no status data`);
}

// ─── Pre-flight Checks ───

/**
 * Validate environment before dispatch to surface preventable failures early.
 * @param {object} config
 * @param {{needsCodex: boolean, needsClaude: boolean}} engineInfo
 * @returns {Array<{level: "warn"|"fatal", msg: string}>}
 */
function preflight(config, engineInfo) {
  const issues = [];

  // Git workspace check
  try {
    const status = execSync("git status --porcelain", {
      cwd: config.cwd,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (status) {
      const count = status.split("\n").length;
      issues.push({
        level: "warn",
        msg: `Working directory has ${count} uncommitted change(s). Builder output will mix with existing changes.`,
      });
    }
    // Log current branch for context
    const branch = execSync("git branch --show-current", {
      cwd: config.cwd,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (branch) log("INFO", `Git branch: ${branch}`);
  } catch {
    // Not a git repo or git not available — skip
  }

  // API key checks (fail-fast before wasting time on DAG/server setup)
  if (engineInfo.needsCodex && !process.env.OPENAI_API_KEY) {
    issues.push({ level: "fatal", msg: "OPENAI_API_KEY not set (required for Codex engine)" });
  }
  if (engineInfo.needsClaude && !process.env.ANTHROPIC_API_KEY) {
    issues.push({ level: "fatal", msg: "ANTHROPIC_API_KEY not set (required for Claude engine)" });
  }

  return issues;
}

// ─── Main ───

async function main() {
  const config = parseArgs(process.argv);

  if (!config.taskDir) fatal("task-dir argument required. Use --help for usage.");
  if (!existsSync(config.taskDir)) fatal(`${config.taskDir} does not exist`);

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
    fatal(`Invalid approval-mode '${config.approvalMode}', use: ${VALID_MODES.join(", ")}`);

  // ─── Resume handling ───
  let checkpoint = null;
  let runId;
  let runDir;

  if (config.resume) {
    const resumeId = config.resumeRunId || (await findLatestRun(config.taskDir));
    if (!resumeId) fatal("No run to resume");
    const cpPath = join(config.taskDir, LOGS_ROOT, resumeId, "checkpoint.json");
    if (!existsSync(cpPath)) fatal(`No checkpoint found for run ${resumeId}`);
    checkpoint = await StateStore.loadCheckpoint(cpPath);
    runId = resumeId;
    runDir = join(config.taskDir, LOGS_ROOT, runId);
    log("INFO", `Resuming run ${runId} from checkpoint`);
  } else {
    runId = generateRunId();
    runDir = join(config.taskDir, LOGS_ROOT, runId);
    await mkdir(runDir, { recursive: true });
  }

  // Load tasks (with per-task engine resolution)
  const tasks = await loadTasks(config.taskDir, config.engine);
  if (tasks.length === 0) fatal(`No task files (T*.md) found in ${config.taskDir}`);

  const engineInfo = resolveEngines(tasks);
  const batches = topologicalBatches(tasks);
  const edges = buildEdges(tasks);

  // State
  const store = new StateStore(config, tasks, batches, edges, runId, runDir);

  // Apply checkpoint if resuming
  if (checkpoint) {
    const { skipped, retrying } = store.applyCheckpoint(checkpoint, {
      retryFailed: config.retryFailed,
      retryIds: config.retryIds,
    });
    if (skipped.length > 0) {
      log("INFO", `Resumed: ${skipped.map((id) => `T${id}`).join(", ")} already done`);
    }
    if (retrying.length > 0) {
      log("INFO", `Retrying: ${retrying.map((id) => `T${id}`).join(", ")}`);
    }
  }

  // Server
  const { server, port } = await startServer(store, config.port, __dirname);
  const url = `http://localhost:${port}`;

  // Write port file so --status can connect to live server
  await writeFile(join(runDir, "port"), String(port), "utf-8");

  // Periodically write report files (signal + digest + status.txt)
  const reportInterval = setInterval(() => {
    writeReports(store, runDir, port);
    store.writeCheckpoint().catch(() => { });
  }, 5000);
  await writeReports(store, runDir, port);

  // Keep process alive
  const keepAlive = setInterval(() => { }, 1 << 30);

  // Engine label
  const engineLabel =
    engineInfo.needsCodex && engineInfo.needsClaude
      ? `mixed (${engineInfo.codexCount} codex, ${engineInfo.claudeCount} claude)`
      : engineInfo.needsClaude
        ? "claude"
        : "codex";
  const taskLabels = tasks.map((t) => `T${t.id}[${t.engine}]`).join(", ");

  log("INFO", "┌──────────────────────────────────┐");
  log("INFO", "│  Task Orchestrator v2            │");
  log("INFO", "└──────────────────────────────────┘");
  log("INFO", `Dashboard: ${url}`);
  log("INFO", `Run ID:   ${runId}${config.resume ? " (resumed)" : ""}`);
  log("INFO", `Tasks:    ${tasks.length} — ${taskLabels}`);
  log("INFO", `Engine:   ${engineLabel}`);
  log("INFO", `Mode:     ${config.approvalMode}`);
  log("INFO", `Parallel: ${config.parallel ? `yes (×${config.concurrency})` : "no"}`);
  log("INFO", `Dry-run:  ${config.dryRun ? "yes" : "no"}`);
  log("INFO", `DAG:      ${batches.map((b) => b.map((id) => `T${id}`).join("+")).join(" → ")}`);
  log("INFO", `Logs:     ${runDir}`);
  console.log("");

  if (!config.noOpen) openBrowser(url);

  // ─── Pre-flight checks ───
  if (!config.dryRun) {
    const issues = preflight(config, engineInfo);
    for (const issue of issues) {
      if (issue.level === "fatal") fatal(`Pre-flight: ${issue.msg}`);
      log("WARN", `Pre-flight: ${issue.msg}`);
    }
  }

  // SDK init — lazy load only needed engines
  const sdks = await loadSdks(engineInfo, config.dryRun);

  // Dispatch
  store.setPhase("running");
  const results = config.parallel
    ? await runParallel(sdks, tasks, config, store)
    : await runSequential(sdks, tasks, config, store);

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  store.setPhase(failed > 0 ? "failed" : "completed");

  // Persist everything
  const summaryPath = await writeSummary(store, runDir);
  await writeFile(
    join(runDir, "state.json"),
    JSON.stringify(store.getState(), null, 2),
    "utf-8",
  );
  await store.writeCheckpoint();
  await writeReports(store, runDir, port);

  console.log("");
  log("INFO", `── Results ──`);
  log("INFO", `✓ ${succeeded} passed | ✗ ${failed} failed | ⏭ ${skipped} skipped`);
  if (failed > 0) {
    const failedIds = results
      .filter((r) => !r.success && !r.skipped)
      .map((r) => `T${r.taskId}`)
      .join(",");
    log("INFO", `Resume:  node dispatch.mjs ${config.taskDir} --resume --retry-failed`);
    log("INFO", `  or:    node dispatch.mjs ${config.taskDir} --resume --retry ${failedIds}`);
  }
  log("INFO", `Report:  ${summaryPath}`);
  log("INFO", `Signal:  cat ${join(runDir, "signal")}`);
  log("INFO", `Dash:    ${url}`);
  log("INFO", `Press Ctrl+C to stop`);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("INFO", "Shutting down...");
    clearInterval(keepAlive);
    clearInterval(reportInterval);
    await rm(join(runDir, "port"), { force: true }).catch(() => { });
    server.close(() => process.exit(failed > 0 ? 1 : 0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => fatal(err.message));
