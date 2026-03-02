# 技能实现模板 (Skill Implementation Templates)

> Go 后端 + TypeScript 前端的技能实现参考模板

## 目录

1. [Go 后端模板](#go-后端模板)
2. [TypeScript 后端模板](#typescript-后端模板)
3. [技能测试模式](#技能测试模式)
4. [配置化意图管理](#配置化意图管理)

---

## Go 后端模板

### 核心类型定义

```go
// data/model/agent.go

package model

// IntentResult represents the result of intent classification
type IntentResult struct {
    Intent     string         `json:"intent"`
    Confidence float64        `json:"confidence"`
    Params     map[string]any `json:"params"`
    RawInput   string         `json:"rawInput"`
}

// SkillResponse is the unified response protocol
type SkillResponse struct {
    Type     string         `json:"type"`     // text, list, card, form, empty, error
    Content  any            `json:"content"`
    Actions  []ActionButton `json:"actions"`
    FollowUp *string        `json:"followUp,omitempty"`
    Meta     *ResponseMeta  `json:"meta,omitempty"`
}

type ActionButton struct {
    Label  string `json:"label"`
    Action string `json:"action"` // navigate, copy, call, confirm, retry
    Target string `json:"target"`
}

type ResponseMeta struct {
    Intent     string  `json:"intent"`
    Confidence float64 `json:"confidence"`
    LatencyMs  int64   `json:"latencyMs"`
    SkillID    string  `json:"skillId"`
}
```

### 意图分类器 (LLM-Native)

```go
// app/agent/service/classifier.go

package service

import (
    "context"
    "encoding/json"
    "regexp"
    "strings"
    "sync"
    "time"

    "your-project/data/model"
    "your-project/pkg/llm"
    "your-project/pkg/log"
)

// Classifier implements LLM-Native intent classification with caching and shortcuts
type Classifier struct {
    llmClient    llm.Client
    model        string           // lightweight model: "haiku", "gpt-4o-mini", "qwen-turbo"
    systemPrompt string           // compiled from IntentSchema
    shortcuts    []ShortcutRule   // high-frequency regex shortcuts
    cache        sync.Map          // input -> cachedResult
    cacheTTL     time.Duration
}

type cachedResult struct {
    result model.IntentResult
    expiry time.Time
}

// ShortcutRule for high-frequency exact matches (bypass LLM)
type ShortcutRule struct {
    Intent  string
    Pattern *regexp.Regexp
}

func NewClassifier(client llm.Client, model string, schema model.IntentSchema) *Classifier {
    return &Classifier{
        llmClient:    client,
        model:        model,
        systemPrompt: buildSystemPrompt(schema),
        shortcuts:    defaultShortcuts(),
        cacheTTL:     5 * time.Minute,
    }
}

// Classify performs layered intent classification
func (c *Classifier) Classify(ctx context.Context, input string) model.IntentResult {
    input = strings.TrimSpace(input)

    // Layer 0: Shortcut rules — high-frequency exact match (optional optimization)
    if result := c.shortcutMatch(input); result != nil {
        result.Confidence = 1.0
        return *result
    }

    // Layer 1: Cache hit
    if result, ok := c.cacheGet(input); ok {
        return result
    }

    // Layer 2: LLM classification — core engine
    result := c.llmClassify(ctx, input)

    // Cache the result
    c.cacheSet(input, result)

    return result
}

func (c *Classifier) llmClassify(ctx context.Context, input string) model.IntentResult {
    resp, err := c.llmClient.Chat(ctx, llm.ChatRequest{
        Model: c.model,
        Messages: []llm.Message{
            {Role: "system", Content: c.systemPrompt},
            {Role: "user", Content: input},
        },
        Temperature:    0,
        MaxTokens:      200,
        ResponseFormat: "json",
    })
    if err != nil {
        log.Error("LLM classify failed", "error", err, "input", input)
        return model.IntentResult{Intent: "unknown", Confidence: 0, RawInput: input}
    }

    var result model.IntentResult
    if err := json.Unmarshal([]byte(resp.Content), &result); err != nil {
        log.Error("LLM response parse failed", "error", err, "content", resp.Content)
        return model.IntentResult{Intent: "unknown", Confidence: 0, RawInput: input}
    }
    result.RawInput = input
    return result
}

func (c *Classifier) shortcutMatch(input string) *model.IntentResult {
    for _, rule := range c.shortcuts {
        if rule.Pattern.MatchString(input) {
            return &model.IntentResult{Intent: rule.Intent, Params: map[string]any{}, RawInput: input}
        }
    }
    return nil
}

func (c *Classifier) cacheGet(input string) (model.IntentResult, bool) {
    if v, ok := c.cache.Load(input); ok {
        cr := v.(cachedResult)
        if time.Now().Before(cr.expiry) {
            return cr.result, true
        }
        c.cache.Delete(input)
    }
    return model.IntentResult{}, false
}

func (c *Classifier) cacheSet(input string, result model.IntentResult) {
    c.cache.Store(input, cachedResult{result: result, expiry: time.Now().Add(c.cacheTTL)})
}

func defaultShortcuts() []ShortcutRule {
    return []ShortcutRule{
        {Intent: "order.query", Pattern: regexp.MustCompile(`^查?订单`)},
        {Intent: "help.contact", Pattern: regexp.MustCompile(`^转?人工`)},
        {Intent: "nav.home", Pattern: regexp.MustCompile(`^回?首页`)},
    }
}

func buildSystemPrompt(schema model.IntentSchema) string {
    // Build system prompt from IntentSchema — see references/intent-patterns.md
    // Template includes: intent list, param definitions, output JSON format
    return schema.ToSystemPrompt()
}
```

### 技能路由表

```go
// app/agent/service/router.go

package service

import (
    "your-project/data/model"
)

// SkillHandler defines the interface for all skills
type SkillHandler interface {
    ID() string
    Name() string
    Execute(params map[string]any, ctx *AgentContext) (*model.SkillResponse, error)
}

// AgentContext holds the execution context
type AgentContext struct {
    UserID    string
    SessionID string
    Platform  string // weapp, h5
    History   []model.IntentResult
}

// SkillRouter maps intents to skill handlers
type SkillRouter struct {
    skills map[string]SkillHandler
}

func NewSkillRouter() *SkillRouter {
    return &SkillRouter{
        skills: make(map[string]SkillHandler),
    }
}

func (r *SkillRouter) Register(intent string, handler SkillHandler) {
    r.skills[intent] = handler
}

func (r *SkillRouter) Resolve(intent string) (SkillHandler, bool) {
    handler, ok := r.skills[intent]
    return handler, ok
}
```

### 技能执行器（串联分类→路由→执行）

```go
// app/agent/service/executor.go

package service

import (
    "time"

    "your-project/data/model"
    "your-project/pkg/log"
)

// AgentExecutor orchestrates the CREX loop
type AgentExecutor struct {
    classifier *Classifier
    router     *SkillRouter
}

func NewAgentExecutor(classifier *Classifier, router *SkillRouter) *AgentExecutor {
    return &AgentExecutor{
        classifier: classifier,
        router:     router,
    }
}

// HandleMessage processes a user message through the CREX loop
func (e *AgentExecutor) HandleMessage(message string, ctx *AgentContext) *model.SkillResponse {
    start := time.Now()

    // Step 1: Classify
    intent := e.classifier.Classify(message)

    // Step 2: Route
    handler, ok := e.router.Resolve(intent.Intent)
    if !ok {
        return e.unknownIntentResponse(message)
    }

    // Step 3: Execute
    resp, err := handler.Execute(intent.Params, ctx)
    if err != nil {
        log.Error("skill execution failed",
            "intent", intent.Intent,
            "error", err,
        )
        return e.errorResponse(err)
    }

    // Step 4: Attach metadata
    latency := time.Since(start).Milliseconds()
    resp.Meta = &model.ResponseMeta{
        Intent:     intent.Intent,
        Confidence: intent.Confidence,
        LatencyMs:  latency,
        SkillID:    handler.ID(),
    }

    // Record to history
    ctx.History = append(ctx.History, intent)

    return resp
}

func (e *AgentExecutor) unknownIntentResponse(input string) *model.SkillResponse {
    followUp := "您可以试试：查订单、预约、看推荐"
    return &model.SkillResponse{
        Type:     "text",
        Content:  "抱歉，我暂时不理解您的意思",
        Actions:  []model.ActionButton{},
        FollowUp: &followUp,
    }
}

func (e *AgentExecutor) errorResponse(err error) *model.SkillResponse {
    return &model.SkillResponse{
        Type:    "error",
        Content: "系统繁忙，请稍后再试",
        Actions: []model.ActionButton{
            {Label: "重试", Action: "retry", Target: ""},
        },
    }
}
```

### HTTP Handler

```go
// app/agent/handler/chat.go

package handler

import (
    "github.com/gin-gonic/gin"

    "your-project/app/agent/service"
    "your-project/shared/response"
)

type ChatHandler struct {
    executor *service.AgentExecutor
}

func NewChatHandler(executor *service.AgentExecutor) *ChatHandler {
    return &ChatHandler{executor: executor}
}

type ChatRequest struct {
    Message   string `json:"message" binding:"required"`
    SessionID string `json:"sessionId"`
}

// Chat handles POST /api/agent/chat
func (h *ChatHandler) Chat(c *gin.Context) {
    var req ChatRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.BadRequest(c, "message is required")
        return
    }

    ctx := &service.AgentContext{
        UserID:    c.GetString("userId"), // from auth middleware
        SessionID: req.SessionID,
        Platform:  c.GetHeader("X-Platform"),
    }

    result := h.executor.HandleMessage(req.Message, ctx)
    response.OK(c, result)
}
```

### 具体技能实现示例

```go
// app/agent/skill/booking_query.go

package skill

import (
    "your-project/app/agent/service"
    "your-project/data/model"
    "your-project/data/store"
)

type BookingQuerySkill struct {
    bookingStore store.BookingStore
}

func NewBookingQuerySkill(bs store.BookingStore) *BookingQuerySkill {
    return &BookingQuerySkill{bookingStore: bs}
}

func (s *BookingQuerySkill) ID() string   { return "booking.query" }
func (s *BookingQuerySkill) Name() string { return "订单查询" }

func (s *BookingQuerySkill) Execute(
    params map[string]any,
    ctx *service.AgentContext,
) (*model.SkillResponse, error) {
    // Extract parameters
    orderId, _ := params["orderId"].(string)

    // Query data
    var bookings []model.Booking
    var err error

    if orderId != "" {
        booking, err := s.bookingStore.GetByID(ctx.UserID, orderId)
        if err != nil {
            return nil, err
        }
        if booking != nil {
            bookings = []model.Booking{*booking}
        }
    } else {
        bookings, err = s.bookingStore.ListByUserID(ctx.UserID, 5)
        if err != nil {
            return nil, err
        }
    }

    // Build response
    if len(bookings) == 0 {
        followUp := "您可以提供订单号让我帮您精确查找"
        return &model.SkillResponse{
            Type:     "empty",
            Content:  "未找到相关订单",
            Actions: []model.ActionButton{
                {Label: "查看全部订单", Action: "navigate", Target: "/pages/orders/list"},
            },
            FollowUp: &followUp,
        }, nil
    }

    // Format as list
    items := make([]map[string]any, len(bookings))
    actions := make([]model.ActionButton, 0, len(bookings))
    for i, b := range bookings {
        items[i] = map[string]any{
            "id":     b.ID,
            "title":  b.ServiceName,
            "status": b.Status,
            "date":   b.BookingDate.Format("2006-01-02 15:04"),
        }
        actions = append(actions, model.ActionButton{
            Label:  "查看详情",
            Action: "navigate",
            Target: "/pages/orders/detail?id=" + b.ID,
        })
    }

    return &model.SkillResponse{
        Type:    "list",
        Content: items,
        Actions: actions,
    }, nil
}
```

---

## TypeScript 后端模板

### 类型定义

```typescript
// types/agent.ts

export interface IntentResult {
  intent: string;
  confidence: number;
  params: Record<string, any>;
  rawInput: string;
}

export interface SkillResponse {
  type: 'text' | 'list' | 'card' | 'form' | 'empty' | 'error';
  content: any;
  actions: ActionButton[];
  followUp: string | null;
  meta?: ResponseMeta;
}

export interface ActionButton {
  label: string;
  action: 'navigate' | 'copy' | 'call' | 'confirm' | 'retry';
  target: string;
}

export interface ResponseMeta {
  intent: string;
  confidence: number;
  latencyMs: number;
  skillId: string;
}

export interface SkillHandler {
  id: string;
  name: string;
  execute(params: Record<string, any>, context: AgentContext): Promise<SkillResponse>;
}

export interface AgentContext {
  userId: string;
  sessionId: string;
  platform: 'weapp' | 'h5';
  history: IntentResult[];
  extras: Record<string, any>;
}
```

### Express/Koa 路由

```typescript
// routes/agent.ts

import { Router } from 'express';
import { AgentExecutor } from '../services/agent-executor';

const router = Router();
const executor = new AgentExecutor();

router.post('/api/agent/chat', async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  const context: AgentContext = {
    userId: req.user.id,
    sessionId: sessionId || crypto.randomUUID(),
    platform: req.headers['x-platform'] as 'weapp' | 'h5' || 'weapp',
    history: [],
    extras: {},
  };

  const result = await executor.handleMessage(message, context);
  res.json(result);
});

export default router;
```

---

## 技能测试模式

### 表驱动测试 (Go)

```go
// app/agent/service/classifier_test.go

func TestClassifier_Classify(t *testing.T) {
    c := NewClassifier()

    tests := []struct {
        name     string
        input    string
        wantIntent string
        wantParams map[string]any
    }{
        {
            name:       "simple booking query",
            input:      "查一下我的预约",
            wantIntent: "booking.query",
            wantParams: map[string]any{},
        },
        {
            name:       "booking query with order id",
            input:      "订单号ABC123的状态",
            wantIntent: "booking.query",
            wantParams: map[string]any{"orderId": "ABC123"},
        },
        {
            name:       "unknown intent",
            input:      "今天天气怎么样",
            wantIntent: "unknown",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := c.Classify(tt.input)
            assert.Equal(t, tt.wantIntent, result.Intent)
            if tt.wantParams != nil {
                for k, v := range tt.wantParams {
                    assert.Equal(t, v, result.Params[k])
                }
            }
        })
    }
}
```

### 技能集成测试

```go
// app/agent/service/executor_test.go

func TestAgentExecutor_HandleMessage(t *testing.T) {
    // Setup
    classifier := NewClassifier()
    router := NewSkillRouter()
    router.Register("booking.query", &mockBookingSkill{})

    executor := NewAgentExecutor(classifier, router)
    ctx := &AgentContext{UserID: "user-1", SessionID: "sess-1"}

    // Execute
    resp := executor.HandleMessage("查一下我的预约", ctx)

    // Assert
    assert.NotNil(t, resp)
    assert.Equal(t, "list", resp.Type)
    assert.NotNil(t, resp.Meta)
    assert.Equal(t, "booking.query", resp.Meta.Intent)
    assert.True(t, resp.Meta.LatencyMs < 100) // 确保延迟在100ms内
}
```

---

## 配置化意图管理

Phase 2+ 将意图规则从代码移到数据库，实现运营可编辑：

### 数据模型

```go
// data/model/intent_rule.go

type IntentRuleConfig struct {
    ID          uint   `gorm:"primaryKey"`
    Intent      string `gorm:"index;not null;comment:意图标识符"`
    Pattern     string `gorm:"not null;comment:正则表达式"`
    Priority    int    `gorm:"default:0;comment:优先级，越大越优先"`
    Enabled     bool   `gorm:"default:true"`
    ExtractRule string `gorm:"type:jsonb;comment:参数提取规则JSON"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

### 热加载策略

```go
// 每 5 分钟从数据库刷新规则到内存
// 或使用 Redis pub/sub 实现实时热更新
type ConfigurableClassifier struct {
    rules     atomic.Value // []IntentRule
    ruleStore store.IntentRuleStore
}

func (c *ConfigurableClassifier) Reload() error {
    configs, err := c.ruleStore.ListEnabled()
    if err != nil {
        return err
    }
    rules := compileRules(configs)
    c.rules.Store(rules)
    return nil
}
```
