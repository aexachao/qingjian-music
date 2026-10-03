import { expect, it } from 'vitest'
import { externalSourceCacheIdentity } from '../../src/lib/external-source-cache-key'

it('excludes source tokens from the persisted cache identity', () => {
  const source = {
    id: 'source-1',
    type: 'netease' as const,
    baseUrl: 'https://music.example/api/',
    useLyrics: true,
    useMusicInfo: true,
  }
  expect(externalSourceCacheIdentity([{ ...source, token: 'first-secret' }])).toBe(
    externalSourceCacheIdentity([{ ...source, token: 'second-secret' }]),
  )
})

it('changes when the configured source endpoint changes', () => {
  const source = {
    id: 'source-1',
    type: 'netease' as const,
    baseUrl: 'https://music.example/api',
    useLyrics: true,
    useMusicInfo: true,
  }
  expect(externalSourceCacheIdentity([source])).toBe(externalSourceCacheIdentity([{ ...source, baseUrl: `${source.baseUrl}/` }]))
  expect(externalSourceCacheIdentity([source])).not.toBe(
    externalSourceCacheIdentity([{ ...source, baseUrl: 'https://other.example/api' }]),
  )
})
