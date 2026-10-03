import { useMemo } from 'react'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import type { HttpResource } from '@qj/core-domain'
import { AmbientMeshBackground } from './ambient-mesh-background'
import {
  type AmbientPalette,
  resolveAmbientPalette,
} from '@/theme/ambient-palette'

interface CoverBackdropProps {
  artwork?: HttpResource | undefined
  palette?: AmbientPalette | undefined
  hideScrim?: boolean | undefined
}

/** 播放页背景使用封面自身的色彩；大半径模糊后只保留柔和的色场。 */
export function CoverBackdrop({ artwork, palette, hideScrim }: CoverBackdropProps) {
  const activePalette = useMemo(() => {
    if (palette) return palette
    return resolveAmbientPalette(artwork?.url)
  }, [palette, artwork?.url])

  if (!artwork) return <AmbientMeshBackground palette={activePalette} hideScrim={hideScrim} />

  return (
    <View style={[styles.root, { backgroundColor: activePalette.dark }]} pointerEvents="none">
      <Image
        source={{ uri: artwork.url, headers: artwork.headers }}
        style={styles.image}
        contentFit="cover"
        blurRadius={120}
        transition={350}
        cachePolicy="memory-disk"
      />
      <LinearGradient
        colors={hideScrim
          ? ['rgba(10,15,20,0.58)', 'rgba(10,15,20,0.66)']
          : ['rgba(10,15,20,0.46)', 'rgba(10,15,20,0.56)', 'rgba(6,9,12,0.78)']}
        locations={hideScrim ? [0, 1] : [0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const

const styles = StyleSheet.create({
  root: { ...fill, overflow: 'hidden' },
  image: { ...fill, transform: [{ scale: 1.35 }] },
})
