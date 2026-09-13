/**
 * 串行化所有会改 RNTP 队列和 Zustand 镜像的操作，避免多个手势/起播请求互相穿插。
 * 单个任务失败不会毒化后续队列。
 *
 * ── 为什么要看门狗 ──────────────────────────────────────────────────────────
 * 串行队列最致命的失效模式不是「任务失败」，而是**任务永远不 settle**：
 *   `this.tail` 会一直等那个 promise，后面所有操作全部排队等它 ——
 *   表现就是「点播放/上一首/点歌全都没反应」，而且不重启 App 永远恢复不了。
 *
 * 这不是假想：队列里的任务会 await 原生播放器调用和网络请求
 * （`TrackPlayer.load`、转码 `POST /track/transcode`），任何一处 promise
 * 悬挂（原生回调没回来、请求被取消后既不 resolve 也不 reject）都会命中。
 *
 * 所以每个任务都带一个超时上限：
 *   - 超时后向**调用方** reject —— 让它的 `finally` / `catch` 照常执行
 *     （否则 `isLoadingAudio` 会永远停在 true，播放键变成永久转圈）；
 *   - 队列尾部**立刻放行** —— 后面的操作不必为别人的卡死陪葬。
 *
 * 放行后，原任务若「诈尸」回来理论上会和后续操作交错。因此超时值必须明显大于
 * 任何一次正常操作的耗时（目前最长的是转码 POST 的 20s 超时 + 原生加载）。
 * 真的触发超时说明已经出事了，日志会明确报出来。
 */

/** 默认看门狗上限：必须大于「单次转码 POST（20s）+ 原生 load」的正常耗时 */
const DEFAULT_TIMEOUT_MS = 30_000

export interface MutationOptions {
  /** 看门狗上限；传 0 或负数表示不设限（仅限确实需要长时间运行的任务） */
  timeoutMs?: number
  /** 超时日志里用来指认是哪个操作卡住了 */
  label?: string
}

export class AsyncMutationQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(mutation: () => Promise<T>, options: MutationOptions = {}): Promise<T> {
    // 在调用点抓一次栈：超时日志里带上它就能直接指认是哪个操作卡住的，
    // 不用维护一份「谁调用了 run」的手工清单（那种清单迟早会漏）。
    const callSite = new Error('mutation-queue call site')
    const started = this.tail.then(mutation, mutation)
    const guarded = this.guard(started, options, callSite)
    // 队列尾部只跟随「已结束或已超时」的信号，绝不跟随可能永不 settle 的 promise
    this.tail = guarded.then(
      () => undefined,
      () => undefined,
    )
    return guarded
  }

  private guard<T>(task: Promise<T>, { timeoutMs = DEFAULT_TIMEOUT_MS, label }: MutationOptions, callSite: Error): Promise<T> {
    if (!(timeoutMs > 0)) return task
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        console.warn(
          `播放操作超时（${label ?? '未命名'}，${timeoutMs}ms 未结束），已放行后续操作。` +
            '如果反复出现，说明有一次原生调用或网络请求悬挂了。调用点：',
          callSite.stack,
        )
        reject(new Error(`${label ?? '播放操作'} 超时`))
      }, timeoutMs)
      task.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }
}
