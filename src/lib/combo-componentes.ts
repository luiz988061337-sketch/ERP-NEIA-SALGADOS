/**
 * Composicao estruturada de combo (montagem).
 *
 * A unidade de `quantidade` e SEMPRE a mesma unidade comercial do produto
 * (`produtos.estoque` / preco unitario): mini salgado. O nome do produto pode
 * conter "25un"/"15un" como rotulo de embalagem, mas o catalogo e o estoque
 * operam em unidades de mini salgado (ver 0038: preco por unidade).
 *
 * Nada aqui inventa composicao: o chamador precisa informar os produtos e as
 * quantidades escolhidas. A soma dos componentes deve ser igual ao total do
 * combo (multiplo de 50).
 */

export type ComponenteCombo = {
  produtoId: string;
  quantidade: number;
};

export function somaComponentes(componentes: readonly ComponenteCombo[] | null | undefined): number {
  if (!componentes?.length) return 0;
  return componentes.reduce((soma, c) => soma + Math.max(0, Math.trunc(c.quantidade)), 0);
}

/**
 * Soma componentes do mesmo produto. Necessário ao mesclar duas linhas do
 * mesmo combo no carrinho: o servidor (0095) rejeita produto duplicado, então
 * a composição precisa chegar consolidada.
 */
export function mesclarComponentes(
  ...listas: Array<readonly ComponenteCombo[] | null | undefined>
): ComponenteCombo[] {
  const porProduto = new Map<string, number>();
  for (const lista of listas) {
    for (const c of lista ?? []) {
      if (!c.produtoId || !Number.isInteger(c.quantidade) || c.quantidade <= 0) continue;
      porProduto.set(c.produtoId, (porProduto.get(c.produtoId) ?? 0) + c.quantidade);
    }
  }
  return [...porProduto.entries()]
    .map(([produtoId, quantidade]) => ({ produtoId, quantidade }))
    .sort((a, b) => a.produtoId.localeCompare(b.produtoId));
}

export function componentesValidos(
  componentes: readonly ComponenteCombo[] | null | undefined,
  total: number,
): boolean {
  if (!componentes?.length || !Number.isInteger(total) || total <= 0) return false;
  const vistos = new Set<string>();
  for (const c of componentes) {
    if (!c.produtoId || vistos.has(c.produtoId)) return false;
    if (!Number.isInteger(c.quantidade) || c.quantidade <= 0) return false;
    vistos.add(c.produtoId);
  }
  return somaComponentes(componentes) === total;
}

/**
 * Reajusta a composicao para um novo total, preservando a proporcao escolhida.
 * Usa piso + distribuicao deterministica do resto (maior parte fracionaria,
 * desempate por produtoId), portanto a soma resultante e EXATA.
 */
export function escalarComponentes(
  componentes: readonly ComponenteCombo[] | null | undefined,
  totalAtual: number,
  novoTotal: number,
): ComponenteCombo[] {
  if (!componentes?.length) return [];
  const destino = Math.max(0, Math.trunc(novoTotal));
  if (destino === 0) return [];
  const base = somaComponentes(componentes);
  if (base <= 0) return [];

  const calculados = componentes
    .filter((c) => c.produtoId && Number.isInteger(c.quantidade) && c.quantidade > 0)
    .map((c) => {
      const exato = (c.quantidade * destino) / base;
      const piso = Math.floor(exato);
      return {
        produtoId: c.produtoId,
        quantidade: piso,
        fracao: exato - piso,
      };
    });

  let resto = destino - calculados.reduce((soma, c) => soma + c.quantidade, 0);
  const ordem = [...calculados].sort(
    (a, b) => b.fracao - a.fracao || a.produtoId.localeCompare(b.produtoId),
  );
  for (let i = 0; resto > 0 && ordem.length > 0; i = (i + 1) % ordem.length) {
    ordem[i]!.quantidade += 1;
    resto -= 1;
  }

  return calculados
    .filter((c) => c.quantidade > 0)
    .map(({ produtoId, quantidade }) => ({ produtoId, quantidade }));
}
