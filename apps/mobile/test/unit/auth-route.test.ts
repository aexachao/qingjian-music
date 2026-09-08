import { describe, expect, it } from 'vitest'
import { authRedirect } from '../../src/lib/auth-route'

describe('认证路由状态机', () => {
  it('恢复会话时只允许停留在启动页', () => {
    expect(authRedirect('loading', 'boot')).toBeNull()
    expect(authRedirect('loading', 'login')).toBe('/')
    expect(authRedirect('loading', 'protected')).toBe('/')
  })

  it('退出状态只能进入登录页', () => {
    expect(authRedirect('signedOut', 'boot')).toBe('/login')
    expect(authRedirect('signedOut', 'login')).toBeNull()
    expect(authRedirect('signedOut', 'protected')).toBe('/login')
  })

  it('登录状态只能进入受保护页面', () => {
    expect(authRedirect('signedIn', 'boot')).toBe('/home')
    expect(authRedirect('signedIn', 'login')).toBe('/home')
    expect(authRedirect('signedIn', 'protected')).toBeNull()
  })
})
