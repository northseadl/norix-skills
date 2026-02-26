# Mermaid 语法速查

> Agent 生成 Mermaid 代码时参考本文件。

## 流程图 (Flowchart)

```mermaid
flowchart LR
    A[开始] --> B{条件判断}
    B -->|是| C[执行操作]
    B -->|否| D[结束]
    C --> D
```

方向: `TB`(从上到下), `TD`, `BT`, `LR`(从左到右), `RL`

节点形状:
- `[文本]` 矩形
- `(文本)` 圆角矩形
- `{文本}` 菱形
- `([文本])` 体育场形
- `[[文本]]` 子程序
- `[(文本)]` 圆柱形
- `((文本))` 圆形
- `>文本]` 旗帜形

连接:
- `-->` 箭头
- `---` 无箭头
- `-.->` 虚线箭头
- `==>` 粗箭头
- `-->|标签|` 带标签的箭头

子图:
```mermaid
flowchart TB
    subgraph 服务层
        A[认证] --> B[订单]
    end
    subgraph 数据层
        C[(PostgreSQL)]
    end
    B --> C
```

## 时序图 (Sequence Diagram)

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as API 网关
    participant S as 业务服务
    participant D as 数据库

    U->>A: POST /api/orders
    A->>S: 创建订单
    S->>D: INSERT
    D-->>S: order_id
    S-->>A: 201 Created
    A-->>U: 返回订单
```

箭头:
- `->>` 实线箭头
- `-->>` 虚线箭头
- `-x` 实线叉
- `--x` 虚线叉

高级:
```mermaid
sequenceDiagram
    alt 成功
        A->>B: 请求
        B-->>A: 200
    else 失败
        A->>B: 请求
        B-->>A: 500
    end
    
    loop 每 5 秒
        A->>B: 心跳
    end
    
    Note over A,B: 这是一个注释
