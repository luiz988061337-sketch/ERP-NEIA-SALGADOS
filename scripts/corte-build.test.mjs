// BUILD DE CORTE — testes LOCAIS (sem banco, sem rede).
//
// Valida o que o build de corte muda de verdade:
//   1. `BUILD_DE_CORTE` fica `true` com as flags de corte ligadas;
//   2. a attestation da criação atômica fica COMPLETA (verdadeira, porque o
//      fallback é removido do bundle pelo mesmo interruptor);
//   3. o gate de criação passa a "habilitado" (não "preparado");
//   4. o gate de cancelamento (0093/0090) também fica "habilitado";
//   5. a retirada de reserva (0091) mantém a sua attestation;
//   6. o código-fonte dos chamadores mantém o caminho legado ATRÁS de
//      `!BUILD_DE_CORTE` (portanto morre no bundle de corte);
//   7. num build comum (flags desligadas) o gate NÃO habilita nada.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

import { prepararEnv } from "./env-teste.mjs";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

// --- Build de CORTE: flags ligadas ------------------------------------------
prepararEnv({
  VITE_FF_CRIACAO_ATOMICA: "on",
  VITE_FF_CONSUMO_RESERVA: "on",
  VITE_FF_CANCELAMENTO_ATOMICO: "on",
  VITE_FF_RESERVA_ATOMICA: "off",
  VITE_BUILD_VERSION: "1792428503046",
  VITE_VERSAO_MINIMA: "1792428503046",
  VITE_BUILD_LABEL: "cutover-teste",
});

