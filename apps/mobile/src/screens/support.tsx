import { useState } from 'react'
import {
  Image,
  type ImageSourcePropType,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { Icon } from '@/components/icon'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { EDITION } from '@/lib/edition-policy'
import { tap } from '@/lib/haptics'
import {
  ALTERNATE_SUPPORT_URL,
  buildSupportView,
  SUPPORT_TIERS,
  type SupportTierId,
} from '@/lib/support-tiers'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

type PaymentChannel = 'alipay' | 'wechat'

const ALIPAY_QR_URL = 'https://qr.alipay.com/fkx10924hbhggsmcj68nu96'
const ALIPAY_SCHEME = `alipays://platformapi/startapp?appId=20000067&url=${encodeURIComponent(ALIPAY_QR_URL)}`

const TIER_IMAGES: Record<SupportTierId, ImageSourcePropType> = {
  water: require('../../assets/support/tier-water.png'),
  'milk-tea': require('../../assets/support/tier-milk-tea.png'),
  coffee: require('../../assets/support/tier-coffee.png'),
}

const TIER_SHORT_LABELS: Record<SupportTierId, string> = {
  water: '喝瓶水',
  'milk-tea': '喝杯奶茶',
  coffee: '喝杯咖啡',
}

const QR_IMAGES = {
  wechat: require('../../assets/support/wechat.png'),
  alipay: require('../../assets/support/alipay.png'),
}

/**
 * 「支持作者」页面。
 *
 * 社区版提供支付渠道选择：
 * - 支付宝：支持点击直接唤起支付宝 App 进入付款页面，免截图扫码。
 * - 微信支付：展示收款二维码并支持一键打开微信。
 *
 * 商店版仅走 IAP（App Store 硬性审核红线），由 buildSupportView 严密守护。
 */
export function SupportScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const { width, fontScale } = useWindowDimensions()
  const stackedTiers = width < 360 || fontScale > 1.3
  const toast = useToast()
  const view = buildSupportView(EDITION)

  const [activeChannel, setActiveChannel] = useState<PaymentChannel>('alipay')
  const [selectedTierId, setSelectedTierId] = useState<SupportTierId>('milk-tea')
  const [showAlipayQr, setShowAlipayQr] = useState(false)

  const selectedTier =
    SUPPORT_TIERS.find((t) => t.id === selectedTierId) ?? SUPPORT_TIERS[1]

  const handleAlipay = async () => {
    tap()
    try {
      const supported = await Linking.canOpenURL(ALIPAY_SCHEME)
      if (supported) {
        await Linking.openURL(ALIPAY_SCHEME)
        return
      }
    } catch {
      // 回退至通用网页链接
    }

    try {
      await Linking.openURL(ALIPAY_QR_URL)
    } catch {
      toast('无法打开支付宝')
    }
  }

  const handleWeChat = async () => {
    tap()
    try {
      const supported = await Linking.canOpenURL('weixin://')
      if (supported) {
        await Linking.openURL('weixin://')
        return
      }
      toast('未检测到微信客户端')
    } catch {
      toast('无法打开微信')
    }
  }

  const openAlternate = async () => {
    if (!ALTERNATE_SUPPORT_URL) return
    tap()
    try {
      await Linking.openURL(ALTERNATE_SUPPORT_URL)
    } catch {
      toast('无法打开链接')
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
    >
      {/* 头部：简洁真诚、无冗余说教 */}
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Icon name="heartOutline" size={24} color={colors.textSecondary} />
        </View>
        <Text style={styles.heroTitle}>支持轻简音乐</Text>
        <Text style={styles.heroSubtitle}>
          {view.showQrCodes
            ? '轻简音乐免费且开源。你的支持将用于日常维护与开发。'
            : '感谢你使用轻简音乐。每一条使用建议，都能帮助它变得更好。'}
        </Text>
      </View>

      {/* 档位：横向一排 3 个拟物小卡片 */}
      {view.showQrCodes ? <View style={[styles.tierRow, stackedTiers && styles.tierRowStacked]}>
        {SUPPORT_TIERS.map((tier) => {
          const isSelected = selectedTierId === tier.id
          return (
            <Pressable
              key={tier.id}
              style={({ pressed }) => [styles.tierCard, stackedTiers && styles.tierCardStacked, isSelected && styles.tierCardSelected, pressed && styles.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${tier.label}，建议金额 ${tier.amountCny} 元`}
              onPress={() => {
                tap()
                setSelectedTierId(tier.id)
              }}
            >
              <Image
                source={TIER_IMAGES[tier.id]}
                style={styles.tierImage}
                resizeMode="contain"
              />
              <Text
                style={[
                  styles.tierTitle,
                  isSelected && styles.tierTitleSelected,
                ]}
              >
                {TIER_SHORT_LABELS[tier.id]}
              </Text>
              <Text
                style={[
                  styles.tierAmount,
                  isSelected && styles.tierAmountSelected,
                ]}
              >
                ¥{tier.amountCny}
              </Text>
            </Pressable>
          )
        })}
      </View> : null}

      {/* 支付渠道与行动区 */}
      {view.showQrCodes ? (
        <View style={styles.channelSection}>
          {/* 轻量 Segmented Control */}
          <View style={styles.segmentContainer}>
            <Pressable
              style={[
                styles.segmentTab,
                activeChannel === 'alipay' && styles.segmentTabActive,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeChannel === 'alipay' }}
              onPress={() => {
                tap()
                setActiveChannel('alipay')
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeChannel === 'alipay' && styles.segmentTextActive,
                ]}
              >
                支付宝
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.segmentTab,
                activeChannel === 'wechat' && styles.segmentTabActive,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeChannel === 'wechat' }}
              onPress={() => {
                tap()
                setActiveChannel('wechat')
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeChannel === 'wechat' && styles.segmentTextActive,
                ]}
              >
                微信支付
              </Text>
            </Pressable>
          </View>

          {/* 渠道行动卡片 */}
          {activeChannel === 'alipay' ? (
            <View style={styles.actionBlock}>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                onPress={() => void handleAlipay()}
              >
                <Text style={styles.primaryButtonText}>
                  前往支付宝
                </Text>
              </Pressable>
              <Text style={styles.actionHint}>
                建议支持 ¥{selectedTier.amountCny}，金额请在支付页填写
              </Text>

              <Pressable
                style={styles.qrToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: showAlipayQr }}
                onPress={() => {
                  tap()
                  setShowAlipayQr((prev) => !prev)
                }}
              >
                <Text style={styles.qrToggleText}>
                  {showAlipayQr
                    ? '收起收款二维码'
                    : '查看收款二维码'}
                </Text>
              </Pressable>

              {showAlipayQr ? (
                <View style={styles.qrCard}>
                  <View style={styles.qrFrame}>
                    <Image
                      source={QR_IMAGES.alipay}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.actionBlock}>
              <View style={styles.qrCard}>
                <View style={styles.qrFrame}>
                  <Image
                    source={QR_IMAGES.wechat}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.actionHint}>
                  保存截图后，在微信中识别二维码并填写金额
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                accessibilityRole="button"
                onPress={() => void handleWeChat()}
              >
                <Text style={styles.secondaryButtonText}>打开微信</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {view.notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{view.notice}</Text>
        </View>
      ) : null}

      {view.showQrCodes && ALTERNATE_SUPPORT_URL ? (
        <Pressable style={styles.alternate} onPress={() => void openAlternate()}>
          <Text style={styles.alternateText}>其他支持方式</Text>
          <Icon name="chevronRight" size={16} color={colors.textQuaternary} />
        </Pressable>
      ) : null}

      <Text style={styles.footer}>
        感谢你的陪伴与支持
      </Text>
    </ScrollView>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },

  // 头部
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  heroBadge: {
    width: 48,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.title3,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },

  // 档位三横排卡片
  tierRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tierRowStacked: { flexDirection: 'column' },
  tierCardStacked: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, justifyContent: 'space-between' },
  pressed: { opacity: 0.7 },
  tierCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 4,
  },
  tierCardSelected: {
    borderColor: colors.stateSelected,
  },
  tierImage: {
    width: 40,
    height: 40,
    marginBottom: 4,
  },
  tierTitle: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tierTitleSelected: {
    color: colors.textPrimary,
  },
  tierAmount: {
    ...typography.callout,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tierAmountSelected: {
    color: colors.textPrimary,
  },

  // 渠道选择区
  channelSection: {
    gap: spacing.md,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.bgButtonSecondary,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentTabActive: {
    backgroundColor: colors.bgCard,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // 行动区
  actionBlock: {
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.ctaPrimaryBg,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.ctaPrimaryText,
  },
  secondaryButton: {
    backgroundColor: colors.bgCard,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionHint: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },

  // 二维码与切换
  qrToggle: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
  },
  qrToggleText: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
  qrCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  qrFrame: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.qrSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  qrImage: { width: 140, height: 140 },

  noticeBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  noticeText: { ...typography.callout, color: colors.textSecondary, textAlign: 'center' },
  alternate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  alternateText: { ...typography.callout, color: colors.textTertiary },
  footer: {
    ...typography.footnote,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
}))
