import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { Icon } from '@/components/icon'
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

/** 没有封面时的兜底：强调色底 + 音符，占位尺寸随封面大小缩放 */
const PLACEHOLDER_ICON_RATIO = 0.4

/** 飞牛的封面接口需要鉴权头，所以统一走 provider.image() 拿 url + headers */
export function CoverImage({ coverId, resource, size, borderRadius = radius.md }: CoverImageProps) {
  const colors = useThemeColors()
  const styles = useStyles()
  const { provider } = useServerSession()
  const target = resource ?? (coverId && provider ? provider.image(coverId, Math.round(size * 2)) : null)

  if (!target) {
    return (
      <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
        <Icon
          name="tracks"
          size={Math.round(size * PLACEHOLDER_ICON_RATIO)}
          color={colors.textOnAccent}
        />
      </View>
    )
  }

  return (
    <Image
      source={{ uri: target.url, headers: target.headers }}
      style={{ width: size, height: size, borderRadius, backgroundColor: colors.skeleton2 }}
      contentFit="cover"
      transition={160}
      cachePolicy="memory-disk"
      recyclingKey={target.url}
      accessibilityIgnoresInvertColors
    />
  )
}

const useStyles = createThemedStyles((colors) => ({
  placeholder: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
}))
