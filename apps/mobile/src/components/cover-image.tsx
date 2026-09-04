import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'
import { colors, radius } from '@/theme/tokens'
import { useServerSession } from '@/lib/server-session'

interface CoverImageProps {
  coverId?: string | undefined
  size: number
  /** 圆角，艺术家用圆形时传 size / 2 */
  borderRadius?: number
}

/** 飞牛的封面接口需要鉴权头，所以统一走 provider.image() 拿 url + headers */
export function CoverImage({ coverId, size, borderRadius = radius.md }: CoverImageProps) {
  const { provider } = useServerSession()
  const resource = coverId && provider ? provider.image(coverId, Math.round(size * 2)) : null

  if (!resource) {
    return <View style={[styles.placeholder, { width: size, height: size, borderRadius }]} />
  }

  return (
    <Image
      source={{ uri: resource.url, headers: resource.headers }}
      style={{ width: size, height: size, borderRadius, backgroundColor: colors.surfaceElevated }}
      contentFit="cover"
      transition={160}
      cachePolicy="memory-disk"
      recyclingKey={coverId}
      accessibilityIgnoresInvertColors
    />
  )
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceElevated,
  },
})
