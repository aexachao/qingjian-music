import { Text, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'
import type { QueueItem } from '@qj/core-domain'
import { IconButton, iconSize } from '@/components/icon'
import { CoverImage } from '@/components/cover-image'
import { DeckMoreButton } from '@/components/player/player-deck'
import { useToggleFavorite } from '@/lib/favorites'
import { radius } from '@/theme/tokens'
import { useThemeColors } from '@/theme/theme-provider'
import { useQueueStyles } from './queue-shared'

export function CurrentTrackCard({
  item,
  consumeOpenAction = () => false,
  onDismissWithAction,
  onMenuOpenChange,
}: {
  item: QueueItem
  listAnim?: SharedValue<number>
  consumeOpenAction?: () => boolean
  onDismissWithAction?: (action: () => void) => void
  onMenuOpenChange?: (open: boolean) => void
}) {
  const colors = useThemeColors()
  const styles = useQueueStyles()
  const toggleFavorite = useToggleFavorite()

  return (
    <View style={styles.currentCard}>
      <CoverImage resource={item.artwork} size={64} borderRadius={radius.md} />
      <View style={styles.currentInfo}>
        <View style={styles.currentTitleRow}>
          <Text style={styles.currentTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={styles.currentArtist} numberOfLines={1}>{item.artistText}</Text>
      </View>
      <View style={styles.currentActions}>
        <IconButton
          name="heart"
          size={iconSize.lg}
          color={item.isFavorite ? colors.like : colors.iconMid}
          filled={true}
          onPress={() => {
            if (consumeOpenAction()) return
            void toggleFavorite(item.trackId, !item.isFavorite)
          }}
          accessibilityLabel={item.isFavorite ? '取消喜欢' : '喜欢'}
        />
        <DeckMoreButton
          current={item}
          onBeforeOpen={consumeOpenAction}
          onDismissWithAction={onDismissWithAction}
          onMenuOpenChange={onMenuOpenChange}
          popDirection="down"
        />
      </View>
    </View>
  )
}
