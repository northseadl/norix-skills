# Agent 模式分类与场景适配指南

> 基于 2025-2026 行业最新实践，覆盖 8 种 Agent 模式的特性对比与小程序场景适配策略

## 目录

1. [Agent 模式全景图](#agent-模式全景图)
2. [8 种 Agent 模式详解](#8-种-agent-模式详解)
3. [场景决策树](#场景决策树)
4. [模式组合策略](#模式组合策略)
5. [小程序场景适配矩阵](#小程序场景适配矩阵)
6. [Guardrails 与安全边界](#guardrails-与安全边界)

---

## Agent 模式全景图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 模式光谱                                 │
│                                                                  │
│  简单 ◀─────────────────────────────────────────────────▶ 复杂    │
│                                                                  │
│  ①规则路由    ②Slot填充    ③Function     ④Workflow    ⑤ReAct     │
│  (CREX)      (TOD)       Calling       Agent       Agent        │
│                                                                  │
│  ⑥Router-     ⑦Multi-     ⑧Autonomous                          │
│  Expert       Agent       Planning                              │
│                                                                  │
│  确定性 ◀───────────────────────────────────────────────▶ 涌现性  │
│  快速    ◀───────────────────────────────────────────────▶ 慢速  │
│  可控    ◀───────────────────────────────────────────────▶ 灵活  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8 种 Agent 模式详解

### ① 规则路由型 (Rule-Based Router / CREX)

**本技能的核心模式。** 意图匹配 → 确定性路由 → 确定性执行。

| 属性 | 值 |
|------|-----|
| **延迟** | 50-500ms |
| **可预测性** | ★★★★★ |
| **灵活性** | ★★☆☆☆ |
| **适用意图数** | 10-100 |
| **是否需要 LLM** | 否（可选 fallback） |

**最佳场景**: FAQ、订单查询、导航、简单客服
**代表平台**: 传统意图引擎、Dialogflow CX 的规则模式

```
用户输入 → [正则/关键词] → [Map.get(intent)] → [skill.execute()] → 结构化响应
```

---

### ② Slot 填充型 (Task-Oriented Dialogue / Slot Filling)

面向任务的对话，通过多轮交互收集必要参数（slot）来完成特定任务。

| 属性 | 值 |
|------|-----|
| **延迟** | 100-800ms/轮 |
| **可预测性** | ★★★★☆ |
| **灵活性** | ★★★☆☆ |
| **适用场景** | 表单收集类任务 |
| **是否需要 LLM** | 否（可选用 LLM 做 NLU） |

**最佳场景**: 预约、下单、表单填写、信息登记
**与 CREX 的关系**: 互补。当 CREX 的 SkillResponse type=form 时，本质上切入了 Slot 填充模式。

**核心概念**:

```typescript
interface SlotSchema {
  name: string;           // 参数名
  type: 'text' | 'date' | 'number' | 'enum';
  required: boolean;
  prompt: string;         // 缺失时的追问话术
  extractor: (input: string) => any | null;  // 从自然语言中提取值
  validator: (value: any) => boolean;        // 合法性校验
}

interface SlotState {
  slots: Record<string, any>;     // 已填充的 slot
  missing: string[];               // 缺失的 required slot
  completed: boolean;              // 是否所有必填 slot 已填充
}
```

**执行流程**:
```
用户: "我想预约拍照"
  → 意图: booking.create
  → Slot检查: date=null, time=null, package=null
  → 追问: "请问您想预约哪天？"

用户: "下周三下午"
  → Slot提取: date="2026-03-04", time="afternoon"
  → Slot检查: package=null
  → 追问: "请选择套餐"  → 返回 type=form 表单

用户: [选择套餐A]
  → Slot提取: package="A"
  → Slot检查: 全部完成 ✓
  → 执行预约 → 返回确认结果
```

**与 CREX 整合方式**: Slot 填充作为一种特化的 SkillHandler，内部维护 SlotState 状态机。

```typescript
class SlotFillingSkill implements SkillHandler {
  private schema: SlotSchema[];
  
  async execute(params, context): Promise<SkillResponse> {
    const state = this.resolveSlots(params, context.history);
    
    if (!state.completed) {
      // 返回追问或表单
      return this.buildPromptResponse(state);
    }
    
    // 所有 slot 已填充，执行业务逻辑
    return this.executeTask(state.slots, context);
  }
}
```

---

### ③ Function Calling 型

LLM 根据用户输入生成结构化的函数调用（JSON），由系统执行后返回结果。

| 属性 | 值 |
|------|-----|
| **延迟** | 500-2000ms |
| **可预测性** | ★★★☆☆ |
| **灵活性** | ★★★★☆ |
| **适用场景** | 工具调用密集型 |
| **是否需要 LLM** | 是 |

**最佳场景**: 计算器、数据查询、API 调用委托
**代表平台**: OpenAI Function Calling, Claude Tool Use

**与 CREX 的关系**: Function Calling 可作为 CREX 的 Layer 3 高级模式——当规则和语义匹配都失败时，让 LLM 决定调用哪个函数。

```typescript
// Function Calling 作为 CREX 的增强层
class FunctionCallingClassifier {
  private tools: ToolDefinition[];  // 注册的可用函数
  
  async classify(input: string): Promise<IntentResult | null> {
    const response = await llm.chat({
      messages: [{ role: 'user', content: input }],
      tools: this.tools,
      tool_choice: 'auto',
    });
    
    if (response.tool_calls?.length) {
      const call = response.tool_calls[0];
      return {
        intent: `function.${call.function.name}`,
        confidence: 0.85,
        params: JSON.parse(call.function.arguments),
        rawInput: input,
      };
    }
    return null;
  }
}
```

**关键约束 (Structured Output)**:
- 定义严格的 JSON Schema 约束 LLM 输出
- 使用 `strict: true` 模式防止幻觉字段
- 候选函数列表要精简（5-15 个），太多会降低准确率

---

### ④ Workflow Agent (工作流型)

预定义的多步骤工作流，LLM 在固定流程中充当某些节点的执行者。

| 属性 | 值 |
|------|-----|
| **延迟** | 1-5s（多步骤累积） |
| **可预测性** | ★★★★☆ |
| **灵活性** | ★★★☆☆ |
| **适用场景** | 复杂业务流程 |
| **是否需要 LLM** | 部分节点需要 |

**最佳场景**: 退款流程、投诉处理、多步骤审批
**代表平台**: Dify Workflow, Coze 工作流, LangGraph

**与 CREX 的关系**: Workflow 是 CREX Pipeline 的增强版，支持条件分支、并行节点和人工审批节点。

```typescript
// Workflow 定义 — 有向无环图 (DAG)
interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowNode {
  id: string;
  type: 'skill' | 'condition' | 'llm' | 'human_approval' | 'parallel';
  config: Record<string, any>;
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;  // 条件表达式
}
```

**示例: 退款工作流**:
```
[查询订单] → [检查退款条件] ─── 符合 ──→ [自动退款] → [通知用户]
                              │
                              └── 不符合 ──→ [人工审批] → [退款/拒绝] → [通知用户]
```

---

### ⑤ ReAct Agent (推理-行动循环)

LLM 在 Thought → Action → Observation 循环中自主推理和执行。

| 属性 | 值 |
|------|-----|
| **延迟** | 3-15s |
| **可预测性** | ★★☆☆☆ |
| **灵活性** | ★★★★★ |
| **适用场景** | 开放式复杂任务 |
| **是否需要 LLM** | 是（核心依赖） |

**最佳场景**: 研究调查、代码生成、自由式问答
**代表平台**: LangChain ReAct, Claude Code

**在小程序中的使用**: 一般**不建议**直接在小程序中使用 ReAct，因为延迟太高且行为不可预测。
但可以作为后台异步任务处理复杂请求。

```
用户: "帮我比较这三款套餐的性价比"
  → [识别为复杂分析任务，超出 CREX 能力]
  → [调度到 ReAct Agent 后台执行]
  → [立即返回 "正在分析中，稍后通知您"]
  → [ReAct 完成后通过消息推送结果]
```

---

### ⑥ Router-Expert (路由-专家型)

一个轻量路由模型负责意图分类，然后将请求委托给领域专家模型。

| 属性 | 值 |
|------|-----|
| **延迟** | 500-3000ms |
| **可预测性** | ★★★☆☆ |
| **灵活性** | ★★★★☆ |
| **适用场景** | 多领域覆盖 |
| **是否需要 LLM** | 路由层可选，专家层需要 |

**最佳场景**: 综合服务平台（同时处理客服、营销、技术支持）
**代表平台**: Anthropic Orchestrator-Worker

**与 CREX 的关系**: CREX 的路由+执行可视为 Router-Expert 的轻量化实现。
升级路径：当单一 SkillHandler 无法满足某个领域的复杂度时，将其升级为专家子系统。

```typescript
// 领域专家注册
class DomainExpertRouter {
  // 轻量路由层（规则 or 小模型）
  private router: IntentClassifier;
  // 专家模型池（每个领域一个专用配置）
  private experts: Map<string, ExpertConfig>;
  
  async handle(input: string, context: AgentContext): Promise<SkillResponse> {
    const domain = await this.router.classifyDomain(input);
    const expert = this.experts.get(domain);
    
    if (expert) {
      // 委托给领域专家（可能是另一个 LLM，有专属 System Prompt）
      return expert.handle(input, context);
    }
    
    // 通用回退
    return this.defaultHandler(input, context);
  }
}
```

---

### ⑦ Multi-Agent (多智能体协作)

多个专化 Agent 通过消息协议协作完成复杂任务。

| 属性 | 值 |
|------|-----|
| **延迟** | 5-30s |
| **可预测性** | ★☆☆☆☆ |
| **灵活性** | ★★★★★ |
| **适用场景** | 超复杂系统级任务 |
| **是否需要 LLM** | 是（多个实例） |

**最佳场景**: 企业级流程自动化、多系统集成
**代表平台**: CrewAI, AutoGen, OpenAI Agent SDK Handoffs

**小程序中的使用**: **直接不适用**。延迟和成本都超出小程序场景预算。
仅在后端异步任务场景中考虑。

---

### ⑧ Autonomous Planning (全自主规划)

Agent 自主规划、分解任务、选择工具、执行和验证，无需人工介入。

| 属性 | 值 |
|------|-----|
| **延迟** | 30s-10min |
| **可预测性** | ★☆☆☆☆ |
| **灵活性** | ★★★★★ |
| **适用场景** | 开放式研究/创作 |
| **是否需要 LLM** | 是（深度依赖） |

**小程序中的使用**: **完全不适用**。仅作为参照系。

---

## 场景决策树

根据业务场景选择最佳 Agent 模式：

```
你的场景是什么？
│
├─ 用户意图可枚举 (< 100 种)?
│   ├─ 是 → 每个意图有确定性执行路径?
│   │   ├─ 是 → ① 规则路由型 (CREX)
│   │   └─ 否 → 需要多轮信息收集?
│   │       ├─ 是 → ② Slot 填充型
│   │       └─ 否 → ③ Function Calling
│   │
│   └─ 否 → 意图跨多个领域?
│       ├─ 是 → ⑥ Router-Expert
│       └─ 否 → ③ Function Calling + ⑤ ReAct Fallback
│
├─ 是否涉及多步骤业务流程?
│   ├─ 是 → 流程是否固定?
│   │   ├─ 是 → ④ Workflow Agent
│   │   └─ 否 → ⑤ ReAct Agent
│   └─ 否 → ① 规则路由型 (CREX)
│
├─ 响应延迟预算?
│   ├─ < 1s → ① 规则路由型 (CREX)
│   ├─ < 3s → ①② + ③ Function Calling
│   ├─ < 10s → ④⑤ Workflow/ReAct
│   └─ > 10s → ⑦⑧ Multi-Agent (仅后台)
│
└─ 是否需要人工介入审批?
    ├─ 是 → ④ Workflow Agent (含 human_approval 节点)
    └─ 否 → 按上方规则选取
```

---

## 模式组合策略

实际项目中，最常见的是多种模式的组合：

### 推荐组合 1: CREX + Slot Filling (入门级)

90% 的小程序助手只需要这个组合。

```
CREX 路由
├─ 简单查询 → 规则路由 → 确定性执行
├─ 需要收集信息 → Slot 填充 → 多轮交互
└─ 通用回复 → FAQ 模板
```

### 推荐组合 2: CREX + Slot + Function Calling (进阶)

当需要更灵活的工具调用能力时。

```
CREX 路由
├─ Layer 1+2 命中 → 确定性执行
├─ 需要收集信息 → Slot 填充
├─ Layer 3 LLM Fallback → Function Calling 分类
└─ 通用回复
```

### 推荐组合 3: CREX + Workflow + Router-Expert (企业级)

大型综合服务平台。

```
Router 层
├─ 客服领域 → CREX (FAQ + 订单查询)
├─ 营销领域 → CREX + Slot (推荐 + 下单)
├─ 售后领域 → Workflow (退款流程)
└─ 复杂咨询 → ReAct (后台异步)
```

---

## 小程序场景适配矩阵

| 业务场景 | 推荐模式 | 延迟目标 | 技能示例 |
|---------|---------|---------|---------|
| **FAQ/常见问题** | ① CREX | < 500ms | 营业时间、位置、价格 |
| **订单查询** | ① CREX | < 1s | 订单状态、物流追踪 |
| **预约/下单** | ② Slot 填充 | < 2s/轮 | 日期+时段+套餐 |
| **商品推荐** | ① CREX 或 ③ FC | < 2s | 根据偏好推荐 |
| **导购对话** | ② Slot + ① CREX | < 2s/轮 | 引导式选品 |
| **退款/售后** | ④ Workflow | < 5s | 条件检查+审批 |
| **投诉处理** | ④ Workflow + HITL | < 3s→人工 | 升级到人工客服 |
| **深度咨询** | ⑤ ReAct (异步) | 上限通知 | 方案比较、定制 |
| **表单收集** | ② Slot 填充 | < 1s/轮 | 用户信息登记 |
| **多领域综合** | ⑥ Router-Expert | < 2s | 客服+营销+技术 |

---

## Guardrails 与安全边界

### 分层安全架构 (Layered Safety)

无论使用哪种 Agent 模式，都必须实施以下安全层：

```
┌─────────────────────────────────────────┐
│  Layer 1: Input Guardrails              │
│  - 敏感词过滤                            │
│  - 注入攻击检测                          │
│  - 输入长度/频率限制                      │
├─────────────────────────────────────────┤
│  Layer 2: Intent Guardrails             │
│  - 意图白名单（仅允许已注册意图）        │
│  - 置信度阈值（低于阈值不执行）          │
│  - 频率异常检测                          │
├─────────────────────────────────────────┤
│  Layer 3: Action Guardrails             │
│  - 技能权限矩阵                          │
│  - 操作频率限制（防刷）                  │
│  - 关键操作需二次确认                    │
├─────────────────────────────────────────┤
│  Layer 4: Output Guardrails             │
│  - 响应内容过滤                          │
│  - 敏感数据脱敏                          │
│  - 输出格式校验（严格匹配 SkillResponse）│
├─────────────────────────────────────────┤
│  Layer 5: Human-in-the-Loop             │
│  - 高风险操作转人工                      │
│  - 负面情绪升级                          │
│  - 定期人工审查样本                      │
└─────────────────────────────────────────┘
```

### 权限矩阵

```typescript
interface SkillPermission {
  requiresAuth: boolean;     // 是否需要登录
  allowedPlatforms: string[]; // 允许的平台
  rateLimit: {
    maxPerMinute: number;
    maxPerDay: number;
  };
  requiresConfirmation: boolean;  // 执行前是否需要用户确认
  auditLog: boolean;              // 是否记录审计日志
}
```

### Human-in-the-Loop (HITL) 模式

当 Agent 遇到以下情况时自动升级到人工：

```typescript
interface EscalationRule {
  trigger: 'low_confidence'    // 意图置信度低
    | 'negative_sentiment'      // 检测到负面情绪
    | 'repeated_failure'        // 连续失败
    | 'high_risk_action'        // 高风险操作（退款、删除等）
    | 'explicit_request';       // 用户明确要求人工

  threshold?: number;           // 触发阈值
  action: 'transfer_to_human'  // 转人工客服
    | 'pause_and_notify'        // 暂停并通知管理员
    | 'require_approval';       // 等待审批
}
```

---

## 从 Dify/Coze 学到的低代码模式

Dify 和 Coze 的设计可以为小程序 Agent 提供两个关键启发：

### 1. 可视化意图配置

将意图规则从代码移到可视化配置界面，让运营人员直接编辑：

```typescript
// 意图规则配置模型（存数据库）
interface IntentRuleConfig {
  id: string;
  intent: string;
  patterns: string[];       // 正则表达式列表
  examples: string[];       // 语义匹配的训练样例
  priority: number;         // 优先级
  enabled: boolean;         // 是否启用
  createdBy: string;        // 创建人
  updatedAt: Date;
}
```

### 2. 插件式技能扩展

参考 Coze 的插件架构，技能可以通过配置而非代码来注册：

```typescript
// 技能配置（支持无代码集成外部 API）
interface SkillConfig {
  id: string;
  type: 'builtin' | 'api' | 'workflow';
  
  // type=api 时：直接调用外部 API
  apiConfig?: {
    url: string;
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    bodyTemplate: string;  // 支持变量替换 {{params.xxx}}
    responseMapping: Record<string, string>;  // API 响应到 SkillResponse 的映射
  };
  
  // type=workflow 时：执行预定义工作流
  workflowId?: string;
}
```
