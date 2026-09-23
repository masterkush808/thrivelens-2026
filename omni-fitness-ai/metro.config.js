const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// TF.js shards are .bin assets; Metro must treat them as assets (not source).
if (!config.resolver.assetExts.includes("bin")) {
  config.resolver.assetExts.push("bin");
}

// @tensorflow/tfjs-react-native statically imports react-native-fs for its
// release-only loadLocalAsset() path. Expo's managed workflow never uses that
// path (bundled model weights load over HTTP), so alias it to a no-op stub to
// keep the graph resolvable on every platform.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "react-native-fs": require.resolve("./src/stubs/react-native-fs.js"),
};

module.exports = withNativeWind(config, { input: "./src/app/global.css" });