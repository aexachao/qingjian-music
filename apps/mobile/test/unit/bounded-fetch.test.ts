import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('expo/fetch', () => ({ fetch: fetchMock }))

import { fetchBoundedBytes, fetchBoundedText } from '../../src/lib/bounded-fetch'

function response(chunks: Uint8Array[], contentLength?: string): Response {
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]!)
      else controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers(contentLength ? { 'content-length': contentLength } : {}),
  } as Response
}

describe('bounded fetch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('reads bytes in chunks and enforces the cumulative limit before retaining an over-limit chunk', async () => {
    fetchMock.mockResolvedValue(response([new Uint8Array([1, 2]), new Uint8Array([3, 4])]))
    await expect(fetchBoundedBytes('/ok', { maxBytes: 4 })).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))

    fetchMock.mockResolvedValue(response([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]))
    await expect(fetchBoundedBytes('/large', { maxBytes: 4 })).rejects.toThrow(/exceeds 4 byte limit/)
  })

  it('bounds text by encoded response bytes', async () => {
    fetchMock.mockResolvedValueOnce(response([new TextEncoder().encode('hello')]))
    await expect(fetchBoundedText('/text', { maxBytes: 5 })).resolves.toBe('hello')
    fetchMock.mockResolvedValueOnce(response([new TextEncoder().encode('hello')]))
    await expect(fetchBoundedText('/text', { maxBytes: 4 })).rejects.toThrow(/exceeds 4 byte limit/)
  })

  it('preserves HTTP status for retry decisions', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
      headers: new Headers(),
    })
    await expect(fetchBoundedBytes('/missing', { maxBytes: 10 })).rejects.toMatchObject({ status: 404 })
  })

  it('rejects on timeout even when a reader ignores abort and never settles', async () => {
    vi.useFakeTimers()
    const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {}))
    const cancel = vi.fn(() => Promise.resolve())
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => ({ read, cancel }) },
    })

    const pending = fetchBoundedBytes('/stalled', { maxBytes: 10, timeoutMs: 100 })
    const rejection = expect(pending).rejects.toThrow('Request timed out')
    await vi.advanceTimersByTimeAsync(101)
    await rejection
    expect(read).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('rejects on caller cancellation while reading the response body', async () => {
    const controller = new AbortController()
    const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {}))
    const cancel = vi.fn(() => Promise.resolve())
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => ({ read, cancel }) },
    })

    const pending = fetchBoundedBytes('/cancel', { maxBytes: 10, signal: controller.signal })
    const rejection = expect(pending).rejects.toThrow('user cancelled')
    await Promise.resolve()
    controller.abort(new Error('user cancelled'))
    await rejection
    expect(cancel).toHaveBeenCalled()
  })
})
