import type { ProviderId } from './connection'
import type { ProviderFactory } from './provider'

/** 后端注册表：新增一种服务器只需注册一个 factory，UI 不用改 */
export class ProviderRegistry {
  private readonly factories = new Map<ProviderId, ProviderFactory>()

  register(factory: ProviderFactory): void {
    this.factories.set(factory.providerId, factory)
  }

  get(providerId: ProviderId): ProviderFactory {
    const factory = this.factories.get(providerId)
    if (!factory) throw new Error(`未注册的后端类型: ${providerId}`)
    return factory
  }

  list(): ProviderFactory[] {
    return [...this.factories.values()]
  }
}

export const providerRegistry = new ProviderRegistry()
