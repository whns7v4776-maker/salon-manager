const {withAppDelegate,withInfoPlist}=require('expo/config-plugins');

// SDK 54's template predates the UIScene requirement of Xcode/iOS 27.
// Keep the Expo factory (including updates/splash subscribers) and create its
// one window from the actual scene. Expo subscribers run only after the factory
// has prepared that window, as required by expo-dev-launcher SDK 54.
const marker='// SalonPro UIScene lifecycle';
const sceneDelegate=`
${marker}
@objc(SalonProSceneDelegate)
class SalonProSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    if let existingWindow = appDelegate.window {
      existingWindow.windowScene = windowScene
      window = existingWindow
      return
    }
    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    appDelegate.window = sceneWindow

    var launchOptions = appDelegate.salonProLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let source = context.options.sourceApplication { launchOptions[.sourceApplication] = source }
      launchOptions[.annotation] = context.options.annotation
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }
    if let response = connectionOptions.notificationResponse {
      launchOptions[.remoteNotification] = response.notification.request.content.userInfo
    }
    factory.startReactNative(withModuleName: "main", in: sceneWindow, launchOptions: launchOptions)
    appDelegate.salonProFinishExpoLaunch(launchOptions)
    appDelegate.salonProLaunchOptions = nil
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      options[.annotation] = context.options.annotation
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
    }
  }
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
  func sceneDidBecomeActive(_ scene: UIScene) { appDelegate?.applicationDidBecomeActive(UIApplication.shared) }
  func sceneWillResignActive(_ scene: UIScene) { appDelegate?.applicationWillResignActive(UIApplication.shared) }
  func sceneWillEnterForeground(_ scene: UIScene) { appDelegate?.applicationWillEnterForeground(UIApplication.shared) }
  func sceneDidEnterBackground(_ scene: UIScene) { appDelegate?.applicationDidEnterBackground(UIApplication.shared) }
  func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    appDelegate?.application(UIApplication.shared, performActionFor: shortcutItem, completionHandler: completionHandler)
  }
}
`;

function configureAppDelegate(contents) {
  const alreadyHasScene=contents.includes(marker);
  if(alreadyHasScene)contents=contents.slice(0,contents.indexOf(marker));
  else {
    const startup=/#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\(\s+withModuleName: "main",\s+in: window,\s+launchOptions: launchOptions\s*\)\s+#endif/;
    if(!startup.test(contents)||!contents.includes('var window: UIWindow?')||!contents.includes('bindReactNativeFactory(factory)'))throw Error('SalonPro iOS scene lifecycle: review the changed AppDelegate template before building.');
    contents=contents.replace('var window: UIWindow?','var window: UIWindow?\n  var salonProLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?').replace(startup,'    salonProLaunchOptions = launchOptions');
  }
  if(!contents.includes('// SalonPro deferred Expo launch')) {
    const finish='return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
    const linking='  // Linking API';
    if(!contents.includes(finish)||!contents.includes(linking))throw Error('SalonPro iOS scene lifecycle: missing Expo launch handoff.');
    contents=contents.replace(finish,'return true').replace(linking,`  // SalonPro deferred Expo launch
  private var salonProExpoLaunchFinished = false
  func salonProFinishExpoLaunch(_ launchOptions: [UIApplication.LaunchOptionsKey: Any]) {
    guard !salonProExpoLaunchFinished else { return }
    salonProExpoLaunchFinished = true
    _ = super.application(UIApplication.shared, didFinishLaunchingWithOptions: launchOptions)
  }

${linking}`);
  }
  return contents.trimEnd()+'\n'+sceneDelegate;
}
function configureInfoPlist(info) {
  const existing=info.UIApplicationSceneManifest;
  if(existing && JSON.stringify(existing)!==JSON.stringify(sceneManifest))throw Error('SalonPro iOS scene lifecycle: preserve and review the existing scene manifest.');
  return {...info,UIApplicationSceneManifest:sceneManifest};
}
const sceneManifest={UIApplicationSupportsMultipleScenes:false,UISceneConfigurations:{UIWindowSceneSessionRoleApplication:[{UISceneConfigurationName:'SalonPro',UISceneDelegateClassName:'SalonProSceneDelegate'}]}};

function withIosSceneLifecycle(config) {
  config=withInfoPlist(config,mod=>{mod.modResults=configureInfoPlist(mod.modResults);return mod;});
  return withAppDelegate(config,mod=>{
    if(mod.modResults.language!=='swift')throw Error('SalonPro iOS scene lifecycle requires the Expo Swift delegate.');
    mod.modResults.contents=configureAppDelegate(mod.modResults.contents);return mod;
  });
}
module.exports=withIosSceneLifecycle;
module.exports.configureAppDelegate=configureAppDelegate;
module.exports.configureInfoPlist=configureInfoPlist;
