import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/parceiros")({
  head: () => ({ meta: [{ title: "Nossos Parceiros — Néia Salgados" }] }),
  component: Parceiros,
});

function Parceiros() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Nossos Parceiros</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A Néia Salgados <strong>não presta serviço de buffet/eventos</strong>. Os parceiros abaixo são
        independentes (buffet, decoração, doces, bolos, fotografia, cerimonial, salão, entretenimento).
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm">
        <p>Lista de parceiros aprovados aparece aqui (tabela <code>parceiros</code>, migration 0028).</p>
        <Link to="/orcamentos" className="mt-2 inline-block underline">Fazer orçamento de salgados</Link>
      </div>
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Quero ser parceiro</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie responsável, WhatsApp, e-mail, empresa, cidade, categoria e proposta pelo WhatsApp da loja.
          Status: nova → em análise → aprovada/recusada → contatada → convertida.
        </p>
      </div>
    </div>
  );
}
