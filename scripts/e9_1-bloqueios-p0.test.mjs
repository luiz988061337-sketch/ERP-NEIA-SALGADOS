// Testes E9.1: correções P0 (estáticos locais + unidade).
// Concorrência real em PG isolado (E9.1-PG): pendente de staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const F4 = await import("@/lib/central-atribuicao.ts");
const F6 = await import("@/lib/impressao-etapas.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const R = (p) => readFileSync(p, "utf8");

// P0-1: dupla atribuição — flag + trava + 0 linhas.
{
  const ce = R("src/routes/central-entregas.tsx");
  ok(/E4_ATRIBUICAO_ATIVA/.test(ce) && /atribuirPedidoMotoboy\(supabase/.test(ce), "E9.1.1 central usa RPC E4 com flag");
  ok(/atribuindoEmVoo/.test(ce), "E9.1.2 trava de clique na central");
  ok(/data\.length === 0/.test(ce) && /conflito/.test(ce), "E9.1.3 0 linhas = conflito visível");
  const painel = R("src/components/admin/painel-motoboy-rpc.tsx");
  ok(
    /const emVoo = useRef\(false\)/.test(painel) &&
      /if \(emVoo\.current\) return/.test(painel) &&
      /A Central recusou esta etapa/.test(painel),
    "E9.1.4 trava + conflito no painel RPC do motoboy",
  );
  ok(!F4.E4_ATRIBUICAO_ATIVA, "E9.1.5 flag E4 desligada (legado preservado)");
}
// P0-2: duas rotas — trigger + saneamento.
ok(/impedir_parada_duplicada/.test(code) && /já está em rota ativa/.test(code), "E9.1.6 trigger anti-duplicata");
ok(/pedidos em >1 rota ativa/.test(sql) && /motoboys com >1 rota preparando/.test(sql), "E9.1.7 saneamento documentado");
// P0-3: retirada física e liberação da produção permanecem etapas explícitas.
{
  const pr = R("src/routes/producao.tsx");
  ok(/pronto && !retirada/.test(pr) && /pronto && retirada/.test(pr) && /Liberar retirada/.test(pr),
    "E9.1.8 produção distingue liberação de entrega e retirada");
  // "Iniciar preparo" (mudarStatus) NÃO pode consumir reserva. A retirada
  // física é uma ação explícita separada, que pode reutilizar a 0091.
  const inicio = pr.indexOf("async function mudarStatus");
  const fim = pr.indexOf("async function imprimirDireto", inicio);
  const blocoIniciarPreparo = inicio >= 0 && fim > inicio ? pr.slice(inicio, fim) : "";
  ok(
    blocoIniciarPreparo.length > 0 && !/registrarConsumoAtomico/.test(blocoIniciarPreparo),
    "E9.1.8b Iniciar preparo nao consome reserva automaticamente",
  );
  ok(
    /não registra retirada física/i.test(pr) &&
      /RetiradaReserva/.test(pr) &&
      /registrarConsumoAtomico/.test(pr),
    "E9.1.8c retirada parcial exige acao explicita",
  );
}
// P0-4: impressão — uuid + trava + conflito.
{
  const pr = R("src/routes/producao.tsx");
  ok(/filaEmVoo/.test(pr), "E9.1.9 trava de reenvio na produção");
  ok(/E6_IMPRESSAO_ATIVA \? chaveFila/.test(pr) && /ignoreDuplicates: true/.test(pr), "E9.1.10 uuid determinístico com flag + upsert");
  ok(/já está na fila/.test(pr), "E9.1.11 conflito vira aviso (não erro mudo)");
  ok(!F6.E6_IMPRESSAO_ATIVA, "E9.1.12 flag E6 desligada");
}
// P0-5: guard financeiro sem isenção fraca (E9.2: GUC removida — SET livre).
ok(/congelar_colunas_protegidas/.test(code) && !/neia\.etapa_rpc/.test(code), "E9.1.13 guard sem bypass por GUC");
ok(/service_role/.test(code), "E9.1.14 servidor isento como no guard 0074");
ok(/pagamento_status IS DISTINCT FROM/.test(code) && /agendado_para IS DISTINCT FROM/.test(code) && /user_id IS DISTINCT FROM/.test(code), "E9.1.15 financeiro/promessa/identidade congelados");
// Previews intactos.
{
  const au = R("src/lib/pedido-status.ts");
  ok(/ETAPAS_OPERACIONAIS/.test(au), "E9.1.16 mapa E1 intacto");
}

if (falhas > 0) {
  console.error(`E9.1: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E9.1: casos passando. E9.1-PG (concorrência PG): pendente de staging.");
