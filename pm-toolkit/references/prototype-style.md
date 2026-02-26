# Prototype HTML -- Design Reference

Agent 生成原型 HTML 时的设计约束与审美规范。目标：像设计师手工制作，不像 AI 批量输出。

## 文件结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=375">   <!-- mobile:375 pad:768 pc:不设 -->
<title>Page Name</title>
<style>
/* 所有样式内联，不依赖外部 CSS 框架 */
</style>
</head>
<body>
<!-- 内容 -->
</body>
</html>
```

## 设计原则

### 反 AI 审美清单

生成每个原型时，逐条检查以下禁令。违反任意一条 = 不合格。

| 禁止 | 应该 |
|------|------|
| 大面积渐变背景 `linear-gradient` | 纯色背景 `#fafaf9` `#1c1917` |
| 圆角胶囊 `border-radius: 20px+` | 克制圆角 `3px` `6px` |
| 彩色粗体大数字 | 正文字重数字，靠排版层级区分 |
| 卡片浮雕阴影 `box-shadow` | 1px 线分隔 `border-bottom: 1px solid` |
| 蓝紫渐变配色 | 大地色系 / 中性灰 / 单色点缀 |
| 图标密集 emoji | 纯文字排版 / 极少量符号 |
| 居中对齐一切 | 左对齐为主，紧凑阅读流 |
| Inter/Poppins 通用体 | DM Sans / system-ui / 自定义搭配 |
| `backdrop-filter: blur` | 无模糊效果 |
| 过度留白 `padding: 40px+` | 紧凑间距 `12px-20px` |
| `-webkit-background-clip: text` 彩色字 | 纯色文字 |
| CSS 动画 / transition 装饰 | 静态页面，用结构说话 |

### 色彩方案

选择一个基调，保持全页一致：

**暖中性 (推荐)**
```css
--ink: #1c1917;     /* 正文 */
--ink-2: #44403c;   /* 次要文字 */
--ink-3: #78716c;   /* 辅助/标签 */
--stone: #a8a29e;   /* 分隔线 */
--sand: #f5f5f4;    /* 卡片背景 */
--warm: #fafaf9;    /* 页面背景 */
--accent: #b45309;  /* 强调 (极少使用) */
```

**冷中性**
```css
--ink: #0f172a;
--ink-2: #334155;
--ink-3: #64748b;
--stone: #94a3b8;
--sand: #f1f5f9;
--warm: #f8fafc;
--accent: #0369a1;
```

**深色**
```css
--ink: #f0ece8;
--ink-2: #a8a29e;
--ink-3: #736d67;
--stone: #353230;
--sand: #211f1e;
--warm: #181716;
--accent: #d4976a;
```

### 排版

```css
body {
    font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
}
```

- **h1**: 17-20px, font-weight 500 (不要 700+)
- **正文**: 12-13px
- **标签/辅助**: 10px, uppercase, letter-spacing .06em+
- **数据**: 18-22px, font-weight 500

### 布局

- 首选 `border-bottom: 1px solid` 分隔区域，不用卡片阴影
- `padding: 16px-20px` 内容区
- 移动端：单列，线性流
- 数据指标：`display: flex` 等分行，线分隔

### 允许的外部字体

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
```

其他不引入外部资源。

## 原型类型参考

### 用户画像 (Persona)

结构：头部身份 → 指标条 → 分段内容 (Profile / Needs / Pain Points)

### 功能列表 (Feature List)

结构：标题 → 分类标签 → 条目列表 (状态标记)

### 数据仪表盘 (Dashboard)

结构：指标行 → 图表占位 → 明细表格

### 表单页 (Form)

结构：标题 → 分组字段 → 操作按钮
