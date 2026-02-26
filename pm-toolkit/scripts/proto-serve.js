#!/usr/bin/env node

/**
 * PM Toolkit -- Prototype Preview Server
 *
 * Serves Agent-generated HTML pages with a preview shell.
 *
 *   GET  /              -> preview shell (prototype.html)
 *   GET  /api/pages     -> list .html files in directory
 *   GET  /page/:name    -> serve raw HTML file (for iframe)
 *   DELETE /api/page/:name -> delete a page
 *
 * Usage: node proto-serve.js --dir <prototype-dir> [--port 9877]
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const getArg = (n, fb) => { const i = args.indexOf("--" + n); return i !== -1 && args[i + 1] ? args[i + 1] : fb; };

const DIR = path.resolve(getArg("dir", ""));
const PORT = parseInt(getArg("port", "9877"), 10);
const NAME_RE = /^[a-zA-Z0-9_-]+$/;

if (!DIR) { console.error("Usage: node proto-serve.js --dir <prototype-dir>"); process.exit(1); }
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const SHELL = fs.readFileSync(path.join(__dirname, "prototype.html"), "utf-8");

function sendJson(res, code, data) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
}

function sendText(res, code, text) {
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(text);
}

function listPages() {
    return fs.readdirSync(DIR)
        .filter((f) => f.endsWith(".html"))
        .map((f) => {
            const name = f.replace(/\.html$/, "");
            const stat = fs.statSync(path.join(DIR, f));
            return { name, file: f, mtime: stat.mtimeMs };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Preview shell
    if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(SHELL);
        return;
    }

    // List pages
    if (url.pathname === "/api/pages" && req.method === "GET") {
        sendJson(res, 200, { pages: listPages(), dir: DIR });
        return;
    }

    // Serve raw HTML page (for iframe)
    const pageMatch = url.pathname.match(/^\/page\/([a-zA-Z0-9_-]+)$/);
    if (pageMatch && req.method === "GET") {
        const file = path.join(DIR, pageMatch[1] + ".html");
        if (!fs.existsSync(file)) { sendText(res, 404, "Not found"); return; }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(fs.readFileSync(file, "utf-8"));
        return;
    }

    // Delete page
    const delMatch = url.pathname.match(/^\/api\/page\/([a-zA-Z0-9_-]+)$/);
    if (delMatch && req.method === "DELETE") {
        const name = delMatch[1];
        if (!NAME_RE.test(name)) { sendText(res, 400, "Invalid name"); return; }
        const file = path.join(DIR, name + ".html");
        try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            sendJson(res, 200, { ok: true });
        } catch (e) { sendText(res, 500, e.message); }
        return;
    }

    sendText(res, 404, "Not found");
});

server.listen(PORT, () => {
    const pages = listPages();
    console.log(`\nPrototype Preview`);
    console.log(`  Dir:   ${DIR}`);
    console.log(`  URL:   http://localhost:${PORT}`);
    console.log(`  Pages: ${pages.length}\n`);
});

process.on("SIGINT", () => { server.close(() => process.exit(0)); });
process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
