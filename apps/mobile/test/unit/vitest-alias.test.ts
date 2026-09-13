import { describe, expect, it } from 'vitest'

/**
 * 钉住 vitest 的 `@/` 别名配置（`apps/mobile/vitest.config.mts`）。
 *
 * ── 为什么要单独测这个 ──────────────────────────────────────────────────────
 * 这份配置丢了**不会让任何测试失败**。它只会让所有用 `@/` 的模块变成
 * 「import 不进来」→ 于是永远没有行为测试 → 而且没人会注意到缺了什么。
 * `src/player/controller.ts`（957 行播放核心）就是这样一直没测试的：
 * src 下 114/160 个文件用 `@/`，而 vitest 默认不读 tsconfig 的 paths。
 *
 * 所以这里显式走一次别名 import：配置被删或改坏，这条会立刻红。
 * 断言里带上真实行为（不只是「能加载」），避免它退化成一个空壳。
 *
 * 注：别名规则的**顺序**（`@/assets` 必须排在 `@` 前面）不在测试里钉 ——
 * 那是配置文件的文本结构，测它就得退化成源码断言；目前没有测试会 import 资源文件，
 * 风险低于维护成本。该约束写在 vitest.config.mts 的注释里。
 */
describe('测试环境的 @/ 别名可用', () => {
  it('能用 @/ 路径 import 真实模块并调用', async () => {
    const { needsTranscode } = await import('@/player/format-support')

    expect(typeof needsTranscode).toBe('function')
    expect(needsTranscode('flac')).toBe(false)
    expect(needsTranscode('dsf')).toBe(true)
  })
})
