import { describe, expect, it } from 'vitest'
import { isLoopbackOrPrivateHost, validateBaseUrl } from '../src/connection'

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
