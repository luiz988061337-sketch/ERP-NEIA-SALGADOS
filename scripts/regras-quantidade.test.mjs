import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

process.chdir("C:/Users/User/ERP-NEIA-SALGADOS");
register(pathToFileURL("C:/Users/User/ERP-NEIA-SALGADOS/scripts/alias-loader.mjs").href);

const { regraQuantidade, regraDoItem, quantidadeValida, ajustarQuantidade } = await import(
  "@/lib/quantidade.ts"
);
const { calcTotals } = await import("@/lib/totals.ts");

// Espelho de restaurarCarrinho/serializarCarrinho (cart.tsx é .tsx com JSX e
// não pode ser importado no Node; a lógica é JSON + filtro + regraDoItem).
const serializarCarrinho = (items) => JSON.stringify(items);
const restaurarCarrinho = (raw) => {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) =>
        i &&
        typeof i === "object" &&
        typeof i.id === "string" &&
        typeof i.nome === "string" &&
        Number.isFinite(i.preco) &&
        Number.isFinite(i.quantidade),
      )
      .map((i) => {
        const r = i.regra;
        if (r?.tipoVenda !== "combo_50" && r?.tipoVenda !== "unidade") {
          return r ? { ...i, regra: undefined } : i;
        }
        return { ...i, regra: regraDoItem({ regra: r }) };
      });
  } catch {
    return [];
  }
};

let ok = 0;
const conferir = (nome, fn) => {
  try {
    fn();
    ok += 1;
    console.log(`OK   ${nome}`);
  } catch (e) {
    console.log(`FALHA ${nome}: ${e.message}`);
    process.exitCode = 1;
  }
};

// Espelha o stepper da UI (carrinho.tsx): passo vem da regra, não de constante global.
const subir = (qtd, regra) => ajustarQuantidade(qtd + regra.passo, regra);
const descer = (qtd, regra) => {
  const nova = qtd - regra.passo;
  if (nova <= 0) return { erro: "lixeira" };
  if (regra.tipoVenda === "combo_50" && nova < regra.minimo) return { erro: "minimo" };
  return { valor: nova };
};

// --- Cadastros fictícios (sem tocar no banco real) ---
const pronto = regraQuantidade({ tipo_venda: "combo_50", unidade_medida: "un" }, "mini-fritos");
const congelado = regraQuantidade({ tipo_venda: "unidade", unidade_medida: "un" }, "mini-congelados");
const congeladoPacote = regraQuantidade({ tipo_venda: "unidade", unidade_medida: "pacote" }, "mini-congelados");
const bebida = regraQuantidade({ tipo_venda: "unidade", unidade_medida: "un" }, "bebidas");

conferir("pronto: passo/minimo = 50", () => {
  assert.equal(pronto.tipoVenda, "combo_50");
  assert.equal(pronto.passo, 50);
  assert.equal(pronto.minimo, 50);
  assert.equal(pronto.ambiguidade, undefined);
});
conferir("congelado e bebida: passo 1, sem mínimo de 50", () => {
  for (const r of [congelado, congeladoPacote, bebida]) {
    assert.equal(r.tipoVenda, "unidade");
    assert.equal(r.passo, 1);
    assert.equal(r.minimo, 1);
  }
});
conferir("unidade de venda cadastrada é preservada (un/pacote)", () => {
  assert.equal(congelado.unidadeVenda, "un");
  assert.equal(congeladoPacote.unidadeVenda, "pacote");
});

