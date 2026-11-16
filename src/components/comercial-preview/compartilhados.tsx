/**
 * C1 — Componentes compartilhados do Painel Comercial.
 * Reusa os componentes visuais já aprovados (erp-ui, ui) e os tokens do tema.
 */
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Megaphone,
  MessageCircle,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
import {
  DarkTable,
  DarkTableRow,
  MetricCard,
  SectionCard,
  StatusBadge,
} from "@/components/admin/erp-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CLIENTES_DEMO,
  FAIXA_CURTA,
  MOTIVOS_ILUSTRATIVOS,
  PERGUNTAS_ILUSTRATIVAS,
  dataUltimoPedido,
  faixaInatividade,
  formatarData,
  paginar,
  SEGMENTO_PLAIN,
  type ClienteDemo,
  type StatusReativacao,
} from "./dados";
import { useComercial } from "./contexto";

export const STATUS_TOM: Record<StatusReativacao, "ok" | "info" | "atencao" | "perigo" | "extra"> =
  {
    Recuperado: "ok",
    "Em contato": "atencao",
    "Aguardando retorno": "info",
    "Campanha enviada": "extra",
    "Não respondeu": "perigo",
  };

export function Iniciais({ nome }: { nome: string }) {
  const partes = nome.replace(/\b[A-Z]\.\s*/g, "").trim().split(/\s+/);
  const inicial = (p: string) => p.charAt(0).toUpperCase();
  const texto = partes.length >= 2 ? `${inicial(partes[0]!)}${inicial(partes[1]!)}` : inicial(nome);
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full border border-[#D4A94A]/60 bg-[#1A1712] text-[11px] font-bold text-[#F2CE6B]"
    >
      {texto}
    </span>
  );
}

export function DiasBadge({ dias }: { dias: number }) {
  const faixa = faixaInatividade(dias);
  const tom = !faixa ? "neutro" : faixa === "90+" ? "perigo" : "atencao";
  return (
    <StatusBadge className="com-badge" tom={tom}>
      {dias} dias
      {faixa ? <span className="opacity-60"> · {FAIXA_CURTA[faixa]}</span> : null}
    </StatusBadge>
  );
}

/** Cartão de motivo com barra proporcional (ilustrativo). */
export function BarraMotivo({
  motivo,
  percentual,
  cor,
}: {
  motivo: string;
  percentual: number;
  cor: "ouro" | "verde" | "vermelho" | "cinza";
}) {
  const cores: Record<string, string> = {
    ouro: "linear-gradient(90deg,#F2CE6B,#C49A43)",
    verde: "linear-gradient(90deg,#35C97C,#1F9E5E)",
    vermelho: "linear-gradient(90deg,#F16A6A,#C43F3F)",
    cinza: "linear-gradient(90deg,#8A8272,#5C574C)",
  };
  return (
    <li className="com-motivo">
      <span className="com-motivo-nome">{motivo}</span>
      <span className="com-motivo-barra">
        <span style={{ width: `${percentual}%`, background: cores[cor] }} />
      </span>
      <span className="com-motivo-valor">{percentual}%</span>
    </li>
  );
}

export function ListaMotivos() {
  return (
    <ul className="com-motivos">
      {MOTIVOS_ILUSTRATIVOS.map((m) => (
        <BarraMotivo key={m.motivo} {...m} />
      ))}
    </ul>
  );
}

