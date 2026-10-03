import { saveServerRouteConfiguration } from './server-route-configuration'
import { StorageMutationQueue } from './storage-mutation-queue'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isMusicError } from '@qj/core-domain'
import type { MusicProvider, ProviderSession, ServerConnection } from '@qj/provider-api'
import { providerRegistry, validateBaseUrl } from '@qj/provider-api'
import { createFnosFactory } from '@qj/provider-fnos'
import { clearQueue, invalidatePlaybackIntents, rememberProvider } from '@/player/controller'
import { queryClient } from './query-client'
import { sessionAfterBootstrapFailure, teardownSession, type SessionStatus } from './session-state'
import { sha256Hex } from './crypto'
import {
  clearPassword,
  clearSession,
  getActiveServerId,
  getDeviceId,
  getLastServer,
  getPassword,
  getSession,
  listServers,
  newServerId,
  purgeIfFreshInstall,
  saveLastServer,
  savePassword,
  saveSession,
  setActiveServerId,
  upsertServer,
  removeServer as removeStoredServer,
} from './storage'
import { hasInstallSentinel, markInstallSentinel } from './install-sentinel'
import { wasExplicitlySignedOut, markExplicitlySignedOut, clearSignedOutMarker } from './signed-out-marker'

export interface SignInInput {
  baseUrl: string
  username: string
  password: string
  displayName?: string
  rememberPassword?: boolean
}

interface ServerSessionValue {
  status: SessionStatus
  connection: ServerConnection | null
  session: ProviderSession | null
  provider: MusicProvider | null
  servers: ServerConnection[]
  signIn(input: SignInInput): Promise<void>
  signOut(): Promise<void>
  saveServerRoutes(urls: readonly string[]): Promise<void>
  /**
   * 删除一台已保存的服务器及其本地凭据。
   * **只有删除，没有切换** —— 客户端不支持服务器切换（见 screens/settings.tsx 的说明），
   * 换服务器只能退出登录后在登录页的历史里重新登录。
   */
  removeServer(serverId: string): Promise<void>
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
  const lifecycle = useRef(0)
  const routeSaves = useRef(new StorageMutationQueue())
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [connection, setConnection] = useState<ServerConnection | null>(null)
  const [session, setSession] = useState<ProviderSession | null>(null)
  const [provider, setProvider] = useState<MusicProvider | null>(null)
  const [servers, setServers] = useState<ServerConnection[]>([])

  const activate = useCallback(async (target: ServerConnection, targetSession: ProviderSession, revision: number) => {
    await ensureRegistry()
    if (revision !== lifecycle.current) return
    const instance = providerRegistry.get(target.providerId).create(target, targetSession)
    setConnection(target)
    setSession(targetSession)
    setProvider(instance)
    setStatus('signedIn')
  }, [])

