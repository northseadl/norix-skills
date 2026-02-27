# Norix Skills

即插即用的 AI Agent 技能集合。遵循 [SKILL.md 规范](https://skills.norix-dev.com/skills/)，兼容 Gemini Antigravity、OpenAI Codex、Claude 等主流 Agent 框架。

📖 **文档**: [skills.norix-dev.com](https://skills.norix-dev.com)

---

## 技能一览

| 技能 | 版本 | 状态 | 说明 |
|------|------|------|------|
| **[飞书集成](https://skills.norix-dev.com/skills/feishu-integration)** | 0.0.1 | ✅ Stable | 统一 CLI 操作飞书文档、任务、Wiki、多维表格、成员目录。OAuth2 全自动。 |
| **[PM Toolkit](https://skills.norix-dev.com/skills/pm-toolkit)** | 0.0.1 | ✅ Stable | 自然语言 → Mermaid 图表（16 种类型），本地 Web 面板实时预览与导出。 |
| **[Codex 任务编排](https://skills.norix-dev.com/skills/codex-task-orchestration)** | 0.0.1 | 🚧 DEV | 监督式多任务分解与调度，PRD → Codex Agent 原子任务，实时 Dashboard。 |
| **[前端设计规格](https://skills.norix-dev.com/skills/agent-front-design)** | 0.0.1 | 🚧 DEV | 双模式治理（Explore/Production），七维质量评分，输出可实施工程文档。 |
| **ADB MySQL** | 0.1.0 | ✅ Stable | 阿里云 AnalyticDB for MySQL 只读数据分析。多 Profile 连接管理、交叉验证、Schema 文档生成。 |

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
├── feishu-integration/       # 飞书 API CLI（auth/docx/task/wiki/bitable/members）
├── adb-mysql/                # ADB for MySQL 数据分析（query/analyze/schema）
├── pm-toolkit/               # Mermaid 图表引擎 + 原型工具
├── codex-task-orchestration/  # Codex 多任务拆解与执行调度
└── agent-front-design/       # 前端设计规格与质量评分体系
```

每个技能目录包含：
- `SKILL.md` — Agent 读取的技能说明（触发条件、命令列表、使用约束）
- `scripts/` — 实际执行的 CLI 脚本
- `references/` — API 文档与语法参考

## 设计原则

- **最小依赖** — 大部分技能仅依赖 Python 3 标准库（adb-mysql 需 `pip install pymysql`）
- **SKILL.md 驱动** — Agent 通过 SKILL.md 理解能力边界，无需额外配置
- **凭据安全** — 敏感信息存储在 `~/.feishu/` 等用户目录，不进入代码库
- **幂等操作** — 所有命令可安全重复执行

## 许可

MIT
