const { withPodfile } = require('expo/config-plugins')

/** Keep the SwiftAudioEx lock-order repair across prebuild and pod install. */
module.exports = function withSwiftAudioState(config) {
  return withPodfile(config, (cfg) => {
    const marker = "require_relative '../scripts/patch-swift-audio-state'"
    if (!cfg.modResults.contents.includes(marker)) {
      const hook = 'post_install do |installer|'
      if (!cfg.modResults.contents.includes(hook)) throw new Error('SwiftAudioEx repair: post_install hook not found')
      cfg.modResults.contents = marker + '\n' + cfg.modResults.contents.replace(hook, hook + '\n    patch_swift_audio_state(installer)')
    }
    return cfg
  })
}
