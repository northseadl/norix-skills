---
name: coding-net
version: 0.2.0
description: |
  Coding.net DevOps platform integration skill for Agent-driven automation.
  Zero-dependency Python scripts operating Coding.net Open API via Personal Access Token.

  Core value (things standard git CANNOT do):
  - MR lifecycle: create, merge, close merge requests programmatically
  - CI operations: trigger builds, view logs, stop running builds
  - Artifact registry: browse packages, versions, get download URLs
  - Cross-project queries: enumerate all projects and repos in a team
  - Remote file audit: read files from any repo without cloning

  Use this skill whenever the user mentions any of these, even without saying "Coding" explicitly:
  merge requests, MR reviews, triggering CI builds, checking build status, viewing build logs,
  artifact management, Docker image versions, package registry, artifact downloads,
  listing remote repos, reading remote files without clone.

  Also trigger on Chinese: "合并请求", "触发构建", "查看构建日志",
  "制品库", "查看版本", "下载制品", "Coding 部署", "查看 CI 状态",
  "查看仓库", "创建分支", "远程代码审计".
  Also trigger when the user mentions "coding.net", "CODING", "Coding CI", "Coding 制品库".
---

# Coding.net Integration

> Unified CLI: `./coding <module> <command> [options]`
> Full command reference: `references/api_reference.md`

## First-Use Detection

Before executing any command, verify credentials:

### Path 1: Environment Variables (Agent preferred, zero setup)

If `CODING_TEAM` + `CODING_TOKEN` are set, **no init needed** — CodingClient resolves them automatically.

### Path 2: Non-Interactive Init (Agent usable)

Ask user for team name and Personal Access Token, then run:
```bash
./coding auth init --team "their-team" --token "their-token"
```
This verifies connectivity and persists credentials to `~/.coding/credentials.json`.

### Path 3: Interactive Setup (humans only)

> ⚠️ **NEVER run `./coding auth setup` from Agent** — it uses `input()` and will block.

### How to create a Personal Access Token

1. 登录 Coding.net → 个人头像 → 个人账户设置 → 访问令牌
2. 新建令牌 → 勾选权限范围:
   - `project:depot:rw`      (代码仓库)
   - `project:ci:rw`         (持续集成)
   - `project:artifacts:rw`  (制品库)
   - `team:profile:ro`       (团队信息，用于验证连通性)
3. 复制令牌 (仅显示一次)

After init/setup succeeds, credentials auto-persist. No further user action needed.

## When to Use This Skill vs Standard Git

> **核心原则: 本地有仓库用 git，跨仓库/平台操作用本技能。**

### ✅ 必须用本技能（git 做不到）

- MR 生命周期: 创建、合并、关闭合并请求
- CI: 触发构建、查看日志、停止构建
- 制品库: 查看包/版本、获取下载地址
- 跨项目查询: 枚举团队所有项目和仓库

### ✅ 本技能更优（无需 clone）

- 远程审计: 读取任意仓库的文件，无需 clone 整个仓库
- 轻量修复: 单文件文档修正、配置调整
- 分支查询: 查看远程分支/提交状态

### ❌ 应该用标准 git（本地已有仓库时）

- 多文件代码开发 → `git add/commit/push`
- 二进制文件提交 → `git push`
- 完整 diff/blame/log → `git log/diff/blame`
- 已 clone 的仓库读文件 → 直接读本地文件

## Branch Convention Recognition (MANDATORY)

> ⛔ **Agent 只能向最低级别的集成分支提交 MR，严禁直接向 master/main 提交。**

Before creating branches or MRs, **MUST** list branches via `DescribeGitBranches` and detect the branching model:

### Detection Logic

```
branches = list all branch names

if 'dev' in branches:       target = 'dev'
elif 'develop' in branches:  target = 'develop'
elif 'test' in branches:     target = 'test'
elif 'staging' in branches:  target = 'staging'
elif 'main' in branches:     target = 'main'
else:                        target = default_branch
```

### Agent MR Workflow

1. **List branches** → detect `target` (lowest-level integration branch)
2. **Create feature branch** from `target`: `feature/<descriptive-name>`
3. **Commit changes** via `ModifyGitFiles`
4. **Create MR** from `feature/<name>` → `target`
5. **Never** target `master`/`main` directly unless it is the ONLY branch

### Branch Naming Convention

| Purpose | Pattern | Example |
|---------|---------|----------|
| Feature | `feature/<name>` | `feature/add-auth-module` |
| Bugfix | `fix/<name>` | `fix/null-pointer-crash` |
| Probe/Test | `probe/<name>` | `probe/api-integration` |

### Forbidden Actions

- ❌ Creating MR to `master` or `main` when `dev`/`develop` exists
- ❌ Pushing directly to protected branches (`master`, `main`, `test`)
- ❌ Using non-descriptive branch names (`temp`, `test123`)

## API Protocol

Coding.net Open API uses a **unified POST endpoint** with Action-based routing:

- **Endpoint**: `https://{team}.coding.net/open-api?Action={ActionName}`
- **Method**: Always POST
- **Auth**: `Authorization: Bearer {personal_access_token}`
- **Request body**: JSON with action-specific parameters
- **Response envelope**: `{"Response": {"RequestId": "...", ...data}}` or `{"Response": {"Error": {...}}}`

This is different from REST-style APIs — there are no path-based routes.

## Intent → Command Mapping

### Git Repositories (depot)

