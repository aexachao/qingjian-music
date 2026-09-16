import { StyleSheet, Text, View } from 'react-native'
import type { Genre } from '@qj/core-domain'
import { VinylDisc } from './vinyl-disc'
import { createThemedStyles } from '@/theme/theme-provider'
import { radius, spacing, typography } from '@/theme/tokens'

interface GenreCardProps {
  genre: Genre
  coverId?: string | null
  width: number
}

export function GenreCard({ genre, coverId, width }: GenreCardProps) {
  const styles = useStyles()

  const cardHeight = 96
  const vinylSize = 130

  return (
    <View style={[styles.card, { width, height: cardHeight }]}>
      <View style={[styles.content, { maxWidth: width * 0.58 }]}>
        <Text style={styles.name} numberOfLines={2}>
          {genre.name}
        </Text>
        {genre.trackCount ? (
          <Text style={styles.meta}>{genre.trackCount} 首</Text>
        ) : null}
      </View>

      <View
        style={[
          styles.vinylContainer,
          { width: vinylSize, height: vinylSize, marginTop: -vinylSize / 2 },
        ]}
        pointerEvents="none"
      >
        <VinylDisc
          genreId={genre.id}
          coverId={coverId ?? genre.coverId}
          size={vinylSize}
          variant="card"
        />
      </View>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    zIndex: 1,
  },
  name: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.footnote,
    color: colors.textTertiary,
  },
  vinylContainer: {
    position: 'absolute',
    right: -52,
    top: '50%',
  },
}))
