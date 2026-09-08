import type { SessionStatus } from './session-state'

export type AuthRouteGroup = 'boot' | 'login' | 'protected'

export function authRedirect(status: SessionStatus, group: AuthRouteGroup): '/' | '/home' | '/login' | null {
  if (status === 'loading') return group === 'boot' ? null : '/'
  if (status === 'signedOut') return group === 'login' ? null : '/login'
  return group === 'protected' ? null : '/home'
}
