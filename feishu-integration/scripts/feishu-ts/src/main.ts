/**
 * Feishu CLI — Unified entry point.
 *
 * Usage: ./feishu <module> <command> [options]
 *
 * Modules: auth, task, doc, wiki, bitable, msg, approval, member
 *
 * OUTPUT CONTRACT: All commands emit exactly one JSON line to stdout:
 *   { ok: true, data: ..., message: "..." }       — success
 *   { ok: false, message: "...", hint: "..." }     — error
 * Log/diagnostic output goes to stderr.
 */

import { authMain } from "./auth.js";
import { taskMain } from "./task.js";
import { docMain } from "./docx.js";
import { wikiMain } from "./wiki.js";
import { bitableMain } from "./bitable.js";
import { msgMain } from "./msg.js";
import { approvalMain } from "./approval.js";
import { membersMain } from "./members.js";
import { fail, respond } from "./utils.js";

const VERSION = "0.4.2";

const MODULES: Record<string, (argv: string[]) => Promise<void>> = {
  auth: authMain,
  task: taskMain,
  doc: docMain,
  wiki: wikiMain,
  bitable: bitableMain,
  msg: msgMain,
  approval: approvalMain,
  member: membersMain,
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    respond({
      version: VERSION,
      modules: Object.keys(MODULES),
      usage: "./feishu <module> <command> [options]",
    }, "Feishu CLI v" + VERSION);
  }

  if (argv[0] === "--version" || argv[0] === "-v") {
    respond({ version: VERSION }, VERSION);
  }

  const moduleName = argv[0]!;
  const moduleMain = MODULES[moduleName];

  if (!moduleMain) {
    fail(
      `Unknown module: '${moduleName}'`,
      `Available: ${Object.keys(MODULES).join(", ")}`
    );
  }

  await moduleMain(argv.slice(1));
}

main().catch((err) => {
  fail(`Fatal: ${err}`);
});
