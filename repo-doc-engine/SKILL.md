---
name: repo-doc-engine
description: |
  Autonomous repo documentation engine: traceable doc-code binding via git tree hash,
  git-diff-driven change analysis (update/rename/merge/split/archive), auto-index generation,
  and optional vector mode with semantic chunking + hierarchical retrieval.
metadata:
  version: 0.1.0
  short-description: "Repo doc sync, traceability, vector search"
---

# Repo Doc Engine — 自治式仓库文档引擎

## 核心概念

你负责维护一个仓库的**文档与代码的共生系统**。三层架构：

| 层 | 目标 | 核心能力 |
|:---|:-----|:---------|
| **L0** | 溯源绑定 | 文档 frontmatter 绑定 source paths + git tree hash |
| **L1** | 自治维护 | Git diff → 操作决策（update/rename/merge/split/archive）→ 索引重建 |
| **L2** | 矢量增强 | 语义分块 + 层次索引 + 分级检索（粗筛→精搜→上下文注入） |

## 工具

```bash
# 主入口
uv run <SKILLS_DIR>/repo-doc-engine/scripts/doc_engine.py <command> [options]

# --- L0: 溯源绑定 ---
scan [--root <path>]              # 扫描仓库文档和源码映射
check [--root <path>]             # 检查文档 staleness 状态
status [--root <path>]            # 文档健康报告

# --- L1: 自治维护 ---
sync [--since <commit>]           # 基于 git diff 分析变更 + 操作计划
apply [--dry-run]                 # 执行操作计划
index [--style auto|flat|hierarchical|categorical]  # 生成索引

# --- L2: 矢量增强 ---
embed [--provider auto]           # Embedding 并存入本地矢量库
search <query> [--top-k 5]        # 分级语义检索
vector-status                     # 矢量库统计
```

## 工作流

### Phase 1: 理解仓库

1. 运行 `scan` 发现所有带溯源 frontmatter 的文档
2. 运行 `check` 评估各文档的 staleness
3. 运行 `status` 查看健康报告

### Phase 2: 同步与维护

1. 运行 `sync` 分析自上次同步以来的 git diff
2. 审查操作计划（`--dry-run` 查看）
3. 运行 `apply` 执行操作（rename frontmatter、archive 文档等）
4. 运行 `index` 重建索引文档

### Phase 3: 矢量增强（可选）

仅在用户需要语义检索时启用：

1. 运行 `embed` 对文档执行分块 + embedding
2. 运行 `search` 进行分级语义检索
3. 检索结果自动附带层次上下文（父文档、兄弟文档、同级 chunks）

### Phase 4: 为新代码创建文档

当 `sync` 检测到新增源文件且无对应文档时：

1. 阅读新增的源文件
2. 生成带溯源 frontmatter 的文档
3. 更新索引

## 溯源 Frontmatter 规范

每份受管文档头部嵌入：

```yaml
---
doc_id: "module/feature"             # 唯一标识
source_paths:                        # 追踪的源文件/目录
  - "module/src/feature.py"
source_tree_hash: "a3f2b8c..."       # git tree hash 聚合
last_sync_commit: "e7d1c4a..."       # 上次同步的 commit
sync_timestamp: "2026-03-05T14:00:00+08:00"
doc_version: 3
status: "synced"                     # synced | stale | needs_review | draft
---
```

## 操作决策矩阵

Git diff 状态到文档操作的映射：

| Git 状态 | 文档操作 | 条件 |
|:---------|:---------|:-----|
| `M` (Modified) | UPDATE | 变更行数 > 阈值 |
| `R` (Renamed) | RENAME | 自动更新 source_paths |
| `D` (Deleted) | ARCHIVE | 所有 source_paths 均已删除 |
| `A` (Added) | CREATE | 新文件在已追踪目录中 |
| 目录移动 | RELOCATE | 级联更新 doc_id + source_paths |

详细决策树：阅读 [references/decision-tree.md](references/decision-tree.md)

## 矢量模式

矢量模式下文档适配语义切片。详情阅读 [references/vector-mode.md](references/vector-mode.md)

**核心设计**：
- **3级分块**：摘要(L0) → 章节(L1) → 段落(L2)
- **层次索引**：每个 chunk 知道 parent/sibling/child
- **分级检索**：L0 粗筛 → L1/L2 精搜 → 上下文增强
- **本地存储**：sqlite-vec（PEP 723 按需安装）+ TF-IDF fallback

## 数据目录

```
<repo_root>/.doc-engine/              # 项目级（可 .gitignore）
├── registry.json                      # 文档注册表
├── last_sync_commit                   # 上次同步 commit
├── vectors.db                         # 矢量库（.gitignore）
└── change_log.json                    # 操作历史
```

## 参考文档

| 文档 | 用途 | 何时读取 |
|:-----|:-----|:---------|
| [decision-tree.md](references/decision-tree.md) | 变更操作决策树详解 | 处理 sync/apply 时 |
| [vector-mode.md](references/vector-mode.md) | 矢量模式完整规范 | 启用 embed/search 时 |
| [traceback-spec.md](references/traceback-spec.md) | 溯源标识详细规范 | 维护 frontmatter 时 |

## 输出约定

- **思考/规划/报告**: 中文
- **代码/命令/文件名**: English
- **Frontmatter**: YAML (English keys)
