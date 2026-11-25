import { SP_OFFSET } from "./competencia";
import { classificarProcesso, fritadeirasParaProducao } from "./motor-producao";

const DIA = 86_400_000;
const HORA = 3_600_000;

export type FaixaDashboard = {
  inicio: string;
  ultimoDia: string;
  ini: string;
  fim: string;
  dias: number;
};

export function deslocarDia(dia: string, dias: number) {
  return new Date(Date.parse(dia + "T00:00:00Z") + dias * DIA).toISOString().slice(0, 10);
}

export function faixaDashboard(inicio: string, ultimoDia: string): FaixaDashboard | null {
  const valido = [inicio, ultimoDia].every(
    (dia) =>
      /^\d{4}-\d{2}-\d{2}$/.test(dia) &&
      Number.isFinite(Date.parse(dia)) &&
      deslocarDia(dia, 0) === dia,
  );
  if (!valido || inicio > ultimoDia) return null;
  return {
    inicio,
    ultimoDia,
    ini: new Date(inicio + "T00:00:00" + SP_OFFSET).toISOString(),
    fim: new Date(deslocarDia(ultimoDia, 1) + "T00:00:00" + SP_OFFSET).toISOString(),
    dias: (Date.parse(ultimoDia) - Date.parse(inicio)) / DIA + 1,
  };
}

export function faixaAnterior(faixa: FaixaDashboard): FaixaDashboard {
  return faixaDashboard(deslocarDia(faixa.inicio, -faixa.dias), deslocarDia(faixa.inicio, -1))!;
}

export function contem(faixa: FaixaDashboard, instante?: string | null) {
  const tempo = instante ? Date.parse(instante) : NaN;
  return tempo >= Date.parse(faixa.ini) && tempo < Date.parse(faixa.fim);
}

export const STATUS_DASHBOARD = [
  ["novos", "Novos"],
  ["aceitos", "Aceitos"],
  ["producao", "Em produção"],
  ["prontos", "Prontos"],
  ["entrega", "Em entrega"],
  ["concluidos", "Concluídos"],
  ["cancelados", "Cancelados"],
  ["atrasados", "Em atraso"],
  ["agendados", "Agendados"],
] as const;

export type GrupoPedido = (typeof STATUS_DASHBOARD)[number][0];

export type PedidoDashboard = {
  id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  total: number;
  subtotal: number;
  desconto: number;
  created_at: string;
  tipo_entrega: string;
  taxa_entrega: number;
  atrasado: boolean | null;
  agendado_para: string | null;
  aceito_em_atendente: string | null;
  aceito_em: string | null;
  preparo_em: string | null;
  pronto_em: string | null;
  saiu_em: string | null;
  rota_id: string | null;
  entregue_em: string | null;
  pedido_itens: {
    produto_id: string | null;
    nome: string;
    quantidade: number;
    preco_unitario: number;
  }[];
};

type PedidoStatus = Pick<
  PedidoDashboard,
  "status" | "aceito_em_atendente" | "aceito_em" | "atrasado" | "agendado_para"
>;

export function pertenceAoGrupo(pedido: PedidoStatus, grupo: GrupoPedido) {
  if (grupo === "agendados") return pedido.status !== "cancelado" && Boolean(pedido.agendado_para);
  if (grupo === "atrasados")
    return pedido.atrasado === true && !["entregue", "cancelado"].includes(pedido.status);
  switch (pedido.status) {
    case "recebido":
      return grupo === (pedido.aceito_em_atendente || pedido.aceito_em ? "aceitos" : "novos");
    case "em_producao":
      return grupo === "producao";
    case "pronto":
    case "aguardando_motoboy":
      return grupo === "prontos";
    case "em_rota":
      return grupo === "entrega";
    case "entregue":
      return grupo === "concluidos";
    case "cancelado":
      return grupo === "cancelados";
    default:
      return false;
  }
}

export function variacao(atual: number | null, anterior: number | null) {
  return atual !== null && anterior !== null && anterior > 0 ? (atual / anterior - 1) * 100 : null;
}

export function resumirVendas(pedidos: PedidoDashboard[]) {
  const validos = pedidos.filter((pedido) => pedido.status !== "cancelado");
  const total = validos.reduce((soma, pedido) => soma + Math.round(pedido.total * 100), 0) / 100;
  return {
    validos,
    total,
    quantidade: validos.length,
    ticket: validos.length ? total / validos.length : null,
  };
}

export function serieVendas(
  faixa: FaixaDashboard,
  atual: PedidoDashboard[],
  anterior: PedidoDashboard[],
) {
  const passo = faixa.dias === 1 ? HORA : DIA;
  const faixaBase = faixaAnterior(faixa);
  const data = Array.from({ length: faixa.dias === 1 ? 24 : faixa.dias }, (_, index) => ({
    rotulo:
      faixa.dias === 1
        ? String(index).padStart(2, "0") + "h"
        : deslocarDia(faixa.inicio, index).slice(5).split("-").reverse().join("/"),
    atual: 0,
    anterior: 0,
    pedidos: [] as PedidoDashboard[],
  }));
  for (const pedido of atual) {
    const ponto = data[Math.floor((Date.parse(pedido.created_at) - Date.parse(faixa.ini)) / passo)];
    if (!ponto) continue;
    ponto.atual += Math.round(pedido.total * 100);
    ponto.pedidos.push(pedido);
  }
  for (const pedido of anterior) {
    const ponto =
      data[Math.floor((Date.parse(pedido.created_at) - Date.parse(faixaBase.ini)) / passo)];
    if (ponto) ponto.anterior += Math.round(pedido.total * 100);
  }
  return data.map((ponto) => ({
    ...ponto,
    atual: ponto.atual / 100,
    anterior: ponto.anterior / 100,
  }));
}

