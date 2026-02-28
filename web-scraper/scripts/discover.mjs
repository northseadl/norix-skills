#!/usr/bin/env node
/**
 * discover.mjs — Analyze site structure, detect framework, extract links.
 *
 * Uses CDP for full SPA rendering, then extracts navigation structure.
 *
 * Usage:
 *   node discover.mjs <url> [options]
 */

import { parseArgs } from 'util';
import CDPBrowser from './cdp_client.mjs';

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        'links-only': { type: 'boolean', default: false },
        'framework-only': { type: 'boolean', default: false },
        'sitemap': { type: 'boolean', default: false },
        'deep': { type: 'boolean', default: false },
        'max-pages': { type: 'string', default: '50' },
        'max-depth': { type: 'string', default: '3' },
        'wait': { type: 'string', default: '2000' },
        'json': { type: 'boolean', default: false },
        'help': { type: 'boolean', short: 'h', default: false },
    },
});

if (args.help || positionals.length === 0) {
    console.log(`
Usage: scrape_discover.mjs <url> [options]

Options:
  --links-only       Only list discovered navigation links
  --framework-only   Only detect the site framework
  --sitemap          Build a directory tree from links
  --deep             Follow links to discover more pages (crawl)
  --max-pages N      Max pages to crawl in deep mode (default: 50)
  --max-depth N      Max crawl depth (default: 3)
  --wait MS          Wait time for SPA rendering in ms (default: 2000)
  --json             Output as JSON
  -h, --help         Show this help
`);
    process.exit(0);
}

const url = positionals[0];
const maxPages = parseInt(args['max-pages']) || 50;
const maxDepth = parseInt(args['max-depth']) || 3;
const waitMs = parseInt(args['wait']) || 2000;

