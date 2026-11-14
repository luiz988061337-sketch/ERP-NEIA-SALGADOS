// ============================================================================
// Reembolsos e Estornos — R2-A: origens das solicitações (interface).
// Cinco pontos de partida demonstrativos (Cliente, Atendente, Motoboy,
// Funcionários, Compras/Fornecedores) que reutilizam as regras da R1
// (validarNovaOperacao/criarOperacao/aplicarAcao) e mostram a solicitação
// resultante na Central R1, na mesma sessão demonstrativa. Estado 100% local:
// sem integração entre dispositivos, sem persistência, nada é gravado.
// ============================================================================

import { useState } from "react";
import {
  Bike,
  Factory,
  Headset,
  MonitorSmartphone,
  Share2,
  UserRound,
  Users,
} from "lucide-react";
import {
  ActionButton,
  ModuleHeader,
  SectionCard,
  StatusBadge,
  type BadgeTom,
} from "@/components/admin/erp-ui";
import {
  LABEL_STATUS,
  OPERACOES_INICIAIS,
  RESPONSAVEL_AUTORIZADO,
  aplicarAcao,
  criarOperacao,
  type DadosNovaOperacao,
  type Operacao,
  type StatusFluxo,
} from "./dados";
import { ModuloReembolsos } from "./modulo";
import {
  CLIENTE_DEMO,
  FORNECEDORES_DEMO,
  FUNCIONARIOS_DEMO,
  GASTOS_FUNCIONARIO_DEMO,
  GASTOS_MOTOBOY,
  LABEL_PROBLEMA,
  MOTOBYS_DEMO,
  PEDIDOS_AUTORIZADOS_CLIENTE,
  TURNOS_DEMO,
  dadosAtendente,
  dadosCliente,
  dadosFornecedor,
  dadosFuncionario,
  dadosMotoboy,
  pedidoAutorizadoCliente,
  type GastoMotoboy,
  type ProblemaCliente,
} from "./origens-dados";

const CLS_INPUT =
  "mt-1 min-h-[32px] w-full rounded-lg border border-[#D4A94A]/40 bg-[#100F0D] px-2 text-xs";
const CLS_LABEL = "block text-[11px] text-muted-foreground";

function tomStatus(status: StatusFluxo): BadgeTom {
  if (status === "concluido" || status === "aprovado" || status === "pago_devolvido") return "ok";
  if (status === "recusado") return "perigo";
  if (status === "rascunho" || status === "cancelado") return "neutro";
  if (status === "solicitado" || status === "em_analise") return "info";
  return "atencao";
}

type AbaOrigem = "cliente" | "atendente" | "motoboy" | "funcionario" | "compras";

const ABAS: { id: AbaOrigem; label: string; icone: typeof Users }[] = [
  { id: "cliente", label: "Cliente — Meus Pedidos", icone: UserRound },
  { id: "atendente", label: "Central da Atendente", icone: Headset },
  { id: "motoboy", label: "App Motoboy", icone: Bike },
  { id: "funcionario", label: "Funcionários", icone: Users },
  { id: "compras", label: "Compras / Fornecedores", icone: Factory },
];

function clonar(ops: Operacao[]): Operacao[] {
  return ops.map((o) => ({ ...o, comprovantes: [...o.comprovantes], historico: [...o.historico] }));
}

