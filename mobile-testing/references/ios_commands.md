# iOS 测试命令速查

## Simulator 管理

```bash
# 列出所有可用模拟器
xcrun simctl list devices available

# 列出已安装的 Runtime
xcrun simctl list runtimes

# JSON 输出（便于脚本解析）
xcrun simctl list devices available -j

# 查看已启动的模拟器
xcrun simctl list devices | grep Booted

# 创建模拟器
xcrun simctl create "Test iPhone" "iPhone 16 Pro" "com.apple.CoreSimulator.SimRuntime.iOS-18-0"
# 返回 UDID

# 启动模拟器
xcrun simctl boot <UDID>
open -a Simulator                                 # 打开 Simulator GUI

# 关闭模拟器
xcrun simctl shutdown <UDID>
xcrun simctl shutdown all                         # 关闭所有

# 重置模拟器（清除数据）
xcrun simctl erase <UDID>

# 删除模拟器
xcrun simctl delete <UDID>
xcrun simctl delete unavailable                   # 删除不可用的

# 克隆模拟器
xcrun simctl clone <UDID> "Clone Name"

# 设置模拟器外观（浅色/深色模式）
xcrun simctl ui <UDID> appearance dark
xcrun simctl ui <UDID> appearance light
```

## 应用管理

```bash
# 安装 .app 到模拟器
xcrun simctl install booted /path/to/App.app

# 卸载
xcrun simctl uninstall booted <bundle_id>

# 启动应用
xcrun simctl launch booted <bundle_id>

# 带参数启动
xcrun simctl launch booted <bundle_id> --argument1 --argument2

# 带日志输出启动
xcrun simctl launch --console-pty booted <bundle_id>

# 停止应用
xcrun simctl terminate booted <bundle_id>

# 列出已安装应用
xcrun simctl listapps booted

# 获取应用容器路径
xcrun simctl get_app_container booted <bundle_id>
xcrun simctl get_app_container booted <bundle_id> data     # 数据目录
xcrun simctl get_app_container booted <bundle_id> groups   # App Groups
```

## 截图与录屏

```bash
# 截图
xcrun simctl io booted screenshot /tmp/screenshot.png
xcrun simctl io booted screenshot --type=jpeg /tmp/screenshot.jpg

# 录屏
xcrun simctl io booted recordVideo /tmp/recording.mp4
# Ctrl+C 停止录制

# 录屏（指定编码）
xcrun simctl io booted recordVideo --codec=h264 /tmp/recording.mp4
```

## 模拟用户操作

iOS Simulator 没有像 adb 那样的 `input tap` 命令，需要通过以下方式：

### 方法 1: AppleScript (macOS)

```bash
# 点击 Simulator 窗口中的坐标
osascript -e 'tell application "Simulator" to activate'
osascript -e 'tell application "System Events" to click at {x, y}'
```

### 方法 2: Maestro（推荐）

```yaml
- tapOn: "Button Text"
- tapOn: { id: "element_id" }
- inputText: "Hello"
- swipe:
    direction: UP
    duration: 500
```

### 方法 3: XCUITest

针对 iOS，推荐使用 XCUITest 进行 UI 测试。需要 Xcode 项目和 Swift 测试代码。

## 推送通知模拟

```bash
# 创建推送通知 payload
cat > /tmp/push.json << 'EOF'
{
  "aps": {
    "alert": {
      "title": "Test Notification",
      "body": "This is a test push notification"
    },
    "badge": 1,
    "sound": "default"
  }
}
EOF

# 发送推送通知
xcrun simctl push booted <bundle_id> /tmp/push.json
```

## 权限管理

```bash
# 预授权权限（避免弹窗）
xcrun simctl privacy booted grant photos <bundle_id>
xcrun simctl privacy booted grant camera <bundle_id>
xcrun simctl privacy booted grant location <bundle_id>
xcrun simctl privacy booted grant microphone <bundle_id>
xcrun simctl privacy booted grant contacts <bundle_id>

# 撤销权限
xcrun simctl privacy booted revoke photos <bundle_id>

# 重置所有权限
xcrun simctl privacy booted reset all <bundle_id>
```

## 媒体与数据

