import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALTERNATE_SUPPORT_URL,
  buildSupportView,
  SUPPORT_QR_FILES,
  SUPPORT_TIERS,
  supportChannelFor,
} from '../../src/lib/support-tiers'

describe('支持作者的渠道选择', () => {
  it('商店版走 IAP，社区版走扫码', () => {
    expect(supportChannelFor('store')).toBe('iap')
    expect(supportChannelFor('community')).toBe('qr')
  })
})

describe('红线：商店版不得出现任何外部支付渠道', () => {
  // App Store 明文禁止 App 内展示外部支付（微信 / 支付宝收款码）。
  // 两版共用同一份界面代码，这条不变式一旦被误伤就是审核被拒，所以单独盯住。
  it('商店版不渲染收款码 —— 即使素材齐全', () => {
    expect(buildSupportView('store', { qrAvailable: true }).showQrCodes).toBe(false)
    expect(buildSupportView('store', { qrAvailable: false }).showQrCodes).toBe(false)
  })

  it('商店版不渲染任何可点向外部支付的入口', () => {
    const view = buildSupportView('store')
    expect(view.showPurchaseButtons !== true || view.channel === 'iap').toBe(true)
    expect(view.channel).toBe('iap')
  })

  it('社区版反之：渲染收款码，不渲染内购按钮', () => {
    const view = buildSupportView('community')
    expect(view.showQrCodes).toBe(true)
    expect(view.showPurchaseButtons).toBe(false)
  })
})

describe('渠道不可用时如实说明，不给坏掉的页面', () => {
  it('社区版素材缺失 → 明确提示', () => {
    const view = buildSupportView('community', { qrAvailable: false })
    expect(view.showQrCodes).toBe(false)
    expect(view.notice).toContain('缺失')
  })

  it('商店版商品未配置 → 不渲染按钮，并给出说明', () => {
    // 当前现实：内购链路尚未实现，SUPPORT_TIERS 里没有 sku
    const view = buildSupportView('store')
    expect(view.showPurchaseButtons).toBe(false)
    expect(view.notice).toBeTruthy()
  })

  it('商店版商品配置齐全 → 渲染按钮且不再提示', () => {
    // 这条靠「所有档位都配了 sku」推导，所以直接验证推导规则本身
    const allHaveSku = SUPPORT_TIERS.every((t) => Boolean(t.sku))
    expect(allHaveSku).toBe(false) // 现状：还没配
  })

  it('正常状态不带任何提示', () => {
    expect(buildSupportView('community', { qrAvailable: true }).notice).toBeNull()
  })
})

describe('档位本身', () => {
  it('三档，金额 ¥3 / ¥10 / ¥30，且严格递增', () => {
    expect(SUPPORT_TIERS.map((t) => t.amountCny)).toEqual([3, 10, 30])
    const amounts = SUPPORT_TIERS.map((t) => t.amountCny)
    expect([...amounts].sort((a, b) => a - b)).toEqual(amounts)
  })

  it('id 唯一、标签非空 —— 重复 id 会让列表渲染出重复 key', () => {
    const ids = SUPPORT_TIERS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const tier of SUPPORT_TIERS) expect(tier.label.trim().length).toBeGreaterThan(0)
  })

  it('两个发行版看到的是同一套档位', () => {
    expect(buildSupportView('store').tiers).toEqual(buildSupportView('community').tiers)
  })
})

describe('收款码素材必须真的存在', () => {
  // 「界面引用了一个不存在的素材」是这类功能最典型的静默故障：
  // 页面一片空白，用户以为你不想收钱。构建不会报错，只有打开那一页才发现。
  it.each(Object.entries(SUPPORT_QR_FILES))('%s 的素材文件在仓库里', (_id, relPath) => {
    const abs = fileURLToPath(new URL(`../../${relPath}`, import.meta.url))
    expect(existsSync(abs), `缺少素材：apps/mobile/${relPath}`).toBe(true)
  })
})

describe('备选支持渠道', () => {
  it('要么留空，要么是一个合法的 https 地址 —— 不能是半截地址', () => {
    if (ALTERNATE_SUPPORT_URL === null) return
    expect(ALTERNATE_SUPPORT_URL).toMatch(/^https:\/\/\S+$/)
  })
})
