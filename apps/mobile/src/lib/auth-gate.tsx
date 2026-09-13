import { Redirect } from 'expo-router'
import type { ReactNode } from 'react'
import { useServerSession } from './server-session'
import { authRedirect, type AuthRouteGroup } from './auth-route'

export function AuthGate({
  group,
  children,
  allowSignedIn = false,
}: {
  group: AuthRouteGroup
  children: ReactNode
  allowSignedIn?: boolean
}) {
  const { status } = useServerSession()
  const redirect = allowSignedIn && group === 'login' && status === 'signedIn' ? null : authRedirect(status, group)
  return redirect ? <Redirect href={redirect} /> : children
}
