# CLI Command Reference

> Full command listing for all modules. Read this when you need exact parameter names.
> SKILL.md contains behavioral guidance; this file contains parameter details.

## Task

```bash
# Create
./feishu task create --summary "title" [--description "desc"] [--due "ISO8601"] [--start "ISO8601"] [--members "Name1,Name2"] [--no-assign] [--tasklist-id "id"] [--section-id "id"]

# Read
./feishu task get --task-id "guid"
./feishu task list [--completed true|false] [--keyword "text"] [--page-size N] [--format table|json]

# Update
./feishu task update --task-id "guid" [--summary "new"] [--description "new"] [--due "ISO8601"] [--start "ISO8601"] [--clear-due] [--clear-start]

# Lifecycle
./feishu task complete --task-id "guid"
./feishu task delete --task-id "guid"

# Members
./feishu task add-member --task-id "guid" --member-id "ou_xxx" [--role assignee|follower]
./feishu task remove-member --task-id "guid" --member-id "ou_xxx" [--role assignee|follower]

# Comments
./feishu task comment --task-id "guid" --content "text"
./feishu task comment-list --task-id "guid"

# Tasklist & Section
./feishu task tasklist-create --name "Sprint Q1"
./feishu task tasklist-list
./feishu task tasklist-add-task --tasklist-id "xxx" --task-id "yyy"
./feishu task section-create --tasklist-id "xxx" --name "In Progress"
./feishu task section-list --tasklist-id "xxx"

# Batch
./feishu task batch-create --file tasks.json [--tasklist-id "xxx"]
```

## Document & Drive

```bash
# Browse
./feishu doc list [--type docx|sheet|bitable] [--folder "token"] [--shared]
./feishu doc tree [--depth N] [--shared]
./feishu doc search --name "keyword"

# Shared folders (Feishu API cannot auto-discover shared folders)
./feishu doc shared-add --url "https://xxx.feishu.cn/drive/folder/TOKEN"
./feishu doc shared-list
./feishu doc shared-remove --token "TOKEN" | --all

# Read
./feishu doc read-raw --name "keyword"           # Search + read (recommended)
./feishu doc read-raw --document-id "token"      # Direct read
./feishu doc read-text --document-id "token"     # Markdown output

# Create
./feishu doc create --title "Title"
./feishu doc create-from-markdown --title "Title" --file path.md

# Write (append to existing doc)
./feishu doc append-text --document-id "token" --text "content"
./feishu doc append-heading --document-id "token" --text "Title" --level 2
./feishu doc append-code --document-id "token" --code 'print("hi")' --language python
./feishu doc append-markdown --document-id "token" --file content.md

# Delete
./feishu doc trash --token "file_token" [--type sheet|docx]
```

## Wiki

```bash
./feishu wiki space-list
./feishu wiki space-create --name "Name"
./feishu wiki node-list --space-id "xxxx"
./feishu wiki node-create --space-id "xxxx" --obj-type docx --title "Title"
./feishu wiki node-read --token "node_token"
./feishu wiki tree --space-id "xxxx" [--depth N]
./feishu wiki node-update --space-id "xxxx" --node-token "xxx" --title "New"
./feishu wiki node-move --space-id "xxxx" --node-token "xxx" --target-parent-token "yyy"
./feishu wiki create-from-markdown --space-id "xxxx" --title "Title" --file path.md
```

## Bitable

```bash
# Structure
./feishu bitable get-app --app-token "basXXX"
./feishu bitable list-tables --app-token "basXXX"
./feishu bitable list-fields --app-token "basXXX" --table-id "tblXXX"

# Records
./feishu bitable list-records --app-token "basXXX" --table-id "tblXXX" [--json]
./feishu bitable get-record --app-token "basXXX" --table-id "tblXXX" --record-id "recXXX"
./feishu bitable create-record --app-token "basXXX" --table-id "tblXXX" --fields '{"key": "value"}'
./feishu bitable update-record --app-token "basXXX" --table-id "tblXXX" --record-id "recXXX" --fields '{"key": "value"}'
./feishu bitable delete-record --app-token "basXXX" --table-id "tblXXX" --record-id "recXXX"

# Batch (max 500/batch, auto-chunked)
./feishu bitable batch-create --app-token "basXXX" --table-id "tblXXX" --file records.json
./feishu bitable batch-update --app-token "basXXX" --table-id "tblXXX" --file updates.json
./feishu bitable batch-delete --app-token "basXXX" --table-id "tblXXX" --record-ids "rec1,rec2"

# Export
./feishu bitable export --app-token "basXXX" --table-id "tblXXX" --format json|csv --output path

# Create structure
./feishu bitable create-app --name "Name"
./feishu bitable create-table --app-token "basXXX" --name "Name"
./feishu bitable create-field --app-token "basXXX" --table-id "tblXXX" --name "Name" --type N
```

## Member

```bash
./feishu member scan                    # Refresh cache from API
./feishu member list [--format table|json]
./feishu member find --name "keyword"   # Substring match on name/en_name
./feishu member whoami                  # Current user info
```

## Auth

```bash
./feishu auth login           # OAuth2 flow (opens browser)
./feishu auth relogin         # Revoke + re-authorize (scope changes)
./feishu auth refresh         # Refresh expired token
./feishu auth status          # Check token state
./feishu auth tenant          # Get tenant_access_token
./feishu auth login-explorer  # Manual API Explorer guide
./feishu auth clean           # Delete ~/.feishu/ (with confirmation)
```
