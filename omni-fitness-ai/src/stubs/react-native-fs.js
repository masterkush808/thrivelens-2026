/**
 * No-op stub for react-native-fs, which @tensorflow/tfjs-react-native imports
 * statically but only calls in release-native loadLocalAsset() mode. Expo's
 * managed workflow never hits that path (bundled model weights are served over
 * HTTP in dev and via expo-asset in production), so nothing needs this package.
 */
module.exports = {
  readFile: null,
  readFileRes: null,
};