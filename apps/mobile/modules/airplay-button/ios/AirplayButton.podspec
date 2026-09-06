Pod::Spec.new do |s|
  s.name           = 'AirplayButton'
  s.version        = '1.0.0'
  s.summary        = 'AirPlay 输出设备选择按钮'
  s.description    = '包一层系统的 AVRoutePickerView，用来弹出 iOS 的输出设备选择面板'
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
