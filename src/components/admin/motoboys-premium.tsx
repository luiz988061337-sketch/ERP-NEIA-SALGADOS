import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  FileDown,
  History,
  MapPin,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Users,
  Wallet,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PremiumSection, StatusBadge } from "@/components/admin/erp-ui";
import { brl } from "@/lib/format";
import { ehModoDemo } from "@/lib/demo-preview";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type KpiGestao = {
  icone: LucideIcon;
  rotulo: string;
  valor: ReactNode;
};

const MOTOBOYS = [
  { id: "joao", nome: "João", placa: "ABC-1234", status: "Em rota" as const, entregas: 8, taxas: 63.0, destaque: true },
  { id: "carlos", nome: "Carlos", placa: "DEF-5678", status: "Em rota" as const, entregas: 10, taxas: 79.5, destaque: false },
  { id: "marcos", nome: "Marcos", placa: "GHI-9012", status: "Disponível" as const, entregas: 0, taxas: 0.0, destaque: false },
];

const ENTREGAS_TURNO = [
  { pedido: 1045, cliente: "Vila Nova", distancia: "2,1 km", taxa: 6.0 },
  { pedido: 1046, cliente: "Centro", distancia: "4,0 km", taxa: 6.0 },
  { pedido: 1047, cliente: "Jd. América", distancia: "3,5 km", taxa: 6.0 },
  { pedido: 1048, cliente: "Parque Verde", distancia: "5,2 km", taxa: 7.8 },
  { pedido: 1049, cliente: "Jd. São Paulo", distancia: "6,0 km", taxa: 9.0 },
  { pedido: 1050, cliente: "Vila Nova", distancia: "2,8 km", taxa: 6.0 },
  { pedido: 1052, cliente: "Centro", distancia: "4,6 km", taxa: 6.9 },
  { pedido: 1053, cliente: "Apto 1 – Centro", distancia: "3,5 km", taxa: 6.0 },
];

const ENTREGAS_HOJE = [
  ...ENTREGAS_TURNO.map((e) => ({ ...e, motoboy: "João" })),
  { pedido: 1037, cliente: "Bela Vista", distancia: "3,1 km", taxa: 6.0, motoboy: "Carlos" },
  { pedido: 1038, cliente: "Centro", distancia: "2,4 km", taxa: 6.0, motoboy: "Carlos" },
  { pedido: 1039, cliente: "Jd. América", distancia: "4,8 km", taxa: 7.8, motoboy: "Carlos" },
  { pedido: 1040, cliente: "Pinheiros", distancia: "5,6 km", taxa: 9.0, motoboy: "Carlos" },
  { pedido: 1041, cliente: "Vila Nova", distancia: "3,3 km", taxa: 6.0, motoboy: "Carlos" },
  { pedido: 1042, cliente: "Parque Verde", distancia: "6,1 km", taxa: 9.0, motoboy: "Carlos" },
  { pedido: 1043, cliente: "Centro", distancia: "2,9 km", taxa: 6.0, motoboy: "Carlos" },
  { pedido: 1044, cliente: "Jd. São Paulo", distancia: "4,2 km", taxa: 6.9, motoboy: "Carlos" },
  { pedido: 1051, cliente: "Bela Vista", distancia: "3,7 km", taxa: 6.9, motoboy: "Carlos" },
  { pedido: 1054, cliente: "Pinheiros", distancia: "5,0 km", taxa: 7.8, motoboy: "Carlos" },
];

const TURNOS = [
  { motoboy: "João", placa: "ABC-1234", horario: "08:00 às 16:00", data: "20/11/2026", entregas: 8, status: "Em rota" as const },
  { motoboy: "Carlos", placa: "DEF-5678", horario: "08:00 às 16:00", data: "20/11/2026", entregas: 10, status: "Em rota" as const },
  { motoboy: "Marcos", placa: "GHI-9012", horario: "—", data: "20/11/2026", entregas: 0, status: "Disponível" as const },
];

