---
name: mobile-testing
version: 0.0.2
description: |
  Mobile app automated testing and evaluation for Android and iOS.
  Zero-dependency Python scripts wrapping adb and xcrun simctl for unified device management,
  app installation, performance profiling, log analysis, screenshot capture/comparison,
  and Maestro E2E test orchestration. Use for: testing apps, mobile evaluation,
  performance profiling, E2E tests, device management, crash analysis, visual regression,
  APK installation, app launch time measurement, logcat filtering, ANR detection.
  Triggers: "测试App", "手机测试", "模拟器测试", "App性能", "崩溃分析", "Maestro测试".
---

# Mobile Testing — 移动应用自动化测试与评估

通过 CLI 工具（`adb` / `xcrun simctl` / `maestro`）自动化操控 Android 和 iOS 设备，
执行应用安装、性能采集、日志分析、E2E 测试和视觉回归检测。

## 前置依赖

执行任何操作前，先检测可用工具链。运行以下命令快速诊断：

```bash
# Android
adb version 2>/dev/null && echo "✅ adb available" || echo "❌ adb not found"
adb devices -l 2>/dev/null

# iOS (macOS only)
xcrun simctl list devices available 2>/dev/null && echo "✅ simctl available" || echo "❌ simctl not found"

# Maestro (optional, for E2E)
maestro --version 2>/dev/null && echo "✅ maestro available" || echo "❌ maestro not found (install: curl -Ls https://get.maestro.mobile.dev | bash)"
```

缺少工具时的处理策略：
- `adb` 不可用 → 跳过 Android 相关操作，提示用户安装 Android SDK Platform-Tools
- `xcrun simctl` 不可用 → 跳过 iOS 相关操作（非 macOS 环境正常）
- `maestro` 不可用 → E2E 测试降级为手动 `adb shell input` 操控，或提示安装

## 脚本工具

技能内置以下 Python 脚本（零依赖，仅需 Python 3 标准库）：

| 脚本 | 入口 | 功能 |
|------|------|------|
| `mt` | Bash CLI | 统一入口，路由子命令到对应 Python 脚本 |
| `mt_core.py` | 被导入 | 平台检测、设备发现、通用工具函数 |
| `perf.py` | `./mt perf` | 性能数据多次采样 + Markdown 报告生成 |
| `capture.py` | `./mt capture` | 截图/录屏 + 截图对比（像素级差异） |
| `logmon.py` | `./mt logs` | 日志过滤 + 崩溃/ANR 自动检测 |

脚本路径: `<skill-dir>/scripts/`

用法示例：
```bash
SKILL_DIR="<path-to-mobile-testing>"

# 列出所有设备
$SKILL_DIR/scripts/mt devices

# 性能采集（Android）
$SKILL_DIR/scripts/mt perf --package com.example.app --platform android --samples 5

# 截图
$SKILL_DIR/scripts/mt capture --platform android --output /tmp/screenshot.png

# 截图对比
$SKILL_DIR/scripts/mt capture --compare /tmp/before.png /tmp/after.png --output /tmp/diff.png

# 日志监控
$SKILL_DIR/scripts/mt logs --package com.example.app --platform android --duration 30
```

---

## 工作流 1: 设备发现与管理

### Android 设备/模拟器

```bash
# 列出已连接设备
adb devices -l

# 列出可用 AVD（模拟器镜像）
emulator -list-avds 2>/dev/null

# 启动模拟器（后台）
nohup emulator -avd <avd_name> -no-audio -no-boot-anim > /dev/null 2>&1 &

# 等待设备就绪
adb wait-for-device
adb shell getprop sys.boot_completed  # 返回 1 表示完全启动
```

### iOS 模拟器

```bash
# 列出所有可用模拟器
xcrun simctl list devices available

# 启动指定模拟器
xcrun simctl boot <device_udid>

# 打开 Simulator.app 显示模拟器窗口
open -a Simulator

# 创建新模拟器
xcrun simctl create "Test iPhone" "iPhone 16 Pro" "com.apple.CoreSimulator.SimRuntime.iOS-18-0"

# 重置为干净状态
xcrun simctl erase <device_udid>

# 关闭模拟器
xcrun simctl shutdown <device_udid>
```

### 统一设备列表

使用内置脚本获取跨平台统一视图：
```bash
$SKILL_DIR/scripts/mt devices
```
输出格式：
```
Platform  | Device                | ID                                   | Status
----------+-----------------------+--------------------------------------+---------
Android   | Pixel_7_API_34        | emulator-5554                        | online
Android   | Samsung Galaxy S23    | R5CR1234567                          | online
iOS       | iPhone 16 Pro         | 8A1B2C3D-4E5F-6789-ABCD-EF0123456789 | booted
iOS       | iPad Air              | 1234ABCD-5678-EFGH-IJKL-MNOP9012QRST | shutdown
```

---

## 工作流 2: 应用快速评估

