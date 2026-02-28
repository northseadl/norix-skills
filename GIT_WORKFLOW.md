# Git 工作流规范

> 本文件定义了 norix-skills 系列仓库的 Git 分支策略和操作规范。
> 所有人类开发者和 AI Agent 必须严格遵守。

## 分支模型

```
main     ← 稳定/发布分支，只接受来自 develop 的合并
develop  ← 日常开发分支，所有工作在此进行
```

## 核心规则

### 1. main 分支受保护

- **禁止** 直接在 main 上 commit
- **禁止** 直接 push 到 main（除非是 develop → main 的合并结果）
- **唯一更新方式**: `git checkout main && git merge develop --no-ff`

### 2. develop 是工作分支

- 所有日常开发、修复、重构都在 develop 上进行
- 可以直接 commit 和 push

### 3. 合并方向不可逆

```
develop → main    ✅ 允许（唯一方向）
main → develop    ❌ 禁止
```

## 标准操作流程

### 日常开发

```bash
# 确保在 develop 分支
git checkout develop

# 开发、提交
git add -A && git commit -m "feat: 描述"

# 推送 develop
git push origin develop
```

### 发布到 main

```bash
# 1. 确保 develop 已推送
git push origin develop

# 2. 切换到 main，合并 develop
git checkout main
git merge develop --no-ff -m "merge: develop → main (描述)"

# 3. 推送 main
git push origin main

# 4. 回到 develop
git checkout develop
```

### Agent 操作规范

AI Agent 在操作这些仓库时必须：

1. **永远在 develop 分支上工作**
2. **push 命令只推 develop**: `git push origin develop`
3. **不要在 push 时带 main**: 禁止 `git push origin develop main`
4. **需要发布时**，按上述"发布到 main"流程操作

## Git Hooks 防护

仓库通过 `.githooks/` 目录提供自动化防护：

| Hook | 功能 |
|------|------|
| `pre-commit` | 检测当前分支，禁止在 main 上直接 commit（merge commit 除外） |
| `pre-push` | 检测推送目标，验证推送到 main 的内容必须来自 develop |

### 激活 Hooks

克隆仓库后需要执行一次：

```bash
git config core.hooksPath .githooks
```

### 紧急绕过（慎用）

```bash
# 绕过 pre-commit
git commit --no-verify -m "emergency fix"

# 绕过 pre-push
SKIP_PUSH_GUARD=1 git push origin main
```

## Commit Message 规范

使用**中文** Conventional Commits：

```
feat: 新增技能/功能
fix: 修复缺陷
refactor: 重构（不改变外部行为）
chore: 构建/工具/依赖等杂务
docs: 文档更新
merge: develop → main (描述)
```
