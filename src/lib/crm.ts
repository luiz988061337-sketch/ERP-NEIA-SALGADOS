import { useQuery } from "@tanstack/react-query";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { DEFAULT_FIDELIDADE } from "@/lib/fidelidade";

export type CrmSettings = {
  ativo_ate_dias: number;
  risco_apos_dias: number;
  inativo_apos_dias: number;
  muito_inativo_apos_dias: number;
  intervalo_min_campanhas_dias: number;
  campanhas_habilitadas: boolean;
  mensagem_padrao: string;
  vip_min_pedidos: number;
  vip_min_valor: number;
  freq_min_pedidos: number;
  sugestoes_ativas: boolean;
  recompra_ativa: boolean;
  carrinho_recuperacao_ativa: boolean;
  fid_ativo: boolean;
  fid_reais_por_ponto: number;
  fid_meta_pontos: number;
  fid_recompensa_valor: number;
};

export const DEFAULT_CRM_SETTINGS: CrmSettings = {
  ativo_ate_dias: 30,
  risco_apos_dias: 31,
  inativo_apos_dias: 46,
  muito_inativo_apos_dias: 91,
  intervalo_min_campanhas_dias: 7,
  campanhas_habilitadas: true,
  mensagem_padrao:
    "Olá {{cliente}}! Sentimos sua falta aqui na Néia Salgados! Já faz {{dias_sem_comprar}} dias desde seu último pedido. Quer receber nosso cardápio? {{link_cardapio}}",
  vip_min_pedidos: 0,
  vip_min_valor: 500,
  freq_min_pedidos: 4,
  sugestoes_ativas: true,
  recompra_ativa: true,
  carrinho_recuperacao_ativa: true,
  // HOMO-CLIENTE-15: a regra de fidelidade tem uma unica fonte de defaults.
  fid_ativo: DEFAULT_FIDELIDADE.ativo,
  fid_reais_por_ponto: DEFAULT_FIDELIDADE.reaisPorPonto,
  fid_meta_pontos: DEFAULT_FIDELIDADE.metaPontos,
  fid_recompensa_valor: DEFAULT_FIDELIDADE.recompensaValor,
};

export const LIMIAR_FREQUENTE_PEDIDOS = 4;
export const LIMIAR_VIP_TOTAL = 500;

export function isFrequente(totalPedidos: number): boolean {
  return totalPedidos >= LIMIAR_FREQUENTE_PEDIDOS;
}

export function isVip(totalGasto: number): boolean {
  return totalGasto >= LIMIAR_VIP_TOTAL;
}

/** VIP configurável: atinge valor OU (se configurado) nº de pedidos. */
export function isVipCfg(totalGasto: number, totalPedidos: number, s: CrmSettings): boolean {
  if (totalGasto >= (s.vip_min_valor || LIMIAR_VIP_TOTAL)) return true;
  return s.vip_min_pedidos > 0 && totalPedidos >= s.vip_min_pedidos;
}

export function isFrequenteCfg(totalPedidos: number, s: CrmSettings): boolean {
  return totalPedidos >= (s.freq_min_pedidos || LIMIAR_FREQUENTE_PEDIDOS);
}

/** Dias até o próximo aniversário (0 = hoje). Null sem data válida. */
export function diasParaAniversario(iso: string | null | undefined, ref = new Date()): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  let prox = new Date(ref.getFullYear(), mes, dia);
  if (prox < hoje) prox = new Date(ref.getFullYear() + 1, mes, dia);
  return Math.round((prox.getTime() - hoje.getTime()) / 86400000);
}

export type Segmento = "ativo" | "risco" | "inativo" | "muito_inativo" | "novo";

export type CustomerStats = {
  telefone_norm: string;
  telefone_display: string;
  nome: string;
  email: string;
  user_id: string | null;
  bairro: string;
  cidade: string;
  endereco_recente: string;
  opt_out: boolean;
  primeiro_pedido: string | null;
  ultimo_pedido: string | null;
  dias_sem_comprar: number | null;
  total_pedidos: number;
  total_gasto: number;
  ticket_medio: number;
  ultimo_valor: number;
  produtos_top: string[];
  segmento: Segmento;
  /** Datas ISO dos pedidos válidos (ordem crescente) — base da recompra estimada. */
  datas: string[];
  tipo_cliente: TipoCliente;
  nome_fantasia: string;
};

