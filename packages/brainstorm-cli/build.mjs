#!/usr/bin/env node

// Build brainstorm-cli → single ESM bundle
// Output: ../../agent-brainstorm/scripts/brainstorm.mjs (bundled, zero npm deps)

import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, "../../agent-brainstorm/scripts");

await build({
    entryPoints: [join(__dirname, "src/brainstorm.mjs")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: join(outdir, "brainstorm.mjs"),
    // No banner — scripts are invoked via `node`, not directly executed
    external: ["node:*"],
    minify: false,
    sourcemap: false,
});

console.log("✓ brainstorm.mjs built");
