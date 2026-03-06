---
name: agent-front-design
metadata:
  version: 0.1.2
description: 'Frontend design blueprints with quality scoring and engineering handoff.

  Anti-AI-aesthetic-homogeneity, Design Token architecture, CSS engineering.

  '
---

# 前端卓越设计技能

## 核心承诺

稳定输出高质量、可实施、避免 AI 审美同质化的前端方案级规格。

不输出"风格拼贴"式随机设计，不输出训练数据的平均审美。

## 首要原则：克制 AI 审美

> AI 生成的 UI 存在严重的审美同质化问题（Indigo Bias）—— 紫蓝渐变、
> glassmorphism、抽象 3D 人物、Inter/Roboto 字体组合。这些元素在 AI 训练数据
> 中过度代表，导致输出趋同。本技能要求**主动抵抗**这种默认倾向。

详细的反 AI 审美协议：`references/philosophy/anti-ai-aesthetic.md`

## 工作模式

### Explore 模式

用途：创意探索、方向发散、方案对比。

执行：
1. 先读取 `references/philosophy/design-principles.md` 锚定设计哲学
2. 生成 2-3 个方向候选，每个必须包含：适配场景、核心交互假设、主要风险
3. 不得给出"可发布"结论

### Production 模式

用途：收敛为可实施、可验收、可评审的唯一主方案。

执行：
1. 从 Explore 结果选择唯一主方案
2. 备选方案不超过 2 个，必须说明拒绝原因
3. 输出完整方案规格（参考 `references/templates/deliverable-templates.md`）
4. 执行七维评分与阻断判定（参考 `references/quality/quality-gate.md`）
5. 输出发布建议与风险缓解动作

默认策略：若用户未指定模式，先 Explore 后自动进入 Production。

## 参考文档路由

根据任务阶段，按需读取以下参考文档：

### 设计哲学（方案启动时必读其一）
- `references/philosophy/design-principles.md` — 设计原则与美学方向
- `references/philosophy/anti-ai-aesthetic.md` — 反 AI 审美协议（色彩、字体、布局）

### 工程实践（视觉/交互定义时按需读取）
- `references/engineering/design-tokens.md` — Design Token 三层架构
- `references/engineering/modern-css.md` — 2026 现代 CSS 技术栈
- `references/engineering/motion-design.md` — 动效与微交互体系

### 设计模式（IA/交互规划时读取）
- `references/patterns/page-archetypes.md` — 页面原型选型
- `references/patterns/interaction-patterns.md` — 交互模式库
- `references/patterns/state-coverage.md` — 状态覆盖规范

### 质量与交付（Production 模式必读）
- `references/quality/quality-gate.md` — 七维评分与阻断模型
- `references/handoff/framework-handoff.md` — React/Vue 工程交接
- `references/templates/deliverable-templates.md` — 输出模板

### 框架路由
- React 场景：优先读取 `references/handoff/framework-handoff.md` 的 React 章节
- Vue 场景：优先读取 `references/handoff/framework-handoff.md` 的 Vue 章节

## 反随机化硬约束

最终交付时必须满足：

1. 主方案 1 个，备选方案 <= 2 个
2. 明确写出备选被拒绝的原因
3. 给出七维分项分数与总分
4. 包含状态完整性表：`loading / empty / error / success / permission`
5. 包含组件树与状态边界
6. 包含可访问性关键检查点
7. 包含性能预算与监控点
8. 包含色彩方案的 AI 审美偏离度说明
