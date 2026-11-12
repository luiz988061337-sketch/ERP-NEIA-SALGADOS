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
    // libraries=places é OBRIGATÓRIO para AutocompleteService/SessionToken;
    // language/region garantem sugestões em português com viés Brasil.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initNeiaMaps&libraries=places&language=pt-BR&region=br${
      channel ? `&channel=${channel}` : ""
    }`;
    script.async = true;
    script.onerror = () => reject(new Error("Falha ao carregar o mapa"));
    document.head.appendChild(script);
  });
  // Se o carregamento falhar, limpa o cache para permitir nova tentativa.
  loaderPromise.catch(() => {
    loaderPromise = null;
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

// ---------------------------------------------------------------------------
// ENDEREÇO INTELIGENTE (0103) — autocomplete, geocoding detalhado e rota real.
// Reutiliza a MESMA chave/carregador do Maps (env-only, nunca hardcode).
// ---------------------------------------------------------------------------

export type EnderecoDetalhado = {
  /** Endereço completo em texto (logradouro + número + cidade + UF). */
  completo: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  lat: number;
  lng: number;
  placeId: string;
  /** ROOFTOP/RANGE_INTERPOLATED/GEOMETRIC_CENTER/APPROXIMATE (provedor). */
  precisao: string;
  /** Precisão suficiente para o motoboy chegar ao ponto correto? */
  nivel: "preciso" | "aproximado";
};

export type PredicaoEndereco = { placeId: string; descricao: string };

/**
 * Token de sessão do Places: reutilizado durante uma mesma interação de
 * digitação (cobra 1 sessão por seleção em vez de por tecla) e renovado
 * quando o usuário seleciona um endereço.
 */
let placeSessionToken: unknown = null;
function tokenSessao(g: any): unknown {
  if (!placeSessionToken) placeSessionToken = new g.maps.places.AutocompleteSessionToken();
  return placeSessionToken;
}

function componente(ac: any[], tipo: string, modo: "long" | "short" = "long"): string {
  const c = ac?.find?.((x: any) => (x.types ?? []).includes(tipo));
  return c ? (modo === "long" ? c.long_name : c.short_name) : "";
}

function nivelDePrecisao(geometry: any): { precisao: string; nivel: "preciso" | "aproximado" } {
  const precisao = geometry?.location_type ?? "APPROXIMATE";
  const tipos: string[] = geometry?.types ?? [];
  const temNumero =
    precisao === "ROOFTOP" ||
    precisao === "RANGE_INTERPOLATED" ||
    tipos.includes("street_address") ||
    tipos.includes("premise");
  return { precisao, nivel: temNumero ? "preciso" : "aproximado" };
}

async function comGeocoder<T>(
  req: Record<string, unknown>,
): Promise<T | null> {
  await loadMaps();
  const g = (window as any).google;
  const geocoder = new g.maps.Geocoder();
  const res = await geocoder.geocode({ region: "br", ...req });
  return (res?.results ?? []) as T;
}

/** Sugestões de endereço (rua, avenida, CEP, estabelecimento — conforme o provedor).
 *  Retorna null quando o serviço/provedor falhou (API indisponível) — distinto
 *  de uma busca sem resultados ([]), para a UI mostrar estados honestos. */
export async function autocompletarEnderecos(
  texto: string,
): Promise<PredicaoEndereco[] | null> {
  const t = texto.trim();
  if (t.length < 3) return [];
  try {
    await loadMaps();
    const g = (window as any).google;
    if (!g?.maps?.places?.AutocompleteService) {
      console.error("Biblioteca Places indisponível no carregador do Maps");
      return null;
    }
    const service = new g.maps.places.AutocompleteService();
    const res = await service.getPlacePredictions({
      input: t,
      componentRestrictions: { country: "br" },
      // Sessão por interação: melhora o custo/qualidade do autocomplete.
      sessionToken: tokenSessao(g),
    });
    return (res?.predictions ?? []).map((p: any) => ({
      placeId: p.place_id as string,
      descricao: p.description as string,
    }));
  } catch (e) {
    console.error("Autocomplete indisponível", e);
    return null;
  }
}

/** Detalha uma sugestão (place_id): logradouro, número, bairro, cidade, UF, CEP, lat/lng, place_id, precisão. */
export async function detalharPlaceId(
  placeId: string,
): Promise<EnderecoDetalhado | null> {
  try {
    const results = await comGeocoder<any>({ placeId });
    // Fim da sessão do Places (seleção consumida) — próxima digitação renova.
    placeSessionToken = null;
    const r = results?.[0];
    if (!r) return null;
    const ac = r.address_components ?? [];
    const loc = r.geometry?.location;
    if (!loc) return null;
    const { precisao, nivel } = nivelDePrecisao(r.geometry);
    return {
      completo: r.formatted_address ?? "",
      logradouro: componente(ac, "route") || (r.formatted_address ?? ""),
      numero: componente(ac, "street_number"),
      bairro:
        componente(ac, "sublocality_level_1") ||
        componente(ac, "sublocality") ||
        componente(ac, "neighborhood"),
      cidade:
        componente(ac, "administrative_area_level_2") ||
        componente(ac, "locality"),
      uf: componente(ac, "administrative_area_level_1", "short"),
      cep: componente(ac, "postal_code"),
      lat: loc.lat(),
      lng: loc.lng(),
      placeId: r.place_id ?? placeId,
      precisao,
      nivel,
    };
  } catch (e) {
    console.error("Detalhamento de endereço falhou", e);
    return null;
  }
}

/** Geocodifica um endereço completo digitado (fallback manual/CEP). */
export async function geocodificarCompleto(
  enderecoTexto: string,
): Promise<EnderecoDetalhado | null> {
  try {
    const results = await comGeocoder<any>({ address: enderecoTexto });
    const r = results?.[0];
    if (!r) return null;
    const ac = r.address_components ?? [];
    const loc = r.geometry?.location;
    if (!loc) return null;
    const { precisao, nivel } = nivelDePrecisao(r.geometry);
    return {
      completo: r.formatted_address ?? enderecoTexto,
      logradouro: componente(ac, "route") || enderecoTexto,
      numero: componente(ac, "street_number"),
      bairro:
        componente(ac, "sublocality_level_1") ||
        componente(ac, "sublocality") ||
        componente(ac, "neighborhood"),
      cidade:
        componente(ac, "administrative_area_level_2") ||
        componente(ac, "locality"),
      uf: componente(ac, "administrative_area_level_1", "short"),
      cep: componente(ac, "postal_code"),
      lat: loc.lat(),
      lng: loc.lng(),
      placeId: r.place_id ?? "",
      precisao,
      nivel,
    };
  } catch (e) {
    console.error("Geocodificação completa falhou", e);
    return null;
  }
}

/** Distância em linha reta (km) — cálculo local, sem serviço. */
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Distância REAL por rota viária (carro/moto) via Directions do Maps.
 * Retorna null se o serviço falhar (o chamador decide o fallback).
 */
export async function distanciaRotaKm(
  origem: { lat: number; lng: number },
  destino: { lat: number; lng: number },
): Promise<{ km: number } | null> {
  try {
    await loadMaps();
    const g = (window as any).google;
    const service = new g.maps.DirectionsService();
    const res = await service.route(
      {
        origin: origem,
        destination: destino,
        travelMode: g.maps.TravelMode.DRIVING,
      },
    );
    const legs = res?.routes?.[0]?.legs ?? [];
    const metros = legs.reduce((s: number, l: any) => s + (l.distance?.value ?? 0), 0);
    if (!metros) return null;
    return { km: Math.round((metros / 1000) * 100) / 100 };
  } catch (e) {
    console.error("Rota indisponível", e);
    return null;
  }
}

/**
 * Mapa com pin ARRASTÁVEL — confirmação visual do ponto de entrega
 * (cliente ajusta para portaria/entrada correta) e configuração da
 * origem no admin. Ao mover, atualiza lat/lng (o texto do endereço
 * não é alterado automaticamente).
 */
export function MapaPinAjustavel({
  lat,
  lng,
  onChange,
  className,
}: {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErro(null);
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(ref.current, {
            center: { lat, lng },
            zoom: 17,
            clickableIcons: false,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
            styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
          });
          markerRef.current = new g.maps.Marker({
            position: { lat, lng },
            map: mapRef.current,
            draggable: !!onChange,
            title: "Local da entrega",
          });
          if (onChange) {
            markerRef.current.addListener("dragend", () => {
              const p = markerRef.current.getPosition();
              onChange(p.lat(), p.lng());
            });
          }
        }
        mapRef.current.setCenter({ lat, lng });
        markerRef.current.setPosition({ lat, lng });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setErro(e instanceof Error ? e.message : "Mapa indisponível");
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (erro) {
    return (
      <div className={className ?? "h-56 w-full rounded-xl border border-border"}>
        <div className="flex h-full items-center justify-center rounded-xl bg-muted p-3 text-center text-xs text-muted-foreground">
          Mapa indisponível ({erro}). Confira o endereço completo antes de confirmar.
        </div>
      </div>
    );
  }

  return <div ref={ref} className={className ?? "h-56 w-full rounded-xl border border-border"} />;
}
