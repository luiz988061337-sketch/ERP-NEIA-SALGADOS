// Dados MOCK exclusivos do Preview (/preview). Catálogo oficial de 29 itens.
// Preços = valores atuais do sistema (CSV 05/10), só visualização. Sem banco, sem venda real.
import cocaCola from "./fotos/coca-cola.jpg";
import coxinha1 from "./fotos/coxinha-1.jpg";
import bolinhaQueijo1 from "./fotos/bolinha-queijo-1.jpg";
import kibe1 from "./fotos/kibe-1.jpg";
import croquete1 from "./fotos/croquete-1.jpg";
import mixNeia from "./fotos/mix-neia.jpg";

export const PREVIEW_HERO_IMG = mixNeia;

export type PreviewProduto = {
  id: string;
  nome: string;
  categoria: string;
  preco: number | null;
  promo?: number | null;
  tipo: "combo" | "unidade";
  foto: string | null;
};

export const PREVIEW_CATEGORIAS = [
  "Todos",
  "Fritos",
  "Pastéis",
  "Assados",
  "Pizzas",
  "Empadas",
  "Combinações",
  "Bebidas",
] as const;

export const PREVIEW_PRODUTOS: PreviewProduto[] = [
  { id: "pv-coxinha-frango", nome: "Coxinha de Frango", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: coxinha1 },
  { id: "pv-bolinha-queijo", nome: "Bolinho de Queijo", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: bolinhaQueijo1 },
  { id: "pv-risoles", nome: "Risoles", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: null },
  { id: "pv-mini-bolinha-calabresa", nome: "Mini Bolinho de Calabresa", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: null },
  { id: "pv-bolinha-milho", nome: "Bolinho de Milho com Queijo", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: null },
  { id: "pv-bolinha-azeitona", nome: "Bolinho de Azeitona", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: null },
  { id: "pv-trouxinha-milho", nome: "Trouxinha de Milho com Catupiry", categoria: "Fritos", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-kibe", nome: "Kibe", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: kibe1 },
  { id: "pv-croquete", nome: "Croquete", categoria: "Fritos", preco: 1.6, tipo: "combo", foto: croquete1 },
  { id: "pv-pastel-carne", nome: "Mini Pastel de Carne", categoria: "Pastéis", preco: 44.9, tipo: "combo", foto: null },
  { id: "pv-pastel-queijo", nome: "Mini Pastel de Queijo", categoria: "Pastéis", preco: 44.9, promo: 39.9, tipo: "combo", foto: null },
  { id: "pv-pastel-pizza", nome: "Mini Pastel de Pizza", categoria: "Pastéis", preco: 46.9, tipo: "combo", foto: null },
  { id: "pv-pastel-palmito", nome: "Mini Pastel de Palmito", categoria: "Pastéis", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-esfiha-carne", nome: "Esfiha de Carne", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-esfiha-frango", nome: "Esfiha de Frango", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-esfiha-brocolis", nome: "Esfiha de Brócolis", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-enroladinho-pq", nome: "Enroladinho de Presunto e Queijo", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-trouxinha-calabresa", nome: "Trouxinha de Calabresa", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-hamburguinho", nome: "Hamburguinho", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-enroladinho-salsicha", nome: "Enroladinho de Salsicha", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-trouxinha-ricota", nome: "Trouxinha de Ricota com Zaatar", categoria: "Assados", preco: 2.3, tipo: "combo", foto: null },
  { id: "pv-pizza-calabresa", nome: "Pizza de Calabresa", categoria: "Pizzas", preco: 54.9, tipo: "combo", foto: null },
  { id: "pv-pizza-queijo", nome: "Pizza de Queijo", categoria: "Pizzas", preco: 54.9, promo: 49.9, tipo: "combo", foto: null },
  { id: "pv-pizza-pq", nome: "Pizza de Presunto e Queijo", categoria: "Pizzas", preco: 3.7, tipo: "combo", foto: null },
  { id: "pv-empada-frango", nome: "Empada de Frango", categoria: "Empadas", preco: 2.4, tipo: "combo", foto: null },
  { id: "pv-empada-palmito", nome: "Empada de Palmito", categoria: "Empadas", preco: 2.4, tipo: "combo", foto: null },
  { id: "pv-coca", nome: "Coca-Cola 2L", categoria: "Bebidas", preco: 12, tipo: "unidade", foto: cocaCola },
  { id: "pv-fanta", nome: "Fanta Laranja 2L", categoria: "Bebidas", preco: null, tipo: "unidade", foto: null },
  { id: "pv-vedete", nome: "Vedete Taubaína 2L", categoria: "Bebidas", preco: null, tipo: "unidade", foto: null },
  // Kits: só sugestão em momentos (fora dos 29 do cardápio).
  { id: "pv-kit-aniversario", nome: "Kit Aniversário 200 Mini", categoria: "Kits para Festa", preco: 329.9, tipo: "unidade", foto: null },
  { id: "pv-kit-festa", nome: "Kit Festa 100 Mini Salgados", categoria: "Kits para Festa", preco: 179.9, promo: 159.9, tipo: "unidade", foto: null },
  { id: "pv-kit-reuniao", nome: "Kit Reunião 50 Mini", categoria: "Kits para Festa", preco: 94.9, tipo: "unidade", foto: null },
];

// Momentos = experiência do Preview (sem banco, sem venda real).
export type PreviewMomento = {
  id: string;
  icone: string;
  titulo: string;
  descricao: string;
  categorias: string[];
  kitId?: string | null;
};

export const PREVIEW_MOMENTOS: PreviewMomento[] = [
  { id: "aniversario", icone: "🎂", titulo: "Aniversário", descricao: "Uma combinação variada para deixar a comemoração ainda mais especial.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"], kitId: "pv-kit-aniversario" },
  { id: "festa", icone: "🎉", titulo: "Festa", descricao: "Variedade para a mesa cheia a noite inteira.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"], kitId: "pv-kit-festa" },
  { id: "reuniao-familia", icone: "🏠", titulo: "Reunião em família", descricao: "Sabores que agradam todo mundo.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"] },
  { id: "reuniao-amigos", icone: "👥", titulo: "Reunião com amigos", descricao: "Petiscos variados para compartilhar sem complicação.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"] },
  { id: "evento-empresa", icone: "💼", titulo: "Evento / Empresa", descricao: "Apresentação caprichada para coffee e confraternizações.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"] },
  { id: "cafe-tarde", icone: "☕", titulo: "Café da tarde", descricao: "Uma seleção leve para acompanhar o café.", categorias: ["Assados", "Pastéis", "Pizzas", "Empadas", "Fritos"] },
  { id: "comemoracao", icone: "🥳", titulo: "Comemoração", descricao: "Para celebrar com uma mesa farta e variada.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"] },
  { id: "encontro", icone: "❤️", titulo: "Encontro especial", descricao: "Porções caprichadas para um momento a dois.", categorias: ["Assados", "Pastéis", "Pizzas", "Empadas", "Fritos"] },
  { id: "surpresa", icone: "✨", titulo: "Surpreenda-me", descricao: "Deixe a Néia montar uma combinação especial para você.", categorias: ["Fritos", "Assados", "Pastéis", "Pizzas", "Empadas"] },
];
