import { StyleSheet, Text, View } from 'react-native'
import type { Track } from '@qj/core-domain'
import { fonts } from '@/theme/tokens'
import { createThemedStyles } from '@/theme/theme-provider'

import { getTrackFormatTag } from '@/lib/format-tag'

export { getTrackFormatTag }


/**
 * 歌曲歌手名称前面的音频格式小胶囊 Tag
 * 遵循 Apple Music 的克制精致风格，微光描边与紧凑排版
 */
export function FormatBadge({ track }: { track: Track }) {
  const styles = useStyles()
  const tag = getTrackFormatTag(track)
  if (!tag) return null

  return (
    <View style={styles.badge} accessible accessibilityLabel={`音频格式 ${tag}`}>
      <Text style={styles.text}>{tag}</Text>
    </View>
  )
}

const useStyles = createThemedStyles((colors) => ({
  badge: {
    paddingHorizontal: 3.5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.badgeBorder,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.textTertiary,
    letterSpacing: 0.3,
  },
}))
