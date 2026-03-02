# 模式 ⑦ MCP 工具协议 (Model Context Protocol)

> 标准化的工具接入协议，Agent 通过统一接口发现和调用任意外部工具
> 延迟取决于工具 · 可预测性 ★★★★☆ · 2025-2026 行业标准

## 背景

MCP (Model Context Protocol) 由 Anthropic 于 2024 年底推出，2025-2026 年已成为
Agent 接入外部工具和数据源的**事实标准**。它解决了 Agent 开发中最大的痛点之一：
每个工具都需要定制集成代码。

## 适用场景

- Agent 需要接入大量外部工具（数据库、API、文件系统、第三方服务）
- 希望工具接入"即插即用"，而非为每个工具写定制代码
- 多 Agent 系统共享工具集
- 企业级系统需要标准化的工具治理和审计

## 核心概念

```
┌─────────────┐     MCP Protocol     ┌─────────────┐
│  MCP Client │ ◄──────────────────► │  MCP Server │
│  (Agent)    │  JSON-RPC over stdio │  (Tool)     │
└─────────────┘                      └─────────────┘
       │                                    │
  发现工具列表                         暴露工具能力
  调用工具                            执行并返回结果
  读取资源                            提供数据上下文
```

### 三大原语

```typescript
// 1. Tools — Agent 可调用的工具
interface MCPTool {
  name: string;              // "query_database"
  description: string;       // 给 LLM 理解的描述
  inputSchema: JSONSchema;   // 参数定义
}

// 2. Resources — Agent 可读取的数据上下文
interface MCPResource {
  uri: string;               // "file:///data/config.json"
  name: string;
  mimeType: string;
}

// 3. Prompts — 预定义的提示词模板
interface MCPPrompt {
  name: string;
  description: string;
  arguments: { name: string; description: string }[];
}
```

## 与 Function Calling 的区别

| 维度 | Function Calling (③) | MCP (⑦) |
|------|----------------------|---------|
| 工具定义 | 硬编码在代码中 | 运行时从 MCP Server 动态发现 |
| 接入方式 | 每个工具写定制代码 | 标准协议，即插即用 |
| 生态 | 封闭 | 开放生态（数千个社区 MCP Server） |
| 适合规模 | 5-15 个工具 | 数十到数百个工具 |
| 治理 | 需自建 | 协议内置权限和审计 |

## 实现

### Agent 侧（MCP Client）

```typescript
import { MCPClient } from '@anthropic/mcp-client';

class MCPEnabledAgent {
  private mcpClients: Map<string, MCPClient> = new Map();

  // 连接 MCP Server
  async connectServer(name: string, command: string, args: string[]) {
    const client = new MCPClient();
    await client.connect({ command, args, transport: 'stdio' });
    this.mcpClients.set(name, client);
  }

  // 发现所有可用工具
  async discoverTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    for (const [name, client] of this.mcpClients) {
      const tools = await client.listTools();
      allTools.push(...tools.map(t => ({ ...t, _server: name })));
    }
    return allTools;
  }

  // 将 MCP 工具转为 LLM 的 tools 参数
  toFunctionCallingFormat(mcpTools: MCPTool[]): ToolDefinition[] {
    return mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));
  }

  // 执行 MCP 工具调用
  async executeTool(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.mcpClients.get(serverName);
    if (!client) throw new Error(`MCP server ${serverName} not found`);
    return client.callTool(toolName, args);
  }
}
```

### 工具侧（MCP Server 示例）

```typescript
// 一个简单的订单查询 MCP Server
import { MCPServer, tool } from '@anthropic/mcp-server';

const server = new MCPServer({ name: 'order-service' });

server.addTool({
  name: 'query_orders',
  description: '查询用户订单列表',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: '用户ID' },
      status: { type: 'string', enum: ['pending', 'shipped', 'completed'] },
    },
    required: ['userId'],
  },
  handler: async (args) => {
    const orders = await db.orders.find({ userId: args.userId, status: args.status });
    return { content: [{ type: 'text', text: JSON.stringify(orders) }] };
  },
});

server.start();
```

## 与其他模式的组合

```
CREX (①) + MCP (⑦):
  意图分类 → 确定需要工具 → 从 MCP 发现工具 → 调用 → 格式化输出

ReAct (⑤) + MCP (⑦):
  推理循环中的 Action 步骤从 MCP Server 动态发现可用工具

Router-Expert (⑥) + MCP (⑦):
  每个领域专家通过 MCP 接入自己领域的工具集
```

## 部署模式

```
生产环境常见部署:

Agent Process ──stdio──→ MCP Server (本地进程)
Agent Process ──SSE────→ MCP Server (远程服务)
Agent Process ──stdio──→ MCP Gateway ──HTTP──→ 多个 MCP Server
```
