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
import { radius, spacing, typography } from '@/theme/tokens'
import { supportsAlternateIcons } from '../../modules/app-icon'

/**
 * 外观主题设置页（二级页面）：
 * 1. 模块 1：应用主题（亮色、暗色、跟随系统）
 * 2. 模块 2：应用图标（4 款官方 Logo 矩阵选择，即时全局联动更新）
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
                    style={({ pressed }) => [
                      styles.logoItem,
                      isSelected && styles.logoItemSelected,
                      pressed && styles.logoItemPressed,
                    ]}
                    onPress={() => void onSelectLogo(logo)}
                    disabled={pendingLogoId !== null}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected, disabled: pendingLogoId !== null }}
                    accessibilityLabel={`${logo.name}，${logo.description}${logo.isDefault ? '，默认图标' : ''}`}
                  >
                    <View style={styles.logoImageWrapper}>
                      <Image
                        source={logo.source}
                        style={[
                          styles.logoImage,
                          isSelected && styles.logoImageActiveBorder,
                        ]}
                        resizeMode="cover"
                      />
                      {isSelected ? (
                        <View style={styles.selectedBadge}>
                          <Icon name="check" size={12} color={colors.textOnAccent} />
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.logoMeta}>
                      <View style={styles.logoTitleRow}>
                        <Text numberOfLines={1} style={[styles.logoName, isSelected && styles.logoNameActive]}>
                          {logo.name}
                        </Text>
                        {logo.isDefault ? (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>默认</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.logoDesc}>
                        {logo.description}
                      </Text>
                    </View>
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
    padding: spacing.md,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  logoItem: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.bgListItemSoft,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 10,
  },
  logoItemSelected: {
    backgroundColor: 'rgba(246, 44, 85, 0.08)',
    borderColor: colors.accent,
  },
  logoItemPressed: {
    opacity: 0.8,
  },
  logoImageWrapper: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  logoImageActiveBorder: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  selectedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgPrimary,
  },
  logoMeta: {
    alignItems: 'center',
    width: '100%',
    gap: 2,
  },
  logoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  logoName: {
    ...typography.callout,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  logoNameActive: {
    color: colors.accent,
  },
  defaultBadge: {
    backgroundColor: colors.badgeBg,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logoDesc: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
}))
