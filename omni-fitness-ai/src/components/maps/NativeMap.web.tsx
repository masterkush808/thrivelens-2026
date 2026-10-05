/**
 * Native map placeholder for the web build.
 *
 * react-native-maps cannot be evaluated in a browser: its entry point calls
 * codegenNativeComponent() at module scope, which react-native-web does not
 * implement, so the import throws before any component renders. WebMap.web.tsx
 * (Leaflet) renders the web map instead.
 *
 * Types-only; never bundles react-native-maps on web.
 */
export interface NativeMapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description?: string;
}

export interface NativeMapProps {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  showsUserLocation: boolean;
  markers: NativeMapMarker[];
}

export function NativeMap(_props: NativeMapProps) {
  return null;
}
