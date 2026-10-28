package com.salonpro.metaevents

import com.facebook.FacebookSdk
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MetaInstallEventsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SalonProMetaInstallEvents")
    AsyncFunction("activate") { consented: Boolean ->
      val context = appContext.reactContext
      if (!consented || context == null || !FacebookSdk.isInitialized()) {
        false
      } else {
        FacebookSdk.setAutoLogAppEventsEnabled(false)
        // Same install path used by AppEventsLogger.activateApp in SDK 18.
        // Do not call activateApp here: it registers permanent lifecycle/codeless
        // listeners with no public stop API, which would outlive consent withdrawal.
        FacebookSdk.publishInstallAsync(context, FacebookSdk.getApplicationId())
        true
      }
    }
  }
}
