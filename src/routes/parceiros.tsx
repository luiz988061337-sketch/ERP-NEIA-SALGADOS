import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

export const Route = createFileRoute("/parceiros")({
  head: () => ({ meta: [{ title: "Nossos Parceiros — Néia Salgados" }] }),
  component: Parceiros,
});

const CATEGORIAS = ["buffet", "decoracao", "doces", "bolos", "fotografia", "cerimonial", "salao", "entretenimento", "outros"];

function Parceiros() {
  const [enviando, setEnviando] = useState(false);
  const { data: lista } = useQuery({
    queryKey: ["parceiros-aprovados"],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("parceiros_publicos").select("*").order("nome");
        return (data ?? []) as any[];
      } catch { return []; }
    },
  });

  async function candidatar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const { error } = await supabase.from("parceiros").insert({
        responsavel: String(f.get("responsavel") ?? ""),
        whatsapp: String(f.get("whatsapp") ?? ""),
        email: String(f.get("email") ?? ""),
        nome: String(f.get("empresa") ?? ""),
        cidade: String(f.get("cidade") ?? ""),
        bairro: String(f.get("bairro") ?? ""),
        categoria: String(f.get("categoria") ?? "outros"),
        descricao: String(f.get("descricao") ?? ""),
        proposta: String(f.get("proposta") ?? ""),
        autoriza_divulgacao: String(f.get("autoriza") ?? "") === "on",
        status: "nova",
      });
      if (error) throw error;
      toast.success("Candidatura enviada! Vamos analisar e entrar em contato.");
      (e.target as HTMLFormElement).reset();
    } catch {
      toast.error("Não foi possível enviar. Chame no WhatsApp da loja.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Nossos Parceiros</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A Néia Salgados <strong>não presta serviço de buffet/eventos</strong>. Os parceiros abaixo são
        independentes (buffet, decoração, doces, bolos, fotografia, cerimonial, salão, entretenimento).
      </p>
      <div className="mt-6 grid gap-3">
        {(lista ?? []).map((p: any) => (
          <article key={p.id} className="rounded-xl border border-border bg-card p-4 text-sm">
            <p className="font-display text-lg">{p.nome}</p>
            <p className="text-xs text-muted-foreground">{p.categoria}{p.cidade ? ` • ${p.cidade}` : ""}{p.bairro ? ` — ${p.bairro}` : ""}</p>
            {p.descricao ? <p className="mt-1 text-muted-foreground">{p.descricao}</p> : null}
          </article>
        ))}
        {(lista ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Em breve, parceiros aprovados aqui. <Link to="/orcamentos" className="underline">Fazer orçamento de salgados</Link>
          </p>
        ) : null}
      </div>
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Quero ser parceiro</h2>
        <form onSubmit={candidatar} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Responsável *</Label><Input name="responsavel" required maxLength={100} /></div>
          <div className="space-y-1.5"><Label>WhatsApp *</Label><Input name="whatsapp" required placeholder="(11) 90000-0000" /></div>
          <div className="space-y-1.5"><Label>E-mail</Label><Input name="email" type="email" /></div>
          <div className="space-y-1.5"><Label>Empresa *</Label><Input name="empresa" required maxLength={100} /></div>
          <div className="space-y-1.5"><Label>Cidade</Label><Input name="cidade" maxLength={100} /></div>
          <div className="space-y-1.5"><Label>Bairro</Label><Input name="bairro" maxLength={100} /></div>
          <div className="space-y-1.5"><Label>Categoria *</Label>
            <select name="categoria" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="outros">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Proposta / descrição</Label><Textarea name="descricao" rows={3} maxLength={500} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Região atendida</Label><Input name="proposta" maxLength={200} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="autoriza" className="size-4" /> Autorizo divulgar minha empresa aqui</label>
          <Button type="submit" className="sm:col-span-2" disabled={enviando}>{enviando ? "Enviando…" : "Enviar candidatura"}</Button>
        </form>
      </div>
    </div>
  );
}
