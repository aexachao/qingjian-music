import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isMusicError } from '@qj/core-domain'
import { isFnId, resolveFnIdToBaseUrl } from '@qj/provider-fnos'
import { useServerSession } from '@/lib/server-session'
import { getLastServer, getPassword } from '@/lib/storage'
import { md5Hex, sha256Hex } from '@/lib/crypto'
import { AuthGate } from '@/lib/auth-gate'
import { Icon } from '@/components/icon'
import { OptionPickerModal } from '@/components/option-picker-modal'
import { useAppLogo } from '@/lib/appearance-preferences'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/**
 * 登录界面：
 * - 采用轻简音乐自身品牌资产（App 图标、大标题、Apple 风格圆角材质、主题强调色）；
 * - 布局参考飞牛经典三段式结构：服务器/FN ID、账号、密码、记住密码、HTTPS 开关；
 * - 支持直接输入飞牛 FN ID 并自动走云解析与内外网自适应探测（方案 B）。
 */
export default function LoginScreen() {
  const styles = useStyles()
  const colors = useThemeColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeLogo } = useAppLogo()
  const { signIn, servers, status } = useServerSession()
  const isAddingServer = status === 'signedIn'

  const [address, setAddress] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(true)
  const [useHttps, setUseHttps] = useState(true)

  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 凭据类失败时补一句「怎么重置密码」——只在真正失败的那一刻出现 */
  const [showResetHint, setShowResetHint] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [focusedField, setFocusedField] = useState<'address' | 'username' | 'password' | null>(null)

  const userEditedRef = useRef(false)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleFocus(field: 'address' | 'username' | 'password') {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setFocusedField(field)
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => {
      setFocusedField(null)
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const last = await getLastServer()
      if (cancelled || userEditedRef.current) return
      const target = last ?? servers[0]
      if (target) {
        setAddress(target.baseUrl)
        setUsername(target.username)
        setUseHttps(target.baseUrl.startsWith('https://'))

        const shouldRemember = last?.rememberPassword !== false
        setRememberPassword(shouldRemember)

        if (shouldRemember) {
          const targetServerId =
            last?.serverId ??
            servers.find((s) => s.baseUrl === target.baseUrl && s.username === target.username)?.id
          if (targetServerId) {
            const savedPassword = await getPassword(targetServerId)
            if (!cancelled && savedPassword) {
              setPassword(savedPassword)
            }
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [servers])

  const canSubmit = address.trim().length > 0 && username.trim().length > 0 && password.length > 0 && !busy

  function normalizeAddress(input: string, https: boolean): string {
    const trimmed = input.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed
    }
    const scheme = https ? 'https' : 'http'
    const defaultPort = https ? 5667 : 5666
    if (!trimmed.includes(':')) {
      return `${scheme}://${trimmed}:${defaultPort}`
    }
    return `${scheme}://${trimmed}`
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setShowResetHint(false)
    setStatusMessage(null)

    try {
      const rawInput = address.trim()
      let finalUrl = rawInput

      if (isFnId(rawInput)) {
        setStatusMessage('正在解析 FN ID...')
        finalUrl = await resolveFnIdToBaseUrl({
          fnId: rawInput,
          sha256Hex,
          md5Hex,
          useHttps,
          onStatusChange: (text) => setStatusMessage(text),
        })
      } else {
        finalUrl = normalizeAddress(rawInput, useHttps)
      }

      setStatusMessage('正在连接服务器...')
      await signIn({
        baseUrl: finalUrl,
        username: username.trim(),
        password,
        displayName: isFnId(rawInput) ? rawInput : undefined,
        rememberPassword,
      })
      router.replace(isAddingServer ? '/(tabs)/settings/servers' as never : '/library')
    } catch (caught) {
      if (isMusicError(caught)) {
        // protocol = 飞牛对错误密码返回的 payload 形态异常；unauthorized = token/凭据被拒
        const isCredentialFailure = caught.code === 'protocol' || caught.code === 'unauthorized'
        setError(caught.code === 'protocol' ? '账号或密码不正确' : caught.message)
        setShowResetHint(isCredentialFailure)
      } else {
        setError(caught instanceof Error ? caught.message : '连接失败，请检查地址与网络')
        setShowResetHint(false)
      }
    } finally {
      setBusy(false)
      setStatusMessage(null)
    }
  }

  async function handleSelectHistory(serverId: string) {
    const selected = servers.find((s) => s.id === serverId)
    if (!selected) return
    userEditedRef.current = true
    setAddress(selected.baseUrl)
    setUsername(selected.username)
    setUseHttps(selected.baseUrl.startsWith('https://'))
    const savedPassword = await getPassword(selected.id)
    if (savedPassword) {
      setPassword(savedPassword)
      setRememberPassword(true)
    } else {
      setPassword('')
      setRememberPassword(false)
    }
    setShowHistoryModal(false)
  }

  const historyOptions = servers.map((s) => ({
    key: s.id,
    title: s.displayName || s.baseUrl,
    subtitle: `${s.baseUrl} (${s.username})`,
  }))

  return (
    <AuthGate group="login" allowSignedIn>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isAddingServer ? (
            <Pressable
              hitSlop={10}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="取消添加服务器"
            >
              <Icon name="back" size={24} color={colors.textPrimary} />
            </Pressable>
          ) : null}
          {/* 品牌区域 */}
          <View style={styles.brandSection}>
            <View style={styles.logoWrapper}>
              <Image
                source={activeLogo.source}
                defaultSource={require('../../assets/images/icon.png')}
                style={styles.logo}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* 表单输入卡片区域 */}
          <View style={styles.formSection}>
            {/* 输入框 1：服务器地址 / 域名 / FN ID */}
            <View style={[styles.inputCard, focusedField === 'address' && styles.inputCardFocused]}>
              <TextInput
                style={styles.input}
                value={address}
                onFocus={() => handleFocus('address')}
                onBlur={handleBlur}
                onChangeText={(v) => {
                  userEditedRef.current = true
                  setAddress(v)
                }}
                placeholder="请输入 IP 地址、域名或 FN ID"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="服务器地址、域名或 FN ID"
              />
              {focusedField === 'address' && address.length > 0 ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    userEditedRef.current = true
                    setAddress('')
                  }}
                  style={styles.fieldAction}
                  accessibilityLabel="清空地址"
                  accessibilityRole="button"
                >
                  <Icon name="clear" size={18} color={colors.textTertiary} />
                </Pressable>
              ) : null}
              {servers.length > 0 ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => setShowHistoryModal(true)}
                  style={styles.fieldAction}
                  accessibilityLabel="历史服务器"
                  accessibilityRole="button"
                >
                  <Icon name="history" size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            {/* 输入框 2：账号 */}
            <View style={[styles.inputCard, focusedField === 'username' && styles.inputCardFocused]}>
              <TextInput
                style={styles.input}
                value={username}
                onFocus={() => handleFocus('username')}
                onBlur={handleBlur}
                onChangeText={(v) => {
                  userEditedRef.current = true
                  setUsername(v)
                }}
                placeholder="账号"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="账号"
              />
              {focusedField === 'username' && username.length > 0 ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    userEditedRef.current = true
                    setUsername('')
                  }}
                  style={styles.fieldAction}
                  accessibilityLabel="清空账号"
                  accessibilityRole="button"
                >
                  <Icon name="clear" size={18} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>

            {/* 输入框 3：密码 */}
            <View style={[styles.inputCard, focusedField === 'password' && styles.inputCardFocused]}>
              <TextInput
                style={styles.input}
                value={password}
                onFocus={() => handleFocus('password')}
                onBlur={handleBlur}
                onChangeText={setPassword}
                placeholder="密码"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                accessibilityLabel="密码"
              />
              {focusedField === 'password' && password.length > 0 ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => setPassword('')}
                  style={styles.fieldAction}
                  accessibilityLabel="清空密码"
                  accessibilityRole="button"
                >
                  <Icon name="clear" size={18} color={colors.textTertiary} />
                </Pressable>
              ) : null}
              <Pressable
                hitSlop={10}
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.fieldAction}
                accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'}
                accessibilityRole="button"
              >
                <Icon
                  name={showPassword ? 'eye' : 'eyeOff'}
                  size={20}
                  color={showPassword ? colors.accent : colors.textTertiary}
                />
              </Pressable>
            </View>

            {/* 辅助操作行：记住密码 */}
            <View style={styles.auxiliaryRow}>
              <Pressable
                style={styles.rememberRow}
                onPress={() => setRememberPassword((prev) => !prev)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberPassword }}
                accessibilityLabel="记住密码"
              >
                <Icon
                  name={rememberPassword ? 'checkmarkCircle' : 'circle'}
                  size={19}
                  color={rememberPassword ? colors.accent : colors.textTertiary}
                />
                <Text style={styles.rememberText}>记住密码</Text>
              </Pressable>
            </View>
          </View>

          {/* HTTPS 开关行 */}
          <View style={styles.httpsRow}>
            <Text style={styles.httpsLabel}>HTTPS 安全访问</Text>
            <Switch
              value={useHttps}
              onValueChange={setUseHttps}
              trackColor={{ false: colors.bgCardHover, true: colors.accent }}
              thumbColor={colors.textOnAccent}
              ios_backgroundColor={colors.bgCardHover}
            />
          </View>

          {/* 错误提示：凭据类失败时补一句「怎么重置密码」，只在真正需要的那一刻出现 */}
          {error ? (
            <View style={styles.errorBlock}>
              <View style={styles.errorContainer}>
                <Icon name="info" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
              {showResetHint ? (
                <Text style={styles.resetHintText}>
                  如已忘记密码：飞牛不提供密码找回接口，需在局域网内用浏览器登录飞牛管理后台重置，或联系管理员协助。
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* 提交登录按钮 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="登录"
            accessibilityState={{ disabled: !canSubmit, busy }}
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && canSubmit && styles.buttonPressed,
            ]}
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={colors.textOnAccent} size="small" />
                <Text style={styles.buttonLabel}>{statusMessage || '登录中...'}</Text>
              </View>
            ) : (
              <Text style={[styles.buttonLabel, !canSubmit && styles.buttonLabelDisabled]}>
                登录
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 历史服务器选择底栏 */}
      <OptionPickerModal
        visible={showHistoryModal}
        title="选择历史服务器"
        options={historyOptions}
        onSelect={handleSelectHistory}
        onClose={() => setShowHistoryModal(false)}
      />
    </AuthGate>
  )
}

const useStyles = createThemedStyles((colors) => ({
  flex: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl + 8,
  },
  logoWrapper: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
  },
  formSection: {
    gap: spacing.md,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md + 2,
    minHeight: 54,
  },
  inputCardFocused: {
    borderColor: colors.borderSelected,
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  fieldAction: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auxiliaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs,
  },
  rememberText: {
    ...typography.footnote,
    color: colors.textSecondary,
    fontSize: 14,
  },
  httpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  httpsLabel: {
    ...typography.subhead,
    color: colors.textPrimary,
    fontSize: 15,
  },
  errorBlock: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  errorText: {
    ...typography.footnote,
    color: colors.danger,
    flex: 1,
  },
  resetHintText: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.bgButtonPrimary,
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    ...typography.headline,
    color: colors.textOnAccent,
    fontSize: 17,
  },
  buttonLabelDisabled: {
    color: colors.textTertiary,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
}))
