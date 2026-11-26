import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DarkTable, DarkTableRow } from "@/components/admin/erp-ui";

const operacoes = {
  entrada_manual: "Entrada",
  entrada_producao: "Entrada da produção",
  perda: "Perda",
  ajuste: "Inventário",
  venda: "Retirada",
  reserva: "Reserva",
  liberacao: "Liberação",
  cancelamento: "Cancelamento",
  vencimento: "Vencimento",
  devolucao: "Devolução",
  degustacao: "Degustação",
} as const;
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function HistoricoSalgados({
  produtos,
  inicial,
}: {
  produtos: { id: string; nome: string }[];
  inicial?: string | undefined;
}) {
  const [sabor, setSabor] = useState(inicial ?? "");
  const [operacao, setOperacao] = useState("");
  const [lote, setLote] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [pagina, setPagina] = useState(0);
  const ids = sabor ? [sabor] : produtos.map((p) => p.id);
  const invalido = !!inicio && !!fim && inicio > fim;
  const resultado = useQuery({
    queryKey: ["historico-salgados", ids, operacao, lote, responsavel, inicio, fim, pagina],
    enabled: !!ids.length && !invalido,
    queryFn: async ({ signal }) => {
      let consulta = supabase
        .from("estoque_movimentacoes")
        .select(
          "id, produto_id, usuario_id, tipo, quantidade, saldo_anterior, saldo_posterior, observacao, created_at, lotes(codigo)",
        )
        .in("produto_id", ids);
      if (operacao) consulta = consulta.eq("tipo", operacao as keyof typeof operacoes);
      if (inicio) consulta = consulta.gte("created_at", inicio + "T00:00:00-03:00");
      if (fim) consulta = consulta.lte("created_at", fim + "T23:59:59.999999-03:00");
      if (lote.trim()) {
        const codigos = await supabase
          .from("lotes")
          .select("id")
          .in("produto_id", ids)
          .eq("codigo", lote.trim())
          .abortSignal(signal);
        if (codigos.error) throw codigos.error;
        if (!codigos.data.length) return { movimentos: [], nomes: new Map<string, string>() };
        consulta = consulta.in(
          "lote_id",
          codigos.data.map((l) => l.id),
        );
      }
      if (responsavel.trim()) {
        const perfis = await supabase
          .from("profiles")
          .select("id")
          .ilike(
            "nome",
            "%" + responsavel.trim().replaceAll("%", "\\%").replaceAll("_", "\\_") + "%",
          )
          .abortSignal(signal);
        if (perfis.error) throw perfis.error;
        if (!perfis.data.length) return { movimentos: [], nomes: new Map<string, string>() };
        consulta = consulta.in(
          "usuario_id",
          perfis.data.map((p) => p.id),
        );
      }
      const { data, error } = await consulta
        .order("created_at", { ascending: false })
        .order("id")
        .range(pagina * 25, pagina * 25 + 25)
        .abortSignal(signal);
      if (error) throw error;
      const autores = [...new Set(data.flatMap((m) => (m.usuario_id ? [m.usuario_id] : [])))];
      const perfis = autores.length
        ? await supabase.from("profiles").select("id, nome").in("id", autores).abortSignal(signal)
        : null;
      return { movimentos: data, nomes: new Map(perfis?.data?.map((p) => [p.id, p.nome]) ?? []) };
    },
  });
  const movimentos = resultado.data?.movimentos ?? [];
  const alterar =
    (setter: (v: string) => void) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setPagina(0);
      setter(event.target.value);
    };
  return (
    <>
      <div className="est-dialog-grid">
        <label>
          Sabor
          <select value={sabor} onChange={alterar(setSabor)}>
            <option value="">Todos os sabores disponíveis</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operação
          <select value={operacao} onChange={alterar(setOperacao)}>
            <option value="">Todas</option>
            {Object.entries(operacoes).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Código exato do lote
          <input value={lote} onChange={alterar(setLote)} />
        </label>
        <label>
          Nome do responsável
          <input value={responsavel} onChange={alterar(setResponsavel)} />
        </label>
        <label>
          De
          <input type="date" value={inicio} onChange={alterar(setInicio)} />
        </label>
        <label>
          Até
          <input type="date" value={fim} onChange={alterar(setFim)} />
        </label>
      </div>
      {invalido && <p role="alert">A data inicial deve preceder a data final.</p>}
      {resultado.isFetching && <p role="status">Carregando histórico…</p>}
      {resultado.isError && (
        <p role="alert">
          Não foi possível consultar o histórico.{" "}
          <button onClick={() => void resultado.refetch()}>Tentar novamente</button>
        </p>
      )}
      {!invalido && (!ids.length || resultado.isSuccess) && (
        <DarkTable
          className="est-dialog-tabela"
          colunas={[
            "Data e hora",
            "Sabor",
            "Lote",
            "Operação",
            "Quantidade",
            "Saldo",
            "Responsável",
            "Observações",
          ]}
          vazio={!movimentos.length ? "Nenhuma movimentação encontrada." : undefined}
        >
          {movimentos.slice(0, 25).map((m) => (
            <DarkTableRow key={m.id}>
              <td>{dataHora.format(new Date(m.created_at))}</td>
              <td>{produtos.find((p) => p.id === m.produto_id)?.nome ?? "Sabor indisponível"}</td>
              <td>{m.lotes?.codigo ?? "—"}</td>
              <td>{operacoes[m.tipo] ?? m.tipo}</td>
              <td>{m.quantidade}</td>
              <td>
                {m.saldo_anterior} → {m.saldo_posterior}
              </td>
              <td>{(m.usuario_id && resultado.data?.nomes.get(m.usuario_id)) || "—"}</td>
              <td>{m.observacao || "—"}</td>
            </DarkTableRow>
          ))}
        </DarkTable>
      )}
      {(pagina > 0 || movimentos.length > 25) && (
        <div className="est-dialog-acoes">
          <button disabled={!pagina} onClick={() => setPagina(pagina - 1)}>
            Anterior
          </button>
          <button disabled={movimentos.length <= 25} onClick={() => setPagina(pagina + 1)}>
            Próxima
          </button>
        </div>
      )}
    </>
  );
}
