import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Navigation, Phone, MessageCircle, Banknote, Package, History, Truck, Satellite, WifiOff, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-steps";
import { MapView, rotaGoogleMaps } from "@/components/map-view";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { ehModoDemo } from "@/lib/demo-preview";
import { PageHeader } from "@/components/admin/ui-admin";
import { PainelMotoboyRpc } from "@/components/admin/painel-motoboy-rpc";
import { MotoboysPremium } from "@/components/admin/motoboys-premium";
import { mensagemPortaria, MOTIVO_ATRASO, MOTIVO_ATRASO_LABEL, ordenarRota } from "@/lib/entrega";
import { cabeNaRota } from "@/lib/central-atribuicao";
import { notificarPedido } from "@/lib/notificacoes";
import { brl, dataHora, hora, mensagemStatus, PAGAMENTO_LABEL, whatsappLink } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import { useGpsTracking, GpsStatus, UseGpsTrackingReturn } from "@/hooks/useGpsTracking";

// E9.1: trava de clique repetido no aceite (0 rows = conflito visível).
const aceitandoEmVoo = new Set<string>();

export const Route = createFileRoute("/motoboy")({
  head: () => ({
    meta: [
      { title: "Painel do motoboy — Néia Salgados" },
      { name: "description", content: "Aceite, inicie e finalize entregas e acompanhe seus ganhos." },
    ],
  }),
  component: PainelMotoboy,
});

function PainelMotoboy() {
  const modoDemo = ehModoDemo();
  if (modoDemo) {
    // Lote 02/03: painel de motoboys em demonstração usa o kit premium com
    // dados fictícios; o fluxo operacional real permanece no caminho não-demo.
    return <MotoboysPremium />;
  }
  return <PainelMotoboyRpc />;
}

function inicioSemana(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - c.getDay());
  return c;
}
function inicioMes(d: Date) {
  const c = new Date(d);
  c.setDate(1);
  c.setHours(0, 0, 0, 0);
  return c;
}

