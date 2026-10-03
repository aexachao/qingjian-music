import { describe, expect, it, vi } from 'vitest'
import type { MusicProvider, ServerConnection } from '@qj/provider-api'
import { saveServerRouteConfiguration } from '@/lib/server-route-configuration'
function fixture() {
  const connection: ServerConnection = { id: 'srv', providerId: 'fnos', displayName: 'NAS', baseUrl: 'https://primary.test', username: 'user', alternateBaseUrls: ['https://existing.test'] }
  const routing = { validate: vi.fn(async (_url: string) => undefined), setAlternates: vi.fn() }
  const provider = { connection, routing } as unknown as MusicProvider
  const save = vi.fn(async (_next: ServerConnection) => undefined)
  return { connection, provider, routing, save }
}
describe('saving server route configuration', () => {
  it('validates only new candidates and saves before applying without replacing identity', async () => {
    const f = fixture()
    const next = await saveServerRouteConfiguration(f.connection, f.provider, ['https://existing.test/', 'https://backup.test/'], f.save, () => true)
    expect(f.routing.validate.mock.calls).toEqual([['https://backup.test']])
    expect(f.save).toHaveBeenCalledWith({ ...f.connection, alternateBaseUrls: ['https://existing.test', 'https://backup.test'] })
    expect(f.save.mock.invocationCallOrder[0]).toBeLessThan(f.routing.setAlternates.mock.invocationCallOrder[0]!)
    expect(next.id).toBe(f.connection.id)
    expect(f.provider.connection).toBe(f.connection)
  })
  it.each([{urls:['https://primary.test']}, {urls:['https://backup.test','https://backup.test/']}, {urls:['https://user:secret@backup.test']}, {urls:['http://public.test']}])('rejects invalid candidates before probing or saving: $urls', async ({urls}) => {
    const f = fixture()
    await expect(saveServerRouteConfiguration(f.connection, f.provider, urls, f.save, () => true)).rejects.toThrow()
    expect(f.routing.validate).not.toHaveBeenCalled()
    expect(f.save).not.toHaveBeenCalled()
    expect(f.routing.setAlternates).not.toHaveBeenCalled()
  })
  it('keeps current routes when validation fails', async () => {
    const f = fixture()
    f.routing.validate.mockRejectedValue(new Error('different server'))
    await expect(saveServerRouteConfiguration(f.connection, f.provider, ['https://backup.test'], f.save, () => true)).rejects.toThrow('different server')
    expect(f.save).not.toHaveBeenCalled()
    expect(f.routing.setAlternates).not.toHaveBeenCalled()
  })
  it('does not apply routes when persistence fails', async () => {
    const f = fixture()
    f.save.mockRejectedValue(new Error('keychain unavailable'))
    await expect(saveServerRouteConfiguration(f.connection, f.provider, [], f.save, () => true)).rejects.toThrow('keychain unavailable')
    expect(f.routing.setAlternates).not.toHaveBeenCalled()
  })
  it('does not save a candidate validated after logout', async () => {
    const f = fixture()
    let current = true
    f.routing.validate.mockImplementation(async () => { current = false })
    await expect(saveServerRouteConfiguration(f.connection, f.provider, ['https://backup.test'], f.save, () => current)).rejects.toThrow('已取消')
    expect(f.save).not.toHaveBeenCalled()
    expect(f.routing.setAlternates).not.toHaveBeenCalled()
  })
  it('does not activate a persisted configuration after changing account', async () => {
    const f = fixture()
    let current = true
    f.save.mockImplementation(async () => { current = false })
    await expect(saveServerRouteConfiguration(f.connection, f.provider, [], f.save, () => current)).rejects.toThrow('已取消')
    expect(f.routing.setAlternates).not.toHaveBeenCalled()
  })
})
