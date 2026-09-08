import { Redirect } from 'expo-router'
import type { ReactNode } from 'react'
import { useServerSession } from './server-session'
import { authRedirect, type AuthRouteGroup } from './auth-route'

export function AuthGate({ group, children }: { group: AuthRouteGroup; children: ReactNode }) {
  const { status } = useServerSession()
  const redirect = authRedirect(status, group)
  return redirect ? <Redirect href={redirect} /> : children
}