  // 冷启动：恢复上次使用的服务器；token 失效就用 Keychain 里的密码静默重登
  useEffect(() => {
    let cancelled = false
    const revision = lifecycle.current
    void (async () => {
      // 卸载重装清号：iOS Keychain 卸载不清，全新安装时把旧凭据全清（要在恢复会话之前）
      await purgeIfFreshInstall(hasInstallSentinel, markInstallSentinel)
      await ensureRegistry()
      const all = await listServers()
      if (!cancelled && revision === lifecycle.current) setServers(all)
      if (cancelled || revision !== lifecycle.current) return
      if (wasExplicitlySignedOut()) { setStatus('signedOut'); return }
      const activeId = await getActiveServerId()
      const target = all.find((item) => item.id === activeId)
      if (!target) {
        if (!cancelled && revision === lifecycle.current) setStatus('signedOut')
        return
      }
      const stored = await getSession(target.id)
      if (stored) {
        if (!cancelled) await activate(target, stored, revision)
        return
      }
      const password = await getPassword(target.id)
      if (!password) {
        if (!cancelled && revision === lifecycle.current) setStatus('signedOut')
        return
      }
      try {
        const instance = providerRegistry.get(target.providerId).create(target)
        const fresh = await instance.login({ password })
        if (cancelled || revision !== lifecycle.current) return
        await saveSession(target.id, fresh)
        if (!cancelled) await activate(target, fresh, revision)
      } catch {
        if (!cancelled && revision === lifecycle.current) setStatus('signedOut')
      }
    })().catch((error: unknown) => {
      console.warn('恢复服务器会话失败', error)
      if (cancelled || revision !== lifecycle.current) return
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
      const revision = ++lifecycle.current
      const check = () => { if (revision !== lifecycle.current) throw new Error('登录操作已取消') }
      await ensureRegistry()
      check()
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

      check()
      const instance = providerRegistry.get(target.providerId).create(target)
      const fresh = await instance.login({ password: input.password })
      check()

      if (connection && connection.id !== target.id) {
        invalidatePlaybackIntents()
        void clearQueue().catch((error: unknown) => console.warn('切换账号时清理播放失败', error))
        queryClient.clear()
      }
      await upsertServer(target)
      check()
      await setActiveServerId(target.id)
      check()
      await saveSession(target.id, fresh)
      check()
      if (input.rememberPassword !== false) {
        await savePassword(target.id, input.password)
        check()
      } else {
        await clearPassword(target.id)
        check()
      }
      await saveLastServer({
        serverId: target.id,
        baseUrl: target.baseUrl,
        username: target.username,
        displayName: target.displayName,
        rememberPassword: input.rememberPassword !== false,
      })
      const nextServers = await listServers()
      check()
      clearSignedOutMarker()
      setServers(nextServers)
      await activate(target, fresh, revision)
    },
    [activate, connection],
  )

  const removeServer = useCallback(
    async (serverId: string) => {
      if (serverId === connection?.id) throw new Error('不能删除当前正在使用的服务器')
      await removeStoredServer(serverId)
      setServers(await listServers())
    },
    [connection],
  )

  const signOut = useCallback(async () => {
    const targetConnection = connection
    const targetProvider = provider
    const revision = ++lifecycle.current
    // A synchronous local marker keeps a failed Keychain cleanup from silently
    // signing the user back in on the next launch.
    let markerError: unknown
    try { markExplicitlySignedOut() } catch (error) { markerError = error }
    invalidatePlaybackIntents()
    rememberProvider(null)
    void targetProvider?.logout().catch((error: unknown) => {
      if (!isMusicError(error)) console.warn('远程登出失败', error)
    })
    await teardownSession({
      clearPlayback: async () => {
        void clearQueue().catch((error: unknown) => console.warn('退出时清理播放失败', error))
      },
      clearQueryCache: () => queryClient.clear(),
      publishSignedOut: () => {
        setProvider(null)
        setSession(null)
        setConnection(null)
        setStatus('signedOut')
      },
      clearCredentials: async () => {
        if (!targetConnection) return
        // Enqueue revocation now, before optional metadata reads.
        const [, last] = await Promise.all([
          Promise.all([clearSession(targetConnection.id), setActiveServerId(null)]),
          getLastServer().catch(() => null),
        ])
        const keepPassword = last?.serverId === targetConnection.id && last.rememberPassword !== false
        if (revision !== lifecycle.current) return
        if (!keepPassword) await clearPassword(targetConnection.id)
        if (revision !== lifecycle.current) return
        await saveLastServer({
          serverId: targetConnection.id,
          baseUrl: targetConnection.baseUrl,
          username: targetConnection.username,
          displayName: targetConnection.displayName,
          rememberPassword: keepPassword,
        })
      },
    })
    if (markerError) throw markerError
  }, [connection, provider])

  const saveServerRoutes = useCallback(async (urls: readonly string[]) => {
    const revision = lifecycle.current
    if (!connection || !provider) throw new Error('请先连接服务器')
    await routeSaves.current.run(async () => {
      const next = await saveServerRouteConfiguration(
        connection, provider, urls, upsertServer, () => lifecycle.current === revision,
      )
      if (lifecycle.current !== revision) return
      setConnection(next)
      setServers((items) => items.map((item) => item.id === next.id ? next : item))
    })
  }, [connection, provider])

  const value = useMemo<ServerSessionValue>(
    () => ({ status, connection, session, provider, servers, signIn, signOut, removeServer, saveServerRoutes }),
    [status, connection, session, provider, servers, signIn, signOut, removeServer, saveServerRoutes],
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
