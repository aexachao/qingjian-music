import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 播放器初始化（`src/player/setup.ts`）的**行为**测试。
 *
 * ── 为什么单独为这个 100 行的文件写行为测试 ─────────────────────────────────
 * `ensurePlayer()` 是全 App 播放链路的唯一入口：列表点播、迷你条、锁屏、
 * 后续 CarPlay 都要先 await 它。它一旦坏掉，失效模式不是「某个功能不好用」，
 * 而是**整个播放器永久不可用**（播放/暂停/上下一首/点歌全都没反应，
 * 不重启 App 恢复不了）。所以这里值得有可执行的回归测试，而不是只在
 * 注释里写一句「不要写成 setupPromise ??= initialize()」。
 *
 * ── 测试手法（可复制到其它依赖原生模块的代码上） ───────────────────────────
 * 1. `vi.mock('react-native-track-player')` 把原生模块换成一个受控替身 ——
 *    这正是 `transcode-session.test.ts` 已经在用的house 模式；
 * 2. `Platform.OS` 用 getter 暴露，这样同一个用例文件里可以来回切 iOS / Android；
 * 3. `setup.ts` 的初始化状态是**模块级**的，所以每个用例都走
 *    `vi.resetModules()` + 动态 import 拿一份全新实例，用例之间不串味。
 */

const hoisted = vi.hoisted(() => ({
  platform: 'ios' as 'ios' | 'android',
  setupPlayer: vi.fn(),
  updateOptions: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return hoisted.platform
    },
  },
}))

