import { horaPrometida, limitePrometido, passouDoPrazo } from "@/lib/prazo-pedido";
import { ErroAcessoPainel } from "@/components/admin/acesso-painel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  Clock,
  DollarSign,
  Truck,
  Package,
  Loader2,
  AlertCircle,
  Search,
  CheckCircle,
  ChevronRight,
  XCircle,
  Satellite,
  Bike,
  Route as RouteIcon,
  Send,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-steps";
import { StatusCard, EmptyState } from "@/components/admin/ui-admin";
import fritos from "@/assets/cat-fritos.jpg";
import { MapView, rotaGoogleMaps } from "@/components/map-view";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { ehModoDemo } from "@/lib/demo-preview";
import { CentralEntregasPremium } from "@/components/entregas/central-entregas-premium";
import { EntregasLayout } from "@/components/entregas/entregas-layout";
import { EntregasResumo } from "@/components/entregas/entregas-resumo";
import { comLocalizacaoSegura, lerLocalizacoesEntrega, MOTOBOY_RPC_ATIVO } from "@/lib/localizacao-entrega";
import { brl, dataHora, hora, PAGAMENTO_LABEL } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import { pontoDaLoja, useLojaConfig } from "@/lib/loja";
import { MOTIVO_ATRASO, MOTIVO_ATRASO_LABEL } from "@/lib/entrega";
import {
  E4_ATRIBUICAO_ATIVA,
  atribuirPedidoMotoboy,
  atribuirPedidosEmLote,
  cabeNaRota,
} from "@/lib/central-atribuicao";

// E9.1: travas de clique repetido por pedido (fora do estado React para
// cobrir cliques antes do re-render). Não muda comportamento com flag off.
const atribuindoEmVoo = new Set<string>();
const quadroEntregas = "min-w-0 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4";
const tituloQuadro = "font-display text-lg font-bold uppercase text-[#F2CE6B]";
const linhaEntregas = "rounded-xl border border-[#D4A94A]/30 bg-[#141310]";

function nomeRota(id: string) {
  return `Rota ${id.slice(0, 8)}`;
}

function estadoRota(rota: { status: string; liberada_central_em?: string | null }) {
  if (rota.status === "em_rota") return "Em rota";
  return rota.liberada_central_em ? "Saída liberada" : "Aguardando liberação";
}

function abrirSecaoEntregas(id: string) {
  const destino = document.getElementById(id);
  const painel = destino?.closest("details");
  if (painel) painel.open = true;
  destino?.scrollIntoView({ block: "start" });
}

export const Route = createFileRoute("/central-entregas")({
  head: () => ({
    meta: [
      { title: "Central de Entregas — NÉIA SALGADOS" },
      { name: "description", content: "Painel administrativo de entregas e motoboys" },
    ],
  }),
  // Na homologação local (VITE_DEMO_PREVIEW=1) a rota abre o painel premium
  // com dados fictícios. O módulo operacional real permanece intacto e com
  // suas verificações de sessão/papel para uso fora do modo demonstração.
  component: function RotaCentralEntregas() {
    return ehModoDemo() ? <CentralEntregasPremium /> : <CentralEntregas />;
  },
});

