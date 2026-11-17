import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("o modo de corte elimina a interface legada por seleção de componente", () => {
  const origem = readFileSync(new URL("../src/routes/motoboy.tsx",import.meta.url),"utf8");
  assert.match(origem,/component: PainelMotoboy,/);
  assert.match(origem,/VITE_NEIA_MOTOBOY_RPC === "1" \? <PainelMotoboyRpc \/> : <Motoboy \/>/);
  const novo = readFileSync(new URL("../src/components/admin/painel-motoboy-rpc.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(novo,/\.from\(|notificarPedido|functions\.invoke/);
  for (const rpc of ["iniciar_rota","confirmar_retirada","confirmar_entrega","informar_retorno_loja","confirmar_chegada_loja","registrar_atraso_entrega"]) {
    assert.ok(novo.includes(`operar("${rpc}"`));
  }
});
test("GPS de primeiro plano exige consentimento e interrompe coleta ao desmontar", () => {
  const origem = readFileSync(new URL("../src/components/admin/coleta-localizacao-rota.tsx",import.meta.url),"utf8");
  assert.match(origem,/if \(!compartilhar\) return/);
  assert.match(origem,/document.visibilityState !== "visible"/);
  assert.match(origem,/navigator.geolocation.clearWatch\(id\)/);
  assert.doesNotMatch(origem,/localStorage|sessionStorage|service_role/);
});
