import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const plugin = require('../../plugins/with-android-cleartext') as {
  applyCleartext: (manifest: unknown) => unknown
}

const appConfig = JSON.parse(readFileSync(resolve(__dirname, '../../app.json'), 'utf8')) as {
  expo: { plugins: unknown[]; android: Record<string, unknown> }
}

describe('Android 明文 HTTP（一期 F1）', () => {
  it('plugin 把 usesCleartextTraffic 写进 <application>，且可重复执行', () => {
    const attrs: Record<string, string> = { 'android:name': '.MainApplication' }
    const manifest = { manifest: { application: [{ $: attrs }] } }

    plugin.applyCleartext(manifest)
    plugin.applyCleartext(manifest)

    expect(attrs['android:usesCleartextTraffic']).toBe('true')
  })

  it('app.json 注册了 plugin，且不再保留 Expo 不支持的 android.usesCleartextTraffic 键', () => {
    expect(appConfig.expo.plugins).toContain('./plugins/with-android-cleartext')
    // Expo 的 config schema 里没有这个键，写了会被静默忽略 —— 留着只会让人误以为已经配好了
    expect(appConfig.expo.android.usesCleartextTraffic).toBeUndefined()
  })
})
