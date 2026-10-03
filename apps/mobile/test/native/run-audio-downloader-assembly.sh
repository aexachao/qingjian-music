#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
output_dir="$repo_root/.cache/repair-20260929"
binary="$output_dir/audio-downloader-assembly"
mkdir -p "$output_dir"

swiftc \
  "$repo_root/apps/mobile/modules/audio-downloader/ios/AudioDownloaderFileAssembler.swift" \
  "$repo_root/apps/mobile/test/native/audio-downloader-assembly.swift" \
  -o "$binary"
"$binary"