"快速评估"是最常用的工作流 —— 给 Agent 一个 APK/IPA（或 .app），自动跑一遍基础体检。

### Step 1: 安装应用

```bash
# Android
adb install -r /path/to/app.apk               # -r 覆盖安装
adb install-multiple -r /path/to/*.apk         # Split APK

# iOS Simulator
xcrun simctl install booted /path/to/App.app   # 必须是 .app 目录，不是 .ipa

# iOS 真机（需要 ios-deploy 或 Xcode）
ios-deploy --bundle /path/to/App.app
```

### Step 2: 获取应用信息

```bash
# Android — 获取包名和启动 Activity
aapt dump badging /path/to/app.apk | grep -E "package:|launchable-activity:"
# 或从已安装应用
adb shell pm list packages | grep <keyword>
adb shell dumpsys package <package> | grep -A 1 "MAIN"

# iOS — 获取 Bundle ID
# 从 .app 目录
plutil -extract CFBundleIdentifier raw /path/to/App.app/Info.plist
# 已安装应用
xcrun simctl listapps booted | plutil -extract - json - | python3 -c "import sys,json;[print(k) for k in json.load(sys.stdin)]"
```

### Step 3: 启动应用并等待稳定

```bash
# Android — 测量冷启动时间
adb shell am force-stop <package>
adb shell am start -W <package>/<activity>
# 输出包含 TotalTime (ms)

# iOS
xcrun simctl terminate booted <bundle_id> 2>/dev/null
xcrun simctl launch booted <bundle_id>
```

### Step 4: 截图巡检

```bash
# Android
adb exec-out screencap -p > /tmp/screen_home.png

# iOS
xcrun simctl io booted screenshot /tmp/screen_home.png
```

截取关键页面截图后，Agent 可以用 `view_file` 查看截图内容，评估 UI 是否正常。

### Step 5: 基础性能快照

```bash
# Android — 内存
adb shell dumpsys meminfo <package> | head -30

# Android — CPU (单次采样)
adb shell top -n 1 -b | grep <package>

# Android — 帧率 (需先操作 UI)
adb shell dumpsys gfxinfo <package> | grep -A 5 "Total frames"

# iOS — 内存 (通过 Instruments 或 Xcode)
# simctl 没有直接的 meminfo，建议使用 Instruments CLI:
xcrun xctrace record --template "Activity Monitor" --device booted --time-limit 10s --output /tmp/perf.trace
```

### Step 6: 生成评估报告

使用内置脚本：
```bash
$SKILL_DIR/scripts/mt perf --package <package> --platform android --samples 3 --output /tmp/eval_report.md
```

或手动组装 Markdown 报告，模板如下：

```markdown
# App Evaluation Report — {App Name}

## Basic Info
| Item | Value |
|------|-------|
| Package | com.example.app |
| Version | 1.2.3 |
| Platform | Android 14 / Pixel 7 |
| Test Time | 2026-03-03 09:30:00 |

## Cold Launch Time
| Metric | Value |
|--------|-------|
| TotalTime | 1234 ms |
| WaitTime | 456 ms |

## Memory Usage
| Metric | Value |
|--------|-------|
| Total PSS | 125 MB |
| Java Heap | 45 MB |
| Native Heap | 62 MB |

## Frame Rendering
| Metric | Value |
|--------|-------|
| Total Frames | 500 |
| Janky Frames | 12 (2.4%) |

## Screenshots
![Home Screen](/tmp/screen_home.png)

## Issues Found
- ⚠️ 冷启动时间超过 2s
- ✅ 内存使用在合理范围
- ✅ 帧率表现正常
```

---

## 工作流 3: E2E 用户旅程测试 (Maestro)

Maestro 是最适合 Agent 生成和执行的 E2E 框架 —— 声明式 YAML，无需编译，跨平台。

### 编写 Maestro 流程

```yaml
# login_flow.yaml
appId: com.example.app
---
- launchApp
- assertVisible: "Welcome"
- tapOn: "Sign In"
- tapOn:
    id: "email_input"
- inputText: "test@example.com"
- tapOn:
    id: "password_input"
- inputText: "password123"
- tapOn: "Log In"
- assertVisible: "Dashboard"
- takeScreenshot: login_success
```

### 流程编写要点

- **用 `id` 而非坐标**：`tapOn: { id: "login_button" }` 比 `tapOn: { point: "200,500" }` 稳定得多
- **用 `assertVisible` 验证状态**：每个关键步骤后断言 UI 状态
- **用 `takeScreenshot` 留证**：在关键节点截图，便于后续分析
- **用 `runFlow` 复用**：把登录等通用流程抽成子流程

### 执行测试

```bash
# 单个流程
maestro test login_flow.yaml

# 整个目录
maestro test flows/

# 指定设备
maestro test --device emulator-5554 login_flow.yaml

# 生成报告
maestro test --format junit --output /tmp/report.xml flows/
```

