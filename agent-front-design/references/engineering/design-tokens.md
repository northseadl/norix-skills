# Design Token 架构

## 三层 Token 体系

Design Token 是设计系统的 DNA。采用三层架构确保一致性与可扩展性。

### 第一层：Primitive Token（原始值）

定义抽象的设计属性原始值，与语义无关。

```css
/* 色彩原始值 — 使用 OKLCH 色彩空间 */
--color-brand-50:  oklch(0.97 0.01 250);
--color-brand-100: oklch(0.93 0.02 250);
--color-brand-500: oklch(0.65 0.15 250);
--color-brand-900: oklch(0.25 0.05 250);

/* 间距阶梯 — 基于 4px 基准 */
--space-1:  0.25rem;   /* 4px */
--space-2:  0.5rem;    /* 8px */
--space-3:  0.75rem;   /* 12px */
--space-4:  1rem;      /* 16px */
--space-6:  1.5rem;    /* 24px */
--space-8:  2rem;      /* 32px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */

/* 字体尺寸阶梯 */
--text-xs:   0.75rem;
--text-sm:   0.875rem;
--text-base: 1rem;
--text-lg:   1.125rem;
--text-xl:   1.25rem;
--text-2xl:  1.5rem;
--text-3xl:  1.875rem;
--text-4xl:  2.25rem;

/* 圆角 */
--radius-sm:   0.25rem;
--radius-md:   0.5rem;
--radius-lg:   0.75rem;
--radius-xl:   1rem;
--radius-full: 9999px;

/* 阴影 */
--shadow-sm:  0 1px 2px oklch(0 0 0 / 0.05);
--shadow-md:  0 4px 6px oklch(0 0 0 / 0.07);
--shadow-lg:  0 10px 15px oklch(0 0 0 / 0.1);

/* 过渡 */
--duration-fast:   100ms;
--duration-normal: 200ms;
--duration-slow:   400ms;
--easing-default:  cubic-bezier(0.4, 0, 0.2, 1);
--easing-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 第二层：Semantic Token（语义映射）

将原始值映射到 UI 语义，支持主题切换。

```css
/* 亮色主题 */
:root,
[data-theme="light"] {
  --color-surface:           var(--color-neutral-50);
  --color-surface-elevated:  var(--color-neutral-0);
  --color-text-primary:      var(--color-neutral-900);
  --color-text-secondary:    var(--color-neutral-600);
  --color-text-muted:        var(--color-neutral-400);
  --color-border:            var(--color-neutral-200);
  --color-border-strong:     var(--color-neutral-300);
  --color-accent:            var(--color-brand-500);
  --color-accent-hover:      var(--color-brand-600);
  --color-accent-text:       var(--color-neutral-0);
  --color-success:           var(--color-green-500);
  --color-warning:           var(--color-amber-500);
  --color-error:             var(--color-red-500);
  --color-info:              var(--color-blue-500);
}

/* 暗色主题 — 覆盖语义层即可 */
[data-theme="dark"] {
  --color-surface:           var(--color-neutral-900);
  --color-surface-elevated:  var(--color-neutral-800);
  --color-text-primary:      var(--color-neutral-50);
  --color-text-secondary:    var(--color-neutral-400);
  --color-text-muted:        var(--color-neutral-600);
  --color-border:            var(--color-neutral-700);
  --color-border-strong:     var(--color-neutral-600);
}
```

### 第三层：Component Token（组件级）

为特定组件创建的 Token，引用语义层。

```css
/* 按钮 */
--button-primary-bg:         var(--color-accent);
--button-primary-bg-hover:   var(--color-accent-hover);
--button-primary-text:       var(--color-accent-text);
--button-primary-radius:     var(--radius-md);
--button-primary-padding:    var(--space-2) var(--space-4);

/* 卡片 */
--card-bg:                   var(--color-surface-elevated);
--card-border:               var(--color-border);
--card-radius:               var(--radius-lg);
--card-shadow:               var(--shadow-md);
--card-padding:              var(--space-6);

/* 输入框 */
--input-bg:                  var(--color-surface);
--input-border:              var(--color-border);
--input-border-focus:        var(--color-accent);
--input-radius:              var(--radius-md);
--input-text:                var(--color-text-primary);
--input-placeholder:         var(--color-text-muted);
```

## Token 治理规则

1. **禁止魔法数字**：所有样式值必须引用 Token，禁止内联硬编码
2. **语义优先**：组件样式引用语义 Token，而非原始 Token
3. **单一来源**：同一语义不得出现多种 Token 表达
4. **主题中性**：组件逻辑不包含主题判断，全部由语义层控制
5. **文档化**：新增 Token 必须说明语义和使用场景

## Token 命名规范

```
--{category}-{property}-{variant}-{state}

category: color, space, text, radius, shadow, duration, easing
property: surface, text, border, accent, primary, secondary
variant:  elevated, muted, strong (可选)
state:    hover, focus, active, disabled (可选)

示例：--color-text-muted, --color-accent-hover, --space-section
```
