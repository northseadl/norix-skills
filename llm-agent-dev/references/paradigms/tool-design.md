# 工具与 MCP 设计 (Tool & MCP Design)

> Agent 工具定义、调用约束与 MCP 集成的设计原则

## 工具设计三原则

### 1. 最小工具集

```
❌ 注册 50 个工具 → LLM 选择准确率下降
✅ 保持 5-15 个工具 → LLM 选择准确率 > 95%

如果需要超过 15 个工具 → 先用 Router 分域，每个域 ≤ 10 个工具
```

### 2. 自文档化

工具描述是给 LLM 看的文档，必须精心撰写:
- **做什么**: 1 句话说清功能
- **何时用**: 明确触发场景
- **何时不用**: 明确排除场景
- **参数**: 每个参数有清晰的语义描述
- **返回**: 说明返回数据的结构

### 3. 幂等 + 安全

- 查询类工具: 天然幂等
- 操作类工具: 必须有确认机制或幂等键
- 危险操作: 返回 "需确认" 而非直接执行

## MCP (Model Context Protocol) 集成

### 何时用 MCP

| 场景 | 推荐 | 理由 |
|------|------|------|
| 单服务 3-5 个工具 | 直接 Function Calling | MCP 过度设计 |
| 跨服务 10+ 工具 | MCP | 统一工具发现 + 标准化 |
| 需要插件生态 | MCP | 第三方工具注册 |
| 工具频繁变更 | MCP | 动态发现，无需重部署 |

### MCP Server 模式

```
Agent → [MCP Client] → [MCP Server: 商品] → search_products, get_detail
                     → [MCP Server: 订单] → query_order, cancel_order  
                     → [MCP Server: 搜索] → web_search, site_search
```

### 工具调用约束

```typescript
interface ToolConstraint {
  maxCallsPerTurn: number;      // 每轮最大调用次数: 建议 3-5
  timeoutMs: number;            // 单次调用超时: 建议 5000ms
  retryPolicy: {
    maxRetries: number;         // 最大重试: 2
    backoffMs: number;          // 退避时间: 1000ms
  };
  requiredConfirmation: boolean; // 是否需要用户确认
  auditLog: boolean;            // 是否记录审计日志
}
```

## 工具返回值设计

### 返回富上下文

```typescript
// ❌ 只返回原始数据
{ products: [{ id: '1', name: 'iPhone', price: 6999 }] }

// ✅ 返回上下文丰富的结果
{
  products: [{ id: '1', name: 'iPhone 16', price: 6999, stock: 'in_stock' }],
  totalCount: 42,
  queryTime: '0.12s',
  suggestion: '您也可以搜索 "iPhone 配件" 查看相关配件',
}
```

### 错误不要吞没

```typescript
// ❌ 吞掉错误，返回空
return { products: [] };

// ✅ 返回结构化错误
return {
  error: 'service_unavailable',
  message: '商品服务暂时不可用，请稍后重试',
  retryAfterMs: 5000,
};
```
