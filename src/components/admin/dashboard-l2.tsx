import { DashboardGestao } from "@/components/admin/dashboard-admin";
import { CLIENTES_STATS, PEDIDOS, PRODUTOS } from "@/routes/preview-l2-gestao-data";
import type { PeriodoKey } from "@/lib/operacao";

/**
 * Conteúdo do Dashboard L2 aprovado (referência /preview-l2-gestao).
 *
 * Componente extraído da própria prévia — a composição, os gráficos, as
 * cores e os dados fictícios permanecem idênticos. A única diferença é que
 * os handlers são injetados: na prévia são no-ops; em /admin são os states
 * reais, para que cliques, abas e período continuem funcionando.
 *
 * Nenhuma consulta é feita aqui: as fixtures são locais e fictícias.
 */
export function PainelDashboardL2({
  periodo,
  setPeriodo,
  setAba,
  notLidas,
  marcarLida,
  busca,
  setBusca,
  setPedidoFoco,
  setProdutoFoco,
  setClienteFoco,
  mostrarSelo = false,
}: {
  periodo: PeriodoKey;
  setPeriodo: (p: PeriodoKey) => void;
  setAba: (v: string) => void;
  notLidas: string[];
  marcarLida: (id: string) => void;
  busca: string;
  setBusca: (t: string) => void;
  setPedidoFoco: (v: string) => void;
  setProdutoFoco: (v: string) => void;
  setClienteFoco: (v: string) => void;
  mostrarSelo?: boolean;
}) {
  return (
    <>
        {mostrarSelo ? (
          <p className="mx-3 mt-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
            PRÉVIA L2 — Painel de Gestão. Dados fictícios locais, nada é gravado.
          </p>
        ) : null}
        <DashboardGestao
          pedidos={PEDIDOS}
          produtos={PRODUTOS}
          profiles={[]}
          clientesStats={CLIENTES_STATS}
          periodo={periodo}
          setPeriodo={setPeriodo}
          setAba={setAba}
          notLidas={notLidas}
          marcarLida={marcarLida}
          busca={busca}
          setBusca={setBusca}
          setPedidoFoco={setPedidoFoco}
          setProdutoFoco={setProdutoFoco}
          setClienteFoco={setClienteFoco}
        />
    </>
  );
}
