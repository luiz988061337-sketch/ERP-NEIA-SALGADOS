// Fases 2-9 — testes reais sobre lógica pura (sem banco).
// Uso: node scripts/fases.test.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
globalThis.window = { location: { origin: "https://teste.local" } };
try { globalThis.sessionStorage = { getItem: () => null, setItem: () => {} }; } catch {}

const horario = await import("@/lib/horario.ts");
const lotes = await import("@/lib/lotes.ts");
const status = await import("@/lib/pedido-status.ts");
const cozinha = await import("@/lib/cozinha.ts");
const entrega = await import("@/lib/entrega.ts");
const wtotal = await import("@/lib/whatsapp-total.ts");
const watts = await import("@/lib/whatsapp.ts");
const dash = await import("@/lib/dashboard.ts");
const crmf = await import("@/lib/crm-fidelidade.ts");
const beb = await import("@/lib/bebidas.ts");
const imp = await import("@/lib/impressao.ts");
const estoque = await import("@/lib/estoque.ts");
const fiscal = await import("@/lib/fiscal.ts");
const push = await import("@/lib/push.ts");

let pass = 0, fail = 0;
function t(nome, cond) {
  if (cond) { pass++; console.log(`ok   - ${nome}`); }
  else { fail++; console.log(`FALHOU - ${nome}`); }
}

// Horário: Dom fechado, 12-13 bloqueado, antecedência
t("domingo fechado", horario.validarAgendamento("2026-10-04T10:00:00-03:00", new Date("2026-10-03T10:00:00-03:00")).ok === false);
t("12:30 bloqueado", horario.validarAgendamento("2026-10-06T12:30:00-03:00", new Date("2026-10-05T10:00:00-03:00")).ok === false);
t("seg 10h ok", horario.validarAgendamento("2026-10-06T10:00:00-03:00", new Date("2026-10-05T10:00:00-03:00")).ok === true);
t("antecedencia 30min", horario.validarAgendamento(new Date(Date.now() + 5 * 60000).toISOString(), new Date()).ok === false);
t("lotado msg", horario.mensagemLotado().includes("lotado"));

// Lotes FEFO
const L = [
  { id: "a", produto_id: "p", codigo: "A", quantidade: 100, restante: 100, validade: "2026-11-01", status: "ativo" },
  { id: "b", produto_id: "p", codigo: "B", quantidade: 100, restante: 100, validade: "2026-10-10", status: "ativo" },
];
t("FEFO prioriza validade próxima", lotes.ordenarFEFO(L)[0].id === "b");
t("aloca 150 em 2 lotes", (lotes.alocarFEFO(L, 150)?.length ?? 0) === 2);
t("insuficiente null", lotes.alocarFEFO(L, 500) === null);
t("alerta zerado", lotes.alertaEstoque(0, 50) === "zerado");
t("alerta critico", lotes.alertaEstoque(20, 50) === "critico");

// Status: bloqueia transições impossíveis
t("entregue não volta", status.podeTransitar("entregue", "em_preparacao") === false);
t("avança ok", status.podeTransitar("confirmado", "agendado") === true);
t("cancelado de entregue não", status.podeTransitar("entregue", "cancelado") === false);
t("map novo->recebido", status.STATUS_MAP_DB.novo === "recebido");

// Fritura 50=3:30 (modelo em BLOCOS: mínimo 1 lote, igual ao SQL 0052)
t("50un=210s", cozinha.tempoFritura(50) === 210);
t("100un=420s", cozinha.tempoFritura(100) === 420);
t("1un=1 lote", cozinha.tempoFritura(1) === 210);
t("75un=2 lotes", cozinha.tempoFritura(75) === 420);
t("150=10:30", cozinha.formatarTempo(630) === "10:30");
t("sem repetir som", cozinha.filtrarNovos([{ id: "1", tipo: "novo_pedido", em: "" }], new Set(["1"])).length === 0);

// WhatsApp total 40+6=46
t("40+6=46 safe", wtotal.calcTotalsSafe(40, 6) === 46);
t("template render", watts.renderTemplate("Pedido {{pedido}} {{total_com_taxa}}", { pedido: 1048, total_com_taxa: "R$ 46,00" }).includes("1048"));

// Entrega
t("portaria msg", entrega.mensagemPortaria(false).includes("portaria"));
t("pode subir vazio", entrega.mensagemPortaria(true) === "");

// Dashboard
t("atenção lista atraso", dash.oQuePrecisaAtencao([{ status: "em_producao", atrasado: true, created_at: "" }], []).length === 1);
t("preparar agrega", dash.oQuePrepararAgora([{ status: "em_producao", created_at: "", itens: [{ nome: "Coxinha", quantidade: 100 }] }])[0].qtd === 100);
t("gargalo fritura", dash.gargalo({ separacao: 5, fritura: 20, montagem: 8, entrega: 10 }) === "fritura");

