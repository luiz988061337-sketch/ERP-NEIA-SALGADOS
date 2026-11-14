import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Eye,
  Layers,
  Package,
  Pencil,
  Plus,
  Search,
  Snowflake,
  CircleHelp,
} from "lucide-react";
import { toast } from "sonner";
import {
  ActionButton,
  DarkTable,
  DarkTableRow,
  ERP_COLORS,
  MetricCard,
  ModuleHeader,
  SectionCard,
  StatusBadge,
} from "@/components/admin/erp-ui";
import { Input } from "@/components/ui/input";
import { useEstoques } from "./contexto";
import { Campo, data, HistoricoEstoque, ModalEstoque, numero, Seletor } from "./compartilhados";
import {
  alertaValidade,
  cancelarReserva,
  DATA_DEMO,
  ehSalgadoCongelado,
  indicadoresSalgados,
  lotesFEFO,
  movimentarSalgado,
  reservarPedido,
  restanteReserva,
  saldoSalgado,
  type AcaoSalgado,
} from "./salgados";
import coxinha from "@/routes/preview/fotos/coxinha-1.jpg";
import queijo from "@/routes/preview/fotos/bolinha-queijo-1.jpg";
import kibe from "@/routes/preview/fotos/kibe-1.jpg";
import croquete from "@/routes/preview/fotos/croquete-1.jpg";