/** CNPJ válido = 14 dígitos (validação completa de dígitos verificadores fora do escopo; RLS/Receita à parte). */
export function validarCNPJ(cnpj: string | null | undefined): boolean {
  const d = String(cnpj ?? "").replace(/\D/g, "");
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  return true;
}

export type TipoCliente = "PF" | "PJ";

export function normalizarTelefone(tel: string | null | undefined): string {
  const d = String(tel ?? "").replace(/\D/g, "");
  // remove 55 inicial p/ chave única BR; mantém DDD+numero
  const sem55 = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  return sem55;
}

export function classificar(dias: number | null, s: CrmSettings): Segmento {
  if (dias == null) return "novo";
  if (dias <= s.ativo_ate_dias) return "ativo";
  if (dias < s.inativo_apos_dias) return dias >= s.risco_apos_dias ? "risco" : "ativo";
  if (dias < s.muito_inativo_apos_dias) return "inativo";
  return "muito_inativo";
}

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  ativo: "🟢 Ativo",
  risco: "🟡 Em risco",
  inativo: "🔴 Inativo",
  muito_inativo: "⚫ Muito inativo",
  novo: "🆕 Novo",
};

const PEDIDOS_VALIDOS = ["recebido", "em_producao", "pronto", "aguardando_motoboy", "em_rota", "entregue"];

type PedidoRow = {
  telefone: string;
  cliente_nome: string;
  bairro: string | null;
  endereco: string;
  created_at: string;
  total: string | number;
  status: string;
  user_id: string | null;
};

export function agregarClientes(pedidos: PedidoRow[], settings: CrmSettings, optOutMap?: Map<string, boolean>, empresaMap?: Map<string, { tipo: string; fantasia: string }>): CustomerStats[] {
  const porTel = new Map<string, PedidoRow[]>();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    if (!PEDIDOS_VALIDOS.includes(p.status)) continue;
    const tel = normalizarTelefone(p.telefone);
    if (!tel) continue;
    const arr = porTel.get(tel) ?? [];
    arr.push(p);
    porTel.set(tel, arr);
  }
  const hoje = new Date();
  const out: CustomerStats[] = [];
  for (const [tel, lista] of porTel) {
    const ordenados = [...lista].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const ultimo = ordenados[ordenados.length - 1];
    const primeiro = ordenados[0];
    if (!ultimo || !primeiro) continue;
    const totalGasto = ordenados.reduce((acc, p) => acc + Number(p.total ?? 0), 0);
    const dias = Math.floor((hoje.getTime() - new Date(ultimo.created_at).getTime()) / 86400000);
    out.push({
      telefone_norm: tel,
      telefone_display: ultimo.telefone,
      nome: ultimo.cliente_nome,
      email: "",
      user_id: ultimo.user_id,
      bairro: ultimo.bairro ?? "",
      cidade: "",
      endereco_recente: ultimo.endereco,
      opt_out: optOutMap?.get(tel) ?? false,
      primeiro_pedido: primeiro.created_at,
      ultimo_pedido: ultimo.created_at,
      dias_sem_comprar: dias,
      total_pedidos: ordenados.length,
      total_gasto: totalGasto,
      ticket_medio: ordenados.length ? totalGasto / ordenados.length : 0,
      ultimo_valor: Number(ultimo.total ?? 0),
      produtos_top: [],
      segmento: classificar(dias, settings),
      datas: ordenados.map((p) => p.created_at),
      tipo_cliente: (empresaMap?.get(tel)?.tipo === "PJ" ? "PJ" : "PF") as TipoCliente,
      nome_fantasia: empresaMap?.get(tel)?.fantasia ?? "",
    });
  }
  return out.sort((a, b) => (b.dias_sem_comprar ?? -1) - (a.dias_sem_comprar ?? -1));
}

