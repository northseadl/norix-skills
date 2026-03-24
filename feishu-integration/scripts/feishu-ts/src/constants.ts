/**
 * Shared constants for the Feishu CLI.
 *
 * POLICY: Zero env-var configuration. All credentials live in the
 * NX1 credential store under DATA_DIR. Use `./feishu auth setup` for first-time config.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export const API_BASE = "https://open.feishu.cn/open-apis";

export const DATA_DIR = join(homedir(), ".agents", "data", "feishu");
export const CREDENTIALS_FILE = join(DATA_DIR, "credentials.json");
export const MEMBERS_CACHE_FILE = join(DATA_DIR, "members.json");
export const SHARED_FOLDERS_FILE = join(DATA_DIR, "shared_folders.json");

export const OAUTH_REDIRECT_PORT = 9876;
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_REDIRECT_PORT}/callback`;

// Two-Tier Scope Architecture
export const CORE_SCOPES = [
  "offline_access",
  "task:task:read",
  "task:task:write",
  "task:comment:write",
  "docx:document:readonly",
  "docx:document",
  "drive:drive:readonly",
  "drive:drive",
  "drive:file:readonly",
  "wiki:wiki:readonly",
  "wiki:wiki",
  "bitable:app:readonly",
  "bitable:app",
  "im:message",
  "im:message:send_as_bot",
  "im:chat:readonly",
  "im:chat",
];

export const FEATURE_SCOPES: Record<
  string,
  { scopes: string[]; description: string }
> = {
  contacts: {
    scopes: ["contact:user.base:readonly"],
    description:
      "Member directory basic info (used by members name lookup)",
  },
};

export const ALL_SCOPES = [
  ...CORE_SCOPES,
  ...Object.values(FEATURE_SCOPES).flatMap((f) => f.scopes),
];

// ── Permission Error Codes ──────────────────────────────────────────────────

/** Feishu API error: user token missing required scope */
export const ERR_MISSING_SCOPE = 99991679;
/** Feishu API error: user access token invalid/expired */
export const ERR_INVALID_USER_TOKEN = 99991668;
/** Feishu API error: user access token expired */
export const ERR_TOKEN_EXPIRED = 99991661;
/** Feishu API error: app not enabled for this API */
export const ERR_APP_NOT_ENABLED = 99991672;
/** Feishu API error: insufficient app permissions */
export const ERR_INSUFFICIENT_APP_PERM = 99991400;

export const FEISHU_ADMIN_CONSOLE = "https://open.feishu.cn/app";
