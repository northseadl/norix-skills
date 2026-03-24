---
name: feishu-integration
metadata:
  version: 0.4.3
description: >
  Feishu (Lark) unified CLI for tasks, documents, wiki, bitable, messaging, approval, and Drive.
  Supports search/create/edit/publish/export across all modules. Use when reading/writing Feishu docs,
  searching docs or wiki, managing tasks, sending messages, creating approvals, exporting to Markdown,
  or any 飞书/Lark interaction.
---

# Feishu CLI — Agent Tool Guide

> Single CLI binary. All commands emit JSON to stdout. Log/progress goes to stderr.

## Output Contract

Every command returns exactly **one JSON line** on stdout:

```json
{"ok": true, "data": {...}, "message": "human summary"}
{"ok": false, "message": "what went wrong", "hint": "./feishu auth login"}
```

Parse stdout, ignore stderr. Check `ok` before reading `data`.

## Quick Reference

| Intent | Command |
|--------|---------|
| Setup credentials | `./feishu auth setup --app-id ID --app-secret SECRET` |
| Login (OAuth2 browser) | `./feishu auth login` |
| Login (all scopes) | `./feishu auth login --all` |
| Check auth state | `./feishu auth status` |
| List my tasks | `./feishu task list` |
| Create task | `./feishu task create --summary "title" [--members "Name1,Name2"]` |
| Complete task by keyword | `./feishu task complete --keyword "关键词"` |
| Search docs (full-text) | `./feishu doc search-content --query "退款"` |
| Search + auto-read first | `./feishu doc search-content --query "退款" --read` |
| Read doc content | `./feishu doc read --document-id TOKEN` |
| Read doc by name | `./feishu doc read --name "keyword"` |
| Read doc block index | `./feishu doc read --name "keyword" --blocks` |
| Read raw content | `./feishu doc read --document-id TOKEN --raw` |
| Create doc from markdown | `./feishu doc create --title "T" --file path.md` |
| Insert text at position | `./feishu doc insert --document-id X --text "hello" --index 0` |
| Insert image | `./feishu doc insert --document-id X --image ./logo.png` |
| Insert markdown file | `./feishu doc insert --document-id X --file content.md` |
| Insert inline markdown | `./feishu doc insert --document-id X --markdown "## Title\n\n| A | B |\n|---|---|"` |
| Replace blocks | `./feishu doc insert --document-id X --replace --start 2 --end 4 --text "new"` |
| Read doc by URL | `./feishu doc read --document-id "https://xxx.feishu.cn/docx/TOKEN"` |
| Delete blocks by range | `./feishu doc delete --document-id X --start 2 --end 5` |
| Export doc to local .md | `./feishu doc export --name "keyword" --output out.md` |
| List Drive files | `./feishu doc list [--type docx\|sheet]` |
| Drive file tree | `./feishu doc tree [--depth 3] [--shared]` |
| Send text message | `./feishu msg send --chat-name "群名" --text "内容"` |
| Send to user | `./feishu msg send --user "张三" --text "hi"` |
| List chats | `./feishu msg chats [--name "keyword"]` |
| Wiki spaces | `./feishu wiki space-list` |
| Wiki tree | `./feishu wiki tree --space-id ID` |
| Search wiki + read | `./feishu wiki search --query "title" --read` |
| Bitable records | `./feishu bitable list-records --app-token X --table-id Y` |
| Submit approval | `./feishu approval create --code CODE --form '{...}'` |
| List/find members | `./feishu member find [--name "keyword"]` |

## Compound Commands

These eliminate multi-step workflows — CLI handles the search+action internally:

| Command | What it does |
|---------|-------------|
| `task complete --keyword "X"` | Searches incomplete tasks matching X, completes the single match |
| `msg send --chat-name "X" --text "..."` | Finds chat by name substring, sends message |
| `doc search-content --query "X" --read` | Full-text search, auto-reads first docx match |
| `doc read --name "X"` | Search Drive by filename, reads first match |
| `doc read --name "X" --blocks` | Returns block list with index/block_id for positioning |
| `doc export --name "X"` | Search Drive by filename, exports first match to .md |
| `wiki search --query "X" --read` | Recursive wiki search, auto-reads first docx match |

## Module Discovery

Run any module without a command to get its command list as JSON:

```bash
./feishu task    # returns {"ok":true, "data":{"commands":["create","get",...], "usage":"..."}}
./feishu doc     # same pattern
```

## References

For detailed parameter docs, see:

| File | When to read |
|------|-------------|
| [cli_reference.md](references/cli_reference.md) | Full parameter listing for all commands |

Or run `./feishu <module> <command> --help` for inline help.

## Prerequisites

1. Feishu Developer Console: create a self-built app
2. `./feishu auth setup --app-id "..." --app-secret "..."`
3. `./feishu auth login` (opens browser for OAuth2)
4. Configure permissions in Developer Console as needed
