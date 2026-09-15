import { describe, expect, it } from 'vitest'
import { isFnId } from '@qj/provider-fnos'
import { readSource } from '../support/source'

describe('登录页布局与 FN ID 交互规范', () => {
  const loginSource = readSource('app/login.tsx')

  it('采用轻简音乐自身品牌资产与设计规范（去除冗余标题与标题栏）', () => {
    const layoutSource = readSource('app/_layout.tsx')
    expect(layoutSource).toContain('<Stack.Screen name="login" options={{ headerShown: false }} />')
    expect(loginSource).toContain('assets/images/icon.png')
    expect(loginSource).not.toContain('连接你的飞牛音乐服务器')
    expect(loginSource).toContain('useThemeColors')
    expect(loginSource).toContain('radius.lg')
  })

  it('支持记住密码并在历史选择或冷启动时安全恢复密码', () => {
    expect(loginSource).toContain('getPassword')
    expect(loginSource).toContain('rememberPassword ? \'checkmarkCircle\' : \'circle\'')
  })

  it('三段式卡片输入布局：服务器/FN ID、账号、密码', () => {
    expect(loginSource).toContain('placeholder="请输入 IP 地址、域名或 FN ID"')
    expect(loginSource).toContain('placeholder="账号"')
    expect(loginSource).toContain('placeholder="密码"')
    // 历史服务器是二级页面（要能左滑删除），不是弹窗
    expect(loginSource).toContain("router.push('/servers')")
    expect(loginSource).toContain('showPassword')
  })

  it('配备辅助操作：记住密码与 HTTPS 安全访问开关', () => {
    expect(loginSource).toContain('记住密码')
    expect(loginSource).toContain('HTTPS 安全访问')
    expect(loginSource).toContain('<Switch')
  })

  it('表单里不放「忘记密码」死入口，改为凭据失败时给出重置指引', () => {
    // 飞牛没有密码找回接口，表单里的入口点了只能弹说明 —— 这种死入口不放
    expect(loginSource).not.toContain('忘记密码?')
    expect(loginSource).not.toContain('handleForgotPassword')
    // 引导挪到真正需要它的时刻：登录失败的错误态
    expect(loginSource).toContain('showResetHint')
    expect(loginSource).toContain('飞牛管理后台重置')
  })

  it('集成 FN ID 智能解析与内外网探测链路 (方案 B)', () => {
    expect(loginSource).toContain('isFnId(rawInput)')
    expect(loginSource).toContain('resolveFnIdToBaseUrl')
    expect(loginSource).toContain('正在解析 FN ID...')
  })

  it('焦点聚焦且有内容时展示清空按钮', () => {
    expect(loginSource).toContain('focusedField === \'address\' && address.length > 0')
    expect(loginSource).toContain('focusedField === \'username\' && username.length > 0')
    expect(loginSource).toContain('focusedField === \'password\' && password.length > 0')
    expect(loginSource).toContain('name="clear"')
  })

  it('isFnId 正确识别纯 FN ID 与常规 IP/网址', () => {
    expect(isFnId('my-nas-01')).toBe(true)
    expect(isFnId('192.168.2.100')).toBe(false)
    expect(isFnId('http://192.168.2.100:5666')).toBe(false)
    expect(isFnId('https://mynas.fnos.net')).toBe(false)
  })
})
