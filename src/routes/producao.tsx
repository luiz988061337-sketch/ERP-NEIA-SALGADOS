import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-steps";
import { supabase } from "@/integrations/supabase/client";
import { brl, hora, mensagemStatus, whatsappLink } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/producao")({
  head: () => ({
    meta: [
      { title: "Painel de produção — Néia Salgados" },
      { name: "description", content: "Fila de pedidos para preparo na cozinha." },
      { property: "og:title", content: "Painel de produção — Néia Salgados" },
      { property: "og:description", content: "Fila de pedidos para preparo na cozinha." },
    ],
  }),
  component: Producao,
});

function Producao() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/producao" }, replace: true });
  }, [loading, user, navigate]);

  const autorizado = roles?.includes("producao") || roles?.includes("admin");

  const { data: pedidos } = useQuery({
    queryKey: ["fila-producao"],
    enabled: !!autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*)")
        .in("status", ["recebido", "em_producao", "pronto"])
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function mudarStatus(pedido: any, status: string, producao_status: string) {
    const { error } = await supabase.from("pedidos").update({ status, producao_status }).eq("id", pedido.id);
    if (error) {
      toast.error("Não foi possível atualizar o pedido.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
    window.open(
      whatsappLink(pedido.telefone, mensagemStatus(status, pedido.cliente_nome, pedido.numero)),
      "_blank",
      "noopener",
    );
  }

  if (roles && !autorizado) {
    return <p className="p-10 text-center text-muted-foreground">Você não tem acesso ao painel de produção.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">Painel de produção</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pedidos em aberto na cozinha.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(pedidos ?? []).map((p: any) => (
          <article key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg">Nº {p.numero}</h2>
              <StatusBadge status={p.status} />
              <span className="ml-auto text-xs text-muted-foreground">{hora(p.created_at)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {p.cliente_nome} • {p.bairro}
            </p>
            <ul className="mt-3 space-y-0.5 text-sm">
              {(p.pedido_itens ?? []).map((i: any) => (
                <li key={i.id}>
                  <span className="font-semibold">{i.quantidade}x</span> {i.nome}
                </li>
              ))}
            </ul>
            {p.observacoes ? (
              <p className="mt-2 rounded bg-muted p-2 text-xs">Obs.: {p.observacoes}</p>
            ) : null}
            <p className="mt-2 text-sm font-display text-primary">{brl(p.total)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {p.status === "recebido" ? (
                <Button size="sm" onClick={() => mudarStatus(p, "em_producao", "produzindo")}>
                  Iniciar produção
                </Button>
              ) : null}
              {p.status === "em_producao" ? (
                <Button size="sm" onClick={() => mudarStatus(p, "pronto", "finalizado")}>
                  Marcar como pronto
                </Button>
              ) : null}
              {p.status === "pronto" ? (
                <Button size="sm" variant="outline" onClick={() => mudarStatus(p, "aguardando_motoboy", "finalizado")}>
                  Chamar motoboy
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => window.print()}>
                <Printer className="mr-1 size-4" /> Imprimir
              </Button>
            </div>
          </article>
        ))}
      </div>

      {pedidos && pedidos.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">Nenhum pedido na fila agora.</p>
      ) : null}
    </div>
  );
}
