Pod::Spec.new do |s|
  s.name = 'SalonProMetaInstallEvents'
  s.version = '1.0.0'
  s.summary = 'Explicit consent-gated Meta install activation'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'SalonPro'
  s.homepage = 'https://salonpro.dev'
  s.source = { :git => 'https://salonpro.dev' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'FBSDKCoreKit', '~> 18.0'
  s.source_files = '**/*.swift'
end
