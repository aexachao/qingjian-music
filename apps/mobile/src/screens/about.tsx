import { useState } from 'react'
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useConfirm } from '@/components/confirm-modal'
import { Icon, IconButton, iconSize, type IconName } from '@/components/icon'
import { useBottomSpace } from '@/lib/bottom-space'
import { useAppLogo } from '@/lib/appearance-preferences'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { spacing, typography } from '@/theme/tokens'

const APP_VERSION = '0.1.0'
/** iOS 上架后回填数字 ID（App Store Connect → App 信息）。留空则「五星好评」只展示说明弹窗，不会点了报错 */
const APP_STORE_ID = ''
/** Android 包名，与 app.json 的 android.package 保持一致 */
const ANDROID_PACKAGE = 'com.chrisli.music'

const USER_AGREEMENT_TEXT = `一、服务说明与协议接受
欢迎使用「轻简音乐」（以下简称“本应用”）。本应用是一款专为飞牛音乐（fnOS Mediasrv）设计的第三方私有流媒体客户端工具。通过访问或使用本应用，即表示您已阅读、理解并同意接受本协议的全部条款。

二、使用规范与知识产权
1. 本应用仅作为播放控制与流媒体连接工具，本身不提供、不存储、不分发任何音乐版权音频资源。
2. 您通过本应用访问并播放的所有音乐、封面、歌词等内容均来自您自行部署或经授权访问的私有 NAS 服务器。您应当确保对所存储和播放的内容拥有合法的版权或许可使用权。
3. 本应用之软件架构、界面设计、图标及客户端代码均受知识产权法律保护。

三、服务变更与免责声明
1. 由于本应用依赖您自有的私有服务器环境（如局域网、内网穿透、NAS 硬件及飞牛操作系统），因网络波动、NAS 断网、服务端接口升级变更或硬件故障导致的服务不可用，本应用不承担因此产生的间接损失责任。
2. 在法律允许的最大范围内，本应用按“现状”提供，不包含任何明示或暗示的保证。

四、协议修改
我们保留在必要时修改本协议的权利，更新后的协议将在应用内公布。`

const PRIVACY_POLICY_TEXT = `一、我们的隐私承诺
「轻简音乐」非常重视您的隐私。作为一款私有云 NAS 音乐客户端，我们的核心原则是：数据纯本地传输、零云端中转、零第三方追踪。

二、信息处理与存储方式
1. 服务器地址与认证凭据：
   当您添加并连接飞牛音乐服务器时，输入的服务器地址、用户名及登录凭据（Token / 密码）将严格加密保存在您的设备本地安全存储中（iOS Keychain / Android 硬件级加密容器）。
2. 零外部中转服务器：
   本应用没有部署任何中间代理云端服务器。您在应用内的所有网络请求（音频串流、曲库元数据、封面、歌词获取）均由您的设备直接向您配置的 NAS 服务器发起。
3. 音频与封面缓存：
   为了优化弱网与断网环境下的播放体验，本应用会在您设备本地的缓存目录存储近期收听的音频片段与封面图片。您可以随时在「设置 - 自动缓存歌曲」中一键清除所有缓存文件。

三、权限使用说明
1. 本地网络权限（Local Network）：用于在局域网内发现并连接您的飞牛 NAS 设备。
2. 后台音频播放权限（Background Audio）：用于支持锁屏播放、控制中心控制与通知中心流媒体播放。

四、第三方 SDK 与追踪
本应用不包含任何商业广告 SDK，不植入任何第三方数据分析或用户行为追踪工具，不会收集或上传您的设备标识、位置信息或使用行为。`

export function AboutScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const { activeLogo } = useAppLogo()
  const confirm = useConfirm()
  const [policyType, setPolicyType] = useState<'agreement' | 'privacy' | null>(null)

  const onRatePress = async () => {
    // iOS 走 write-review 直达评分页；Android 走 market://。任一环节不可用就降级到说明弹窗
    const storeUrl = Platform.select({
      ios: APP_STORE_ID ? `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review` : null,
      android: `market://details?id=${ANDROID_PACKAGE}`,
      default: null,
    })
    if (storeUrl) {
      try {
        if (await Linking.canOpenURL(storeUrl)) {
          await Linking.openURL(storeUrl)
          return
        }
      } catch {
        // 落下去走说明弹窗
      }
    }
    confirm({
      title: '五星好评',
      message: '感谢您对「轻简音乐」的喜爱与支持！如果您觉得好用，欢迎向更多喜爱高品质音乐的 NAS 伙伴推荐分享。',
      confirmText: '好的',
      cancelText: '',
      onConfirm: () => {},
    })
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* App 品牌与版本区域 */}
        <View style={styles.heroSection}>
          <Image
            source={activeLogo.source}
            defaultSource={require('../../assets/images/icon.png')}
            style={styles.appIcon}
            resizeMode="cover"
          />
          <Text style={styles.appName}>轻简音乐</Text>
          <Text style={styles.appVersion}>版本 {APP_VERSION}</Text>
          <Text style={styles.appTagline}>为飞牛音乐精心打造的私有流媒体客户端</Text>
        </View>

        {/* 卡片 1：互动与评价 */}
        <View style={styles.card}>
          <AboutRow
            icon="star"
            label="五星好评"
            value="去鼓励一下"
            onPress={() => void onRatePress()}
          />
        </View>

        {/* 卡片 2：法律与政策条款 */}
        <View style={styles.card}>
          <AboutRow
            icon="document"
            label="用户协议"
            onPress={() => setPolicyType('agreement')}
          />
          <View style={styles.divider} />
          <AboutRow
            icon="shield"
            label="隐私政策"
            onPress={() => setPolicyType('privacy')}
          />
        </View>

        {/* 底部版权信息 */}
        <View style={styles.footerSection}>
          <Text style={styles.footerText}>Copyright © 2026 Qingjian Music</Text>
          <Text style={styles.footerSubText}>All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* 用户协议 / 隐私政策 弹窗 */}
      <Modal
        visible={policyType !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPolicyType(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {policyType === 'agreement' ? '用户协议' : '隐私政策'}
            </Text>
            <IconButton
              name="close"
              size={iconSize.md}
              color={colors.textTertiary}
              onPress={() => setPolicyType(null)}
              accessibilityLabel="关闭"
            />
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: bottom + 40 }]}
          >
            <Text style={styles.policyBody}>
              {policyType === 'agreement' ? USER_AGREEMENT_TEXT : PRIVACY_POLICY_TEXT}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function AboutRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName
  label: string
  value?: string
  onPress: () => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={22} color={colors.accent} />
      <Text numberOfLines={1} style={styles.rowLabel}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={iconSize.sm} color={colors.textQuaternary} />
    </Pressable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    marginBottom: spacing.sm,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  appVersion: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  appTagline: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginLeft: 52,
  },
  rowLabel: {
    ...typography.callout,
    fontSize: 16,
    color: colors.textPrimary,
    flex: 1,
  },
  rowValue: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textTertiary,
    marginRight: 4,
  },
  footerSection: {
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  footerSubText: {
    fontSize: 11,
    color: colors.textQuaternary,
  },
  // 弹窗样式
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderDefault,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalContent: {
    flex: 1,
  },
  modalScrollContent: {
    padding: spacing.lg,
  },
  policyBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
}))
