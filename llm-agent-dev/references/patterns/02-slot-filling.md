# 模式 ② Slot 填充 (Task-Oriented Dialogue)

> 多轮交互收集必要参数后执行任务
> 延迟 100-800ms/轮 · 可预测性 ★★★★★ · 适合表单收集类任务

## 适用场景

- 预约/下单（收集日期、时段、套餐）
- 用户信息登记（姓名、手机、地址）
- 保险报价（年龄、险种、保额）
- 引导式导购（品类、预算、偏好）
- 投诉工单创建（问题类型、描述、联系方式）

## 不适用信号

- 无需收集信息，一次性查询即可 → ① CREX
- 参数之间有复杂依赖和条件分支 → ④ Workflow
- 参数完全无法预定义 → ⑤ ReAct

## 与 CREX 的关系

Slot 填充是 CREX 的**执行层扩展**。在 CREX 路由中，当意图被分类为需要参数收集的类型时，
对应的 SkillHandler 内部维护 Slot 状态机。

```
CREX:  Classify → Route → Execute(SlotFillingSkill) → Respond
                              │
                              ├─ slots 未完成 → 返回追问 (followUp)
                              └─ slots 完成   → 执行业务逻辑
```

## 核心概念

### SlotSchema — 参数定义

```typescript
interface SlotSchema {
  name: string;              // 参数名
  type: 'text' | 'date' | 'number' | 'enum';
  required: boolean;
  prompt: string;            // 缺失时的追问话术
  enumValues?: string[];     // type=enum 时的选项
  validator?: (value: any) => boolean;
}
```

### SlotState — 当前填充状态

```typescript
interface SlotState {
  slots: Record<string, any>;  // 已填充的参数
  missing: string[];            // 缺失的 required 参数名
  completed: boolean;           // 所有必填参数是否已填充
}
```

## 实现

### TypeScript

```typescript
class SlotFillingSkill implements SkillHandler {
  id: string;
  name: string;
  private slotDefs: SlotSchema[];
  private taskExecutor: (slots: Record<string, any>, ctx: AgentContext) => Promise<SkillResponse>;

  constructor(config: {
    id: string; name: string;
    slots: SlotSchema[];
    executor: (slots: Record<string, any>, ctx: AgentContext) => Promise<SkillResponse>;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.slotDefs = config.slots;
    this.taskExecutor = config.executor;
  }

  async execute(params: Record<string, any>, context: AgentContext): Promise<SkillResponse> {
    const state = this.resolveSlots(params, context);

    if (!state.completed) {
      return this.buildPrompt(state);
    }

    return this.taskExecutor(state.slots, context);
  }

  private resolveSlots(params: Record<string, any>, context: AgentContext): SlotState {
    const slots: Record<string, any> = {};

    // 1. 从历史会话中恢复已填充的 slot
    const prevSlots = this.recoverFromHistory(context.history);
    Object.assign(slots, prevSlots);

    // 2. 从当前 params 中提取新的 slot 值
    for (const def of this.slotDefs) {
      if (params[def.name] != null) {
        const value = params[def.name];
        if (!def.validator || def.validator(value)) {
          slots[def.name] = value;
        }
      }
    }

    // 3. 检查缺失的必填 slot
    const missing = this.slotDefs
      .filter(d => d.required && slots[d.name] == null)
      .map(d => d.name);

    return { slots, missing, completed: missing.length === 0 };
  }

  private buildPrompt(state: SlotState): SkillResponse {
    const nextSlot = this.slotDefs.find(d => d.name === state.missing[0])!;

    if (nextSlot.type === 'enum' && nextSlot.enumValues) {
      return {
        type: 'form',
        content: {
          title: nextSlot.prompt,
          fields: [{ name: nextSlot.name, type: 'select', options: nextSlot.enumValues }],
          filled: state.slots,
        },
        actions: [],
        followUp: null,
      };
    }

    return {
      type: 'text',
      content: nextSlot.prompt,
      actions: [],
      followUp: nextSlot.prompt,
    };
  }

  private recoverFromHistory(history: IntentResult[]): Record<string, any> {
    const recovered: Record<string, any> = {};
    for (const h of history) {
      if (h.intent === this.id) {
        Object.assign(recovered, h.params);
      }
    }
    return recovered;
  }
}
```

### 使用示例

```typescript
const bookingSkill = new SlotFillingSkill({
  id: 'booking.create',
  name: '创建预约',
  slots: [
    { name: 'date', type: 'date', required: true, prompt: '请问您想预约哪天？' },
    { name: 'timeSlot', type: 'enum', required: true, prompt: '上午还是下午？',
      enumValues: ['上午', '下午'] },
    { name: 'service', type: 'enum', required: true, prompt: '请选择服务类型',
      enumValues: ['精修写真', '证件照', '全家福'] },
    { name: 'note', type: 'text', required: false, prompt: '有什么特殊要求吗？' },
  ],
  executor: async (slots, ctx) => {
    const booking = await bookingService.create({ ...slots, userId: ctx.userId });
    return {
      type: 'card', content: formatBookingCard(booking),
      actions: [{ label: '查看预约', action: 'navigate', target: `/booking/${booking.id}` }],
      followUp: null,
    };
  },
});

registry.register('booking.create', bookingSkill);
```

### Go 实现

```go
type SlotFillingSkill struct {
    id       string
    name     string
    slots    []SlotDef
    executor func(slots map[string]any, ctx *AgentContext) (*model.SkillResponse, error)
}

type SlotDef struct {
    Name       string
    Type       string   // "text", "date", "number", "enum"
    Required   bool
    Prompt     string
    EnumValues []string
}

func (s *SlotFillingSkill) Execute(params map[string]any, ctx *AgentContext) (*model.SkillResponse, error) {
    state := s.resolveSlots(params, ctx)
    if !state.Completed {
        return s.buildPrompt(state), nil
    }
    return s.executor(state.Slots, ctx)
}
```

## 对话流程示例

```
用户: "我想预约拍照"
  → Intent: booking.create (confidence: 0.95)
  → SlotState: {date: null, timeSlot: null, service: null} → missing: [date]
  → Response: {type: "text", content: "请问您想预约哪天？"}

用户: "下周三"
  → Intent: booking.create (context recovery)
  → Params: {date: "2026-03-04"} (LLM 提取并归一化)
  → SlotState: {date: "2026-03-04", timeSlot: null, service: null} → missing: [timeSlot]
  → Response: {type: "form", content: {options: ["上午", "下午"]}}

用户: [选择 "下午"]
  → SlotState: {date: "2026-03-04", timeSlot: "下午", service: null} → missing: [service]
  → Response: {type: "form", content: {options: ["精修写真", "证件照", "全家福"]}}

用户: [选择 "精修写真"]
  → SlotState: completed ✓
  → Execute booking → Response: {type: "card", content: bookingCard}
```

## LLM 增强的 Slot 提取

当用户输入 "下周三下午想拍个精修写真"，可以让 LLM 一次性提取多个 slot：

```typescript
// LLM 提取的 params 可能是:
{ date: "下周三", timeSlot: "下午", service: "精修写真" }

// 经过 normalizeDate / normalizeEnum 后:
{ date: "2026-03-04", timeSlot: "下午", service: "精修写真" }

// 三个 slot 全部命中 → 直接执行，无需追问
```
