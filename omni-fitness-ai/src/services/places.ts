import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const OVERPASS_RADIUS_M = 5000;
const OVERPASS_TIMEOUT_MS = 25000;

export type StoreCategory = "gym" | "grocery" | "restaurant" | "pharmacy";

export interface Place {
  id: string;
  name: string;
  category: StoreCategory;
  lat: number;
  lng: number;
  address?: string | null;
  distanceMeters?: number | null;
  source: "overpass" | "google";
  openingHours?: string[] | null;
  openNow?: boolean | null;
  openingHoursNote?: string | null;
}

export interface NearbyStoresResult {
  places: Place[];
  source: "overpass" | "google";
  queryDate: string;
}

export interface PlacesError {
  code: "network" | "timeout" | "http" | "permission" | "unavailable" | "not_configured" | "invalid";
  message: string;
}

const OVERPASS_CATEGORY_TAGS: Record<StoreCategory, string> = {
  gym: '["leisure"~"fitness_centre|sports_centre|gym"]',
  grocery: '["shop"~"supermarket|convenience|grocery|greengrocer"]',
  restaurant: '["amenity"~"restaurant|cafe|fast_food"]',
  pharmacy: '["amenity"~"pharmacy"]',
};

const OVERPASS_QUERY = (category: StoreCategory, radiusM: number, lat: number, lng: number) =>
  `[out:json][timeout:25];(` +
  `node${OVERPASS_CATEGORY_TAGS[category]}(around:${radiusM},${lat},${lng});` +
  `way${OVERPASS_CATEGORY_TAGS[category]}(around:${radiusM},${lat},${lng});` +
  `relation${OVERPASS_CATEGORY_TAGS[category]}(around:${radiusM},${lat},${lng});` +
  `);out center tags ${Math.min(100, Math.max(1, Math.round(radiusM / 50)))};`;

function placesError(
  code: PlacesError["code"],
  message: string,
): PlacesError {
  return { code, message };
}

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const R = 6371000;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function overpassElementToPlace(
  element: {
    id: number;
    tags?: Record<string, string> | null;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
  },
  category: StoreCategory,
  userLat: number,
  userLng: number,
): Place | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  // `!== undefined` alone let NaN through, producing NaN distances and
  // navigation URLs such as "google.navigation:q=NaN,NaN".
  if (!name) return null;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    id: `osm-${element.id}`,
    name,
    category,
    lat,
    lng: lon,
    address:
      [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
        .filter(Boolean)
        .join(" ") || tags["addr:street"] || null,
    distanceMeters: metersBetween(userLat, userLng, lat, lon),
    source: "overpass",
    openingHours: null,
    openNow: null,
    openingHoursNote: tags["opening_hours"]?.trim() || null,
  };
}

async function searchOverpass(
  category: StoreCategory,
  lat: number,
  lng: number,
): Promise<Place[]> {
  const body = `data=${encodeURIComponent(OVERPASS_QUERY(category, OVERPASS_RADIUS_M, lat, lng))}`;
  const attemptServer = async (server: string): Promise<Place[] | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const response = await fetch(server, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "ThriveLens/1.0 (mobile grocery finder)",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        return null;
      }
      const json = (await response.json()) as {
        elements?: {
          id: number;
          tags?: Record<string, string> | null;
          lat?: number;
          lon?: number;
          center?: { lat?: number; lon?: number };
        }[];
      };
      return (json.elements ?? [])
        .map((element) => overpassElementToPlace(element, category, lat, lng))
        .filter((place): place is Place => place !== null)
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      return null;
    }
  };
  const outcomes = await Promise.all(OVERPASS_SERVERS.map(attemptServer));
  const resolved = outcomes.find((places) => places !== null && places.length > 0);
  if (resolved) {
    return resolved;
  }
  const anyResponse = outcomes.find((places) => places !== null);
  if (anyResponse) {
    return anyResponse;
  }
  throw placesError("network", "Place directory is unreachable right now");
}

