import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import { pontoEquilibrio } from "@/lib/financeiro";
import { Panel } from "./layout";

export function SimuladorFinanceiro() {
  const [receita, setReceita] = useState("");
  const [custosFixos, setCustosFixos] = useState("");
  const [custosVariaveis, setCustosVariaveis] = useState("");
  const campos = [receita, custosFixos, custosVariaveis];
  const preenchido = campos.every((valor) => valor !== "" && Number.isFinite(Number(valor)) && Number(valor) >= 0);
  const margem = Number(receita) - Number(custosVariaveis);
  const proporcao = Number(receita) > 0 ? margem / Number(receita) : 0;
  const equilibrio = preenchido ? pontoEquilibrio(Number(custosFixos), proporcao) : null;

  return (
    <div id="simulacoes-financeiro" className="fp-app fp-resumo-operacional">
      <Panel title="Simulador financeiro" icon={FlaskConical}>
        <p className="mb-3 text-sm text-muted-foreground">Preencha um cenário mensal para calcular a margem e o ponto de equilíbrio.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["Receita líquida (R$)", receita, setReceita],
            ["Custos fixos (R$)", custosFixos, setCustosFixos],
            ["Custos variáveis (R$)", custosVariaveis, setCustosVariaveis],
          ] as const).map(([label, valor, mudar]) => (
            <label key={label} className="grid gap-1.5 text-sm font-semibold">
              {label}
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={valor}
                onChange={(event) => mudar(event.target.value)} />
            </label>
          ))}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3" aria-live="polite">
          <div><dt>Margem de contribuição</dt><dd className="text-lg font-bold">{preenchido ? brl(margem) : "—"}</dd></div>
          <div><dt>Resultado simulado</dt><dd className="text-lg font-bold">{preenchido ? brl(margem - Number(custosFixos)) : "—"}</dd></div>
          <div><dt>Ponto de equilíbrio</dt><dd className="text-lg font-bold">{equilibrio == null ? "—" : brl(equilibrio)}</dd></div>
        </dl>
      </Panel>
    </div>
  );
}
