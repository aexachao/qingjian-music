import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import {
  applyEvent,
  emptyProfile,
  extractTrackFeatures,
  type TasteProfile,
  type TasteSignal,
  type Track,
} from '@qj/core-domain'

/**
 * 本地口味画像的持久化与信号采集（App 侧胶水层）。
 *
 * 画像本身的算法（加权/衰减/融合/打分）是 core-domain 的纯逻辑，这里只负责：
 *   · 按 serverId（= 每个音乐库）分别保存一份画像；
 *   · 把播放行为翻译成 TasteSignal 喂给 applyEvent；
 *   · 存进 Keychain（与 local-favorites 同一套持久化路径）。
 *
 * 刻意做成 fire-and-forget 持久化：采集信号在播放热路径上，不能阻塞。
 */

const KEY_TASTE_PROFILES = 'qj.store.taste_profiles.v1'

type ProfileMap = Record<string, TasteProfile>

interface TasteProfileStore {
  hydrated: boolean
  profiles: ProfileMap
  /** 记录一次播放行为信号 */
  record: (serverId: string, track: Track, signal: TasteSignal, now?: number) => void
  /** 取某个库的当前画像（没有则空画像） */
  profileOf: (serverId: string) => TasteProfile
}

async function persist(profiles: ProfileMap): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_TASTE_PROFILES, JSON.stringify(profiles))
  } catch {
    // 画像丢了不影响功能（下次从行为重新长出来），不打断播放
  }
}

export const useTasteProfileStore = create<TasteProfileStore>((set, get) => ({
  hydrated: false,
  profiles: {},

  record: (serverId, track, signal, now = Date.now()) => {
    if (!serverId) return
    const prev = get().profiles[serverId] ?? emptyProfile(now)
    const next = applyEvent(prev, { features: extractTrackFeatures(track), signal, at: now })
    const profiles = { ...get().profiles, [serverId]: next }
    set({ profiles })
    void persist(profiles)
  },

  profileOf: (serverId) => get().profiles[serverId] ?? emptyProfile(),
}))

// 初始异步水合（与 local-favorites 同一套模式：模块加载即读回）
void (async () => {
  try {
    const raw = await SecureStore.getItemAsync(KEY_TASTE_PROFILES)
    const parsed = raw ? (JSON.parse(raw) as ProfileMap) : {}
    useTasteProfileStore.setState({
      hydrated: true,
      profiles: parsed && typeof parsed === 'object' ? parsed : {},
    })
  } catch {
    useTasteProfileStore.setState({ hydrated: true })
  }
})()

/** 非 React 环境（播放控制器）里记录信号的便捷入口 */
export function recordTasteSignal(serverId: string, track: Track, signal: TasteSignal): void {
  useTasteProfileStore.getState().record(serverId, track, signal)
}
