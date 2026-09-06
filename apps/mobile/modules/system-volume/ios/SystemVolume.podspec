Pod::Spec.new do |s|
  s.name           = 'SystemVolume'
  s.version        = '1.0.0'
  s.summary        = '系统音量滑杆'
  s.description    = '包一层系统的 MPVolumeView，用来控制 iOS 系统音量'
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
