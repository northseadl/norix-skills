# AGENTS.md — Norix Skills 开发规范

> AI Agent 在本仓库中的行为准则

## 项目概览

Norix Skills 是 AI Agent 即插即用技能集合，包含两个关联仓库：

| 仓库 | 用途 | 技术栈 |
|------|------|--------|
| `norix-skills` | 技能源码 | Python 3 / Node.js / Bash |
| `norix-skills-docs` | 文档网站 | VitePress + Vue 3 |

---

## 分支规范

| 分支 | 用途 | CI 触发 | 保护规则 |
|------|------|---------|---------|
| `main` | 线上稳定版本 | ✅ 自动部署 | 仅通过 PR 合并，禁止直接 push |
| `develop` | 日常开发 | ❌ 不触发 | 自由 push |

### 合并流程

```
develop → (PR) → main → 自动部署
```

1. 所有开发工作在 `develop` 分支进行
2. 功能完成后创建 PR 合并到 `main`
3. PR 标题遵循 Conventional Commits（见下方）
4. `main` 合并后自动触发 CI 部署

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
├── references/        # 可选：API 参考文档
└── evals/             # 可选：评估用例
```

### SKILL.md frontmatter

```yaml
---
name: <skill-name>
version: <semver>
description: >
  <触发条件描述，Agent 据此决定是否激活技能>
---
```

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
