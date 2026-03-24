/**
 * Feishu Client — Wraps @larksuiteoapi/node-sdk with credential management.
 *
 * POLICY: Zero env-var. All credentials from NX1 credential store.
 * On permission errors, provides actionable hints with direct links.
 */

import * as lark from "@larksuiteoapi/node-sdk";
import * as fs from "node:fs";
import { Log } from "./log.js";
import {
  CREDENTIALS_FILE,
  DATA_DIR,
  API_BASE,
  ERR_MISSING_SCOPE,
  ERR_INVALID_USER_TOKEN,
  ERR_TOKEN_EXPIRED,
  ERR_APP_NOT_ENABLED,
  ERR_INSUFFICIENT_APP_PERM,
  FEISHU_ADMIN_CONSOLE,
} from "./constants.js";
import { CredentialStore } from "./credential-store.js";
import { fail } from "./utils.js";

const VAULT_SENTINEL = "***vault***";
const credStore = new CredentialStore("feishu", DATA_DIR);

// ── Credential Persistence ──────────────────────────────────────────────────

interface StoredCredentials {
  user_access_token: string;
  refresh_token: string;
  expires_in: number;
  expire_at: number;
  scope: string;
  app_id: string;
  app_secret: string;
  updated_at: string;
  [key: string]: unknown;
}

export function loadCredentials(): Partial<StoredCredentials> {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

export function saveCredentials(creds: Record<string, unknown>): void {
  const secret = creds.app_secret;
  if (typeof secret === "string" && secret && secret !== VAULT_SENTINEL) {
    credStore.set("app-secret", secret);
    creds.app_secret = VAULT_SENTINEL;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
  Log.ok(`Credentials saved → ${CREDENTIALS_FILE}`);
}

/**
 * Load app credentials from credential store ONLY. No env vars.
 */
export function getAppCredentials(): { appId: string; appSecret: string } {
  const creds = loadCredentials();
  const appId = (creds.app_id ?? "") as string;
  let appSecret = (creds.app_secret ?? "") as string;
  if (appSecret === VAULT_SENTINEL) {
    appSecret = credStore.get("app-secret") ?? "";
  }
  return { appId, appSecret };
}

// ── SDK Client Factory ──────────────────────────────────────────────────────

export function createLarkClient(): lark.Client {
  const { appId, appSecret } = getAppCredentials();
  if (!appId || !appSecret) {
    fail(
      "No app credentials found.",
      'Run: ./feishu auth setup --app-id "<id>" --app-secret "<secret>"'
    );
  }

  return new lark.Client({
    appId,
    appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.error,
  });
}

/**
 * Resolve user_access_token from credential store ONLY. No env vars.
 */
export async function resolveUserToken(): Promise<string> {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const creds = loadCredentials();
      const stored = creds.user_access_token ?? "";
      const expireAt = creds.expire_at ?? 0;
      const now = Math.floor(Date.now() / 1000);

      if (stored && expireAt > now) {
        const remaining = Math.floor((expireAt - now) / 60);
        Log.info(`Token valid (~${remaining}min remaining)`);
        return stored;
      }
      if (stored && expireAt > 0) {
        Log.warn("Token expired. Attempting auto-refresh...");
        if (await autoRefresh()) {
          const refreshed = loadCredentials();
          const newToken = refreshed.user_access_token ?? "";
          if (newToken) {
            const rem = Math.floor(
              ((refreshed.expire_at ?? 0) - Math.floor(Date.now() / 1000)) / 60
            );
            Log.ok(`Token refreshed (~${rem}min remaining)`);
            return newToken;
          }
        }
        fail(
          "Token expired and auto-refresh failed.",
          "./feishu auth login"
        );
      }
    } catch {
      // fall through
    }
  }

  const { appId } = getAppCredentials();
  if (appId) {
    fail(
      "No user_access_token. Need to login first.",
      "./feishu auth login"
    );
  } else {
    fail(
      "No app credentials found.",
      './feishu auth setup --app-id "<id>" --app-secret "<secret>"'
    );
  }
}

// ── Permission Error Handling ───────────────────────────────────────────────

/**
 * Analyze API response and return actionable error info.
 * Returns true if the error was a permission issue.
 */
