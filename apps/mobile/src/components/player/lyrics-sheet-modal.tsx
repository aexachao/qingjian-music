import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import type { LyricLine } from '@qj/core-domain'
import { Icon, iconSize, IconButton } from '@/components/icon'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/** 长按默认选中该句；选择顺序始终按歌词原顺序导出。 */
export function LyricsSheetModal({ title, artist, lines, initialIndex, onClose }: {
  title: string
  artist?: string
  lines: LyricLine[]
  initialIndex: number
  onClose: () => void
}) {
  const colors = useThemeColors()
  const styles = useStyles()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Set<number>>(() => new Set([initialIndex]))
  const [copyLabel, setCopyLabel] = useState('复制')
  const [shareError, setShareError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const scrollRef = useRef<ScrollView>(null)
  const rowY = useRef<number[]>([])
  const [viewH, setViewH] = useState(0)
  const available = useMemo(() => lines.flatMap((line, index) => line.text?.trim() ? [index] : []), [lines])
  const selectedLines = available.filter((index) => selected.has(index))
  const allSelected = selectedLines.length === available.length
  const selectedText = selectedLines.map((index) => lines[index]!.text).join('\n')

  useEffect(() => {
    if (viewH <= 0) return
    const timer = setTimeout(() => {
      const y = rowY.current[initialIndex]
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - viewH / 3, 0), animated: false })
    }, 60)
    return () => clearTimeout(timer)
  }, [initialIndex, viewH])

  const changeSelection = (next: Set<number>) => {
    if (busyRef.current) return
    setSelected(next)
    setCopyLabel('复制')
    setShareError(null)
  }
  const toggleLine = (index: number) => {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    changeSelection(next)
  }
  const perform = async (action: 'copy' | 'share') => {
    if (!selectedText || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setShareError(null)
    try {
      if (action === 'copy') {
        await Clipboard.setStringAsync(selectedText)
        setCopyLabel('已复制')
      } else {
        const identity = [title, artist].filter(Boolean).join(' · ')
        await Share.share({ message: [selectedText, identity].filter(Boolean).join('\n\n') })
      }
    } catch {
      if (action === 'copy') setCopyLabel('复制失败，重试')
      else setShareError('分享未完成，请重试')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Modal visible presentationStyle="pageSheet" allowSwipeDismissal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, spacing.md) }]} accessibilityViewIsModal>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>分享歌词</Text>
          <IconButton name="close" size={iconSize.lg} color={colors.iconMid} onPress={onClose} accessibilityLabel="关闭歌词分享" />
        </View>
        <View style={styles.sheetIdentity}>
          <Text style={styles.sheetSong} numberOfLines={2}>{title || '当前歌曲'}</Text>
          {artist ? <Text style={styles.sheetArtist} numberOfLines={1}>{artist}</Text> : null}
        </View>
        <View style={styles.sheetSelectionBar}>
          <Text style={styles.sheetHint}>点选想分享的歌词</Text>
          <Pressable onPress={() => changeSelection(new Set(allSelected ? [] : available))} disabled={busy} accessibilityRole="button" accessibilityLabel={allSelected ? '取消全选' : '全选歌词'} style={styles.sheetSelectAll}>
            <Text style={styles.sheetSelectAllLabel}>{allSelected ? '取消全选' : '全选'}</Text>
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} style={styles.sheetScroll} onLayout={(event) => setViewH(event.nativeEvent.layout.height)} contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
          {available.map((index) => {
            const line = lines[index]!
            const checked = selected.has(index)
            return (
              <Pressable key={`${line.atMs}-${index}`} onLayout={(event) => { rowY.current[index] = event.nativeEvent.layout.y }} onPress={() => toggleLine(index)} disabled={busy} accessibilityRole="checkbox" accessibilityLabel={line.text} accessibilityState={{ checked, disabled: busy }} style={({ pressed }) => [styles.sheetRow, checked && styles.sheetRowSelected, pressed && styles.sheetButtonPressed]}>
                <View style={styles.sheetRowText}>
                  <Text style={[styles.sheetLine, checked && styles.sheetLineSelected]}>{line.text}</Text>
                  {line.translation ? <Text style={styles.sheetTranslation}>{line.translation}</Text> : null}
                </View>
              </Pressable>
            )
          })}
        </ScrollView>
        <View style={styles.sheetFooter}>
          <Text style={styles.sheetCount} accessibilityLiveRegion="polite">{selectedLines.length ? `已选 ${selectedLines.length} 句` : '请选择歌词'}</Text>
          <View style={styles.sheetActions}>
            <Pressable style={({ pressed }) => [styles.sheetButton, pressed && styles.sheetButtonPressed, (!selectedText || busy) && styles.sheetButtonDisabled]} onPress={() => void perform('copy')} disabled={!selectedText || busy} accessibilityRole="button" accessibilityLabel={copyLabel === '复制' ? '复制所选歌词' : copyLabel} accessibilityState={{ disabled: !selectedText || busy, busy }}>
              <Icon name="copy" size={iconSize.md} color={colors.textPrimary} />
              <Text style={styles.sheetButtonLabel} accessibilityLiveRegion="polite">{copyLabel}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.sheetButton, styles.sheetShareButton, pressed && styles.sheetButtonPressed, (!selectedText || busy) && styles.sheetButtonDisabled]} onPress={() => void perform('share')} disabled={!selectedText || busy} accessibilityRole="button" accessibilityLabel="分享所选歌词" accessibilityState={{ disabled: !selectedText || busy, busy }}>
              <Icon name="share" size={iconSize.md} color={colors.textOnAccent} />
              <Text style={[styles.sheetButtonLabel, styles.sheetShareLabel]}>分享</Text>
            </Pressable>
          </View>
          {shareError ? <Text style={styles.sheetFeedback} accessibilityRole="alert">{shareError}</Text> : null}
        </View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles((colors) => ({
  sheetFeedback: { ...typography.footnote, color: colors.textSecondary, textAlign: 'center', paddingBottom: spacing.md },
  // —— 歌词选择与分享 ——
  sheetCard: { flex: 1, backgroundColor: colors.bgModal },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.xl, paddingRight: spacing.md, paddingTop: spacing.sm },
  sheetTitle: { ...typography.headline, color: colors.textPrimary },
  sheetIdentity: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sheetSong: { ...typography.title3, color: colors.textPrimary },
  sheetArtist: { ...typography.subhead, color: colors.textSecondary, marginTop: spacing.xs },
  sheetSelectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  sheetHint: { ...typography.footnote, color: colors.textSecondary },
  sheetSelectAll: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  sheetSelectAllLabel: { ...typography.subhead, color: colors.actionText },
  sheetScroll: { flex: 1 },
  sheetList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  sheetRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 48, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md, gap: spacing.md },
  sheetRowSelected: { backgroundColor: colors.bgButtonSecondary },
  sheetRowText: { flex: 1 },
  sheetLine: { ...typography.body, color: colors.textSecondary, lineHeight: 26 },
  sheetLineSelected: { color: colors.textPrimary, fontWeight: '600' },
  sheetTranslation: { ...typography.footnote, color: colors.textSecondary, marginTop: spacing.xs },
  sheetFooter: { paddingTop: spacing.md, paddingHorizontal: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  sheetCount: { ...typography.footnote, color: colors.textSecondary, marginBottom: spacing.sm },
  sheetActions: { flexDirection: 'row', gap: spacing.md },
  sheetButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgButtonSecondary },
  sheetShareButton: { backgroundColor: colors.primaryAction },
  sheetShareLabel: { color: colors.textOnAccent },
  sheetButtonPressed: { opacity: 0.65 },
  sheetButtonDisabled: { opacity: 0.4 },
  sheetButtonLabel: { ...typography.callout, color: colors.textPrimary },
}))
