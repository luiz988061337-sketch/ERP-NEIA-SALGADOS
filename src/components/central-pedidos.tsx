import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock,
  Eye,
  Package,
  Search,
  Store,
  Truck,
  UserRound,
  Wallet,
  TriangleAlert,
} from "lucide-react";

import { AtalhosEntrega } from "@/components/entregas/atalhos-entrega";
import { EditarObservacoesPedido } from "@/components/editar-observacoes-pedido";
import { podeOperarEntregas } from "@/lib/central-atribuicao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { ControlesAlertas, useAlertasOperacionais } from "@/components/alertas-operacionais";
import { brl, PAGAMENTO_LABEL, PAGAMENTO_STATUS_LABEL } from "@/lib/format";
import {
  CONFIG_ALERTA_PADRAO,
  ESTADOS_CENTRAL,
  atrasoCentral,
  colunasCentral,
  avisoDoPedido,
  estaEmPreparo,
  filtrarPedidos,
  formatarMinutos,
  metricasCentral,
  minutosDesde,
  ordenarPorPrioridade,
  pedidosNaoReconhecidos,
  prazoRegistrado,
  TIPO_AVISO_RETIRADA,
  type AvisoCozinha,
  type ColunasCentral,
  type ConfigAlerta,
  type PedidoCentral,
} from "@/lib/central-pedidos";
import { CANAIS } from "@/lib/sincronizacao-paineis";
import {
  executarAceiteAtendente,
  elegivelAceiteLocal,
  podeAceitarPerfil,
  type ResultadoAceite,
} from "@/lib/atendente-aceite";
import { elegivelRetirada, retirarPedidoCliente } from "@/lib/motoboy-finalizacao";
import { centavosInformados, confirmarValorRecebido, type RecebimentoRetirada } from "@/lib/recebimento-retirada";
import { entradaJanelaProducao } from "@/lib/motor-producao";
import { rotuloQuantidadePedido, unidadesSalgadosH02 } from "@/lib/pedidos-h02";
import { MINIMO_COMBO } from "@/lib/totals";
import { lerDashboard } from "@/lib/dashboard-a01-dados";
import "./central-pedidos.css";

/**
 * Central de Pedidos da Atendente.
 *
 * A fila consulta pedidos e notificações. Aceite e retirada usam as ações
 * existentes, enquanto a produção e o despacho são atualizados nos seus painéis.
 */

const COLUNAS = [
  {
    key: "analise",
    titulo: "Em análise",
    descricao: "Pedidos aguardando aceitação",
    icone: ClipboardList,
  },
  {
    key: "producao",
    titulo: "Em produção",
    descricao: "Aguardando preparo ou em preparo",
    icone: ChefHat,
  },
  {
    key: "pronto",
    titulo: "Prontos",
    descricao: "Aguardando retirada ou despacho",
    icone: Package,
  },
] as const;

function mensagemFalhaAceite(r: ResultadoAceite): string {
  switch (r.codigo) {
    case "negado":
      return "Acesso negado: apenas atendentes e administradores podem aceitar pedidos.";
    case "inelegivel":
      return "Este pedido não está mais disponível para aceite.";
    case "conflito":
      return "Este pedido já foi aceito. A fila será atualizada.";
    case "inexistente":
      return "Pedido não encontrado.";
    case "flag-desativada":
      return "A integração de aceite não está ativada neste ambiente.";
    default:
      return r.detalhe || "Não foi possível confirmar o aceite. Tente novamente.";
  }
}

