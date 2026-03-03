---
name: llm-agent-dev
version: 0.1.1
description: |
  Full-stack LLM Agent engineering — architecture to production.
  Three pillars: Design Paradigms (12-mode pattern matrix), Data Simulation, Convergence Iteration.
  Use for: agent architecture, chatbot design, intent routing, function calling, workflow agents,
  ReAct, MCP protocol, prompt chaining, context engineering, guardrails, LLM evaluation,
  memory architecture, RAG, observability, synthetic data generation, convergence testing.
  Triggers: "Agent开发", "意图识别", "Function Calling", "MCP协议", "设计一个Agent".
  NOT for: autonomous coding workflows, multi-agent brainstorming, task decomposition.
---

# LLM Agent 全栈工程技能 — Tri-Pillar Protocol v3

> 三支柱: **设计范式** · **数据模拟** · **收敛迭代**
> 目标: 在任意场景下产出业界一流的 Agent 系统

---

## 0) Scope and Boundaries

### In scope

- Agent 架构模式选择与组合（12 种模式）
- 意图、对话、上下文工程
- 工具/MCP 集成设计
- Guardrails、安全、HITL
- 记忆/RAG 架构
- 可观测性与追踪
- **性能评估**（模型基线 TTFT/TPS + Agent 管道延迟剖析）
- 评估策略与质量门禁
- **合成数据生成**（Agent 自主调 LLM API 批量生成）
- **收敛迭代优化**（多版本竞争 + LLM-as-Judge 择优）

### Out of scope

- 仓库分支治理 / CI/CD 平台策略
- 自主编码编排协议
- 多 Agent 头脑风暴辩论

---

## 1) Working Mode — Five Phases

触发后按序执行以下五个阶段。每个阶段有明确的输入/输出契约。

### Phase A — 战略锚定 (Strategic Framing)

提取最小决策上下文:

| 维度 | 问题 | 默认假设 |
|------|------|---------|
| 业务目标 | 转化率/自助率/效率/合规? | 自助率 |
| 用户通道 | H5/App/Native/API? | H5 |
| 延迟预算 | P95 上限? | 2s |
| 风险容忍 | 是否允许 LLM 自由发挥? | 保守 |
| 工具边界 | 可用 API/数据? | 需明确 |
| 评估基线 | 现有指标/数据? | 无 |

关键输入缺失时声明假设并标注。

### Phase B — 模式选择 (Pattern Stack Selection)

从 12 模式矩阵中选择模式栈（非单一标签），产出:
- 推荐栈 + 理由
- 被拒替代方案 + 理由
- 模式组合拓扑

加载对应模式参考:
- 模式矩阵: `references/paradigms/pattern-matrix.md`
- 决策树: `references/paradigms/decision-tree.md`
- 独立模式: `references/patterns/{nn}-{name}.md`

### Phase C — 实现合同 (Implementation Contracts)

产出五份合同（可交付给工程团队）:

1. **Intent Contract** — 意图注册表 + 参数定义
2. **State Contract** — 会话状态 + 记忆模型
3. **Tool Contract** — 工具/MCP 定义 + 调用约束
4. **Guardrail Contract** — 5 层安全架构
5. **Handoff Contract** — 升级/委托触发条件

横切面参考按需加载:
- `references/paradigms/context-engineering.md`
- `references/paradigms/prompt-patterns.md`
- `references/paradigms/memory-architecture.md`
- `references/paradigms/tool-design.md`
- `references/paradigms/safety-guardrails.md`
- `references/paradigms/observability.md`
- `references/paradigms/performance-benchmarking.md`

### Phase D — 评估与数据 (Evaluation & Data)

产出评估计划 + 数据生成策略:

1. **评估计划**
   - 离线测试集分类与覆盖目标
   - 在线 KPI 定义
   - 质量门禁阈值
   - 回滚条件

2. **性能评估计划**（详见 performance-benchmarking.md）
   - Layer 1: 模型基线（TTFT/TPS/缓存/上下文长度）
   - Layer 2: Agent 管道逐环节延迟剖析
   - 性能 SLO 与回归门禁

3. **数据模拟生成**（Pillar II — 详见 §3）
   - 合成数据集生成策略
   - 分维度 LLM 批量生成
   - 质量验证标准

评估参考:
- `references/eval-loop.md`
- `references/simulation/data-generation.md`

### Phase E — 收敛迭代 (Convergence Iteration)

产出迭代优化策略（Pillar III — 详见 §4）:

1. **版本竞争方案** — 多版本 prompt/架构并行测试
2. **判定标准** — LLM-as-Judge 评分维度与权重
3. **收敛规则** — 何时停止迭代、择优逻辑
4. **执行计划** — Agent 自主串行/并行调 LLM API 执行