// --- 1. Salgados prontos: 50 → 100 → 150 ---
conferir("prontos: 50 → 100 → 150 (incremento de 50)", () => {
  let q = 50;
  q = subir(q, pronto);
  assert.equal(q, 100);
  q = subir(q, pronto);
  assert.equal(q, 150);
});
// --- 2. Salgados prontos: 100 → 50 ---
conferir("prontos: 100 → 50 (botão menos reduz exatamente 50)", () => {
  assert.deepEqual(descer(100, pronto), { valor: 50 });
  // 50 → menos chega a 0: a UI bloqueia e orienta usar a lixeira.
  assert.deepEqual(descer(50, pronto), { erro: "lixeira" });
});
// --- 7. Rejeição de quantidades inválidas de prontos ---
conferir("prontos: rejeita 0/49/51/60/77 e normaliza para múltiplo", () => {
  for (const invalida of [0, 49, 51, 60, 77, 99]) {
    assert.equal(quantidadeValida(invalida, pronto), false, `${invalida} deveria ser inválida`);
  }
  for (const valida of [50, 100, 150, 200]) {
    assert.equal(quantidadeValida(valida, pronto), true, `${valida} deveria ser válida`);
  }
  assert.equal(ajustarQuantidade(1, pronto), 50);
  assert.equal(ajustarQuantidade(60, pronto), 100);
  assert.equal(ajustarQuantidade(77, pronto), 100);
  assert.equal(quantidadeValida(50.5, pronto), false);
});

// --- 3/4. Congelados: 1 → 2 → 3 → 2 → 1 ---
conferir("congelados: 1 → 2 → 3 → 2 → 1 (passo 1)", () => {
  let q = 1;
  assert.equal((q = subir(q, congelado)), 2);
  assert.equal((q = subir(q, congelado)), 3);
  assert.deepEqual(descer(q, congelado), { valor: 2 });
  assert.deepEqual(descer(2, congelado), { valor: 1 });
  assert.equal(quantidadeValida(3, congelado), true);
  assert.equal(quantidadeValida(60, congelado), true, "congelado não é forçado a múltiplo de 50");
});
conferir("congelado em pacote: incrementa 1 pacote por vez", () => {
  assert.equal(subir(1, congeladoPacote), 2);
  assert.deepEqual(descer(3, congeladoPacote), { valor: 2 });
  assert.equal(congeladoPacote.unidadeVenda, "pacote");
});
// --- 5. Bebidas: 1 → 2 ---
conferir("bebidas: 1 → 2 (passo 1, sem múltiplo de 50)", () => {
  assert.equal(subir(1, bebida), 2);
  assert.equal(quantidadeValida(1, bebida), true);
  assert.equal(quantidadeValida(2, bebida), true);
});

// --- Ambiguidade de cadastro registrada, sem presumir congelado individual ---
conferir("ambiguidade: cadastro combo_50 em categoria congelada é sinalizada", () => {
  const ambiguo = regraQuantidade(
    { tipo_venda: "combo_50", unidade_medida: "pacote" },
    "mini-congelados",
  );
  // A regra cadastrada prevalece; não presumimos venda individual.
  assert.equal(ambiguo.tipoVenda, "combo_50");
  assert.equal(ambiguo.passo, 50);
  assert.equal(ambiguo.unidadeVenda, "pacote");
  assert.match(ambiguo.ambiguidade ?? "", /conferir unidade de venda/);
});
conferir("fallback por slug quando tipo_venda não veio no cadastro", () => {
  const semTipo = regraQuantidade({}, "bebidas");
  assert.equal(semTipo.tipoVenda, "unidade");
  const semTipoCong = regraQuantidade({}, "salgados-congelados");
  assert.equal(semTipoCong.tipoVenda, "unidade");
  const semTipoPronto = regraQuantidade({}, "mini-fritos");
  assert.equal(semTipoPronto.tipoVenda, "combo_50");
});

