import { Layers } from "lucide-react";
import { brl } from "@/lib/format";
import { Panel } from "./layout";

type CustoRegistrado = { id: string; descricao: string; valor: number };

export function CustosOperacionais({
  fixos,
  variaveis,
  semClassificacao,
  estado,
}: {
  fixos: CustoRegistrado[];
  variaveis: CustoRegistrado[];
  semClassificacao: CustoRegistrado[];
  estado: "carregando" | "erro" | "disponivel";
}) {
  if (estado !== "disponivel") {
    return <p role={estado === "erro" ? "alert" : "status"} className="p-4 text-muted-foreground">
      {estado === "erro" ? "Não foi possível consultar os custos registrados." : "Carregando custos registrados…"}
    </p>;
  }

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {([
        ["Custos fixos", fixos],
        ["Custos variáveis", variaveis],
        ["Despesas sem classificação", semClassificacao],
      ] as const).map(([titulo, linhas]) => (
        <Panel key={titulo} title={titulo} icon={Layers}>
          <dl className="fp-metric-list">
            <div><dt>Valor registrado</dt><dd>{brl(linhas.reduce((total, conta) => total + conta.valor, 0))}</dd></div>
          </dl>
          {linhas.length > 0 ? (
            <ul className="fp-metric-list">
              {linhas.map((conta) => (
                <li key={conta.id} className="flex justify-between gap-3 border-b border-border px-2 py-2">
                  <span>{conta.descricao}</span><strong>{brl(conta.valor)}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="fp-empty">Nenhum lançamento neste grupo.</p>}
        </Panel>
      ))}
    </div>
  );
}
