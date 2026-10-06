/**
 * Native map (react-native-maps).
 *
 * Lives behind a platform-split so the web bundle never evaluates
 * react-native-maps. Its index re-exports MapMarker, MapOverlay, Circle and
 * friends, each of which calls codegenNativeComponent() at module scope, which
 * does not exist on react-native-web. Importing it on web crashed the whole
 * /maps route with:
 *
 *   TypeError: (0 , r(...).codegenNativeComponent) is not a function
 *
 * WebMap.web.tsx (Leaflet) is the web counterpart.
 */
import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { Region } from "react-native-maps";

export interface NativeMapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description?: string;
}

export interface NativeMapProps {
  region: Region;
  showsUserLocation: boolean;
  markers: NativeMapMarker[];
}

export function NativeMap({ region, showsUserLocation, markers }: NativeMapProps) {
  const googleMapsIOSConfigured =
    Constants.expoConfig?.extra?.googleMapsIosEnabled === true;
  return (
    <MapView
      style={{ flex: 1 }}
      provider={googleMapsIOSConfigured ? PROVIDER_GOOGLE : undefined}
      initialRegion={region}
      region={region}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
    >
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          coordinate={{ latitude: marker.lat, longitude: marker.lng }}
          title={marker.title}
          description={marker.description}
          pinColor={marker.id === "user" ? "#208AEF" : "#FF6B35"}
        />
      ))}
    </MapView>
  );
}
