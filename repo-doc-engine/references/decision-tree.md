# 变更操作决策树详解

> 当 `sync` 检测到 git diff 时，如何决定对每份受影响文档执行什么操作。

## 决策流

```
git diff entry
  ├─ status = R (Rename)
  │    ├─ 有文档追踪 old_path → RENAME: 更新 source_paths
  │    └─ 无文档追踪          → CREATE: 可能需要新文档
  │
  ├─ status = D (Delete)
  │    ├─ 文档的所有 source_paths 均已删除 → ARCHIVE
  │    └─ 仍有存活的 source_paths         → UPDATE: 移除已删路径
  │
  ├─ status = A (Add)
  │    ├─ 新文件在已追踪目录中 → UPDATE: 通知父文档
  │    └─ 新文件在未追踪区域   → CREATE: 建议新建文档
  │
  ├─ status = M (Modify)
  │    ├─ 变更行数 ≥ 阈值 (默认5行) → UPDATE: 标记 stale
  │    └─ 变更行数 < 阈值           → NOOP: 忽略微小变化
  │
  └─ 目录整体移动 (多个 R 指向同一新目录)
       └─ RELOCATE: 级联更新所有子文档的 doc_id + source_paths
```

## 操作定义

| 操作 | 对文档的影响 | 自动执行 |
|:-----|:-------------|:---------|
| **UPDATE** | 标记 status=stale，等待 Agent 更新内容 | ✅ frontmatter |
| **RENAME** | 更新 source_paths 中的路径引用 | ✅ frontmatter |
| **RELOCATE** | 移动文档文件 + 更新 doc_id + source_paths | ⚠️ 需确认 |
| **ARCHIVE** | 标记 status=archived，不删除文件 | ✅ frontmatter |
| **CREATE** | 提示 Agent 为新代码创建文档 | ❌ 仅建议 |
| **MERGE** | 建议将多个文档合并（手动决策） | ❌ 仅建议 |
| **SPLIT** | 建议拆分过大的文档（手动决策） | ❌ 仅建议 |

## 显著性阈值

修改 (M) 状态使用 `SIGNIFICANCE_THRESHOLD`（默认 5 行）过滤噪声：

- **≥ 5 行**: 触发 UPDATE
- **< 5 行**: NOOP（注释修改、空白调整等不影响文档）

可通过环境变量 `DOC_ENGINE_THRESHOLD` 调整：

```bash
DOC_ENGINE_THRESHOLD=10 python3 doc_engine.py sync
```

## 操作优先级

同一文档被多个 diff entry 影响时，取最高优先级操作：

```
ARCHIVE (6) > RENAME (5) > RELOCATE (4) > MERGE (3) > UPDATE (2) > CREATE (1) > NOOP (0)
```

逻辑：如果文档的源码被删了 (ARCHIVE)，同时又被修改 (UPDATE)，以 ARCHIVE 为准。

## 示例场景

### 文件重命名
```
R100  adb-mysql/scripts/query.py → adb-mysql/scripts/adb_query.py
```
→ 找到所有追踪 `adb-mysql/scripts/query.py` 的文档
→ 将其 source_paths 中的路径更新为 `adb-mysql/scripts/adb_query.py`

### 目录删除
```
D  legacy-skill/scripts/main.py
D  legacy-skill/SKILL.md
```
→ 追踪 `legacy-skill/` 的文档，所有 source_paths 都已删除
→ ARCHIVE: 标记 status=archived

### 新增文件
```
A  web-scraper/scripts/stealth.py
```
→ `web-scraper/` 目录有追踪文档
→ UPDATE: 通知追踪文档，新源文件已添加
