import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

export const useStyles = createThemedStyles((colors) => ({
  container: { gap: spacing.lg },
  containerCompact: {
    gap: spacing.xl,
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  // 歌名占满剩余宽度，两个图标按钮自然贴到行尾
  titleText: { flex: 1, gap: 2, paddingRight: spacing.sm },
  title: { ...typography.title, color: colors.textPrimary },
  artist: { ...typography.callout, color: colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  // 两个图标容器严格等大 (44x44)，依赖 Flex 居中对齐
  menuWrapper: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    // 平衡播放 glyph 到时间文字、音量轨道的视觉间距；上下净高度不变。
    marginTop: 6,
    marginBottom: -6,
  },
  controlsCompact: { gap: spacing.xl },
  playControlHit: { minWidth: 88, minHeight: 88, borderRadius: 44 },
  playControlHitCompact: { minWidth: 64, minHeight: 64, borderRadius: 32 },
  sideControlHit: { minWidth: 72, minHeight: 72, borderRadius: 36 },
  sideControlHitCompact: { minWidth: 48, minHeight: 48, borderRadius: 24 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  volumeSliderContainer: {
    flex: 1,
    height: 32, // Apple Music 原生音量滑块高度，确保响应区域和视觉居中
    justifyContent: 'center',
    position: 'relative',
  },
  volumeTrack: {
    backgroundColor: colors.playerProgressTrack,
    borderRadius: radius.pill,
    overflow: 'hidden',
    height: 6, // 默认细度，与进度条对齐
  },
  volumeFill: {
    backgroundColor: colors.playerProgressFill,
  },
}))
