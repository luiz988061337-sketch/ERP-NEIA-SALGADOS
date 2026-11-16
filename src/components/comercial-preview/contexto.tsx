/**
 * C1 — Contexto local da demonstração Comercial.
 * Estado em memória: nenhum dado real, nenhuma escrita no Supabase.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  CAMPANHAS_DEMO,
  CLIENTES_DEMO,
  type CampanhaDemo,
  type ClienteDemo,
  type FiltrosClientes,
} from "./dados";

type Contexto = {
  clientes: ClienteDemo[];
  campanhas: CampanhaDemo[];
  filtros: FiltrosClientes;
  setFiltros: (f: FiltrosClientes) => void;
  pagina: number;
  setPagina: (p: number) => void;
};

const ComercialContext = createContext<Contexto | null>(null);

export function ComercialProvider({ children }: { children: ReactNode }) {
  const [filtros, setFiltros] = useState<FiltrosClientes>({
    busca: "",
    periodo: 0,
    segmento: "todos",
    origem: "todas",
    atendente: "todos",
  });
  const [pagina, setPagina] = useState(1);

  const valor = useMemo<Contexto>(
    () => ({
      clientes: CLIENTES_DEMO,
      campanhas: CAMPANHAS_DEMO,
      filtros,
      setFiltros: (f) => {
        setFiltros(f);
        setPagina(1);
      },
      pagina,
      setPagina,
    }),
    [filtros, pagina],
  );

  return (
    <ComercialContext.Provider value={valor}>{children}</ComercialContext.Provider>
  );
}

export function useComercial() {
  const ctx = useContext(ComercialContext);
  if (!ctx) throw new Error("Painel Comercial fora do contexto demonstrativo.");
  return ctx;
}
