/**
 * ⚠️ 2026-09-16：**设置里的音质入口已撤掉**（连同设置页那一行与 `screens/audio-quality-settings.tsx`）。
 * 原因：当前唯一的后端飞牛只有一档输出 —— 服务端忽略转码的 bitrate 参数、恒输出无损 FLAC
 * （实测见 `docs/fnos-transcode.md` 的「实测校正」），所以「标准音质」既省不了流量，
 * 又会让每一首歌都被判定为需要转码。等真有支持码率档位的后端（Emby / Jellyfin 那类），
 * 再把 UI 放回来；**这里的三项偏好与下面的选择逻辑是为此保留的**，别顺手删。
 */
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { StorageMutationQueue } from './storage-mutation-queue'
import { createHydrationQueue } from './hydration-queue'

const KEY_AUDIO_QUALITY_PREFS = 'qj.prefs.audio_quality'

export type QualityOption = 'original' | 'standard'

export const QUALITY_LABELS: Record<QualityOption, string> = {
  original: '原始音质',
  standard: '标准音质',
}

export const QUALITY_DESCRIPTIONS: Record<QualityOption, string> = {
  original: '原文件优先',
  standard: '降低流量和卡顿',
}

interface AudioQualityPreferencesData {
  wifiQuality: QualityOption
  cellularQuality: QualityOption
  downloadQuality: QualityOption
}

interface AudioQualityPreferencesState extends AudioQualityPreferencesData {
  hydrated: boolean
  setWifiQuality: (quality: QualityOption) => void
  setCellularQuality: (quality: QualityOption) => void
  setDownloadQuality: (quality: QualityOption) => void
}

function normalizeQuality(val: unknown): QualityOption {
  if (val === 'standard' || val === 'medium' || val === 'low') return 'standard'
  return 'original'
}

async function persist(state: AudioQualityPreferencesData) {
  try {
    await storageWrites.run(() =>
      SecureStore.setItemAsync(
        KEY_AUDIO_QUALITY_PREFS,
        JSON.stringify({
          wifiQuality: state.wifiQuality,
          cellularQuality: state.cellularQuality,
          downloadQuality: state.downloadQuality,
        }),
      ),
    )
  } catch {
    // 忽略写入错误
  }
}

const storageWrites = new StorageMutationQueue()
const hydration = createHydrationQueue<AudioQualityPreferencesData>()

function ensureHydrated(): void {
  void hydration.hydrate(async () => {
    const raw = await SecureStore.getItemAsync(KEY_AUDIO_QUALITY_PREFS)
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return {
      wifiQuality: data.wifiQuality ? normalizeQuality(data.wifiQuality) : 'original',
      cellularQuality: data.cellularQuality ? normalizeQuality(data.cellularQuality) : 'original',
      downloadQuality: data.downloadQuality ? normalizeQuality(data.downloadQuality) : 'original',
    }
  }, (data, replayed) => {
    useAudioQualityPreferences.setState({ ...data, hydrated: true })
    if (replayed) void persist(data)
  })
}

export const useAudioQualityPreferences = create<AudioQualityPreferencesState>((set, get) => ({
  hydrated: false,
  wifiQuality: 'original',
  cellularQuality: 'original',
  downloadQuality: 'original',
  setWifiQuality: (wifiQuality) => {
    hydration.queue((data) => ({ ...data, wifiQuality }))
    set({ wifiQuality })
    if (hydration.hydrated) void persist(get())
    else ensureHydrated()
  },
  setCellularQuality: (cellularQuality) => {
    hydration.queue((data) => ({ ...data, cellularQuality }))
    set({ cellularQuality })
    if (hydration.hydrated) void persist(get())
    else ensureHydrated()
  },
  setDownloadQuality: (downloadQuality) => {
    hydration.queue((data) => ({ ...data, downloadQuality }))
    set({ downloadQuality })
    if (hydration.hydrated) void persist(get())
    else ensureHydrated()
  },
}))

// 初始化：异步从 SecureStore 恢复
ensureHydrated()
