# Hub HTTP API Reference

所有请求使用 `http://localhost:$PORT` 基地址。PORT 从 `<CWD>/.workshop/port` 获取。
推荐使用 `ws.mjs` CLI 工具替代直接 HTTP 调用（更紧凑的输出，节省 token）。

## 会议室 /meeting

```bash
GET  /meeting                    # 全部消息 (加 ?since=N 分页)
POST /meeting                    # {"from":"leader", "content":"@worker-1 检查日志"}
```

消息格式:
```json
{"seq": 5, "ts": "...", "from": "leader", "mentions": ["worker-1"], "content": "@worker-1 检查日志"}
```

**@mention 语义**: 消息中 `@agent-name` 会被解析为 mentions。Hub 自动唤醒被提及且空闲的 Agent，注入所有未读消息。`@all` 唤醒所有空闲 Agent。

## 私信 /dm

```bash
GET  /dm?a=leader&b=worker-1     # 读两人之间的 DM
POST /dm                         # {"from":"leader", "to":"worker-1", "content":"..."}
```

## 面板 /board

```bash
GET  /board                      # 全量 JSON
GET  /board?format=text          # 人类可读
POST /board/task                 # {"title":"...", "assignee":"worker-1"}
PATCH /board/task/:id            # {"progress":50, "notes":"..."}
POST /board/task/:id/start       # 激活为 Agent 当前任务
POST /board/task/:id/complete    # {"summary":"做了什么"} — 上下文压缩
```

## Agent 指令

```bash
POST /wake    # {"agent":"leader"} — Worker 被唤醒时自动 startTask
POST /send    # {"agent":"worker-1", "content":"..."} — 注入消息；fresh session 会重建完整角色 prompt
POST /merge   # {"agent":"worker-1"} — 合并到 integration + 同步空闲 worktree；冲突角色标记 blocked
POST /done    # 结束运行
```

## 状态

```bash
GET /signal   # "RUNNING" 或 "COMPLETED"
GET /events   # SSE 事件流 (Dashboard 用)
GET /         # Dashboard HTML
```

## Board JSON Schema

```json
{
  "runId": "20260310-181848",
  "goal": "...",
  "phase": "running",
  "agents": {
    "leader": {"role": "leader", "status": "idle", "currentTaskId": null},
    "worker-1": {
      "role": "worker", "status": "running",
      "worktreeRel": ".workshop/worktrees/.../worker-1",
      "branch": "worker-1/20260310-181848",
      "currentTaskId": 1,
      "completedTasks": [{"id": 0, "title": "...", "summary": "..."}]
    }
  },
  "tasks": [
    {"id": 1, "title": "...", "assignee": "worker-1", "status": "active", "progress": 50}
  ]
}
```

## 文件结构

```
<CWD>/.workshop/
  ├── board.json           # 面板状态 (atomic JSON)
  ├── meeting.jsonl        # 会议室消息 (append-only)
  ├── port                 # Hub 端口号
  ├── pipes/               # 私信 per-pair JSONL
  ├── logs/                # Agent 运行日志
  ├── reports/             # Agent 输出报告
  └── worktrees/<runId>/   # Worker git worktrees
```
