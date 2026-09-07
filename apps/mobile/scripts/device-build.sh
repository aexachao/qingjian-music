#!/bin/bash
#
# 真机 Release 构建 + 安装 + 启动，输出里只保留「仓库自身代码」的警告/错误。
#
# 依赖的编译警告全部滤掉（node_modules、Pods、Hermes 压缩 jsbundle）：
# 那些代码不在本仓库，改不动也活不过下一次依赖重装，等上游修即可。
# 依赖里的 error: 不会被滤——那说明真出问题了，必须看见。
#
# 用法：
#   scripts/device-build.sh                 # 自动选第一台已连接的设备
#   scripts/device-build.sh <设备UDID>      # 指定设备
#   scripts/device-build.sh --no-install  # 只构建，不装不启动
set -uo pipefail
cd "$(dirname "$0")/.." # apps/mobile

UDID=""
NO_INSTALL=0
for arg in "$@"; do
  case "$arg" in
  --no-install) NO_INSTALL=1 ;;
  *) UDID="$arg" ;;
  esac
done

if [[ -z "$UDID" ]]; then
  UDID=$(xcrun devicectl list devices 2>/dev/null | grep -m1 connected |
    grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
fi
if [[ -z "$UDID" ]]; then
  echo "没有已连接的 iPhone：接上设备并信任后重试，或手动传 UDID（scripts/device-build.sh <UDID>）"
  exit 1
fi
echo "==> 目标设备 $UDID"

# 已知的依赖/生成物/链接器噪音：
# - 依赖的诊断行（warning / note，含多行摘录）按路径整块吞掉：
#   node_modules、Pods、Hermes 压缩 jsbundle、derivedData 里的
#   XCFrameworkIntermediates 头文件副本（源文件都是依赖自己的）
# - 单行噪音：链接器/构建脚本/头文件的说明性输出；
#   ^[+] 是 RN 打包脚本 phase 泄漏出来的 bash xtrace（+/++/+++ 都算）
#   注意：duplicate libraries 不在这里滤——重复库警告出在 app target 上，
#   已用 plugins/with-ios-ldflags-dedupe 从源头修掉，将来再冒出来应该被看见
NOISE_MULTI='(/node_modules/|/Pods/|jsbundle|XCFrameworkIntermediates).*(warning|note):'
# include 链追踪行（「In file included from A.h:9:」），指向依赖时整链没用
NOISE_INCLUDE='^In file included from .*(/node_modules/|/Pods/|/tmp/qj-device-build)'
NOISE_LINE='has no symbols|Run script build phase|Bundler cache|umbrella header|dynamic_lookup|^[+]'

filter_noise() {
  awk -v multi="$NOISE_MULTI" -v include="$NOISE_INCLUDE" -v single="$NOISE_LINE" '
    function is_diagnostic(line) { return line ~ /: (warning|error|note):/ }
    function is_ours(line) {
      # 自己代码的诊断：绝对路径开头，且不在依赖目录、SDK、构建产物副本里
      return is_diagnostic(line) \
        && line ~ /^\// \
        && line !~ multi \
        && line !~ /^\/Applications\// \
        && line !~ /^\/tmp\/qj-device-build/
    }
    {
      # 链接器输出（ld: warning: ...）：会撞上诊断行的 ": warning:" 模式，
      # 先分流——链接器警告出在我们 app target 上，永远要看
      if ($0 ~ /^ld: /) {
        skip = 0
        if ($0 ~ single) next
        print
        next
      }
      show = 1
      if (is_diagnostic($0)) {
        # 诊断行只放行两类：自己代码的、任何来源的 error；
        # 其余（依赖 / SDK / <module-includes> / 构建产物副本）连摘录一起吞
        if ($0 !~ /: error:/ && !is_ours($0)) { skip = 1; show = 0 }
        else skip = 0
      } else if (skip && $0 !~ /^ld: / && $0 !~ /^\*\*/) {
        # 吞模式里的非诊断行（摘录 / ^ 标记 / include 链）继续吞；
        # 链接器输出（ld:）和构建结果行（**）例外，要显示
        show = 0
      } else if ($0 ~ include) {
        skip = 1
        show = 0
      } else {
        skip = 0
      }
      if (!show) next
      if ($0 ~ single) next
      print
    }
  '
}

LOG=$(mktemp -t qj-build)
echo "==> xcodebuild Release（依赖警告已过滤；完整日志 ${LOG}）"
if ! xcodebuild \
  -workspace ios/app.xcworkspace -scheme app -configuration Release \
  -destination "id=$UDID" -derivedDataPath /tmp/qj-device-build \
  -allowProvisioningUpdates -quiet build 2>&1 | tee "$LOG" | filter_noise; then
  echo "==> 构建失败"
  exit 1
fi
echo "==> 构建成功"

# 汇总：自己代码的警告 + 任何位置的 error（依赖报 error 说明真出问题了）
# SDK 路径（/Applications）的警告属于依赖诊断的一部分，一并排除
OURS=$(grep -E 'warning:|error:' "$LOG" | grep -vE "$NOISE_MULTI|$NOISE_LINE|^/Applications/" || true)
if [[ -n "$OURS" ]]; then
  COUNT=$(echo "$OURS" | wc -l | tr -d ' ')
  echo "==> ⚠️  需要处理的警告/错误（${COUNT} 条，自己代码的警告 + 任何位置的 error）："
  echo "$OURS"
else
  echo "==> 自己代码 0 警告 ✅"
fi

if command -v swiftlint >/dev/null; then
  echo "==> swiftlint"
  swiftlint lint modules 2>&1 | tail -1
fi

if [[ "$NO_INSTALL" -eq 1 ]]; then
  exit 0
fi

APP=/tmp/qj-device-build/Build/Products/Release-iphoneos/app.app
echo "==> 安装到设备"
xcrun devicectl device install app --device "$UDID" "$APP" 2>&1 | grep -E "App installed|ERROR" | head -1

echo "==> 启动（手机必须解锁，否则系统会拒绝拉起）"
LAUNCH=$(xcrun devicectl device process launch --terminate-existing --device "$UDID" com.chrisli.music 2>&1)
if echo "$LAUNCH" | grep -q "Locked"; then
  echo "    手机锁着，启动被拒（FBSOpenApplicationErrorDomain error 7）。解锁后点开图标即可。"
elif echo "$LAUNCH" | grep -q "Launched application"; then
  echo "    已启动 ✅"
else
  echo "$LAUNCH" | tail -3
fi
