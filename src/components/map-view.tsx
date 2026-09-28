import { useEffect, useRef } from "react";

type Ponto = { lat: number; lng: number; label: string };

declare global {
  interface Window {
    __neiaMapsReady?: boolean;
    __initNeiaMaps?: () => void;
    google?: typeof globalThis extends { google: infer G } ? G : any;
  }
}

let loaderPromise: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.__neiaMapsReady) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined;
  const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] as string | undefined;
  if (!key) return Promise.reject(new Error("Chave do mapa indisponível"));

  loaderPromise = new Promise<void>((resolve, reject) => {
    window.__initNeiaMaps = () => {
      window.__neiaMapsReady = true;
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initNeiaMaps${
      channel ? `&channel=${channel}` : ""
    }`;
    script.async = true;
    script.onerror = () => reject(new Error("Falha ao carregar o mapa"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

export function MapView({ pontos, className }: { pontos: Ponto[]; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current || pontos.length === 0) return;
        const g = (window as any).google;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(ref.current, {
            center: pontos[0],
            zoom: 14,
            clickableIcons: false,
            disableDefaultUI: true,
            zoomControl: true,
            styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
          });
        }
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = pontos.map(
          (p) => new g.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map: mapRef.current, title: p.label }),
        );
        if (pontos.length > 1) {
          const bounds = new g.maps.LatLngBounds();
          pontos.forEach((p) => bounds.extend(p));
          mapRef.current.fitBounds(bounds, 60);
        } else {
          mapRef.current.setCenter(pontos[0]);
        }
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [pontos]);

  if (pontos.length === 0) return null;

  return <div ref={ref} className={className ?? "h-64 w-full rounded-xl border border-border"} />;
}

export function rotaGoogleMaps(destino: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}
