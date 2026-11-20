import { useState } from "react";
import { AlertTriangle, BarChart3, Calculator, CheckCircle2, CircleDollarSign, Package, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PremiumKpi, PremiumPageHeader, PremiumSection } from "@/components/admin/erp-ui";
import { brl } from "@/lib/format";
import { DONO_PREMIUM_DEMO } from "@/lib/contabilidade-premium-demo";
import { ehModoDemo } from "@/lib/demo-preview";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type CorAlerta = "gold" | "green" | "blue" | "orange" | "red";

function KpiDono({ icone: Icone, rotulo, valor, detalhe, tint = "gold" }: { icone: LucideIcon; rotulo: string; valor: string; detalhe?: string | undefined; tint?: "gold" | "green" | "blue" | "orange" | "red" }) {
  return (
    <PremiumKpi
      posicao="esquerda"
      tint={tint}
      rotulo={rotulo}
      valor={valor}
      detalhe={detalhe}
      icone={Icone}
      cor={tint === "green" ? "#35C97C" : tint === "blue" ? "#5B93F5" : tint === "orange" ? "#F5A623" : tint === "red" ? "#F16A6A" : "#F2CE6B"}
    />
  );
}

export function DonoPremium() {
  const modoDemo = ehModoDemo();
  const d = DONO_PREMIUM_DEMO;
  const [mes, setMes] = useState("2026-11");

  const kpis = [
    { icone: CircleDollarSign, rotulo: "Faturamento", valor: brl(d.faturamento), detalhe: `${d.qtdPedidos} pedidos • média de ${brl(d.ticket)}`, tint: "gold" as CorAlerta, cor: "#F2CE6B" },
    { icone: CheckCircle2, rotulo: "Pagos", valor: brl(d.pagamentos), detalhe: "pagamento confirmado", tint: "green" as CorAlerta, cor: "#35C97C" },
    { icone: Calculator, rotulo: "Resultado (DRE)", valor: brl(d.resultado), detalhe: `${d.margemPct.toFixed(1)}% margem`, tint: "green" as CorAlerta, cor: "#35C97C" },
    { icone: CircleDollarSign, rotulo: "Ticket médio", valor: brl(d.ticket), detalhe: "ticket médio do período", tint: "gold" as CorAlerta, cor: "#F2CE6B" },
    { icone: TrendingUp, rotulo: "Vs. mês anterior", valor: `+${d.vsMesAnterior.toFixed(1)}%`, detalhe: "faturamento comparado ao mês anterior", tint: "blue" as CorAlerta, cor: "#5B93F5" },
    { icone: CircleDollarSign, rotulo: "Previsão", valor: brl(d.previsao), detalhe: `ritmo de ${d.previsaoRitmo} dias`, tint: "orange" as CorAlerta, cor: "#F5A623" },
  ];

  return (
    <div className="space-y-5 pb-28">
      <PremiumPageHeader
        icone={TrendingUp}
        titulo="Relatório do Dono"
        subtitulo="Faturamento, DRE, margem por produto, bairros e alertas do mês."
        demo={modoDemo}
        acoes={
          <Input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            aria-label="Mês"
            className="h-9 w-44 border-[#D4A94A]/50 bg-[#141310] text-[13px] text-[#F4F1EA]"
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <KpiDono key={k.rotulo} icone={k.icone} rotulo={k.rotulo} valor={k.valor} detalhe={k.detalhe} tint={k.tint} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <PremiumSection
          icone={Package}
          titulo="Lucratividade (Fichas Técnicas)"
          subtitulo="Ranking de margem por produto com base nas vendas do período."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A09A8E]">Mais lucrativos</p>
              <ul className="mt-2 space-y-2">
                {d.lucratividade.top.map((o, i) => (
                  <li
                    key={o.nome}
                    className="flex items-center gap-3 rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#D4A94A]/70 bg-[#1A1712] text-[11px] font-bold text-[#F2CE6B]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#F4F1EA]">{o.nome}</p>
                      <p className="text-[12px] text-[#A09A8E]">{brl(o.preco)} · custo {brl(o.custo)}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: "rgba(53,201,124,.18)", color: "#35C97C" }}
                    >
                      {o.margem.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A09A8E]">Menos lucrativos</p>
              <ul className="mt-2 space-y-2">
                {d.lucratividade.piores.map((o, i) => (
                  <li
                    key={o.nome}
                    className="flex items-center gap-3 rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#2A2721] bg-[#17150F] text-[11px] font-bold text-[#A09A8E]">
                      {i + 4}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#F4F1EA]">{o.nome}</p>
                      <p className="text-[12px] text-[#A09A8E]">{brl(o.preco)} · custo {brl(o.custo)}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: "rgba(241,106,106,.16)", color: "#F16A6A" }}
                    >
                      {o.margem.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {d.lucratividade.semFicha > 0 ? (
            <p className="mt-3 text-[12px] leading-snug text-[#A09A8E]">
              {d.lucratividade.semFicha} produto(s) vendido(s) sem ficha.
            </p>
          ) : null}
        </PremiumSection>

        <PremiumSection
          icone={BarChart3}
          titulo="Por Bairro e Canal"
          subtitulo="Distribuição do faturamento por localidade e forma de pagamento."
          acoes={
            <Button type="button" variant="outline" size="sm" className="min-h-8 border-[#D4A94A]/60 text-[#F2CE6B] hover:bg-[#1A1712]">
              Exportar CSV
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A09A8E]">Bairros</p>
              <ul className="mt-2 space-y-1.5">
                {d.bairros.map((b) => (
                  <li key={b.nome} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate text-[#C9C2B8]">{b.nome}</span>
                    <span className="flex items-baseline gap-1.5">
                      <b className="text-[#F4F1EA]">{brl(b.total)}</b>
                      <span className="text-[#A09A8E]">{b.pct.toFixed(1)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A09A8E]">Canais (pagamento)</p>
              <ul className="mt-2 space-y-1.5">
                {d.canais.map((c) => (
                  <li key={c.nome} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate text-[#C9C2B8]">{c.nome}</span>
                    <span className="flex items-baseline gap-1.5">
                      <b className="text-[#F4F1EA]">{brl(c.total)}</b>
                      <span className="text-[#A09A8E]">{c.pct.toFixed(1)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A09A8E]">Por horário</p>
              <ul className="mt-2 space-y-1.5">
                {d.horarios.map((h) => (
                  <li key={h.rotulo} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-[#C9C2B8]">{h.rotulo}</span>
                    <span className="flex items-baseline gap-1.5">
                      <b className="text-[#F4F1EA]">{h.qtd}</b>
                      <span className="text-[#A09A8E]">{h.pct.toFixed(1)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PremiumSection>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <PremiumSection
          icone={AlertTriangle}
          titulo="Alertas do Dono"
          subtitulo="Pontos de atenção para a gestão do mês."
        >
          <div className="space-y-2.5">
            {d.alertas.map((a) => (
              <div
                key={a.titulo}
                className="rounded-lg border border-[#2A2721] bg-[#141310] p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: a.cor }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[#F4F1EA]">{a.titulo}</p>
                    <p className="text-[12px] leading-snug text-[#A09A8E]">{a.texto}</p>
                  </div>
                  {a.acao ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 border-[#D4A94A]/60 px-2 text-[11px] text-[#F2CE6B] hover:bg-[#1A1712]"
                      onClick={() => toast.info(`Ação demonstrativa: ${a.acao}`)}
                    >
                      {a.acao}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </PremiumSection>

        <PremiumSection
          icone={Calculator}
          titulo="DRE — Demonstração"
          subtitulo="Resultado do período · demonstração isolada."
        >
          <div className="space-y-2">
            {[
              { rotulo: "Faturamento bruto", valor: brl(d.faturamento), destaque: false },
              { rotulo: "CMV (custo)", valor: brl(d.cmv), destaque: false },
              { rotulo: "Despesas operacionais", valor: brl(d.despesas), destaque: false },
              { rotulo: "Resultado", valor: brl(d.resultado), destaque: true },
            ].map((r) => (
              <div
                key={r.rotulo}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
                  r.destaque
                    ? "border-[#D4A94A] bg-[#211B0F]"
                    : "border-[#2A2721] bg-[#141310]",
                )}
              >
                <span className="text-[13px] text-[#A09A8E]">{r.rotulo}</span>
                <b className={cn("font-display text-[16px]", r.destaque ? "text-[#F2CE6B]" : "text-[#F4F1EA]")}>
                  {r.valor}
                </b>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-snug text-[#A09A8E]">
            Margem sobre faturamento: {d.margemPct.toFixed(1)}% · DRE demonstrativo isolado: nenhuma
            alteração contábil é aplicada.
          </p>
        </PremiumSection>
      </div>
    </div>
  );
}
