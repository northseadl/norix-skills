---
name: feishu-integration
version: 0.1.1
description: |
  Feishu (Lark) task, document, wiki, bitable, and Drive management skill.
  Zero-dependency Python scripts operating Feishu Open API via user_access_token.
  Covers Task v2 (CRUD / tasklist / comment / batch), Docx v1 (create / edit / Markdown-to-Block),
  Wiki v2 (spaces / node tree / read / create-from-markdown), Bitable v1 (tables / fields / records / batch / export),
  Drive (list / search / tree / trash / shared folder cache).
  Use this skill whenever the user mentions any of these, even without saying "feishu" explicitly:
  tasks, todos, task management, sprint planning, "what's not done", "check my tasks",
  creating/reading/browsing documents, writing to wiki, publishing tech specs,
  Drive file browsing, directory tree, file cleanup, shared folders, member lookup,
  bitable, multi-dimensional table, spreadsheet data, database records, data export.
  Also trigger on Chinese: "建任务", "查任务", "看文档", "写文档", "发布到知识库",
  "帮我建几个任务", "有什么没完成的", "把方案写到飞书", "列出文件", "共享文件夹",
  "多维表格", "读取表格数据", "导出数据", "写入表格".
---

# Feishu Integration

> Unified CLI: `./feishu <module> <command> [options]`
> Full command reference: `references/cli_reference.md`

## First-Use Detection

Before executing any command, check if `./feishu auth status` reports a valid token.
If not, guide the user through setup:

