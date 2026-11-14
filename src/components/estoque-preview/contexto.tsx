import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { criarSalgadosDemo, type SalgadosState } from "./salgados";
import { criarSuprimentosDemo, type SuprimentosState } from "./suprimentos";
import { criarCombosDemo, type CombosState } from "./combos";

type Contexto = {
  salgados: SalgadosState;
  setSalgados: (s: SalgadosState) => void;
  combos: CombosState;
  setCombos: (s: CombosState) => void;
  insumos: SuprimentosState;
  setInsumos: (s: SuprimentosState) => void;
  embalagens: SuprimentosState;
  setEmbalagens: (s: SuprimentosState) => void;
  compras: string[];
  setCompras: (s: string[]) => void;
  proximaOperacao: () => string;
};
const EstoquesContext = createContext<Contexto | null>(null);
export function EstoquesProvider({ children }: { children: ReactNode }) {
  const [salgados, setSalgados] = useState(criarSalgadosDemo);
  const [combos, setCombos] = useState(criarCombosDemo);
  const [insumos, setInsumos] = useState(() => criarSuprimentosDemo("insumos"));
  const [embalagens, setEmbalagens] = useState(() => criarSuprimentosDemo("embalagens"));
  const [compras, setCompras] = useState<string[]>([]);
  const sequencia = useRef(0);
  return (
    <EstoquesContext.Provider
      value={{
        salgados,
        setSalgados,
        combos,
        setCombos,
        insumos,
        setInsumos,
        embalagens,
        setEmbalagens,
        compras,
        setCompras,
        proximaOperacao: () => `demo-${++sequencia.current}`,
      }}
    >
      {children}
    </EstoquesContext.Provider>
  );
}
export function useEstoques() {
  const contexto = useContext(EstoquesContext);
  if (!contexto) throw new Error("Estoque demonstrativo fora do contexto local.");
  return contexto;
}