// --- 6. Carrinho misto ---
const itensMistos = [
  { id: "p1", nome: "Coxinha pronto", preco: 1.6, quantidade: 100, produtoId: "pronto-1", regra: pronto, combo: true },
  { id: "p2", nome: "Coxinha congelada", preco: 99.9, quantidade: 3, produtoId: "cong-1", regra: congelado, combo: false },
  { id: "p3", nome: "Coca-Cola 2L", preco: 12, quantidade: 2, produtoId: "bebida-1", regra: bebida, combo: false },
];
conferir("carrinho misto: cada item validado pela sua regra", () => {
  for (const it of itensMistos) {
    assert.equal(quantidadeValida(it.quantidade, regraDoItem(it)), true, it.nome);
  }
  assert.equal(subir(itensMistos[0].quantidade, regraDoItem(itensMistos[0])), 150);
  assert.equal(subir(itensMistos[1].quantidade, regraDoItem(itensMistos[1])), 4);
  assert.equal(subir(itensMistos[2].quantidade, regraDoItem(itensMistos[2])), 3);
});
conferir("carrinho misto: totais somam preço × quantidade de cada regra", () => {
  const subtotal = itensMistos.reduce((s, i) => s + i.preco * i.quantidade, 0);
  assert.equal(subtotal.toFixed(2), (160 + 299.7 + 24).toFixed(2));
  assert.equal(calcTotals({ subtotal, taxaEntrega: 0 }).subtotal.toFixed(2), subtotal.toFixed(2));
});

// --- 8. Preservação após atualizar a página (localStorage) ---
conferir("localStorage: serializar → restaurar preserva regras e quantidades", () => {
  const restaurado = restaurarCarrinho(serializarCarrinho(itensMistos));
  assert.equal(restaurado.length, 3);
  assert.equal(restaurado[0].quantidade, 100);
  assert.equal(restaurado[0].regra?.tipoVenda, "combo_50");
  assert.equal(restaurado[0].regra?.passo, 50);
  assert.equal(restaurado[1].regra?.tipoVenda, "unidade");
  assert.equal(restaurado[1].regra?.unidadeVenda, "un");
  assert.equal(restaurado[2].regra?.unidadeVenda, "un");
  for (const it of restaurado) {
    assert.equal(quantidadeValida(it.quantidade, regraDoItem(it)), true);
  }
});

// --- Segurança: burla via localStorage/payload não muda a regra do cadastro ---
conferir("burla: combo:false + quantidade 60 continua inválido pelo cadastro", () => {
  const adulterado = { ...itensMistos[0], combo: false, regra: undefined, quantidade: 60 };
  // No checkout a regra vem do produto consultado no banco, não da flag do item.
  const cadastro = { tipo_venda: "combo_50", unidade_medida: "un" };
  const regraServidor = regraQuantidade(cadastro, "mini-fritos");
  assert.equal(regraDoItem(adulterado).tipoVenda, "unidade", "flag adulterada engana só o fallback");
  assert.equal(quantidadeValida(adulterado.quantidade, regraServidor), false);
});
conferir("burla: trocar produtoId para 'unidade' no cadastro muda a regra real", () => {
  const regraCadastro = regraQuantidade(
    { tipo_venda: "unidade", unidade_medida: "un" },
    "mini-congelados",
  );
  assert.equal(quantidadeValida(60, regraCadastro), true);
});

// --- Contrato no código-fonte (sem executar SQL) ---
const checkout = readFileSync("src/routes/checkout.tsx", "utf8");
const carrinho = readFileSync("src/routes/carrinho.tsx", "utf8");
const cart = readFileSync("src/lib/cart.tsx", "utf8");
conferir("checkout consulta tipo_venda/unidade_medida e valida pela regra do cadastro", () => {
  assert.match(checkout, /tipo_venda, unidade_medida/);
  assert.match(checkout, /regraQuantidade\(/);
  assert.match(checkout, /quantidadeValida\(i\.quantidade, regra\)/);
  assert.match(checkout, /mensagemQuantidadeInvalida\(regra\)/);
});
conferir("carrinho usa o passo da regra por produto", () => {
  assert.match(carrinho, /regrasPorProduto\.get\(item\.produtoId\)/);
  assert.match(carrinho, /const passo = regra\.passo/);
  assert.match(carrinho, /regra\.tipoVenda === "combo_50" && nova < regra\.minimo/);
});
conferir("cart usa ajustarQuantidade/regraDoItem (sem regra universal)", () => {
  assert.match(cart, /ajustarQuantidade\(qtd, regra\)/);
  assert.match(cart, /regraDoItem\(item as CartItem\)/);
  assert.match(cart, /const total = ajustarQuantidade\(n, regra\)/);
});

console.log(`\n${ok} verificações de quantidade passaram.`);
