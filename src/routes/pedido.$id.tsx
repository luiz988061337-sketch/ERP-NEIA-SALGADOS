import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusSteps } from "@/components/status-steps";
import { NotasCliente } from "@/components/pedido-notas";
import { MapView } from "@/components/map-view";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataHora, PAGAMENTO_LABEL } from "@/lib/format";
import { enderecoLoja, DEFAULT_LOJA_CONFIG, lojaTemEndereco, pontoDaLoja, useLojaConfig } from "@/lib/loja";

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

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">Pedido nº {pedido.numero}</p>
        <h1 className="font-display text-3xl">Acompanhe seu pedido</h1>
        <p className="mt-1 text-sm text-muted-foreground">Feito em {dataHora(pedido.created_at)}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <StatusSteps status={pedido.status} />
      </section>

      <NotasCliente pedidoId={pedido.id} />

      {pedido.status === "em_rota" && !isRetirada ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Bike className="size-5" /> Entrega a caminho
          </h2>
          {pontos.length > 0 ? (
            <MapView pontos={pontos} />
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
          {(itens ?? []).map((i) => (
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
          <p className="mt-1 text-muted-foreground">
            {pedido.endereco}
            {pedido.complemento ? `, ${pedido.complemento}` : ""} — {pedido.bairro}
          </p>
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