const C = await import("@/lib/corte.ts");
const CA = await import("@/lib/criacao-atomica.ts");
const RI = await import("@/lib/reserva-integracao.ts");
const V = await import("@/lib/versao-app.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

// ---------------------------------------------------------------------------
// 1. Marcadores do bundle de corte
// ---------------------------------------------------------------------------
ok(C.BUILD_DE_CORTE === true, "corte: BUILD_DE_CORTE ligado");
ok(C.BUILD_DE_CORTE_CONSUMO === true, "corte: consumo ligado");
ok(C.BUILD_DE_CORTE_CANCELAMENTO === true, "corte: cancelamento ligado");
ok(C.BUILD_DE_CORTE_RESERVA === false, "corte: reserva (0089) OFF por arquitetura");

// ---------------------------------------------------------------------------
// 2. Attestation da criação atômica (0095)
// ---------------------------------------------------------------------------
ok(
  CA.ATTESTACAO_CRIACAO.criar_pedido_com_reserva_0095 === true,
  "corte: attestation 0095 verdadeira",
);
ok(CA.ATTESTACAO_CRIACAO.reservar_pedido_0089 === true, "corte: attestation 0089 verdadeira");
ok(CA.ATTESTACAO_CRIACAO.proveniencia_0092 === true, "corte: attestation 0092 verdadeira");
ok(
  CA.ATTESTACAO_CRIACAO.fallback_checkout_removido === true,
  "corte: attestation fallback removido verdadeira",
);

// O gate HABILITA (não fica "preparado").
{
  const g = CA.avaliarGateCriacao(true, CA.ATTESTACAO_CRIACAO);
  ok(g.ok && g.estado === "habilitado", "corte: gate de criação HABILITADO", JSON.stringify(g));
}

// ---------------------------------------------------------------------------
// 3. Attestation do cancelamento (0093/0090)
// ---------------------------------------------------------------------------
ok(RI.ATTESTACAO_CANCELAMENTO.cancelar_pedido_0093 === true, "corte: attestation 0093 verdadeira");
ok(RI.ATTESTACAO_CANCELAMENTO.liberar_pedido_0090 === true, "corte: attestation 0090 verdadeira");
ok(RI.ATTESTACAO_CANCELAMENTO.controlado_ativo === true, "corte: attestation controlado=true");
ok(
  RI.ATTESTACAO_CANCELAMENTO.cancelamentos_diretos_migrados === true,
  "corte: attestation cancelamentos diretos migrados",
);
{
  const g = RI.avaliarGate(true, "cancelamento", RI.ATTESTACAO_CANCELAMENTO);
  ok(g.ok && g.estado === "habilitado", "corte: gate de cancelamento HABILITADO", JSON.stringify(g));
}

// ---------------------------------------------------------------------------
// 4. Decisões atômicas com o gate habilitado
// ---------------------------------------------------------------------------
{
  const chamadas = [];
  const client = {
    async rpc(fn, args) {
      chamadas.push({ fn, args });
      return {
        data: {
          status: "criado",
          pedido_id: args.p_id,
          numero: 42,
          subtotal: 10,
          taxa_entrega: 0,
          desconto: 0,
          total: 10,
          pagamento_status: "pendente",
          pagamento_modalidade: "online",
          reserva: null,
        },
        error: null,
      };
    },
  };
  const d = await CA.decidirCriacaoAtomica(client, {
    pedidoId: "11111111-1111-4111-8111-111111111111",
    canal: "checkout",
    dados: { cliente_nome: "Teste", telefone: "11999998888" },
    itens: [{ produtoId: "44444444-4444-4444-8444-444444444444", quantidade: 1 }],
  });
  ok(d.modo === "atomico" && d.pedido?.numero === 42, "corte: decisão de criação = ATÔMICO", JSON.stringify(d));
  ok(chamadas.length === 1 && chamadas[0].fn === "criar_pedido_com_reserva", "corte: chama só a 0095");
}
{
  const chamadas = [];
  const client = {
    async rpc(fn, args) {
      chamadas.push({ fn, args });
      return {
        data: {
          status: "cancelado",
          pedido_id: args.p_pedido_id,
          liberacao: { status: "liberado", montagem: 0, reservas: 1, unidades: 5 },
        },
        error: null,
      };
    },
  };
  const d = await RI.decidirCancelamentoAtomico(
    client,
    "11111111-1111-4111-8111-111111111111",
    "teste",
  );
  ok(d.modo === "atomico", "corte: decisão de cancelamento = ATÔMICO", JSON.stringify(d));
  ok(chamadas.length === 1 && chamadas[0].fn === "cancelar_pedido_atomico", "corte: chama só a 0093");
}

// ---------------------------------------------------------------------------
// 5. Protocolo de versão no bundle de corte
// ---------------------------------------------------------------------------
ok(V.VERSAO_BUILD === "1792428503046", "corte: versão do bundle gravada", V.VERSAO_BUILD);
ok(V.VERSAO_MINIMA_BUILD === "1792428503046", "corte: mínima gravada no bundle");
{
  // Bundle velho (versão antiga) contra o servidor novo => bloqueado.
  const a = V.avaliarVersao("1700000000000", {
    ok: true,
    minimo: "1792428503046",
    atual: "1792428503046",
    rotulo: "cutover",
    corte: true,
  });
  ok(a.bloqueado, "corte: bundle VELHO se auto-bloqueia contra o servidor novo", JSON.stringify(a));
  // Bundle novo => liberado.
  const b = V.avaliarVersao("1792428503046", {
    ok: true,
    minimo: "1792428503046",
    atual: "1792428503046",
    rotulo: "cutover",
    corte: true,
  });
  ok(!b.bloqueado, "corte: bundle novo liberado");
}

// ---------------------------------------------------------------------------
// 6. O caminho legado está ATRÁS de `!BUILD_DE_CORTE` no fonte
// ---------------------------------------------------------------------------
{
  const alvos = [
    { f: "src/routes/checkout.tsx", needles: ["if (!BUILD_DE_CORTE && !atomico) {"] },
    { f: "src/routes/pdv.tsx", needles: ["if (!BUILD_DE_CORTE && !atomico) {"] },
    { f: "src/routes/atendente.tsx", needles: ["if (!BUILD_DE_CORTE && !atomico) {"] },
    { f: "src/routes/recorrentes.tsx", needles: ["if (!BUILD_DE_CORTE && !criadoAtomico) {"] },
    { f: "src/routes/pedido.$id.tsx", needles: ["if (!BUILD_DE_CORTE) {"] },
    { f: "src/routes/admin.tsx", needles: ["if (!BUILD_DE_CORTE && status === \"cancelado\") {"] },
  ];
  for (const a of alvos) {
    const src = readFileSync(path.resolve(a.f), "utf8");
    const achou = a.needles.every((n) => src.includes(n));
    ok(achou, `corte: legado protegido em ${a.f}`, achou ? "" : `esperado: ${a.needles.join(" | ")}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Num build COMUM (flags desligadas) o gate NÃO habilita nada
// ---------------------------------------------------------------------------
{
  // `DEPENDENCIAS_*_PADRAO` continua tudo `false` (doutrina C.3 preservada).
  ok(
    Object.values(CA.DEPENDENCIAS_CRIACAO_PADRAO).every((v) => v === false),
    "build comum: DEPENDENCIAS_CRIACAO_PADRAO tudo false",
  );
  ok(
    Object.values(RI.DEPENDENCIAS_PADRAO).every((v) => v === false),
    "build comum: DEPENDENCIAS_PADRAO tudo false",
  );
  const g = CA.avaliarGateCriacao(true, CA.DEPENDENCIAS_CRIACAO_PADRAO);
  ok(!g.ok && g.estado === "preparado", "build comum: gate fica PREPARADO (fail-closed)");
}

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) no bundle de corte.`);
  process.exit(1);
}
console.log("\nBundle de corte: todos os testes passaram.");
