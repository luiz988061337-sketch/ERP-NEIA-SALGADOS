import { z } from "zod";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

export const MOTOBOY_RPC_ATIVO = import.meta.env.VITE_NEIA_MOTOBOY_RPC === "1";

const localizacao = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  capturado_em: z.string(),
});
type Localizacao = z.infer<typeof localizacao>;

export async function lerLocalizacaoEntrega(pedidoId: string): Promise<Localizacao | null> {
  const { data, error } = await supabase.rpc("consultar_localizacao_entrega", { p_pedido: pedidoId });
  if (error || data === null) return null;
  const lida = localizacao.safeParse(data);
  return lida.success ? lida.data : null;
}

const mapaDeLocalizacoes = z.array(z.object({ pedido: z.guid(), localizacao }));

export async function lerLocalizacoesEntrega(ids: string[]) {
  if (!ids.length) return new Map<string, Localizacao>();
  const { data, error } = await supabase.rpc("consultar_localizacoes_entregas", { p_pedidos: ids });
  const lidas = mapaDeLocalizacoes.safeParse(data);
  return new Map<string, Localizacao>(!error && lidas.success
    ? lidas.data.map((item) => [item.pedido, item.localizacao]) : []);
}

export function comLocalizacaoSegura<T extends object>(pedido: T, gps: Localizacao | null) {
  return { ...pedido, motoboy_lat: gps?.latitude ?? null,
    motoboy_lng: gps?.longitude ?? null, motoboy_atualizado_em: gps?.capturado_em ?? null };
}
