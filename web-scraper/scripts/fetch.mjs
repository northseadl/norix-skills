#!/usr/bin/env node
/**
 * fetch.mjs — Fetch web pages and convert to Markdown.
 *
 * Uses system Chrome via CDP for full SPA rendering.
 * Supports: single URL, multiple URLs, batch from file, auto-discover + fetch.
 *
 * Usage:
 *   node fetch.mjs <url> [options]
 *   node fetch.mjs --from-file urls.txt [options]
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { parseArgs } from 'util';
import CDPBrowser from './cdp_client.mjs';
import { htmlToMarkdown } from './md_converter.mjs';

// --- CLI argument parsing ---

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        'auto': { type: 'boolean', default: false },
        'from-file': { type: 'string' },
        'output': { type: 'string', short: 'o' },
        'merge': { type: 'boolean', default: false },
        'max-pages': { type: 'string', default: '50' },
        'max-lines': { type: 'string', default: '0' },
        'wait': { type: 'string', default: '2000' },
        'summary-only': { type: 'boolean', default: false },
        'json': { type: 'boolean', default: false },
        'help': { type: 'boolean', short: 'h', default: false },
    },
});

if (args.help || (positionals.length === 0 && !args['from-file'])) {
    console.log(`
Usage: scrape_fetch.mjs <url> [options]

Options:
  --auto              Auto-discover pages then fetch all
  --from-file FILE    Read URLs from file (one per line)
  -o, --output PATH   Output directory or file path
  --merge             Merge all pages into single markdown file
  --max-pages N       Max pages in auto mode (default: 50)
  --max-lines N       Max lines per page (default: 0 = unlimited)
  --wait MS           Wait time after page load for SPA rendering (default: 2000)
  --summary-only      Only show fetch summary
  --json              Output as JSON
  -h, --help          Show this help
`);
    process.exit(0);
}

const maxPages = parseInt(args['max-pages']) || 50;
const maxLines = parseInt(args['max-lines']) || 0;
const waitMs = parseInt(args['wait']) || 2000;

// --- Collect URLs to fetch ---

let urls = [];

if (args['from-file']) {
    const content = readFileSync(args['from-file'], 'utf-8');
    urls = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
} else {
    urls = [positionals[0]];
}

// --- Launch browser ---

const browser = new CDPBrowser();
try {
    await browser.launch();

    // Auto-discover mode: first find links, then fetch them
    if (args.auto && urls.length === 1) {
        const baseUrl = urls[0];
        console.error(`🔍 Auto-discovering pages from: ${baseUrl}`);
        const page = await browser.newPage();
        await page.goto(baseUrl, { waitAfterLoad: waitMs });
        const links = await page.extractLinks({ baseUrl });
        await page.close();

        // Filter to likely content pages (not anchors, not external, not assets)
        const seen = new Set([baseUrl]);
        for (const link of links) {
            if (seen.size >= maxPages) break;
            const href = link.href.split('#')[0].split('?')[0]; // Strip fragment/query
            if (!seen.has(href) && !href.match(/\.(png|jpg|gif|svg|css|js|woff|ico)$/i)) {
                seen.add(href);
            }
        }
        urls = [...seen];
        console.error(`📋 Found ${urls.length} pages to fetch`);
    }

    // --- Fetch each URL ---

    const results = [];

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.error(`📡 [${i + 1}/${urls.length}] ${url}`);

        try {
            const page = await browser.newPage();
            await page.goto(url, { waitAfterLoad: waitMs });

            const title = await page.title();
            const finalUrl = await page.url();
            const html = await page.extractContentHTML();
            await page.close();

            let markdown = htmlToMarkdown(html);

            // Apply max-lines limit
            if (maxLines > 0) {
                const lines = markdown.split('\n');
                if (lines.length > maxLines) {
                    markdown = lines.slice(0, maxLines).join('\n') + `\n\n... (truncated at ${maxLines} lines)`;
                }
            }

            results.push({ url, finalUrl, title, markdown, chars: markdown.length, error: null });

        } catch (err) {
            console.error(`  ❌ Error: ${err.message}`);
            results.push({ url, finalUrl: url, title: '', markdown: '', chars: 0, error: err.message });
        }

        // Rate limiting between page fetches
        if (i < urls.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    // --- Output results ---

    if (args.json) {
        // JSON output
        const output = results.map(r => ({
            url: r.url,
            title: r.title,
            chars: r.chars,
            tokens_est: Math.floor(r.chars / 4),
            error: r.error,
            markdown: args['summary-only'] ? undefined : r.markdown,
        }));
        console.log(JSON.stringify(output, null, 2));

    } else if (args.merge || (args.output && !args.output.endsWith('/'))) {
        // Merge into single file
        const merged = results
            .filter(r => r.markdown)
            .map(r => `# ${r.title || r.url}\n\n> Source: ${r.url}\n\n${r.markdown}`)
            .join('\n\n---\n\n');

        if (args.output) {
            const dir = args.output.includes('/') ? args.output.split('/').slice(0, -1).join('/') : '.';
            mkdirSync(dir, { recursive: true });
            writeFileSync(args.output, merged, 'utf-8');
            console.error(`✅ Merged ${results.length} pages → ${args.output} (${merged.length} chars)`);
        } else {
            console.log(merged);
        }

    } else if (args.output) {
        // Save individual files
        mkdirSync(args.output, { recursive: true });
        for (const r of results) {
            if (!r.markdown) continue;
            const slug = new URL(r.url).pathname.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 80);
            const filename = `${slug || 'index'}.md`;
            const filepath = join(args.output, filename);
            writeFileSync(filepath, `# ${r.title || r.url}\n\n> Source: ${r.url}\n\n${r.markdown}`, 'utf-8');
        }
        console.error(`✅ Saved ${results.filter(r => r.markdown).length} pages → ${args.output}/`);

    } else {
        // Print to stdout (single page)
        if (args['summary-only']) {
            for (const r of results) {
                console.log(`${r.url} | ${r.title} | ${r.chars} chars | ~${Math.floor(r.chars / 4)} tokens${r.error ? ' | ERROR: ' + r.error : ''}`);
            }
        } else {
            for (const r of results) {
                if (r.markdown) console.log(r.markdown);
                else if (r.error) console.error(`ERROR: ${r.url}: ${r.error}`);
            }
        }
    }

} finally {
    await browser.close();
}
