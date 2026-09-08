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

/** 先消除跨账号可见状态和持久凭证，最后才让路由进入退出态。 */
export async function teardownSession(actions: SessionTeardown): Promise<void> {
  await actions.clearPlayback()
  actions.clearQueryCache()
  await actions.clearCredentials()
  actions.publishSignedOut()
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
