// Teste puro das regras de liberacao da Producao (sem banco, sem rede).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

const {
  avisoInterno,
  chaveAviso,
  elegivelAvisoCaixa,
  elegivelLiberacaoRetirada,
  linkAviso,
  TIPO_AVISO_CAIXA,
  TIPO_AVISO_RETIRADA,
} = await import("@/lib/producao-liberacao.ts");
const { statusFlow, statusLabel, STATUS_FLOW_RETIRADA } = await import("@/lib/format.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const AGORA = "2026-11-12T19:00:00.000Z";
const base = {
  id: "ped-1",
  numero: 4589,
  cliente_nome: "Marina Alves",
  observacoes: "Sem cebola.",
  status: "pronto",
  conferido_em: AGORA,
  retirado_em: null,
  motoboy_id: null,
};

// ---------------------------------------------------------------------
// 1) Entrega pronta e conferida -> Avisar caixa liberado
// ---------------------------------------------------------------------
{
  const entrega = { ...base, tipo_entrega: "entrega" };
  const r = elegivelAvisoCaixa(entrega);
  ok(r.elegivel, "entrega pronta+conferida: avisar caixa liberado", r.motivo);
  const aviso = avisoInterno(entrega, "caixa");
  ok(aviso.tipo === TIPO_AVISO_CAIXA, "aviso de caixa usa o tipo interno da caixa");
  ok(aviso.titulo.includes("#4589"), "aviso de caixa cita o numero do pedido");
  ok(aviso.detalhe.includes("entrega"), "aviso de caixa informa a modalidade");
  ok(aviso.detalhe.includes("Sem cebola."), "aviso de caixa leva a observacao");
  ok(aviso.link === linkAviso(entrega.id), "aviso de caixa usa o link interno do pedido");
  ok(aviso.lida === false, "aviso de caixa nasce nao lido");
}

// ---------------------------------------------------------------------
// 2) Retirada pronta e conferida -> Liberar retirada liberado
// ---------------------------------------------------------------------
{
  const retirada = { ...base, tipo_entrega: "retirada" };
  const r = elegivelLiberacaoRetirada(retirada);
  ok(r.elegivel, "retirada pronta+conferida: liberar retirada liberado", r.motivo);
  const aviso = avisoInterno(retirada, "retirada");
  ok(aviso.tipo === TIPO_AVISO_RETIRADA, "aviso de retirada usa o tipo interno da retirada");
  ok(aviso.titulo.includes("liberado para retirada"), "aviso de retirada descreve a liberacao");
  ok(aviso.detalhe.includes("balcão"), "aviso de retirada informa o balcao");
}

// ---------------------------------------------------------------------
// 3) Conferencia pendente -> bloqueio da liberacao
// ---------------------------------------------------------------------
{
  const semConferencia = { ...base, conferido_em: null, tipo_entrega: "entrega" };
  const rCaixa = elegivelAvisoCaixa(semConferencia);
  ok(!rCaixa.elegivel && rCaixa.motivo === "conferencia pendente", "entrega sem conferencia bloqueia o aviso de caixa", rCaixa.motivo);
  const rRetirada = elegivelLiberacaoRetirada({ ...semConferencia, tipo_entrega: "retirada" });
  ok(!rRetirada.elegivel && rRetirada.motivo === "conferencia pendente", "retirada sem conferencia bloqueia a liberacao", rRetirada.motivo);
}

// ---------------------------------------------------------------------
// 4) Clique repetido -> impede duplicidade
// ---------------------------------------------------------------------
{
  const dia = AGORA.slice(0, 10);
  const k1 = chaveAviso("ped-1", "caixa", dia);
  const k2 = chaveAviso("ped-1", "caixa", dia);
  const k3 = chaveAviso("ped-1", "retirada", dia);
  ok(k1 === k2, "mesma chave para o mesmo pedido/canal/dia (idempotente)");
  ok(k1 !== k3, "canais diferentes geram chaves diferentes");
  ok(k1 === "ped-1|pronto|caixa|" + dia, "chave no padrao do projeto (pedido|status|canal|dia)");

  const jaConfirmada = { ...base, tipo_entrega: "retirada", retirado_em: AGORA };
  const r = elegivelLiberacaoRetirada(jaConfirmada);
  ok(!r.elegivel && r.motivo === "retirada ja confirmada", "retirada ja confirmada bloqueia nova liberacao", r.motivo);
}

// ---------------------------------------------------------------------
// 5) Ausencia de efeitos indevidos
// ---------------------------------------------------------------------
{
  const retirada = { ...base, tipo_entrega: "retirada" };
  // Nenhum status novo: retirada nunca vira aguardando_motoboy.
  ok(
    !STATUS_FLOW_RETIRADA.includes("aguardando_motoboy"),
    "fluxo de retirada nunca passa por aguardando_motoboy",
  );
  ok(
    statusFlow("retirada").join(">") === "recebido>em_producao>pronto>entregue",
    "fluxo de retirada do projeto mantido",
    statusFlow("retirada").join(">"),
  );
  ok(statusLabel("pronto", "retirada") === "Pronto para retirada", "pronto na retirada continua 'Pronto para retirada'");

  // Aviso de caixa nao mexe no pedido.
  const antes = JSON.stringify(base);
  avisoInterno({ ...base, tipo_entrega: "entrega" }, "caixa");
  ok(JSON.stringify(base) === antes, "aviso de caixa nao altera o pedido (sem status/motoboy)");

  // Entrega nao entra na liberacao de retirada e vice-versa.
  ok(
    !elegivelLiberacaoRetirada({ ...base, tipo_entrega: "entrega" }).elegivel,
    "entrega nao usa a liberacao de retirada",
  );
  ok(
    !elegivelAvisoCaixa({ ...base, tipo_entrega: "retirada" }).elegivel,
    "retirada nao usa o aviso de caixa",
  );

  // Fora de "pronto" nao libera nada.
  ok(
    !elegivelAvisoCaixa({ ...base, tipo_entrega: "entrega", status: "em_producao" }).elegivel,
    "pedido em preparo nao avisa o caixa",
  );
  ok(
    !elegivelLiberacaoRetirada({ ...base, tipo_entrega: "retirada", status: "recebido" }).elegivel,
    "pedido novo nao libera retirada",
  );

  // Cancelado nunca libera.
  ok(
    !elegivelAvisoCaixa({ ...base, tipo_entrega: "entrega", status: "cancelado" }).elegivel,
    "pedido cancelado nao avisa o caixa",
  );
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas > 0 ? 1 : 0);
