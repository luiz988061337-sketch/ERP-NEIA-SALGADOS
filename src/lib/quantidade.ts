import type { Produto, TipoVenda } from "./catalog";
import { ajustarParaCombo, isMultiploCombo, MINIMO_COMBO, PASSO_COMBO } from "./totals";

/**
 * Fonte única da regra de quantidade por produto.
 *
 * A autoridade é o cadastro (`tipo_venda` e `unidade_medida`). O slug da
 * categoria só entra quando o cadastro não declarou `tipo_venda`, para manter
 * compatibilidade com bancos antigos. Congelados/bebidas NÃO são presumidos
 * individualmente: se o cadastro disser `combo_50`, essa regra prevalece e a
 * ambiguidade é sinalizada para conferência (não alteramos o cadastro aqui).
 */
export type RegraQuantidade = {
  tipoVenda: TipoVenda;
  passo: number;
  minimo: number;
  /** Unidade comercial cadastrada (un, pacote, etc.) — rótulo, sem conversão. */
  unidadeVenda: string;
  ambiguidade?: string;
};

const SLUG_VENDA_UNIDADE = /congelado|kit|bebida/;

export function regraQuantidade(
  produto: Pick<Produto, "tipo_venda" | "unidade_medida"> | null | undefined,
  slugCategoria?: string | null,
): RegraQuantidade {
  const slug = (slugCategoria ?? "").toLowerCase();
  const tipo: TipoVenda =
    produto?.tipo_venda === "combo_50" || produto?.tipo_venda === "unidade"
      ? produto.tipo_venda
      : SLUG_VENDA_UNIDADE.test(slug)
        ? "unidade"
        : "combo_50";

  const unidadeVenda = String(produto?.unidade_medida ?? "un").trim() || "un";
  let ambiguidade: string | undefined;
  if (tipo === "combo_50" && SLUG_VENDA_UNIDADE.test(slug)) {
    ambiguidade = `Categoria "${slug}" com tipo_venda combo_50: regra cadastral prevalece; conferir unidade de venda.`;
  } else if (tipo === "combo_50" && unidadeVenda.toLowerCase() !== "un") {
    ambiguidade = `Unidade comercial "${unidadeVenda}" com tipo_venda combo_50: conferir se o passo de 50 se aplica à unidade cadastrada.`;
  }

  return {
    tipoVenda: tipo,
    passo: tipo === "combo_50" ? PASSO_COMBO : 1,
    minimo: tipo === "combo_50" ? MINIMO_COMBO : 1,
    unidadeVenda,
    ...(ambiguidade ? { ambiguidade } : {}),
  };
}

/** Regra guardada no item do carrinho, com fallback para o formato antigo. */
export function regraDoItem(
  item:
    | {
        regra?: RegraQuantidade | null | undefined;
        combo?: boolean | null | undefined;
        id?: string | undefined;
      }
    | null
    | undefined,
): RegraQuantidade {
  const salva = item?.regra;
  if (salva?.tipoVenda === "combo_50" || salva?.tipoVenda === "unidade") {
    return {
      tipoVenda: salva.tipoVenda,
      passo: salva.tipoVenda === "combo_50" ? PASSO_COMBO : 1,
      minimo: salva.tipoVenda === "combo_50" ? MINIMO_COMBO : 1,
      unidadeVenda: String(salva.unidadeVenda ?? "un") || "un",
      ...(salva.ambiguidade ? { ambiguidade: salva.ambiguidade } : {}),
    };
  }
  const combo = item?.combo === true || (item?.id ?? "").startsWith("combo-");
  return regraQuantidade({ tipo_venda: combo ? "combo_50" : "unidade" });
}

export function quantidadeValida(quantidade: number, regra: RegraQuantidade): boolean {
  if (!Number.isSafeInteger(quantidade)) return false;
  if (quantidade < regra.minimo) return false;
  return regra.tipoVenda === "unidade" ? true : isMultiploCombo(quantidade);
}

/** Ajusta a quantidade de entrada ao passo da regra (nunca inventa desconto). */
export function ajustarQuantidade(quantidade: number, regra: RegraQuantidade): number {
  const n = Math.floor(Number(quantidade) || 0);
  if (n <= 0) return 0;
  return regra.tipoVenda === "unidade" ? n : ajustarParaCombo(n);
}

export function mensagemQuantidadeInvalida(regra: RegraQuantidade): string {
  return regra.tipoVenda === "combo_50"
    ? `Combos são vendidos em múltiplos de ${PASSO_COMBO} unidades (mínimo ${MINIMO_COMBO}). Ajuste no carrinho.`
    : "Quantidade inválida para este produto. Ajuste no carrinho.";
}
