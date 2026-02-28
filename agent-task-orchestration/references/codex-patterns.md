# Codex 行为模式与配置参考

## CLI 配置

### config.toml (~/.codex/config.toml)

```toml
model = "o4-mini"                    # 推荐模型
approval_policy = "unless-allow-listed"  # 默认需要审批

[history]
persistence = "none"                 # 不保留历史到磁盘
save_to = "/dev/null"

# 通过 instructions 文件传递全局上下文
model_instructions_file = ".codex/instructions.md"
```

### Approval Modes

| Mode | 含义 | 适用场景 |
|:---|:---|:---|
| `suggest` | 建议修改，人工审批每个文件 | 功能实现、修改现有代码 |
| `auto-edit` | 自动写文件，执行命令需审批 | 创建新模块、脚手架 |
| `full-auto` | 完全自动 | 新文件创建、格式化、文档 |

### CLI 调用模式

```bash
# 交互模式 (默认) — 适合复杂任务
codex

# 安静模式 — 适合脚本调度
codex -q "任务描述"

# 指定审批模式
codex --approval-mode suggest "任务描述"
codex --approval-mode full-auto "任务描述"

# 指定模型
codex --model o4-mini "任务描述"
```

## Instructions 文件写法

Codex Agent 在 session 开始时会读取 instructions 文件。一个好的 instructions 文件应该:

### 结构模板

```markdown
# 项目上下文

[从 domain.md 提取的关键信息: 技术栈、目录结构、构建命令]

# 当前任务

[Task Spec 的完整内容]

# 代码规范

[从 soul.md 提取的关键原则，如命名规范、注释策略]

# 参考实现

[指向已完成的类似功能的文件路径，作为风格参照]

# 验收检查

[完成后必须执行的验证命令]
```

### 最佳实践

- **具体 > 抽象**: "在 `feature/order/src/` 下创建 `OrderListScreen.kt`" 优于 "创建订单列表"
- **路径 > 描述**: 给出文件的精确路径，而非模糊的模块名
- **参照 > 规范**: 指向一个已完成的参考实现比写一长段规范更有效
- **命令 > 文字**: "运行 `./gradlew :feature:order:testDebugUnitTest`" 优于 "确保测试通过"

## AGENTS.md 模式

Codex 会自动读取项目根目录的 `AGENTS.md` 作为长期记忆。内容应该是当前项目的"最小上下文"——新 Agent 读完就能开始工作。

**推荐内容**:
- 项目概况（名称 + 技术栈）
- 核心模块索引（模块名 → 职责 → 关键文件）
- 设计规范（色彩/字体/间距的硬编码值）
- 质量门禁命令

**不应包含**:
- 历史变更记录
- 待办事项
- 过于详细的实现细节

## Session 行为模式

从 Codex JSONL 审计中提炼的行为规律:

1. **Session 开始**: Agent 读取 instructions + AGENTS.md → 分析任务 → 制定计划
2. **执行阶段**: 按计划逐文件实现 → 每个文件变更会触发 approval check
3. **验证阶段**: 运行构建/测试命令 → 如果失败则自动修复
4. **收尾阶段**: Summary 输出 → 结束 session

**关键发现**:
- Codex 在任务描述具体时（含文件路径、代码示例）执行效率显著更高
- 过大的上下文（>2000字 instructions）反而降低焦点，Codex 会遗漏细节
- `full-auto` 模式下 Codex 倾向于激进修改，建议仅用于新文件创建
- 指定参考文件路径可以显著提高代码风格一致性

## SDK 编程模式 (@openai/codex-sdk)

### 核心 API

```javascript
import { Codex } from '@openai/codex-sdk';

const codex = new Codex();

// 启动新会话
const thread = codex.startThread({
  approvalPolicy: 'on-request',     // never | on-request | on-failure | untrusted
  sandboxMode: 'workspace-write',   // read-only | workspace-write | danger-full-access
  workingDirectory: '/path/to/project',
});

// 阻塞等待完成
const turn = await thread.run("任务描述");
console.log(turn.finalResponse, turn.usage);

// 流式获取事件
const streamed = await thread.runStreamed("任务描述");
for await (const event of streamed.events) {
  // event.type: thread.started | turn.started | item.started | item.completed | turn.completed
}

// 恢复中断的会话
const resumed = codex.resumeThread(thread.id);
```

### CLI → SDK 模式映射

| CLI `--approval-mode` | SDK `approvalPolicy` | SDK `sandboxMode` |
|:---|:---|:---|
| `suggest` | `on-request` | `workspace-write` |
| `auto-edit` | `on-failure` | `workspace-write` |
| `full-auto` | `never` | `workspace-write` |

### 事件类型

| 事件 | 含义 | 关键字段 |
|:---|:---|:---|
| `item.started` (command_execution) | Agent 开始执行命令 | `item.command` |
| `item.completed` (command_execution) | 命令执行完成 | `item.exit_code` |
| `item.started` (file_change) | Agent 开始修改文件 | `item.changes[].path/kind` |
| `item.completed` (file_change) | 文件修改完成 | `item.status` |
| `turn.completed` | 一轮对话完成 | `usage.input_tokens/output_tokens` |
| `turn.failed` | 执行失败 | `error.message` |

