import { useQuery } from "@tanstack/react-query";
import { DarkTable, DarkTableRow } from "@/components/admin/erp-ui";
import { brl, dataHora } from "@/lib/format";
import {
  carregarRecebimentosPedido,
  rotuloFormaLedger,
  rotuloTipoLedger,
  TROCO_NAO_REGISTRADO,
} from "@/lib/pedido-pagamento-ledger";
import { supabaseLoose } from "@/lib/supabase-loose";

/** Hook único para aba Pagamento, histórico, Central e relatórios. */
export function useRecebimentosPedido(pedidoId: string, totalCentavos: number) {
  return useQuery({
    queryKey: ["pedido-recebimentos-ledger", pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: () => carregarRecebimentosPedido(supabaseLoose, pedidoId, totalCentavos),
  });
}

export function RecebimentosPedido({
  pedidoId,
  totalCentavos,
  formaOriginal,
  compacto = false,
}: {
  pedidoId: string;
  totalCentavos: number;
  formaOriginal?: string | null;
  compacto?: boolean;
}) {
  const { data, isPending, isError, refetch } = useRecebimentosPedido(pedidoId, totalCentavos);
  const indisponivel = isError || data?.disponivel === false;
  const resumo = data;

  return (
    <section className="h02-recebimentos mt-3" aria-label="Recebimentos registrados no ledger">
      <h3 className="mb-2 font-semibold">Recebimentos registrados no ledger</h3>
      {isPending && <p role="status">Carregando recebimentos…</p>}
      {indisponivel && (
        <div>
          <p role="alert">
            Ledger financeiro indisponível para este perfil. Nenhum valor foi alterado.
          </p>
          <button className="h02-botao" onClick={() => void refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {!isPending && !indisponivel && resumo && (
        <>
          <dl className="h02-dados">
            {formaOriginal && (
              <div>
                <dt>Forma escolhida pelo cliente</dt>
                <dd>{rotuloFormaLedger(formaOriginal)} (preferência original, preservada)</dd>
              </div>
            )}
            <div>
              <dt>Total do pedido</dt>
              <dd>{brl(resumo.totalCentavos / 100)}</dd>
            </div>
            <div>
              <dt>Recebido líquido</dt>
              <dd>{brl(resumo.pagoCentavos / 100)}</dd>
            </div>
            {resumo.estornadoCentavos > 0 && (
              <div>
                <dt>Estornos</dt>
                <dd>{brl(resumo.estornadoCentavos / 100)}</dd>
              </div>
            )}
            <div>
              <dt>Saldo restante</dt>
              <dd>{brl(resumo.saldoCentavos / 100)}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{resumo.quitado ? "Quitado conforme o ledger" : "Saldo em aberto"}</dd>
            </div>
          </dl>
          {resumo.eventos.length === 0 ? (
            <p className="h02-nota">Nenhum recebimento registrado no ledger para este pedido.</p>
          ) : (
            <>
              <DarkTable
                className="h02-tabela"
                colunas={compacto
                  ? ["Data e hora", "Lançamento", "Forma", "Valor", "Responsável"]
                  : ["Data e hora", "Lançamento", "Forma", "Valor", "Troco", "Responsável", "Observação"]}
              >
                {resumo.eventos.map((evento) => (
                  <DarkTableRow key={evento.id}>
                    <td>{dataHora(evento.created_at)}</td>
                    <td>{rotuloTipoLedger(evento.tipo)}</td>
                    <td>{rotuloFormaLedger(evento.forma_pagamento)}</td>
                    <td>{brl(Number(evento.valor_centavos || 0) / 100)}</td>
                    {!compacto && <td>{TROCO_NAO_REGISTRADO}</td>}
                    <td>{evento.autorNome || "Identificação indisponível"}</td>
                    {!compacto && <td>{evento.motivo || "—"}</td>}
                  </DarkTableRow>
                ))}
              </DarkTable>
              <p className="h02-nota">
                Cada linha é um lançamento efetivo do ledger. {TROCO_NAO_REGISTRADO}.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
