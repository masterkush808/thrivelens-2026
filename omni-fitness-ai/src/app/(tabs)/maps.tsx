import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PremiumScreen } from "@/components/brand/PremiumScreen";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Locate, Navigation } from "lucide-react-native";

// Both maps are imported through platform-split wrappers. react-native-maps
// cannot be evaluated in a browser (codegenNativeComponent is missing), so
// importing it directly crashed this route on web.
import { NativeMap } from "@/components/maps/NativeMap";
import type { NativeMapMarker } from "@/components/maps/NativeMap";
import { WebMap } from "@/components/maps/WebMap";
import type { WebMapMarker } from "@/components/maps/WebMap";
import { Text, Card, Button } from "@/components/ui";

import {
  getCurrentLocation,
  openDirections,
  Place,
  PlacesError,
  searchNearbyStores,
  StoreCategory,
} from "@/services/places";

/** react-native-maps' Region, redeclared so this file never imports that
 * package on web (its entry point calls codegenNativeComponent at import
 * time, which react-native-web does not implement). */
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const CATEGORIES: { key: StoreCategory; label: string }[] = [
  { key: "gym", label: "Gyms" },
  { key: "grocery", label: "Grocery" },
  { key: "restaurant", label: "Food" },
  { key: "pharmacy", label: "Pharmacy" },
];

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

function resolveCategory(query: string | string[] | undefined): StoreCategory {
  const requested = Array.isArray(query) ? query[0] : query;
  if (requested && (CATEGORY_KEYS as string[]).includes(requested)) {
    return requested as StoreCategory;
  }
  return "grocery";
}

const errorText = (error: unknown): string => {
  const code = (error as PlacesError)?.code;
  if (code === "permission") {
    return "Location permission is off. Enable it in system settings to find stores near you.";
  }
  if (code === "network" || code === "timeout") {
    return "Could not reach the place directory. Check your connection and retry.";
  }
  return "We could not load nearby places just now. Please retry.";
};

function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return "";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function hoursLabel(place: Place): string | null {
  if (place.openNow === true) {
    return "Open now";
  }
  if (place.openNow === false) {
    return "Closed now";
  }
  if (place.openingHours && place.openingHours.length > 0) {
    return place.openingHours[0];
  }
  if (place.openingHoursNote) {
    return `Hours: ${place.openingHoursNote}`;
  }
  return null;
}

