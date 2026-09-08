import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { isMusicError } from '@qj/core-domain'
import { useServerSession } from '@/lib/server-session'
import { AuthGate } from '@/lib/auth-gate'
import { colors, radius, spacing, typography } from '@/theme/tokens'

/**
 * 服务器与账号在同一张表单里（按需求：一条记录 = 地址 + 账号）。
 * 多服务器切换在设置页做，这里只负责新增/登录。
 */
export default function LoginScreen() {
  const router = useRouter()
  const { signIn, servers } = useServerSession()
  const lastServer = servers[0]

  const [baseUrl, setBaseUrl] = useState(lastServer?.baseUrl ?? '')
  const [username, setUsername] = useState(lastServer?.username ?? '')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState(lastServer?.displayName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = baseUrl.trim().length > 0 && username.trim().length > 0 && password.length > 0 && !busy

  async function handleSubmit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await signIn({ baseUrl, username, password, displayName })
      router.replace('/library')
    } catch (caught) {
      if (isMusicError(caught)) {
        setError(caught.code === 'protocol' ? '账号或密码不正确' : caught.message)
      } else {
        setError(caught instanceof Error ? caught.message : '连接失败，请检查地址与网络')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthGate group="login">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>轻简音乐</Text>
        <Text style={styles.subtitle}>连接你的飞牛音乐服务器</Text>

        <Field
          label="服务器地址"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="192.168.2.100:5666"
          autoCapitalize="none"
          keyboardType="url"
          hint="局域网可直接用 http，公网请使用 https"
        />
        <Field label="账号" value={username} onChangeText={setUsername} placeholder="用户名" autoCapitalize="none" />
        <Field label="密码" value={password} onChangeText={setPassword} placeholder="密码" secureTextEntry />
        <Field label="备注名（可选）" value={displayName} onChangeText={setDisplayName} placeholder="例如：家里的 NAS" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="连接服务器"
          accessibilityState={{ disabled: !canSubmit, busy }}
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [styles.button, (!canSubmit || pressed) && styles.buttonMuted]}
        >
          {busy ? <ActivityIndicator color={colors.textOnAccent} /> : <Text style={styles.buttonLabel}>连接</Text>}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </AuthGate>
  )
}

interface FieldProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'sentences'
  keyboardType?: 'default' | 'url'
  hint?: string
}

function Field({ label, hint, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        autoCorrect={false}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  title: { ...typography.largeTitle, color: colors.textPrimary },
  subtitle: { ...typography.subhead, color: colors.textSecondary, marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { ...typography.footnote, color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    // 输入框走 web 端的「内凹底色 + 亮描边」，不用卡片色
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  hint: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.subhead, color: colors.danger },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonMuted: { opacity: 0.6 },
  buttonLabel: { ...typography.headline, color: colors.textOnAccent },
})
