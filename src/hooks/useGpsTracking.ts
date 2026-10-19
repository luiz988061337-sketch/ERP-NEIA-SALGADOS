import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

export type GpsStatus = "ativo" | "atualizando" | "sem_atualizacao" | "indisponivel" | "permissao_negada" | "offline";

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface UseGpsTrackingOptions {
  pedidoIds: string[];
  enabled: boolean;
  updateIntervalMs?: number;
  minDistanceMeters?: number;
  maxAgeMs?: number;
  timeoutMs?: number;
}

export interface UseGpsTrackingReturn {
  status: GpsStatus;
  currentPosition: GpsPosition | null;
  lastUpdate: Date | null;
  error: string | null;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  isTracking: boolean;
}

const STORAGE_KEY = "neia-gps-queue";
const MAX_QUEUE_SIZE = 50;
const OFFLINE_SYNC_INTERVAL_MS = 30000;
const GPS_STALE_THRESHOLD_MS = 60000;

function getOfflineQueue(): GpsPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: GpsPosition[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    // Ignore storage errors
  }
}

function addToOfflineQueue(position: GpsPosition): void {
  const queue = getOfflineQueue();
  queue.push(position);
  saveOfflineQueue(queue);
}

async function syncOfflineQueue(supabaseClient: typeof supabase, pedidoIds: string[]): Promise<void> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const pending = [...queue];
  saveOfflineQueue([]);

  for (const position of pending) {
    try {
      for (const pedidoId of pedidoIds) {
        await supabaseClient.from("pedidos").update({
          motoboy_lat: position.lat,
          motoboy_lng: position.lng,
          motoboy_atualizado_em: new Date(position.timestamp).toISOString(),
        }).eq("id", pedidoId);
      }
    } catch {
      // Re-add to queue if sync fails
      addToOfflineQueue(position);
    }
  }
}

