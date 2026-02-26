---
name: feishu-integration
version: 0.0.1
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
> Modules: `doc` | `task` | `wiki` | `bitable` | `member` | `auth`

## Setup (one-time)

```bash
export FEISHU_APP_ID="cli_xxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxx"

./feishu auth login      # Authorize core scopes, token saved to ~/.feishu/
./feishu auth status     # Check auth state
./feishu auth refresh    # Refresh expired token
./feishu auth relogin    # Full re-authorization (after scope changes)
```

### Scope Model

| Tier | Scopes | When |
|------|--------|------|
| **Core** | task / docx / drive / wiki / bitable | Granted at `login` |
| **Feature** | `contact:user.base:readonly` | On-demand when `member` is first used |

---

## Task Management

```bash
# Create (auto-assigns current user)
./feishu task create --summary "Implement payment callback" --due "2026-03-15T18:00:00+08:00"
./feishu task create --summary "Unassigned task" --no-assign
./feishu task create --summary "Assign by name" --members "Zhang,Li"

# CRUD
./feishu task get --task-id "guid"
./feishu task update --task-id "guid" --summary "New title"
./feishu task complete --task-id "guid"
./feishu task delete --task-id "guid"

# List & search
./feishu task list --completed false
./feishu task list --keyword "project-x"

# Comments
./feishu task comment --task-id "guid" --content "Done"
./feishu task comment-list --task-id "guid"

# Members
./feishu task add-member --task-id "guid" --member-id "ou_xxx"
./feishu task remove-member --task-id "guid" --member-id "ou_xxx"

# Tasklist & sections
./feishu task tasklist-create --name "Sprint Q1"
./feishu task tasklist-list
./feishu task tasklist-add-task --tasklist-id "xxx" --task-id "yyy"
./feishu task batch-create --file tasks.json --tasklist-id "xxx"
```

---

## Member Directory

Cached at `~/.feishu/members.json` (7-day TTL). Auto-scans when stale.

```bash
./feishu member scan
./feishu member list
./feishu member find --name "Zhang"
./feishu member whoami
```

> Requires `contact:user.base:readonly` — auto-prompted on first use.

---

## Document & Drive

```bash
# Browse files
./feishu doc list                                # All root files
./feishu doc list --type docx                    # Filter by type
./feishu doc list --folder "folder_token"        # List subfolder
./feishu doc list --shared                       # List cached shared folders
./feishu doc tree                                # Recursive directory tree
./feishu doc tree --depth 3                      # Deeper traversal
./feishu doc tree --shared                       # Tree of all cached shared folders
./feishu doc search --name "Technical Spec"      # Search by name

# Shared folders (Feishu API cannot discover these — must provide URL)
./feishu doc shared-add --url "https://xxx.feishu.cn/drive/folder/TOKEN"
./feishu doc shared-list                         # List cached shared folders
./feishu doc shared-remove --token "TOKEN"       # Remove one
./feishu doc shared-remove --all                 # Remove all

# Read
./feishu doc read-raw --name "Data Collection"   # Find by name + read (recommended)
./feishu doc read-raw --document-id "token"      # Direct read by token
./feishu doc read-text --document-id "token"     # Markdown-formatted output

# Create
./feishu doc create --title "Technical Spec"
./feishu doc create-from-markdown --title "Plan v1" --file plan.md

# Write
./feishu doc append-text --document-id "token" --text "Paragraph"
./feishu doc append-heading --document-id "token" --text "Title" --level 2
./feishu doc append-code --document-id "token" --code 'print("hi")' --language python
./feishu doc append-markdown --document-id "token" --file content.md

# Cleanup (moves to _trash folder, user deletes manually in Feishu UI)
./feishu doc trash --token "file_token"
./feishu doc trash --token "sheet_token" --type sheet
```

---

## Wiki (Knowledge Base)

