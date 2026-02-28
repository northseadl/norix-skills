#!/usr/bin/env node
/**
 * openapi.mjs — Fetch and convert OpenAPI/Swagger specs to Markdown.
 *
 * Handles:
 * - Direct JSON spec URL → Markdown
 * - Swagger UI / Redoc page → auto-discover spec URL → Markdown
 *
 * Uses CDP for Swagger UI discovery (to find spec URL in rendered page).
 * Pure JSON parsing for spec conversion (no browser needed for direct URLs).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { parseArgs } from 'util';
import CDPBrowser from './cdp_client.mjs';

const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        'output': { type: 'string', short: 'o' },
        'help': { type: 'boolean', short: 'h', default: false },
    },
});

if (args.help || positionals.length === 0) {
    console.log(`
Usage: openapi.mjs <url> [-o FILE]

Accepts either:
  - A direct spec URL (.json) → fetches and converts
  - A Swagger UI / Redoc page → auto-discovers spec URL, then converts

Options:
  -o, --output FILE   Save markdown to file
  -h, --help          Show this help
`);
    process.exit(0);
}

const url = positionals[0];

// --- OpenAPI spec → Markdown converter ---

function openapiToMarkdown(spec) {
    const lines = [];
    const info = spec.info || {};

    lines.push(`# ${info.title || 'API Documentation'}`);
    if (info.version) lines.push(`\n**Version**: ${info.version}`);
    if (info.description) lines.push(`\n${info.description}`);
    lines.push('');

    // Servers
    const servers = spec.servers || [];
    if (servers.length) {
        lines.push('## Servers');
        for (const srv of servers) {
            lines.push(`- \`${srv.url || ''}\` — ${srv.description || ''}`);
        }
        lines.push('');
    }

    // Tags
    const tags = spec.tags || [];
    if (tags.length) {
        lines.push('## Categories');
        for (const tag of tags) {
            lines.push(`- **${tag.name || ''}**: ${tag.description || ''}`);
        }
        lines.push('');
    }

    // Paths — group by tags
    const paths = spec.paths || {};
    if (Object.keys(paths).length) {
        lines.push('## Endpoints');
        lines.push('');

        const tagged = {};
        for (const [path, methods] of Object.entries(paths)) {
            for (const [method, details] of Object.entries(methods)) {
                if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) continue;
                const epTags = details.tags || ['Other'];
                for (const tag of epTags) {
                    if (!tagged[tag]) tagged[tag] = [];
                    tagged[tag].push({
                        method: method.toUpperCase(), path,
                        summary: details.summary || '',
                        description: details.description || '',
                        parameters: details.parameters || [],
                        requestBody: details.requestBody || {},
                        responses: details.responses || {},
                        deprecated: details.deprecated || false,
                    });
                }
            }
        }

        for (const [tagName, endpoints] of Object.entries(tagged)) {
            lines.push(`### ${tagName}`);
            lines.push('');

            for (const ep of endpoints) {
                const flag = ep.deprecated ? ' ⚠️ DEPRECATED' : '';
                lines.push(`#### \`${ep.method}\` ${ep.path}${flag}`);
                lines.push('');
                if (ep.summary) { lines.push(`**${ep.summary}**`); lines.push(''); }
                if (ep.description) { lines.push(ep.description); lines.push(''); }

                // Parameters
                if (ep.parameters.length) {
                    lines.push('**Parameters:**');
                    lines.push('');
                    lines.push('| Name | In | Type | Required | Description |');
                    lines.push('|------|-----|------|----------|-------------|');
                    for (const p of ep.parameters) {
                        const schema = p.schema || {};
                        const req = p.required ? '✅' : '';
                        lines.push(`| \`${p.name || ''}\` | ${p.in || ''} | ${schema.type || ''} | ${req} | ${p.description || ''} |`);
                    }
                    lines.push('');
                }

                // Request body
                if (ep.requestBody && Object.keys(ep.requestBody).length) {
                    lines.push('**Request Body:**');
                    lines.push('');
                    const content = ep.requestBody.content || {};
                    for (const [ct, info] of Object.entries(content)) {
                        lines.push(`Content-Type: \`${ct}\``);
                        if (info.schema) lines.push(`\`\`\`json\n${JSON.stringify(info.schema, null, 2)}\n\`\`\``);
                    }
                    lines.push('');
                }

                // Responses
                if (Object.keys(ep.responses).length) {
                    lines.push('**Responses:**');
                    lines.push('');
                    for (const [code, resp] of Object.entries(ep.responses)) {
                        lines.push(`- \`${code}\`: ${resp.description || ''}`);
                    }
                    lines.push('');
                }
            }
        }
    }

    // Schemas
    const components = spec.components || spec.definitions || {};
    const schemas = components.schemas || (typeof components === 'object' && !components.schemas ? components : {});

    if (Object.keys(schemas).length) {
        lines.push('## Schemas');
        lines.push('');
        for (const [name, schema] of Object.entries(schemas)) {
            lines.push(`### ${name}`);
            lines.push('');
            if (schema.description) { lines.push(schema.description); lines.push(''); }

            const props = schema.properties || {};
            const required = schema.required || [];
            if (Object.keys(props).length) {
                lines.push('| Field | Type | Required | Description |');
                lines.push('|-------|------|----------|-------------|');
                for (const [pname, pschema] of Object.entries(props)) {
                    let ptype = pschema.type || '';
                    if (pschema['$ref']) ptype = pschema['$ref'].split('/').pop();
                    if (pschema.items) {
                        const itemType = pschema.items['$ref'] ? pschema.items['$ref'].split('/').pop() : (pschema.items.type || '');
                        ptype = `array[${itemType}]`;
                    }
                    const req = required.includes(pname) ? '✅' : '';
                    lines.push(`| \`${pname}\` | ${ptype} | ${req} | ${pschema.description || ''} |`);
                }
                lines.push('');
            }
        }
    }

    return lines.join('\n');
}

// --- Main logic ---

console.error(`🔍 Looking for OpenAPI spec at ${url}...`);

// Step 1: Try fetching as JSON directly
let spec = null;
try {
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (resp.ok) {
        const text = await resp.text();
        spec = JSON.parse(text);
        if (!spec.openapi && !spec.swagger && !spec.paths) spec = null;
    }
} catch { /* not a direct JSON spec */ }

