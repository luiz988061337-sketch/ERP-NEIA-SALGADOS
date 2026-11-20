import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarDays,
  CircleDollarSign,
  History,
  Save,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PremiumDemoBadge,
  PremiumKpi,
  PremiumPageHeader,
  PremiumSection,
  StatusBadge,
} from "@/components/admin/erp-ui";
import { brl } from "@/lib/format";
import { METAS_PREMIUM_DEMO } from "@/lib/contabilidade-premium-demo";
import { ehModoDemo } from "@/lib/demo-preview";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

function KpiMeta({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  tint = "gold",
}: { icone: LucideIcon; rotulo: string; valor: string; detalhe?: string | undefined; tint?: "gold" | "green" | "blue" | "orange" | "red" }) {
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

export function MetasPremium() {
  const modoDemo = ehModoDemo();
  const m = METAS_PREMIUM_DEMO;
  const [tipo, setTipo] = useState("mensal");
  const [periodoRef, setPeriodoRef] = useState("2026-01");
  const [valor, setValor] = useState("18000");

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const valorMeta = Number(f.get("valor") ?? 0);
    setValor(String(valorMeta));
    toast.success(`Meta ${f.get("tipo")} · ${f.get("periodo_ref")} salva (demonstração isolada).`);
  }

  const kpis: { icone: LucideIcon; rotulo: string; valor: string; detalhe?: string; tint: "gold" | "green" | "blue" | "orange" | "red" }[] = [
    { icone: Target, rotulo: "Meta ativa", valor: brl(m.ativa.valor), detalhe: `${m.ativa.tipo} · ${m.ativa.periodo_ref}`, tint: "gold" },
    { icone: CircleDollarSign, rotulo: "Realizado", valor: brl(m.ativa.realizado), detalhe: `${m.ativa.pct.toFixed(1)}% da meta`, tint: "green" },
    { icone: CircleDollarSign, rotulo: "Faltante", valor: brl(m.ativa.faltante), detalhe: `${m.ativa.diasRestantes} dias para o encerramento`, tint: "orange" },
    { icone: TrendingUp, rotulo: "Projeção do período", valor: brl(m.ativa.proxima), detalhe: `+${m.ativa.proximaVsMeta}% sobre a meta`, tint: "blue" },
    { icone: Calculator, rotulo: "Ticket médio vs meta", valor: brl(m.ativa.ticketVsMeta.valor), detalhe: `+${m.ativa.ticketVsMeta.diffPct}% vs. ${brl(m.ativa.ticketVsMeta.base)}`, tint: "green" },
    { icone: Target, rotulo: "Atingimento", valor: `${m.ativa.pct.toFixed(1)}%`, detalhe: `ritmo de ${m.ativa.ritmo.pct.toFixed(1)}%`, tint: "gold" },
  ];

  const chartData = m.chart.dias.map((d) => ({ ...d, meta: m.chart.meta, proxima: m.chart.proxima }));

  return (
    <div className="space-y-5 pb-28">
      <PremiumPageHeader
        icone={Target}
        titulo="Metas de vendas"
        subtitulo="Acompanhamento de faturamento e produtos."
        status={<PremiumDemoBadge>DEMOSTRAÇÃO ISOLADA</PremiumDemoBadge>}
        acoes={
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-[#F2CE6B]" aria-hidden />
            <Input value={periodoRef} onChange={(e) => setPeriodoRef(e.target.value)} placeholder="AAAA-MM" maxLength={7} aria-label="Competência" className="h-9 w-28 border-[#D4A94A]/50 bg-[#141310] text-[13px] text-[#F4F1EA]" />
          </div>
        }
      />

      <PremiumSection
        icone={Target}
        titulo="Definir ou Atualizar Meta"
        subtitulo="Metas do período comercial (demonstração isolada)."
      >
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[13px]">Periodicidade</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {["mensal", "semanal", "diaria"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-[13px] font-semibold uppercase tracking-wide",
                    tipo === t ? "border-[#D4A94A] bg-[#1A1712] text-[#F2CE6B]" : "border-[#2A2721] bg-[#141310] text-[#A09A8E]",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Competência</Label>
            <Input value={periodoRef} onChange={(e) => setPeriodoRef(e.target.value)} placeholder="AAAA-MM" maxLength={7} aria-label="Competência" className="h-10 border-[#D4A94A]/50 bg-[#141310] text-[14px] text-[#F4F1EA]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Valor (R$)</Label>
            <Input type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="h-10 border-[#D4A94A]/50 bg-[#141310] text-[14px] text-[#F4F1EA]" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-2">
            <Button type="submit" className="erp-btn-gold min-h-10 gap-2 font-semibold text-[#14120C]">
              <Save className="size-4" aria-hidden /> Salvar meta
            </Button>
          </div>
        </form>
      </PremiumSection>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <KpiMeta key={k.rotulo} icone={k.icone} rotulo={k.rotulo} valor={k.valor} detalhe={k.detalhe} tint={k.tint} />
        ))}
      </div>

      <PremiumSection
        icone={Target}
        titulo="Metas Cadastradas"
        subtitulo="Metas ativas com acompanhamento de faturamento."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[11px] uppercase tracking-wide text-[#C9C2B8]">
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Competência</th>
                <th className="px-3 py-2.5">Meta</th>
                <th className="px-3 py-2.5">Realizado</th>
                <th className="px-3 py-2.5">Atingimento</th>
                <th className="px-3 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2721]">
              {m.metas.map((mt) => (
                <tr key={mt.periodo_ref} className="hover:bg-[#211F18]">
                  <td className="px-3 py-3">{mt.tipo}</td>
                  <td className="px-3 py-3">{mt.periodo_ref}</td>
                  <td className="px-3 py-3 font-semibold text-[#F4F1EA]">{brl(mt.valor)}</td>
                  <td className="px-3 py-3 text-[#C9C2B8]">{brl(mt.realizado)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-[#2A2721]">
                        <div className="h-full rounded-full bg-[#35C97C]" style={{ width: `${mt.pct}%` }} />
                      </div>
                      <span className="text-[#C9C2B8]">{mt.pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <StatusBadge tom={mt.status === "superada" ? "ok" : mt.status === "atencao" ? "atencao" : "ok"}>
                      {mt.status === "superada" ? "Superada" : mt.status === "atencao" ? "Atenção" : "No prazo"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PremiumSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <PremiumSection
          icone={TrendingUp}
          titulo="Projeção e Acompanhamento"
          subtitulo="Projeção do período com ritmo de faturamento."
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="26%">
                <CartesianGrid stroke="#2A2721" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "#A09A8E", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: "#A09A8E", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#141310", border: "1px solid #D4A94A", borderRadius: 8, color: "#F4F1EA" }}
                />
                <Bar dataKey="vendido" fill="#F2CE6B" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="meta" stroke="#F5A623" strokeDasharray="5 4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="proxima" stroke="#35C97C" strokeDasharray="5 4" dot={false} strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { rotulo: "Projeção", valor: brl(m.ativa.proxima), detalhe: `+${m.ativa.proximaVsMeta}% sobre a meta` },
              { rotulo: "Ticket médio vs meta", valor: brl(m.ativa.ticketVsMeta.valor), detalhe: `+${m.ativa.ticketVsMeta.diffPct}% vs. ${brl(m.ativa.ticketVsMeta.base)}` },
              { rotulo: "Ritmo", valor: `${m.ativa.ritmo.pct.toFixed(1)}%`, detalhe: `${m.ativa.ritmo.decorridos} de ${m.ativa.ritmo.total} dias` },
              { rotulo: "Faltante", valor: brl(m.ativa.faltante), detalhe: "a meta restante" },
            ].map((s) => (
              <div key={s.rotulo} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                <p className="text-[11px] text-[#A09A8E]">{s.rotulo}</p>
                <p className="font-display text-[16px] font-bold text-[#F4F1EA]">{s.valor}</p>
                <p className="text-[11px] text-[#C9C2B8]">{s.detalhe}</p>
              </div>
            ))}
          </div>
        </PremiumSection>

        <div className="space-y-4">
          <PremiumSection
            icone={History}
            titulo="Histórico de Ajustes"
            subtitulo="Mudanças recentes registradas."
            bodyClassName="p-3"
          >
            <div className="space-y-2">
              {m.historico.map((h, i) => (
                <div key={i} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-[#F2CE6B]">{h.data}</p>
                  <p className="mt-1 text-[12px] leading-snug text-[#C9C2B8]">{h.texto}</p>
                </div>
              ))}
            </div>
          </PremiumSection>

          <PremiumSection
            icone={AlertTriangle}
            titulo="Alertas e Observações"
            subtitulo="Pontos de atenção do gestor."
            bodyClassName="p-3"
          >
            <div className="space-y-2.5">
              {m.alertas.map((a) => (
                <div key={a.titulo} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                  <p className="text-[13px] font-semibold text-[#F4F1EA]">{a.titulo}</p>
                  <p className="mt-1 text-[12px] leading-snug text-[#A09A8E]">{a.texto}</p>
                </div>
              ))}
            </div>
          </PremiumSection>
        </div>
      </div>
    </div>
  );
}
