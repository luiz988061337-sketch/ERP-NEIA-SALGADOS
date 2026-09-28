import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-steps";
import { rotaGoogleMaps } from "@/components/map-view";
import { supabase } from "@/integrations/supabase/client";
import { brl, hora, mensagemStatus, whatsappLink } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/motoboy")({
  head: () => ({
    meta: [
      { title: "Painel do motoboy — Néia Salgados" },
      { name: "description", content: "Aceite, inicie e finalize entregas e acompanhe seus ganhos." },
      { property: "og:title", content: "Painel do motoboy — Néia Salgados" },
      { property: "og:description", content: "Aceite, inicie e finalize entregas e acompanhe seus ganhos." },
    ],
  }),
  component: Motoboy,
});

function Motoboy() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/motoboy" }, replace: true });
  }, [loading, user, navigate]);

  const autorizado = roles?.includes("motoboy") || roles?.includes("admin");

  const { data: disponiveis } = useQuery({
    queryKey: ["entregas-disponiveis"],
    enabled: !!autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .is("motoboy_id", null)
        .in("status", ["pronto", "aguardando_motoboy"])
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: minhas } = useQuery({
    queryKey: ["minhas-entregas", user?.id],
    enabled: !!autorizado && !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("motoboy_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  function atualizarQueries() {
    queryClient.invalidateQueries({ queryKey: ["entregas-disponiveis"] });
    queryClient.invalidateQueries({ queryKey: ["minhas-entregas"] });
  }

  async function aceitar(p: any) {
    const { error } = await supabase
      .from("pedidos")
      .update({ motoboy_id: user!.id, aceito_em: new Date().toISOString() })
      .eq("id", p.id)
      .is("motoboy_id", null);
    if (error) {
      toast.error("Entrega já foi aceita por outro motoboy.");
    } else {
      toast.success(`Entrega do pedido nº ${p.numero} aceita.`);
    }
    atualizarQueries();
  }

  async function iniciar(p: any) {
    const pos = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000 })
        : resolve(null),
    );
    const { error } = await supabase
      .from("pedidos")
      .update({
        status: "em_rota",
        motoboy_lat: pos?.coords.latitude ?? null,
        motoboy_lng: pos?.coords.longitude ?? null,
        motoboy_atualizado_em: new Date().toISOString(),
      })
      .eq("id", p.id);
    if (error) toast.error("Não foi possível iniciar a entrega.");
    else
      window.open(
        whatsappLink(p.telefone, mensagemStatus("em_rota", p.cliente_nome, p.numero)),
        "_blank",
        "noopener",
      );
    atualizarQueries();
  }

  async function finalizar(p: any) {
    const { error } = await supabase
      .from("pedidos")
      .update({ status: "entregue", entregue_em: new Date().toISOString() })
      .eq("id", p.id);
    if (error) toast.error("Não foi possível finalizar a entrega.");
    else {
      toast.success("Entrega finalizada!");
      window.open(
        whatsappLink(p.telefone, mensagemStatus("entregue", p.cliente_nome, p.numero)),
        "_blank",
        "noopener",
      );
    }
    atualizarQueries();
  }

  if (roles && !autorizado) {
    return <p className="p-10 text-center text-muted-foreground">Você não tem acesso ao painel do motoboy.</p>;
  }

  const entregues = (minhas ?? []).filter((p) => p.status === "entregue");
  const hoje = new Date().toDateString();
  const ganhosHoje = entregues
    .filter((p) => p.entregue_em && new Date(p.entregue_em).toDateString() === hoje)
    .reduce((acc, p) => acc + Number(p.taxa_motoboy), 0);
  const ganhosTotal = entregues.reduce((acc, p) => acc + Number(p.taxa_motoboy), 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-3xl">Painel do motoboy</h1>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card titulo="Entregas hoje" valor={String(entregues.filter((p) => p.entregue_em && new Date(p.entregue_em).toDateString() === hoje).length)} />
        <Card titulo="Ganhos hoje" valor={brl(ganhosHoje)} />
        <Card titulo="Ganhos totais" valor={brl(ganhosTotal)} />
      </div>

      <h2 className="mt-8 font-display text-xl">Entregas disponíveis</h2>
      <div className="mt-3 space-y-3">
        {(disponiveis ?? []).map((p) => (
          <article key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="font-display">Nº {p.numero}</span>
              <StatusBadge status={p.status} />
              <span className="ml-auto text-sm font-display text-success">+{brl(p.taxa_motoboy)}</span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> {p.endereco} — {p.bairro}
            </p>
            <Button size="sm" className="mt-3" onClick={() => aceitar(p)}>
              Aceitar entrega
            </Button>
          </article>
        ))}
        {disponiveis && disponiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma entrega disponível no momento.</p>
        ) : null}
      </div>

      <h2 className="mt-8 font-display text-xl">Minhas entregas</h2>
      <div className="mt-3 space-y-3">
        {(minhas ?? []).map((p) => (
          <article key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="font-display">Nº {p.numero}</span>
              <StatusBadge status={p.status} />
              <span className="ml-auto text-xs text-muted-foreground">{hora(p.created_at)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {p.cliente_nome} • {p.endereco} — {p.bairro}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.status !== "entregue" ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={rotaGoogleMaps(`${p.endereco}, ${p.bairro}`)} target="_blank" rel="noopener noreferrer">
                    <Navigation className="mr-1 size-4" /> Rota
                  </a>
                </Button>
              ) : null}
              {p.status !== "em_rota" && p.status !== "entregue" ? (
                <Button size="sm" onClick={() => iniciar(p)}>
                  Iniciar entrega
                </Button>
              ) : null}
              {p.status === "em_rota" ? (
                <Button size="sm" onClick={() => finalizar(p)}>
                  Finalizar entrega
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Card({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="font-display text-2xl text-primary">{valor}</p>
    </div>
  );
}
