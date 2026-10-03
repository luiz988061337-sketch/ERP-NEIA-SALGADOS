import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Navigation, Phone, MessageCircle, Banknote, Package, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-steps";
import { MapView, rotaGoogleMaps } from "@/components/map-view";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataHora, hora, mensagemStatus, PAGAMENTO_LABEL, whatsappLink } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/motoboy")({
  head: () => ({
    meta: [
      { title: "Painel do motoboy — Néia Salgados" },
      { name: "description", content: "Aceite, inicie e finalize entregas e acompanhe seus ganhos." },
    ],
  }),
  component: Motoboy,
});

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
  const watchId = useRef<number | null>(null);

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

  // Tracking contínuo: enquanto houver entrega em rota, envia localização a cada 15s
  useEffect(() => {
    const emRota = emAndamento.some((p: any) => p.status === "em_rota");
    if (!emRota || !("geolocation" in navigator)) {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const alvos = emAndamento.filter((p: any) => p.status === "em_rota");
        for (const p of alvos) {
          await supabase.from("pedidos").update({
            motoboy_lat: pos.coords.latitude,
            motoboy_lng: pos.coords.longitude,
            motoboy_atualizado_em: new Date().toISOString(),
          }).eq("id", (p as any).id);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(emAndamento.map((p: any) => p.id + p.status))]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["entregas-disponiveis"] });
    queryClient.invalidateQueries({ queryKey: ["minhas-entregas"] });
  }

  async function aceitar(p: any) {
    const { error } = await supabase
      .from("pedidos")
      .update({ motoboy_id: user!.id, aceito_em: new Date().toISOString(), status: "aguardando_motoboy" })
      .eq("id", p.id)
      .is("motoboy_id", null);
    if (error) toast.error("Entrega já foi aceita por outro motoboy.");
    else toast.success(`Você aceitou o pedido nº ${p.numero}. Taxa ${brl(p.taxa_motoboy)}. Toque em Iniciar para sair.`);
    refresh();
  }

  async function iniciar(p: any) {
    const pos = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000 })
        : resolve(null),
    );
    const { error } = await supabase.from("pedidos").update({
      status: "em_rota",
      motoboy_lat: pos?.coords.latitude ?? null,
      motoboy_lng: pos?.coords.longitude ?? null,
      motoboy_atualizado_em: new Date().toISOString(),
    }).eq("id", p.id);
    if (error) toast.error("Não foi possível iniciar.");
    else {
      toast.success(`Entrega nº ${p.numero} iniciada. Cliente avisado no WhatsApp.`);
      window.open(whatsappLink(p.telefone, mensagemStatus("em_rota", p.cliente_nome, p.numero)), "_blank", "noopener");
    }
    refresh();
  }

  async function finalizar(p: any) {
    const { error } = await supabase.from("pedidos").update({ status: "entregue", entregue_em: new Date().toISOString() }).eq("id", p.id);
    if (error) toast.error("Não foi possível finalizar.");
    else {
      toast.success(`Pedido nº ${p.numero} entregue! +${brl(p.taxa_motoboy)}`);
      window.open(whatsappLink(p.telefone, mensagemStatus("entregue", p.cliente_nome, p.numero)), "_blank", "noopener");
    }
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-3xl">Painel do motoboy</h1>
      <p className="text-sm text-muted-foreground">Aceite corridas, navegue e acompanhe seus ganhos.</p>

      {/* Financeiro */}
      <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-3">
        <FinCard titulo="Hoje" qtd={financ.qtdHoje} valor={brl(financ.ganhosHoje)} />
        <FinCard titulo="Esta semana" qtd={financ.qtdSem} valor={brl(financ.ganhosSem)} />
        <FinCard titulo="Este mês" qtd={financ.qtdMes} valor={brl(financ.ganhosMes)} />
        <FinCard titulo="Total recebido" qtd={financ.qtdTotal} valor={brl(financ.ganhosTotal)} />
        <FinCard titulo="Em andamento" qtd={emAndamento.length} valor={`${disponiveis?.length ?? 0} disponíveis`} destaque={false} />
        <FinCard titulo="Canceladas" qtd={financ.canceladas} valor="—" destaque={false} />
      </div>

      <Tabs defaultValue="disponiveis" className="mt-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="disponiveis">Disponíveis ({disponiveis?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="andamento">Em andamento ({emAndamento.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
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

function EntregaCard({ p, onIniciar, onFinalizar }: { p: any; onIniciar: () => void; onFinalizar: () => void }) {
  const destino = `${p.endereco}${p.complemento ? `, ${p.complemento}` : ""}, ${p.bairro}`;
  const pontos = [
    p.destino_lat && p.destino_lng ? { lat: p.destino_lat, lng: p.destino_lng, label: "Cliente" } : null,
    p.motoboy_lat && p.motoboy_lng ? { lat: p.motoboy_lat, lng: p.motoboy_lng, label: "Você" } : null,
  ].filter(Boolean) as { lat: number; lng: number; label: string }[];

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
        <p className="flex items-center gap-1.5"><Banknote className="size-3.5" /> {PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento} • Total pedido {brl(p.total)} • <strong className="text-success">Sua taxa {brl(p.taxa_motoboy)}</strong></p>
        {(p.pedido_itens ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">Itens: {(p.pedido_itens ?? []).map((i: any) => `${i.quantidade}x ${i.nome}`).join(", ")}</p>
        )}
        {p.observacoes && <p className="rounded bg-muted p-2 text-xs">Obs: {p.observacoes}</p>}
      </div>

      {pontos.length > 0 && <MapView pontos={pontos} className="mt-3 h-48 w-full rounded-xl border border-border" />}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href={rotaGoogleMaps(destino)} target="_blank" rel="noopener noreferrer"><Navigation className="mr-1 size-4" /> Abrir rota / Navegar</a>
        </Button>
        {p.status !== "em_rota" && <Button size="sm" onClick={onIniciar}>Iniciar entrega</Button>}
        {p.status === "em_rota" && <Button size="sm" onClick={onFinalizar}>Finalizar entrega</Button>}
      </div>
      {p.status === "em_rota" && <p className="mt-2 text-xs text-muted-foreground">Sua localização está sendo compartilhada com cliente e admin em tempo real.</p>}
    </article>
  );
}
