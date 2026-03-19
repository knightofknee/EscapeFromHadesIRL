const { withXcodeProject } = require('expo/config-plugins');

module.exports = function iosBuildSettings(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();

    for (const key in buildConfigs) {
      const buildConfig = buildConfigs[key];
      if (typeof buildConfig === 'object' && buildConfig.buildSettings) {
        // Set deployment target to 16.0
        buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
        // Exclude x86_64 from simulator builds (Apple Silicon only)
        buildConfig.buildSettings['"EXCLUDED_ARCHS[sdk=iphonesimulator*]"'] = 'x86_64';
      }
    }

    return config;
  });
};
