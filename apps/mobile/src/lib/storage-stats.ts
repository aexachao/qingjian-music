import { Directory, File, Paths } from 'expo-file-system'
import { parseLyricCacheFileName } from './lyric-cache-policy'
import { downloadStats } from '@/player/downloads'
import type { StorageSnapshot } from './storage-breakdown'

const AUDIO_DIRECTORY = 'audio'
const LYRIC_DIRECTORY = 'lyrics'
const ARTWORK_DIRECTORY = 'artwork'

function safeRead<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

function safeReadBytes(read: () => number): number | null {
  return safeRead(() => {
    const value = read()
    if (!Number.isFinite(value) || value < 0) throw new Error('Byte count unavailable')
    return value
  })
}

function readDirectoryFiles(directory: Directory, includes: (file: File) => boolean): File[] {
  if (!directory.exists) return []
  return directory.list().filter((item): item is File => item instanceof File && includes(item))
}

function sumFileBytes(files: File[]): number {
  let bytes = 0
  for (const file of files) {
    const size = file.size
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) throw new Error('File size unavailable')
    bytes += size
  }
  return bytes
}

function readAudioCacheSummary(): { files: number; bytes: number } {
  // Reuse the existing one-level cache directory, excluding its index and unfinished downloads.
  const files = readDirectoryFiles(
    new Directory(Paths.cache, AUDIO_DIRECTORY),
    (file) => file.name !== 'index.json' && !file.name.endsWith('.part'),
  )
  return { files: files.length, bytes: sumFileBytes(files) }
}

function readLyricCacheSummary(): { tracks: number; bytes: number } {
  // This is a single, non-recursive directory capped by the lyric cache's 2,000-entry policy.
  const files = readDirectoryFiles(
    new Directory(Paths.cache, LYRIC_DIRECTORY),
    (file) => parseLyricCacheFileName(file.name) !== null,
  )
  const tracks = new Set(files.map((file) => {
    const parsed = parseLyricCacheFileName(file.name)
    return parsed?.key.slice(0, parsed.key.lastIndexOf('__'))
  }).filter((key): key is string => key !== undefined))
  return { tracks: tracks.size, bytes: sumFileBytes(files) }
}

function readArtworkCacheBytes(): number {
  // Artwork cache is one-level and capped at 128 images / 40 MiB by artwork.ts.
  const files = readDirectoryFiles(
    new Directory(Paths.cache, ARTWORK_DIRECTORY),
    (file) => file.name.startsWith('art_') && file.name.endsWith('.img'),
  )
  return sumFileBytes(files)
}

/**
 * Read only the device free/total values and the app-owned cache/download stats.
 * No recursive filesystem walk is performed. Any unreadable category stays unknown.
 */
export function readStorageSnapshot(): StorageSnapshot {
  const audioStats = safeRead(readAudioCacheSummary)
  const lyricStats = safeRead(readLyricCacheSummary)
  const downloadsBytes = safeReadBytes(() => downloadStats().bytes)
  const artworkCacheBytes = safeRead(readArtworkCacheBytes)

  return {
    totalBytes: safeReadBytes(() => Paths.totalDiskSpace),
    availableBytes: safeReadBytes(() => Paths.availableDiskSpace),
    downloadsBytes,
    audioCacheFiles: audioStats?.files ?? null,
    audioCacheBytes: audioStats?.bytes ?? null,
    lyricCacheFiles: lyricStats?.tracks ?? null,
    lyricCacheBytes: lyricStats?.bytes ?? null,
    artworkCacheBytes,
  }
}
