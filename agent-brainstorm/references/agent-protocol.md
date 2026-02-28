# Agent 讨论协议

> 本文是 Brainstorm Engine 生成 Agent prompt 时的行为规范补充。
> 核心 Agent prompt 由 `brainstorm.mjs` 的 `buildAgentPrompt()` 动态生成。
> 本文件供 Orchestrator 在需要自定义 Agent 行为时参考。

---

## 角色设定原则

每个 Agent 被赋予一个**专家身份**。Orchestrator 在创建 session config 时定义角色:

| 字段 | 含义 | 例子 |
|:---|:---|:---|
| `id` | 唯一标识 (英文, 无空格) | `architect`, `security`, `ux` |
| `name` | 显示名称 | `系统架构师`, `安全专家` |
| `expertise` | 专业领域描述 | `系统设计、微服务架构、可扩展性` |

**角色设计建议**:

- **每个角色代表一个独立视角**。避免角色重叠。
- **至少包含一个"挑战者"角色** — 如 `devil` (魔鬼代言人)，专门寻找方案漏洞。
- **3-5 个 Agent 是最佳数量**。太少缺乏碰撞，太多导致噪声。

## 常用角色模板

| ID | 名称 | 适用场景 |
|:---|:---|:---|
| `architect` | 系统架构师 | 技术选型、架构设计 |
| `security` | 安全专家 | 安全审计、威胁建模 |
| `performance` | 性能工程师 | 性能优化、资源管理 |
| `product` | 产品经理 | 用户需求、商业价值 |
| `ux` | 用户体验设计师 | 交互设计、可用性 |
| `devil` | 魔鬼代言人 | 反面论证、风险发现 |
| `ops` | 运维工程师 | 部署、监控、可观测性 |
| `data` | 数据工程师 | 数据架构、存储策略 |

## Agent 讨论行为模式

### 三阶段节奏

```
阶段 1: Explore (探索)
├── 阅读代码和文档
├── 形成独立观点
└── 发表首个分析 (opinion)

阶段 2: Engage (碰撞)
├── 阅读他人观点
├── 同意 / 质疑 / 扩展
└── 发表回应 (response)

阶段 3: Converge (收敛)
├── 评估共识程度
├── 提出综合方案 (proposal)
└── 投票结束 (conclude)
```

### Agent 自主节奏控制

Agent 被指示在发表首个观点后，通过交替执行"深入分析"和"检查新观点"来维持讨论节奏。
具体 prompt 由 `brainstorm.mjs` 的 `buildAgentPrompt()` 函数生成。

### 常见问题处理

| 场景 | Agent 行为 |
|:---|:---|
| 其他人还没发言 | 继续深入分析代码，稍后再检查 |
| 所有人都同意我 | 尝试自我质疑，找出潜在风险 |
| 激烈分歧 | 用 `respond` 发表详细论证 |
| 超时即将到达 | 立即 `conclude` 投票 |

## 讨论空间 API

每个 Agent 通过 `discuss.py` CLI 工具与讨论空间交互。
工具由 `brainstorm.mjs` 在启动时生成到 `.brainstorm/discuss.py`。

### Post 类型

| 类型 | 用途 | 何时使用 |
|:---|:---|:---|
| `opinion` | 独立观点 | 首次发言、新洞察 |
| `response` | 对他人观点的回应 | 回应特定 post |
| `proposal` | 具体解决方案 | 收敛阶段 |
| `conclude_vote` | 结束投票 + 总结 | 认为讨论充分时 |

### Reaction 类型

| 类型 | 含义 |
|:---|:---|
| `agree` | 同意该观点 |
| `challenge` | 质疑，应附带理由 |
| `build-on` | 在此基础上扩展 |

### 收敛检测

Discussion Space 自动检测讨论阶段转换:

- **exploring → debating**: 所有 Agent 至少发布 1 个 opinion
- **debating → converging**: 回应数 ≥ Agent 数 且 agree > challenge
- **converging → synthesizing**: 过半 Agent 投 conclude 票
- **synthesizing → concluded**: 所有 Agent session 结束

Orchestrator 也可通过 timeout 强制结束。
