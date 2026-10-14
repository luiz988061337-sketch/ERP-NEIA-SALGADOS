import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";

/** Aba Fornecedores: cadastro simples (nome, CNPJ, contato, prazo, pagamento). */
export function FornecedoresAdmin() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<any | null>(null);

  const { data: lista } = useQuery({
    queryKey: ["estoque-fornecedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get("nome") ?? "").trim();
    if (nome.length < 2) {
      toast.error("Informe o nome do fornecedor.");
      return;
    }
    const body = {
      nome,
      cnpj: String(f.get("cnpj") ?? "").trim(),
      contato: String(f.get("contato") ?? "").trim(),
      prazo_entrega_dias: Number(f.get("prazo_entrega_dias") ?? 7) || 0,
      condicoes_pagamento: String(f.get("condicoes_pagamento") ?? "").trim(),
      ativo: f.get("ativo") === "on",
    };
    const { error } = editando?.id
      ? await supabase.from("fornecedores").update(body).eq("id", editando.id)
      : await supabase.from("fornecedores").insert(body);
    if (error) {
      toast.error("Falha ao salvar. Rode a migration 0075.");
      return;
    }
    void logAdmin(editando?.id ? "fornecedor_alterado" : "fornecedor_criado", nome);
    setEditando(null);
    (e.target as HTMLFormElement).reset();
    toast.success("Fornecedor salvo.");
    queryClient.invalidateQueries({ queryKey: ["estoque-fornecedores"] });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Fornecedores</h2>
        <ul className="mt-2 divide-y divide-border">
          {(lista ?? []).map((f: any) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{f.nome}{f.ativo ? "" : " (inativo)"}</span>
                <span className="block text-xs text-muted-foreground">prazo {f.prazo_entrega_dias}d • {f.contato || "sem contato"}{f.cnpj ? ` • ${f.cnpj}` : ""}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditando(f)}>Editar</Button>
            </li>
          ))}
          {(lista ?? []).length === 0 && <li className="py-4 text-sm text-muted-foreground">Nenhum fornecedor.</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">{editando?.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>
        <form onSubmit={salvar} className="mt-3 grid gap-3 sm:grid-cols-2" key={editando?.id ?? "novo"}>
          <div className="space-y-1"><Label>Nome *</Label><Input name="nome" required defaultValue={editando?.nome ?? ""} /></div>
          <div className="space-y-1"><Label>CNPJ</Label><Input name="cnpj" defaultValue={editando?.cnpj ?? ""} /></div>
          <div className="space-y-1"><Label>Contato</Label><Input name="contato" defaultValue={editando?.contato ?? ""} placeholder="telefone, e-mail, vendedor…" /></div>
          <div className="space-y-1"><Label>Prazo de entrega (dias)</Label><Input name="prazo_entrega_dias" type="number" min="0" defaultValue={editando?.prazo_entrega_dias ?? 7} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Condições de pagamento</Label><Input name="condicoes_pagamento" defaultValue={editando?.condicoes_pagamento ?? ""} placeholder="à vista, 30/60 dias…" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={editando?.ativo ?? true} /> Ativo</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Salvar</Button>
            {editando && <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>}
          </div>
        </form>
      </section>
    </div>
  );
}
