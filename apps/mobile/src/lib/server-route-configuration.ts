import type { MusicProvider, ServerConnection } from '@qj/provider-api'
import { normalizeAlternateBaseUrls } from '@qj/provider-api'

/** Keep the provider/queue identity; only apply routing after the setting was saved. */
export async function saveServerRouteConfiguration(
  connection: ServerConnection,
  provider: MusicProvider,
  urls: readonly string[],
  save: (next: ServerConnection) => Promise<void>,
  isCurrent: () => boolean,
): Promise<ServerConnection> {
  const routing = provider.routing
  if (!routing || provider.connection.id !== connection.id) throw new Error('当前服务器不支持多线路')
  const check = () => { if (!isCurrent()) throw new Error('服务器设置操作已取消') }
  check()
  const alternateBaseUrls = normalizeAlternateBaseUrls(connection.baseUrl, urls)
  for (const url of alternateBaseUrls) {
    if (connection.alternateBaseUrls?.includes(url)) continue
    await routing.validate(url)
    check()
  }
  const next = { ...connection, alternateBaseUrls }
  check()
  await save(next)
  check()
  routing.setAlternates(alternateBaseUrls)
  return next
}
