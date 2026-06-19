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
  // MUST NOT be "MeditationActivity": that's the local Expo module's pod/Swift
  // module name, and a duplicate here makes the app's ExpoModulesProvider
  // `import MeditationActivity` bind to THIS widget module (no
  // MeditationActivityModule class) → "cannot find ... in scope". The widget's
  // module name is internal; ActivityKit matches on the MeditationAttributes
  // struct name (unchanged), so renaming the target is safe.
  name: 'MeditationWidget',
  // Leading dot = appended to the app's bundle id →
  // com.briancarlisle.escapefromhadesirl.MeditationWidget. Must match app.json's
  // EAS appExtensions entry or signing breaks.
  bundleIdentifier: '.MeditationWidget',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
