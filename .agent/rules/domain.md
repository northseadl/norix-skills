# Domain — norix-skills 领域知识图谱
> 新开发者读完此文件即可独立工作。只描述当前真相，不记录历史变更。

## 系统架构 (System Architecture)

**仓库定位**: 面向 Agent 的技能集合（SKILL.md + references + scripts）

**技术栈**: Python 3 (stdlib 优先 · PEP 723 inline deps · uv run) · TypeScript (esbuild CJS 单文件打包 · @larksuiteoapi/node-sdk) · Node.js ESM (esbuild 全量打包 · codex-sdk + claude-agent-sdk) · 静态 Web (panel.html/dashboard.html)

```
norix-skills/
├── packages/                   # CLI 源码 + 构建（esbuild 全量打包，产物输出到对应 skill/scripts/）
│   ├── brainstorm-cli/         # agent-brainstorm CLI 源码
│   ├── swe-team-cli/           # agent-swe-team CLI 源码（team + ws + lib/）
│   └── dispatch-cli/           # agent-task-orchestration CLI 源码（dispatch + lib/）
├── data-analytics/             # 统一数据分析技能 (涵盖 ADB MySQL 与 ES 分析)
├── agent-brainstorm/           # 多 Agent 异步观点碰撞（scripts/ 仅含打包产物 + panel.html）
├── agent-front-design/         # 前端审美判断力 + 精工度 + 自我批评循环（v1.0 精简重构）
├── agent-swe-team/             # 角色化 SWE 团队协作（scripts/ 仅含打包产物 + dashboard.html）
├── agent-task-orchestration/   # 编排专用引擎（scripts/ 仅含打包产物 + dashboard.html）
├── feishu-integration/         # 飞书 API 集成 v1.0.0（agent-centric JSON 输出协议 · @larksuiteoapi/node-sdk · esbuild CJS 打包 · 8模块92命令）
├── image-studio/               # Nano Banana AI 图像生成·精修·图标提取（rembg+BiRefNet 去背→检测→裁切）
├── llm-agent-dev/              # LLM Agent 工程全栈（设计/仿真/收敛）
├── pm-toolkit/                 # Mermaid 图表 + 网页原型本地预览面板
├── skill-creator/              # 技能创建/迭代/评估/描述优化（上游 anthropics/skills 同步）
├── web-scraper/                # SPA 网页抓取与 Markdown 转换
└── scripts/
    ├── sync_global_skills.py   # 全局技能目录同步脚本
    └── credential_store.py     # NX1 凭据存储 source of truth（复制到各技能）
├── SPEC.md                     # 技能开发规范 v1
```

## 核心数据流 (Core Data Flows)

### 全局技能同步流

```
sync_global_skills.py --target all --force

扫描仓库（SKILL.md 存在 → 视为技能）
  → 加载 .norix-manifest.json（追踪哪些技能由本仓库管理）
  → 孤儿检测：manifest 中 source_path 不存在 → 删除目标副本（处理删除/重命名）
  → 重命名检测：同一 source_path 不同目录名 → 删旧建新
  → 同步：Antigravity=rsync 全量复制 | Codex=SKILL.md 物化+其他 symlink
  → 持久化 manifest

安全边界：仅操作 manifest 记录的技能，其他来源永不触碰
```

### 飞书数据流 (v1.3.0 vi-Primitives)

```
arch:  scripts/feishu-ts/src/*.ts → esbuild → scripts/feishu-cli.cjs (单文件 4.7MB)
       ./feishu bash wrapper → node scripts/feishu-cli.cjs $@

output: 全命令 JSON Envelope: {ok, data, message, hint} → stdout
        Log.*/.stderr → 诊断信息（agent 不解析）
        SDK loggerLevel: error → 抑制 stdout 噪音

auth (3): setup → login [--all] → status
          token refresh/revoke 由 client.ts autoRefresh() 内部处理

doc primitives (vi-philosophy):
  read   → --raw | --blocks (返回 index/block_id) | 默认 Markdown
  insert → --text | --heading | --code | --file | --markdown | --image | --divider + --index N
  delete → --start N --end M | --block-id X
  create → --file 从 Markdown

modules: auth(3) doc(14) wiki(14) bitable(16) task(17) msg(4) approval(8) member(3) = 79 total

compound: task complete --keyword → 搜索+完成原子化
          msg send --chat-name → 群名解析+发送原子化
          doc search-content --read → 搜索+读取原子化
```

### PM Toolkit 渲染流

```
loadFile → /api/read → mermaid.render → normalizeRenderedSvg(固定内在宽高)
        → fitScale(视口适配) → baseScale = fitScale * 0.8 → finalScale = baseScale × zoom/100
语义：zoom=100 = "80% 填充最佳适配"
```

## 架构决策 (Architecture Decisions)

