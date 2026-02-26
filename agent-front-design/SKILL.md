---
name: agent-front-design
version: 0.0.1
description: 面向 React/Vue 的前端卓越设计技能。用于输出高质量、完整、优秀的前端方案级规格，采用双模式治理（Explore/Production）避免设计随机化与质量漂移，产出可实施方案、七维评分、风险缓解与发布建议。
---

# 前端卓越设计技能

## 核心承诺

该技能只服务一件事：稳定输出高质量、完整、优秀的前端方案级规格。

不输出“风格拼贴”式随机设计，不以单纯视觉表达替代可实施方案。

## 工作模式

### 模式 A：`Explore`

用途：创意探索、方向发散、方案对比。

允许：

1. 多方案并行
2. 不同视觉语言尝试
3. 交互假设实验

限制：

1. 不得直接给出“可发布”结论
2. 必须进入 `Production` 才能形成最终交付

### 模式 B：`Production`

用途：收敛为可实施、可验收、可评审的唯一主方案。

强制要求：

1. 输出唯一主方案
2. 备选方案不超过 2 个
3. 必须说明拒绝备选方案的原因
4. 必须执行七维评分与阻断规则

默认策略：若用户未指定模式，先 `Explore` 后自动进入 `Production`。

## 七维质量定义

1. 目标一致性
2. 信息架构完整性
3. 交互完整性
4. 视觉系统一致性
5. 工程可实施性
6. 可访问性与性能
7. 安全与可观测性

详细规则请读取：

- `references/standards/quality-seven-dimensions.md`
- `references/standards/scoring-model.md`

## 输出契约（方案级）

所有交付必须映射到以下模板之一：

1. `DesignGoalSpec` -> `references/templates/design-goal-spec-template.md`
2. `UXArchitectureSpec` -> `references/templates/ux-architecture-spec-template.md`
3. `UIBlueprintSpec` -> `references/templates/ui-blueprint-spec-template.md`
4. `EngineeringHandoffSpec` -> `references/templates/engineering-handoff-template.md`
5. `QualityGateReport` -> `references/templates/quality-gate-report-template.md`
6. `ReleaseDecision` -> `references/templates/release-decision-template.md`

## 反随机化硬约束

最终交付时必须满足：

1. 主方案 1 个，备选方案 <= 2 个
2. 明确写出备选被拒绝原因
3. 给出七维分项分数与总分
4. 包含状态完整性表：`loading/empty/error/success/permission`
5. 包含组件树与状态边界
6. 包含可访问性关键检查点
7. 包含性能预算与监控点
8. 包含风险等级与缓解动作

## 评分与阻断

- 每维 0-4 分，总分折算为 100
- 通过线：>= 85
- 阻断线：任一维 < 2
- 严重级别：`P0/P1/P2/P3`
- 阻断条件：存在 `P0` 或 `P1` 时，不得给出“可发布”

## 使用流程

1. 先读取 `references/index/INDEX.md` 选择分区索引
2. 再读取目标分区索引（`INDEX-*.md`）定位文档
3. 首次加载最多 1 个分区索引
4. 二次加载最多 2 个节点
5. 歧义时最多追加 1 个 `next`

目标：减少上下文污染，提高命中稳定性。

## React/Vue 路由

- React 场景：优先 `references/playbooks/react-handoff-playbook.md`
- Vue 场景：优先 `references/playbooks/vue-handoff-playbook.md`
- 模式执行：
  - `Explore` -> `references/playbooks/explore-mode-playbook.md`
  - `Production` -> `references/playbooks/production-mode-playbook.md`
