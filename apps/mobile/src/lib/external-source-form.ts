export type ConnectionTestResult = 'reachable' | 'auth-failed' | 'failed'

export interface ConnectionTestOutcome {
  result: ConnectionTestResult
  timedOut: boolean
  cancelled: boolean
}

export async function runConnectionTest(
  request: (signal: AbortSignal) => Promise<ConnectionTestResult>,
  controller: AbortController,
  timeoutMs = 8000,
): Promise<ConnectionTestOutcome> {
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const result = await request(controller.signal)
    if (timedOut) return { result: 'failed', timedOut: true, cancelled: false }
    return { result, timedOut: false, cancelled: controller.signal.aborted }
  } catch {
    return { result: 'failed', timedOut, cancelled: controller.signal.aborted && !timedOut }
  } finally {
    clearTimeout(timer)
  }
}

export class ConnectionTestSequence {
  private id = 0
  private controller: AbortController | null = null

  begin(): { id: number; controller: AbortController } {
    this.controller?.abort()
    const controller = new AbortController()
    const id = ++this.id
    this.controller = controller
    return { id, controller }
  }

  invalidate(): void {
    this.id += 1
    this.controller?.abort()
    this.controller = null
  }

  isCurrent(id: number): boolean {
    return id === this.id
  }
}

export function validateExternalSourceUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return '请输入服务地址'
  try {
    const url = new URL(trimmed)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
      return '请输入有效的 HTTP 或 HTTPS 地址'
    }
    return null
  } catch {
    return '请输入有效的 HTTP 或 HTTPS 地址'
  }
}

export function classifyConnectionResponse(status: number): ConnectionTestResult {
  if (status === 401 || status === 403) return 'auth-failed'
  // Any non-server-error response proves the host answered; it does not verify provider APIs.
  if (status >= 200 && status < 500) return 'reachable'
  return 'failed'
}
