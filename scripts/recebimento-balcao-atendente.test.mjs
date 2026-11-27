// Recebimento no balcão pela atendente autorizada — regras puras + barreiras
// estáticas das migrations. Sem banco, sem rede, sem credenciais.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { test } from "node:test";
register("./alias-loader.mjs", import.meta.url);

const { centavosInformados, confirmarValorRecebido } = await import("@/lib/recebimento-retirada");
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");

const sql0139 = ler("../drizzle/migrations/0139_recebimento_balcao_atendente.sql");
const sql0140 = ler("../drizzle/migrations/0140_edicao_observacoes_auditada.sql");
const sql0141 = ler("../drizzle/migrations/0141_guard_recebimento_com_capacidade.sql");
const central = ler("../src/components/central-pedidos.tsx");
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
  assert.match(central, /\["dinheiro", "credito", "debito", "pix"\]/);
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
