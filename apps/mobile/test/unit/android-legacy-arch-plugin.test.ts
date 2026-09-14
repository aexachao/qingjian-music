import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const plugin = require('../../plugins/with-android-legacy-arch') as {
  setLegacyArch: (props: unknown[]) => unknown[]
  ARCH_PROPERTY: string
}

const appConfig = JSON.parse(readFileSync(resolve(__dirname, '../../app.json'), 'utf8')) as {
  expo: { plugins: unknown[]; newArchEnabled?: unknown }
}

type GradleProperty = { type: string; key?: string; value?: unknown }

describe('关掉新架构（RNTP 兼容性）', () => {
  it('属性不存在时新增，值为 false', () => {
    const out = plugin.setLegacyArch([]) as GradleProperty[]
    expect(out).toEqual([{ type: 'property', key: 'newArchEnabled', value: 'false' }])
  })

  it('已存在 true 时改写成 false，而不是再添一条', () => {
    const out = plugin.setLegacyArch([
      { type: 'property', key: 'newArchEnabled', value: 'true' },
      { type: 'property', key: 'android.useAndroidX', value: 'true' },
    ]) as GradleProperty[]

    expect(out).toHaveLength(2)
    expect(out.find((p) => p.key === 'newArchEnabled')?.value).toBe('false')
    expect(out.find((p) => p.key === 'android.useAndroidX')?.value).toBe('true')
  })

  it('重复执行结果不变（prebuild 可能多次跑同一插件）', () => {
    const once = plugin.setLegacyArch([])
    const twice = plugin.setLegacyArch(once)
    expect(twice).toEqual(once)
  })

  it('不碰非 property 类型的条目（注释、空行等）', () => {
    const comment = { type: 'comment', value: '# 保留我' }
    const out = plugin.setLegacyArch([comment]) as GradleProperty[]
    expect(out).toContainEqual(comment)
  })

  it('插件已接入 app.json', () => {
    expect(appConfig.expo.plugins).toContain('./plugins/with-android-legacy-arch')
  })

  /**
   * 这条是**防止有人把它「顺手」搬回 app.json**。
   *
   * `expo.newArchEnabled` 这个名字看起来天经地义，但 Expo 的 config schema 里没有它，
   * 写了会被静默忽略 —— 生成的 gradle.properties 仍是 `newArchEnabled=true`，
   * 而新架构下 RNTP 会崩。2026-09-14 实测确认过这个行为，所以钉在这里。
   */
  it('不要把开关写回 app.json 的 expo.newArchEnabled —— 那个键是被静默忽略的', () => {
    expect(appConfig.expo).not.toHaveProperty('newArchEnabled')
  })
})
