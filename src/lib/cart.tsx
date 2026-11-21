import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  escalarComponentes,
  mesclarComponentes,
  somaComponentes,
  type ComponenteCombo,
} from "./combo-componentes";
import { ajustarQuantidade, regraDoItem, type RegraQuantidade } from "./quantidade";
import { ehModoDemo } from "./demo-preview";

export type { ComponenteCombo } from "./combo-componentes";

export type TipoEntrega = "entrega" | "retirada";

export type CartItem = {
  id: string;
  nome: string;
  preco: number;
  imagem?: string | null;
  quantidade: number;
  /** uuid do produto no banco; null = item montado (combo), sem vínculo. */
  produtoId?: string | null | undefined;
  observacao?: string | null | undefined;
  /** true = combo montado: quantidade deve ser múltiplo de 50 (regra comercial). */
  combo?: boolean | undefined;
  /** Regra congelada no momento da adição (tipo de venda + unidade cadastrada). */
  regra?: RegraQuantidade | undefined;
  /**
   * Composicao estruturada do combo (produto + quantidade em mini unidades).
   * A soma deve ser igual a `quantidade`. Sem componentes, o combo e legado e
   * nao pode ser criado pela via atomica (fail-closed no servidor).
   */
  componentes?: ComponenteCombo[] | undefined;
  /** Snapshot do estoque disponível (cap de compra); opcional para retrocompat. */
  estoque?: number | null | undefined;
};

/** Detecta linha de combo — regra centralizada em totals.ts. */
export { isComboItem, ajustarParaCombo } from "./totals";
import { MINIMO_COMBO, PASSO_COMBO } from "./totals";

type CartContextValue = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantidade">, qtd?: number) => void;
  remove: (id: string) => void;
  setQuantidade: (id: string, qtd: number) => void;
  setObservacao: (id: string, obs: string) => void;
  clear: () => void;
  /** Somente no demo: traz de volta os itens fictícios após esvaziar/finalizar. */
  restaurarExemploDemo: () => void;
  subtotal: number;
  totalItens: number;
  /** Modalidade escolhida no Carrinho. null = cliente ainda não escolheu. */
  tipoEntrega: TipoEntrega | null;
  carregando: boolean;
  definirTipoEntrega: (tipo: TipoEntrega) => void;
};

const CartContext = createContext<CartContextValue | null>(null);
export const STORAGE_KEY = "neia-carrinho";
export const CHAVE_TIPO_ENTREGA = "neia-tipo-entrega";

/**
 * No preview de demonstração o carrinho começa com itens fictícios para que
 * carrinho → checkout → acompanhamento possam ser revisados sem montar um
 * pedido. A flag evita repovoar depois que o usuário esvazia o carrinho.
 * Fora do demo nada muda: o carrinho continua começando vazio.
 */
export const DEMO_SEED_FLAG = "neia-demo-carrinho-semeado";
const ITENS_CARRINHO_DEMO: CartItem[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    nome: "Coxinha de frango (demo)",
    preco: 7.9,
    produtoId: "00000000-0000-4000-8000-000000000001",
    quantidade: 50,
    combo: true,
    regra: { tipoVenda: "combo_50", passo: 50, minimo: 50, unidadeVenda: "un" },
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    nome: "Bolinho de queijo (demo)",
    preco: 6.5,
    produtoId: "00000000-0000-4000-8000-000000000002",
    quantidade: 50,
    combo: true,
    regra: { tipoVenda: "combo_50", passo: 50, minimo: 50, unidadeVenda: "un" },
  },
];

/** Normaliza o carrinho persistido sem alterar regras comerciais. */
export function restaurarCarrinho(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is CartItem => {
        if (!item || typeof item !== "object") return false;
        const i = item as Partial<CartItem>;
        return (
          typeof i.id === "string" &&
          typeof i.nome === "string" &&
          Number.isFinite(i.preco) &&
          (Number.isFinite(i.quantidade) || typeof i.quantidade === "number")
        );
      })
      .map((i) => {
        // Aceita apenas metadados de regra bem formados; o resto é ignorado.
        // A autoridade final continua sendo o cadastro, revalidada no checkout.
        const r = i.regra;
        if (r?.tipoVenda !== "combo_50" && r?.tipoVenda !== "unidade") {
          return r ? { ...i, regra: undefined } : i;
        }
        return { ...i, regra: regraDoItem({ regra: r }) };
      });
  } catch {
    return [];
  }
}

