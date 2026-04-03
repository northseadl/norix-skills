// CLI — argument parsing for the workshop

import { resolve } from "node:path";

export const DEFAULT_ROLES = ["leader", "worker:2", "inspector"];
export const VALID_ENGINES = ["codex", "claude", "opencode"];

export function parseGlobalArgs(argv, fatal) {
    const args = argv.slice(2);
    const config = {
        cwd: process.cwd(),
        engine: "codex",
        approvalMode: "full-auto",
        sandboxMode: "danger-full-access",
        port: 0,
        dryRun: false,
        maxPulses: 3,
        help: false,
    };
    const rest = [];

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--cwd": config.cwd = resolve(args[++i]); break;
            case "--engine": config.engine = args[++i]; break;
            case "--approval-mode": config.approvalMode = args[++i]; break;
            case "--sandbox-mode": config.sandboxMode = args[++i]; break;
            case "--port": config.port = parseInt(args[++i], 10); break;
            case "--dry-run": config.dryRun = true; break;
            case "--max-pulses": config.maxPulses = parseInt(args[++i], 10); break;
            case "--help": case "-h": config.help = true; break;
            default: rest.push(args[i]);
        }
    }

    if (!VALID_ENGINES.includes(config.engine)) {
        fatal(`Invalid engine: ${config.engine}. Valid: ${VALID_ENGINES.join(", ")}`);
    }

    return { config, rest };
}

export function parseServeArgs(args, fatal) {
    const result = {
        goal: "",
        roles: [...DEFAULT_ROLES],
        baseRef: "HEAD",
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--goal": result.goal = args[++i]; break;
            case "--roles": result.roles = args[++i].split(",").map((s) => s.trim()).filter(Boolean); break;
            case "--base": result.baseRef = args[++i]; break;
            default:
                // If it doesn't start with --, treat as goal
                if (!args[i].startsWith("--") && !result.goal) {
                    result.goal = args[i];
                }
        }
    }

    if (!result.goal) fatal("Goal is required. Usage: team serve --goal 'your goal'");

    return result;
}

export function printUsage() {
    console.log(`
Workshop — Multi-Agent SWE Team

Usage:
  team serve --goal "..." [--roles worker:2,inspector] [--base HEAD]
  team status

Global options:
  --cwd <path>          Working directory (default: cwd)
  --engine <codex|claude|opencode>  Engine (default: codex)
  --port <N>            Server port (default: auto)
  --max-pulses <N>      Max pulses per agent turn (default: 3)
  --dry-run             Simulate without running agents

Examples:
  team serve --goal "Implement login page with auth API"
  team serve --goal "..." --roles "leader,worker:3,inspector" --engine claude
`);
}
