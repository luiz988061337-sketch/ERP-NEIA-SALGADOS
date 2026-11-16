// Testes E4: reserva/atribuição/rotas (unitários locais + estáticos).
// Transações/RLS em PostgreSQL isolado (E4-PG) pendentes de staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const C = await import("@/lib/central-atribuicao.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const SQL_ATOMICA = "drizzle/migrations/0108_criar_rota_entrega_atomica.sql";
const sqlAtomica = existsSync(SQL_ATOMICA) ? readFileSync(SQL_ATOMICA, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const rotaRoute = readFileSync("src/routes/central-entregas.tsx", "utf8");
const iCriarRota = rotaRoute.indexOf("async function criarRota(");
const iHandleFiltro = rotaRoute.indexOf("const handleFiltroChange", iCriarRota);
const criarRota = iCriarRota >= 0 && iHandleFiltro > iCriarRota
  ? rotaRoute.slice(iCriarRota, iHandleFiltro)
  : "";
const fn = (() => {
  const i = code.indexOf("FUNCTION public.atribuir_pedido_motoboy(");
  return i < 0 ? "" : code.slice(i, code.indexOf("$$;", i));
})();

// Estáticos.
ok(fn.length > 0, "E4.1 função de atribuição preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(fn), "E4.2 definer + search_path");
ok(/has_role\(v_uid, 'admin'\)/.test(fn) && /has_role\(v_uid, 'producao'\)/.test(fn) && !/atendente/.test(fn), "E4.3 papéis admin/producao (atendente fora)");
ok((fn.match(/FOR UPDATE/g) || []).length >= 2, "E4.4 trava pedido + motoboy (+rota)");
ok(/tipo_entrega/.test(fn) && /retirada sem motoboy/.test(fn), "E4.5 retirada bloqueada");
ok(/<> 'pronto'/.test(fn), "E4.6 só Prontos");
ok(/motoboys m WHERE m\.id = p_motoboy_id/.test(fn) && /user_id/.test(fn), "E4.7 identidade canônica (id p/ rota, user_id p/ pedido)");
ok(/motoboy_id = v_muser/.test(fn) && !/motoboy_id = p_motoboy_id/.test(fn.replace(/m\.id = p_motoboy_id|motoboy_id = p_motoboy_id AND r\.status|WHERE r\.motoboy_id = p_motoboy_id/g, "")), "E4.8 sem mistura de identificadores");
ok(/disponivel_base/.test(fn), "E4.9 exige disponibilidade");
ok(/rota_pedidos/.test(fn) && /rotas_entrega/.test(fn) && !/public\.rotas[^_]/.test(fn), "E4.10 modelo 0024 (sem rotas órfã)");
ok(/SELECT r\.id INTO v_rota[\s\S]*status = 'preparando'[\s\S]*IF NOT FOUND THEN[\s\S]*INSERT INTO public\.rotas_entrega/.test(fn), "E4.50 a 0084 reutiliza uma rota preparando e só cria outra quando não encontra uma");
ok(/VALUES \(p_motoboy_id, 'preparando'\)/.test(fn) && /status = 'aguardando_motoboy'/.test(fn), "E4.51 rota inicia preparando e o pedido fica aguardando o motoboy");
ok(/>= 3/.test(fn) && /p_autorizar_extra/.test(fn) && /acima do limite/.test(fn), "E4.11 limite 3 + exceção auditada");
ok(/ON CONFLICT DO NOTHING/.test(fn) && /parada duplicada/.test(fn), "E4.12 parada duplicada bloqueada");
ok(/pedido em rota ativa/.test(fn), "E4.13 pedido em duas rotas bloqueado");
ok(!/UPDATE public\.motoboys/.test(fn), "E4.14 status do motoboy preservado (triggers de saída)");
ok(!/pagamento_status\s*=/.test(fn) && /promessa preservada/.test(code), "E4.15 pagamento/promessa intactos");
ok(/GRANT EXECUTE ON FUNCTION public\.atribuir_pedido_motoboy/.test(code), "E4.16 grant mínimo");
ok(/new Set\(pedidosSelecionados\.map/.test(criarRota), "E4.31 criação de rota deduplica seleções");
ok(/rpc\("criar_rota_entrega_atomica"/.test(criarRota), "E4.32 tela usa RPC única para criar e atribuir a rota");
ok(/PGRST202[\s\S]*migration 0108 ainda não está instalada/.test(criarRota), "E4.39 RPC ausente pausa a atribuição sem fallback legado");
ok(!/\.from\("rotas_entrega"\)\.insert|\.from\("rota_pedidos"\)\.insert|\.from\("pedidos"\)\.update/.test(criarRota), "E4.33 UI não separa rota, paradas e pedidos em gravações concorrentes");
ok(/criandoRotaRef\.current/.test(criarRota), "E4.34 duplo clique local bloqueado");
ok(/cardinality\(p_pedido_ids\) NOT BETWEEN 1 AND 3/.test(sqlAtomica), "E4.35 RPC limita a rota a três pedidos");
ok(/ORDER BY p\.id FOR UPDATE[\s\S]*atribuir_pedido_motoboy/.test(sqlAtomica), "E4.36 RPC trava pedidos em ordem determinística antes de atribuir");
ok(/EXCEPTION WHEN OTHERS[\s\S]*'falha_atomica'/.test(sqlAtomica), "E4.37 falha de qualquer atribuição retorna após rollback do bloco");
ok(/REVOKE ALL ON FUNCTION public\.criar_rota_entrega_atomica[\s\S]*GRANT EXECUTE ON FUNCTION public\.criar_rota_entrega_atomica/.test(sqlAtomica), "E4.38 RPC tem grants explícitos");
ok(/has_role\(v_uid, 'admin'\)[\s\S]*has_role\(v_uid, 'producao'\)/.test(sqlAtomica), "E4.40 RPC de lote aplica os mesmos perfis admin/produção da 0084");
ok(/PERFORM m\.id FROM public\.motoboys m[\s\S]*FOR UPDATE[\s\S]*PERFORM r\.id FROM public\.rotas_entrega[\s\S]*rota_preexistente/.test(sqlAtomica), "E4.41 trava o motoboy e recusa rota ativa preexistente antes de atribuir");
ok(/SELECT count\(\*\) INTO v_rotas_ativas[\s\S]*IF v_rotas_ativas <> 1/.test(sqlAtomica), "E4.42 exige uma única rota ativa ao final");
ok(/count\(\*\) FILTER \(WHERE rp\.pedido_id = ANY\(p_pedido_ids\)\)[\s\S]*v_total_paradas <> v_total OR v_paradas_selecionadas <> v_total/.test(sqlAtomica), "E4.43 exige exatamente as paradas selecionadas, sem extras ou faltas");
ok(/rota_preexistente:/.test(criarRota), "E4.44 UI explica o bloqueio de rota ativa preexistente");
ok(/p\.status !== "pronto" \|\| p\.motoboy_id \|\| p\.rota_id/.test(criarRota), "E4.52 UI aceita somente pedido pronto ainda sem atribuição, conforme 0084");

// Modelo local do contrato do lote: útil para os limites e rollback lógico,
// mas não comprova o comportamento transacional do PostgreSQL.
function simularCriacaoRota(ids, { rotaPreexistente = false, atribuidos = [], falhaNo = null } = {}) {
  if (ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length) return { status: "dados_invalidos" };
  if (rotaPreexistente) return { status: "rota_preexistente" };
  if (ids.some((id) => atribuidos.includes(id))) return { status: "conflito" };
  const paradasTentadas = [];
  for (const [indice, id] of ids.entries()) {
    if (falhaNo === indice) return { status: "falha_atomica", rota: null };
    paradasTentadas.push(id);
  }
  if (paradasTentadas.length !== ids.length || new Set(paradasTentadas).size !== ids.length) {
    return { status: "rota_incompleta_ou_com_paradas_extras", rota: null };
  }
  return { status: "criada", rota: paradasTentadas };
}
for (const quantidade of [1, 2, 3]) {
  const ids = Array.from({ length: quantidade }, (_, indice) => `p${indice + 1}`);
  const resultado = simularCriacaoRota(ids);
  ok(resultado.status === "criada" && resultado.rota.length === quantidade &&
    resultado.rota.every((id, indice) => id === ids[indice]), `E4.45 lote de ${quantidade} entrega(s) confirma uma rota exata`);
}
ok(simularCriacaoRota(["p1", "p1"]).status === "dados_invalidos", "E4.46 duplicidade no lote é recusada");
ok(simularCriacaoRota(["p1"], { atribuidos: ["p1"] }).status === "conflito", "E4.47 pedido já atribuído é recusado");
ok(simularCriacaoRota(["p1", "p2"], { rotaPreexistente: true }).status === "rota_preexistente", "E4.48 rota preexistente nunca retorna sucesso");
ok(simularCriacaoRota(["p1", "p2", "p3"], { falhaNo: 1 }).status === "falha_atomica", "E4.49 falha intermediária não retorna rota parcial no modelo");

// Unitários.
ok(C.E4_ATRIBUICAO_ATIVA === false, "E4.17 flag desligada");
{
  const r = await C.atribuirPedidoMotoboy({ rpc: async () => ({ data: null, error: null }) }, "p", "m");
  ok(r.codigo === "flag-desativada", "E4.18 flag off sem rede");
}
{
  const E = C.elegivelAtribuicaoLocal;
  const p = { status: "pronto", tipo_entrega: "entrega", motoboy_id: null, conferido_em: null, emRotaAtiva: false };
  const m = { id: "m", user_id: "u", status: "disponivel_base" };
  ok(E(p, m, false).elegivel, "E4.19 atribuição válida");
  ok(!E({ ...p, motoboy_id: "u" }, m, false).elegivel, "E4.20 duplicada bloqueada");
  ok(!E(p, { ...m, status: "em_rota" }, false).elegivel, "E4.21 indisponível bloqueia");
  ok(!E(p, { ...m, user_id: null }, false).elegivel, "E4.22 sem vínculo bloqueia");
  ok(!E({ ...p, tipo_entrega: "retirada" }, m, false).elegivel, "E4.23 retirada bloqueada");
  ok(!E({ ...p, status: "em_producao" }, m, false).elegivel, "E4.24 não pronto bloqueia");
  ok(!E(p, m, true).elegivel, "E4.25 conferência exigida e ausente bloqueia");
  ok(!E({ ...p, emRotaAtiva: true }, m, false).elegivel, "E4.26 duas rotas bloqueia");
}
{
  ok(C.cabeNaRota(0, false) && C.cabeNaRota(2, false), "E4.27 até 3 sem autorização");
  ok(!C.cabeNaRota(3, false) && C.cabeNaRota(3, true), "E4.28 quarto exige autorização");
}
{
  const ordem = [];
  const resultado = await C.atribuirPedidosEmLote(["p1", "p2", "p1", " "], async (id) => {
    ordem.push(`inicio:${id}`);
    await Promise.resolve();
    ordem.push(`fim:${id}`);
    return id === "p1";
  });
  ok(
    resultado.solicitados === 2 &&
      resultado.atribuidos.join(",") === "p1" &&
      resultado.falhas.join(",") === "p2" &&
      ordem.join(",") === "inicio:p1,fim:p1,inicio:p2,fim:p2",
    "E4.29 lote sequencial, ids únicos e parcial reportado corretamente",
  );
  const falhaRede = await C.atribuirPedidosEmLote(["p3"], async () => {
    throw new Error("offline");
  });
  ok(falhaRede.falhas.join(",") === "p3", "E4.30 falha de rede não vira sucesso do lote");
}

if (falhas > 0) {
  console.error(`E4: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E4: casos passando. E4-PG (transações/RLS em PG isolado): pendente de staging.");
