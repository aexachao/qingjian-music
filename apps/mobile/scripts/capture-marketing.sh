#!/usr/bin/env bash

set -euo pipefail

APP_ID="${QJ_APP_ID:-com.chrisli.music}"
DEVICE="${QJ_SIMULATOR:-booted}"
OUTPUT_DIR="${QJ_MARKETING_OUTPUT:-$(pwd)/marketing-captures/zh-Hans}"
SCHEME="${QJ_URL_SCHEME:-qingjianmusic}"
WAIT_SECONDS="${QJ_CAPTURE_WAIT:-4}"

usage() {
  cat <<'EOF'
Usage:
  capture-marketing.sh core [output-directory]
  capture-marketing.sh current <name> [output-directory]

Commands:
  core      Capture deterministic screens reachable through deep links.
  current   Capture the simulator's current stateful view, such as lyrics.

Environment:
  QJ_APP_ID, QJ_SIMULATOR, QJ_MARKETING_OUTPUT, QJ_URL_SCHEME, QJ_CAPTURE_WAIT
EOF
}

ensure_ready() {
  xcrun simctl list devices | grep -q "Booted" || {
    echo "No booted iOS Simulator was found." >&2
    exit 1
  }
  xcrun simctl get_app_container "$DEVICE" "$APP_ID" app >/dev/null
  mkdir -p "$OUTPUT_DIR"
}

capture_url() {
  local name="$1"
  local url="$2"
  xcrun simctl openurl "$DEVICE" "$url"
  sleep "$WAIT_SECONDS"
  xcrun simctl io "$DEVICE" screenshot "$OUTPUT_DIR/$name.png"
}

capture_current() {
  local name="$1"
  xcrun simctl io "$DEVICE" screenshot "$OUTPUT_DIR/$name.png"
}

command="${1:-}"
case "$command" in
  core)
    [[ $# -le 2 ]] || { usage; exit 2; }
    [[ $# -lt 2 ]] || OUTPUT_DIR="$2"
    ensure_ready
    capture_url "01-library" "$SCHEME://library"
    capture_url "02-player" "$SCHEME://player"
    capture_url "06-search" "$SCHEME://search?q=%E6%9C%88%E7%99%BD"
    echo "Captured deterministic marketing screens in $OUTPUT_DIR"
    ;;
  current)
    [[ $# -ge 2 && $# -le 3 ]] || { usage; exit 2; }
    [[ $# -lt 3 ]] || OUTPUT_DIR="$3"
    ensure_ready
    capture_current "$2"
    echo "Captured $OUTPUT_DIR/$2.png"
    ;;
  *)
    usage
    exit 2
    ;;
esac