```bash
# 添加照片/视频到模拟器相册
xcrun simctl addmedia booted /path/to/photo.jpg
xcrun simctl addmedia booted /path/to/video.mp4

# 设置状态栏（美化截图）
xcrun simctl status_bar booted override \
  --time "09:41" \
  --batteryLevel 100 \
  --batteryState charged \
  --cellularMode active \
  --cellularBars 4 \
  --wifiBars 3 \
  --operatorName "Carrier"

# 清除状态栏覆盖
xcrun simctl status_bar booted clear
```

## 日志

```bash
# 实时日志流（全部）
xcrun simctl spawn booted log stream --level debug

# 按 subsystem 过滤
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.example.app"'

# 按进程过滤
xcrun simctl spawn booted log stream --predicate 'process == "MyApp"'

# 仅 Error 级别
xcrun simctl spawn booted log stream --level error

# 组合过滤
xcrun simctl spawn booted log stream \
  --predicate 'subsystem == "com.example.app" AND messageType == 16' \
  --level error

# 查看历史日志
xcrun simctl spawn booted log show --last 5m --predicate 'subsystem == "com.example.app"'

# 诊断信息（debug 包）
xcrun simctl diagnose
```

## 系统模拟

```bash
# 网络（需要 Network Link Conditioner 或 Maestro）
# simctl 本身不直接支持网络模拟

# 定位模拟
xcrun simctl location booted set 39.9042,116.4074          # 北京
xcrun simctl location booted set -- -33.8688,151.2093      # 悉尼（注意负数前加 --）

# 路径模拟
xcrun simctl location booted start /path/to/route.gpx

# 停止定位模拟
xcrun simctl location booted clear

# 语言/地区
xcrun simctl spawn <UDID> defaults write "Apple Global Domain" AppleLanguages -array "zh-Hans"
xcrun simctl spawn <UDID> defaults write "Apple Global Domain" AppleLocale "zh_CN"

# iCloud 同步（需要登录 Apple ID）
# 模拟器中的 iCloud 功能有限
```

## Xcode 构建与测试

```bash
# 列出 scheme
xcodebuild -list -workspace <name>.xcworkspace

# 构建应用
xcodebuild build \
  -workspace <name>.xcworkspace \
  -scheme <scheme> \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.0"

# 运行单元测试
xcodebuild test \
  -workspace <name>.xcworkspace \
  -scheme <scheme> \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro"

# 运行 UI 测试
xcodebuild test \
  -workspace <name>.xcworkspace \
  -scheme <scheme>UITests \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro"

# 并行测试
xcodebuild test \
  -workspace <name>.xcworkspace \
  -scheme <scheme> \
  -parallel-testing-enabled YES \
  -maximum-concurrent-test-simulator-destinations 3
```

## 真机调试

真机 iOS 测试需要额外工具：

```bash
# ios-deploy（安装/调试）
brew install ios-deploy
ios-deploy --list                                   # 列出连接的设备
ios-deploy --bundle /path/to/App.app               # 安装并启动
ios-deploy --bundle /path/to/App.app --debug       # 安装并附加调试器

# idevice 系列（libimobiledevice）
brew install libimobiledevice
idevice_id -l                                       # 列出设备 UDID
ideviceinfo                                         # 设备详细信息
idevicescreenshot /tmp/screenshot.png               # 截图
idevicesyslog | grep <bundle_id>                    # 系统日志
ideviceinstaller -i /path/to/app.ipa               # 安装 IPA
ideviceinstaller -U <bundle_id>                     # 卸载
```

## 常用设备标识

| 设备名 | simctl 标识 |
|--------|------------|
| iPhone SE (3rd) | `iPhone SE (3rd generation)` |
| iPhone 15 | `iPhone 15` |
| iPhone 15 Pro | `iPhone 15 Pro` |
| iPhone 15 Pro Max | `iPhone 15 Pro Max` |
| iPhone 16 | `iPhone 16` |
| iPhone 16 Pro | `iPhone 16 Pro` |
| iPad Air | `iPad Air (5th generation)` |
| iPad Pro 11 | `iPad Pro 11-inch (4th generation)` |
| iPad Pro 12.9 | `iPad Pro 12.9-inch (6th generation)` |

> 通过 `xcrun simctl list devicetypes` 查看完整列表
