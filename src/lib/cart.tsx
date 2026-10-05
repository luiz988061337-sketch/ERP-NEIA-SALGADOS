import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

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
  /** Snapshot do estoque disponível (cap de compra); opcional para retrocompat. */
  estoque?: number | null | undefined;
};

/** Detecta linha de combo — regra centralizada em totals.ts. */
export { isComboItem, ajustarParaCombo } from "./totals";
import { isComboItem, MINIMO_COMBO, PASSO_COMBO, ajustarParaCombo } from "./totals";

type CartContextValue = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantidade">, qtd?: number) => void;
  remove: (id: string) => void;
  setQuantidade: (id: string, qtd: number) => void;
  setObservacao: (id: string, obs: string) => void;
  clear: () => void;
  subtotal: number;
  totalItens: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "neia-carrinho";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const add = useCallback((item: Omit<CartItem, "quantidade">, qtd = 1) => {
    // Regra dos 50 aplicada na entrada: nunca entra 1, 60 ou 77 num combo.
    const combo = isComboItem(item as CartItem);
    let quantidade = combo ? ajustarParaCombo(qtd) : Math.max(1, Math.floor(Number(qtd) || 1));
    if (item.estoque != null) {
      const max = combo ? Math.max(0, Math.floor(item.estoque / 50) * 50) : Math.max(0, Math.floor(item.estoque));
      quantidade = Math.min(quantidade, Math.max(0, max));
      if (combo && quantidade < MINIMO_COMBO) return;
      if (quantidade <= 0) return;
    }
    setItems((prev) => {
      const found = prev.find((i) => i.id === item.id);
      if (found) {
        let somado = found.quantidade + quantidade;
        if (found.estoque != null) {
          const max = isComboItem(found)
            ? Math.max(0, Math.floor(found.estoque / PASSO_COMBO) * PASSO_COMBO)
            : Math.max(0, Math.floor(found.estoque));
          somado = Math.min(somado, max);
        }
        return prev.map((i) =>
          i.id === item.id
            ? { ...i, quantidade: isComboItem(i) ? ajustarParaCombo(somado) : somado }
            : i,
        );
      }
      return [...prev, { ...item, quantidade }];
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
        if (i.estoque != null) {
          const desejado = n;
          const max = isComboItem(i) ? Math.max(0, Math.floor(i.estoque / PASSO_COMBO) * PASSO_COMBO) : Math.max(0, Math.floor(i.estoque));
          if (max <= 0) {
            toast.warning(`${i.nome} está sem estoque no momento.`);
            return [i];
          }
          if (isComboItem(i) && max < MINIMO_COMBO) {
            toast.warning(`Estoque insuficiente para combo de ${i.nome} (mínimo ${MINIMO_COMBO}un).`);
            return [i];
          }
          n = Math.min(n, max);
          if (n < desejado) toast.warning(`Estoque máximo disponível: ${max} unidades.`);
        }
        return [{ ...i, quantidade: isComboItem(i) ? ajustarParaCombo(n) : n }];
      }),
    );
  }, []);

  const setObservacao = useCallback((id: string, obs: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, observacao: obs.slice(0, 200) } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
    const totalItens = items.reduce((acc, i) => acc + i.quantidade, 0);
    return { items, add, remove, setQuantidade, setObservacao, clear, subtotal, totalItens };
  }, [items, add, remove, setQuantidade, setObservacao, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
