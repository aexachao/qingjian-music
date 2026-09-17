Pod::Spec.new do |s|
  s.name           = 'AudioDownloader'
  s.version        = '1.0.0'
  s.summary       = '后台分片下载（HLS 转码产物）'
  s.description   = '用 iOS 后台 URLSession 把 init + 分片一次性入队，全部到齐后拼成单文件；App 被杀也继续'
  s.author         = ''
  s.homepage      = 'https://docs.expo.dev/modules/'
  s.platforms     = { :ios => '16.4' }
  s.source        = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
