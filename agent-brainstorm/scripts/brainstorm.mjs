#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════
// Agent Brainstorm Engine — Async Opinion Collision Space
//
// A discussion server where multiple AI agents (Codex or Claude Code)
// collaborate through structured dialog to explore ideas and converge
// on solutions.
//
// Each agent gets a `discuss.py` CLI tool to interact with the shared
// discussion space at their own pace — reading code, thinking deeply,
// then posting structured opinions.
//
// Usage: node brainstorm.mjs <session-file> [options]
// ═══════════════════════════════════════════════════════════════════════

import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm, readdir, chmod } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { exec } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Agent Colors ───

const AGENT_COLORS = [
  { id: "amber", hex: "#e5a63e" },
  { id: "blue", hex: "#60a5fa" },
  { id: "green", hex: "#4ade80" },
  { id: "purple", hex: "#a78bfa" },
  { id: "rose", hex: "#fb7185" },
  { id: "cyan", hex: "#22d3ee" },
  { id: "orange", hex: "#fb923c" },
  { id: "teal", hex: "#2dd4bf" },
];

const HUMAN_COLOR = { id: "white", hex: "#e8e6e3" };

// ─── Logging ───

function log(level, ...args) {
  const time = new Date().toTimeString().slice(0, 8);
  const prefix = `[${time}] [${level}]`;
  if (level === "ERROR" || level === "FATAL") console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

function fatal(msg) {
  log("FATAL", msg);
  process.exit(1);
}

// ─── CLI Parsing ───

function parseArgs(argv) {
  const config = {
    sessionFile: "",
    port: 0,
    noOpen: false,
    cwd: process.cwd(),
    timeout: 30,
    approvalMode: "full-auto",
    engine: "codex",
    dryRun: false,
    list: false,
    clean: false,
    cleanKeep: 0,
    status: false,
    statusId: "",
  };

  let i = 2;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--port":
        config.port = parseInt(argv[++i], 10);
        i++;
        break;
      case "--no-open":
        config.noOpen = true;
        i++;
        break;
      case "--cwd":
        config.cwd = resolve(argv[++i]);
        i++;
        break;
      case "--timeout":
        config.timeout = parseInt(argv[++i], 10);
        i++;
        break;
      case "--approval-mode":
        config.approvalMode = argv[++i];
        i++;
        break;
      case "--dry-run":
        config.dryRun = true;
        i++;
        break;
      case "--engine":
        config.engine = argv[++i];
        if (!['codex', 'claude'].includes(config.engine)) fatal(`Unknown engine: ${config.engine}. Use 'codex' or 'claude'.`);
        i++;
        break;
      case "--list":
        config.list = true;
        i++;
        break;
      case "--clean":
        config.clean = true;
        if (i + 1 < argv.length && /^\d+$/.test(argv[i + 1])) config.cleanKeep = parseInt(argv[++i], 10);
        i++;
        break;
      case "--status":
        config.status = true;
        if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) config.statusId = argv[++i];
        i++;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      default:
        if (argv[i].startsWith("-")) fatal(`Unknown option: ${argv[i]}`);
        config.sessionFile = argv[i];
        i++;
    }
  }
  return config;
}

function printUsage() {
  console.log(`
Agent Brainstorm — Async Opinion Collision Space

Usage: node brainstorm.mjs <session-file> [options]

Arguments:
  session-file            JSON config with topic + agents definition

Options:
  --port <N>              Server port (default: random)
  --no-open               Don't auto-open browser panel
  --cwd <dir>             Project directory for agents (default: cwd)
  --timeout <min>         Max discussion time in minutes (default: 30)
  --engine <codex|claude> Default agent engine (default: codex)
                          Each agent can override via "engine" field in session JSON
  --approval-mode <mode>  full-auto|auto-edit (default: full-auto)
  --dry-run               Preview execution plan without spawning agents

Management:
  --list                  List past brainstorm sessions
  --status [ID]           Show status of a session (default: latest)
  --clean [N]             Clean old sessions (keep N latest)
  -h, --help              Show this help

Session file format:
  {
    "topic": {
      "title": "Discussion Title",
      "context": "Background context...",
      "goals": ["Goal 1", "Goal 2"],
      "constraints": ["Constraint 1"]
    },
    "agents": [
      {"id": "architect", "name": "系统架构师", "expertise": "System design..."},
      {"id": "security", "name": "安全专家", "expertise": "Security practices..."}
    ],
    "config": {
      "codebase_paths": ["src/", "docs/"],
      "min_rounds": 2
    }
  }
`);
}

// ─── Session Management ───

const SESSIONS_DIR = ".brainstorm";

