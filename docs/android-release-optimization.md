# Android release optimization (R8)

The Expo config loads `plugins/with-android-release-optimization.js`. This is the
source of truth because EAS excludes `/android` and regenerates the native project.
The plugin enables release code shrinking/optimization and resource shrinking,
selects `proguard-android-optimize.txt`, and retains the app and library keep rules.
Debug builds are unchanged. No AGP/Gradle upgrade is required by this change.

Run `npm run test:android-release-optimization` to check registration, idempotence,
release switches, and detection of incompatible future Expo templates.

For native validation, compile an Android release and check that
`:app:minifyReleaseWithR8` completes and that the release mapping outputs are
produced. Keep the mapping file associated with each uploaded version for crash
retrace; do not reuse a mapping from another build.

Before publishing, test the optimized release on a real Android device: login,
Agenda and booking, QR/camera, notifications, biometric access and purchases.
A successful compilation is not a substitute for those runtime checks.
Existing Play Store bundles are unchanged; Play Console reflects optimization
only after a new optimized bundle is uploaded and processed.