// Step 2: If not a direct spec, use CDP to find spec URL in Swagger UI / Redoc
if (!spec) {
    console.error('  Not a direct spec URL. Launching browser to discover...');
    const browser = new CDPBrowser();
    try {
        await browser.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitAfterLoad: 3000 });

        // Look for spec URL in the page
        const specUrls = await page.evaluate(`
      (() => {
        const urls = new Set();
        // Swagger UI: look for the URL in the topbar input or config
        const input = document.querySelector('.swagger-ui input[type="text"]');
        if (input && input.value) urls.add(input.value);
        // Check data attributes and script content
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const text = s.textContent || '';
          const matches = text.match(/["'](https?:\\/\\/[^"']*(?:swagger|openapi|api-docs)[^"']*\\.json)["']/gi) || [];
          for (const m of matches) urls.add(m.replace(/["']/g, ''));
          // Look for url: "..." patterns
          const urlMatches = text.match(/url\\s*[:=]\\s*["'](https?:\\/\\/[^"']+)["']/gi) || [];
          for (const m of urlMatches) {
            const val = m.match(/["'](https?:\\/\\/[^"']+)["']/);
            if (val && val[1].match(/\\.(json|yaml|yml)$/i)) urls.add(val[1]);
          }
        }
        // Check link/meta tags
        document.querySelectorAll('a[href*="swagger"], a[href*="openapi"], a[href*="api-docs"]').forEach(a => {
          if (a.href.match(/\\.(json|yaml|yml)$/i)) urls.add(a.href);
        });
        return [...urls];
      })()
    `);

        await page.close();
        await browser.close();

        // Try each discovered URL
        for (const specUrl of specUrls) {
            try {
                console.error(`  Trying: ${specUrl}`);
                const resp = await fetch(specUrl);
                const data = await resp.json();
                if (data.openapi || data.swagger || data.paths) {
                    spec = data;
                    break;
                }
            } catch { continue; }
        }
    } catch (err) {
        await browser.close();
        console.error(`  Browser error: ${err.message}`);
    }
}

if (!spec) {
    console.error('❌ No OpenAPI/Swagger spec found. Try providing the direct spec URL.');
    process.exit(1);
}

// Step 3: Convert to Markdown
const markdown = openapiToMarkdown(spec);

if (args.output) {
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, markdown, 'utf-8');
    console.error(`✅ Saved OpenAPI docs to ${args.output}`);
} else {
    console.log(markdown);
}
