// Testes E6: impressão por etapa (unitários + estáticos).
// PG isolado e TANCA física (E6-PG) pendentes de staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const I = await import("@/lib/impressao-etapas.ts");
const IMP = await import("@/lib/impressao.ts");

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

// Evento → ficha.
const ev = bloco("enfileirar_evento_cozinha");
ok(ev.length > 0, "E6.1 função de evento preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(ev), "E6.2 definer + search_path");
ok(/has_role\(v_uid, 'producao'\)/.test(ev) && !/atendente/.test(ev), "E6.3 só cozinha/admin");
ok(/NOT IN \('aceito', 'liberado', 'conferido', 'retirada', 'despacho'\)/.test(ev), "E6.4 allowlist de eventos");
ok(/<> 'liberado'/.test(ev) && /'ignorado'/.test(ev), "E6.5 só liberado imprime (sem duplicar)");
ok(/:ficha:liberado/.test(ev) && /ON CONFLICT \(trabalho_uuid\) DO NOTHING/.test(ev), "E6.6 uuid fixo + idempotência");
ok(/'ficha_cozinha'/.test(ev) && /'Tanca TP-550'/.test(ev), "E6.7 tipo e impressora do agente");
ok(/sem itens/.test(ev), "E6.8 sem itens bloqueia");
ok(!/pagamento_status\s*=/.test(ev) && !/SET\s+status\s*=/.test(ev.replace(/v_status text;/g, "")), "E6.9 sem tocar pedido");
// Reimpressão.
const ri = bloco("solicitar_reimpressao");
ok(ri.length > 0, "E6.10 função de reimpressão preparada");
ok(/motivo obrigatorio/.test(ri), "E6.11 motivo obrigatório");
ok(/reimpressoes = (COALESCE\(reimpressoes, 0\) \+ 1|reimpressoes \+ 1)/.test(ri), "E6.12 contador auditável");
ok(/:reimp:/.test(ri), "E6.13 nova tentativa com uuid único");
ok(/sem impressao concluida/.test(ri), "E6.14 exige base impressa");
ok(/GRANT EXECUTE ON FUNCTION public\.(enfileirar_evento_cozinha|solicitar_reimpressao)/.test(code), "E6.15 grants mínimos");
// Unitários.
ok(I.E6_IMPRESSAO_ATIVA === false, "E6.16 flag desligada");
ok(I.MAPA_EVENTO_IMPRESSAO.liberado.automatico && !I.MAPA_EVENTO_IMPRESSAO.aceito.automatico && !I.MAPA_EVENTO_IMPRESSAO.conferido.automatico, "E6.17 mapa sem auto-duplicar");
ok(I.trabalhoUuid("abc", "liberado") === "abc:ficha:liberado", "E6.18 uuid determinístico");
{
  const no = { rpc: async () => ({ data: null, error: null }) };
  const r1 = await I.enfileirarEvento(no, "x", "liberado");
  const r2 = await I.solicitarReimpressao(no, "x", "teste");
  const r3 = await I.solicitarReimpressao(no, "x", "   ");
  ok(r1.codigo === "flag-desativada" && r2.codigo === "flag-desativada", "E6.19 flags off sem rede");
  ok(!r3.ok && r3.codigo === "bloqueado", "E6.20 motivo vazio barrado no pré-check");
}

// Payload textual: 42 colunas, ASCII e preco preservado.
{
  const linha = IMP.linhaItem("(50) Coxinha de frango com catupiry", "R$ 80,00");
  ok(linha.length === IMP.LARGURA_CUPOM, "E6.21 linha de item respeita 42 colunas");
  ok(linha.endsWith("R$ 80,00"), "E6.22 nome longo nao trunca o preco");
  const cupom = IMP.textoCupom({
    numero: 1,
    dataHora: "19/10/2026 12:00",
    cliente: "Cliente Ação",
    telefone: "11999998888",
    itens: [{ qtd: 50, nome: "Coxinha de frango com catupiry", precoUnit: 1.6 }],
    totalUnidades: 50,
    entregaRetirada: "ENTREGA",
    horario: "19/10/2026 18:00",
    prevista: "19/10/2026 18:00",
    endereco: "Rua das Flores, 123",
    pagamento: "Pix",
    observacoes: "",
    status: "CONFIRMADO",
  });
  ok(cupom.includes("Entrega prevista: 19/10/2026 18:00"), "E6.23 prevista aparece no cupom");
  ok(cupom.split("\n").every((l) => l.length <= IMP.LARGURA_CUPOM), "E6.24 nenhuma linha passa de 42");
  ok(!/[\u0080-\uFFFF]/.test(cupom), "E6.25 payload final e ASCII");
}

const rotaImpressao = readFileSync("src/routes/impressao.tsx", "utf8");
const rotaAdmin = readFileSync("src/routes/admin.tsx", "utf8");
ok(rotaImpressao.includes('if (erroInsert) throw new Error("Falha ao reimprimir'), "E6.26 reimpressão não reporta sucesso se a fila falhar");
ok(rotaImpressao.includes('if (erroUpdate) throw new Error("Reimpressão na fila'), "E6.27 reimpressão não reporta sucesso se a origem falhar");
ok(rotaImpressao.includes('if (error) throw new Error("Falha ao retornar'), "E6.28 nova tentativa verifica erro do banco");
ok(rotaImpressao.includes('if (error) throw new Error("Falha ao cancelar'), "E6.29 cancelamento verifica erro do banco");
ok(rotaAdmin.includes('if (erroInsert) throw new Error("Falha ao reimprimir'), "E6.30 admin de impressão não reporta reimpressão falsa");
ok(rotaAdmin.includes('if (error) throw new Error("Falha ao cancelar'), "E6.31 admin de impressão não reporta cancelamento falso");

if (falhas > 0) {
  console.error(`E6: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E6: casos passando. E6-PG (PG isolado + TANCA física): pendente de staging.");
