#!/usr/bin/env node

// Workshop — CLI entry point
// Two commands: serve (start the workshop) and status (check board state)

import { parseGlobalArgs, parseServeArgs, printUsage } from "./lib/cli.mjs";
import { serve } from "./lib/workshop.mjs";
import { Board } from "./lib/board.mjs";
import { fatal } from "./lib/logger.mjs";
import { join } from "node:path";
import { existsSync } from "node:fs";

function generateRunId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
    const { config: global, rest } = parseGlobalArgs(process.argv, fatal);
    if (global.help || rest.length === 0) {
        printUsage();
        return;
    }

    const cmd = rest[0];
    const args = rest.slice(1);

    switch (cmd) {
        case "serve": {
            const serveArgs = parseServeArgs(args, fatal);
            const runId = generateRunId();
            await serve(global.cwd, {
                runId,
                goal: serveArgs.goal,
                roles: serveArgs.roles,
                baseRef: serveArgs.baseRef,
                engine: global.engine,
                approvalMode: global.approvalMode,
                sandboxMode: global.sandboxMode,
                port: global.port,
                dryRun: global.dryRun,
                maxPulses: global.maxPulses,
            });
            return;
        }
        case "status": {
            const workshopDir = join(global.cwd, ".workshop");
            if (!existsSync(join(workshopDir, "board.json"))) {
                console.log("No active workshop found.");
                return;
            }
            const board = new Board(workshopDir);
            await board.init("?", "");
            console.log(board.toBoardView());
            return;
        }
        default:
            fatal(`Unknown command: ${cmd}. Use: serve | status`);
    }
}

main().catch((err) => fatal(err.stack || err.message));