const IMAGENS: Record<string, string> = { coxinha, queijo, kibe, croquete };
type Operacao = AcaoSalgado["tipo"] | "reserva" | "liberar";
const TITULOS: Record<Operacao, string> = {
  entrada: "Registrar entrada de estoque",
  reserva: "Reservar quantidade",
  liberar: "Liberar reserva",
  retirada: "Registrar retirada do freezer",
  perda: "Registrar perda",
  ajuste: "Ajustar inventário",
};
export function EstoqueSalgados() {
  const navegar = useNavigate();
  const c = useEstoques(),
    s = c.salgados;
  const produtosEstoque = s.produtos.filter(ehSalgadoCongelado);
  const [foco, setFoco] = useState(s.produtos[0]!.id);
  const [busca, setBusca] = useState(""),
    [categoria, setCategoria] = useState("todos"),
    [status, setStatus] = useState("todos"),
    [fornecedor, setFornecedor] = useState("todos"),
    [baixos, setBaixos] = useState(false);
  const [modal, setModal] = useState<"movimento" | "historico" | "alertas" | "ajuda" | null>(null);
  const [tipo, setTipo] = useState<Operacao>("entrada"),
    [erro, setErro] = useState(""),
    [operacaoId, setOperacaoId] = useState("");
  const produto = s.produtos.find((p) => p.id === foco)!,
    saldo = saldoSalgado(s, foco),
    lotes = lotesFEFO(s, foco),
    k = indicadoresSalgados(s);
  const reservas = s.reservas.filter((r) => r.produtoId === foco && restanteReserva(r) > 0);
  const lista = produtosEstoque.filter((p) => {
    const st = saldoSalgado(s, p.id),
      baixo = st.disponivel < p.minimo;
    return (
      p.nome.toLowerCase().includes(busca.toLowerCase()) &&
      (categoria === "todos" || p.categoria === categoria) &&
      (fornecedor === "todos" || p.fornecedor === fornecedor) &&
      (!baixos || baixo) &&
      (status === "todos" || (status === "baixo" ? baixo : !baixo))
    );
  });
  const nomes = Object.fromEntries(s.produtos.map((p) => [p.id, p.nome]));
  function abrir(t: Operacao, id = foco) {
    setFoco(id);
    setTipo(t);
    setErro("");
    setOperacaoId(c.proximaOperacao());
    setModal("movimento");
  }
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      quantidade = Number(f.get("quantidade")),
      motivo = String(f.get("motivo") ?? "");
    const resultado =
      tipo === "reserva"
        ? reservarPedido(s, operacaoId, String(f.get("pedido") ?? ""), [
            { produtoId: foco, quantidade },
          ])
        : tipo === "liberar"
          ? cancelarReserva(s, operacaoId, String(f.get("pedido") ?? ""))
          : movimentarSalgado(s, {
              id: operacaoId,
              produtoId: foco,
              tipo,
              quantidade,
              motivo,
              codigo: String(f.get("codigo") ?? ""),
              validade: String(f.get("validade") ?? ""),
              loteId: String(f.get("lote") ?? ""),
              ...(f.get("reserva") ? { reservaId: String(f.get("reserva")) } : {}),
            });
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    c.setSalgados(resultado.estado);
    toast.success(resultado.mensagem);
    setModal(null);
  }
  return (
    <div data-testid="estoque-salgados">
      <ModuleHeader
        icone={Snowflake}
        titulo="Estoque de Salgados"
        subtitulo="Controle de congelados por sabor, reservas, lotes e validade (FEFO)."
        acoes={
          <>
            <div className="est-search">
              <Search size={16} />
              <Input
                aria-label="Buscar sabor"
                placeholder="Buscar sabor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button
              className="est-icon"
              aria-label="Alertas de salgados"
              onClick={() => setModal("alertas")}
            >
              <Bell size={20} />
            </button>
            <button
              className="est-icon"
              aria-label="Ajuda de salgados"
              onClick={() => setModal("ajuda")}
            >
              <CircleHelp size={20} />
            </button>
          </>
        }
      />
      <div className="est-tabs est-product-tabs">
        <ActionButton
          variant="ghost"
          onClick={() => void navegar({ to: "/preview/cadastro-produtos" })}
        >
          <ClipboardList size={17} />
          Cadastro de Produtos
        </ActionButton>
        <span className="est-active-tab">
          <Snowflake size={17} />
          Estoque de Salgados
        </span>
      </div>
      <div className="est-kpis est-kpis-five">
        <MetricCard
          icone={Package}
          label="Total físico"
          valor={<span className="est-gold">{numero(k.fisico)} un.</span>}
          detalhe="Salgados no freezer"
        />
        <MetricCard
          icone={Layers}
          label="Total reservado"
          valor={<span className="est-blue">{numero(k.reservado)} un.</span>}
          cor={ERP_COLORS.blue}
          detalhe="Pedidos confirmados"
        />
        <MetricCard
          icone={CheckCircle2}
          label="Total disponível"
          valor={<span className="est-green">{numero(k.disponivel)} un.</span>}
          cor={ERP_COLORS.green}
          detalhe="Físico − reservado"
        />
        <MetricCard
          icone={AlertTriangle}
          label="Abaixo do mínimo"
          valor={<span className="est-red">{k.baixos} sabores</span>}
          cor={ERP_COLORS.red}
          detalhe="Sugestão de produção"
        />
        <MetricCard
          icone={Package}
          label="Lotes ativos"
          valor={`${k.lotes} lotes`}
          detalhe="Primeiro que vence, primeiro que sai"
        />
      </div>
      <div className="est-filters">
        <label>
          Categoria
          <select
            className="est-select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="todos">Todas</option>
            {[...new Set(produtosEstoque.map((p) => p.categoria))].map((cat) => (
              <option key={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select className="est-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="ok">OK</option>
            <option value="baixo">Abaixo do mínimo</option>
          </select>
        </label>
        <label>
          Fornecedor
          <select
            className="est-select"
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option>Produção Néia</option>
          </select>
        </label>
        <label className="est-toggle">
          <input type="checkbox" checked={baixos} onChange={(e) => setBaixos(e.target.checked)} />
          Apenas abaixo do mínimo
        </label>
        <div className="est-filter-actions">
          <ActionButton onClick={() => abrir("retirada")}>
            <ArrowLeftRight size={16} />
            Movimentação
          </ActionButton>
          <ActionButton onClick={() => abrir("entrada")}>
            <Plus size={17} />
            Registrar entrada de estoque
          </ActionButton>
        </div>
      </div>
      <SectionCard className="est-table-panel" bodyClassName="p-0">
        <p className="est-table-hint">Deslize a tabela para ver todos os saldos e ações →</p>
        <DarkTable
          colunas={[
            "Produto / sabor",
            "Físico (un.)",
            "Reservado",
            "Disponível",
            "Est. mínimo",
            "Reservas (total único do sabor)",
            "Lotes",
            "Próxima validade",
            "Ações",
          ]}
          vazio={!lista.length ? "Nenhum sabor neste filtro." : undefined}
        >
          {lista.map((p) => {
            const st = saldoSalgado(s, p.id),
              ls = lotesFEFO(s, p.id),
              rs = s.reservas.filter((r) => r.produtoId === p.id && restanteReserva(r) > 0);
            return (
              <DarkTableRow key={p.id}>
                <td data-selecionado={p.id === foco}>
                  <button
                    className="est-product"
                    onClick={() => setFoco(p.id)}
                    data-testid={`produto-${p.id}`}
                  >
                    <img src={IMAGENS[p.imagem]} alt="" />
                    <span>
                      <b>{p.nome}</b>
                      {!p.ativo && <small>Inativo · saldo preservado</small>}
                    </span>
                  </button>
                </td>
                <td>
                  <b>{numero(st.fisico)}</b>
                </td>
                <td className="est-blue">{numero(st.reservado)}</td>
                <td className="est-green">
                  <b>{numero(st.disponivel)}</b>
                </td>
                <td>
                  {numero(p.minimo)}
                  {st.disponivel < p.minimo && <small className="est-red">Abaixo do mínimo</small>}
                </td>
                <td>
                  <button
                    className="est-text-action"
                    onClick={() => {
                      setFoco(p.id);
                      setModal("historico");
                    }}
                  >
                    <Layers size={14} />
                    {rs.length} pedido(s) · {numero(st.reservado)} un. reservadas
                  </button>
                </td>
                <td>{ls.length} lotes</td>
                <td>
                  {data(ls[0]?.validade ?? "")}
                  {ls[0] && alertaValidade(ls[0]) && (
                    <small className="est-gold">Vence em até 7 dias</small>
                  )}
                </td>
                <td>
                  <div className="est-row-actions">
                    <button
                      className="est-icon"
                      aria-label={`Ver lotes de ${p.nome}`}
                      onClick={() => {
                        setFoco(p.id);
                        document
                          .getElementById("est-detalhe-salgado")
                          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="est-icon"
                      aria-label={`Ajustar ${p.nome}`}
                      onClick={() => abrir("ajuste", p.id)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </td>
              </DarkTableRow>
            );
          })}
        </DarkTable>
      </SectionCard>
      <div className="est-bottom-three" id="est-detalhe-salgado">
        <SectionCard
          titulo={
            <span className="est-inline">
              <Snowflake size={17} />
              {produto.nome}
            </span>
          }
          acoes={<StatusBadge tom="neutro">{produto.categoria}</StatusBadge>}
        >
          <div className="est-product-detail">
            <img src={IMAGENS[produto.imagem]} alt="" />
            <p>
              Produto do cadastro único<small>{produto.id}</small>
            </p>
          </div>
          <div className="est-mini-metrics">
            {[
              ["Físico", saldo.fisico],
              ["Reservado", saldo.reservado],
              ["Disponível", saldo.disponivel],
              ["Mínimo", produto.minimo],
            ].map(([t, v]) => (
              <div key={t}>
                <small>{t}</small>
                <b>{numero(Number(v))}</b>
              </div>
            ))}
          </div>
          <div className="est-detail-actions">
            <ActionButton
              variant="ghost"
              onClick={() => abrir("reserva")}
              disabled={!produto.ativo}
            >
              Reservar
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => abrir("liberar")}
              disabled={!reservas.length}
            >
              Liberar reserva
            </ActionButton>
            <ActionButton variant="ghost" onClick={() => abrir("perda")}>
              Registrar perda
            </ActionButton>
          </div>
        </SectionCard>
        <SectionCard
          titulo={
            <span className="est-inline">
              <Package size={17} />
              Lotes (FEFO)
            </span>
          }
        >
          <DarkTable colunas={["Lote", "Quantidade", "Validade", "Prioridade"]}>
            {lotes.map((l, i) => (
              <DarkTableRow key={l.id}>
                <td>{l.codigo}</td>
                <td>{numero(l.restante)}</td>
                <td>{data(l.validade ?? "")}</td>
                <td>
                  <StatusBadge tom={alertaValidade(l) ? "atencao" : "ok"}>
                    Usar {i + 1}º{alertaValidade(l) ? " · Próximo" : ""}
                  </StatusBadge>
                </td>
              </DarkTableRow>
            ))}
          </DarkTable>
        </SectionCard>
        <SectionCard
          titulo={
            <span className="est-inline">
              <ArrowLeftRight size={17} />
              Últimas movimentações
            </span>
          }
          acoes={
            <button className="est-text-action" onClick={() => setModal("historico")}>
              Ver histórico →
            </button>
          }
        >
          <ul className="est-recent">
            {s.historico
              .filter((m) => m.itemId === foco)
              .slice(0, 3)
              .map((m) => (
                <li key={m.id}>
                  <span className={m.quantidade >= 0 ? "est-green" : "est-red"}>
                    {m.quantidade >= 0 ? "+" : "−"}
                  </span>
                  <div>
                    <b>
                      {m.tipo}: {numero(Math.abs(m.quantidade))} un.
                    </b>
                    <small>{m.motivo}</small>
                  </div>
                  <small>{data(m.data)}</small>
                </li>
              ))}
          </ul>
          <p className="est-muted">
            Retirada com reserva resolve a pendência e reduz o físico uma única vez.
          </p>
        </SectionCard>
      </div>
      {modal === "movimento" && (
        <ModalEstoque titulo={TITULOS[tipo]} fechar={() => setModal(null)}>
          <p>
            <b>{produto.nome}</b> · Físico {numero(saldo.fisico)} · Reservado{" "}
            {numero(saldo.reservado)} · Disponível {numero(saldo.disponivel)}
          </p>
          <form className="est-form" onSubmit={enviar}>
            {tipo === "entrada" && (
              <label htmlFor="est-produtoId">
                Produto cadastrado
                <select
                  id="est-produtoId"
                  name="produtoId"
                  className="est-select"
                  value={foco}
                  onChange={(e) => {
                    setFoco(e.target.value);
                    setErro("");
                  }}
                >
                  {produtosEstoque.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {!p.ativo ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
                <small className="est-muted">
                  Para criar um sabor, utilize Cadastro de Produtos. Aqui são registrados apenas
                  lotes e quantidades.
                </small>
              </label>
            )}
            <label>
              Tipo de movimentação
              <select
                aria-label="Tipo de movimentação de salgados"
                className="est-select"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as Operacao);
                  setErro("");
                }}
              >
                {Object.entries(TITULOS).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {tipo === "liberar" ? (
              <>
                <p>
                  O cancelamento libera todas as reservas ainda não consumidas deste pedido, sabor
                  por sabor.
                </p>
                <Seletor name="pedido" label="Pedido a cancelar">
                  {reservas.map((r) => (
                    <option key={r.id} value={r.pedido}>
                      {r.pedido} · {restanteReserva(r)} un. pendentes
                    </option>
                  ))}
                </Seletor>
              </>
            ) : (
              <>
                {tipo === "retirada" && (
                  <Seletor name="reserva" label="Vínculo da retirada">
                    <option value="">Retirada avulsa (somente disponível)</option>
                    {reservas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.pedido} · {restanteReserva(r)} un. pendentes
                      </option>
                    ))}
                  </Seletor>
                )}
                {tipo === "ajuste" && (
                  <Seletor name="lote" label="Lote conferido">
                    {s.lotes
                      .filter((l) => l.produto_id === foco)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.codigo} · saldo {l.restante}
                        </option>
                      ))}
                  </Seletor>
                )}
                <Campo
                  name="quantidade"
                  label={
                    tipo === "ajuste"
                      ? "Quantidade física contada no lote (un.)"
                      : "Quantidade (un.)"
                  }
                  type="number"
                  min={tipo === "ajuste" ? 0 : 1}
                  step="1"
                />
                {tipo === "reserva" && (
                  <Campo name="pedido" label="Referência do pedido confirmado" />
                )}
                {tipo === "entrada" && (
                  <>
                    <Campo name="codigo" label="Código do novo lote" />
                    <Campo
                      name="validade"
                      label="Validade do lote"
                      type="date"
                      value="2026-12-15"
                    />
                  </>
                )}
                {tipo !== "reserva" && <Campo name="motivo" label="Justificativa / referência" />}
              </>
            )}
            {erro && (
              <p role="alert" className="est-red">
                {erro}
              </p>
            )}
            <p className="est-muted">
              FEFO e vencimentos referenciados em {data(DATA_DEMO)}. Dados fictícios.
            </p>
            <ActionButton type="submit">
              <CheckCircle2 size={16} />
              Confirmar movimentação
            </ActionButton>
          </form>
        </ModalEstoque>
      )}
      {modal === "historico" && (
        <ModalEstoque titulo={`Histórico — ${produto.nome}`} fechar={() => setModal(null)}>
          <div className="est-form">
            {s.reservas
              .filter((r) => r.produtoId === foco)
              .map((r) => (
                <p key={r.id}>
                  <b>{r.pedido}</b> · Reservado {r.quantidade} · Retirado {r.consumida} · Liberado{" "}
                  {r.liberada} · Pendente {restanteReserva(r)}
                  {r.origemId && (
                    <small>
                      Origem: {c.combos.itens.find((x) => x.id === r.origemId)?.nome ?? r.origemId}
                    </small>
                  )}
                </p>
              ))}
          </div>
          <HistoricoEstoque
            movimentos={s.historico.filter((m) => m.itemId === foco)}
            nomes={nomes}
          />
        </ModalEstoque>
      )}
      {modal === "alertas" && (
        <ModalEstoque titulo="Alertas do estoque de salgados" fechar={() => setModal(null)}>
          <p>
            {k.baixos} sabores abaixo do mínimo. {s.lotes.filter(alertaValidade).length} lotes com
            vencimento em até 7 dias.
          </p>
          <ul>
            {produtosEstoque
              .filter((p) => saldoSalgado(s, p.id).disponivel < p.minimo)
              .map((p) => (
                <li key={p.id}>
                  {p.nome}: produzir pelo menos {p.minimo - saldoSalgado(s, p.id).disponivel} un.
                  para atingir o mínimo.
                </li>
              ))}
          </ul>
        </ModalEstoque>
      )}
      {modal === "ajuda" && (
        <ModalEstoque titulo="Como funciona o estoque de salgados" fechar={() => setModal(null)}>
          <p>
            Disponível = físico − reservado. Existe um único total reservado por sabor: vendas
            avulsas, combos fixos, combos personalizados e qualquer outro pedido confirmado entram
            na mesma soma, sem reservado separado por origem. Na retirada do freezer a reserva é
            consumida e o físico é baixado uma vez, pelo lote que vence primeiro. Cancelar libera
            apenas o que ainda não foi retirado. Insumos e embalagens nunca são baixados
            automaticamente nesta etapa.
          </p>
        </ModalEstoque>
      )}
    </div>
  );
}
