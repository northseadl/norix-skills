# Feishu Integration Skill

> Zero-dependency Python scripts for Feishu Open API (user identity only). See [SKILL.md](./SKILL.md) for full usage.

```bash
export FEISHU_APP_ID="cli_xxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxx"

./feishu auth login     # Authorize via browser, token saved to ~/.feishu/
./feishu doc list       # List Drive files
./feishu task list      # List tasks
./feishu bitable list-tables --app-token "basXXX"  # List Bitable tables
```

## Architecture

```
feishu-integration/
├── feishu                ← Unified CLI (./feishu <module> <command>)
├── SKILL.md              ← Agent instructions
├── scripts/
│   ├── feishu_api.py     ← Core engine (auth + HTTP + retry + pagination)
│   ├── auth.py           ← OAuth2 (login / refresh / relogin)
│   ├── task.py           ← Task v2 (CRUD + tasklist + comments + batch)
│   ├── docx.py           ← Document & Drive (list / tree / read / write / trash)
│   ├── wiki.py           ← Wiki v2 (spaces + nodes + tree + create-from-markdown)
│   ├── bitable.py        ← Bitable (tables / fields / records / batch / export)
│   └── members.py        ← Member directory (scan / cache / resolve)
└── references/           ← API endpoint docs
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Python stdlib only | Zero-install in Agent environments |
| User identity only | All APIs use user_access_token; no tenant_access_token fallback |
| Credentials file over env var | Prevents stale env var from overriding fresh token |
| Auto-refresh on expiry | Token expiry auto-handled; never silently downgrades identity |
| Two-tier scope model | Core scopes at login, feature scopes on-demand |
| `update_fields` in request body | Feishu Task v2 actual behavior (not documented) |
| Timestamps in milliseconds | Feishu Task v2 actual behavior |
| Unified `./feishu` CLI | Single entry point reduces Agent cognitive load |