export function renderMensagem(template: string, c: Pick<CustomerStats, "nome" | "dias_sem_comprar" | "ultimo_pedido" | "ultimo_valor" | "total_pedidos" | "total_gasto">): string {
  const data = c.ultimo_pedido ? new Date(c.ultimo_pedido).toLocaleDateString("pt-BR") : "-";
  return template
    .replaceAll("{{cliente}}", c.nome.split(" ")[0] || c.nome)
    .replaceAll("{{dias_sem_comprar}}", String(c.dias_sem_comprar ?? "-"))
    .replaceAll("{{ultimo_pedido}}", data)
    .replaceAll("{{ultimo_valor}}", c.ultimo_valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
    .replaceAll("{{total_pedidos}}", String(c.total_pedidos))
    .replaceAll("{{total_gasto}}", c.total_gasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
    .replaceAll("{{link_cardapio}}", `${window.location.origin}/`);
}

export function useCrmSettings() {
  return useQuery({
    queryKey: ["crm-settings"],
    queryFn: async (): Promise<CrmSettings> => {
      const { data, error } = await supabase.from("crm_settings").select("*").eq("id", true).maybeSingle();
      if (error) return DEFAULT_CRM_SETTINGS;
      if (!data) return DEFAULT_CRM_SETTINGS;
      return {
        ativo_ate_dias: Number((data as any).ativo_ate_dias ?? DEFAULT_CRM_SETTINGS.ativo_ate_dias),
        risco_apos_dias: Number((data as any).risco_apos_dias ?? DEFAULT_CRM_SETTINGS.risco_apos_dias),
        inativo_apos_dias: Number((data as any).inativo_apos_dias ?? DEFAULT_CRM_SETTINGS.inativo_apos_dias),
        muito_inativo_apos_dias: Number((data as any).muito_inativo_apos_dias ?? DEFAULT_CRM_SETTINGS.muito_inativo_apos_dias),
        intervalo_min_campanhas_dias: Number((data as any).intervalo_min_campanhas_dias ?? DEFAULT_CRM_SETTINGS.intervalo_min_campanhas_dias),
        campanhas_habilitadas: Boolean((data as any).campanhas_habilitadas ?? DEFAULT_CRM_SETTINGS.campanhas_habilitadas),
        mensagem_padrao: String((data as any).mensagem_padrao ?? DEFAULT_CRM_SETTINGS.mensagem_padrao),
        vip_min_pedidos: Number((data as any).vip_min_pedidos ?? DEFAULT_CRM_SETTINGS.vip_min_pedidos),
        vip_min_valor: Number((data as any).vip_min_valor ?? DEFAULT_CRM_SETTINGS.vip_min_valor),
        freq_min_pedidos: Number((data as any).freq_min_pedidos ?? DEFAULT_CRM_SETTINGS.freq_min_pedidos),
        sugestoes_ativas: (data as any).sugestoes_ativas ?? DEFAULT_CRM_SETTINGS.sugestoes_ativas,
        recompra_ativa: (data as any).recompra_ativa ?? DEFAULT_CRM_SETTINGS.recompra_ativa,
        carrinho_recuperacao_ativa: (data as any).carrinho_recuperacao_ativa ?? DEFAULT_CRM_SETTINGS.carrinho_recuperacao_ativa,
        fid_ativo: (data as any).fid_ativo ?? DEFAULT_CRM_SETTINGS.fid_ativo,
        fid_reais_por_ponto: Number((data as any).fid_reais_por_ponto ?? DEFAULT_CRM_SETTINGS.fid_reais_por_ponto),
        fid_meta_pontos: Number((data as any).fid_meta_pontos ?? DEFAULT_CRM_SETTINGS.fid_meta_pontos),
        fid_recompensa_valor: Number((data as any).fid_recompensa_valor ?? DEFAULT_CRM_SETTINGS.fid_recompensa_valor),
      };
    },
  });
}

export function useClientesStats() {
  const { data: settings } = useCrmSettings();
  return useQuery({
    queryKey: ["crm-clientes", settings],
    enabled: !!settings,
    queryFn: async (): Promise<CustomerStats[]> => {
      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select("telefone, cliente_nome, bairro, endereco, created_at, total, status, user_id")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      let optOut = new Map<string, boolean>();
      let empresas = new Map<string, { tipo: string; fantasia: string }>();
      try {
        const { data: cust } = await supabase.from("crm_customers").select("telefone_norm, opt_out, tipo_cliente, nome_fantasia");
        optOut = new Map((cust ?? []).map((c: any) => [c.telefone_norm, !!c.opt_out]));
        empresas = new Map((cust ?? []).map((c: any) => [c.telefone_norm, { tipo: String(c.tipo_cliente ?? "PF"), fantasia: String(c.nome_fantasia ?? "") }]));
      } catch {
        /* tabela ainda não migrada — segue sem opt-out */
      }
      return agregarClientes((pedidos ?? []) as PedidoRow[], settings ?? DEFAULT_CRM_SETTINGS, optOut, empresas);
    },
  });
}
