import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ajuda")({
  head: () => ({ meta: [{ title: "Central de Ajuda — Néia Salgados" }] }),
  component: Ajuda,
});

const ITENS = [
  ["pedidos", "Como acompanho meu pedido?", "Conta → Meus pedidos. Retirada mostra Pronto para retirada / Retirado; entrega mostra saída e rota."],
  ["combos", "Por que combos são de 50 em 50?", "Festa: 50, 100, 150… Congelados e bebidas vendem por unidade."],
  ["agendamento", "Posso agendar?", "Seg–Sáb 08–12h e 13–22h, nunca 12–13h, Dom fechado, 30min de antecedência."],
  ["pagamento", "Como pago?", "PIX (QR/Copia e Cola), dinheiro, crédito, débito. Começa pendente; a loja confirma."],
  ["cancelamento", "Posso cancelar?", "Você pode cancelar pedido recebido. Depois disso, fale no WhatsApp."],
];

function Ajuda() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Central de Ajuda</h1>
      <p className="mt-2 text-sm text-muted-foreground">Busque por pedidos, combos, entrega, pagamento, agendamento, fidelidade e mais.</p>
      <div className="mt-6 space-y-3">
        {ITENS.map(([cat, t, corpo]) => (
          <details key={t} className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer font-semibold">{t} <span className="ml-2 text-xs text-muted-foreground">{cat}</span></summary>
            <p className="mt-2 text-sm text-muted-foreground">{corpo}</p>
          </details>
        ))}
      </div>
      <p className="mt-4 text-sm">Não encontrei uma resposta segura para essa dúvida. Posso encaminhar você para um atendente.</p>
    </div>
  );
}