```

## ER 图 (Entity Relationship)

```mermaid
erDiagram
    USER ||--o{ ORDER : "下单"
    ORDER ||--|{ ORDER_ITEM : "包含"
    PRODUCT ||--o{ ORDER_ITEM : "关联"

    USER {
        int id PK
        string name
        string email UK
    }
    ORDER {
        int id PK
        int user_id FK
        decimal total
        string status
    }
```

关系:
- `||--||` 一对一
- `||--o{` 一对多
- `o{--o{` 多对多

## 类图 (Class Diagram)

```mermaid
classDiagram
    class User {
        +int id
        +string name
        +login() bool
    }
    class Order {
        +int id
        +decimal total
        +cancel() void
    }
    User "1" --> "*" Order : 拥有
```

## 状态图 (State Diagram)

```mermaid
stateDiagram-v2
    [*] --> 待审核
    待审核 --> 已通过 : 审核通过
    待审核 --> 已拒绝 : 审核拒绝
    已通过 --> 已完成 : 用户确认
    已拒绝 --> [*]
    已完成 --> [*]
```

## 甘特图 (Gantt)

```mermaid
gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 设计
        需求分析    :a1, 2024-01-01, 7d
        UI 设计     :a2, after a1, 5d
    section 开发
        后端开发    :b1, after a2, 14d
        前端开发    :b2, after a2, 10d
    section 测试
        集成测试    :c1, after b1, 5d
```

## 饼图 (Pie)

```mermaid
pie title 用户来源
    "搜索引擎" : 45
    "直接访问" : 25
    "社交媒体" : 20
    "其他" : 10
```

## 思维导图 (Mindmap)

```mermaid
mindmap
    root((产品规划))
        用户系统
            注册登录
            个人中心
            权限管理
        订单系统
            下单流程
            支付集成
            退款处理
        运营后台
            数据统计
            内容管理
```

## 时间线 (Timeline)

```mermaid
timeline
    title 产品里程碑
    2024-Q1 : 需求调研 : 原型设计
    2024-Q2 : MVP 开发 : 内测
    2024-Q3 : 公测 : 优化迭代
    2024-Q4 : 正式发布
```

## Git 图 (Gitgraph)

```mermaid
gitGraph
    commit
    branch feature/auth
    commit id: "添加登录"
    commit id: "添加注册"
    checkout main
    merge feature/auth
    commit id: "发布 v1.0"
```

## 用户旅程图 (User Journey)

PM 高频场景：用户体验梳理、触点分析、满意度评估。

```mermaid
journey
    title 用户下单旅程
    section 发现
        搜索商品: 5: 用户
        浏览详情: 4: 用户
        查看评价: 3: 用户
    section 决策
        加入购物车: 4: 用户
        选择规格: 3: 用户
        确认地址: 2: 用户
    section 支付
        选择支付方式: 3: 用户
        完成支付: 5: 用户
    section 售后
        等待发货: 2: 用户
        确认收货: 4: 用户
```

分数 1-5 表示满意度（1=沮丧，5=满意）。每个步骤格式: `描述: 分数: 角色`

## 象限图 (Quadrant Chart)

PM 高频场景：需求优先级排序（影响力×成本）、竞品定位、功能评估。

```mermaid
quadrantChart
    title 需求优先级矩阵
    x-axis 实现成本低 --> 实现成本高
    y-axis 业务价值低 --> 业务价值高
    quadrant-1 优先做
    quadrant-2 规划做
    quadrant-3 考虑放弃
    quadrant-4 快速验证
    登录优化: [0.2, 0.9]
    支付重构: [0.8, 0.95]
    暗黑模式: [0.3, 0.3]
    推送通知: [0.15, 0.6]
    AI 推荐: [0.7, 0.8]
    国际化: [0.9, 0.4]
    埋点优化: [0.1, 0.5]
```

坐标 `[x, y]` 范围 0~1。象限编号：1=右上 2=左上 3=左下 4=右下

## XY 图表 (XY Chart)

PM 高频场景：趋势分析、数据对比、指标追踪。

```mermaid
xychart-beta
    title "月度活跃用户趋势"
    x-axis ["1月", "2月", "3月", "4月", "5月", "6月"]
    y-axis "万人" 0 --> 50
    bar [12, 18, 25, 22, 30, 42]
    line [12, 18, 25, 22, 30, 42]
```

支持 `bar`（柱状图）和 `line`（折线图）叠加显示。

## 桑基图 (Sankey)

PM 高频场景：用户漏斗分析、流量分布、转化路径。

```mermaid
sankey-beta

首页,搜索页,5000
首页,分类页,3000
首页,跳出,2000
搜索页,商品详情,4000
搜索页,跳出,1000
分类页,商品详情,2500
分类页,跳出,500
商品详情,下单,3500
商品详情,跳出,3000
下单,支付成功,3000
下单,放弃支付,500
```

格式: `来源,目标,数值`（每行一条流向），无需缩进。
## Block 图 (Block Diagram)

PM 高频场景：系统模块划分、信息架构、页面结构。

```mermaid
block-beta
    columns 3
    A["前端应用"]:3
    B["API 网关"]:3
    C["用户服务"] D["订单服务"] E["支付服务"]
    F["PostgreSQL"]:2 G["Redis"]

    A --> B
    B --> C
    B --> D
    B --> E
    C --> F
    D --> F
    E --> G
```

`columns N` 定义列数，`:N` 指定跨列数。块之间用 `-->` 连接。

## C4 架构图 (C4 Diagram)

PM 高频场景：系统架构概览、技术方案评审、上下文边界。

### Context（系统上下文）

```mermaid
C4Context
    title 电商平台 - 系统上下文

    Person(user, "用户", "通过 App/Web 下单购物")
    Person(admin, "运营人员", "管理商品、订单")

    System(shop, "电商平台", "核心交易系统")
    System_Ext(pay, "支付网关", "微信/支付宝")
    System_Ext(sms, "短信服务", "阿里云")

    Rel(user, shop, "浏览、下单、支付")
    Rel(admin, shop, "管理后台")
    Rel(shop, pay, "发起支付")
    Rel(shop, sms, "发送通知")
```

### Container（容器视图）

```mermaid
C4Container
    title 电商平台 - 容器视图

    Person(user, "用户")

    Container_Boundary(platform, "电商平台") {
        Container(web, "Web 前端", "Vue 3", "用户界面")
        Container(api, "API 服务", "Go/Gin", "业务逻辑")
        ContainerDb(db, "数据库", "PostgreSQL", "持久化存储")
        Container(cache, "缓存", "Redis", "会话/热数据")
    }

    Rel(user, web, "HTTPS")
    Rel(web, api, "REST API")
    Rel(api, db, "SQL")
    Rel(api, cache, "TCP")
```

核心元素:
- `Person(id, name, desc)` — 用户角色
- `System(id, name, desc)` / `System_Ext(...)` — 内部/外部系统
- `Container(id, name, tech, desc)` / `ContainerDb(...)` — 容器
- `Rel(from, to, label)` — 关系


## 注意事项

1. 子图内容必须缩进
2. 节点文本含 `()` `{}` 时用引号包裹: `A["含(括号)的文本"]`
3. 中文完全支持，无需特殊处理
4. `A[显示文本]` — A 是 ID（用于连接），方括号内是显示文本
5. 流程图必须用 `flowchart` + 方向（`LR`/`TB`），不要用废弃的 `graph`
6. C4 图中 `_Ext` 后缀表示外部系统，`_Boundary` 用于分组
7. Block 图中 `:N` 控制跨列，`columns N` 定义网格列数
8. **手绘风格 (handDrawn)** 支持: flowchart、stateDiagram、sequence、class、er、mindmap、timeline、journey、pie。**不支持**: C4、xychart、sankey、gantt、gitGraph、block（Mermaid 限制，未来可能扩展）