function generateSessionId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function listSessions(cwd) {
  const dir = join(cwd, SESSIONS_DIR);
  if (!existsSync(dir)) {
    log("INFO", "No brainstorm sessions found");
    return;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const sessions = entries.filter((e) => e.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
  if (sessions.length === 0) {
    log("INFO", "No brainstorm sessions found");
    return;
  }
  console.log(`\n  ${sessions.length} session(s) in ${dir}\n`);
  for (const s of sessions) {
    const stateFile = join(dir, s.name, "state.json");
    let info = "";
    if (existsSync(stateFile)) {
      try {
        const state = JSON.parse(await readFile(stateFile, "utf-8"));
        info = `  ${state.phase}  agents=${state.agentCount}  posts=${state.postCount}  "${state.topic?.title || "?"}"`;
      } catch { }
    }
    console.log(`  ${s.name}${info}`);
  }
  console.log("");
}

async function cleanSessions(cwd, keep) {
  const dir = join(cwd, SESSIONS_DIR);
  if (!existsSync(dir)) {
    log("INFO", "Nothing to clean");
    return;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const sessions = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  // Keep discuss.py and other top-level files
  const toRemove = keep > 0 ? sessions.slice(0, Math.max(0, sessions.length - keep)) : sessions;
  for (const s of toRemove) {
    await rm(join(dir, s.name), { recursive: true, force: true });
    log("INFO", `Removed: ${s.name}`);
  }
  log("INFO", `Cleaned ${toRemove.length} sessions, kept ${sessions.length - toRemove.length}`);
}

async function showSessionStatus(cwd, id) {
  const dir = join(cwd, SESSIONS_DIR);
  if (!id) {
    if (!existsSync(dir)) {
      log("INFO", "No sessions found");
      return;
    }
    const entries = await readdir(dir, { withFileTypes: true });
    const sessions = entries.filter((e) => e.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
    if (sessions.length === 0) {
      log("INFO", "No sessions found");
      return;
    }
    id = sessions[0].name;
  }
  const stateFile = join(dir, id, "state.json");
  if (!existsSync(stateFile)) {
    log("ERROR", `Session ${id} not found or has no state`);
    return;
  }
  const state = JSON.parse(await readFile(stateFile, "utf-8"));
  console.log(`\nSession: ${id}`);
  console.log(`Topic:   ${state.topic?.title}`);
  console.log(`Phase:   ${state.phase}`);
  console.log(`Agents:  ${state.agentCount}`);
  console.log(`Posts:   ${state.postCount}`);
  console.log(`Elapsed: ${Math.round((state.elapsed || 0) / 1000)}s\n`);
}

// ─── Discussion Space (Core State) ───

class DiscussionSpace extends EventEmitter {
  #nextColorIdx = 0;

  constructor(topic, agentDefs) {
    super();
    this.topic = topic;
    this.agents = new Map();
    this.posts = [];
    this.phase = "exploring"; // exploring → debating → converging → synthesizing → concluded
    this.concludeVotes = new Set();
    this.synthesis = null;
    this.startTime = Date.now();
    this.endTime = null;
    this.lastReadCursor = new Map(); // agent_id → last post id read

    // Register agents (engine field already resolved by resolveAgentEngines)
    agentDefs.forEach((a, i) => {
      this.agents.set(a.id, {
        ...a,
        color: AGENT_COLORS[i % AGENT_COLORS.length],
        isHuman: false,
        status: "thinking",
        activity: null, // { text, icon, timestamp }
        postCount: 0,
        joinedAt: Date.now(),
        lastActiveAt: null,
      });
    });
    this.#nextColorIdx = agentDefs.length;
  }

  // Auto-register unknown agent_ids as human participants
  ensureAgent(agent_id, displayName) {
    if (this.agents.has(agent_id)) return;
    const name = displayName || agent_id;
    const isHumanId = agent_id === "human" || agent_id.startsWith("human");
    const color = isHumanId ? HUMAN_COLOR : AGENT_COLORS[this.#nextColorIdx++ % AGENT_COLORS.length];
    this.agents.set(agent_id, {
      id: agent_id,
      name,
      expertise: isHumanId ? "Human observer & decision maker" : "Ad-hoc participant",
      color,
      isHuman: true,
      status: "active",
      activity: null,
      postCount: 0,
      joinedAt: Date.now(),
      lastActiveAt: null,
    });
    this.emit("update", { type: "agent_joined", agent: this.agents.get(agent_id) });
    log("INFO", `Human participant joined: ${name} (${agent_id})`);
  }

  updateAgentActivity(agent_id, activity) {
    const agent = this.agents.get(agent_id);
    if (!agent) return;
    agent.activity = { ...activity, timestamp: Date.now() };
    agent.lastActiveAt = Date.now();
    this.emit("update", { type: "agent_activity", agent_id, activity: agent.activity });
  }

  addPost({ agent_id, type, content, references = [] }) {
    // Auto-register unknown agents (human participants from panel)
    this.ensureAgent(agent_id);

    const id = this.posts.length + 1;
    const entry = { id, agent_id, type, content, references, reactions: [], timestamp: Date.now() };
    this.posts.push(entry);

    const agent = this.agents.get(agent_id);
    if (agent) {
      agent.postCount++;
      agent.status = "active";
      agent.lastActiveAt = Date.now();
      agent.activity = { text: `Posted ${type}`, timestamp: Date.now() };
    }

    this.#checkPhaseTransition();
    this.emit("update", { type: "new_post", post: entry });
    return entry;
  }

  addReaction({ agent_id, post_id, reaction, comment = "" }) {
    const post = this.posts.find((p) => p.id === post_id);
    if (!post) return null;
    const entry = { agent_id, reaction, comment, timestamp: Date.now() };
    post.reactions.push(entry);
    this.emit("update", { type: "reaction", post_id, reaction: entry });
    this.#checkPhaseTransition();
    return entry;
  }

  voteConclude(agent_id, summary) {
    this.concludeVotes.add(agent_id);
    const post = this.addPost({ agent_id, type: "conclude_vote", content: summary });
    return post;
  }

  getPostsSince(agent_id) {
    const cursor = this.lastReadCursor.get(agent_id) || 0;
    const newPosts = this.posts.filter((p) => p.id > cursor);
    if (this.posts.length > 0) this.lastReadCursor.set(agent_id, this.posts[this.posts.length - 1].id);
    return newPosts;
  }

  markAgentDone(agent_id) {
    const agent = this.agents.get(agent_id);
    if (agent) {
      agent.status = "done";
      agent.activity = { text: "Session completed", timestamp: Date.now() };
      this.emit("update", { type: "agent_status", agent_id, status: "done" });
    }
    // Check if all non-human agents are done
    const codexAgents = [...this.agents.values()].filter((a) => !a.isHuman);
    const allDone = codexAgents.length > 0 && codexAgents.every((a) => a.status === "done" || a.status === "failed");
    if (allDone && this.phase !== "concluded") this.#setPhase("concluded");
  }

  markAgentFailed(agent_id, error) {
    const agent = this.agents.get(agent_id);
    if (agent) {
      agent.status = "failed";
      agent.error = error;
      this.emit("update", { type: "agent_status", agent_id, status: "failed", error });
    }
  }

  setSynthesis(content) {
    this.synthesis = content;
    this.emit("update", { type: "synthesis", content });
  }

  #checkPhaseTransition() {
    // Only count Codex agents for phase transitions (humans don't block progress)
    const codexAgents = [...this.agents.values()].filter((a) => !a.isHuman);
    const agentCount = codexAgents.length;
    if (agentCount === 0) return;

    const codexIds = new Set(codexAgents.map((a) => a.id));
    const agentsWithPosts = new Set(this.posts.map((p) => p.agent_id).filter((id) => codexIds.has(id)));

    // exploring → debating: all codex agents posted at least 1 opinion
    if (this.phase === "exploring" && agentsWithPosts.size >= agentCount) {
      this.#setPhase("debating");
    }

    // debating → converging: more agreements than challenges in recent interactions
    if (this.phase === "debating") {
      const allReactions = this.posts.flatMap((p) => p.reactions);
      const agrees = allReactions.filter((r) => r.reaction === "agree" || r.reaction === "build-on").length;
      const challenges = allReactions.filter((r) => r.reaction === "challenge").length;
      const responses = this.posts.filter((p) => p.type === "response").length;
      if (responses >= agentCount && agrees > challenges) {
        this.#setPhase("converging");
      }
    }

    // converging → synthesizing: majority voted to conclude
    if (this.phase === "converging" && this.concludeVotes.size > agentCount / 2) {
      this.#setPhase("synthesizing");
    }
  }

  #setPhase(phase) {
    this.phase = phase;
    if (phase === "concluded" || phase === "synthesizing") this.endTime = Date.now();
    this.emit("update", { type: "phase_change", phase });
    log("INFO", `Phase → ${phase}`);
  }

  forcePhase(phase) {
    this.#setPhase(phase);
  }

  getState() {
    return {
      topic: this.topic,
      phase: this.phase,
      agents: Object.fromEntries(this.agents),
      posts: this.posts,
      concludeVotes: [...this.concludeVotes],
      synthesis: this.synthesis,
      startTime: this.startTime,
      endTime: this.endTime,
      elapsed: (this.endTime || Date.now()) - this.startTime,
      agentCount: this.agents.size,
      postCount: this.posts.length,
    };
  }

  getTopicView() {
    return {
      ...this.topic,
      phase: this.phase,
      agentCount: this.agents.size,
      totalPosts: this.posts.length,
      convergence: this.#convergenceScore(),
    };
  }

  getStatusView() {
    return {
      phase: this.phase,
      agentCount: this.agents.size,
      totalPosts: this.posts.length,
      convergence: this.#convergenceScore(),
      concludeVotes: this.concludeVotes.size,
      elapsed: (this.endTime || Date.now()) - this.startTime,
      agents: [...this.agents.values()].map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        postCount: a.postCount,
      })),
    };
  }

  #convergenceScore() {
    const agentCount = this.agents.size;
    if (agentCount === 0) return 0;
    const allReactions = this.posts.flatMap((p) => p.reactions);
    const agrees = allReactions.filter((r) => r.reaction === "agree" || r.reaction === "build-on").length;
    const challenges = allReactions.filter((r) => r.reaction === "challenge").length;
    const concludeRatio = this.concludeVotes.size / agentCount;
    const agreementRatio = agrees + challenges > 0 ? agrees / (agrees + challenges) : 0;
    return Math.min(1, concludeRatio * 0.5 + agreementRatio * 0.3 + (this.posts.length > agentCount * 2 ? 0.2 : 0));
  }
}

