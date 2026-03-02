# 模式 ④ Workflow Agent (工作流型)

> 预定义多步骤 DAG，含条件分支、并行节点和人工审批
> 延迟 1-5s · 可预测性 ★★★★☆ · 适合固定业务流程

## 适用场景

- 退款/售后处理（条件检查 → 自动/手动审批 → 执行）
- 投诉处理（分类 → 升级 → 响应）
- 多步骤审批（申请 → 审核 → 执行 → 通知）
- 数据处理管道（采集 → 清洗 → 分析 → 报告）

## 不适用信号

- 流程是动态的，无法预定义 → ⑤ ReAct
- 只需单步执行 → ① CREX
- 需要跨系统多 Agent 协作 → ⑦ Multi-Agent

## 与 CREX 的关系

Workflow 是 CREX Pipeline 的增强版。CREX Pipeline 是线性串联，
Workflow 支持条件分支、并行节点和人工审批。

## 核心概念

```typescript
// 工作流定义 — 有向无环图 (DAG)
interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: string;         // 触发意图
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowNode {
  id: string;
  type: 'skill'            // 执行技能
    | 'condition'           // 条件判断
    | 'llm'                 // LLM 节点（轻量模型）
    | 'human_approval'      // 人工审批
    | 'parallel'            // 并行执行
    | 'notify';             // 通知（短信/推送/消息）
  config: Record<string, any>;
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;       // 条件表达式: "result.amount > 100"
}
```

## 实现示例: 退款工作流

```
[查询订单] ──→ [检查退款条件] ─── 符合 ──→ [计算退款金额]
                                │               │
                                │          金额≤100 ──→ [自动退款] ──→ [通知用户]
                                │               │
                                │          金额>100 ──→ [人工审批] ──→ [退款/拒绝] ──→ [通知用户]
                                │
                                └── 不符合 ──→ [返回拒绝原因]
```

### 工作流定义

```typescript
const refundWorkflow: WorkflowDefinition = {
  id: 'refund.process',
  name: '退款处理',
  trigger: 'order.refund',
  nodes: [
    { id: 'query', type: 'skill', config: { skillId: 'order.query' } },
    { id: 'check', type: 'condition', config: {
      expression: 'order.status === "completed" && order.refundable === true'
    }},
    { id: 'calc', type: 'skill', config: { skillId: 'refund.calculate' } },
    { id: 'auto_check', type: 'condition', config: { expression: 'amount <= 100' } },
    { id: 'auto_refund', type: 'skill', config: { skillId: 'refund.execute' } },
    { id: 'manual_review', type: 'human_approval', config: {
      assignee: 'finance_team', timeout: '24h',
      timeoutAction: 'auto_approve'
    }},
    { id: 'notify', type: 'notify', config: { channel: 'wechat_template' } },
    { id: 'reject', type: 'skill', config: { skillId: 'refund.reject_response' } },
  ],
  edges: [
    { from: 'query', to: 'check' },
    { from: 'check', to: 'calc', condition: 'passed' },
    { from: 'check', to: 'reject', condition: '!passed' },
    { from: 'calc', to: 'auto_check' },
    { from: 'auto_check', to: 'auto_refund', condition: 'amount <= 100' },
    { from: 'auto_check', to: 'manual_review', condition: 'amount > 100' },
    { from: 'manual_review', to: 'auto_refund', condition: 'approved' },
    { from: 'manual_review', to: 'reject', condition: '!approved' },
    { from: 'auto_refund', to: 'notify' },
  ],
};
```

### 工作流引擎

```typescript
class WorkflowEngine {
  async execute(
    workflow: WorkflowDefinition,
    initialParams: Record<string, any>,
    context: AgentContext
  ): Promise<SkillResponse> {
    let current = workflow.nodes[0];
    let state = { ...initialParams };

    while (current) {
      const result = await this.executeNode(current, state, context);
      state = { ...state, ...result };

      // 人工审批节点 → 暂停并返回等待状态
      if (current.type === 'human_approval' && !result._approved) {
        return {
          type: 'text',
          content: '您的退款申请已提交，等待审核中',
          actions: [{ label: '查看进度', action: 'navigate', target: `/refund/${state.refundId}` }],
          followUp: null,
        };
      }

      // 查找下一个节点
      const nextEdge = workflow.edges.find(
        e => e.from === current!.id && (!e.condition || this.evaluate(e.condition, state))
      );
      current = nextEdge ? workflow.nodes.find(n => n.id === nextEdge.to)! : null!;
    }

    return state._lastResponse as SkillResponse;
  }
}
```

## Human-in-the-Loop 审批

人工审批节点会暂停工作流，等待人工操作：

```typescript
interface HumanApprovalConfig {
  assignee: string;           // 审批人/团队
  timeout: string;            // 超时时间: "24h", "2d"
  timeoutAction: 'auto_approve' | 'auto_reject' | 'escalate';
  notifyChannels: string[];   // 通知渠道
}
```

审批结果通过 Webhook 或定时轮询回写到工作流状态。