/** Bloco ilustrativo de perguntas de satisfação (C4 — sem ação real). */
export function BlocoSatisfacao() {
  return (
    <SectionCard
      titulo={
        <span className="com-titulo-com-icone">
          <MessageCircle size={17} /> Pesquisa de satisfação e recuperação
        </span>
      }
      acoes={<StatusBadge className="com-badge" tom="neutro">Etapa C4 · ilustrativo</StatusBadge>}
    >
      <p className="com-subtitulo">
        Entenda os motivos do afastamento e identifique oportunidades de retorno. Nenhuma resposta é
        gravada nesta demonstração.
      </p>
      <div className="com-perguntas">
        {PERGUNTAS_ILUSTRATIVAS.map((p) => (
          <div key={p} className="com-pergunta">
            {p}
          </div>
        ))}
      </div>
      <p className="com-subtitulo mt-3">Motivo principal</p>
      <div className="com-chips">
        {["Preço", "Entrega", "Qualidade", "Atendimento", "Mudança de hábito", "Outro"].map((m) => (
          <span key={m} className="com-chip">
            {m}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

/** Histórico demonstrativo de um cliente — somente leitura. */
export function ModalHistorico({ cliente, fechar }: { cliente: ClienteDemo; fechar: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent className="com-dialog max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cliente.nome}</DialogTitle>
          <DialogDescription>
            Histórico demonstrativo do cliente. Nenhum dado real é consultado ou gravado.
          </DialogDescription>
        </DialogHeader>
        <dl className="com-grade-detalhe">
          <div>
            <dt>Telefone</dt>
            <dd>{cliente.telefone}</dd>
          </div>
          <div>
            <dt>Segmento</dt>
            <dd>{SEGMENTO_PLAIN[cliente.segmento]}</dd>
          </div>
          <div>
            <dt>Dias sem comprar</dt>
            <dd>{cliente.diasSemComprar}</dd>
          </div>
          <div>
            <dt>Origem</dt>
            <dd>{cliente.origem}</dd>
          </div>
          <div>
            <dt>Atendente</dt>
            <dd>{cliente.atendente}</dd>
          </div>
          <div>
            <dt>Favoritos</dt>
            <dd>{cliente.favoritos.join(", ")}</dd>
          </div>
        </dl>
        <div>
          <p className="com-subtitulo">Histórico</p>
          <ul className="com-timeline">
            {cliente.historico.map((h, i) => (
              <li key={`${h.data}-${i}`}>
                <span className="com-timeline-data">{formatarData(h.data)}</span>
                <span>
                  <b>{h.tipo}</b>
                  <small>{h.texto}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="com-subtitulo">Situação da reativação</p>
          <StatusBadge className="com-badge" tom={STATUS_TOM[cliente.status]}>
            {cliente.status === "Recuperado" ? "✓ " : ""}
            {cliente.status}
          </StatusBadge>
          <p className="com-muted">
            A consulta é somente demonstrativa. Alteração de situação, pesquisa e envio de campanha
            pertencem às etapas posteriores do Comercial.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tabela de clientes inativos com filtros, ordenação e paginação. */
export function TabelaClientesInativos({ clientes }: { clientes: ClienteDemo[] }) {
  const { filtros, setFiltros, pagina, setPagina } = useComercial();
  const [ordenarPorDias, setOrdenarPorDias] = useState(true);
  const [historico, setHistorico] = useState<ClienteDemo | null>(null);
  const porPagina = 8;
  const ordenados = [...clientes].sort((a, b) =>
    ordenarPorDias ? b.diasSemComprar - a.diasSemComprar : a.nome.localeCompare(b.nome),
  );
  const pag = paginar(ordenados, pagina, porPagina);
  const origens = [...new Set(CLIENTES_DEMO.map((c) => c.origem))].sort();
  const atendentes = [...new Set(CLIENTES_DEMO.map((c) => c.atendente))].sort();

  return (
    <>
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
            <Users size={14} />
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
      <DarkTable
        colunas={[
          "Cliente",
          "Último pedido",
          "Dias sem comprar",
          "Produtos favoritos",
          "Status de reativação",
          "Ação",
        ]}
      >
        {pag.itens.map((c) => (
          <DarkTableRow key={c.id}>
            <td>
              <span className="com-cliente">
                <Iniciais nome={c.nome} />
                <span>
                  <b>{c.nome}</b>
                  <small>{c.telefone}</small>
                </span>
              </span>
            </td>
            <td>{formatarData(ultimoPedidoDe(c))}</td>
            <td>
              <button
                type="button"
                className="com-ordenar"
                onClick={() => setOrdenarPorDias((v) => !v)}
                aria-label="Ordenar por dias sem comprar"
              >
                <DiasBadge dias={c.diasSemComprar} />
              </button>
            </td>
            <td className="com-favoritos">{c.favoritos.join(", ")}</td>
            <td>
              <StatusBadge className="com-badge" tom={STATUS_TOM[c.status]}>
                {c.status === "Recuperado" ? "✓ " : ""}
                {c.status}
              </StatusBadge>
            </td>
            <td>
              <span className="com-acoes-linha">
                <button
                  type="button"
                  className="com-icone"
                  aria-label={`Ver histórico de ${c.nome}`}
                  onClick={() => setHistorico(c)}
                >
                  <Eye size={15} />
                </button>
              </span>
            </td>
          </DarkTableRow>
        ))}
      </DarkTable>
      <div className="com-paginacao">
        <span>
          Exibindo {pag.primeiro}-{pag.ultimo} de {pag.total} clientes inativos
        </span>
        <span className="com-paginacao-botoes">
          <button
            type="button"
            className="com-icone"
            aria-label="Página anterior"
            disabled={pag.pagina <= 1}
            onClick={() => setPagina(pag.pagina - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          {pag.pagina}
          <button
            type="button"
            className="com-icone"
            aria-label="Próxima página"
            disabled={pag.pagina >= pag.paginas}
            onClick={() => setPagina(pag.pagina + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </span>
      </div>
      {historico ? (
        <ModalHistorico cliente={historico} fechar={() => setHistorico(null)} />
      ) : null}
    </>
  );
}

function ultimoPedidoDe(c: ClienteDemo): string {
  return dataUltimoPedido(c.diasSemComprar);
}

export const ICONES = {
  calendario: CalendarDays,
  megafone: Megaphone,
  ampulheta: Timer,
  recuperados: UserCheck,
};