vi.mock('react-native-track-player', () => ({
  default: {
    setupPlayer: hoisted.setupPlayer,
    updateOptions: hoisted.updateOptions,
  },
  AppKilledPlaybackBehavior: { StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification' },
  Capability: {
    Play: 'play',
    Pause: 'pause',
    SkipToNext: 'skip-to-next',
    SkipToPrevious: 'skip-to-previous',
    SeekTo: 'seek-to',
    Stop: 'stop',
    // ⚠️ 与真实原生保持一致：RNTP 的 Android `getConstants()` 里**没有**
    // `CAPABILITY_LIKE`（只有 PLAY / PAUSE / STOP / SEEK_TO / SKIP* /
    // SET_RATING / JUMP*），所以安卓上这个值是 `undefined`。
    // 早先把 mock 写成两端都有 'like'，于是这个坑测不出来 —— mock 与真实不符时，
    // 测试绿灯只是自欺。
    get Like() {
      return hoisted.platform === 'ios' ? 'like' : undefined
    },
  },
  IOSCategoryMode: { Default: 'default' },
}))

async function loadSetup() {
  vi.resetModules()
  return import('../../src/player/setup')
}

/** setupPlayer 最近一次收到的参数 */
function lastSetupOptions(): Record<string, unknown> {
  const calls = hoisted.setupPlayer.mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

/** updateOptions 最近一次收到的参数 */
function lastUpdateOptions(): Record<string, unknown> {
  const calls = hoisted.updateOptions.mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

beforeEach(() => {
  hoisted.platform = 'ios'
  hoisted.setupPlayer.mockReset()
  hoisted.updateOptions.mockReset()
  hoisted.setupPlayer.mockResolvedValue(undefined)
  hoisted.updateOptions.mockResolvedValue(undefined)
})

describe('播放器初始化：失败必须可恢复', () => {
  it('初始化失败后要重新尝试，不能把 rejected promise 留在缓存里', async () => {
    hoisted.setupPlayer.mockRejectedValueOnce(new Error('原生模块还没就绪'))
    const { ensurePlayer } = await loadSetup()

    await expect(ensurePlayer()).rejects.toThrow('原生模块还没就绪')

    // 这个断言是整个文件存在的理由。
    // 一旦有人把实现改回 `setupPromise ??= initialize()`，第二次调用会拿到
    // 同一个 rejected promise，这里就会挂 —— 而线上表现是「播放器永久死掉」。
    await expect(ensurePlayer()).resolves.toBeUndefined()
    expect(hoisted.setupPlayer).toHaveBeenCalledTimes(2)
  })

  it('连续失败也要能持续重试，不会退化成一次性的', async () => {
    hoisted.setupPlayer
      .mockRejectedValueOnce(new Error('第一次失败'))
      .mockRejectedValueOnce(new Error('第二次失败'))
    const { ensurePlayer } = await loadSetup()

    await expect(ensurePlayer()).rejects.toThrow('第一次失败')
    await expect(ensurePlayer()).rejects.toThrow('第二次失败')
    await expect(ensurePlayer()).resolves.toBeUndefined()
    expect(hoisted.setupPlayer).toHaveBeenCalledTimes(3)
  })

  it('并发入口只初始化一次，共享同一个在途 promise', async () => {
    const { ensurePlayer } = await loadSetup()

    await Promise.all([ensurePlayer(), ensurePlayer(), ensurePlayer()])

    expect(hoisted.setupPlayer).toHaveBeenCalledTimes(1)
  })

  it('初始化成功后结果被缓存，后续入口不再重复初始化', async () => {
    const { ensurePlayer } = await loadSetup()

    await ensurePlayer()
    await ensurePlayer()

    expect(hoisted.setupPlayer).toHaveBeenCalledTimes(1)
  })
})

describe('播放器初始化：平台差异', () => {
  it('热重载下「已初始化」不算错误，且仍然补发播放控制选项', async () => {
    // 消息原文必须与 RNTP 抛出的完全一致，见文件末尾的源码核对用例。
    hoisted.setupPlayer.mockRejectedValueOnce(
      new Error('The player has already been initialized via setupPlayer.'),
    )
    const { ensurePlayer } = await loadSetup()

    await expect(ensurePlayer()).resolves.toBeUndefined()
    expect(hoisted.updateOptions).toHaveBeenCalledTimes(1)
  })

  it('「已初始化」也认错误码（iOS/Android 都是 player_already_initialized）', async () => {
    hoisted.setupPlayer.mockRejectedValueOnce(
      Object.assign(new Error('some localized description'), { code: 'player_already_initialized' }),
    )
    const { ensurePlayer } = await loadSetup()

    await expect(ensurePlayer()).resolves.toBeUndefined()
  })

  it('别的初始化错误照旧往上抛，不能被「已初始化」的容错顺手吞掉', async () => {
    hoisted.setupPlayer.mockRejectedValueOnce(new Error('Failed to create audio session'))
    const { ensurePlayer } = await loadSetup()

    await expect(ensurePlayer()).rejects.toThrow('Failed to create audio session')
    expect(hoisted.updateOptions).not.toHaveBeenCalled()
  })

  it('Android 下发缓冲参数', async () => {
    hoisted.platform = 'android'
    const { ensurePlayer } = await loadSetup()

    await ensurePlayer()

    expect(lastSetupOptions()).toMatchObject({ minBuffer: 15, maxBuffer: 60, backBuffer: 30 })
  })

  it('iOS 绝不下发缓冲参数（会连带关掉 automaticallyWaitsToMinimizeStalling，转码流卡在 0 秒）', async () => {
    hoisted.platform = 'ios'
    const { ensurePlayer } = await loadSetup()

    await ensurePlayer()

    const options = lastSetupOptions()
    expect(options).not.toHaveProperty('minBuffer')
    expect(options).not.toHaveProperty('maxBuffer')
    expect(options).not.toHaveProperty('backBuffer')
  })
})

describe('播放器初始化：系统播放控制选项', () => {
  it('初始化后立刻下发一次完整选项', async () => {
    const { ensurePlayer } = await loadSetup()

    await ensurePlayer()

    const options = lastUpdateOptions()
    expect(options.capabilities).toEqual(
      expect.arrayContaining(['play', 'pause', 'skip-to-next', 'skip-to-previous', 'seek-to', 'stop', 'like']),
    )
  })

  it('Android 的能力列表里绝不能有 undefined / null —— 原生没定义 CAPABILITY_LIKE', async () => {
    hoisted.platform = 'android'
    const { ensurePlayer } = await loadSetup()

    await ensurePlayer()

    // 这个 null 会被序列化发到原生，而 RNTP 的
    // `Capability.values()[it]` 对它解包时抛无 message 的 NPE，直接闪退。
    const capabilities = lastUpdateOptions().capabilities as unknown[]
    expect(capabilities).not.toContain(undefined)
    expect(capabilities).not.toContain(null)
  })

  it('Android 不带收藏能力，iOS 才带（Like 是 iOS 独有的 MPFeedbackCommand）', async () => {
    hoisted.platform = 'android'
    const android = await loadSetup()
    await android.ensurePlayer()
    expect(lastUpdateOptions().capabilities).not.toContain('like')

    hoisted.platform = 'ios'
    const ios = await loadSetup()
    await ios.ensurePlayer()
    expect(lastUpdateOptions().capabilities).toContain('like')
  })

  it('收藏状态变化时重发的是整份选项，不会把其它能力清掉', async () => {
    const { ensurePlayer, setLikeState } = await loadSetup()
    await ensurePlayer()
    hoisted.updateOptions.mockClear()

    await setLikeState(true)

    // updateOptions 是整体替换而非合并：只发 likeOptions 会把上下一首、拖动全部清掉。
    const options = lastUpdateOptions()
    expect(options.likeOptions).toMatchObject({ isActive: true })
    expect(options.capabilities).toEqual(
      expect.arrayContaining(['play', 'pause', 'skip-to-next', 'skip-to-previous', 'seek-to', 'stop', 'like']),
    )
  })

  it('播放器尚未初始化时同步收藏状态，不提前触发 updateOptions', async () => {
    const { setLikeState } = await loadSetup()

    await setLikeState(true)

    expect(hoisted.updateOptions).not.toHaveBeenCalled()
  })
})

/**
 * 源码核对：`setup.ts` 用来识别「已初始化」的容错条件，必须与 RNTP **真正抛出的**
 * 文案对得上。
 *
 * 背景（真实事故）：这个容错分支曾经写的是 `message.includes('already initialized')`，
 * 而 RNTP 三端抛出的原文是
 *   "The player has already been initialized via setupPlayer."
 * —— 中间多一个 "been"，于是分支**从来没有命中过**，热重载后播放器直接不可用，
 * 而且不报任何错、看起来像「播放器莫名其妙坏了」。
 *
 * 光有行为测试挡不住「RNTP 哪天改了文案」，所以这里直接去读依赖的原生源码核对：
 * 一旦文案变了，这几条用例会失败并指出要同步改哪里。
 */
describe('播放器初始化：容错条件与 RNTP 文案对齐', () => {
  const MESSAGE = 'The player has already been initialized via setupPlayer.'

  const rntpSource = (relativePath: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../node_modules/react-native-track-player/${relativePath}`, import.meta.url)),
      'utf8',
    )

  it('iOS 的「已初始化」文案与容错条件对得上', () => {
    const swift = rntpSource('ios/RNTrackPlayer/RNTrackPlayer.swift')
    expect(swift).toContain(`reject("player_already_initialized", "${MESSAGE}"`)
  })

  it('Android 的「已初始化」文案与 iOS 一致', () => {
    const kotlin = rntpSource(
      'android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt',
    )
    expect(kotlin).toContain(MESSAGE)
  })

  it('容错条件能匹配真实文案，而旧写法匹配不上（把这个坑钉住）', () => {
    // 现在的条件：同时出现 already 与 initialized
    expect(/already/.test(MESSAGE) && /initialized/.test(MESSAGE)).toBe(true)
    // 曾经写错的写法 —— 少了 "been"，恒为 false
    expect(MESSAGE.includes('already initialized')).toBe(false)
  })
})
