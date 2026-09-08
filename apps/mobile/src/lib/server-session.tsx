import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { isMusicError } from '@qj/core-domain'
import type { MusicProvider, ProviderSession, ServerConnection } from '@qj/provider-api'
import { providerRegistry, validateBaseUrl } from '@qj/provider-api'
import { createFnosFactory } from '@qj/provider-fnos'
import { clearQueue } from '@/player/controller'
import { queryClient } from './query-client'
import { sessionAfterBootstrapFailure, teardownSession, type SessionStatus } from './session-state'
import { sha256Hex } from './crypto'
import {
  clearPassword,
  clearSession,
  getActiveServerId,
  getDeviceId,
  getPassword,
  getSession,
  listServers,
  newServerId,
  savePassword,
  saveSession,
  setActiveServerId,
  upsertServer,
} from './storage'

export interface SignInInput {
  baseUrl: string
  username: string
  password: string
  displayName?: string
}

interface ServerSessionValue {
  status: SessionStatus
  connection: ServerConnection | null
  session: ProviderSession | null
  provider: MusicProvider | null
  servers: ServerConnection[]
  signIn(input: SignInInput): Promise<void>
  signOut(): Promise<void>
  /** 切到已保存的另一台服务器：优先用存的 token，失效则用 Keychain 里的密码重登 */
  switchServer(serverId: string): Promise<void>
}

const ServerSessionContext = createContext<ServerSessionValue | null>(null)

let registryReady = false

/** 注册后端工厂。新增 Emby 时只在这里多注册一个，UI 不用动。 */
async function ensureRegistry(): Promise<void> {
  if (registryReady) return
  const deviceId = await getDeviceId()
  providerRegistry.register(
    createFnosFactory({
      sha256Hex,
      deviceId,
      // token 过期时用 Keychain 里的密码静默重登，用户无感
      recoverPassword: async (connection) => (await getPassword(connection.id)) ?? undefined,
      onSessionRefreshed: (connection, refreshed) => saveSession(connection.id, refreshed),
    }),
  )
  registryReady = true
}

export function ServerSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [connection, setConnection] = useState<ServerConnection | null>(null)
  const [session, setSession] = useState<ProviderSession | null>(null)
  const [provider, setProvider] = useState<MusicProvider | null>(null)
  const [servers, setServers] = useState<ServerConnection[]>([])

  const activate = useCallback(async (target: ServerConnection, targetSession: ProviderSession) => {
    await ensureRegistry()
    const instance = providerRegistry.get(target.providerId).create(target, targetSession)
    setConnection(target)
    setSession(targetSession)
    setProvider(instance)
    setStatus('signedIn')
  }, [])

  // 冷启动：恢复上次使用的服务器；token 失效就用 Keychain 里的密码静默重登
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureRegistry()
      const all = await listServers()
      if (!cancelled) setServers(all)
      const activeId = (await getActiveServerId()) ?? all[0]?.id
      const target = all.find((item) => item.id === activeId)
      if (!target) {
        if (!cancelled) setStatus('signedOut')
        return
      }
      const stored = await getSession(target.id)
      if (stored) {
        if (!cancelled) await activate(target, stored)
        return
      }
      const password = await getPassword(target.id)
      if (!password) {
        if (!cancelled) setStatus('signedOut')
        return
      }
      try {
        const instance = providerRegistry.get(target.providerId).create(target)
        const fresh = await instance.login({ password })
        await saveSession(target.id, fresh)
        if (!cancelled) await activate(target, fresh)
      } catch {
        if (!cancelled) setStatus('signedOut')
      }
    })().catch((error: unknown) => {
      console.warn('恢复服务器会话失败', error)
      if (cancelled) return
      const fallback = sessionAfterBootstrapFailure()
      setConnection(fallback.connection)
      setSession(fallback.session)
      setProvider(fallback.provider)
      setStatus(fallback.status)
    })
    return () => {
      cancelled = true
    }
  }, [activate])

  const signIn = useCallback(
    async (input: SignInInput) => {
      await ensureRegistry()
      const { url } = validateBaseUrl(input.baseUrl)
      const existing = (await listServers()).find(
        (item) => item.baseUrl === url && item.username === input.username.trim(),
      )
      const target: ServerConnection = existing ?? {
        id: newServerId(),
        providerId: 'fnos',
        displayName: input.displayName?.trim() || new URL(url).host,
        baseUrl: url,
        username: input.username.trim(),
      }

      const instance = providerRegistry.get(target.providerId).create(target)
      const fresh = await instance.login({ password: input.password })

      if (connection && connection.id !== target.id) {
        await clearQueue()
        queryClient.clear()
      }
      await upsertServer(target)
      await setActiveServerId(target.id)
      await saveSession(target.id, fresh)
      await savePassword(target.id, input.password)
      setServers(await listServers())
      await activate(target, fresh)
    },
    [activate, connection],
  )

  const switchServer = useCallback(
    async (serverId: string) => {
      if (serverId === connection?.id) return
      const target = (await listServers()).find((item) => item.id === serverId)
      if (!target) throw new Error('找不到这台服务器')
      await ensureRegistry()
      const stored = await getSession(serverId)
      let targetSession = stored
      if (!targetSession) {
        const password = await getPassword(serverId)
        if (!password) throw new Error('这台服务器需要重新登录')
        const instance = providerRegistry.get(target.providerId).create(target)
        targetSession = await instance.login({ password })
        await saveSession(serverId, targetSession)
      }

      // 新服务器已具备可用会话后，再清旧播放域，避免认证失败把当前播放白白清掉。
      await clearQueue()
      queryClient.clear()
      await setActiveServerId(serverId)
      await activate(target, targetSession)
    },
    [activate, connection],
  )

  const signOut = useCallback(async () => {
    if (connection) {
      try {
        await provider?.logout()
      } catch (error) {
        // 服务端登出失败不影响本地退出
        if (!isMusicError(error)) console.warn('登出失败', error)
      }
    }
    await teardownSession({
      clearPlayback: async () => {
        try {
          await clearQueue()
        } catch (error) {
          console.warn('退出登录时清理播放队列失败', error)
        }
      },
      clearQueryCache: () => queryClient.clear(),
      clearCredentials: async () => {
        if (!connection) return
        await Promise.all([clearSession(connection.id), clearPassword(connection.id), setActiveServerId(null)])
      },
      publishSignedOut: () => {
        setProvider(null)
        setSession(null)
        setConnection(null)
        setStatus('signedOut')
      },
    })
    setServers(await listServers())
  }, [connection, provider])

  const value = useMemo<ServerSessionValue>(
    () => ({ status, connection, session, provider, servers, signIn, signOut, switchServer }),
    [status, connection, session, provider, servers, signIn, signOut, switchServer],
  )

  return <ServerSessionContext value={value}>{children}</ServerSessionContext>
}

export function useServerSession(): ServerSessionValue {
  const value = use(ServerSessionContext)
  if (!value) throw new Error('useServerSession 必须在 ServerSessionProvider 内使用')
  return value
}

/** 已登录场景下直接拿 provider，未登录时抛错（路由层会先挡住） */
export function useProvider(): MusicProvider {
  const { provider } = useServerSession()
  if (!provider) throw new Error('尚未连接服务器')
  return provider
}
