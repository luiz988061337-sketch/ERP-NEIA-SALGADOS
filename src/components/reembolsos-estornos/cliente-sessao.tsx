import { createContext, useContext, useState, type ReactNode } from "react";
import { criarOperacao, LABEL_STATUS, OPERACOES_INICIAIS, type DadosNovaOperacao, type Operacao } from "./dados";
import { CLIENTE_DEMO } from "./origens-dados";
import { brl } from "@/lib/format";

// Estado exclusivo desta demonstração. Não compartilha nem altera a Central R1/R2-A.
const ClienteContext = createContext<{
  solicitacoes: Operacao[];
  solicitar: (dados: DadosNovaOperacao) => ReturnType<typeof criarOperacao>;
} | null>(null);

export function ClientePreviewProvider({ children }: { children: ReactNode }) {
  const [operacoes, setOperacoes] = useState<Operacao[]>(() => structuredClone(OPERACOES_INICIAIS));
  function solicitar(dados: DadosNovaOperacao) {
    const resultado = criarOperacao(operacoes, dados, "2026-11-14T10:45");
    if (resultado.ok) setOperacoes((anteriores) => [...anteriores, resultado.operacao]);
    return resultado;
  }
  return <ClienteContext.Provider value={{ solicitacoes: operacoes.filter((o) => o.pessoa === CLIENTE_DEMO), solicitar }}>{children}</ClienteContext.Provider>;
}

export function useClientePreview() {
  const contexto = useContext(ClienteContext);
  if (!contexto) throw new Error("Estado demonstrativo do cliente indisponível.");
  return contexto;
}

export function SolicitacoesCliente() {
  const { solicitacoes } = useClientePreview();
  return (
    <section className="r2b-requests r2b-panel" aria-labelledby="r2b-solicitacoes" data-testid="r2b-solicitacoes">
      <h2 id="r2b-solicitacoes">Acompanhe suas solicitações</h2>
      {solicitacoes.length === 0 ? <p>Você ainda não possui solicitações nesta sessão demonstrativa.</p> :
        <ul>{solicitacoes.map((s) => <li key={s.id}><strong>{s.id}</strong><span>Pedido {s.referencia}</span><span>{brl(s.valorSolicitado)}</span><span className="r2b-badge r2b-badge-amber">{LABEL_STATUS[s.status]}</span></li>)}</ul>}
      <small>Dados fictícios, mantidos apenas enquanto esta prévia estiver aberta. Nenhum estorno real.</small>
    </section>
  );
}
