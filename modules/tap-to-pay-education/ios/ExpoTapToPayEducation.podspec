require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'ExpoTapToPayEducation'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = 'MIT'
  s.author = 'SalonPro'
  s.homepage = 'https://salonpro.dev'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { git: 'https://example.invalid/expo-tap-to-pay-education.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ProximityReader'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,swift}'
end
