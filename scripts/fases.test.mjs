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
t("endereço com e sem acento", watts.renderTemplate("{{endereco}}|{{endereço}}", { endereco: "Rua A, 123" }) === "Rua A, 123|Rua A, 123");
t("alias preserva original", watts.renderTemplate("{{endereco}}", { endereco: "Rua B" }) === "Rua B");

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

// Motor de produção real (Fase 1.6): MAX dos processos presentes, sem +10
// automático de assado, buffer separado do técnico. Lógica pura, sem banco.
{
  const motor = await import("@/lib/motor-producao.ts");
  const F = (nome, quantidade, categoriaSlug) => ({ nome, quantidade, categoriaSlug });
  const FRITO = "salgados-fritos";
  const ASSADO = "salgados-assados";
  // Obrigatórios A–H (§22)
  t("A 100 fritos + assado = 10", motor.calcularProducao([F("Coxinha", 100, FRITO), F("Esfiha", 50, ASSADO)]).tecnicoMin === 10);
  t("B 200 fritos + assado = 14", motor.calcularProducao([F("Coxinha", 200, FRITO), F("Esfiha", 50, ASSADO)]).tecnicoMin === 14);
  t("C 300 fritos + assado = 21", motor.calcularProducao([F("Coxinha", 300, FRITO), F("Esfiha", 50, ASSADO)]).tecnicoMin === 21);
  t("D somente assado = 10", motor.calcularProducao([F("Esfiha", 30, ASSADO)]).tecnicoMin === 10);
  t("E pastel + assado = MAX(4,10)", motor.calcularProducao([F("Pastel de carne", 100, "mini-pasteis"), F("Esfiha", 50, ASSADO)]).tecnicoMin === 10);
  t("F frito + pastel + assado = 14", motor.calcularProducao([F("Coxinha", 200, FRITO), F("Pastel de carne", 100, "mini-pasteis"), F("Esfiha", 100, ASSADO)]).tecnicoMin === 14);
  const g = motor.calcularProducao([F("Coxinha", 600, FRITO)]);
  t("G somente frito 600 = 21 (2 fritadeiras)", g.tecnicoMin === 21 && g.fritadeiras === 2);
  t("H somente pastel 100 = 4", motor.calcularProducao([F("Pastel de carne", 100, "mini-pasteis")]).tecnicoMin === 4);
  // Limites de fritadeira (§23): 300/301/1000/1001, teto 3
  t("300 → 1 fritadeira", motor.fritadeirasParaProducao(300) === 1);
  t("301 → 2 fritadeiras", motor.fritadeirasParaProducao(301) === 2);
  t("1000 → 2 fritadeiras", motor.fritadeirasParaProducao(1000) === 2);
  t("1001 → 3 fritadeiras", motor.fritadeirasParaProducao(1001) === 3);
  t("1200 → teto 3", motor.fritadeirasParaProducao(1200) === 3 && motor.calcularProducao([F("Coxinha", 1200, FRITO)]).tecnicoMin === 28);
  // Zero processos (§24): nada inventado, estado controlado
  const vazio = motor.calcularProducao([]);
  t("zero itens = vazio", vazio.tecnicoMin === null && vazio.motivoSemTempo === "vazio");
  const soBebida = motor.calcularProducao([F("Guaraná", 2, "bebidas")]);
  t("só bebida = sem-processo", soBebida.tecnicoMin === null && soBebida.motivoSemTempo === "sem-processo" && soBebida.ignorados === 2);
  const estranho = motor.calcularProducao([F("Brigadeiro", 10, "doces")]);
  t("desconhecido controlado", estranho.tecnicoMin === null && estranho.naoReconhecidos.length === 1);
  t("bebida não consome processo", motor.calcularProducao([F("Coxinha", 100, FRITO), F("Guaraná", 1, "bebidas")]).tecnicoMin === 7);
  // MAX não soma + buffer separado do técnico
  t("MAX não soma os três", motor.calcularProducao([F("Coxinha", 200, FRITO), F("Pastel", 100, "mini-pasteis"), F("Esfiha", 100, ASSADO)]).tecnicoMin === 14);
  t("pastel segue ref a validar", motor.calcularProducao([F("Pastel", 50, "mini-pasteis")]).pastelRefAValidar === true);
  t("paralelismo >1 é estimativa", motor.calcularProducao([F("Coxinha", 600, FRITO)]).paralelismoEstimado === true);
  const inicio = motor.inicioRecomendadoProducao("2026-10-08T18:00:00-03:00", 14);
  t("buffer 10 fora do técnico (18:00−14−10=17:36)", inicio.getHours() === 17 && inicio.getMinutes() === 36);
  t("janela agendado 1h30", motor.entradaJanelaProducao("2026-10-08T18:00:00-03:00").getHours() === 16 && motor.entradaJanelaProducao("2026-10-08T18:00:00-03:00").getMinutes() === 30);
  // Classificação: slug primário, nome como fallback (combo avulso)
  t("slug mini-pasteis → pastel", motor.classificarProcesso({ nome: "X", categoriaSlug: "mini-pasteis" }) === "pastel");
  t("slug mini-assados → assado", motor.classificarProcesso({ nome: "X", categoriaSlug: "mini-assados" }) === "assado");
  t("fallback nome esfiha → assado", motor.classificarProcesso({ nome: "Esfiha de carne" }) === "assado");
  t("fallback coxinha → fritura", motor.classificarProcesso({ nome: "Coxinha" }) === "fritura");
  // Alertas calculados (base fixa 12:00)
  const agora = new Date("2026-10-08T12:00:00-03:00");
  const est = (ped, tec) => motor.estadoPrazoProducao(ped, tec, agora).nivel;
  t("alerta hora-preparar", est({ status: "recebido", recebidoEm: null, solicitadoPara: "2026-10-08T12:20:00-03:00" }, 14) === "hora-preparar");
  t("alerta atenção", est({ status: "recebido", recebidoEm: "2026-10-08T11:15:00-03:00", solicitadoPara: null }, 7) === "atencao");
  t("alerta risco", est({ status: "recebido", recebidoEm: "2026-10-08T11:10:00-03:00", solicitadoPara: null }, 14) === "risco");
  t("alerta atrasado", est({ status: "em_producao", recebidoEm: "2026-10-08T10:00:00-03:00", solicitadoPara: null }, 14) === "atrasado");
  t("pronto sem alerta", est({ status: "pronto", recebidoEm: "2026-10-08T10:00:00-03:00", solicitadoPara: null }, 14) === "normal");
  // Ordenação da fila (K6.10.1-B): gravidade > instante de preparo > created_at > id
  {
    const A = { id: "a", status: "recebido", created_at: "2026-10-08T10:00:00-03:00", agendado_para: null, tecnicoMin: 14 };
    const B = { id: "b", status: "recebido", created_at: "2026-10-08T11:50:00-03:00", agendado_para: null, tecnicoMin: 7 };
    const C = { id: "c", status: "recebido", created_at: "2026-10-08T11:00:00-03:00", agendado_para: "2026-10-08T12:20:00-03:00", tecnicoMin: 14 };
    const D = { id: "d", status: "recebido", created_at: "2026-10-08T11:00:00-03:00", agendado_para: "2026-10-08T15:00:00-03:00", tecnicoMin: 14 };
    const ids = (l) => l.map((p) => p.id).join("");
    t("fila: atrasado antes de normal", ids(motor.ordenarFilaProducao([B, A], agora)) === "ab");
    t("fila: quem deve iniciar antes do agendado futuro", ids(motor.ordenarFilaProducao([D, C], agora)) === "cd");
    t("fila: gravidade > instante > created_at", ids(motor.ordenarFilaProducao([B, D, C, A], agora)) === "acbd");
    t("fila: sem agendado ordena pelo limite", ids(motor.ordenarFilaProducao([
      { id: "e", status: "recebido", created_at: "2026-10-08T11:55:00-03:00", agendado_para: null, tecnicoMin: null },
      B,
    ], agora)) === "be");
    t("fila: empate desempata por id", ids(motor.ordenarFilaProducao([
      { id: "g", status: "recebido", created_at: "2026-10-08T11:50:00-03:00", agendado_para: null, tecnicoMin: 7 },
      { id: "f", status: "recebido", created_at: "2026-10-08T11:50:00-03:00", agendado_para: null, tecnicoMin: 7 },
    ], agora)) === "fg");
    const entrada = [D, B];
    const antes = JSON.stringify(entrada);
    motor.ordenarFilaProducao(entrada, agora);
    t("fila: não muta a entrada", JSON.stringify(entrada) === antes);
  }
}

