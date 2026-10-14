import { useEffect, useRef, useState } from "react";

type Ponto = { lat: number; lng: number; label: string; moto?: boolean };

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
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErro(null);
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
        markersRef.current = pontos.map((p) =>
          p.moto
            ? new g.maps.Marker({
                position: { lat: p.lat, lng: p.lng },
                map: mapRef.current,
                title: p.label,
                // Moto de desenho: círculo invisível + emoji (sem asset externo).
                icon: { path: g.maps.SymbolPath.CIRCLE, scale: 0.1, fillOpacity: 0, strokeOpacity: 0 },
                label: { text: "🛵", fontSize: "30px" },
              })
            : new g.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map: mapRef.current, title: p.label }),
        );
        if (pontos.length > 1) {
          const bounds = new g.maps.LatLngBounds();
          pontos.forEach((p) => bounds.extend(p));
          mapRef.current.fitBounds(bounds, 60);
        } else {
          mapRef.current.setCenter(pontos[0]);
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setErro(e instanceof Error ? e.message : "Mapa indisponível");
      });
    return () => {
      cancelled = true;
    };
  }, [pontos]);

  if (pontos.length === 0) return null;

  if (erro) {
    return (
      <div className={className ?? "h-64 w-full rounded-xl border border-border"}>
        <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl bg-muted p-4 text-center">
          <p className="text-sm font-medium">Mapa indisponível no momento</p>
          <p className="text-xs text-muted-foreground">{erro}. Use o botão de rota para navegar.</p>
        </div>
      </div>
    );
  }

  return <div ref={ref} className={className ?? "h-64 w-full rounded-xl border border-border"} />;
}

export function rotaGoogleMaps(destino: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

export async function geocodificarEndereco(
  endereco: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    await loadMaps();
    const g = (window as any).google;
    const geocoder = new g.maps.Geocoder();
    const res = await geocoder.geocode({ address: endereco, region: "br" });
    const loc = res?.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat(), lng: loc.lng() };
  } catch (e) {
    console.error("Geocodificação falhou", e);
    return null;
  }
}
