# 2026 现代 CSS 技术栈

## 核心技术清单

方案设计时应主动推荐使用以下技术，减少 JS 依赖，提升性能和可维护性。

### Container Queries（组件级响应式）

2026 年已全面可用（>95% 浏览器支持）。允许组件基于父容器尺寸自适应，而非视口。

```css
.card-container {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 400px) {
  .card { flex-direction: row; }
  .card-image { width: 40%; }
}

@container card (max-width: 399px) {
  .card { flex-direction: column; }
  .card-image { width: 100%; }
}
```

设计应用：
- 替代基于视口的"移动端/桌面端"二分法
- 实现真正可复用的组件（同一组件在侧边栏和主内容区自动适配）
- 使用容器查询单位（`cqw`, `cqi`）实现容器相对尺寸

### Container Scroll-State Queries（滚动状态查询）

允许基于容器滚动状态应用样式。

```css
@container scroll-state(stuck: top) {
  .sticky-header {
    background: var(--color-surface-elevated);
    box-shadow: var(--shadow-md);
  }
}

@container scroll-state(scrollable: top) {
  .scroll-indicator-top { opacity: 1; }
}
```

### View Transitions API（页面过渡）

为 SPA 和 MPA 提供原生页面过渡动画。

```css
/* 指定参与过渡的元素 */
.page-title { view-transition-name: page-title; }
.hero-image { view-transition-name: hero; }

/* 定制过渡动画 */
::view-transition-old(page-title) {
  animation: slide-out 300ms var(--easing-default);
}
::view-transition-new(page-title) {
  animation: slide-in 300ms var(--easing-default);
}
```

设计应用：
- 列表 → 详情的共享元素过渡
- 标签页/步骤间的平滑切换
- 导航时的页面级过渡动画

### Scroll-Driven Animations（滚动驱动动画）

替代 JS 滚动监听，纯 CSS 实现滚动联动效果。

```css
.parallax-element {
  animation: parallax linear;
  animation-timeline: scroll();
  animation-range: entry 0% exit 100%;
}

@keyframes parallax {
  from { transform: translateY(100px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
```

### Anchor Positioning（锚点定位）

替代 JS 定位库实现 tooltip、dropdown 等浮层定位。

```css
.tooltip-trigger { anchor-name: --trigger; }

.tooltip {
  position: fixed;
  position-anchor: --trigger;
  inset-area: top center;
  margin-bottom: var(--space-2);
}
```

### OKLCH 色彩空间

感知均匀的色彩空间，适合生成色板和主题。

```css
/* 生成同色相的亮度阶梯 */
--brand-50:  oklch(0.97 0.01 var(--brand-hue));
--brand-100: oklch(0.93 0.03 var(--brand-hue));
--brand-200: oklch(0.87 0.06 var(--brand-hue));
--brand-500: oklch(0.65 0.15 var(--brand-hue));
--brand-800: oklch(0.35 0.10 var(--brand-hue));
--brand-900: oklch(0.25 0.05 var(--brand-hue));

/* 动态色彩运算 */
.accent-subtle {
  background: color-mix(in oklch, var(--color-accent) 10%, transparent);
}
```

### 其他关键技术

| 技术 | 用途 | 设计价值 |
|------|------|---------|
| `@scope` | CSS 样式封装 | 防止组件样式泄露 |
| `@layer` | 级联层控制 | 管理样式优先级 |
| `:has()` | 父选择器 | 基于子元素状态改变父元素样式 |
| `subgrid` | 嵌套网格对齐 | 跨嵌套组件的精确对齐 |
| CSS Nesting | 原生嵌套 | 减少预处理器依赖 |
| `light-dark()` | 主题快捷函数 | 简化明暗主题切换 |
| `text-wrap: balance` | 排版优化 | 标题文本自动均衡换行 |
| Native Carousel | `::scroll-marker` | 免 JS 轮播组件 |
| Custom `<select>` | 原生控件可定制 | 免 JS 的样式化下拉 |

## 性能预算参考

| 指标 | 目标值 | 说明 |
|------|--------|------|
| LCP | ≤ 2.5s | Largest Contentful Paint |
| INP | ≤ 200ms | Interaction to Next Paint（替代 FID） |
| CLS | ≤ 0.1 | Cumulative Layout Shift |
| TBT | ≤ 200ms | Total Blocking Time |
| 首屏 CSS | ≤ 50KB | 关键 CSS 预算 |
| 首屏 JS | ≤ 100KB | 关键 JS 预算 |

## 渐进增强策略

对于浏览器支持可能不足的技术，采用渐进增强：

```css
/* 基线：所有浏览器可用 */
.component { /* 基础样式 */ }

/* 增强：支持 container queries 时 */
@supports (container-type: inline-size) {
  .component-wrapper { container-type: inline-size; }
  @container (min-width: 600px) {
    .component { /* 增强布局 */ }
  }
}
```
