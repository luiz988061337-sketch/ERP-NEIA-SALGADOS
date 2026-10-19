// Testes E8: sincronização (unitários + estáticos). PG/Realtime (E8-PG): staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const S = await import("@/lib/sincronizacao-paineis.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const AGORA = Date.now();
const P = (over) => ({
  id: "p", status: "recebido", tipo_entrega: "entrega", motoboy_id: null,
  aceito_em_atendente: null, liberado_em: null, conferido_em: null,
  retirado_em: null, agendado_para: null, atrasado: false, ...over,
});

// Estáticos: módulo puro, sem rede.
{
  const src = readFileSync("src/lib/sincronizacao-paineis.ts", "utf8");
  ok(!/supabase|from\(["']@\/integrations|fetch\(|WebSocket/.test(src), "E8.1 sem rede no módulo");
}
// Derivações por painel (mesma linha, três visões).
{
  ok(S.visaoAtendente(P({})) === "novos", "E8.2 novo → Novos");
  ok(S.visaoAtendente(P({ aceito_em_atendente: "t" })) === "aceitos", "E8.3 aceito → Aceitos");
  ok(S.visaoAtendente(P({ status: "em_producao" })) === "producao", "E8.4 preparo → Produção");
  ok(S.visaoAtendente(P({ status: "pronto" })) === "prontos", "E8.5 pronto → Prontos");
  ok(S.visaoAtendente(P({ status: "aguardando_motoboy", motoboy_id: "u" })) === "entrega", "E8.6 atribuído → Entrega");
  ok(S.visaoAtendente(P({ status: "em_rota" })) === "entrega", "E8.7 rota → Entrega");
  ok(S.visaoAtendente(P({ status: "entregue" })) === "concluidos", "E8.8 entregue → Concluídos");
  ok(S.visaoProducao(P({})) === "proximos", "E8.9 recebido → Próximos");
  ok(S.visaoProducao(P({ status: "em_producao" })) === "preparo", "E8.10 → Em preparo");
  ok(S.visaoCentral(P({ status: "pronto" })) === "aguardando", "E8.11 pronto entrega → Aguardando");
  ok(S.visaoCentral(P({ status: "aguardando_motoboy", motoboy_id: "u" })) === "atribuidos", "E8.12 → Atribuídos");
  ok(S.visaoCentral(P({ status: "pronto", tipo_entrega: "retirada" })) === "aguardando", "E8.13 retirada fica fora da entrega");
}
// Contadores unificados.
{
  const rows = [
    P({ id: "a" }),
    P({ id: "b", aceito_em_atendente: "t", agendado_para: new Date(AGORA + 3600000).toISOString() }),
    P({ id: "c", status: "em_producao" }),
    P({ id: "d", status: "pronto" }),
    P({ id: "e", status: "aguardando_motoboy" }),
    P({ id: "f", status: "em_rota", motoboy_id: "u" }),
    P({ id: "g", status: "entregue" }),
    P({ id: "h", status: "pronto", atrasado: true }),
  ];
  const c = S.contadores(rows, 2);
  ok(c.novos === 1 && c.aceitos === 1 && c.agendados === 1, "E8.14 base + agendados");
  ok(c.producao === 1 && c.prontos === 3, "E8.15 produção e prontos");
  ok(c.aguardandoMotoboy === 6 && c.emRota === 1 && c.entregues === 1, "E8.16 despacho");
  ok(c.atrasados === 1 && c.motoboysDisponiveis === 2, "E8.17 atrasos + base");
}
// Dedupe, reconexão, polling.
{
  ok(S.chaveEvento("pedidos", "1", "t") === "pedidos:1:t", "E8.18 chave de evento");
  ok(S.jaVisto(["a", "b"], "b") && !S.jaVisto(["a"], "c"), "E8.19 evento duplicado detectado");
  ok(S.conexaoDesatualizada(null, AGORA), "E8.20 sem sucesso = desatualizada");
  ok(S.conexaoDesatualizada(AGORA - 60000, AGORA) && !S.conexaoDesatualizada(AGORA - 10000, AGORA), "E8.21 limite 45s");
  ok(S.CANAIS.producao.pollingMs === 15000 && S.CANAIS.central.tabelas.includes("motoboys"), "E8.22 canais espelham o existente");
}
// E7 §7 resolvidos.
{
  ok(S.namespacesImpressao().length === 3, "E8.23 namespaces sem colisão");
}

if (falhas > 0) {
  console.error(`E8: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E8: casos passando. E8-PG (Realtime/polling em staging): pendente.");
