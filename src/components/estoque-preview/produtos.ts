// Cadastro único da demonstração. Importações do catálogo são somente de tipos,
// pois catalog.ts também contém hooks com consultas reais, que não montamos aqui.
import { PASSO_COMBO } from "@/lib/totals";
import type { ProdutoDemo, Resultado, SalgadosState } from "./salgados";

// Valores fictícios; mesma distinção comercial do checkout: preço avulso no
// produto, preço do combo por categoria (nunca um estoque ou preço por sabor).
export const CATEGORIAS_PRODUTO_DEMO = [
  { nome: "Fritos", comboPrecoUnit: 1.6 },
  { nome: "Assados", comboPrecoUnit: 2.3 },
  { nome: "Bebidas", comboPrecoUnit: null },
  { nome: "Outros", comboPrecoUnit: null },
] as const;
export const normalizarNome = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
export const precoComercialDemo = (p: ProdutoDemo) =>
  p.tipoVenda === "combo_50"
    ? (CATEGORIAS_PRODUTO_DEMO.find((c) => c.nome === p.categoria)?.comboPrecoUnit ?? p.preco)
    : p.preco;
export const quantidadeVendaDemo = (p: ProdutoDemo) =>
  p.tipoVenda === "combo_50" ? PASSO_COMBO : 1;

export function salvarProdutoDemo(
  s: SalgadosState,
  operacaoId: string,
  dados: ProdutoDemo,
  modo: "novo" | "editar",
): Resultado<SalgadosState> {
  if (!operacaoId.trim() || s.processadas.includes(operacaoId))
    return { ok: false, erro: "Cadastro já registrado ou sem identificador de operação." };
  const anterior = s.produtos.find((p) => p.id === dados.id);
  if (!dados.id.trim() || (modo === "novo" ? !!anterior : !anterior))
    return {
      ok: false,
      erro: "Identificador duplicado ou produto não encontrado. Nenhum cadastro foi alterado.",
    };
  const nome = dados.nome.trim().replace(/\s+/g, " ");
  if (!nome || !CATEGORIAS_PRODUTO_DEMO.some((c) => c.nome === dados.categoria))
    return { ok: false, erro: "Informe o nome e uma categoria cadastrada." };
  if (
    !["frito", "assado", "outro"].includes(dados.preparo) ||
    !["salgado_congelado", "bebida", "outro"].includes(dados.natureza) ||
    !["unidade", "combo_50"].includes(dados.tipoVenda) ||
    typeof dados.ativo !== "boolean"
  )
    return {
      ok: false,
      erro: "Classificação, preparo, modalidade comercial e situação são obrigatórios.",
    };
  if (
    dados.natureza === "salgado_congelado" &&
    (!dados.sabor.trim() || dados.categoria === "Bebidas")
  )
    return { ok: false, erro: "Salgados exigem sabor e não podem pertencer a Bebidas." };
  if (
    dados.tipoVenda === "combo_50" &&
    (dados.natureza !== "salgado_congelado" ||
      !CATEGORIAS_PRODUTO_DEMO.find((c) => c.nome === dados.categoria)?.comboPrecoUnit)
  )
    return { ok: false, erro: "Combos exigem salgado e categoria com preço de combo configurado." };
  if (
    anterior?.natureza === "salgado_congelado" &&
    dados.natureza !== anterior.natureza &&
    (s.lotes.some((l) => l.produto_id === dados.id) ||
      s.reservas.some((r) => r.produtoId === dados.id))
  )
    return {
      ok: false,
      erro: "Produto com lotes ou reservas não pode ser reclassificado. Seu estoque e histórico devem ser preservados.",
    };
  if (
    !Number.isFinite(dados.preco) ||
    dados.preco <= 0 ||
    !Number.isSafeInteger(Math.round(dados.preco * 100)) ||
    Math.abs(dados.preco * 100 - Math.round(dados.preco * 100)) > 1e-7
  )
    return { ok: false, erro: "Informe preço positivo em reais, com até duas casas decimais." };
  if (!Number.isSafeInteger(dados.minimo) || dados.minimo < 0)
    return { ok: false, erro: "O mínimo deve ser uma quantidade inteira não negativa." };
  if (s.produtos.some((p) => p.id !== dados.id && normalizarNome(p.nome) === normalizarNome(nome)))
    return { ok: false, erro: "Já existe um produto com este nome, mesmo que esteja inativo." };
  const produto = {
    ...dados,
    nome,
    sabor: dados.sabor.trim(),
    descricao: dados.descricao.trim(),
    preco: Math.round(dados.preco * 100) / 100,
  };
  const novo = structuredClone(s);
  novo.produtos = anterior
    ? novo.produtos.map((p) => (p.id === produto.id ? produto : p))
    : [...novo.produtos, produto];
  novo.processadas.push(operacaoId);
  // Sem lote, reserva ou saldo criado pelo cadastro. O físico é sempre derivado
  // dos lotes existentes e permanece intacto inclusive na edição/inativação.
  return {
    ok: true,
    estado: novo,
    mensagem: anterior
      ? "Cadastro demonstrativo atualizado; identificador e estoque preservados."
      : dados.natureza === "salgado_congelado"
        ? "Produto demonstrativo cadastrado. Já aparece no estoque com físico zero."
        : "Produto demonstrativo cadastrado, sem vínculo com o estoque de salgados.",
  };
}
