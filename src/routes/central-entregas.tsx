import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-steps";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, dataHora, mensagemStatus, whatsappLink } from "@/lib/format";
import { avisarStatus } from "@/lib/push";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/central-entregas")({
  head: () => ({
    meta: [
      { title: "Central de entregas — Néia Salgados" },
      { name: "description", content: "Kanban de entregas: atribuição de motoboys." },
    ],
  }),
  component: CentralEntregas,
});

type MotoboyOpt = { id: string; nome: string; user_id: string | null; status: string | null };

function CentralEntregas() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [atribuindo, setAtribuindo] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/central-entregas" }, replace: true });
  }, [loading, user, navigate]);

  const rolesArr = roles ?? [];
  const podeAtribuir = rolesArr.includes("admin") || rolesArr.includes("producao");
  const autorizado = podeAtribuir || rolesArr.includes("atendente") || rolesArr.includes("motoboy");

  const { data: entregas } = useQuery({
    queryKey: ["central-entregas"],
    enabled: !!autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .in("status", ["pronto", "aguardando_motoboy", "em_rota"])
        .order("created_at");
      if (error) throw error;
      // Retirada nunca entra na fila de entrega (mesma regra do /motoboy).
      return ((data ?? []) as any[]).filter((d) => d.tipo_entrega !== "retirada");
    },
  });

  const { data: entreguesHoje } = useQuery({
    queryKey: ["central-entregues-hoje"],
    enabled: !!autorizado,
    refetchInterval: 30000,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero, cliente_nome, motoboy_id, entregue_em, taxa_motoboy")
        .eq("status", "entregue")
        .gte("entregue_em", inicio.toISOString())
        .order("entregue_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: motoboys } = useQuery({
    queryKey: ["central-motoboys"],
    enabled: !!autorizado,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motoboys")
        .select("id, nome, user_id, status")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as MotoboyOpt[];
    },
  });

  useEffect(() => {
    if (!autorizado) return;
    const canal = supabase
      .channel("central-entregas")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["central-entregas"] });
        queryClient.invalidateQueries({ queryKey: ["central-entregues-hoje"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [autorizado, queryClient]);

  if (!autorizado && roles) {
    return <p className="p-10 text-center">Acesso restrito à equipe de entregas.</p>;
  }

  async function atribuir(pedido: any) {
    const userId = atribuindo[pedido.id];
    if (!userId) {
      toast.error("Escolha um motoboy vinculado para atribuir.");
      return;
    }
    // Espelha o aceite do motoboy (motoboy.tsx): só motoboy_id, aceito_em e
    // status mudam — compatível com o guard atual e com a 0063.
    const { error } = await supabase
      .from("pedidos")
      .update({
        motoboy_id: userId,
        aceito_em: new Date().toISOString(),
        status: "aguardando_motoboy",
      })
      .eq("id", pedido.id)
      .is("motoboy_id", null)
      .in("status", ["pronto", "aguardando_motoboy"]);
    if (error) {
      toast.error("Não foi possível atribuir. O pedido pode já ter dono.");
      return;
    }
    toast.success(`Pedido nº ${pedido.numero} atribuído.`);
    void avisarStatus(
      supabase,
      pedido,
      "aguardando_motoboy",
      mensagemStatus("aguardando_motoboy", pedido.cliente_nome, pedido.numero),
    );
    queryClient.invalidateQueries({ queryKey: ["central-entregas"] });
  }

  const lista = entregas ?? [];
  const aguardando = lista.filter((p) => p.motoboy_id == null);
  const emRota = lista.filter((p) => p.motoboy_id != null && p.status !== "entregue");
  const atrasados = lista.filter((p) => p.atrasado);
  const nomeMotoboy = (id: string | null) =>
    (motoboys ?? []).find((m) => m.user_id === id)?.nome ?? "—";

  function cardPedido(p: any) {
    return (
      <article key={p.id} className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">#{p.numero}</h2>
          <StatusBadge status={p.status} />
          {p.atrasado ? <span className="text-xs font-bold text-red-500">ATRASADO</span> : null}
          <span className="ml-auto text-xs text-muted-foreground">{dataHora(p.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.cliente_nome} •{" "}
          {p.motoboy_id ? `Motoboy: ${nomeMotoboy(p.motoboy_id)}` : "Sem motoboy"}
        </p>
        <p className="mt-1 text-sm">
          {p.endereco ?? ""} {p.bairro ? `— ${p.bairro}` : ""}
        </p>
        {p.observacoes ? (
          <p className="mt-1 rounded bg-muted p-1.5 text-xs">Obs: {p.observacoes}</p>
        ) : null}
        {p.atraso_motivo ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Atraso: {p.atraso_motivo}
            {p.atraso_descricao ? ` — ${p.atraso_descricao}` : ""}
          </p>
        ) : null}
        <p className="mt-1 text-sm">
          Total {brl(p.total)} • Taxa motoboy {brl(p.taxa_motoboy)}
        </p>
        {p.motoboy_lat && p.motoboy_lng ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Última posição{" "}
            {p.motoboy_atualizado_em ? ` em ${dataHora(p.motoboy_atualizado_em)}` : ""}.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.motoboy_id == null && podeAtribuir ? (
            <>
              <select
                aria-label={`Motoboy para o pedido ${p.numero}`}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={atribuindo[p.id] ?? ""}
                onChange={(e) => setAtribuindo((s) => ({ ...s, [p.id]: e.target.value }))}
              >
                <option value="">Motoboy…</option>
                {(motoboys ?? [])
                  .filter((m) => m.user_id)
                  .map((m) => (
                    <option key={m.id} value={m.user_id as string}>
                      {m.nome}
                      {m.status ? ` (${m.status})` : ""}
                    </option>
                  ))}
              </select>
              <Button size="sm" onClick={() => atribuir(p)}>
                Atribuir
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                whatsappLink(p.telefone, mensagemStatus(p.status, p.cliente_nome, p.numero)),
                "_blank",
                "noopener",
              )
            }
          >
            WhatsApp
          </Button>
        </div>
      </article>
    );
  }

  function coluna(titulo: string, itens: any[]) {
    return (
      <section>
        <h2 className="font-display text-xl">
          {titulo} ({itens.length})
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido aqui.</p>
          ) : (
            itens.map(cardPedido)
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl">Central de entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lista.length} na fila • {atrasados.length} atrasados • {entreguesHoje?.length ?? 0}{" "}
          entregues hoje. Sem campo de gorjeta.
        </p>
      </div>
      {coluna("Aguardando motoboy", aguardando)}
      {coluna(
        "Em rota",
        emRota.filter((p) => p.status === "em_rota"),
      )}
      {coluna(
        "Atrasados",
        atrasados.filter((p) => p.status !== "entregue"),
      )}
      <section>
        <h2 className="font-display text-xl">Entregues hoje ({entreguesHoje?.length ?? 0})</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(entreguesHoje ?? []).map((p: any) => (
            <li key={p.id}>
              #{p.numero} — {p.cliente_nome} — {nomeMotoboy(p.motoboy_id)}
              {p.entregue_em ? ` — ${dataHora(p.entregue_em)}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