function Motoboy() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [retornando, setRetornando] = useState(false);
  const [aba, setAba] = useState("disponiveis");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/motoboy" }, replace: true });
  }, [loading, user, navigate]);

  const autorizado = roles?.includes("motoboy") || roles?.includes("admin");

  const { data: disponiveis } = useQuery({
    queryKey: ["entregas-disponiveis"],
    enabled: !!autorizado,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .is("motoboy_id", null)
        .in("status", ["pronto", "aguardando_motoboy"])
        .order("created_at");
      if (error) throw error;
      // Pedido de retirada nao e entrega: nunca entra na fila do motoboy.
      // Filtro no cliente para nao quebrar em bancos sem a migration 0018.
      const entregas = (data ?? []).filter((d: any) => d.tipo_entrega !== "retirada");
      if (typeof window !== "undefined" && entregas.length > 0) {
        // Notificação sonora/visual de nova entrega (especificação)
        // Evita spam: apenas loga no console + toast discreto controlado por sessionStorage
        const key = "neia-last-seen-delivery";
        const ids = entregas.map((d: any) => d.id).join(",");
        if (sessionStorage.getItem(key) && sessionStorage.getItem(key) !== ids) {
          toast.info(`Nova entrega disponível. Taxa: ${brl(entregas[0]?.taxa_motoboy)}`);
        }
        sessionStorage.setItem(key, ids);
      }
      return entregas;
    },
  });

  const { data: minhas } = useQuery({
    queryKey: ["minhas-entregas", user?.id],
    enabled: !!autorizado && !!user,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*)")
        .eq("motoboy_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime: novas entregas + atualizações das minhas
  useEffect(() => {
    if (!autorizado) return;
    const canal = supabase
      .channel("motoboy-geral")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["entregas-disponiveis"] });
        queryClient.invalidateQueries({ queryKey: ["minhas-entregas"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [autorizado, queryClient]);

  const emAndamento = useMemo(() => (minhas ?? []).filter((p: any) => p.status !== "entregue" && p.status !== "cancelado"), [minhas]);
  const historico = useMemo(() => (minhas ?? []).filter((p: any) => ["entregue", "cancelado"].includes(p.status)), [minhas]);

  // Pedidos em rota para rastreamento GPS
  const pedidosEmRota = useMemo(() => emAndamento.filter((p: any) => p.status === "em_rota"), [emAndamento]);
  const pedidoIdsEmRota = useMemo(() => pedidosEmRota.map((p: any) => p.id), [pedidosEmRota]);

  // GPS Tracking hook
  const {
    status: gpsStatus,
    currentPosition: gpsPosition,
    lastUpdate: gpsLastUpdate,
    error: gpsError,
    startTracking,
    stopTracking,
    isTracking,
  } = useGpsTracking({
    pedidoIds: pedidoIdsEmRota,
    enabled: pedidoIdsEmRota.length > 0 && !!autorizado,
    updateIntervalMs: 15000,
    minDistanceMeters: 10,
    maxAgeMs: 10000,
    timeoutMs: 15000,
  });

  const isTrackingBool: boolean = isTracking ?? false;

  // Auto-start tracking when there are deliveries in route
  useEffect(() => {
    if (pedidoIdsEmRota.length > 0 && autorizado && !isTrackingBool) {
      startTracking();
    } else if (pedidoIdsEmRota.length === 0 && isTrackingBool) {
      stopTracking();
    }
  }, [pedidoIdsEmRota.length, autorizado, startTracking, stopTracking, isTrackingBool]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["entregas-disponiveis"] });
    queryClient.invalidateQueries({ queryKey: ["minhas-entregas"] });
  }

  async function aceitar(p: any) {
    // E9.1: legado preservado (claim de pedido sem dono); self-accept E5
    // passa a valer na ativação. Trava + 0 linhas = conflito explícito.
    if (aceitandoEmVoo.has(p.id)) return;
    aceitandoEmVoo.add(p.id);
    try {
      const { data, error } = await supabase
        .from("pedidos")
        .update({ motoboy_id: user!.id, aceito_em: new Date().toISOString(), status: "aguardando_motoboy" })
        .eq("id", p.id)
        .is("motoboy_id", null)
        .select("id");
      if (error) {
        toast.error("Entrega já foi aceita por outro motoboy.");
      } else if (!data || data.length === 0) {
        toast.error("Entrega já foi aceita por outro motoboy (conflito).");
      } else {
        toast.success(`Você aceitou o pedido nº ${p.numero}. Taxa ${brl(p.taxa_motoboy)}. Toque em Iniciar para sair.`);
        void notificarPedido({ client: supabase, pedidoId: p.id, status: "aguardando_motoboy", telefone: p.telefone, mensagem: mensagemStatus("aguardando_motoboy", p.cliente_nome, p.numero) });
      }
    } finally {
      aceitandoEmVoo.delete(p.id);
    }
    refresh();
  }

  async function iniciar(p: any) {
    // Request GPS permission and start tracking
    try {
      await startTracking();
    } catch (err) {
      console.error("Failed to start GPS:", err);
    }

    const pos = ehModoDemo()
      ? null
      : await new Promise<GeolocationPosition | null>((resolve) =>
          navigator.geolocation
            ? navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000 })
            : resolve(null),
        );
    // Fase A: se o GPS for negado, não apaga a última posição conhecida.
    const update: Record<string, unknown> = { status: "em_rota" };
    if (pos) {
      update["motoboy_lat"] = pos.coords.latitude;
      update["motoboy_lng"] = pos.coords.longitude;
      update["motoboy_atualizado_em"] = new Date().toISOString();
    }
    const { error } = await supabase.from("pedidos").update(update).eq("id", p.id);
    if (error) toast.error("Não foi possível iniciar.");
    else {
      toast.success(`Entrega nº ${p.numero} iniciada.`);
      void notificarPedido({ client: supabase, pedidoId: p.id, status: "em_rota", telefone: p.telefone, mensagem: mensagemStatus("em_rota", p.cliente_nome, p.numero) });
    }
    refresh();
  }

  async function finalizar(p: any) {
    const { error } = await supabase.from("pedidos").update({ status: "entregue", entregue_em: new Date().toISOString() }).eq("id", p.id);
    if (error) toast.error("Não foi possível finalizar.");
    else {
      toast.success(`Pedido nº ${p.numero} entregue! +${brl(p.taxa_motoboy)}`);
      void notificarPedido({ client: supabase, pedidoId: p.id, status: "entregue", telefone: p.telefone, mensagem: mensagemStatus("entregue", p.cliente_nome, p.numero) });
      // Se não há mais pendentes, vira RETORNANDO À BASE automaticamente + avisa o admin
      try {
        const { count } = await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("motoboy_id", user!.id).in("status", ["aguardando_motoboy", "em_rota"]);
        if ((count ?? 0) === 0) {
          await supabase.from("motoboys").update({ status: "retornando_base" }).eq("user_id", user!.id);
          setRetornando(true);
          try {
            await supabase.from("notificacoes").insert({
              tipo: "motoboy_retorno",
              titulo: "Motoboy retornando à base",
              detalhe: `Entregas concluídas. Verifique próximos pedidos prontos para nova rota.`,
              link: "/admin",
            });
          } catch { /* sem migration — segue */ }
          toast.success("Todas entregas concluídas. Status: RETORNANDO À BASE. Avise ao chegar: Cheguei à base.");
        }
      } catch { /* sem migration — segue */ }
    }
    refresh();
  }

  async function marcarAtraso(p: any) {
    const motivo = window.prompt(`Motivo do atraso (${MOTIVO_ATRASO.join(", ")}):`, "transito");
    if (!motivo) return;
    if (!MOTIVO_ATRASO.includes(motivo as never)) { toast.error("Motivo inválido."); return; }
    const desc = motivo === "outro" ? (window.prompt("Descreva o motivo:") ?? "") : "";
    const { error } = await supabase.from("pedidos").update({ atrasado: true, atraso_motivo: motivo, atraso_descricao: desc || null }).eq("id", p.id);
    if (error) toast.error("Não foi possível marcar atraso (rode o PASSO-11).");
    else { toast.warning(`Pedido nº ${p.numero} marcado como atrasado.`); refresh(); }
  }

  async function base(status: string) {
    try {
      const { data: atual } = await supabase.from("motoboys").select("id").eq("user_id", user!.id).maybeSingle();
      if ((atual as any)?.id) {
        const { error } = await supabase.from("motoboys").update({ status, ultima_base_em: status === "disponivel_base" ? new Date().toISOString() : undefined }).eq("user_id", user!.id);
        if (error) throw error;
      } else {
        // Primeiro uso: vincula o usuário logado ao cadastro do motoboy
        const { error } = await supabase.from("motoboys").insert({ user_id: user!.id, nome: (user as any)?.email ?? "Motoboy", telefone: "", status });
        if (error) throw error;
      }
      if (status === "disponivel_base") setRetornando(false);
      toast.success(status === "disponivel_base" ? "CHEGUEI À BASE registrado. Disponível." : "Retornando à base.");
    } catch { toast.error("Cadastre o motoboy em /admin → Motoboys primeiro (rode a migration 0032)."); }
    refresh();
  }

  const financ = useMemo(() => {
    const ent = (minhas ?? []).filter((p: any) => p.status === "entregue");
    const agora = new Date();
    const s = inicioSemana(agora);
    const m = inicioMes(agora);
    const soma = (arr: any[]) => arr.reduce((a, p) => a + Number(p.taxa_motoboy ?? 0), 0);
    const hoje = ent.filter((p: any) => p.entregue_em && new Date(p.entregue_em).toDateString() === agora.toDateString());
    const sem = ent.filter((p: any) => p.entregue_em && new Date(p.entregue_em) >= s);
    const mes = ent.filter((p: any) => p.entregue_em && new Date(p.entregue_em) >= m);
    return {
      qtdHoje: hoje.length, ganhosHoje: soma(hoje),
      qtdSem: sem.length, ganhosSem: soma(sem),
      qtdMes: mes.length, ganhosMes: soma(mes),
      qtdTotal: ent.length, ganhosTotal: soma(ent),
      canceladas: (minhas ?? []).filter((p: any) => p.status === "cancelado").length,
    };
  }, [minhas]);

  if (roles && !autorizado) {
    return <p className="p-10 text-center text-muted-foreground">Você não tem acesso ao painel do motoboy.</p>;
  }

  // GPS Status indicator component
  const getGpsStatusInfo = (status: GpsStatus) => {
    switch (status) {
      case "ativo":
        return { icon: Satellite, color: "text-success", label: "GPS ativo", description: "Localização sendo compartilhada" };
      case "atualizando":
        return { icon: Loader2, color: "text-primary", label: "GPS atualizando", description: "Obtendo localização..." };
      case "sem_atualizacao":
        return { icon: AlertCircle, color: "text-warning", label: "GPS sem atualização", description: "Sem atualização há mais de 1 minuto" };
      case "indisponivel":
        return { icon: Satellite, color: "text-muted-foreground", label: "GPS indisponível", description: "GPS não disponível ou não iniciado" };
      case "permissao_negada":
        return { icon: AlertCircle, color: "text-destructive", label: "Permissão negada", description: "Ative a localização nas configurações" };
      case "offline":
        return { icon: WifiOff, color: "text-warning", label: "Offline", description: "Sem conexão. Sincronizando quando voltar." };
      default:
        return { icon: Satellite, color: "text-muted-foreground", label: "GPS", description: "" };
    }
  };

  const gpsInfo = getGpsStatusInfo(gpsStatus);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <PageHeader
          titulo="Painel do motoboy"
          descricao="Aceite corridas, navegue e acompanhe seus ganhos."
        />
        {/* GPS Status Indicator */}
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${gpsInfo.color.replace("text-", "border-")} bg-card`}>
          <gpsInfo.icon className={`size-5 ${gpsInfo.color}`} />
          <div className="text-left">
            <p className={`font-semibold text-sm ${gpsInfo.color}`}>{gpsInfo.label}</p>
            <p className="text-xs text-muted-foreground">{gpsInfo.description}</p>
          </div>
          {gpsLastUpdate && (
            <span className="ml-2 text-xs text-muted-foreground">
              Última atualização: {gpsLastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          {gpsError && (
            <span className="ml-2 text-xs text-destructive">{gpsError}</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => base("retornando_base")}>Retornando à base</Button>
        <Button size="sm" variant="outline" onClick={() => base("disponivel_base")}>Cheguei à base</Button>
      </div>
      {retornando && (disponiveis ?? []).length > 0 ? (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-semibold">Há {(disponiveis ?? []).length} entrega(s) aguardando motoboy.</p>
          <p className="text-xs text-muted-foreground">Nada foi atribuído automaticamente. Toque para ver e aceite se quiser sair de novo.</p>
          <Button size="sm" className="mt-2" onClick={() => { setAba("disponiveis"); setRetornando(false); }}>Ver disponíveis</Button>
        </div>
      ) : null}

      {/* Financeiro */}
      <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-3">
        <FinCard titulo="Hoje" qtd={financ.qtdHoje} valor={brl(financ.ganhosHoje)} />
        <FinCard titulo="Esta semana" qtd={financ.qtdSem} valor={brl(financ.ganhosSem)} />
        <FinCard titulo="Este mês" qtd={financ.qtdMes} valor={brl(financ.ganhosMes)} />
        <FinCard titulo="Total recebido" qtd={financ.qtdTotal} valor={brl(financ.ganhosTotal)} />
        <FinCard titulo="Em andamento" qtd={emAndamento.length} valor={`${disponiveis?.length ?? 0} disponíveis`} destaque={false} />
        <FinCard titulo="Canceladas" qtd={financ.canceladas} valor="—" destaque={false} />
      </div>

      <Tabs value={aba} onValueChange={setAba} className="mt-6">
        <TabsList className="no-scrollbar flex w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="disponiveis" className="shrink-0 text-xs sm:text-sm">Disponíveis ({disponiveis?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="andamento" className="shrink-0 text-xs sm:text-sm">Em andamento ({emAndamento.length})</TabsTrigger>
          <TabsTrigger value="historico" className="shrink-0 text-xs sm:text-sm">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="disponiveis" className="mt-4 space-y-3">
          {(disponiveis ?? []).map((p: any) => (
            <article key={p.id} className="rounded-xl border-2 border-primary/30 bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-primary" />
                <span className="font-display text-lg">Pedido Nº {p.numero}</span>
                <StatusBadge status={p.status} />
                <span className="ml-auto font-display text-lg text-success">+{brl(p.taxa_motoboy)}</span>
              </div>
              <p className="mt-1 text-sm"><strong>{p.cliente_nome}</strong> • {PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-3.5" /> {p.endereco}{p.complemento ? `, ${p.complemento}` : ""} — {p.bairro}</p>
              {p.referencia && <p className="text-xs text-muted-foreground">Ref: {p.referencia}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => aceitar(p)}>Aceitar corrida</Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={rotaGoogleMaps(`${p.endereco}, ${p.bairro}`)} target="_blank" rel="noopener noreferrer"><Navigation className="mr-1 size-4" /> Rota</a>
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Nova entrega disponível. Pedido nº {p.numero}. Taxa: {brl(p.taxa_motoboy)}.</p>
            </article>
          ))}
          {disponiveis && disponiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega disponível no momento.</p>}
        </TabsContent>

        <TabsContent value="andamento" className="mt-4 space-y-3">
          {emAndamento.length > 1 ? <RotaPanel pedidos={emAndamento} motoboyUserId={user!.id} /> : null}
          {emAndamento.map((p: any) => (
            <EntregaCard key={p.id} p={p} onIniciar={() => iniciar(p)} onFinalizar={() => finalizar(p)} />
          ))}
          {emAndamento.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega em andamento.</p>}
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="size-3.5" /> Últimas 100 entregas vinculadas a você.</p>
          {historico.map((p: any) => (
            <article key={p.id} className="rounded-xl border border-border bg-card p-4 opacity-90">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-display">Nº {p.numero}</span>
                <StatusBadge status={p.status} />
                <span className="ml-auto text-xs text-muted-foreground">{p.entregue_em ? dataHora(p.entregue_em) : dataHora(p.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.cliente_nome} • {p.endereco} — {p.bairro} • +{brl(p.taxa_motoboy)}</p>
            </article>
          ))}
          {historico.length === 0 && <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FinCard({ titulo, qtd, valor, destaque = true }: { titulo: string; qtd: number; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{titulo} • {qtd} entregas</p>
      <p className={`font-display text-xl ${destaque ? "text-primary" : "text-foreground"}`}>{valor}</p>
    </div>
  );
}

function RotaPanel({ pedidos, motoboyUserId }: { pedidos: any[]; motoboyUserId: string }) {
  const [ordem, setOrdem] = useState<string[]>(pedidos.map((p) => p.id));
  const [rotaId, setRotaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setOrdem((atual) => {
      const ids = pedidos.map((p) => p.id);
      const mantidos = atual.filter((id) => ids.includes(id));
      const novos = ids.filter((id) => !mantidos.includes(id));
      return [...mantidos, ...novos];
    });
  }, [pedidos]);
  const lista = ordenarRota(
    pedidos.map((p) => ({ pedidoId: p.id, ordem: 0, endereco: "", cliente: "" })),
    ordem,
  );
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  function mover(id: string, dir: -1 | 1) {
    setOrdem((atual) => {
      const i = atual.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      const tmp = copia[i] as string;
      copia[i] = copia[j] as string;
      copia[j] = tmp;
      return copia;
    });
    setRotaId(null);
  }
  function linkRota(): string {
    const dests = lista.map((r) => { const p = porId.get(r.pedidoId); return `${p?.endereco ?? ""}, ${p?.bairro ?? ""}`; }).filter((d) => d.trim().length > 3);
    if (dests.length === 0) return "#";
    if (dests.length === 1) return rotaGoogleMaps(dests[0] ?? "");
    const [first, ...rest] = dests;
    const last = (rest.pop() ?? "") as string;
    const way = rest.length > 0 ? `&waypoints=${encodeURIComponent(rest.join("|"))}` : "";
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(first ?? "")}&destination=${encodeURIComponent(last)}${way}&travelmode=driving`;
  }
  async function salvarRota() {
    setSalvando(true);
    try {
      // Regra operacional: 3 paradas por rota (4ª+ exigiria autorização
      // auditável, inexistente no fluxo local). Bloqueia antes de inserir.
      if (!cabeNaRota(lista.length, false)) {
        toast.error("Cada rota aceita no máximo 3 paradas. Fale com a central.");
        setSalvando(false);
        return;
      }
      const { data: mb } = await supabase.from("motoboys").select("id").eq("user_id", motoboyUserId).maybeSingle();
      const motoboyId = (mb as any)?.id ?? null;
      const { data: rota, error } = await supabase.from("rotas_entrega").insert({ motoboy_id: motoboyId, status: "em_rota", saiu_em: new Date().toISOString() }).select("id").single();
      if (error || !(rota as any)?.id) throw error ?? new Error("insert falhou");
      const id = (rota as any).id as string;
      const { error: e2 } = await supabase.from("rota_pedidos").insert(lista.map((r, i) => ({ rota_id: id, pedido_id: r.pedidoId, ordem: i + 1 })));
      if (e2) throw e2;
      await supabase.from("pedidos").update({ rota_id: id }).in("id", lista.map((r) => r.pedidoId));
      setRotaId(id);
      toast.success(`Rota com ${lista.length} paradas salva.`);
    } catch { toast.error("Não foi possível salvar a rota (rode a migration 0032)."); }
    setSalvando(false);
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Minha rota ({lista.length} paradas)</h2>
      <p className="text-xs text-muted-foreground">Reordene com ↑ ↓ e salve. Nada é atribuído sozinho.</p>
      <ol className="mt-2 space-y-1 text-sm">
        {lista.map((r, i) => {
          const p = porId.get(r.pedidoId);
          return (
            <li key={r.pedidoId} className="flex items-start gap-2">
              <span className="font-display">Nº {porId.get(r.pedidoId)?.numero}</span>
              <span className="min-w-0 flex-1">{i + 1}. {p?.endereco} — {p?.bairro}</span>
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => mover(r.pedidoId, -1)}>↑</Button>
              <Button size="sm" variant="ghost" disabled={i === lista.length - 1} onClick={() => mover(r.pedidoId, 1)}>↓</Button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild><a href={linkRota()} target="_blank" rel="noopener noreferrer"><Navigation className="mr-1 size-4" /> Abrir rota no Maps</a></Button>
        <Button size="sm" onClick={salvarRota} disabled={salvando}>{salvando ? "Salvando..." : rotaId ? "Rota salva ✓ (toque p/ atualizar)" : "Salvar rota"}</Button>
      </div>
    </section>
  );
}

function EntregaCard({ p, onIniciar, onFinalizar }: { p: any; onIniciar: () => void; onFinalizar: () => void }) {
  const [avisarAtraso, setAvisarAtraso] = useState(false);
  const destino = `${p.endereco}${p.complemento ? `, ${p.complemento}` : ""}, ${p.bairro}`;
  const pontos = [
    p.destino_lat && p.destino_lng ? { lat: p.destino_lat, lng: p.destino_lng, label: "Cliente" } : null,
    p.motoboy_lat && p.motoboy_lng ? { lat: p.motoboy_lat, lng: p.motoboy_lng, label: "Você", moto: true } : null,
  ].filter(Boolean) as { lat: number; lng: number; label: string; moto?: boolean }[];

  // GPS status for this specific delivery
  const isEmRota = p.status === "em_rota";
  const hasGps = p.motoboy_lat && p.motoboy_lng;
  const lastUpdate = p.motoboy_atualizado_em ? new Date(p.motoboy_atualizado_em) : null;
  const isGpsStale = lastUpdate && (Date.now() - lastUpdate.getTime()) > 60000;

  const getGpsBadge = () => {
    if (!isEmRota) return null;
    if (!hasGps) return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"><Satellite className="size-3" /> GPS aguardando</span>;
    if (isGpsStale) return <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 text-warning px-2 py-1 text-xs"><AlertCircle className="size-3" /> GPS desatualizado</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-success/20 text-success px-2 py-1 text-xs"><Satellite className="size-3" /> GPS ativo</span>;
  };

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-lg">Nº {p.numero}</span>
        <StatusBadge status={p.status} />
        <span className="ml-auto text-xs text-muted-foreground">{hora(p.created_at)}</span>
      </div>

      <div className="mt-2 space-y-1 text-sm">
        <p><strong>Cliente:</strong> {p.cliente_nome}</p>
        <p className="flex items-center gap-1.5"><Phone className="size-3.5" />
          <a className="underline" href={`tel:${String(p.telefone).replace(/\D/g, "")}`}>{p.telefone}</a>
          <a className="ml-2 inline-flex items-center gap-1 text-xs text-success underline" target="_blank" rel="noreferrer"
            href={whatsappLink(p.telefone, `Olá ${p.cliente_nome}, sou o motoboy do pedido nº ${p.numero}. Estou a caminho!`)}>
            <MessageCircle className="size-3.5" /> Chamar no WhatsApp
          </a>
        </p>
        <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0" /> {destino}{p.referencia ? ` (Ref: ${p.referencia})` : ""}</p>
        {p.tipo_imovel === "apartamento" || p.apartamento ? (
          <p className="text-xs text-muted-foreground">Apto {p.apartamento || "—"}{p.bloco ? ` • Bloco/Torre ${p.bloco}` : ""}{p.andar ? ` • Andar ${p.andar}` : ""}{p.torre ? ` • Torre ${p.torre}` : ""}{p.interfone ? ` • Interfone ${p.interfone}` : ""}{p.pode_subir ? " • autorizado subir" : ""}</p>
        ) : null}
        <p className="flex items-center gap-1.5"><Banknote className="size-3.5" /> {PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento} • Total pedido {brl(p.total)} • <strong className="text-success">Sua taxa {brl(p.taxa_motoboy)}</strong></p>
        {(p.pedido_itens ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">Itens: {(p.pedido_itens ?? []).map((i: any) => `${i.quantidade}x ${i.nome}`).join(", ")}</p>
        )}
        {p.observacoes && <p className="rounded bg-muted p-2 text-xs">Obs: {p.observacoes}</p>}
      </div>

      {p.status === "em_rota" && getGpsBadge()}

      {pontos.length > 0 && <MapView pontos={pontos} className="mt-3 h-48 w-full rounded-xl border border-border" />}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href={rotaGoogleMaps(destino)} target="_blank" rel="noopener noreferrer"><Navigation className="mr-1 size-4" /> Abrir rota / Navegar</a>
        </Button>
        {p.status !== "em_rota" && <Button size="sm" onClick={onIniciar}>🛵 Iniciar Rota</Button>}
        {p.status === "em_rota" && <Button size="sm" onClick={onFinalizar}>✓ Finalizar entrega</Button>}
        <Button size="sm" variant="outline" onClick={() => setAvisarAtraso((v) => !v)}>Atraso</Button>
      </div>
      {p.atrasado ? <p className="mt-2 text-xs text-destructive">Atrasado: {p.atraso_motivo}{p.atraso_descricao ? ` — ${p.atraso_descricao}` : ""}</p> : null}
      {p.tipo_imovel === "apartamento" || p.apartamento ? <p className="mt-2 text-xs text-muted-foreground">{mensagemPortaria(!!p.pode_subir)}</p> : null}
      {avisarAtraso ? <AtrasoForm id={p.id} /> : null}
      {p.status === "em_rota" && <p className="mt-2 text-xs text-muted-foreground">Sua localização está sendo compartilhada com cliente e admin em tempo real.</p>}
    </article>
  );
}

const MOTIVO_LABEL: Record<string, string> = MOTIVO_ATRASO_LABEL;

function AtrasoForm({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("transito");
  const [desc, setDesc] = useState("");
  async function salvar() {
    if (motivo === "outro" && !desc.trim()) { toast.error("Descreva o motivo."); return; }
    const { error } = await supabase.from("pedidos").update({ atrasado: true, atraso_motivo: motivo, atraso_descricao: desc || null }).eq("id", id);
    if (error) toast.error("Rode o PASSO-11 no Supabase.");
    else { toast.warning("Atraso registrado."); queryClient.invalidateQueries(); }
  }
  return (
    <div className="mt-2 flex gap-2">
      <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
        {MOTIVO_ATRASO.map((m) => <option key={m} value={m}>{MOTIVO_LABEL[m] ?? m}</option>)}
      </select>
      {motivo === "outro" ? <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descreva" className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs" /> : null}
      <Button size="sm" onClick={salvar}>Salvar</Button>
    </div>
  );
}
