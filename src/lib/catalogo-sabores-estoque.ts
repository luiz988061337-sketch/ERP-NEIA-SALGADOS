export const categoriasSaboresEstoque = [
  { id: "fritos", nome: "Fritos" },
  { id: "mini-pasteis", nome: "Mini Pastéis" },
  { id: "assados", nome: "Assados" },
  { id: "empadas", nome: "Empadas" },
  { id: "mini-pizzas", nome: "Mini Pizzas" },
] as const;

export type CategoriaSaborEstoque = (typeof categoriasSaboresEstoque)[number]["id"];

export const categoriasProdutosSalgados = [
  "mini-fritos",
  "mini-assados",
  "mini-pasteis",
  "mini-pizzas",
  "mini-empadinhas",
  "mini-congelados",
  "salgados-fritos",
  "salgados-assados",
  "salgados-congelados",
  "mini-salgados",
  "fritos",
  "assados",
];

export const saboresEstoque = [
  [
    "coxinha-frango",
    "fritos",
    "Coxinha de frango",
    "Mini coxinha",
    "Mini coxinha de frango",
    "Coxinha mini",
  ],
  ["bolinha-queijo", "fritos", "Bolinha de queijo", "Mini bolinha de queijo", "Bolinho de queijo"],
  [
    "risoles-presunto-queijo",
    "fritos",
    "Risoles de presunto e queijo",
    "Risole de presunto e queijo",
    "Risoles de presunto & queijo",
    "Risoles P&Q",
  ],
  ["croquete", "fritos", "Croquete", "Mini croquete"],
  ["bolinho-calabresa", "fritos", "Bolinho de calabresa", "Bolinha de calabresa"],
  ["bolinho-milho-queijo", "fritos", "Bolinho de milho com queijo", "Bolinha de milho com queijo"],
  ["bolinho-azeitona", "fritos", "Bolinho de azeitona", "Bolinha de azeitona"],
  ["trouxinha-milho-catupiry", "fritos", "Trouxinha de milho com catupiry"],
  ["kibe", "fritos", "Kibe", "Mini kibe", "Kibe frito", "Mini kibe frito", "Quibe", "Quibe frito"],
  ["pastel-carne", "mini-pasteis", "Mini pastel de carne", "Pastel de carne"],
  ["pastel-queijo", "mini-pasteis", "Mini pastel de queijo", "Pastel de queijo"],
  ["pastel-pizza", "mini-pasteis", "Mini pastel de pizza", "Pastel de pizza"],
  ["pastel-palmito", "mini-pasteis", "Mini pastel de palmito", "Pastel de palmito"],
  ["esfirra-carne", "assados", "Esfirra de carne", "Esfiha de carne", "Mini esfiha de carne"],
  ["esfirra-frango", "assados", "Esfirra de frango", "Esfiha de frango", "Mini esfiha de frango"],
  [
    "esfirra-brocolis",
    "assados",
    "Esfirra de brócolis",
    "Esfiha de brócolis",
    "Mini esfiha de brócolis",
  ],
  ["enroladinho-presunto-queijo", "assados", "Enroladinho de presunto e queijo", "Enroladinho P&Q"],
  ["hamburguinho", "assados", "Hamburguinho", "Mini hamburguinho"],
  ["ricota-zaatar", "assados", "Ricota com zaatar", "Trouxinha de ricota com zaatar"],
  [
    "empada-palmito",
    "empadas",
    "Mini empada de palmito",
    "Mini empadinha de palmito",
    "Empadinha de palmito",
    "Empada de palmito",
  ],
  [
    "empada-frango",
    "empadas",
    "Mini empada de frango",
    "Mini empadinha de frango",
    "Empadinha de frango",
    "Empada de frango",
  ],
  ["pizza-calabresa", "mini-pizzas", "Mini pizza de calabresa"],
  [
    "pizza-queijo",
    "mini-pizzas",
    "Mini pizza de queijo",
    "Mini pizza de mussarela",
    "Mini pizza de muçarela",
  ],
  ["pizza-presunto-queijo", "mini-pizzas", "Mini pizza de presunto e queijo", "Mini pizza P&Q"],
  ["trouxinha-calabresa", "assados", "Trouxinha de calabresa"],
  ["enroladinho-salsicha", "assados", "Enroladinho de salsicha"],
] as const satisfies ReadonlyArray<readonly [string, CategoriaSaborEstoque, string, ...string[]]>;

