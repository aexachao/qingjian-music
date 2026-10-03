import { describe, expect, it } from 'vitest'
import { isLoopbackOrPrivateHost, normalizeAlternateBaseUrls, validateBaseUrl } from '../src/connection'

describe('validateBaseUrl', () => {
  it('缺省协议时按 http 处理并保留端口', () => {
    expect(validateBaseUrl('192.168.2.100:5666')).toEqual({ url: 'http://192.168.2.100:5666', insecureLocal: true })
  })

  it('去掉末尾斜杠', () => {
    expect(validateBaseUrl('http://192.168.2.100:5666/').url).toBe('http://192.168.2.100:5666')
  })

  it('公网 https 通过', () => {
    expect(validateBaseUrl('https://music.example.com')).toEqual({ url: 'https://music.example.com', insecureLocal: false })
  })

  it('公网明文 http 被拒（iOS ATS 约束）', () => {
    expect(() => validateBaseUrl('http://music.example.com')).toThrow(/https/)
  })

  it('空值报错', () => {
    expect(() => validateBaseUrl('   ')).toThrow()
  })

  it('拒绝会改变请求目标的地址组成部分', () => {
    for (const input of [
      'http://user:pass@192.168.2.2:5666',
      'http://192.168.2.2:5666?token=x',
      'http://192.168.2.2:5666#fragment',
      'ftp://192.168.2.2:5666',
    ]) expect(() => validateBaseUrl(input)).toThrow()
  })
})

describe('normalizeAlternateBaseUrls', () => {
  const primary = 'http://192.168.2.100:5666'

  it('规范化两条显式备用线路', () => {
    expect(normalizeAlternateBaseUrls(primary, ['192.168.2.101:5666/', 'https://music.example.com/'])).toEqual([
      'http://192.168.2.101:5666',
      'https://music.example.com',
    ])
  })

  it('不静默接受重复、主线路或超过上限的输入', () => {
    expect(() => normalizeAlternateBaseUrls(primary, [primary])).toThrow()
    expect(() => normalizeAlternateBaseUrls(primary, ['192.168.2.101:5666', '192.168.2.101:5666'])).toThrow()
    expect(() => normalizeAlternateBaseUrls(primary, ['192.168.2.101:5666', '192.168.2.102:5666', '192.168.2.103:5666'])).toThrow()
  })
})

describe('isLoopbackOrPrivateHost', () => {
  it('识别常见私有地址段', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.2.100', '172.16.0.1', 'nas.local']) {
      expect(isLoopbackOrPrivateHost(host)).toBe(true)
    }
  })

  it('公网地址返回 false', () => {
    for (const host of ['example.com', '8.8.8.8', '172.32.0.1']) {
      expect(isLoopbackOrPrivateHost(host)).toBe(false)
    }
  })
})
