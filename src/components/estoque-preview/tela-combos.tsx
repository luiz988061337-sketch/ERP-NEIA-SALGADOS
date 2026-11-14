import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  Eye,
  Layers,
  Package,
  Pencil,
  Plus,
  Power,
  Search,
  Snowflake,
  Trash2,
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
import { Campo, dinheiro, ModalEstoque, numero, Seletor } from "./compartilhados";
import {
  confirmarCombo,
  precoCombo,
  salvarCombo,
  validarCombo,
  type ComboDemo,
  type ParteCombo,
} from "./combos";
import { CATEGORIAS_PRODUTO_DEMO, normalizarNome } from "./produtos";
import { ehSalgadoCongelado, saldoSalgado, type ProdutoDemo } from "./salgados";
import { PASSO_COMBO } from "@/lib/totals";

const CATEGORIAS_COMBO = CATEGORIAS_PRODUTO_DEMO.filter((c) => c.comboPrecoUnit != null);

export function CadastroCombos() {
  const c = useEstoques(),
    navegar = useNavigate();
  const [busca, setBusca] = useState(""),
    [categoria, setCategoria] = useState("todos"),
    [situacao, setSituacao] = useState("todos");
  const [modal, setModal] = useState<"novo" | "editar" | "consultar" | "pedido" | null>(null);
  const [foco, setFoco] = useState(""),
    [operacaoId, setOperacaoId] = useState(""),
    [erro, setErro] = useState("");
  const [rascunho, setRascunho] = useState<Record<string, number>>({});
  const combo = c.combos.itens.find((x) => x.id === foco);
  const salgados = c.salgados.produtos.filter(
    (p) => p.ativo && ehSalgadoCongelado(p) && p.tipoVenda === "combo_50",
  );
  const lista = c.combos.itens.filter(
    (x) =>
      normalizarNome(`${x.nome} ${x.descricao}`).includes(normalizarNome(busca)) &&
      (categoria === "todos" || x.categoria === categoria) &&
      (situacao === "todos" || x.ativo === (situacao === "ativo")),
  );
  const totalUnidades = c.combos.itens.reduce((n, x) => n + x.total, 0);
  // Combos com reserva pendente de fato no Estoque de Salgados.
  const combosComReserva = new Set(
    c.salgados.reservas
      .filter((r) => r.origemId && r.quantidade - r.consumida - r.liberada > 0)
      .map((r) => r.origemId!),
  );

  function abrir(modo: "novo" | "editar" | "consultar" | "pedido", id = "") {
    setModal(modo);
    setFoco(id);
    setOperacaoId(c.proximaOperacao());
    setErro("");
    if (modo !== "novo") setRascunho({});
  }
  function novoRascunho(comboBase: ComboDemo): ParteCombo[] {
    return comboBase.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade }));
  }
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const itens: ParteCombo[] = [];
    for (const [chave, valor] of f.entries()) {
      if (!chave.startsWith("qtd_")) continue;
      const produtoId = chave.replace("qtd_", "");
      const quantidade = Number(valor);
      if (Number.isSafeInteger(quantidade) && quantidade > 0) itens.push({ produtoId, quantidade });
    }
    const dados: ComboDemo = {
      id: modal === "editar" ? combo!.id : `combo-${operacaoId}`,
      nome: String(f.get("nome") ?? ""),
      descricao: String(f.get("descricao") ?? ""),
      categoria: String(f.get("categoria") ?? ""),
      total: Number(f.get("total")),
      itens,
      ativo: f.get("ativo") === "true",
    };
    const r = salvarCombo(
      c.combos,
      c.salgados.produtos,
      operacaoId,
      dados,
      modal === "editar" ? "editar" : "novo",
    );
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    c.setCombos(r.estado);
    toast.success(r.mensagem);
    setModal(null);
  }
  function duplicar(id: string) {
    const base = c.combos.itens.find((x) => x.id === id);
    if (!base) return;
    const operacao = c.proximaOperacao();
    const r = salvarCombo(
      c.combos,
      c.salgados.produtos,
      operacao,
      {
        ...structuredClone(base),
        id: `combo-${operacao}`,
        nome: `${base.nome} (cópia)`,
      },
      "novo",
    );
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    c.setCombos(r.estado);
    toast.success("Combo duplicado na demonstração, sem movimentar estoque.");
  }
  function alternar(id: string) {
    const base = c.combos.itens.find((x) => x.id === id);
    if (!base) return;
    const r = salvarCombo(
      c.combos,
      c.salgados.produtos,
      c.proximaOperacao(),
      { ...base, ativo: !base.ativo },
      "editar",
    );
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    c.setCombos(r.estado);
    toast.success(`${base.nome}: ${base.ativo ? "desativado" : "ativado"} na demonstração.`);
  }
  function confirmarPedido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!combo) return;
    const f = new FormData(e.currentTarget);
    const r = confirmarCombo(
      c.salgados,
      combo,
      c.proximaOperacao(),
      String(f.get("pedido") ?? ""),
      Number(f.get("quantidade")),
    );
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    c.setSalgados(r.estado);
    toast.success(r.mensagem);
    setModal(null);
  }
  const somaComposicao = Object.values(rascunho).reduce((n, q) => n + (Number(q) || 0), 0);
  return (
    <div data-testid="cadastro-combos">
      <ModuleHeader
        icone={Layers}
        titulo="Cadastro de Combos"
        subtitulo="Combos fixes por sabor. O combo não possui estoque: a reserva é feita por sabor no Estoque de Salgados."
        acoes={
          <>
            <div className="est-search">
              <Search size={16} />
              <Input
                aria-label="Pesquisar combos"
                placeholder="Pesquisar combos..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <ActionButton onClick={() => abrir("novo")}>
              <Plus size={17} />
              Cadastrar Combo
            </ActionButton>
          </>
        }
      />
      <div className="est-tabs est-product-tabs">
        <span className="est-active-tab">
          <Layers size={17} />
          Cadastro de Combos
        </span>
        <ActionButton
          variant="ghost"
          onClick={() => void navegar({ to: "/preview/estoque-salgados" })}
        >
          <Snowflake size={17} />
          Estoque de Salgados
        </ActionButton>
      </div>
      <div className="est-kpis est-kpis-five">
        <MetricCard
          icone={Layers}
          label="Combos cadastrados"
          valor={c.combos.itens.length}
          detalhe="Composição fixa por sabor"
        />
        <MetricCard
          icone={CheckCircle2}
          label="Ativos"
          valor={c.combos.itens.filter((x) => x.ativo).length}
          detalhe="Disponíveis para reserva"
          cor={ERP_COLORS.green}
        />
        <MetricCard
          icone={Package}
          label="Unidades por combo"
          valor={totalUnidades}
          detalhe="Soma das composições"
        />
        <MetricCard
          icone={Layers}
          label="Combos em reserva"
          valor={combosComReserva.size}
          detalhe="Reserva pendente no Estoque de Salgados"
          cor={ERP_COLORS.blue}
        />
        <MetricCard
          icone={Snowflake}
          label="Sabores elegíveis"
          valor={salgados.length}
          detalhe="Do Cadastro de Produtos"
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
            {CATEGORIAS_COMBO.map((cat) => (
              <option key={cat.nome}>{cat.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select
            aria-label="Situação dos combos"
            className="est-select"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </label>
      </div>
      <SectionCard className="est-table-panel" bodyClassName="p-0">
        <p className="est-table-hint">Deslize a tabela para ver composições e ações →</p>
        <DarkTable
          colunas={[
            "Combo / identificador",
            "Categoria",
            "Total",
            "Composição",
            "Preço de venda",
            "Situação",
            "Ações",
          ]}
          vazio={!lista.length ? "Nenhum combo neste filtro." : undefined}
        >
          {lista.map((x) => (
            <DarkTableRow key={x.id}>
              <td data-testid={`combo-${x.id}`}>
                <b>{x.nome}</b>
                <small>{x.id}</small>
              </td>
              <td>{x.categoria}</td>
              <td>
                <b>{numero(x.total)} un.</b>
              </td>
              <td>
                {x.itens.map((i) => {
                  const p = c.salgados.produtos.find((prod) => prod.id === i.produtoId);
                  return (
                    <small key={i.produtoId}>
                      {numero(i.quantidade)}× {p?.nome ?? i.produtoId}
                    </small>
                  );
                })}
              </td>
              <td>
                <b>{dinheiro(precoCombo(x) ?? 0)}</b>
                <small>{dinheiro((precoCombo(x) ?? 0) / (x.total || 1))}/un · categoria</small>
              </td>
              <td>
                <StatusBadge tom={x.ativo ? "ok" : "neutro"}>
                  {x.ativo ? "Ativo" : "Inativo"}
                </StatusBadge>
                {combosComReserva.has(x.id) && <small className="est-gold">Reserva pendente</small>}
              </td>
              <td>
                <div className="est-row-actions">
                  <button
                    className="est-icon"
                    aria-label={`Consultar ${x.nome}`}
                    onClick={() => abrir("consultar", x.id)}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="est-icon"
                    aria-label={`Editar combo ${x.nome}`}
                    onClick={() => abrir("editar", x.id)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="est-icon"
                    aria-label={`Duplicar combo ${x.nome}`}
                    onClick={() => duplicar(x.id)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="est-icon"
                    aria-label={`${x.ativo ? "Desativar" : "Ativar"} combo ${x.nome}`}
                    onClick={() => alternar(x.id)}
                  >
                    <Power size={16} />
                  </button>
                </div>
              </td>
            </DarkTableRow>
          ))}
        </DarkTable>
      </SectionCard>
      <p className="est-muted">
        Dados fictícios compartilhados com o Estoque de Salgados durante esta navegação. Recarregar
        a página reinicia a demonstração. Combos não possuem saldo, estoque ou reserva própria.
      </p>
      {(modal === "novo" || modal === "editar") && (
        <ModalEstoque
          titulo={modal === "novo" ? "Cadastrar Combo" : `Editar combo — ${combo!.nome}`}
          fechar={() => setModal(null)}
        >
          <form className="est-form" onSubmit={salvar}>
            <p className="est-muted">
              Identificador gerado automaticamente: <b>{combo?.id ?? `combo-${operacaoId}`}</b>
            </p>
            <Campo name="nome" label="Nome do combo" value={combo?.nome ?? ""} />
            <Campo
              name="descricao"
              label="Descrição"
              required={false}
              value={combo?.descricao ?? ""}
            />
            <div className="est-form-grid">
              <Seletor
                name="categoria"
                label="Categoria comercial"
                value={combo?.categoria ?? "Fritos"}
              >
                {CATEGORIAS_COMBO.map((cat) => (
                  <option key={cat.nome}>{cat.nome}</option>
                ))}
              </Seletor>
              <Campo
                name="total"
                label={`Quantidade total (múltiplo de ${PASSO_COMBO})`}
                type="number"
                min={PASSO_COMBO}
                step={PASSO_COMBO}
                value={combo?.total ?? 100}
              />
            </div>
            <div className="est-form-grid">
              <Seletor
                name="ativo"
                label="Situação"
                value={combo?.ativo === false ? "false" : "true"}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </Seletor>
              <div className="est-muted" style={{ alignSelf: "center" }}>
                O preço do combo é o unitário da categoria, como no checkout existente.
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Sabores participantes</p>
              <p className="est-muted">
                Selecionados do Cadastro de Produtos. Todos devem pertencer à categoria do combo.
              </p>
              <div className="est-combo-sabores">
                {salgados
                  .filter(
                    (p) =>
                      !combo || combo.categoria === undefined || p.categoria === combo.categoria,
                  )
                  .map((p) => (
                    <div key={p.id} className="est-combo-sabor">
                      <span>
                        <b>{p.nome}</b>
                        <small>
                          {p.categoria} ·{" "}
                          {numero(combo?.itens.find((i) => i.produtoId === p.id)?.quantidade ?? 0)}{" "}
                          un.
                        </small>
                      </span>
                      <input
                        type="number"
                        name={`qtd_${p.id}`}
                        min={0}
                        step={1}
                        defaultValue={
                          combo?.itens.find((i) => i.produtoId === p.id)?.quantidade ?? 0
                        }
                        placeholder="0"
                        aria-label={`Quantidade de ${p.nome}`}
                      />
                    </div>
                  ))}
              </div>
            </div>
            <p className="est-muted">
              A soma das quantidades deve fechar exatamente o total configurado. Cadastrar ou editar
              um combo nunca movimenta o estoque.
            </p>
            {erro && (
              <p role="alert" className="est-red">
                {erro}
              </p>
            )}
            <ActionButton type="submit">Salvar combo demonstrativo</ActionButton>
          </form>
        </ModalEstoque>
      )}
      {modal === "consultar" && combo && (
        <ModalEstoque titulo={combo.nome} fechar={() => setModal(null)}>
          <dl className="est-definition">
            <div>
              <dt>Identificador único</dt>
              <dd>{combo.id}</dd>
            </div>
            <div>
              <dt>Categoria comercial</dt>
              <dd>{combo.categoria}</dd>
            </div>
            <div>
              <dt>Quantidade total</dt>
              <dd>{numero(combo.total)} un.</dd>
            </div>
            <div>
              <dt>Preço de venda</dt>
              <dd>
                {dinheiro(precoCombo(combo) ?? 0)}{" "}
                <small>{dinheiro((precoCombo(combo) ?? 0) / (combo.total || 1))}/un</small>
              </dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{combo.ativo ? "Ativo" : "Inativo"}</dd>
            </div>
          </dl>
          <DarkTable colunas={["Sabor", "Quantidade", "Disponível no estoque"]}>
            {combo.itens.map((i) => {
              const p = c.salgados.produtos.find((prod) => prod.id === i.produtoId);
              const saldo = saldoSalgado(c.salgados, i.produtoId);
              return (
                <DarkTableRow key={i.produtoId}>
                  <td>{p?.nome ?? i.produtoId}</td>
                  <td>{numero(i.quantidade)} un.</td>
                  <td>{numero(saldo.disponivel)} un.</td>
                </DarkTableRow>
              );
            })}
          </DarkTable>
          <p className="est-muted">
            O combo não tem estoque próprio. Confirmar um pedido reserva cada sabor listado acima no
            mesmo total reservado do Estoque de Salgados.
          </p>
          <ActionButton onClick={() => abrir("pedido", combo.id)}>
            <CheckCircle2 size={16} />
            Confirmar pedido com este combo
          </ActionButton>
        </ModalEstoque>
      )}
      {modal === "pedido" && combo && (
        <ModalEstoque titulo={`Confirmar pedido — ${combo.nome}`} fechar={() => setModal(null)}>
          <p>
            <b>{combo.nome}</b> · {numero(combo.total)} un. · {dinheiro(precoCombo(combo) ?? 0)}
          </p>
          <DarkTable colunas={["Sabor", "Reservado por combo", "Disponível atual"]}>
            {combo.itens.map((i) => {
              const p = c.salgados.produtos.find((prod) => prod.id === i.produtoId);
              const saldo = saldoSalgado(c.salgados, i.produtoId);
              return (
                <DarkTableRow key={i.produtoId}>
                  <td>{p?.nome ?? i.produtoId}</td>
                  <td>{numero(i.quantidade)} un.</td>
                  <td>{numero(saldo.disponivel)} un.</td>
                </DarkTableRow>
              );
            })}
          </DarkTable>
          <form className="est-form" onSubmit={confirmarPedido}>
            <Campo
              name="pedido"
              label="Pedido confirmado (referência demonstrativa)"
              value="PED-COMBO-DEMO"
            />
            <Campo
              name="quantidade"
              label="Quantidade de combos"
              type="number"
              min={1}
              step={1}
              value={1}
            />
            {erro && (
              <p role="alert" className="est-red">
                {erro}
              </p>
            )}
            <p className="est-muted">
              A reserva é feita uma única vez por sabor. Se algum sabor não tiver saldo, o pedido
              inteiro é rejeitado.
            </p>
            <ActionButton type="submit">
              <CheckCircle2 size={16} />
              Confirmar pedido e reservar sabores
            </ActionButton>
          </form>
        </ModalEstoque>
      )}
    </div>
  );
}