const FECHAMENTOS = [
  { motoboy: "João", entregas: 8, taxas: 63.0, presenca: 40.0, gorjetas: 10.0, descontos: 0.0, total: 113.0, status: "Pendente" as const },
  { motoboy: "Carlos", entregas: 10, taxas: 79.5, presenca: 30.0, gorjetas: 0.0, descontos: 0.0, total: 109.5, status: "Pendente" as const },
  { motoboy: "Marcos", entregas: 0, taxas: 0.0, presenca: 0.0, gorjetas: 0.0, descontos: 0.0, total: 0.0, status: "Sem turno" as const },
];

const REEMBOLSOS_ANTERIORES = [
  { data: "19/11/2026", motoboy: "Carlos", tipo: "Troco adiantado", valor: 12.5, status: "Concluído" },
  { data: "18/11/2026", motoboy: "João", tipo: "Despesa autorizada", valor: 8.0, status: "Concluído" },
  { data: "16/11/2026", motoboy: "Marcos", tipo: "Ressarcimento", valor: 5.0, status: "Concluído" },
];

const HISTORICO = [
  { data: "20/11/2026 · 08:00", texto: "Turno da manhã iniciado por João e Carlos.", icone: Clock },
  { data: "19/11/2026 · 18:30", texto: "Fechamento do turno de Carlos finalizado e pago · R$ 104,50.", icone: CheckCircle2 },
  { data: "19/11/2026 · 08:00", texto: "Turno da manhã iniciado por João, Carlos e Marcos.", icone: Clock },
  { data: "18/11/2026 · 17:45", texto: "Fechamento do turno de João finalizado e pago · R$ 98,00.", icone: Wallet },
];

const ABAS = [
  { id: "visao-geral", rotulo: "Visão Geral", icone: BarChart3 },
  { id: "motoboys", rotulo: "Motoboys", icone: Users },
  { id: "turnos", rotulo: "Turnos", icone: CalendarDays },
  { id: "entregas", rotulo: "Entregas", icone: Package },
  { id: "fechamentos", rotulo: "Fechamentos", icone: ClipboardList },
  { id: "reembolsos", rotulo: "Reembolsos", icone: RotateCcw },
  { id: "historico", rotulo: "Histórico", icone: History },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function KpiMotoboy({ icone: Icone, rotulo, valor }: KpiGestao) {
  return (
    <div className="flex min-h-[80px] items-center gap-3 rounded-xl border border-[#D4A94A] bg-[#141310] px-4 py-3 shadow-card">
      <Icone className="size-8 shrink-0 text-[#F2CE6B]" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-[12px] leading-tight text-[#A09A8E]">{rotulo}</p>
        <p className="font-display text-[23px] font-bold leading-tight text-[#F4F1EA]">{valor}</p>
      </div>
    </div>
  );
}

function BadgeMotoboy({ status }: { status: "Em rota" | "Disponível" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
        status === "Em rota" ? "bg-[#35C97C] text-[#0E1C13]" : "bg-[#3A3A3A] text-[#D6D6D6]",
      )}
    >
      {status}
    </span>
  );
}

function BadgeEntregue() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#35C97C] px-2 py-0.5 text-[11px] font-bold text-[#0E1C13]">
      <Check className="size-3" aria-hidden /> Entregue
    </span>
  );
}

