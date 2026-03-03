---
name: cnb-cool-build
version: 0.1.0
description: 针对 cnb.cool 的「云原生构建」（CNB Build）：生成/修改 `.cnb.yml` 流水线、触发规则（branch glob / events）、构建环境（docker image/build/devcontainer）、runner 资源、缓存（volumes / docker:cache）、环境变量（env/imports/exports）、手动触发（web_trigger）与调试（login debug）。在接入、迁移、优化或排查 CNB 构建配置时使用。
---

# CNB 云原生构建（cnb.cool）

## 你要输出什么

- `.cnb.yml`（必选）：基于用户目标生成或最小改动修改，并解释触发与并发关系（pipeline 并发 / stage 串行 / job 并发）。
- 需要时额外输出：
  - `.cnb/web_trigger.yml`：需要“手动触发按钮/参数/选择目标构建”时。
  - `.cnb/env/*.yml`：需要复用环境变量或跨仓库 `imports` 时（见 `references/env.md`）。
- 注意：若用户使用的是 CODING 平台的云原生构建（配置文件为 `.coding-ci.yml`），语法与变量机制（尤其 `exports/imports`、内置任务等）与本 CNB 有差异，应改用 `coding-ci` Skill。

## 开始前先问（尽量一次问完）

1. 默认分支与触发分支：哪些分支要跑？是否需要 `$` 兜底配置？
2. 事件：`push` / `pull_request` / `commit.add` / `web_trigger_*` / `schedule` / `api_trigger` 等需要哪些？
3. 构建语言与命令：例如 Go/Node/Java，具体 `test/build/lint` 命令。
4. 构建环境：直接用 `docker.image`，还是 `docker.build`/`docker.devcontainer`？是否需要共享 `volumes`？
5. 资源与速度：runner 需要多少 `cpus/mem/disk`？是否需要 `tags`？
6. 缓存与参数：需要缓存什么（`node_modules` / `go` / `maven` / `npm cache`）？是否需要跨节点缓存（`docker:cache`）？是否需要 `exports` 传参？
7. 发布与手动：是否需要 `docker build & push`、部署、以及 web_trigger 按钮？

## 配置生成/修改流程

### 1) 选用 `.cnb.yml` 结构

- **推荐**：`<branch> -> <event> -> [pipelines]`（最直观）
- **需要跨分支复用**：使用 `imports` 或 YAML 锚点（见 `references/cnb-yml.md`、`references/file-reference.md`）

### 2) 写最小可跑的 pipeline

- pipeline 内 `stages` 默认串行；stage 内 `jobs` 默认并发。
- 同一 `<branch>/<event>` 下多个 pipeline **并发**，并共享相同 docker 环境与 runner（见 `references/cnb-yml.md`）。

### 3) 加入缓存与复用

- 用 `docker.volumes` 缓存目录（copy-on-write，跨 stage 复制；见 `references/cache.md`）。
- 需要跨节点共享时，用 `docker:cache`（见 `references/cache.md`）。

### 4) 补齐触发与手动能力

- 分支匹配用 glob；不匹配时可用 `$` 兜底。
- web_trigger 的 event 为 `web_trigger_<button-id>`（需要 `.cnb/web_trigger.yml`；见 `references/web-trigger.md`）。

### 5) 出问题先按这套排查

- 触发没跑：检查 branch glob、event 名、是否被 `skip-cnb`/`skip-cnb: <stage>` 跳过（见 `references/trigger-rule.md`、`references/recipes.md`）。
- 缓存没命中：确认 `volumes` 挂载路径一致；需要跨节点则改用 `docker:cache`（见 `references/cache.md`）。
- 需要进机排查：按 `login` debug 配置加一段可登录 stage（见 `references/debug.md`）。

## 常见用户请求 → 你应加载的参考

- 只问“怎么写 `.cnb.yml`”：读 `references/cnb-yml.md` 与 `references/docker-and-runner.md`
- 只问“触发规则/事件/分支匹配”：读 `references/trigger-rule.md`
- 只问“env/imports/exports”：读 `references/env.md`
- 只问“缓存/加速”：读 `references/cache.md`
- 只问“手动触发按钮”：读 `references/web-trigger.md`
- 只问“登录调试”：读 `references/debug.md`
- 只问“Monorepo 按需构建 / Docker build&push / 跳过构建 / 超时 / 权限”：读 `references/recipes.md`
