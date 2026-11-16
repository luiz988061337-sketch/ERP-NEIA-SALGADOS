import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { normalizarResultadoTaxa, previsaoTaxaUtilizavel } = await import("@/lib/config-entrega.ts");

const autorizado = (overrides = {}) => ({
  modo: "config",
  taxa: 0,
  fora_da_area: false,
  aceitar_entregas: true,
  entrega_gratis: true,
  ...overrides,
});

assert.equal(previsaoTaxaUtilizavel(normalizarResultadoTaxa(autorizado())), true);
assert.equal(
  normalizarResultadoTaxa(autorizado()).entregaGratis,
  true,
  "frete grátis permanece válido quando taxa zero e autorização são explícitas",
);

for (const resposta of [
  { modo: "config", fora_da_area: null, aceitar_entregas: false, taxa: null, erro: "entregas_desativadas" },
  { modo: "config", fora_da_area: null, aceitar_entregas: true, taxa: null, erro: "destino_ausente" },
  { modo: "config", fora_da_area: null, aceitar_entregas: true, taxa: null, erro: "destino_invalido" },
  { modo: "config", fora_da_area: true, aceitar_entregas: true, taxa: null, distancia_km: 12 },
]) {
  assert.equal(previsaoTaxaUtilizavel(normalizarResultadoTaxa(resposta)), false);
}

for (const fora_da_area of [undefined, null, true, "false", 0]) {
  const resultado = normalizarResultadoTaxa(autorizado({ fora_da_area }));
  assert.equal(
    previsaoTaxaUtilizavel(resultado),
    false,
    `fora_da_area sem false booleano explícito bloqueia: ${String(fora_da_area)}`,
  );
}

for (const aceitar_entregas of [undefined, null, false, "true", 1]) {
  const resultado = normalizarResultadoTaxa(autorizado({ aceitar_entregas }));
  assert.equal(
    previsaoTaxaUtilizavel(resultado),
    false,
    `aceitar_entregas sem true booleano explícito bloqueia: ${String(aceitar_entregas)}`,
  );
}

const contratoAtualValidoDaMigration = normalizarResultadoTaxa({
  modo: "config",
  aceitar_entregas: true,
  taxa: 2,
  distancia_km: 4,
  valor_por_km: 0.5,
  fonte: "rota",
  entrega_gratis: false,
  // A migration 0103 omite fora_da_area:false na resposta dentro da área.
});
assert.equal(
  previsaoTaxaUtilizavel(contratoAtualValidoDaMigration),
  false,
  "contrato incompleto atual da migration falha fechado até declarar fora_da_area=false",
);

const legado = normalizarResultadoTaxa({ modo: "legado", motivo: "origem_nao_configurada" });
assert.equal(legado.modo, "legado", "resposta legada da RPC preserva o modo existente");
assert.equal(previsaoTaxaUtilizavel(legado), false);

const extrairRpc = (sql) => {
  const inicio = sql.indexOf("CREATE OR REPLACE FUNCTION public.calcular_taxa_entrega(");
  if (inicio < 0) return "";
  const fim = sql.indexOf("\nEND; $$;", inicio);
  return fim < 0 ? "" : sql.slice(inicio, fim + "\nEND; $$;".length);
};
const migrationOriginal = readFileSync("drizzle/migrations/0103_entrega_por_km.sql", "utf8");
const migrationNova = readFileSync("drizzle/migrations/0105_taxa_entrega_contrato_explicito.sql", "utf8");
const rpcAntiga = extrairRpc(migrationOriginal);
const rpcNova = extrairRpc(migrationNova);
assert.ok(rpcAntiga && rpcNova, "RPC encontrada nas migrations 0103 e 0105");
assert.match(rpcAntiga, /'aceitar_entregas', true/);
assert.doesNotMatch(rpcAntiga, /'fora_da_area', false/);
assert.match(rpcNova, /'fora_da_area', false\s*,\s*'aceitar_entregas', true\s*,\s*'taxa', v_taxa/);
assert.match(rpcNova, /'fora_da_area', true\s*,\s*'aceitar_entregas', true\s*,\s*'taxa', NULL/);
assert.match(rpcNova, /'fora_da_area', NULL\s*,\s*'aceitar_entregas', false\s*,\s*'taxa', NULL\s*,\s*'erro', 'entregas_desativadas'/);
assert.equal((rpcNova.match(/'fora_da_area', NULL/g) ?? []).length, 3);
assert.match(rpcNova, /GREATEST\(v_taxa, round\(v_cfg\.taxa_minima, 2\)\)/);
assert.match(rpcNova, /v_cfg\.gratis_ativa[\s\S]*v_cfg\.gratis_acima[\s\S]*v_sub >= round\(v_cfg\.gratis_acima, 2\)/);
assert.match(migrationNova, /REVOKE ALL ON FUNCTION public\.calcular_taxa_entrega/);
assert.match(migrationNova, /GRANT EXECUTE ON FUNCTION public\.calcular_taxa_entrega[\s\S]*TO authenticated/);

console.log("F5: contrato explícito de área e permissão validado.");
