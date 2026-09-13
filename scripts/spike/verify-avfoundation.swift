#!/usr/bin/env swift
/**
 * 用 AVFoundation 验证一个音频文件「能不能真的播」。
 *
 * 为什么需要它：`ffprobe` 通过只说明容器合法，而 iOS 上真正决定能否播放的是
 * **AVFoundation**（RNTP → SwiftAudioEx → AVPlayer）。这个脚本用同一个框架做三件事：
 *   1. `isPlayable` —— AVFoundation 是否认为可播；
 *   2. 时长 / 轨道 / 编解码格式 —— 确认解析结果符合预期；
 *   3. **用 AVAssetReader 真解一遍音频** —— 只判断"能不能打开"是不够的，
 *      分片顺序错时文件仍能打开、但时长会缩水（实测 30s → 2s），必须靠解码+时长交叉校验兜住。
 *
 * 用法：
 *   swift scripts/spike/verify-avfoundation.swift <文件> [期望时长秒]
 *   # 期望时长可选；给了就做 ±0.5s 的交叉校验，不符时以非零码退出
 */

import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
    let usage = Data("用法: verify-avfoundation.swift <文件> [期望时长秒]\n".utf8)
    FileHandle.standardError.write(usage)
    exit(2)
}

let path = args[1]
let expectedDuration = args.count >= 3 ? Double(args[2]) : nil
let url = URL(fileURLWithPath: path)

guard FileManager.default.fileExists(atPath: path) else {
    print("✗ 文件不存在: \(path)")
    exit(1)
}

let asset = AVURLAsset(url: url)
var failures: [String] = []

// 1. AVFoundation 是否认为可播
let playable = asset.isPlayable
print("isPlayable            : \(playable ? "✓ true" : "✗ false")")
if !playable { failures.append("AVFoundation 认为不可播") }

// 2. 时长与轨道
let duration = CMTimeGetSeconds(asset.duration)
print("duration              : \(duration) 秒")
if !duration.isFinite || duration <= 0 {
    failures.append("时长非法（\(duration)）")
}
if let expected = expectedDuration {
    let delta = abs(duration - expected)
    let durationMatches = delta <= 0.5
    print("期望时长              : \(expected) 秒（偏差 \(String(format: "%.3f", delta))）\(durationMatches ? "✓" : "✗")")
    if !durationMatches { failures.append("时长与播放列表不符：期望 \(expected)，实际 \(duration)") }
}

let audioTracks = asset.tracks(withMediaType: .audio)
print("audio tracks          : \(audioTracks.count)")
if audioTracks.isEmpty { failures.append("没有任何音频轨道") }

/// 把 FourCC 转成可读字符串（如 'fLaC' / 'alac'）
func fourCC(_ code: FourCharCode) -> String {
    let bytes = [
        UInt8((code >> 24) & 0xFF), UInt8((code >> 16) & 0xFF),
        UInt8((code >> 8) & 0xFF), UInt8(code & 0xFF)
    ]
    return String(bytes: bytes, encoding: .ascii) ?? String(code)
}

for track in audioTracks {
    for description in track.formatDescriptions {
        guard let format = description as? CMFormatDescription else { continue }
        let subtype = fourCC(CMFormatDescriptionGetMediaSubType(format))
        let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee
        let rate = asbd.map { "\(Int($0.mSampleRate))Hz" } ?? "?"
        let channels = asbd.map { "\($0.mChannelsPerFrame)ch" } ?? "?"
        print("  codec               : \(subtype) \(rate) \(channels)")
    }
}

// 3. 真解一遍：只判断"能打开"会漏掉「分片顺序错 → 时长缩水」这类静默损坏
if let track = audioTracks.first {
    do {
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(
            track: track,
            outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM]
        )
        guard reader.canAdd(output) else {
            failures.append("无法为音频轨道建立读取器")
            print("AVAssetReader        : ✗ canAdd 返回 false")
            exit(1)
        }
        reader.add(output)
        reader.startReading()

        var bufferCount = 0
        var sampleCount = 0
        while let sampleBuffer = output.copyNextSampleBuffer() {
            bufferCount += 1
            sampleCount += CMSampleBufferGetNumSamples(sampleBuffer)
        }
        let statusText: String
        switch reader.status {
        case .completed: statusText = "completed"
        case .failed: statusText = "failed"
        case .cancelled: statusText = "cancelled"
        default: statusText = "unknown"
        }
        print("AVAssetReader         : \(statusText)，解出 \(bufferCount) 个缓冲区 / \(sampleCount) 帧")
        if let error = reader.error {
            print("  reader.error        : \(error.localizedDescription)")
        }
        if reader.status != .completed {
            failures.append("AVAssetReader 未正常完成（\(statusText)）")
        }
        if sampleCount == 0 {
            failures.append("解不出任何音频帧")
        }
    } catch {
        failures.append("AVAssetReader 抛错：\(error.localizedDescription)")
        print("AVAssetReader         : ✗ \(error.localizedDescription)")
    }
}

print("")
if failures.isEmpty {
    print("✓ 通过：AVFoundation 可以播放并完整解码该文件")
    exit(0)
}
print("✗ 失败：")
for failure in failures { print("  - \(failure)") }
exit(1)