export function serializarCarrinho(items: CartItem[]): string {
  return JSON.stringify(items);
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Estado inicial vazio no SSR e no cliente evita hydration mismatch. A
  // restauração acontece no efeito, e a gravação só depois dela — assim um
  // estado vazio nunca apaga os itens armazenados (nem na dupla montagem do
  // TanStack Start).
  const [items, setItems] = useState<CartItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega | null>(null);

  useEffect(() => {
    try {
      const restaurados = restaurarCarrinho(window.localStorage.getItem(STORAGE_KEY));
      if (restaurados.length > 0) {
        setItems(restaurados);
      } else if (ehModoDemo() && !window.localStorage.getItem(DEMO_SEED_FLAG)) {
        window.localStorage.setItem(DEMO_SEED_FLAG, "1");
        setItems(ITENS_CARRINHO_DEMO);
      }
      const tipo = window.localStorage.getItem(CHAVE_TIPO_ENTREGA);
      if (tipo === "entrega" || tipo === "retirada") setTipoEntrega(tipo);
    } catch {
      /* ignore */
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (carregando) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializarCarrinho(items));
    } catch {
      /* ignore */
    }
  }, [items, carregando]);

  useEffect(() => {
    if (carregando || !tipoEntrega) return;
    try {
      window.localStorage.setItem(CHAVE_TIPO_ENTREGA, tipoEntrega);
    } catch {
      /* ignore */
    }
  }, [tipoEntrega, carregando]);

  const add = useCallback((item: Omit<CartItem, "quantidade">, qtd = 1) => {
    // Regra por produto: prontos = passo 50; congelados/bebidas = passo da
    // unidade comercial cadastrada. Nunca entra 1, 60 ou 77 num combo.
    const regra = regraDoItem(item as CartItem);
    const combo = regra.tipoVenda === "combo_50";
    let quantidade = ajustarQuantidade(qtd, regra);
    if (item.estoque != null) {
      const max = combo ? Math.max(0, Math.floor(item.estoque / 50) * 50) : Math.max(0, Math.floor(item.estoque));
      quantidade = Math.min(quantidade, Math.max(0, max));
      if (combo && quantidade < MINIMO_COMBO) return;
      if (quantidade <= 0) return;
    }

    // A composicao informada precisa fechar com o total efetivamente aceito.
    // Se veio de um total diferente (ex.: cap de estoque), reescala em vez de
    // gravar uma composicao que nao soma o item.
    let novoItem: Omit<CartItem, "quantidade"> = item;
    if (item.componentes?.length) {
      const soma = somaComponentes(item.componentes);
      if (soma > 0) {
        novoItem = { ...item, componentes: escalarComponentes(item.componentes, soma, quantidade) };
      }
    }

    setItems((prev) => {
      const found = prev.find((i) => i.id === item.id);
      if (found) {
        let somado = found.quantidade + quantidade;
        const regraFound = regraDoItem(found);
        if (found.estoque != null) {
          const max =
            regraFound.tipoVenda === "combo_50"
              ? Math.max(0, Math.floor(found.estoque / PASSO_COMBO) * PASSO_COMBO)
              : Math.max(0, Math.floor(found.estoque));
          somado = Math.min(somado, max);
        }
        const total = ajustarQuantidade(somado, regraFound);
        const componentes = novoItem.componentes?.length
          ? (() => {
              const combinados = mesclarComponentes(found.componentes, novoItem.componentes);
              const soma = somaComponentes(combinados);
              return soma > 0 ? escalarComponentes(combinados, soma, total) : undefined;
            })()
          : found.componentes;
        return prev.map((i) => (i.id === item.id ? { ...i, quantidade: total, componentes } : i));
      }
      return [...prev, { ...novoItem, quantidade }];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setQuantidade = useCallback((id: string, qtd: number) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.id !== id) return [i];
        let n = Math.floor(Number(qtd) || 0);
        if (n <= 0) return [];
        const regra = regraDoItem(i);
        if (i.estoque != null) {
          const desejado = n;
          const max =
            regra.tipoVenda === "combo_50"
              ? Math.max(0, Math.floor(i.estoque / PASSO_COMBO) * PASSO_COMBO)
              : Math.max(0, Math.floor(i.estoque));
          if (max <= 0) {
            toast.warning(`${i.nome} está sem estoque no momento.`);
            return [i];
          }
          if (regra.tipoVenda === "combo_50" && max < MINIMO_COMBO) {
            toast.warning(`Estoque insuficiente para combo de ${i.nome} (mínimo ${MINIMO_COMBO}un).`);
            return [i];
          }
          n = Math.min(n, max);
          if (n < desejado) toast.warning(`Estoque máximo disponível: ${max} unidades.`);
        }
        const total = ajustarQuantidade(n, regra);
        const componentes = i.componentes?.length
          ? escalarComponentes(i.componentes, i.quantidade, total)
          : i.componentes;
        return [{ ...i, quantidade: total, componentes }];
      }),
    );
  }, []);

  const setObservacao = useCallback((id: string, obs: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, observacao: obs.slice(0, 200) } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const restaurarExemploDemo = useCallback(() => {
    if (!ehModoDemo()) return;
    try {
      window.localStorage.setItem(DEMO_SEED_FLAG, "1");
    } catch {
      /* ignore */
    }
    setItems(ITENS_CARRINHO_DEMO);
  }, []);
  const definirTipoEntrega = useCallback((tipo: TipoEntrega) => setTipoEntrega(tipo), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
    const totalItens = items.reduce((acc, i) => acc + i.quantidade, 0);
    return {
      items,
      add,
      remove,
      setQuantidade,
      setObservacao,
      clear,
      restaurarExemploDemo,
      subtotal,
      totalItens,
      tipoEntrega,
      carregando,
      definirTipoEntrega,
    };
  }, [items, add, remove, setQuantidade, setObservacao, clear, restaurarExemploDemo, tipoEntrega, carregando, definirTipoEntrega]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
