import { resolve } from "node:path";

export const VALID_MODES = ["suggest", "auto-edit", "full-auto"];
export const VALID_ENGINES = ["codex", "claude"];
export const LOGS_ROOT = ".dispatch-logs";

export function parseArgs(argv, fatal) {
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
                if (i + 1 < argv.length && /^\\d+$/.test(argv[i + 1])) {
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

export function printUsage() {
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