// Metadados visuais dos eventos reais de motoboy_historico (J3-C). Sem inventar eventos.
// Duração decorrida somente visual (J3-F). NÃO significa atraso.
function formatoDuracao(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

const HIST_EVENTO_META: Record<string, { titulo: string; Icon: any }> = {
  inicio_preparacao_saida: { titulo: "Preparação para saída iniciada", Icon: Clock },
  fim_preparacao_saida: { titulo: "Preparação para saída concluída", Icon: Package },
  saida_base: { titulo: "Motoboy saiu da base", Icon: Truck },
  chegada_entrega: { titulo: "Chegada ao endereço", Icon: MapPin },
  entrega_realizada: { titulo: "Entrega realizada", Icon: CheckCircle },
  atraso: { titulo: "Atraso registrado no percurso", Icon: AlertCircle },
  retorno_base: { titulo: "Retorno à base", Icon: Navigation },
};

function CentralEntregas() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles, isError: erroAcesso, refetch: refetchAcesso, isFetching: verificandoAcesso } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const { data: loja } = useLojaConfig();
  const [filtro, setFiltro] = useState<
    "todos" | "hoje" | "em_rota" | "aguardando" | "entregues" | "retirada"
  >("todos");
  const [aba, setAba] = useState("k");
  const [motoboySelecionado, setMotoboySelecionado] = useState("");
  const [pedidosSelecionados, setPedidosSelecionados] = useState<string[]>([]);
  const [atribuindoSelecao, setAtribuindoSelecao] = useState(false);
  const [motoboyRota, setMotoboyRota] = useState("");
  const [pedidosRota, setPedidosRota] = useState<string[]>([]);
  const [criandoRota, setCriandoRota] = useState(false);
  const criandoRotaRef = useRef(false);
  // ---------- HISTÓRICO (J3-C): consulta sob demanda, sem subscription nova ----------
  const [histPedidoId, setHistPedidoId] = useState("");
  const [histMotoboyId, setHistMotoboyId] = useState("");
  // ---------- J3-H: busca + encerramento de rotas (somente leitura/escrita autorizada) ----------
  const [buscaPedido, setBuscaPedido] = useState("");
  const [filtroMotoboyRotas, setFiltroMotoboyRotas] = useState("");
  const [rotaConfirmId, setRotaConfirmId] = useState<string | null>(null);
  const [rotaEncerrandoId, setRotaEncerrandoId] = useState<string | null>(null);
  // ---------- OCORRÊNCIAS (J3-D): somente leitura/escrita em entrega_atrasos ----------
  const [ocFiltroStatus, setOcFiltroStatus] = useState<"todas" | "abertas" | "resolvidas">("todas");
  const [ocFiltroMotivo, setOcFiltroMotivo] = useState("");
  const [ocPedidoId, setOcPedidoId] = useState("");
  const [ocMotivo, setOcMotivo] = useState("transito");
  const [ocDesc, setOcDesc] = useState("");
  const [ocSalvando, setOcSalvando] = useState(false);
  const [ocResolvendoId, setOcResolvendoId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/central-entregas" }, replace: true });
  }, [loading, user, navigate]);

  const autorizado = roles?.includes("admin") || roles?.includes("producao");
  const [agoraPrazo, setAgoraPrazo] = useState(Date.now);
  useEffect(() => {
    if (!autorizado) return;
    const timer = window.setInterval(() => setAgoraPrazo(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [autorizado]);

  // ---------- QUERIES ----------
  const { data: pedidos, isError: erroPedidos, isPending: carregandoPedidos } = useQuery({
    queryKey: ["central-j2-pedidos", filtro],
    enabled: !!autorizado && !loading,
    refetchInterval: MOTOBOY_RPC_ATIVO ? 15000 : false,
    queryFn: async () => {
      // Retirada nunca entra na central de entregas — exceto no filtro
      // próprio "retirada" (prontos aguardando o cliente buscar).
      const soRetirada = filtro === "retirada";
      let query = supabase.from("pedidos").select("*").order("created_at", { ascending: false });
      if (soRetirada) {
        query = query.eq("tipo_entrega", "retirada").eq("status", "pronto");
      } else {
        // NULL passa p/ bancos sem a 0018.
        query = query.neq("tipo_entrega", "retirada");
      }
      switch (filtro) {
        case "hoje": {
          const hoje = new Date();
          query = query
            .gte("created_at", `${hoje.toISOString().slice(0, 10)}T00:00:00`)
            .lte("created_at", `${hoje.toISOString().slice(0, 10)}T23:59:59`);
          break;
        }
        case "em_rota":
          query = query.eq("status", "em_rota");
          break;
        case "aguardando":
          query = query
            .in("status", ["pronto", "aguardando_motoboy"])
            .is("motoboy_id", null);
          break;
        case "entregues":
          query = query.eq("status", "entregue");
          break;
        case "todos":
        default:
          break;
      }
      const { data, error } = await query;
      if (error) throw error;
      if (MOTOBOY_RPC_ATIVO) {
        const ids = (data ?? []).filter((p: any) => p.status === "em_rota").map((p: any) => p.id);
        const lotes: string[][] = [];
        for (let inicio = 0; inicio < ids.length; inicio += 50) lotes.push(ids.slice(inicio, inicio + 50));
        const posicoes = new Map((await Promise.all(lotes.map(lerLocalizacoesEntrega))).flatMap((lote) => [...lote]));
        return (data ?? []).map((p: any) => comLocalizacaoSegura(p, posicoes.get(p.id) ?? null));
      }
      return data ?? [];
    },
  });

  const { data: motoboys, isError: erroMotoboys } = useQuery({
    queryKey: ["central-j2-motoboys"],
    enabled: !!autorizado && !loading,
    queryFn: async () => {
      const { data, error } = await supabase.from("motoboys").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------- HISTÓRICO (J3-C): somente leitura, sob demanda ----------
  // Sem subscription nova (regra J3-C §11); atualiza ao abrir/trocar seleção ou no botão Atualizar.
  const histFiltroAtivo = !!autorizado && !loading && (!!histPedidoId || !!histMotoboyId);
  const { data: histEventos, isFetching: histCarregando } = useQuery({
    queryKey: ["central-j3c-historico", histPedidoId || null, histMotoboyId || null],
    enabled: histFiltroAtivo,
    queryFn: async () => {
      let q = supabase
        .from("motoboy_historico")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);
      if (histPedidoId) q = q.eq("pedido_id", histPedidoId);
      if (histMotoboyId) q = q.eq("motoboy_id", histMotoboyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: histAtrasos } = useQuery({
    queryKey: ["central-j3c-atrasos", histPedidoId || null, histMotoboyId || null],
    enabled: histFiltroAtivo,
    queryFn: async () => {
      let q = supabase
        .from("entrega_atrasos")
        .select("*")
        .order("criado_em", { ascending: true })
        .limit(100);
      if (histPedidoId) q = q.eq("pedido_id", histPedidoId);
      if (histMotoboyId) q = q.eq("motoboy_id", histMotoboyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------- OCORRÊNCIAS (J3-D): lista operacional recente, sem subscription nova ----------
  const {
    data: ocorrencias,
    isFetching: ocCarregando,
    error: ocErro,
  } = useQuery({
    queryKey: ["central-j3d-ocorrencias"],
    enabled: !!autorizado && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_atrasos")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const ocorrenciasFiltradas = useMemo(() => {
    return (ocorrencias ?? []).filter((o: any) => {
      if (ocFiltroStatus === "abertas" && o.resolvido_em) return false;
      if (ocFiltroStatus === "resolvidas" && !o.resolvido_em) return false;
      if (ocFiltroMotivo && o.motivo !== ocFiltroMotivo) return false;
      return true;
    });
  }, [ocorrencias, ocFiltroStatus, ocFiltroMotivo]);

  // Registrar ocorrência: somente campos de entrega_atrasos. Sem atraso automático (proibido na J3-D).
  async function registrarOcorrencia() {
    if (!ocPedidoId) {
      toast.error("Selecione um pedido.");
      return;
    }
    if (!(MOTIVO_ATRASO as readonly string[]).includes(ocMotivo)) {
      toast.error("Motivo inválido.");
      return;
    }
    if (ocMotivo === "outro" && !ocDesc.trim()) {
      toast.error("Descreva o motivo.");
      return;
    }
    const ped = (pedidos ?? []).find((x: any) => x.id === ocPedidoId);
    setOcSalvando(true);
    try {
      const { error } = await supabase.from("entrega_atrasos").insert({
        pedido_id: ocPedidoId,
        motoboy_id: ped?.motoboy_id ?? null,
        motivo: ocMotivo,
        descricao_outro: ocDesc.trim() || null,
        criado_por: (user as any)?.id ?? null,
      });
      if (error) throw error;
      toast.success("Ocorrência registrada.");
      setOcPedidoId("");
      setOcMotivo("transito");
      setOcDesc("");
      queryClient.invalidateQueries({ queryKey: ["central-j3d-ocorrencias"] });
      queryClient.invalidateQueries({ queryKey: ["central-j3c-atrasos"] });
      queryClient.invalidateQueries({ queryKey: ["central-j3c-historico"] });
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar ocorrência");
    } finally {
      setOcSalvando(false);
    }
  }

  // Resolver ocorrência: preenche apenas resolvido_em. Nunca apaga o registro.
  async function resolverOcorrencia(id: string) {
    setOcResolvendoId(id);
    try {
      const { error } = await supabase
        .from("entrega_atrasos")
        .update({ resolvido_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Ocorrência marcada como resolvida.");
      queryClient.invalidateQueries({ queryKey: ["central-j3d-ocorrencias"] });
      queryClient.invalidateQueries({ queryKey: ["central-j3c-atrasos"] });
      queryClient.invalidateQueries({ queryKey: ["central-j3c-historico"] });
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : "Erro ao resolver ocorrência");
    } finally {
      setOcResolvendoId(null);
    }
  }

  // ---------- ACOMPANHAMENTO EM ROTA (J3-F): somente leitura, sem query por pedido ----------
  const emRotaBase = useMemo(
    () => (pedidos ?? []).filter((p: any) => p.status === "em_rota"),
    [pedidos],
  );
  const rotaIdsEmRota = useMemo(
    () => [...new Set(emRotaBase.map((p: any) => p.rota_id).filter(Boolean))] as string[],
    [emRotaBase],
  );
  // Horários de saída das rotas: 1 query em lote (sem N+1). Indispensável porque
  // central-j2-pedidos não traz rotas_entrega.saiu_em e nada grava pedidos.saiu_em hoje.
  const { data: rotasSaida, error: rotasSaidaErro } = useQuery({
    queryKey: ["central-j3f-rotas", ...rotaIdsEmRota],
    enabled: !!autorizado && !loading && rotaIdsEmRota.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas_entrega")
        .select("id,saiu_em")
        .in("id", rotaIdsEmRota);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rotaSaidaMap = useMemo(() => {
    const m = new Map<string, string>();
    (rotasSaida ?? []).forEach((r: any) => {
      if (r?.id && r?.saiu_em) m.set(r.id, r.saiu_em);
    });
    return m;
  }, [rotasSaida]);
  // Início real da rota por pedido: pedidos.saiu_em ?? rotas_entrega.saiu_em. Sem inventar.
  // Ordenação: mais tempo em rota primeiro; sem horário conhecido vai para o fim.
  const acompanhamento = useMemo(() => {
    const comInicio = emRotaBase.map((p: any) => ({
      p,
      inicio: ((p.saiu_em as string | null) ??
        (p.rota_id ? (rotaSaidaMap.get(p.rota_id) ?? null) : null)) as string | null,
    }));
    return comInicio.sort((a: any, b: any) => {
      if (a.inicio && b.inicio) return new Date(a.inicio).getTime() - new Date(b.inicio).getTime();
      if (a.inicio) return -1;
      if (b.inicio) return 1;
      return 0;
    });
  }, [emRotaBase, rotaSaidaMap]);

  // ---------- ROTAS EM ANDAMENTO (J3-H H1): 1 query com pedidos embutidos, sem N+1 ----------
  const fetchRotasAtivas = async () => {
    const { data, error } = await supabase
      .from("rotas_entrega")
      .select(
        `id,motoboy_id,status,saiu_em,${MOTOBOY_RPC_ATIVO ? "liberada_central_em,liberada_central_por," : ""}rota_pedidos(pedido_id,ordem,pedidos(id,numero,status,cliente_nome,agendado_para,bairro,destino_lat,destino_lng))`,
      )
      .in("status", MOTOBOY_RPC_ATIVO ? ["preparando", "em_rota"] : ["em_rota"])
      .order("saiu_em", { ascending: true });
    if (error) throw error;
    return data ?? [];
  };
  const {
    data: rotasAtivas,
    isFetching: rotasCarregando,
    error: rotasErro,
  } = useQuery({
    queryKey: ["central-j3h-rotas"],
    enabled: !!autorizado && !loading,
    queryFn: fetchRotasAtivas,
  });

  const [rotaLiberando, setRotaLiberando] = useState<string | null>(null);
  const [rotaSelecionada, setRotaSelecionada] = useState<string | null>(null);
  async function liberarRota(rotaId: string) {
    if (rotaLiberando) return;
    setRotaLiberando(rotaId);
    try {
      const {data,error} = await supabase.rpc("liberar_rota_entrega",{p_rota_id:rotaId});
      if (error || data?.status !== "ok") throw new Error("Liberação não confirmada. Confira os pedidos e a instalação da RPC.");
      toast.success("Saída liberada pela Central.");
      void queryClient.invalidateQueries({queryKey:["central-j3h-rotas"]});
    } catch (erro) { toast.error(erro instanceof Error ? erro.message : "Não foi possível liberar a rota."); }
    finally { setRotaLiberando(null); }
  }

  // Encerra rota somente se TODOS os vinculados estão entregue/cancelado.
  // Revalida com leitura fresca antes do UPDATE (não confia só no estado em tela).
  // Toca SOMENTE rotas_entrega {status, chegou_em}; preserva pedidos e rota_pedidos.
  async function encerrarRota(rotaId: string) {
    setRotaEncerrandoId(rotaId);
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: ["central-j3h-rotas"],
        queryFn: fetchRotasAtivas,
      });
      const rota = (fresh ?? []).find((r: any) => r.id === rotaId);
      if (!rota) throw new Error("Rota não encontrada. Atualize a lista e tente de novo.");
      if (rota.status !== "em_rota") throw new Error("Só é possível encerrar rotas em rota.");
      const vinculados = (rota.rota_pedidos ?? []).map((rp: any) => rp.pedidos).filter(Boolean);
      const pendentes = vinculados.filter(
        (p: any) => p.status !== "entregue" && p.status !== "cancelado",
      );
      if (pendentes.length > 0) {
        throw new Error(`Ainda existem ${pendentes.length} pedido(s) pendentes nesta rota.`);
      }
      if (MOTOBOY_RPC_ATIVO) {
        const {data,error} = await supabase.rpc("encerrar_rota_pela_central", {p_rota:rotaId});
        if (error || !["ok","repetido"].includes(data?.status)) {
          throw new Error("O servidor não confirmou o encerramento. Confira os pedidos e tente novamente.");
        }
      } else {
        const { error } = await supabase
          .from("rotas_entrega")
          .update({ status: "concluida", chegou_em: new Date().toISOString() })
          .eq("id", rotaId);
        if (error) throw error;
      }
      toast.success("Rota encerrada.");
      setRotaConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] });
      queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
      queryClient.invalidateQueries({ queryKey: ["central-j3f-rotas"] });
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : "Erro ao encerrar rota");
    } finally {
      setRotaEncerrandoId(null);
    }
  }

  // ---------- SUBSCRIÇÃO REALTIME ----------
  // Cria um canal Realtime para a tabela de pedidos
  useEffect(() => {
    if (!autorizado) return;

    const channel = supabase
      .channel("central-entregas-pedidos")
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "pedidos",
        },
        () => {
          // Invalidar queries quando houver alteração relevante.
          // J3-A (preservada): Kanban. J3-G: operacionais (prefixo casa com os params das keys).
          queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
          queryClient.invalidateQueries({ queryKey: ["central-j3d-ocorrencias"] });
          queryClient.invalidateQueries({ queryKey: ["central-j3c-atrasos"] });
          queryClient.invalidateQueries({ queryKey: ["central-j3c-historico"] });
          queryClient.invalidateQueries({ queryKey: ["central-j3f-rotas"] });
          queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] });
        },
      )
      // J3-H H3: mesmo canal, segundo binding (motoboys). Sem canal novo, sem polling.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "motoboys",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["central-j2-motoboys"] });
        },
      )
      .subscribe();

    // Limpeza: remove o canal quando o componente é desmontado
    return () => {
      supabase.removeChannel(channel);
    };
  }, [autorizado, filtro, queryClient]);

  function aguardandoAtribuicaoCentral(p: any): boolean {
    return (
      p.tipo_entrega === "entrega" &&
      !p.motoboy_id &&
      !p.rota_id &&
      (p.status === "pronto" || p.status === "aguardando_motoboy")
    );
  }

  function atribuidoCentral(p: any): boolean {
    return Boolean(
      p.motoboy_id &&
        p.status !== "entregue" &&
        p.status !== "em_rota" &&
        (p.status === "aguardando_motoboy" || p.status === "pronto" || p.status === "atribuido"),
    );
  }

  // ---------- DERIVADOS ----------
  const pedidosFiltrados = useMemo(() => {
    if (filtro === "todos") return pedidos ?? [];
    return (pedidos ?? []).filter((p: any) => {
      switch (filtro) {
        case "hoje": {
          const hoje = new Date();
          return new Date(p.created_at).toDateString() === hoje.toDateString();
        }
        case "em_rota":
          return p.status === "em_rota";
        case "aguardando":
          return aguardandoAtribuicaoCentral(p);
        case "entregues":
          return p.status === "entregue";
        default:
          return true;
      }
    });
  }, [pedidos, filtro]);

  // Contadores a partir dos dados já carregados
  const contadores = useMemo(() => {
    if (!pedidos?.length)
      return { aguardando: 0, atribuidos: 0, em_rota: 0, entregue: 0, total: 0 };
    const total = pedidos.length;
    return {
      aguardando: pedidos.filter(aguardandoAtribuicaoCentral).length,
      atribuidos: pedidos.filter(atribuidoCentral).length,
      em_rota: pedidos.filter((p: any) => p.status === "em_rota").length,
      entregue: pedidos.filter((p: any) => p.status === "entregue").length,
      total,
    };
  }, [pedidos]);

  // Motoboys elegíveis (status disponivel_base)
  const motoboysElegiveis = useMemo(() => {
    if (!motoboys) return [];
    return motoboys.filter((m: any) => m.status === "disponivel_base");
  }, [motoboys]);

  // Resumo do dia (real, sobre os dados carregados): KPIs, em andamento e motoboys.
  const resumoCentral = useMemo(() => {
    const lista = pedidos ?? [];
    const hoje = new Date().toDateString();
    const emRota = lista.filter((p: any) => p.status === "em_rota");
    const aguardando = lista.filter(aguardandoAtribuicaoCentral);
    const entreguesHoje = lista.filter(
      (p: any) => p.status === "entregue" && new Date(p.created_at).toDateString() === hoje,
    );
    const porMotoboy = new Map<string, string>();
    for (const m of motoboys ?? []) if (m.user_id) porMotoboy.set(String(m.user_id), m.nome ?? "?");
    const emAndamento = [...emRota]
      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 8);
    return { emRota, aguardando, entreguesHoje, emAndamento, porMotoboy };
  }, [pedidos, motoboys]);

  function verHistoricoPedido(id: string) {
    setHistPedidoId(id);
    abrirSecaoEntregas("secao-historico");
  }

  // ---------- FUNÇÕES ----------
  // Atribuir motoboy ao pedido
  async function atribuirMotoboy(pedidoId: string, motoboyId: string): Promise<boolean> {
    // Validar se motoboy está elegível (status disponivel_base)
    const motoboy = motoboysElegiveis?.find((m: any) => m.id === motoboyId);
    if (!motoboy) {
      return false;
    }
    // pedidos.motoboy_id referencia auth.users(id): gravar o user_id do
    // cadastro (0032), não o id da tabela motoboys. Sem vínculo, não atribuir.
    if (!motoboy.user_id) {
      return false;
    }
    // E9.1: bloqueio de clique repetido (0 rows = conflito, não silêncio).
    if (atribuindoEmVoo.has(pedidoId)) return false;
    atribuindoEmVoo.add(pedidoId);
    try {
      // E9.1: caminho transacional E4 atrás de flag; desligada = legado intacto.
      if (E4_ATRIBUICAO_ATIVA) {
        const r = await atribuirPedidoMotoboy(supabase as never, pedidoId, motoboyId);
        if (!r.ok) {
          return false;
        }
      } else {
        // Espelha o aceite do motoboy: só motoboy_id, aceito_em e status mudam,
        // apenas se ainda sem dono (0 linhas = outro atribuiu primeiro).
        const { data, error } = await supabase
          .from("pedidos")
          .update({
            motoboy_id: motoboy.user_id,
            aceito_em: new Date().toISOString(),
            status: "aguardando_motoboy",
          })
          .eq("id", pedidoId)
          .is("motoboy_id", null)
          .in("status", ["pronto", "aguardando_motoboy"])
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          return false;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
      // Forçar refetch para mover card entre colunas
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] }),
        100,
      );
      return true;
    } catch {
      return false;
    } finally {
      atribuindoEmVoo.delete(pedidoId);
    }
  }

  // Criar rota
  async function criarRota(pedidosSelecionados: string[], motoboyId: string | null) {
    if (criandoRotaRef.current) return;
    const pedidosUnicos = [...new Set(pedidosSelecionados.map((id) => id.trim()).filter(Boolean))];
    if (!motoboyId) {
      toast.error("Selecione um motoboy antes de criar a rota.");
      return;
    }
    if (pedidosUnicos.length === 0) {
      toast.error("Selecione pelo menos um pedido.");
      return;
    }

    // 0084 aceita somente pedidos Prontos ainda sem motoboy ou rota.
    const invalidos = pedidosUnicos.filter((pid: string) => {
      const p = (pedidos ?? []).find((x: any) => x.id === pid);
      if (!p) return true;
      if (p.status !== "pronto" || p.motoboy_id || p.rota_id) return true;
      return false;
    });
    if (invalidos.length > 0) {
      toast.error(`Não é possível criar rota: ${invalidos.length} pedido(ns) inválido(s).`);
      return;
    }

    // Regra operacional: 3 paradas por rota. A 4ª+ exigiria autorização
    // explícita auditável, que ainda NÃO existe no fluxo local. Bloqueia antes
    // de criar a rota (evita rota órfã por limite de negócio).
    if (!cabeNaRota(pedidosUnicos.length, false)) {
      toast.error("Cada rota aceita no máximo 3 paradas. Divida em mais de uma rota.");
      return;
    }

    criandoRotaRef.current = true;
    setCriandoRota(true);
    try {
      const { data, error } = await supabase.rpc("criar_rota_entrega_atomica", {
        p_pedido_ids: pedidosUnicos,
        p_motoboy_id: motoboyId,
        p_exigir_conferencia: false,
      });
      if (error) throw error;
      const resultado = data as { status?: string; quantidade?: number; motivo?: string; detalhe?: string } | null;
      if (resultado?.status !== "criada") {
        const motivo = resultado?.motivo ?? resultado?.status;
        const mensagens: Record<string, string> = {
          permissao_negada: "Seu perfil não pode atribuir rotas.",
          dados_invalidos: "Selecione até três pedidos válidos e um motoboy.",
          pedido_duplicado: "A seleção contém pedidos duplicados.",
          pedido_inexistente: "Um dos pedidos não existe mais.",
          motoboy_inexistente: "O motoboy selecionado não está mais disponível.",
          rota_preexistente: "Este motoboy já tem uma rota ativa. Revise ou conclua essa rota antes de criar outra.",
          falha_atomica: `A rota não foi confirmada (${resultado?.detalhe ?? motivo ?? "conflito operacional"}). Nenhuma atribuição parcial foi mantida.`,
        };
        toast.error(mensagens[motivo ?? ""] ?? "A rota não pôde ser criada. Atualize os pedidos e confira os estados.");
        queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
        queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] });
        return;
      }
      toast.success(`Rota atribuída com ${resultado.quantidade ?? pedidosUnicos.length} pedido(s).`);
      queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
      queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] });
      setMotoboyRota("");
      setPedidosRota([]);
    } catch (erro) {
      const rpcAusente = typeof erro === "object" && erro !== null && "code" in erro && erro.code === "PGRST202";
      toast.error(rpcAusente
        ? "Atribuição pausada: a migration 0108 ainda não está instalada. Nenhuma rota foi confirmada."
        : "Não foi possível confirmar a resposta. Atualize pedidos e rotas antes de repetir a ação.");
      queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
      queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] });
    } finally {
      criandoRotaRef.current = false;
      setCriandoRota(false);
    }
  }

  // Alternar filtro
  const handleFiltroChange = (novoFiltro: string) => {
    setFiltro(novoFiltro as "todos" | "hoje" | "em_rota" | "aguardando" | "entregues" | "retirada");
    queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", novoFiltro] });
  };

  // ---------- COMPONENTS ----------
  // Busca rápida (J3-H H4): sobre os pedidos já carregados, sem request por tecla.
  const termoBusca = buscaPedido.trim().toLowerCase();
  function casaBusca(p: any): boolean {
    if (!termoBusca) return false;
    return (
      String(p.numero ?? "")
        .toLowerCase()
        .includes(termoBusca) ||
      String(p.cliente_nome ?? "")
        .toLowerCase()
        .includes(termoBusca)
    );
  }

  // Card de pedido para Kanban
  function PedidoCard({ pedido: p }: { pedido: any }) {
    const destino = `${p.endereco}${p.complemento ? `, ${p.complemento}` : ""}, ${p.bairro}`;
    // J3-H H2: nome do motoboy (fallback: fragmento do id) + veículo/placa/status quando houver.
    const mb = p.motoboy_id ? (motoboys ?? []).find((x: any) => x.user_id === p.motoboy_id) : null;
    const extrasMb = [mb?.veiculo, mb?.placa, mb?.status].filter(Boolean).join(" • ");
    const ocAbertas = (ocorrencias ?? []).filter(
      (o: any) => o.pedido_id === p.id && !o.resolvido_em,
    );
    const rotaInfo = p.rota_id ? ` (Rota: ${p.rota_id.slice(0, 8)})` : "";
    const destaque = casaBusca(p);

    // GPS status for this delivery
    const isEmRota = p.status === "em_rota";
    const hasGps = p.motoboy_lat && p.motoboy_lng;
    const lastUpdate = p.motoboy_atualizado_em ? new Date(p.motoboy_atualizado_em) : null;
    const isGpsStale = lastUpdate && Date.now() - lastUpdate.getTime() > 60000;

    const getGpsBadge = () => {
      if (!isEmRota) return null;
      if (!hasGps)
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Satellite className="size-3" /> GPS aguardando
          </span>
        );
      if (isGpsStale)
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 text-warning px-2 py-1 text-xs">
            <AlertCircle className="size-3" /> GPS desatualizado
          </span>
        );
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/20 text-success px-2 py-1 text-xs">
          <Satellite className="size-3" /> GPS ativo
        </span>
      );
    };

    return (
      <article
        key={p.id}
        className={`rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]${destaque ? " ring-2 ring-primary" : ""}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="font-display text-lg">Pedido Nº {p.numero}</span>
          <StatusBadge status={p.status} />
          {isEmRota && getGpsBadge()}
          {ocAbertas.length > 0 && (
            <span
              className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
              title={ocAbertas
                .map((o: any) => MOTIVO_ATRASO_LABEL[o.motivo] ?? o.motivo)
                .join("; ")}
            >
              ⚠ Ocorrência aberta{ocAbertas.length > 1 ? ` (${ocAbertas.length})` : ""}
            </span>
          )}
        </div>
        <p className="text-sm">
          <strong>Cliente:</strong> {p.cliente_nome}
        </p>
        <p className="text-sm text-muted-foreground">{destino}</p>
        {/* 0103: distância • taxa da entrega (snapshot do pedido). */}
        {p.tipo_entrega !== "retirada" &&
        (p.distancia_km != null || p.taxa_entrega != null) ? (
          <p className="mt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/40 px-2 py-0.5 text-xs font-semibold">
              <Truck className="size-3" />
              {p.distancia_km != null
                ? `${Number(p.distancia_km).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`
                : "—"}
              {p.taxa_entrega != null ? ` • ${brl(Number(p.taxa_entrega))}` : ""}
            </span>
            {p.destino_lat != null && p.destino_lng != null ? (
              <span
                className="ml-2 text-xs text-muted-foreground"
                title={`${p.destino_lat}, ${p.destino_lng}`}
              >
                📍 ponto confirmado
              </span>
            ) : null}
          </p>
        ) : null}
        <p className="text-sm">
          Total: {brl(p.total)} • {PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento}
        </p>
        <p className="text-xs mt-1">Criado: {dataHora(p.created_at)}</p>
        {p.motoboy_id && (
          <p className="text-xs mt-1">
            Motoboy: {mb?.nome ?? `#${p.motoboy_id.slice(0, 8)}`}
            {extrasMb ? ` • ${extrasMb}` : ""}
          </p>
        )}
        {p.rota_id && <p className="text-xs mt-1">Rota: {rotaInfo}</p>}
      </article>
    );
  }

  // Kanban respeita a busca (filtros J1 intactos); demais seções usam pedidosFiltrados.
  const pedidosVisiveis = termoBusca
    ? (pedidosFiltrados ?? []).filter(casaBusca)
    : (pedidosFiltrados ?? []);

  /* Pontos do mapa dominante: destinos dos pedidos + posições dos motoboys.
     Mesma lógica do mapa antigo, unificada em um único MapView no topo. */
  const pontosMapa = useMemo(() => {
    const pts: { lat: number; lng: number; label: string; moto?: boolean; motoboyId?: string }[] = [];
    for (const p of pedidosFiltrados ?? []) {
      if (p.destino_lat != null && p.destino_lng != null) {
        pts.push({
          lat: p.destino_lat,
          lng: p.destino_lng,
          label: `Pedido ${p.numero}`,

        });
      }
    }
    for (const m of motoboys ?? []) {
      const ultimoPedido = (pedidos ?? [])
        .filter((p: any) => p.motoboy_id === m.user_id)
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0];
      if (ultimoPedido && ultimoPedido.motoboy_lat != null && ultimoPedido.motoboy_lng != null) {
        // Idade da localização em segundos (motoboy_atualizado_em; fallback created_at).
        // Regra técnica: >120s (~2 intervalos de 15s + margem) = desatualizada.
        const ref = ultimoPedido.motoboy_atualizado_em ?? ultimoPedido.created_at;
        const msDiff = Math.abs(new Date().getTime() - new Date(ref).getTime());
        const idadeSegundos = Math.round(msDiff / 1000);
        const desatualizada = idadeSegundos > 120;
        pts.push({
          lat: ultimoPedido.motoboy_lat,
          lng: ultimoPedido.motoboy_lng,
          label: `Motoboy ${m.nome}${desatualizada ? " ⚠ desatualizada" : ""}`,
          moto: true,
          motoboyId: m.id,
        });
      }
    }
    return pts;
  }, [pedidosFiltrados, motoboys, pedidos]);

  if (erroAcesso) return <ErroAcessoPainel nome="Central de Entregas" tentando={verificandoAcesso} onTentar={() => void refetchAcesso()} />;
  if (loading || !user || !roles)
    return <p role="status" className="p-6 text-muted-foreground">Verificando acesso à Central de Entregas…</p>;
  if (!autorizado) {
    return (
      <p className="p-10 text-center text-muted-foreground">Acesso restrito ao administrador.</p>
    );
  }

  const rotasVisiveis = (rotasAtivas ?? []).filter((rota: any) =>
    !filtroMotoboyRotas || rota.motoboy_id === filtroMotoboyRotas,
  );
  const rotaNoMapa = rotasVisiveis.find((rota: any) => rota.id === rotaSelecionada) ?? rotasVisiveis[0];
  const paradas = (rotaNoMapa?.rota_pedidos ?? [])
    .filter((vinculo: any) => vinculo.pedidos)
    .sort((a: any, b: any) => a.ordem - b.ordem)
    .map((vinculo: any) => vinculo.pedidos);
  const motoboyDaRota = (motoboys ?? []).find((m: any) => m.id === rotaNoMapa?.motoboy_id);
  const rotaPodeEncerrar = paradas.length > 0 && paradas.every((p: any) => ["entregue", "cancelado"].includes(p.status));
  const localLoja = loja ? pontoDaLoja(loja) : null;
  const pontosDasParadas = paradas.flatMap((p: any, indice: number) =>
    p.destino_lat == null || p.destino_lng == null ? [] : [{
      lat: p.destino_lat, lng: p.destino_lng, label: "Pedido " + p.numero,
      rotulo: String.fromCharCode(65 + indice),
    }],
  );
  const pontosSelecionados = rotaNoMapa
    ? [...pontosDasParadas, ...pontosMapa.filter((ponto) => ponto.motoboyId === rotaNoMapa.motoboy_id)]
    : pontosMapa;
  const pontosDaRota = localLoja && pontosSelecionados.length ? [localLoja, ...pontosSelecionados] : pontosSelecionados;
  const origemEParadas = localLoja ? [localLoja, ...pontosDasParadas] : pontosDasParadas;
  const sequenciaDaRota = pontosDasParadas.length === paradas.length && paradas.length > 0
    ? origemEParadas : [];
  const pedidosParaRota = pedidosVisiveis.filter((p: any) => p.tipo_entrega === "entrega" && (aguardandoAtribuicaoCentral(p) || atribuidoCentral(p)));
  const atribuicoes = !erroPedidos && pedidos
    ? pedidos.filter((pedido: any) => pedido.tipo_entrega === "entrega" && pedido.motoboy_id &&
        ["pronto", "aguardando_motoboy"].includes(pedido.status)).length
    : "—";

  return (
    <>
      <div className="central-entregas-operacional-premium mx-auto w-full min-w-0 max-w-[1400px] space-y-4 p-3 sm:p-4">
        <EntregasResumo
          aguardando={!erroPedidos && pedidos ? resumoCentral.aguardando.length : "—"}
          atribuidos={atribuicoes}
          emRota={!erroPedidos && pedidos ? resumoCentral.emRota.length : "—"}
          entregues={!erroPedidos && pedidos ? resumoCentral.entreguesHoje.length : "—"}
          disponiveis={!erroMotoboys && motoboys ? motoboysElegiveis.length : "—"}
          acoes={
            <a href="#secao-rotas" className="erp-btn-gold inline-flex min-h-11 items-center rounded-xl px-4 py-2 font-semibold">
              Ver rotas
            </a>
          }
        />
        {erroPedidos || erroMotoboys ? (
          <p role="alert" className="rounded-lg border border-destructive/60 p-3 text-sm text-destructive">
            Não foi possível carregar todos os dados da Central. Use “Atualizar dados” para tentar novamente.
          </p>
        ) : carregandoPedidos ? (
          <p role="status" className="text-sm text-muted-foreground">Carregando pedidos de entrega…</p>
        ) : null}

        <EntregasLayout
          mapa={
            <section id="secao-mapa" className={quadroEntregas} aria-label="Mapa de entregas">
              <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="rounded-full border border-[#D4A94A] px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide">
                  {rotaNoMapa ? nomeRota(rotaNoMapa.id) : "Mapa de entregas"}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {rotasVisiveis.length} rotas · {paradas.length} paradas selecionadas
                </span>
              </header>
              <div className="relative h-64 overflow-hidden rounded-xl border border-[#D4A94A]/20 bg-[#0B0A08] sm:h-[340px]">
                {pontosDaRota.length > 0 ? (
                  <>
                    <MapView pontos={pontosDaRota} sequencia={sequenciaDaRota} className="h-full w-full" />
                    {sequenciaDaRota.length > 1 && (
                      <span className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-[#D4A94A]/40 bg-[#0B0A08]/90 px-2 py-1 text-xs">
                        Sequência de paradas
                      </span>
                    )}
                  </>
                ) : (
                  <div className="grid h-full place-content-center gap-3 bg-[linear-gradient(to_right,#201C14_1px,transparent_1px),linear-gradient(to_bottom,#201C14_1px,transparent_1px)] bg-[length:36px_36px] px-5 text-center">
                    <MapPin className="mx-auto size-8 text-[#F2CE6B]" aria-hidden />
                    <p className="rounded-md bg-[#0B0A08] p-2 text-sm text-muted-foreground">Aguardando pedidos com localização confirmada.</p>
                  </div>
                )}
              </div>
              {paradas.length > 0 && (
                <ol aria-label="Paradas da rota selecionada" className="mt-3 grid gap-3 sm:grid-cols-3">
                  {paradas.map((pedido: any, indice: number) => {
                    const prazo = limitePrometido(pedido);
                    return (
                      <li key={pedido.id} className={linhaEntregas + " min-w-0 p-3"}>
                        <strong className="flex items-center gap-2 text-sm">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#D4A94A]/40 bg-[#D4A94A]/15 text-[#F2CE6B]">{String.fromCharCode(65 + indice)}</span>
                          #{pedido.numero}
                        </strong>
                        <p className="mt-1 break-words text-xs text-muted-foreground">{pedido.cliente_nome}</p>
                        {prazo && <p className="mt-2 text-xs font-bold text-[#F2CE6B]">Cliente até {horaPrometida(prazo)}</p>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          }
          rota={
            <section id="secao-rota-selecionada" className={quadroEntregas} aria-label="Rota selecionada">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-extrabold uppercase">{rotaNoMapa ? nomeRota(rotaNoMapa.id) : "Rota selecionada"}</h2>
                <span className="rounded-full border border-[#D4A94A] px-3 py-1 text-xs font-bold uppercase">{paradas.length} pedidos</span>
              </div>
              {rotaNoMapa ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-[#D4A94A]/50 bg-[#D4A94A]/10 text-[#F2CE6B]"><User className="size-6" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase text-[#F2CE6B]">Motoboy</p>
                      <p className="break-words text-lg font-bold">{motoboyDaRota?.nome ?? "Não vinculado"}</p>
                    </div>
                    <span className="rounded-full border border-[#D4A94A]/40 px-3 py-1 text-xs font-semibold">{estadoRota(rotaNoMapa)}</span>
                  </div>
                  <ol className="mt-4 space-y-2">
                    {paradas.map((pedido: any) => (
                      <li key={pedido.id} className={linhaEntregas + " flex flex-wrap items-center gap-3 p-3"}>
                        <Package className="size-5 shrink-0 text-[#F2CE6B]" aria-hidden />
                        <div className="min-w-0 flex-1 break-words text-sm">
                          <strong className="block">Pedido #{pedido.numero}</strong>
                          <span className="text-muted-foreground">{pedido.cliente_nome}{pedido.bairro ? " · " + pedido.bairro : ""}</span>
                        </div>
                        <StatusBadge status={pedido.status} />
                      </li>
                    ))}
                  </ol>
                  {rotaNoMapa.saiu_em ? <p className="mt-3 text-sm text-muted-foreground">Saiu às {hora(rotaNoMapa.saiu_em)}</p> : null}
                  {MOTOBOY_RPC_ATIVO && rotaNoMapa.status === "preparando" && (
                    <p className="mt-3 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-300">
                      {rotaNoMapa.liberada_central_em
                        ? "Liberação registrada às " + hora(rotaNoMapa.liberada_central_em) + ". O servidor revalida os pedidos antes da saída."
                        : "Confira os pedidos antes de enviar a rota. A saída exige a confirmação da retirada."}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-4 rounded-xl border border-[#D4A94A]/30 bg-[#141310] p-4 text-sm text-muted-foreground">Nenhuma rota para o filtro atual. Monte uma rota ou selecione um cartão quando houver rotas disponíveis.</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-[#D4A94A]/60 text-[#F2CE6B]" onClick={() => abrirSecaoEntregas("secao-criar-rota")}>
                  <RouteIcon className="size-4" aria-hidden /> Montar rota
                </Button>
                <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-[#D4A94A]/60 text-[#F2CE6B]" onClick={() => abrirSecaoEntregas("secao-motoboys")}>
                  <User className="size-4" aria-hidden /> Selecionar motoboy
                </Button>
                <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal border-[#D4A94A]/60 text-[#F2CE6B]" disabled={!rotaNoMapa} onClick={() => abrirSecaoEntregas("secao-mapa")}>
                  <Navigation className="size-4" aria-hidden /> Ver rota
                </Button>
                <Button type="button" className="erp-btn-gold h-auto min-h-11 whitespace-normal"
                  disabled={!MOTOBOY_RPC_ATIVO || rotaNoMapa?.status !== "preparando" || Boolean(rotaNoMapa?.liberada_central_em) || rotaLiberando !== null}
                  onClick={() => { if (rotaNoMapa) void liberarRota(rotaNoMapa.id); }}>
                  <Send className="size-4" aria-hidden /> {rotaLiberando ? "Enviando rota…" : "Enviar rota"}
                </Button>
              </div>
              {rotaNoMapa?.status === "em_rota" && (
                <div className="mt-4 border-t border-[#D4A94A]/25 pt-3">
                  {rotaConfirmId === rotaNoMapa.id ? (
                    <>
                      <p className="mb-2 text-sm">Encerrar esta rota? Todos os pedidos foram entregues ou cancelados?</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" disabled={rotaEncerrandoId !== null} onClick={() => setRotaConfirmId(null)}>Cancelar</Button>
                        <Button size="sm" disabled={rotaEncerrandoId !== null} onClick={() => void encerrarRota(rotaNoMapa.id)}>
                          {rotaEncerrandoId ? "Encerrando…" : "Confirmar encerramento"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" disabled={!rotaPodeEncerrar || rotaEncerrandoId !== null} onClick={() => setRotaConfirmId(rotaNoMapa.id)}>Encerrar rota</Button>
                      {!rotaPodeEncerrar && <p className="mt-1 text-xs text-muted-foreground">Aguarde todos os pedidos serem entregues ou cancelados.</p>}
                    </>
                  )}
                </div>
              )}
            </section>
          }
        />

        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <section className={quadroEntregas} aria-labelledby="pedidos-aguardando">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="pedidos-aguardando" className={tituloQuadro}>Pedidos aguardando e reservados</h2>
              <span className="rounded-full border border-[#D4A94A]/40 px-3 py-1 text-xs">{pedidosParaRota.length} pedidos</span>
            </header>
            {pedidosParaRota.length ? (
              <ul className="space-y-2">
                {pedidosParaRota.map((pedido: any) => {
                  const prazo = limitePrometido(pedido);
                  const elegivel = aguardandoAtribuicaoCentral(pedido) && pedido.status === "pronto";
                  const marcado = pedidosRota.includes(pedido.id);
                  return (
                    <li key={pedido.id}>
                      <button type="button" aria-pressed={elegivel ? marcado : undefined}
                        className={linhaEntregas + " flex w-full items-start gap-3 p-3 text-left hover:border-[#D4A94A]/70 " + (marcado ? "ring-1 ring-[#F2CE6B]" : "")}
                        onClick={() => {
                          if (elegivel) setPedidosRota((atuais) => marcado ? atuais.filter((id) => id !== pedido.id) : [...atuais, pedido.id]);
                          else if (pedido.rota_id && rotasAtivas?.some((rota: any) => rota.id === pedido.rota_id)) {
                            setFiltroMotoboyRotas("");
                            setRotaSelecionada(pedido.rota_id);
                            abrirSecaoEntregas("secao-rota-selecionada");
                          } else verHistoricoPedido(pedido.id);
                        }}>
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#D4A94A]/40 bg-[#D4A94A]/10 text-[#F2CE6B]"><Package className="size-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1 break-words">
                          <strong className="block text-sm">#{pedido.numero} · {pedido.cliente_nome}</strong>
                          <span className="block text-xs text-muted-foreground">{[pedido.bairro, PAGAMENTO_LABEL[pedido.forma_pagamento] ?? pedido.forma_pagamento].filter(Boolean).join(" · ")}</span>
                          <span className="mt-2 flex flex-wrap gap-2">
                            {prazo && <span className="text-xs font-bold text-[#F2CE6B]">Cliente até {horaPrometida(prazo)}</span>}
                            {(pedido.atrasado || passouDoPrazo(pedido, agoraPrazo)) && <span className="rounded-full bg-red-950/60 px-2 text-xs font-bold text-red-300">Atrasado</span>}
                            {!elegivel && atribuidoCentral(pedido) && <span className="rounded-full bg-amber-950/50 px-2 text-xs text-amber-300">Reservado</span>}
                          </span>
                        </span>
                        {marcado ? <CheckCircle className="size-5 shrink-0 text-[#F2CE6B]" aria-label="Selecionado" /> : <StatusBadge status={pedido.status} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-[#D4A94A]/25 p-3 text-sm text-muted-foreground">Nenhum pedido aguardando ou reservado.</p>
            )}
          </section>

          <section id="secao-motoboys" className={quadroEntregas} aria-labelledby="titulo-motoboys">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="titulo-motoboys" className={tituloQuadro}>Motoboys</h2>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Filtrar
                <select value={filtroMotoboyRotas} onChange={(event) => setFiltroMotoboyRotas(event.target.value)}
                  className="min-h-10 max-w-[13rem] rounded-lg border border-[#D4A94A]/40 bg-[#17150F] px-2 text-foreground">
                  <option value="">Todos os motoboys</option>
                  {(motoboys ?? []).map((motoboy: any) => <option key={motoboy.id} value={motoboy.id}>{motoboy.nome}</option>)}
                </select>
              </label>
            </header>
            <ul className="space-y-2">
              {(motoboys ?? []).filter((m: any) => !filtroMotoboyRotas || m.id === filtroMotoboyRotas).map((m: any) => {
                const disponivel = m.status === "disponivel_base";
                const emRota = m.status === "em_rota";
                const quantidade = (rotasAtivas ?? []).filter((rota: any) => rota.motoboy_id === m.id)
                  .reduce((total: number, rota: any) => total + (rota.rota_pedidos?.length ?? 0), 0);
                return (
                  <li key={m.id}>
                    <button type="button" disabled={!disponivel} aria-pressed={motoboyRota === m.id}
                      onClick={() => setMotoboyRota(m.id)}
                      className={linhaEntregas + " flex w-full flex-wrap items-center gap-3 p-3 text-left disabled:cursor-default " + (motoboyRota === m.id ? "ring-1 ring-[#F2CE6B]" : "")}>
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#D4A94A]/15 text-[#F2CE6B]"><Bike className="size-5" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block break-words text-sm">{m.nome}</strong>
                        <span className="block text-xs text-muted-foreground">{quantidade}/3 entregas em rotas ativas</span>
                      </span>
                      <span className={disponivel ? "text-sm text-emerald-300" : emRota ? "text-sm text-sky-300" : "text-sm text-muted-foreground"}>
                        {disponivel ? "Disponível" : emRota ? "Em rota" : "Indisponível"}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!motoboys?.length && <li className="rounded-xl border border-[#D4A94A]/25 p-3 text-sm text-muted-foreground">Sem motoboys cadastrados.</li>}
            </ul>
          </section>
        </div>

        <section id="secao-rotas" className={quadroEntregas} aria-labelledby="titulo-cartoes-rotas">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-cartoes-rotas" className={tituloQuadro}>Cartões de rotas</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#D4A94A]/40 px-3 py-1 text-xs">{rotasVisiveis.length} rotas</span>
              <Button size="sm" variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] })}>Atualizar rotas</Button>
            </div>
          </header>
          {rotasErro ? (
            <p role="alert" className="text-sm text-destructive">Não foi possível carregar as rotas. Tente atualizar.</p>
          ) : rotasCarregando && !rotasAtivas ? (
            <p role="status" className="text-sm text-muted-foreground">Carregando rotas.</p>
          ) : !rotasVisiveis.length ? (
            <p className="rounded-xl border border-[#D4A94A]/25 p-3 text-sm text-muted-foreground">Nenhuma rota para o filtro atual.</p>
          ) : (
            <ul className="grid min-w-0 gap-3 md:grid-cols-3">
              {rotasVisiveis.map((rota: any) => {
                const selecionada = rotaNoMapa?.id === rota.id;
                const motoboy = (motoboys ?? []).find((m: any) => m.id === rota.motoboy_id);
                const numeros = (rota.rota_pedidos ?? []).map((v: any) => v.pedidos?.numero).filter((n: unknown) => n != null);
                return (
                  <li key={rota.id} className="min-w-0">
                    <button type="button" aria-pressed={selecionada} onClick={() => {
                      setRotaSelecionada(rota.id);
                      abrirSecaoEntregas("secao-rota-selecionada");
                    }} className={linhaEntregas + " h-full w-full p-4 text-left text-sm hover:border-[#D4A94A]/70 " + (selecionada ? "ring-1 ring-[#F2CE6B]" : "")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="uppercase text-[#F2CE6B]">{nomeRota(rota.id)}</strong>
                        <span className="rounded-full border border-[#D4A94A]/30 px-2 py-0.5 text-xs">{estadoRota(rota)}</span>
                      </div>
                      <p className="mt-2 break-words">{motoboy?.nome ?? "Motoboy não vinculado"}</p>
                      <p className="mt-2 break-words border-t border-[#D4A94A]/20 pt-2 text-xs text-muted-foreground">
                        {numeros.length ? numeros.map((numero: number) => "#" + numero).join(" · ") : "Sem pedidos vinculados"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>


        <details className={quadroEntregas}>
          <summary className={tituloQuadro + " cursor-pointer"}>Histórico de entregas e ocorrências</summary>
        {/* ========== HISTÓRICO (J3-C) ========== */}
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 id="secao-historico" className="font-display text-lg">
            Histórico de Entregas
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Timeline operacional por pedido ou motoboy (somente eventos registrados no banco).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <Label>Pedido</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={histPedidoId}
                onChange={(e) => setHistPedidoId(e.target.value)}
              >
                <option value="">Selecione um pedido</option>
                {(pedidos ?? []).slice(0, 200).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    Pedido Nº {p.numero} — {p.cliente_nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Motoboy</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={histMotoboyId}
                onChange={(e) => setHistMotoboyId(e.target.value)}
              >
                <option value="">Selecione um motoboy</option>
                {(motoboys ?? []).map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["central-j3c-historico"] });
                queryClient.invalidateQueries({ queryKey: ["central-j3c-atrasos"] });
              }}
              disabled={!histPedidoId && !histMotoboyId}
            >
              Atualizar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setHistPedidoId("");
                setHistMotoboyId("");
              }}
              disabled={!histPedidoId && !histMotoboyId}
            >
              Limpar
            </Button>
          </div>

          {!histPedidoId && !histMotoboyId ? (
            <p className="text-sm text-muted-foreground">
              Selecione um pedido ou motoboy para ver o histórico.
            </p>
          ) : histCarregando ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
            </p>
          ) : (histEventos ?? []).length === 0 && (histAtrasos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <div className="space-y-4">
              {histPedidoId &&
                (() => {
                  const p = (pedidos ?? []).find((x: any) => x.id === histPedidoId);
                  if (!p) return null;
                  const mb = (motoboys ?? []).find((x: any) => x.user_id === p.motoboy_id);
                  return (
                    <div className="rounded-lg border border-border p-3">
                      <p className="font-display text-base">Pedido Nº {p.numero}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.cliente_nome}
                        {mb ? ` • Motoboy: ${mb.nome}` : ""}
                        {p.rota_id ? ` • Rota: ${String(p.rota_id).slice(0, 8)}` : ""}
                      </p>
                    </div>
                  );
                })()}
              <div className="space-y-3">
                {(histEventos ?? []).map((ev: any) => {
                  const meta = HIST_EVENTO_META[ev.evento] ?? { titulo: ev.evento, Icon: Clock };
                  const Icon = meta.Icon;
                  const temLocal = ev.localizacao_lat != null && ev.localizacao_lng != null;
                  return (
                    <div key={ev.id} className="flex gap-3 rounded-lg border border-border p-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-4 w-4 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm">
                          <strong>{hora(ev.created_at)}</strong> — {meta.titulo}
                        </p>
                        {ev.detalhe && (
                          <p className="text-sm text-muted-foreground break-words">{ev.detalhe}</p>
                        )}
                        {ev.rota_id && (
                          <p className="text-xs text-muted-foreground">
                            Rota: {String(ev.rota_id).slice(0, 8)}
                          </p>
                        )}
                        {temLocal && (
                          <p className="text-xs text-muted-foreground">
                            Local: {ev.localizacao_lat}, {ev.localizacao_lng}
                            {" • "}
                            <a
                              className="underline"
                              target="_blank"
                              rel="noreferrer"
                              href={rotaGoogleMaps(`${ev.localizacao_lat},${ev.localizacao_lng}`)}
                            >
                              Ver localização
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(histAtrasos ?? []).length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-display text-sm uppercase text-muted-foreground">
                    Atrasos registrados
                  </h3>
                  {(histAtrasos ?? []).map((a: any) => (
                    <div key={a.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive" />{" "}
                        <strong>Motivo:</strong> {MOTIVO_ATRASO_LABEL[a.motivo] ?? a.motivo}
                      </p>
                      {a.descricao_outro && (
                        <p className="text-sm text-muted-foreground break-words">
                          Descrição: {a.descricao_outro}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Registrado em: {dataHora(a.criado_em)}
                        {a.resolvido_em ? ` • Resolvido em: ${dataHora(a.resolvido_em)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========== OCORRÊNCIAS / ATRASOS (J3-D) ========== */}
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 id="secao-ocorrencias" className="font-display text-lg">
            Ocorrências / Atrasos
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Visão operacional de <code>entrega_atrasos</code>. Atraso só existe com registro — sem
            regra automática de tempo ou GPS.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <Label>Status</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={ocFiltroStatus}
                onChange={(e) =>
                  setOcFiltroStatus(e.target.value as "todas" | "abertas" | "resolvidas")
                }
              >
                <option value="todas">Todas</option>
                <option value="abertas">Em aberto</option>
                <option value="resolvidas">Resolvidas</option>
              </select>
            </div>
            <div>
              <Label>Motivo</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={ocFiltroMotivo}
                onChange={(e) => setOcFiltroMotivo(e.target.value)}
              >
                <option value="">Todos</option>
                {(MOTIVO_ATRASO as readonly string[]).map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_ATRASO_LABEL[m] ?? m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["central-j3d-ocorrencias"] });
                  queryClient.invalidateQueries({ queryKey: ["central-j3c-atrasos"] });
                }}
              >
                Atualizar
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 mb-4">
            <h3 className="font-display text-sm uppercase text-muted-foreground mb-3">
              Registrar ocorrência
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <Label>Pedido</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={ocPedidoId}
                  onChange={(e) => setOcPedidoId(e.target.value)}
                >
                  <option value="">Selecione um pedido</option>
                  {(pedidos ?? []).slice(0, 200).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      Pedido Nº {p.numero} — {p.cliente_nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Motivo</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={ocMotivo}
                  onChange={(e) => setOcMotivo(e.target.value)}
                >
                  {(MOTIVO_ATRASO as readonly string[]).map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_ATRASO_LABEL[m] ?? m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <Label>Descrição{ocMotivo === "outro" ? " (obrigatória)" : " (opcional)"}</Label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={ocDesc}
                onChange={(e) => setOcDesc(e.target.value)}
                placeholder={ocMotivo === "outro" ? "Descreva o motivo" : "Detalhes da ocorrência"}
              />
            </div>
            <Button onClick={registrarOcorrencia} disabled={ocSalvando || !ocPedidoId}>
              {ocSalvando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                "Registrar ocorrência"
              )}
            </Button>
          </div>

          {ocCarregando ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando ocorrências…
            </p>
          ) : ocErro ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar as ocorrências: {(ocErro as Error).message}
            </p>
          ) : ocorrenciasFiltradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
          ) : (
            <div className="space-y-3">
              {ocorrenciasFiltradas.map((o: any) => {
                const p = (pedidos ?? []).find((x: any) => x.id === o.pedido_id);
                const mb = (motoboys ?? []).find(
                  (x: any) => x.user_id === (o.motoboy_id ?? p?.motoboy_id),
                );
                const aberta = !o.resolvido_em;
                return (
                  <div key={o.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <p className="font-display text-base">
                        Pedido {p ? `Nº ${p.numero}` : `#${String(o.pedido_id).slice(0, 8)}`}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${aberta ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-500"}`}
                      >
                        {aberta ? "🔴 Em aberto" : "🟢 Resolvido"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {p?.cliente_nome}
                      {mb ? ` • Motoboy: ${mb.nome}` : ""}
                    </p>
                    <p className="text-sm mt-1">
                      <strong>{MOTIVO_ATRASO_LABEL[o.motivo] ?? o.motivo}</strong>
                    </p>
                    {o.descricao_outro && (
                      <p className="text-sm text-muted-foreground break-words">
                        “{o.descricao_outro}”
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Registrado: {dataHora(o.criado_em)}
                      {o.resolvido_em ? ` • Resolvido: ${dataHora(o.resolvido_em)}` : ""}
                    </p>
                    {aberta && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => resolverOcorrencia(o.id)}
                        disabled={ocResolvendoId === o.id}
                      >
                        {ocResolvendoId === o.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resolvendo…
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" /> Marcar como resolvida
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        </details>

        <details className={quadroEntregas}>
          <summary className={tituloQuadro + " cursor-pointer"}>Ações e acompanhamento</summary>
        {/* ========== ATRIBUIÇÃO DE MOTOBOY ========== */}
        {(pedidosFiltrados ?? []).filter(aguardandoAtribuicaoCentral).length >
          0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-6">
            <h2 id="secao-atribuicao" className="font-display text-lg mb-4">
              Atribuir Motoboy
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              Selecionar motoboy para pedido(s) em aguardando_motoboy
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <Label>Motoboy</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  onChange={(e) => setMotoboySelecionado(e.target.value)}
                >
                  <option value="">Selecione um motoboy</option>
                  {motoboysElegiveis?.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} — {m.status}
                      {m.veiculo && ` • ${m.veiculo}`}
                      {m.placa && ` • ${m.placa}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Pedidos</Label>
                <select
                  multiple
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  onChange={(e) =>
                    setPedidosSelecionados(
                      Array.from(e.target.selectedOptions).map((o: any) => o.value),
                    )
                  }
                >
                  <option value="">Nenhum pedido</option>
                  {(pedidosFiltrados ?? [])
                    .filter(aguardandoAtribuicaoCentral)
                    .slice(0, 10)
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>
                        Pedido Nº {p.numero} — {p.cliente_nome}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <Button
              disabled={atribuindoSelecao}
              onClick={async () => {
                const mbId = motoboySelecionado as string;
                const pedidosIds = pedidosSelecionados as string[];
                if (!mbId || !pedidosIds.length) {
                  toast.error("Selecione motoboy e pelo menos um pedido.");
                  return;
                }
                setAtribuindoSelecao(true);
                try {
                  const resultado = await atribuirPedidosEmLote(pedidosIds, (pid) =>
                    atribuirMotoboy(pid, mbId),
                  );
                  setMotoboySelecionado(resultado.falhas.length > 0 ? mbId : "");
                  setPedidosSelecionados(resultado.falhas);
                  if (resultado.falhas.length > 0) {
                    toast.warning(
                      `${resultado.atribuidos.length} de ${resultado.solicitados} pedidos atribuídos. Revise os demais antes de tentar novamente.`,
                    );
                  } else {
                    toast.success(
                      `${resultado.atribuidos.length} pedido(s) atribuídos ao motoboy.`,
                    );
                  }
                } finally {
                  setAtribuindoSelecao(false);
                }
              }}
            >
              {atribuindoSelecao ? "Atribuindo…" : "Confirmar Atribuição"}
            </Button>
          </div>
        )}

        {/* ========== CRIAR ROTA ========== */}
        <div className="mt-4 rounded-xl border border-border bg-card p-6">
          <h2 id="secao-criar-rota" className="font-display text-lg mb-4">Criar Nova Rota</h2>
          <p className="text-sm text-muted-foreground">
            Selecionar motoboy e pedidos para criar uma rota de entrega.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label>Motoboy</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={motoboyRota}
                onChange={(e) => setMotoboyRota(e.target.value)}
              >
                <option value="">Selecione um motoboy</option>
                {motoboysElegiveis?.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} — {m.status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Pedidos</Label>
              <select
                multiple
                value={pedidosRota}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={(e) =>
                  setPedidosRota(Array.from(e.target.selectedOptions, (o) => o.value).filter(Boolean))
                }
              >
                <option value="">Nenhum pedido</option>
                {(pedidosFiltrados ?? [])
                  .filter((pedido: any) => aguardandoAtribuicaoCentral(pedido) && pedido.status === "pronto")
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      Pedido Nº {p.numero} — {p.cliente_nome}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <Button
            onClick={() => {
              const mbId = motoboyRota as string;
              const pedidosIds = pedidosRota as string[];
              if (!mbId || !pedidosIds.length) {
                toast.error("Selecione motoboy e pelo menos um pedido.");
                return;
              }
              void criarRota(pedidosIds, mbId);
            }}
            disabled={criandoRota}
          >
            {criandoRota ? "Criando rota…" : "Criar Rota"}
          </Button>
        </div>

        {/* ========== PEDIDOS EM ROTA ========== */}
        <section
          className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-card"
          aria-label="Pedidos em rota"
        >
          <header className="flex min-h-[42px] items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pedidos em Rota
            </h2>
            <span className="text-xs uppercase text-muted-foreground">
              Clique para ver histórico/rastreio
            </span>
          </header>
          <div className="p-2">
            {resumoCentral.emAndamento.length > 0 ? (
              <ul className="divide-y divide-[#EEF1F5]">
                <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1 text-xs text-muted-foreground sm:grid-cols-[64px_1fr_1fr_96px_110px_72px_64px_24px]">
                  <span>Nº</span>
                  <span>Cliente</span>
                  <span className="hidden sm:block">Endereço</span>
                  <span>Motoboy</span>
                  <span>Status</span>
                  <span className="hidden sm:block">KM</span>
                  <span className="hidden sm:block">Saída</span>
                  <span />
                </li>
                {resumoCentral.emAndamento.map((p: any) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => verHistoricoPedido(p.id)}
                      className="grid min-h-[44px] w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted sm:grid-cols-[64px_1fr_1fr_96px_110px_72px_64px_24px] sm:text-[13px]"
                    >
                      <span className="font-bold text-[#A9813A]">#{p.numero}</span>
                      <span className="truncate">{p.cliente_nome}</span>
                      <span className="hidden truncate text-muted-foreground sm:block">
                        {p.endereco ?? "—"}
                      </span>
                      <span className="truncate">
                        {resumoCentral.porMotoboy.get(String(p.motoboy_id ?? "")) ?? "—"}
                      </span>
                      <span>
                        <StatusBadge status={p.status} />
                      </span>
                      <span className="hidden text-xs font-semibold sm:block">
                        {p.distancia_km != null
                          ? `${Number(p.distancia_km).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`
                          : "—"}
                      </span>
                      <span className="hidden text-muted-foreground sm:block">
                        {p.saiu_em ? hora(p.saiu_em) : "—"}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-2">
                <EmptyState titulo="Nenhuma entrega em rota" />
              </div>
            )}
          </div>
        </section>

        {/* ========== RESUMO OPERACIONAL (J3-E) ========== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("secao-atribuicao")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="min-h-[44px] rounded-xl border border-border bg-card p-3 text-left cursor-pointer shadow-[var(--shadow-card)]"
          >
            <p className="text-xs text-muted-foreground">Aguardando motoboy</p>
            <p className="font-display text-xl text-primary">{contadores.aguardando}</p>
          </button>
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("secao-mapa")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="min-h-[44px] rounded-xl border border-border bg-card p-3 text-left cursor-pointer shadow-[var(--shadow-card)]"
          >
            <p className="text-xs text-muted-foreground">Em rota</p>
            <p className="font-display text-xl text-primary">{contadores.em_rota}</p>
          </button>
          <button
            type="button"
            onClick={() =>
              abrirSecaoEntregas("secao-ocorrencias")
            }
            className="min-h-[44px] rounded-xl border border-border bg-card p-3 text-left cursor-pointer shadow-[var(--shadow-card)]"
          >
            <p className="text-xs text-muted-foreground">Ocorrências em aberto</p>
            <p className="font-display text-xl text-primary">
              {(ocorrencias ?? []).filter((o: any) => !o.resolvido_em).length}
            </p>
          </button>
          <button
            type="button"
            onClick={() =>
              abrirSecaoEntregas("secao-historico")
            }
            className="min-h-[44px] rounded-xl border border-border bg-card p-3 text-left cursor-pointer shadow-[var(--shadow-card)]"
          >
            <p className="text-xs text-muted-foreground">Entregues</p>
            <p className="font-display text-xl text-primary">{contadores.entregue}</p>
          </button>
        </div>

        {/* ========== FILTROS ========== */}
        <div className="mb-4">
          <Tabs value={filtro} onValueChange={handleFiltroChange} className="w-full">
            <TabsList className="flex flex-wrap gap-2">
              <TabsTrigger value="todos" className="px-4 py-2 text-sm border rounded-md">
                Todos {pedidos?.length ? `(${pedidos.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="hoje" className="px-4 py-2 text-sm border rounded-md">
                Hoje {pedidos?.length ? "" : ""}
              </TabsTrigger>
              <TabsTrigger value="em_rota" className="px-4 py-2 text-sm border rounded-md">
                Em rota
              </TabsTrigger>
              <TabsTrigger value="aguardando" className="px-4 py-2 text-sm border rounded-md">
                Aguardando motoboy
              </TabsTrigger>
              <TabsTrigger value="entregues" className="px-4 py-2 text-sm border rounded-md">
                Entregues
              </TabsTrigger>
              <TabsTrigger value="retirada" className="px-4 py-2 text-sm border rounded-md">
                Retirada
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Busca rápida (J3-H H4): número ou cliente, sobre os pedidos já carregados. */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={buscaPedido}
              onChange={(e) => setBuscaPedido(e.target.value)}
              placeholder="Buscar por número ou cliente…"
              className="w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm"
            />
            {buscaPedido && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setBuscaPedido("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ========== INDICADORES ========== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Aguardando</p>
            <p className="font-display text-xl text-primary">{contadores.aguardando}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Atribuídos</p>
            <p className="font-display text-xl text-primary">{contadores.atribuidos}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Em rota</p>
            <p className="font-display text-xl text-primary">{contadores.em_rota}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Entregues</p>
            <p className="font-display text-xl text-primary">{contadores.entregue}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-display text-xl text-primary">{contadores.total}</p>
          </div>
        </div>

        {/* ========== KANBAN ========== */}
        <h2 className="font-display text-lg">Kanban de Pedidos</h2>
        <div className="flex items-start gap-4 overflow-x-auto pb-2">
          {/* Coluna AGUARDANDO */}
          <div className="w-80 shrink-0 rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm uppercase text-muted-foreground mb-2">
              AGUARDANDO MOTOBOY
            </h3>
            <p className="text-xs text-muted-foreground">Pedidos prontos aguardando atribuição</p>
            <div className="h-64 overflow-y-auto space-y-2">
              {(pedidosVisiveis ?? [])
                .filter(aguardandoAtribuicaoCentral)
                .map((p: any) => (
                  <PedidoCard key={p.id} pedido={p} />
                ))}
              {(pedidosVisiveis ?? []).filter(aguardandoAtribuicaoCentral)
                .length === 0 && (
                <p className="text-sm text-muted-foreground hover:cursor-pointer select-none">
                  Nenhum pedido aguardando
                </p>
              )}
            </div>
          </div>

          {/* Coluna ATRIBUÍDOS */}
          <div className="w-80 shrink-0 rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm uppercase text-muted-foreground mb-2">
              ATRIBUÍDOS
            </h3>
            <p className="text-xs text-muted-foreground">Pedidos com motoboy atribuído</p>
            <div className="h-64 overflow-y-auto space-y-2">
              {(pedidosVisiveis ?? [])
                .filter(atribuidoCentral)
                .map((p: any) => (
                  <PedidoCard key={p.id} pedido={p} />
                ))}
              {(pedidosVisiveis ?? []).filter(atribuidoCentral).length === 0 && (
                <p className="text-sm text-muted-foreground hover:cursor-pointer select-none">
                  Nenhum pedido atribuído
                </p>
              )}
            </div>
          </div>

          {/* Coluna EM ROTA */}
          <div className="w-80 shrink-0 rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm uppercase text-muted-foreground mb-2">EM ROTA</h3>
            <p className="text-xs text-muted-foreground">Pedidos com motoboy em deslocamento</p>
            <div className="h-64 overflow-y-auto space-y-2">
              {(pedidosVisiveis ?? [])
                .filter((p: any) => p.status === "em_rota")
                .map((p: any) => (
                  <PedidoCard key={p.id} pedido={p} />
                ))}
              {(pedidosVisiveis ?? []).filter((p: any) => p.status === "em_rota").length === 0 && (
                <p className="text-sm text-muted-foreground hover:cursor-pointer select-none">
                  Nenhum pedido em rota
                </p>
              )}
            </div>
          </div>

          {/* Coluna ENTREGUES */}
          <div className="w-80 shrink-0 rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-sm uppercase text-muted-foreground mb-2">ENTREGUES</h3>
            <p className="text-xs text-muted-foreground">Pedidos finalizados</p>
            <div className="h-64 overflow-y-auto space-y-2">
              {(pedidosVisiveis ?? [])
                .filter((p: any) => p.status === "entregue")
                .map((p: any) => (
                  <PedidoCard key={p.id} pedido={p} />
                ))}
              {(pedidosVisiveis ?? []).filter((p: any) => p.status === "entregue").length === 0 && (
                <p className="text-sm text-muted-foreground hover:cursor-pointer select-none">
                  Nenhum pedido entregue
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ========== ACOMPANHAMENTO EM ROTA (J3-F) ========== */}
        <div className="mt-6">
          <h2 id="secao-acompanhamento" className="font-display text-lg">
            Acompanhamento em Rota
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Somente leitura. Tempo em rota não significa atraso.
          </p>
          {!pedidos ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando entregas…
            </p>
          ) : acompanhamento.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido em rota no momento.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {acompanhamento.map(({ p, inicio }: any) => {
                const mb = (motoboys ?? []).find((x: any) => x.user_id === p.motoboy_id);
                const destino = `${p.endereco ?? ""}${p.complemento ? `, ${p.complemento}` : ""}${p.bairro ? `, ${p.bairro}` : ""}`;
                const ocAbertas = (ocorrencias ?? []).filter(
                  (o: any) => o.pedido_id === p.id && !o.resolvido_em,
                );
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-display text-lg">Pedido Nº {p.numero}</span>
                      <StatusBadge status={p.status} />
                      {ocAbertas.length > 0 && (
                        <span
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                          title={ocAbertas
                            .map((o: any) => MOTIVO_ATRASO_LABEL[o.motivo] ?? o.motivo)
                            .join("; ")}
                        >
                          ⚠ Ocorrência aberta{ocAbertas.length > 1 ? ` (${ocAbertas.length})` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">
                      <strong>Motoboy:</strong> {mb?.nome ?? "—"}
                      {mb?.status ? ` • ${mb.status}` : ""}
                    </p>
                    <p className="text-sm mt-1">
                      <strong>Em rota há:</strong>{" "}
                      {inicio
                        ? ` ${formatoDuracao(Date.now() - new Date(inicio).getTime())}`
                        : " —"}
                      {inicio && (
                        <span className="text-muted-foreground"> • saiu às {hora(inicio)}</span>
                      )}
                      {!inicio && (
                        <span className="text-muted-foreground"> • saída não registrada</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 break-words">
                      Destino: {destino || "—"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {p.rota_id && (
                        <span className="text-xs text-muted-foreground">
                          Rota: {String(p.rota_id).slice(0, 8)}
                        </span>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={rotaGoogleMaps(destino || `Pedido ${p.numero}`)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="mr-1 size-4" /> Navegar
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          document
                            .getElementById("secao-mapa")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        Ver no mapa
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {rotasSaidaErro && (
            <p className="text-xs text-muted-foreground mt-2">
              Horários de saída das rotas indisponíveis no momento.
            </p>
          )}
        </div>
        </details>
      </div>
    </>
  );
}