const browser = new CDPBrowser();
try {
    await browser.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitAfterLoad: waitMs });

    const title = await page.title();
    const finalUrl = await page.url();

    // --- Framework detection ---
    const framework = await page.evaluate(`
    (() => {
      const html = document.documentElement.innerHTML;
      const meta = document.querySelector('meta[name="generator"]')?.content || '';

      // Check common frameworks
      if (meta.includes('Docusaurus')) return { name: 'Docusaurus', source: 'meta' };
      if (meta.includes('VuePress')) return { name: 'VuePress', source: 'meta' };
      if (meta.includes('VitePress')) return { name: 'VitePress', source: 'meta' };
      if (meta.includes('GitBook')) return { name: 'GitBook', source: 'meta' };
      if (meta.includes('MkDocs')) return { name: 'MkDocs', source: 'meta' };
      if (meta.includes('Nextra')) return { name: 'Nextra', source: 'meta' };
      if (meta.includes('Astro')) return { name: 'Astro', source: 'meta' };

      if (document.querySelector('#swagger-ui')) return { name: 'Swagger UI', source: 'dom' };
      if (document.querySelector('[data-role="redoc"]') || document.querySelector('redoc'))
        return { name: 'Redoc', source: 'dom' };
      if (document.getElementById('__docusaurus')) return { name: 'Docusaurus', source: 'dom' };
      if (document.getElementById('__next')) return { name: 'Next.js', source: 'dom' };
      if (document.getElementById('__nuxt')) return { name: 'Nuxt.js', source: 'dom' };
      if (document.querySelector('[data-server-rendered]')) return { name: 'Vue SSR', source: 'dom' };
      if (document.querySelector('#app[data-v-app]')) return { name: 'Vue 3', source: 'dom' };

      if (html.includes('docsearch')) return { name: 'DocSearch (Algolia)', source: 'script' };
      if (html.includes('gitbook')) return { name: 'GitBook', source: 'script' };

      return { name: 'Unknown', source: 'none' };
    })()
  `);

    // --- Link extraction ---
    const allLinks = await page.extractLinks({ baseUrl: url });

    // Categorize links
    const origin = new URL(url).origin;
    const internalLinks = allLinks.filter(l => {
        try { return new URL(l.href).origin === origin; } catch { return false; }
    });

    await page.close();

    // --- Deep crawl ---
    let deepLinks = [];
    if (args.deep) {
        const visited = new Set([url]);
        const queue = internalLinks.map(l => ({ url: l.href.split('#')[0], depth: 1 }));
        const uniqueQueue = [];
        const queueSeen = new Set([url]);
        for (const item of queue) {
            if (!queueSeen.has(item.url)) {
                queueSeen.add(item.url);
                uniqueQueue.push(item);
            }
        }

        console.error(`🕷️ Deep crawl starting... (max ${maxPages} pages, depth ${maxDepth})`);

        let idx = 0;
        while (idx < uniqueQueue.length && visited.size < maxPages) {
            const item = uniqueQueue[idx++];
            if (visited.has(item.url) || item.depth > maxDepth) continue;
            if (item.url.match(/\.(png|jpg|gif|svg|css|js|woff|ico|pdf|zip)$/i)) continue;

            visited.add(item.url);
            console.error(`  [${visited.size}/${maxPages}] ${item.url}`);

            try {
                const p = await browser.newPage();
                await p.goto(item.url, { waitAfterLoad: Math.min(waitMs, 1500) });
                const newLinks = await p.extractLinks({ baseUrl: url });
                await p.close();

                for (const link of newLinks) {
                    const href = link.href.split('#')[0];
                    if (!queueSeen.has(href) && !href.match(/\.(png|jpg|gif|svg|css|js)$/i)) {
                        queueSeen.add(href);
                        uniqueQueue.push({ url: href, depth: item.depth + 1 });
                    }
                }
            } catch (err) {
                console.error(`  ❌ ${item.url}: ${err.message}`);
            }

            // Rate limit
            await new Promise(r => setTimeout(r, 300));
        }

        deepLinks = [...visited].filter(u => u !== url);
        console.error(`✅ Deep crawl complete: ${visited.size} pages discovered`);
    }

    // --- Output ---

    if (args.json) {
        const output = {
            url,
            finalUrl,
            title,
            framework,
            links: args.deep ? deepLinks.map(u => ({ href: u })) : internalLinks,
            totalLinks: args.deep ? deepLinks.length : internalLinks.length,
        };
        console.log(JSON.stringify(output, null, 2));
        process.exit(0);
    }

    if (args['framework-only']) {
        console.log(`Framework: ${framework.name} (detected via ${framework.source})`);
        process.exit(0);
    }

    if (args['links-only']) {
        const links = args.deep ? deepLinks : internalLinks.map(l => l.href);
        for (const l of links) {
            console.log(typeof l === 'string' ? l : l.href);
        }
        process.exit(0);
    }

    // Full report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Site Analysis: ${url}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Title:     ${title}`);
    console.log(`Final URL: ${finalUrl}`);
    console.log(`Framework: ${framework.name} (${framework.source})`);
    console.log(`Links:     ${internalLinks.length} internal`);

    if (args.deep) {
        console.log(`Crawled:   ${deepLinks.length + 1} pages total`);
    }

    if (args.sitemap) {
        console.log(`\nSitemap:`);
        const paths = (args.deep ? deepLinks : internalLinks.map(l => l.href))
            .map(u => { try { return new URL(typeof u === 'string' ? u : u.href).pathname; } catch { return null; } })
            .filter(Boolean)
            .sort();

        // Build tree
        const tree = {};
        for (const p of paths) {
            const parts = p.split('/').filter(Boolean);
            let node = tree;
            for (const part of parts) {
                node[part] = node[part] || {};
                node = node[part];
            }
        }

        function printTree(node, prefix = '') {
            const keys = Object.keys(node).sort();
            keys.forEach((key, i) => {
                const isLast = i === keys.length - 1;
                console.log(`${prefix}${isLast ? '└── ' : '├── '}${key}`);
                if (Object.keys(node[key]).length > 0) {
                    printTree(node[key], `${prefix}${isLast ? '    ' : '│   '}`);
                }
            });
        }
        printTree(tree);
    } else {
        console.log(`\nTop links:`);
        const display = internalLinks.slice(0, 20);
        for (const l of display) {
            const text = l.text ? ` — ${l.text.slice(0, 60)}` : '';
            console.log(`  ${l.href}${text}`);
        }
        if (internalLinks.length > 20) {
            console.log(`  ... and ${internalLinks.length - 20} more`);
        }
    }

} finally {
    await browser.close();
}
