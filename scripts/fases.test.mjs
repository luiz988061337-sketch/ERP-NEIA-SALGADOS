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

// Fritura 50=3:30
t("50un=210s", cozinha.tempoFritura(50) === 210);
t("100un=420s", cozinha.tempoFritura(100) === 420);
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

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
