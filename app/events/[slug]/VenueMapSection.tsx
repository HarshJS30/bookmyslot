import { MapPin } from "@/app/components/Icons";
import VenueMap from "./VenueMap";
import styles from "./EventDetails.module.css";

type Coords = { lat: number; lng: number };


async function geocode(query: string): Promise<Coords | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "BookMySlot/1.0 (event booking app)" },
        next: { revalidate: 60 * 60 * 24 * 30 },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return null;
    const [hit] = (await response.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}

/* Mapbox geocoder, used when NEXT_PUBLIC_MAPBOX_TOKEN is set. */
async function geocodeMapbox(query: string, token: string): Promise<Coords | null> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&limit=1&access_token=${token}`,
      { next: { revalidate: 60 * 60 * 24 * 30 }, signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: { geometry?: { coordinates?: [number, number] } }[];
    };
    const point = data.features?.[0]?.geometry?.coordinates;
    return point ? { lat: point[1], lng: point[0] } : null;
  } catch {
    return null;
  }
}

async function lookup(query: string) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token ? geocodeMapbox(query, token) : geocode(query);
}

export default async function VenueMapSection({
  name,
  location,
  latitude,
  longitude,
}: {
  name: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const stored =
    latitude != null && longitude != null ? { lat: Number(latitude), lng: Number(longitude) } : null;
  const coords = stored ?? (await lookup(`${name}, ${location}`)) ?? (await lookup(location));

  if (!coords || Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) {
    return (
      <div className={styles.mapFallback}>
        <MapPin size={24} weight="fill" aria-hidden="true" />
        <strong>{name}</strong>
        <span>{location}</span>
      </div>
    );
  }

  return <VenueMap lat={coords.lat} lng={coords.lng} label={`${name}, ${location}`} />;
}