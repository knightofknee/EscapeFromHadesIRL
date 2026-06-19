/**
 * @bacons/apple-targets reads this during `expo prebuild` and generates a
 * WidgetKit extension target from the Swift files in this folder. Because the
 * folder lives OUTSIDE the gitignored ios/, it survives `prebuild --clean`.
 *
 * type 'widget' = a WidgetKit extension; we use it purely for a Live Activity
 * (no home-screen widget). deploymentTarget is pinned so the new target does
 * not default below ActivityKit's floor (the app targets iOS 16.4).
 *
 * @type {import('@bacons/apple-targets').Config}
 */
module.exports = {
  type: 'widget',
  name: 'MeditationActivity',
  // Leading dot = appended to the app's bundle id →
  // com.briancarlisle.escapefromhadesirl.MeditationActivity. Without this,
  // apple-targets derives ".widget" from `type`, which would NOT match the
  // extension declared in app.json's EAS appExtensions and breaks signing.
  bundleIdentifier: '.MeditationActivity',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
