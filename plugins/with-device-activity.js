const { withInfoPlist } = require('expo/config-plugins');
const withEntitlements = require('react-native-device-activity/config-plugin/withEntitlements');

/**
 * Screen Time (DeviceActivity) wiring for phone-free nights, WITHOUT the
 * library's own app.plugin.js.
 *
 * Why not the library plugin: it runs @kingstinct/expo-apple-targets over
 * the targets/ folder, and this project already runs @bacons/apple-targets
 * there for the MeditationWidget. Two target generators on one folder
 * produce duplicate targets. It also copies three extensions (monitor plus
 * two app-blocking "shield" ones) into targets/ on every prebuild; we only
 * need the monitor, and every extension is one more bundle ID Apple has to
 * approve for the Family Controls entitlement.
 *
 * So this plugin does the two app-side pieces and nothing else:
 *   1. entitlements: family-controls + the shared app group (the library's
 *      own sub-plugin, unchanged),
 *   2. Info.plist: the app group name the library's Swift reads at runtime.
 *      Written as the literal string, not the $(BUILD_SETTING) indirection
 *      the library uses, so build-phase ordering can't blank it.
 * The monitor extension itself is a checked-in @bacons/apple-targets target
 * at targets/ActivityMonitorExtension (Swift copied from the library,
 * pinned to its installed version).
 *
 * @type {import('expo/config-plugins').ConfigPlugin<{ appGroup: string }>}
 */
const withDeviceActivity = (config, props) => {
  if (!props || !props.appGroup) {
    throw new Error("with-device-activity: 'appGroup' is required");
  }
  config = withEntitlements(config, { appGroup: props.appGroup });
  config = withInfoPlist(config, (c) => {
    c.modResults.REACT_NATIVE_DEVICE_ACTIVITY_APP_GROUP = props.appGroup;
    return c;
  });
  return config;
};

module.exports = withDeviceActivity;
