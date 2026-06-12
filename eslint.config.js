// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-config-expo 56 promotes the React-Compiler-powered react-hooks
    // rules to errors. They flag this codebase's long-standing state+ref-
    // mirror patterns, which the compiler itself handles by bailing out of
    // those components — running code, not bugs. Keep the signal as warnings
    // and burn the sites down component-by-component, not in one sweep.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
