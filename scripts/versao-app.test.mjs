// PROTOCOLO DE VERSÃO DO FRONTEND — testes LOCAIS (sem banco, sem rede).
// Cobre: comparação, fail-closed, auto-bloqueio de bundle velho e
// normalização da resposta do endpoint.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { prepararEnv } from "./env-teste.mjs";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
// Build comum: sem flags de versionamento (bundle "0" => fail-closed).
prepararEnv({});
const V = await import("@/lib/versao-app.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

// ---------------------------------------------------------------------------
// Comparação
// ---------------------------------------------------------------------------
ok(V.compararVersoes("100", "200") < 0, "compara: 100 < 200");
ok(V.compararVersoes("200", "100") > 0, "compara: 200 > 100");
ok(V.compararVersoes("200", "200") === 0, "compara: iguais");
ok(V.compararVersoes("20261019180000", "20261019175959") > 0, "compara: epoch-ms");
ok(V.compararVersoes("abc", "abd") < 0, "compara: lexicografico");
ok(V.compararVersoes("", "1") < 0, "compara: vazio e menor");

// ---------------------------------------------------------------------------
// Bundle atual >= minima => liberado
// ---------------------------------------------------------------------------
{
  const r = V.avaliarVersao("200", { ok: true, minimo: "200", atual: "200", rotulo: "x", corte: true });
  ok(!r.bloqueado && r.motivo === "ok", "bundle na minima => liberado", JSON.stringify(r));
}
{
  const r = V.avaliarVersao("300", { ok: true, minimo: "200", atual: "200", rotulo: "x", corte: true });
  ok(!r.bloqueado, "bundle mais novo que a minima => liberado");
}

// ---------------------------------------------------------------------------
// Bundle VELHO < minima => BLOQUEADO (o caso critico do corte)
// ---------------------------------------------------------------------------
{
  const r = V.avaliarVersao("100", { ok: true, minimo: "200", atual: "200", rotulo: "x", corte: true });
  ok(r.bloqueado && r.motivo === "versao_desatualizada", "bundle velho => bloqueado", JSON.stringify(r));
}
{
  // Bundle sem versao ("0") contra minima de corte => bloqueado.
  const r = V.avaliarVersao("0", { ok: true, minimo: "200", atual: "200", rotulo: "x", corte: true });
  ok(r.bloqueado, "bundle sem versao => bloqueado (fail-closed)");
}

// ---------------------------------------------------------------------------
// Endpoint indisponivel => fail-closed
// ---------------------------------------------------------------------------
{
  const r = V.avaliarVersao("100", null, "200");
  ok(r.bloqueado && r.motivo === "servidor_sem_resposta", "endpoint fora => bloqueado com minima local", JSON.stringify(r));
}
{
  // Sem minima local E sem endpoint => bloqueado por fail-closed.
  const r = V.avaliarVersao("100", null, "0");
  ok(r.bloqueado, "endpoint fora e sem minima local => bloqueado (fail-closed)", JSON.stringify(r));
}
{
  // Bundle novo + endpoint fora, com minima local coerente => liberado.
  const r = V.avaliarVersao("200", null, "200");
  ok(!r.bloqueado, "endpoint fora mas bundle na minima local => liberado", JSON.stringify(r));
}

// ---------------------------------------------------------------------------
// Normalizacao da resposta
// ---------------------------------------------------------------------------
ok(V.normalizarRespostaVersao(null) === null, "normaliza: null");
ok(V.normalizarRespostaVersao({ ok: false }) === null, "normaliza: ok=false");
ok(V.normalizarRespostaVersao({ ok: true, minimo: "1" }) === null, "normaliza: sem atual");
{
  const n = V.normalizarRespostaVersao({ ok: true, minimo: "200", atual: "200", rotulo: "c1", corte: true });
  ok(!!n && n.minimo === "200" && n.atual === "200" && n.corte === true, "normaliza: payload valido");
}

// ---------------------------------------------------------------------------
// Contrato do endpoint
// ---------------------------------------------------------------------------
ok(V.ENDPOINT_VERSAO === "/api/versao", "endpoint: caminho");
ok(V.HEADER_VERSAO === "x-neia-build", "header: nome");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) no protocolo de versao.`);
  process.exit(1);
}
console.log("\nProtocolo de versao: todos os testes passaram.");
