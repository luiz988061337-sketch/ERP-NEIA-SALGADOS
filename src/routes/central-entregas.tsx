import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-steps";
import { StatusCard, EmptyState } from "@/components/admin/ui-admin";
import fritos from "@/assets/cat-fritos.jpg";
import { MapView, rotaGoogleMaps } from "@/components/map-view";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { brl, dataHora, hora, PAGAMENTO_LABEL } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
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

export const Route = createFileRoute("/central-entregas")({
  head: () => ({
    meta: [
      { title: "Central de Entregas — NÉIA SALGADOS" },
      { name: "description", content: "Painel administrativo de entregas e motoboys" },
    ],
  }),
  component: CentralEntregas,
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
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<
    "todos" | "hoje" | "em_rota" | "aguardando" | "entregues" | "retirada"
  >("todos");
  const [aba, setAba] = useState("k");
  const [motoboySelecionado, setMotoboySelecionado] = useState("");
  const [pedidosSelecionados, setPedidosSelecionados] = useState<string[]>([]);
  const [atribuindoSelecao, setAtribuindoSelecao] = useState(false);
  const [motoboyRota, setMotoboyRota] = useState("");
  const [pedidosRota, setPedidosRota] = useState<string[]>([]);
  // ---------- HISTÓRICO (J3-C): consulta sob demanda, sem subscription nova ----------
  const [histPedidoId, setHistPedidoId] = useState("");
  const [histMotoboyId, setHistMotoboyId] = useState("");
  // ---------- J3-H: busca + encerramento de rotas (somente leitura/escrita autorizada) ----------
  const [buscaPedido, setBuscaPedido] = useState("");
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

  // ---------- QUERIES ----------
  const { data: pedidos } = useQuery({
    queryKey: ["central-j2-pedidos", filtro],
    enabled: !!autorizado && !loading,
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
          query = query.eq("status", "aguardando_motoboy");
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
      return data ?? [];
    },
  });

  const { data: motoboys } = useQuery({
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
        "id,motoboy_id,status,saiu_em,rota_pedidos(pedido_id,pedidos(id,numero,status,cliente_nome))",
      )
      .eq("status", "em_rota")
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
      const { error } = await supabase
        .from("rotas_entrega")
        .update({ status: "concluida", chegou_em: new Date().toISOString() })
        .eq("id", rotaId);
      if (error) throw error;
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
          return p.status === "aguardando_motoboy";
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
      aguardando: pedidos.filter((p: any) => p.status === "aguardando_motoboy").length,
      atribuidos: pedidos.filter(
        (p: any) =>
          p.motoboy_id &&
          p.status !== "aguardando_motoboy" &&
          p.status !== "entregue" &&
          p.status !== "em_rota",
      ).length,
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
    const aguardando = lista.filter((p: any) => p.status === "aguardando_motoboy");
    const entreguesHoje = lista.filter(
      (p: any) => p.status === "entregue" && new Date(p.created_at).toDateString() === hoje,
    );
    const porMotoboy = new Map<string, string>();
    for (const m of motoboys ?? []) if (m.user_id) porMotoboy.set(String(m.user_id), m.nome ?? "?");
    const emAndamento = [...emRota]
      .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 8);
    const motos = (motoboys ?? []).map((m: any) => ({
      nome: m.nome ?? "?",
      status: m.status ?? "offline",
      entregas: lista.filter(
        (p: any) =>
          p.motoboy_id && String(p.motoboy_id) === String(m.user_id) && p.status !== "cancelado",
      ).length,
    }));
    const motosEmRota = (motoboys ?? []).filter((m: any) => m.status === "em_rota").length;
    return { emRota, aguardando, entreguesHoje, emAndamento, porMotoboy, motos, motosEmRota };
  }, [pedidos, motoboys]);

  function verHistoricoPedido(id: string) {
    setHistPedidoId(id);
    document
      .getElementById("secao-historico")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (!motoboyId) {
      toast.error("Selecione um motoboy antes de criar a rota.");
      return;
    }
    if (pedidosSelecionados.length === 0) {
      toast.error("Selecione pelo menos um pedido.");
      return;
    }

    // Validar que pedidos estão elegíveis (aguardando_motoboy ou sem status bloqueado)
    const invalidos = pedidosSelecionados.filter((pid: string) => {
      const p = (pedidos ?? []).find((x: any) => x.id === pid);
      if (!p) return true;
      if (p.status === "entregue" || p.status === "cancelado") return true;
      // Verificar se já tem rota
      if (p.rota_id) return true;
      return false;
    });
    if (invalidos.length > 0) {
      toast.error(`Não é possível criar rota: ${invalidos.length} pedido(ns) inválido(s).`);
      return;
    }

    // Regra operacional: 3 paradas por rota. A 4ª+ exigiria autorização
    // explícita auditável, que ainda NÃO existe no fluxo local. Bloqueia antes
    // de criar a rota (evita rota órfã por limite de negócio).
    if (!cabeNaRota(pedidosSelecionados.length, false)) {
      toast.error("Cada rota aceita no máximo 3 paradas. Divida em mais de uma rota.");
      return;
    }

    try {
      // 1. Criar rota_entrega
      const { data: rota, error: e1 } = await supabase
        .from("rotas_entrega")
        .insert({
          motoboy_id: motoboyId,
          status: "em_rota",
          saiu_em: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (e1 || !rota) throw e1 ?? new Error("Erro ao criar rota");
      const rotaId = rota.id;

      // 2. Inserir rota_pedidos
      const rotaPedidos = pedidosSelecionados.map((pid: string, index: number) => ({
        rota_id: rotaId,
        pedido_id: pid,
        ordem: index + 1,
      }));
      const { error: e2 } = await supabase.from("rota_pedidos").insert(rotaPedidos);
      if (e2) throw e2;

      // 3. Atualizar pedidos com rota_id
      const { error: e3 } = await supabase
        .from("pedidos")
        .update({ rota_id: rotaId })
        .in("id", pedidosSelecionados);
      if (e3) throw e3;

      toast.success(
        `Rota criada com ${pedidosSelecionados.length} pedidos para motoboy ${motoboyId}`,
      );
      queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar rota");
    }
  }

  // Alternar filtro
  const handleFiltroChange = (novoFiltro: string) => {
    setFiltro(novoFiltro as "todos" | "hoje" | "em_rota" | "aguardando" | "entregues" | "retirada");
    queryClient.invalidateQueries({ queryKey: ["central-j2-pedidos", filtro] });
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
    const pts: { lat: number; lng: number; label: string; color: string }[] = [];
    for (const p of pedidosFiltrados ?? []) {
      if (p.destino_lat != null && p.destino_lng != null) {
        pts.push({
          lat: p.destino_lat,
          lng: p.destino_lng,
          label: `Pedido ${p.numero}`,
          color: "primary",
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
          color: "success",
        });
      }
    }
    return pts;
  }, [pedidosFiltrados, motoboys, pedidos]);

  if (!autorizado) {
    return (
      <p className="p-10 text-center text-muted-foreground">Acesso restrito ao administrador.</p>
    );
  }

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Equipe"
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="relative mb-4 min-h-36 overflow-hidden rounded-xl shadow-[var(--shadow-card)]">
          <img
            src={fritos}
            alt="Central de Entregas"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent" />
          <div className="relative flex items-center gap-3 p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#D9B25E] to-[#C49A43] text-[#202B3A]">
              <Truck className="size-7" aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                Central de Entregas
              </h1>
              <p className="text-sm text-white/80">
                Acompanhe os motoboys e o status das entregas.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatusCard
            className="bg-yellow-100 text-yellow-900"
            icone={Truck}
            titulo="Em Rota"
            valor={resumoCentral.emRota.length}
            detalhe="pedidos"
          />
          <StatusCard
            className="bg-blue-600 text-white"
            icone={Clock}
            titulo="Aguardando Motoboy"
            valor={resumoCentral.aguardando.length}
            detalhe="pedidos"
          />
          <StatusCard
            className="bg-green-500 text-white"
            icone={CheckCircle}
            titulo="Entregues Hoje"
            valor={resumoCentral.entreguesHoje.length}
            detalhe="pedidos"
          />
          <StatusCard
            className="bg-purple-500 text-white"
            icone={Navigation}
            titulo="Motoboys em Rota"
            valor={resumoCentral.motosEmRota}
            detalhe="motoboys"
          />
        </div>

        {/* ========== MAPA DOMINANTE + PAINEL MOTOBOYS (reforma estrutural) ========== */}
        <div className="mb-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
          <section
            id="secao-mapa"
            className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-card"
            aria-label="Mapa de entregas em tempo real"
          >
            <header className="flex min-h-[42px] flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
                Mapa de Entregas
              </h2>
              <span className="text-[10px] uppercase text-muted-foreground">
                Pedidos e motoboys em tempo real
              </span>
            </header>
            <div className="h-[420px] p-2 lg:h-[560px]">
              {pontosMapa.length > 0 ? (
                <MapView pontos={pontosMapa as any} />
              ) : (
                <p className="grid h-full place-items-center text-sm text-muted-foreground">
                  Nenhum ponto no mapa ainda — aguardando pedidos com localização confirmada.
                </p>
              )}
            </div>
          </section>

          <div className="space-y-3">
            <section
              className="rounded-xl border border-[#E5E7EB] bg-white shadow-card"
              aria-label="Motoboys"
            >
              <header className="flex min-h-[42px] items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
                  Motoboys
                </h2>
                <span className="rounded-full bg-[rgba(15,23,42,.06)] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
                  {(resumoCentral.motos ?? []).length}
                </span>
              </header>
              <ul className="space-y-2 p-3">
                {(resumoCentral.motos ?? []).map((m: any) => {
                  const st = String(m.status ?? "").toLowerCase();
                  const corDot =
                    st.includes("rota") || st.includes("em rota")
                      ? "#2563EB"
                      : st.includes("dispon")
                        ? "#21835D"
                        : "#64748B";
                  return (
                    <li
                      key={m.nome}
                      className="flex items-center gap-2.5 rounded-lg bg-[#F8F9FA] px-2.5 py-2"
                    >
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-[#202B3A]"
                        style={{ backgroundColor: corDot }}
                        aria-hidden
                      >
                        {(m.nome ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-sm font-semibold">{m.nome}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span
                            className="inline-block size-1.5 rounded-full"
                            style={{ backgroundColor: corDot }}
                            aria-hidden
                          />
                          {m.status} • {m.entregas} entrega(s)
                        </p>
                      </div>
                    </li>
                  );
                })}
                {(resumoCentral.motos ?? []).length === 0 && (
                  <li className="text-xs text-muted-foreground">Sem motoboys cadastrados.</li>
                )}
              </ul>
            </section>

            <section
              className="rounded-xl border border-[#E5E7EB] bg-white shadow-card"
              aria-label="Resumo do dia"
            >
              <header className="flex min-h-[42px] items-center border-b border-[#E5E7EB] px-3 py-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
                  Resumo do Dia
                </h2>
              </header>
              <ul className="space-y-1 p-3 text-xs">
                <li className="flex justify-between rounded bg-[#F8F9FA] px-2.5 py-1.5">
                  <span className="text-muted-foreground">Entregas realizadas</span>
                  <b className="text-[#21835D]">{resumoCentral.entreguesHoje.length}</b>
                </li>
                <li className="flex justify-between rounded bg-[#F8F9FA] px-2.5 py-1.5">
                  <span className="text-muted-foreground">Em rota</span>
                  <b className="text-[#2563EB]">{resumoCentral.emRota.length}</b>
                </li>
                <li className="flex justify-between rounded bg-[#F8F9FA] px-2.5 py-1.5">
                  <span className="text-muted-foreground">Aguardando</span>
                  <b className="text-[#B45309]">{resumoCentral.aguardando.length}</b>
                </li>
              </ul>
            </section>
          </div>
        </div>

        {/* ========== PEDIDOS EM ROTA ========== */}
        <section
          className="mb-4 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-card"
          aria-label="Pedidos em rota"
        >
          <header className="flex min-h-[42px] items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">
              Pedidos em Rota
            </h2>
            <span className="text-[10px] uppercase text-muted-foreground">
              Clique para ver histórico/rastreio
            </span>
          </header>
          <div className="p-2">
            {resumoCentral.emAndamento.length > 0 ? (
              <ul className="divide-y divide-[#EEF1F5]">
                <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground sm:grid-cols-[64px_1fr_1fr_96px_110px_72px_64px_24px]">
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
                      className="grid min-h-[44px] w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[#F8F9FA] sm:grid-cols-[64px_1fr_1fr_96px_110px_72px_64px_24px] sm:text-[13px]"
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
                      <span className="hidden text-[11px] font-semibold sm:block">
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
              document
                .getElementById("secao-ocorrencias")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
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
              document
                .getElementById("secao-historico")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
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
                .filter((p: any) => p.status === "aguardando_motoboy")
                .map((p: any) => (
                  <PedidoCard key={p.id} pedido={p} />
                ))}
              {(pedidosVisiveis ?? []).filter((p: any) => p.status === "aguardando_motoboy")
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
                .filter(
                  (p: any) =>
                    p.motoboy_id &&
                    p.status !== "aguardando_motoboy" &&
                    p.status !== "entregue" &&
                    p.status !== "em_rota",
                )
                .map((p: any) => (
                  <PedidoCard key={p.id} pedido={p} />
                ))}
              {(pedidosVisiveis ?? []).filter(
                (p: any) =>
                  p.motoboy_id &&
                  p.status !== "aguardando_motoboy" &&
                  p.status !== "entregue" &&
                  p.status !== "em_rota",
              ).length === 0 && (
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

        {/* ========== ATRIBUIÇÃO DE MOTOBOY ========== */}
        {(pedidosFiltrados ?? []).filter((p: any) => p.status === "aguardando_motoboy").length >
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
                    .filter((p: any) => p.status === "aguardando_motoboy")
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
          <h2 className="font-display text-lg mb-4">Criar Nova Rota</h2>
          <p className="text-sm text-muted-foreground">
            Selecionar motoboy e pedidos para criar uma rota de entrega.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label>Motoboy</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={(e) =>
                  setPedidosRota(Array.from(e.target.selectedOptions).map((o: any) => o.value))
                }
              >
                <option value="">Nenhum pedido</option>
                {(pedidosFiltrados ?? [])
                  .filter((p: any) => p.status === "aguardando_motoboy")
                  .slice(0, 15)
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
              criarRota(pedidosIds, mbId);
              setMotoboyRota("");
              setPedidosRota([]);
            }}
          >
            Criar Rota
          </Button>
        </div>

        {/* ========== ROTAS EM ANDAMENTO (J3-H H1) ========== */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 id="secao-rotas" className="font-display text-lg">
              Rotas em andamento
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["central-j3h-rotas"] })}
            >
              Atualizar
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Somente rotas <code>em_rota</code>. Encerrar exige todos os pedidos entregues ou
            cancelados.
          </p>
          {rotasCarregando && !(rotasAtivas ?? []).length ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando rotas…
            </p>
          ) : rotasErro ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar as rotas: {(rotasErro as Error).message}
            </p>
          ) : (rotasAtivas ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rota em andamento.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(rotasAtivas ?? []).map((r: any) => {
                const vinculados = (r.rota_pedidos ?? [])
                  .map((rp: any) => rp.pedidos)
                  .filter(Boolean);
                const pendentes = vinculados.filter(
                  (p: any) => p.status !== "entregue" && p.status !== "cancelado",
                );
                const concluidos = vinculados.length - pendentes.length;
                const mb = (motoboys ?? []).find((x: any) => x.user_id === r.motoboy_id);
                const podeEncerrar = vinculados.length > 0 && pendentes.length === 0;
                const confirmando = rotaConfirmId === r.id;
                const processando = rotaEncerrandoId === r.id;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="font-display text-base">Rota {String(r.id).slice(0, 8)}</p>
                    <p className="text-sm text-muted-foreground">
                      Motoboy: {mb?.nome ?? "—"}
                      {r.saiu_em ? ` • saiu às ${hora(r.saiu_em)}` : ""}
                    </p>
                    <p className="text-sm mt-1">
                      {vinculados.length === 0
                        ? "Sem pedidos vinculados."
                        : `${concluidos} de ${vinculados.length} pedido(s) finalizados`}
                      {pendentes.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          • pendentes: {pendentes.map((p: any) => `Nº ${p.numero}`).join(", ")}
                        </span>
                      )}
                    </p>
                    {!confirmando ? (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!podeEncerrar || processando}
                          onClick={() => setRotaConfirmId(r.id)}
                        >
                          Encerrar rota
                        </Button>
                        {!podeEncerrar && vinculados.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Aguarde todos os pedidos serem entregues ou cancelados.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-border p-3">
                        <p className="text-sm">
                          <strong>Encerrar esta rota?</strong> Todos os pedidos foram entregues ou
                          cancelados?
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={processando}
                            onClick={() => setRotaConfirmId(null)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={processando}
                            onClick={() => encerrarRota(r.id)}
                          >
                            {processando ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encerrando…
                              </>
                            ) : (
                              "Encerrar rota"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========== MAPA — movido para o topo (elemento dominante) ========== */}

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
      </div>
    </>
  );
}