function CabecalhoTabela({ colunas }: { colunas: string[] }) {
  return (
    <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[11px] uppercase tracking-wide text-[#C9C2B8]">
      {colunas.map((c, i) => (
        <th key={c} className={cn("px-2 py-2", c.toLowerCase().includes("status") && "text-right")} style={i === colunas.length - 1 && !c.toLowerCase().includes("status") ? { textAlign: "right" } : undefined}>
          {c}
        </th>
      ))}
    </tr>
  );
}

export function MotoboysPremium() {
  const modoDemo = ehModoDemo();
  const [aba, setAba] = useState<AbaId>("visao-geral");

  const kpis: KpiGestao[] = [
    { icone: Users, rotulo: "Motoboys cadastrados", valor: "3" },
    {
      icone: Package,
      rotulo: "Entregas hoje",
      valor: (
        <span className="inline-flex items-baseline gap-2">
          18
          <span className="rounded-full bg-[#35C97C] px-2 py-0.5 align-middle text-[11px] font-bold text-[#0E1C13]">
            ↑ +20%
          </span>
        </span>
      ),
    },
    { icone: Coins, rotulo: "Taxas de entrega (hoje)", valor: brl(142.5) },
    { icone: CalendarDays, rotulo: "Em turno agora", valor: "2" },
    { icone: Wallet, rotulo: "A pagar (pendentes)", valor: brl(222.5) },
  ];

  const cardsMotoboys = (
    <PremiumSection
      icone={Users}
      titulo={`Motoboys (${MOTOBOYS.length})`}
      acoes={
        <Button
          type="button"
          size="sm"
          className="erp-btn-gold h-8 gap-1.5 px-3 text-[12px] font-bold text-[#14120C]"
          onClick={() => toast.info("Cadastro de motoboy simulado (demonstração).")}
        >
          <Plus className="size-4" aria-hidden /> Cadastrar
        </Button>
      }
      bodyClassName="p-3"
    >
      <div className="space-y-2.5">
        {MOTOBOYS.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-xl border bg-[#141310] p-3 transition-colors",
              m.destaque ? "border-[#D4A94A] shadow-card" : "border-[#2A2721] hover:border-[#D4A94A]/60",
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#D4A94A]/70 bg-[#1A1712]">
                <Bike className="size-5 text-[#F2CE6B]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold text-[#F4F1EA]">{m.nome}</p>
                <p className="text-[12px] text-[#A09A8E]">Placa: {m.placa}</p>
              </div>
              <BadgeMotoboy status={m.status} />
              <Wifi className="size-4 shrink-0 text-[#F2CE6B]" aria-hidden />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#C9C2B8]">
              <span className="inline-flex items-center gap-1.5">
                <Package className="size-4 text-[#F2CE6B]" aria-hidden /> Entregas: <b className="text-[#F4F1EA]">{m.entregas}</b>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Coins className="size-4 text-[#F2CE6B]" aria-hidden /> Taxas: <b className="text-[#F4F1EA]">{brl(m.taxas)}</b>
              </span>
            </div>
          </div>
        ))}
      </div>
    </PremiumSection>
  );

  const secaoFechamento = (
    <PremiumSection
      icone={ClipboardList}
      titulo="Fechamento do Turno — João"
      subtitulo="Turno: 08:00 às 16:00  |  Data: 20/11/2026"
      acoes={<span className="inline-flex items-center rounded-full bg-[#F2CE6B] px-3 py-1 text-[11px] font-bold text-[#17150F]">Pendente</span>}
      bodyClassName="p-3"
    >
      <p className="mb-2 text-[14px] font-bold uppercase tracking-wide text-[#F4F1EA]">
        Entregas do Turno ({ENTREGAS_TURNO.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead><CabecalhoTabela colunas={["# Pedido", "Cliente / Bairro", "Distância", "Taxa", "Status"]} /></thead>
          <tbody className="divide-y divide-[#2A2721]">
            {ENTREGAS_TURNO.map((e) => (
              <tr key={e.pedido} className="hover:bg-[#211F18]">
                <td className="px-2 py-2 font-semibold text-[#F4F1EA]">{e.pedido}</td>
                <td className="px-2 py-2 text-[#C9C2B8]">{e.cliente}</td>
                <td className="px-2 py-2 text-[#C9C2B8]">{e.distancia}</td>
                <td className="px-2 py-2 text-[#F4F1EA]">{brl(e.taxa)}</td>
                <td className="px-2 py-2 text-right">
                  <BadgeEntregue />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PremiumSection>
  );

  const secaoFinanceiro = (
    <PremiumSection icone={Wallet} titulo="Financeiro do Motoboy" bodyClassName="p-3">
      <div className="space-y-1.5">
        {[
          { rotulo: "Taxas de entrega (8)", valor: brl(63.0), cor: "#F4F1EA" },
          { rotulo: "Presença do turno", valor: brl(40.0), cor: "#F4F1EA" },
          { rotulo: "Gorjetas (clientes)", valor: brl(10.0), cor: "#35C97C" },
          { rotulo: "Reembolsos", valor: brl(0.0), cor: "#F4F1EA" },
          { rotulo: "Descontos / Ajustes", valor: `- ${brl(0.0)}`, cor: "#F16A6A" },
        ].map((l) => (
          <div key={l.rotulo} className="flex items-center justify-between gap-2 rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2 text-[13px]">
            <span className="text-[#C9C2B8]">{l.rotulo}</span>
            <b className="font-display" style={{ color: l.cor }}>{l.valor}</b>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#D4A94A] bg-[linear-gradient(115deg,#2A2210_0%,#1B1710_100%)] px-4 py-3 shadow-card">
        <span className="inline-flex items-center gap-2 text-[14px] font-bold text-[#F2CE6B]">
          <Coins className="size-5" aria-hidden /> Total a pagar ao motoboy
        </span>
        <b className="font-display text-[26px] font-bold text-[#F2CE6B]">{brl(113.0)}</b>
      </div>
    </PremiumSection>
  );

  const secaoReembolsos = (
    <PremiumSection
      icone={RotateCcw}
      titulo="Reembolsos do Turno"
      subtitulo="Troco adiantado, despesas autorizadas e outros ressarcimentos."
      acoes={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[#D4A94A]/60 px-3 text-[12px] text-[#F2CE6B] hover:bg-[#1A1712]"
          onClick={() => setAba("reembolsos")}
        >
          <ClipboardList className="size-4" aria-hidden /> Ver detalhes (0)
        </Button>
      }
      bodyClassName="p-3"
    >
      <p className="text-[13px] text-[#A09A8E]">Nenhum reembolso registrado neste turno.</p>
    </PremiumSection>
  );

  const botoesAcao = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="lg" className="h-11 gap-2 border-[#D4A94A]/60 px-4 text-[13px] font-bold text-[#F2CE6B] hover:bg-[#1A1712]" onClick={() => toast.info("Impressão do fechamento simulada (demonstração).")}>
        <Printer className="size-4" aria-hidden /> Imprimir Fechamento
      </Button>
      <Button type="button" variant="outline" size="lg" className="h-11 gap-2 border-[#D4A94A]/60 px-4 text-[13px] font-bold text-[#F2CE6B] hover:bg-[#1A1712]" onClick={() => toast.info("Exportação PDF simulada (demonstração).")}>
        <FileDown className="size-4" aria-hidden /> Exportar (PDF)
      </Button>
      <Button type="button" size="lg" className="h-11 gap-2 bg-[#15803D] px-6 text-[13px] font-bold text-white hover:bg-[#166534]" onClick={() => toast.success("Fechamento finalizado e pagamento simulado (demonstração).")}>
        <Check className="size-5" aria-hidden /> Finalizar e Pagar
      </Button>
    </div>
  );

  function conteudoAba() {
    switch (aba) {
      case "visao-geral":
        return (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            {cardsMotoboys}
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                {secaoFechamento}
                {secaoFinanceiro}
              </div>
              {secaoReembolsos}
              {botoesAcao}
            </div>
          </div>
        );

      case "motoboys":
        return (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            {cardsMotoboys}
            <PremiumSection icone={Bike} titulo="Frota — Visão Detalhada" subtitulo="Dados cadastrais e operacionais de cada motoboy.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead><CabecalhoTabela colunas={["Motoboy", "Placa", "Status", "Entregas", "Taxas"]} /></thead>
                  <tbody className="divide-y divide-[#2A2721]">
                    {MOTOBOYS.map((m) => (
                      <tr key={m.id} className="hover:bg-[#211F18]">
                        <td className="px-2 py-2.5 font-semibold text-[#F4F1EA]">{m.nome}</td>
                        <td className="px-2 py-2.5 text-[#C9C2B8]">{m.placa}</td>
                        <td className="px-2 py-2.5"><BadgeMotoboy status={m.status} /></td>
                        <td className="px-2 py-2.5 text-[#F4F1EA]">{m.entregas}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-[#F4F1EA]">{brl(m.taxas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PremiumSection>
          </div>
        );

      case "turnos":
        return (
          <PremiumSection icone={CalendarDays} titulo="Turnos de Hoje" subtitulo="Escala e andamento dos turnos em 20/11/2026.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead><CabecalhoTabela colunas={["Motoboy", "Placa", "Horário", "Data", "Entregas", "Status"]} /></thead>
                <tbody className="divide-y divide-[#2A2721]">
                  {TURNOS.map((t) => (
                    <tr key={t.motoboy} className="hover:bg-[#211F18]">
                      <td className="px-2 py-2.5 font-semibold text-[#F4F1EA]">{t.motoboy}</td>
                      <td className="px-2 py-2.5 text-[#C9C2B8]">{t.placa}</td>
                      <td className="px-2 py-2.5 text-[#C9C2B8]">{t.horario}</td>
                      <td className="px-2 py-2.5 text-[#C9C2B8]">{t.data}</td>
                      <td className="px-2 py-2.5 text-[#F4F1EA]">{t.entregas}</td>
                      <td className="px-2 py-2.5 text-right"><BadgeMotoboy status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PremiumSection>
        );

      case "entregas":
        return (
          <PremiumSection icone={Package} titulo={`Entregas de Hoje (${ENTREGAS_HOJE.length})`} subtitulo="Pedidos entregues na data de 20/11/2026.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead><CabecalhoTabela colunas={["# Pedido", "Motoboy", "Cliente / Bairro", "Distância", "Taxa", "Status"]} /></thead>
                <tbody className="divide-y divide-[#2A2721]">
                  {ENTREGAS_HOJE.map((e) => (
                    <tr key={e.pedido} className="hover:bg-[#211F18]">
                      <td className="px-2 py-2 font-semibold text-[#F4F1EA]">{e.pedido}</td>
                      <td className="px-2 py-2 text-[#C9C2B8]">{e.motoboy}</td>
                      <td className="px-2 py-2 text-[#C9C2B8]">{e.cliente}</td>
                      <td className="px-2 py-2 text-[#C9C2B8]">{e.distancia}</td>
                      <td className="px-2 py-2 text-[#F4F1EA]">{brl(e.taxa)}</td>
                      <td className="px-2 py-2 text-right"><BadgeEntregue /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PremiumSection>
        );

      case "fechamentos":
        return (
          <div className="space-y-4">
            <PremiumSection icone={ClipboardList} titulo="Fechamentos do Período" subtitulo="Resumo financeiro pendente por motoboy.">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {FECHAMENTOS.map((f) => (
                  <div key={f.motoboy} className="rounded-xl border border-[#D4A94A] bg-[#141310] p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[16px] font-bold text-[#F4F1EA]">{f.motoboy}</p>
                      <StatusBadge tom={f.status === "Pendente" ? "atencao" : "neutro"}>{f.status}</StatusBadge>
                    </div>
                    <div className="mt-3 space-y-1 text-[12px] text-[#C9C2B8]">
                      <div className="flex justify-between"><span>Entregas</span><b className="text-[#F4F1EA]">{f.entregas}</b></div>
                      <div className="flex justify-between"><span>Taxas</span><b className="text-[#F4F1EA]">{brl(f.taxas)}</b></div>
                      <div className="flex justify-between"><span>Presença</span><b className="text-[#F4F1EA]">{brl(f.presenca)}</b></div>
                      <div className="flex justify-between"><span>Gorjetas</span><b className="text-[#35C97C]">{brl(f.gorjetas)}</b></div>
                      <div className="flex justify-between"><span>Descontos</span><b className="text-[#F16A6A]">- {brl(f.descontos)}</b></div>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-[#D4A94A] bg-[#211B0F] px-3 py-2">
                      <span className="text-[12px] font-bold text-[#F2CE6B]">Total a pagar</span>
                      <b className="font-display text-[18px] text-[#F2CE6B]">{brl(f.total)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumSection>
            <PremiumSection icone={Wallet} titulo="Resumo de Pagamentos" subtitulo="Total pendente de fechamento do período.">
              <div className="flex items-center justify-between rounded-xl border border-[#D4A94A] bg-[linear-gradient(115deg,#2A2210_0%,#1B1710_100%)] px-4 py-3 shadow-card">
                <span className="text-[15px] font-bold text-[#F2CE6B]">A pagar (pendentes) — 2 fechamentos</span>
                <b className="font-display text-[26px] font-bold text-[#F2CE6B]">{brl(FECHAMENTOS.reduce((s, f) => s + f.total, 0))}</b>
              </div>
            </PremiumSection>
            {botoesAcao}
          </div>
        );

      case "reembolsos":
        return (
          <div className="space-y-4">
            <PremiumSection icone={RotateCcw} titulo="Reembolsos do Turno" subtitulo="Troco adiantado, despesas autorizadas e outros ressarcimentos.">
              <p className="text-[13px] text-[#A09A8E]">Nenhum reembolso registrado no turno atual de João (0).</p>
            </PremiumSection>
            <PremiumSection icone={History} titulo="Histórico de Reembolsos" subtitulo="Ressarcimentos concluídos em turnos anteriores.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead><CabecalhoTabela colunas={["Data", "Motoboy", "Tipo", "Valor", "Status"]} /></thead>
                  <tbody className="divide-y divide-[#2A2721]">
                    {REEMBOLSOS_ANTERIORES.map((r, i) => (
                      <tr key={i} className="hover:bg-[#211F18]">
                        <td className="px-2 py-2.5 text-[#C9C2B8]">{r.data}</td>
                        <td className="px-2 py-2.5 text-[#F4F1EA]">{r.motoboy}</td>
                        <td className="px-2 py-2.5 text-[#C9C2B8]">{r.tipo}</td>
                        <td className="px-2 py-2.5 font-semibold text-[#F4F1EA]">{brl(r.valor)}</td>
                        <td className="px-2 py-2.5 text-right"><StatusBadge tom="ok">{r.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PremiumSection>
          </div>
        );

      case "historico":
        return (
          <PremiumSection icone={History} titulo="Histórico de Movimentações" subtitulo="Turnos, fechamentos e pagamentos registrados.">
            <ol className="space-y-0">
              {HISTORICO.map((h, i) => {
                const Icone = h.icone;
                return (
                  <li key={i} className="relative flex gap-3 pb-5 pl-1 last:pb-0">
                    <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-[#D4A94A] bg-[#1A1712]">
                      <Icone className="size-4 text-[#F2CE6B]" aria-hidden />
                    </span>
                    {i < HISTORICO.length - 1 ? <span className="absolute left-[17px] top-8 h-[calc(100%-16px)] w-px bg-[#2A2721]" aria-hidden /> : null}
                    <div className="pt-1">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-[#F2CE6B]">{h.data}</p>
                      <p className="mt-0.5 text-[13px] text-[#C9C2B8]">{h.texto}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </PremiumSection>
        );
    }
  }

  return (
    <div className="space-y-5 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4A94A] pb-4">
        <div className="flex min-w-0 items-center gap-4">
          <Bike className="size-10 shrink-0 text-[#F2CE6B]" aria-hidden />
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-bold leading-tight text-[#F4F1EA]">Gestão de Motoboys</h1>
            <p className="text-[13px] leading-snug text-[#A09A8E]">
              Cadastro, turnos, entregas, taxas e fechamento financeiro de cada motoboy.
            </p>
          </div>
        </div>
        {modoDemo ? (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[#D4A94A]/70 bg-[#1A1712] px-3 py-1 text-[11px] font-semibold text-[#F2CE6B]">
            MODO DEMONSTRAÇÃO · dados fictícios · nenhuma operação real
          </span>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <KpiMotoboy key={k.rotulo} {...k} />
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ABAS.map((a) => {
          const Icone = a.icone;
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors",
                ativa
                  ? "border-[#D4A94A] bg-[#F2CE6B] text-[#17150F] shadow-card"
                  : "border-[#D4A94A]/50 bg-[#141310] text-[#C9C2B8] hover:bg-[#1A1712] hover:text-[#F2CE6B]",
              )}
            >
              <Icone className="size-4" aria-hidden />
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {conteudoAba()}
    </div>
  );
}
