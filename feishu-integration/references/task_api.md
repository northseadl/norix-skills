# Feishu Task v2 API Reference

> Base URL: `https://open.feishu.cn/open-apis`
> Auth: `Authorization: Bearer <user_access_token | tenant_access_token>`
> Content-Type: `application/json; charset=utf-8`

## Table of Contents
1. [Task CRUD](#task-crud)
2. [Task Members](#task-members)
3. [Tasklist](#tasklist)
4. [Section](#section)
5. [Comments](#comments)
6. [Error Codes](#error-codes)

---

## Task CRUD

### Create Task
```
POST /task/v2/tasks
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| summary | string | Yes | Task title (max 3000 chars) |
| description | string | No | Task description (max 65536 chars) |
| due | object | No | `{timestamp: "unix_timestamp", is_all_day: false}` |
| start | object | No | `{timestamp: "unix_timestamp", is_all_day: false}` |
| completed_at | string | No | Unix timestamp — if set, marks task as completed at creation |
| members | array | No | `[{id: "ou_xxx", role: "assignee"}]` |
| tasklists | array | No | `[{tasklist_guid: "xxx", section_guid: "yyy"}]` |
| repeat_rule | string | No | RRULE format (e.g., `FREQ=DAILY;INTERVAL=1`) |
| custom_complete | object | No | Custom completion configuration |
| client_token | string | No | Idempotency key (max 100 chars) |

**Response:**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "task": {
      "guid": "d300xxxx-xxxx-xxxx-xxxx",
      "summary": "...",
      "description": "...",
      "completed_at": "0",
      "due": {"timestamp": "...", "is_all_day": false},
      "members": [...],
      "creator": {"id": "ou_xxx", "type": "user"},
      "created_at": "1700000000",
      "updated_at": "1700000000"
    }
  }
}
```

### Get Task
```
GET /task/v2/tasks/:task_guid
```

### Update Task
```
PATCH /task/v2/tasks/:task_guid?update_fields=<comma_separated_fields>
```

**update_fields** 支持的字段：
`summary`, `description`, `due`, `start`, `completed_at`, `extra`, `custom_complete`, `repeat_rule`, `mode`, `is_milestone`, `custom_fields`

```json
{
  "task": {
    "summary": "updated title",
    "description": "updated description"
  },
  "update_fields": ["summary", "description"]
}
```

> **Note:** `update_fields` is in the request body as an array, not a query parameter. Timestamps use milliseconds.

### Delete Task
```
DELETE /task/v2/tasks/:task_guid
```

### List Tasks
```
GET /task/v2/tasks?page_size=20&page_token=xxx&completed=false
```

| Query Param | Type | Description |
|-------------|------|-------------|
| page_size | int | Max 100, default 20 |
| page_token | string | Pagination cursor |
| completed | bool | Filter: `true` = completed only, `false` = uncompleted only |

---

## Task Members

### Add Members
```
POST /task/v2/tasks/:task_guid/add_members
```

```json
{
  "members": [
    {"id": "ou_xxx", "role": "assignee"},
    {"id": "ou_yyy", "role": "follower"}
  ]
}
```

**Roles:** `assignee` (负责人), `follower` (关注人)

### Remove Members
```
POST /task/v2/tasks/:task_guid/remove_members
```

Same body format as Add Members.

---

## Tasklist

### Create Tasklist
```
POST /task/v2/tasklists
```
```json
{"name": "Sprint Q1"}
```

### Get Tasklist
```
GET /task/v2/tasklists/:tasklist_guid
```

### Update Tasklist
```
PATCH /task/v2/tasklists/:tasklist_guid?update_fields=name
```
```json
{"tasklist": {"name": "New Name"}}
```

### Delete Tasklist
```
DELETE /task/v2/tasklists/:tasklist_guid
```

### List Tasklists
```
GET /task/v2/tasklists?page_size=20&page_token=xxx
```

### Add Tasklist Members (Collaborators)
```
POST /task/v2/tasklists/:tasklist_guid/members
```
```json
{"members": [{"id": "ou_xxx", "role": "editor"}]}
```

**Roles:** `editor`, `viewer`

### Remove Tasklist Members
```
POST /task/v2/tasklists/:tasklist_guid/members/batch_delete
```

---

## Section

### Create Section
```
POST /task/v2/sections?tasklist_guid=xxx
```
```json
{"name": "In Progress"}
```

### Get Section
```
GET /task/v2/sections/:section_guid
```

### Update Section
```
PATCH /task/v2/sections/:section_guid?update_fields=name
```

### Delete Section
```
DELETE /task/v2/sections/:section_guid
```

### List Sections
```
GET /task/v2/sections?tasklist_guid=xxx&page_size=20
```

### List Tasks in Section
```
GET /task/v2/sections/:section_guid/tasks?page_size=20
```

---

## Comments

### Add Comment
```
POST /task/v2/comments
```
```json
{
  "content": "This is a comment",
  "resource_type": "task",
  "resource_id": "task-guid-here"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | string | Yes | Comment text (max 3000 utf8 chars) |
| resource_type | string | No | Default "task" |
| resource_id | string | No | Task GUID |
| reply_to_comment_id | string | No | Reply to existing comment |

### List Comments
```
GET /task/v2/comments?resource_type=task&resource_id=xxx&page_size=20
```

### Delete Comment
```
DELETE /task/v2/comments/:comment_id
```

---

## Error Codes

| code | HTTP | Description |
|------|------|-------------|
| 0 | 200 | Success |
| 100001 | 400 | Invalid parameter |
| 100002 | 400 | Missing required parameter |
| 100003 | 403 | Permission denied |
| 100004 | 404 | Resource not found |
| 100029 | 429 | Rate limit exceeded |
| 99991663 | 401 | Token expired |
| 99991664 | 401 | Token invalid |

## Rate Limits

| API | Limit |
|-----|-------|
| Create task | 50/s per app |
| Get/List task | 100/s per app |
| Update/Delete task | 50/s per app |
| Tasklist operations | 50/s per app |
| Section operations | 50/s per app |