### 无 Maestro 降级方案

如果 Maestro 不可用，可用 `adb shell` 执行基础 UI 操控：

```bash
# 点击坐标
adb shell input tap 540 960

# 输入文本
adb shell input text "hello"

# 滑动
adb shell input swipe 540 1500 540 500 300

# 按键
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_ENTER

# 等待 + 截图验证
sleep 2
adb exec-out screencap -p > /tmp/after_tap.png
```

iOS Simulator 的降级方案需要 AppleScript 或 XCUITest，复杂度较高，
建议在 iOS 场景下优先安装 Maestro。

> 需要更详细的 Maestro 指南？读取 `references/maestro_guide.md`

---

## 工作流 4: 性能深度分析

超越"快照"，执行多次采样并做统计分析。

### 使用内置脚本

```bash
# Android 性能分析（5 次采样）
$SKILL_DIR/scripts/mt perf \
  --package com.example.app \
  --platform android \
  --samples 5 \
  --output /tmp/perf_report.md

# iOS 性能分析
$SKILL_DIR/scripts/mt perf \
  --package com.example.app \
  --platform ios \
  --samples 3 \
  --output /tmp/perf_report.md
```

报告输出统计摘要（mean ± stddev），标记异常值。

### 手动分析命令

详见 `references/android_commands.md` 和 `references/ios_commands.md`。

关键指标速查：

| 指标 | Android 命令 | iOS 方法 |
|------|-------------|---------|
| 冷启动时间 | `adb shell am start -W` | `xcrun simctl launch --console-pty` + 解析日志 |
| 内存 | `adb shell dumpsys meminfo <pkg>` | Instruments / `footprint` |
| CPU | `adb shell top -n 1 \| grep <pkg>` | Instruments |
| 帧率 | `adb shell dumpsys gfxinfo <pkg>` | Instruments (Core Animation) |
| 网络 | `adb shell dumpsys netstats \| grep <pkg>` | Instruments (Network) |
| 电量 | `adb shell dumpsys batterystats` | Instruments (Energy Log) |

---

## 工作流 5: 日志监控与崩溃分析

### 实时日志过滤

```bash
# Android — 按包名过滤
adb logcat --pid=$(adb shell pidof <package>) -v time

# Android — 只看 Error 及以上
adb logcat *:E -v time

# Android — 保存到文件（限时 30s）
timeout 30 adb logcat --pid=$(adb shell pidof <package>) -v time > /tmp/app.log

# iOS Simulator — 实时日志
xcrun simctl spawn booted log stream --predicate 'subsystem == "<bundle_id>"' --level error
```

### 使用内置脚本（自动崩溃检测）

```bash
$SKILL_DIR/scripts/mt logs \
  --package com.example.app \
  --platform android \
  --duration 30 \
  --output /tmp/crash_report.md
```

脚本自动检测以下模式：
- **Java Crash**: `FATAL EXCEPTION`、`java.lang.`
- **Native Crash**: `SIGABRT`、`SIGSEGV`、`backtrace:`
- **ANR**: `ANR in`、`Input dispatching timed out`
- **OOM**: `OutOfMemoryError`

输出包含崩溃摘要、堆栈片段和发生时间。

---

## 工作流 6: 视觉回归检测

对比两张截图，检测像素级差异。

```bash
# 截取 before/after 截图
$SKILL_DIR/scripts/mt capture --platform android --output /tmp/before.png
# ... 执行操作或更新版本 ...
$SKILL_DIR/scripts/mt capture --platform android --output /tmp/after.png

# 对比
$SKILL_DIR/scripts/mt capture \
  --compare /tmp/before.png /tmp/after.png \
  --output /tmp/diff_report.md \
  --threshold 0.01
```

对比结果包含：
- 差异像素百分比
- 差异区域可视化（生成 diff 图片）
- PASS / FAIL 判定（基于阈值）

---

## references/ 目录

| 文件 | 何时读取 |
|------|---------|
| `android_commands.md` | 需要 Android 平台详细命令参考时 |
| `ios_commands.md` | 需要 iOS 平台详细命令参考时 |
| `maestro_guide.md` | 需要编写复杂 Maestro E2E 流程时 |

---

## 最佳实践

1. **先检测环境**：每次测试前先运行 `./mt devices`，确保目标设备在线
2. **隔离测试状态**：测试前清除应用数据（`adb shell pm clear <pkg>` / `xcrun simctl erase`）
3. **多次采样取均值**：性能数据单次不可信，至少 3 次采样
4. **截图存档**：将截图保存到有意义的路径，便于后续对比
5. **日志先清后采**：`adb logcat -c` 清空缓冲区后再开始采集
6. **Maestro 流程模块化**：把登录、导航等通用操作抽成子流程复用
7. **CI 集成**：所有脚本输出标准化 JSON/Markdown，便于流水线解析
