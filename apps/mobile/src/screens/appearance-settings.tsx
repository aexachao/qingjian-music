import { useEffect, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Icon, iconSize } from '@/components/icon'
import { useBottomSpace } from '@/lib/bottom-space'
import {
  APP_LOGOS,
  THEME_MODE_OPTIONS,
  useAppearancePreferences,
  type AppLogoOption,
  type ThemeMode,
} from '@/lib/appearance-preferences'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { fonts, spacing, typography } from '@/theme/tokens'
import { supportsAlternateIcons } from '../../modules/app-icon'

/**
 * 外观主题设置页（二级页面）：
 * 1. 模块 1：应用主题（亮色、暗色、跟随系统）
 * 2. 模块 2：应用图标（一行 4 格的矩阵，只显示名称，即时全局联动更新）
 */
export function AppearanceSettingsScreen() {
  const colors = useThemeColors()
  const styles = useStyles()
  const bottom = useBottomSpace()
  const { themeMode, activeLogoId, setThemeMode, setActiveLogoId } = useAppearancePreferences()
  const [pendingLogoId, setPendingLogoId] = useState<AppLogoOption['id'] | null>(null)
  /** 平台是否支持更换桌面图标。原生侧是异步方法，所以取一次存进 state */
  const [canChangeAppIcon, setCanChangeAppIcon] = useState(false)

  useEffect(() => {
    let cancelled = false
    // 原生模块不可用（如 Web）或读取失败都按「不支持」处理，整段图标选择器隐藏
    void supportsAlternateIcons()
      .then((supported) => {
        if (!cancelled) setCanChangeAppIcon(supported)
      })
      .catch(() => {
        if (!cancelled) setCanChangeAppIcon(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const onSelectTheme = (mode: ThemeMode) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setThemeMode(mode)
  }

  const onSelectLogo = async (logo: AppLogoOption) => {
    if (pendingLogoId || logo.id === activeLogoId) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setPendingLogoId(logo.id)
    try {
      await setActiveLogoId(logo.id)
    } catch (error) {
      Alert.alert('图标切换失败', error instanceof Error ? error.message : '请稍后重试')
    } finally {
      setPendingLogoId(null)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 分区 1：应用主题 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>应用主题</Text>
          <View style={styles.card}>
            {THEME_MODE_OPTIONS.map((option, index) => {
              const isSelected = themeMode === option.value
              const isLast = index === THEME_MODE_OPTIONS.length - 1

              return (
                <View key={option.value}>
                  <Pressable
                    style={({ pressed }) => [styles.themeRow, pressed && styles.rowPressed]}
                    onPress={() => onSelectTheme(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${option.label}，${option.description}`}
                  >
                    <View style={styles.themeInfo}>
                      <Text style={styles.themeLabel}>{option.label}</Text>
                      <Text style={styles.themeDescription}>{option.description}</Text>
                    </View>
                    {isSelected ? (
                      <Icon name="check" size={iconSize.md} color={colors.accent} />
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </Pressable>
                  {!isLast ? <View style={styles.divider} /> : null}
                </View>
              )
            })}
          </View>
        </View>

        {/* 分区 2：应用图标。平台不支持换图标时整段隐藏（能力由原生模块提供） */}
        {canChangeAppIcon ? (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>应用图标</Text>
            <Text style={styles.sectionSubtitle}>
              {pendingLogoId ? '正在切换…' : '同步更换 App 内与桌面图标'}
            </Text>
          </View>
          <View style={styles.logoGridCard}>
            <View style={styles.gridContainer}>
              {APP_LOGOS.map((logo) => {
                const isSelected = activeLogoId === logo.id

                return (
                  <Pressable
                    key={logo.id}
                    style={({ pressed }) => [styles.logoItem, pressed && styles.logoItemPressed]}
                    onPress={() => void onSelectLogo(logo)}
                    disabled={pendingLogoId !== null}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected, disabled: pendingLogoId !== null }}
                    accessibilityLabel={`${logo.name}${logo.isDefault ? '，默认图标' : ''}`}
                  >
                    {/*
                      选中态 = 图标外面一圈描边 + 名称变成强调色。
                      不用勾选角标、也不给整格铺底色：底格一上色，4 列下每格只有 80pt 宽，
                      看起来像四个按钮而不是一排图标。外圈留 5pt 空隙（2pt 描边 + 3pt 间距），
                      描边不贴着图标才像「选中的框」而不是「图标自带的边」。
                    */}
                    <View style={[styles.logoRing, isSelected && styles.logoRingSelected]}>
                      <Image source={logo.source} style={styles.logoImage} resizeMode="cover" />
                    </View>
                    <Text numberOfLines={1} style={[styles.logoName, isSelected && styles.logoNameActive]}>
                      {logo.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    ...typography.subhead,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  sectionSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textQuaternary,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    overflow: 'hidden',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    minHeight: 60,
  },
  rowPressed: {
    backgroundColor: colors.bgCardHover,
  },
  themeInfo: {
    flex: 1,
    gap: 3,
    paddingRight: spacing.md,
  },
  themeLabel: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  themeDescription: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textTertiary,
  },
  checkPlaceholder: {
    width: iconSize.md,
    height: iconSize.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderDefault,
    marginLeft: spacing.lg,
  },
  logoGridCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    padding: spacing.sm,
  },
  /**
   * 一行固定 4 个。用 `width: '25%'` 而不是 `flexGrow` + `gap`：
   * 后者会把 3 个图标拉伸铺满整行，第 4 格就不存在了 —— 而需求是
   * 「只有 3 个也按 4 个排」，第 4 格必须留白。
   */
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  logoItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
    gap: 7,
  },
  logoItemPressed: {
    opacity: 0.65,
  },
  logoRing: {
    width: 74,
    height: 74,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRingSelected: {
    borderColor: colors.accent,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  logoName: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  logoNameActive: {
    fontFamily: fonts.medium,
    color: colors.accent,
  },
}))
