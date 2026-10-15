// Teste puro de OFX/CSV + sugestão de vínculo (sem banco).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { parseOFX, parseCSVExtrato, numeroBR, sugerirVinculo } = await import("@/lib/ofx.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261010
<TRNAMT>46.00
<FITID>abc123
<MEMO>PIX recebido Joao
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261011
<TRNAMT>-350.00
<FITID>def456
<MEMO>Conta de luz
</STMTTRN>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const txs = parseOFX(OFX);
ok(txs.length === 2, "OFX: 2 lançamentos");
ok(txs[0].valor === 46 && txs[0].data === "2026-10-10" && txs[0].referencia === "abc123", "OFX: crédito parsed");
ok(txs[1].valor === -350 && txs[1].descricao === "Conta de luz", "OFX: débito parsed");
ok(parseOFX("lixo").length === 0, "OFX inválido vazio");

ok(numeroBR("1.234,56") === 1234.56, "número pt-BR");
ok(numeroBR("46.00") === 46, "número us");
ok(numeroBR("abc") === null, "número inválido");

const CSV = `data;descricao;valor
10/10/2026;PIX recebido;46,00
11/10/2026;Conta de luz;-350,00`;
const cl = parseCSVExtrato(CSV);
ok(cl.length === 2, "CSV: 2 lançamentos");
ok(cl[0].valor === 46 && cl[0].data === "2026-10-10", "CSV: valores e data");
ok(parseCSVExtrato("data,descricao,valor\n2026-10-12,Venda,100.00").length === 1, "CSV com vírgula");

const pedidos = [{ id: "p1", numero: 1062, total: 46, pagamento_status: "pendente", created_at: "2026-10-10T12:00:00" }];
const contas = [
  { id: "c1", descricao: "Energia", valor: 350, vencimento: "2026-10-11", status: "pendente", tipo: "pagar" },
  { id: "c2", descricao: "Evento", valor: 46, vencimento: "2026-10-10", status: "pendente", tipo: "receber" },
];
const s1 = sugerirVinculo({ referencia: "x", data: "2026-10-10", valor: 46, descricao: "pix" }, pedidos, contas);
ok(s1.length >= 1 && s1[0].tipo === "pedido" && s1[0].id === "p1", "sugere pedido exato primeiro");
const s2 = sugerirVinculo({ referencia: "y", data: "2026-10-11", valor: -350, descricao: "luz" }, pedidos, contas);
ok(s2.length === 1 && s2[0].tipo === "conta" && s2[0].id === "c1", "sugere conta a pagar");
const s3 = sugerirVinculo({ referencia: "z", data: "2026-10-10", valor: 9999, descricao: "?" }, pedidos, contas);
ok(s3.length === 0, "sem candidato vai p/ manual");
const pagos = [{ id: "p9", numero: 1, total: 46, pagamento_status: "pago", created_at: "2026-10-10T12:00:00" }];
ok(sugerirVinculo({ referencia: "w", data: "2026-10-10", valor: 46, descricao: "pix" }, pagos, []).length === 0, "ignora pedido já pago");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nofx: parser e sugestão passando.");