// ─── HTTP Server ───

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

async function startServer(space, port) {
  const panelPath = join(__dirname, "panel.html");
  let panelHtml = "<html><body><h1>panel.html not found</h1></body></html>";
  if (existsSync(panelPath)) panelHtml = await readFile(panelPath, "utf-8");

  return new Promise((resolveStart) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost`);
      const path = url.pathname;

      // CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      try {
        // ─── Panel ───
        if (path === "/" || path === "/index.html") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(panelHtml);
          return;
        }

        // ─── API: Topic ───
        if (path === "/api/topic" && req.method === "GET") {
          jsonResponse(res, 200, space.getTopicView());
          return;
        }

        // ─── API: Posts ───
        if (path === "/api/posts" && req.method === "GET") {
          const sinceAgent = url.searchParams.get("since_last");
          if (sinceAgent) {
            jsonResponse(res, 200, { posts: space.getPostsSince(sinceAgent) });
          } else {
            jsonResponse(res, 200, { posts: space.posts });
          }
          return;
        }

        // ─── API: Post ───
        if (path === "/api/post" && req.method === "POST") {
          const body = await parseBody(req);
          if (!body.agent_id || !body.content) {
            jsonResponse(res, 400, { error: "agent_id and content are required" });
            return;
          }
          // Auto-register human participants (display_name is optional)
          space.ensureAgent(body.agent_id, body.display_name);
          const post = space.addPost({
            agent_id: body.agent_id,
            type: body.type || "opinion",
            content: body.content,
            references: body.references || [],
          });
          jsonResponse(res, 201, post);
          return;
        }

        // ─── API: React ───
        if (path === "/api/react" && req.method === "POST") {
          const body = await parseBody(req);
          if (!body.agent_id || !body.post_id || !body.reaction) {
            jsonResponse(res, 400, { error: "agent_id, post_id, and reaction are required" });
            return;
          }
          const reaction = space.addReaction({
            agent_id: body.agent_id,
            post_id: body.post_id,
            reaction: body.reaction,
            comment: body.comment || "",
          });
          if (!reaction) {
            jsonResponse(res, 404, { error: `Post ${body.post_id} not found` });
            return;
          }
          jsonResponse(res, 201, reaction);
          return;
        }

        // ─── API: Conclude ───
        if (path === "/api/conclude" && req.method === "POST") {
          const body = await parseBody(req);
          if (!body.agent_id || !body.summary) {
            jsonResponse(res, 400, { error: "agent_id and summary are required" });
            return;
          }
          const post = space.voteConclude(body.agent_id, body.summary);
          jsonResponse(res, 201, { voted: true, post });
          return;
        }

        // ─── API: Status ───
        if (path === "/api/status" && req.method === "GET") {
          jsonResponse(res, 200, space.getStatusView());
          return;
        }

        // ─── API: Full State (for panel) ───
        if (path === "/api/state" && req.method === "GET") {
          jsonResponse(res, 200, space.getState());
          return;
        }

        // ─── SSE Stream ───
        if (path === "/api/events" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });
          res.flushHeaders();

          // Send initial snapshot
          res.write(`data: ${JSON.stringify({ type: "snapshot", state: space.getState() })}\n\n`);

          const onUpdate = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
          space.on("update", onUpdate);

          const hb = setInterval(() => res.write(": ping\n\n"), 15000);
          req.on("close", () => {
            clearInterval(hb);
            space.off("update", onUpdate);
          });
          return;
        }

        // 404
        res.writeHead(404);
        res.end("Not Found");
      } catch (err) {
        log("ERROR", `API error: ${err.message}`);
        jsonResponse(res, 500, { error: err.message });
      }
    });

    server.listen(port, () => resolveStart({ server, port: server.address().port }));
  });
}

// ─── Discuss Tool Generation ───

function generateDiscussPy(port) {
  return `#!/usr/bin/env python3
"""Discussion Space CLI — interact with the brainstorming session.

Auto-generated by Brainstorm Engine. Server: http://127.0.0.1:${port}
"""
import sys, json, urllib.request

SERVER = "http://127.0.0.1:${port}"

def api(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"{SERVER}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read()) if e.headers.get("Content-Type", "").startswith("application/json") else {"error": str(e)}
        print(json.dumps(err, indent=2, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Connection error: {e}", file=sys.stderr)
        sys.exit(1)

def out(obj):
    if obj is not None:
        print(json.dumps(obj, indent=2, ensure_ascii=False))

def read_content(args, idx):
    if len(args) > idx:
        return " ".join(args[idx:])
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    print("Error: content required. Pass as argument or pipe via stdin.", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("""Discussion Space CLI

Usage: python3 discuss.py <agent_id> <command> [args...]

Commands:
  topic                 Read the discussion topic and current summary
  posts                 Read all posts
  new                   Read only new posts since your last check
  post <content>        Post your opinion
  respond <id> <text>   Respond to a specific post (id = post number)
  propose <content>     Post a concrete proposal
  agree <id> [comment]  Agree with a post
  challenge <id> <why>  Challenge a post with reasoning
  build <id> <addition> Build on someone's idea
  conclude <summary>    Vote to conclude the discussion
  status                Check convergence status

Examples:
  python3 discuss.py architect topic
  python3 discuss.py architect post "I think we should use event sourcing because..."
  python3 discuss.py architect respond 3 "Good point, but consider the latency impact..."
  python3 discuss.py architect agree 5
  python3 discuss.py architect challenge 2 "This approach has security implications..."
  echo "Long multi-line analysis..." | python3 discuss.py architect post
""")
        return

    agent_id = sys.argv[1]
    cmd = sys.argv[2]

    if cmd == "topic":
        out(api("GET", "/api/topic"))
    elif cmd == "posts":
        out(api("GET", "/api/posts"))
    elif cmd == "new":
        out(api("GET", f"/api/posts?since_last={agent_id}"))
    elif cmd == "post":
        content = read_content(sys.argv, 3)
        out(api("POST", "/api/post", {"agent_id": agent_id, "type": "opinion", "content": content}))
    elif cmd == "respond":
        post_id = int(sys.argv[3])
        content = read_content(sys.argv, 4)
        out(api("POST", "/api/post", {"agent_id": agent_id, "type": "response", "content": content, "references": [post_id]}))
    elif cmd == "propose":
        content = read_content(sys.argv, 3)
        out(api("POST", "/api/post", {"agent_id": agent_id, "type": "proposal", "content": content}))
    elif cmd == "agree":
        comment = " ".join(sys.argv[4:]) if len(sys.argv) > 4 else ""
        out(api("POST", "/api/react", {"agent_id": agent_id, "post_id": int(sys.argv[3]), "reaction": "agree", "comment": comment}))
    elif cmd == "challenge":
        comment = read_content(sys.argv, 4) if len(sys.argv) > 4 else ""
        out(api("POST", "/api/react", {"agent_id": agent_id, "post_id": int(sys.argv[3]), "reaction": "challenge", "comment": comment}))
    elif cmd == "build":
        comment = read_content(sys.argv, 4) if len(sys.argv) > 4 else ""
        out(api("POST", "/api/react", {"agent_id": agent_id, "post_id": int(sys.argv[3]), "reaction": "build-on", "comment": comment}))
    elif cmd == "conclude":
        summary = read_content(sys.argv, 3)
        out(api("POST", "/api/conclude", {"agent_id": agent_id, "summary": summary}))
    elif cmd == "status":
        out(api("GET", "/api/status"))
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
}

// ─── Agent Prompt Generation ───

function buildAgentPrompt(agent, topic, allAgents, port) {
  const otherAgents = allAgents.filter((a) => a.id !== agent.id);
  const othersList = otherAgents.map((a) => `- **${a.name}** (${a.id}): ${a.expertise}`).join("\n");

  return `# 你的身份

你是 **${agent.name}** (ID: \`${agent.id}\`)，正在参与一场多专家头脑风暴讨论。

你的专业领域: ${agent.expertise}

## 讨论议题

**${topic.title}**

${topic.context}

### 目标
${(topic.goals || []).map((g) => `- ${g}`).join("\n")}

### 约束
${(topic.constraints || []).map((c) => `- ${c}`).join("\n")}

## 其他参与者

${othersList}

## 讨论工具

你有一个 CLI 工具来参与讨论。所有命令格式:

\`\`\`bash
python3 .brainstorm/discuss.py ${agent.id} <command> [args...]
\`\`\`

核心命令:
- \`python3 .brainstorm/discuss.py ${agent.id} topic\` — 查看议题和当前状态
- \`python3 .brainstorm/discuss.py ${agent.id} posts\` — 查看所有已发表的观点
- \`python3 .brainstorm/discuss.py ${agent.id} new\` — 只查看自上次以来的新观点
- \`python3 .brainstorm/discuss.py ${agent.id} post "你的观点..."\` — 发表观点
- \`python3 .brainstorm/discuss.py ${agent.id} respond <帖子编号> "回应内容..."\` — 回应某个观点
- \`python3 .brainstorm/discuss.py ${agent.id} propose "方案内容..."\` — 提出具体方案
- \`python3 .brainstorm/discuss.py ${agent.id} agree <帖子编号>\` — 同意某个观点
- \`python3 .brainstorm/discuss.py ${agent.id} challenge <帖子编号> "理由..."\` — 质疑某个观点
- \`python3 .brainstorm/discuss.py ${agent.id} build <帖子编号> "补充..."\` — 在某个观点上扩展
- \`python3 .brainstorm/discuss.py ${agent.id} conclude "总结..."\` — 投票结束讨论
- \`python3 .brainstorm/discuss.py ${agent.id} status\` — 查看讨论状态和收敛度

对于长内容，可以通过 heredoc 传入:
\`\`\`bash
python3 .brainstorm/discuss.py ${agent.id} post <<'OPINION'
## 我的分析

经过深入分析，我认为...

1. 第一点...
2. 第二点...
OPINION
\`\`\`

## 行为准则

### 第一阶段: 深度分析 (Explore)
1. **先阅读代码**。在发表任何观点之前，花时间阅读与议题相关的项目代码和文档。
   ${(topic.codebase_paths || []).length > 0 ? `重点关注: ${topic.codebase_paths.join(", ")}` : "浏览项目结构，理解上下文。"}
2. 用 \`posts\` 命令查看其他人是否已经发表了观点。
3. 基于你的专业领域和代码分析，发表你的**首个深度观点**。
   - 观点必须有理有据，引用具体的代码或技术细节
   - 不要泛泛而谈，要具体到方案和实现路径

### 第二阶段: 碰撞与回应 (Engage)
4. 用 \`new\` 命令检查其他专家的新观点。
5. **认真阅读**每个观点，结合你的专业视角:
   - 同意的用 \`agree\`
   - 有不同看法的用 \`challenge\` 并给出理由
   - 有补充的用 \`build\` 扩展
   - 对于重要分歧，用 \`respond\` 发表完整回应
6. 如果没有新观点，花时间做更深入的分析，然后发表新的洞察。

### 第三阶段: 收敛 (Converge)
7. 再次检查新观点，回应所有未处理的分歧。
8. 当你认为讨论已经产生了足够的共识，或者你已经充分表达了你的观点:
   - 用 \`propose\` 提出你认为最佳的综合方案
   - 或用 \`conclude\` 投票结束，并写一段总结

### 关键原则
- **质量优于速度**: 花足够时间阅读和思考，不要急于发表浅层观点
- **证据驱动**: 引用代码、文档或技术事实，避免空洞的意见
- **建设性对抗**: 质疑时要给出理由和替代方案，不要只否定
- **保持焦点**: 始终围绕议题和目标展开讨论
- **至少发表 3 次**: 首次观点 + 回应他人 + 结论/方案

开始吧。先阅读代码，理解上下文，然后参与讨论。`;
}

// ─── Agent Orchestration (Dual-Engine) ───

// Codex SDK mode mapping
const CODEX_MODE_MAP = {
  "full-auto": { approvalPolicy: "never", sandboxMode: "workspace-write" },
  "auto-edit": { approvalPolicy: "on-failure", sandboxMode: "workspace-write" },
  suggest: { approvalPolicy: "on-request", sandboxMode: "workspace-write" },
};

// Claude Agent SDK permission mapping
const CLAUDE_MODE_MAP = {
  "full-auto": "bypassPermissions",
  "auto-edit": "acceptEdits",
  suggest: "default",
};

async function spawnCodexAgent(sdk, agent, prompt, config, space) {
  const mode = CODEX_MODE_MAP[config.approvalMode] || CODEX_MODE_MAP["full-auto"];

  const thread = sdk.startThread({
    approvalPolicy: mode.approvalPolicy,
    sandboxMode: mode.sandboxMode,
    workingDirectory: config.cwd,
    networkAccessEnabled: true,
    skipGitRepoCheck: true,
  });

  const streamed = await thread.runStreamed(prompt);
  for await (const event of streamed.events) {
    if (event.type === "item.started" && event.item.type === "agent_message") {
      const preview = event.item.text.slice(0, 80).replace(/\n/g, " ");
      log("INFO", `  ${agent.id} | MSG ${preview}...`);
      space.updateAgentActivity(agent.id, { text: preview });
    }
    if (event.type === "item.started" && event.item.type === "command_execution") {
      const cmd = event.item.command.slice(0, 100);
      log("INFO", `  ${agent.id} | RUN ${cmd}`);
      space.updateAgentActivity(agent.id, { text: cmd });
    }
    if (event.type === "item.started" && event.item.type === "file_change") {
      const files = event.item.changes?.map((c) => `${c.kind} ${c.path}`).join(", ") || "files";
      space.updateAgentActivity(agent.id, { text: files });
    }
    if (event.type === "item.started" && event.item.type === "reasoning") {
      space.updateAgentActivity(agent.id, { text: "Thinking..." });
    }
    if (event.type === "turn.completed") {
      log("INFO", `  ${agent.id} | tokens: in=${event.usage.input_tokens} out=${event.usage.output_tokens}`);
      space.updateAgentActivity(agent.id, { text: `Tokens: ${event.usage.input_tokens} in, ${event.usage.output_tokens} out` });
    }
  }
}

async function spawnClaudeAgent(sdk, agent, prompt, config, space) {
  const permissionMode = CLAUDE_MODE_MAP[config.approvalMode] || CLAUDE_MODE_MAP["full-auto"];

  const q = sdk.query({
    prompt,
    options: {
      cwd: config.cwd,
      model: "claude-sonnet-4-20250514",
      permissionMode,
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["project"],
      maxTurns: 30,
    },
  });

  for await (const msg of q) {
    if (msg.type === "system" && msg.subtype === "init") {
      log("INFO", `  ${agent.id} | INIT model=${msg.model} tools=${msg.tools?.length || 0}`);
      space.updateAgentActivity(agent.id, { text: `Initializing (${msg.model})` });
    }
    if (msg.type === "assistant") {
      // Extract text content from assistant messages
      const textBlocks = msg.message.content?.filter((b) => b.type === "text") || [];
      const toolBlocks = msg.message.content?.filter((b) => b.type === "tool_use") || [];
      if (textBlocks.length > 0) {
        const preview = textBlocks.map((b) => b.text).join(" ").slice(0, 80).replace(/\n/g, " ");
        log("INFO", `  ${agent.id} | MSG ${preview}...`);
        space.updateAgentActivity(agent.id, { text: preview });
      }
      if (toolBlocks.length > 0) {
        for (const tb of toolBlocks) {
          const toolName = tb.name || "tool";
          const input = typeof tb.input === "string" ? tb.input.slice(0, 80) : JSON.stringify(tb.input || {}).slice(0, 80);
          log("INFO", `  ${agent.id} | RUN ${toolName}: ${input}`);
          space.updateAgentActivity(agent.id, { text: `${toolName}: ${input}` });
        }
      }
    }
    if (msg.type === "result") {
      const usage = msg.usage || {};
      log("INFO", `  ${agent.id} | tokens: in=${usage.input_tokens || 0} out=${usage.output_tokens || 0} cost=$${msg.total_cost_usd?.toFixed(4) || "?"}`);
      space.updateAgentActivity(agent.id, { text: `Done (${msg.num_turns || 0} turns, $${msg.total_cost_usd?.toFixed(4) || "?"})` });
    }
  }
}

// ─── Engine Resolution ───

function resolveAgentEngines(agents, defaultEngine) {
  const valid = new Set(["codex", "claude"]);
  for (const a of agents) {
    a.engine = a.engine || defaultEngine;
    if (!valid.has(a.engine)) fatal(`Agent "${a.id}" has invalid engine: "${a.engine}". Use 'codex' or 'claude'.`);
  }
  const codexCount = agents.filter((a) => a.engine === "codex").length;
  const claudeCount = agents.filter((a) => a.engine === "claude").length;
  return { needsCodex: codexCount > 0, needsClaude: claudeCount > 0, codexCount, claudeCount };
}

async function loadSdks({ needsCodex, needsClaude }, dryRun) {
  const sdks = { codex: null, claude: null };
  if (dryRun) return sdks;
  if (needsCodex) {
    try {
      const mod = await import("@openai/codex-sdk");
      sdks.codex = new mod.Codex();
    } catch (err) {
      fatal(`Cannot load @openai/codex-sdk: ${err.message}\n  Run: cd ${resolve(__dirname, "..")} && npm install`);
    }
  }
  if (needsClaude) {
    try {
      sdks.claude = await import("@anthropic-ai/claude-agent-sdk");
    } catch (err) {
      fatal(`Cannot load @anthropic-ai/claude-agent-sdk: ${err.message}\n  Run: cd ${resolve(__dirname, "..")} && npm install`);
    }
  }
  return sdks;
}

async function spawnAgent(sdks, agent, prompt, config, space) {
  const engine = agent.engine;
  log("INFO", `Spawning agent: ${agent.name} (${agent.id}) [${engine}]`);
  space.agents.get(agent.id).status = "running";
  space.emit("update", { type: "agent_status", agent_id: agent.id, status: "running" });

  if (config.dryRun) {
    log("INFO", `  [DRY-RUN] ${agent.id}: would send ${prompt.length} chars prompt`);
    await new Promise((r) => setTimeout(r, 300));
    space.markAgentDone(agent.id);
    return { agent_id: agent.id, success: true, dryRun: true };
  }

  try {
    if (engine === "claude") {
      await spawnClaudeAgent(sdks.claude, agent, prompt, config, space);
    } else {
      await spawnCodexAgent(sdks.codex, agent, prompt, config, space);
    }
    space.markAgentDone(agent.id);
    log("INFO", `Agent ${agent.id} completed`);
    return { agent_id: agent.id, success: true };
  } catch (err) {
    space.markAgentFailed(agent.id, err.message);
    log("ERROR", `Agent ${agent.id} failed: ${err.message}`);
    return { agent_id: agent.id, success: false, error: err.message };
  }
}

// ─── Synthesis Report ───

async function writeSynthesis(space, sessionDir) {
  const state = space.getState();
  const agents = [...space.agents.values()];
  const postsByType = { opinion: [], response: [], proposal: [], conclude_vote: [] };
  for (const p of state.posts) {
    (postsByType[p.type] || (postsByType[p.type] = [])).push(p);
  }

  const lines = [];
  lines.push(`# 🧠 Brainstorm Synthesis`);
  lines.push("");
  lines.push(`## Topic: ${state.topic.title}`);
  lines.push("");
  lines.push(`**Context:** ${state.topic.context}`);
  lines.push("");
  lines.push(`**Duration:** ${Math.round(state.elapsed / 1000)}s | **Agents:** ${agents.length} | **Posts:** ${state.posts.length}`);
  lines.push("");

  // Agents summary
  lines.push(`## Participants`);
  lines.push("");
  for (const a of agents) {
    const icon = a.status === "done" ? "✅" : a.status === "failed" ? "❌" : "⏳";
    lines.push(`- ${icon} **${a.name}** (${a.id}) — ${a.postCount} posts`);
  }
  lines.push("");

  // Key opinions
  if (postsByType.opinion.length > 0) {
    lines.push(`## Key Opinions`);
    lines.push("");
    for (const p of postsByType.opinion) {
      const agent = space.agents.get(p.agent_id);
      lines.push(`### ${agent?.name || p.agent_id}`);
      lines.push("");
      lines.push(p.content);
      lines.push("");
      if (p.reactions.length > 0) {
        const agrees = p.reactions.filter((r) => r.reaction === "agree" || r.reaction === "build-on").length;
        const challenges = p.reactions.filter((r) => r.reaction === "challenge").length;
        lines.push(`> 👍 ${agrees} agree | ⚡ ${challenges} challenge`);
        lines.push("");
      }
    }
  }

  // Proposals
  if (postsByType.proposal.length > 0) {
    lines.push(`## Proposals`);
    lines.push("");
    for (const p of postsByType.proposal) {
      const agent = space.agents.get(p.agent_id);
      lines.push(`### ${agent?.name || p.agent_id}'s Proposal`);
      lines.push("");
      lines.push(p.content);
      lines.push("");
    }
  }

  // Conclude summaries
  if (postsByType.conclude_vote.length > 0) {
    lines.push(`## Conclusion Votes`);
    lines.push("");
    for (const p of postsByType.conclude_vote) {
      const agent = space.agents.get(p.agent_id);
      lines.push(`### ${agent?.name || p.agent_id}`);
      lines.push("");
      lines.push(p.content);
      lines.push("");
    }
  }

  // Full discussion log
  lines.push(`## Full Discussion Log`);
  lines.push("");
  for (const p of state.posts) {
    const agent = space.agents.get(p.agent_id);
    const ts = new Date(p.timestamp).toTimeString().slice(0, 8);
    const typeLabel = { opinion: "💡", response: "↩️", proposal: "📋", conclude_vote: "🏁" }[p.type] || "💬";
    lines.push(`**[${ts}] ${typeLabel} ${agent?.name || p.agent_id}** (#${p.id})`);
    if (p.references.length > 0) lines.push(`  _re: #${p.references.join(", #")}_`);
    lines.push("");
    lines.push(p.content);
    lines.push("");
    if (p.reactions.length > 0) {
      for (const r of p.reactions) {
        const ra = space.agents.get(r.agent_id);
        const icon = { agree: "👍", challenge: "⚡", "build-on": "🔨" }[r.reaction] || "💬";
        lines.push(`  ${icon} ${ra?.name || r.agent_id}${r.comment ? `: ${r.comment}` : ""}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  const content = lines.join("\n");
  const filePath = join(sessionDir, "synthesis.md");
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

// ─── State Persistence ───

async function persistState(space, sessionDir) {
  const state = space.getState();
  await writeFile(join(sessionDir, "state.json"), JSON.stringify(state, null, 2), "utf-8");
}

// ─── Browser ───

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`);
}

// ─── Main ───

async function main() {
  const config = parseArgs(process.argv);

  // Management commands
  if (config.list) {
    await listSessions(config.cwd);
    return;
  }
  if (config.clean) {
    await cleanSessions(config.cwd, config.cleanKeep);
    return;
  }
  if (config.status) {
    await showSessionStatus(config.cwd, config.statusId);
    return;
  }

  if (!config.sessionFile) fatal("Session file required. Use --help for usage.");
  if (!existsSync(config.sessionFile)) fatal(`Session file not found: ${config.sessionFile}`);

  // Load session config
  const session = JSON.parse(await readFile(config.sessionFile, "utf-8"));
  if (!session.topic?.title) fatal("Session file must have topic.title");
  if (!session.agents || session.agents.length < 2) fatal("At least 2 agents required");

  // Apply session-level config
  if (session.config?.codebase_paths) session.topic.codebase_paths = session.config.codebase_paths;

  // Resolve per-agent engines (agent.engine || --engine default)
  const engineInfo = resolveAgentEngines(session.agents, config.engine);

  // Create session directory
  const sessionId = generateSessionId();
  const brainstormDir = join(config.cwd, SESSIONS_DIR);
  const sessionDir = join(brainstormDir, sessionId);
  await mkdir(sessionDir, { recursive: true });

  // Initialize discussion space
  const space = new DiscussionSpace(session.topic, session.agents);

  // Start server
  const { server, port } = await startServer(space, config.port);
  const url = `http://localhost:${port}`;

  // Write discuss.py tool
  const discussPy = generateDiscussPy(port);
  const discussDir = join(config.cwd, SESSIONS_DIR);
  await mkdir(discussDir, { recursive: true });
  const discussPath = join(discussDir, "discuss.py");
  await writeFile(discussPath, discussPy, "utf-8");
  await chmod(discussPath, 0o755);

  // Persist state periodically
  const persistInterval = setInterval(() => persistState(space, sessionDir), 5000);
  await persistState(space, sessionDir);

  // Banner
  log("INFO", "┌──────────────────────────────────────┐");
  log("INFO", "│  🧠 Agent Brainstorm Engine           │");
  log("INFO", "└──────────────────────────────────────┘");
  log("INFO", `Panel:    ${url}`);
  log("INFO", `Session:  ${sessionId}`);
  log("INFO", `Topic:    ${session.topic.title}`);
  log("INFO", `Agents:   ${session.agents.length} — ${session.agents.map((a) => `${a.name}[${a.engine}]`).join(", ")}`);
  const engineLabel = (engineInfo.needsCodex && engineInfo.needsClaude)
    ? `mixed (${engineInfo.codexCount} codex, ${engineInfo.claudeCount} claude)`
    : config.engine;
  log("INFO", `Engine:   ${engineLabel}`);
  log("INFO", `Mode:     ${config.approvalMode}`);
  log("INFO", `Timeout:  ${config.timeout}min`);
  log("INFO", `Dry-run:  ${config.dryRun}`);
  log("INFO", `Tool:     ${discussPath}`);
  log("INFO", `Logs:     ${sessionDir}`);
  console.log("");

  if (!config.noOpen) openBrowser(url);

  // ─── SIGINT Protection (only during active discussion) ───
  let discussionActive = true;
  let sigintCount = 0;
  process.on("SIGINT", async () => {
    if (discussionActive) {
      sigintCount++;
      if (sigintCount >= 3) {
        log("WARN", "Force-killing (3x SIGINT). State may be incomplete.");
        await persistState(space, sessionDir);
        process.exit(1);
      }
      log("WARN", `Discussion still active — Ctrl+C blocked (${sigintCount}/3 to force-kill)`);
      return;
    }
    // Post-completion: immediate exit
    process.exit(0);
  });

  // Init SDKs (only loads what's needed)
  const sdks = await loadSdks(engineInfo, config.dryRun);

  // Spawn all agents in parallel
  const prompts = session.agents.map((a) => buildAgentPrompt(a, session.topic, session.agents, port));
  const agentPromises = session.agents.map((agent, i) => spawnAgent(sdks, agent, prompts[i], config, space));

  // Timeout guard
  const timeoutMs = config.timeout * 60 * 1000;
  const timeoutTimer = setTimeout(() => {
    log("WARN", `Timeout reached (${config.timeout}min). Forcing conclusion.`);
    space.forcePhase("concluded");
    for (const [id, agent] of space.agents) {
      if (agent.status === "running" || agent.status === "thinking") {
        space.markAgentDone(id);
      }
    }
  }, timeoutMs);

  // Wait for all agents to complete
  const results = await Promise.allSettled(agentPromises);
  clearTimeout(timeoutTimer);

  // Generate synthesis
  const synthPath = await writeSynthesis(space, sessionDir);
  clearInterval(persistInterval);
  await persistState(space, sessionDir);

  // ─── Discussion complete ───
  discussionActive = false;

  console.log("");
  log("INFO", "── Results ──");
  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value?.success).length;
  const failed = results.filter((r) => r.status === "rejected" || !r.value?.success).length;
  log("INFO", `Agents: ✓ ${succeeded}  ✗ ${failed}`);
  log("INFO", `Posts:  ${space.posts.length}`);
  log("INFO", `Phase:  ${space.phase}`);
  log("INFO", `Report: ${synthPath}`);

  // Grace period for panel to receive final SSE events, then clean exit
  log("INFO", "Shutting down in 3s (panel retains full discussion)...");
  await new Promise((r) => setTimeout(r, 3000));
  server.close();
  log("INFO", "Done.");
  process.exit(0);
}

main().catch((err) => fatal(err.message));
