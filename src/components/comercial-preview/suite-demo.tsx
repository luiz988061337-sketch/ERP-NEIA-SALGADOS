import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import comercialCss from "@/components/comercial-preview/comercial.css?url";
import campanhasCss from "@/components/comercial-preview/campanhas.css?url";
import pesquisasCss from "@/components/comercial-preview/pesquisas-reclamacoes.css?url";
import sugestoesCss from "@/components/comercial-preview/sugestoes.css?url";
import resultadosCss from "@/components/comercial-preview/resultados.css?url";
import padraoCss from "@/components/comercial-preview/comercial-padrao-h06b.css?url";
import { ComercialProviderLayout } from "@/components/comercial-preview/shell";
import { PainelComercial } from "@/components/comercial-preview/tela-painel";
import { ClientesSegmentacao } from "@/components/comercial-preview/tela-clientes";
import { TelaCampanhas } from "@/components/comercial-preview/tela-campanhas";
import { TelaPesquisasReclamacoes } from "@/components/comercial-preview/tela-pesquisas-reclamacoes";
import { TelaSugestoes } from "@/components/comercial-preview/tela-sugestoes";
import { TelaResultados } from "@/components/comercial-preview/tela-resultados";

/**
 * Integração visual das telas C1–C5 nas rotas operacionais /clientes e
 * /campanhas. Somente usada no Preview de homologação (VITE_DEMO_PREVIEW=1):
 * todos os componentes abaixo são demonstrativos e não acessam o Supabase.
 * O ComercialProviderLayout é o mesmo shell aprovado das prévias C1–C5.
 */
const ABAS = [
  { valor: "painel", rotulo: "Painel", Conteudo: PainelComercial },
  { valor: "clientes", rotulo: "Clientes", Conteudo: ClientesSegmentacao },
  { valor: "campanhas", rotulo: "Campanhas", Conteudo: TelaCampanhas },
  { valor: "pesquisas", rotulo: "Pesquisas e Reclamações", Conteudo: TelaPesquisasReclamacoes },
  { valor: "sugestoes", rotulo: "Sugestões", Conteudo: TelaSugestoes },
  { valor: "resultados", rotulo: "Resultados", Conteudo: TelaResultados },
] as const;

const VALORES = ABAS.map((a) => a.valor);

/** Deep-link de navegação: /clientes#campanhas, /campanhas#resultados etc. */
const abaDaHash = (hash: string) => {
  const valor = hash.replace(/^#/, "");
  return VALORES.includes(valor as (typeof VALORES)[number]) ? valor : null;
};

export function SuiteComercialDemo({ abaInicial = "painel" }: { abaInicial?: string }) {
  const [aba, setAba] = useState<string>(abaInicial);
  // O hash não existe no SSR: aplicar o deep-link uma única vez após a
  // montagem. A suíte nunca escreve na URL — trocas locais de aba ficam só no
  // estado, preservando a navegação do router e o comportamento do Radix Tabs.
  useEffect(() => {
    const aplicarDeepLink = () => {
      const destino = abaDaHash(window.location.hash);
      if (destino) setAba(destino);
    };
    aplicarDeepLink();
    window.addEventListener("hashchange", aplicarDeepLink);
    return () => window.removeEventListener("hashchange", aplicarDeepLink);
  }, []);
  return (
    <>
      <link rel="stylesheet" href={comercialCss} />
      <link rel="stylesheet" href={campanhasCss} />
      <link rel="stylesheet" href={pesquisasCss} />
      <link rel="stylesheet" href={sugestoesCss} />
      <link rel="stylesheet" href={resultadosCss} />
      <link rel="stylesheet" href={padraoCss} />
      <ComercialProviderLayout abaSuite={aba}>
        <Tabs value={aba} onValueChange={setAba} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            {ABAS.map(({ valor, rotulo }) => (
              <TabsTrigger key={valor} value={valor} className="text-sm">
                {rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
          {ABAS.map(({ valor, Conteudo }) => (
            <TabsContent key={valor} value={valor} className="mt-4">
              <Conteudo />
            </TabsContent>
          ))}
        </Tabs>
      </ComercialProviderLayout>
    </>
  );
}