// CRM/fidelidade
t("indicação válida", crmf.pontosIndicacao(true, false).indicador === 100);
t("autoindicação zero", crmf.pontosIndicacao(true, true).indicador === 0);
t("margem nunca confunde bruto", crmf.margem({ precoVenda: 100, custoProduto: 30, embalagem: 5, taxas: 6, impostos: 4, desconto: 10, pontosValor: 5 }).bruto === 100);

// Bebidas: salgado sem bebida sugere 1x
t("sugere bebida", beb.deveSugerirBebida([{ nome: "Coxinha" }]) === true);
t("não sugere com bebida", beb.deveSugerirBebida([{ nome: "Coxinha" }, { nome: "Coca" }]) === false);

// Impressão
t("cupom tem pedido", imp.textoCupom({ numero: 1048, dataHora: "x", cliente: "A", telefone: "t", itens: [{ qtd: 50, nome: "Coxinha" }], totalUnidades: 50, entregaRetirada: "Entrega", horario: "18:00", endereco: "Rua", pagamento: "PIX", observacoes: "", status: "CONFIRMADO" }).includes("#1048"));
t("estoque reserva não negativa direto", estoque.novoEstoque(10, "reserva", 5).ok === true);

// Fiscal: máquina de status + validações (nunca autoriza sem provedor)
t("fiscal final não sai", fiscal.podeTransitarFiscal("autorizada", "cancelada") === false);
t("fiscal processando autoriza", fiscal.podeTransitarFiscal("em_processamento", "autorizada") === true);
t("fiscal não pula fila", fiscal.podeTransitarFiscal("pendente", "autorizada") === false);
t("fiscal produto ok", fiscal.produtoFiscalOk({ ncm: "19059090", cst: "00" }) === true);
t("fiscal produto sem ncm", fiscal.produtoFiscalOk({ cst: "00" }) === false);
t("fiscal produto sem tributo", fiscal.produtoFiscalOk({ ncm: "19059090" }) === false);
t("fiscal empresa incompleta", fiscal.empresaConfigurada(null).ok === false);
t("fiscal empresa sem modelo", fiscal.empresaConfigurada({ razao_social: "X", cnpj: "Y", modelo_padrao: "", provedor: "Z" }).ok === false);

// Entrega: motivos alinhados ao enum atraso_motivo do banco (0044/0047)
t("motivos cabem no enum", entrega.MOTIVO_ATRASO.every((m) => ["transito","chuva","veiculo","endereco","cliente_ausente","espera","acidente_bloqueio","outro"].includes(m)));
t("motivos têm rótulo", entrega.MOTIVO_ATRASO.every((m) => Boolean(entrega.MOTIVO_ATRASO_LABEL[m])));

