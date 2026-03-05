# 溯源标识详细规范

> 文档 ↔ 代码绑定的元数据格式和计算方法。

## Frontmatter 字段定义

```yaml
---
doc_id: "module/feature"             # 唯一标识 = 相对路径（去 .md 后缀）
source_paths:                        # 追踪的源文件或目录（相对于仓库根）
  - "module/src/feature.py"
  - "module/src/utils.py"
source_tree_hash: "a3f2b8c4d5e6"    # 12 位 SHA256 聚合 hash
last_sync_commit: "e7d1c4a..."       # 40 位 git commit SHA
sync_timestamp: "2026-03-05T14:00:00+08:00"  # ISO 8601 + timezone
doc_version: 3                       # 自增，每次内容变更 +1
status: "synced"                     # 文档当前状态
---
```

## doc_id 命名规则

- 使用相对路径格式：`{directory}/{name}`
- 省略 `.md` 后缀
- 索引文档使用 `_index` 开头：`_index`, `module/_index`
- 示例：
  - `adb-mysql/overview` → `adb-mysql/overview.md`
  - `web-scraper/tiered-engine` → `web-scraper/tiered-engine.md`
  - `_index` → 顶层 `INDEX.md`

## source_paths 规则

- 优先使用**目录**而非单文件（git tree hash 对目录 O(1)）
- 一份文档可追踪多个 source_paths
- 多份文档可追踪同一个 source_path
- **路径匹配使用边界安全规则**：`src` 不会匹配 `src10`

```yaml
# 好：追踪目录
source_paths: ["adb-mysql/scripts/"]

# 避免：追踪所有单文件
source_paths:
  - "adb-mysql/scripts/adb_query.py"
  - "adb-mysql/scripts/adb_cli.py"
  - "adb-mysql/scripts/schema_doc.py"
```

## source_tree_hash 计算

1. 对每个 source_path 执行 `git ls-tree HEAD -- <path>`
2. 提取 tree/blob hash（第 3 列）
3. 对所有 hash **排序后拼接**（`:` 分隔）
4. SHA256 取前 12 位

```
source_paths = ["module/src/", "module/config.py"]

git ls-tree HEAD -- module/src/
→ "040000 tree abc123... module/src"    → hash = "abc123..."

git ls-tree HEAD -- module/config.py
→ "100644 blob def456... module/config.py"  → hash = "def456..."

combined = "abc123...:def456..."
source_tree_hash = SHA256(combined)[:12]
```

**关键**：git tree hash 在目录内任何文件变化时都会改变（Merkle tree 性质），
所以追踪目录可以 O(1) 检测任意深度的变更。

## status 状态机

```
draft ──bind──→ synced
                    │
              [源码变更]
                    ↓
                  stale ──apply──→ synced
                    │               ↑
              [源码删除]      [Agent 更新文档]
                    ↓               │
             source_missing    needs_review
                    │
              [确认删除]
                    ↓
                archived
```

| 状态 | 含义 | 触发条件 |
|:-----|:-----|:---------|
| `draft` | 新创建，尚未与源码绑定 | 初始状态 |
| `synced` | 文档与源码同步 | source_tree_hash 匹配 |
| `stale` | 源码已变更，文档需更新 | hash 不匹配 |
| `needs_review` | 需要人工审核 | 复杂变更 |
| `source_missing` | 追踪的源码已不存在 | source_paths 全部 404 |
| `archived` | 已归档，不再活跃 | 手动或自动归档 |
