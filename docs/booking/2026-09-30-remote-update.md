# Remote update — 30 September 2026

User explicitly authorized remote updates after the web release, while retaining the requirement for separate authorization before creating any new native build.

## Compatibility checked live with EAS

- iOS production 1.0.18 build 207: d49eaeac-85d1-4290-a05a-9a2a86d43ff1.
- Android production 1.0.18 versionCode 69: 36454239-9499-4f3c-b861-a251d91ad28c.
- Both use channel production and runtime 1.0.18-meta1.
- Channel production is active and maps to branch production.
- Compared remote build fingerprints to the current project under the production environment, with META_APP_EVENTS_ENABLED=true and STRIPE_TERMINAL_BUILD=false.
- All 199 iOS and 201 Android fingerprint sources matched except eas.json, packageJson:scripts and expoConfig. Native source/dependency hashes match. Config differences are expo-router asyncRoutes true -> false and extra.terminalBuildEnabled absent -> false; plugin list difference is only router asyncRoutes. No added native library is required by this OTA.
- Stripe Terminal import remains lazy and gated by both terminalBuildEnabled and the presence of NativeModules.StripeTerminalReactNative. No unsupported contactless capability is enabled remotely.

The first local export succeeded for both platforms but was not uploaded: comparison caught a different local Supabase public key from the EAS production environment. Publication therefore runs a fresh export inside `eas update --environment production`, avoiding any reliance on local environment keys. No secret values are recorded here.

Target only runtime 1.0.18-meta1. Do not relabel it as 1.0.17 or an earlier runtime to force delivery; older builds have not been checked for this update. No new native build and no store submission is part of this operation.

## Publication

Published 2026-09-30 09:52:32 UTC (11:52 Italy), group `a3493cc7-c1e4-49ec-8e70-d5bf5164ce15`, branch/channel production, runtime `1.0.18-meta1`.

- iOS update: `01a0f1ba-e530-7582-852e-8e9a52c56d88`.
- Android update: `01a0f1ba-e530-7c4a-a409-bdcf42018945`.

Both production bundles exported successfully using EAS production environment and uploaded; all 118 assets per platform already existed. EAS update:view independently confirms both published updates. No new native build was created.
Direct update endpoint checks with each platform, runtime and production channel return HTTP 200 and exactly the published update IDs above. Both manifests preserve terminalBuildEnabled=false. Delivery is verified at the update service; installation/launch on a physical tester device has not been observed.