export function CentralPedidos({
  preview = false,
  pedidosInjetados,
  avisosInjetados,
  onAceitar,
  onAvisoReconhecido,
  configInicial,
  usuarioId = null,
  papeis = [],
}: {
  preview?: boolean;
  pedidosInjetados?: PedidoCentral[];
  avisosInjetados?: AvisoCozinha[];
  /** Executor injetado (prévias). Deve retornar o resultado real da operação. */
  onAceitar?: (pedido: PedidoCentral) => ResultadoAceite | Promise<ResultadoAceite>;
  onAvisoReconhecido?: (id: string) => void;
  /** Demo: força a config aprovada (som ligado, 75%, 30s) na montagem. */
  configInicial?: ConfigAlerta;
  usuarioId?: string | null | undefined;
  papeis?: readonly string[] | undefined;
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"todos" | "analise" | "producao" | "pronto">("todos");
  const [modalidade, setModalidade] = useState<"todas" | "entrega" | "retirada">("todas");
  const [soAgendados, setSoAgendados] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [aceitandoId, setAceitandoId] = useState<string | null>(null);
  const aceitandoRef = useRef<string | null>(null);
  const [retiradaId, setRetiradaId] = useState<string | null>(null);
  const [retirando, setRetirando] = useState(false);
  const retirandoRef = useRef(false);
  const autorizado = podeAceitarPerfil({ id: usuarioId, papeis });
  const [agora, setAgora] = useState(Date.now);

  /* ---------------------------------------------------------------- */
  /* Dados reais                                                      */
  /* ---------------------------------------------------------------- */
  const {
    data: pedidosHook,
    isError: pedidosErro,
    isPending: pedidosPendentes,
    refetch: refazerPedidos,
  } = useQuery({
    queryKey: ["central-pedidos", usuarioId],
    enabled: !preview && autorizado,
    refetchInterval: CANAIS.atendente.pollingMs,
    queryFn: async ({ signal }) => {
      const pedidos = await lerDashboard<PedidoCentral>((inicio, fim) =>
        supabase
          .from("pedidos")
          .select(
            "id,numero,cliente_nome,telefone,status,tipo_entrega,total,created_at,agendado_para,prazo_prometido_em,observacoes,aceito_em_atendente,aceito_em,aceito_por,liberado_em,conferido_em,pronto_em,preparo_em,retirado_em,motoboy_id,rota_id,atrasado,atraso_descricao,pagamento_status,forma_pagamento,endereco,bairro,producao_status,producao_remessas(indice,concluida_em),itens_catalogados:pedido_itens(id,nome,quantidade,produto_id,produtos(id,nome,tipo_venda,unidade_medida,categorias(slug)),pedido_item_componentes(produto_id,quantidade,produtos(nome)))",
          )
          .in("status", [...ESTADOS_CENTRAL])
          .is("retirado_em", null)
          .order("id")
          .range(inicio, fim)
          .abortSignal(signal),
      );
      return pedidos.map((pedido) => ({ ...pedido, pedido_itens: pedido.itens_catalogados ?? [] }));
    },
  });

  const alertas = useAlertasOperacionais();
  const avisosErro = alertas?.avisosErro ?? false;
  const refazerAvisos = alertas?.refazerAvisos;
  const pedidos = useMemo(
    () => (preview ? (pedidosInjetados ?? []) : (pedidosHook ?? [])),
    [preview, pedidosInjetados, pedidosHook],
  );
  const avisos = preview ? (avisosInjetados ?? []) : (alertas?.avisos ?? []);
  const [reconhecidosPreview, setReconhecidosPreview] = useState(() => new Set<string>());
  const reconhecidos = preview ? reconhecidosPreview : (alertas?.reconhecidos ?? new Set<string>());
  const avisosReconhecidos = reconhecidos;
  function reconhecer(chave: string) {
    if (preview) setReconhecidosPreview(ids => new Set([...ids, chave]));
    else alertas?.reconhecer(chave);
  }
  function reconhecerAviso(aviso: AvisoCozinha, pedidoId: string) {
    reconhecer(aviso.tipo + ":" + pedidoId);
    onAvisoReconhecido?.(aviso.id);
  }

  const atualizarFilas = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["central-pedidos"] }),
      queryClient.invalidateQueries({ queryKey: ["alertas-operacionais-pedidos"] }),
      queryClient.invalidateQueries({ queryKey: ["central-pedidos-avisos"] }),
      queryClient.invalidateQueries({ queryKey: ["h02-pedidos-recentes"] }),
      queryClient.invalidateQueries({ queryKey: ["h02-pedidos-periodo"] }),
      queryClient.invalidateQueries({ queryKey: ["fila-producao"] }),
      queryClient.invalidateQueries({ queryKey: ["producao-reservas"] }),
    ]);

  /** Aceite: só confirma na interface depois do resultado da operação. */
  async function tratarAceite(pedido: PedidoCentral): Promise<void> {
    if (aceitandoRef.current || (!preview && !autorizado)) return;
    aceitandoRef.current = pedido.id;
    setAceitandoId(pedido.id);
    try {
      const resultado = onAceitar
        ? await onAceitar(pedido)
        : await executarAceiteAtendente({
            cliente: supabase,
            pedido: {
              id: pedido.id,
              status: pedido.status,
              aceito_em_atendente: pedido.aceito_em_atendente ?? pedido.aceito_em ?? null,
              pagamento_status: pedido.pagamento_status ?? "",
            },
            autor: { id: usuarioId, papeis },
          });

      if (!resultado.ok) {
        if (resultado.codigo === "conflito") await atualizarFilas();
        toast.error(mensagemFalhaAceite(resultado));
        return;
      }

      toast.success(`Pedido #${pedido.numero} aceito.`);
      await atualizarFilas();
    } catch (err) {
      console.error("[central-pedidos] aceite:", err);
      toast.error("Não foi possível confirmar o aceite. Nenhum status foi alterado.");
    } finally {
      aceitandoRef.current = null;
      setAceitandoId(null);
    }
  }

  const retirada = pedidos.find((p) => p.id === retiradaId);
  const [recebimentoId, setRecebimentoId] = useState<string | null>(null);
  const recebimento = pedidos.find((p) => p.id === recebimentoId);
  const [recebendo, setRecebendo] = useState(false);
  const recebendoRef = useRef(false);
  const detalhe = pedidos.find((p) => p.id === detalheId);
  const [valorParcial, setValorParcial] = useState("");
  const [valorEntregue, setValorEntregue] = useState("");
  const tentativaRecebimento = useRef<{ pedido: string; valor: number; chave: string } | null>(null);
  // A mesma consulta atende o recebimento durante a produção e a quitação antes
  // da retirada. Um pedido por vez mantém a idempotência e o troco consistentes.
  const alvoRecebimentoId = retiradaId ?? recebimentoId;
  const pagamentoRetirada = useQuery({
    queryKey: ["retirada-recebimento", usuarioId, alvoRecebimentoId],
    enabled: Boolean(!preview && autorizado && alvoRecebimentoId),
    staleTime: 0,
    refetchInterval: 15_000,
    queryFn: async (): Promise<RecebimentoRetirada> => {
      const { data, error } = await supabase.rpc("consultar_recebimento_retirada", { p_pedido_id: alvoRecebimentoId });
      if (error || !data) throw error ?? new Error("Saldo indisponível");
      return data as RecebimentoRetirada;
    },
  });
  const financeiro = pagamentoRetirada.data;
  const pendente = financeiro?.status === "pendente" ? financeiro : null;
  const dinheiro = pendente?.forma === "dinheiro";
  const recebeNoBalcao = Boolean(
    pendente?.pode_receber && ["dinheiro", "credito", "debito", "pix"].includes(pendente.forma),
  );
  const valoresRecebidos = pendente && confirmarValorRecebido(
    valorParcial ? centavosInformados(valorParcial) : pendente.saldo_centavos,
    centavosInformados(valorEntregue), pendente.saldo_centavos, dinheiro,
  );
  function limparValoresRecebimento() {
    setValorParcial("");
    setValorEntregue("");
  }
  function abrirRetirada(pedidoId: string) {
    limparValoresRecebimento();
    setRecebimentoId(null);
    setRetiradaId(pedidoId);
  }
  function abrirRecebimento(pedidoId: string) {
    limparValoresRecebimento();
    setRetiradaId(null);
    setRecebimentoId(pedidoId);
  }
  const podeConfirmarRetirada = (p: PedidoCentral) =>
    !preview &&
    autorizado &&
    elegivelRetirada(
      {
        status: p.status,
        tipo_entrega: p.tipo_entrega,
        conferido_em: p.conferido_em ?? null,
        retirado_em: p.retirado_em ?? null,
      },
      true,
    ).elegivel;

  /** Registra no ledger; só retorna true quando o saldo foi integralmente quitado. */
  async function registrarRecebimento(pedidoId: string): Promise<boolean> {
    if (!pendente || !recebeNoBalcao || !valoresRecebidos) return false;
    const tentativa = tentativaRecebimento.current;
    if (tentativa?.pedido === pedidoId && tentativa.valor !== valoresRecebidos.valor) {
      toast.error("Há um recebimento sem confirmação. Repita o mesmo valor antes de registrar outro.");
      return false;
    }
    const chave = tentativa?.pedido === pedidoId && tentativa.valor === valoresRecebidos.valor
      ? tentativa.chave : "balcao:" + pedidoId + ":" + crypto.randomUUID();
    tentativaRecebimento.current = { pedido: pedidoId, valor: valoresRecebidos.valor, chave };
    const { data, error } = await supabase.rpc("registrar_pagamento_pedido", {
      p_pedido_id: pedidoId,
      p_valor_centavos: valoresRecebidos.valor,
      p_chave_idempotencia: chave,
    });
    if (error) {
      toast.error("Não foi possível confirmar o registro. Confira o saldo antes de tentar novamente.");
      return false;
    }
    const consulta = await pagamentoRetirada.refetch();
    if (!["registrado", "repetido", "sem_saldo"].includes(data?.status)) {
      tentativaRecebimento.current = null;
      toast.error(data?.status === "nao_autorizado"
        ? "O recebimento exige um operador autorizado com a capacidade de receber pagamentos."
        : "O recebimento não foi confirmado. Confira o saldo.");
      return false;
    }
    tentativaRecebimento.current = null;
    if (consulta.data?.status !== "quitado" || consulta.isError) {
      limparValoresRecebimento();
      toast.info(consulta.data?.status === "pendente"
        ? "Recebimento registrado. Ainda há saldo a receber."
        : "Confira a situação do pagamento antes de continuar.");
      return false;
    }
    return true;
  }

  async function confirmarRetirada() {
    if (!retirada || !podeConfirmarRetirada(retirada) || retirandoRef.current) return;
    retirandoRef.current = true;
    setRetirando(true);
    try {
      if (pagamentoRetirada.isFetching || pagamentoRetirada.isError) return;
      if (financeiro?.status !== "quitado" && !(await registrarRecebimento(retirada.id))) return;
      const resultado = await retirarPedidoCliente(supabase, retirada.id, true);
      if (!resultado.ok) {
        toast.error(
          resultado.codigo === "flag-desativada"
            ? "A confirmação de retirada está desativada neste ambiente."
            : "A retirada não foi confirmada. Atualize a fila e tente novamente.",
        );
        if (resultado.codigo === "conflito") await atualizarFilas();
        return;
      }
      toast.success(`Retirada do pedido #${retirada.numero} confirmada.`);
      setRetiradaId(null);
      await atualizarFilas();
    } catch {
      toast.error("Não foi possível confirmar a retirada. Consulte o pagamento antes de repetir.");
    } finally {
      retirandoRef.current = false;
      setRetirando(false);
    }
  }

  /** Recebimento direto na Central, sem exigir que o pedido esteja pronto. */
  async function confirmarRecebimento() {
    if (!recebimento || !filaDisponivel || recebendoRef.current) return;
    if (pagamentoRetirada.isFetching || pagamentoRetirada.isError) return;
    if (financeiro?.status === "quitado") {
      toast.info("O pagamento deste pedido já está confirmado.");
      setRecebimentoId(null);
      return;
    }
    recebendoRef.current = true;
    setRecebendo(true);
    try {
      await registrarRecebimento(recebimento.id);
    } catch {
      toast.error("Não foi possível registrar o recebimento. Confira o saldo antes de repetir.");
    } finally {
      recebendoRef.current = false;
      setRecebendo(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Alerta sonoro (aprovado: ativo, 75%, 30s, reconhecimento individual) */
  /* ---------------------------------------------------------------- */
  const [configPreview, setConfigPreview] = useState(configInicial ?? CONFIG_ALERTA_PADRAO);
  const config = preview ? configPreview : (alertas?.config ?? CONFIG_ALERTA_PADRAO);
  const salvarConfig = preview ? setConfigPreview : alertas?.salvarConfig ?? (() => {});
  const audioBloqueado = alertas?.audioBloqueado ?? false;
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const naoReconhecidos = pedidosNaoReconhecidos(colunasCentral(pedidos).analise, reconhecidos);

  /* ---------------------------------------------------------------- */
  /* Colunas, filtros e métricas                                       */
  /* ---------------------------------------------------------------- */
  const filtrados = useMemo(
    () => filtrarPedidos(pedidos, { busca, status, modalidade, agendados: soAgendados }),
    [pedidos, busca, status, modalidade, soAgendados],
  );
  const colunas = useMemo(() => colunasCentral(filtrados), [filtrados]);
  const metricas = useMemo(() => metricasCentral(pedidos, agora), [pedidos, agora]);
  const idsPendentes = useMemo(() => new Set(naoReconhecidos.map((p) => p.id)), [naoReconhecidos]);
  const filaDisponivel = preview || (!pedidosErro && !pedidosPendentes);
  const valor = (n: number) => (filaDisponivel ? n : "—");
  const numeroAtrasados =
    !filaDisponivel || (metricas.atrasados === 0 && metricas.prazosSemDados > 0)
      ? "—"
      : metricas.atrasados;
  const podeOperar = (preview || autorizado) && filaDisponivel;

  if (!preview && !autorizado) {
    return (
      <p className="p-4" role="status">
        Acesso restrito a atendentes e administradores.
      </p>
    );
  }

  return (
    <div className="central-atendente" data-testid="central-atendente">
      <header className="ca-cabecalho">
        <h1>Central da Atendente</h1>
        <p>Recebimento, produção e liberação dos pedidos.</p>
      </header>

      <section className="ca-indicadores" aria-label="Indicadores da fila">
        <MetricaCard
          icone={ClipboardList}
          label="Em análise"
          valor={valor(metricas.novos)}
          tipo="analise"
        />
        <MetricaCard
          icone={ChefHat}
          label="Em produção"
          valor={valor(metricas.emProducao)}
          tipo="producao"
        />
        <MetricaCard
          icone={Package}
          label="Prontos"
          valor={valor(metricas.prontos)}
          tipo="pronto"
        />
        <MetricaCard
          icone={TriangleAlert}
          label="Atrasados"
          valor={numeroAtrasados}
          tipo="atraso"
        />
      </section>
      {filaDisponivel && metricas.prazosSemDados > 0 && (
        <p className="ca-nota">
          {metricas.prazosSemDados}{" "}
          {metricas.prazosSemDados === 1
            ? "pedido sem prazo verificável"
            : "pedidos sem prazo verificável"}
          .
        </p>
      )}

      <section className="ca-filtros" aria-label="Filtros dos pedidos">
        <label className="ca-busca">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número, cliente, telefone ou produto"
            aria-label="Buscar pedidos"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Filtrar por status"
        >
          <option value="todos">Todos os status</option>
          {COLUNAS.map((col) => (
            <option key={col.key} value={col.key}>
              {col.titulo}
            </option>
          ))}
        </select>
        <FiltroBtn
          ativo={modalidade === "todas"}
          onClick={() => setModalidade("todas")}
          label="Todos"
        />
        <FiltroBtn
          ativo={modalidade === "entrega"}
          onClick={() => setModalidade("entrega")}
          label="Entrega"
          icone={Truck}
        />
        <FiltroBtn
          ativo={modalidade === "retirada"}
          onClick={() => setModalidade("retirada")}
          label="Retirada"
          icone={Store}
        />
        <FiltroBtn
          ativo={soAgendados}
          onClick={() => setSoAgendados((v) => !v)}
          label="Agendados"
          icone={CalendarClock}
        />
      </section>

      <ControlesAlertas config={config} salvar={salvarConfig} testar={preview ? undefined : alertas?.testar} />

      {audioBloqueado && (
        <p role="status" className="ca-alerta">
          O navegador bloqueou o áudio. Clique em “Testar som” para liberar o alerta.
        </p>
      )}
      {!preview && pedidosErro && (
        <div role="alert" className="ca-alerta">
          Não foi possível carregar a fila de pedidos.
          <Button variant="outline" className="ca-secundario" onClick={() => void refazerPedidos()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!preview && pedidosPendentes && (
        <p role="status" className="ca-nota">
          Carregando pedidos.
        </p>
      )}
      {!preview && avisosErro && (
        <div role="alert" className="ca-alerta">
          Não foi possível carregar os avisos da cozinha.
          <Button variant="outline" className="ca-secundario" onClick={() => refazerAvisos?.()}>
            Recarregar avisos
          </Button>
        </div>
      )}

      {filaDisponivel && (
        <div className="ca-colunas">
          {COLUNAS.map((col) => {
            const lista = ordenarPorPrioridade(colunas[col.key], agora);
            return (
              <section
                key={col.key}
                className="ca-coluna"
                aria-label={col.titulo}
                data-coluna={col.key}
                data-tom={col.key}
              >
                <header>
                  <col.icone size={23} aria-hidden />
                  <div>
                    <h2>
                      {col.titulo} ({lista.length})
                    </h2>
                    <p>{col.descricao}</p>
                  </div>
                </header>
                <div className="ca-cartoes">
                  {lista.length ? (
                    lista.map((p) => {
                      const aviso = avisoDoPedido(avisos, p.id, p.tipo_entrega);
                      return (
                        <CardPedido
                          key={p.id}
                          pedido={p}
                          coluna={col.key}
                          agora={agora}
                          aviso={aviso}
                          avisoReconhecido={
                            !!aviso && avisosReconhecidos.has(aviso.tipo + ":" + p.id)
                          }
                          onReconhecerAviso={aviso ? () => reconhecerAviso(aviso, p.id) : undefined}
                          pendente={idsPendentes.has(p.id)}
                          bloqueado={!podeOperar || aceitandoId !== null}
                          aceitando={aceitandoId === p.id}
                          onDetalhes={() => setDetalheId(p.id)}
                          podeDespachar={!preview && podeOperarEntregas(papeis)}
                          onAceitar={() => void tratarAceite(p)}
                          onReconhecer={() => reconhecer(p.id)}
                          onRetirada={
                            podeConfirmarRetirada(p) ? () => abrirRetirada(p.id) : undefined
                          }
                          onRecebimento={
                            !preview && autorizado && p.tipo_entrega === "retirada" &&
                            !p.retirado_em && p.pagamento_status !== "pago"
                              ? () => abrirRecebimento(p.id) : undefined
                          }
                        />
                      );
                    })
                  ) : (
                    <p className="ca-vazio">Nenhum pedido nesta coluna.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!detalhe}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalheId(null);
        }}
      >
        {detalhe && (
          <DialogContent className="ca-dialogo">
            <DialogHeader>
              <DialogTitle>Pedido #{detalhe.numero}</DialogTitle>
              <DialogDescription>
                {detalhe.cliente_nome || "Cliente não informado"}
              </DialogDescription>
            </DialogHeader>
            <dl className="ca-detalhes">
              <LinhaDetalhe rotulo="Telefone" valor={detalhe.telefone} />
              <LinhaDetalhe rotulo="Modalidade" valor={modalidadeTexto(detalhe)} />
              <LinhaDetalhe rotulo="Horário do pedido" valor={dataCentral(detalhe.created_at)} />
              <LinhaDetalhe
                rotulo="Tipo de pedido"
                valor={detalhe.agendado_para ? "Agendado" : "Imediato"}
              />
              <LinhaDetalhe
                rotulo="Prazo prometido"
                valor={dataCentral(prazoRegistrado(detalhe))}
              />
              <LinhaDetalhe rotulo="Valor" valor={valorPedido(detalhe)} />
              <LinhaDetalhe rotulo="Pagamento" valor={pagamento(detalhe)} />
              <LinhaDetalhe
                rotulo="Aceite registrado em"
                valor={dataCentral(detalhe.aceito_em_atendente ?? detalhe.aceito_em)}
              />
              <LinhaDetalhe
                rotulo="Endereço"
                valor={
                  detalhe.tipo_entrega === "retirada"
                    ? "Retirada no balcão"
                    : [detalhe.endereco, detalhe.bairro].filter(Boolean).join(", ")
                }
              />
              <LinhaDetalhe rotulo="Observações" valor={detalhe.observacoes} />
              {!!detalhe.producao_remessas?.length && (
                <LinhaDetalhe
                  rotulo="Remessas concluídas"
                  valor={
                    detalhe.producao_remessas.filter((remessa) => remessa.concluida_em).length +
                    " de " +
                    detalhe.producao_remessas.length
                  }
                />
              )}
            </dl>
            {!preview && autorizado && (
              <EditarObservacoesPedido
                pedidoId={detalhe.id}
                numero={detalhe.numero}
                observacoes={detalhe.observacoes}
                onSalvo={async () => { await atualizarFilas(); }}
              />
            )}
            <h3>Produtos do pedido</h3>
            {detalhe.pedido_itens?.length ? (
              <ul className="ca-produtos">
                {detalhe.pedido_itens.map((item, i) => (
                  <li key={i}>
                    {item.quantidade} × {item.nome}
                    {detalhe.itens_catalogados?.[i]?.pedido_item_componentes?.map(
                      (componente, indice) => (
                        <div key={indice} className="ca-nota">
                          {componente.quantidade} ×{" "}
                          {componente.produtos?.nome ?? "Sabor não identificado"}
                        </div>
                      ),
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ca-nota">Produtos não informados.</p>
            )}
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={!!retirada}
        onOpenChange={(aberto) => {
          if (!aberto && !retirandoRef.current) setRetiradaId(null);
        }}
      >
        {retirada && (
          <DialogContent className="ca-dialogo">
            <DialogHeader>
              <DialogTitle>Confirmar retirada do pedido #{retirada.numero}</DialogTitle>
              <DialogDescription>
                Confirme depois que o pedido for entregue ao cliente no balcão.
              </DialogDescription>
            </DialogHeader>
            {pagamentoRetirada.isFetching && <p role="status">Consultando pagamento…</p>}
            {pagamentoRetirada.isError && <Button variant="outline" onClick={() => void pagamentoRetirada.refetch()}>Tentar consultar pagamento novamente</Button>}
            {!pagamentoRetirada.isFetching && financeiro?.status === "quitado" && <p>Pagamento confirmado.</p>}
            {!pagamentoRetirada.isFetching && financeiro && !pendente && financeiro.status !== "quitado" &&
              <p role="alert">O Financeiro precisa verificar o pagamento antes da retirada.</p>}
            {pendente && <div className="space-y-2">
              <p>Saldo restante: <strong>{brl(pendente.saldo_centavos / 100)}</strong></p>
              {pendente.pago_centavos > 0 && <p>Já recebido: {brl(pendente.pago_centavos / 100)}</p>}
              {recebeNoBalcao ? <>
                <p>Confirme somente o valor efetivamente recebido em {PAGAMENTO_LABEL[pendente.forma]}.</p>
                <label className="block">Valor a registrar em R$
                  <input className="ml-2 rounded border border-border bg-background px-2 py-1" inputMode="decimal" value={valorParcial} disabled={retirando} placeholder={(pendente.saldo_centavos / 100).toFixed(2).replace(".", ",")} onChange={e => setValorParcial(e.target.value)} />
                </label>
                {dinheiro && <label className="block">Valor entregue pelo cliente em R$
                  <input className="ml-2 rounded border border-border bg-background px-2 py-1" inputMode="decimal" value={valorEntregue} disabled={retirando} onChange={e => setValorEntregue(e.target.value)} />
                </label>}
                {dinheiro && valoresRecebidos && <p>Troco: <strong>{brl(valoresRecebidos.troco / 100)}</strong></p>}
              </> : <p>Solicite o recebimento a um operador autorizado com capacidade financeira.</p>}
            </div>}
            <div className="ca-acoes">
              <Button
                type="button"
                variant="outline"
                className="ca-secundario"
                disabled={retirando}
                onClick={() => setRetiradaId(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="ca-primario"
                disabled={retirando || !filaDisponivel || pagamentoRetirada.isFetching || pagamentoRetirada.isError ||
                  (financeiro?.status !== "quitado" && !(recebeNoBalcao && valoresRecebidos))}
                aria-busy={retirando}
                onClick={() => void confirmarRetirada()}
              >
                {retirando ? "Confirmando…" : recebeNoBalcao && pendente
                  ? valoresRecebidos?.valor === pendente.saldo_centavos ? "Confirmar recebimento e retirada" : "Registrar recebimento"
                  : "Confirmar retirada"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={!!recebimento}
        onOpenChange={(aberto) => {
          if (!aberto && !recebendoRef.current) setRecebimentoId(null);
        }}
      >
        {recebimento && (
          <DialogContent className="ca-dialogo">
            <DialogHeader>
              <DialogTitle>Recebimento do pedido #{recebimento.numero}</DialogTitle>
              <DialogDescription>
                Registre na Central o valor efetivamente recebido. A retirada continua
                exigindo conferência e quitação integral.
              </DialogDescription>
            </DialogHeader>
            {pagamentoRetirada.isFetching && <p role="status">Consultando saldo…</p>}
            {pagamentoRetirada.isError && <Button variant="outline" onClick={() => void pagamentoRetirada.refetch()}>Tentar consultar saldo novamente</Button>}
            {!pagamentoRetirada.isFetching && financeiro?.status === "quitado" && <p>Pagamento confirmado.</p>}
            {!pagamentoRetirada.isFetching && financeiro && !pendente && financeiro.status !== "quitado" &&
              <p role="alert">O Financeiro precisa verificar o pagamento antes de continuar.</p>}
            {pendente && <div className="space-y-2">
              <p>Saldo restante: <strong>{brl(pendente.saldo_centavos / 100)}</strong></p>
              {pendente.pago_centavos > 0 && <p>Já recebido: {brl(pendente.pago_centavos / 100)}</p>}
              {recebeNoBalcao ? <>
                <p>Confirme somente o valor recebido em {PAGAMENTO_LABEL[pendente.forma]}.</p>
                <label className="block">Valor a registrar em R$
                  <input className="ml-2 rounded border border-border bg-background px-2 py-1" inputMode="decimal" value={valorParcial} disabled={recebendo} placeholder={(pendente.saldo_centavos / 100).toFixed(2).replace(".", ",")} onChange={e => setValorParcial(e.target.value)} />
                </label>
                {dinheiro && <label className="block">Valor entregue pelo cliente em R$
                  <input className="ml-2 rounded border border-border bg-background px-2 py-1" inputMode="decimal" value={valorEntregue} disabled={recebendo} onChange={e => setValorEntregue(e.target.value)} />
                </label>}
                {dinheiro && valoresRecebidos && <p>Troco: <strong>{brl(valoresRecebidos.troco / 100)}</strong></p>}
              </> : <p>Você precisa da capacidade financeira <strong>receber_pagamento</strong> para registrar este recebimento.</p>}
            </div>}
            <div className="ca-acoes">
              <Button
                type="button"
                variant="outline"
                className="ca-secundario"
                disabled={recebendo}
                onClick={() => setRecebimentoId(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="ca-primario"
                disabled={recebendo || !filaDisponivel || pagamentoRetirada.isFetching || pagamentoRetirada.isError ||
                  (financeiro?.status !== "quitado" && !(recebeNoBalcao && valoresRecebidos))}
                aria-busy={recebendo}
                onClick={() => void confirmarRecebimento()}
              >
                {recebendo ? "Registrando…" : financeiro?.status === "quitado"
                  ? "Pagamento confirmado"
                  : "Registrar recebimento"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

type IconeCentral = typeof Bell;
function MetricaCard({
  icone: Icone,
  label,
  valor,
  tipo,
}: {
  icone: IconeCentral;
  label: string;
  valor: string | number;
  tipo: keyof ColunasCentral | "atraso";
}) {
  return (
    <div className="ca-metrica" data-tom={tipo}>
      <Icone size={24} aria-hidden />
      <div>
        <p>{label}</p>
        <strong>{valor}</strong>
      </div>
    </div>
  );
}

function FiltroBtn({
  ativo,
  onClick,
  label,
  icone: Icone,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  icone?: IconeCentral;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className="ca-filtro">
      {Icone && <Icone size={17} aria-hidden />}
      {label}
    </button>
  );
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{valor || "—"}</dd>
    </div>
  );
}

const formatoCentral = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
function dataCentral(valor: string | number | null | undefined) {
  const ms = typeof valor === "number" ? valor : Date.parse(valor ?? "");
  return Number.isFinite(ms) ? formatoCentral.format(ms) : null;
}

function modalidadeTexto(p: PedidoCentral) {
  return p.tipo_entrega === "retirada"
    ? "Retirada"
    : p.tipo_entrega === "entrega"
      ? "Entrega"
      : "Modalidade não informada";
}

function pagamento(p: PedidoCentral) {
  return (
    [
      p.forma_pagamento && (PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento),
      p.pagamento_status && (PAGAMENTO_STATUS_LABEL[p.pagamento_status] ?? p.pagamento_status),
    ]
      .filter(Boolean)
      .join(" · ") || "Pagamento não informado"
  );
}

function valorPedido(p: PedidoCentral) {
  return typeof p.total === "number" && Number.isFinite(p.total)
    ? brl(p.total)
    : "Valor não informado";
}

function CardPedido({
  pedido,
  coluna,
  agora,
  aviso,
  avisoReconhecido,
  onReconhecerAviso,
  pendente,
  bloqueado,
  aceitando,
  onDetalhes,
  podeDespachar,
  onAceitar,
  onReconhecer,
  onRetirada,
  onRecebimento,
}: {
  pedido: PedidoCentral;
  coluna: keyof ColunasCentral;
  agora: number;
  aviso: AvisoCozinha | null;
  avisoReconhecido: boolean;
  onReconhecerAviso?: (() => void) | undefined;
  pendente: boolean;
  bloqueado: boolean;
  aceitando: boolean;
  onDetalhes: () => void;
  podeDespachar: boolean;
  onAceitar: () => void;
  onReconhecer: () => void;
  onRetirada: (() => void) | undefined;
  onRecebimento?: (() => void) | undefined;
}) {
  const retirada = pedido.tipo_entrega === "retirada";
  const entrega = pedido.tipo_entrega === "entrega";
  const ModalidadeIcone = retirada ? Store : Truck;
  const emPreparo = estaEmPreparo(pedido);
  const liberado = !!pedido.conferido_em || aviso?.tipo === TIPO_AVISO_RETIRADA;
  const fase =
    coluna === "producao"
      ? emPreparo
        ? "Em preparo"
        : "Aguardando preparo"
      : coluna === "analise"
        ? pendente
          ? "Novo pedido"
          : "Aguardando aceitação"
        : retirada
          ? liberado
            ? "Aguardando cliente"
            : "Conferência ainda não confirmada"
          : entrega
            ? "Aguardando motoboy ou despacho"
            : "Pronto";
  const atrasado = atrasoCentral(pedido, agora) === true;
  const prazo = prazoRegistrado(pedido);
  const janela =
    coluna === "producao" && !emPreparo && pedido.agendado_para && prazo !== null
      ? entradaJanelaProducao(pedido.agendado_para).getTime()
      : null;
  const itens = pedido.itens_catalogados ?? [];
  const produtos = new Map(
    itens.flatMap((i) => (i.produtos ? [[i.produtos.id, i.produtos] as const] : [])),
  );
  const unidades = unidadesSalgadosH02(itens, produtos);
  const combos =
    pedido.producao_remessas?.length ||
    (unidades && unidades % MINIMO_COMBO === 0 ? unidades / MINIMO_COMBO : null);
  const aceite = elegivelAceiteLocal({
    status: pedido.status,
    aceito_em_atendente: pedido.aceito_em_atendente ?? pedido.aceito_em ?? null,
    pagamento_status: pedido.pagamento_status ?? "",
  });

  return (
    <article className="ca-pedido" data-atrasado={atrasado} data-pendente={pendente}>
      <div className="ca-linha">
        <h3>#{pedido.numero}</h3>
        <span className="ca-etiqueta">{pedido.agendado_para ? "Agendado" : "Imediato"}</span>
        {atrasado && (
          <span className="ca-atraso">
            <TriangleAlert size={15} aria-hidden /> Atrasado
          </span>
        )}
      </div>
      <div className="ca-linha">
        <span className="ca-cliente">
          <UserRound size={16} aria-hidden />
          {pedido.cliente_nome || "Cliente não informado"}
        </span>
        <span className="ca-modalidade">
          {(retirada || entrega) && <ModalidadeIcone size={16} aria-hidden />}
          {modalidadeTexto(pedido)}
        </span>
      </div>
      <p className="ca-fase">{fase}</p>
      <div className="ca-linha">
        <span>
          <strong>{valorPedido(pedido)}</strong> · {pagamento(pedido)}
        </span>
      </div>
      <p className="ca-meta">
        <Package size={16} aria-hidden />
        {rotuloQuantidadePedido(pedido.pedido_itens ?? [], unidades)}
        <span>
          · {combos ? combos + (combos === 1 ? " combo" : " combos") : "Combos não informados"}
        </span>
      </p>
      {pedido.pedido_itens?.length ? (
        <p className="ca-nota">
          {pedido.pedido_itens.map((i) => i.quantidade + " × " + i.nome).join(" · ")}
        </p>
      ) : null}
      <p className="ca-meta">
        <Clock size={16} aria-hidden /> Pedido às {dataCentral(pedido.created_at) ?? "—"}
        {coluna === "analise" && dataCentral(pedido.created_at) && (
          <span>· há {formatarMinutos(minutosDesde(pedido.created_at, agora))}</span>
        )}
      </p>
      <p className="ca-meta">
        <CalendarClock size={16} aria-hidden /> Prazo prometido{" "}
        <strong>{dataCentral(prazo) ?? "Não registrado"}</strong>
      </p>
      {janela !== null && janela > agora && (
        <p className="ca-nota">Entrada na fila da cozinha {dataCentral(janela)}</p>
      )}
      {pedido.pronto_em && coluna === "pronto" && (
        <p className="ca-nota">Pronto desde {dataCentral(pedido.pronto_em)}</p>
      )}
      {pedido.atraso_descricao && <p className="ca-atraso">{pedido.atraso_descricao}</p>}
      {pedido.observacoes && <p className="ca-observacoes">{pedido.observacoes}</p>}
      {aviso && (
        <div className="ca-aviso">
          <strong>{aviso.titulo}</strong>
          {aviso.detalhe && <span>{aviso.detalhe}</span>}
          {avisoReconhecido ? (
            <span>Aviso reconhecido</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="ca-secundario"
              onClick={onReconhecerAviso}
            >
              Reconhecer aviso
            </Button>
          )}
        </div>
      )}
      <div className="ca-acoes">
        {podeDespachar && <AtalhosEntrega pedido={pedido} className="ca-primario inline-flex items-center gap-2 rounded-md px-3 py-2" />}
        {coluna === "analise" && (
          <Button
            type="button"
            className="ca-primario"
            disabled={bloqueado || !aceite.elegivel}
            aria-busy={aceitando}
            onClick={onAceitar}
          >
            <CheckCircle2 size={17} aria-hidden />
            {aceitando ? "Aceitando…" : "Aceitar pedido"}
          </Button>
        )}
        <Button type="button" variant="outline" className="ca-secundario ca-contorno-dourado" onClick={onDetalhes}>
          <Eye size={17} aria-hidden /> Ver detalhes
        </Button>
        {onRecebimento && (
          <Button type="button" variant="outline" className="ca-secundario ca-contorno-dourado" onClick={onRecebimento}>
            <Wallet size={17} aria-hidden /> Receber
          </Button>
        )}
        {coluna === "analise" && pendente && (
          <Button type="button" variant="outline" className="ca-secundario" onClick={onReconhecer}>
            <BellRing size={17} aria-hidden /> Reconhecer alerta
          </Button>
        )}
        {onRetirada && (
          <Button type="button" className="ca-primario" onClick={onRetirada}>
            Confirmar retirada
          </Button>
        )}
      </div>
    </article>
  );
}
