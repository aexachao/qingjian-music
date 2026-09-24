import { useMemo } from 'react'
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

/**
 * 播放页背景：使用类似 Apple Music 的抽象流动弥散光斑（Ambient Mesh Background），
 * 不直接拉伸封面图片，彻底消除人像纵向畸变、血条状条纹残影与生硬边界。
 */
export function CoverBackdrop({ artwork, palette, hideScrim }: CoverBackdropProps) {
  const activePalette = useMemo(() => {
    if (palette) return palette
    return resolveAmbientPalette(artwork?.url)
  }, [palette, artwork?.url])

  return <AmbientMeshBackground palette={activePalette} hideScrim={hideScrim} />
}
