# 技能实现模板 (Skill Implementation Templates)

> Go + TypeScript 完整实现参考，覆盖分类器 → 路由 → 执行 → 测试 → 配置化

## Go 后端模板

### 核心类型

```go
// data/model/agent.go

type IntentResult struct {
    Intent     string         `json:"intent"`
    Confidence float64        `json:"confidence"`
    Params     map[string]any `json:"params"`
    RawInput   string         `json:"rawInput"`
}

type SkillResponse struct {
    Type     string         `json:"type"`     // text|list|card|form|empty|error
    Content  any            `json:"content"`
    Actions  []ActionButton `json:"actions"`
    FollowUp *string        `json:"followUp"`
    Meta     *ResponseMeta  `json:"meta,omitempty"`
}

type ActionButton struct {
    Label  string `json:"label"`
    Action string `json:"action"` // navigate|copy|call|confirm|submit
    Target string `json:"target"`
}

type ResponseMeta struct {
    Intent     string  `json:"intent"`
    Confidence float64 `json:"confidence"`
    LatencyMs  int64   `json:"latencyMs"`
    SkillID    string  `json:"skillId"`
}
```

### LLM-Native 分类器

```go
// app/agent/service/classifier.go

type Classifier struct {
    llmClient    llm.Client
    model        string
    systemPrompt string
    shortcuts    []ShortcutRule
    cache        sync.Map
    cacheTTL     time.Duration
}

// Classify — layered intent classification
func (c *Classifier) Classify(ctx context.Context, input string) IntentResult {
    input = strings.TrimSpace(input)

    // Layer 0: Shortcut rules — high-frequency exact match
    if result := c.shortcutMatch(input); result != nil {
        return *result
    }

    // Layer 1: Cache — reuse LLM results
    if result, ok := c.cacheGet(input); ok {
        return result
    }

    // Layer 2: LLM classification — core engine
    result := c.llmClassify(ctx, input)
    c.cacheSet(input, result)
    return result
}

func (c *Classifier) llmClassify(ctx context.Context, input string) IntentResult {
    resp, err := c.llmClient.Chat(ctx, llm.ChatRequest{
        Model:    c.model,
        Messages: []llm.Message{
            {Role: "system", Content: c.systemPrompt},
            {Role: "user", Content: input},
        },
        Temperature:    0,
        MaxTokens:      200,
        ResponseFormat: "json",
    })
    if err != nil {
        return IntentResult{Intent: "error", RawInput: input}
    }
    var result IntentResult
    json.Unmarshal([]byte(resp.Content), &result)
    result.RawInput = input
    return result
}
```

### 路由 + 执行

```go
// app/agent/service/router.go

type SkillHandler interface {
    ID() string
    Execute(params map[string]any, ctx *AgentContext) (*SkillResponse, error)
}

type AgentContext struct {
    UserID    string
    SessionID string
    Platform  string // h5, app, weapp
    History   []IntentResult
}

type SkillRouter struct {
    skills map[string]SkillHandler
}

func (r *SkillRouter) Resolve(intent string) SkillHandler {
    return r.skills[intent]
}
```

```go
// app/agent/service/executor.go

type AgentExecutor struct {
    classifier *Classifier
    router     *SkillRouter
}

func (e *AgentExecutor) HandleMessage(message string, ctx *AgentContext) *SkillResponse {
    start := time.Now()

    intent := e.classifier.Classify(context.Background(), message)
    handler := e.router.Resolve(intent.Intent)

    if handler == nil {
        return e.fallbackResponse(intent)
    }

    resp, err := handler.Execute(intent.Params, ctx)
    if err != nil {
        return e.errorResponse(err)
    }

    latency := time.Since(start).Milliseconds()
    resp.Meta = &ResponseMeta{
        Intent: intent.Intent, Confidence: intent.Confidence,
        LatencyMs: latency, SkillID: handler.ID(),
    }
    return resp
}
```

### 具体 Skill 示例

