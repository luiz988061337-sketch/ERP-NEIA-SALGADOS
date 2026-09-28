import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-steps";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataHora } from "@/lib/format";
import { usePerfil, useSession } from "@/lib/session";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Meus pedidos — Néia Salgados" },
      { name: "description", content: "Veja o histórico e o andamento dos seus pedidos." },
      { property: "og:title", content: "Meus pedidos — Néia Salgados" },
      { property: "og:description", content: "Veja o histórico e o andamento dos seus pedidos." },
    ],
  }),
  component: Conta,
});

function Conta() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: perfil } = usePerfil(user?.id);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/conta" }, replace: true });
  }, [loading, user, navigate]);

  const { data: pedidos } = useQuery({
    queryKey: ["meus-pedidos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">Minha conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {perfil?.nome ?? user?.email} {perfil?.telefone ? `• ${perfil.telefone}` : ""}
      </p>

      <h2 className="mt-8 font-display text-xl">Meus pedidos</h2>
      <ul className="mt-3 space-y-3">
        {(pedidos ?? []).map((p) => (
          <li key={p.id}>
            <Link
              to="/pedido/$id"
              params={{ id: p.id }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex-1">
                <p className="font-display">Pedido nº {p.numero}</p>
                <p className="text-xs text-muted-foreground">{dataHora(p.created_at)}</p>
              </div>
              <StatusBadge status={p.status} />
              <span className="font-display text-primary">{brl(p.total)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {pedidos && pedidos.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">Você ainda não fez pedidos.</p>
          <Button asChild className="mt-4">
            <Link to="/">Ver cardápio</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
