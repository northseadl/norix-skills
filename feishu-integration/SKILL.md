---
name: feishu-integration
metadata:
  version: 0.4.1
description: >
  Feishu (Lark) unified CLI for tasks, documents, wiki, bitable, messaging,
  approval, and Drive. Supports search/create/edit/publish/export across all
  modules. Use when reading/writing Feishu docs, searching docs or wiki,
  managing tasks, sending messages, creating approvals, exporting to Markdown,
  or any 飞书/Lark interaction.
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
| **全文搜索** | `doc search-content --query "退款"` |
| **搜索+自动读取** | `doc search-content --query "库存" --read` |
| **按类型过滤搜索** | `doc search-content --query "数据" --type docx,wiki` |
| 从 MD 创建 | `doc create-from-markdown --file path.md` |
| 追加内容 | `doc append-markdown --document-id ID --file content.md` |
| 清理 | `doc list` → `doc trash --token TOKEN` |
| 共享 | `doc shared-add --url "..."` (user provides URL) |
| **导出为 Markdown** | `doc export --document-id TOKEN --output path.md` |
| **导出含图片** | `doc export --document-id TOKEN --images` |
| **按名称导出** | `doc export --name "方案"` |

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
| **搜索知识库** | `wiki search --query "关键词"` |
| **搜索+读取** | `wiki search --query "退款" --read` |
| **搜索指定空间** | `wiki search --query "退款" --space-id ID` |
| **导出 Wiki(含图片)** | `wiki export --url "https://xxx.feishu.cn/wiki/TOKEN"` |
| **导出(仅文本)** | `wiki export --token TOKEN --no-images` |

### Message

| Intent | Command |
|---|---|
| 发消息到群 | `msg send --chat-id oc_xxx --text "消息内容"` |
| 发消息给个人 | `msg send --user "张三" --text "消息内容"` |
| 发卡片消息 | `msg send --chat-id oc_xxx --card card.json` |
| 查看群列表 | `msg chats` |
| 按名称找群 | `msg chats --name "产品"` |
| 查看群详情 | `msg chat-info --chat-id oc_xxx` |
| 查看消息记录 | `msg history --chat-id oc_xxx [--count 20]` |
| **发富文本消息** | `msg send --chat-id oc_xxx --post "内容" --title "标题"` |

### Approval (审批)

| Intent | Command |
|---|---|
| 查看审批模板 | `approval list-definitions` |
| 查看模板详情 | `approval get-definition --code CODE` |
| 创建审批 | `approval create --code CODE --form '{...}'` |
| 查看审批详情 | `approval get --instance-id ID` |
| 列出审批实例 | `approval list --code CODE [--status PENDING]` |
| 同意审批 | `approval approve --instance-id ID --task-id TID` |
| 拒绝审批 | `approval reject --instance-id ID --task-id TID --comment "理由"` |
| 撤销审批 | `approval cancel --instance-id ID` |

### Bitable

| Intent | Command |
|---|---|
| 看表格数据 | `bitable list-tables` → `bitable list-records --json` |
| **按条件筛选** | `bitable list-records --filter 'CurrentValue.[status]="active"'` |
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
│   ├── feishu_api.py     ← Core (auth + HTTP + retry + pagination + media download)
│   ├── auth.py           ← OAuth2 (login/refresh/relogin/incremental)
│   ├── task.py           ← Task v2 (table + JSON output)
│   ├── docx.py           ← Document & Drive (+ full-text search + export with images)
│   ├── wiki.py           ← Knowledge base (+ wiki export)
│   ├── bitable.py        ← Bitable (多维表格)
│   ├── msg.py            ← Messaging (send/chats/history + rich-text post)
│   ├── approval.py       ← Approval (审批: create/get/list/approve/reject)
│   └── members.py        ← Member directory (scan/cache/resolve/reverse-resolve)
├── evals/
│   └── evals.json        ← Test cases
└── references/
    └── cli_reference.md  ← Full parameter reference
```
