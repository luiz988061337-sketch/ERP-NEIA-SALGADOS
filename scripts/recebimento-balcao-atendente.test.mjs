// Recebimento no balcão pela atendente autorizada — regras puras + barreiras
// estáticas das migrations. Sem banco, sem rede, sem credenciais.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { test } from "node:test";
register("./alias-loader.mjs", import.meta.url);

const {
  centavosInformados,
  confirmarValorRecebido,
  validarRecebimentoBalcao,
  ehFormaEfetiva,
  FORMAS_EFETIVAS,
} = await import("@/lib/recebimento-retirada");
const { podeEditarPedido } = await import("@/lib/pedido-status");
const {
  resumirRecebimentosPedido,
  rotuloFormaEfetiva,
  rotuloTrocoLedger,
  linhasRecebimentosParaCSV,
  TROCO_NAO_REGISTRADO,
} = await import("@/lib/pedido-pagamento-ledger");
const { montarFluxoCaixaMensal } = await import("@/lib/financeiro.ts");
const { PAGAMENTO_LABEL } = await import("@/lib/format");
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");

const sql0139 = ler("../drizzle/migrations/0139_recebimento_balcao_atendente.sql");
const sql0140 = ler("../drizzle/migrations/0140_edicao_observacoes_auditada.sql");
const sql0141 = ler("../drizzle/migrations/0141_guard_recebimento_com_capacidade.sql");
const sql0142 = ler("../drizzle/migrations/0142_forma_efetiva_pagamentos.sql");
const reversao0142 = ler("../scripts/central-pg17/reverter-0142.sql");
const central = ler("../src/components/central-pedidos.tsx");
const h02 = ler("../src/components/admin/pedidos-h02.tsx");
const cssCentral = ler("../src/components/central-pedidos.css");
const nav = ler("../src/components/admin/admin-nav.ts");
const cssH02 = ler("../src/components/admin/pedidos-h02.css");

test("parcial, troco e Pix continuam calculados corretamente", () => {
  assert.equal(centavosInformados("12,34"), 1234);
  assert.equal(centavosInformados("12,345"), null);
  assert.equal(confirmarValorRecebido(1500, null, 2000, true), null);
  assert.deepEqual(confirmarValorRecebido(1500, 2000, 2000, true), { valor: 1500, troco: 500 });
  assert.deepEqual(confirmarValorRecebido(2000, null, 2000, false), { valor: 2000, troco: 0 });
  assert.deepEqual(confirmarValorRecebido(1234, null, 5000, false), { valor: 1234, troco: 0 });
});

test("consulta aceita produção e retirada sem conferência e usa capacidade como autoridade", () => {
  assert.match(sql0139, /status IN \('recebido', 'em_producao', 'pronto', 'aguardando_motoboy'\)/);
  assert.doesNotMatch(sql0139, /AND\s+conferido_em IS NOT NULL/);
  assert.match(sql0139, /'pode_receber',\s*neia_operacao\.tem_capacidade\(ator, 'receber_pagamento'\)/);
  assert.doesNotMatch(sql0139, /'pode_receber',\s*public\.has_role\(ator,\s*'admin'\)/);
  assert.match(sql0139, /public\.has_role\(ator, 'admin'\) OR public\.has_role\(ator, 'atendente'\)/);
});

test("registro preserva ledger, idempotência, travamento e autorização por capacidade", () => {
  assert.match(sql0139, /IF NOT neia_operacao\.tem_capacidade\(auth\.uid\(\),'receber_pagamento'\) THEN/);
  assert.match(sql0139, /public\.has_role\(auth\.uid\(\), 'atendente'\)/);
  assert.doesNotMatch(sql0139, /has_role\(auth\.uid\(\), 'atendente'\) AND neia_operacao\.tem_capacidade/);
  assert.match(sql0139, /pg_advisory_xact_lock/);
  assert.match(sql0139, /chave_idempotencia/);
  assert.match(sql0139, /pedido_pagamento_eventos/);
  assert.match(sql0139, /'chave_idempotencia_conflitante'/);
  assert.match(sql0139, /'valor_superior_ao_saldo'/);
  assert.doesNotMatch(sql0139, /CREATE (?:OR REPLACE )?FUNCTION public\.exigir_quitacao_para_retirada/);
});