| 决策 | 说明 | 理由 |
|------|------|------|
| Manifest 追踪同步 | `.norix-manifest.json` 记录 source_path + synced_at | 安全边界：仅管理本仓库来源的技能；支持重命名/删除检测 |
| 双策略同步 | Antigravity=rsync；Codex=SKILL.md 物化 + symlink | Antigravity 不 follow symlink；Codex 需 SKILL.md 为实体文件 |
| SWE Team Workshop 架构 | Hub(HTTP Server) + Board(board.json) + MeetingRoom(meeting.jsonl) + ws.mjs(CLI)；Agent 通过 Codex/Claude SDK 生成；port 文件发现机制 | Supervisor 只需 shell 能力（兼容 Antigravity/Cloud Code）；状态全持久化，Hub 重启可恢复 |
| SWE Team 持久会话模型 | Agent session 跨任务持续（threadId 不清空）；Codex=thread resume；Claude=unstable_v2_createSession/resumeSession | 角色上下文保留在 session 历史中；resume prompt 只需增量信息；消除 Claude 引擎上下文丢失问题 |
| SWE Team worktree 隔离 | 每个 Worker 独立 git worktree + 分支 `team/{runId}/{role}`；`.teamwork.py` 写入 worktree-local exclude | commit-ready/dirty 只反映真实变更；并发场景互不干扰 |
| SWE Team Git 协作纪律 | Worker prompt 注入原子提交约定 + Hub 防御性检查(dirty worktree/ahead count=0)发送告警事件到会议室 | 软约束而非硬阻断：依赖 Agent 自驱；Leader prompt 含合并前审计指引 |
| SWE Team 会议室增量协作 | Hub API 响应附加 `unreadMeetingMessages` 字段；Agent 调用 Hub 工具时被动感知新消息；@mention 无 threadId 时构建完整角色 prompt | 降低消息遗漏率；会议室定位为协作通道（讨论/决策/报告），非日志 |
| PM Toolkit 单文件 server | `serve.py` + `panel.html`，零构建零依赖 | 启动快、可移植、Agent 易调用 |
| PM Toolkit 双层缩放 | `fitScale * 0.8 = baseScale`，再 × zoom | 100% 固定为"80% 最佳适配"，语义稳定 |
| PNG 导出双通路 | 正常渲染优先；tainted canvas 时切换 export-safe 重渲染 | 兼容跨域字体/foreignObject 安全限制 |
| 飞书 user_access_token | 默认使用 user 维度 token | 避免 tenant/user 权限语义混淆 |
| 飞书零环境变量 | 所有凭证从 NX1 vault 读取，`./feishu auth setup` 初始化 | 避免 env var 泄露风险；统一凭证管理入口；API 权限错误时打印管理后台直达链接 |
| 统一数据目录 | 全局凭证 `~/.agents/data/<skill>/`，项目数据保持 cwd | 避免 HOME 碎片化；区分全局/项目上下文 |
| NX1 凭据加密 | PBKDF2-SHA256 流密码 + HMAC + 机器指纹(hostname+MAC+username) 派生密钥 | 零依赖·跨平台·磁盘从不出现明文·Python/TypeScript 跨语言兼容实现 |
| credential_store 分发 | Python: 各技能物理复制 `credential_store.py`；TypeScript: feishu-ts 内置 `credential-store.ts` | 技能目录完全自洽，sync 自动传播 |
| 飞书 SDK 打包策略 | esbuild CJS 全量打包 @larksuiteoapi/node-sdk (含 axios 依赖) | SDK 内部用 CJS require()，ESM 打包会报 Dynamic require 错误；CJS 单文件可直接 node 执行，零运行时依赖 |
| CLI 包提取 | `packages/{brainstorm,swe-team,dispatch}-cli/` 各自独立 package.json + esbuild ESM 打包；在打包时抽取并拷贝 `@anthropic-ai/claude-agent-sdk` 内部的 `cli.js` 至构建目录 | skill 目录纯净（无 node_modules / package.json）；打包产物零运行时依赖，并妥善解决了 Claude SDK 隐式创建子进程导致找不到可执行文件的缺陷 |

## SKILL.md Frontmatter 规范

基于 Anthropic skill-creator 规范，frontmatter 合法顶层字段：
- `name`（必需）— 必须与目录名一致
- `description`（必需）— 核心触发机制，**≤ 60 words / ≤ 500 chars**
- `metadata.version`（必需）— pre-commit hook 强制 patch 递增，位于 `metadata:` 下

> **禁止 `Triggers:` 独立行** — 触发语义自然内嵌到描述散文中。
> description 是所有技能共享的 always-loaded 上下文，每个多余 word 都在消耗公共资源。
>
> **完整设计原则见 `.agent/AGENTS.md` § SKILL.md 设计原则** — 覆盖渐进式加载三层架构、Agent-First 视角、Description 触发策略、指令风格。

### 版本号提升策略
- **patch** (0.1.x): Agent 自主执行，hook 自动处理
- **minor** (0.x.0): Agent 可自主决定，需在 commit message 说明理由
- **major** (x.0.0): pre-commit hook 会阻断。Agent **必须停止操作并报告用户**，由用户决定是否执行

## 设计系统 (Design System)

### PM Toolkit UI Token
- 主题：`data-theme=dark/light`
- 字体：UI=`Inter + JetBrains Mono`；图表=`Caveat + LXGW WenKai`（手绘风）
- 反馈：toast（success/info/error）+ 状态栏
