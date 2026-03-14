# Norix Skills

即插即用的 AI Agent 技能集合，兼容 Gemini Antigravity、OpenAI Codex、Claude Code 等主流 Agent 框架。

---

## 技能一览

> 所有技能均处于活跃开发中，API 和行为可能随版本变更。

| 技能 | 版本 | 说明 |
|------|------|------|
| **飞书集成** | 0.4.1 | 飞书统一 CLI — 任务/文档/Wiki/多维表格/消息/审批/Drive，OAuth2 增量授权。 |
| **ADB MySQL** | 0.1.2 | 阿里云 ADB MySQL 只读分析 — SQL 查询 + 聚合 + 交叉验证 + Schema 文档，多 Profile。 |
| **ES Analytics** | 0.1.2 | ES / SLS 只读分析 — 索引/mapping/聚合/日志搜索/去重提取/采样，多 Profile。 |
| **PM Toolkit** | 0.0.5 | Mermaid 图表（16 种）+ HTML 原型（多设备预览），本地 Web 面板。 |
| **Image Studio** | 0.1.3 | Gemini Image API — 6 种电商模板 + 9 种精修模板 + 图标提取管道。 |
| **Coding.net 集成** | 0.2.2 | Coding.net DevOps — MR/CI/制品库/跨项目查询/远程文件审计。 |
| **CNB Build 集成** | 0.1.1 | cnb.cool 构建 — .cnb.yml 流水线生成，触发/缓存/env/web_trigger。 |
| **Agent 任务编排** | 0.1.8 | Trinity 三层委托（Strategist→Lieutenant→Builder），信号驱动自主循环，Codex/Claude 混合。 |
| **Agent SWE Team** | 0.5.4 | Workshop 工程团队 — Hub 驱动 Leader/Worker×N/Inspector，worktree 隔离 + @mention 唤醒。 |
| **Agent 头脑风暴** | 0.1.3 | 多 Agent 异步讨论空间 — opinion/challenge/build + 收敛检测 + synthesis.md。 |
| **前端设计规格** | 0.2.0 | 审美判断力引擎 — Explore/Production/Critique 三模式，Anti-AI Homogeneity。 |
| **Doc Sentinel** | 0.2.0 | 文档-代码变更通知 — Git tree hash 溯源绑定 + 变更计划 + 幂等执行。 |
| **LLM Agent 开发** | 0.1.2 | Tri-Pillar 协议 — 12 模式矩阵 + 5 份运行时合同 + 数据模拟 + 收敛迭代。 |
| **Mobile Testing** | 0.0.3 | Android/iOS 测试 — 设备管理/应用评估/Maestro E2E/性能/日志/视觉回归。 |
| **Web Scraper** | 0.2.0 | 双引擎抓取（httpx → crawl4ai）— 三级精度 + SPA 渲染 + JS 交互 + OpenAPI。 |

## 安装

```bash
# 通过 skill.sh 生态安装（推荐）
npx skills add northseadl/norix-skills

# 安装单个技能
npx skills add northseadl/norix-skills --skill feishu-integration
```

在 Agent 对话中提及技能关键词即可触发：

```
> 帮我查看飞书上本周未完成的任务
```

## 目录结构

```
norix-skills/
├── adb-mysql/                # ADB MySQL 只读分析
├── agent-brainstorm/         # 多 Agent 异步讨论
├── agent-front-design/       # 前端审美判断力引擎
├── agent-swe-team/           # Workshop 多角色工程团队
├── agent-task-orchestration/  # Trinity 三层任务编排
├── cnb-cool-integration/     # cnb.cool 构建流水线
├── coding-net-integration/   # Coding.net DevOps
├── doc-sentinel/             # 文档-代码变更通知
├── es-analytics/             # ES / SLS 数据分析
├── feishu-integration/       # 飞书 CLI
├── image-studio/             # AI 图片生成与精修
├── llm-agent-dev/            # LLM Agent 工程协议
├── mobile-testing/           # 移动端自动化测试
├── pm-toolkit/               # Mermaid 图表 + 原型
├── web-scraper/              # 双引擎网页抓取
├── scripts/                  # 仓库级工具
```

每个技能目录包含：
- `SKILL.md` — Agent 入口（触发条件、命令、约束）
- `scripts/` — CLI 脚本
- `references/` — API 文档（部分技能）

## 设计原则

- **最小依赖** — 优先标准库，按需 `pip install` / `npm install`
- **SKILL.md 驱动** — Agent 通过 SKILL.md 理解能力边界
- **NX1 凭据加密** — 磁盘从不出现明文密码
- **幂等操作** — 所有命令可安全重复执行
- **技能隔离** — 每个目录完全自洽，零跨目录依赖

## 许可

MIT

