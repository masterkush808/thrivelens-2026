/**
 * Leaflet-backed map for the web build.
 *
 * react-native-maps resolves MapView.web.ts to
 * `react-native-web/dist/modules/UnimplementedView`, so the deployed PWA had no
 * map at all. Leaflet renders real OpenStreetMap tiles in the browser, so the
 * Nearby Stores screen works on web without an API key.
 *
 * Imported only from maps.tsx inside the `Platform.OS === "web"` branch, and
 * Leaflet touches `window` at import time, so it must never be reached on
 * native.
 */
import { useEffect, useRef } from "react";
import { View } from "react-native";

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

export function WebMap({ center, zoom = 14, markers, height = 288 }: WebMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Leaflet is imported lazily so a native bundle never evaluates it.
    void (async () => {
      const L = await import("leaflet");
      if (cancelled) return;

      const host = hostRef.current;
      if (!host) return;

      // Leaflet's default marker images resolve relative to the CSS, which the
      // bundler rewrites. Use inline SVG data URIs so markers always paint.
      const icons = {
        user: L.divIcon({
          className: "thrivelens-marker thrivelens-marker-user",
          html: '<span class="thrivelens-marker-dot"></span>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        place: L.divIcon({
          className: "thrivelens-marker thrivelens-marker-place",
          html: '<span class="thrivelens-marker-pin"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 22],
        }),
      };

      const map = L.map(host, {
        center: [center.lat, center.lng],
        zoom,
        zoomControl: false,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      for (const marker of markers) {
        L.marker([marker.lat, marker.lng], { icon: icons[marker.kind] })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(marker.title)}</strong>` +
              (marker.description ? `<br/>${escapeHtml(marker.description)}` : ""),
          );
      }

      // The container is inside a ScrollView, so Leaflet cannot measure it on
      // first paint. Invalidate once layout has settled.
      const settle = window.setTimeout(() => map.invalidateSize(), 120);
      return () => window.clearTimeout(settle);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Rebuilding on every marker change would fight Leaflet's internal state;
    // the initial mount plus an explicit invalidate is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep markers in sync without tearing down the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || mapRef.current !== map) return;
      map.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });
      for (const marker of markers) {
        L.marker([marker.lat, marker.lng], {
          icon: L.divIcon({
            className:
              marker.kind === "user"
                ? "thrivelens-marker thrivelens-marker-user"
                : "thrivelens-marker thrivelens-marker-place",
            html:
              marker.kind === "user"
                ? '<span class="thrivelens-marker-dot"></span>'
                : '<span class="thrivelens-marker-pin"></span>',
            iconSize: marker.kind === "user" ? [18, 18] : [22, 22],
            iconAnchor: marker.kind === "user" ? [9, 9] : [11, 22],
          }),
        })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(marker.title)}</strong>` +
              (marker.description ? `<br/>${escapeHtml(marker.description)}` : ""),
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers]);

  return (
    <View style={{ height }} className="w-full overflow-hidden">
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
