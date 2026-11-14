// Cadastro e pedidos demonstrativos: não possui saldo, estoque ou cliente de banco.
import { isMultiploCombo } from "@/lib/totals";
import { CATEGORIAS_PRODUTO_DEMO, normalizarNome } from "./produtos";
import {
  COMBO_DEMO,
  ehSalgadoCongelado,
  reservarPedido,
  type ProdutoDemo,
  type Resultado,
  type SalgadosState,
} from "./salgados";

export type ParteCombo = { produtoId: string; quantidade: number };
export type ComboDemo = {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  total: number;
  itens: ParteCombo[];
  ativo: boolean;
};
export type CombosState = { itens: ComboDemo[]; processadas: string[] };
export function criarCombosDemo(): CombosState {
  return {
    itens: [
      {
        id: "combo-festa-demo",
        nome: "Combo Festa",
        descricao: "Composição fictícia para homologação.",
        categoria: "Fritos",
        total: 100,
        itens: structuredClone(COMBO_DEMO),
        ativo: true,
      },
    ],
    processadas: [],
  };
}
export function precoCombo(c: Pick<ComboDemo, "categoria" | "total">): number | null {
  const unitario = CATEGORIAS_PRODUTO_DEMO.find((cat) => cat.nome === c.categoria)?.comboPrecoUnit;
  if (unitario == null) return null;
  const centavos = Math.round(unitario * 100) * c.total;
  return Number.isSafeInteger(centavos) ? centavos / 100 : null;
}
export function validarCombo(combo: ComboDemo, produtos: ProdutoDemo[]): string | null {
  if (!combo.nome.trim()) return "Informe o nome do combo.";
  if (!Number.isSafeInteger(combo.total) || !isMultiploCombo(combo.total))
    return "O total deve ser um múltiplo de 50 unidades.";
  if (precoCombo(combo) === null) return "Escolha uma categoria com preço de combo configurado.";
  if (typeof combo.ativo !== "boolean" || !combo.itens.length)
    return "Informe situação e pelo menos um sabor.";
  const ids = new Set<string>();
  let total = 0;
  for (const item of combo.itens) {
    const p = produtos.find((p) => p.id === item.produtoId);
    if (!p || !p.ativo || !ehSalgadoCongelado(p) || p.tipoVenda !== "combo_50")
      return "Selecione somente sabores ativos e elegíveis do cadastro de produtos.";
    if (p.categoria !== combo.categoria)
      return "Todos os sabores devem pertencer à categoria comercial do combo.";
    if (ids.has(item.produtoId)) return "Cada sabor deve aparecer uma única vez na composição.";
    if (!Number.isSafeInteger(item.quantidade) || item.quantidade <= 0)
      return "Cada sabor precisa ter quantidade inteira positiva.";
    ids.add(item.produtoId);
    total += item.quantidade;
    if (!Number.isSafeInteger(total)) return "Quantidade acima do limite permitido.";
  }
  return total !== combo.total
    ? `A composição soma ${total} unidades; deve somar ${combo.total}.`
    : null;
}
export function salvarCombo(
  s: CombosState,
  produtos: ProdutoDemo[],
  operacao: string,
  dados: ComboDemo,
  modo: "novo" | "editar",
): Resultado<CombosState> {
  if (!operacao.trim() || s.processadas.includes(operacao))
    return { ok: false, erro: "Operação já registrada ou sem identificador." };
  const anterior = s.itens.find((c) => c.id === dados.id);
  if (!dados.id.trim() || (modo === "novo" ? !!anterior : !anterior))
    return { ok: false, erro: "Identificador duplicado ou combo não encontrado." };
  const erro = validarCombo(dados, produtos);
  if (erro) return { ok: false, erro };
  if (
    s.itens.some((c) => c.id !== dados.id && normalizarNome(c.nome) === normalizarNome(dados.nome))
  )
    return { ok: false, erro: "Já existe um combo com este nome." };
  const novo = structuredClone(s),
    combo = {
      ...structuredClone(dados),
      nome: dados.nome.trim().replace(/\s+/g, " "),
      descricao: dados.descricao.trim(),
    };
  novo.itens = anterior
    ? novo.itens.map((c) => (c.id === combo.id ? combo : c))
    : [...novo.itens, combo];
  novo.processadas.push(operacao);
  return {
    ok: true,
    estado: novo,
    mensagem: "Combo salvo na demonstração. Nenhum saldo foi movimentado.",
  };
}
export function confirmarCombo(
  s: SalgadosState,
  combo: ComboDemo,
  id: string,
  pedido: string,
  quantidade: number,
): Resultado<SalgadosState> {
  if (!combo.ativo) return { ok: false, erro: "Combo inativo não pode ser confirmado." };
  const erro = validarCombo(combo, s.produtos);
  if (erro) return { ok: false, erro };
  if (!Number.isSafeInteger(quantidade) || quantidade < 1)
    return { ok: false, erro: "Informe quantidade inteira positiva de combos." };
  const itens = combo.itens.map((i) => ({ ...i, quantidade: i.quantidade * quantidade }));
  if (
    itens.some((i) => !Number.isSafeInteger(i.quantidade)) ||
    !Number.isSafeInteger(combo.total * quantidade)
  )
    return { ok: false, erro: "Quantidade acima do limite permitido." };
  // A função comum agrupa por sabor, valida tudo atomicamente e impede pedido duplicado.
  return reservarPedido(s, id, pedido, itens, `Combo ${combo.nome}`, combo.id);
}
