import { ChartNoAxesCombined, FlaskConical, Layers, ListChecks, ReceiptText, Target, Wallet } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

const ABAS = [
  ["lancamentos", "Lançamentos", ListChecks],
  ["custos", "Custos fixos e variáveis", Layers],
  ["contas-financeiro", "Contas a pagar e receber", ReceiptText],
  ["caixa", "Caixa", Wallet],
  ["fiscal", "Fiscal / Obrigações", ReceiptText],
  ["equilibrio", "Ponto de equilíbrio", Target],
  ["simulacoes", "Simulações", FlaskConical],
  ["relatorios", "Relatórios e gráficos", ChartNoAxesCombined],
] as const;

export type AbaFinanceiroPremium = (typeof ABAS)[number][0];

export function FinanceiroAbas({
  abas,
  ativa,
}: {
  abas: readonly AbaFinanceiroPremium[];
  ativa: AbaFinanceiroPremium;
}) {
  return (
    <TabsList className="fp-tabs fp-frame fp-abas" id="gestao-financeira" aria-label="Gestão financeira">
      {ABAS.filter(([id]) => abas.includes(id)).map(([id, label, Icone]) => (
        <TabsTrigger key={id} value={id} className={ativa === id ? "is-active" : ""}>
          <Icone aria-hidden />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
