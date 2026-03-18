const { withXcodeProject, withPodfileProperties } = require('expo/config-plugins');

function withMinDeploymentTarget(config, targetVersion = '16.0') {
  // Set deployment target in the Xcode project
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key in configurations) {
      const buildSettings = configurations[key].buildSettings;
      if (buildSettings && buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
        const current = parseFloat(buildSettings.IPHONEOS_DEPLOYMENT_TARGET);
        const target = parseFloat(targetVersion);
        if (current < target) {
          buildSettings.IPHONEOS_DEPLOYMENT_TARGET = targetVersion;
        }
      }
    }

    return config;
  });

  // Set deployment target in Podfile properties
  config = withPodfileProperties(config, (config) => {
    config.modResults['ios.deploymentTarget'] = targetVersion;
    return config;
  });

  return config;
}

module.exports = withMinDeploymentTarget;
