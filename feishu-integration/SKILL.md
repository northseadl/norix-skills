---
name: feishu-integration
metadata:
  version: 0.2.1
description: 'Feishu (Lark) unified CLI: tasks, documents, wiki, bitable (multi-table),
  and Drive management.

  Supports create/edit/publish/export across all modules.

  '
---

# Feishu Integration

> CLI: `./feishu <module> <command> [options]`
> Parameter details: `references/cli_reference.md`

## Auth

Check: `./feishu auth status`. Token **auto-refreshes** on any API call — no manual refresh needed.

If no credentials exist, guide user through first-use setup:
1. Create app at [飞书开放平台](https://open.feishu.cn/app) → 自建应用
2. 全选开通用户权限; add redirect `http://localhost:9876/callback`; publish
3. `export FEISHU_APP_ID="<id>" FEISHU_APP_SECRET="<secret>"` → `./feishu auth login`

## Intent → Command

### Task

| Intent | Command |
|---|---|
| 查任务 / 未完成 | `task list [--completed false]` |
| 建任务 | `task create --summary "..." [--due ISO8601] [--members "Name1,Name2"]` |
| 完成任务 | `task list --keyword "..." → task complete --task-id ID` |
| 改截止 / 去掉截止 | `task update --task-id ID --due ISO8601` / `--clear-due` |
| 建清单/Sprint | `task tasklist-create --name "..."`, then `task batch-create` |
| 评论 | `task comment --task-id ID --content "..."` |

`task list` defaults to **Markdown table** (状态/标题/截止/负责人). Use `--format json` for raw data.

### Document

| Intent | Command |
|---|---|
| 浏览文件 | `doc list` or `doc tree` |
| 搜索+读取 | `doc read-raw --name "keyword"` |
| 从 MD 创建 | `doc create-from-markdown --file path.md` |
| 追加内容 | `doc append-markdown --document-id ID --file content.md` |
| 清理 | `doc list` → `doc trash --token TOKEN` |
| 共享 | `doc shared-add --url "..."` (user provides URL) |

#### Batch Upload with Cross-Document Linking

When uploading a directory where an index (e.g., README.md) has relative `.md` links:
1. Create target folder in Drive
2. Upload child docs first via `doc create-from-markdown` → capture `{filename: feishu_url}` map
3. Replace relative links in index with Feishu URLs
4. Upload processed index

#### Markdown → Feishu Notes

Auto-handled by `create-from-markdown`:
- CJK table columns: 2x width for proportional sizing
- Relative links `[text](file.md)` → plain text (Feishu only supports HTTP links)
- Code blocks, headings, lists, quotes, dividers, todos: fully supported

### Wiki

| Intent | Command |
|---|---|
| 看知识库 | `wiki space-list` → `wiki tree --space-id ID` |
| 读页面 | `wiki node-read --token TOKEN` |
| 发方案到 wiki | `wiki create-from-markdown --space-id ID --file path.md` |

### Bitable

| Intent | Command |
|---|---|
| 看表格数据 | `bitable list-tables` → `bitable list-records --json` |
| 导出 | `bitable export --format csv --output path.csv` |
| 写入/更新 | `bitable create-record` / `bitable update-record` |
| 批量 | `bitable batch-create --file records.json` (auto-chunks at 500) |

### Member

| Intent | Command |
|---|---|
| 找人 | `member find --name "keyword"` (substring match) |
| 我是谁 | `member whoami` |

## Output Formatting

`task list` defaults to table output. All other commands output JSON.

Agent should transform JSON for user when applicable:
- **Doc list** → numbered list with name, type, date
- **Bitable records** → Markdown table matching field names
- **Member lookup** → inline: "张三 → ou_xxxxx"

Include `url` field as clickable link when present.

## Error Recovery

| Code | Meaning | Action |
|---|---|---|
| 99991663 | Token expired | Auto-handled by engine. If persists: `auth refresh` |
| 99991679 | Scope missing | Auto-handled by incremental auth. If persists: `auth relogin` |
| 100003 | Permission denied | User enables scope in console → `auth relogin` |
| 1470400 | Invalid param | Check format (URLs need `http://`/`https://`) |
| Member not found | — | `member scan` to refresh cache, retry shorter keyword |

## Key Behaviors

- **Member resolution**: Names auto-resolve to `open_id` via local cache (`~/.agents/data/feishu/members.json`, 7d TTL). Substring match on name/en_name.
- **Auto-assign**: `task create` assigns current user unless `--no-assign`
- **Agent badge**: Created tasks show "🤖 Agent" origin in Feishu UI
- **Date clearing**: Use `--clear-due`/`--clear-start` (not timestamp=0)
- **Shared folders**: API can't discover — user must provide URL via `doc shared-add`
- **Retry**: Built-in 429/5xx auto-retry (max 3, exponential backoff)

## Structure

```
feishu-integration/
├── feishu                ← CLI entry (bash)
├── SKILL.md              ← This file
├── scripts/
│   ├── feishu_api.py     ← Core (auth + HTTP + retry + pagination)
│   ├── auth.py           ← OAuth2 (login/refresh/relogin/incremental)
│   ├── task.py           ← Task v2 (table + JSON output)
│   ├── docx.py           ← Document & Drive
│   ├── wiki.py           ← Knowledge base
│   ├── bitable.py        ← Bitable (多维表格)
│   └── members.py        ← Member directory (scan/cache/resolve/reverse-resolve)
├── evals/
│   └── evals.json        ← Test cases
└── references/
    └── cli_reference.md  ← Full parameter reference
```
