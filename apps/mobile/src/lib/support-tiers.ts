import type { Edition } from './edition-policy'

/**
 * 「支持作者」的档位与渠道策略（纯逻辑，不 import react-native / expo，可直接单测）。
 *
 * ── 为什么要把「决定」抽出来 ────────────────────────────────────────────────
 * 两个发行版共用同一份界面代码，但**支付渠道完全不同**：
 *   · 社区版（GitHub 分发，不经审核）→ 展示微信 / 支付宝收款码
 *   · 商店版（App Store）→ 必须走 IAP
 *
 * **App Store 明文禁止 App 内出现外部支付渠道**。两版共用代码意味着这条红线
 * 随时可能被误伤，而误伤的代价是上架被拒。所以「渲染什么」不能写在界面里，
 * 必须是一个**被测试盯住的纯函数**。
 *
 * ── 三档在两边的语义不同 ────────────────────────────────────────────────────
 * IAP 是「选档 → 支付」；收款码是「扫码 → 自己填金额」。所以社区版的档位只起
 * **建议金额**的作用，真正收款的是那两张码。别把两边当成同一回事。
 */

export type SupportTierId = 'water' | 'milk-tea' | 'coffee'

export interface SupportTier {
  id: SupportTierId
  label: string
  amountCny: number
  /**
   * 商店版：App Store 内购商品 ID。
   * 未上架前留空 —— 界面据此显示「尚未开通」，而不是给一个点了没反应的按钮。
   */
  sku?: string
}

export const SUPPORT_TIERS: readonly SupportTier[] = [
  { id: 'water', label: '请我喝瓶水', amountCny: 3 },
  { id: 'milk-tea', label: '请我喝杯奶茶', amountCny: 10 },
  { id: 'coffee', label: '请我喝杯咖啡', amountCny: 30 },
] as const

/**
 * 社区版收款码素材，路径相对 `apps/mobile/`。
 * 写成常量是为了让测试能断言**文件真的存在** —— 「界面引用了一个不存在的素材」
 * 是这类功能最容易出的静默故障（页面一片空白，用户以为你不想收钱）。
 */
export const SUPPORT_QR_FILES = {
  wechat: 'assets/support/wechat.png',
  alipay: 'assets/support/alipay.png',
} as const

export type SupportQrId = keyof typeof SUPPORT_QR_FILES

/**
 * 备选的长期支持渠道（爱发电 / GitHub Sponsors 之类）。
 *
 * 留空则不展示 —— 不摆一个点不开的链接。有账号了把地址填进来即可。
 * 对国内用户，扫码仍是转化最高的主路径；这个只是给「想留个名」和海外用户的出口。
 */
export const ALTERNATE_SUPPORT_URL: string | null = null

export type SupportChannel = 'iap' | 'qr'

/** 按发行版决定支付渠道。**商店版恒为 `iap`**，这是 Apple 的硬性要求。 */
export function supportChannelFor(edition: Edition): SupportChannel {
  return edition === 'store' ? 'iap' : 'qr'
}

export interface SupportView {
  channel: SupportChannel
  tiers: readonly SupportTier[]
  /** 是否渲染二维码区。**商店版恒为 false** */
  showQrCodes: boolean
  /** 是否渲染可点的内购按钮。商品没配好就不渲染，免得点了没反应 */
  showPurchaseButtons: boolean
  /** 渠道不可用时给用户的说明；`null` 表示一切正常 */
  notice: string | null
}

export interface SupportViewOptions {
  /** 收款码素材是否齐全。默认按「齐全」处理，由调用方或测试传入实际结果 */
  qrAvailable?: boolean
}

/**
 * 决定「支持作者」页该渲染什么。
 *
 * 两条不变式（都有测试盯着）：
 *   1. 商店版**永不**渲染二维码或任何外部支付渠道；
 *   2. 任何渠道不可用时给出 `notice`，而不是渲染一个坏掉的页面。
 */
export function buildSupportView(
  edition: Edition,
  options: SupportViewOptions = {},
): SupportView {
  const channel = supportChannelFor(edition)

  if (channel === 'iap') {
    const skusConfigured = SUPPORT_TIERS.every((tier) => Boolean(tier.sku))
    return {
      channel,
      tiers: SUPPORT_TIERS,
      showQrCodes: false,
      showPurchaseButtons: skusConfigured,
      notice: skusConfigured ? null : '内购尚未开通。你的支持我收到了，谢谢。',
    }
  }

  const qrAvailable = options.qrAvailable !== false
  return {
    channel,
    tiers: SUPPORT_TIERS,
    showQrCodes: qrAvailable,
    showPurchaseButtons: false,
    notice: qrAvailable ? null : '收款码素材缺失，暂时无法展示。',
  }
}