收敛参考:
- `references/convergence/iteration-protocol.md`

---

## 2) Pattern Matrix — 12 Agent Modes

| # | Pattern | Latency | Predictability | Best For | Reference |
|---|---------|------:|---:|---|---|
| ① | CREX Rule Router | 50-500ms | ★★★★★ | FAQ, query, navigation | `patterns/01-crex-rule-router.md` |
| ② | Slot Filling | 100-800ms | ★★★★☆ | ordering, booking, forms | `patterns/02-slot-filling.md` |
| ③ | Function Calling | 500-2s | ★★★★☆ | stable API tool use | `patterns/03-function-calling.md` |
| ④ | Workflow Agent | 1-5s | ★★★★☆ | deterministic multi-step | `patterns/04-workflow-agent.md` |
| ⑤ | ReAct | 3-15s | ★★☆☆☆ | exploration/reasoning | `patterns/05-react-agent.md` |
| ⑥ | Router-Expert | 500ms-3s | ★★★☆☆ | multi-domain systems | `patterns/06-router-expert.md` |
| ⑦ | MCP Tool Protocol | varies | ★★★★☆ | scalable tool ecosystems | `patterns/07-mcp-tool-protocol.md` |
| ⑧ | Handoff/Delegation | varies | ★★★☆☆ | agent-to-agent/human | `patterns/08-handoff-delegation.md` |
| ⑨ | Prompt Chaining | 1-5s | ★★★★★ | sequential decomposition | `patterns/09-prompt-chaining.md` |
| ⑩ | Parallelizing | 500ms-3s | ★★★★☆ | concurrent sub-tasks | `patterns/10-parallelizing.md` |
| ⑪ | Orchestrator-Worker | 2-10s | ★★★☆☆ | dynamic task delegation | `patterns/11-orchestrator-worker.md` |
| ⑫ | Evaluator-Optimizer | 5-30s | ★★★★☆ | iterative refinement | `patterns/12-evaluator-optimizer.md` |

### Selection Rules (Deterministic)

1. 延迟 < 1s → 优先 ①② + 缓存，禁用 ⑤⑪⑫
2. 步骤固定 → ④ Workflow 或 ⑨ Prompt Chaining
3. 步骤动态 → ⑤ ReAct 或 ⑪ Orchestrator-Worker
4. 输出需要质量迭代 → ⑫ Evaluator-Optimizer
5. 多领域意图歧义 → ⑥ Router-Expert + ⑧ Handoff
6. 可并行子任务 → ⑩ Parallelizing
7. 仅当单 Agent 无法满足成本/延迟 → 多 Agent (⑥⑧⑪)
8. 需要外部知识 → Agentic RAG (⑤ + 检索工具)

---

## 3) Pillar II — 数据模拟生成

> 目的: 通过 LLM API 批量调用自动生成高质量评估数据集

### 触发条件

当 Agent 设计完成但缺少评估数据时，主动触发数据模拟生成。

### 工作流

```
┌─────────────────────────────────────────────────────────────┐
│                  数据模拟生成 Pipeline                        │
│                                                              │
│  Agent 设计合同 (Phase C)                                    │
│       │                                                      │
│       ▼                                                      │
│  [生成 Task Specs] ← 按维度拆分:                             │
│       │                                                      │
│       ├── T1: happy_path (正常路径, 60%)                     │
│       ├── T2: edge_case (边界情况, 20%)                      │
│       ├── T3: adversarial (对抗测试, 10%)                    │
│       ├── T4: multi_turn (多轮对话, 10%)                     │
│       └── T5: i18n_variant (语言变体, 可选)                   │
│       │                                                      │
│       ▼                                                      │
│  [Agent 自主并行调 LLM API] → 分维度批量生成                  │
│       │                                                      │
│       ▼                                                      │
│  [汇总] → [去重] → [质量检查 LLM-as-Judge] → 数据集         │
└─────────────────────────────────────────────────────────────┘
```

### Task Spec 模板

每个数据生成任务的 Task Spec 格式:

```markdown
## T{N} · {dimension} 数据生成

- **Engine**: codex 或 claude
- **范围**: 生成 {count} 条评估用例
- **输入**:
  - Agent 意图注册表 (IntentSchema)
  - SkillResponse 协议定义
  - 场景上下文描述
- **交付物**: `eval/generated/{dimension}.json`
- **格式**: EvalCase[] (见 eval-loop.md §评估数据集)
- **质量要求**:
  - [ ] 每条用例有唯一 id
  - [ ] input 真实自然（含口语化/错别字/方言变体）
  - [ ] expected 字段完整（intent + params + responseType）
  - [ ] 无重复/高度相似用例
  - [ ] adversarial 类必须包含注入攻击变体
- **依赖**: 无
- **预估**: S (< 30min)
```

