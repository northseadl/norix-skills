# 质量门禁参考

## 自动化检查模板

### Android 项目

```bash
#!/bin/bash
# Quality gate for Android module changes
set -euo pipefail

# JAVA_HOME: use existing env → Android Studio JBR → fail
AS_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export JAVA_HOME="${JAVA_HOME:-${AS_JBR}}"
[ -d "$JAVA_HOME" ] || { echo "❌ JAVA_HOME not found: $JAVA_HOME"; exit 1; }
cd android

echo "=== Build Check ==="
./gradlew assembleDebug --quiet

echo "=== Lint Check ==="
./gradlew ktlintCheck detekt lint --quiet

echo "=== Unit Tests ==="
./gradlew testDebugUnitTest --quiet

echo "✅ All quality gates passed"
```

### iOS 项目

```bash
#!/bin/bash
# Quality gate for iOS module changes
set -euo pipefail

cd ios

echo "=== Build Check ==="
xcodebuild build -scheme ChuangOperation -destination 'platform=iOS Simulator,name=iPhone 16' -quiet

echo "=== Test ==="
xcodebuild test -scheme ChuangOperation -destination 'platform=iOS Simulator,name=iPhone 16' -quiet

echo "✅ All quality gates passed"
```

### 模块级精准检查

当任务只修改特定模块时，使用精准检查而非全量:

```bash
# 只检查 feature:order 模块
./gradlew :feature:order:testDebugUnitTest :feature:order:ktlintCheck

# 只检查 core:network 模块
./gradlew :core:network:testDebugUnitTest :core:network:ktlintCheck
```

## Diff 范围检查

验收时对比实际变更与 Task Spec 预期:

```bash
# 查看变更文件数
git diff --name-only HEAD~1 | wc -l

# 查看变更行数
git diff --stat HEAD~1

# 检查是否有预期外的文件变更
git diff --name-only HEAD~1 | grep -v "^feature/order/" && echo "⚠️ 超出预期范围"
```

## 验收状态模板

每个任务完成后，生成验收记录:

```markdown
## T{N} 验收记录

- **状态**: ✅ 通过 / ❌ 未通过 / ⚠️ 有条件通过
- **构建**: ✅ `assembleDebug` 通过
- **Lint**: ✅ 0 warnings
- **测试**: ✅ 12/12 通过
- **Diff**: 6 files changed, 320 insertions(+), 12 deletions(-)
- **范围**: ✅ 全部在 `feature/order/` 内
- **人工检查**: ✅ 列表页可正常加载 / ❌ 详情页缺少物流信息
- **备注**: [如果有条件通过，说明遗留问题和计划]
```

## 失败处理

| 失败类型 | 处理方式 |
|:---|:---|
| 构建失败 | 生成修复 Task → 回到 Dispatch |
| 测试失败 | 分析是新 Bug 还是已有测试过时 → 修复或标记 |
| 超出范围 | 审查是否合理 → 合理则 Accept + 更新 Task Spec；不合理则 Revert |
| 功能不完整 | 生成补充 Task → 追加到任务队列 |
