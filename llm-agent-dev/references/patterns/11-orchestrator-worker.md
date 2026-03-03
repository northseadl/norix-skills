# 模式 ⑪ Orchestrator-Worker (编导-工人)

> 编排 LLM 动态分解任务并委托给专化 Worker 执行
> 延迟 2-10s · 可预测性 ★★★☆☆ · 适合复杂度不可预测的任务

## 核心理念

与 ④ Workflow Agent（预定义 DAG）不同，Orchestrator-Worker 模式中
Orchestrator LLM **动态决定**需要哪些子步骤、如何分配。

```
用户输入 → [Orchestrator LLM] ──→ 分析任务复杂度
                │                    ├── 简单 → 单 Worker 执行
                │                    ├── 中等 → 2-3 Workers 并行
                │                    └── 复杂 → 串行 + 并行混合
                │
                ▼
         [动态生成子任务] → [派发到 Workers] → [收集结果] → [合成最终输出]
```

## 与其他模式的关系

| 对比 | Orchestrator-Worker | Workflow Agent | ReAct |
|------|-------------------|---------------|-------|
| 步骤定义 | LLM 动态生成 | 预定义 DAG | LLM 逐步推理 |
| 并行能力 | 支持 | 支持 | 不支持 |
| 可预测性 | 中 | 高 | 低 |
| 适用场景 | 复杂度不可预测 | 固定流程 | 开放探索 |

## 适用场景

- 复杂客户问题处理（不确定需要几步）
- 多维度内容生成（根据内容复杂度动态分配）
- 自动化代码审查（根据 diff 大小动态拆分）
- 研究分析（根据主题复杂度决定研究深度）

## 实现

```typescript
interface SubTask {
  id: string;
  description: string;
  workerType: 'search' | 'analyze' | 'generate' | 'validate';
  dependencies: string[];  // 依赖的其他子任务 id
  input: Record<string, any>;
}

interface OrchestratorPlan {
  subtasks: SubTask[];
  synthesisStrategy: string;  // 如何合并子任务结果
}

class OrchestratorWorker {
  private workers: Map<string, WorkerHandler>;

  constructor(
    private orchestratorModel: string,    // 强模型做规划
    private workerModel: string,           // 轻量模型做执行
  ) {}

  async execute(input: string, context: AgentContext): Promise<SkillResponse> {
    // Step 1: Orchestrator 分析并生成计划
    const plan = await this.plan(input, context);

    // Step 2: 按依赖关系执行 Workers
    const results = await this.executeWorkers(plan);

    // Step 3: 合成最终结果
    return this.synthesize(plan, results, context);
  }

  private async plan(input: string, context: AgentContext): Promise<OrchestratorPlan> {
    const response = await llm.chat({
      model: this.orchestratorModel,
      messages: [{
        role: 'system',
        content: `你是任务编排器。分析用户请求，将其分解为可执行的子任务。
输出 JSON 格式的 OrchestratorPlan。
可用 Worker 类型: search, analyze, generate, validate。
优化原则: 无依赖的子任务标记为可并行。`,
      }, {
        role: 'user',
        content: input,
      }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    return JSON.parse(response.content);
  }

  private async executeWorkers(plan: OrchestratorPlan): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const completed = new Set<string>();

    // 拓扑排序执行
    while (completed.size < plan.subtasks.length) {
      // 找出所有依赖已满足的子任务
      const ready = plan.subtasks.filter(
        t => !completed.has(t.id) &&
             t.dependencies.every(d => completed.has(d)),
      );

      // 并行执行就绪的子任务
      const batchResults = await Promise.allSettled(
        ready.map(async (task) => {
          const worker = this.workers.get(task.workerType);
          const enrichedInput = {
            ...task.input,
            _dependencies: Object.fromEntries(
              task.dependencies.map(d => [d, results.get(d)]),
            ),
          };
          return [task.id, await worker!.execute(enrichedInput)] as const;
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const [id, output] = result.value;
          results.set(id, output);
          completed.add(id);
        }
      }
    }

    return results;
  }
}
```

## 示例: 客户投诉智能处理

```
用户: "我上周买的手机屏幕有划痕，而且配送了两天才到，客服电话打了三次都没人接"

Orchestrator 分析:
→ 涉及 3 个维度: 商品质量 + 物流 + 客服
→ 生成计划:
  T1: [search] 查询订单和物流信息（无依赖）
  T2: [search] 查询客服通话记录（无依赖）
  T3: [analyze] 评估商品质量问题（依赖 T1）
  T4: [analyze] 评估服务体验问题（依赖 T1, T2）
  T5: [generate] 生成综合解决方案（依赖 T3, T4）

执行:
  Batch 1: T1 + T2 并行 (1s)
  Batch 2: T3 + T4 并行 (1s)
  Batch 3: T5 (1s)
  总延迟: ~3s
```