1. **Create app**: Direct user to [飞书开放平台](https://open.feishu.cn/app) → create 自建应用
2. **Enable permissions**: Tell user to 全选开通所有用户权限 in 权限管理
3. **Security & publish**: Add redirect URL `http://localhost:9876/callback`, then publish
4. **Credentials & login**: Ask user for App ID and App Secret, then:
   ```bash
   export FEISHU_APP_ID="<user_provided>"
   export FEISHU_APP_SECRET="<user_provided>"
   ./feishu auth login
   ```

After login succeeds, token auto-refreshes. No further user action needed.

## Intent → Command Mapping

When the user expresses intent, map to the right module and command:

### Tasks (任务)

| User intent | Command |
|---|---|
| "查/看任务", "有什么没完成的" | `task list --completed false` |
| "建/创建任务" + 标题 | `task create --summary "..." [--due "ISO8601"]` |
| "指派给 XX" | `task create --members "Name1,Name2"` or `task add-member` |
| "任务完成了" | Find via `task list --keyword`, then `task complete` |
| "修改截止时间" / "去掉截止时间" | `task update --due "..."` / `task update --clear-due` |
| "建任务列表/Sprint" | `task tasklist-create`, then `task batch-create` |
| "加评论" | `task comment --task-id "..." --content "..."` |

### Documents (文档)

| User intent | Command |
|---|---|
| "看看我的文档/文件" | `doc list` or `doc tree` (tree for overview) |
| "找/读某个文档" | `doc read-raw --name "keyword"` (search + read in one step) |
| "写个文档" / "从 MD 创建" | `doc create` or `doc create-from-markdown --file path.md` |
| "往文档里追加内容" | `doc append-markdown --document-id "..." --file content.md` |
| "清理无用文档" | `doc list` → identify → `doc trash --token "..."` |
| "共享文件夹" | `doc shared-add --url "..."` (user must provide URL) |

#### Batch Upload with Cross-Document Linking

When uploading a directory of Markdown files where an index document (e.g., README.md) contains relative links to other `.md` files, follow this orchestration pattern:

1. **Create target folder** via Feishu Drive API
2. **Upload child documents first** — for each `.md` file, call `doc create-from-markdown`. Capture the returned `document_id` and build a URL map: `{"filename.md": "https://feishu.cn/docx/DOC_ID"}`
3. **Process the index document** — read the index file, replace all relative `.md` links with the corresponding Feishu URLs from the map
4. **Upload the processed index** — write the modified content to a temp file, then `doc create-from-markdown` from that temp file

This ensures all index links are **clickable and navigate to the correct Feishu documents**.

#### Markdown → Feishu Adaptation Notes

The `create-from-markdown` command handles these conversions automatically:

- **CJK table column widths**: Chinese characters are measured at 2x width for proportional column sizing
- **Relative links** `[text](file.md)`: Degraded to plain text (Feishu only supports HTTP links)
- **HTTP links** `[text](https://...)`: Rendered as clickable links
- **Code blocks, headings, lists, quotes, dividers, todos**: Fully supported

### Wiki (知识库)

| User intent | Command |
|---|---|
| "看知识库/空间" | `wiki space-list`, then `wiki tree --space-id "..."` |
| "读 wiki 页面" | `wiki node-read --token "..."` |
| "把方案发到 wiki" | `wiki create-from-markdown --space-id "..." --file path.md` |

### Bitable (多维表格)

| User intent | Command |
|---|---|
| "看表格数据" | `bitable list-tables` → `bitable list-records --json` |
| "导出数据" | `bitable export --format csv --output path.csv` |
| "写入/更新记录" | `bitable create-record` or `bitable update-record` |
| "批量操作" | `bitable batch-create --file records.json` (auto-chunks at 500) |

### Members (成员)

| User intent | Command |
|---|---|
| "找人 / 查成员" | `member find --name "keyword"` (substring match) |
| "我是谁" | `member whoami` |

## Output Formatting

Raw CLI output is JSON. Always transform for the user:

- **Task list** → Markdown table with columns: 状态, 标题, 截止时间, 负责人
- **Document list** → Numbered list with name, type, date
- **Bitable records** → Markdown table matching field names
- **Member lookup** → Inline: "张三 → ou_xxxxx"
- **Single task/doc created** → Confirm with title and link (from `url` field)

When the JSON response contains a `url` field, always include it as a clickable link.

## Error Recovery

| Situation | Agent action |
|---|---|
| Token expired (99991663) | Auto-handled by engine. If persists: `./feishu auth refresh` |
| Scope not authorized (99991679) | Auto-handled by incremental auth. If persists: `./feishu auth relogin` |
| Permission denied (100003) | Tell user to enable scope in dev console, then `./feishu auth relogin` |
| Invalid parameter (1470400) | Check parameter format — URLs must start with `http://`/`https://` |
| Member not found | Try `member scan` to refresh cache, retry with shorter keyword |
| No credentials | Trigger First-Use Detection flow (see above) |

## Member Resolution

When a command needs a member (e.g., `--members "张三"`), the skill resolves names to `open_id` automatically via local cache (`~/.feishu/members.json`, 7-day TTL). The matching is **substring-based** on both `name` and `en_name` fields.

If resolution fails, run `./feishu member scan` to refresh cache, then retry.

## Key Behaviors

- **Auto-assign**: `task create` automatically assigns the current user unless `--no-assign` is specified
- **Agent origin badge**: All created tasks show "🤖 Agent" origin in Feishu UI
- **Date clearing**: To remove a due/start date, use `--clear-due` / `--clear-start` (not timestamp=0)
- **Shared folders**: Feishu API cannot discover shared folders. User must provide the folder URL via `doc shared-add`
- **Batch size**: Bitable batch operations auto-chunk at 500 records
- **Retry**: Built-in 429/5xx auto-retry (max 3, exponential backoff)

## Structure

```
feishu-integration/
├── feishu                ← Unified CLI entry point (bash)
├── SKILL.md              ← This file (Agent execution standard)
├── scripts/
│   ├── feishu_api.py     ← Core engine (auth + HTTP + retry + pagination)
│   ├── auth.py           ← OAuth2 (login / refresh / relogin / incremental)
│   ├── task.py           ← Task v2 management
│   ├── docx.py           ← Document & Drive management
│   ├── wiki.py           ← Knowledge base
│   ├── bitable.py        ← Bitable (多维表格)
│   └── members.py        ← Member directory (scan / cache / resolve)
├── evals/
│   └── evals.json        ← Test cases for skill evaluation
└── references/
    └── cli_reference.md  ← Full command parameter reference
```
