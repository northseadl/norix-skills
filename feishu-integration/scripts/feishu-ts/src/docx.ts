/**
 * Feishu Document & Drive Management CLI.
 *
 * vi-philosophy: minimal orthogonal primitives for maximum composability.
 *   create  — new document (optionally from markdown file)
 *   read    — render content (--raw, --blocks for positional index)
 *   insert  — insert content at position (--text/--heading/--code/--file/--image, --index)
 *   delete  — remove blocks by index range
 *   list / tree / search / search-content / trash / copy / export
 *   shared-add / shared-list / shared-remove
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as lark from "@larksuiteoapi/node-sdk";
import { Log } from "./log.js";
import {
  createLarkClient,
  userRequest,
  getAllPages,
  resolveUserToken,
} from "./client.js";
import { parseArgs, respond, fail, sleep } from "./utils.js";
import { API_BASE, DATA_DIR, SHARED_FOLDERS_FILE } from "./constants.js";

// ── Block Type Constants ────────────────────────────────────────────────────

const BT_PAGE = 1;
const BT_TEXT = 2;
const BT_BULLET = 12;
const BT_ORDERED = 13;
const BT_CODE = 14;
const BT_QUOTE = 15;
const BT_TODO = 17;
const BT_DIVIDER = 22;
const BT_IMAGE = 27;
const BT_TABLE = 31;
const BT_TABLE_CELL = 32;
const BT_CALLOUT = 34;

const HEADING_FIELD: Record<number, string> = {
  1: "heading1", 2: "heading2", 3: "heading3", 4: "heading4",
  5: "heading5", 6: "heading6", 7: "heading7", 8: "heading8", 9: "heading9",
};

const LANG_MAP: Record<string, number> = {
  plaintext: 1, abap: 2, ada: 3, apache: 4, apex: 5, assembly: 6,
  bash: 7, csharp: 8, cpp: 9, c: 10, cobol: 11, css: 12, coffeescript: 13,
  d: 14, dart: 15, delphi: 16, django: 17, dockerfile: 18, erlang: 19,
  fortran: 20, foxpro: 21, go: 22, groovy: 23, html: 24, htmlbars: 25,
  http: 26, haskell: 27, json: 28, java: 29, javascript: 30, julia: 31,
  kotlin: 32, latex: 33, lisp: 34, lua: 36, matlab: 38,
  makefile: 39, markdown: 40, nginx: 41, objectivec: 43, pascal: 46,
  perl: 47, php: 48, powershell: 50, python: 51, r: 52, ruby: 54,
  rust: 55, sas: 56, scss: 57, sql: 58, scala: 59, scheme: 60, shell: 62,
  swift: 63, typescript: 65, vbnet: 66, xml: 69, yaml: 70,
  cmake: 71, diff: 73, protobuf: 78,
};

const LANG_NAME: Record<number, string> = {};
for (const [k, v] of Object.entries(LANG_MAP)) LANG_NAME[v] = k;

const BLOCK_TYPE_NAME: Record<number, string> = {
  1: "page", 2: "text", 3: "h1", 4: "h2", 5: "h3", 6: "h4", 7: "h5",
  8: "h6", 9: "h7", 10: "h8", 11: "h9", 12: "bullet", 13: "ordered",
  14: "code", 15: "quote", 17: "todo", 18: "table", 19: "table_cell",
  22: "divider", 27: "image", 34: "callout",
};

// ── Shared Folders Cache ────────────────────────────────────────────────────

function loadSharedFolders(): Record<string, Record<string, string>> {
  if (fs.existsSync(SHARED_FOLDERS_FILE)) {
    try { return JSON.parse(fs.readFileSync(SHARED_FOLDERS_FILE, "utf-8")); } catch { return {}; }
  }
  return {};
}

function saveSharedFolders(data: Record<string, Record<string, string>>): void {
  fs.mkdirSync(path.dirname(SHARED_FOLDERS_FILE), { recursive: true });
  fs.writeFileSync(SHARED_FOLDERS_FILE, JSON.stringify(data, null, 2));
}

function extractFolderToken(url: string): string {
  const m = url.match(/\/folder\/([A-Za-z0-9]+)/);
  if (m) return m[1]!;
  if (/^[A-Za-z0-9]{10,}$/.test(url.trim())) return url.trim();
  return "";
}

// ── Markdown to Feishu Blocks ──────────────────────────────────────────────

interface TextElement {
  text_run: {
    content: string;
    text_element_style?: Record<string, unknown>;
  };
}

function parseInlineMd(text: string): TextElement[] {
  const elements: TextElement[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push({ text_run: { content: text.slice(lastIndex, match.index) } });
    }
    if (match[2]) {
      elements.push({ text_run: { content: match[2], text_element_style: { bold: true, italic: true } } });
    } else if (match[3]) {
      elements.push({ text_run: { content: match[3], text_element_style: { bold: true } } });
    } else if (match[4]) {
      elements.push({ text_run: { content: match[4], text_element_style: { italic: true } } });
    } else if (match[5]) {
      elements.push({ text_run: { content: match[5], text_element_style: { strikethrough: true } } });
    } else if (match[6]) {
      elements.push({ text_run: { content: match[6], text_element_style: { inline_code: true } } });
    } else if (match[7] && match[8]) {
      const url = match[8];
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) {
        elements.push({ text_run: { content: match[7], text_element_style: { link: { url: encodeURI(url) } } } });
      } else {
        elements.push({ text_run: { content: match[7] } });
      }
    }
    lastIndex = match.index + match[0]!.length;
  }

  if (lastIndex < text.length) {
    elements.push({ text_run: { content: text.slice(lastIndex) } });
  }

  return elements.length ? elements : [{ text_run: { content: text } }];
}

interface BlockData {
  block_type: number;
  [key: string]: unknown;
}

interface TableQueueEntry {
  index: number;
  headers: string[];
  rows: string[][];
  widths: number[];
}

export function markdownToBlocks(
  md: string
): { blocks: BlockData[]; tableData: TableQueueEntry[] } {
  const blocks: BlockData[] = [];
  const tableData: TableQueueEntry[] = [];
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const bt = level + 2;
      const field = HEADING_FIELD[level] ?? "heading1";
      blocks.push({ block_type: bt, [field]: { elements: parseInlineMd(headingMatch[2]!) } });
      i++; continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim().toLowerCase();
      const langCode = LANG_MAP[lang] ?? 1;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) { codeLines.push(lines[i]!); i++; }
      i++;
      blocks.push({ block_type: BT_CODE, code: { language: langCode, elements: [{ text_run: { content: codeLines.join("\n") } }] } });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { blocks.push({ block_type: BT_DIVIDER }); i++; continue; }

    if (line.startsWith("> ")) { blocks.push({ block_type: BT_QUOTE, quote: { elements: parseInlineMd(line.slice(2)) } }); i++; continue; }

    if (/^[*\-+]\s+/.test(line)) {
      const content = line.replace(/^[*\-+]\s+/, "");
      const todoMatch = content.match(/^\[([ xX])\]\s*(.*)/);
      if (todoMatch) {
        blocks.push({ block_type: BT_TODO, todo: { elements: parseInlineMd(todoMatch[2]!), style: { done: todoMatch[1]!.toLowerCase() === "x" } } });
      } else {
        blocks.push({ block_type: BT_BULLET, bullet: { elements: parseInlineMd(content) } });
      }
      i++; continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)/);
    if (orderedMatch) { blocks.push({ block_type: BT_ORDERED, ordered: { elements: parseInlineMd(orderedMatch[1]!) } }); i++; continue; }

    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim().startsWith("|")) { tableLines.push(lines[i]!); i++; }
      if (tableLines.length >= 2) {
        const parseRow = (r: string): string[] => r.split("|").filter(Boolean).map((c) => c.trim());
        const headers = parseRow(tableLines[0]!);
        const dataStart = tableLines[1]!.includes("---") ? 2 : 1;
        const rows = tableLines.slice(dataStart).map(parseRow);
        const colCount = headers.length;
        const widths = calcColumnWidths(headers, rows, colCount);
        const rowCount = rows.length + 1;
        blocks.push({ block_type: BT_TABLE, table: { property: { column_size: colCount, row_size: rowCount, column_width: widths } } });
        tableData.push({ index: blocks.length - 1, headers, rows, widths });
      }
      continue;
    }

    if (!line.trim()) { i++; continue; }

    blocks.push({ block_type: BT_TEXT, text: { elements: parseInlineMd(line) } });
    i++;
  }

  return { blocks, tableData };
}

function displayWidth(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x3000 && cp <= 0x303F) ||
        (cp >= 0xFF01 && cp <= 0xFF60) || (cp >= 0xFE30 && cp <= 0xFE4F) ||
        (cp >= 0x2E80 && cp <= 0x2FDF)) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function calcColumnWidths(headers: string[], rows: string[][], colCount: number): number[] {
  const FEISHU_DOC_WIDTH = 700;
  const MIN_WIDTH = 60;
  const MAX_DISPLAY_WIDTH = 80;
  const PX_PER_CHAR = 8;
  const CELL_PADDING = 24;

  const colMaxLen = new Array(colCount).fill(0);
  for (let c = 0; c < colCount; c++) {
    const w1 = Math.min(displayWidth(headers[c] ?? ""), MAX_DISPLAY_WIDTH);
    colMaxLen[c] = Math.max(colMaxLen[c], w1);
    for (const row of rows) {
      const w2 = Math.min(displayWidth(row[c] ?? ""), MAX_DISPLAY_WIDTH);
      colMaxLen[c] = Math.max(colMaxLen[c], w2);
    }
  }

  const widths = colMaxLen.map((len) => Math.max(MIN_WIDTH, len * PX_PER_CHAR + CELL_PADDING));
  
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > FEISHU_DOC_WIDTH) {
    const scale = FEISHU_DOC_WIDTH / total;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.max(MIN_WIDTH, Math.floor(widths[i]! * scale));
    }
  }
  return widths;
}

// ── Block Flushing (supports positional insert) ─────────────────────────────

export async function flushBlocks(
  client: lark.Client, documentId: string, parentBlockId: string,
  blocks: BlockData[], tableDataQueue: TableQueueEntry[] = [], insertIndex = -1
): Promise<void> {
  let currentIndex = insertIndex;
  let batch: BlockData[] = [];

  const flushBatch = async () => {
    if (!batch.length) return;
    const result = await userRequest(client, "POST", `/docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`, { children: batch, index: currentIndex });
    if ((result.code as number) !== 0) Log.error(`Block write failed: ${result.msg ?? "?"}`);
    if (currentIndex !== -1) currentIndex += batch.length;
    batch = [];
    await sleep(200);
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.block_type !== BT_TABLE) {
      batch.push(block);
      if (batch.length >= 50) await flushBatch();
    } else {
      await flushBatch();

      const td = tableDataQueue.find(t => t.index === i);
      if (!td) continue;

      const rowCount = td.rows.length + 1;
      const colCount = td.headers.length;
      const tableDef = { property: { column_size: colCount, row_size: Math.min(rowCount, 9), column_width: td.widths, header_row: true } };
      const tableBlock: BlockData = { block_type: BT_TABLE, table: tableDef };

      const createResult = await userRequest(client, "POST", `/docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`, { children: [tableBlock], index: currentIndex });
      if ((createResult.code as number) !== 0) { Log.error(`Table create failed: ${createResult.msg ?? "?"}`); continue; }

      if (currentIndex !== -1) currentIndex += 1;

      const createdBlocks = ((createResult.data as Record<string, unknown>)?.children ?? []) as Record<string, unknown>[];
      if (!createdBlocks.length) continue;
      const tableBlockId = (createdBlocks[0]!.block_id ?? "") as string;

      if (rowCount > 9) {
        for (let r = 9; r < rowCount; r++) {
          await userRequest(client, "POST", `/docx/v1/documents/${documentId}/blocks/${tableBlockId}/children`, { children: [{ block_type: BT_TABLE_CELL }], index: -1 });
          await sleep(100);
        }
      }

      const cellsResult = await userRequest(client, "GET", `/docx/v1/documents/${documentId}/blocks/${tableBlockId}`);
      const tableData = ((cellsResult.data as Record<string, unknown>)?.block as Record<string, unknown>)?.table as Record<string, unknown> | undefined;
      const cellIds = (tableData?.cells ?? []) as string[];
      
      const allData = [td.headers, ...td.rows];
      for (let r = 0; r < allData.length; r++) {
        const row = allData[r]!;
        for (let c = 0; c < colCount; c++) {
          const cellPos = r * colCount + c;
          if (cellPos >= cellIds.length) break;
          
          const cellId = cellIds[cellPos]!;
          const cellContent = row[c] ?? "";
          if (!cellContent.trim()) continue;

          // Get the cell's existing child text block
          const cellBlockRes = await userRequest(client, "GET", `/docx/v1/documents/${documentId}/blocks/${cellId}`);
          const cellChildren = ((cellBlockRes.data as Record<string, unknown>)?.block as Record<string, unknown>)?.children as string[] | undefined;
          if (!cellChildren || !cellChildren.length) continue;
          
          const textBlockId = cellChildren[0]!;
          
          // Update the existing text block with content using PATCH
          await userRequest(client, "PATCH", `/docx/v1/documents/${documentId}/blocks/${textBlockId}`, {
            update_text_elements: { elements: parseInlineMd(cellContent) }
          });
          await sleep(200);
        }
      }
      await sleep(200);
    }
  }
  await flushBatch();
}

// ── Image Upload ────────────────────────────────────────────────────────────

async function uploadImage(documentId: string, filePath: string): Promise<string> {
  const token = await resolveUserToken();
  if (!fs.existsSync(filePath)) fail(`File not found: ${filePath}`);

  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("file_name", filename);
  formData.append("parent_type", "docx_image");
  formData.append("parent_node", documentId);
  formData.append("size", String(fileBuffer.length));

  const res = await fetch(`${API_BASE}/drive/v1/medias/upload_all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const result = (await res.json()) as Record<string, unknown>;
  if ((result.code as number) !== 0) fail(`Image upload failed: ${result.msg ?? "?"}`);
  const fileToken = ((result.data as Record<string, unknown>)?.file_token ?? "") as string;
  if (!fileToken) fail("Upload returned no file_token");
  return fileToken;
}

// ── Block-to-Markdown Renderer ──────────────────────────────────────────────

function renderElementsToMd(elems: Record<string, unknown>[]): string {
  const parts: string[] = [];
  for (const e of elems) {
    if (e.text_run) {
      const tr = e.text_run as Record<string, unknown>;
      let content = (tr.content ?? "") as string;
      const style = (tr.text_element_style ?? {}) as Record<string, unknown>;
      if (style.bold && style.italic) content = `***${content}***`;
      else if (style.bold) content = `**${content}**`;
      else if (style.italic) content = `*${content}*`;
      else if (style.strikethrough) content = `~~${content}~~`;
      else if (style.inline_code) content = `\`${content}\``;
      else if (style.link) {
        const url = ((style.link as Record<string, string>).url) ?? "";
        content = `[${content}](${url})`;
      }
      parts.push(content);
    } else if (e.mention_doc) {
      parts.push(((e.mention_doc as Record<string, string>).title) ?? "[doc]");
    } else if (e.equation) {
      parts.push(((e.equation as Record<string, string>).content) ?? "");
    }
  }
  return parts.join("");
}

interface ImageMeta { file_token: string; filename: string; }

function blockPreview(block: Record<string, unknown>, bt: number): string {
  const fieldMd = (field: string) => renderElementsToMd(((block[field] as Record<string, unknown>)?.elements ?? []) as Record<string, unknown>[]);

  if (bt === BT_PAGE) return "[page]";
  if (bt === BT_TEXT) return fieldMd("text");
  if (bt === BT_BULLET) return "- " + fieldMd("bullet");
  if (bt === BT_ORDERED) return "1. " + fieldMd("ordered");
  if (bt === BT_CODE) {
    const codeData = (block.code ?? {}) as Record<string, unknown>;
    const langName = LANG_NAME[(codeData.language ?? 0) as number] ?? "";
    return `[code:${langName}]`;
  }
  if (bt === BT_QUOTE) return "> " + fieldMd("quote");
  if (bt === BT_DIVIDER) return "---";
  if (bt === BT_TODO) {
    const todoData = (block.todo ?? {}) as Record<string, unknown>;
    const done = ((todoData.style as Record<string, unknown>)?.done ?? false) as boolean;
    return `- ${done ? "[x]" : "[ ]"} ` + fieldMd("todo");
  }
  if (bt === BT_IMAGE) return "[image]";
  if (bt === BT_TABLE) return "[table]";
  if (bt === BT_CALLOUT) return "[callout]";

  const level = bt - 2;
  if (level >= 1 && level <= 9) return "#".repeat(level) + " " + fieldMd(HEADING_FIELD[level]!);

  return `[block_type=${bt}]`;
}

function extractText(block: Record<string, unknown>, bt: number, imageCollector?: ImageMeta[]): string | null {
  const fieldMd = (field: string) => renderElementsToMd(((block[field] as Record<string, unknown>)?.elements ?? []) as Record<string, unknown>[]);

  if (bt === BT_PAGE) return null;
  if (bt === BT_TEXT) return fieldMd("text");
  if (bt === BT_BULLET) return "- " + fieldMd("bullet");
  if (bt === BT_ORDERED) return "1. " + fieldMd("ordered");
  if (bt === BT_CODE) {
    const codeData = (block.code ?? {}) as Record<string, unknown>;
    const langName = LANG_NAME[(codeData.language ?? 0) as number] ?? "";
    const elems = (codeData.elements ?? []) as Record<string, unknown>[];
    const codeText = elems.map((e) => ((e.text_run as Record<string, unknown>)?.content ?? "") as string).join("");
    return `\`\`\`${langName}\n${codeText}\n\`\`\``;
  }
  if (bt === BT_QUOTE) return "> " + fieldMd("quote");
  if (bt === BT_DIVIDER) return "---";
  if (bt === BT_TODO) {
    const todoData = (block.todo ?? {}) as Record<string, unknown>;
    const done = ((todoData.style as Record<string, unknown>)?.done ?? false) as boolean;
    return `- ${done ? "[x]" : "[ ]"} ` + fieldMd("todo");
  }
  if (bt === BT_IMAGE) {
    const imageData = (block.image ?? {}) as Record<string, unknown>;
    const fileToken = (imageData.token ?? "") as string;
    if (!fileToken) return "[image: token missing]";
    const mime = (imageData.mime_type ?? "") as string;
    const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
    const ext = extMap[mime] ?? "png";
    const filename = `${fileToken}.${ext}`;
    if (imageCollector) imageCollector.push({ file_token: fileToken, filename });
    return `![image](images/${filename})`;
  }
  if (bt === BT_CALLOUT) {
    const body = ((block.callout ?? {}) as Record<string, unknown>).elements as Record<string, unknown>[] | undefined;
    if (body?.length) return "> " + renderElementsToMd(body);
    return null;
  }

  const level = bt - 2;
  if (level >= 1 && level <= 9) return "#".repeat(level) + " " + fieldMd(HEADING_FIELD[level]!);

  for (const field of ["text", "callout"]) {
    const elems = ((block[field] as Record<string, unknown>)?.elements ?? []) as Record<string, unknown>[];
    if (elems.length) return renderElementsToMd(elems);
  }
  return `[block_type=${bt}]`;
}

// ── Document Export Engine ──────────────────────────────────────────────────

// ── Reusable Read Helpers (used by wiki module) ─────────────────────────────

export async function readDocContent(
  client: lark.Client, docId: string
): Promise<{ content: string; blocks_count: number }> {
  const items = await getAllPages(client, `/docx/v1/documents/${docId}/blocks`, { page_size: "500", document_revision_id: "-1" });
  const mdLines: string[] = [];
  for (const item of items) {
    const block = item as Record<string, unknown>;
    const bt = (block.block_type ?? 0) as number;
    const text = extractText(block, bt);
    if (text !== null) mdLines.push(text);
  }
  return { content: mdLines.join("\n\n"), blocks_count: mdLines.length };
}

export async function readDocBlockList(
  client: lark.Client, docId: string
): Promise<{ blocks: Record<string, unknown>[]; count: number }> {
  const items = await getAllPages(client, `/docx/v1/documents/${docId}/blocks`, { page_size: "500", document_revision_id: "-1" });
  const blockList = (items as Record<string, unknown>[])
    .filter((b) => (b.block_type as number) !== BT_PAGE)
    .map((b, i) => ({
      index: i,
      block_id: b.block_id,
      type: b.block_type,
      type_name: BLOCK_TYPE_NAME[(b.block_type ?? 0) as number] ?? `type=${b.block_type}`,
      preview: blockPreview(b, (b.block_type ?? 0) as number).slice(0, 80),
    }));
  return { blocks: blockList, count: blockList.length };
}

export async function exportDocument(
  client: lark.Client, docId: string, outputPath: string = "", downloadImages = true
): Promise<string> {
  const docInfo = await userRequest(client, "GET", `/docx/v1/documents/${docId}`);
  const title = (((docInfo.data as Record<string, unknown>)?.document as Record<string, unknown>)?.title ?? "untitled") as string;

  const items = await getAllPages(client, `/docx/v1/documents/${docId}/blocks`, { page_size: "500", document_revision_id: "-1" });
  const imageCollector: ImageMeta[] = [];
  const mdLines: string[] = [];
  for (const item of items) {
    const block = item as Record<string, unknown>;
    const bt = (block.block_type ?? 0) as number;
    const text = extractText(block, bt, imageCollector);
    if (text !== null) mdLines.push(text);
  }

  const mdContent = mdLines.join("\n\n");
  let outPath = outputPath;
  if (!outPath) {
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").trim();
    outPath = `${safeTitle}.md`;
  }
  const outDir = path.dirname(outPath);
  if (outDir && outDir !== ".") fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, mdContent);
  Log.ok(`Exported: ${outPath} (${mdLines.length} blocks, ${mdContent.length} chars)`);

  if (downloadImages && imageCollector.length) {
    const imgDir = path.join(path.dirname(outPath) || ".", "images");
    fs.mkdirSync(imgDir, { recursive: true });
    Log.info(`Downloading ${imageCollector.length} images to ${imgDir}/`);
    let downloaded = 0;
    for (const img of imageCollector) {
      const savePath = path.join(imgDir, img.filename);
      if (fs.existsSync(savePath)) { downloaded++; continue; }
      try {
        const resp = await userRequest(client, "GET", `/drive/v1/medias/${img.file_token}/download`);
        if (resp && typeof resp === "object" && "writeFile" in resp) {
          await (resp as { writeFile: (p: string) => Promise<void> }).writeFile(savePath);
          downloaded++;
        }
      } catch { Log.error(`Failed: ${img.filename}`); }
      await sleep(300);
    }
    Log.ok(`Images: ${downloaded}/${imageCollector.length} downloaded`);
  }

  return outPath;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateTrashFolder(client: lark.Client): Promise<string> {
  const trashTokenFile = path.join(DATA_DIR, "trash_folder_token");
  if (fs.existsSync(trashTokenFile)) return fs.readFileSync(trashTokenFile, "utf-8").trim();

  const rootResult = await userRequest(client, "GET", "/drive/explorer/v2/root_folder/meta");
  const rootToken = ((rootResult.data as Record<string, unknown>)?.token ?? "") as string;
  const files = await getAllPages(client, "/drive/v1/files", { folder_token: rootToken, page_size: "200" }, "files");

  for (const f of files as Record<string, unknown>[]) {
    if (f.name === "_trash" && f.type === "folder") {
      const token = f.token as string;
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(trashTokenFile, token);
      return token;
    }
  }

  const createResult = await userRequest(client, "POST", "/drive/v1/files/create_folder", { name: "_trash", folder_token: rootToken });
  const newToken = ((createResult.data as Record<string, unknown>)?.token ?? "") as string;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(trashTokenFile, newToken);
  return newToken;
}

interface TreeNode {
  name: string;
  token: string;
  type: string;
  children?: TreeNode[];
}

async function buildTree(
  client: lark.Client, folderToken: string, maxDepth: number, depth = 1
): Promise<TreeNode[]> {
  if (depth > maxDepth) return [];
  const files = await getAllPages(client, "/drive/v1/files", { folder_token: folderToken, page_size: "200" }, "files") as Record<string, unknown>[];
  const nodes: TreeNode[] = [];
  for (const f of files) {
    const node: TreeNode = {
      name: (f.name ?? "(unnamed)") as string,
      token: (f.token ?? "") as string,
      type: (f.type ?? "?") as string,
    };
    if (f.type === "folder") {
      node.children = await buildTree(client, f.token as string, maxDepth, depth + 1);
    }
    nodes.push(node);
    await sleep(100);
  }
  return nodes;
}

async function resolveDocId(client: lark.Client, args: Record<string, string>): Promise<string> {
  let docId = args["document-id"] ?? "";

  // URL auto-extraction: https://xxx.feishu.cn/docx/TOKEN or /wiki/TOKEN
  if (docId && /^https?:\/\//.test(docId)) {
    const m = docId.match(/\/(?:docx|doc|wiki)\/([A-Za-z0-9]+)/);
    if (m) {
      docId = m[1]!;
      Log.info(`Extracted token from URL: ${docId}`);
    } else {
      fail("Cannot extract document token from URL.");
    }
  }

  if (!docId && args.name) {
    const files = await getAllPages(client, "/drive/v1/files", { page_size: "200", order_by: "EditedTime", direction: "DESC" }, "files") as Record<string, unknown>[];
    const keyword = args.name.toLowerCase();
    const matched = files.filter((f) => f.type === "docx" && ((f.name ?? "") as string).toLowerCase().includes(keyword));
    if (!matched.length) fail(`No docx matching '${args.name}'`);
    if (matched.length > 1) {
      fail(`Multiple matches for '${args.name}'. Specify --document-id.`,
        JSON.stringify(matched.map(f => ({ name: f.name, token: f.token }))));
    }
    docId = matched[0]!.token as string;
    Log.info(`Found: ${matched[0]!.name} -> ${docId}`);
  }
  if (!docId) fail("Provide --document-id, --name, or a Feishu URL.");
  return docId;
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function docMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  // ── create ────────────────────────────────────────────────────────────────
  if (command === "create") {
    const title = args.title ?? "Untitled";
    const folder = args["folder-token"] ?? "";
    const result = await userRequest(client, "POST", "/docx/v1/documents", { title, folder_token: folder || undefined });
    if ((result.code as number) !== 0) fail(`Create failed: ${result.msg ?? "?"}`);
    const doc = ((result.data as Record<string, unknown>)?.document ?? {}) as Record<string, unknown>;
    const docId = (doc.document_id ?? "?") as string;

    if (args.file) {
      const mdText = fs.readFileSync(args.file, "utf-8");
      const { blocks, tableData } = markdownToBlocks(mdText);
      await flushBlocks(client, docId, docId, blocks, tableData);
      Log.ok(`Wrote ${blocks.length} blocks from ${args.file}`);
    }
    respond({ document_id: docId, title: doc.title ?? title }, `Document created: ${docId}`);

  // ── read ──────────────────────────────────────────────────────────────────
  } else if (command === "read") {
    const docId = await resolveDocId(client, args);

    if (args.raw) {
      const result = await userRequest(client, "GET", `/docx/v1/documents/${docId}/raw_content`);
      if ((result.code as number) !== 0) fail(`Read failed: ${result.msg ?? "?"}`);
      respond({ content: ((result.data as Record<string, unknown>)?.content ?? "") as string, document_id: docId });

    } else if (args.blocks) {
      const items = await getAllPages(client, `/docx/v1/documents/${docId}/blocks`, { page_size: "500", document_revision_id: "-1" });
      const blockList = (items as Record<string, unknown>[])
        .filter((b) => (b.block_type as number) !== BT_PAGE)
        .map((b, i) => ({
          index: i,
          block_id: b.block_id,
          type: b.block_type,
          type_name: BLOCK_TYPE_NAME[(b.block_type ?? 0) as number] ?? `type=${b.block_type}`,
          preview: blockPreview(b, (b.block_type ?? 0) as number).slice(0, 80),
        }));
      respond({ blocks: blockList, count: blockList.length, document_id: docId }, `${blockList.length} blocks`);

    } else {
      const items = await getAllPages(client, `/docx/v1/documents/${docId}/blocks`, { page_size: "500", document_revision_id: "-1" });
      const mdLines: string[] = [];
      for (const item of items) {
        const block = item as Record<string, unknown>;
        const bt = (block.block_type ?? 0) as number;
        const text = extractText(block, bt);
        if (text !== null) mdLines.push(text);
      }
      respond({ content: mdLines.join("\n\n"), blocks_count: mdLines.length, document_id: docId }, `${mdLines.length} blocks rendered`);
    }

  // ── insert ────────────────────────────────────────────────────────────────
  } else if (command === "insert") {
    const docId = await resolveDocId(client, args);
    const insertIndex = Number(args.index ?? "-1");
    let blocks: BlockData[] = [];
    let tableData: TableQueueEntry[] = [];

    if (args.file) {
      const mdText = fs.readFileSync(args.file, "utf-8");
      const parsed = markdownToBlocks(mdText);
      blocks = parsed.blocks; tableData = parsed.tableData;
    } else if (args.markdown) {
      // @filepath → read from file; otherwise treat as inline Markdown string
      let mdText = args.markdown.startsWith("@") ? fs.readFileSync(args.markdown.slice(1), "utf-8") : args.markdown;
      // Unescape \n from shell arguments to actual newlines
      mdText = mdText.replace(/\\n/g, "\n");
      const parsed = markdownToBlocks(mdText);
      blocks = parsed.blocks; tableData = parsed.tableData;
    } else if (args.image) {
      Log.info(`Uploading image: ${args.image}`);
      const fileToken = await uploadImage(docId, args.image);
      blocks = [{ block_type: BT_IMAGE, image: { token: fileToken } }];
    } else if (args.text) {
      blocks = [{ block_type: BT_TEXT, text: { elements: [{ text_run: { content: args.text } }] } }];
    } else if (args.heading) {
      const level = Number(args.level ?? "1");
      const bt = level + 2;
      const field = HEADING_FIELD[level] ?? "heading1";
      blocks = [{ block_type: bt, [field]: { elements: [{ text_run: { content: args.heading } }] } }];
    } else if (args.code) {
      const lang = args.language ?? "plaintext";
      const langCode = LANG_MAP[lang.toLowerCase()] ?? 1;
      blocks = [{ block_type: BT_CODE, code: { language: langCode, elements: [{ text_run: { content: args.code } }] } }];
    } else if (args.divider) {
      blocks = [{ block_type: BT_DIVIDER }];
    } else {
      fail("Specify content: --text, --heading, --code, --file, --markdown, --image, or --divider");
    }

    // --replace: atomic delete + insert at same position
    if (args.replace) {
      const start = Number(args.start ?? "");
      const end = Number(args.end ?? "");
      if (isNaN(start) || isNaN(end)) fail("--replace requires --start N --end M");
      const delResult = await userRequest(client, "DELETE",
        `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`,
        { start_index: start, end_index: end });
      if ((delResult.code as number) !== 0) fail(`Replace (delete phase) failed: ${delResult.msg ?? "?"}`);
      await sleep(200);
      await flushBlocks(client, docId, docId, blocks, tableData, start);
      respond({
        document_id: docId,
        replaced: { start, end, deleted: end - start },
        inserted_count: blocks.length,
      }, `Replaced blocks [${start}, ${end}) with ${blocks.length} block(s)`);
    } else {
      await flushBlocks(client, docId, docId, blocks, tableData, insertIndex);
      respond({
        document_id: docId,
        blocks_count: blocks.length,
        index: insertIndex,
      }, `Inserted ${blocks.length} block(s) at index ${insertIndex === -1 ? "end" : insertIndex}`);
    }

  // ── delete ────────────────────────────────────────────────────────────────
  } else if (command === "delete") {
    const docId = await resolveDocId(client, args);

    if (args["block-id"]) {
      const items = await getAllPages(client, `/docx/v1/documents/${docId}/blocks`, { page_size: "500", document_revision_id: "-1" });
      const allBlocks = (items as Record<string, unknown>[]).filter((b) => (b.block_type as number) !== BT_PAGE);
      const idx = allBlocks.findIndex((b) => b.block_id === args["block-id"]);
      if (idx === -1) fail(`Block ID not found: ${args["block-id"]}`);
      const result = await userRequest(client, "DELETE",
        `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`,
        { start_index: idx, end_index: idx + 1 });
      if ((result.code as number) !== 0) fail(`Delete failed: ${result.msg ?? "?"}`);
      respond({ document_id: docId, deleted_block_id: args["block-id"], index: idx }, `Deleted block at index ${idx}`);

    } else {
      const start = Number(args.start ?? "");
      const end = Number(args.end ?? "");
      if (isNaN(start) || isNaN(end)) fail("Provide --start N --end M, or --block-id X");
      const result = await userRequest(client, "DELETE",
        `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`,
        { start_index: start, end_index: end });
      if ((result.code as number) !== 0) fail(`Delete failed: ${result.msg ?? "?"}`);
      respond({ document_id: docId, start, end, deleted: end - start }, `Deleted blocks [${start}, ${end})`);
    }

  // ── list ──────────────────────────────────────────────────────────────────
  } else if (command === "list") {
    const params: Record<string, string> = {
      page_size: "200", order_by: args["order-by"] ?? "EditedTime", direction: args.direction ?? "DESC",
    };
    if (args.folder) params.folder_token = args.folder;
    let files = await getAllPages(client, "/drive/v1/files", params, "files") as Record<string, unknown>[];
    if (args.type) files = files.filter((f) => f.type === args.type);

    respond({
      files: files.map(f => ({ name: f.name, type: f.type, token: f.token, url: f.url })),
      count: files.length,
    }, `${files.length} file(s)`);

  // ── tree ──────────────────────────────────────────────────────────────────
  } else if (command === "tree") {
    const shared = args.shared;
    const maxDepth = Number(args.depth ?? "3");

    if (shared && !args.folder) {
      const folders = loadSharedFolders();
      if (!Object.keys(folders).length) fail("No shared folders cached.", "./feishu doc shared-add --url '<URL>'");
      const result: Record<string, TreeNode[]> = {};
      for (const [token] of Object.entries(folders)) {
        result[token] = await buildTree(client, token, maxDepth);
      }
      respond({ shared_trees: result }, `${Object.keys(result).length} shared folder(s)`);
    } else {
      let root = args.folder ?? "";
      if (!root) {
        const r = await userRequest(client, "GET", "/drive/explorer/v2/root_folder/meta");
        root = ((r.data as Record<string, unknown>)?.token ?? "") as string;
      }
      const tree = await buildTree(client, root, maxDepth);
      respond({ root_token: root, tree }, `Drive tree (depth=${maxDepth})`);
    }

  // ── search ────────────────────────────────────────────────────────────────
  } else if (command === "search") {
    const files = await getAllPages(client, "/drive/v1/files", { page_size: "200", order_by: "EditedTime", direction: "DESC" }, "files") as Record<string, unknown>[];
    const keyword = (args.name ?? "").toLowerCase();
    const matched = files.filter((f) => ((f.name ?? "") as string).toLowerCase().includes(keyword));
    respond({
      files: matched.map(f => ({ name: f.name, type: f.type, token: f.token })),
      count: matched.length,
      total_scanned: files.length,
    }, `${matched.length} match(es)`);

  // ── search-content ────────────────────────────────────────────────────────
  } else if (command === "search-content") {
    if (!args.query) fail("--query required");
    const count = Math.min(Number(args.count ?? "20"), 50);
    const body: Record<string, unknown> = { search_key: args.query, count, offset: 0, owner_ids: [], chat_ids: [], docs_types: [] };
    if (args.type) body.docs_types = args.type.split(",").map((t: string) => t.trim());

    const result = await userRequest(client, "POST", "/suite/docs-api/search/object", body);
    const data = (result.data ?? {}) as Record<string, unknown>;
    const docs = (data.docs_entities ?? []) as Record<string, unknown>[];
    const total = (data.total ?? 0) as number;
    const hasMore = (data.has_more ?? false) as boolean;

    const FEISHU_BASE = "https://feishu.cn";
    const results = docs.map(doc => {
      const dtype = (doc.docs_type ?? "?") as string;
      const token = (doc.docs_token ?? "") as string;
      const url = ["docx", "doc", "sheet"].includes(dtype)
        ? `${FEISHU_BASE}/${dtype}/${token}` : `${FEISHU_BASE}/wiki/${token}`;
      return { title: doc.title, docs_type: dtype, docs_token: token, url };
    });

    let readContent: string | null = null;
    if (args.read && docs.length) {
      const first = docs[0]!;
      const firstToken = (first.docs_token ?? "") as string;
      const firstType = (first.docs_type ?? "") as string;
      if (["docx", "doc"].includes(firstType) && firstToken) {
        Log.info(`Reading: ${first.title ?? "?"} (${firstToken})`);
        const items = await getAllPages(client, `/docx/v1/documents/${firstToken}/blocks`, { page_size: "500", document_revision_id: "-1" });
        const mdLines: string[] = [];
        for (const item of items) {
          const block = item as Record<string, unknown>;
          const bt = (block.block_type ?? 0) as number;
          const text = extractText(block, bt);
          if (text !== null) mdLines.push(text);
        }
        readContent = mdLines.join("\n\n");
      }
    }

    respond({
      results,
      count: docs.length,
      total,
      has_more: hasMore,
      ...(readContent !== null ? { read_content: readContent, read_token: docs[0]?.docs_token } : {}),
    }, `${docs.length}/${total} result(s)${readContent !== null ? " (first doc read)" : ""}`);

  // ── trash ─────────────────────────────────────────────────────────────────
  } else if (command === "trash") {
    if (!args.token) fail("--token required");
    const trashToken = await getOrCreateTrashFolder(client);
    const result = await userRequest(client, "POST", `/drive/v1/files/${args.token}/move`, { type: args.type ?? "docx", folder_token: trashToken });
    if ((result.code as number) !== 0) fail(`Trash failed: ${result.msg ?? "?"}`);
    respond({ token: args.token }, `Moved ${args.token} to _trash`);

  // ── copy ──────────────────────────────────────────────────────────────────
  } else if (command === "copy") {
    if (!args.token || !args["folder-token"]) fail("--token and --folder-token required");
    const body: Record<string, unknown> = { type: args.type ?? "docx", folder_token: args["folder-token"] };
    if (args.name) body.name = args.name;
    const result = await userRequest(client, "POST", `/drive/v1/files/${args.token}/copy`, body);
    if ((result.code as number) !== 0) fail(`Copy failed: ${result.msg ?? "?"}`);
    const f = ((result.data as Record<string, unknown>)?.file ?? {}) as Record<string, unknown>;
    respond({ token: f.token, name: f.name, url: f.url }, `Copied: ${f.token ?? "?"}`);

  // ── export ────────────────────────────────────────────────────────────────
  } else if (command === "export") {
    const docId = await resolveDocId(client, args);
    const outPath = await exportDocument(client, docId, args.output ?? "", !args["no-images"]);
    respond({ document_id: docId, output: outPath }, `Exported to ${outPath}`);

  // ── shared-add/list/remove ────────────────────────────────────────────────
  } else if (command === "shared-add") {
    if (!args.url) fail("--url required");
    const token = extractFolderToken(args.url);
    if (!token) fail("Cannot extract folder token from URL. Expected: https://xxx.feishu.cn/drive/folder/TOKEN");
    const meta = await userRequest(client, "GET", `/drive/explorer/v2/folder/${token}/meta`);
    if ((meta.code as number) !== 0) fail(`Cannot access folder: ${meta.msg ?? "?"}`);
    const name = ((meta.data as Record<string, unknown>)?.name ?? "(unnamed)") as string;
    const folders = loadSharedFolders();
    folders[token] = { name, url: args.url.trim(), added_at: new Date().toISOString() };
    saveSharedFolders(folders);
    respond({ token, name }, `Shared folder cached: ${name}`);

  } else if (command === "shared-list") {
    const folders = loadSharedFolders();
    respond({
      folders: Object.entries(folders).map(([token, info]) => ({ token, name: info.name, added_at: info.added_at })),
      count: Object.keys(folders).length,
    }, `${Object.keys(folders).length} shared folder(s)`);

  } else if (command === "shared-remove") {
    if (args.all) {
      saveSharedFolders({});
      respond(null, "All shared folders removed");
    } else if (args.token) {
      const token = extractFolderToken(args.token);
      const folders = loadSharedFolders();
      if (token in folders) {
        const name = folders[token]!.name ?? token;
        delete folders[token];
        saveSharedFolders(folders);
        respond({ token, name }, `Removed: ${name}`);
      } else {
        fail(`Token not found in cache: ${token}`);
      }
    } else {
      fail("Provide --token or --all.");
    }

  // ── help ──────────────────────────────────────────────────────────────────
  } else {
    respond({
      commands: [
        "create", "read", "insert", "delete",
        "list", "tree", "search", "search-content",
        "trash", "copy", "export",
        "shared-add", "shared-list", "shared-remove"
      ],
      usage: "./feishu doc <command>",
    }, "Document & Drive management");
  }
}
