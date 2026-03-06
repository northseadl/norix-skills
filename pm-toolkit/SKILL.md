---
name: pm-toolkit
metadata:
  version: 0.0.5
description: '自然语言 → Mermaid 图表（16 种）+ 网页原型，本地 Web 面板实时预览/导出。

  '
---

# PM Toolkit — Mermaid 图表引擎

将用户的自然语言描述转换为 Mermaid 语法图表，通过本地 Web 面板实时渲染预览。

## 架构

- **渲染**: Mermaid.js v11（CDN 加载，浏览器端纯 JS 渲染，~30ms）
- **服务器**: Python 标准库 HTTP 服务（`scripts/serve.py`，零外部依赖）
- **面板**: 自包含 HTML（`scripts/panel.html`，刷新/编辑/保存/导出/主题切换）

## 工作流

### 1. 确定图表类型

| 用户意图 | Mermaid 关键字 |
|---------|---------------|
| 业务流程、审批流 | `flowchart LR/TB` |
| API 调用、系统交互 | `sequenceDiagram` |
| 数据库设计 | `erDiagram` |
| 类关系、继承 | `classDiagram` |
| 状态转换 | `stateDiagram-v2` |
| 项目计划 | `gantt` |
| 占比分布 | `pie` |
| 层级关系 | `mindmap` |
| 里程碑 | `timeline` |
| 分支管理 | `gitGraph` |
| 用户体验、满意度评估 | `journey` |
| 需求优先级、竞品定位 | `quadrantChart` |
| 趋势分析、数据对比 | `xychart-beta` |
| 用户漏斗、流量分布 | `sankey-beta` |
| 系统模块划分、信息架构 | `block-beta` |
| 系统架构概览、技术评审 | `C4Context` / `C4Container` |

### 2. 生成 Mermaid 代码

生成前读取 `references/mermaid-syntax.md` 获取语法速查。

将代码写入 `.mmd` 文件：

- **命名**: `<描述性名称>.mmd`（如 `user-registration-flow.mmd`）
- **位置**: 当前项目根目录下 `.pm-toolkit/` 目录
- **风格**: 中文标签 + 英文 ID，用 `subgraph` 组织层次，为连接添加标签

### 3. 启动预览

```bash
python3 <SKILLS_DIR>/pm-toolkit/scripts/serve.py --file <文件路径.mmd>
open http://localhost:9876
```

面板操作：
- **⟳ 刷新** — 重新读取文件内容并渲染
- **✎ 编辑** — 打开内联编辑器，修改后点"保存"写回文件
- **↓ SVG / ↓ PNG** — 导出当前图表
- **复制源码** — 复制 Mermaid 代码
- **◐** — 深色/浅色主题切换

### 4. 迭代

用户提出修改时，直接编辑 `.mmd` 文件，在面板点"刷新"查看。

## 错误处理

| 场景 | 处理 |
|------|------|
| Mermaid 语法错误 | 面板显示错误详情 |
| CDN 加载失败 | 检查网络连接 |
| 端口占用 | `--port 9877` 指定其他端口 |

---

## 原型工具 (Prototype Preview)

Agent 生成完整 HTML 页面，通过设备框架预览。工具只是容器。

### 工作流

#### 1. 生成 HTML 页面

生成前读取 `references/prototype-style.md` 获取设计规范。

将页面写入 HTML 文件：

- **位置**: 当前项目根目录下 `.pm-toolkit/prototype/`
- **命名**: `<描述性名称>.html`（如 `login.html`、`user-profile.html`）
- **内容**: 完整 HTML 文档，独立 CSS 样式，无外部依赖（字体除外）
- **viewport**: `<meta name="viewport" content="width=375">` (mobile) 或 `width=768` (pad) 或不设 (pc)

#### 2. 启动预览

```bash
python3 <SKILLS_DIR>/pm-toolkit/scripts/proto_serve.py --dir <项目路径/.pm-toolkit/prototype/>
open http://localhost:9877
```

面板操作：
- **← →** — 翻页浏览（键盘左右箭头也可）
- **Refresh** — 重新加载文件
- **PC / Pad / Mobile** — 切换设备框架
- **Export ZIP** — 打包导出所有 HTML
- **◐** — 深色/浅色主题切换

#### 3. 迭代

用户提出修改时，Agent 直接编辑 HTML 文件，面板点 Refresh 查看。
