---
name: doc-sentinel
description: |
  Document-code change notification system: traceable doc-code binding via git tree hash,
  git-diff-driven reconciliation plans with confidence/risk metadata, and idempotent execution.
  Use when maintaining documentation freshness, detecting stale docs, or binding docs to source code.
metadata:
  version: 0.2.0
  short-description: "Doc-code binding, staleness detection, change plans"
---

# Doc Sentinel — 文档-代码变更通知系统

## 核心概念

你负责守护一个仓库的**文档健康度**。三平面架构：

| 平面 | 目标 | 核心能力 |
|:---|:-----|:---------|
| **Identity** | 绑定真值 | 文档 frontmatter 绑定 source paths + git tree hash |
| **Reconciliation** | 变更推理 | Git diff → ChangeEvent → Policy → ChangePlan (含 confidence/risk) |
| **Capability** | 可选能力 | 索引生成（默认可用），矢量检索（未来独立技能） |

**核心价值**：让 Agent 准确知道「哪些文档可能需要更新」，不承诺自动修复，不假装语义理解。

**成功标准**：
- 零漏报：代码变更必须被检测到
- 低误报：误报率 < 20%
- 可解释：每个通知附带变更证据和 confidence

## 工具

```bash
# 主入口
uv run <SKILLS_DIR>/doc-sentinel/scripts/sentinel.py <command> [options]

# --- 4 个核心命令 ---

# 1. 只读状态查询（无副作用）
status [--root <path>] [--doc <id>] [--source <path>] [--format json]

# 2. 建立/更新文档-代码绑定
bind <doc.md> [--source <path>...] [--auto-detect] [--root <path>]

# 3. 生成变更计划（不执行）
plan [--since <commit>] [--output plan.json] [--format json] [--root <path>]

# 4. 执行计划（幂等）
apply [--dry-run] [--root <path>]
```

## 工作流

### Phase 1: 理解仓库

1. 运行 `status` 查看文档健康状态
2. 如无文档追踪，用 `bind` 为关键文档建立绑定

### Phase 2: 绑定文档

为需要追踪的文档注入溯源 frontmatter：

```bash
# 显式指定源码路径
sentinel.py bind docs/auth.md --source "src/auth/" "src/middleware/auth.py"

# 自动检测（使用文档所在目录）
sentinel.py bind docs/api/overview.md --auto-detect
```

### Phase 3: 检测变更

代码变更后，生成变更计划：

```bash
sentinel.py plan
# 输出：
#   📋 Stable actions (auto-executable):
#     📝 UPDATE → auth/overview
#        Reason: Source modified (42 lines): src/auth/handler.py
#   🔍 Review items (need confirmation):
#     ✨ CREATE → ?
#        Reason: New file in untracked area: src/billing/stripe.py
```

### Phase 4: 执行计划

```bash
# 预览
sentinel.py apply --dry-run

# 执行（仅执行 STABLE 级别的操作）
sentinel.py apply
```

## 溯源 Frontmatter 规范

每份受管文档头部嵌入：

```yaml
---
doc_id: "module/feature"
source_paths: ["module/src/"]
source_tree_hash: "a3f2b8c4d5e6"
last_sync_commit: "e7d1c4a..."
sync_timestamp: "2026-03-05T14:00:00+08:00"
doc_version: 3
status: "synced"
---
```

## 变更计划 (ChangePlan) 结构

每个 PlanItem 附带 Agent 可消费的元数据：

```json
{
  "action": "update",
  "risk": "stable",
  "doc_id": "auth/overview",
  "reason": "Source modified (42 lines): src/auth/handler.py",
  "confidence": 0.84,
  "details": {
    "modified_source": "src/auth/handler.py",
    "lines_changed": 42
  }
}
```

**动作分类**:

| 分类 | 动作 | 语义 |
|:-----|:-----|:-----|
| **STABLE** | UPDATE, RENAME, ARCHIVE | 可自动执行，风险低 |
| **REVIEW** | CREATE | 需 Agent/人工确认 |

## 显著性阈值

修改 (M) 状态使用阈值过滤噪声（默认 5 行）。可通过环境变量调整：

```bash
DOC_SENTINEL_THRESHOLD=10 sentinel.py plan
```

## 数据目录

```
<repo_root>/.doc-sentinel/
├── registry.json          # 文档注册表（绑定关系）
├── last_sync_commit       # 上次同步 commit SHA
└── change_log.json        # 操作历史（保留最近 50 条）
```

## 参考文档

| 文档 | 用途 | 何时读取 |
|:-----|:-----|:---------|
| [decision-tree.md](references/decision-tree.md) | 变更操作决策树详解 | 处理 plan/apply 时 |
| [traceback-spec.md](references/traceback-spec.md) | 溯源标识详细规范 | 维护 frontmatter 时 |

## 输出约定

- **思考/规划/报告**: 中文
- **代码/命令/文件名**: English
- **Frontmatter**: YAML (English keys)
