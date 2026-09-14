import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Icon } from '@/components/icon'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { EDITION } from '@/lib/edition-policy'
import { ALTERNATE_SUPPORT_URL, buildSupportView, SUPPORT_TIERS } from '@/lib/support-tiers'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

/**
 * 收款码。仅社区版渲染 —— 商店版走 IAP，因为 **App Store 禁止 App 内出现外部支付渠道**。
 * 这个判断不在这里做，而在 `buildSupportView()` 里，由测试盯着（见 support-tiers.test.ts）。
 */
const QR_SOURCES = [
  { id: 'wechat' as const, label: '微信', source: require('../../assets/support/wechat.png') },
  { id: 'alipay' as const, label: '支付宝', source: require('../../assets/support/alipay.png') },
]

/**
 * 「支持作者」。
 *
 * 说明写在最前面而不是把收款码怼到脸上 —— 这个页面首先是解释「为什么需要支持」，
 * 其次才是收钱。让人先理解钱花在哪（Apple 年费、开发时间），比催人掏钱更有效。
 */
export function SupportScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const toast = useToast()
  const view = buildSupportView(EDITION)

  const openAlternate = async () => {
    if (!ALTERNATE_SUPPORT_URL) return
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
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="heart" size={26} color={colors.textOnAccent} />
        </View>
        <Text style={styles.heroTitle}>轻简音乐是免费的</Text>
        <Text style={styles.heroBody}>
          <Text>代码以 GPL-3.0 开源，全部功能不设限。</Text>
          <Text>收的是开发与分发的支持 —— 不是代码许可费。</Text>
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        {view.channel === 'qr' ? '如果它帮到了你' : '支持开发'}
      </Text>
      <View style={styles.card}>
        {SUPPORT_TIERS.map((tier, index) => (
          <View key={tier.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <View style={styles.tierRow}>
              <Text style={styles.tierLabel}>{tier.label}</Text>
              <Text style={styles.tierAmount}>¥{tier.amountCny}</Text>
            </View>
          </View>
        ))}
      </View>

      {view.showQrCodes ? (
        <>
          <Text style={styles.sectionTitle}>扫码支持</Text>
          <View style={styles.qrRow}>
            {QR_SOURCES.map((qr) => (
              <View key={qr.id} style={styles.qrCell}>
                <View style={styles.qrFrame}>
                  <Image source={qr.source} style={styles.qrImage} resizeMode="contain" />
                </View>
                <Text style={styles.qrLabel}>{qr.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>
            金额随意，上面三档只是参考。收款码是静态的，付款时自己填金额即可。
          </Text>
        </>
      ) : null}

      {view.notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{view.notice}</Text>
        </View>
      ) : null}

      {ALTERNATE_SUPPORT_URL ? (
        <Pressable style={styles.alternate} onPress={() => void openAlternate()}>
          <Text style={styles.alternateText}>其他支持方式</Text>
          <Icon name="chevronRight" size={16} color={colors.textQuaternary} />
        </Pressable>
      ) : null}

      <Text style={styles.footer}>
        谢谢每一个愿意支持的人。也谢谢只是用它听歌的你。
      </Text>
    </ScrollView>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  hero: { alignItems: 'center', gap: 8, paddingVertical: spacing.lg },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: { ...typography.title3, color: colors.textPrimary },
  heroBody: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    marginLeft: 4,
  },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden' },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  tierLabel: { ...typography.callout, fontSize: 16, color: colors.textPrimary },
  tierAmount: { ...typography.callout, fontSize: 16, fontWeight: '600', color: colors.accent },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle, marginLeft: spacing.lg },
  qrRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  qrCell: { alignItems: 'center', gap: 8 },
  qrFrame: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  qrImage: { width: 148, height: 148 },
  qrLabel: { ...typography.caption, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: spacing.md },
  noticeBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  noticeText: { ...typography.callout, color: colors.textSecondary, textAlign: 'center' },
  alternate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
  },
  alternateText: { ...typography.callout, color: colors.textTertiary },
  footer: {
    ...typography.caption,
    color: colors.textQuaternary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
}))
