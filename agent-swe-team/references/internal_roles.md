# Internal Roles — Leader / Worker / Inspector

这些角色由 Hub 管理，Supervisor（你）通常不需要了解内部细节。
当需要调试或理解为什么某个 Agent 不工作时，参考此文档。

## Leader（技术协调者）

Leader 被 Hub 自动唤醒后：
1. 分析代码库，理解目标上下文
2. 在面板上创建任务 (`POST /board/task`) 并指定 assignee
3. 唤醒 Workers (`POST /wake`) — Worker 被唤醒时自动激活首个 pending 任务
4. 通过会议室和私信监督进度
5. 指示合并 (`POST /merge`) — 每个 Worker 完成后逐个合并
6. 唤醒 Inspector (`POST /wake {"agent":"inspector"}`)
7. 根据 Inspector 报告决定收工 (`POST /done`) 或继续

Leader **没有 worktree**，工作目录是项目根目录。它不写代码。

### Leader Prompt 注入

Leader 的 prompt 包含:
- 完整目标描述
- 当前面板视图 (toBoardView)
- 团队成员列表（Worker worktree 路径 + 分支名）
- 最近 30 条会议室消息
- 全部通信工具的 curl 命令

## Worker（全栈工匠）

每个 Worker：
- 有独立 git worktree 和分支（`worker-1/YYYYMMDD-HHMMSS`）
- 一次只处理一个任务（`currentTaskId`）
- 被 wake 时，如果 `currentTaskId == null` 但有 pending 任务，Hub 自动调用 `startTask()`

### 上下文压缩

任务完成时 Worker 调用 `/board/task/:id/complete {"summary":"..."}`:
1. task.status → done, progress → 100
2. summary 存入 agent.completedTasks[] (截断 500 字)
3. agent.currentTaskId → null
4. **agent.threadId → null** (强制下次 wake 开新 session)
5. 会议室发布完成事件

下次 Worker 被唤醒时：
- 全新 session（无历史上下文）
- prompt 只注入已完成任务的压缩摘要
- Hub 自动激活下一个 pending 任务

### Worker Prompt 注入

Worker 的 prompt 包含:
- "你是全栈开发工匠 worker-1"
- 当前活跃任务详情
- 已完成任务的压缩摘要
- 排队中的 pending 任务（标注"暂不处理"）
- 通信工具 curl 命令（会议室、私信 leader、更新进度、完成任务）
- 工作环境（worktree 路径 + 分支名）
- 面板视图 + 会议室动态 + Leader 私信

## Inspector（质检官）

Inspector 被 Leader 通过 `/wake` 唤醒后：
1. 读取原始目标 + 任务分解
2. 检查 integration 分支的 `git diff --stat`
3. 运行构建/类型检查
4. 对每个任务评估是否有对应实现
5. 发布评估报告到会议室

Inspector 评估维度：
- 目标覆盖率（每个子项是否有实现）
- 代码质量（可合并标准）
- 问题清单（按严重程度）
- 总体结论

报告发到会议室后，**Leader** 做最终决策（继续修复或收工）。

## 空闲检测

Agent session 结束后（无论正常还是异常），Hub **自动**在会议室发一条事实性事件:
- 正常: `"worker-1 的会话结束，进入空闲状态"`
- 异常: `"worker-1 的会话异常终止: <error>"`

Hub 不做判断。Leader 和 Supervisor 看到后各自决策。

## 引擎差异

| 引擎 | Thread Resume | 行为 |
|:---|:---|:---|
| codex (默认) | ✅ 同 thread | resume 时注入增量消息 |
| claude | 每次新 session | 适合复杂推理 |

通过 `--engine` CLI 参数选择，对所有 Agent 生效。
