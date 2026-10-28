import ExpoModulesCore
import FBSDKCoreKit
import AppTrackingTransparency

public class MetaInstallEventsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SalonProMetaInstallEvents")
    AsyncFunction("activate") { (consented: Bool) -> Bool in
      guard consented,
            ATTrackingManager.trackingAuthorizationStatus == .authorized else { return false }
      // The SDK's activation publishes the deduplicated install ping. A JS logEvent
      // with the same event name does not execute that native path.
      Settings.shared.isAutoLogAppEventsEnabled = false
      AppEvents.shared.activateApp()
      return true
    }.runOnQueue(.main)
  }
}
