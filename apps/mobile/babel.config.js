module.exports = function (api) {
  api.cache(true);

  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: [
      // jsxImportSource lets NativeWind map `className` onto React Native styles.
      // In tests the NativeWind babel preset injects _ReactNativeCSSInterop refs
      // that conflict with Jest's mock-factory hoisting, so we skip it.
      ['babel-preset-expo', isTest ? {} : { jsxImportSource: 'nativewind' }],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
  };
};
