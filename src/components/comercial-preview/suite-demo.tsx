import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import comercialCss from "@/components/comercial-preview/comercial.css?url";
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

/** Deep-link de navegação: /clientes#clientes, /campanhas#campanhas etc. */
const abaDaHash = () => {
  try {
    const valor = window.location.hash.replace(/^#/, "");
    return VALORES.includes(valor as (typeof VALORES)[number]) ? valor : null;
  } catch {
    return null;
  }
};

export function SuiteComercialDemo({ abaInicial = "painel" }: { abaInicial?: string }) {
  const [aba, setAba] = useState<string>(() => abaDaHash() ?? abaInicial);
  useEffect(() => {
    const aoMudarHash = () => {
      const destino = abaDaHash();
      if (destino) setAba(destino);
    };
    window.addEventListener("hashchange", aoMudarHash);
    return () => window.removeEventListener("hashchange", aoMudarHash);
  }, []);
  return (
    <>
      <link rel="stylesheet" href={comercialCss} />
      <ComercialProviderLayout>
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
