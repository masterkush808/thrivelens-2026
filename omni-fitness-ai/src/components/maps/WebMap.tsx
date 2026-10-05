/**
 * Native map placeholder.
 *
 * NativeMap.tsx renders react-native-maps on native, so this component is never
 * reached there. It exists so the web-only Leaflet implementation can be
 * imported through a single platform-neutral path.
 */
export interface WebMapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description?: string;
  kind: "user" | "place";
}

export interface WebMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers: WebMapMarker[];
  height?: number;
}

export function WebMap(_props: WebMapProps) {
  return null;
}
