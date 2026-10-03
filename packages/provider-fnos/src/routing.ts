import { MusicError } from '@qj/core-domain'
import { normalizeAlternateBaseUrls, type ProviderRouting, type ProviderSession, validateBaseUrl } from '@qj/provider-api'

export interface FnosRouteCoordinatorOptions {
  baseUrl: string
  alternateBaseUrls?: string[]
  session: () => ProviderSession | undefined
  /** 必须使用已有 token 请求 /user/me；不得在探测期间静默重登。 */
  probe(baseUrl: string, token: string): Promise<{ id: string }>
  activeChanged(baseUrl: string): void
}

/**
 * 仅管理用户已保存的线路。它没有后台定时探测：只在一个 GET 已失败或播放层明确
 * 请求恢复时，带原 token 验证候选地址确实还是同一个用户，再提交切换。
 */
export class FnosRouteCoordinator implements ProviderRouting {
  private readonly primary: string
  private alternates: string[]
  private active: string
  private revision = 0
  private retired = false
  private recovery: Promise<boolean> | undefined
  private readonly listeners = new Set<() => void>()

  constructor(private readonly options: FnosRouteCoordinatorOptions) {
    this.primary = normalizeRoute(options.baseUrl)
    this.active = this.primary
    this.alternates = normalizeAlternateBaseUrls(this.primary, options.alternateBaseUrls ?? [])
  }

  getActiveBaseUrl(): string {
    return this.active
  }

  hasAlternates(): boolean {
    return this.alternates.length > 0
  }

  async validate(baseUrl: string): Promise<void> {
    const session = this.options.session()
    if (!session || this.retired) throw new MusicError({ code: 'unauthorized', message: '尚未登录，无法验证线路' })
    const candidate = normalizeRoute(baseUrl)
    const user = await this.options.probe(candidate, session.token)
    if (this.retired || session !== this.options.session()) {
      throw new MusicError({ code: 'canceled', message: '线路验证已取消' })
    }
    if (user.id !== session.user.id) {
      throw new MusicError({ code: 'forbidden', message: '备用线路登录的不是当前用户' })
    }
  }

  setAlternates(urls: string[]): void {
    this.alternates = normalizeAlternateBaseUrls(this.primary, urls)
    // 旧探测绝不能在用户保存新设置后覆盖当前路线。
    this.revision += 1
    if (this.active !== this.primary && !this.alternates.includes(this.active)) {
      this.active = this.primary
      this.options.activeChanged(this.primary)
      this.notify()
    }
  }

  recover(failedUrl?: string): Promise<boolean> {
    if (this.retired) return Promise.resolve(false)
    const failed = failedUrl ? knownRouteFor(failedUrl, [this.primary, ...this.alternates, this.active]) : this.active
    // 已有别的请求完成切换时，来自旧线路的晚到错误无需再探测一次。
    if (failed && failed !== this.active) return Promise.resolve(true)
    if (this.recovery) return this.recovery
    const request = this.recoverOnce()
    this.recovery = request
    void request.then(
      () => { if (this.recovery === request) this.recovery = undefined },
      () => { if (this.recovery === request) this.recovery = undefined },
    )
    return request
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** provider 注销时调用，令所有迟到探测自然失效。 */
  retire(): void {
    this.retired = true
    this.revision += 1
  }

  private async recoverOnce(): Promise<boolean> {
    const session = this.options.session()
    if (!session || this.retired) return false
    const revision = this.revision
    // 每轮每个候选只探测一次；当前线失败后才试其它线。
    const candidates = [this.primary, ...this.alternates].filter((url) => url !== this.active)
    for (const candidate of candidates) {
      if (this.retired || revision !== this.revision || session !== this.options.session()) return false
      try {
        const user = await this.options.probe(candidate, session.token)
        if (this.retired || revision !== this.revision || session !== this.options.session()) return false
        if (user.id !== session.user.id) continue
        this.active = candidate
        this.options.activeChanged(candidate)
        this.notify()
        return true
      } catch {
        // 网络、超时、网关错误及协议错误都不能让本轮恢复中断；继续下一条用户保存的线路。
        if (this.retired || revision !== this.revision || session !== this.options.session()) return false
      }
    }
    return false
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // 订阅者的 UI 错误不能把已经确认的线路切换回滚或留下未处理 rejection。
      }
    }
  }
}

function normalizeRoute(input: string): string {
  return validateBaseUrl(input).url
}

function knownRouteFor(input: string, routes: readonly string[]): string | undefined {
  try {
    const failed = new URL(input)
    // 同 host 的主线路通常是根路径；它必须排在 /music、/relay 等更具体路径之后，
    // 否则来自备用路径的原生 URL 会被误判成主线路的旧错误。
    const ordered = [...new Set(routes)].sort((left, right) => new URL(right).pathname.length - new URL(left).pathname.length)
    for (const route of ordered) {
      const candidate = new URL(route)
      const prefix = candidate.pathname.replace(/\/+$/, '')
      if (failed.origin !== candidate.origin) continue
      if (!prefix || prefix === '/' || failed.pathname === prefix || failed.pathname.startsWith(`${prefix}/`)) return route
    }
  } catch {
    // 原生回传的可能是缓存或本地 file URL；这种情况按当前线路恢复即可。
  }
  return undefined
}
