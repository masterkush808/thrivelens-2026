module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const plugins = [...(config.plugins ?? [])];

  if (androidGoogleMapsApiKey || iosGoogleMapsApiKey) {
    const mapsPluginIndex = plugins.findIndex(
      (plugin) =>
        plugin === "react-native-maps" ||
        (Array.isArray(plugin) && plugin[0] === "react-native-maps"),
    );
    const options = {
      ...(androidGoogleMapsApiKey ? { androidGoogleMapsApiKey } : {}),
      ...(iosGoogleMapsApiKey ? { iosGoogleMapsApiKey } : {}),
    };
    if (mapsPluginIndex >= 0) {
      const mapsPlugin = plugins[mapsPluginIndex];
      plugins[mapsPluginIndex] = [
        "react-native-maps",
        {
          ...(Array.isArray(mapsPlugin) ? mapsPlugin[1] : {}),
          ...options,
        },
      ];
    } else {
      plugins.push(["react-native-maps", options]);
    }
  }

  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      googleMapsIosEnabled: Boolean(iosGoogleMapsApiKey),
    },
  };
};
