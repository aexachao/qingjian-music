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

  it('会话层不支持切换服务器；只保留「删掉一条历史记录」的能力', () => {
    expect(hasNoCode('lib/server-session.tsx', 'switchServer')).toBe(true)
    // removeServer 留着 —— 历史页要用它清理不再需要的记录，这和「切换」是两回事
    expect(hasCode('lib/server-session.tsx', 'removeServer')).toBe(true)
  })
})

describe('换服务器的唯一路径：登录页 → 历史服务器二级页面', () => {
  it('登录页的历史入口指向二级页面，不再用弹窗', () => {
    const login = readSource('app/login.tsx')
    expect(login).toContain('历史服务器')
    expect(login).toContain("router.push('/servers')")
    expect(login).not.toContain('OptionPickerModal')
    expect(login).not.toContain('showHistoryModal')
  })

  it('历史页用左滑删除，点一下则回登录页并带上选择', () => {
    const history = readSource('screens/server-history.tsx')
    // 左滑删除：复用队列行那套 Swipeable + 右侧动作
    expect(history).toContain('Swipeable')
    expect(history).toContain('renderRightActions')
    expect(history).toContain('removeServer')
    // 删除是破坏性动作，要有二次确认
    expect(history).toContain('destructive: true')
    // 选中后回登录页回填
    expect(history).toContain("pathname: '/login'")
    expect(history).toContain('params: { serverId }')
  })

  it('登录页认得带回来的 serverId 并据此回填', () => {
    const login = readSource('app/login.tsx')
    expect(login).toContain('useLocalSearchParams')
    expect(login).toContain('requestedServerId')
  })

  it('登录成功后进音乐库，不再跳回已删除的服务器管理页', () => {
    const login = readSource('app/login.tsx')
    expect(hasCode('app/login.tsx', "router.replace('/library')")).toBe(true)
    expect(login).not.toContain('settings/servers')
  })
})
