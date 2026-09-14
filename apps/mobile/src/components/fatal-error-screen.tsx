import { useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { EDITION_LABEL } from '@/lib/edition-policy'
import { trimStack, type FatalErrorInfo } from '@/lib/fatal-error-capture'

/**
 * 启动期致命错误的整屏展示。
 *
 * ── 刻意的自我隔离 ──────────────────────────────────────────────────────────
 * 这里**不接主题、不接 Provider、不用任何自定义组件**，颜色全部写死。
 * 理由：能走到这个屏幕，说明应用树里某处已经坏了，而坏的可能正是主题或某个
 * Provider —— 错误屏本身再依赖它们，就会一起崩，等于白做。
 * 同理只用 `react-native` 的基础组件。
 *
 * 「复制」按钮是给真机诊断用的：设备在用户手上，把错误复制出来贴给开发者，
 * 比截图再逐字辨认堆栈可靠得多。
 */
export function FatalErrorScreen({ error, onRetry }: { error: FatalErrorInfo; onRetry: () => void }) {
  const [copied, setCopied] = useState(false)
  const stackLines = trimStack(error.stack)

  const diagnostics = [
    `平台: ${Platform.OS} ${String(Platform.Version)}`,
    `设备: ${Device.modelName ?? '未知'} (${Device.osName ?? '?'} ${Device.osVersion ?? '?'})`,
    `App: ${Constants.expoConfig?.version ?? '未知'} · ${EDITION_LABEL}`,
  ]

  const asText = [
    `【启动失败】${error.source === 'render' ? '渲染期' : '未捕获'}异常`,
    error.message,
    '',
    ...stackLines,
    '',
    ...diagnostics,
  ].join('\n')

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(asText)
      setCopied(true)
    } catch {
      // 复制失败不是错误屏该关心的事，静默即可
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>启动失败</Text>
        <Text style={styles.hint}>
          这是一个诊断界面，用于在没有 adb 的设备上看到错误原因。请把下面的内容发给开发者。
        </Text>

        <Text style={styles.section}>错误</Text>
        <Text style={styles.message} selectable>
          {error.message}
        </Text>

        {stackLines.length > 0 ? (
          <>
            <Text style={styles.section}>调用栈（前 {stackLines.length} 行）</Text>
            <Text style={styles.stack} selectable>
              {stackLines.join('\n')}
            </Text>
          </>
        ) : null}

        <Text style={styles.section}>环境</Text>
        <Text style={styles.stack} selectable>
          {diagnostics.join('\n')}
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void copy()}>
          <Text style={styles.btnPrimaryText}>{copied ? '已复制 ✓' : '复制全部'}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onRetry}>
          <Text style={styles.btnGhostText}>重试</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14060a' },
  content: { padding: 20, paddingTop: 64, paddingBottom: 24 },
  title: { color: '#ff5c7a', fontSize: 26, fontWeight: '700' },
  hint: { color: '#b9a3aa', fontSize: 13, lineHeight: 19, marginTop: 8 },
  section: { color: '#7d6a70', fontSize: 12, fontWeight: '600', marginTop: 22, marginBottom: 6 },
  message: { color: '#ffffff', fontSize: 17, lineHeight: 24, fontWeight: '600' },
  stack: { color: '#d7c6cb', fontSize: 11.5, lineHeight: 17, fontFamily: 'Menlo' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3a2029',
  },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#f62c55' },
  btnPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  btnGhost: { backgroundColor: '#2a1720' },
  btnGhostText: { color: '#f0dfe4', fontSize: 15, fontWeight: '600' },
})
