#!/usr/bin/env node
// ws.mjs — Workshop CLI tool for agents
// Replaces verbose curl commands with concise subcommands.
// All output is compact YAML-like text to minimize token cost.
//
// Usage (from within a running workshop's CWD):
//   node ws.mjs signal
//   node ws.mjs board
//   node ws.mjs wake leader
//   node ws.mjs say "message" [@agent]
//   node ws.mjs dm worker-1 "message"
//   node ws.mjs task create "title" --assign worker-1
//   node ws.mjs task complete 1 "summary"
//   node ws.mjs task progress 1 50 "notes"
//   node ws.mjs merge worker-1
//   node ws.mjs done

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const CWD = process.env.WORKSHOP_CWD || process.cwd();
const portFile = join(CWD, ".workshop", "port");

function getPort() {
    if (!existsSync(portFile)) {
        console.error("ERR: .workshop/port not found. Is workshop running?");
        process.exit(1);
    }
    return readFileSync(portFile, "utf-8").trim();
}

function base() { return `http://127.0.0.1:${getPort()}`; }

async function api(method, path, body = null) {
    const opts = {
        method,
        headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${base()}${path}`, opts);
    const text = await resp.text();
    try { return JSON.parse(text); } catch { return text; }
}

// ─── Formatters (compact output to save tokens) ───

function fmtBoard(b) {
    const lines = [];
    lines.push(`phase: ${b.phase}  goal: ${(b.goal || "").slice(0, 60)}`);
    lines.push(`--- agents ---`);
    for (const [name, a] of Object.entries(b.agents || {})) {
        const task = a.currentTaskId ? `#${a.currentTaskId}` : "-";
        lines.push(`  ${name}: ${a.status} task=${task} role=${a.role}`);
    }
    lines.push(`--- tasks (${(b.tasks || []).length}) ---`);
    for (const t of b.tasks || []) {
        lines.push(`  #${t.id} [${t.status}] ${t.progress || 0}% ${t.assignee || "?"} | ${t.title}`);
    }
    return lines.join("\n");
}

// ─── Commands ───

const [, , cmd, ...args] = process.argv;

try {
    switch (cmd) {
        case "signal": {
            const r = await api("GET", "/signal");
            console.log(r);
            break;
        }

        case "board": {
            const r = await api("GET", "/board");
            console.log(fmtBoard(r));
            break;
        }

        case "wake": {
            const agent = args[0];
            if (!agent) { console.error("Usage: ws wake <agent>"); process.exit(1); }
            const r = await api("POST", "/wake", { agent });
            console.log(`${agent}: ${r.action || r.error || "ok"}`);
            break;
        }

        case "say": {
            const content = args[0];
            if (!content) { console.error("Usage: ws say \"message\""); process.exit(1); }
            const r = await api("POST", "/meeting", { from: "master", content });
            console.log(`posted seq=${r.seq}`);
            break;
        }

        case "dm": {
            const [to, content] = args;
            if (!to || !content) { console.error("Usage: ws dm <agent> \"message\""); process.exit(1); }
            const r = await api("POST", "/dm", { from: "master", to, content });
            console.log("sent");
            break;
        }

        case "task": {
            const sub = args[0];
            if (sub === "create") {
                const title = args[1];
                const assignIdx = args.indexOf("--assign");
                const assignee = assignIdx >= 0 ? args[assignIdx + 1] : null;
                const r = await api("POST", "/board/task", { title, assignee });
                console.log(`created #${r.id} → ${r.assignee || "unassigned"}`);
            } else if (sub === "complete") {
                const [, id, ...rest] = args;
                const summary = rest.join(" ");
                const r = await api("POST", `/board/task/${id}/complete`, { summary });
                console.log(r.ok ? `#${id} completed` : `ERR: ${r.error}`);
            } else if (sub === "progress") {
                const [, id, pct, ...rest] = args;
                const notes = rest.join(" ");
                const r = await api("PATCH", `/board/task/${id}`, { progress: Number(pct), notes });
                console.log(`#${id} → ${pct}%`);
            } else if (sub === "start") {
                const [, id] = args;
                const r = await api("POST", `/board/task/${id}/start`);
                console.log(r.ok ? `#${id} started` : `ERR: ${r.error}`);
            } else {
                console.error("Usage: ws task <create|complete|progress|start> ...");
                process.exit(1);
            }
            break;
        }

        case "merge": {
            const agent = args[0];
            if (!agent) { console.error("Usage: ws merge <agent>"); process.exit(1); }
            const r = await api("POST", "/merge", { agent });
            console.log(r.success ? `${agent} merged` : `ERR: ${r.message || "conflict"}`);
            break;
        }

        case "done": {
            const r = await api("POST", "/done");
            console.log(r.ok ? "COMPLETED" : `ERR: ${r.error}`);
            break;
        }

        case "chat": {
            const since = parseInt(args[0] || "0", 10);
            const r = await api("GET", `/meeting?since=${since}`);
            if (Array.isArray(r)) {
                for (const m of r) {
                    const t = m.ts?.split("T")[1]?.slice(0, 8) || "";
                    console.log(`${m.from}(${t}): ${m.content}`);
                }
                console.log(`--- ${r.length} msgs ---`);
            }
            break;
        }

        default:
            console.log(`ws — Workshop CLI
  signal            status signal
  board             compact board view
  wake <agent>      wake an agent
  say "msg"         post to meeting room
  dm <agent> "msg"  send DM
  task create "title" [--assign agent]
  task complete <id> "summary"
  task progress <id> <pct> "notes"
  task start <id>
  merge <agent>     merge agent's branch
  done              end workshop
  chat [since]      read meeting room`);
    }
} catch (err) {
    console.error(`ERR: ${err.message}`);
    process.exit(1);
}
