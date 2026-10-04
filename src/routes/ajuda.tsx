import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

export const Route = createFileRoute("/ajuda")({
  head: () => ({ meta: [{ title: "Central de Ajuda — Néia Salgados" }] }),
  component: Ajuda,
});

const FALLBACK = [
  ["pedidos", "Como acompanho meu pedido?", "Conta → Meus pedidos. Retirada mostra Pronto para retirada / Retirado; entrega mostra saída e rota."],
  ["combos", "Por que combos são de 50 em 50?", "Festa: 50, 100, 150… Congelados e bebidas vendem por unidade."],
  ["agendamento", "Posso agendar?", "Seg–Sáb 08–12h e 13–22h, nunca 12–13h, Dom fechado, 30min de antecedência."],
  ["pagamento", "Como pago?", "PIX (QR/Copia e Cola), dinheiro, crédito, débito. Começa pendente; a loja confirma."],
  ["cancelamento", "Posso cancelar?", "Você pode cancelar pedido recebido. Depois disso, fale no WhatsApp."],
];

function Ajuda() {
  const [busca, setBusca] = useState("");
  const { data } = useQuery({
    queryKey: ["ajuda-artigos"],
    queryFn: async () => {
      try {
        const { data } = await supabase.from("ajuda_artigos").select("*").eq("ativo", true).order("categoria").limit(200);
        return (data ?? []) as any[];
      } catch { return []; }
    },
  });
  const itens = useMemo(() => {
    const base = (data ?? []).length > 0
      ? (data ?? []).map((a: any) => [a.categoria, a.titulo, a.corpo])
      : FALLBACK;
    const t = busca.trim().toLowerCase();
    if (!t) return base;
    return base.filter(([c, titulo, corpo]) => `${c} ${titulo} ${corpo}`.toLowerCase().includes(t));
  }, [data, busca]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Central de Ajuda</h1>
      <p className="mt-2 text-sm text-muted-foreground">Busque por pedidos, combos, entrega, pagamento, agendamento, fidelidade e mais.</p>
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar dúvida…" className="mt-4" />
      <div className="mt-6 space-y-3">
        {itens.map(([cat, t, corpo]) => (
          <details key={`${cat}-${t}`} className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-semibold">{t} <span className="ml-2 text-xs text-muted-foreground">{cat}</span></summary>
            <p className="mt-2 text-sm text-muted-foreground">{corpo}</p>
          </details>
        ))}
        {itens.length === 0 ? <p className="text-sm text-muted-foreground">Nada encontrado para “{busca}”.</p> : null}
      </div>
      <p className="mt-4 text-sm">Não encontrei uma resposta segura para essa dúvida. Posso encaminhar você para um atendente.</p>
    </div>
  );
}