```go
// app/agent/skill/booking_query.go

type BookingQuerySkill struct {
    bookingStore store.BookingStore
}

func (s *BookingQuerySkill) ID() string { return "booking.query" }

func (s *BookingQuerySkill) Execute(params map[string]any, ctx *AgentContext) (*SkillResponse, error) {
    orderId, _ := params["orderId"].(string)

    var bookings []model.Booking
    var err error
    if orderId != "" {
        booking, e := s.bookingStore.GetByID(orderId)
        if e != nil { return nil, e }
        bookings = []model.Booking{*booking}
    } else {
        bookings, err = s.bookingStore.ListByUserID(ctx.UserID)
        if err != nil { return nil, err }
    }

    if len(bookings) == 0 {
        followUp := "您可以尝试用订单号查询"
        return &SkillResponse{Type: "empty", Content: "未找到相关订单", FollowUp: &followUp}, nil
    }

    items := make([]map[string]any, len(bookings))
    for i, b := range bookings {
        items[i] = map[string]any{"id": b.ID, "title": b.ServiceName, "status": b.Status}
    }
    return &SkillResponse{Type: "list", Content: items}, nil
}
```

### HTTP Handler

```go
// app/agent/handler/agent.go

func (h *AgentHandler) Chat(c *gin.Context) {
    var req struct { Message string `json:"message" binding:"required"` }
    if err := c.ShouldBindJSON(&req); err != nil {
        response.BadRequest(c, "message is required")
        return
    }

    ctx := &service.AgentContext{
        UserID:    middleware.GetUserID(c),
        SessionID: c.GetHeader("X-Session-ID"),
        Platform:  c.GetHeader("X-Platform"),
    }
    result := h.executor.HandleMessage(req.Message, ctx)
    response.OK(c, result)
}
```

---

## TypeScript 后端模板

### 类型定义 & 路由

```typescript
// types/agent.ts — 完整类型见 feedback-protocol.md

// routes/agent.ts
import { Router } from 'express';
const router = Router();

router.post('/api/agent/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const context: AgentContext = {
    userId: req.user.id,
    sessionId: sessionId || crypto.randomUUID(),
    platform: req.headers['x-platform'] as string || 'h5',
    history: [],
  };
  const result = await executor.handleMessage(message, context);
  res.json(result);
});
```

---

## 测试模式

### 表驱动测试 (Go)

```go
func TestClassifier_Classify(t *testing.T) {
    c := NewClassifier()
    tests := []struct {
        name, input, wantIntent string
        wantParams              map[string]any
    }{
        {"simple query", "查一下我的预约", "booking.query", map[string]any{}},
        {"with params", "订单号ABC123", "booking.query", map[string]any{"orderId": "ABC123"}},
        {"unknown", "今天天气怎么样", "unknown", nil},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := c.Classify(context.Background(), tt.input)
            assert.Equal(t, tt.wantIntent, result.Intent)
            if tt.wantParams != nil {
                for k, v := range tt.wantParams { assert.Equal(t, v, result.Params[k]) }
            }
        })
    }
}
```

### 集成测试

```go
func TestAgentExecutor_HandleMessage(t *testing.T) {
    executor := NewAgentExecutor(NewClassifier(), router)
    ctx := &AgentContext{UserID: "user-1", SessionID: "sess-1"}

    resp := executor.HandleMessage("查一下我的预约", ctx)

    assert.Equal(t, "list", resp.Type)
    assert.Equal(t, "booking.query", resp.Meta.Intent)
    assert.True(t, resp.Meta.LatencyMs < 2000)
}
```

---

## 配置化意图管理

将意图从代码移到数据库，运营可编辑:

```go
type IntentRuleConfig struct {
    ID      uint   `gorm:"primaryKey"`
    Intent  string `gorm:"uniqueIndex;not null"`
    Pattern string `gorm:"not null;comment:正则表达式"`
    Priority int   `gorm:"default:0"`
    Enabled bool   `gorm:"default:true"`
}

// 热加载: 每 5 分钟或 Redis pub/sub 触发刷新
type ConfigurableClassifier struct {
    rules     atomic.Value // []IntentRule
    ruleStore store.IntentRuleStore
}

func (c *ConfigurableClassifier) Reload() error {
    configs, err := c.ruleStore.ListEnabled()
    if err != nil { return err }
    c.rules.Store(compileRules(configs))
    return nil
}
```
