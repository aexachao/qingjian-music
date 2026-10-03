import { beforeEach, expect, it, vi } from 'vitest'

const mockedFetch = vi.hoisted(() => vi.fn())
vi.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockedFetch(...args) }))
vi.mock('../../src/lib/external-source', () => ({
  getLyricsSource: () => ({ type: 'none', baseUrl: '' }),
  normalizeBaseUrl: (value: string) => value.replace(/\/$/, ''),
}))

import { fetchExternalLyricSheet } from '../../src/lib/external-lyrics'

beforeEach(() => mockedFetch.mockReset())

it('surfaces a retryable external transport failure', async () => {
  mockedFetch.mockRejectedValueOnce(new TypeError('Network request failed'))

  await expect(fetchExternalLyricSheet(
    { title: 'Song' },
    { type: 'lrcapi', baseUrl: 'https://lyrics.example', token: undefined },
  )).rejects.toMatchObject({ name: 'MusicError', code: 'network', retryable: true })
})

it('treats an external 404 as a confirmed no-match', async () => {
  mockedFetch.mockResolvedValueOnce(new Response('', { status: 404 }))

  await expect(fetchExternalLyricSheet(
    { title: 'Song' },
    { type: 'lrcapi', baseUrl: 'https://lyrics.example', token: undefined },
  )).resolves.toBeNull()
})

it('does not retry malformed external response data', async () => {
  mockedFetch.mockResolvedValueOnce(new Response('{broken', { status: 200 }))

  await expect(fetchExternalLyricSheet(
    { title: 'Song' },
    { type: 'netease', baseUrl: 'https://lyrics.example', token: undefined },
  )).rejects.toMatchObject({ name: 'MusicError', code: 'protocol', retryable: false })
})

it('falls back to timed LRC when YRC contains only timed credits', async () => {
  mockedFetch
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: { songs: [{ id: 42, name: 'Song' }] } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      yrc: { lyric: '{"t":0,"c":[{"tx":"前奏"}]}' },
      lrc: { lyric: '[00:01.00]正文' },
    }), { status: 200 }))

  const result = await fetchExternalLyricSheet(
    { title: 'Song' },
    { type: 'netease', baseUrl: 'https://lyrics.example', token: undefined },
  )
  expect(result).toMatchObject({ tier: 'line', lines: [{ atMs: 1000, text: '正文' }] })
})

it('keeps a valid single-token YRC lyric ahead of LRC fallback', async () => {
  mockedFetch
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: { songs: [{ id: 42, name: 'Song' }] } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      yrc: { lyric: '[100,300](100,300,0)嗯' },
      lrc: { lyric: '[00:01.00]正文' },
    }), { status: 200 }))

  const result = await fetchExternalLyricSheet(
    { title: 'Song' },
    { type: 'netease', baseUrl: 'https://lyrics.example', token: undefined },
  )
  expect(result).toMatchObject({ tier: 'word', lines: [{ atMs: 100, text: '嗯' }] })
})
