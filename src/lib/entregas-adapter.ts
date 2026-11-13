/**
 * Adapter de dados para Central de Entregas
 * - Modo demonstrativo: retorna fixtures locais
 * - Modo integrado: pode consultar Supabase via funções autorizadas
 * - Nunca grava dados reais em homologação
 */
export type PedidoResumo = {
  id: string;
  numero: string;
  cliente: string;
  bairro: string;
  status: string;
  pagamento: string;
  conferido: boolean;
  prazo: string;
};

export type RotaResumo = {
  id: string;
  codigo: string;
  motoboy: { id: string; nome: string; status: string };
  pedidos: PedidoResumo[];
  statusRota: "Aguardando liberação" | "Em rota" | "Finalizada";
  etaMin: number;
  distanciaKm: number;
};

export type Indicador = {
  label: string;
  value: string;
  info: string;
};

export const ENV = (import.meta as any).env || {};

export const isDemo = ENV.VITE_DEMO_ENTREGAS === "on" || true; // default demo

export async function fetchIndicadores(): Promise<Indicador[]> {
  if (isDemo) {
    return [
      { label: "Rotas em aberto", value: "6", info: "↓ -25%" },
      { label: "Pedidos aguardando rota", value: "12", info: "↑ +20%" },
      { label: "Motoboys disponíveis", value: "3", info: "Disponíveis" },
      { label: "Saídas previstas hoje", value: "8", info: "A partir de 10:00" },
    ];
  }
  // TODO: integrar leitura autorizada
  return [];
}

export async function fetchRotaAtiva(): Promise<RotaResumo> {
  if (isDemo) {
    return {
      id: "rota-04",
      codigo: "ROTA 04 — CENTRO",
      motoboy: { id: "m1", nome: "Carlos", status: "disponivel_base" },
      statusRota: "Aguardando liberação",
      etaMin: 28,
      distanciaKm: 7.2,
      pedidos: [
        { id: "p1", numero: "#4598", cliente: "Ana Costa", bairro: "Centro", status: "Em produção", pagamento: "Pix pago", conferido: false, prazo: "12:30" },
        { id: "p2", numero: "#4601", cliente: "Ricardo Souza", bairro: "Vila Marina", status: "Pronto", pagamento: "Pix pago", conferido: true, prazo: "13:00" },
        { id: "p3", numero: "#4603", cliente: "Luciana Melo", bairro: "Centro", status: "Pronto", pagamento: "Cartão", conferido: true, prazo: "13:15" },
      ],
    };
  }
  throw new Error("Integração ainda simulada");
}

export async function fetchPedidosComRota(): Promise<PedidoResumo[]> {
  if (isDemo) {
    return [
      { id: "p1", numero: "#4598", cliente: "Ana Costa e outros", bairro: "Centro / Vila Marina", status: "Aguardando liberação", pagamento: "", conferido: false, prazo: "" },
    ];
  }
  return [];
}

export function podeLiberarRota(rota: RotaResumo): { pode: boolean; motivo?: string } {
  const pendente = rota.pedidos.some(p => p.status !== "Pronto" || !p.conferido);
  if (pendente) return { pode: false, motivo: "Pedido ainda em produção ou sem conferência" };
  if (rota.motoboy.status !== "disponivel_base") return { pode: false, motivo: "Motoboy indisponível" };
  return { pode: true };
}