| User intent | Command |
|---|---|
| "查看项目仓库" | `depot list --project <ID>` |
| "看看分支" | `depot branches --depot-id <ID>` |
| "看看标签" | `depot tags --depot-id <ID>` |
| "最近提交记录" | `depot commits --depot-id <ID> [--ref dev]` |
| "查看文件" | `depot file --depot-id <ID> --path README.md [--ref dev]` |
| "查看目录" | `depot tree --depot-id <ID> [--path src] [--ref dev]` |
| "提交文件" | `depot commit-files --depot-id <ID> --ref feature/x --message "fix" --create path=content` |
| "创建分支" | `depot create-branch --depot-id <ID> --branch feature/x` |
| "删除分支" | `depot delete-branch --depot-id <ID> --branch feature/x` |
| "创建 MR" | `depot mr-create --depot-id <ID> --title "..." --src feature/x` |
| "MR 列表" | `depot mr-list --project <name> [--status open]` |
| "MR diff" | `depot mr-diff --depot-id <ID> --merge-id 1` |
| "MR 评论" | `depot mr-comments --depot-path team/project/depot --merge-id 1` |
| "发评论" | `depot mr-comment --depot-path team/project/depot --merge-id 1 --content "LGTM"` |
| "修改 MR" | `depot mr-update --depot-id <ID> --merge-id 1 --title "new title"` |
| "commit diff" | `depot commit-diff --depot-id <ID> --sha abc123` |
| "合并 MR" | `depot mr-merge --depot-id <ID> --merge-id 1 [--delete-branch]` |
| "关闭 MR" | `depot mr-close --depot-id <ID> --merge-id 1` |

### Projects (project)

| User intent | Command |
|---|---|
| "查看所有项目" | `project list` |
| "项目详情" | `project info --id <ID>` |
| "按名称查项目" | `project find --name my-project` |
| "项目成员" | `project members --id <ID>` |
| "项目仓库" | `project depots --id <ID>` |

### CI Builds (ci)

| User intent | Command |
|---|---|
| "查看构建任务" | `ci jobs --project <ID>` |
| "构建记录" | `ci builds --project <ID> --job <jobId>` |
| "触发构建" | `ci trigger --project <ID> --job <jobId> [--ref main]` |
| "停止构建" | `ci stop --project <ID> --id <buildId>` |
| "查看构建日志" | `ci log --project <ID> --id <buildId> [--raw]` |
| "构建阶段" | `ci stage --project <ID> --id <buildId>` |

### Artifact Registry (artifact)

| User intent | Command |
|---|---|
| "查看制品库" | `artifact repos --project <ID> [--type docker]` |
| "创建制品库" | `artifact create-repo --project <ID> --name my-docker --type docker` |
| "查看包列表" | `artifact packages --project <ID> --repo my-docker` |
| "查看版本" | `artifact versions --project <ID> --repo my-docker --pkg my-app` |
| "下载地址" | `artifact download-url --project <ID> --repo ... --pkg ... --version v1.0` |

## ID Resolution

Many Coding APIs require either **Project Name** or **Project ID**, and either **Depot Name** or **Depot ID**,
depending on the specific Action. The convention is:

- `--project` with a string = Project Name (e.g., "my-project")
- `--project` with an integer = Project ID (e.g., 12345)
- `--depot` = Depot Name, `--depot-id` = Depot ID

When the user gives a project name but you need an ID (or vice versa), use:
- `DescribeCodingProjects` to look up Project ID from name
- `DescribeProjectDepots` to look up Depot ID from project + depot name

## Output Formatting

Raw CLI output is JSON. Always transform for the user:

- **Depot list** → Markdown table: Name, Type, SSH URL, Default Branch
- **Branch list** → Numbered list with branch name and last commit info
- **MR list** → Markdown table: #IId, Title, Source→Target, Status, Author
- **Build list** → Markdown table: #ID, Status, Duration, Trigger, Ref
- **Build log** → Code block (may be very long; truncate or summarize)
- **Artifact version list** → Markdown table: Version, Size, Created, Status

## Error Recovery

| Situation | Agent action |
|---|---|
| Auth failed (401) | Verify token: `./coding auth status`, guide re-setup |
| AuthFailure / InvalidParameter | Check parameter names/types match the Action spec |
| ResourceNotFound | Verify project name/ID and depot name/ID exist |
| RequestLimitExceeded (429) | Built-in retry with exponential backoff (max 3) |
| Server error (5xx) | Built-in retry with exponential backoff (max 3) |
| No credentials | Trigger First-Use Detection flow |

## Key Behaviors

- **All requests are POST**: Unlike REST APIs, every Coding.net API call uses POST method
- **Action routing**: The operation is specified via `?Action=` query parameter, not URL path
- **PascalCase parameters**: Request body fields use PascalCase (e.g., `ProjectName`, `DepotId`)
- **Response envelope**: All responses wrapped in `{"Response": {...}}`, errors in `{"Response": {"Error": {...}}}`
- **Retry**: Built-in 429/5xx auto-retry (max 3, exponential backoff)
- **Pagination**: Use `PageNumber`/`PageSize` for paginated results

## Structure

```
coding-net/
├── coding                ← Unified CLI entry point (bash)
├── SKILL.md              ← This file (Agent execution standard)
├── scripts/
│   ├── coding_api.py     ← Core engine (auth + HTTP + retry)
│   ├── auth.py           ← Authentication (init / setup / status / clean)
│   ├── depot.py          ← Git repos + MR review (branches / commits / mr-diff / mr-comment)
│   ├── project.py        ← Project management (list / info / find / members)
│   ├── ci.py             ← CI build management
│   └── artifact.py       ← Artifact repository management
├── evals/
│   └── evals.json        ← Test cases for skill evaluation
└── references/
    └── api_reference.md  ← Action parameter reference
```