function handlePermissionError(
  result: Record<string, unknown>,
  url: string
): boolean {
  const code = (result.code ?? 0) as number;
  const msg = (result.msg ?? "") as string;
  const { appId } = getAppCredentials();

  if (code === ERR_MISSING_SCOPE) {
    const scopeMatch = msg.match(/required\s+scope[:\s]*\[?([^\]]+)\]?/i) ??
                       msg.match(/scope[:\s]+([a-z_:.]+(?:[,\s]+[a-z_:.]+)*)/i);
    const missingScopes = scopeMatch
      ? scopeMatch[1]!.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
      : [];

    Log.error(`⛔ 权限不足 (${code}): ${msg}`);
    if (missingScopes.length) {
      Log.error(`缺少 scope: ${missingScopes.join(", ")}`);
    }
    if (appId) {
      Log.error(`权限管理: ${FEISHU_ADMIN_CONSOLE}/${appId}/security/permission`);
    }
    Log.error("修复: ./feishu auth login --all");
    return true;
  }

  if (code === ERR_APP_NOT_ENABLED || code === ERR_INSUFFICIENT_APP_PERM) {
    Log.error(`⛔ 应用权限不足 (${code}): ${msg}`);
    if (appId) {
      Log.error(`权限管理: ${FEISHU_ADMIN_CONSOLE}/${appId}/security/permission`);
      const apiPath = url.replace(API_BASE, "");
      Log.error(`当前 API: ${apiPath}`);
    }
    return true;
  }

  if (code === ERR_INVALID_USER_TOKEN || code === ERR_TOKEN_EXPIRED) {
    Log.error(`⛔ Token 失效 (${code}): ${msg}`);
    Log.error("修复: ./feishu auth login");
    return true;
  }

  return false;
}

// ── Authenticated Request ───────────────────────────────────────────────────

export async function userRequest(
  client: lark.Client,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  data?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<Record<string, unknown>> {
  const token = await resolveUserToken();
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const queryStr = params
    ? "?" + new URLSearchParams(params).toString()
    : "";

  try {
    const res = await client.request({
      method,
      url: fullUrl + queryStr,
      data,
    }, lark.withUserAccessToken(token));

    const result = res as Record<string, unknown>;
    const code = (result.code ?? 0) as number;

    if (code !== 0) {
      handlePermissionError(result, fullUrl);
    }

    return result;
  } catch (e: any) {
    if (e.response && e.response.data) {
      const errResult = e.response.data as Record<string, unknown>;
      handlePermissionError(errResult, fullUrl);
      const msg = errResult.msg || errResult.message || JSON.stringify(errResult);
      Log.error(`API Error HTTP ${e.response.status} on ${method} ${fullUrl}: ${msg}`);
      return { code: e.response.status, msg: String(msg), ...errResult };
    }
    if (e && typeof e === "object" && "code" in e) {
      const errResult = e as Record<string, unknown>;
      handlePermissionError(errResult, fullUrl);
      return errResult;
    }
    Log.error(`Request failed: ${e}`);
    return { code: -1, msg: String(e) };
  }
}

/**
 * Paginated GET helper — fetches all pages and returns combined items.
 */
export async function getAllPages(
  client: lark.Client,
  path: string,
  params?: Record<string, string>,
  itemsKey = "items"
): Promise<unknown[]> {
  const mergedParams: Record<string, string> = {
    page_size: "50",
    ...(params ?? {}),
  };
  const allItems: unknown[] = [];

  while (true) {
    const result = await userRequest(client, "GET", path, undefined, mergedParams);
    const code = (result.code ?? 0) as number;
    if (code !== 0) break;

    const data = (result.data ?? {}) as Record<string, unknown>;
    const items = (data[itemsKey] ?? []) as unknown[];
    allItems.push(...items);

    if (!data.has_more) break;
    const pageToken = data.page_token as string | undefined;
    if (!pageToken) break;
    mergedParams.page_token = pageToken;
  }

  return allItems;
}

// ── Internal: Token Refresh ─────────────────────────────────────────────────

async function autoRefresh(): Promise<boolean> {
  Log.info("Attempting auto-refresh...");
  const { appId, appSecret } = getAppCredentials();
  if (!appId || !appSecret) return false;

  const creds = loadCredentials();
  const refreshToken = creds.refresh_token ?? "";
  if (!refreshToken) {
    Log.warn("No refresh_token (ensure 'offline_access' scope is enabled)");
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/authen/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: appSecret,
        refresh_token: refreshToken,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if ((data.code ?? 0) !== 0) return false;
    const tokenData = (data.data ?? data) as Record<string, unknown>;
    const accessToken = (tokenData.access_token ?? "") as string;
    if (!accessToken) return false;

    const expiresIn = (tokenData.expires_in ?? 7200) as number;
    const expireAt = Math.floor(Date.now() / 1000) + expiresIn;
    saveCredentials({
      ...creds,
      user_access_token: accessToken,
      refresh_token: (tokenData.refresh_token ?? "") as string,
      expires_in: expiresIn,
      expire_at: expireAt,
      scope: (tokenData.scope ?? creds.scope ?? "") as string,
      updated_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}
