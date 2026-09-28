import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const enderecoSchema = z.object({ endereco: z.string().trim().min(5).max(300) });

export const geocodificar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => enderecoSchema.parse(data))
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) {
      return { lat: null as number | null, lng: null as number | null, formatado: null as string | null };
    }

    const res = await fetch(
      `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.endereco)}&region=br&language=pt-BR`,
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Geocode falhou [${res.status}]: ${body}`);
      return { lat: null, lng: null, formatado: null };
    }

    const json = (await res.json()) as {
      results?: Array<{ geometry: { location: { lat: number; lng: number } }; formatted_address: string }>;
    };
    const first = json.results?.[0];
    if (!first) return { lat: null, lng: null, formatado: null };
    return {
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
      formatado: first.formatted_address,
    };
  });