```bash
./feishu wiki space-list
./feishu wiki space-create --name "Engineering Docs"
./feishu wiki node-list --space-id "xxxx"
./feishu wiki node-create --space-id "xxxx" --obj-type docx --title "API Spec"
./feishu wiki node-read --token "node_token"     # Read wiki page content
./feishu wiki tree --space-id "xxxx"              # Recursive directory tree
./feishu wiki tree --space-id "xxxx" --depth 5    # Deeper traversal
./feishu wiki node-update --space-id "xxxx" --node-token "xxx" --title "New Title"
./feishu wiki node-move --space-id "xxxx" --node-token "xxx" --target-parent-token "yyy"
./feishu wiki create-from-markdown --space-id "xxxx" --title "Spec" --file plan.md
```

---

## Bitable (多维表格)

```bash
# Browse structure
./feishu bitable get-app --app-token "basXXX"              # App metadata
./feishu bitable list-tables --app-token "basXXX"           # List data tables
./feishu bitable list-fields --app-token "basXXX" --table-id "tblXXX"  # Schema

# Read records
./feishu bitable list-records --app-token "basXXX" --table-id "tblXXX"
./feishu bitable list-records --app-token "basXXX" --table-id "tblXXX" --json
./feishu bitable get-record --app-token "basXXX" --table-id "tblXXX" --record-id "recXXX"

# Write records
./feishu bitable create-record --app-token "basXXX" --table-id "tblXXX" --fields '{"标题": "Bug report"}'
./feishu bitable update-record --app-token "basXXX" --table-id "tblXXX" --record-id "recXXX" --fields '{"状态": "Fixed"}'
./feishu bitable delete-record --app-token "basXXX" --table-id "tblXXX" --record-id "recXXX"

# Batch operations (max 500/batch, auto-chunked)
./feishu bitable batch-create --app-token "basXXX" --table-id "tblXXX" --file records.json
./feishu bitable batch-update --app-token "basXXX" --table-id "tblXXX" --file updates.json
./feishu bitable batch-delete --app-token "basXXX" --table-id "tblXXX" --record-ids "rec1,rec2,rec3"

# Export
./feishu bitable export --app-token "basXXX" --table-id "tblXXX" --format json --output data.json
./feishu bitable export --app-token "basXXX" --table-id "tblXXX" --format csv --output data.csv

# Create structure
./feishu bitable create-app --name "Bug Tracker"
./feishu bitable create-table --app-token "basXXX" --name "Bugs"
./feishu bitable create-field --app-token "basXXX" --table-id "tblXXX" --name "Priority" --type 3
```

---

## Structure

```
feishu-integration/
├── feishu                ← Unified CLI entry point
├── SKILL.md              ← This file
├── scripts/
│   ├── feishu_api.py     ← Core engine (auth + HTTP + retry + pagination)
│   ├── auth.py           ← OAuth2 (login / refresh / relogin)
│   ├── task.py           ← Task management
│   ├── docx.py           ← Document & Drive management
│   ├── wiki.py           ← Knowledge base
│   ├── bitable.py        ← Bitable (多维表格)
│   └── members.py        ← Member directory (scan / cache / resolve)
└── references/           ← API docs (for advanced parameters)
    ├── task_api.md
    ├── docx_api.md
    ├── wiki_api.md
    └── bitable_api.md
```

---

## Error Handling

Built-in 429/5xx auto-retry (max 3, exponential backoff). 401 auto-refresh.

| code | Meaning | Fix |
|------|---------|-----|
| 100003 | Permission denied | Enable scope in dev console + `./feishu auth relogin` |
| 99991679 | Scope not authorized | Enable + publish + `./feishu auth relogin` |
| 99991663 | Token expired | `./feishu auth refresh` |

---

## Common Workflows

### Sprint Planning
```bash
TASKLIST=$(./feishu task tasklist-create --name "Sprint-1" | jq -r '.data.tasklist.guid')
./feishu task batch-create --file tasks.json --tasklist-id "$TASKLIST"
```

### Technical Spec to Wiki
```bash
./feishu wiki create-from-markdown --space-id "$SPACE" --title "Spec" --file plan.md
```

### Export Bitable to CSV
```bash
./feishu bitable export --app-token "basXXX" --table-id "tblXXX" --format csv --output report.csv
```

### Daily Standup
```bash
./feishu task list --completed false
```
