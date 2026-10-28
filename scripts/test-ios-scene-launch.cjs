const assert=require('node:assert/strict'),fs=require('fs'),plugin=require('../plugins/with-ios-scene-lifecycle');
const fresh=`import Expo
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  func setup() {
    bindReactNativeFactory(factory)
    #if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions
    )
    #endif
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  // Linking API
}
`;
const scene=plugin.configureAppDelegate(fresh);
assert.equal(plugin.configureAppDelegate(scene),scene,'idempotent across repeated prebuild');
const app=scene.slice(0,scene.indexOf('// SalonPro UIScene lifecycle'));
const connect=scene.slice(scene.indexOf('  func scene(_ scene: UIScene, willConnectTo'));
assert.match(app,/salonProLaunchOptions = launchOptions\s+return true/);
assert.match(app,/guard !salonProExpoLaunchFinished else \{ return \}/);
assert.match(app,/super.application\(UIApplication.shared, didFinishLaunchingWithOptions: launchOptions\)/);
assert.ok(connect.indexOf('appDelegate.window = sceneWindow')<connect.indexOf('factory.startReactNative'));
assert.ok(connect.indexOf('factory.startReactNative')<connect.indexOf('appDelegate.salonProFinishExpoLaunch(launchOptions)'),'Expo subscribers require a window and a prepared dev launcher');
assert.match(connect,/existingWindow.windowScene = windowScene/);
assert.match(connect,/launchOptions\[.remoteNotification\]/);assert.match(connect,/launchOptions\[.url\]/);assert.match(connect,/launchOptions\[.userActivityDictionary\]/);
const local=fs.readFileSync('ios/SalonPro/AppDelegate.swift','utf8');assert.equal(plugin.configureAppDelegate(local),local,'generated local delegate aligned');
const manifest=plugin.configureInfoPlist({other:true});assert.equal(manifest.other,true);assert.equal(manifest.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes,false);
assert.throws(()=>plugin.configureAppDelegate('unknown delegate'),/review/);
console.log('PASS scene launch: factory and window precede Expo subscribers, once-only handoff, retained window, deep links/notifications, idempotent fresh/upgrade paths and generated delegate. Physical cold-start proof remains separate.');