### 数据质量验证

生成后使用强模型进行质量检查:

```typescript
interface DataQualityCheck {
  uniqueness: number;      // 去重后保留比例 ≥ 90%
  naturalness: number;     // LLM 评分 ≥ 4.0/5.0
  completeness: number;    // 字段完整率 100%
  diversity: number;       // 意图覆盖率 ≥ 95%
  adversarialRigor: number; // 对抗强度 ≥ 3.5/5.0
}
```

### 执行方式

Agent 自主执行数据生成（技能内自洽，不依赖外部技能）:

1. **串行方式**: Agent 逐个维度调用 LLM API 生成数据，每完成一个维度做质量检查
2. **并行方式**: Agent 用 `Promise.all` 并发调多个 LLM API 请求，按维度分组生成
3. **分批方式**: 大量数据拆分为多批次，避免 rate limit

```typescript
// Agent 自主执行数据生成的伪代码
const dimensions = ['happy_path', 'edge_case', 'adversarial', 'multi_turn'];
const results = await Promise.all(
  dimensions.map(dim => generateEvalData(dim, intentSchema, agentContext))
);
const merged = deduplicateAndValidate(results.flat());
await writeFile('eval/dataset.json', JSON.stringify(merged, null, 2));
```

---

## 4) Pillar III — 收敛迭代

> 目的: 通过多版本并行测试 + LLM-as-Judge 评估实现 Prompt/架构的自动择优收敛

### 触发条件

当存在以下情况时触发:
- 多个候选 System Prompt 需要择优
- 多种模式组合需要对比
- Prompt 迭代需要量化验证
- 新版本上线前需要回归对比

### 工作流

```
┌─────────────────────────────────────────────────────────────┐
│                  收敛迭代 Pipeline                            │
│                                                              │
│  候选版本集合 (V1, V2, V3, ...)                              │
│       │                                                      │
│       ▼                                                      │
│  [生成 Task Specs] ← 每个版本一个测试任务:                    │
│       │                                                      │
│       ├── T1: V1 → 跑全量 eval 数据集 → 输出评分             │
│       ├── T2: V2 → 跑全量 eval 数据集 → 输出评分             │
│       └── T3: V3 → 跑全量 eval 数据集 → 输出评分             │
│       │                                                      │
│       ▼                                                      │
│  [Agent 自主并行运行各版本测试] → 收集评分                    │
│       │                                                      │
│       ▼                                                      │
│  [收集评分结果]                                               │
│       │                                                      │
│       ▼                                                      │
│  [LLM-as-Judge 跨版本比较]                                   │
│       │                                                      │
│       ├── 明确胜出 → 选择最优 → 更新 baseline                │
│       ├── 差异不显著 → 选择成本/延迟更优的                    │
│       └── 全部不达标 → 诊断 → 生成新候选 → 下一轮            │
│       │                                                      │
│       ▼                                                      │
│  [收敛判定] → 最优版本 + 分析报告                            │
└─────────────────────────────────────────────────────────────┘
```

### 版本竞争 Task Spec 模板

```markdown
## T{N} · V{M} 收敛测试

- **Engine**: codex 或 claude（推荐使用高智能模型做评估）
- **范围**: 对版本 V{M} 运行完整评估数据集
- **输入**:
  - V{M} 的 System Prompt / 配置
  - Agent 完整代码（或可运行的分支/commit）
  - 评估数据集 `eval/dataset.json`
- **交付物**: `convergence/results/v{M}-scores.json`
- **评估执行**:
  - Layer 1: 确定性断言（意图准确率等）
  - Layer 2: LLM-as-Judge 多维评分
  - Layer 3: 端到端多轮对话评估（如适用）
- **验收**:
  - [ ] 所有 eval case 有评分结果
  - [ ] 输出格式符合 ConvergenceResult schema
  - [ ] 包含分维度明细 + 总分
- **依赖**: 评估数据集存在
- **预估**: M (30-60min)
```

### 收敛判定规则

```typescript
interface ConvergenceDecision {
  // 评分维度与权重
  dimensions: {
    intentAccuracy: { weight: 0.30, threshold: 0.95 };
    paramExtraction: { weight: 0.15, threshold: 0.90 };
    responseQuality: { weight: 0.25, threshold: 4.0 };
    safety: { weight: 0.15, threshold: 4.5 };
    latency: { weight: 0.15, threshold: 2000 };
  };

  // 收敛条件
  convergenceCriteria: {
    minVersions: 2;              // 至少 2 个版本参与比较
    significanceThreshold: 0.05; // 版本间差异 > 5% 才认为显著
    maxIterations: 5;            // 最多迭代 5 轮
    regressionBuffer: 0.02;      // 允许 2% 的指标波动
  };
}
```

