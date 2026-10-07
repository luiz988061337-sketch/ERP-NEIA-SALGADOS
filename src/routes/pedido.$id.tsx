import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PagamentoStatusBadge, StatusSteps } from "@/components/status-steps";
import { NotasCliente } from "@/components/pedido-notas";
import { MapView } from "@/components/map-view";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, dataHora, PAGAMENTO_LABEL } from "@/lib/format";
import { enderecoLoja, DEFAULT_LOJA_CONFIG, lojaTemEndereco, pontoDaLoja, useLojaConfig } from "@/lib/loja";
import { useSession } from "@/lib/session";
import { ativarPush, estadoPush } from "@/lib/push";

export const Route = createFileRoute("/pedido/$id")({
  head: () => ({
    meta: [
      { title: "Acompanhar pedido — Néia Salgados" },
      { name: "description", content: "Acompanhe em tempo real o preparo e a entrega do seu pedido." },
      { property: "og:title", content: "Acompanhar pedido — Néia Salgados" },
      { property: "og:description", content: "Acompanhe em tempo real o preparo e a entrega do seu pedido." },
    ],
  }),
  component: Acompanhar,
});

/** §75: marketing separado da comunicação operacional, só durante a espera. */
function MarketingEspera({ status, loja }: { status: string; loja: any }) {
  if (["entregue", "retirado", "cancelado"].includes(status)) return null;
  const links = [
    loja.instagram ? { nome: "Instagram", href: loja.instagram } : null,
    loja.facebook ? { nome: "Facebook", href: loja.facebook } : null,
    loja.site ? { nome: "Site", href: loja.site } : null,
  ].filter(Boolean) as { nome: string; href: string }[];
  if (links.length === 0 && !loja.telefone) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-sm">
      <h2 className="font-display text-xl">😊 Enquanto preparamos seu pedido...</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <Button key={l.nome} size="sm" variant="outline" asChild>
            <a href={l.href} target="_blank" rel="noopener noreferrer">{l.nome}</a>
          </Button>
        ))}
        {loja.telefone ? (
          <Button size="sm" variant="outline" asChild>
            <a href={`https://wa.me/55${String(loja.telefone).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Push opt-in: avisa "saiu para entrega/entregue" mesmo com o site fechado,
 * sem WhatsApp. Só para o dono logado (a inscrição é por usuário).
 */
function AvisoPush({ pedido }: { pedido: any }) {
  const { user } = useSession();
  const [estado, setEstado] = useState(() => estadoPush());
  const [salvando, setSalvando] = useState(false);
  if (!pedido || ["entregue", "retirado", "cancelado"].includes(pedido.status)) return null;
  if (!user?.id || pedido.user_id !== user.id) return null;
  if (estado === "nao-suportado" || estado === "negado") return null;
  if (estado === "ativo") {
    return (
      <p className="rounded-xl border border-border bg-card p-3 text-center text-xs text-muted-foreground">
        🔔 Notificações ativas neste aparelho — avisamos cada etapa por aqui.
      </p>
    );
  }
  async function ativar() {
    setSalvando(true);
    const r = await ativarPush(supabase, user!.id);
    setSalvando(false);
    if (r.ok) {
      setEstado("ativo");
      toast.success("Notificações ativadas!");
    } else if (r.motivo === "denied" || r.motivo === "negado") {
      setEstado("negado");
      toast.error("Permissão negada no navegador.");
    } else {
      toast.error("Não foi possível ativar neste aparelho.");
    }
    setEstado(estadoPush());
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center text-sm">
      <p className="font-semibold">🔔 Avisar quando mudar de etapa?</p>
      <p className="mt-1 text-xs text-muted-foreground">Funciona mesmo com o site fechado. Sem WhatsApp, sem cadastro extra.</p>
      <Button size="sm" className="mt-2" disabled={salvando} onClick={ativar}>
        {salvando ? "Ativando…" : "Ativar notificações"}
      </Button>
    </div>
  );
}

/** §66: convite Google pós-entrega. Nunca condiciona benefício à nota. */
function ConviteGoogle({ status, loja, numero }: { status: string; loja: any; numero: number }) {
  if (!["entregue", "retirado"].includes(status)) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-sm">
      <h2 className="font-display text-xl">Gostou do pedido nº {numero}?</h2>
      <p className="mt-1 text-muted-foreground">Avalie os produtos em <Link to="/conta">Minha conta</Link> e, se quiser, deixe sua avaliação pública no Google. Obrigado! ❤️</p>
      {loja.google_avaliacao ? (
        <Button size="sm" className="mt-2" asChild>
          <a href={loja.google_avaliacao} target="_blank" rel="noopener noreferrer">Avaliar no Google</a>
        </Button>
      ) : null}
    </section>
  );
}

function Acompanhar() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [cancelando, setCancelando] = useState(false);

  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id],
    // Fallback por polling caso o Realtime esteja bloqueado por RLS/rede
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["pedido-itens", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedido_itens").select("*").eq("pedido_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel(`pedido-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pedido", id] });
          queryClient.invalidateQueries({ queryKey: ["pedido-itens", id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id, queryClient]);

  async function cancelar() {
    if (!pedido || !["recebido"].includes(pedido.status)) return;
    if (!window.confirm(`Cancelar o pedido nº ${pedido.numero}?`)) return;
    setCancelando(true);
    const { error } = await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
    // Libera reservas e devolve estoque (0030). Fallback legado se RPC não existir.
    try {
      await supabase.rpc("liberar_reserva_atomica", { p_pedido_id: pedido.id });
    } catch { /* sem migration — segue para fallback */ }
    try {
      await supabase.from("reservas_estoque").update({ status: "cancelada" }).eq("pedido_id", pedido.id).eq("status", "ativa");
    } catch { /* sem migration — segue */ }
    setCancelando(false);
    if (error) toast.error("Não foi possível cancelar. Fale com a loja.");
    else {
      toast.success("Pedido cancelado.");
      queryClient.invalidateQueries({ queryKey: ["pedido", id] });
    }
  }

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">Carregando pedido...</p>;
  if (!pedido)
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button asChild className="mt-4">
          <Link to="/">Voltar ao cardápio</Link>
        </Button>
      </div>
    );

  const isRetirada = pedido.tipo_entrega === "retirada";
  const { data: lojaConfig } = useLojaConfig();
  const loja = lojaConfig ?? DEFAULT_LOJA_CONFIG;
  const pontoLoja = isRetirada ? pontoDaLoja(loja) : null;

  const pontos = [
    pedido.destino_lat && pedido.destino_lng
      ? { lat: pedido.destino_lat, lng: pedido.destino_lng, label: "Entrega" }
      : null,
    pedido.motoboy_lat && pedido.motoboy_lng
      ? { lat: pedido.motoboy_lat, lng: pedido.motoboy_lng, label: "Motoboy" }
      : null,
  ].filter(Boolean) as { lat: number; lng: number; label: string }[];

  // ETA calculation based on straight-line distance
  const [eta, setEta] = useState<string>("Calculando...");
  useEffect(() => {
    if (!pedido.motoboy_lat || !pedido.motoboy_lng || !pedido.destino_lat || !pedido.destino_lng) {
      setEta("Calculando...");
      return;
    }

    const R = 6371; // Earth radius in km
    const dLat = toRad(pedido.destino_lat - pedido.motoboy_lat);
    const dLng = toRad(pedido.destino_lng - pedido.motoboy_lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(pedido.motoboy_lat)) * Math.cos(toRad(pedido.destino_lat)) *
      Math.sin(toRad(pedido.destino_lng - pedido.motoboy_lng) / 2) * Math.sin(toRad(pedido.destino_lng - pedido.motoboy_lng) / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    // Average urban delivery speed: ~30 km/h
    const avgSpeedKmh = 30;
    const timeHours = distanceKm / avgSpeedKmh;
    const timeMinutes = Math.round(timeHours * 60);

    if (timeMinutes < 1) {
      setEta("Chegando...");
    } else if (timeMinutes < 60) {
      setEta(`~${timeMinutes} min`);
    } else {
      const hours = Math.floor(timeMinutes / 60);
      const mins = timeMinutes % 60;
      setEta(`~${hours}h ${mins}min`);
    }
  }, [pedido.motoboy_lat, pedido.motoboy_lng, pedido.destino_lat, pedido.destino_lng]);

  function toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">Pedido nº {pedido.numero}</p>
        <h1 className="font-display text-3xl">Acompanhe seu pedido</h1>
        <p className="mt-1 text-sm text-muted-foreground">Feito em {dataHora(pedido.created_at)}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <StatusSteps status={pedido.status} tipoEntrega={pedido.tipo_entrega} />
      </section>

      <AvisoPush pedido={pedido} />
      <MarketingEspera status={pedido.status} loja={loja} />
      <ConviteGoogle status={pedido.status} loja={loja} numero={pedido.numero} />

      <NotasCliente pedidoId={pedido.id} />

      {pedido.status === "em_rota" && !isRetirada ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Bike className="size-5" /> Entrega a caminho
          </h2>
          {pontos.length > 0 ? (
            <>
              <MapView pontos={pontos} className="h-64" />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Motoboy</p>
                  <p className="flex items-center gap-1.5">
                    <Bike className="size-4 text-success" />
                    <span className="font-medium">Compartilhando localização</span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/20 text-success px-2 py-0.5 text-xs">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                      </span>
                      GPS ativo
                    </span>
                  </p>
                  {pedido.motoboy_atualizado_em && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Última atualização: {new Date(pedido.motoboy_atualizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Tempo estimado</p>
                  <p className="flex items-center gap-1.5">
                    <Bike className="size-4 text-primary" />
                    <span className="font-medium text-primary">{eta}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Baseado na distância em linha reta (estimativa aproximada)
                  </p>
                </div>
              </div>
              <MapView pontos={pontos} className="h-64" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              O motoboy está a caminho. A localização ao vivo aparece aqui assim que o GPS for compartilhado.
            </p>
          )}
        </section>
      ) : null}

      <section className="space-y-2 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-display text-xl">Resumo</h2>
        <ul className="space-y-1">
          {(itens ?? []).map((i: any) => (
            <li key={i.id} className="flex justify-between">
              <span className="text-muted-foreground">
                {i.quantidade}x {i.nome}
              </span>
              <span>{brl(Number(i.preco_unitario) * i.quantidade)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {isRetirada ? "Retirada na loja" : "Entrega"}
            </span>
            <span>{isRetirada ? "Grátis" : brl(pedido.taxa_entrega)}</span>
          </div>
          {Number(pedido.desconto) > 0 ? (
            <div className="flex justify-between text-success">
              <span>Desconto</span>
              <span>-{brl(pedido.desconto)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-display text-lg">
            <span>Total</span>
            <span className="text-primary">{brl(pedido.total)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pagamento: {PAGAMENTO_LABEL[pedido.forma_pagamento]}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            Situação do pagamento: <PagamentoStatusBadge status={pedido.pagamento_status} />
          </p>
          {pedido.pagamento_em ? (
            <p className="mt-1 text-xs text-muted-foreground">Pago em {dataHora(pedido.pagamento_em)}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-display text-xl">{isRetirada ? "Retirada" : "Endereço"}</h2>
        {isRetirada ? (
          <>
            {lojaTemEndereco(loja) ? (
              <p className="mt-1 text-muted-foreground">{enderecoLoja(loja)}</p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                O endereço da loja é confirmado pelo WhatsApp assim que o pedido ficar pronto.
              </p>
            )}
            {loja.referencia ? <p className="mt-1 text-muted-foreground">Referência: {loja.referencia}</p> : null}
            {loja.instrucoes_retirada ? (
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{loja.instrucoes_retirada}</p>
            ) : null}
            {pontoLoja ? (
              <div className="mt-3">
                <MapView pontos={[pontoLoja]} />
              </div>
            ) : null}
          </>
        ) : (
          <>
          <p className="mt-1 text-muted-foreground">
            {pedido.endereco}
            {pedido.complemento ? `, ${pedido.complemento}` : ""} — {pedido.bairro}
          </p>
          {pedido.tipo_imovel === "apartamento" || pedido.apartamento ? (
            <p className="mt-1 text-muted-foreground">
              Apto {pedido.apartamento || "—"}{pedido.bloco ? ` • Bloco/Torre ${pedido.bloco}` : ""}{pedido.andar ? ` • Andar ${pedido.andar}` : ""}{pedido.interfone ? ` • Interfone ${pedido.interfone}` : ""}{pedido.pode_subir ? " • autorizado subir" : ""}
            </p>
          ) : null}
          </>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Phone className="size-3.5" /> {pedido.telefone}
        </p>
      </section>

      <Button asChild variant="outline" className="w-full">
        <Link to="/">Voltar ao cardápio</Link>
      </Button>
      {pedido.status === "recebido" ? (
        <Button variant="ghost" className="w-full text-destructive" disabled={cancelando} onClick={cancelar}>
          {cancelando ? "Cancelando..." : "Cancelar pedido"}
        </Button>
      ) : null}
    </div>
  );
}
