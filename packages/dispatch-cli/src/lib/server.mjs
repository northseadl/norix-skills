// HTTP Server + SSE — real-time dashboard and API endpoints

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { log } from "./logger.mjs";

/**
 * Start HTTP server with layered API endpoints.
 *
 * API tiers (by context cost):
 *   /api/signal   — 1-line signal    (~20 tokens, for Strategist)
 *   /api/digest   — 5-line digest    (~80 tokens, for Strategist)
 *   /api/status   — compact status   (~500 tokens, for Lieutenant)
 *   /api/state    — full state JSON  (unlimited, for Dashboard)
 *   /api/events   — SSE stream       (unlimited, for Dashboard)
 *   /api/task/:id — single task      (~200 tokens, for Lieutenant)
 *
 * @param {import('./store.mjs').StateStore} store
 * @param {number} port - 0 for random
 * @param {string} scriptsDir - directory containing dashboard.html
 * @returns {Promise<{server: import('node:http').Server, port: number}>}
 */
export async function startServer(store, port, scriptsDir) {
    const dashboardPath = join(scriptsDir, "dashboard.html");
    let dashboardHtml =
        "<html><body><h1>dashboard.html not found</h1></body></html>";
    if (existsSync(dashboardPath)) {
        dashboardHtml = await readFile(dashboardPath, "utf-8");
    } else {
        log("WARN", "dashboard.html not found — using placeholder");
    }

    return new Promise((res) => {
        const server = createServer((req, resp) => {
            const url = new URL(req.url, `http://localhost`);
            const path = url.pathname;

            // ─── Dashboard ───
            if (path === "/" || path === "/index.html") {
                resp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                resp.end(dashboardHtml);
                return;
            }

            // ─── Tiered API ───
            const cors = { "Access-Control-Allow-Origin": "*" };
            const json = { "Content-Type": "application/json", ...cors };
            const text = { "Content-Type": "text/plain; charset=utf-8", ...cors };

            if (path === "/api/signal") {
                // Strategist tier: ≤1 line
                const state = store.getState();
                const tasks = Object.values(state.tasks);
                const done = tasks.filter(
                    (t) => t.status === "success" || t.status === "failed" || t.status === "skipped",
                ).length;
                const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
                resp.writeHead(200, text);
                resp.end(`${state.phase.toUpperCase()} ${done}/${tasks.length} ${pct}%`);
                return;
            }

            if (path === "/api/digest") {
                resp.writeHead(200, text);
                // Delegate to store's digest rendering
                resp.end(store.renderCompactStatus());
                return;
            }

            if (path === "/api/status") {
                resp.writeHead(200, text);
                resp.end(store.renderCompactStatus());
                return;
            }

            if (path === "/api/state") {
                resp.writeHead(200, json);
                resp.end(JSON.stringify(store.getState()));
                return;
            }

            // Single task query: /api/task/3
            const taskMatch = path.match(/^\/api\/task\/(\d+)$/);
            if (taskMatch) {
                const taskId = parseInt(taskMatch[1], 10);
                const task = store.getState().tasks[taskId];
                if (!task) {
                    resp.writeHead(404, json);
                    resp.end(JSON.stringify({ error: `Task T${taskId} not found` }));
                } else {
                    // Exclude events array to save context
                    const { events, ...compact } = task;
                    compact.eventCount = events.length;
                    resp.writeHead(200, json);
                    resp.end(JSON.stringify(compact));
                }
                return;
            }

            if (path === "/api/events") {
                resp.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    ...cors,
                });
                resp.flushHeaders();
                resp.write(
                    `data: ${JSON.stringify({ type: "snapshot", state: store.getState() })}\n\n`,
                );
                const onUpdate = (event) =>
                    resp.write(`data: ${JSON.stringify(event)}\n\n`);
                store.on("update", onUpdate);
                const hb = setInterval(() => resp.write(": ping\n\n"), 15000);
                req.on("close", () => {
                    clearInterval(hb);
                    store.off("update", onUpdate);
                });
                return;
            }

            resp.writeHead(404);
            resp.end("Not Found");
        });

        server.listen(port, () => res({ server, port: server.address().port }));
    });
}

/**
 * Open a URL in the default browser.
 * @param {string} url
 */
export function openBrowser(url) {
    const cmd =
        process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
                ? "start"
                : "xdg-open";
    exec(`${cmd} ${url}`);
}