export function ModuloOrigensReembolsos({
  opsIniciais = OPERACOES_INICIAIS,
}: {
  opsIniciais?: Operacao[] | undefined;
}) {
  const [ops, setOps] = useState<Operacao[]>(() => clonar(opsIniciais));
  const [foco, setFoco] = useState<string>("RE-0001");
  const [aba, setAba] = useState<AbaOrigem>("cliente");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // --- Formulário: Cliente — Meus Pedidos ----------------------------------
  const [clientePedido, setClientePedido] = useState<string>(
    PEDIDOS_AUTORIZADOS_CLIENTE[0]?.referencia ?? "",
  );
  const [clienteProblema, setClienteProblema] = useState<ProblemaCliente>("produto");
  const [clienteValor, setClienteValor] = useState(0);
  const [clienteMotivo, setClienteMotivo] = useState("");

  // --- Formulário: Central da Atendente ------------------------------------
  const [atPedido, setAtPedido] = useState<string>(
    PEDIDOS_AUTORIZADOS_CLIENTE[0]?.referencia ?? "",
  );
  const [atMotivo, setAtMotivo] = useState("");
  const [atValor, setAtValor] = useState(0);

  // --- Formulário: App Motoboy ---------------------------------------------
  const [mbQuem, setMbQuem] = useState<string>(MOTOBYS_DEMO[0] ?? "");
  const [mbVinculoTipo, setMbVinculoTipo] = useState<"Turno" | "Rota/Entrega">("Turno");
  const [mbVinculo, setMbVinculo] = useState<string>(TURNOS_DEMO[0] ?? "");
  const [mbGasto, setMbGasto] = useState<GastoMotoboy>(GASTOS_MOTOBOY[0] ?? "Troco pago com dinheiro próprio");
  const [mbValor, setMbValor] = useState(0);
  const [mbMotivo, setMbMotivo] = useState("");

  // --- Formulário: Funcionários --------------------------------------------
  const [fnQuem, setFnQuem] = useState<string>(FUNCIONARIOS_DEMO[0] ?? "");
  const [fnRefTipo, setFnRefTipo] = useState<"Compra" | "Despesa">("Compra");
  const [fnReferencia, setFnReferencia] = useState("");
  const [fnGasto, setFnGasto] = useState<string>(GASTOS_FUNCIONARIO_DEMO[0] ?? "Insumos");
  const [fnValor, setFnValor] = useState(0);
  const [fnJustificativa, setFnJustificativa] = useState("");

  // --- Formulário: Compras / Fornecedores ----------------------------------
  const [cpFornecedor, setCpFornecedor] = useState<string>(FORNECEDORES_DEMO[0] ?? "");
  const [cpCompra, setCpCompra] = useState("");
  const [cpResolucao, setCpResolucao] = useState<"dinheiro" | "credito_futuro">("dinheiro");
  const [cpValor, setCpValor] = useState(0);
  const [cpMotivo, setCpMotivo] = useState("");

  /** Cria pela regra da R1 e, opcionalmente, encaminha ao responsável autorizado. */
  function enviar(dados: DadosNovaOperacao, encaminharPor?: string) {
    const resultado = criarOperacao(ops, dados);
    if (!resultado.ok) {
      setErro(resultado.erro);
      setAviso(null);
      return;
    }
    let operacao = resultado.operacao;
    if (encaminharPor) {
      const encaminhamento = aplicarAcao(operacao, {
        tipo: "enviar_aprovacao",
        usuario: encaminharPor,
      });
      if (!encaminhamento.ok) {
        setErro(encaminhamento.erro);
        setAviso(null);
        return;
      }
      operacao = encaminhamento.operacao;
    }
    setOps((prev) => [...prev, operacao]);
    setFoco(operacao.id);
    setErro(null);
    setAviso(
      `Solicitação ${operacao.id} criada a partir de ${dados.origem}` +
        (encaminharPor ? ` e encaminhada ao responsável (${RESPONSAVEL_AUTORIZADO})` : "") +
        " — visível na Central abaixo (dados locais, nada é gravado).",
    );
  }

  function enviarCliente() {
    const pedido = pedidoAutorizadoCliente(clientePedido);
    if (!pedido) {
      setErro("Selecione um pedido autorizado para solicitar — a prévia só permite pedidos autorizados.");
      setAviso(null);
      return;
    }
    enviar(dadosCliente({ pedido, problema: clienteProblema, valor: clienteValor, motivo: clienteMotivo }));
  }

  function enviarAtendente() {
    const pedido = pedidoAutorizadoCliente(atPedido);
    if (!pedido) {
      setErro("Selecione um pedido autorizado — a prévia só permite pedidos autorizados.");
      setAviso(null);
      return;
    }
    enviar(dadosAtendente({ pedido, motivoCliente: atMotivo, valor: atValor }), "Central da Atendente");
  }

  const clientePedidoAtual = pedidoAutorizadoCliente(clientePedido);
  const atPedidoAtual = pedidoAutorizadoCliente(atPedido);
  const minhasSolicitacoes = ops.filter(
    (o) => o.tipo === "estorno_cliente" && (o.pessoa === CLIENTE_DEMO || o.pessoa === "Ana Souza"),
  );

  return (
    <div data-testid="re2-origens" className="space-y-4">
      <ModuleHeader
        icone={Share2}
        titulo="Origens das solicitações"
        subtitulo="Módulo demonstrativo R2-A — cada setor inicia solicitações com as mesmas regras da Central R1 • nada é gravado no ERP"
        status={
          <span className="inline-block rounded-full border border-[#F5B301]/60 bg-[#F5B301]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F5B301]">
            Prévia R2-A • Integração futura
          </span>
        }
      />

      <p className="rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
        Sessão demonstrativa neste navegador: <strong>não existe integração entre dispositivos nem
        persistência real</strong>. Identidade do cliente fictícia (nenhum dado real é acessado);
        funcionário e motoboy <strong>não podem aprovar</strong> — aprovação exclusiva do responsável
        autorizado ({RESPONSAVEL_AUTORIZADO}) na Central R1. Nenhum Pix, estorno ou pagamento real é
        executado e nada altera estoque, caixa ou pedidos.
      </p>

      <SectionCard
        titulo="Iniciar solicitação a partir de um setor"
        acoes={
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Regras de valor e duplicidade: R1
          </span>
        }
      >
        {/* Seletor de origem */}
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Origem da solicitação">
          {ABAS.map((t) => {
            const Icone = t.icone;
            const ativa = aba === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={ativa}
                data-testid={`re2-aba-${t.id}`}
                onClick={() => setAba(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  ativa
                    ? "border-[#D4A94A] bg-[#D4A94A]/15 text-[#F2CE6B]"
                    : "border-[#D4A94A]/35 bg-[#100F0D] text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icone className="size-3.5" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>

        {(erro || aviso) && (
          <div
            data-testid="re2-mensagem"
            role="status"
            className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
              erro
                ? "border-[#F16A6A]/60 bg-[#F16A6A]/10 text-[#F16A6A]"
                : "border-[#35C97C]/50 bg-[#35C97C]/10 text-[#35C97C]"
            }`}
          >
            {erro ?? aviso}
          </div>
        )}

        {/* Cliente — Meus Pedidos */}
        {aba === "cliente" && (
          <div data-testid="re2-origem-cliente" className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Você está solicitando como <strong className="text-foreground">{CLIENTE_DEMO}</strong> —
              identidade fictícia usada apenas nesta prévia.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className={CLS_LABEL}>
                Pedido
                <select
                  aria-label="Pedido do cliente"
                  value={clientePedido}
                  onChange={(e) => setClientePedido(e.target.value)}
                  className={CLS_INPUT}
                >
                  {PEDIDOS_AUTORIZADOS_CLIENTE.map((p) => (
                    <option key={p.referencia} value={p.referencia}>
                      Pedido {p.referencia} — {p.situacao}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px]">
                  Valor original:{" "}
                  <strong className="text-foreground">
                    R$ {(clientePedidoAtual?.valorOriginal ?? 0).toFixed(2).replace(".", ",")}
                  </strong>{" "}
                  • pagamento: {clientePedidoAtual?.formaPagamento ?? "—"}
                </span>
              </label>
              <label className={CLS_LABEL}>
                Problema
                <select
                  aria-label="Tipo de problema"
                  value={clienteProblema}
                  onChange={(e) => setClienteProblema(e.target.value as ProblemaCliente)}
                  className={CLS_INPUT}
                >
                  {(Object.keys(LABEL_PROBLEMA) as ProblemaCliente[]).map((k) => (
                    <option key={k} value={k}>
                      {LABEL_PROBLEMA[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CLS_LABEL}>
                Valor solicitado (R$)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label="Valor solicitado pelo cliente"
                  value={clienteValor || ""}
                  onChange={(e) => setClienteValor(Number(e.target.value) || 0)}
                  className={CLS_INPUT}
                  placeholder="0,00"
                />
              </label>
              <label className={CLS_LABEL}>
                Motivo
                <input
                  aria-label="Motivo do cliente"
                  value={clienteMotivo}
                  onChange={(e) => setClienteMotivo(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: item chegou faltando..."
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={enviarCliente}>Enviar solicitação do cliente</ActionButton>
              <span className="text-[10px] text-muted-foreground">
                Somente pedidos autorizados; limite de estorno validado pelas regras da R1.
              </span>
            </div>

            {/* Consulta do andamento */}
            <div data-testid="re2-andamento" className="rounded-lg border border-[#D4A94A]/35 bg-[#100F0D] p-2.5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Andamento das minhas solicitações ({minhasSolicitacoes.length})
              </p>
              {minhasSolicitacoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma solicitação sua ainda — envie a primeira pelo formulário acima.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {minhasSolicitacoes.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-[#D4A94A]/30 bg-[#1A1712] px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-display font-bold text-[#F2CE6B]">{o.id}</span>
                      <span className="text-muted-foreground">Pedido {o.referencia}</span>
                      <span className="ml-auto font-display font-bold">
                        R$ {o.valorSolicitado.toFixed(2).replace(".", ",")}
                      </span>
                      <StatusBadge tom={tomStatus(o.status)}>{LABEL_STATUS[o.status]}</StatusBadge>
                      <ActionButton variant="ghost" onClick={() => setFoco(o.id)}>
                        Ver na Central
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Central da Atendente */}
        {aba === "atendente" && (
          <div data-testid="re2-origem-atendente" className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              A atendente registra o motivo informado pelo cliente e{" "}
              <strong className="text-foreground">encaminha ao responsável autorizado</strong> — não
              aprova.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className={CLS_LABEL}>
                Pedido relacionado
                <select
                  aria-label="Pedido relacionado (atendente)"
                  value={atPedido}
                  onChange={(e) => setAtPedido(e.target.value)}
                  className={CLS_INPUT}
                >
                  {PEDIDOS_AUTORIZADOS_CLIENTE.map((p) => (
                    <option key={p.referencia} value={p.referencia}>
                      Pedido {p.referencia} — {p.situacao}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px]">
                  Valor original:{" "}
                  <strong className="text-foreground">
                    R$ {(atPedidoAtual?.valorOriginal ?? 0).toFixed(2).replace(".", ",")}
                  </strong>{" "}
                  • cliente fictício: {CLIENTE_DEMO}
                </span>
              </label>
              <label className={CLS_LABEL}>
                Valor do estorno (parcial ou total, R$)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label="Valor do estorno informado pela atendente"
                  value={atValor || ""}
                  onChange={(e) => setAtValor(Number(e.target.value) || 0)}
                  className={CLS_INPUT}
                  placeholder="0,00"
                />
              </label>
              <label className={`${CLS_LABEL} lg:col-span-2`}>
                Motivo informado pelo cliente
                <input
                  aria-label="Motivo informado pelo cliente"
                  value={atMotivo}
                  onChange={(e) => setAtMotivo(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: cobrança em duplicidade no cartão..."
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={enviarAtendente}>Registrar e encaminhar</ActionButton>
              <span className="text-[10px] text-muted-foreground">
                Cria a solicitação como “Solicitado” e envia direto para aprovação de{" "}
                {RESPONSAVEL_AUTORIZADO}.
              </span>
            </div>
          </div>
        )}

        {/* App Motoboy */}
        {aba === "motoboy" && (
          <div data-testid="re2-origem-motoboy" className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              O motoboy informa a despesa do turno/entrega e <strong className="text-foreground">não
              pode aprovar</strong> o próprio reembolso.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className={CLS_LABEL}>
                Motoboy (fictício)
                <select
                  aria-label="Motoboy solicitante"
                  value={mbQuem}
                  onChange={(e) => setMbQuem(e.target.value)}
                  className={CLS_INPUT}
                >
                  {MOTOBYS_DEMO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CLS_LABEL}>
                Vínculo
                <select
                  aria-label="Tipo de vínculo do motoboy"
                  value={mbVinculoTipo}
                  onChange={(e) => {
                    const tipo = e.target.value as "Turno" | "Rota/Entrega";
                    setMbVinculoTipo(tipo);
                    setMbVinculo(tipo === "Turno" ? (TURNOS_DEMO[0] ?? "") : "");
                  }}
                  className={CLS_INPUT}
                >
                  <option value="Turno">Turno</option>
                  <option value="Rota/Entrega">Rota/Entrega</option>
                </select>
              </label>
              <label className={CLS_LABEL}>
                {mbVinculoTipo === "Turno" ? "Turno relacionado" : "Rota/entrega relacionada"}
                {mbVinculoTipo === "Turno" ? (
                  <select
                    aria-label="Turno do motoboy"
                    value={mbVinculo}
                    onChange={(e) => setMbVinculo(e.target.value)}
                    className={CLS_INPUT}
                  >
                    {TURNOS_DEMO.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Referência da rota/entrega do motoboy"
                    value={mbVinculo}
                    onChange={(e) => setMbVinculo(e.target.value)}
                    className={CLS_INPUT}
                    placeholder="Rota Centro #312"
                  />
                )}
              </label>
              <label className={CLS_LABEL}>
                Tipo de gasto
                <select
                  aria-label="Tipo de gasto do motoboy"
                  value={mbGasto}
                  onChange={(e) => setMbGasto(e.target.value as GastoMotoboy)}
                  className={CLS_INPUT}
                >
                  {GASTOS_MOTOBOY.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CLS_LABEL}>
                Valor gasto (R$)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label="Valor gasto pelo motoboy"
                  value={mbValor || ""}
                  onChange={(e) => setMbValor(Number(e.target.value) || 0)}
                  className={CLS_INPUT}
                  placeholder="0,00"
                />
              </label>
              <label className={`${CLS_LABEL} lg:col-span-3`}>
                Motivo
                <input
                  aria-label="Motivo do motoboy"
                  value={mbMotivo}
                  onChange={(e) => setMbMotivo(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: troco pago com dinheiro próprio na entrega #312..."
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={() => enviar(dadosMotoboy({ motoboy: mbQuem, vinculoTipo: mbVinculoTipo, vinculo: mbVinculo, gasto: mbGasto, valor: mbValor, motivo: mbMotivo }))}>
                Enviar solicitação do motoboy
              </ActionButton>
              <span className="text-[10px] text-muted-foreground">
                Sem botão de aprovação: quem aprova é apenas {RESPONSAVEL_AUTORIZADO}, na Central.
              </span>
            </div>
          </div>
        )}

        {/* Funcionários */}
        {aba === "funcionario" && (
          <div data-testid="re2-origem-funcionario" className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              O funcionário informa compra/despesa paga com valor próprio e{" "}
              <strong className="text-foreground">não pode aprovar</strong> o próprio reembolso.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className={CLS_LABEL}>
                Funcionário (fictício)
                <select
                  aria-label="Funcionário solicitante"
                  value={fnQuem}
                  onChange={(e) => setFnQuem(e.target.value)}
                  className={CLS_INPUT}
                >
                  {FUNCIONARIOS_DEMO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CLS_LABEL}>
                Tipo de referência
                <select
                  aria-label="Tipo de referência do funcionário"
                  value={fnRefTipo}
                  onChange={(e) => setFnRefTipo(e.target.value as "Compra" | "Despesa")}
                  className={CLS_INPUT}
                >
                  <option value="Compra">Compra</option>
                  <option value="Despesa">Despesa</option>
                </select>
              </label>
              <label className={CLS_LABEL}>
                Referência
                <input
                  aria-label="Referência da compra/despesa do funcionário"
                  value={fnReferencia}
                  onChange={(e) => setFnReferencia(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: Compra emergencial #1052"
                />
              </label>
              <label className={CLS_LABEL}>
                Tipo de gasto
                <select
                  aria-label="Tipo de gasto do funcionário"
                  value={fnGasto}
                  onChange={(e) => setFnGasto(e.target.value)}
                  className={CLS_INPUT}
                >
                  {GASTOS_FUNCIONARIO_DEMO.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CLS_LABEL}>
                Valor adiantado (R$)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label="Valor adiantado pelo funcionário"
                  value={fnValor || ""}
                  onChange={(e) => setFnValor(Number(e.target.value) || 0)}
                  className={CLS_INPUT}
                  placeholder="0,00"
                />
              </label>
              <label className={`${CLS_LABEL} lg:col-span-3`}>
                Justificativa
                <input
                  aria-label="Justificativa do funcionário"
                  value={fnJustificativa}
                  onChange={(e) => setFnJustificativa(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: fermento comprado fora do horário do fornecedor..."
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                onClick={() =>
                  enviar(
                    dadosFuncionario({
                      funcionario: fnQuem,
                      referenciaTipo: fnRefTipo,
                      referencia: fnReferencia,
                      tipoGasto: fnGasto,
                      valor: fnValor,
                      justificativa: fnJustificativa,
                    }),
                  )
                }
              >
                Enviar solicitação do funcionário
              </ActionButton>
              <span className="text-[10px] text-muted-foreground">
                Sem botão de aprovação: quem aprova é apenas {RESPONSAVEL_AUTORIZADO}, na Central.
              </span>
            </div>
          </div>
        )}

        {/* Compras / Fornecedores */}
        {aba === "compras" && (
          <div data-testid="re2-origem-compras" className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Devolução ou crédito de fornecedor vinculado a uma compra — sem movimento real de caixa.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className={CLS_LABEL}>
                Fornecedor (fictício)
                <select
                  aria-label="Fornecedor da devolução"
                  value={cpFornecedor}
                  onChange={(e) => setCpFornecedor(e.target.value)}
                  className={CLS_INPUT}
                >
                  {FORNECEDORES_DEMO.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className={CLS_LABEL}>
                Compra relacionada
                <input
                  aria-label="Compra relacionada ao fornecedor"
                  value={cpCompra}
                  onChange={(e) => setCpCompra(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: Compra #1050"
                />
              </label>
              <label className={CLS_LABEL}>
                Resolução
                <select
                  aria-label="Resolução com o fornecedor"
                  value={cpResolucao}
                  onChange={(e) => setCpResolucao(e.target.value as "dinheiro" | "credito_futuro")}
                  className={CLS_INPUT}
                >
                  <option value="dinheiro">Devolução em dinheiro (retorna à empresa)</option>
                  <option value="credito_futuro">Crédito para compras futuras</option>
                </select>
              </label>
              <label className={CLS_LABEL}>
                Valor (R$)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label="Valor da devolução/crédito do fornecedor"
                  value={cpValor || ""}
                  onChange={(e) => setCpValor(Number(e.target.value) || 0)}
                  className={CLS_INPUT}
                  placeholder="0,00"
                />
              </label>
              <label className={`${CLS_LABEL} lg:col-span-4`}>
                Motivo
                <input
                  aria-label="Motivo da devolução/crédito"
                  value={cpMotivo}
                  onChange={(e) => setCpMotivo(e.target.value)}
                  className={CLS_INPUT}
                  placeholder="Ex.: embalagens entregues em formato errado..."
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                onClick={() =>
                  enviar(
                    dadosFornecedor({
                      fornecedor: cpFornecedor,
                      compra: cpCompra,
                      resolucao: cpResolucao,
                      valor: cpValor,
                      motivo: cpMotivo,
                    }),
                  )
                }
              >
                Enviar solicitação de devolução
              </ActionButton>
              <span className="text-[10px] text-muted-foreground">
                Crédito futuro não é entrada de dinheiro — classificação segue a R1.
              </span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Central R1 na mesma sessão demonstrativa (estado compartilhado). */}
      <div data-testid="re2-central">
        <p className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <MonitorSmartphone className="size-3.5 text-[#C9A24B]" aria-hidden />
          Central R1 nesta mesma sessão — as solicitações criadas acima aparecem na lista abaixo.
        </p>
        <ModuloReembolsos estadoExterno={{ ops, setOps, foco, setFoco }} />
      </div>
    </div>
  );
}
