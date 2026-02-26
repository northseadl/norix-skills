# Feishu Wiki API Reference

> Base URL: `https://open.feishu.cn/open-apis`
> Auth: `Authorization: Bearer <user_access_token | tenant_access_token>`
> Content-Type: `application/json; charset=utf-8`

## Table of Contents
1. [Wiki Space Operations](#wiki-space-operations)
2. [Node Operations](#node-operations)
3. [Permission Model](#permission-model)
4. [Error Codes](#error-codes)

---

## Wiki Space Operations

### List Spaces
```
GET /wiki/v2/spaces?page_size=20&page_token=xxx
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "space_id": "xxxx",
        "name": "技术文档",
        "description": "团队技术文档",
        "space_type": "team",
        "visibility": "public"
      }
    ],
    "has_more": false,
    "page_token": ""
  }
}
```

**space_type values:** `team` (团队空间), `personal` (个人空间)
**visibility values:** `public` (公开), `private` (私有)

**Rate limit:** 100/min per app

### Get Space
```
GET /wiki/v2/spaces/:space_id
```

### Create Space
```
POST /wiki/v2/spaces
```

**Request Body:**
```json
{
  "name": "技术文档",
  "description": "团队技术文档库"
}
```

**Rate limit:** 10/min per app

### Add Space Members
```
POST /wiki/v2/spaces/:space_id/members
```
```json
{
  "member_type": "userid",
  "member_id": "ou_xxxxx",
  "role": "admin"
}
```

**Roles:** `admin` (管理员), `member` (成员)

---

## Node Operations

### List Child Nodes
```
GET /wiki/v2/spaces/:space_id/nodes?parent_node_token=xxx&page_size=20&page_token=xxx
```

If `parent_node_token` is omitted, returns top-level nodes.

**Response:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "space_id": "xxxx",
        "node_token": "wikcnxxxxxx",
        "obj_token": "doxcnxxxxxx",
        "obj_type": "docx",
        "parent_node_token": "wikcnyyyyyy",
        "node_type": "origin",
        "origin_node_token": "",
        "origin_space_id": "",
        "has_child": true,
        "title": "API 设计规范",
        "obj_create_time": "1700000000",
        "obj_edit_time": "1700000000",
        "node_create_time": "1700000000",
        "creator": "ou_xxxxx"
      }
    ],
    "has_more": false,
    "page_token": ""
  }
}
```

**Rate limit:** 100/min per app

### Get Node
```
GET /wiki/v2/spaces/get_node?token=wikcnxxxxxx
```

The `token` can be either a wiki node token or the `obj_token` of the underlying document.

### Create Node
```
POST /wiki/v2/spaces/:space_id/nodes
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| obj_type | string | Yes | `docx`, `sheet`, `bitable`, `mindnote` (not `file`!) |
| parent_node_token | string | No | Parent node. Omit for top-level node |
| title | string | No | Node title |
| obj_token | string | No | Existing document token to move into wiki |

**Response:**
```json
{
  "code": 0,
  "data": {
    "node": {
      "space_id": "xxxx",
      "node_token": "wikcnxxxxxx",
      "obj_token": "doxcnxxxxxx",
      "obj_type": "docx",
      "parent_node_token": "wikcnyyyyyy",
      "node_type": "origin",
      "title": "New Document"
    }
  }
}
```

**Rate limit:** 10/min per app

### Move Node
```
POST /wiki/v2/spaces/:space_id/nodes/:node_token/move
```
```json
{
  "target_parent_token": "wikcnyyyyyy",
  "target_space_id": "xxxx"
}
```

### Copy Node
```
POST /wiki/v2/spaces/:space_id/nodes/:node_token/copy
```

### Update Node Title
```
PUT /wiki/v2/spaces/:space_id/nodes/:node_token
```
```json
{"title": "New Title"}
```

---

## Relationship: Node Token vs Obj Token

A key concept in Wiki API:

- **node_token** (`wikcnxxxxxx`): Unique identifier for the Wiki node in the tree structure. Used for node operations (list children, move, copy).
- **obj_token** (`doxcnxxxxxx`): Unique identifier for the underlying cloud document. Used with Docx API to read/edit content.

When creating a node, the response returns both tokens. To edit the content of a wiki page, use the `obj_token` with the Docx API.

```
Wiki Node (node_token: wikcn001)
  └── Document (obj_token: doxcn001) ← Use this with Docx API
```

---

## Permission Model

### Knowledge Space Permissions

| Role | Can Read | Can Edit | Can Create Nodes | Can Manage Members |
|------|----------|----------|-----------------|-------------------|
| admin | ✅ | ✅ | ✅ | ✅ |
| member | ✅ | ✅ | ✅ | ❌ |
| (public viewer) | ✅ | ❌ | ❌ | ❌ |

### Node-Level Permissions

Individual nodes inherit permissions from their parent space, but can have additional restrictions applied.

### API Permission Scopes

| Scope | Description |
|-------|-------------|
| `wiki:wiki:readonly` | Read spaces and nodes |
| `wiki:wiki` | Full CRUD on spaces and nodes |

---

## Error Codes

| code | HTTP | Description |
|------|------|-------------|
| 0 | 200 | Success |
| 100001 | 400 | Invalid parameter |
| 100003 | 403 | Permission denied — app lacks access to this space |
| 100004 | 404 | Space or node not found |
| 100029 | 429 | Rate limit exceeded |
| 131002 | 403 | No write permission for this node |
| 131003 | 400 | Cannot create node of type "file" |
| 131004 | 400 | Node nesting depth exceeds limit |
| 131005 | 400 | Node count exceeds space limit |