export function margemDashboard(pedidos: PedidoDashboard[], custos: Map<string, number>) {
  let receita = 0,
    custo = 0,
    cobertos = 0;
  for (const pedido of pedidos) {
    if (!pedido.pedido_itens.length) continue;
    let custoPedido = 0;
    let temCusto = true;
    for (const item of pedido.pedido_itens) {
      const valor = item.produto_id ? custos.get(item.produto_id) : undefined;
      if (valor === undefined || !Number.isFinite(valor) || valor <= 0 || item.quantidade <= 0) {
        temCusto = false;
        break;
      }
      custoPedido += valor * item.quantidade;
    }
    if (!temCusto) continue;
    cobertos++;
    custo += custoPedido;
    receita += Math.max(0, pedido.subtotal - pedido.desconto);
  }
  return {
    cobertos,
    total: pedidos.length,
    parcial: cobertos !== pedidos.length,
    valor: receita > 0 ? ((receita - custo) / receita) * 100 : null,
    contribuicao: cobertos ? receita - custo : null,
  };
}

export function mediaMinutos(pares: [string | null, string | null][]) {
  const duracoes = pares.flatMap(([inicio, fim]) => {
    if (!inicio || !fim) return [];
    const tempo = Date.parse(fim) - Date.parse(inicio);
    return Number.isFinite(tempo) && tempo >= 0 ? [tempo / 60_000] : [];
  });
  return duracoes.length
    ? duracoes.reduce((soma, tempo) => soma + tempo, 0) / duracoes.length
    : null;
}

/** Carga da fila. Os ciclos de uma fritadeira são individuais por pedido. */
export function cargaCozinha(pedidos: PedidoDashboard[]) {
  let fritos = 0,
    pasteis = 0,
    assados = 0,
    ciclosFritos = 0,
    ciclosPasteis = 0,
    remessas = 0;
  let incompleta = false;
  for (const pedido of pedidos) {
    let f = 0,
      p = 0,
      a = 0;
    if (!pedido.pedido_itens.length) incompleta = true;
    for (const item of pedido.pedido_itens) {
      switch (classificarProcesso(item)) {
        case "fritura":
          f += item.quantidade;
          break;
        case "pastel":
          p += item.quantidade;
          break;
        case "assado":
          a += item.quantidade;
          break;
        case "desconhecido":
          incompleta = true;
          break;
      }
    }
    fritos += f;
    pasteis += p;
    assados += a;
    ciclosFritos += Math.ceil(f / 50);
    ciclosPasteis += Math.ceil(p / 50);
    remessas += Math.ceil((f + p + a) / 50);
  }
  const fritadeiras = fritadeirasParaProducao(fritos + pasteis);
  const minutos = Math.ceil(
    Math.max(
      fritadeiras ? (ciclosFritos * 3.5 + ciclosPasteis * 2) / fritadeiras : 0,
      Math.ceil(assados / 800) * 10,
    ) +
      (ciclosFritos + ciclosPasteis ? 1 : 0) +
      remessas * 0.5,
  );
  return { fritadeiras, minutos, incompleta, fritos, pasteis, assados, remessas };
}

export function resumirClientes(
  clientes: {
    primeiro_pedido: string | null;
    dias_sem_comprar: number | null;
    datas: string[];
    opt_out: boolean;
    segmento: string;
  }[],
  faixa: FaixaDashboard,
) {
  const compras = clientes.filter((cliente) => cliente.datas.some((data) => contem(faixa, data)));
  return {
    novos: clientes.filter((cliente) => contem(faixa, cliente.primeiro_pedido)).length,
    ativos: clientes.filter((cliente) => cliente.segmento === "ativo").length,
    inativos: clientes.filter((cliente) => ["inativo", "muito_inativo"].includes(cliente.segmento))
      .length,
    recompra: compras.length
      ? (compras.filter(
          (cliente) =>
            (cliente.primeiro_pedido &&
              Date.parse(cliente.primeiro_pedido) < Date.parse(faixa.ini)) ||
            cliente.datas.filter((data) => contem(faixa, data)).length >= 2,
        ).length /
          compras.length) *
        100
      : null,
    reativar: [30, 60, 90].map(
      (dias) =>
        clientes.filter(
          (cliente) =>
            !cliente.opt_out &&
            cliente.dias_sem_comprar !== null &&
            cliente.dias_sem_comprar >= dias &&
            (dias === 90 || cliente.dias_sem_comprar < dias + 30),
        ).length,
    ),
  };
}
