import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { textoTeste, textoCupom } from "@/lib/impressao";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/impressao")({
  head: () => ({ meta: [{ title: "Impressão — Néia Salgados" }] }),
  component: Fila,
});

function Fila() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isStaff = roles?.includes("admin") || roles?.includes("producao") || roles?.includes("atendente");
  const [enviando, setEnviando] = useState(false);
  const fila = useQuery({
    queryKey: ["fila-impressao"],
    enabled: !!isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("fila_impressao").select("*").order("created_at", { ascending: false }).limit(50);
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

  async function reimprimir(job: { id: string; payload: string; pedido_id: string | null; reimpressoes: number }) {
    try {
      await supabase.from("fila_impressao").insert({
        trabalho_uuid: `reimp:${job.id}:${Date.now()}`,
        pedido_id: job.pedido_id,
        tipo: "pedido",
        payload: job.payload,
        impressora: "Tanca TP-550",
        motivo_reimpressao: "manual",
      });
      await supabase.from("fila_impressao").update({ reimpressoes: (job.reimpressoes ?? 0) + 1 }).eq("id", job.id);
      toast.success("Reimpressão na fila.");
      fila.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reimprimir");
    }
  }

  void textoCupom;
  if (!isStaff) return <p className="p-10 text-center text-muted-foreground">Acesso da equipe.</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl">Fila de Impressão</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tanca TP-550 via agente Windows. Anti-duplicidade por uuid.</p>
      <Button onClick={testar} disabled={enviando} className="mt-4">🖨️ Testar Impressora</Button>
      <div className="mt-6 space-y-2">
        {(fila.data ?? []).map((j: { id: string; trabalho_uuid: string; status: string; tentativa: number; payload: string; pedido_id: string | null; reimpressoes: number }) => (
          <div key={j.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
            <div>
              <div className="font-mono text-xs">{j.trabalho_uuid}</div>
              <div className="text-muted-foreground">{j.status} • tentativas {j.tentativa} • reimp {j.reimpressoes}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => reimprimir(j)}>🔁 Reimprimir</Button>
          </div>
        ))}
        {(fila.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Fila vazia.</p> : null}
      </div>
    </div>
  );
}
