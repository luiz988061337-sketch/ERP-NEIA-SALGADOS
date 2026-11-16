/**
 * C1 — Clientes e Segmentação (CRM) demonstrativo.
 * Reusa a segmentação oficial (`classificar` em @/lib/crm) sobre dados fictícios.
 */
import { useMemo, useState } from "react";
import { CalendarDays, Eye, Search, Users } from "lucide-react";
import { MetricCard, SectionCard, StatusBadge } from "@/components/admin/erp-ui";
import { useComercial } from "./contexto";
import {
  DiasBadge,
  Iniciais,
  ModalHistorico,
  STATUS_TOM,
} from "./compartilhados";
import {
  CLIENTES_DEMO,
  DATA_COMERCIAL,
  dataUltimoPedido,
  faixaInatividade,
  filtrarClientes,
  formatarData,
  paginar,
  SEGMENTO_PLAIN,
  type ClienteDemo,
} from "./dados";

const POR_PAGINA = 10;

export function ClientesSegmentacao() {
  const { clientes, filtros, setFiltros, pagina, setPagina } = useComercial();
  const [historico, setHistorico] = useState<ClienteDemo | null>(null);

  const filtrados = useMemo(() => filtrarClientes(clientes, filtros), [clientes, filtros]);
  const pag = paginar(filtrados, pagina, POR_PAGINA);
  const inativos = clientes.filter((c) => faixaInatividade(c.diasSemComprar)).length;
  const vip = clientes.filter((c) => c.totalGasto >= 150).length;
  const novos = clientes.filter((c) => c.segmento === "novo").length;
  const origens = [...new Set(CLIENTES_DEMO.map((c) => c.origem))].sort();
  const atendentes = [...new Set(CLIENTES_DEMO.map((c) => c.atendente))].sort();

  return (
    <div data-testid="clientes-segmentacao">
      <div className="com-cabecalho">
        <span className="com-cabecalho-icone">
          <Users size={22} />
        </span>
        <div>
          <h1>Clientes — Segmentação e Reativação</h1>
          <p>
            Base de demonstração com {clientes.length} clientes fictícios, classificados pelas mesmas
            regras de CRM já aprovadas
          </p>
        </div>
      </div>

      <div className="com-kpis com-kpis-quatro">
        <MetricCard icone={Users} label="Clientes na base" valor={clientes.length} detalhe="demonstração" />
        <MetricCard icone={CalendarDays} label="Inativos (30+ dias)" valor={inativos} detalhe="faixas exclusivas" />
        <MetricCard icone={Users} label="Ticket alto (demo)" valor={vip} detalhe="R$ 150 ou mais" />
        <MetricCard icone={Users} label="Novos clientes (demo)" valor={novos} detalhe="primeiro pedido" />
      </div>

      <SectionCard
        className="com-tabela-card"
        titulo={
          <span className="com-titulo-com-icone">
            <Users size={17} /> Lista de clientes e segmentação
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="com-filtros">
          <label>
            Período
            <select
              className="com-select"
              aria-label="Filtrar por período"
              value={filtros.periodo}
              onChange={(e) => setFiltros({ ...filtros, periodo: Number(e.target.value) })}
            >
              <option value={180}>Últimos 180 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={0}>Qualquer período</option>
            </select>
          </label>
          <label>
            Segmento
            <select
              className="com-select"
              aria-label="Filtrar por segmento"
              value={filtros.segmento}
              onChange={(e) =>
                setFiltros({ ...filtros, segmento: e.target.value as typeof filtros.segmento })
              }
            >
              <option value="todos">Todos os segmentos</option>
              <option value="ativo">Ativo</option>
              <option value="risco">Em risco</option>
              <option value="inativo">Inativo</option>
              <option value="muito_inativo">Muito inativo</option>
              <option value="novo">Novo</option>
            </select>
          </label>
          <label>
            Origem
            <select
              className="com-select"
              aria-label="Filtrar por origem"
              value={filtros.origem}
              onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })}
            >
              <option value="todas">Todas as origens</option>
              {origens.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            Atendente
            <select
              className="com-select"
              aria-label="Filtrar por atendente"
              value={filtros.atendente}
              onChange={(e) => setFiltros({ ...filtros, atendente: e.target.value })}
            >
              <option value="todos">Todos</option>
              {atendentes.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="com-busca">
            Buscar cliente
            <span className="com-busca-input">
              <Search size={14} />
              <input
                className="com-input"
                aria-label="Buscar cliente"
                placeholder="Nome, telefone ou e-mail..."
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              />
            </span>
          </label>
        </div>

        <div className="com-tabela-envolucro">
          <table className="com-tabela">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Último pedido</th>
                <th>Dias sem comprar</th>
                <th>Segmento</th>
                <th>Origem</th>
                <th>Atendente</th>
                <th>Produtos favoritos</th>
                <th>Status de reativação</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {pag.itens.map((c) => (
                <tr key={c.id} data-testid={`cliente-${c.id}`}>
                  <td>
                    <span className="com-cliente">
                      <Iniciais nome={c.nome} />
                      <span>
                        <b>{c.nome}</b>
                        <small>{c.telefone}</small>
                      </span>
                    </span>
                  </td>
                  <td>{formatarData(dataUltimoPedido(c.diasSemComprar))}</td>
                  <td>
                    <DiasBadge dias={c.diasSemComprar} />
                  </td>
                  <td>
                    <StatusBadge
                      className="com-badge"
                      tom={
                        c.segmento === "ativo"
                          ? "ok"
                          : c.segmento === "risco"
                            ? "atencao"
                            : c.segmento === "muito_inativo"
                              ? "perigo"
                              : "neutro"
                      }
                    >
                      {SEGMENTO_PLAIN[c.segmento]}
                    </StatusBadge>
                  </td>
                  <td>{c.origem}</td>
                  <td>{c.atendente}</td>
                  <td className="com-favoritos">{c.favoritos.join(", ")}</td>
                  <td>
                    <StatusBadge className="com-badge" tom={STATUS_TOM[c.status]}>
                      {c.status === "Recuperado" ? "✓ " : ""}
                      {c.status}
                    </StatusBadge>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="com-icone"
                      aria-label={`Ver histórico de ${c.nome}`}
                      onClick={() => setHistorico(c)}
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pag.total === 0 ? (
            <p className="com-vazio">Nenhum cliente neste filtro.</p>
          ) : null}
        </div>

        <div className="com-paginacao">
          <span>
            Exibindo {pag.primeiro}-{pag.ultimo} de {pag.total} clientes
          </span>
          <span className="com-paginacao-botoes">
            <button
              type="button"
              className="com-icone"
              aria-label="Página anterior"
              disabled={pag.pagina <= 1}
              onClick={() => setPagina(pag.pagina - 1)}
            >
              ‹
            </button>
            <span>
              {pag.pagina} / {pag.paginas}
            </span>
            <button
              type="button"
              className="com-icone"
              aria-label="Próxima página"
              disabled={pag.pagina >= pag.paginas}
              onClick={() => setPagina(pag.pagina + 1)}
            >
              ›
            </button>
          </span>
        </div>
      </SectionCard>

      <p className="com-nota">
        Referência da demonstração: {formatarData(DATA_COMERCIAL)}. Todos os clientes, valores e
        históricos são <b>fictícios</b>. Nenhum dado real foi consultado ou gravado.
      </p>

      <div className="com-nota">
        <StatusBadge className="com-badge" tom="neutro">CRM operacional · em preparação</StatusBadge>
        Exportação e cadastro de clientes não fazem parte desta demonstração.
      </div>

      {historico ? (
        <ModalHistorico cliente={historico} fechar={() => setHistorico(null)} />
      ) : null}
    </div>
  );
}
