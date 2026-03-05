# Norix Skills

即插即用的 AI Agent 技能集合。遵循 [SKILL.md 规范](https://skills.norix-dev.com/skills/)，兼容 Gemini Antigravity、OpenAI Codex、Claude 等主流 Agent 框架。

📖 **文档**: [skills.norix-dev.com](https://skills.norix-dev.com)

---

## 技能一览

| 技能 | 版本 | 状态 | 说明 |
|------|------|------|------|
| **[飞书集成](https://skills.norix-dev.com/skills/feishu-integration)** | 0.1.2 | ✅ Stable | 统一 CLI 操作飞书文档、任务、Wiki、多维表格、成员目录。OAuth2 全自动。 |
| **[ADB MySQL](https://skills.norix-dev.com/skills/adb-mysql)** | 0.1.1 | ✅ Stable | 阿里云 AnalyticDB for MySQL 只读数据分析。多 Profile、交叉验证、Schema 文档。 |
| **[ES Analytics](https://skills.norix-dev.com/skills/es-analytics)** | 0.1.1 | ✅ Stable | Elasticsearch / 阿里云 SLS ES 兼容层只读数据分析。多 Profile、聚合统计。 |
| **[PM Toolkit](https://skills.norix-dev.com/skills/pm-toolkit)** | 0.0.2 | ✅ Stable | 自然语言 → Mermaid 图表（16 种类型），本地 Web 面板实时预览与导出。 |
| **[Image Studio](https://skills.norix-dev.com/skills/image-studio)** | 0.1.1 | ✅ Stable | AI 图片生成与精修（电商模板 + 背景替换/增强/风格迁移），Nano Banana API。 |
| **[Coding.net 集成](https://skills.norix-dev.com/skills/coding-net)** | 0.2.1 | 🚧 DEV | Coding.net DevOps 平台 — MR/CI/制品库自动化。 |
| **[CNB Build 集成](https://skills.norix-dev.com/skills/cnb-cool-integration)** | 0.1.1 | 🚧 DEV | cnb.cool 云原生构建流水线配置生成与优化。 |
| **[Agent 任务编排](https://skills.norix-dev.com/skills/task-orchestration)** | 0.1.1 | 🚧 DEV | 监督式多任务分解与调度，支持 Codex / Claude Code 混合引擎，实时 Dashboard。 |
| **[Agent SWE Team](https://skills.norix-dev.com/skills/agent-swe-team)** | 0.1.3 | 🚧 DEV | Leader + 多角色团队协作（git worktree 隔离 + 本地 Hub + BLOCKED→reply 回路）。 |
| **[Agent 头脑风暴](https://skills.norix-dev.com/skills/agent-brainstorm)** | 0.0.2 | 🚧 DEV | 多 Agent 异步观点碰撞空间，支持 Codex / Claude Code 混合引擎。 |
| **[前端设计规格](https://skills.norix-dev.com/skills/agent-front-design)** | 0.1.1 | 🚧 DEV | 双模式治理（Explore/Production），七维质量评分，输出可实施工程文档。 |
| **[LLM Agent 开发](https://skills.norix-dev.com/skills/llm-agent-dev)** | 0.1.1 | 🚧 DEV | Agent 架构设计协议：模式选型、运行时契约、安全护栏、评估闭环。 |
| **[Mobile Testing](https://skills.norix-dev.com/skills/mobile-testing)** | 0.0.2 | 🚧 DEV | Android/iOS 自动化测试与评估，性能 Profiling，Maestro E2E 编排。 |
| **[Web Scraper](https://skills.norix-dev.com/skills/web-scraper)** | 0.0.4 | 🚧 DEV | 双引擎网页抓取（HTTP/Playwright），SPA 渲染，批量文档站采集。 |


## 快速开始

```bash
# 一键安装所有技能
npx skills add northseadl/norix-skills

# 或安装单个技能
npx skills add northseadl/norix-skills/feishu-integration
```

安装后，在 Agent 对话的**第一条消息**中提及技能名称即可激活：

```
> 使用飞书集成技能，帮我查看本周未完成的任务
```

## 目录结构

```
norix-skills/
├── adb-mysql/                # ADB for MySQL 数据分析（query/analyze/schema）
├── agent-brainstorm/         # Agent 头脑风暴 — 多 Agent 异步讨论
├── agent-front-design/       # 前端设计规格与质量评分体系
├── agent-swe-team/           # Agent SWE Team — 多角色团队协作
├── agent-task-orchestration/  # Agent 任务编排 — Codex / Claude Code 混合调度
├── cnb-cool-integration/     # CNB Build 云原生构建流水线
├── coding-net-integration/   # Coding.net DevOps 集成
├── es-analytics/             # Elasticsearch / SLS 数据分析
├── feishu-integration/       # 飞书 API CLI（auth/docx/task/wiki/bitable/members）
├── image-studio/             # AI 图片生成与精修（Nano Banana API）
├── llm-agent-dev/            # LLM Agent 设计与开发（模式选型/评估闭环）
├── mobile-testing/           # Android/iOS 自动化测试与评估
├── pm-toolkit/               # Mermaid 图表引擎 + 原型工具
├── web-scraper/              # 双引擎网页抓取与文档站采集
```

每个技能目录包含：
- `SKILL.md` — Agent 读取的技能说明（触发条件、命令列表、使用约束）
- `scripts/` — 实际执行的 CLI 脚本
- `references/` — API 文档与语法参考（部分技能）

## 设计原则

- **最小依赖** — 大部分技能仅依赖运行时标准库（个别需 `pip install pymysql` 或 `npm install`）
- **SKILL.md 驱动** — Agent 通过 SKILL.md 理解能力边界，无需额外配置
- **凭据安全** — 敏感信息存储在用户目录，不进入代码库
- **幂等操作** — 所有命令可安全重复执行

## 许可

MIT
