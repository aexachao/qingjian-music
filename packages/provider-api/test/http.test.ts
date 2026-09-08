import { describe, expect, it, vi } from 'vitest'
import { isMusicError } from '@qj/core-domain'
import { HttpClient } from '../src/http'

function response(status: number, body: string) {
  return vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
}

describe('HttpClient 状态码映射', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [408, 'timeout'],
    [500, 'server'],
    [503, 'server'],
  ] as const)('HTTP %i 即使带 JSON 正文也映射为 %s', async (status, code) => {
    const client = new HttpClient({
      baseUrl: 'https://music.example.com/api',
      fetchImpl: response(status, JSON.stringify({ message: 'upstream failure' })),
    })

    await expect(client.getJson('/tracks')).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === code && error.status === status,
    )
  })

  it('成功状态的非法 JSON 仍归类为 protocol', async () => {
    const client = new HttpClient({ baseUrl: 'https://music.example.com/api', fetchImpl: response(200, '<html>') })
    await expect(client.getJson('/tracks')).rejects.toSatisfy(
      (error: unknown) => isMusicError(error) && error.code === 'protocol' && error.status === 200,
    )
  })
})
