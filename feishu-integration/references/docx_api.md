# Feishu Docx v1 API Reference

> Base URL: `https://open.feishu.cn/open-apis`
> Auth: `Authorization: Bearer <user_access_token | tenant_access_token>`
> Content-Type: `application/json; charset=utf-8`

## Table of Contents
1. [Document Operations](#document-operations)
2. [Block Operations](#block-operations)
3. [Block Types](#block-types)
4. [Text Element Structure](#text-element-structure)
5. [Error Codes](#error-codes)

---

## Document Operations

### Create Document
```
POST /docx/v1/documents
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | No | Document title (max 800 chars). Empty = untitled |
| folder_token | string | No | Target folder. Empty = user's root folder |

**Response:**
```json
{
  "code": 0,
  "data": {
    "document": {
      "document_id": "doxcnxxxxxx",
      "revision_id": 1,
      "title": "..."
    }
  }
}
```
**Rate limit:** 3/s per app

### Get Document
```
GET /docx/v1/documents/:document_id
```
Returns document_id, revision_id, title.
**Rate limit:** 5/s per app

### Get Document Raw Content
```
GET /docx/v1/documents/:document_id/raw_content
```
Returns plain text content.
**Rate limit:** 5/s per app

---

## Block Operations

### Get All Blocks
```
GET /docx/v1/documents/:document_id/blocks?page_size=500&page_token=xxx&document_revision_id=-1
```

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| page_size | int | Max 500, default 500 |
| page_token | string | Pagination cursor |
| document_revision_id | int | -1 = latest version |

**Rate limit:** 5/s per app

### Get Single Block
```
GET /docx/v1/documents/:document_id/blocks/:block_id
```

### Create Child Blocks
```
POST /docx/v1/documents/:document_id/blocks/:block_id/children
```

**Request Body:**
```json
{
  "children": [
    {
      "block_type": 23,
      "text": {
        "elements": [
          {
            "text_run": {
              "content": "Hello, Feishu!",
              "text_element_style": {
                "bold": true
              }
            }
          }
        ]
      }
    }
  ],
  "index": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| children | array | Array of block objects to create |
| index | int | Insert position (0-based). -1 or omit = append to end |

**Rate limit:** 3/s per app

### Update Block
```
PATCH /docx/v1/documents/:document_id/blocks/:block_id
```

### Delete Block
```
DELETE /docx/v1/documents/:document_id/blocks/:block_id
```

### Batch Update Blocks
```
PATCH /docx/v1/documents/:document_id/blocks/batch_update
```

---

## Block Types

| block_type | Name | Field | Description |
|-----------|------|-------|-------------|
| 1 | Page | `page` | Document root block (auto-created) |
| 2 | Text | `text` | 文本段落 |
| 3 | Heading 1 | `heading1` | 一级标题 |
| 4 | Heading 2 | `heading2` | 二级标题 |
| 5 | Heading 3 | `heading3` | 三级标题 |
| 6 | Heading 4 | `heading4` | 四级标题 |
| 7 | Heading 5 | `heading5` | 五级标题 |
| 8 | Heading 6 | `heading6` | 六级标题 |
| 9 | Heading 7 | `heading7` | 七级标题 |
| 10 | Heading 8 | `heading8` | 八级标题 |
| 11 | Heading 9 | `heading9` | 九级标题 |
| 12 | Bullet List | `bullet` | 无序列表 |
| 13 | Ordered List | `ordered` | 有序列表 |
| 14 | Code | `code` | 代码块 |
| 15 | Quote | `quote` | 引用 |
| 17 | Todo | `todo` | 待办事项 |
| 22 | Divider | `divider` | 分割线 |
| 24 | Equation | `equation` | 公式 |
| 27 | Image | `image` | 图片 |
| 28 | Table | `table` | 表格 |
| 29 | Table Cell | `table_cell` | 表格单元格 |
| 30 | Sheet | `sheet` | 内嵌电子表格 |
| 31 | Table (v2) | `table` | 表格 |
| 32 | Grid | `grid` | 分栏 |
| 33 | Grid Column | `grid_column` | 分栏列 |
| 34 | Callout | `callout` | 高亮块 |
| 37 | Task | `task` | 任务块 |

### Block Structure Example

```json
{
  "block_id": "blk_xxxxxxxx",
  "block_type": 23,
  "parent_id": "doxcnxxxxxx",
  "children": [],
  "text": {
    "style": {
      "align": 1
    },
    "elements": [
      {
        "text_run": {
          "content": "Hello",
          "text_element_style": {
            "bold": true,
            "italic": false,
            "strikethrough": false,
            "underline": false,
            "inline_code": false,
            "link": {
              "url": "https://example.com"
            }
          }
        }
      }
    ]
  }
}
```

---

## Text Element Structure

Text content in blocks uses the `elements` array, which can contain:

### text_run (Rich Text)
```json
{
  "text_run": {
    "content": "styled text",
    "text_element_style": {
      "bold": false,
      "italic": false,
      "strikethrough": false,
      "underline": false,
      "inline_code": false,
      "text_color": 1,
      "background_color": 2,
      "link": {"url": "https://..."}
    }
  }
}
```

### mention_user
```json
{
  "mention_user": {
    "user_id": "ou_xxxxx",
    "text_element_style": {}
  }
}
```

### mention_doc
```json
{
  "mention_doc": {
    "token": "doxcnxxxxxx",
    "obj_type": 22,
    "url": "https://...",
    "title": "Referenced Doc"
  }
}
```

### equation
```json
{
  "equation": {
    "content": "E = mc^2"
  }
}
```

---

## Code Block Language Codes

| Code | Language |
|------|----------|
| 1 | PlainText |
| 2 | ABAP |
| 3 | Ada |
| 4 | Apache |
| 5 | Apex |
| 6 | Assembly |
| 7 | Base |
| 8 | Bash/Shell |
| 9 | C# |
| 10 | C++ |
| 11 | C |
| 12 | COBOL |
| 13 | CSS |
| 14 | CoffeeScript |
| 15 | D |
| 16 | Dart |
| 17 | Delphi |
| 18 | Go |
| 19 | Groovy |
| 20 | HTML |
| 21 | Java |
| 22 | JavaScript |
| 23 | JSON |
| 24 | Julia |
| 25 | Kotlin |
| 26 | LaTeX |
| 27 | Lisp |
| 28 | Lua |
| 29 | Makefile |
| 30 | Markdown |
| 31 | Matlab |
| 32 | Objective-C |
| 33 | Python |
| 34 | R |
| 35 | Rust |
| 36 | Ruby |
| 37 | Scala |
| 38 | SQL |
| 39 | Swift |
| 40 | Thrift |
| 41 | TypeScript |
| 42 | VBScript |
| 43 | Visual Basic |
| 44 | XML |
| 45 | YAML |

---

## Error Codes

| code | HTTP | Description |
|------|------|-------------|
| 0 | 200 | Success |
| 100001 | 400 | Invalid parameter |
| 100003 | 403 | Permission denied |
| 100004 | 404 | Document or block not found |
| 100029 | 429 | Rate limit exceeded |
| 230001 | 400 | Block count exceeds limit (max 5000 per document) |
| 230002 | 400 | Block nesting depth exceeds limit |
| 230003 | 400 | Unsupported block type for this operation |
| 230005 | 400 | Document is locked by another user |
