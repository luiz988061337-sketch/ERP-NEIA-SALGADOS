import { createFileRoute, useLocation } from "@tanstack/react-router";
import comercialCss from "@/components/comercial-preview/comercial.css?url";
import campanhasCss from "@/components/comercial-preview/campanhas.css?url";
import pesquisasCss from "@/components/comercial-preview/pesquisas-reclamacoes.css?url";
import sugestoesCss from "@/components/comercial-preview/sugestoes.css?url";
import resultadosCss from "@/components/comercial-preview/resultados.css?url";
import padraoCss from "@/components/comercial-preview/comercial-padrao-h06b.css?url";
import { SuiteComercialDemo } from "@/components/comercial-preview/suite-demo";

/**
 * Layout pai C1 — Preview Comercial.
 * Todos os itens do grupo Comercial na lateral abrem a suíte completa:
 * a rota escolhida define apenas a aba inicial. Assim os painéis ficam
 * sempre disponíveis no menu lateral, sem telas isoladas.
 */
const ABA_DA_ROTA: Record<string, string> = {
  "/preview/comercial/painel": "painel",
  "/preview/comercial/clientes": "clientes",
  "/preview/comercial/campanhas": "campanhas",
  "/preview/comercial/pesquisas-reclamacoes": "pesquisas",
  "/preview/comercial/sugestoes": "sugestoes",
  "/preview/comercial/resultados": "resultados",
};

export const Route = createFileRoute("/preview/comercial")({
  head: () => ({
    links: [
      { rel: "stylesheet", href: comercialCss },
      { rel: "stylesheet", href: campanhasCss },
      { rel: "stylesheet", href: pesquisasCss },
      { rel: "stylesheet", href: sugestoesCss },
      { rel: "stylesheet", href: resultadosCss },
      { rel: "stylesheet", href: padraoCss },
    ],
  }),
  component: Layout,
});

function Layout() {
  const pathname = useLocation({ select: (s) => s.pathname });
  const abaInicial = ABA_DA_ROTA[pathname] ?? "painel";
  // Remontar ao trocar de rota garante que a aba siga o item clicado na lateral.
  return <SuiteComercialDemo key={pathname} abaInicial={abaInicial} />;
}
