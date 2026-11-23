// Testes E3: liberação + conferência (unitários locais + estáticos).
// Transações/RLS em PostgreSQL isolado (E3-PG) pendentes de staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const C = await import("@/lib/cozinha-liberacao.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const AGORA = Date.now();
const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const producao = readFileSync("src/routes/producao.tsx", "utf8");
const iMudarStatus = producao.indexOf("async function mudarStatus(");
const iImprimirDireto = producao.indexOf("async function imprimirDireto", iMudarStatus);
const mudarStatus = iMudarStatus >= 0 && iImprimirDireto > iMudarStatus
  ? producao.slice(iMudarStatus, iImprimirDireto)
  : "";
const blocos = (nome) => {
  const i = code.indexOf(`FUNCTION public.${nome}(`);
  if (i < 0) return "";
  return code.slice(i, code.indexOf("$$;", i));
};

// Estáticos: liberação.
const lib = blocos("liberar_pedido_cozinha");
ok(lib.length > 0, "E3.1 função de liberação preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(lib), "E3.2 definer + search_path");
ok(/has_role\(v_uid, 'atendente'\)/.test(lib) && /has_role\(v_uid, 'producao'\)/.test(lib), "E3.3 papéis atendente/producao/admin");
ok(/FOR UPDATE/.test(lib), "E3.4 trava a linha");
ok(/v_aceito IS NULL/.test(lib) && /agendado_para/.test(lib), "E3.5 exige aceite e respeita janela");
ok(/SET liberado_em = now\(\), liberado_por = v_uid/.test(lib), "E3.6 grava só liberação");
ok(!/pagamento_status\s*=/.test(lib) && !/producao_status\s*=/.test(lib), "E3.7 não toca pagamento nem preparo");
ok(/'bloqueado'/.test(lib) && /agendado antes da janela/.test(lib), "E3.8 bloqueio de agendado");
// Estáticos: conferência.
const conf = blocos("conferir_pedido_cozinha");
ok(conf.length > 0, "E3.9 função de conferência preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(conf), "E3.10 definer + search_path");
ok(/has_role\(v_uid, 'producao'\)/.test(conf) && !/has_role\(v_uid, 'atendente'\)/.test(conf), "E3.11 só cozinha/admin (atendente fora)");
ok(/p_confirmado/.test(conf) && /confirmacao explicita ausente/.test(conf), "E3.12 exige confirmação explícita");
ok(/status <> 'em_producao'/.test(conf), "E3.13 só em preparo");
ok(/SET conferido_em = now\(\), conferido_por = v_uid/.test(conf), "E3.14 grava só conferência");
ok(!/entregue/.test(conf.replace(/COMMENT[\s\S]*$/, "")), "E3.15 nunca entrega");
ok(/GRANT EXECUTE ON FUNCTION public\.(liberar_pedido_cozinha|conferir_pedido_cozinha)/.test(code), "E3.16 grants mínimos");

// Runtime da Cozinha: transição condicional e confirmação antes dos efeitos laterais.
ok(
  mudarStatus.includes('rpc("preparar_remessas_producao"') &&
  mudarStatus.includes('rpc("conferir_remessas_producao"') &&
  !/\.from\("pedidos"\)\s*\.update\(/.test(mudarStatus),
  "E3.31 início e conferência passam pelas RPCs com trava no pedido",
);
const iSemAtualizacao = mudarStatus.indexOf("if (!atualizado)");
const iNotificar = mudarStatus.indexOf("void notificarPedido");
const iHistorico = mudarStatus.indexOf("pedido_status_historico");
ok(iSemAtualizacao >= 0 && iNotificar > iSemAtualizacao && iHistorico > iSemAtualizacao, "E3.32 conflito sem linha atualizada bloqueia notificação e histórico");

// Unitários: flags off + pré-checks.
ok(C.E3_LIBERACAO_ATIVA === false && C.E3_CONFERENCIA_ATIVA === false, "E3.17 flags desligadas");
{
  const no = { rpc: async () => ({ data: null, error: null }) };
  const r1 = await C.liberarPedidoCozinha(no, "x");
  const r2 = await C.conferirPedidoCozinha(no, "x", true);
  ok(r1.codigo === "flag-desativada" && r2.codigo === "flag-desativada", "E3.18 flags off sem rede");
}
{
  const L = C.elegivelLiberacaoLocal;
  const base = { status: "recebido", aceito_em_atendente: "t", liberado_em: null, agendado_para: null };
  ok(L(base, AGORA).elegivel, "E3.19 liberação válida");
  ok(!L({ ...base, aceito_em_atendente: null }, AGORA).elegivel, "E3.20 sem aceite bloqueia");
  ok(!L({ ...base, liberado_em: "t" }, AGORA).elegivel, "E3.21 duplicada bloqueia");
  ok(!L({ ...base, status: "cancelado" }, AGORA).elegivel, "E3.22 cancelado bloqueia");
  ok(!L({ ...base, agendado_para: new Date(AGORA + 120 * 60000).toISOString() }, AGORA).elegivel, "E3.23 agendado antes da janela bloqueia");
  ok(L({ ...base, agendado_para: new Date(AGORA + 30 * 60000).toISOString() }, AGORA).elegivel, "E3.24 agendado na janela libera");
}
{
  const F = C.elegivelConferenciaLocal;
  ok(F({ status: "em_producao", conferido_em: null }, true).elegivel, "E3.25 conferência válida");
  ok(!F({ status: "em_producao", conferido_em: null }, false).elegivel, "E3.26 sem confirmação bloqueia");
  ok(!F({ status: "em_producao", conferido_em: "t" }, true).elegivel, "E3.27 duplicada bloqueia");
  ok(!F({ status: "pronto", conferido_em: null }, true).elegivel, "E3.28 fora do preparo bloqueia");
}

if (falhas > 0) {
  console.error(`E3: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E3: casos passando. E3-PG (transações/RLS em PG isolado): pendente de staging.");
