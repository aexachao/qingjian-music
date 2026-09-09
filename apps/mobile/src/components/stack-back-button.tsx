import { useRouter } from 'expo-router'
import { IconButton, iconSize } from '@/components/icon'
import { colors, spacing } from '@/theme/tokens'

export function StackBackButton({ fallbackRoute = '/(tabs)/library' }: { fallbackRoute?: string }) {
  const router = useRouter()

  const handlePress = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace(fallbackRoute as any)
    }
  }

  return (
    <IconButton
      name="back"
      size={iconSize.xl}
      color={colors.textPrimary}
      onPress={handlePress}
      accessibilityLabel="返回"
      style={{ marginLeft: -spacing.sm }}
    />
  )
}
