import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { dataHora } from "@/lib/format";
import { logAdmin } from "@/lib/operacao";

export type Nota = {
  id: string;
  texto: string;
  visivel_cliente: boolean;
  created_at: string;
};

function useNotas(pedidoId: string, visiveisApenas: boolean) {
  return useQuery({
    queryKey: ["pedido-notas", pedidoId, visiveisApenas],
    queryFn: async (): Promise<Nota[]> => {
      try {
        let q = supabase.from("pedido_notas").select("id, texto, visivel_cliente, created_at").eq("pedido_id", pedidoId).order("created_at");
        if (visiveisApenas) q = q.eq("visivel_cliente", true);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as Nota[];
      } catch {
        return [];
      }
    },
  });
}

/** Timeline visível ao cliente (só notas marcadas como visíveis). */
export function NotasCliente({ pedidoId }: { pedidoId: string }) {
  const { data: notas } = useNotas(pedidoId, true);
  if (!notas || notas.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-sm" aria-label="Atualizações do pedido">
      <h2 className="font-display text-xl">Atualizações</h2>
      <ul className="mt-2 space-y-1.5">
        {notas.map((n) => (
          <li key={n.id} className="rounded-lg bg-muted p-2.5">
            <p>{n.texto}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{dataHora(n.created_at)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Timeline completa + registro (staff). Interna por padrão; visível só se marcado. */
export function NotasAdmin({ pedidoId, numero }: { pedidoId: string; numero: number }) {
  const queryClient = useQueryClient();
  const { data: notas } = useNotas(pedidoId, false);
  const [texto, setTexto] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function adicionar() {
    const t = texto.trim().slice(0, 300);
    if (!t) return;
    setEnviando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("pedido_notas").insert({
        pedido_id: pedidoId,
        autor: u.user?.id ?? null,
        texto: t,
        visivel_cliente: visivel,
      });
      if (error) throw error;
      setTexto("");
      setVisivel(false);
      toast.success("Nota registrada.");
      void logAdmin("pedido_nota", `#${numero}${visivel ? " (visível)" : " (interna)"}`);
      queryClient.invalidateQueries({ queryKey: ["pedido-notas", pedidoId] });
    } catch {
      toast.error("Não foi possível salvar. Rode a migração 0008 no Supabase.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-border p-2.5 text-xs">
      <p className="font-semibold">Comunicação do pedido #{numero}</p>
      {(notas ?? []).length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {(notas ?? []).map((n) => (
            <li key={n.id} className="rounded bg-muted p-1.5">
              <span className="mr-1 rounded bg-background px-1">{n.visivel_cliente ? "👁 cliente" : "🔒 interna"}</span>
              {n.texto} <span className="text-muted-foreground">• {dataHora(n.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">Nenhuma nota. Interna nunca aparece para o cliente.</p>
      )}
      <div className="mt-2 flex gap-1.5">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex: cliente pediu troca de sabor…" maxLength={300} className="h-8 text-xs" />
        <Button size="sm" className="h-8" disabled={enviando || !texto.trim()} onClick={adicionar}>Salvar</Button>
      </div>
      <div className="mt-1.5 space-y-1">
        <Label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} /> Visível para o cliente
        </Label>
      </div>
    </div>
  );
}
