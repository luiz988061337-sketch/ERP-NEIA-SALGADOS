import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calcularPublico,
  periodoCampanhaValido,
  pertenceAoSegmento,
  podeDecidir,
  substituirCamposMensagem,
} from "../src/components/comercial-preview/campanhas-regras.ts";

const clientes = [
  { id: "a", nome: "Ana Souza", diasSemComprar: 30, vip: false, recorrente: false, reclamacao: false, optOut: false, diasDesdeContato: null },
  { id: "b", nome: "Bia Lima", diasSemComprar: 59, vip: false, recorrente: false, reclamacao: false, optOut: true, diasDesdeContato: null },
  { id: "c", nome: "Caio Reis", diasSemComprar: 60, vip: true, recorrente: true, reclamacao: false, optOut: false, diasDesdeContato: 3 },
  { id: "d", nome: "Dani Melo", diasSemComprar: 90, vip: false, recorrente: true, reclamacao: true, optOut: false, diasDesdeContato: 7 },
];

assert.equal(pertenceAoSegmento(clientes[0], "inativos_30"), true);
assert.equal(pertenceAoSegmento(clientes[1], "inativos_30"), true);
assert.equal(pertenceAoSegmento(clientes[2], "inativos_30"), false);
assert.equal(pertenceAoSegmento(clientes[2], "inativos_60"), true);
assert.equal(pertenceAoSegmento(clientes[3], "inativos_90"), true);

const publico30 = calcularPublico(clientes, "inativos_30", 7);
assert.deepEqual(publico30.elegiveis.map((c) => c.id), ["a"]);
assert.equal(publico30.excluidos.length, 1);
assert.match(publico30.excluidos[0].motivos[0], /opt-out/i);

const publico60 = calcularPublico(clientes, "inativos_60", 7);
assert.equal(publico60.elegiveis.length, 0);
assert.match(publico60.excluidos[0].motivos[0], /intervalo mínimo de 7 dias/i);
assert.equal(calcularPublico(clientes, "inativos_60", 3).elegiveis.length, 1);
assert.equal(calcularPublico(clientes, "reclamacoes", 7).elegiveis[0].id, "d");

const pendente = { status: "Aguardando aprovação", criador: "Marketing demo" };
assert.equal(podeDecidir(pendente, "marketing", "Marketing demo"), false);
assert.equal(podeDecidir(pendente, "responsavel", "Marketing demo"), false);
assert.equal(podeDecidir(pendente, "responsavel", "Responsável demo"), true);
assert.equal(podeDecidir({ ...pendente, status: "Aprovada" }, "responsavel", "Responsável demo"), false);

assert.equal(
  substituirCamposMensagem("Oi {{cliente}}: {{dias_sem_comprar}}d {{cupom}}", clientes[0], "VOLTA10"),
  "Oi Ana: 30d VOLTA10",
);

const modelo = "Olá {{cliente}}! Use {{cupom}} na próxima compra. Até breve!";
assert.equal(substituirCamposMensagem(modelo, clientes[0], ""), "Olá Ana! Até breve!");
assert.equal(substituirCamposMensagem(modelo, clientes[0], "VOLTA10"), "Olá Ana! Use VOLTA10 na próxima compra. Até breve!");
assert.equal(substituirCamposMensagem("Olá {{cliente}}! Confira {{cupom}}.", clientes[0], ""), "Olá Ana!");
assert.equal(substituirCamposMensagem("Olá {{cliente}}! Até breve!", clientes[0], ""), "Olá Ana! Até breve!");

assert.equal(periodoCampanhaValido("2028-02-29", "2028-02-29"), true);
assert.equal(periodoCampanhaValido("2026-11-14", "2026-11-30"), true);
for (const [inicio, fim] of [
  ["", "2026-11-30"],
  ["2026-11-14", ""],
  ["2026-11-14", "2026-11-13"],
  ["2026-02-29", "2026-03-01"],
  ["2026-04-30", "2026-04-31"],
  ["2026-11-01", "2026-13-01"],
  ["2026-2-01", "2026-11-30"],
  ["0000-01-01", "2026-11-30"],
]) {
  assert.equal(periodoCampanhaValido(inicio, fim), false);
}

const route = await readFile(new URL("../src/components/comercial-preview/tela-campanhas.tsx", import.meta.url), "utf8");
assert.doesNotMatch(route, /supabase|fetch\s*\(|\.from\s*\(/i);
assert.doesNotMatch(route, /\.sent_at\s*=|\.update\s*\(/i);

console.log("C2: segmentação, opt-out, anti-spam, aprovação por outro perfil, prévia e ausência de chamadas de envio validados.");
