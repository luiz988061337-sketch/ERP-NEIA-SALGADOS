import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, Eye, Pencil, Plus, Power, Search, Snowflake } from "lucide-react";
import { toast } from "sonner";
import {
  ActionButton,
  DarkTable,
  DarkTableRow,
  MetricCard,
  ModuleHeader,
  SectionCard,
  StatusBadge,
} from "@/components/admin/erp-ui";
import { Input } from "@/components/ui/input";
import { useEstoques } from "./contexto";
import { Campo, dinheiro, ModalEstoque, numero, Seletor } from "./compartilhados";
import {
  CATEGORIAS_PRODUTO_DEMO,
  normalizarNome,
  precoComercialDemo,
  quantidadeVendaDemo,
  salvarProdutoDemo,
} from "./produtos";
import type { ProdutoDemo } from "./salgados";

export function CadastroProdutosDemo() {
  const c = useEstoques(),
    navegar = useNavigate();
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState("todos");
  const [modal, setModal] = useState<"novo" | "editar" | "consultar" | null>(null);
  const [foco, setFoco] = useState(""),
    [operacaoId, setOperacaoId] = useState(""),
    [erro, setErro] = useState("");
  const produto = c.salgados.produtos.find((p) => p.id === foco);
  const lista = c.salgados.produtos.filter(
    (p) =>
      normalizarNome(`${p.nome} ${p.sabor} ${p.descricao} ${p.id}`).includes(
        normalizarNome(busca),
      ) &&
      (situacao === "todos" || p.ativo === (situacao === "ativo")),
  );
  function abrir(modo: "novo" | "editar" | "consultar", id = "") {
    setModal(modo);
    setFoco(id);
    setOperacaoId(c.proximaOperacao());
    setErro("");
  }
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dados: ProdutoDemo = {
      id: modal === "editar" ? produto!.id : `produto-${operacaoId}`,
      nome: String(f.get("nome") ?? ""),
      categoria: String(f.get("categoria") ?? ""),
      preparo: String(f.get("preparo")) as ProdutoDemo["preparo"],
      descricao: String(f.get("descricao") ?? ""),
      sabor: String(f.get("sabor") ?? ""),
      natureza: String(f.get("natureza")) as ProdutoDemo["natureza"],
      preco: Number(f.get("preco")),
      tipoVenda: String(f.get("tipoVenda")) as ProdutoDemo["tipoVenda"],
      ativo: f.get("ativo") === "true",
      minimo: Number(f.get("minimo")),
      fornecedor: produto?.fornecedor ?? "Produção Néia",
      imagem: produto?.imagem ?? "croquete",
    };
    const r = salvarProdutoDemo(
      c.salgados,
      operacaoId,
      dados,
      modal === "editar" ? "editar" : "novo",
    );
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    c.setSalgados(r.estado);
    setBusca("");
    setSituacao("todos");
    toast.success(r.mensagem);
    setModal(null);
  }
  function alternar(p: ProdutoDemo) {
    const r = salvarProdutoDemo(
      c.salgados,
      c.proximaOperacao(),
      { ...p, ativo: !p.ativo },
      "editar",
    );
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    c.setSalgados(r.estado);
    toast.success(`${p.nome}: ${p.ativo ? "desativado" : "ativado"} apenas na demonstração.`);
  }
  return (
    <div data-testid="cadastro-produtos">
      <ModuleHeader
        icone={ClipboardList}
        titulo="Cadastro de Produtos"
        subtitulo="Cadastro único de produtos e sabores. Somente salgados congelados são vinculados ao estoque de salgados."
        acoes={
          <>
            <div className="est-search">
              <Search size={16} />
              <Input
                aria-label="Pesquisar produtos"
                placeholder="Pesquisar produtos..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <ActionButton onClick={() => abrir("novo")}>
              <Plus size={17} />
              Cadastrar Produto
            </ActionButton>
          </>
        }
      />
      <div className="est-tabs est-product-tabs">
        <span className="est-active-tab">
          <ClipboardList size={17} />
          Cadastro de Produtos
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
          icone={ClipboardList}
          label="Produtos cadastrados"
          valor={c.salgados.produtos.length}
          detalhe="Identificadores únicos"
        />
        <MetricCard
          icone={ClipboardList}
          label="Ativos"
          valor={c.salgados.produtos.filter((p) => p.ativo).length}
          detalhe="Disponíveis para novas reservas"
        />
        <MetricCard
          icone={ClipboardList}
          label="Inativos"
          valor={c.salgados.produtos.filter((p) => !p.ativo).length}
          detalhe="Histórico e saldo preservados"
        />
        <MetricCard
          icone={ClipboardList}
          label="Fritos"
          valor={c.salgados.produtos.filter((p) => p.preparo === "frito").length}
          detalhe="Tipo de preparo"
        />
        <MetricCard
          icone={ClipboardList}
          label="Assados"
          valor={c.salgados.produtos.filter((p) => p.preparo === "assado").length}
          detalhe="Tipo de preparo"
        />
      </div>
      <div className="est-filters">
        <label>
          Situação
          <select
            aria-label="Situação dos produtos"
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
        <p className="est-table-hint">Deslize a tabela para consultar preços e ações →</p>
        <DarkTable
          colunas={[
            "Produto / identificador",
            "Categoria",
            "Preparo",
            "Modalidade comercial",
            "Preço",
            "Situação",
            "Ações",
          ]}
          vazio={!lista.length ? "Nenhum produto neste filtro." : undefined}
        >
          {lista.map((p) => (
            <DarkTableRow key={p.id}>
              <td data-testid={`cadastro-${p.id}`}>
                <b>{p.nome}</b>
                <small>{p.sabor || "Sem sabor específico"}</small>
                <small>{p.id}</small>
              </td>
              <td>{p.categoria}</td>
              <td>
                {p.preparo === "frito" ? "Frito" : p.preparo === "assado" ? "Assado" : "Outro"}
              </td>
              <td>{p.tipoVenda === "combo_50" ? "Múltiplos de 50" : "Unidade"}</td>
              <td>
                <b>{dinheiro(p.preco)} / un. avulsa</b>
                {p.tipoVenda === "combo_50" && (
                  <small>
                    Combo (categoria): {dinheiro(precoComercialDemo(p))}/un. ·{" "}
                    {dinheiro(precoComercialDemo(p) * quantidadeVendaDemo(p))}/
                    {quantidadeVendaDemo(p)} un.
                  </small>
                )}
              </td>
              <td>
                <StatusBadge tom={p.ativo ? "ok" : "neutro"}>
                  {p.ativo ? "Ativo" : "Inativo"}
                </StatusBadge>
              </td>
              <td>
                <div className="est-row-actions">
                  <button
                    className="est-icon"
                    aria-label={`Consultar ${p.nome}`}
                    onClick={() => abrir("consultar", p.id)}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="est-icon"
                    aria-label={`Editar produto ${p.nome}`}
                    onClick={() => abrir("editar", p.id)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="est-icon"
                    aria-label={`${p.ativo ? "Desativar" : "Ativar"} produto ${p.nome}`}
                    onClick={() => alternar(p)}
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
        Dados fictícios compartilhados com os estoques durante esta navegação. Recarregar a página
        reinicia a demonstração. Nenhum cadastro altera o cardápio real.
      </p>
      {(modal === "novo" || modal === "editar") && (
        <ModalEstoque
          titulo={modal === "novo" ? "Cadastrar Produto" : `Editar produto — ${produto!.nome}`}
          fechar={() => setModal(null)}
        >
          <form className="est-form" onSubmit={salvar}>
            <p className="est-muted">
              Identificador gerado automaticamente: <b>{produto?.id ?? `produto-${operacaoId}`}</b>
            </p>
            <Campo name="nome" label="Nome do produto" value={produto?.nome ?? ""} />
            <Campo
              name="sabor"
              label="Sabor (obrigatório para salgado)"
              required={false}
              value={produto?.sabor ?? ""}
            />
            <div className="est-form-grid">
              <Seletor
                name="natureza"
                label="Classificação do item"
                value={produto?.natureza ?? "salgado_congelado"}
              >
                <option value="salgado_congelado">Salgado congelado — vincular ao estoque</option>
                <option value="bebida">Bebida — sem estoque de salgados</option>
                <option value="outro">Outro produto — sem estoque de salgados</option>
              </Seletor>
              <Seletor name="categoria" label="Categoria" value={produto?.categoria ?? "Fritos"}>
                {CATEGORIAS_PRODUTO_DEMO.map((cat) => (
                  <option key={cat.nome}>{cat.nome}</option>
                ))}
              </Seletor>
              <Seletor name="preparo" label="Tipo de preparo" value={produto?.preparo ?? "frito"}>
                <option value="frito">Frito</option>
                <option value="assado">Assado</option>
                <option value="outro">Outro / não aplicável</option>
              </Seletor>
            </div>
            <Campo
              name="descricao"
              label="Descrição"
              required={false}
              value={produto?.descricao ?? ""}
            />
            <div className="est-form-grid">
              <Campo
                name="preco"
                label="Preço avulso / direto por unidade (R$)"
                type="number"
                min={0.01}
                step="0.01"
                value={produto?.preco ?? ""}
              />
              <Seletor
                name="tipoVenda"
                label="Modalidade comercial"
                value={produto?.tipoVenda ?? "combo_50"}
              >
                <option value="combo_50">Combo — múltiplos de 50</option>
                <option value="unidade">Venda por unidade</option>
              </Seletor>
              <Campo
                name="minimo"
                label="Estoque mínimo (unidades)"
                type="number"
                min={0}
                step="1"
                value={produto?.minimo ?? 0}
              />
              <Seletor
                name="ativo"
                label="Situação"
                value={produto?.ativo === false ? "false" : "true"}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </Seletor>
            </div>
            <p className="est-muted">
              Como no checkout existente, o preço de um combo montado pertence à categoria, não ao
              sabor: Fritos R$ 1,60/un.; Assados R$ 2,30/un. (valores fictícios). Editar o preço
              avulso não altera a categoria nem os combos. Cadastro não recebe quantidade: novos
              produtos começam com físico zero.
            </p>
            {erro && (
              <p className="est-red" role="alert">
                {erro}
              </p>
            )}
            <ActionButton type="submit">Salvar produto demonstrativo</ActionButton>
          </form>
        </ModalEstoque>
      )}
      {modal === "consultar" && produto && (
        <ModalEstoque titulo={produto.nome} fechar={() => setModal(null)}>
          <dl className="est-definition">
            <div>
              <dt>Identificador único</dt>
              <dd>{produto.id}</dd>
            </div>
            <div>
              <dt>Categoria / preparo</dt>
              <dd>
                {produto.categoria} · {produto.preparo}
              </dd>
            </div>
            <div>
              <dt>Sabor / classificação</dt>
              <dd>
                {produto.sabor || "—"} ·{" "}
                {produto.natureza === "salgado_congelado"
                  ? "Salgado congelado"
                  : produto.natureza === "bebida"
                    ? "Bebida"
                    : "Outro"}
              </dd>
            </div>
            <div>
              <dt>Preço avulso / direto</dt>
              <dd>{dinheiro(produto.preco)}</dd>
            </div>
            <div>
              <dt>Modalidade</dt>
              <dd>
                {produto.tipoVenda === "combo_50"
                  ? `Múltiplos de ${numero(quantidadeVendaDemo(produto))}`
                  : "Unidade"}
              </dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{produto.ativo ? "Ativo" : "Inativo"}</dd>
            </div>
          </dl>
          <p>{produto.descricao || "Sem descrição."}</p>
          <ActionButton onClick={() => abrir("editar", produto.id)}>
            <Pencil size={16} />
            Editar produto
          </ActionButton>
        </ModalEstoque>
      )}
    </div>
  );
}
