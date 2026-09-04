import type { SessionUser, ServerId } from '@qj/core-domain'

/** 目前只实现 fnos，其余是为后续扩展预留的枚举位 */
export type ProviderId = 'fnos' | 'emby' | 'subsonic' | 'demo'

/** 一条「服务器 + 账号」配置，对应设置页里的一张表单 */
export interface ServerConnection {
  id: ServerId
  providerId: ProviderId
  /** 展示名，默认取服务器返回的名称 */
  displayName: string
  /** 形如 http://192.168.2.100:5666 或 https://music.example.com，不含 API 前缀 */
  baseUrl: string
  username: string
}

export interface Credentials {
  password: string
}

/** 登录成功后的会话，token 存 Keychain，不落明文 */
export interface ProviderSession {
  token: string
  user: SessionUser
  /** 设备标识，飞牛登录与漫游接口都要传 */
  deviceId: string
  createdAt: number
}

export function isLoopbackOrPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local')) return true
  if (host === '127.0.0.1' || host === '::1') return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return false
}

/**
 * iOS ATS 约束：明文 HTTP 只允许连局域网/私有地址（配合 NSAllowsLocalNetworking），
 * 公网地址必须走 https，否则上架审核与运行时都会出问题。
 */
export function validateBaseUrl(input: string): { url: string; insecureLocal: boolean } {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('请填写服务器地址')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error('服务器地址格式不正确')
  }
  const insecure = parsed.protocol === 'http:'
  const local = isLoopbackOrPrivateHost(parsed.hostname)
  if (insecure && !local) {
    throw new Error('公网地址请使用 https，明文 HTTP 仅支持局域网地址')
  }
  return { url: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`, insecureLocal: insecure && local }
}
