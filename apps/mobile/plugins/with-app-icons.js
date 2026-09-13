const fs = require('fs')
const path = require('path')
const {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins')

const ICONS = [
  { id: 'dark-bars', nativeName: 'AppIconDarkBars', resource: 'app_icon_dark_bars' },
  { id: 'gold-glow', nativeName: 'AppIconGoldGlow', resource: 'app_icon_gold_glow' },
  { id: 'crimson-bars', nativeName: 'AppIconCrimsonBars', resource: 'app_icon_crimson_bars', default: true },
]

const launcherIntentFilter = {
  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
}

function hasLauncherIntentFilter(filter) {
  return filter?.action?.some((item) => item.$?.['android:name'] === 'android.intent.action.MAIN') &&
    filter?.category?.some((item) => item.$?.['android:name'] === 'android.intent.category.LAUNCHER')
}

function withIosAlternateIcons(config) {
  config = withXcodeProject(config, (cfg) => {
    const buildConfigurations = cfg.modResults.pbxXCBuildConfigurationSection()
    const alternates = ICONS.filter((icon) => !icon.default).map((icon) => icon.nativeName)
    for (const entry of Object.values(buildConfigurations)) {
      const settings = entry && typeof entry === 'object' ? entry.buildSettings : undefined
      if (!settings?.PRODUCT_BUNDLE_IDENTIFIER) continue
      settings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = alternates
      settings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = 'YES'
    }
    return cfg
  })

  return withDangerousMod(config, ['ios', async (cfg) => {
    const sourceRoot = IOSConfig.Paths.getSourceRoot(cfg.modRequest.projectRoot)
    const assetCatalogRoot = path.join(sourceRoot, 'Images.xcassets')
    const sourceAssets = path.join(cfg.modRequest.projectRoot, 'assets/images/app-icons/ios')

    for (const icon of ICONS.filter((item) => !item.default)) {
      const iconSet = path.join(assetCatalogRoot, `${icon.nativeName}.appiconset`)
      fs.rmSync(iconSet, { recursive: true, force: true })
      fs.mkdirSync(iconSet, { recursive: true })
      const filename = `${icon.nativeName}-1024.png`
      fs.copyFileSync(path.join(sourceAssets, `${icon.id}.png`), path.join(iconSet, filename))
      fs.writeFileSync(path.join(iconSet, 'Contents.json'), `${JSON.stringify({
        images: [{ filename, idiom: 'universal', platform: 'ios', size: '1024x1024' }],
        info: { author: 'expo', version: 1 },
      }, null, 2)}\n`)
    }
    return cfg
  }])
}

/** 图标背景色：绯红系用品牌色，其余用纯黑 */
function iconBackgroundColor(icon) {
  return icon.id.startsWith('crimson') ? '#F62C55' : '#000000'
}

/** 背景色的资源名。见 buildAdaptiveIconXml 的说明：必须走 `@color/...` */
function iconBackgroundColorName(icon) {
  return `${icon.resource}_background`
}

/**
 * 生成自适应图标的 XML。
 *
 * ⚠️ `<background android:drawable>` 只接受**资源引用**，不接受裸色值。
 * 这里曾经写的是 `android:drawable="#F62C55"`，AAPT2 直接拒绝：
 *
 *   ERROR: app_icon_crimson_bars.xml:3: AAPT: error:
 *   '#F62C55' is incompatible with attribute drawable (attr) reference.
 *
 * 后果是整个 `:app:processReleaseResources` 失败、release 包出不来。
 * 所以背景色必须走 `@color/...`，并配套在 values 里声明同名颜色
 * （见 buildIconColorResourcesXml）。前景 / 单色是图片，`@drawable/...` 本来就对。
 */
function buildAdaptiveIconXml(icon, { themed = false } = {}) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    `  <background android:drawable="@color/${iconBackgroundColorName(icon)}" />`,
    `  <foreground android:drawable="@drawable/${icon.resource}_foreground" />`,
  ]
  if (themed) {
    lines.push(`  <monochrome android:drawable="@drawable/${icon.resource}_monochrome" />`)
  }
  lines.push('</adaptive-icon>', '')
  return lines.join('\n')
}

/** 自适应图标背景色的 values 资源。与上面的 `@color/...` 引用一一对应，缺一个就会链接失败 */
function buildIconColorResourcesXml(icons) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<resources>',
    ...icons.map(
      (icon) =>
        `  <color name="${iconBackgroundColorName(icon)}">${iconBackgroundColor(icon)}</color>`,
    ),
    '</resources>',
    '',
  ].join('\n')
}

