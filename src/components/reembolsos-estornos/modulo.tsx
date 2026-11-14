// ============================================================================
// Reembolsos e Estornos — R1 (interface demonstrativa).
// Reutiliza os componentes compartilhados do admin (erp-ui) e o padrão
// visual aprovado. Estado 100% local, sem gravação no Supabase.
// ============================================================================

import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Bike,
  CheckCircle2,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  Landmark,
  Plus,
  Search,
  ShieldCheck,
  Undo2,
  UserRound,
  Users,
} from "lucide-react";
import {
  ActionButton,
  DarkTable,
  DarkTableRow,
  ERP_COLORS,
  MetricCard,
  ModuleHeader,
  SectionCard,
  StatusBadge,
  type BadgeTom,
} from "@/components/admin/erp-ui";
import {
  DATA_REFERENCIA,
  LABEL_FISCAL,
  LABEL_FINANCEIRO,
  LABEL_STATUS,
  OPERACOES_INICIAIS,
  RESPONSAVEL_AUTORIZADO,
  STATUS_FLUXO,
  TIPOS_OPERACAO,
  aplicarAcao,
  brl,
  criarOperacao,
  dadosTipo,
  devolvidoDoPedido,
  ehTerminal,
  filtrarOperacoes,
  formatarDataHora,
  origensExistentes,
  responsaveisExistentes,
  transicoesDisponiveis,
  type Acao,
  type Comprovante,
  type DadosNovaOperacao,
  type Filtros,
  type Operacao,
  type StatusFluxo,
  type TipoOperacao,
} from "./dados";

/** Tons de badge por situação (verde concluído/aprovado, âmbar atenção, vermelho recusa, cinza neutro). */
function tomFluxo(status: StatusFluxo): BadgeTom {
  if (status === "concluido" || status === "aprovado" || status === "pago_devolvido") return "ok";
  if (status === "recusado") return "perigo";
  if (status === "rascunho" || status === "cancelado") return "neutro";
  if (status === "solicitado" || status === "em_analise") return "info";
  return "atencao";
}

function tomFinanceiro(s: Operacao["financeiro"]): BadgeTom {
  if (s === "pago" || s === "devolvido") return "ok";
  if (s === "pendente") return "atencao";
  return "neutro";
}

function tomFiscal(s: Operacao["fiscal"]): BadgeTom {
  if (s === "conferido") return "ok";
  if (s === "requer_atencao") return "perigo";
  if (s === "nao_aplicavel") return "neutro";
  return "atencao";
}

const ICONE_PESSOA: Record<Operacao["tipo"], typeof Users> = {
  estorno_cliente: UserRound,
  reembolso_motoboy: Bike,
  reembolso_funcionario: Users,
  credito_fornecedor: Factory,
};

/** Comprovantes demonstrativos disponíveis para inclusão (nenhum arquivo real). */
const COMPROVANTES_DEMO: { nome: string; tipo: Comprovante["tipo"] }[] = [
  { nome: "Comprovante Pix (demonstrativo)", tipo: "pix" },
  { nome: "Recibo assinado (demonstrativo)", tipo: "recibo" },
  { nome: "Nota fiscal relacionada (demonstrativo)", tipo: "nota" },
  { nome: "Foto da entrega (demonstrativo)", tipo: "foto" },
];