export function useGpsTracking({
  pedidoIds,
  enabled,
  updateIntervalMs = 15000,
  minDistanceMeters = 10,
  maxAgeMs = 10000,
  timeoutMs = 15000,
}: UseGpsTrackingOptions): UseGpsTrackingReturn {
  const [status, setStatus] = useState<GpsStatus>("indisponivel");
  const [currentPosition, setCurrentPosition] = useState<GpsPosition | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GpsPosition | null>(null);
  const pendingPositionRef = useRef<GpsPosition | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const offlineSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isOnlineRef = useRef(true);
  const pedidoIdsRef = useRef(pedidoIds);
  const enabledRef = useRef(enabled);

  // Keep refs updated
  useEffect(() => {
    pedidoIdsRef.current = pedidoIds;
  }, [pedidoIds]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      if (status === "offline") {
        setStatus("ativo");
      }
      syncOfflineQueue(supabase, pedidoIdsRef.current);
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      setStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [status]);

  // Offline queue sync interval
  useEffect(() => {
    offlineSyncIntervalRef.current = setInterval(() => {
      if (isOnlineRef.current && getOfflineQueue().length > 0) {
        syncOfflineQueue(supabase, pedidoIdsRef.current);
      }
    }, OFFLINE_SYNC_INTERVAL_MS);

    return () => {
      if (offlineSyncIntervalRef.current) {
        clearInterval(offlineSyncIntervalRef.current);
      }
    };
  }, []);

  // GPS stale detection
  useEffect(() => {
    const checkStale = () => {
      if (!lastUpdate) return;
      const now = Date.now();
      const staleMs = now - lastUpdate.getTime();
      
      if (staleMs > GPS_STALE_THRESHOLD_MS && status === "ativo") {
        setStatus("sem_atualizacao");
      }
    };

    const interval = setInterval(checkStale, 10000);
    return () => clearInterval(interval);
  }, [lastUpdate, status]);

  const updatePosition = useCallback(async (position: GeolocationPosition) => {
    const newPosition: GpsPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Date.now(),
    };

    // Check minimum distance to avoid unnecessary updates
    if (lastPositionRef.current) {
      const distance = calculateDistance(
        lastPositionRef.current.lat,
        lastPositionRef.current.lng,
        newPosition.lat,
        newPosition.lng
      );
      if (distance < (minDistanceMeters ?? 10)) {
        return; // Skip update if movement is too small
      }
    }

    lastPositionRef.current = newPosition;
    pendingPositionRef.current = newPosition;
    setCurrentPosition(newPosition);
    setLastUpdate(new Date(newPosition.timestamp));
    setStatus("atualizando");
    setError(null);

    if (!enabledRef.current || pedidoIdsRef.current.length === 0) {
      setStatus("ativo");
      return;
    }

    // THROTTLE (não debounce): o watchPosition emite com frequência; limpar e
    // reagendar o timer a cada emissão impedia o envio enquanto o motoboy se
    // movia (o timer reiniciava antes de disparar — causa do "GPS atrasado").
    // Agora há no máximo 1 envio por janela, sempre com a posição MAIS RECENTE.
    if (updateTimeoutRef.current) return;

    updateTimeoutRef.current = setTimeout(async () => {
      updateTimeoutRef.current = null;
      const pendente = pendingPositionRef.current;
      if (!pendente) return;

      if (!enabledRef.current || pedidoIdsRef.current.length === 0) {
        setStatus("ativo");
        return;
      }

      if (!isOnlineRef.current) {
        addToOfflineQueue(pendente);
        setStatus("offline");
        return;
      }

      try {
        const updates = pedidoIdsRef.current.map((pedidoId) =>
          supabase.from("pedidos").update({
            motoboy_lat: pendente.lat,
            motoboy_lng: pendente.lng,
            motoboy_atualizado_em: new Date(pendente.timestamp).toISOString(),
          }).eq("id", pedidoId)
        );

        const results = await Promise.all(updates);
        // O Supabase não lança: erros vêm em `error`. Sem checar, a atualização
        // falhava em silêncio e não entrava na fila offline.
        if (results.some((r) => r.error)) throw results.find((r) => r.error)?.error;
        setStatus("ativo");
      } catch (err) {
        console.error("GPS update error:", err);
        addToOfflineQueue(pendente);
        setStatus("offline");
        setError("Falha ao sincronizar localização. Tentando novamente...");
      }
    }, updateIntervalMs);
  }, [minDistanceMeters]);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    console.error("GPS error:", err);
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setStatus("permissao_negada");
        setError("Permissão de localização negada. Ative nas configurações do navegador para iniciar a rota.");
        break;
      case err.POSITION_UNAVAILABLE:
        setStatus("indisponivel");
        setError("Localização indisponível. Verifique se o GPS está ativado no dispositivo.");
        break;
      case err.TIMEOUT:
        setStatus("indisponivel");
        setError("Tempo esgotado ao obter localização. Tente novamente.");
        break;
      default:
        setStatus("indisponivel");
        setError("Erro ao obter localização.");
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setStatus("indisponivel");
      setError("Geolocalização não suportada neste navegador/dispositivo.");
      return;
    }

    if (watchIdRef.current !== null) {
      // Already tracking
      return;
    }

    setIsTracking(true);
    setError(null);
    setStatus("atualizando");

    try {
      // Get initial position
      const initialPosition = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: maxAgeMs ?? 10000,
          timeout: timeoutMs ?? 15000,
        });
      });

      await updatePosition(initialPosition);
      setStatus("ativo");
      setIsTracking(true);

      // Start continuous tracking
      watchIdRef.current = navigator.geolocation.watchPosition(
        updatePosition,
        handlePositionError,
        {
          enableHighAccuracy: true,
          maximumAge: maxAgeMs ?? 10000,
          timeout: timeoutMs ?? 15000,
        }
      );
    } catch (err) {
      console.error("Failed to start GPS tracking:", err);
      setIsTracking(false);
      handlePositionError(err as GeolocationPositionError);
    }
  }, [updatePosition, handlePositionError, maxAgeMs, timeoutMs]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    pendingPositionRef.current = null;
    setIsTracking(false);
    setStatus("indisponivel");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
      if (offlineSyncIntervalRef.current) {
        clearInterval(offlineSyncIntervalRef.current);
      }
    };
  }, [stopTracking]);

  // Handle page visibility change to pause/resume tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isTracking) {
        // Page hidden - could pause tracking to save battery
        // But we keep it running for now as per requirements
      } else if (!document.hidden && enabledRef.current && !isTracking && pedidoIdsRef.current.length > 0) {
        // Page visible again - resume if needed
        startTracking();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isTracking, startTracking]);

  return {
    status,
    currentPosition,
    lastUpdate,
    error,
    startTracking,
    stopTracking,
    isTracking,
  };
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}