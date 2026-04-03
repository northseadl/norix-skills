#!/usr/bin/env node

// Build swe-team-cli → two ESM bundles
// Output: ../../agent-swe-team/scripts/{team.mjs, ws.mjs}

import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, copyFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, "../../agent-swe-team/scripts");

// Inline dashboard.html as a string constant at build time — zero file dependencies
const dashboardHtml = readFileSync(join(outdir, "dashboard.html"), "utf-8");

const common = {
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    external: ["node:*", "@opencode-ai/sdk"],
    minify: false,
    sourcemap: false,
};

// team.mjs — main entry
await build({
    ...common,
    entryPoints: [join(__dirname, "src/team.mjs")],
    outfile: join(outdir, "team.mjs"),
    define: {
        "__DASHBOARD_HTML__": JSON.stringify(dashboardHtml),
    },
});

// ws.mjs — workshop CLI tool (standalone, no npm deps, but bundle for consistency)
await build({
    ...common,
    entryPoints: [join(__dirname, "src/ws.mjs")],
    outfile: join(outdir, "ws.mjs"),
});

copyFileSync(join(__dirname, "node_modules/@anthropic-ai/claude-agent-sdk/cli.js"), join(outdir, "cli.js"));

console.log("✓ team.mjs + ws.mjs + cli.js built");
