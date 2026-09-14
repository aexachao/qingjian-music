import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasCode, hasNoCode, readSource } from '../support/source'

/**
 * 「换服务器」这件事只有一条路径。
 *
 * 产品决定（2026-09-15）：客户端**不支持服务器切换**。设置页不提供任何服务器
 * 管理入口，唯一的换服务器方式是退出登录后在登录页用「历史服务器」重新登录。
 *
 * 之所以把这条钉在测试里：残留的入口不会报错，它会静静地让用户以为可以切换。
 */
describe('设置页不提供服务器管理', () => {
  it('设置首页没有「服务器」入口', () => {
    expect(hasNoCode('screens/settings.tsx', 'settings/servers')).toBe(true)
    expect(hasNoCode('screens/settings.tsx', 'label="服务器"')).toBe(true)
  })

  it('服务器管理页与它的路由都已移除', () => {
    const screen = fileURLToPath(new URL('../../src/screens/server-settings.tsx', import.meta.url))
    const route = fileURLToPath(new URL('../../src/app/(tabs)/settings/servers.tsx', import.meta.url))
    expect(existsSync(screen), 'src/screens/server-settings.tsx 应已删除').toBe(false)
    expect(existsSync(route), 'settings/servers 路由应已删除').toBe(false)
    expect(hasNoCode('app/(tabs)/settings/_layout.tsx', 'name="servers"')).toBe(true)
  })

  it('会话层不再暴露切换 / 删除服务器的能力 —— 没有 UI 的能力就是死代码', () => {
    expect(hasNoCode('lib/server-session.tsx', 'switchServer')).toBe(true)
    expect(hasNoCode('lib/server-session.tsx', 'removeServer')).toBe(true)
  })
})

describe('换服务器的唯一路径：登录页历史记录', () => {
  it('登录页保留历史服务器入口', () => {
    const login = readSource('app/login.tsx')
    expect(login).toContain('历史服务器')
    expect(login).toContain('setShowHistoryModal(true)')
    expect(login).toContain('选择历史服务器')
  })

  it('登录成功后进音乐库，不再跳回已删除的服务器管理页', () => {
    const login = readSource('app/login.tsx')
    expect(hasCode('app/login.tsx', "router.replace('/library')")).toBe(true)
    expect(login).not.toContain('settings/servers')
  })
})
