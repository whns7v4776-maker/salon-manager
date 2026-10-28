const {withPodfile,withEntitlementsPlist}=require('expo/config-plugins');
const marker='# SalonPro supported pod deployment targets';

function configurePodfile(contents){
  if(contents.includes(marker))return contents;
  const anchor=/react_native_post_install\([\s\S]*?\n    \)/;
  if(!anchor.test(contents))throw Error('SalonPro iOS build: review the changed Podfile post_install hook.');
  return contents.replace(anchor,match=>`${match}
    ${marker}
    # SDK 54 already requires iOS 15.1. Old resource podspecs still declare
    # iOS 9-13; Xcode 27 rejects those targets before compiling the app.
    minimum_ios = Gem::Version.new('15.1')
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_s
        if current.match?(/\\A\\d+(\\.\\d+)*\\z/) && Gem::Version.new(current) < minimum_ios
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios.to_s
        end
      end
    end`);
}
function configureEntitlements(config,entitlements){
  const domains=entitlements['com.apple.developer.associated-domains'];
  const development=config.ios?.bundleIdentifier?.endsWith('.dev');
  // An empty entitlement still requires the capability in a signing profile.
  // The isolated dev app has no associated domains; production keeps its links.
  if(development&&Array.isArray(domains)&&domains.length===0){
    const result={...entitlements};delete result['com.apple.developer.associated-domains'];return result;
  }
  return entitlements;
}
function withIosBuildCompat(config){
  config=withEntitlementsPlist(config,mod=>{mod.modResults=configureEntitlements(mod,mod.modResults);return mod;});
  return withPodfile(config,mod=>{mod.modResults.contents=configurePodfile(mod.modResults.contents);return mod;});
}
module.exports=withIosBuildCompat;
module.exports.configurePodfile=configurePodfile;
module.exports.configureEntitlements=configureEntitlements;
