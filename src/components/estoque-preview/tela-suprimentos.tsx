import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Egg,
  History,
  Info,
  Layers,
  Milk,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Wheat,
  Zap,
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
} from "@/components/admin/erp-ui";
import { Input } from "@/components/ui/input";
import { useEstoques } from "./contexto";
import {
  Campo,
  data,
  dinheiro,
  HistoricoEstoque,
  ModalEstoque,
  numero,
  plural,
  Seletor,
  SituacaoItem,
} from "./compartilhados";
import {
  indicadoresSuprimentos,
  movimentarSuprimento,
  pacotes,
  reposicao,
  salvarSuprimento,
  situacao,
  UNIDADES_COMPRA,
  UNIDADES_EMBALAGEM,
  TIPOS_EMBALAGEM,
  type TipoEmbalagem,
  type AcaoSuprimento,
  type Suprimento,
  type TipoSuprimento,
  type UnidadeCompra,
} from "./suprimentos";
import type { Unidade } from "@/lib/insumos";

const TITULOS = {
  compra: "Registrar compra",
  fechada: "Registrar retirada",
  parcial: "Retirada parcial aproximada",
  conferencia: "Conferência de estoque",
  ajuste: "Ajuste com justificativa",
};
function IconeItem({ item }: { item: Suprimento }) {
  const Icone = item.id.includes("farinha")
    ? Wheat
    : item.id.includes("ovos")
      ? Egg
      : item.id.includes("oleo") || item.id.includes("queijo")
        ? Milk
        : item.id.includes("caixa")
          ? Boxes
          : Package;
  return (
    <span className="est-item-icon">
      <Icone size={30} />
    </span>
  );
}
export function EstoqueSuprimentos({ tipo }: { tipo: TipoSuprimento }) {
  const c = useEstoques(),
    s = c[tipo],
    setEstado = tipo === "insumos" ? c.setInsumos : c.setEmbalagens;
  const embalagem = tipo === "embalagens",
    titulo = embalagem ? "Estoque de Embalagens" : "Estoque de Insumos";
  const [foco, setFoco] = useState(embalagem ? "emb-caixa50" : "ins-queijo");
  const item = s.itens.find((i) => i.id === foco) ?? s.itens[0]!;
  const [busca, setBusca] = useState(""),
    [status, setStatus] = useState("todos"),
    [aba, setAba] = useState("lista");
  const [modal, setModal] = useState<
    "movimento" | "editar" | "novo" | "historico" | "compras" | null
  >(null);
  const [movimento, setMovimento] = useState<AcaoSuprimento["tipo"]>("compra"),
    [operacaoId, setOperacaoId] = useState("");
  const [erro, setErro] = useState(""),
    [rascunho, setRascunho] = useState(false);
  const k = indicadoresSuprimentos(s),
    nomes = Object.fromEntries(s.itens.map((i) => [i.id, i.nome]));
  const lista = s.itens.filter(
    (i) =>
      i.nome.toLowerCase().includes(busca.toLowerCase()) &&
      (status === "todos" || (status === "ok" ? situacao(i) === "ok" : situacao(i) !== "ok")),
  );
  function abrir(t: AcaoSuprimento["tipo"], id = item.id) {
    setFoco(id);
    setMovimento(t);
    setErro("");
    setOperacaoId(c.proximaOperacao());
    setModal("movimento");
  }
  function editar(id?: string) {
    if (id) setFoco(id);
    setErro("");
    setOperacaoId(c.proximaOperacao());
    setModal(id ? "editar" : "novo");
  }
  function incluirCompra(id: string) {
    c.setCompras([...new Set([...c.compras, id])]);
    toast.success("Item incluído na lista de compras demonstrativa.");
  }
  function gerarCompra() {
    c.setCompras([
      ...new Set([...c.compras, ...s.itens.filter((i) => reposicao(i) > 0).map((i) => i.id)]),
    ]);
    setRascunho(false);
    setModal("compras");
  }
  const compras = s.itens.filter((i) => c.compras.includes(i.id));
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const resultado = movimentarSuprimento(s, {
      id: operacaoId,
      itemId: item.id,
      tipo: movimento,
      quantidade: Number(f.get("quantidade")),
      unidade: String(f.get("unidade") ?? "compra"),
      motivo: String(f.get("motivo") ?? ""),
      ...(movimento === "compra"
        ? { custo: Number(f.get("custo")), fornecedor: String(f.get("fornecedor") ?? "") }
        : {}),
    });
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setEstado(resultado.estado);
    toast.success(resultado.mensagem);
    setModal(null);
  }
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      equivalente = String(f.get("equivalente") ?? "");
    const resultado = salvarSuprimento(s, operacaoId, {
      id: modal === "novo" ? `${tipo}-${operacaoId}` : item.id,
      nome: String(f.get("nome") ?? ""),
      descricao: String(f.get("descricao") ?? ""),
      unidadeCompra: String(f.get("unidadeCompra")) as UnidadeCompra,
      unidadeBase: String(f.get("unidadeBase")) as Unidade,
      equivalente: equivalente.trim() ? Number(equivalente) : null,
      minimo: Number(f.get("minimo")),
      custo: Number(f.get("custo")),
      fornecedor: String(f.get("fornecedor") ?? ""),
      ...(embalagem ? { tipoEmbalagem: String(f.get("tipoEmbalagem")) as TipoEmbalagem } : {}),
    });
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setEstado(resultado.estado);
    if (modal === "novo") setFoco(`${tipo}-${operacaoId}`);
    setBusca("");
    setStatus("todos");
    setAba("lista");
    toast.success(resultado.mensagem);
    setModal(null);
  }
  const resumoSaldo = (i: Suprimento) => {
    const qtd = pacotes(i);
    return qtd === null
      ? `${numero(i.saldo)} un. (fardo a definir)`
      : `${numero(qtd)} ${plural(i.unidadeCompra, qtd)}`;
  };
  const ultimaConferencia =
    s.itens
      .map((i) => i.conferencia)
      .sort()
      .at(-1) ?? "";
  return (
    <div data-testid={`estoque-${tipo}`}>
      <ModuleHeader
        icone={embalagem ? Package : Layers}
        titulo={titulo}
        subtitulo={
          embalagem
            ? "Controle de fardos, pacotes e unidades de embalagens da Néia Salgados."
            : "Controle simplificado por pacotes, sacos, quilos, litros, galões e unidades."
        }
        acoes={
          <>
            <div className="est-search">
              <Search size={16} />
              <Input
                aria-label={`Buscar ${embalagem ? "embalagem" : "insumo"}`}
                placeholder={`Buscar ${embalagem ? "embalagem" : "insumo"}...`}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            {!embalagem && (
              <ActionButton onClick={() => editar()}>
                <Plus size={16} />
                Cadastrar Insumo
              </ActionButton>
            )}
          </>
        }
      />
      {embalagem && (
        <div className="est-explanation">
          <Info size={25} />
          <div>
            <b>Estoque exclusivo de Embalagens</b>
            <p>
              Controle simplificado de caixas, sacolas e demais embalagens. Independente dos
              produtos, dos salgados e dos insumos. Unidades por fardo/pacote configuráveis —
              exemplos fictícios.
            </p>
          </div>
          <Boxes size={44} />
        </div>
      )}
      <div className="est-kpis est-kpis-five">
        <MetricCard
          icone={Package}
          label="Total de itens"
          valor={<span className="est-gold">{k.total}</span>}
          detalhe={embalagem ? "Tipos de embalagens" : "Insumos cadastrados"}
        />
        {embalagem && (
          <MetricCard
            icone={Boxes}
            label="Saldo total"
            valor={<span className="est-green">{numero(k.pacotes)} volumes</span>}
            detalhe={`Fardos / pacotes equivalentes${k.semConversao ? ` • ${k.semConversao} a definir` : ""}`}
            cor={ERP_COLORS.green}
          />
        )}
        <MetricCard
          icone={CheckCircle2}
          label="Itens em OK"
          valor={<span className="est-green">{k.ok}</span>}
          detalhe="Saldo acima do mínimo"
          cor={ERP_COLORS.green}
        />
        <MetricCard
          icone={AlertTriangle}
          label={embalagem ? "Reposição (atenção)" : "Atenção"}
          valor={<span className="est-gold">{k.baixos}</span>}
          detalhe="No mínimo / abaixo / a configurar"
          cor={ERP_COLORS.orange}
        />
        {embalagem ? (
          <MetricCard
            icone={Truck}
            label="Fornecedores"
            valor={k.fornecedores}
            detalhe="No cadastro demonstrativo"
          />
        ) : (
          <>
            <MetricCard
              icone={ShoppingCart}
              label="Reposição sugerida"
              valor={<span className="est-red">{k.baixos} item(ns)</span>}
              cor={ERP_COLORS.red}
              detalhe="Sem compra automática"
            />
            <ActionButton className="est-buy-card" onClick={gerarCompra}>
              <ShoppingCart size={30} />
              <span>
                Gerar compra<small>Com itens em reposição</small>
              </span>
            </ActionButton>
          </>
        )}
      </div>
      <div className={embalagem ? "" : "est-supplies-grid"}>
        <div className="est-main-column">
          <div className="est-toolbar">
            <div className="est-tabs">
              {[
                ["lista", embalagem ? "Lista de Embalagens" : "Lista de Insumos", ClipboardList],
                ["conferencia", "Conferência de Estoque", ClipboardCheck],
                ["historico", "Histórico de Movimentações", History],
                ...(embalagem ? [["fornecedores", "Fornecedores", Truck] as const] : []),
              ].map(([v, label, Icone]) => {
                const Icon = Icone as typeof ClipboardList;
                return (
                  <ActionButton
                    key={String(v)}
                    variant={aba === v ? "gold" : "ghost"}
                    onClick={() => setAba(String(v))}
                  >
                    <Icon size={16} />
                    {String(label)}
                  </ActionButton>
                );
              })}
            </div>
            {embalagem ? (
              <ActionButton onClick={() => abrir("compra")}>
                <Plus size={16} />
                Registrar movimento
              </ActionButton>
            ) : (
              <select
                aria-label="Filtrar situação de insumos"
                className="est-select est-status-filter"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="todos">Todos os status</option>
                <option value="ok">OK</option>
                <option value="atencao">Atenção / reposição</option>
              </select>
            )}
          </div>
          {embalagem && (
            <div className="est-compact-filters">
              <select
                aria-label="Filtrar situação de embalagens"
                className="est-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="todos">Todas as situações</option>
                <option value="ok">OK</option>
                <option value="atencao">Atenção / reposição</option>
              </select>
              <ActionButton variant="ghost" onClick={() => editar()}>
                <Plus size={15} />
                Cadastrar Embalagem
              </ActionButton>
            </div>
          )}
          {(aba === "lista" || aba === "conferencia") && (
            <SectionCard className="est-table-panel" bodyClassName="p-0">
              <p className="est-table-hint">Deslize a tabela para ver saldos, custos e ações →</p>
              <DarkTable
                colunas={[
                  embalagem ? "Embalagem" : "Insumo",
                  embalagem ? "Unid. por fardo / pacote" : "Unidade / embalagem",
                  "Saldo atual",
                  "Estoque mínimo",
                  "Custo de compra",
                  "Fornecedor",
                  "Situação",
                  "Ações",
                ]}
                vazio={!lista.length ? "Nenhum item neste filtro." : undefined}
              >
                {lista.map((i) => (
                  <DarkTableRow key={i.id}>
                    <td data-selecionado={i.id === item.id}>
                      <button
                        className="est-product"
                        data-testid={`suprimento-${i.id}`}
                        onClick={() => setFoco(i.id)}
                      >
                        <IconeItem item={i} />
                        <span>
                          <b>{i.nome}</b>
                          {embalagem && <small>{i.descricao}</small>}
                        </span>
                      </button>
                    </td>
                    <td>
                      {i.equivalente ? (
                        `${numero(i.equivalente)} ${i.unidadeBase} / ${i.unidadeCompra}`
                      ) : (
                        <button className="est-text-action" onClick={() => editar(i.id)}>
                          A definir · configurar
                        </button>
                      )}
                    </td>
                    <td>
                      <b>{resumoSaldo(i)}</b>
                      <small>
                        ({numero(i.saldo)} {i.unidadeBase}){i.estimado ? " · estimado" : ""}
                      </small>
                    </td>
                    <td>
                      {numero(i.minimo)} {plural(i.unidadeCompra, i.minimo)}
                    </td>
                    <td>
                      {dinheiro(i.custo)}
                      <small>por {i.unidadeCompra}</small>
                    </td>
                    <td>{i.fornecedor}</td>
                    <td>
                      <SituacaoItem item={i} />
                    </td>
                    <td>
                      <div className="est-row-actions">
                        {aba === "conferencia" ? (
                          <ActionButton variant="ghost" onClick={() => abrir("conferencia", i.id)}>
                            Conferir
                          </ActionButton>
                        ) : (
                          <>
                            <button
                              className="est-icon"
                              aria-label={`Editar ${i.nome}`}
                              onClick={() => editar(i.id)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="est-icon"
                              aria-label={`Histórico de ${i.nome}`}
                              onClick={() => {
                                setFoco(i.id);
                                setModal("historico");
                              }}
                            >
                              <BarChart3 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </DarkTableRow>
                ))}
              </DarkTable>
            </SectionCard>
          )}
          {aba === "historico" && (
            <SectionCard titulo="Histórico de movimentações demonstrativas">
              <HistoricoEstoque movimentos={s.historico} nomes={nomes} />
            </SectionCard>
          )}
          {aba === "fornecedores" && (
            <SectionCard titulo="Fornecedores das embalagens">
              <DarkTable colunas={["Fornecedor", "Tipos de embalagem", "Cadastro"]}>
                {[...new Set(s.itens.map((i) => i.fornecedor))].map((f) => (
                  <DarkTableRow key={f}>
                    <td>{f}</td>
                    <td>{s.itens.filter((i) => i.fornecedor === f).length}</td>
                    <td>Demonstração local</td>
                  </DarkTableRow>
                ))}
              </DarkTable>
            </SectionCard>
          )}
          {!embalagem && (
            <>
              <div className="est-quick-actions">
                <ActionButton onClick={() => abrir("compra")}>
                  <ShoppingCart size={26} />
                  <span>
                    Registrar compra<small>Entrada de insumos</small>
                  </span>
                </ActionButton>
                <ActionButton variant="ghost" onClick={() => abrir("fechada")}>
                  <ArrowDownToLine size={26} />
                  <span>
                    Registrar retirada<small>Pacote fechado / galão</small>
                  </span>
                </ActionButton>
                <ActionButton variant="ghost" onClick={() => abrir("parcial")}>
                  <Milk size={26} />
                  <span>
                    Retirada parcial<small>Quantidade aproximada</small>
                  </span>
                </ActionButton>
                <ActionButton variant="ghost" onClick={() => abrir("conferencia")}>
                  <ClipboardCheck size={26} />
                  <span>
                    Conferência<small>Ajuste de saldo estimado</small>
                  </span>
                </ActionButton>
              </div>
              <SectionCard
                titulo={
                  <span className="est-inline">
                    <BarChart3 size={20} />
                    Informações do estoque
                  </span>
                }
              >
                <p className="est-muted">
                  Acompanhe o consumo por item, o custo e a necessidade de reposição. Não há baixa
                  automática por salgado vendido.
                </p>
                <div className="est-info-four">
                  <button onClick={() => setAba("historico")}>
                    <BarChart3 />
                    <span>
                      Consumo por item<small>Consultar movimentos</small>
                    </span>
                  </button>
                  <button onClick={gerarCompra}>
                    <ShoppingCart />
                    <span>
                      Sugestão de compra<small>Com base no mínimo</small>
                    </span>
                  </button>
                  <div>
                    <Coins />
                    <span>
                      Custo estimado em estoque<b className="est-gold">{dinheiro(k.custo)}</b>
                    </span>
                  </div>
                  <div>
                    <CalendarDays />
                    <span>
                      Última conferência<b className="est-gold">{data(ultimaConferencia)}</b>
                    </span>
                  </div>
                </div>
              </SectionCard>
            </>
          )}
        </div>
        {!embalagem && (
          <aside className="est-side-column">
            <SectionCard
              titulo={
                <span className="est-inline">
                  <IconeItem item={item} />
                  {item.nome}
                </span>
              }
              acoes={<SituacaoItem item={item} />}
            >
              <dl className="est-definition">
                <div>
                  <dt>Saldo atual</dt>
                  <dd>
                    {resumoSaldo(item)}
                    <small>
                      ≈ {numero(item.saldo)} {item.unidadeBase}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Estoque mínimo</dt>
                  <dd>
                    {item.minimo} {plural(item.unidadeCompra, item.minimo)}
                  </dd>
                </div>
                <div>
                  <dt>Custo por embalagem</dt>
                  <dd>{dinheiro(item.custo)}</dd>
                </div>
                <div>
                  <dt>Fornecedor</dt>
                  <dd>{item.fornecedor}</dd>
                </div>
              </dl>
              <ActionButton variant="ghost" className="w-full" onClick={() => editar(item.id)}>
                <Pencil size={16} />
                Editar insumo
              </ActionButton>
            </SectionCard>
            <SectionCard
              titulo={
                <span className="est-inline">
                  <Bell size={18} />
                  Alertas e reposição
                </span>
              }
            >
              <p className="text-sm">
                {situacao(item) === "ok"
                  ? "O saldo estimado está acima do mínimo."
                  : "Este item está no mínimo ou abaixo do estoque mínimo."}
              </p>
              <p className="est-muted">
                Sugestão: {reposicao(item)} {plural(item.unidadeCompra, reposicao(item))}.
              </p>
              <ActionButton className="w-full" onClick={() => incluirCompra(item.id)}>
                <ShoppingCart size={16} />
                Incluir na lista de compras
              </ActionButton>
            </SectionCard>
            <SectionCard
              titulo="Movimentações recentes"
              acoes={
                <button className="est-text-action" onClick={() => setAba("historico")}>
                  Ver todas →
                </button>
              }
            >
              <ul className="est-recent">
                {s.historico.slice(0, 4).map((m) => (
                  <li key={m.id}>
                    <span className={m.quantidade < 0 ? "est-red" : "est-green"}>
                      {m.quantidade < 0 ? "↓" : "↑"}
                    </span>
                    <div>
                      <b>
                        {m.tipo} · {nomes[m.itemId]}
                      </b>
                      <small>
                        {numero(m.quantidade)} {m.unidade} · {data(m.data)}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <ActionButton variant="ghost" onClick={() => abrir("ajuste")}>
              <Pencil size={16} />
              Ajustar saldo com justificativa
            </ActionButton>
          </aside>
        )}
      </div>
      {embalagem && (
        <div className="est-bottom-three">
          <SectionCard
            titulo={
              <span className="est-inline">
                <Zap size={18} />
                Ações rápidas
              </span>
            }
          >
            <div className="est-package-actions">
              <ActionButton variant="ghost" onClick={() => abrir("compra")}>
                <ShoppingCart size={24} />
                Registrar compra
              </ActionButton>
              <ActionButton variant="ghost" onClick={() => abrir("fechada")}>
                <ArrowDownToLine size={24} />
                Retirar 1 {item.unidadeCompra}
              </ActionButton>
              <ActionButton variant="ghost" onClick={() => abrir("parcial")}>
                <Package size={24} />
                Retirada parcial
              </ActionButton>
            </div>
            <p className="est-muted">
              Item selecionado: {item.nome}. Sem controle de caixas montadas ou embalagens em uso.
            </p>
          </SectionCard>
          <SectionCard
            titulo={
              <span className="est-inline">
                <CalendarDays size={18} />
                Última conferência
              </span>
            }
          >
            <p>
              {data(ultimaConferencia)} às {ultimaConferencia.slice(11, 16)}
            </p>
            <p className="est-muted">Por: Administração · dados fictícios</p>
            <ActionButton variant="ghost" onClick={() => abrir("conferencia")}>
              <ClipboardCheck size={16} />
              Nova conferência
            </ActionButton>
            <ActionButton variant="ghost" onClick={() => abrir("ajuste")}>
              <Pencil size={16} />
              Ajuste justificado
            </ActionButton>
          </SectionCard>
          <SectionCard
            titulo={
              <span className="est-inline">
                <ShoppingCart size={18} />
                Reposição sugerida
              </span>
            }
          >
            <ul className="est-replenishment">
              {s.itens
                .filter((i) => reposicao(i) > 0)
                .map((i) => (
                  <li key={i.id}>
                    <span className="est-gold">●</span>
                    <button
                      onClick={() => {
                        setFoco(i.id);
                        incluirCompra(i.id);
                      }}
                    >
                      {i.nome}: comprar {reposicao(i)} {plural(i.unidadeCompra, reposicao(i))}
                    </button>
                  </li>
                ))}
            </ul>
            <ActionButton variant="ghost" onClick={gerarCompra}>
              Gerar lista de compra
            </ActionButton>
          </SectionCard>
        </div>
      )}
      {modal === "movimento" && (
        <ModalEstoque titulo={`${TITULOS[movimento]} — ${item.nome}`} fechar={() => setModal(null)}>
          <p>
            Saldo: <b>{resumoSaldo(item)}</b> ({numero(item.saldo)} {item.unidadeBase})
            {!embalagem && " · saldo estimado"}.
          </p>
          <form className="est-form" onSubmit={enviar}>
            <label>
              Movimentação
              <select
                aria-label={`Tipo de movimentação de ${tipo}`}
                className="est-select"
                value={movimento}
                onChange={(e) => {
                  setMovimento(e.target.value as AcaoSuprimento["tipo"]);
                  setErro("");
                }}
              >
                {Object.entries(TITULOS).map(([v, t]) => (
                  <option key={v} value={v}>
                    {embalagem && v === "parcial" ? "Retirada de quantidade parcial" : t}
                  </option>
                ))}
              </select>
            </label>
            <Campo
              key={`${movimento}-${item.id}`}
              name="quantidade"
              label={
                movimento === "conferencia" || movimento === "ajuste"
                  ? "Saldo contado"
                  : "Quantidade"
              }
              type="number"
              min={
                movimento === "conferencia" || movimento === "ajuste"
                  ? 0
                  : movimento === "fechada"
                    ? 1
                    : 0.000001
              }
              step={movimento === "fechada" ? "1" : "any"}
              value={movimento === "conferencia" || movimento === "ajuste" ? item.saldo : 1}
            />
            {movimento === "fechada" ? (
              <>
                <input type="hidden" name="unidade" value="compra" />
                <p>
                  Retirada de {item.unidadeCompra} fechado:{" "}
                  {item.equivalente
                    ? `${item.equivalente} ${item.unidadeBase} por ${item.unidadeCompra}`
                    : "quantidade por fardo/pacote ainda não configurada — edite o item antes de confirmar"}
                  .
                </p>
              </>
            ) : (
              <Seletor
                key={movimento}
                name="unidade"
                label="Unidade da quantidade"
                value={movimento === "compra" ? "compra" : item.unidadeBase}
              >
                <option value="compra">
                  {item.unidadeCompra} de compra{" "}
                  {item.equivalente ? `(${item.equivalente} ${item.unidadeBase})` : "(a definir)"}
                </option>
                {(item.unidadeBase === "kg" || item.unidadeBase === "g"
                  ? ["kg", "g"]
                  : item.unidadeBase === "l" || item.unidadeBase === "ml"
                    ? ["l", "ml"]
                    : ["un"]
                ).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Seletor>
            )}
            {movimento === "compra" && (
              <>
                <Campo
                  name="custo"
                  label={`Preço de compra por ${item.unidadeCompra} (R$)`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.custo}
                />
                <Campo name="fornecedor" label="Fornecedor" value={item.fornecedor} />
              </>
            )}
            <Campo
              name="motivo"
              label="Justificativa / referência"
              value={
                movimento === "fechada" ? "Retirada de embalagem fechada para uso da loja" : ""
              }
            />
            {erro && (
              <p role="alert" className="est-red">
                {erro}
              </p>
            )}
            <ActionButton type="submit">
              <CheckCircle2 size={16} />
              Confirmar movimentação
            </ActionButton>
          </form>
        </ModalEstoque>
      )}
      {(modal === "editar" || modal === "novo") && (
        <ModalEstoque
          titulo={
            modal === "novo"
              ? `Cadastrar ${embalagem ? "embalagem" : "insumo"}`
              : `Editar ${item.nome}`
          }
          fechar={() => setModal(null)}
        >
          <form className="est-form" onSubmit={salvar}>
            <Campo name="nome" label="Nome" value={modal === "novo" ? "" : item.nome} />
            {embalagem && (
              <Seletor
                name="tipoEmbalagem"
                label="Tipo de embalagem"
                value={modal === "novo" ? "Outra" : (item.tipoEmbalagem ?? "Outra")}
              >
                {TIPOS_EMBALAGEM.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Seletor>
            )}
            <Campo
              name="descricao"
              label="Descrição"
              required={false}
              value={modal === "novo" ? "" : item.descricao}
            />
            <div className="est-form-grid">
              <Seletor
                name="unidadeCompra"
                label="Unidade de compra"
                value={modal === "novo" ? (embalagem ? "fardo" : "pacote") : item.unidadeCompra}
              >
                {(embalagem ? UNIDADES_EMBALAGEM : UNIDADES_COMPRA).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Seletor>
              <Campo
                name="equivalente"
                label={
                  embalagem
                    ? "Unidades por fardo/pacote (configurável)"
                    : "Quantidade equivalente por embalagem"
                }
                type="number"
                min={embalagem ? 1 : 0.000001}
                step={embalagem ? "1" : "any"}
                required={!embalagem}
                value={modal === "novo" ? "" : (item.equivalente ?? "")}
              />
              <Seletor
                name="unidadeBase"
                label="Unidade equivalente"
                value={embalagem ? "un" : modal === "novo" ? "kg" : item.unidadeBase}
              >
                {(embalagem ? ["un"] : ["g", "kg", "ml", "l", "un"]).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Seletor>
              <Campo
                name="minimo"
                label="Estoque mínimo (embalagens de compra)"
                type="number"
                min={0}
                step="any"
                value={modal === "novo" ? 1 : item.minimo}
              />
              <Campo
                name="custo"
                label="Preço da embalagem de compra (R$)"
                type="number"
                min={0}
                step="0.01"
                value={modal === "novo" ? 0 : item.custo}
              />
              <Campo
                name="fornecedor"
                label="Fornecedor"
                value={modal === "novo" ? "" : item.fornecedor}
              />
            </div>
            <p className="est-muted">
              {embalagem
                ? "Deixe unidades por fardo em branco se ainda não souber. Até configurar, use quantidades em unidades."
                : "Pacotes abertos e saldos aproximados são permitidos. Não exigimos medição a cada uso."}{" "}
              Alterar a configuração não altera o saldo físico existente.
            </p>
            {erro && (
              <p role="alert" className="est-red">
                {erro}
              </p>
            )}
            <ActionButton type="submit">Salvar configuração demonstrativa</ActionButton>
          </form>
        </ModalEstoque>
      )}
      {modal === "historico" && (
        <ModalEstoque titulo={`Histórico — ${item.nome}`} fechar={() => setModal(null)}>
          <HistoricoEstoque
            movimentos={s.historico.filter((m) => m.itemId === item.id)}
            nomes={nomes}
          />
        </ModalEstoque>
      )}
      {modal === "compras" && (
        <ModalEstoque
          titulo="Lista de compras — rascunho demonstrativo"
          fechar={() => setModal(null)}
        >
          <p>
            Somente sugestão local. Não gera compra operacional, conta a pagar nem movimenta
            estoque.
          </p>
          <DarkTable
            colunas={["Item", "Fornecedor", "Comprar", "Custo estimado"]}
            vazio={!compras.length ? "Nenhum item em reposição selecionado." : undefined}
          >
            {compras.map((i) => (
              <DarkTableRow key={i.id}>
                <td>{i.nome}</td>
                <td>{i.fornecedor}</td>
                <td>
                  {reposicao(i) || 1} {plural(i.unidadeCompra, reposicao(i) || 1)}
                </td>
                <td>{dinheiro((reposicao(i) || 1) * i.custo)}</td>
              </DarkTableRow>
            ))}
          </DarkTable>
          {rascunho && (
            <p role="status" className="est-green">
              Rascunho demonstrativo gerado para revisão. Nenhum pedido foi enviado ao fornecedor.
            </p>
          )}
          <ActionButton
            disabled={!compras.length || rascunho}
            onClick={() => {
              setRascunho(true);
              toast.success("Rascunho de compra demonstrativo gerado.");
            }}
          >
            Gerar rascunho demonstrativo
          </ActionButton>
        </ModalEstoque>
      )}
    </div>
  );
}
