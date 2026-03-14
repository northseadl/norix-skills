# AGENTS.md — Norix Skills 开发规范

> AI Agent 在本仓库中的行为准则

## 项目概览

Norix Skills 是 AI Agent 即插即用技能集合，包含两个关联仓库：

| 仓库 | 用途 | 技术栈 |
|------|------|--------|
| `norix-skills` | 技能源码 | Python 3 / Node.js / Bash |
| `norix-skills-docs` | 文档网站 | VitePress + Vue 3 |

---

## 分支规范（⚠️ 严格执行）

| 分支 | 用途 | 保护规则 |
|------|------|---------|
| `main` | 稳定/发布分支 | **禁止直接 commit 和 push**，仅接受 develop → main 的 `--no-ff` 合并 |
| `develop` | 日常开发 | 自由 commit 和 push |

### 合并方向（不可逆）

```
develop → main    ✅ 唯一允许的方向
main → develop    ❌ 绝对禁止
```

### Agent 操作铁律

1. **永远在 develop 分支上工作**
2. **push 只推 develop**: `git push origin develop`
3. **禁止** `git push origin develop main`（不要在 push 中附带 main）
4. **发布到 main 的标准流程**:
   ```bash
   git push origin develop
   git checkout main
   git merge develop --no-ff -m "merge: develop → main (描述)"
   git push origin main
   git checkout develop
   ```

### Git Hooks 防护

仓库通过 `.githooks/` 提供自动化防护（`pre-commit` + `pre-push`）。
克隆后需执行: `git config core.hooksPath .githooks`

### 提交信息规范

```
<type>: <中文描述>

[可选 body]
```

| Type | 说明 |
|------|------|
| `feat` | 新增技能或功能 |
| `fix` | 修复 Bug |
| `refactor` | 重构（不改变行为） |
| `docs` | 文档更新 |
| `ci` | CI/CD 配置 |
| `chore` | 依赖、配置等杂项 |
| `merge` | develop → main 合并 |

---

## 技能版本规范

### 版本格式

采用 SemVer：`MAJOR.MINOR.PATCH`

| 变更类型 | 版本升级 | 示例 |
|---------|---------|------|
| 破坏性变更（CLI 参数重命名、输出格式变化） | MAJOR | 0.x → 1.0.0 |
| 新增命令或功能 | MINOR | 0.0.1 → 0.1.0 |
| Bug 修复、文档改进 | PATCH | 0.0.1 → 0.0.2 |

### 版本更新清单

修改技能版本时必须同步更新：

1. **`<skill>/SKILL.md`** — frontmatter 中的 `version` 字段
2. **`README.md`** — 技能一览表中的版本号
3. **`norix-skills-docs`** — 对应技能页面的 `version` prop

### 开发状态

| 状态 | 含义 | 标记位置 |
|------|------|---------|
| ✅ Stable | 可生产使用 | README + 文档站 |
| 🚧 DEV | 开发中，接口可能变化 | README + 文档站 `status="dev"` |

---

## 技能结构约束

每个技能目录必须包含：

```
<skill-name>/
├── SKILL.md           # 必需：Agent 读取的技能说明
├── scripts/           # 必需：可执行脚本
├── references/        # 可选：深层参考文档（Agent 按需加载）
├── agents/            # 可选：子 Agent 指令
├── assets/            # 可选：模板、HTML 等运行时资源
└── evals/             # 可选：评估用例
```

### SKILL.md frontmatter

```yaml
---
name: <skill-name>
metadata:
  version: <semver>
description: >
  <触发条件描述，Agent 据此决定是否激活技能>
---
```

---

## SKILL.md 设计原则

SKILL.md 是 **Agent 的入口文档**，不是人类文档。核心设计目标：
Agent 通过加载它来知道技能有什么、怎么工作、大概原理。

### 渐进式加载（三层架构）

| 层级 | 内容 | 上下文消耗 | 加载时机 |
|:---|:---|:---|:---|
| **L0: Metadata** | name + description | ~100 词 | 始终在 Agent 上下文中 |
| **L1: SKILL.md body** | 工作流 + 命令概览 + 原理 | <500 行 | 技能触发时加载 |
| **L2: references/** | 工具详情、API schema、协议规则 | 不限 | Agent 按需读取 |
| **L3: CLI --help** | 命令参数兜底 | 0（运行时） | Agent 遇到参数不确定时执行 |

**关键约束**:
- SKILL.md body **<500 行**。超过就必须拆分到 `references/`
- 拆分时在 SKILL.md 中用表格指明每个 reference 文件的用途 + **何时读取**
- Agent 已知的通用知识（编程语法、标准库用法）**不要重复写**
- scripts/ 中的 CLI 自身即兜底文档，Agent 可通过 `--help` 获取精确参数

### Agent-First 视角

- SKILL.md 面向 **读取它的 Agent**，不是面向人类用户
- 不使用第三方视角描述（如 "humans only"、"用户需要…"）
- 角色代入：用"你"指代 Agent 自身，用"用户"指代 Agent 的操作者
- 命令/示例驱动：Agent 看完就能直接执行，不需要额外推理

### Description 触发策略

Description 是技能的**唯一触发机制**——Agent 据此决定是否激活技能。

- 描述技能做什么 **AND** 什么时候用
- 适度 "pushy"——列出常见触发场景，包括用户未显式提及的场景
- 用反向排除引导正确路由（如 `NOT for X, use Y`）
- 不要使用通用/模糊关键词（如 "data processing"），使用具体特征

### 指令风格

- **解释 Why，而非命令 MUST** — Agent 有 theory of mind，解释清楚比全大写命令更有效
- 如果发现自己在写 `ALWAYS` 或 `NEVER`，退一步重构为解释性语句
- **重复工作 → 打包脚本** — 如果 Agent 每次调用都独立写同样的辅助代码，说明该打包到 `scripts/`

---

## 安全规则

- 禁止硬编码凭证（API Key / Token / Secret）
- 禁止提交绝对路径，使用 `<SKILLS_DIR>` 占位符
- 凭据存储在 `~/.feishu/` 等用户目录，权限 `0o600`
- `.gitignore` 必须覆盖 `credentials.json`、`.env*`、`*.pem`

---

## 构建与验证

### 技能仓库

```bash
# Python 语法检查
python3 -m py_compile feishu-integration/scripts/*.py

# Node.js 语法检查
node --check pm-toolkit/scripts/serve.js
node --check agent-task-orchestration/scripts/dispatch.mjs
```

### 文档仓库

```bash
pnpm install --frozen-lockfile
pnpm build
```