export default function MapsScreen() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [queryDate, setQueryDate] = useState<string | null>(null);

  const params = useLocalSearchParams<{ query?: string | string[] }>();
  const category = resolveCategory(params.query);

  const load = useCallback(
    async (forceLocate = false) => {
      setLoading(true);
      setError(null);
      try {
        let current = position;
        if (forceLocate || current === null) {
          current = await getCurrentLocation();
          setPosition(current);
          setRegion({
            latitude: current.lat,
            longitude: current.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
        }
        const result = await searchNearbyStores(category, current.lat, current.lng);
        setPlaces(result.places);
        setQueryDate(result.queryDate);
      } catch (caught) {
        setError(errorText(caught));
        setPlaces([]);
      } finally {
        setLoading(false);
        setLocating(false);
      }
    },
    [category, position],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Both map implementations take the same marker shape; `kind` only tells
  // Leaflet which divIcon to draw, so the native list is derived from the same
  // coordinates rather than duplicating the mapping logic.
  const mapMarkers = useMemo(() => {
    const markers: WebMapMarker[] = [];
    if (position) {
      markers.push({
        id: "user",
        lat: position.lat,
        lng: position.lng,
        title: "You are here",
        kind: "user",
      });
    }
    for (const place of places) {
      markers.push({
        id: place.id,
        lat: place.lat,
        lng: place.lng,
        title: place.name,
        description:
          place.distanceMeters !== null && place.distanceMeters !== undefined
            ? `${formatDistance(place.distanceMeters)} away`
            : (place.address ?? undefined),
        kind: "place",
      });
    }
    return markers;
  }, [position, places]);

  const nativeMarkers = useMemo<NativeMapMarker[]>(
    () => mapMarkers.map(({ kind: _kind, ...marker }) => marker),
    [mapMarkers],
  );

  const changeCategory = (next: StoreCategory) => {
    if (next !== category) {
      setPlaces([]);
      router.setParams({ query: next });
    }
  };

  return (
    <PremiumScreen>
      <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <View className="px-6 py-4">
            <Text variant="h1">Nearby Stores</Text>
            <Text variant="body" className="text-text-secondary mt-1">
              Real grocery stores near you, or switch category
            </Text>
          </View>

          <View className="px-6 mb-4 flex-row gap-2">
            {CATEGORIES.map((item) => {
              const active = item.key === category;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => changeCategory(item.key)}
                  className={`px-4 py-2 rounded-full border ${
                    active
                      ? "bg-primary border-primary"
                      : "bg-surface-elevated border-border"
                  }`}
                >
                  <Text variant="caption" className={active ? "text-text-inverse" : "text-text-secondary"}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="px-6 mb-6">
            <Card variant="elevated" style={{ padding: 0, overflow: "hidden" }}>
              <View className="h-72 w-full">
                {position === null && !locating ? (
                  <View className="flex-1 items-center justify-center bg-surface-highlight px-6">
                    <Locate size={32} color="#ABA291" />
                    <Text variant="body" className="text-text-secondary mt-3 text-center">
                      Enable location to see real stores near you
                    </Text>
                    <Button
                      variant="primary"
                      size="sm"
                      title="Use my location"
                      className="mt-4"
                      loading={loading}
                      onPress={() => {
                        setLocating(true);
                        void load(true);
                      }}
                    />
                  </View>
                ) : Platform.OS === "web" ? (
                  // react-native-maps resolves to react-native-web's
                  // UnimplementedView on web, so <MapView> painted an empty box
                  // in the deployed PWA. WebMap.web.tsx renders real
                  // OpenStreetMap tiles via Leaflet instead, using the same
                  // coordinates and markers as the native branch.
                  <WebMap
                    center={position ?? { lat: region?.latitude ?? 0, lng: region?.longitude ?? 0 }}
                    zoom={14}
                    markers={mapMarkers}
                    height={288}
                  />
                ) : (
                  <NativeMap
                    region={
                      region ?? {
                        latitude: position?.lat ?? 0,
                        longitude: position?.lng ?? 0,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                      }
                    }
                    showsUserLocation
                    markers={nativeMarkers}
                  />
                )}
              </View>
            </Card>
          </View>

          {error ? (
            <View className="px-6 mb-6">
              <Card variant="elevated">
                <Text variant="body" className="text-text-secondary leading-5">
                  {error}
                </Text>
                <Button variant="secondary" size="sm" title="Retry" className="mt-4" onPress={() => void load()} />
              </Card>
            </View>
          ) : null}

          {directionsError ? (
            <View className="px-6 mb-6">
              <Card variant="elevated">
                <Text variant="body" className="text-text-secondary leading-5">
                  {directionsError}
                </Text>
              </Card>
            </View>
          ) : null}

          {loading ? (
            <View className="px-6 mb-6">
              <View className="flex-row items-center gap-3 bg-surface-elevated rounded-xl py-4 px-4">
                <ActivityIndicator color="#E7BE73" size="small" />
                <Text variant="body" className="text-text-secondary">
                  Finding real places nearby…
                </Text>
              </View>
            </View>
          ) : null}

          {!loading && !error && places.length === 0 ? (
            <View className="px-6 mb-6">
              <Card variant="elevated">
                <Text variant="body" className="text-text-secondary leading-5">
                  No registered {category} found within 5 km of your location.
                </Text>
              </Card>
            </View>
          ) : null}

          {places.length > 0 ? (
            <View className="px-6 mb-6">
              <View className="flex-row items-center justify-between mb-3">
                <Text variant="h3">Nearby {category}</Text>
                <Text variant="caption" className="text-text-tertiary">
                  {queryDate ? `Updated ${new Date(queryDate).toLocaleTimeString()}` : "Nearby data"}
                </Text>
              </View>
              <Text variant="caption" className="text-text-tertiary mb-3">
                Straight-line distance · hours only as reported
              </Text>
              {places.map((place) => {
                const hours = hoursLabel(place);
                return (
                <Card key={place.id} variant="elevated" className="mb-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text variant="body" className="text-text-primary">
                        {place.name}
                      </Text>
                      <Text variant="caption" className="text-text-tertiary mt-1">
                        {formatDistance(place.distanceMeters)}
                        {place.address ? ` · ${place.address}` : ""}
                      </Text>
                      <Text
                        variant="caption"
                        className={
                          place.openNow === true
                            ? "text-success mt-0.5"
                            : place.openNow === false
                              ? "text-error mt-0.5"
                              : "text-text-tertiary mt-0.5"
                        }
                      >
                        {hours ?? "Hours unavailable"}
                      </Text>
                    </View>
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Directions"
                      icon={<Navigation size={16} color="#E7BE73" />}
                      onPress={async () => {
                        setDirectionsError(null);
                        try {
                          await openDirections(place.lat, place.lng, place.name);
                        } catch (caught) {
                          setDirectionsError(
                            (caught as PlacesError).message ??
                              "Google Maps could not be opened.",
                          );
                        }
                      }}
                    />
                  </View>
                </Card>
                );
              })}
            </View>
          ) : null}

          </ScrollView>
      </SafeAreaView>
    </PremiumScreen>
  );
}