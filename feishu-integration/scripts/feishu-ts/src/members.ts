/**
 * Feishu Member Directory — Scan, Cache, and Lookup.
 *
 * Usage: ./feishu member scan|list|find|whoami
 */

import * as fs from "node:fs";
import * as lark from "@larksuiteoapi/node-sdk";
import { Log } from "./log.js";
import { MEMBERS_CACHE_FILE } from "./constants.js";
import {
  createLarkClient,
  userRequest,
  getAllPages,
} from "./client.js";
import { parseArgs, respond, fail } from "./utils.js";

const CACHE_TTL_HOURS = 24 * 7; // 7 days

interface MemberEntry {
  open_id: string;
  name: string;
  en_name: string;
  email: string;
  mobile: string;
  department_ids: string[];
  status: Record<string, unknown>;
}

interface MembersCache {
  updated_at: number;
  updated_at_human: string;
  count: number;
  members: MemberEntry[];
  index: Record<string, string>;
}

// ── Cache Layer ─────────────────────────────────────────────────────────────

function loadCache(): Partial<MembersCache> {
  if (fs.existsSync(MEMBERS_CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MEMBERS_CACHE_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveCache(data: MembersCache): void {
  fs.mkdirSync(
    MEMBERS_CACHE_FILE.replace(/\/[^/]+$/, ""),
    { recursive: true }
  );
  fs.writeFileSync(MEMBERS_CACHE_FILE, JSON.stringify(data, null, 2), {
    mode: 0o600,
  });
}

function isCacheFresh(cache: Partial<MembersCache>): boolean {
  const updated = cache.updated_at ?? 0;
  if (!updated) return false;
  const ageHours = (Date.now() / 1000 - updated) / 3600;
  return ageHours < CACHE_TTL_HOURS;
}

function buildIndex(members: MemberEntry[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const m of members) {
    if (!m.open_id) continue;
    for (const key of ["name", "en_name"] as const) {
      const name = (m[key] ?? "").trim();
      if (name) index[name] = m.open_id;
    }
  }
  return index;
}

// ── Public Resolution API (importable) ──────────────────────────────────────

export function resolveIdToName(openId: string): string {
  const cache = loadCache();
  for (const m of cache.members ?? []) {
    if (m.open_id === openId) {
      return m.name || m.en_name || openId;
    }
  }
  return openId;
}

export function resolveIdsToNames(openIds: string[]): string[] {
  const cache = loadCache();
  const members = cache.members ?? [];
  const idMap: Record<string, string> = {};
  for (const m of members) {
    if (m.open_id) {
      idMap[m.open_id] = m.name || m.en_name || m.open_id;
    }
  }
  return openIds.map((oid) => idMap[oid] ?? oid);
}

export async function resolveMember(
  name: string,
  client: lark.Client
): Promise<string> {
  let cache = loadCache();
  if (!isCacheFresh(cache) || !(cache.members ?? []).length) {
    Log.info("Member cache stale, scanning...");
    cache = await scanMembers(client);
  }

  const index = cache.index ?? {};
  const members = cache.members ?? [];

  if (index[name]) return index[name]!;

  const matches = members.filter(
    (m) =>
      (m.name && m.name.includes(name)) ||
      (m.en_name && m.en_name.includes(name))
  );

  if (matches.length === 1) return matches[0]!.open_id;
  if (matches.length > 1) {
    Log.warn(`Multiple matches for '${name}':`);
    for (const m of matches) {
      Log.warn(`  ${m.name} -> ${m.open_id}`);
    }
    Log.error("Please use a more specific name.");
    return "";
  }

  Log.error(`No member found for '${name}'`);
  return "";
}

export async function resolveMembers(
  names: string,
  client: lark.Client
): Promise<string[]> {
  const result: string[] = [];
  for (const name of names.split(",")) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("ou_")) {
      result.push(trimmed);
      continue;
    }
    const oid = await resolveMember(trimmed, client);
    if (oid) result.push(oid);
  }
  return result;
}

// ── Scan ────────────────────────────────────────────────────────────────────

async function scanMembers(client: lark.Client): Promise<MembersCache> {
  Log.info("Scanning organization members...");
  const items = await getAllPages(
    client,
    "/contact/v3/users",
    { department_id: "0", page_size: "50" }
  );

  const members: MemberEntry[] = (items as Record<string, unknown>[]).map((u) => ({
    open_id: (u.open_id ?? "") as string,
    name: (u.name ?? "") as string,
    en_name: (u.en_name ?? "") as string,
    email: (u.email ?? "") as string,
    mobile: (u.mobile ?? "") as string,
    department_ids: (u.department_ids ?? []) as string[],
    status: (u.status ?? {}) as Record<string, unknown>,
  }));

  const index = buildIndex(members);
  const cache: MembersCache = {
    updated_at: Date.now() / 1000,
    updated_at_human: new Date().toISOString(),
    count: members.length,
    members,
    index,
  };
  saveCache(cache);
  Log.ok(`Cached ${members.length} members → ${MEMBERS_CACHE_FILE}`);
  return cache;
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function membersMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);
  const client = createLarkClient();

  if (command === "scan") {
    const cache = await scanMembers(client);
    respond({ count: cache.count }, `Scanned ${cache.count} members`);

  } else if (command === "whoami") {
    const result = await userRequest(client, "GET", "/authen/v1/user_info");
    if ((result.code as number) === 0) {
      respond(result.data, "Current user info");
    } else {
      fail(`Failed to get user info: ${result.msg ?? "?"}`);
    }

  } else if (command === "find") {
    const name = args.name;
    if (!name) {
      // No keyword = list all cached members
      const cache = loadCache();
      const members = cache.members ?? [];
      if (!members.length) {
        fail("No cached members.", "./feishu member scan");
      }
      respond({
        members: members.map(m => ({
          open_id: m.open_id,
          name: m.name,
          en_name: m.en_name,
          email: m.email,
        })),
        count: members.length,
        updated_at: cache.updated_at_human ?? "?",
      }, `${members.length} members cached`);
    } else {
      const oid = await resolveMember(name, client);
      if (oid) {
        respond({ name, open_id: oid }, `${name} → ${oid}`);
      } else {
        fail(`No member found for '${name}'`, "./feishu member scan  (refresh cache)");
      }
    }

  } else {
    respond({
      commands: ["scan", "find", "whoami"],
      usage: "./feishu member <command>",
    }, "Member directory");
  }
}
