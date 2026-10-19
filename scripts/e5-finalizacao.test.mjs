// Testes E5: motoboy, retirada e finalização (unitários + estáticos).
// Transações/RLS em PostgreSQL isolado (E5-PG) pendentes de staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const F = await import("@/lib/motoboy-finalizacao.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const bloco = (nome) => {
  const i = code.indexOf(`FUNCTION public.${nome}(`);
  return i < 0 ? "" : code.slice(i, code.indexOf("$$;", i));
};

// E5.0: correção E4 — coluna do aceite explícito existe.
ok(/ADD COLUMN IF NOT EXISTS aceito_motoboy_em/.test(code), "E5.0 coluna aceito_motoboy_em criada");

// Aceite do motoboy.
const am = bloco("aceitar_entrega_motoboy");
ok(am.length > 0, "E5.1 função de aceite do motoboy preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(am), "E5.2 definer + search_path");
ok(/has_role\(v_uid, 'motoboy'\)/.test(am) && !/has_role\(v_uid, 'atendente'\)/.test(am) && !/has_role\(v_uid, 'producao'\)/.test(am), "E5.3 só motoboy/admin");
ok(/aguardando_motoboy/.test(am), "E5.4 só em Aguardando Motoboy");
ok(/pedido de outro motoboy/.test(am), "E5.5 vínculo com o atribuído");
ok(/SET aceito_motoboy_em = now\(\)/.test(am), "E5.6 grava só o aceite explícito");
ok(!/status = 'em_rota'/.test(am) && !/entregue_em/.test(am), "E5.7 aceite não é saída nem entrega");

// Retirada.
const rt = bloco("retirar_pedido_cliente");
ok(rt.length > 0, "E5.8 função de retirada preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(rt), "E5.9 definer + search_path");
ok(/tipo_entrega = 'retirada'/.test(rt) && /entrega usa fluxo de motoboy/.test(rt), "E5.10 entrega não passa por retirada");
ok(/<> 'pronto'/.test(rt), "E5.11 só Prontos");
ok(/SET retirado_em = now\(\), retirado_por = v_uid, status = 'entregue'/.test(rt), "E5.12 registra + transição matriz");
ok(/pedido_status_historico/.test(rt) && /retirada confirmada/.test(rt), "E5.13 histórico auditável");
ok(!/pagamento_status\s*=/.test(rt), "E5.14 pagamento intacto");
ok(/GRANT EXECUTE ON FUNCTION public\.(aceitar_entrega_motoboy|retirar_pedido_cliente)/.test(code), "E5.15 grants mínimos");

// Unitários.
ok(F.E5_RETIRADA_ATIVA === false && F.E5_FLUXO_MOTOBOY_ATIVO === false, "E5.16 flags desligadas");
{
  const no = { rpc: async () => ({ data: null, error: null }) };
  const r1 = await F.aceitarEntregaMotoboy(no, "x");
  const r2 = await F.retirarPedidoCliente(no, "x");
  ok(r1.codigo === "flag-desativada" && r2.codigo === "flag-desativada", "E5.17 flags off sem rede");
}
{
  const E = F.elegivelAceiteMoto;
  const p = { status: "aguardando_motoboy", motoboy_id: "u", aceito_motoboy_em: null, operador_uid: "u", operador_eh_admin: false };
  ok(E(p).elegivel, "E5.18 aceite explícito válido");
  ok(!E({ ...p, motoboy_id: null }).elegivel, "E5.19 sem atribuição bloqueia");
  ok(!E({ ...p, operador_uid: "outro" }).elegivel, "E5.20 outro motoboy bloqueia");
  ok(!E({ ...p, aceito_motoboy_em: "t" }).elegivel, "E5.21 duplicado bloqueia");
  ok(!E({ ...p, status: "pronto" }).elegivel, "E5.22 fora da etapa bloqueia");
}
{
  const R = F.elegivelRetirada;
  const p = { status: "pronto", tipo_entrega: "retirada", conferido_em: null, retirado_em: null };
  ok(R(p, false).elegivel, "E5.23 retirada válida");
  ok(!R({ ...p, tipo_entrega: "entrega" }, false).elegivel, "E5.24 entrega não usa retirada");
  ok(!R({ ...p, status: "em_producao" }, false).elegivel, "E5.25 não pronto bloqueia");
  ok(!R(p, true).elegivel, "E5.26 conferência exigida e ausente bloqueia");
  ok(!R({ ...p, retirado_em: "t" }, false).elegivel, "E5.27 duplicada bloqueia");
}

if (falhas > 0) {
  console.error(`E5: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E5: casos passando. E5-PG (transações/RLS em PG isolado): pendente de staging.");