// Edge Functions Deno: quem chama serve( precisa importar (node --check não
// pega; sem import a função quebra no boot — foi assim que a push-enviar
// nasceu, e o bot precisou completar).
{
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = "supabase/functions";
  for (const f of readdirSync(dir)) {
    let src = "";
    try { src = readFileSync(`${dir}/${f}/index.ts`, "utf8"); } catch { continue; }
    if (/[^.]serve\s*\(/.test(src)) {
      t(`edge ${f} importa serve`, /import\s*\{\s*serve\s*\}/.test(src));
    }
  }
}

// Push: base64url, extração de chaves e estado sem suporte (node = sem SW)
{
  const bytes = push.base64UrlParaBytes("SGVsbG8td29ybGRf"); // "Hello-world_"
  t("push base64url decodifica", bytes.length === 12 && bytes[0] === 72 && bytes[5] === 45);
  const fake = { endpoint: "https://fcm/end", getKey: (n) => new Uint8Array(n === "p256dh" ? [4, 1, 2] : [9]).buffer };
  const insc = push.extrairInscricao(fake);
  t("push extrai chaves", insc !== null && insc.endpoint === "https://fcm/end" && insc.p256dh.length > 0 && insc.auth.length > 0);
  t("push sem getKey é nulo", push.extrairInscricao({ endpoint: "x" }) === null);
  t("push sem endpoint é nulo", push.extrairInscricao({ endpoint: "", getKey: () => new ArrayBuffer(1) }) === null);
  t("push node sem suporte", push.suportePush() === false && push.estadoPush() === "nao-suportado");
  // avisarStatus: push entregue → sem WhatsApp; sem push/sem janela → sem popup e sem erro
  {
    const ok = { functions: { invoke: async () => ({ data: { enviados: 1 } }) } };
    const vazio = { functions: { invoke: async () => ({ data: { enviados: 0 } }) } };
    const quebra = { functions: { invoke: async () => { throw new Error("x"); } } };
    t("push entregue true", (await push.notificarPush(ok, "p1", "em_rota")) === true);
    t("push zerado false", (await push.notificarPush(vazio, "p1", "em_rota")) === false);
    t("push erro false", (await push.notificarPush(quebra, "p1", "em_rota")) === false);
    t("push sem args false", (await push.notificarPush(ok, "", "")) === false);
    await push.avisarStatus(ok, { id: "p1", telefone: "159" }, "em_rota", "oi");
    await push.avisarStatus(quebra, { id: "p1", telefone: "159" }, "em_rota", "oi");
    t("avisarStatus nunca quebra", true);
  }
}

// Banco: loops de itens (0042 reserva, 0043 fritura) ignoram combo avulso
// (produto_id NULL) — sem isso, confirmar QUALQUER combo abortava.
{
  const { readFileSync } = await import("node:fs");
  for (const f of ["0042_estoque_reserva_fefo.sql", "0043_fritura_fila.sql", "0048_combo_sem_produto.sql"]) {
    const sql = readFileSync(`drizzle/migrations/${f}`, "utf8");
    const loops = [...sql.matchAll(/FOR\s+v_item\s+IN[\s\S]*?LOOP/gi)];
    t(`${f} filtra produto nulo (${loops.length} loop(s))`, loops.length > 0 && loops.every((m) => /produto_id\s+IS\s+NOT\s+NULL/i.test(m[0])));
  }
  // Banco: ON CONFLICT com alvo precisa da UNIQUE correspondente (0043/0049,
  // 0028/0049) — sem ela, o DO NOTHING nunca dispara e reaplicar duplica.
  const f43 = readFileSync("drizzle/migrations/0043_fritura_fila.sql", "utf8");
  const f49 = readFileSync("drizzle/migrations/0049_dedup_uniques.sql", "utf8");
  const f28 = readFileSync("drizzle/migrations/0028_crm_experiencia.sql", "utf8");
  t("fritura 1 linha por pedido+produto", /UNIQUE\s*\(\s*pedido_id\s*,\s*produto_id\s*\)/i.test(f43) && /UNIQUE\s*\(\s*pedido_id\s*,\s*produto_id\s*\)/i.test(f49));
  t("ajuda sem duplicar reaplicando", /UNIQUE\s*\(\s*categoria\s*,\s*titulo\s*\)/i.test(f28) && /UNIQUE\s*\(\s*categoria\s*,\s*titulo\s*\)/i.test(f49));
  // Fritura em BLOCOS no SQL (0052) igual ao app — o linear dava 5s p/ 1un.
  // E usa o campo do admin (tempo_fritura_s, 0036), não a coluna sem UI.
  const f52 = readFileSync("drizzle/migrations/0052_tempo_fritura_blocos.sql", "utf8");
  t("SQL frita em blocos", /CEIL\s*\(\s*GREATEST/i.test(f52) && !/\/\s*v_base_qtd\s*\*\s*v_base_seg/i.test(f52));
  t("SQL usa tempo do admin", /COALESCE\s*\(\s*tempo_fritura_s/i.test(f52));
  // Histórico: dono insere no próprio pedido (0053) — sem isso o nascimento
  // via checkout caía no catch silencioso e o ciclo perdia a origem.
  const f53 = readFileSync("drizzle/migrations/0053_historico_dono.sql", "utf8");
  const f23 = readFileSync("drizzle/migrations/0023_base_operacional.sql", "utf8");
  t("dono registra próprio histórico", /p\.user_id\s*=\s*auth\.uid\(\)/.test(f53) && /p\.user_id\s*=\s*auth\.uid\(\)/.test(f23));
  // Estoque: regra única 0030x0042 (0050) — sem ela, produtos.estoque caía 2x
  // por venda (checkout + confirmação) e o cancel restaurava errado.
  const f50 = readFileSync("drizzle/migrations/0050_estoque_unico.sql", "utf8");
  t("0050 chama 0030 antes dos lotes", /liberar_reserva_atomica\s*\(\s*p_pedido_id\s*\)/.test(f50));
  t("0050 trilha sem rebaixar (0030 dona)", /p_atualizar_estoque\s+boolean\s+DEFAULT\s+true/i.test(f50) && /NOT\s+v_(ja|tem)_0030/.test(f50));
  t("0050 tolera 0030 ausente (legado)", /EXCEPTION\s+WHEN\s+undefined_(function|table)/i.test(f50));
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
