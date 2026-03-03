# React / Vue 工程交接

## 通用交接要求

无论框架选择，工程交接必须输出：

1. **组件树**：页面级组件到叶子组件的嵌套关系
2. **状态管理策略**：什么状态在什么层级管理
3. **数据请求生命周期**：请求时机、缓存策略、错误处理
4. **路由结构**：页面 → 路由的映射关系
5. **关键交互事件埋点**：需要埋点的用户行为

## 设计到工程映射

| 设计产物 | 工程映射 |
|---------|---------|
| 信息架构 (IA) | Route 结构 + 导航组件 |
| 交互流 | 事件处理 + 状态迁移 |
| 视觉契约 | Design Token CSS Variables |
| 页面蓝图 | 组件树 + layout 组件 |
| 状态覆盖表 | 条件渲染逻辑 + Error Boundary |

---

## React 交接规格

### 组件分类

```
页面组件 (Page)
├── 布局组件 (Layout) -- 纯结构，无业务逻辑
├── 容器组件 (Container) -- 数据获取、状态管理
│   ├── 展示组件 (Presentational) -- 纯 UI 渲染
│   └── 交互组件 (Interactive) -- 用户输入处理
└── 共享组件 (Shared) -- 跨页面复用
```

### 状态管理策略

| 状态类型 | 管理层级 | 技术选择 |
|---------|---------|---------|
| UI 状态 (开关/展开) | 组件本地 | `useState` |
| 表单状态 | 表单组件 | `useForm` / `useState` |
| 服务端状态 | 请求层 | TanStack Query / SWR |
| 全局 UI 状态 | Context | `useContext` + `useReducer` |
| 跨页面业务状态 | 全局 Store | Zustand / Jotai |

### 数据请求模式

```tsx
// 推荐：声明式数据获取
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });

  if (isLoading) return <ProfileSkeleton />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <EmptyState />;
  return <ProfileView user={data} />;
}
```

### 性能优化检查点

- React Compiler 自动 memoization（2026 默认启用）
- 列表渲染使用虚拟化（> 100 项时）
- 路由级代码分割（`React.lazy` + `Suspense`）
- 图片使用 `loading="lazy"` + 响应式 `srcset`
- 关键 CSS 内联，非关键 CSS 异步加载

---

## Vue 交接规格

### 组件分类

```
页面组件 (Views)
├── 布局组件 (Layouts) -- 纯结构
├── 容器组件 (Containers) -- 组合逻辑 (composables)
│   ├── 展示组件 (Components) -- template 驱动
│   └── 交互组件 (FormComponents) -- v-model 绑定
└── 共享组件 (Shared) -- 跨页面复用
```

### Composable 架构

```
composables/
├── useAuth.ts       -- 认证逻辑
├── useApi.ts        -- 请求封装
├── useForm.ts       -- 表单逻辑
├── usePagination.ts -- 分页逻辑
└── useTheme.ts      -- 主题切换

每个 composable 封装一个独立的逻辑关注点。
状态 (ref/reactive) + 行为 (methods) + 副作用 (watchEffect) 共存。
```

### 状态管理策略

| 状态类型 | 管理层级 | 技术选择 |
|---------|---------|---------|
| UI 状态 | 组件本地 | `ref` / `reactive` |
| 表单状态 | Composable | `useForm` composable |
| 服务端状态 | 请求层 | VueQuery / useFetch |
| 跨组件状态 | provide/inject | Composition API |
| 全局状态 | Store | Pinia |

### 数据请求模式

```vue
<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';

const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId.value),
});
</script>

<template>
  <ProfileSkeleton v-if="isLoading" />
  <ErrorState v-else-if="error" :error="error" @retry="refetch" />
  <EmptyState v-else-if="!data" />
  <ProfileView v-else :user="data" />
</template>
```

### 性能优化检查点

- 异步组件 `defineAsyncComponent` + Suspense
- 列表虚拟化（> 100 项）
- `v-memo` 缓存复杂列表渲染
- Route-based 代码分割
- 图片懒加载 + 骨架屏占位

---

## 交接清单

交接时确认以下内容均已覆盖：

- [ ] 组件命名与职责单一
- [ ] 异常态统一封装（Error Boundary / ErrorState 组件）
- [ ] 可访问性语义优先（语义 HTML > ARIA）
- [ ] 性能预算量化（初始加载 / 列表渲染 / 重绘指标）
- [ ] Token 映射到 CSS Custom Properties
- [ ] 响应式策略：Container Queries > Media Queries
- [ ] 动效适配 `prefers-reduced-motion`
- [ ] 表单校验统一策略
- [ ] 错误恢复路径完整
