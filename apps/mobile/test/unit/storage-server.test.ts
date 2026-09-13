import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    store.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => '12345678-1234-1234-1234-123456789abc'),
}))

import {
  clearPassword,
  getLastServer,
  getPassword,
  listServers,
  removeServer,
  saveLastServer,
  savePassword,
  upsertServer,
} from '../../src/lib/storage'
import type { ServerConnection } from '@qj/provider-api'

describe('服务器存储与最近登录持久化', () => {
  beforeEach(() => {
    store.clear()
  })

  it('upsertServer 始终将最新添加或更新的服务器置于列表头部 (index 0)', async () => {
    const srv1: ServerConnection = {
      id: 'srv-1',
      providerId: 'fnos',
      displayName: 'Server 1',
      baseUrl: 'http://nas1.local:5666',
      username: 'user1',
    }
    const srv2: ServerConnection = {
      id: 'srv-2',
      providerId: 'fnos',
      displayName: 'Server 2',
      baseUrl: 'http://nas2.local:5666',
      username: 'user2',
    }

    await upsertServer(srv1)
    let list = await listServers()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('srv-1')

    // 插入第二台服务器，新服务器应位于首位
    await upsertServer(srv2)
    list = await listServers()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('srv-2')
    expect(list[1].id).toBe('srv-1')

    // 更新第一台服务器，重新提拔到首位
    await upsertServer({ ...srv1, displayName: 'Server 1 Updated' })
    list = await listServers()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('srv-1')
    expect(list[0].displayName).toBe('Server 1 Updated')
    expect(list[1].id).toBe('srv-2')
  })

  it('saveLastServer 与 getLastServer 能够存取最近登录的地址与账号信息', async () => {
    expect(await getLastServer()).toBeNull()

    await saveLastServer({
      serverId: 'srv-last',
      baseUrl: 'http://nas.local:5666',
      username: 'admin',
      displayName: '我的NAS',
      rememberPassword: true,
    })

    const retrieved = await getLastServer()
    expect(retrieved).toEqual({
      serverId: 'srv-last',
      baseUrl: 'http://nas.local:5666',
      username: 'admin',
      displayName: '我的NAS',
      rememberPassword: true,
    })
  })

  it('savePassword / getPassword / clearPassword 能安全存取与清除指定服务器密码', async () => {
    expect(await getPassword('srv-1')).toBeNull()
    await savePassword('srv-1', 'secret123')
    expect(await getPassword('srv-1')).toBe('secret123')
    await clearPassword('srv-1')
    expect(await getPassword('srv-1')).toBeNull()
  })

  it('removeServer 移除服务器时联动更新或清理 lastServer', async () => {
    const srv1: ServerConnection = {
      id: 'srv-1',
      providerId: 'fnos',
      displayName: 'Server 1',
      baseUrl: 'http://nas1.local:5666',
      username: 'user1',
    }
    const srv2: ServerConnection = {
      id: 'srv-2',
      providerId: 'fnos',
      displayName: 'Server 2',
      baseUrl: 'http://nas2.local:5666',
      username: 'user2',
    }

    await upsertServer(srv1)
    await upsertServer(srv2)
    await saveLastServer({ baseUrl: srv2.baseUrl, username: srv2.username })

    // 删除当前记录的 lastServer (srv2)，应自动切换至剩余的 srv1
    await removeServer('srv-2')
    let last = await getLastServer()
    expect(last?.baseUrl).toBe(srv1.baseUrl)
    expect(last?.username).toBe(srv1.username)

    // 删除所有服务器后，lastServer 应被清空
    await removeServer('srv-1')
    last = await getLastServer()
    expect(last).toBeNull()
  })
})
