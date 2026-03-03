import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";

import { generateDigest, generateSignal, generateStatus } from "./reporter.mjs";

export async function startServer(store, port, scriptsDir) {
    const dashboardPath = join(scriptsDir, "dashboard.html");
    let dashboardHtml = "<html><body><h1>dashboard.html not found</h1></body></html>";
    if (existsSync(dashboardPath)) dashboardHtml = await readFile(dashboardPath, "utf-8");

    const noStore = { "Cache-Control": "no-store" };
    const cors = { "Access-Control-Allow-Origin": "*" };

    return new Promise((resolve) => {
        const server = createServer((req, resp) => {
            const url = new URL(req.url, "http://localhost");
            const path = url.pathname;

            if (path === "/" || path === "/index.html") {
                resp.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...noStore });
                resp.end(dashboardHtml);
                return;
            }

            if (path === "/api/signal") {
                resp.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors, ...noStore });
                resp.end(generateSignal(store.getState()));
                return;
            }

            if (path === "/api/digest") {
                resp.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors, ...noStore });
                resp.end(generateDigest(store.getState(), store.getMeta()?.roles || []));
                return;
            }

            if (path === "/api/status") {
                resp.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors, ...noStore });
                resp.end(generateStatus(store.getState(), store.getMeta()));
                return;
            }

            if (path === "/api/state") {
                resp.writeHead(200, { "Content-Type": "application/json", ...cors, ...noStore });
                resp.end(JSON.stringify(store.getState()));
                return;
            }

            if (path === "/api/meta") {
                resp.writeHead(200, { "Content-Type": "application/json", ...cors, ...noStore });
                resp.end(JSON.stringify(store.getMeta()));
                return;
            }

            if (path === "/api/events") {
                resp.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    Connection: "keep-alive",
                    "Cache-Control": "no-store",
                    ...cors,
                });
                resp.flushHeaders();

                const snapshot = {
                    type: "snapshot",
                    ts: Date.now(),
                    meta: store.getMeta(),
                    state: store.getState(),
                };
                resp.write(`data: ${JSON.stringify(snapshot)}\n\n`);

                const onUpdate = (event) => {
                    try {
                        resp.write(`data: ${JSON.stringify(event)}\n\n`);
                    } catch {
                        /* ignore */
                    }
                };
                store.on("update", onUpdate);

                const hb = setInterval(() => resp.write(": ping\n\n"), 15000);
                req.on("close", () => {
                    clearInterval(hb);
                    store.off("update", onUpdate);
                });
                return;
            }

            resp.writeHead(404, { ...noStore });
            resp.end("Not Found");
        });

        server.listen(port, () => resolve({ server, port: server.address().port }));
    });
}

export function openBrowser(url) {
    const cmd =
        process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
                ? "start"
                : "xdg-open";
    exec(`${cmd} ${url}`);
}

