// Testes da Central de Pedidos da Atendente — regras puras + mocks.
// Sem banco, sem rede, sem audio real.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

const {
  CONFIG_ALERTA_PADRAO,
  CHAVE_RECONHECIDOS,
  avisoDoPedido,
  avisosDaCozinha,
  colunasCentral,
  filtrarPedidos,
  formatarMinutos,
  idPedidoDoAviso,
  lerConfig,
  metricasCentral,
  minutosDesde,
  normalizarConfig,
  ordenarPorPrioridade,
  pedidosNaoReconhecidos,
  pedidosNovos,
} = await import("@/lib/central-pedidos.ts");
const { elegivelAceiteLocal } = await import("@/lib/atendente-aceite.ts");
const { visaoAtendente } = await import("@/lib/sincronizacao-paineis.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const AGORA = new Date("2026-11-12T19:00:00.000Z").getTime();
const pedido = (over = {}) => ({
  id: "p1",
  numero: 4598,
  cliente_nome: "Ana Costa",
  status: "recebido",
  tipo_entrega: "entrega",
  total: 280,
  created_at: "2026-11-12T18:54:00.000Z",
  aceito_em_atendente: null,
  liberado_em: null,
  conferido_em: null,
  retirado_em: null,
  pagamento_status: "pendente",
  forma_pagamento: "pix",
  pedido_itens: [{ nome: "Coxinha", quantidade: 100 }],
  ...over,
});

// ---------------------------------------------------------------------
// 1) Mapeamento das três colunas (estados reais)
// ---------------------------------------------------------------------
{
  const lista = [
    pedido({ id: "a", status: "recebido", aceito_em_atendente: null }),
    pedido({ id: "b", status: "recebido", aceito_em_atendente: "2026-11-12T18:50:00.000Z" }),
    pedido({ id: "c", status: "em_producao" }),
    pedido({ id: "d", status: "pronto", tipo_entrega: "entrega" }),
    pedido({ id: "e", status: "pronto", tipo_entrega: "retirada" }),
    pedido({ id: "f", status: "em_rota" }),
    pedido({ id: "g", status: "entregue" }),
  ];
  const c = colunasCentral(lista);
  ok(c.analise.length === 1 && c.analise[0].id === "a", "Em analise: so pedidos recebidos sem aceite");
  ok(c.producao.length === 2, "Em producao: aceitos + em preparo", String(c.producao.length));
  ok(c.pronto.length === 2, "Pronto para entrega: prontos (entrega e retirada)", String(c.pronto.length));
  ok(
    !c.analise.some((p) => p.id === "b") && !c.producao.some((p) => p.id === "f"),
    "estados fora do fluxo (em_rota/entregue) nao entram nas colunas",
  );
  // A mesma visao canonica do projeto (lib/sincronizacao-paineis.ts).
  ok(
    visaoAtendente({
      id: "a",
      status: "recebido",
      tipo_entrega: "entrega",
      motoboy_id: null,
      aceito_em_atendente: null,
      liberado_em: null,
      conferido_em: null,
      retirado_em: null,
      agendado_para: null,
      atrasado: false,
    }) === "novos",
    "visao canonica do projeto concorda (pedido novo)",
  );
}

// ---------------------------------------------------------------------
// 2) Busca e filtros
// ---------------------------------------------------------------------
{
  const lista = [
    pedido({ id: "a", numero: 4598, cliente_nome: "Ana Costa", tipo_entrega: "entrega" }),
    pedido({ id: "b", numero: 4599, cliente_nome: "Carlos Santos", tipo_entrega: "retirada" }),
    pedido({ id: "c", numero: 4600, cliente_nome: "Mariana Lima", tipo_entrega: "entrega", agendado_para: "2026-11-12T20:00:00.000Z" }),
  ];
  ok(filtrarPedidos(lista, { busca: "4599" }).length === 1, "busca por numero do pedido");
  ok(filtrarPedidos(lista, { busca: "carlos" }).length === 1, "busca por cliente");
  ok(filtrarPedidos(lista, { modalidade: "retirada" }).length === 1, "filtro de modalidade");
  ok(filtrarPedidos(lista, { agendados: true }).length === 1, "filtro de agendados");
  ok(filtrarPedidos(lista, { busca: "zzz" }).length === 0, "busca sem resultado");
}

// ---------------------------------------------------------------------
// 3) Prioridade e contadores
// ---------------------------------------------------------------------
{
  const atrasado = pedido({ id: "a", created_at: "2026-11-12T17:00:00.000Z" });
  const agendado = pedido({ id: "b", created_at: "2026-11-12T18:50:00.000Z", agendado_para: "2026-11-12T20:00:00.000Z" });
  const novo = pedido({ id: "c", created_at: "2026-11-12T18:58:00.000Z" });
  const ordem = ordenarPorPrioridade([novo, agendado, atrasado], AGORA).map((p) => p.id);
  ok(ordem[0] === "a", "atrasado vem primeiro", ordem.join(">"));
  ok(ordem[1] === "b", "agendado em seguida", ordem.join(">"));
  const m = metricasCentral([
    pedido({ id: "a", status: "recebido", total: 100 }),
    pedido({ id: "b", status: "em_producao", total: 200 }),
    pedido({ id: "c", status: "pronto", total: 300 }),
  ]);
  ok(m.novos === 1 && m.emProducao === 1 && m.prontos === 1, "contadores por coluna");
  ok(m.ticketMedio === 200, "ticket medio real", String(m.ticketMedio));
  ok(minutosDesde("2026-11-12T18:30:00.000Z", AGORA) === 30, "minutos aguardando");
  ok(formatarMinutos(65) === "1h 05", "formatacao de tempo");
}

// ---------------------------------------------------------------------
// 4) Alerta sonoro: novo pedido, repeticao e reconhecimento individual
// ---------------------------------------------------------------------
{
  const lista = [pedido({ id: "a" }), pedido({ id: "b" })];
  ok(pedidosNovos(lista, new Set(["a"])).length === 1, "detecta pedido novo pelo ID real");
  ok(pedidosNovos(lista, new Set(["a", "b"])).length === 0, "nao trata atualizacao como pedido novo");
  ok(
    pedidosNaoReconhecidos(lista, new Set(["a"])).length === 1,
    "reconhecimento e individual (so o pedido reconhecido para de pedir som)",
  );
  ok(
    pedidosNaoReconhecidos(lista, new Set()).length === 2,
    "pedidos nao reconhecidos seguem pedindo alerta",
  );
  // Configuracao aprovada: ativo, 75%, 30s.
  ok(CONFIG_ALERTA_PADRAO.ativo === true, "alerta ativado por padrao");
  ok(CONFIG_ALERTA_PADRAO.volume === 0.75, "volume padrao 75%");
  ok(CONFIG_ALERTA_PADRAO.intervaloSegundos === 30, "repeticao padrao a cada 30s");
  const c = normalizarConfig({ ativo: false, volume: 5, intervaloSegundos: 1 });
  ok(c.volume === 0.75, "volume fora de faixa volta ao padrao");
  ok(c.intervaloSegundos === 30, "intervalo fora de faixa volta ao padrao");
  ok(c.ativo === false, "desativar o som e permitido");
}

// ---------------------------------------------------------------------
// 5) Notificacoes da cozinha (tabela real `notificacoes`)
// ---------------------------------------------------------------------
{
  const avisos = [
    {
      id: "n1",
      tipo: "pedido_pronto_caixa",
      titulo: "Pedido #4586 pronto para entrega",
      detalhe: "Cliente: Pedro Lima",
      link: "/central-entregas?pedido=77777777-7777-4777-8777-777777777777",
      lida: false,
      created_at: "2026-11-12T18:40:00.000Z",
    },
    {
      id: "n2",
      tipo: "pedido_liberado_retirada",
      titulo: "Pedido #4587 liberado para retirada",
      detalhe: "Cliente: Luciana Melo",
      link: "/central-entregas?pedido=88888888-8888-4888-8888-888888888888",
      lida: false,
      created_at: "2026-11-12T18:35:00.000Z",
    },
    {
      id: "n3",
      tipo: "motoboy_retorno",
      titulo: "Motoboy retornando a base",
      detalhe: "irrelevante para a Central",
      link: "/admin",
      lida: false,
      created_at: "2026-11-12T18:30:00.000Z",
    },
  ];
  ok(avisosDaCozinha(avisos).length === 2, "filtra apenas os avisos da cozinha");
  ok(
    idPedidoDoAviso(avisos[0]) === "77777777-7777-4777-8777-777777777777",
    "extrai o id real do pedido pelo link",
  );
  ok(
    avisoDoPedido(avisos, "88888888-8888-4888-8888-888888888888")?.tipo ===
      "pedido_liberado_retirada",
    "acha o aviso do pedido",
  );
  ok(avisoDoPedido(avisos, "inexistente") === null, "pedido sem aviso nao quebra");
  ok(
    idPedidoDoAviso({ ...avisos[2], link: "/admin" }) === null,
    "aviso sem pedido (link generico) nao quebra",
  );
}

// ---------------------------------------------------------------------
// 6) Permissoes e pre-checks de aceite (regras existentes)
// ---------------------------------------------------------------------
{
  const r = elegivelAceiteLocal({
    status: "recebido",
    aceito_em_atendente: null,
    pagamento_status: "pago",
  });
  ok(r.elegivel, "pedido novo aceito pela atendente");
  const dup = elegivelAceiteLocal({
    status: "recebido",
    aceito_em_atendente: "2026-11-12T18:00:00.000Z",
    pagamento_status: "pago",
  });
  ok(!dup.elegivel, "aceite duplicado bloqueado");
  const fora = elegivelAceiteLocal({
    status: "em_producao",
    aceito_em_atendente: null,
    pagamento_status: "pago",
  });
  ok(!fora.elegivel, "fora de Novos nao aceita");
}

// ---------------------------------------------------------------------
// 7) Persistencia do reconhecimento (mecanismo disponivel)
// ---------------------------------------------------------------------
{
  const cfg = lerConfig(null);
  ok(cfg.ativo === true && cfg.volume === 0.75, "config persistida usa o padrao quando vazia");
  ok(typeof CHAVE_RECONHECIDOS === "string" && CHAVE_RECONHECIDOS.length > 0, "chave de reconhecimento existe");
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas > 0 ? 1 : 0);
