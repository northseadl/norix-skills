# 动效与微交互体系

## 动效设计原则

动效不是装饰，是信息传达的时间维度。每个动效必须回答：它帮助用户理解了什么？

### 动效的三个合法理由

1. **空间连续性** — 帮助用户理解元素从哪来、到哪去（页面过渡、展开/收起）
2. **状态反馈** — 确认操作结果（按钮加载、提交成功/失败）
3. **注意力引导** — 引导用户注意到重要变化（新通知、表单错误提示）

### 没有合法理由的动效必须删除

反模式：
- 纯装饰性的入场动画（页面加载时所有元素依次飞入）
- 无意义的循环动画（背景持续运动）
- 过度的鼠标跟随效果

## 时间预算

| 类型 | 时长 | 缓动函数 | 场景 |
|------|------|---------|------|
| 微反馈 | 100-150ms | `ease-out` | 按钮点击、hover 状态变化 |
| 展开/折叠 | 200-300ms | `ease-in-out` | 下拉菜单、手风琴、弹窗 |
| 页面过渡 | 300-500ms | `cubic-bezier(0.4, 0, 0.2, 1)` | 路由切换、View Transition |
| 复杂编排 | 400-800ms | 自定义 spring | 多元素协调动画 |

关键约束：
- 单个动效不超过 400ms（页面过渡除外）
- 连续动效的总时长不超过 1000ms
- 所有动效必须支持 `prefers-reduced-motion` 降级

## 微交互模式库

### 按钮状态反馈

```
idle → hover(微放大+色变) → press(收缩+深色) → loading(spinner) → success(✓)/error(✗)

时序：
hover: 100ms ease-out
press: 50ms ease-in
loading: 持续旋转
success/error: 300ms + 2s 停留后恢复
```

### 表单验证反馈

```
输入中 → 失焦触发校验 → 
  ✓ 成功: border 变绿 + 微弱缩放 (150ms)
  ✗ 失败: border 变红 + 轻微抖动 (200ms, 2-3 次) + 错误文字淡入

抖动实现：
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px); }
  75%      { transform: translateX(4px); }
}
```

### 列表操作

```
新增：目标位置留白展开 → 新元素淡入滑入 (200ms)
删除：元素淡出缩小 → 列表间距收拢 (200ms)
排序：拖拽元素浮起(shadow+scale) → 移位动画 → 落位 (300ms)

关键：列表项使用 layout animation，保持其他项的平滑流动
```

### 页面加载骨架

```
1. 骨架屏: 灰色占位块 + 微弱闪烁动画 (pulse)
2. 内容就绪: 骨架 → 真实内容的淡入过渡 (300ms)

pulse 实现：
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}
```

### Toast 通知

```
入场: 从底部/顶部滑入 (300ms spring)
停留: 成功 3s / 警告 5s / 错误 持续
退场: 向右滑出 + 淡出 (200ms)

高度塌陷: 元素退出后容器高度平滑收缩 (200ms)
```

## 无障碍适配

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

所有状态反馈必须有非动效替代方案（色彩变化、文字提示），不能仅依赖动效传递信息。

## 与 View Transitions 的协作

当使用 View Transitions API 时，动效体系通过 `view-transition-name` 标记关键元素：

```css
/* 标记需要跨页面连续的元素 */
.product-card-image { view-transition-name: product-image; }
.page-heading       { view-transition-name: heading; }

/* 自定义过渡而非使用默认 crossfade */
::view-transition-group(product-image) {
  animation-duration: 400ms;
  animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```
