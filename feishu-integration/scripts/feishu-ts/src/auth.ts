/**
 * Feishu OAuth2 Authentication — Setup, Login, Status.
 *
 * POLICY: Zero env-var. All credentials stored in NX1 credential store.
 * Usage: ./feishu auth setup|login|status
 *
 * NOTE: Auth commands are inherently interactive (browser OAuth flow).
 * respond()/fail() are used for the final result; intermediate guidance
 * goes to stderr via Log.*.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { Log } from "./log.js";
import {
  API_BASE,
  CREDENTIALS_FILE,
  CORE_SCOPES,
  ALL_SCOPES,
  OAUTH_REDIRECT_PORT,
  OAUTH_REDIRECT_URI,
  FEISHU_ADMIN_CONSOLE,
} from "./constants.js";
import {
  loadCredentials,
  saveCredentials,
  getAppCredentials,
} from "./client.js";
import { parseArgs, respond, fail } from "./utils.js";

// ── OAuth2 URL Builder ──────────────────────────────────────────────────────

function buildAuthorizeUrl(appId: string, scopes: string[]): string {
  const encodedUri = encodeURIComponent(OAUTH_REDIRECT_URI);
  const scopeStr = encodeURIComponent(scopes.join(" "));
  return (
    `${API_BASE}/authen/v1/authorize` +
    `?app_id=${appId}` +
    `&redirect_uri=${encodedUri}` +
    `&response_type=code` +
    `&scope=${scopeStr}` +
    `&state=feishu_auth`
  );
}

// ── Callback Server ─────────────────────────────────────────────────────────

function waitForCallback(): Promise<string> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://localhost:${OAUTH_REDIRECT_PORT}`);
      if (url.pathname === "/callback" && url.searchParams.has("code")) {
        const code = url.searchParams.get("code")!;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;font-family:-apple-system,"Helvetica Neue",sans-serif;color:#1a1a1a}
.card{max-width:360px;padding:48px 40px;text-align:center}
.mark{width:40px;height:40px;border-radius:50%;background:#22863a;margin:0 auto 24px;display:flex;align-items:center;justify-content:center}
.mark svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
h2{font-size:18px;font-weight:600;margin:0 0 8px;letter-spacing:-.01em}
p{font-size:14px;color:#666;margin:0;line-height:1.5}
</style></head><body>
<div class="card">
<div class="mark"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
<h2>Authorization Complete</h2>
<p>You may close this window and return to the terminal.</p>
</div></body></html>`);
        server.close();
        resolve(code);
      } else {
        res.writeHead(400);
        res.end();
      }
    });

    server.listen(OAUTH_REDIRECT_PORT, "localhost");
    server.setTimeout(180_000, () => {
      server.close();
      resolve("");
    });
  });
}

// ── Token Exchange ──────────────────────────────────────────────────────────

async function exchangeCode(
  appId: string,
  appSecret: string,
  code: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  const result = (await res.json()) as Record<string, unknown>;
  if ((result.code as number) !== 0) {
    fail(`Token exchange failed: ${result.msg ?? "unknown"}`);
  }

  const data = (result.data ?? result) as Record<string, unknown>;
  const accessToken = (data.access_token ?? "") as string;
  const refreshToken = (data.refresh_token ?? "") as string;
  const expiresIn = (data.expires_in ?? 7200) as number;
  const scopeStr = (data.scope ?? "") as string;

  if (!accessToken) {
    fail("No access_token in response.");
  }

  const expireAt = Math.floor(Date.now() / 1000) + expiresIn;
  saveCredentials({
    user_access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expire_at: expireAt,
    scope: scopeStr,
    app_id: appId,
    app_secret: appSecret,
    updated_at: new Date().toISOString(),
  });

  Log.ok("✅ 认证成功!");
}

// ── Browser + Exchange Flow ─────────────────────────────────────────────────

async function openBrowserAndExchange(
  appId: string,
  appSecret: string,
  scopes: string[]
): Promise<boolean> {
  const authUrl = buildAuthorizeUrl(appId, scopes);

  Log.info("Opening browser for authorization...");
  try {
    execSync(`open "${authUrl}"`, { stdio: "ignore" });
  } catch {
    try {
      execSync(`xdg-open "${authUrl}"`, { stdio: "ignore" });
    } catch {
      Log.warn(`Please open manually: ${authUrl}`);
    }
  }

  Log.info(`Waiting for callback on http://localhost:${OAUTH_REDIRECT_PORT} ...`);

  const code = await waitForCallback();
  if (!code) {
    fail(
      "No authorization code received (timeout 3min).",
      `Ensure redirect URL is configured: ${OAUTH_REDIRECT_URI}`
    );
  }
  Log.ok(`Authorization code received.`);

  await exchangeCode(appId, appSecret, code);
  return true;
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdSetup(args: Record<string, string>): Promise<void> {
  const appId = args["app-id"] ?? "";
  const appSecret = args["app-secret"] ?? "";

  if (!appId || !appSecret) {
    fail(
      "App credentials required.",
      './feishu auth setup --app-id "<APP_ID>" --app-secret "<APP_SECRET>"'
    );
  }

  Log.info("Validating app credentials...");
  try {
    const res = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const result = (await res.json()) as Record<string, unknown>;
    if (!result.tenant_access_token) {
      fail(`Credential validation failed: ${result.msg ?? "Invalid App ID or App Secret"}`);
    }
    Log.ok("App credentials validated.");
  } catch (e) {
    fail(`Network request failed: ${e}`);
  }

  const existing = loadCredentials();
  saveCredentials({
    ...existing,
    app_id: appId,
    app_secret: appSecret,
    updated_at: new Date().toISOString(),
  });

  respond({
    app_id: appId,
    next_step: "./feishu auth login",
  }, "App credentials saved. Next: ./feishu auth login");
}

async function cmdLogin(args: Record<string, string>): Promise<void> {
  const { appId, appSecret } = getAppCredentials();
  if (!appId || !appSecret) {
    fail("App credentials not configured.", "./feishu auth setup");
  }

  const useAllScopes = !!args.all;
  const scopes = useAllScopes ? ALL_SCOPES : CORE_SCOPES;

  if (useAllScopes) {
    // Revoke old token before re-auth with all scopes
    Log.info("Revoking old authorization...");
    try {
      const res = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
      const result = (await res.json()) as Record<string, unknown>;
      const tenantToken = (result.tenant_access_token ?? "") as string;
      if (tenantToken) {
        const creds = loadCredentials();
        const storedToken = creds.user_access_token ?? "";
        if (storedToken) {
          try {
            await fetch(`${API_BASE}/authen/v1/access_token/revoke`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${tenantToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                token: storedToken,
                token_type_hint: "access_token",
              }),
            });
            Log.ok("Old token revoked.");
          } catch (e) {
            Log.warn(`Revocation skipped: ${e}`);
          }
        }
      }
    } catch {
      Log.warn("Revocation skipped (normal for expired tokens).");
    }

    // Clear old credentials
    const creds = loadCredentials();
    delete creds.user_access_token;
    delete creds.refresh_token;
    delete creds.expire_at;
    saveCredentials(creds as Record<string, unknown>);
  }

  await openBrowserAndExchange(appId, appSecret, scopes);
  const creds = loadCredentials();
  respond({
    scope_count: ((creds.scope ?? "") as string).split(" ").filter(Boolean).length,
    expires_in: creds.expires_in,
    all_scopes: useAllScopes,
  }, useAllScopes ? "Login successful (all scopes)" : "Login successful");
}

function cmdStatus(): void {
  const { appId, appSecret } = getAppCredentials();
  const hasApp = !!(appId && appSecret);

  if (!hasApp) {
    respond({
      app_configured: false,
      logged_in: false,
    }, "No app credentials configured. Run: ./feishu auth setup");
    return;
  }

  const result: Record<string, unknown> = {
    app_configured: true,
    app_id: appId,
    logged_in: false,
    admin_url: `${FEISHU_ADMIN_CONSOLE}/${appId}`,
    permission_url: `${FEISHU_ADMIN_CONSOLE}/${appId}/security/permission`,
  };

  if (fs.existsSync(CREDENTIALS_FILE)) {
    const creds = loadCredentials();
    const expireAt = creds.expire_at ?? 0;
    const now = Math.floor(Date.now() / 1000);

    if (expireAt > now) {
      const remaining = Math.floor((expireAt - now) / 60);
      result.logged_in = true;
      result.token_valid = true;
      result.remaining_minutes = remaining;
      result.scope_count = ((creds.scope ?? "") as string).split(" ").filter(Boolean).length;
      result.has_refresh_token = !!(creds.refresh_token);
      result.updated_at = creds.updated_at;
    } else if (expireAt > 0) {
      result.token_valid = false;
      result.token_expired = true;
      result.has_refresh_token = !!(creds.refresh_token);
    }
  }

  respond(result, result.logged_in ? "Authenticated" : "Not logged in");
}

// ── CLI Router ──────────────────────────────────────────────────────────────

export async function authMain(argv: string[]): Promise<void> {
  const { command, args } = parseArgs(argv);

  if (command === "setup") {
    await cmdSetup(args);
  } else if (command === "login") {
    await cmdLogin(args);
  } else if (command === "status") {
    cmdStatus();
  } else {
    respond({
      commands: ["setup", "login", "status"],
      usage: "./feishu auth <command>",
    }, "Authentication management");
  }
}
