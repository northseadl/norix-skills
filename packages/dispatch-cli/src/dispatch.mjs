#!/usr/bin/env node

// Task Orchestrator — CLI entry point
// Delegates to modular lib/ components for DAG scheduling, engine bridging,
// retry resilience, checkpoint persistence, and tiered reporting.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { log, fatal } from "./lib/logger.mjs";
import { loadTasks, topologicalBatches, buildEdges, resolveEngines } from "./lib/dag.mjs";
import { StateStore, writeSummary } from "./lib/store.mjs";
import { loadSdks, runSequential, runParallel } from "./lib/engines.mjs";
import { startServer, openBrowser } from "./lib/server.mjs";
import { writeReports } from "./lib/reporter.mjs";

import { VALID_MODES, LOGS_ROOT, parseArgs } from "./lib/cli.mjs";
import { generateRunId, findLatestRun, listRuns, cleanRuns, showStatus } from "./lib/manage.mjs";
import { preflight } from "./lib/preflight.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = parseArgs(process.argv, fatal);

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
    const issues = preflight(config);
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
