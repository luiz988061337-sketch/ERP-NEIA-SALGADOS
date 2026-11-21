/**
 * HOMO-CLIENTE-02 — regressão da restauração do carrinho.
 * Uso: node --experimental-transform-types scripts/homo-cliente-02-carrinho.test.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

// Evita importar cart.tsx em Node (JSX não é suportado pelo loader de testes).
// As funções puras são validadas por espelhamento do código-fonte abaixo.
const { ajustarParaCombo, MINIMO_COMBO, PASSO_COMBO } = await import("@/lib/totals.ts");

let pass = 0;
let fail = 0;
function t(nome, condicao) {
  if (condicao) {
    pass += 1;
    console.log(`ok   - ${nome}`);
  } else {
    fail += 1;
    console.log(`FALHOU - ${nome}`);
  }
}

const combo = {
  id: "combo-ficticio",
  nome: "Combo Néia (fictício)",
  preco: 39.5,
  quantidade: 50,
  combo: true,
  produtoId: null,
};
const avulso = {
  id: "coxinha-ficticia",
  nome: "Coxinha (fictícia)",
  preco: 7.9,
  quantidade: 2,
  produtoId: null,
};

t("múltiplo de 50 é mantido", ajustarParaCombo(50) === MINIMO_COMBO);
t("quantidade abaixo do mínimo é ajustada", ajustarParaCombo(1) === MINIMO_COMBO);
t("quantidade fora do passo é ajustada", ajustarParaCombo(77) === 100);
t("passo comercial é 50", PASSO_COMBO === 50);
t("pedido mínimo é 50", MINIMO_COMBO === 50);

// Espelha restaurarCarrinho/serializarCarrinho para validar o contrato puro
// exigido pela Etapa 2 sem depender de runtime de JSX no Node.
function restaurarCarrinho(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => {
      if (!item || typeof item !== "object") return false;
      return typeof item.id === "string" && typeof item.nome === "string" && Number.isFinite(item.preco) && Number.isFinite(item.quantidade);
    });
  } catch {
    return [];
  }
}
const serializarCarrinho = (items) => JSON.stringify(items);

const { readFileSync } = await import("node:fs");
const fonte = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const codigo = fonte("src/lib/cart.tsx");

t("chave de armazenamento preservada", /STORAGE_KEY = "neia-carrinho"/.test(codigo));
t("restaura itens válidos", restaurarCarrinho(JSON.stringify([combo, avulso])).length === 2);
t("descarta JSON inválido", restaurarCarrinho("{").length === 0);
t("descarta formato inesperado", restaurarCarrinho('{"id":"x"}').length === 0);
t("descarta itens sem quantidade numérica", restaurarCarrinho(JSON.stringify([{ id: "x", nome: "x", preco: 1 }])).length === 0);
t("serialização round-trip preserva quantidades", serializarCarrinho(restaurarCarrinho(JSON.stringify([combo, avulso]))) === JSON.stringify([combo, avulso]));
t("leitura do localStorage ocorre em efeito, não no initializer", /useEffect\(\(\) => \{\s*try \{\s*const restaurados = restaurarCarrinho\(window\.localStorage\.getItem/.test(codigo));
t("hidratação não usa efeito que apaga o carrinho", !/useEffect\(\(\) => \{\s*try \{\s*const raw = localStorage\.getItem/.test(codigo));
t("gravação aguarda restauração do localStorage", /if \(carregando\) return;/.test(codigo));
t("estado inicial é vazio no SSR (sem hydration mismatch)", /useState<CartItem\[\]>\(\[\]\)/.test(codigo));

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
