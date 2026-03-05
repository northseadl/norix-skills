# 矢量模式详细规范

> 文档适配矢量化存储与分级语义检索的完整指南。

## 概述

矢量模式为仓库文档建立一个本地的语义搜索引擎，核心设计：

1. **语义分块**：按文档结构（非固定 token 数）切分
2. **层次索引**：每个 chunk 知道自己的位置（parent/sibling/child）
3. **分级检索**：L0 粗筛 → L1/L2 精搜 → 上下文增强
4. **双后端**：sqlite-vec (ANN) + TF-IDF fallback

## 分块策略

### 3 级分块

```
文档原文
  │
  ├─ Level 0: 文档摘要 (~200-300 tokens)
  │    └─ 来源：标题 + 第一段
  │    └─ 用途：粗筛阶段快速定位相关文档
  │
  ├─ Level 1: 章节级 (~500-1000 tokens)
  │    └─ 来源：## 标题到下一个 ## 之间
  │    └─ 用途：精搜阶段定位具体章节
  │
  └─ Level 2: 段落/代码块级 (~200-500 tokens)
       └─ 来源：有意义的段落或完整代码块
       └─ 用途：精确定位具体内容
       └─ 条件：仅当 L1 chunk > 800 tokens 时才细分
```

### 分块规则

| 规则 | 说明 |
|:-----|:-----|
| 代码块完整性 | ``` 围起的代码块永远不拆分 |
| 最小 chunk | 低于 50 tokens 的段落与邻居合并 |
| 最大 chunk | 超过 1000 tokens 的章节强制细分 |
| 表格完整性 | Markdown 表格视为单个段落 |

## 层次化索引

每个 chunk 携带层次关系：

```python
Chunk(
    chunk_id="adb-mysql/overview#s2p1",  # doc_id#section#paragraph
    doc_id="adb-mysql/overview",
    level=2,
    parent_chunk_id="adb-mysql/overview#s2",      # 父章节
    sibling_chunk_ids=["...#s2p0", "...#s2p2"],   # 同级段落
)
```

文档间关系通过 frontmatter 的 `vector` 字段声明：

```yaml
vector:
  chunk_strategy: semantic
  parent_doc: null              # 父文档（如概览文档是子文档的 parent）
  sibling_docs:                 # 同级文档
    - "adb-mysql/profiles"
    - "adb-mysql/security"
  embedding_hash: "b4c9e2c7"   # 最近 embedding 时的内容 hash
```

## 检索流水线

### Stage 1: 粗筛 (Coarse Filter)

在 L0 (摘要) 层搜索，快速锁定 top_k × 3 个候选文档。

```
Query → 搜索所有 L0 chunks → 候选文档列表
```

### Stage 2: 精搜 (Precise Search)

在候选文档的 L1/L2 chunks 中精确搜索。

```
候选文档 → 搜索 L1 + L2 chunks → 精确匹配列表
```

### Stage 3: 上下文增强 (Context Enrichment)

为每个结果注入层次上下文：

```
精确匹配 → 附加:
  ├─ 父文档摘要（L0 摘要或 parent chunk 内容）
  ├─ 同级 chunks（前后各 1 个 chunk）
  └─ 兄弟文档列表（同目录下的相关文档）
```

## 后端选择

### TF-IDF (默认)

- **零依赖**：纯 Python stdlib 实现
- **持久化**：JSON 文件 (`.doc-engine/tfidf_index.json`)
- **适用**：仓库级文档（<5K chunks）
- **优势**：对领域内搜索效果好（术语匹配精准）
- **劣势**：无语义理解（"配置" 搜不到 "设置"）

### sqlite-vec (推荐)

- **依赖**：`pip install sqlite-vec`（PEP 723 按需安装）
- **持久化**：SQLite 文件 (`.doc-engine/vectors.db`)
- **适用**：需要语义搜索时
- **优势**：ANN 近似最近邻 + SQL 复合查询
- **劣势**：需要 embedding 模型

### 自动选择

```python
# doc_engine.py embed 时自动检测
try:
    import sqlite_vec
    backend = "sqlite-vec"
except ImportError:
    backend = "tfidf"  # 零依赖降级
```

## Embedding 策略

当使用 sqlite-vec 后端时，需要 embedding 模型：

| Provider | 维度 | 安装 | 适用场景 |
|:---------|:-----|:-----|:---------|
| TF-IDF (内置) | 稀疏 | 无需 | 默认，术语匹配 |
| sentence-transformers | 384 | pip install | 本地语义搜索 |
| OpenAI API | 1536 | OPENAI_API_KEY | 最高质量 |

v1 默认使用 TF-IDF，后续可扩展 embedding provider。

## 变更处理

当文档内容更新后：

1. 重新分块（chunker 比较 `content_hash` 检测变化）
2. 仅更新变化的 chunks（增量 upsert）
3. 更新 frontmatter 中的 `embedding_hash`

当文档删除/归档后：

1. `delete_doc(doc_id)` 清除所有 chunks
2. 更新兄弟文档的 `sibling_docs` 列表
