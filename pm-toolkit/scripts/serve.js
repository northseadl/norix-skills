#!/usr/bin/env node

/**
 * PM Toolkit — Single-file preview server
 *
 * Serves panel.html and provides read/write API for ONE Mermaid file.
 *
 *   GET  /              → panel HTML
 *   GET  /api/read      → { source, mtime }
 *   POST /api/write     → body: { source } → saves to file
 *
 * Usage: node serve.js --file <path.mmd> [--port 9876]
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const getArg = (n, fb) => { const i = args.indexOf("--" + n); return i !== -1 && args[i + 1] ? args[i + 1] : fb; };

const FILE = path.resolve(getArg("file", ""));
const PORT = parseInt(getArg("port", "9876"), 10);
const MAX_BODY_BYTES = 1024 * 1024;

if (!FILE) { console.error("用法: node serve.js --file <path.mmd>"); process.exit(1); }
if (!fs.existsSync(FILE)) { console.error("文件不存在: " + FILE); process.exit(1); }

const PANEL = fs.readFileSync(path.join(__dirname, "panel.html"), "utf-8");
const FNAME = path.basename(FILE);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, type = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    sendText(res, 200, PANEL, "text/html; charset=utf-8");
    return;
  }

  if (url.pathname === "/api/read") {
    try {
      const source = fs.readFileSync(FILE, "utf-8");
      const mtime = fs.statSync(FILE).mtimeMs;
      sendJson(res, 200, { file: FNAME, source, mtime });
    } catch (e) {
      sendText(res, 500, e.message || "Read failed");
    }
    return;
  }

  if (url.pathname === "/api/write" && req.method === "POST") {
    let body = "", size = 0, tooLarge = false;
    req.on("data", c => {
      if (tooLarge) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        sendText(res, 413, "Payload too large");
        req.destroy();
        return;
      }
      body += c;
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          sendText(res, 400, "Invalid JSON");
          return;
        }
        const { source } = parsed;
        if (typeof source !== "string") { sendText(res, 400, "Invalid source"); return; }
        fs.writeFileSync(FILE, source, "utf-8");
        sendJson(res, 200, { ok: true, file: FNAME, mtime: fs.statSync(FILE).mtimeMs });
      } catch (e) {
        sendText(res, 500, e.message || "Write failed");
      }
    });
    req.on("error", (e) => {
      if (!res.writableEnded) sendText(res, 500, e.message || "Request failed");
    });
    return;
  }

  sendText(res, 404, "Not found");
});

server.listen(PORT, () => {
  console.log(`\n🎨 PM Toolkit Preview`);
  console.log(`   文件: ${FILE}`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   渲染: Mermaid.js (CDN, 浏览器端)\n`);
});

process.on("SIGINT", () => { console.log("\n👋"); server.close(() => process.exit(0)); });
process.on("SIGTERM", () => server.close(() => process.exit(0)));
