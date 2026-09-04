import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'
import type { ProviderSession, ServerConnection } from '@qj/provider-api'

/**
 * 服务器配置、会话 token、密码统一放 Keychain（SecureStore）。
 * 密码要存是因为飞牛 token 失效后没有 refresh 接口，只能静默重新登录。
 */
const KEY_SERVERS = 'qj.servers'
const KEY_ACTIVE = 'qj.activeServerId'
const KEY_DEVICE = 'qj.deviceId'
const keySession = (serverId: string) => `qj.session.${serverId}`
const keyPassword = (serverId: string) => `qj.password.${serverId}`

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    await SecureStore.deleteItemAsync(key)
    return null
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value))
}

export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_DEVICE)
  if (existing) return existing
  const created = Crypto.randomUUID().replace(/-/g, '')
  await SecureStore.setItemAsync(KEY_DEVICE, created)
  return created
}

export async function listServers(): Promise<ServerConnection[]> {
  return (await readJson<ServerConnection[]>(KEY_SERVERS)) ?? []
}

export async function upsertServer(connection: ServerConnection): Promise<void> {
  const servers = await listServers()
  const index = servers.findIndex((item) => item.id === connection.id)
  if (index >= 0) servers[index] = connection
  else servers.push(connection)
  await writeJson(KEY_SERVERS, servers)
}

export async function removeServer(serverId: string): Promise<void> {
  const servers = (await listServers()).filter((item) => item.id !== serverId)
  await writeJson(KEY_SERVERS, servers)
  await SecureStore.deleteItemAsync(keySession(serverId))
  await SecureStore.deleteItemAsync(keyPassword(serverId))
  if ((await getActiveServerId()) === serverId) {
    await setActiveServerId(servers[0]?.id ?? null)
  }
}

export async function getActiveServerId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_ACTIVE)
}

export async function setActiveServerId(serverId: string | null): Promise<void> {
  if (serverId) await SecureStore.setItemAsync(KEY_ACTIVE, serverId)
  else await SecureStore.deleteItemAsync(KEY_ACTIVE)
}

export async function getSession(serverId: string): Promise<ProviderSession | null> {
  return readJson<ProviderSession>(keySession(serverId))
}

export async function saveSession(serverId: string, session: ProviderSession): Promise<void> {
  await writeJson(keySession(serverId), session)
}

export async function clearSession(serverId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keySession(serverId))
}

export async function savePassword(serverId: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(keyPassword(serverId), password)
}

export async function getPassword(serverId: string): Promise<string | null> {
  return SecureStore.getItemAsync(keyPassword(serverId))
}

/** SecureStore 的 key 只允许字母数字与 . - _ */
export function newServerId(): string {
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
