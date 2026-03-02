import { resolve } from "node:path";

export const VALID_APPROVAL_MODES = ["suggest", "auto-edit", "full-auto"];
export const VALID_SANDBOX_MODES = ["workspace-write", "read-only", "danger-full-access"];
export const VALID_ENGINES = ["codex", "claude"];
export const DEFAULT_ROLES = ["architect", "backend", "frontend", "qa", "reviewer"];

export function parseGlobalArgs(argv, fatal) {
    const config = {
        cwd: process.cwd(),
        runId: "",
        dryRun: false,
        engine: "codex",
        approvalMode: "suggest",
        sandboxMode: "workspace-write",
        noOpen: false,
        port: 0,
        help: false,
    };

    const rest = [];
    let i = 2;
    while (i < argv.length) {
        switch (argv[i]) {
            case "--cwd":
                if (i + 1 >= argv.length) fatal("--cwd requires a value");
                config.cwd = resolve(argv[++i]);
                i++;
                break;
            case "--run":
                if (i + 1 >= argv.length) fatal("--run requires a value");
                config.runId = argv[++i];
                i++;
                break;
            case "--dry-run":
                config.dryRun = true;
                i++;
                break;
            case "--engine":
                if (i + 1 >= argv.length) fatal("--engine requires a value");
                config.engine = argv[++i];
                if (!VALID_ENGINES.includes(config.engine)) {
                    fatal(`Invalid --engine '${config.engine}', use: ${VALID_ENGINES.join(", ")}`);
                }
                i++;
                break;
            case "--approval-mode":
                if (i + 1 >= argv.length) fatal("--approval-mode requires a value");
                config.approvalMode = argv[++i];
                if (!VALID_APPROVAL_MODES.includes(config.approvalMode)) {
                    fatal(`Invalid --approval-mode '${config.approvalMode}', use: ${VALID_APPROVAL_MODES.join(", ")}`);
                }
                i++;
                break;
            case "--sandbox":
                if (i + 1 >= argv.length) fatal("--sandbox requires a value");
                config.sandboxMode = argv[++i];
                if (!VALID_SANDBOX_MODES.includes(config.sandboxMode)) {
                    fatal(`Invalid --sandbox '${config.sandboxMode}', use: ${VALID_SANDBOX_MODES.join(", ")}`);
                }
                i++;
                break;
            case "--no-open":
                config.noOpen = true;
                i++;
                break;
            case "--port":
                if (i + 1 >= argv.length) fatal("--port requires a value");
                config.port = parseInt(argv[++i], 10);
                if (Number.isNaN(config.port) || config.port < 0) fatal("--port must be a non-negative integer");
                i++;
                break;
            case "-h":
            case "--help":
                config.help = true;
                i++;
                break;
            default:
                rest.push(argv[i]);
                i++;
        }
    }

    return { config, rest };
}

export function parseCommaList(s) {
    return String(s || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

export function printUsage() {
    console.log(`
Agent SWE Team — Role-based multi-engine team with local Hub and git worktree isolation

Usage:
  node scripts/team.mjs [global options] <command> [command options]

Global options:
  --cwd DIR                Target project directory (default: current)
  --run RUN_ID             Run id (default: latest run)
  --dry-run                Do not call engines or run destructive git operations
  --engine ENGINE          codex|claude (default: codex)
  --approval-mode MODE     suggest|auto-edit|full-auto (default: suggest)
  --sandbox MODE           workspace-write|read-only|danger-full-access (default: workspace-write)
  --port PORT              Dashboard port for serve (default: random)
  --no-open                Do not auto-open dashboard
  -h, --help               Show help

Commands:
  init                     Create a run + role worktrees/branches
  serve                    Start Hub service (dashboard + queue workers)
  ticket new               Create a ticket template file
  assign                   Assign a ticket to a role (enqueue)
  reply                    Reply to a BLOCKED role (enqueue)
  workflow create           Create a workflow from preset template
  workflow status           Show workflow phase statuses
  status                   Show low-cost status (signal + digest)
  list-runs                List runs under .agent-team/runs
  clean                    Remove worktrees and run data (requires --force)

Examples:
  node scripts/team.mjs init --cwd <PROJECT_DIR>
  node scripts/team.mjs --engine claude serve --cwd <PROJECT_DIR> --approval-mode full-auto
  node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Implement OAuth login"
  node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <PROJECT_DIR>/.agent-team/tickets/001-implement-oauth-login.md
  node scripts/team.mjs reply --cwd <PROJECT_DIR> --role backend --text "Use PKCE flow."
  node scripts/team.mjs status --cwd <PROJECT_DIR>
`);
}
