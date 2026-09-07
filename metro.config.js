// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

/**
 * expo-camera's web barcode path dynamically imports `barcode-detector`, whose
 * package `exports` + Metro cannot resolve relative `./ponyfill.js`.
 * S-01 web uses typed-barcode only (`scan.web.tsx`), so stub the package on web.
 */
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'barcode-detector' || moduleName.startsWith('barcode-detector/'))
  ) {
    return { type: 'empty' };
  }

  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
