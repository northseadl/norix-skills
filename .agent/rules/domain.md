# Domain — norix-skills 领域知识图谱
> 新开发者读完此文件即可独立工作。只描述当前真相，不记录历史变更。

## 系统架构 (System Architecture)

**仓库定位**: 面向 Agent 的技能集合（SKILL.md + references + scripts）

**技术栈**:
- Python 3（feishu-integration，stdlib 为主）
- Node.js（pm-toolkit 与任务编排脚本，零/低依赖）
- 静态 Web（panel.html + Mermaid CDN）

```
norix-skills/
├── pm-toolkit/                 # Mermaid 图表生成与本地预览面板
│   ├── scripts/serve.js        # 单文件 HTTP server（/api/read, /api/write）
│   └── scripts/panel.html      # 预览/编辑/刷新/复制/SVG-PNG 导出
├── feishu-integration/         # 飞书 API CLI 集成（auth/docx/task/wiki/bitable/members）
├── agent-task-orchestration/   # Codex 多任务拆解与执行调度工具链
├── agent-front-design/         # 前端设计与 agent 规范技能
└── system-dev-workflow/        # 系统化开发流程（Magic + First + COT + Clean）
```

### PM Toolkit 子架构

```
用户操作 (刷新/编辑/导出/复制)
        ↓
panel.html (状态机 + Mermaid 渲染 + 缩放)
        ↓ HTTP
serve.js (/api/read /api/write, no-store)
        ↓
目标 .mmd 文件（单文件读写）
```

## 核心数据流 (Core Data Flows)

### 1) PM Toolkit 渲染与缩放流

```
loadFile() → /api/read → source
         → mermaid.render(source) → svg
         → normalizeRenderedSvg(svg) 固定内在宽高（去除 width=100% 带来的容器耦合）
         → measureSvg(svg) → fitScale(视口适配)
         → baseScale = fitScale * 0.8
         → finalScale = baseScale * zoom/100

语义约束：zoom=100 永远代表“当前视口 80% 填充的最佳适配比例”
```

### 2) PM Toolkit 编辑保存流

```
编辑器修改源码 → /api/write {source}
            → 文件落盘
            → render(source) 立即重绘
            → 状态栏 + toast 反馈
```

### 3) PM Toolkit PNG 导出流

```
curSvg → canvas rasterize
      → 若触发 tainted canvas
      → 兼容路径：exportSafe mermaid config 重新渲染 → 再次 rasterize
```

### 4) 飞书认证主流

```
./feishu auth login → OAuth2 → ~/.agents/data/feishu/credentials.json
                   → 业务命令调用时解析/刷新 token
```

## 架构决策 (Architecture Decisions)

| 决策 | 说明 | 理由 |
|------|------|------|
| PM Toolkit 单文件 server | `serve.js` + `panel.html`，零构建步骤 | 启动快、可移植、Agent 易调用 |
| `no-store` 读写接口 | 读写接口与页面响应禁用缓存 | 刷新必须反映磁盘最新状态 |
| SVG 内在尺寸归一化 | 渲染后将 SVG 固定为 intrinsic `width/height` 像素值 | 避免 Mermaid 默认 `width=100%` 导致缩放基准被容器污染 |
| 双层缩放模型 | `fitScale * 0.8 = baseScale`，最终缩放为 `baseScale × zoom` | 保证 100% 固定为“80% 填充最佳适配”，缩放语义稳定 |
| PNG 导出双通路 | 先用当前渲染导出；若遇 tainted canvas，自动切换 export-safe 配置重渲染后导出 | 兼容跨域字体/foreignObject 导致的浏览器安全限制 |
| 导出走内存 SVG 源 | SVG/PNG 基于当前渲染结果导出 | 避免二次解析文件造成不一致 |
| 复制支持回退策略 | Clipboard API 不可用时退回 `execCommand` | 提升不同浏览器环境可用性 |
| 手绘渲染与 UI 解耦 | Mermaid `look=handDrawn` + 图表字体栈手绘；UI 保持默认系统字体 | 保证图形表达风格，同时不牺牲面板控件可读性 |
| 飞书 token 使用 user 维度 | 默认使用 user_access_token 语义 | 避免 tenant/user 权限语义混淆 |
| 全局流程技能标准化 | `system-dev-workflow` 将 Antigravity 的 `magic/first-plan/cot-plan/clean-refactor` 归一为 M-F-C-B-L-V 阶段模型 | 让复杂开发任务具备统一输入模板、决策门禁与验收闭环 |
| 统一数据目录 | 全局凭证/配置统一存储于 `~/.agents/data/<skill>/`，项目级数据保持 `{cwd}` 相对路径 | 避免 HOME 目录碎片化污染；区分全局数据与项目上下文数据 |

## 设计系统 (Design System)

### PM Toolkit UI Token
- 主题：`data-theme=dark/light`
- 字体：UI=`Inter + JetBrains Mono`；Mermaid 图表=`Caveat + LXGW WenKai`
- 视觉语言：现代中性面板 + 手绘图形（仅图表）
- 反馈机制：toast（success/info/error）+ 状态栏文本

### PM Toolkit 交互约束
- 首次加载/手动刷新：重新计算最佳适配基准，100% 对齐“80% 填充”的最佳比例
- 视口变化（窗口 resize/编辑器开合）：保留用户 zoom 百分比，仅重算 `baseScale`
- 导出与复制：无可用图表或源码时必须给出显式错误提示