/**
 * 把 Android 图标资源真正落到 `res/` 下。
 *
 * 抽成独立函数是为了能在临时目录里真跑一遍再断言产物：只测两个 XML 构造函数
 * 证明不了「values 文件真的被写出来了」—— 漏掉那次 writeFileSync 同样是链接期失败，
 * 而且失败信息和「写了裸色值」一模一样，排查起来会绕远路。
 */
function writeAndroidIconAssets({ resRoot, sourceRoot }) {
  const drawableRoot = path.join(resRoot, 'drawable-nodpi')
  const legacyRoot = path.join(resRoot, 'mipmap-xxxhdpi')
  const adaptiveRoot = path.join(resRoot, 'mipmap-anydpi-v26')
  const themedRoot = path.join(resRoot, 'mipmap-anydpi-v33')
  const valuesRoot = path.join(resRoot, 'values')
  for (const dir of [drawableRoot, legacyRoot, adaptiveRoot, themedRoot, valuesRoot]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  for (const icon of ICONS) {
    const foreground = `${icon.resource}_foreground`
    const monochrome = `${icon.resource}_monochrome`
    fs.copyFileSync(path.join(sourceRoot, `${icon.id}-foreground.png`), path.join(drawableRoot, `${foreground}.png`))
    fs.copyFileSync(path.join(sourceRoot, `${icon.id}-monochrome.png`), path.join(drawableRoot, `${monochrome}.png`))
    fs.copyFileSync(path.join(sourceRoot, `${icon.id}-legacy.png`), path.join(legacyRoot, `${icon.resource}.png`))
    fs.writeFileSync(path.join(adaptiveRoot, `${icon.resource}.xml`), buildAdaptiveIconXml(icon))
    fs.writeFileSync(
      path.join(themedRoot, `${icon.resource}.xml`),
      buildAdaptiveIconXml(icon, { themed: true }),
    )
  }
  // 背景色的 @color 资源：与 buildAdaptiveIconXml 里的引用配对，漏写会在链接阶段失败
  fs.writeFileSync(
    path.join(valuesRoot, 'app_icon_backgrounds.xml'),
    buildIconColorResourcesXml(ICONS),
  )
}

function withAndroidIconAliases(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest)
    mainActivity['intent-filter'] = (mainActivity['intent-filter'] || []).filter(
      (filter) => !hasLauncherIntentFilter(filter),
    )

    const packageName = cfg.android?.package
    if (!packageName) throw new Error('android.package is required for app icon aliases')
    const targetActivity = mainActivity.$['android:name']
    const managedNames = new Set(ICONS.map((icon) => `${packageName}.${icon.nativeName}`))
    const retainedAliases = (application['activity-alias'] || []).filter(
      (alias) => !managedNames.has(alias.$?.['android:name']),
    )
    const aliases = ICONS.map((icon) => ({
      $: {
        'android:name': `${packageName}.${icon.nativeName}`,
        'android:targetActivity': targetActivity,
        'android:enabled': icon.default ? 'true' : 'false',
        'android:exported': 'true',
        'android:icon': `@mipmap/${icon.resource}`,
        'android:roundIcon': `@mipmap/${icon.resource}`,
        'android:label': '@string/app_name',
      },
      'intent-filter': [launcherIntentFilter],
    }))
    application['activity-alias'] = [...retainedAliases, ...aliases]
    return cfg
  })

  return withDangerousMod(config, ['android', async (cfg) => {
    writeAndroidIconAssets({
      resRoot: path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res'),
      sourceRoot: path.join(cfg.modRequest.projectRoot, 'assets/images/app-icons/android'),
    })
    return cfg
  }])
}

module.exports = function withAppIcons(config) {
  config = withIosAlternateIcons(config)
  return withAndroidIconAliases(config)
}

// 下面几个纯函数导出只为单测：生成出来的 XML 是给 AAPT2 吃的，
// 只看源码字符串断言「里面有没有 @color」证明不了资源能链接上。
module.exports.ICONS = ICONS
module.exports.hasLauncherIntentFilter = hasLauncherIntentFilter
module.exports.iconBackgroundColor = iconBackgroundColor
module.exports.iconBackgroundColorName = iconBackgroundColorName
module.exports.buildAdaptiveIconXml = buildAdaptiveIconXml
module.exports.buildIconColorResourcesXml = buildIconColorResourcesXml
module.exports.writeAndroidIconAssets = writeAndroidIconAssets
