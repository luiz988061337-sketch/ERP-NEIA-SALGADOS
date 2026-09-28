import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  id: string;
  nome: string;
  preco: number;
  imagem?: string | null;
  quantidade: number;
};

type CartContextValue = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantidade">, qtd?: number) => void;
  remove: (id: string) => void;
  setQuantidade: (id: string, qtd: number) => void;
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
    setItems((prev) => {
      const found = prev.find((i) => i.id === item.id);
      if (found) {
        return prev.map((i) => (i.id === item.id ? { ...i, quantidade: i.quantidade + qtd } : i));
      }
      return [...prev, { ...item, quantidade: qtd }];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setQuantidade = useCallback((id: string, qtd: number) => {
    setItems((prev) =>
      qtd <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, quantidade: qtd } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
    const totalItens = items.reduce((acc, i) => acc + i.quantidade, 0);
    return { items, add, remove, setQuantidade, clear, subtotal, totalItens };
  }, [items, add, remove, setQuantidade, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de CartProvider");
  return ctx;
}