// Estoque: contrato 0030/0061/0062 como modelo executável das regras especificadas.
// NÃO é prova de banco: replica literalmente as transições dos arquivos SQL para
// travar as invariantes (ativa→liberada devolve; cancelada de fallback não devolve;
// repetição é no-op; reserva só pós-confirmação). Cenários sintéticos 100/30.
{
  const { readFileSync } = await import("node:fs");
  const f30 = readFileSync("drizzle/migrations/0030_reserva_atomica.sql", "utf8");
  const f61 = readFileSync("drizzle/migrations/0061_auth_dono_staff.sql", "utf8");
  const f62 = readFileSync("drizzle/migrations/0062_liberacao_idempotente.sql", "utf8");
  const f23 = readFileSync("drizzle/migrations/0023_base_operacional.sql", "utf8");
  const adminSrc = readFileSync("src/routes/admin.tsx", "utf8");
  const contaSrc = readFileSync("src/routes/pedido.$id.tsx", "utf8");
  // Invariantes estáticas (detectam drift entre SQL e código):
  t("0061 libera só ativa", /WHERE pedido_id = p_pedido_id AND status = 'ativa'/i.test(f61));
  t("0061 marca liberada", /SET status = 'liberada' WHERE id = r\.id/i.test(f61));
  t("0061 idempotente por SUM ativa", /AND status = 'ativa'/i.test(f61) && /v_falta := p_qtd - v_ja_reservado/i.test(f61));
  t("fallback admin marca cancelada", /reservas_estoque"\).update\(\{ status: "cancelada" \}\)/.test(adminSrc));
  t("fallback cliente marca cancelada", /reservas_estoque"\).update\(\{ status: "cancelada" \}\)/.test(contaSrc));
  t("CHECK aceita os 4 estados", /CHECK \(status IN \('ativa','liberada','consumida','cancelada'\)\)/.test(f23));
  t("0062 filtra processada_em NULL", /AND processada_em IS NULL/i.test(f62));
  t("0062 marca processada", /SET processada_em = now\(\)/i.test(f62));
  t("0030 cria ativa e debita", /VALUES \(p_pedido_id, p_produto_id, p_qtd, 'ativa'\)/.test(f30));

  // Modelo das regras especificadas (sintético, sem banco):
  function novoBanco(estoqueInicial) {
    return { estoque: estoqueInicial, reservas: [] };
  }
  // Espelha 0030/0061: cria 'ativa' debitando; retry conta SUM(ativa).
  function reservar(b, pedido, produto, qtd, confirmado) {
    if (!confirmado || qtd === null || qtd <= 0) return false;
    const ja = b.reservas.filter((r) => r.pedido === pedido && r.produto === produto && r.status === "ativa")
      .reduce((s, r) => s + r.qtd, 0);
    const falta = qtd - ja;
    if (falta <= 0) return true;
    if (b.estoque < falta) return false;
    b.estoque -= falta;
    b.reservas.push({ pedido, produto, qtd: falta, status: "ativa" });
    return true;
  }
  // Espelha 0030/0061: só 'ativa' → 'liberada', devolvendo.
  function liberar(b, pedido) {
    let n = 0;
    for (const r of b.reservas) {
      if (r.pedido === pedido && r.status === "ativa") {
        r.status = "liberada";
        b.estoque += r.qtd;
        n += 1;
      }
    }
    return n;
  }
  // Espelha fallbacks admin/cliente: marca 'cancelada' SEM devolver.
  function fallbackCancelar(b, pedido) {
    let n = 0;
    for (const r of b.reservas) {
      if (r.pedido === pedido && r.status === "ativa") { r.status = "cancelada"; n += 1; }
    }
    return n;
  }
  // Espelha 0062: processa cada reserva 1x (flag processada).
  function liberarLotes(b, pedido, processadas) {
    let devolvidos = 0;
    for (const r of b.reservas) {
      if (r.pedido === pedido && !processadas.has(r)) { processadas.add(r); devolvidos += r.qtd; }
    }
    return devolvidos;
  }
  // 100 inicial, confirma 30:
  {
    const b = novoBanco(100);
    t("estoque: confirma 30 de 100", reservar(b, "p1", "coxinha", 30, true) === true && b.estoque === 70);
    t("estoque: cancela após confirma devolve", liberar(b, "p1") === 1 && b.estoque === 100);
  }
  // Cancela antes da confirmação: sem reserva, nada muda:
  {
    const b = novoBanco(100);
    t("estoque: sem confirmação não reserva", reservar(b, "p1", "coxinha", 30, false) === false && b.estoque === 100 && liberar(b, "p1") === 0);
  }
  // Liberação repetida é no-op:
  {
    const b = novoBanco(100);
    reservar(b, "p1", "coxinha", 30, true);
    t("estoque: 1ª liberação devolve", liberar(b, "p1") === 1 && b.estoque === 100);
    t("estoque: 2ª liberação no-op", liberar(b, "p1") === 0 && b.estoque === 100);
  }
  // Retry de reserva é idempotente (0061):
  {
    const b = novoBanco(100);
    reservar(b, "p1", "coxinha", 30, true);
    t("estoque: retry não debita de novo", reservar(b, "p1", "coxinha", 30, true) === true && b.estoque === 70);
  }
  // Concorrência 0030 (serializada): 2 pedidos de 30 com estoque 30:
  {
    const b = novoBanco(30);
    const r1 = reservar(b, "p1", "coxinha", 30, true);
    const r2 = reservar(b, "p2", "coxinha", 30, true);
    t("estoque: concorrência só 1 vence", r1 === true && r2 === false && b.estoque === 0);
  }
  // Divergência cancelada: fallback sem RPC prende o saldo:
  {
    const b = novoBanco(100);
    reservar(b, "p1", "coxinha", 30, true);
    t("estoque: fallback marca cancelada sem devolver", fallbackCancelar(b, "p1") === 1 && b.estoque === 70);
    t("estoque: liberar após cancelada não recredita", liberar(b, "p1") === 0 && b.estoque === 70);
  }
  // Reserva antiga + 0062: processa 1x:
  {
    const b = novoBanco(100);
    reservar(b, "p1", "coxinha", 30, true);
    liberar(b, "p1");
    const proc = new Set();
    t("estoque: 0062 processa 1x", liberarLotes(b, "p1", proc) === 30 && liberarLotes(b, "p1", proc) === 0);
  }
  // Cancela após já liberada: no-op:
  {
    const b = novoBanco(100);
    reservar(b, "p1", "coxinha", 30, true);
    liberar(b, "p1");
    t("estoque: cancela após liberada no-op", fallbackCancelar(b, "p1") === 0 && liberar(b, "p1") === 0 && b.estoque === 100);
  }
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
