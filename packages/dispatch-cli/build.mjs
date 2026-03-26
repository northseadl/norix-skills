#!/usr/bin/env node

// Build dispatch-cli → single ESM bundle
// Output: ../../agent-task-orchestration/scripts/dispatch.mjs

import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, "../../agent-task-orchestration/scripts");

import { copyFileSync } from "node:fs";

await build({
    entryPoints: [join(__dirname, "src/dispatch.mjs")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: join(outdir, "dispatch.mjs"),
    external: ["node:*"],
    minify: false,
    sourcemap: false,
});

copyFileSync(join(__dirname, "node_modules/@anthropic-ai/claude-agent-sdk/cli.js"), join(outdir, "cli.js"));

console.log("✓ dispatch.mjs + cli.js built");
