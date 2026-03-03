# Android 测试命令速查

## 设备管理

```bash
# 列出设备
adb devices -l

# 指定设备执行（多设备时）
adb -s <serial> <command>

# 等待设备连接
adb wait-for-device

# 检查启动完成
adb shell getprop sys.boot_completed  # "1" = ready

# 设备信息
adb shell getprop ro.build.version.release  # Android version
adb shell getprop ro.product.model           # Device model
adb shell wm size                            # Screen resolution
adb shell wm density                         # Screen density
```

## 模拟器管理

```bash
# 列出可用 AVD
emulator -list-avds

# 启动模拟器（推荐选项）
emulator -avd <name> -no-audio -no-boot-anim -gpu swiftshader_indirect &

# 冷启动（清除快照）
emulator -avd <name> -no-snapshot-load

# 无头模式（CI）
emulator -avd <name> -no-window -no-audio

# 关闭模拟器
adb emu kill
```

## 应用管理

```bash
# 安装
adb install -r /path/to/app.apk          # 覆盖安装
adb install -r -t /path/to/app.apk       # 允许测试 APK
adb install -r -d /path/to/app.apk       # 允许降级

# 卸载
adb uninstall <package>
adb uninstall -k <package>                # 保留数据

# 清除数据
adb shell pm clear <package>

# 列出已安装应用
adb shell pm list packages                # 全部
adb shell pm list packages -3             # 仅第三方
adb shell pm list packages | grep <keyword>

# 获取包信息
adb shell dumpsys package <package> | grep -E "versionName|versionCode|targetSdk"

# 获取 Main Activity
adb shell dumpsys package <package> | grep -A 1 "android.intent.action.MAIN"
adb shell cmd package resolve-activity --brief <package>

# 权限管理
adb shell pm grant <package> android.permission.CAMERA
adb shell pm revoke <package> android.permission.CAMERA
adb shell dumpsys package <package> | grep "permission"
```

## 启动与停止

```bash
# 启动（测量启动时间）
adb shell am start -W <package>/<activity>
# 输出: TotalTime, WaitTime, ThisTime

# 启动（指定 Intent）
adb shell am start -a android.intent.action.VIEW -d "https://example.com" <package>

# 强制停止
adb shell am force-stop <package>

# 杀进程
adb shell kill $(adb shell pidof <package>)
```

## 截图与录屏

```bash
# 截图（直接保存到主机）
adb exec-out screencap -p > screenshot.png

# 截图（保存到设备再拉取）
adb shell screencap /sdcard/screenshot.png
adb pull /sdcard/screenshot.png .

# 录屏（最长 180s）
adb shell screenrecord /sdcard/video.mp4
# Ctrl+C 停止
adb pull /sdcard/video.mp4 .

# 录屏（指定参数）
adb shell screenrecord --time-limit 30 --size 720x1280 --bit-rate 4000000 /sdcard/video.mp4
```

## UI 操控

```bash
# 点击
adb shell input tap <x> <y>

# 滑动
adb shell input swipe <x1> <y1> <x2> <y2> [duration_ms]

# 输入文本
adb shell input text "hello"

# 按键
adb shell input keyevent KEYCODE_HOME
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_ENTER
adb shell input keyevent KEYCODE_MENU
adb shell input keyevent KEYCODE_POWER

# 长按
adb shell input swipe <x> <y> <x> <y> 2000  # 2秒长按

# 获取当前界面信息
adb shell dumpsys window | grep mCurrentFocus
adb shell dumpsys activity top | head -20
```

## 性能分析

### 启动时间

```bash
# 冷启动
adb shell am force-stop <package>
adb shell am start -W <package>/<activity> | grep TotalTime

# 热启动
adb shell input keyevent KEYCODE_HOME
adb shell am start -W <package>/<activity> | grep TotalTime
```

### 内存

```bash
# 简要内存信息
adb shell dumpsys meminfo <package> | head -30

# 关键字段: TOTAL PSS, Java Heap, Native Heap, Code, Stack, Graphics
adb shell dumpsys meminfo <package> | grep -E "TOTAL|Java Heap|Native Heap"

# 系统总内存
adb shell cat /proc/meminfo | head -5
```

### CPU

```bash
# 单次采样
adb shell top -n 1 -b | grep <package>

# 持续监控（每 2 秒）
adb shell top -d 2 | grep <package>

# CPU 信息
adb shell cat /proc/cpuinfo | grep "model name"
```

### 帧率

```bash
# 重置 + 采集
adb shell dumpsys gfxinfo <package> reset
# ... 操作应用 ...
adb shell dumpsys gfxinfo <package>

# 关键指标
adb shell dumpsys gfxinfo <package> | grep -E "Total frames|Janky frames|50th|90th|95th|99th"

# SurfaceFlinger 帧率
adb shell dumpsys SurfaceFlinger --latency <window_name>
```

### 网络

```bash
# 应用网络流量
adb shell cat /proc/net/xt_qtaguid/stats | grep <uid>

# UID 查询
adb shell dumpsys package <package> | grep userId

# 网络连接
adb shell dumpsys connectivity | grep -A 5 "NetworkInfo"
```

### 电量

```bash
# 电池状态
adb shell dumpsys battery

# 模拟电量
adb shell dumpsys battery set level 50

# 详细电量统计
adb shell dumpsys batterystats --charged <package>

# 重置电量统计
adb shell dumpsys batterystats --reset
```

## 日志

```bash
# 实时日志
adb logcat -v time

# 按 PID 过滤
adb logcat --pid=$(adb shell pidof <package>) -v time

# 按级别过滤
adb logcat *:E -v time                    # 仅 Error
adb logcat *:W -v time                    # Warning 及以上

# 按 Tag 过滤
adb logcat -s "MyTag" -v time

# 保存日志到文件
adb logcat -d > /tmp/logcat.txt           # dump 当前缓冲区
timeout 30 adb logcat -v time > /tmp/log_30s.txt

# 清空日志缓冲区
adb logcat -c

# 查看崩溃日志
adb logcat -b crash -v time
```

## 文件操作

```bash
# 推送文件到设备
adb push local_file /sdcard/

# 从设备拉取文件
adb pull /sdcard/file.txt ./

# 列出目录
adb shell ls -la /sdcard/

# 应用私有目录 (需要 root 或 debuggable app)
adb shell run-as <package> ls /data/data/<package>/
```

## 系统模拟

```bash
# 飞行模式
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE

# Wi-Fi 开关
adb shell svc wifi enable
adb shell svc wifi disable

# 移动数据
adb shell svc data enable
adb shell svc data disable

# 时区
adb shell setprop persist.sys.timezone "Asia/Shanghai"

# 语言
adb shell setprop persist.sys.language zh
adb shell setprop persist.sys.country CN
```

## 调试

```bash
# 获取 ANR traces
adb pull /data/anr/traces.txt

# 获取 tombstone（Native Crash）
adb shell ls /data/tombstones/
adb pull /data/tombstones/

# Bug Report（完整系统报告）
adb bugreport /tmp/bugreport.zip

# Heap Dump
adb shell am dumpheap <package> /sdcard/heap.hprof
adb pull /sdcard/heap.hprof
```
