import type { MusicProvider, ProviderSession, ServerConnection } from '@qj/provider-api'

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn'

export interface SessionState {
  status: SessionStatus
  connection: ServerConnection | null
  session: ProviderSession | null
  provider: MusicProvider | null
}

interface SessionTeardown {
  clearPlayback(): Promise<void>
  clearQueryCache(): void
  clearCredentials(): Promise<void>
  publishSignedOut(): void
}

/** 本地退出立即生效；存储或原生清理失败不能把 UI 留在已登录状态。 */
export async function teardownSession(actions: SessionTeardown): Promise<void> {
  actions.clearQueryCache()
  actions.publishSignedOut()
  await Promise.all([actions.clearPlayback(), actions.clearCredentials()])
}

export const SIGNED_OUT_SESSION: SessionState = {
  status: 'signedOut',
  connection: null,
  session: null,
  provider: null,
}

export function sessionAfterBootstrapFailure(): SessionState {
  return SIGNED_OUT_SESSION
}
