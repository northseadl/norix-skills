# Maestro E2E 测试指南

## 安装

```bash
# macOS / Linux
curl -Ls "https://get.maestro.mobile.dev" | bash

# 验证安装
maestro --version
```

## 核心概念

Maestro 是**声明式** UI 测试框架：
- 测试用 **YAML** 编写，无需编译
- 内置**智能等待**（自动等待 UI 稳定后再操作）
- **跨平台**（同一个 YAML 文件可在 Android 和 iOS 上运行）
- **文本匹配优先**（不依赖坐标，抗 UI 微调）

## 基础语法

### 最小可运行流程

```yaml
appId: com.example.app
---
- launchApp
- assertVisible: "Welcome"
- tapOn: "Get Started"
```

### 元素定位（优先级从高到低）

```yaml
# 1. 文本匹配（推荐，最直观）
- tapOn: "Sign In"

# 2. Accessibility ID（最稳定）
- tapOn:
    id: "login_button"

# 3. 正则匹配
- tapOn:
    text: "Item \\d+"

# 4. 索引（同文本多匹配时）
- tapOn:
    text: "Add"
    index: 0

# 5. 坐标（最后手段，避免使用）
- tapOn:
    point: "50%,80%"         # 百分比，跨分辨率兼容
```

### 常用命令

```yaml
# --- 应用生命周期 ---
- launchApp                               # 启动应用
- launchApp:
    appId: com.other.app                  # 启动其他应用
    clearState: true                      # 清除数据后启动
    clearKeychain: true                   # 清除 Keychain
- stopApp                                # 停止当前应用
- killApp                                # 强制杀死应用

# --- 点击 ---
- tapOn: "Button Text"
- tapOn:
    id: "element_id"
- longPressOn: "Item"
- doubleTapOn: "Element"

# --- 输入 ---
- inputText: "hello@example.com"
- eraseText: 20                           # 删除 20 个字符
- hideKeyboard                            # 收起键盘

# --- 滑动 ---
- swipe:
    direction: UP                         # UP, DOWN, LEFT, RIGHT
    duration: 500                         # 毫秒
- scroll                                  # 默认向下滚动
- scrollUntilVisible:
    element: "Load More"
    direction: DOWN
    timeout: 10000

# --- 断言 ---
- assertVisible: "Dashboard"
- assertNotVisible: "Error"
- assertTrue:
    id: "toggle"
    enabled: true

# --- 等待 ---
- waitForAnimationToEnd
- extendedWaitUntil:
    visible: "Content Loaded"
    timeout: 15000                        # 最多等 15 秒

# --- 截图 ---
- takeScreenshot: "step_name"             # 保存到报告

# --- 系统 ---
- pressKey: home
- pressKey: back
- pressKey: enter
- openLink: "https://example.com"
- setLocation:
    latitude: 39.9042
    longitude: 116.4074

# --- 条件执行 ---
- runFlow:
    when:
      visible: "Accept Cookies"
    commands:
      - tapOn: "Accept"

# --- 重复 ---
- repeat:
    times: 3
    commands:
      - swipe:
          direction: LEFT
```

## 子流程（复用）

把通用操作抽成独立文件：

```yaml
# flows/login.yaml
appId: com.example.app
---
- tapOn: "Sign In"
- tapOn:
    id: "email_input"
- inputText: "test@example.com"
- tapOn:
    id: "password_input"
- inputText: "password123"
- tapOn: "Log In"
- assertVisible: "Dashboard"
```

在其他流程中引用：

```yaml
# flows/purchase_flow.yaml
appId: com.example.app
---
- runFlow: login.yaml           # 执行登录子流程
- tapOn: "Shop"
- tapOn: "Add to Cart"
- tapOn: "Checkout"
- assertVisible: "Order Confirmed"
```

## 测试数据管理

### 环境变量

```yaml
# 流程中使用变量
appId: com.example.app
---
- inputText: "${EMAIL}"
- inputText: "${PASSWORD}"
```

运行时传入：

```bash
EMAIL="admin@test.com" PASSWORD="secret" maestro test login.yaml
```

### JavaScript 脚本

