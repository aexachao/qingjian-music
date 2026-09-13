import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `src/lib/edition-policy.ts` 的发行版判定。
 *
 * 这几个断言看着琐碎，守的却是两条真会出事的线：
 *   1. **缺省必须是完整版** —— 否则「忘了设变量」的自签构建会让用户看到一个
 *      他根本买不了的付费墙（坏掉的应用，比少赚一笔严重）；
 *   2. **拼错的值必须回退到完整版** —— 否则 `EXPO_PUBLIC_EDITION=Store`
 *      会静默变成商店版，而这类错误不报错、只在用户看到付费墙时才暴露。
 *
 * 模块级常量在 import 时就求值了，所以每条用例都得先设环境变量、
 * 再 resetModules + 动态 import，不能 import 一次到处复用。
 */

const ORIGINAL = process.env.EXPO_PUBLIC_EDITION

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_EDITION
  else process.env.EXPO_PUBLIC_EDITION = ORIGINAL
  vi.resetModules()
})

async function loadEdition() {
  vi.resetModules()
  return import('@/lib/edition-policy')
}

describe('edition-policy 发行版判定', () => {
  it('没有指定发行版时是完整版（GitHub 分发默认全功能）', async () => {
    delete process.env.EXPO_PUBLIC_EDITION

    const mod = await loadEdition()

    expect(mod.EDITION).toBe('community')
    expect(mod.isCommunityEdition).toBe(true)
    expect(mod.EDITION_LABEL).toBe('完整版')
  })

  it('显式 community 也是完整版', async () => {
    process.env.EXPO_PUBLIC_EDITION = 'community'

    const mod = await loadEdition()

    expect(mod.isCommunityEdition).toBe(true)
  })

  it('显式 store 才是商店版', async () => {
    process.env.EXPO_PUBLIC_EDITION = 'store'

    const mod = await loadEdition()

    expect(mod.EDITION).toBe('store')
    expect(mod.isCommunityEdition).toBe(false)
    expect(mod.EDITION_LABEL).toBe('商店版')
  })

  it('取值拼错时回退到完整版，不会静默变成商店版', async () => {
    process.env.EXPO_PUBLIC_EDITION = 'Store'

    const mod = await loadEdition()

    expect(mod.EDITION).toBe('community')
  })
})
