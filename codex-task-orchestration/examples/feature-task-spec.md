# 示例: iOS 订单管理移植 Task Spec

> 基于当前项目 F03（订单管理）从 Android 移植到 iOS 的真实场景

---

## 拆解结果

### T1 · 订单数据层

- **Agent**: codex-1
- **范围**: `ios/Sources/Feature/Order/Data/`
- **输入**: 无前置依赖（基础设施 I1-1 已完成）
- **交付物**:
  - `OrderRepository.swift` — 订单仓库（Apollo query + 缓存策略）
  - `OrderModel.swift` — 订单领域模型
  - `OrderListQuery.graphql` — 从 `shared/graphql/operations/` 复用
- **验收**:
  - [ ] `xcodebuild build` 通过
  - [ ] Repository 单元测试覆盖 list/detail 两个路径
- **依赖**: 无
- **预估**: M (30-60min)
- **参考**: Android 实现 `feature/order/src/main/java/com/chuanghuo/operation/feature/order/data/`

---

### T2 · 订单列表 ViewModel

- **Agent**: codex-1
- **范围**: `ios/Sources/Feature/Order/Presentation/`
- **输入**: T1 的 OrderRepository
- **交付物**:
  - `OrderListViewModel.swift` — 列表 VM（分页 + 筛选 + 搜索）
  - `OrderFilterState.swift` — 筛选状态模型
- **验收**:
  - [ ] ViewModel 单元测试: 加载/筛选/搜索/分页 4 个场景
  - [ ] `xcodebuild test` 通过
- **依赖**: ← T1
- **预估**: M

---

### T3 · 订单列表 UI

- **Agent**: codex-2
- **范围**: `ios/Sources/Feature/Order/UI/`
- **输入**: T2 的 ViewModel + 设计系统组件
- **交付物**:
  - `OrderListScreen.swift` — 列表页（LazyVStack + Pull-to-refresh + 分页加载）
  - `OrderCard.swift` — 订单卡片组件
  - `OrderFilterSheet.swift` — 筛选面板
- **验收**:
  - [ ] Preview 正常渲染（空态/加载态/数据态）
  - [ ] 模拟器运行可看到列表数据
- **依赖**: ← T2
- **预估**: M

---

### T4 · 订单详情全链路

- **Agent**: codex-2
- **范围**: `ios/Sources/Feature/Order/UI/` + `ios/Sources/Feature/Order/Presentation/`
- **输入**: T1 的 Repository + 设计系统组件
- **交付物**:
  - `OrderDetailViewModel.swift`
  - `OrderDetailScreen.swift` — 详情页（商品/物流/操作）
  - `OrderStatusBadge.swift` — 状态标签组件
- **验收**:
  - [ ] 从列表页点击可跳转详情页
  - [ ] 发货/取消操作可触发 mutation
  - [ ] `xcodebuild build` 通过
- **依赖**: ← T1 (Repository)
- **预估**: L (60-120min)

---

## 依赖关系

```
T1 (数据层) ──→ T2 (列表 VM) ──→ T3 (列表 UI)
           ──→ T4 (详情全链路)
无依赖立即启动: T1
T3 和 T4 可并行（仅共享 T1 产出）
```

## 监督级别

| Task | 级别 | 理由 |
|:---|:---|:---|
| T1 | L1 全自动 | 纯新文件创建，有 Android 参照 |
| T2 | L1 全自动 | ViewModel 模式固定 |
| T3 | L2 建议模式 | UI 实现需要审查布局细节 |
| T4 | L2 建议模式 | 包含 mutation 操作需审查 |

## Codex 调度命令

```bash
# 使用 Orchestrator 服务（推荐方式）
# 将上述 Task Spec 保存为 tasks/T1-order-data-layer.md 等文件后:

# 预览执行计划（打开 Dashboard 但不实际调度）
node <SKILLS_DIR>/codex-task-orchestration/scripts/dispatch.mjs ./tasks/ --dry-run

# 并行调度（T2 和 T4 同时执行）
node <SKILLS_DIR>/codex-task-orchestration/scripts/dispatch.mjs ./tasks/ \
  --parallel --approval-mode full-auto --cwd .

# Dashboard 会自动打开浏览器，显示:
# - DAG 依赖图: T1 → T2+T4 → T3
# - 每个 Agent 的实时事件流
# - Token 用量和进度
```

