"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./EventDetails.module.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAPBOX_STYLE = "streets-v12";

export default function VenueMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: LeafletMap | undefined;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        dragging: true,
        touchZoom: true,
        doubleClickZoom: true,
        keyboard: true,
      });

      const fallbackTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abc",
        attribution: "© OpenStreetMap contributors",
      });
      const primaryTiles = MAPBOX_TOKEN
        ? L.tileLayer(
            `https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE}/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
            { maxZoom: 20, tileSize: 512, zoomOffset: -1, attribution: "© Mapbox © OpenStreetMap" },
          )
        : L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
            subdomains: "abcd",
            attribution: "© OpenStreetMap contributors © CARTO",
          });

      let hasRecoveredTiles = false;
      primaryTiles.on("tileerror", () => {
        if (hasRecoveredTiles || !map) return;
        hasRecoveredTiles = true;
        map.removeLayer(primaryTiles);
        fallbackTiles.addTo(map);
      });
      primaryTiles.addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `<span class="${styles.pin}"><span class="${styles.pinDot}"></span></span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  return (
    <div className={styles.map} role="region" aria-label={`Interactive map showing ${label}`}>
      <div className={styles.mapCanvas} ref={containerRef} />
    </div>
  );
}
