import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageHeader } from "@/components/admin/ui-admin";
import { textoTeste, textoCupom } from "@/lib/impressao";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/impressao")({
  head: () => ({ meta: [{ title: "Impressão — Néia Salgados" }] }),
  component: Fila,
});

function Fila() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isStaff =
    roles?.includes("admin") || roles?.includes("producao") || roles?.includes("atendente");
  const [enviando, setEnviando] = useState(false);

  // Padrão uniforme das rotas staff: anônimo vai para /auth em vez de ver a
  // mensagem de acesso restrito antes de saber se está logado.
  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/impressao" }, replace: true });
  }, [loading, user, navigate]);
  const fila = useQuery({
    queryKey: ["fila-impressao"],
    enabled: !!isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fila_impressao")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function testar() {
    setEnviando(true);
    try {
      const uuid = `teste:${Date.now()}`;
      const { error } = await supabase.from("fila_impressao").insert({
        trabalho_uuid: uuid,
        tipo: "teste",
        payload: textoTeste(),
        impressora: "Tanca TP-550",
      });
      if (error) throw error;
      toast.success("Teste enviado. O agente imprime em segundos.");
      fila.refetch();
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      toast.error(m.includes("fila_impressao") ? "Rode o PASSO-11 no Supabase." : m);
    } finally {
      setEnviando(false);
    }
  }

  async function reimprimir(job: {
    id: string;
    payload: string;
    pedido_id: string | null;
    reimpressoes: number;
  }) {
    try {
      const { error: erroInsert } = await supabase.from("fila_impressao").insert({
        trabalho_uuid: `reimp:${job.id}:${Date.now()}`,
        pedido_id: job.pedido_id,
        tipo: "pedido",
        payload: job.payload,
        impressora: "Tanca TP-550",
        motivo_reimpressao: "manual",
      });
      if (erroInsert) throw new Error("Falha ao reimprimir. Rode o PASSO-11 no Supabase.");
      const { error: erroUpdate } = await supabase
        .from("fila_impressao")
        .update({ reimpressoes: (job.reimpressoes ?? 0) + 1 })
        .eq("id", job.id);
      if (erroUpdate) throw new Error("Reimpressão na fila, mas falha ao atualizar a origem.");
      toast.success("Reimpressão na fila.");
      fila.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reimprimir");
    }
  }

  async function tentarNovamente(job: { id: string }) {
    try {
      const { error } = await supabase
        .from("fila_impressao")
        .update({
          status: "pendente",
          tentativa: 0,
          ultimo_erro: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      if (error) throw new Error("Falha ao retornar o trabalho para a fila.");
      toast.success("Trabalho de volta à fila.");
      fila.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  }

  async function cancelarJob(job: { id: string }) {
    if (!window.confirm("Cancelar este trabalho de impressão?")) return;
    try {
      const { error } = await supabase
        .from("fila_impressao")
        .update({ status: "cancelado", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      if (error) throw new Error("Falha ao cancelar o trabalho.");
      toast.success("Trabalho cancelado.");
      fila.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  }

  void textoCupom;
  if (!isStaff) return <p className="p-10 text-center text-muted-foreground">Acesso da equipe.</p>;

  const pendentes = ((fila.data ?? []) as any[]).filter(
    (j) => j.status === "pendente" || j.status === "enviando",
  );
  const maisAntigo = pendentes.reduce<number | null>((acc, j) => {
    const t = +new Date(j.created_at);
    return acc == null || t < acc ? t : acc;
  }, null);
  const idadeMin = maisAntigo == null ? 0 : Math.round((Date.now() - maisAntigo) / 60000);

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
      <div className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          titulo="Fila de Impressão"
          descricao="Tanca TP-550 via agente Windows. Anti-duplicidade por uuid."
        />
        {pendentes.length > 0 && idadeMin >= 3 ? (
          <p className="mt-2 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
            ⚠️ {pendentes.length} trabalho(s) parado(s) há {idadeMin} min. O agente pode estar
            offline (notebook desligado?). A fila é mantida — nada será perdido nem duplicado.
          </p>
        ) : null}
        <Button onClick={testar} disabled={enviando} className="mt-4">
          🖨️ Testar Impressora
        </Button>
        <div className="mt-6 space-y-2">
          {(fila.data ?? []).map(
            (j: {
              id: string;
              trabalho_uuid: string;
              status: string;
              tentativa: number;
              payload: string;
              pedido_id: string | null;
              reimpressoes: number;
              ultimo_erro?: string | null;
            }) => (
              <div
                key={j.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs" title={j.trabalho_uuid}>
                    {j.trabalho_uuid}
                  </div>
                  <div className="text-muted-foreground">
                    {j.status} • tentativas {j.tentativa} • reimp {j.reimpressoes}
                  </div>
                  {j.status === "erro" && j.ultimo_erro ? (
                    <div className="mt-1 break-all text-xs text-destructive">{j.ultimo_erro}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {j.status === "erro" ? (
                    <Button variant="outline" size="sm" onClick={() => tentarNovamente(j)}>
                      ↻ Tentar
                    </Button>
                  ) : null}
                  {j.status === "pendente" || j.status === "erro" ? (
                    <Button variant="ghost" size="sm" onClick={() => cancelarJob(j)}>
                      ✕
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => reimprimir(j)}>
                    🔁 Reimprimir
                  </Button>
                </div>
              </div>
            ),
          )}
          {(fila.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Fila vazia.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
