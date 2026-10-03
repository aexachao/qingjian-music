import { fetch } from 'expo/fetch'

export interface BoundedFetchOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes: number
}

export class BoundedFetchError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'BoundedFetchError'
    this.status = status
  }
}

/**
 * Fetch a response body into bounded memory, keeping cancellation active through EOF.
 * The chunk list retains at most maxBytes, then assembly temporarily allocates one more
 * maxBytes buffer; peak retained body memory is therefore at most roughly 2 * maxBytes,
 * plus the transport's current chunk.
 */
export async function fetchBoundedBytes(
  url: string,
  options: BoundedFetchOptions,
): Promise<Uint8Array> {
  const { maxBytes, signal: callerSignal, timeoutMs = 15_000, headers } = options
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer')
  }
  if (callerSignal?.aborted) throw abortError(callerSignal.reason)

  const controller = new AbortController()
  const abortFromCaller = (): void => controller.abort(callerSignal?.reason)
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let signalAbort!: () => void
  const aborted = new Promise<void>((resolve) => { signalAbort = resolve })
  const rejectOnAbort = (): void => signalAbort()
  controller.signal.addEventListener('abort', rejectOnAbort, { once: true })

  const raceAbort = async <T>(pending: Promise<T>): Promise<T> => {
    const result = await Promise.race([
      pending.then((value) => ({ kind: 'value' as const, value })),
      aborted.then(() => ({ kind: 'aborted' as const })),
    ])
    if (result.kind === 'aborted') throw abortError(controller.signal.reason)
    return result.value
  }

  try {
    const response = await raceAbort(fetch(url, { headers, signal: controller.signal }))
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      throw new BoundedFetchError(`HTTP ${response.status}`, response.status)
    }

    const body = response.body
    if (!body || typeof body.getReader !== 'function') {
      throw new BoundedFetchError('Streaming response body is unavailable')
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      void body.cancel().catch(() => undefined)
      throw new BoundedFetchError(`Response exceeds ${maxBytes} byte limit`)
    }

    reader = body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      if (controller.signal.aborted) throw abortError(controller.signal.reason)
      const { done, value } = await raceAbort(reader.read())
      if (controller.signal.aborted) throw abortError(controller.signal.reason)
      if (done) break
      if (!value || value.byteLength === 0) continue

      const nextTotal = totalBytes + value.byteLength
      if (nextTotal > maxBytes) {
        throw new BoundedFetchError(`Response exceeds ${maxBytes} byte limit`)
      }
      totalBytes = nextTotal
      chunks.push(value)
    }

    const result = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result
  } catch (error) {
    if (controller.signal.aborted) throw abortError(controller.signal.reason)
    throw error
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', abortFromCaller)
    controller.signal.removeEventListener('abort', rejectOnAbort)
    if (reader) void reader.cancel().catch(() => undefined)
  }
}

export async function fetchBoundedText(
  url: string,
  options: BoundedFetchOptions,
): Promise<string> {
  return new TextDecoder('utf-8').decode(await fetchBoundedBytes(url, options))
}

function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}
