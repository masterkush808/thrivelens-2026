import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { WebMapMarker, WebMapProps } from "@/components/maps/WebMap";

interface GoogleLatLng {
  lat: number;
  lng: number;
}

interface GoogleMapMarkerInstance {
  setMap(map: GoogleMapInstance | null): void;
  addListener(event: "click", callback: () => void): void;
}

interface GoogleMapInstance {
  setCenter(center: GoogleLatLng): void;
  setZoom(zoom: number): void;
}

interface GoogleInfoWindow {
  close(): void;
  open(options: { anchor: GoogleMapMarkerInstance; map: GoogleMapInstance }): void;
  setContent(content: HTMLElement): void;
}

interface GoogleMapsApi {
  Map: new (
    element: HTMLElement,
    options: {
      center: GoogleLatLng;
      zoom: number;
      mapTypeControl: boolean;
      streetViewControl: boolean;
      fullscreenControl: boolean;
      clickableIcons: boolean;
    },
  ) => GoogleMapInstance;
  Marker: new (options: {
    map: GoogleMapInstance;
    position: GoogleLatLng;
    title: string;
  }) => GoogleMapMarkerInstance;
  InfoWindow: new () => GoogleInfoWindow;
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi };
  }
}

let mapsApiPromise: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const loadedApi = window.google?.maps;
  if (loadedApi?.Map && loadedApi.Marker && loadedApi.InfoWindow) {
    return Promise.resolve(loadedApi);
  }
  if (mapsApiPromise) {
    return mapsApiPromise;
  }

  mapsApiPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "thrivelens-google-maps";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const maps = window.google?.maps;
      if (maps?.Map && maps.Marker && maps.InfoWindow) {
        resolve(maps);
      } else {
        reject(new Error("Google Maps JavaScript API did not initialize."));
      }
    };
    script.onerror = () => reject(new Error("Google Maps JavaScript API failed to load."));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    mapsApiPromise = null;
    document.getElementById("thrivelens-google-maps")?.remove();
    throw error;
  });

  return mapsApiPromise;
}

interface GoogleMapProps extends WebMapProps {
  apiKey: string;
  onError: () => void;
}

export function GoogleMap({
  apiKey,
  center,
  zoom = 14,
  markers,
  height = 288,
  onError,
}: GoogleMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsRef = useRef<GoogleMapsApi | null>(null);
  const mapMarkersRef = useRef<GoogleMapMarkerInstance[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const latestCenterRef = useRef(center);
  const latestZoomRef = useRef(zoom);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    latestCenterRef.current = center;
    latestZoomRef.current = zoom;
  }, [center, zoom]);

  useEffect(() => {
    let cancelled = false;

    void loadGoogleMaps(apiKey)
      .then((maps) => {
        const host = hostRef.current;
        if (cancelled || !host) return;

        const map = new maps.Map(host, {
          center: latestCenterRef.current,
          zoom: latestZoomRef.current,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        mapsRef.current = maps;
        infoWindowRef.current = new maps.InfoWindow();
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) onError();
      });

    return () => {
      cancelled = true;
      for (const marker of mapMarkersRef.current) {
        marker.setMap(null);
      }
      mapMarkersRef.current = [];
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapRef.current = null;
      mapsRef.current = null;
    };
    // A map instance is created once; refs keep the initial async load current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.setCenter(center);
    map.setZoom(zoom);
  }, [center, mapReady, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    const infoWindow = infoWindowRef.current;
    if (!mapReady || !map || !maps || !infoWindow) return;
    syncMarkers(maps, map, markers, mapMarkersRef, infoWindow);
  }, [mapReady, markers]);

  return (
    <View style={{ height }} className="w-full overflow-hidden">
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

function syncMarkers(
  maps: GoogleMapsApi,
  map: GoogleMapInstance,
  markers: WebMapMarker[],
  markerInstances: { current: GoogleMapMarkerInstance[] },
  infoWindow: GoogleInfoWindow,
): void {
  for (const marker of markerInstances.current) {
    marker.setMap(null);
  }
  markerInstances.current = markers.map((marker) => {
    const instance = new maps.Marker({
      map,
      position: { lat: marker.lat, lng: marker.lng },
      title: marker.title,
    });
    instance.addListener("click", () => {
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = marker.title;
      content.appendChild(title);
      if (marker.description) {
        const description = document.createElement("div");
        description.textContent = marker.description;
        content.appendChild(description);
      }
      infoWindow.setContent(content);
      infoWindow.open({ anchor: instance, map });
    });
    return instance;
  });
}
