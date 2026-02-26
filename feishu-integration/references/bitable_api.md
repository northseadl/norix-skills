# Feishu Bitable (多维表格) API Reference

> Base URL: `https://open.feishu.cn/open-apis`
> Auth: `Authorization: Bearer <user_access_token | tenant_access_token>`
> Content-Type: `application/json; charset=utf-8`

## Table of Contents
1. [App Operations](#app-operations)
2. [Table Operations](#table-operations)
3. [Field Operations](#field-operations)
4. [Record Operations](#record-operations)
5. [View Operations](#view-operations)
6. [Permission Scopes](#permission-scopes)
7. [Field Types](#field-types)
8. [Error Codes](#error-codes)

---

## App Operations

### List Apps (via Drive)
Bitables appear in Drive as `type=bitable`. Use Drive API to list.

### Get App Metadata
```
GET /bitable/v1/apps/:app_token
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "app": {
      "app_token": "basxxxxxxx",
      "name": "项目跟踪",
      "revision": 42,
      "is_advanced": false
    }
  }
}
```

### Create App
```
POST /bitable/v1/apps
```
```json
{
  "name": "New Bitable",
  "folder_token": "fldrxxxxxxx"
}
```

---

## Table Operations

### List Tables
```
GET /bitable/v1/apps/:app_token/tables?page_size=20&page_token=xxx
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "table_id": "tblxxxxxxx",
        "revision": 1,
        "name": "需求列表"
      }
    ],
    "total": 3,
    "has_more": false,
    "page_token": ""
  }
}
```

### Create Table
```
POST /bitable/v1/apps/:app_token/tables
```
```json
{
  "table": {
    "name": "Bug Tracker",
    "default_view_name": "默认视图",
    "fields": [
      {"field_name": "标题", "type": 1},
      {"field_name": "状态", "type": 3, "property": {"options": [{"name": "Open"}, {"name": "Fixed"}]}},
      {"field_name": "优先级", "type": 3}
    ]
  }
}
```

### Delete Table
```
DELETE /bitable/v1/apps/:app_token/tables/:table_id
```

---

## Field Operations

### List Fields
```
GET /bitable/v1/apps/:app_token/tables/:table_id/fields?page_size=100
```

**Response:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "field_id": "fldxxxxxxx",
        "field_name": "标题",
        "type": 1,
        "is_primary": true,
        "property": {}
      },
      {
        "field_id": "fldyyyyyyy",
        "field_name": "状态",
        "type": 3,
        "property": {
          "options": [
            {"id": "optXXX", "name": "Open", "color": 0},
            {"id": "optYYY", "name": "Done", "color": 1}
          ]
        }
      }
    ],
    "total": 5,
    "has_more": false
  }
}
```

### Create Field
```
POST /bitable/v1/apps/:app_token/tables/:table_id/fields
```
```json
{
  "field_name": "新字段",
  "type": 1
}
```

### Update Field
```
PUT /bitable/v1/apps/:app_token/tables/:table_id/fields/:field_id
```
```json
{
  "field_name": "重命名字段"
}
```

### Delete Field
```
DELETE /bitable/v1/apps/:app_token/tables/:table_id/fields/:field_id
```

---

## Record Operations

### List / Search Records
```
GET /bitable/v1/apps/:app_token/tables/:table_id/records?page_size=100&page_token=xxx
```

Optional query params:
- `view_id`: Filter by view
- `field_names`: JSON array of fields to include (URL-encoded)
- `filter`: Filter expression (e.g., `AND(CurrentValue.[Status]="Open")`)
- `sort`: Sort expression (e.g., `["Created", "DESC"]`)

**Response:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "record_id": "recxxxxxxx",
        "fields": {
          "标题": "Fix login bug",
          "状态": "Open",
          "优先级": "P0",
          "创建时间": 1700000000000
        }
      }
    ],
    "total": 42,
    "has_more": false,
    "page_token": ""
  }
}
```

### Get Record
```
GET /bitable/v1/apps/:app_token/tables/:table_id/records/:record_id
```

### Create Record
```
POST /bitable/v1/apps/:app_token/tables/:table_id/records
```
```json
{
  "fields": {
    "标题": "New Bug",
    "状态": "Open",
    "优先级": "P1"
  }
}
```

### Create Records (Batch)
```
POST /bitable/v1/apps/:app_token/tables/:table_id/records/batch_create
```
```json
{
  "records": [
    {"fields": {"标题": "Bug 1", "状态": "Open"}},
    {"fields": {"标题": "Bug 2", "状态": "Open"}}
  ]
}
```

Max 500 records per batch.

### Update Record
```
PUT /bitable/v1/apps/:app_token/tables/:table_id/records/:record_id
```
```json
{
  "fields": {
    "状态": "Fixed"
  }
}
```

### Update Records (Batch)
```
POST /bitable/v1/apps/:app_token/tables/:table_id/records/batch_update
```
```json
{
  "records": [
    {"record_id": "recXXX", "fields": {"状态": "Fixed"}},
    {"record_id": "recYYY", "fields": {"状态": "Done"}}
  ]
}
```

### Delete Record
```
DELETE /bitable/v1/apps/:app_token/tables/:table_id/records/:record_id
```

### Delete Records (Batch)
```
POST /bitable/v1/apps/:app_token/tables/:table_id/records/batch_delete
```
```json
{
  "records": ["recXXX", "recYYY"]
}
```

---

## View Operations

### List Views
```
GET /bitable/v1/apps/:app_token/tables/:table_id/views?page_size=20
```

---

## Permission Scopes

| Scope | Description |
|-------|-------------|
| `bitable:app:readonly` | Read tables, fields, records, views |
| `bitable:app` | Full CRUD on tables, fields, records |

---

## Field Types

| type | Name | Description | Field value format |
|------|------|-------------|-------------------|
| 1 | Text | 多行文本 | `"string"` or `[{type: "text", text: "..."}]` |
| 2 | Number | 数字 | `123` or `123.45` |
| 3 | SingleSelect | 单选 | `"Option Name"` |
| 4 | MultiSelect | 多选 | `["A", "B"]` |
| 5 | DateTime | 日期 | `1700000000000` (ms timestamp) |
| 7 | Checkbox | 复选框 | `true` / `false` |
| 11 | Person | 人员 | `[{"id": "ou_xxx"}]` |
| 13 | Phone | 电话号码 | `"13800138000"` |
| 15 | Hyperlink | 超链接 | `{"text": "label", "link": "https://..."}` |
| 17 | Attachment | 附件 | `[{"file_token": "xxx"}]` |
| 18 | SingleLink | 单向关联 | `{"record_ids": ["recXXX"]}` |
| 19 | Lookup | 查找引用 | Auto-computed (read-only) |
| 20 | Formula | 公式 | Auto-computed (read-only) |
| 22 | CreatedTime | 创建时间 | Auto (read-only) |
| 23 | ModifiedTime | 修改时间 | Auto (read-only) |
| 1001 | CreatedBy | 创建人 | Auto (read-only) |
| 1002 | ModifiedBy | 修改人 | Auto (read-only) |
| 1005 | AutoNumber | 自动编号 | Auto (read-only) |

---

## Error Codes

| code | HTTP | Description |
|------|------|-------------|
| 0 | 200 | Success |
| 1254000 | 400 | Invalid parameter |
| 1254006 | 403 | No permission for this bitable |
| 1254007 | 404 | App or table not found |
| 1254014 | 400 | Record not found |
| 1254040 | 429 | Rate limit exceeded (100/min) |
| 1254301 | 400 | Field type mismatch |
| 1254302 | 400 | Required field missing |
| 99991679 | 403 | Scope not authorized |
