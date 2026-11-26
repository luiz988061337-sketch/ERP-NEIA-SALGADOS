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

type ProdutoHistorico = { id: string; nome: string; chave?: string | undefined };
type MovimentoHistorico = {
  id: string;
  created_at: string;
  usuario_id: string | null;
  tipo: keyof typeof operacoes;
  produto_id: string | null;
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  observacao: string | null;
  lotes: { codigo: string } | null;
};

export function HistoricoSalgados({
  produtos,
  inicial,
  porChave,
}: {
  produtos: ProdutoHistorico[];
  inicial?: string | undefined;
  porChave: boolean;
}) {
  const [sabor, setSabor] = useState(() => {
    if (!inicial) return "";
    const encontrado = produtos.find((p) => p.chave === inicial || p.id === inicial);
    return encontrado ? (encontrado.chave ?? encontrado.id) : "";
  });
  const [operacao, setOperacao] = useState("");
  const [lote, setLote] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [pagina, setPagina] = useState(0);
  const selecionado = produtos.find((p) => (p.chave ?? p.id) === sabor);
  const ids = (selecionado ? [selecionado.id] : produtos.map((p) => p.id)).filter(Boolean);
  const chaves = porChave
    ? selecionado?.chave
      ? [selecionado.chave]
      : produtos.flatMap((p) => (p.chave ? [p.chave] : []))
    : [];
  const invalido = !!inicio && !!fim && inicio > fim;
  const resultado = useQuery({
    queryKey: ["historico-salgados", ids, chaves, operacao, lote, responsavel, inicio, fim, pagina],
    enabled: (!!ids.length || !!chaves.length) && !invalido,
    queryFn: async ({ signal }) => {
      const vazio = { movimentos: [], nomes: new Map<string, string>() };

      let loteIds: string[] | undefined;
      if (lote.trim()) {
        const consultasLotes = [
          ...(chaves.length
            ? [
                supabase
                  .from("lotes")
                  .select("*")
                  .in("sabor_chave", chaves)
                  .eq("codigo", lote.trim())
                  .abortSignal(signal),
              ]
            : []),
          ...(ids.length
            ? [
                supabase
                  .from("lotes")
                  .select("*")
                  .in("produto_id", ids)
                  .eq("codigo", lote.trim())
                  .abortSignal(signal),
              ]
            : []),
        ];
        const respostas = await Promise.all(consultasLotes);
        for (const resposta of respostas) if (resposta.error) throw resposta.error;
        loteIds = [
          ...new Set(respostas.flatMap((resposta) => resposta.data?.map((item) => item.id) ?? [])),
        ];
        if (!loteIds.length) return vazio;
      }

      let usuarioIds: string[] | undefined;
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
        if (!perfis.data.length) return vazio;
        usuarioIds = perfis.data.map((p) => p.id);
      }

      const consulta = () => {
        let parte = supabase.from("estoque_movimentacoes").select("*, lotes(codigo)");
        if (operacao) parte = parte.eq("tipo", operacao as keyof typeof operacoes);
        if (inicio) parte = parte.gte("created_at", inicio + "T00:00:00-03:00");
        if (fim) parte = parte.lte("created_at", fim + "T23:59:59.999999-03:00");
        if (loteIds) parte = parte.in("lote_id", loteIds);
        if (usuarioIds) parte = parte.in("usuario_id", usuarioIds);
        return parte
          .order("created_at", { ascending: false })
          .order("id")
          .range(pagina * 25, pagina * 25 + 25)
          .abortSignal(signal);
      };
      const respostas = await Promise.all([
        ...(chaves.length ? [consulta().in("sabor_chave", chaves)] : []),
        ...(ids.length ? [consulta().in("produto_id", ids)] : []),
      ]);
      for (const resposta of respostas) if (resposta.error) throw resposta.error;
      const porId = new Map<string, MovimentoHistorico>();
      for (const resposta of respostas) {
        for (const movimento of (resposta.data ?? []) as MovimentoHistorico[]) {
          porId.set(movimento.id, movimento);
        }
      }
      const movimentos = [...porId.values()].sort((a, b) =>
        a.created_at === b.created_at ? a.id.localeCompare(b.id) : b.created_at.localeCompare(a.created_at),
      );
      const autores = [...new Set(movimentos.flatMap((m) => (m.usuario_id ? [m.usuario_id] : [])))];
      const perfis = autores.length
        ? await supabase.from("profiles").select("id, nome").in("id", autores).abortSignal(signal)
        : null;
      return { movimentos, nomes: new Map(perfis?.data?.map((p) => [p.id, p.nome]) ?? []) };
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
              <option key={p.chave ?? p.id} value={p.chave ?? p.id}>
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
      {!invalido && (resultado.isSuccess || (!ids.length && !chaves.length)) && (
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