### 跨版本比较 Prompt

```
你是 Agent 系统评估专家。现在有 {N} 个版本的测试结果，请进行跨版本比较。

## 版本评分
{{#each versions}}
### V{{this.id}}
- 意图准确率: {{this.intentAccuracy}}
- 参数提取率: {{this.paramExtraction}}
- 回复质量均分: {{this.responseQuality}}
- 安全性均分: {{this.safety}}
- P95 延迟: {{this.latency}}ms
- 总分: {{this.overall}}
{{/each}}

## 评判标准
1. 加权总分最高的版本为初步推荐
2. 如果总分差异 < 5%，推荐延迟/成本更低的版本
3. 安全性得分低于 4.5 的版本一票否决
4. 意图准确率低于 95% 的版本一票否决

## 输出格式（仅 JSON）
{
  "winner": "V{id}",
  "confidence": 0.92,
  "reasoning": "V2 在意图准确率和回复质量上显著优于其他版本...",
  "improvements": ["V2 的退款意图识别仍有 3% 误分类，建议增加训练样例"],
  "shouldContinue": false,
  "nextAction": "deploy" | "iterate" | "manual_review"
}
```

---

## 5) Output Contract

每次响应生成必须包含以下段落：

### A. Recommended Stack
- 主模式栈（有序）
- 适配理由 + 约束匹配
- 被拒替代方案

### B. Runtime Architecture
- 请求路径（input → classify → route/plan → act → respond）
- 状态模型（session/slots/workflow/memory）
- 工具调用边界
- 上下文工程策略

### C. Safety and Escalation
- 5 层 Guardrail 架构
- 策略违规处理
- HITL 升级触发条件

### D. Evaluation Plan
- 离线测试集分类 + 覆盖目标
- 在线 KPI
- 质量门禁阈值
- 回滚条件

### E. Performance Baseline
- Layer 1: 模型基线 TTFT/TPS 数据
- Layer 2: Agent 管道逐环节延迟预算
- 性能优化策略与 SLO

### F. Data & Iteration Strategy
- 数据模拟生成计划（若需要）
- 收敛迭代计划（若需要）
- Agent 自主执行步骤（LLM API 调用策略）

缺少任何段落 → 响应不完整。

---

## 6) Scenario Router

场景明确时加载对应蓝图:

| 场景 | 参考文件 |
|------|---------|
| 电商购物 | `references/scenarios/ecommerce-shopping.md` |
| 餐饮点餐 | `references/scenarios/food-ordering.md` |
| 客户服务 | `references/scenarios/customer-service.md` |
| 内容生成 | `references/scenarios/content-generation.md` |
| 编程助手 | `references/scenarios/coding-assistant.md` |
| 知识问答 | `references/scenarios/knowledge-qa.md` |

横切面参考:

| 主题 | 参考文件 |
|------|---------|
| 意图模式 | `references/intent-patterns.md` |
| 评估闭环 | `references/eval-loop.md` |
| 反馈协议 | `references/feedback-protocol.md` |
| 实现模板 | `references/skill-templates.md` |
| 上下文工程 | `references/paradigms/context-engineering.md` |
| 提示词模式 | `references/paradigms/prompt-patterns.md` |
| 记忆架构 | `references/paradigms/memory-architecture.md` |
| 工具设计 | `references/paradigms/tool-design.md` |
| 安全护栏 | `references/paradigms/safety-guardrails.md` |
| 可观测性 | `references/paradigms/observability.md` |
| 性能评估 | `references/paradigms/performance-benchmarking.md` |
| 数据模拟 | `references/simulation/data-generation.md` |
| 收敛迭代 | `references/convergence/iteration-protocol.md` |

---

## 7) Reference Loading Policy

保持上下文精简:

1. 仅加载选定栈/场景所需文件
2. 避免批量加载所有参考
3. 优先: 模式文件 + 1 个横切面文件
4. 仅在受阻时加载额外文件
5. 数据模拟/收敛迭代参考仅在触发时加载

---

## 8) Delivery Quality Bar

交付前检查:

- [ ] 架构内部一致，无自相矛盾
- [ ] 延迟/成本/安全 tradeoff 显式标注
- [ ] 合同可被工程团队直接实施
- [ ] 评估计划可量化、可自动化
- [ ] 性能基线已建立或有明确的测量计划
- [ ] 数据模拟方案可由 Agent 自主执行（内部自洽）
- [ ] 收敛迭代方案有明确的停止条件

不通过 → 修订后再返回。