test("edição permitida é somente observações, com motivo e auditoria", () => {
  assert.match(sql0140, /campo text NOT NULL CHECK \(campo = 'observacoes'\)/);
  assert.match(sql0140, /length\(btrim\(p_motivo\)\) < 3/);
  assert.match(sql0140, /THEN '' ELSE p_observacoes END/);
  assert.match(sql0140, /UPDATE public\.pedidos SET observacoes = v_novo WHERE id = p_pedido_id/);
  assert.match(sql0140, /INSERT INTO public\.pedido_edicoes_auditoria/);
  assert.doesNotMatch(sql0140, /UPDATE public\.pedidos SET[\s\S]{0,120}(?:total|status|user_id|forma_pagamento)\s*=/);
});

test("reversão restaura exatamente a 0106 de homologação, sem ampliar papéis", () => {
  const reversao = ler("../scripts/central-pg17/reverter-0139-0141.sql");
  assert.match(
    reversao,
    /IF NOT neia_operacao\.tem_capacidade\(auth\.uid\(\),'receber_pagamento'\) THEN RETURN jsonb_build_object\('status','nao_autorizado'\); END IF;/,
  );
  assert.match(
    reversao,
    /public\.has_role\(auth\.uid\(\), 'admin'\) OR public\.has_role\(auth\.uid\(\), 'financeiro'\)/,
  );
  assert.doesNotMatch(reversao, /has_role\(auth\.uid\(\), 'atendente'\)/);
});

test("guard financeiro libera só o fechamento com ledger íntegro", () => {
  assert.match(sql0141, /neia_operacao\.tem_capacidade\(v_uid, 'receber_pagamento'\)/);
  assert.match(sql0141, /IF v_total <= 0 OR v_pago <> v_total THEN/);
  assert.match(sql0141, /pagamento_sem_ledger_integro/);
  assert.match(sql0141, /NEW\.total IS DISTINCT FROM OLD\.total/);
  assert.match(sql0141, /NEW\.user_id IS DISTINCT FROM OLD\.user_id/);
});

