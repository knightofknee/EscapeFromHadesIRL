/**
 * Screen Time monitor extension for phone-free nights. @bacons/apple-targets
 * reads this during `expo prebuild` and generates the extension target from
 * the Swift files in this folder (which live outside the gitignored ios/).
 *
 * DeviceActivityMonitorExtension.swift and Shared.swift are COPIES from
 * react-native-device-activity (targets/ActivityMonitorExtension and ios/
 * respectively), pinned to the installed library version. Re-copy both when
 * upgrading the library: the app-side Swift module and this extension talk
 * through shared UserDefaults keys that must match. See
 * plugins/with-device-activity.js for why the library's own plugin isn't
 * used.
 *
 * Bundle id → com.briancarlisle.escapefromhadesirl.ActivityMonitorExtension.
 * Must match app.json's EAS appExtensions entry. Apple's Family Controls
 * (Distribution) entitlement has to be requested for THIS id as well as the
 * app's before a store build will sign.
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: 'device-activity-monitor',
  name: 'ActivityMonitorExtension',
  bundleIdentifier: '.ActivityMonitorExtension',
  deploymentTarget: '16.4',
  // Shared.swift imports all of these.
  frameworks: ['DeviceActivity', 'FamilyControls', 'ManagedSettings', 'UIKit', 'WebKit'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': ['group.com.briancarlisle.escapefromhadesirl'],
  },
};