async function searchGooglePlaces(
  category: StoreCategory,
  lat: number,
  lng: number,
): Promise<Place[]> {
  const queryLabel: Record<StoreCategory, string> = {
    gym: "gym near me",
    grocery: "grocery store near me",
    restaurant: "restaurant near me",
    pharmacy: "pharmacy near me",
  };
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=` +
    `${encodeURIComponent(queryLabel[category])}` +
    `&location=${lat},${lng}` +
    `&radius=${OVERPASS_RADIUS_M}` +
    `&key=${encodeURIComponent(GOOGLE_PLACES_KEY ?? "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw placesError("timeout", "Finding nearby places timed out");
      }
      throw placesError("network", "Place search is unreachable");
    }
    if (!response.ok) {
      throw placesError("http", `Place search failed (${response.status})` as PlacesError["message"]);
    }
    const json = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: {
        place_id: string;
        name: string;
        vicinity?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        opening_hours?: { open_now?: boolean; weekday_text?: string[] };
      }[];
    };
    if (json.status !== "OK") {
      throw placesError("invalid", "Place search couldn't find usable results right now.");
    }
    return (json.results ?? [])
      .map<Place | null>((result) => {
        const location = result.geometry?.location;
        // A falsy check dropped legitimate results at (0, 0) - the equator and
        // prime meridian are valid coordinates.
        if (
          typeof location?.lat !== "number" ||
          typeof location?.lng !== "number" ||
          !Number.isFinite(location.lat) ||
          !Number.isFinite(location.lng)
        ) {
          return null;
        }
        const hours = result.opening_hours;
        return {
          id: `google-${result.place_id}`,
          name: result.name,
          category,
          lat: location.lat,
          lng: location.lng,
          address: result.vicinity ?? null,
          distanceMeters: metersBetween(lat, lng, location.lat, location.lng),
          source: "google" as const,
          openingHours: hours?.weekday_text?.length ? hours.weekday_text : null,
          openNow: typeof hours?.open_now === "boolean" ? hours.open_now : null,
          openingHoursNote: null,
        };
      })
      .filter((place): place is Place => place !== null)
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  } catch (error) {
    if ((error as PlacesError)?.code) {
      throw error;
    }
    throw placesError("invalid", "Place search returned unexpected data");
  } finally {
    clearTimeout(timer);
  }
}

export async function searchNearbyStores(
  category: StoreCategory,
  lat: number,
  lng: number,
): Promise<NearbyStoresResult> {
  if (GOOGLE_PLACES_KEY) {
    try {
      const places = await searchGooglePlaces(category, lat, lng);
      if (places.length > 0) {
        return { places, source: "google", queryDate: new Date().toISOString() };
      }
    } catch {
      // Primary source failed or returned nothing — fall through to the fallback.
    }
  }
  const places = await searchOverpass(category, lat, lng);
  return { places, source: "overpass", queryDate: new Date().toISOString() };
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const granted = await Location.requestForegroundPermissionsAsync();
  if (!granted.granted) {
    throw placesError(
      "permission",
      "Location permission was denied. Enable it in system settings to see nearby stores.",
    );
  }
  const position = await Promise.race([
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }) as Promise<Location.LocationObject>,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            placesError("timeout", "Could not get your location in time. Move to a clearer spot and retry."),
          ),
        20000,
      ),
    ),
  ]);
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

/**
 * Hands off to Google Maps turn-by-turn navigation on the device. These are
 * public URL schemes, so no API key or SDK setup is required.
 *
 * `openURL` is attempted directly instead of being gated behind `canOpenURL`,
 * because Android 11+ reports `false` for custom schemes that are not declared
 * in a `<queries>` manifest element even when the target app is installed.
 */
export async function openDirections(
  lat: number,
  lng: number,
  name: string,
): Promise<void> {
  // Reject bad coordinates up front rather than building a malformed deep link
  // such as "google.navigation:q=NaN,NaN&mode=d".
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw placesError("invalid", `Could not start directions to ${name}: invalid coordinates.`);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw placesError("invalid", `Could not start directions to ${name}: invalid coordinates.`);
  }
  const coords = `${lat},${lng}`;
  let url: string;
  if (Platform.OS === "android") {
    url = `google.navigation:q=${coords}&mode=d`;
  } else if (Platform.OS === "ios") {
    url = `comgooglemaps://?daddr=${coords}&directionsmode=driving`;
  } else {
    url = `https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=driving`;
  }
  try {
    await Linking.openURL(url);
  } catch {
    throw placesError(
      "unavailable",
      `Google Maps could not be opened for ${name}. Install Google Maps, then try Directions again.`,
    );
  }
}