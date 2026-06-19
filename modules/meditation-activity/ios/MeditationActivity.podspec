Pod::Spec.new do |s|
  s.name           = 'MeditationActivity'
  s.version        = '1.0.0'
  s.summary        = 'ActivityKit bridge for the meditation-timer Live Activity.'
  s.description    = 'Local Expo module: starts/ends the meditation Live Activity from JS.'
  s.license        = 'MIT'
  s.author         = 'Brian Carlisle'
  s.homepage       = 'https://github.com/briancarlisle/EscapeFromHadesIRL'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/briancarlisle/EscapeFromHadesIRL.git', tag: s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