```yaml
- evalScript: ${
    const randomEmail = `user_${Math.random().toString(36).substr(2,9)}@test.com`
    output.email = randomEmail
  }
- inputText: "${output.email}"
```

## 测试组织

### 目录结构

```
flows/
├── login.yaml              # 登录子流程
├── smoke/
│   ├── home_screen.yaml    # 首页冒烟测试
│   └── profile.yaml        # 个人中心
├── purchase/
│   ├── add_to_cart.yaml
│   └── checkout.yaml
└── regression/
    ├── edge_cases.yaml
    └── error_handling.yaml
```

### 执行

```bash
# 单个流程
maestro test flows/smoke/home_screen.yaml

# 整个目录
maestro test flows/smoke/

# 全部流程
maestro test flows/

# 指定设备
maestro test --device emulator-5554 flows/

# 生成 JUnit 报告
maestro test --format junit --output /tmp/report.xml flows/
```

## Maestro Studio（交互式开发）

```bash
maestro studio
```

在浏览器中打开交互式 IDE：
- 实时查看设备 UI 树
- 点击元素自动生成 YAML 命令
- 逐步执行测试

## CI/CD 集成

### GitHub Actions

```yaml
- name: Run Maestro Tests
  uses: mobile-dev-inc/action-maestro-cloud@v1
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: app/build/outputs/apk/debug/app-debug.apk
    workspace: flows/
```

### 通用 CI

```bash
# 启动模拟器
emulator -avd Pixel_7_API_34 -no-window -no-audio &
adb wait-for-device
adb shell getprop sys.boot_completed | grep -q 1

# 安装应用
adb install app.apk

# 运行测试
maestro test --format junit --output test-results.xml flows/

# 解析结果
# JUnit XML 可被大多数 CI 平台原生解析
```

## 常见陷阱

| 问题 | 原因 | 解决 |
|------|------|------|
| 元素找不到 | 动画未结束 | 加 `waitForAnimationToEnd` |
| 文本匹配失败 | 大小写/空格差异 | 用正则或 `id` 定位 |
| iOS 上权限弹窗阻断 | 系统弹窗覆盖 | 用 `runFlow.when.visible` 条件处理 |
| 测试间状态污染 | 未重置 App | `launchApp: { clearState: true }` |
| 坐标在不同设备失效 | 分辨率差异 | 用百分比或文本/ID 定位 |
| 输入法遮挡元素 | 键盘覆盖 | 先 `hideKeyboard` 再操作 |

## 流程模板

### 通用登录

```yaml
appId: ${APP_ID}
---
- launchApp:
    clearState: true
- assertVisible: "Welcome"
- tapOn: "Sign In"
- tapOn:
    id: "email_field"
- inputText: "${EMAIL}"
- tapOn:
    id: "password_field"
- inputText: "${PASSWORD}"
- tapOn:
    id: "login_button"
- assertVisible: "Home"
- takeScreenshot: "login_success"
```

### 通用注册

```yaml
appId: ${APP_ID}
---
- launchApp:
    clearState: true
- tapOn: "Sign Up"
- evalScript: ${
    output.email = `test_${Date.now()}@example.com`
  }
- tapOn:
    id: "name_field"
- inputText: "Test User"
- tapOn:
    id: "email_field"
- inputText: "${output.email}"
- tapOn:
    id: "password_field"
- inputText: "TestPass123!"
- tapOn:
    id: "confirm_password_field"
- inputText: "TestPass123!"
- tapOn: "Create Account"
- assertVisible: "Welcome"
- takeScreenshot: "registration_success"
```

### 页面遍历（Smoke Test）

```yaml
appId: ${APP_ID}
---
- launchApp
- runFlow: login.yaml

# 遍历主要 Tab
- tapOn: "Home"
- assertVisible: "Home"
- takeScreenshot: "tab_home"

- tapOn: "Search"
- assertVisible: "Search"
- takeScreenshot: "tab_search"

- tapOn: "Profile"
- assertVisible: "Profile"
- takeScreenshot: "tab_profile"

- tapOn: "Settings"
- assertVisible: "Settings"
- takeScreenshot: "tab_settings"
```
