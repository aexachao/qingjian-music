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
  { id: 'crimson-glass', nativeName: 'AppIconCrimsonGlass', resource: 'app_icon_crimson_glass', default: true },
  { id: 'gold-glow', nativeName: 'AppIconGoldGlow', resource: 'app_icon_gold_glow' },
  { id: 'crimson-bars', nativeName: 'AppIconCrimsonBars', resource: 'app_icon_crimson_bars' },
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
    const resRoot = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res')
    const sourceRoot = path.join(cfg.modRequest.projectRoot, 'assets/images/app-icons/android')
    const drawableRoot = path.join(resRoot, 'drawable-nodpi')
    const legacyRoot = path.join(resRoot, 'mipmap-xxxhdpi')
    const adaptiveRoot = path.join(resRoot, 'mipmap-anydpi-v26')
    const themedRoot = path.join(resRoot, 'mipmap-anydpi-v33')
    for (const dir of [drawableRoot, legacyRoot, adaptiveRoot, themedRoot]) {
      fs.mkdirSync(dir, { recursive: true })
    }

    for (const icon of ICONS) {
      const foreground = `${icon.resource}_foreground`
      const monochrome = `${icon.resource}_monochrome`
      fs.copyFileSync(path.join(sourceRoot, `${icon.id}-foreground.png`), path.join(drawableRoot, `${foreground}.png`))
      fs.copyFileSync(path.join(sourceRoot, `${icon.id}-monochrome.png`), path.join(drawableRoot, `${monochrome}.png`))
      fs.copyFileSync(path.join(sourceRoot, `${icon.id}-legacy.png`), path.join(legacyRoot, `${icon.resource}.png`))
      const background = icon.id.startsWith('crimson') ? '#F62C55' : '#000000'
      const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="${background}" />\n  <foreground android:drawable="@drawable/${foreground}" />\n</adaptive-icon>\n`
      const themedXml = adaptiveXml.replace(
        '</adaptive-icon>',
        `  <monochrome android:drawable="@drawable/${monochrome}" />\n</adaptive-icon>`,
      )
      fs.writeFileSync(path.join(adaptiveRoot, `${icon.resource}.xml`), adaptiveXml)
      fs.writeFileSync(path.join(themedRoot, `${icon.resource}.xml`), themedXml)
    }
    return cfg
  }])
}

module.exports = function withAppIcons(config) {
  config = withIosAlternateIcons(config)
  return withAndroidIconAliases(config)
}

module.exports.ICONS = ICONS
module.exports.hasLauncherIntentFilter = hasLauncherIntentFilter