test("Central separa recebimento de retirada e inclui Pix", () => {
  assert.match(central, /function abrirRecebimento\(/);
  assert.match(central, /async function confirmarRecebimento\(/);
  assert.match(central, /Registrar recebimento/);
  assert.match(central, /Confirmar retirada do pedido/);
  assert.match(central, /FORMAS_EFETIVAS\.map/);
  assert.match(central, /capacidade financeira <strong>receber_pagamento<\/strong>/);
  assert.match(central, /onRecebimento=/);
});

test("menu directo e botões preservam a identidade aprovada", () => {
  assert.match(nav, /CENTRAL_ATENDENTE_NAV_ITEM/);
  assert.match(nav, /item\.value === "pdv" && centralAtendente/);
  assert.match(nav, /hash: "central-atendente"/);
  assert.match(cssCentral, /\.ca-contorno-dourado/);
  assert.match(cssCentral, /--ca-amarelo: #ffd252/);
  assert.match(cssH02, /\.h02-botao\.h02-contorno-dourado/);
  assert.match(cssH02, /#ffd252/);
});

test("Fase 1: quatro formas efetivas, confirmação e troco sem virar receita", () => {
  assert.deepEqual([...FORMAS_EFETIVAS], ["dinheiro", "pix", "credito", "debito"]);
  assert.equal(ehFormaEfetiva("pix"), true);
  assert.equal(ehFormaEfetiva("boleto"), false);

  const invalido = validarRecebimentoBalcao({
    valor: 1000, entregue: 1000, saldo: 2000, forma: "pix", confirmado: false,
  });
  assert.equal(invalido, null, "Pix sem confirmação efetiva não é recebido");
  assert.equal(validarRecebimentoBalcao({
    valor: 1000, entregue: null, saldo: 2000, forma: "boleto", confirmado: true,
  }), null);
  assert.equal(validarRecebimentoBalcao({
    valor: 3000, entregue: 3000, saldo: 2000, forma: "dinheiro", confirmado: true,
  }), null, "valor acima do saldo é recusado");
  assert.deepEqual(validarRecebimentoBalcao({
    valor: 1000, entregue: 1500, saldo: 2000, forma: "dinheiro", confirmado: false,
  }), { valor: 1000, troco: 500, forma: "dinheiro", valorEntregue: 1500, confirmado: true });
  assert.deepEqual(validarRecebimentoBalcao({
    valor: 2000, entregue: null, saldo: 2000, forma: "debito", confirmado: true,
  }), { valor: 2000, troco: 0, forma: "debito", valorEntregue: null, confirmado: true });
});

test("Fase 1: ledger é a fonte única e não inventa troco nem forma ausente", () => {
  const eventos = [
    {
      id: "e1", pedido_id: "p1", tipo: "pagamento", valor_centavos: 5000,
      forma_pagamento: "pix", forma_pagamento_efetiva: "dinheiro",
      valor_entregue_centavos: 5500, troco_centavos: 500, chave_idempotencia: "a",
      motivo: null, actor: null, created_at: "2026-11-27T12:00:00Z",
    },
    {
      id: "e2", pedido_id: "p1", tipo: "pagamento", valor_centavos: 3000,
      forma_pagamento: "pix", chave_idempotencia: "b", motivo: null, actor: null,
      created_at: "2026-11-27T12:10:00Z",
    },
  ];
  const resumo = resumirRecebimentosPedido("p1", eventos, 10000);
  assert.equal(resumo.pagoCentavos, 8000, "troco não entra como receita");
  assert.equal(resumo.saldoCentavos, 2000);
  assert.equal(resumo.quitado, false);
  assert.equal(resumo.trocoRegistradoCentavos, 500);
  assert.equal(rotuloFormaEfetiva(eventos[1]), "Não registrada neste lançamento");
  assert.equal(rotuloTrocoLedger(eventos[1]), TROCO_NAO_REGISTRADO);
  const linhas = linhasRecebimentosParaCSV(resumo, 321, "pix");
  assert.equal(linhas.length, 2, "um evento = uma linha, sem duplicidade");
  assert.equal(linhas[0].forma_original, PAGAMENTO_LABEL.pix);
  assert.equal(linhas[0].forma_efetiva, "Dinheiro");
  assert.equal(linhas[0].troco_centavos, 500);
  assert.equal(linhas[1].troco_centavos, "");
});

test("Fase 1: Financeiro Premium usa a forma efetiva e preserva o fallback legado", () => {
  const base = {
    competencias: ["2026-11"],
    eventos: [],
    contas: [],
    pedidosPagos: [],
  };
  const [comEfetiva] = montarFluxoCaixaMensal({
    ...base,
    eventosPedidos: [{
      pedido_id: "p1", tipo: "pagamento", valor_centavos: 7998,
      forma_pagamento: "credito", forma_pagamento_efetiva: "dinheiro",
      troco_centavos: 2, created_at: "2026-11-27T12:00:00Z",
    }],
  });
  assert.equal(comEfetiva.porMeioCentavos.dinheiro, 7998);
  assert.equal(comEfetiva.porMeioCentavos.credito, undefined);
  assert.equal(comEfetiva.entradasOperacionaisCentavos, 7998, "troco não é receita");

  const [somentePix] = montarFluxoCaixaMensal({
    ...base,
    meiosIncluidos: ["pix"],
    eventosPedidos: [{
      pedido_id: "p2", tipo: "pagamento", valor_centavos: 1000,
      forma_pagamento: "credito", created_at: "2026-11-27T13:00:00Z",
    }],
  });
  assert.equal(somentePix.entradasOperacionaisCentavos, 0, "forma original não é confundida com efetiva");

  const [legado] = montarFluxoCaixaMensal({
    ...base,
    eventosPedidos: [{
      pedido_id: "p3", tipo: "pagamento", valor_centavos: 1000,
      forma_pagamento: "pix", created_at: "2026-11-27T14:00:00Z",
    }],
  });
  assert.equal(legado.porMeioCentavos.pix, 1000, "evento sem forma efetiva mantém o fallback");
});

test("Fase 1: edição por estágio aplica a mesma regra na interface", () => {
  assert.equal(podeEditarPedido("cancelado", null, ["admin"]), false);
  assert.equal(podeEditarPedido("entregue", null, ["admin"]), false);
  assert.equal(podeEditarPedido("em_rota", null, ["admin"]), false);
  assert.equal(podeEditarPedido("pronto", null, ["atendente"]), false);
  assert.equal(podeEditarPedido("pronto", null, ["admin"]), true);
  assert.equal(podeEditarPedido("em_producao", null, ["atendente"]), true);
  assert.equal(podeEditarPedido("em_producao", "2026-11-27T12:00:00Z", ["admin"]), false);
  assert.equal(podeEditarPedido("estado_desconhecido", null, ["admin"]), false);
  assert.match(sql0142, /v_status IN \('cancelado', 'entregue', 'retirado', 'em_rota'\)/);
  assert.match(sql0142, /'pedido_nao_editavel'/);
});

test("Fase 1: migration 0142 não cria sobrecarga nem caminho paralelo de gravação", () => {
  assert.match(sql0142, /ADD COLUMN IF NOT EXISTS forma_pagamento_efetiva text/);
  assert.match(sql0142, /ADD COLUMN IF NOT EXISTS valor_entregue_centavos bigint/);
  assert.match(sql0142, /ADD COLUMN IF NOT EXISTS troco_centavos bigint/);
  assert.match(sql0142, /troco_centavos = valor_entregue_centavos - valor_centavos/);
  assert.match(sql0142, /CREATE OR REPLACE FUNCTION public\.registrar_pagamento_pedido_efetivo\(/);
  assert.doesNotMatch(sql0142, /registrar_pagamento_pedido\(uuid, bigint, text, text, bigint, boolean\)/);
  const antiga = sql0142.match(
    /CREATE OR REPLACE FUNCTION public\.registrar_pagamento_pedido\(\s*p_pedido_id uuid, p_valor_centavos bigint, p_chave_idempotencia text[\s\S]*?\n\$\$;/,
  );
  assert.ok(antiga, "assinatura antiga preservada");
  assert.doesNotMatch(antiga[0], /INSERT INTO public\.pedido_pagamento_eventos/);
  assert.match(antiga[0], /'dados_invalidos'/);
  assert.match(sql0142, /confirmacao_efetiva_requerida/);
  assert.match(sql0142, /pg_advisory_xact_lock/);
  assert.match(sql0142, /IF NOT neia_operacao\.tem_capacidade\(auth\.uid\(\),'receber_pagamento'\) THEN/);
  assert.match(sql0142, /public\.has_role\(auth\.uid\(\), 'atendente'\)/);
  assert.match(sql0142, /CREATE OR REPLACE FUNCTION\s+public\.verificar_recebimento_por_chave\(/);
  assert.match(reversao0142, /DROP FUNCTION IF EXISTS public\.registrar_pagamento_pedido_efetivo/);
  assert.match(reversao0142, /CREATE OR REPLACE FUNCTION public\.registrar_pagamento_pedido\(/);
});

test("Fase 1: Central usa Pix da loja, confirmação efetiva e verificação por chave", () => {
  assert.match(central, /rpc\("registrar_pagamento_pedido_efetivo"/);
  assert.match(central, /rpc\("verificar_recebimento_por_chave"/);
  assert.match(central, /p_forma_efetiva: tentativa\.forma/);
  assert.match(central, /p_valor_entregue_centavos: tentativa\.entregue/);
  assert.match(central, /p_confirmado: tentativa\.confirmado/);
  assert.match(central, /useLojaConfig\(\)/);
  assert.match(central, /loja\?\.pix_chave/);
  assert.doesNotMatch(central, /PIX_CHAVE/);
  assert.match(central, /nenhuma nova\s+cobrança será criada automaticamente/);
  assert.match(central, /Nenhum recebimento foi confirmado para esta chave/);
  assert.match(central, /FORMAS_EFETIVAS\.map/);
  assert.match(h02, /Exportar recebimentos do ledger/);
  assert.match(h02, /preferencia_pagamento: pedido\.forma_pagamento/);
  assert.doesNotMatch(h02, /\bpagamento: pedido\.forma_pagamento/);
});
