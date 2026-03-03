# Domain — norix-skills 领域知识图谱
> 新开发者读完此文件即可独立工作。只描述当前真相，不记录历史变更。

## 系统架构 (System Architecture)

**仓库定位**: 面向 Agent 的技能集合（SKILL.md + references + scripts）

**技术栈**: Python 3 (stdlib 为主) · Node.js (零/低依赖) · 静态 Web (panel.html)

```
norix-skills/
├── adb-mysql/                  # ADB for MySQL 只读数据分析
├── agent-brainstorm/           # 多 Agent 异步观点碰撞（Codex/Claude 混合引擎）
├── agent-front-design/         # 前端设计方案规格输出
├── agent-swe-team/             # 角色化 SWE 团队协作（Leader → Hub → Roles）
├── agent-task-orchestration/   # 多任务拆解与并行 Agent 调度
├── cnb-cool-integration/       # cnb.cool 云原生构建集成
├── coding-net-integration/     # Coding.net DevOps API 集成
├── es-analytics/               # Elasticsearch / SLS ES 只读分析
├── feishu-integration/         # 飞书 API 集成（task/docx/wiki/bitable/drive）
├── image-studio/               # Nano Banana AI 图像生成与精修
├── llm-agent-dev/              # LLM Agent 工程全栈（设计/仿真/收敛）
├── mobile-testing/             # 移动应用自动化测试与评估
├── pm-toolkit/                 # Mermaid 图表 + 网页原型本地预览面板
├── web-scraper/                # SPA 网页抓取与 Markdown 转换
└── scripts/
    └── sync_global_skills.py   # 全局技能目录同步脚本
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

### 飞书认证流

```
./feishu auth login → OAuth2 → ~/.agents/data/feishu/credentials.json
                   → 业务命令调用时自动解析/刷新 token
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
| PM Toolkit 单文件 server | `serve.js` + `panel.html`，零构建 | 启动快、可移植、Agent 易调用 |
| PM Toolkit 双层缩放 | `fitScale * 0.8 = baseScale`，再 × zoom | 100% 固定为"80% 最佳适配"，语义稳定 |
| PNG 导出双通路 | 正常渲染优先；tainted canvas 时切换 export-safe 重渲染 | 兼容跨域字体/foreignObject 安全限制 |
| 飞书 user_access_token | 默认使用 user 维度 token | 避免 tenant/user 权限语义混淆 |
| 统一数据目录 | 全局凭证 `~/.agents/data/<skill>/`，项目数据保持 cwd | 避免 HOME 碎片化；区分全局/项目上下文 |

## SKILL.md Frontmatter 规范

基于 Anthropic skill-creator 规范，frontmatter 允许字段：
- `name`（必需）— 必须与目录名一致
- `version`（必需）— pre-commit hook 强制 patch 递增
- `description`（必需）— 核心触发机制，**≤ 100 words / ≤ 800 chars**

> description 过长会导致 Codex metadata 加载器过滤技能。压缩策略：核心能力 + 精选 5-8 个触发词，不穷举。

## 设计系统 (Design System)

### PM Toolkit UI Token
- 主题：`data-theme=dark/light`
- 字体：UI=`Inter + JetBrains Mono`；图表=`Caveat + LXGW WenKai`（手绘风）
- 反馈：toast（success/info/error）+ 状态栏
