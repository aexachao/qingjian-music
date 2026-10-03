import { Image } from 'expo-image'
import { View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { BrandMark } from '@/components/brand-mark'
import { radius } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'
import { useServerSession } from '@/lib/server-session'

interface CoverImageProps {
  /** 传 coverId 由组件自己拼鉴权地址 */
  coverId?: string | undefined
  /** 或者直接给已经算好的资源（队列元素里就是这种） */
  resource?: HttpResource | undefined
  size: number
  /** 圆角，艺术家用圆形时传 size / 2 */
  borderRadius?: number
}

/**
 * 没有封面时的兜底：**浅灰底 + 比底更深的灰记号**（默认应用图标「绯红声谱」里那 15 根竖条，
 * 只取记号的形状）。记号宽度随封面尺寸缩放。
 *
 * 三个刻意的选择：
 * ① 不用苹果音乐那种音符图标 —— 那是别人的图标语言；
 * ② 记号**不用品牌红**，走中性灰（`coverPlaceholderMark`），否则一屏列表全是红的；
 * ③ 固定取**默认**图标样式，不跟随设置里切换的启动图标（见 brand-mark.tsx 注释）。
 */
/**
 * 占位图音符记号比例：
 * 记号 viewBox 宽 382、高 676，属于瘦长型。
 * 为使记号在正方形封面中居中呼吸感自然（高度约占封面的 42%），
 * 记号高度设为 size * 0.42，对应宽度自动按比例缩放，避免占满整个封面。
 */
const PLACEHOLDER_MARK_HEIGHT_RATIO = 0.42

/** 飞牛的封面接口需要鉴权头，所以统一走 provider.image() 拿 url + headers */
export function CoverImage({ coverId, resource, size, borderRadius = radius.md }: CoverImageProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const { provider, connection } = useServerSession()
  const target = resource ?? (coverId && provider ? provider.image(coverId, Math.round(size * 2)) : null)

  if (!target) {
    return (
      <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
        <BrandMark height={Math.max(12, Math.round(size * PLACEHOLDER_MARK_HEIGHT_RATIO))} color={colors.coverPlaceholderMark} />
      </View>
    )
  }

  return (
    <Image
      source={{ uri: target.url, headers: target.headers, cacheKey: `${connection?.id ?? 'local'}:${target.url}` }}
      style={{ width: size, height: size, borderRadius, backgroundColor: colors.skeleton2 }}
      contentFit="cover"
      transition={160}
      cachePolicy="memory-disk"
      recyclingKey={`${connection?.id ?? 'local'}:${target.url}`}
      accessibilityIgnoresInvertColors
    />
  )
}

const useStyles = createThemedStyles((colors) => ({
  placeholder: {
    backgroundColor: colors.coverPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
}))