export function normalizarNomeSabor(nome: string) {
  return nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

type ProdutoSabor = {
  id: string;
  nome: string;
  imagem_url: string | null;
  tipo_venda: string;
  unidade_medida: string;
  categorias: { slug: string };
};

export type VinculoSaborEstoque = { chave: string; produto_id: string | null };
export type OrdemSaborEstoque = { chave: string; ordem: number };

export type OperacaoSaborEstoque = {
  ativo: boolean;
  estoque: number;
  minimo: number;
  temMovimento: boolean;
  lotesTodos: {
    id: string;
    codigo: string;
    validade: string | null;
    restante: number;
    status: string;
  }[];
  lotesFefo: {
    id: string;
    codigo: string;
    validade: string | null;
    restante: number;
    status: string;
  }[];
  reservas: {
    id: string;
    pedidoId: string;
    quantidade: number;
    consumido: number;
    pendente: number;
  }[];
  fisico: number;
  reservado: number;
  disponivel: number;
};

/**
 * A ordem persistida é a fonte única da sequência. O catálogo oficial é usado
 * apenas como fallback para instalações antigas ou registros ainda não
 * classificados, sem alterar a lista aprovada.
 */
export function ordenarSaboresPorOrdem<T extends { chave: string }>(
  sabores: readonly T[],
  ordens: readonly OrdemSaborEstoque[] | null | undefined,
) {
  const posicaoOficial = new Map<string, number>(
    saboresEstoque.map(([chave], indice) => [chave, indice]),
  );
  const ordensValidas = new Map<string, number>(
    (ordens ?? [])
      .filter((item) => Number.isInteger(item.ordem) && item.ordem > 0)
      .map((item) => [item.chave, item.ordem]),
  );
  return [...sabores].sort((a, b) => {
    const pa = ordensValidas.get(a.chave);
    const pb = ordensValidas.get(b.chave);
    if (pa !== undefined || pb !== undefined) {
      if (pa === undefined) return 1;
      if (pb === undefined) return -1;
      if (pa !== pb) return pa - pb;
    }
    return (
      (posicaoOficial.get(a.chave) ?? Number.MAX_SAFE_INTEGER) -
      (posicaoOficial.get(b.chave) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

export function organizarSaboresEstoque<T extends ProdutoSabor>(
  produtos: T[],
  vinculos: VinculoSaborEstoque[] | null,
  ordens?: readonly OrdemSaborEstoque[] | null,
  operacoesPorChave?: ReadonlyMap<string, OperacaoSaborEstoque> | null,
) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const vinculosPorChave = new Map(vinculos?.map((sabor) => [sabor.chave, sabor.produto_id]));
  const sabores = ordenarSaboresPorOrdem(
    saboresEstoque.map(([chave, categoria, nome, ...apelidos]) => {
      const nomes = [nome, ...apelidos].map(normalizarNomeSabor);
      const candidatos = produtos.filter(
        (p) =>
          ["un", "unidade"].includes(p.unidade_medida) &&
          ["unidade", "combo_50"].includes(p.tipo_venda) &&
          !p.categorias.slug.includes("congelados") &&
          nomes.includes(normalizarNomeSabor(p.nome)),
      );
      const id = vinculosPorChave.get(chave);
      const produto = vinculosPorChave.has(chave)
        ? id
          ? porId.get(id)
          : undefined
        : candidatos.length === 1
          ? candidatos[0]
          : undefined;
      const fotos = new Set(
        produtos
          .filter((p) => {
            const nomeSemPacote = normalizarNomeSabor(p.nome).replace(
              /\s+\d+\s*(?:un(?:idades?)?|und)\.?$/u,
              "",
            );
            return nomes.includes(nomeSemPacote);
          })
          .flatMap((p) => (p.imagem_url ? [p.imagem_url] : [])),
      );
      const ordem = ordens?.find((item) => item.chave === chave)?.ordem;
      const operacaoProduto = produto as unknown as OperacaoSaborEstoque | undefined;
      const operacaoProdutoValida =
        operacaoProduto &&
        Array.isArray(operacaoProduto.lotesTodos) &&
        Array.isArray(operacaoProduto.reservas)
          ? operacaoProduto
          : undefined;
      const operacao = operacoesPorChave?.get(chave) ?? operacaoProdutoValida;
      return {
        chave,
        categoria,
        nome,
        ordem: ordem ?? saboresEstoque.findIndex((item) => item[0] === chave) + 1,
        produto,
        operacao,
        imagem: produto?.imagem_url ?? (fotos.size === 1 ? ([...fotos][0] ?? null) : null),
      };
    }),
    ordens,
  );
  const vinculados = new Set(sabores.flatMap((sabor) => (sabor.produto ? [sabor.produto.id] : [])));
  return { sabores, legados: produtos.filter((p) => !vinculados.has(p.id)) };
}