export function ModuloReembolsos({
  opsIniciais = OPERACOES_INICIAIS,
}: {
  opsIniciais?: Operacao[];
}) {
  const [ops, setOps] = useState<Operacao[]>(() =>
    opsIniciais.map((o) => ({ ...o, comprovantes: [...o.comprovantes], historico: [...o.historico] })),
  );
  const [foco, setFoco] = useState<string>("RE-0001");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({
    periodo: "2025-04",
    tipo: "todos",
    status: "todos",
    responsavel: "todos",
    origem: "todos",
    busca: "",
  });
  const [novo, setNovo] = useState<DadosNovaOperacao>({
    tipo: "estorno_cliente",
    pessoa: "",
    referenciaTipo: "Pedido",
    referencia: "",
    valor: 0,
    valorOriginal: 0,
    motivo: "",
    formaPagamentoOriginal: "Pix",
    turno: "",
    resolucao: "dinheiro",
    origem: "Atendimento",
    solicitante: "Atendimento",
  });
  const [comprovanteEscolhido, setComprovanteEscolhido] = useState<string>("0");
  const [novaPagRef, setNovaPagRef] = useState("PIX-DEMO");

  const lista = useMemo(() => filtrarOperacoes(ops, filtros), [ops, filtros]);
  const operacao = ops.find((o) => o.id === foco) ?? null;
  const responsaveis = useMemo(() => responsaveisExistentes(ops), [ops]);
  const origens = useMemo(() => origensExistentes(ops), [ops]);

  const aplicar = (id: string, acao: Acao) => {
    const alvo = ops.find((o) => o.id === id);
    if (!alvo) return;
    const resultado = aplicarAcao(alvo, acao);
    if (!resultado.ok) {
      setErro(resultado.erro);
      setAviso(null);
      return;
    }
    setOps((prev) => prev.map((o) => (o.id === id ? resultado.operacao : o)));
    setErro(null);
    setAviso(resultado.mensagem ?? null);
  };

  const criar = () => {
    const resultado = criarOperacao(ops, novo);
    if (!resultado.ok) {
      setErro(resultado.erro);
      setAviso(null);
      return;
    }
    setOps((prev) => [...prev, resultado.operacao]);
    setFoco(resultado.operacao.id);
    setErro(null);
    setAviso(`Solicitação ${resultado.operacao.id} criada localmente e enviada para aprovação.`);
    setNovo((atual) => ({ ...atual, pessoa: "", referencia: "", valor: 0, valorOriginal: 0, motivo: "" }));
  };

  const indicadores = useMemo(() => {
    const noPeriodo = (iso?: string) => Boolean(iso) && (iso as string).startsWith("2025-04");
    const exigeDocumento = (o: Operacao) =>
      o.fiscal === "aguardando_documento" ||
      o.fiscal === "em_conferencia" ||
      o.fiscal === "requer_atencao";
    return [
      {
        id: "abertas",
        icone: ClipboardList,
        label: "Solicitações abertas",
        valor: String(ops.filter((o) => !ehTerminal(o.status)).length),
        detalhe: "Rascunho até comprovação",
        cor: ERP_COLORS.gold,
      },
      {
        id: "aprovacao",
        icone: ShieldCheck,
        label: "Aguardando aprovação",
        valor: String(
          ops.filter(
            (o) =>
              o.status === "aguardando_aprovacao" ||
              (o.status === "aprovado" && o.requerNovaAprovacao),
          ).length,
        ),
        detalhe: `Responsável: ${RESPONSAVEL_AUTORIZADO}`,
        cor: ERP_COLORS.orange,
      },
      {
        id: "pagamento",
        icone: BadgeDollarSign,
        label: "Aguardando pagamento/devolução",
        valor: String(ops.filter((o) => o.status === "aguardando_pagamento").length),
        detalhe: "Aprovadas, sem saída/entrada",
        cor: ERP_COLORS.blue,
      },
      {
        id: "comprovacao",
        icone: FileText,
        label: "Pendências de comprovação",
        valor: String(
          ops.filter(
            (o) =>
              o.status === "aguardando_comprovacao" ||
              (exigeDocumento(o) && (o.financeiro === "pago" || o.financeiro === "devolvido")),
          ).length,
        ),
        detalhe: "Documental/fiscal em aberto",
        cor: ERP_COLORS.purple,
      },
      {
        id: "concluidas",
        icone: CheckCircle2,
        label: "Concluídos no período",
        valor: String(ops.filter((o) => o.status === "concluido" && noPeriodo(o.concluidoEm ?? o.atualizadoEm)).length),
        detalhe: "Abril/2025 (demonstrativo)",
        cor: ERP_COLORS.green,
      },
      {
        id: "total",
        icone: Landmark,
        label: "Valor total reembolsado no período",
        valor: brl(
          ops
            .filter(
              (o) =>
                (o.financeiro === "pago" || o.financeiro === "devolvido") &&
                noPeriodo(o.pagoEm ?? o.atualizadoEm),
            )
            .reduce((s, o) => s + o.valorSolicitado, 0),
        ),
        detalhe: "Pago/devolvido em Abril/2025",
        cor: ERP_COLORS.goldStrong,
      },
    ];
  }, [ops]);

  const acoesFluxo = operacao ? transicoesDisponiveis(operacao.status) : [];

  return (
    <div className="space-y-4">
      <ModuleHeader
        icone={Undo2}
        titulo="Reembolsos e Estornos"
        subtitulo={`Módulo demonstrativo R1 — dados locais fictícios • referência ${formatarDataHora(DATA_REFERENCIA)} • nada é gravado no ERP`}
        status={
          <span className="inline-block rounded-full border border-[#F5B301]/60 bg-[#F5B301]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F5B301]">
            Prévia • Integração futura
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {indicadores.map((i) => (
          <MetricCard
            key={i.id}
            icone={i.icone}
            label={i.label}
            valor={i.valor}
            detalhe={i.detalhe}
            cor={i.cor}
          />
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Lista com filtros                                                */}
      {/* ---------------------------------------------------------------- */}
      <SectionCard
        titulo={`Solicitações (${lista.length})`}
        acoes={
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Filtros demonstrativos
          </span>
        }
      >
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <select
            aria-label="Filtrar período"
            value={filtros.periodo}
            onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value })}
            className="min-h-[32px] rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
          >
            <option value="2025-03">Período: Março/2025</option>
            <option value="2025-04">Período: Abril/2025</option>
            <option value="todos">Período: Todos</option>
          </select>
          <select
            aria-label="Filtrar tipo"
            value={filtros.tipo}
            onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
            className="min-h-[32px] rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
          >
            <option value="todos">Tipo: Todos</option>
            {TIPOS_OPERACAO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar status"
            value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            className="min-h-[32px] rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
          >
            <option value="todos">Status: Todos</option>
            {STATUS_FLUXO.map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUS[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar responsável"
            value={filtros.responsavel}
            onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}
            className="min-h-[32px] rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
          >
            <option value="todos">Responsável: Todos</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar origem"
            value={filtros.origem}
            onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })}
            className="min-h-[32px] rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
          >
            <option value="todos">Origem: Todas</option>
            {origens.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Buscar por pedido, cliente ou referência"
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              placeholder="Pedido, cliente, referência..."
              className="min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] pl-7 pr-2 text-xs"
            />
          </label>
        </div>

        <DarkTable
          colunas={["ID", "Tipo", "Pessoa", "Referência", "Valor", "Fluxo", "Financeiro", "Fiscal", ""]}
          vazio={lista.length === 0 ? "Nenhuma solicitação encontrada nos filtros atuais." : undefined}
        >
          {lista.map((o) => {
            const Icone = ICONE_PESSOA[o.tipo];
            return (
              <DarkTableRow key={o.id}>
                <td className="px-2.5 py-2 font-display font-bold text-[#F2CE6B]">{o.id}</td>
                <td className="px-2.5 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Icone className="size-3.5 text-[#C9A24B]" aria-hidden />
                    {dadosTipo(o.tipo).label}
                  </span>
                </td>
                <td className="max-w-[140px] truncate px-2.5 py-2">{o.pessoa}</td>
                <td className="px-2.5 py-2">
                  {o.referenciaTipo} {o.referencia}
                </td>
                <td className="px-2.5 py-2 text-right font-display font-bold">
                  {brl(o.valorSolicitado)}
                </td>
                <td className="px-2.5 py-2">
                  <StatusBadge tom={tomFluxo(o.status)}>{LABEL_STATUS[o.status]}</StatusBadge>
                </td>
                <td className="px-2.5 py-2">
                  <StatusBadge tom={tomFinanceiro(o.financeiro)}>{LABEL_FINANCEIRO[o.financeiro]}</StatusBadge>
                </td>
                <td className="px-2.5 py-2">
                  <StatusBadge tom={tomFiscal(o.fiscal)}>{LABEL_FISCAL[o.fiscal]}</StatusBadge>
                </td>
                <td className="px-2.5 py-2 text-right">
                  <ActionButton variant="ghost" onClick={() => setFoco(o.id)}>
                    Detalhe
                  </ActionButton>
                </td>
              </DarkTableRow>
            );
          })}
        </DarkTable>
      </SectionCard>

      {/* ---------------------------------------------------------------- */}
      {/* Tela de detalhe / dossiê                                          */}
      {/* ---------------------------------------------------------------- */}
      {operacao ? (
        <div data-testid="re-detalhe" className="space-y-4" aria-label={`Detalhe ${operacao.id}`}>
          <p aria-live="polite" className="sr-only">
            {erro ?? aviso ?? ""}
          </p>
          <SectionCard
            titulo={`Detalhe — ${operacao.id} • ${dadosTipo(operacao.tipo).label}`}
            acoes={
              <>
                <StatusBadge tom={tomFluxo(operacao.status)}>{LABEL_STATUS[operacao.status]}</StatusBadge>
                <ActionButton variant="ghost" onClick={() => setFoco("")}>
                  Fechar
                </ActionButton>
              </>
            }
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pessoa/empresa</dt>
                  <dd className="text-right font-semibold">{operacao.pessoa}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Relacionado a</dt>
                  <dd className="text-right font-semibold">
                    {operacao.referenciaTipo} {operacao.referencia}
                  </dd>
                </div>
                {operacao.turno ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Turno</dt>
                    <dd className="text-right font-semibold">{operacao.turno}</dd>
                  </div>
                ) : null}
                {operacao.tipoGasto ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Tipo de gasto</dt>
                    <dd className="text-right font-semibold">{operacao.tipoGasto}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Origem</dt>
                  <dd className="text-right font-semibold">{operacao.origem}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Solicitante</dt>
                  <dd className="text-right font-semibold">{operacao.solicitante}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd className="max-w-[220px] text-right">{operacao.motivo}</dd>
                </div>
              </dl>

              <dl className="space-y-1.5 text-xs">
                {operacao.valorOriginal ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Valor original</dt>
                    <dd>{brl(operacao.valorOriginal)}</dd>
                  </div>
                ) : null}
                {operacao.tipo === "estorno_cliente" ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Devolvido até agora</dt>
                    <dd>{brl(devolvidoDoPedido(ops, operacao.referencia))}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Valor solicitado</dt>
                  <dd className="font-display text-sm font-bold text-[#F2CE6B]">
                    {brl(operacao.valorSolicitado)}
                    {operacao.alcance ? ` (${operacao.alcance === "total" ? "total" : "parcial"})` : ""}
                  </dd>
                </div>
                {operacao.valorAprovado ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Valor aprovado</dt>
                    <dd>{brl(operacao.valorAprovado)}</dd>
                  </div>
                ) : null}
                {operacao.requerNovaAprovacao ? (
                  <div className="rounded-lg border border-[#F5B301]/50 bg-[#F5B301]/10 px-2 py-1.5 text-[#F5B301]">
                    Alteração após aprovação: nova aprovação exigida.
                  </div>
                ) : null}
                {operacao.aprovador ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Aprovado por</dt>
                    <dd className="text-right">
                      {operacao.aprovador}
                      <br />
                      <span className="text-muted-foreground">{formatarDataHora(operacao.aprovadoEm ?? "")}</span>
                    </dd>
                  </div>
                ) : null}
                {operacao.resolucao ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Resolução</dt>
                    <dd className="text-right font-semibold">
                      {operacao.resolucao === "dinheiro"
                        ? "Dinheiro retorna para a empresa"
                        : "Crédito com fornecedor (sem dinheiro agora)"}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Classificação futura</dt>
                  <dd className="max-w-[220px] text-right text-[11px] text-muted-foreground">
                    {dadosTipo(operacao.tipo).classificacao}
                  </dd>
                </div>
              </dl>

              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-[#D4A94A]/35 bg-[#100F0D] p-2.5">
                  <p className="mb-1 font-bold uppercase tracking-wide text-[10px] text-muted-foreground">
                    Fluxo
                  </p>
                  <StatusBadge tom={tomFluxo(operacao.status)}>{LABEL_STATUS[operacao.status]}</StatusBadge>
                </div>
                <div className="rounded-lg border border-[#D4A94A]/35 bg-[#100F0D] p-2.5">
                  <p className="mb-1 font-bold uppercase tracking-wide text-[10px] text-muted-foreground">
                    Status financeiro
                  </p>
                  <StatusBadge tom={tomFinanceiro(operacao.financeiro)}>
                    {LABEL_FINANCEIRO[operacao.financeiro]}
                  </StatusBadge>
                  {operacao.pagamentoReferencia ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Ref.: {operacao.pagamentoReferencia} • {formatarDataHora(operacao.pagoEm ?? "")}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-[#D4A94A]/35 bg-[#100F0D] p-2.5">
                  <p className="mb-1 font-bold uppercase tracking-wide text-[10px] text-muted-foreground">
                    Status documental/fiscal
                  </p>
                  <StatusBadge tom={tomFiscal(operacao.fiscal)}>{LABEL_FISCAL[operacao.fiscal]}</StatusBadge>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Independente do financeiro — nunca declara regularidade fiscal automaticamente.
                  </p>
                </div>
              </div>
            </div>

            {(erro || aviso) && (
              <div
                data-testid="re-mensagem"
                role="status"
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  erro
                    ? "border-[#F16A6A]/60 bg-[#F16A6A]/10 text-[#F16A6A]"
                    : "border-[#35C97C]/50 bg-[#35C97C]/10 text-[#35C97C]"
                }`}
              >
                {erro ?? aviso}
              </div>
            )}

            {/* Ações permitidas */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#D4A94A]/30 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Ações permitidas:
              </span>
              {acoesFluxo.includes("solicitado") && (
                <ActionButton onClick={() => aplicar(operacao.id, { tipo: "solicitar", usuario: operacao.solicitante })}>
                  Solicitar
                </ActionButton>
              )}
              {acoesFluxo.includes("em_analise") && (
                <ActionButton onClick={() => aplicar(operacao.id, { tipo: "enviar_analise", usuario: "Supervisão" })}>
                  Enviar para análise
                </ActionButton>
              )}
              {acoesFluxo.includes("aguardando_aprovacao") && (
                <ActionButton
                  onClick={() => aplicar(operacao.id, { tipo: "enviar_aprovacao", usuario: "Supervisão" })}
                >
                  Enviar para aprovação
                </ActionButton>
              )}
              {acoesFluxo.includes("aprovado") && (
                <>
                  <ActionButton
                    onClick={() =>
                      aplicar(operacao.id, {
                        tipo: "aprovar",
                        usuario: RESPONSAVEL_AUTORIZADO,
                        autorizado: true,
                      })
                    }
                  >
                    Aprovar ({RESPONSAVEL_AUTORIZADO})
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    onClick={() =>
                      aplicar(operacao.id, {
                        tipo: "recusar",
                        usuario: RESPONSAVEL_AUTORIZADO,
                        autorizado: true,
                        motivo: "Recusa registrada pelo responsável autorizado (demonstração).",
                      })
                    }
                  >
                    Recusar
                  </ActionButton>
                </>
              )}
              {acoesFluxo.includes("aguardando_pagamento") && (
                <ActionButton
                  onClick={() => aplicar(operacao.id, { tipo: "enviar_pagamento", usuario: RESPONSAVEL_AUTORIZADO })}
                >
                  Enviar para pagamento/devolução
                </ActionButton>
              )}
              {operacao.status === "aguardando_pagamento" && (
                <>
                  <label className="sr-only" htmlFor="re-pag-ref">
                    Referência do pagamento
                  </label>
                  <input
                    id="re-pag-ref"
                    value={novaPagRef}
                    onChange={(e) => setNovaPagRef(e.target.value)}
                    className="min-h-[34px] w-40 rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
                    aria-label="Referência do pagamento"
                  />
                  <ActionButton
                    onClick={() =>
                      aplicar(operacao.id, {
                        tipo: "registrar_pagamento",
                        usuario: RESPONSAVEL_AUTORIZADO,
                        referencia: novaPagRef,
                      })
                    }
                  >
                    {operacao.tipo === "estorno_cliente" || operacao.tipo === "credito_fornecedor"
                      ? "Registrar devolução"
                      : "Registrar pagamento"}
                  </ActionButton>
                </>
              )}
              {acoesFluxo.includes("aguardando_comprovacao") && (
                <ActionButton
                  onClick={() => aplicar(operacao.id, { tipo: "solicitar_comprovacao", usuario: "Contador (demo)" })}
                >
                  Solicitar comprovação
                </ActionButton>
              )}
              {acoesFluxo.includes("concluido") && (
                <ActionButton onClick={() => aplicar(operacao.id, { tipo: "concluir", usuario: "Contador (demo)" })}>
                  Concluir
                </ActionButton>
              )}
              {acoesFluxo.includes("cancelado") && (
                <ActionButton
                  variant="ghost"
                  onClick={() =>
                    aplicar(operacao.id, {
                      tipo: "cancelar",
                      usuario: RESPONSAVEL_AUTORIZADO,
                      motivo: "Cancelamento demonstrativo pelo responsável.",
                    })
                  }
                >
                  Cancelar
                </ActionButton>
              )}
              {!ehTerminal(operacao.status) && (
                <label className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                  Alterar valor:
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    aria-label="Novo valor solicitado"
                    defaultValue=""
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const valor = Number((e.target as HTMLInputElement).value);
                      if (valor > 0) {
                        aplicar(operacao.id, { tipo: "alterar_valor", usuario: operacao.solicitante, valor });
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                    className="min-h-[30px] w-24 rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
                  />
                  <span className="text-[10px]">(Enter confirma)</span>
                </label>
              )}
            </div>
          </SectionCard>

          {/* Dossiê de comprovação */}
          <div data-testid="re-dossie">
          <SectionCard titulo="Dossiê de Comprovação">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2 text-xs">
                <p className="text-muted-foreground">
                  Dados da solicitação: {operacao.id} • {dadosTipo(operacao.tipo).label} •{" "}
                  {formatarDataHora(operacao.criadoEm)} • solicitado por {operacao.solicitante}.
                </p>
                <p className="text-muted-foreground">
                  Vínculo: {operacao.referenciaTipo} {operacao.referencia}
                  {operacao.formaPagamentoOriginal ? ` • pagamento original: ${operacao.formaPagamentoOriginal}` : ""}
                  {operacao.situacaoPedido ? ` • situação do pedido: ${operacao.situacaoPedido}` : ""}.
                </p>
                <p className="text-muted-foreground">Motivo: {operacao.motivo}</p>
                <div className="rounded-lg border border-[#D4A94A]/35 bg-[#100F0D] p-2.5">
                  <p className="font-bold uppercase tracking-wide text-[10px] text-muted-foreground">
                    Conferência financeira
                  </p>
                  <p className="mt-1">
                    {LABEL_FINANCEIRO[operacao.financeiro]} • valor {brl(operacao.valorSolicitado)}
                    {operacao.pagamentoReferencia ? ` • ref. ${operacao.pagamentoReferencia}` : " • sem referência ainda"}
                  </p>
                </div>
                <div className="rounded-lg border border-[#D4A94A]/35 bg-[#100F0D] p-2.5">
                  <p className="font-bold uppercase tracking-wide text-[10px] text-muted-foreground">
                    Conferência documental/fiscal
                  </p>
                  <p className="mt-1">
                    {LABEL_FISCAL[operacao.fiscal]} •{" "}
                    {operacao.comprovantes.filter((c) => c.conferido).length}/{operacao.comprovantes.length}{" "}
                    comprovantes conferidos
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Documentos fictícios/placeholders. Nada coletado de pessoas reais e nenhuma declaração de
                    regularidade fiscal é gerada automaticamente.
                  </p>
                </div>
                {operacao.observacoes ? (
                  <p className="text-muted-foreground">Observações: {operacao.observacoes}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Comprovantes ({operacao.comprovantes.length})
                </p>
                {operacao.comprovantes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum comprovante incluído.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {operacao.comprovantes.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-2 rounded-lg border border-[#D4A94A]/30 bg-[#100F0D] px-2.5 py-1.5 text-xs"
                      >
                        <FileText className="size-3.5 shrink-0 text-[#C9A24B]" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                        <StatusBadge tom={c.conferido ? "ok" : "atencao"}>
                          {c.conferido ? "Conferido" : "Pendente"}
                        </StatusBadge>
                        <ActionButton
                          variant="ghost"
                          onClick={() =>
                            aplicar(operacao.id, {
                              tipo: "conferir_comprovante",
                              usuario: "Contador (demo)",
                              id: c.id,
                              conferido: !c.conferido,
                            })
                          }
                        >
                          {c.conferido ? "Reabrir" : "Conferir"}
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                )}
                {!ehTerminal(operacao.status) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Comprovante demonstrativo para incluir"
                      value={comprovanteEscolhido}
                      onChange={(e) => setComprovanteEscolhido(e.target.value)}
                      className="min-h-[32px] flex-1 rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
                    >
                      {COMPROVANTES_DEMO.map((c, i) => (
                        <option key={c.nome} value={String(i)}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                    <ActionButton
                      onClick={() => {
                        const demo = COMPROVANTES_DEMO[Number(comprovanteEscolhido)];
                        const c = demo ?? COMPROVANTES_DEMO[0];
                        if (!c) return;
                        aplicar(operacao.id, {
                          tipo: "incluir_comprovante",
                          usuario: operacao.solicitante,
                          comprovante: c,
                        });
                      }}
                    >
                      <Plus /> Incluir
                    </ActionButton>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
          </div>

          {/* Auditoria */}
          <SectionCard titulo={`Histórico de auditoria — ${operacao.id}`}>
            <ol className="space-y-2">
              {operacao.historico.map((e) => (
                <li key={e.id} className="flex gap-2.5 text-xs">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-[#D4A94A]/50 bg-[#1A1712]">
                    <Clock className="size-3 text-[#C9A24B]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">{e.acao}</span>{" "}
                      <span className="text-muted-foreground">
                        • {formatarDataHora(e.dataHora)} • {e.usuario}
                      </span>
                    </p>
                    {e.detalhe ? <p className="text-muted-foreground">{e.detalhe}</p> : null}
                    {e.valorAnterior !== undefined || e.valorNovo !== undefined ? (
                      <p className="text-muted-foreground">
                        Valor anterior: {brl(e.valorAnterior ?? 0)} → novo: {brl(e.valorNovo ?? 0)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Histórico demonstrativo imutável na interface: registros são apenas acrescentados, nunca editados.
            </p>
          </SectionCard>
        </div>
      ) : (
        <SectionCard titulo="Detalhe">
          <p className="text-xs text-muted-foreground">Selecione uma solicitação na lista para abrir o dossiê.</p>
        </SectionCard>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Nova solicitação (demonstrativa)                                  */}
      {/* ---------------------------------------------------------------- */}
      <div data-testid="re-nova">
      <SectionCard titulo="Nova solicitação (demonstrativa)">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] text-muted-foreground">
            Tipo
            <select
              aria-label="Tipo da nova solicitação"
              value={novo.tipo}
              onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoOperacao })}
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
            >
              {TIPOS_OPERACAO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">
            {novo.tipo === "estorno_cliente"
              ? "Cliente"
              : novo.tipo === "reembolso_motoboy"
                ? "Motoboy"
                : novo.tipo === "reembolso_funcionario"
                  ? "Funcionário"
                  : "Fornecedor"}
            <input
              aria-label="Pessoa/empresa relacionada"
              value={novo.pessoa}
              onChange={(e) => setNovo({ ...novo, pessoa: e.target.value })}
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
              placeholder="Nome demonstrativo..."
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            Referência
            <input
              aria-label="Referência da solicitação"
              value={novo.referencia}
              onChange={(e) => setNovo({ ...novo, referencia: e.target.value })}
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
              placeholder={novo.tipo === "estorno_cliente" ? "#4602" : "Rota, turno, compra..."}
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            {novo.tipo === "estorno_cliente" ? "Valor original do pedido" : "Valor"}
            <input
              type="number"
              min="0.01"
              step="0.01"
              aria-label={novo.tipo === "estorno_cliente" ? "Valor original do pedido" : "Valor da solicitação"}
              value={novo.tipo === "estorno_cliente" ? novo.valorOriginal || "" : novo.valor || ""}
              onChange={(e) =>
                setNovo(
                  novo.tipo === "estorno_cliente"
                    ? { ...novo, valorOriginal: Number(e.target.value) || 0 }
                    : { ...novo, valor: Number(e.target.value) || 0 },
                )
              }
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            {novo.tipo === "estorno_cliente" ? "Valor solicitado para devolução" : "Valor do reembolso"}
            <input
              type="number"
              min="0.01"
              step="0.01"
              aria-label="Valor solicitado"
              value={novo.valor || ""}
              onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) || 0 })}
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
            />
          </label>
          <label className="text-[11px] text-muted-foreground lg:col-span-2">
            Motivo
            <input
              aria-label="Motivo da solicitação"
              value={novo.motivo}
              onChange={(e) => setNovo({ ...novo, motivo: e.target.value })}
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
              placeholder="Motivo demonstrativo..."
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            Origem
            <select
              aria-label="Origem da solicitação"
              value={novo.origem}
              onChange={(e) => setNovo({ ...novo, origem: e.target.value })}
              className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
            >
              {["Atendimento", "PDV", "Central de Entregas", "Operacional", "Compras"].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          {novo.tipo === "credito_fornecedor" ? (
            <label className="text-[11px] text-muted-foreground">
              Resolução
              <select
                aria-label="Resolução do crédito"
                value={novo.resolucao}
                onChange={(e) =>
                  setNovo({ ...novo, resolucao: e.target.value as "dinheiro" | "credito_futuro" })
                }
                className="mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs"
              >
                <option value="dinheiro">Devolução em dinheiro (retorna à empresa)</option>
                <option value="credito_futuro">Crédito para compras futuras</option>
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton onClick={criar}>
            <Plus /> Criar solicitação local
          </ActionButton>
          <span className="text-[10px] text-muted-foreground">
            Regras contra duplicidade aplicadas antes da criação (valor, estorno total e parciais).
          </span>
        </div>
      </SectionCard>
      </div>
    </div>
  );
}
