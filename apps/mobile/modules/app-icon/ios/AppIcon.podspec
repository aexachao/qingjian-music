Pod::Spec.new do |s|
  s.name           = 'AppIcon'
  s.version        = '1.0.0'
  s.summary        = '运行时切换应用桌面图标'
  s.description    = '使用 UIApplication alternate icon API 切换预置的应用图标'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
