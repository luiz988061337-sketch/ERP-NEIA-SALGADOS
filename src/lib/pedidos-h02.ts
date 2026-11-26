import type { Database } from "@/integrations/supabase/types";

type Tabelas = Database["public"]["Tables"];
export type ItemH02 = Tabelas["pedido_itens"]["Row"] & {
  pedido_item_componentes?: Array<
    Pick<Tabelas["pedido_item_componentes"]["Row"], "produto_id" | "quantidade">
  >;
};
export type PedidoH02 = Omit<Tabelas["pedidos"]["Row"], "status"> & {
  status: string;
  pedido_itens: ItemH02[];
};
export type ProdutoH02 = {
  id: string;
  nome: string;
  tipo_venda: string;
  unidade_medida: string;
  categorias?: { slug?: string | null } | null;
};

export const COLUNAS_H02 = [
  { id: "novos", titulo: "Novos pedidos", descricao: "Aguardando aceitação", cor: "ouro" },
  { id: "aceitos", titulo: "Aceitos", descricao: "Aguardando a cozinha", cor: "azul" },
  { id: "producao", titulo: "Em produção", descricao: "Pedidos em preparo", cor: "laranja" },
  { id: "prontos", titulo: "Prontos", descricao: "Retirada ou Central de Entregas", cor: "verde" },
] as const;

export function grupoH02(
  p: Pick<
    PedidoH02,
    "status" | "aceito_em_atendente" | "aceito_em" | "producao_status" | "preparo_em"
  >,
) {
  switch (p.status) {
    case "recebido":
      return p.aceito_em_atendente || p.aceito_em ? "aceitos" : "novos";
    case "aceito":
      return "aceitos";
    case "em_producao":
      return !p.preparo_em &&
        p.producao_status === "aguardando" &&
        (p.aceito_em_atendente || p.aceito_em)
        ? "aceitos"
        : "producao";
    case "pronto":
    case "aguardando_motoboy":
      return "prontos";
    case "em_rota":
      return "entrega";
    case "entregue":
    case "retirado":
      return "finalizados";
    case "cancelado":
      return "cancelados";
    default:
      return "outros";
  }
}

export function atrasoH02(p: PedidoH02, agora: number): boolean | null {
  const grupo = grupoH02(p);
  if (grupo === "finalizados" || grupo === "cancelados") return false;
  if (p.atrasado) return true;
  const prazo = p.agendado_para ? Date.parse(p.agendado_para) : NaN;
  return Number.isFinite(prazo) ? prazo < agora : null;
}

export function resumoH02(pedidos: PedidoH02[], agora: number) {
  const grupos: Record<ReturnType<typeof grupoH02>, number> = {
    novos: 0,
    aceitos: 0,
    producao: 0,
    prontos: 0,
    entrega: 0,
    finalizados: 0,
    cancelados: 0,
    outros: 0,
  };
  let total = 0,
    pendentes = 0,
    atrasados = 0,
    prazosSemCobertura = 0,
    pagamentosIncompletos = false,
    valoresIncompletos = false;
  for (const p of pedidos) {
    grupos[grupoH02(p)]++;
    if (p.status !== "cancelado") {
      if (typeof p.total === "number" && Number.isFinite(p.total)) {
        total += p.total;
      } else valoresIncompletos = true;
      if (!p.pagamento_status) pagamentosIncompletos = true;
      if (p.pagamento_status === "pendente") pendentes++;
    }
    const atraso = atrasoH02(p, agora);
    if (atraso === null) prazosSemCobertura++;
    if (atraso) atrasados++;
  }
  return {
    grupos,
    total: valoresIncompletos ? null : total,
    pendentes: pagamentosIncompletos ? null : pendentes,
    atrasados: prazosSemCobertura && atrasados === 0 ? null : atrasados,
    prazosSemCobertura,
  };
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export type FiltrosH02 = {
  busca: string;
  grupo: string;
  modalidade: string;
  agenda: string;
  forma: string;
  pagamento: string;
  origem: string;
  atrasados: boolean;
};
export const FILTROS_H02: FiltrosH02 = {
  busca: "",
  grupo: "",
  modalidade: "",
  agenda: "",
  forma: "",
  pagamento: "",
  origem: "",
  atrasados: false,
};

export function correspondeH02(p: PedidoH02, f: FiltrosH02, agora: number) {
  const busca = normalizar(f.busca);
  const digitos = busca.replace(/\D/g, "");
  const buscaNumerica = /^[\d#()+.\s-]+$/.test(busca);
  const origens = [p.origem_cliente?.trim(), p.campanha_origem?.trim()];
  return (
    (!busca ||
      (buscaNumerica &&
        Boolean(digitos) &&
        (String(p.numero).includes(digitos) || p.telefone?.replace(/\D/g, "").includes(digitos))) ||
      [p.cliente_nome, ...p.pedido_itens.map((i) => i.nome)].some((nome) =>
        normalizar(nome ?? "").includes(busca),
      )) &&
    (!f.grupo || grupoH02(p) === f.grupo) &&
    (!f.modalidade || p.tipo_entrega === f.modalidade) &&
    (!f.agenda || (f.agenda === "agendado") === Boolean(p.agendado_para)) &&
    (!f.forma || p.forma_pagamento === f.forma) &&
    (!f.pagamento || p.pagamento_status === f.pagamento) &&
    (!f.origem || origens.includes(f.origem)) &&
    (!f.atrasados || atrasoH02(p, agora) === true)
  );
}

export function unidadesSalgadosH02(itens: ItemH02[], produtos: Map<string, ProdutoH02>) {
  let total = 0,
    incompleto = !itens.length;
  for (const item of itens) {
    if (item.pedido_item_componentes?.length) {
      total += item.pedido_item_componentes.reduce((soma, c) => soma + c.quantidade, 0);
      continue;
    }
    const produto = item.produto_id ? produtos.get(item.produto_id) : undefined;
    const slug = produto?.categorias?.slug ?? "";
    if (/^(bebidas|doces)(-|$)/.test(slug)) continue;
    if (
      produto?.tipo_venda === "combo_50" &&
      /^(un|unidade)$/.test(produto.unidade_medida) &&
      !/\d+\s*un\b/i.test(item.nome)
    ) {
      total += item.quantidade;
    } else {
      incompleto = true;
    }
  }
  return incompleto ? null : total;
}

export function trocoSolicitadoH02(obs: string | null | undefined) {
  return obs?.match(/\[Troco para ([^\]]+)\]/i)?.[1] ?? null;
}
