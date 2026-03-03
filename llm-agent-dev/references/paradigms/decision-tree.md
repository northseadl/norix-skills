# 模式决策树 (Pattern Decision Tree)

> 确定性规则驱动的 Agent 模式选择

## 主决策树

```
你的场景是什么？
│
├─ 1. 延迟预算?
│   ├─ < 500ms → ① CREX (+ 缓存)
│   ├─ < 2s    → ①② + ③ Function Calling
│   ├─ < 5s    → ④⑨⑩ (Workflow/Chain/Parallel)
│   ├─ < 15s   → ⑤⑪ (ReAct/Orchestrator)
│   └─ > 15s   → ⑫ Evaluator-Optimizer (或异步)
│
├─ 2. 步骤是否可预定义?
│   ├─ 固定线性 → ⑨ Prompt Chaining
│   ├─ 固定有分支 → ④ Workflow Agent
│   ├─ 动态不可预测 → ⑪ Orchestrator-Worker
│   └─ 需要推理探索 → ⑤ ReAct
│
├─ 3. 子任务是否可并行?
│   ├─ 是 → ⑩ Parallelizing
│   └─ 否 → ⑨ Prompt Chaining
│
├─ 4. 输出质量要求?
│   ├─ 需要迭代到极致 → ⑫ Evaluator-Optimizer
│   ├─ 一次性生成够用 → ③ Function Calling
│   └─ 确定性回复 → ① CREX
│
├─ 5. 涉及多个领域?
│   ├─ 是 → ⑥ Router-Expert
│   └─ 否 → 按其他规则选取
│
├─ 6. 需要人工介入?
│   ├─ 是 → ④ Workflow + HITL 节点 + ⑧ Handoff
│   └─ 否 → 按其他规则选取
│
└─ 7. 需要外部知识?
    ├─ 是 → Agentic RAG (⑤ ReAct + 检索工具)
    └─ 否 → 按其他规则选取
```

## 模式组合推荐

### 入门级 (MVP)

```
① CREX + ② Slot Filling
覆盖: FAQ + 信息收集
延迟: < 1s
适合: 90% 的轻量客服场景
```

### 进阶级

```
① CREX + ② Slot + ③ Function Calling
覆盖: FAQ + 信息收集 + 动态工具调用
延迟: < 2s
适合: 需要查数据库/调API的场景
```

### 企业级

```
⑥ Router-Expert (入口)
├─ 领域A → ① CREX + ② Slot
├─ 领域B → ④ Workflow + ⑧ Handoff
├─ 领域C → ③ FC + ⑫ Eval-Opt
└─ 复杂问题 → ⑤ ReAct (异步)
```

### 内容生成

```
⑨ Prompt Chaining (主流程)
├─ 步骤1: 研究/检索 (+ RAG)
├─ 步骤2: 大纲生成
├─ 步骤3: 内容生成
└─ 步骤4: ⑫ Evaluator-Optimizer (质量迭代)
```

### 全自主 Agent

```
⑪ Orchestrator-Worker (顶层)
├─ Worker: ⑤ ReAct (推理型子任务)
├─ Worker: ③ FC (工具调用型子任务)
├─ Worker: ⑩ Parallel (可并行子任务)
└─ ⑧ Handoff (遇阻升级)
```

## 反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| 万物 ReAct | 延迟高、不可控 | 简单任务用 CREX |
| 万物 Multi-Agent | 成本爆炸 | 单 Agent 优先 |
| 无 Guardrail | 安全风险 | 每个模式都加 Guardrail |
| 全量工具注入 | LLM 选择准确率下降 | 按意图动态注入 |
| 无评估先上线 | 质量不可控 | Pillar II/III 先行 |
