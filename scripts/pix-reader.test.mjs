// Teste puro da regra J.1 do leitor de PIX (sem banco).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { decidirDestinoPix, normalizarValor } = await import("@/lib/pix-reader.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

ok(normalizarValor(46) === 46, "normaliza inteiro");
ok(normalizarValor(45.999999) === 46, "normaliza float");

const pedido = (id, total, extra = {}) => ({
  id,
  total,
  forma_pagamento: "pix",
  pagamento_status: "pendente",
  status: "recebido",
  ...extra,
});

// 1. Pedido único de R$46 → confirmar (exemplo do go-live: R$40 + R$6).
let r = decidirDestinoPix([pedido("p1", 46)], 46);
ok(r.acao === "confirmar" && r.pedidoId === "p1", "pedido único mesmo valor confirma");

// 2. Sem pedido → conferir.
r = decidirDestinoPix([], 46);
ok(r.acao === "conferir" && r.motivo === "sem_pedido_valor", "sem pedido vai p/ conferir");

// 3. Dois pedidos de R$46 → nunca confirma sozinho.
r = decidirDestinoPix([pedido("p1", 46), pedido("p2", 46)], 46);
ok(
  r.acao === "conferir" &&
    r.motivo === "multiplos_pedidos_mesmo_valor" &&
    r.candidatos.length === 2,
  "dois pedidos mesmo valor vão p/ conferir",
);

// 4. Divergência (46 vs 46,01) → conferir, nunca confirma.
r = decidirDestinoPix([pedido("p1", 46.01)], 46);
ok(r.acao === "conferir", "divergência de 1 centavo não confirma");

// 5. Cancelado / já pago / não-pix são ignorados.
r = decidirDestinoPix(
  [
    pedido("c1", 46, { status: "cancelado" }),
    pedido("pago", 46, { pagamento_status: "pago" }),
    pedido("din", 46, { forma_pagamento: "dinheiro" }),
  ],
  46,
);
ok(r.acao === "conferir" && r.candidatos.length === 0, "ignora cancelado/pago/dinheiro");

// 6. Um válido no meio de inválidos → confirma só o válido.
r = decidirDestinoPix([pedido("c1", 46, { status: "cancelado" }), pedido("p2", 46)], 46);
ok(r.acao === "confirmar" && r.pedidoId === "p2", "confirma único válido");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\npix-reader: todas as regras J.1 passando.");
