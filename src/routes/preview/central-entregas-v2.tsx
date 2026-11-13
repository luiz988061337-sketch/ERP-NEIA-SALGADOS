import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { Bike, MapPin, Package, CreditCard, ArrowRight, Route as RouteIcon, User, Clock, CheckCircle2, AlertTriangle, Edit } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/preview/central-entregas-v2")({
  head: () => ({ meta: [{ title: "Prévia — Central de Entregas Rotas" }] }),
  component: PreviewCentralEntregasV2,
});

export function PreviewCentralEntregasV2() {
  const [liberado] = useState(false);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const statusClasses = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("aguardando liberação")) return "bg-amber-900/40 text-amber-300 border border-amber-700/40";
    if (s.includes("produção") || s.includes("em produção")) return "bg-orange-900/40 text-orange-300 border border-orange-700/40";
    if (s.includes("pronto")) return "bg-green-900/40 text-green-300 border border-green-700/40";
    if (s.includes("em rota") || s.includes("em entrega")) return "bg-blue-900/40 text-blue-300 border border-blue-700/40";
    if (s.includes("entregue") || s.includes("finalizado")) return "bg-green-800/40 text-green-200 border border-green-600/40";
    if (s.includes("atrasado") || s.includes("problema")) return "bg-red-900/40 text-red-300 border border-red-700/40";
    if (s.includes("indisponível")) return "bg-neutral-700/40 text-neutral-300 border border-neutral-600/40";
    return "bg-neutral-800/40 text-neutral-300 border border-neutral-700/40";
  };
  return (
    <AdminShell aba="central" onAba={() => {}} onRefresh={() => {}} usuario="preview@neia.local" modoPreview>
      <div className="min-h-screen bg-background p-3 sm:p-4">
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
            PRÉVIA — Central de Entregas Rotas. Dados demonstrativos locais, sem gravação.
          </p>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-2xl bg-[#D4A94A]/10 border border-[#D4A94A]/40 grid place-items-center text-[#F2CE6B]">
                <Bike className="size-7" />
              </div>
              <div>
                <h1 className="font-display text-[28px] font-extrabold tracking-tight text-[#F2CE6B]">CENTRAL DE ENTREGAS — ROTAS</h1>
                <p className="text-xs text-muted-foreground">Agrupamento inteligente de pedidos por rota</p>
              </div>
            </div>
            <div className="text-xs border border-[#D4A94A]/40 rounded-full px-4 py-2 bg-[#141310]">Hoje, {hoje} • Dados demonstrativos</div>
          </header>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {label:"Rotas em aberto",value:"6",info:"↓ -25%", icon:RouteIcon},
              {label:"Pedidos aguardando rota",value:"12",info:"↑ +20%", icon:Package},
              {label:"Motoboys disponíveis",value:"3",info:"Disponíveis", icon:Bike},
              {label:"Saídas previstas hoje",value:"8",info:"A partir de 10:00", icon:Clock},
            ].map((i,k)=>(
              <div key={k} className="rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 shadow-[inset_0_1px_0_0_rgba(212,169,74,0.15)]">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-[#D4A94A]/10 border border-[#D4A94A]/40 grid place-items-center text-[#F2CE6B]">
                    <i.icon className="size-5" />
                  </div>
                  <div className="text-xs uppercase tracking-wide text-[#F2CE6B]/80">{i.label}</div>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-4xl font-extrabold tracking-tight">{i.value}</div>
                  <div className="text-[11px] text-muted-foreground mb-1">{i.info}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 shadow-[inset_0_1px_0_0_rgba(212,169,74,0.15)]">
              <div className="flex items-center justify-between mb-3">
                <div className="border border-[#D4A94A] rounded-full px-4 py-1.5 text-sm font-extrabold tracking-wide">ROTA 04 — CENTRO</div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1"><Clock className="size-3 text-[#F2CE6B]"/> ETA: 28 min</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3 text-[#F2CE6B]"/> Total: 7,2 km</span>
                </div>
              </div>
              <div className="relative h-[360px] rounded-xl bg-[#0b0a08] border border-[#D4A94A]/20 overflow-hidden">
                <svg viewBox="0 0 600 360" className="absolute inset-0 w-full h-full">
                  <defs>
                    <linearGradient id="g" x1="0" x2="1">
                      <stop offset="0%" stopColor="#f2ce6b"/>
                      <stop offset="100%" stopColor="#d4a94a"/>
                    </linearGradient>
                    <filter id="glow"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  </defs>
                  <rect width="600" height="360" fill="#0b0a08"/>
                  {Array.from({length:14}).map((_,i)=><line key={"h"+i} x1="0" y1={i*26} x2="600" y2={i*26} stroke="#1f1c15" strokeWidth="1"/>)}
                  {Array.from({length:12}).map((_,i)=><line key={"v"+i} x1={i*50} y1="0" x2={i*50} y2="360" stroke="#1f1c15" strokeWidth="1"/>)}
                  <polyline points="80,260 150,200 260,210 340,160 480,150" fill="none" stroke="url(#g)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)"/>
                  <circle cx="80" cy="260" r="14" fill="#1a1712" stroke="#D4A94A" strokeWidth="2.5"/>
                  <text x="80" y="265" textAnchor="middle" fill="#D4A94A" fontSize="11" fontWeight="800">LOJA</text>
                  <g>
                    <circle cx="150" cy="200" r="18" fill="#22c55e" stroke="#fff" strokeWidth="3"/>
                    <text x="150" y="205" textAnchor="middle" fill="#fff" fontWeight="900">A</text>
                  </g>
                  <g>
                    <circle cx="260" cy="210" r="18" fill="#eab308" stroke="#000" strokeWidth="3"/>
                    <text x="260" y="215" textAnchor="middle" fill="#000" fontWeight="900">B</text>
                  </g>
                  <g>
                    <circle cx="480" cy="150" r="18" fill="#ef4444" stroke="#fff" strokeWidth="3"/>
                    <text x="480" y="155" textAnchor="middle" fill="#fff" fontWeight="900">C</text>
                  </g>
                </svg>
                <div className="absolute top-3 left-3 text-[10px] bg-black/75 px-2.5 py-1 rounded-md border border-[#D4A94A]/40 tracking-wide">MAPA DEMONSTRATIVO — SEM GPS REAL</div>
              </div>
              <div className="mt-3 border border-[#D4A94A]/40 rounded-xl p-3 text-sm bg-[#141310]">3 pedidos agrupados • 1 ainda em produção</div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  {letra:"A",ped:"#4598",cli:"Ana Costa",km:"2,1 km",t:"8 min"},
                  {letra:"B",ped:"#4601",cli:"Ricardo Souza",km:"2,7 km",t:"10 min"},
                  {letra:"C",ped:"#4603",cli:"Luciana Melo",km:"2,4 km",t:"10 min"},
                ].map((p,i)=>(
                  <div key={i} className="border border-[#D4A94A]/30 rounded-xl p-3 bg-[#141310] shadow-[inset_0_1px_0_0_rgba(212,169,74,0.08)]">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-[#D4A94A]/15 border border-[#D4A94A]/40 grid place-items-center text-[#F2CE6B] font-bold">{p.letra}</div>
                      <div className="text-sm font-extrabold">{p.ped}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{p.cli}</div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <MapPin className="size-3"/> {p.km} <ArrowRight className="size-3"/> {p.t}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-2 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 flex flex-col shadow-[inset_0_1px_0_0_rgba(212,169,74,0.15)]">
              <div className="flex items-center justify-between">
                <div className="text-xl font-extrabold tracking-tight">Rota 04 — Centro</div>
                <div className="text-[11px] border border-[#D4A94A] rounded-full px-3 py-1 font-bold">3 PEDIDOS</div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="size-14 rounded-2xl bg-[#D4A94A]/10 border border-[#D4A94A]/50 grid place-items-center text-[#F2CE6B]">
                  <User className="size-7"/>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#F2CE6B]/70">Motoboy</div>
                  <div className="text-lg font-extrabold">Carlos</div>
                  <div className="text-xs text-muted-foreground">Disponível • Saída prevista 10:30</div>
                </div>
                <div className="ml-auto">
                  <div className="text-[11px] uppercase text-muted-foreground mb-1">Status da rota</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses("Aguardando liberação")}`}>Aguardando liberação</span>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  {ped:"#4598",cli:"Ana Costa",bairro:"Centro",status:"Em produção",pag:"Pix pago"},
                  {ped:"#4601",cli:"Ricardo Souza",bairro:"Vila Marina",status:"Pronto",pag:"Pix pago"},
                  {ped:"#4603",cli:"Luciana Melo",bairro:"Centro",status:"Pronto",pag:"Cartão"},
                ].map((r,i)=>(
                  <div key={i} className="border border-[#D4A94A]/30 rounded-xl p-3 bg-[#141310] flex items-center gap-3">
                    <div className="size-10 rounded-lg bg-[#D4A94A]/10 border border-[#D4A94A]/40 grid place-items-center text-[#F2CE6B]"><Package className="size-5"/></div>
                    <div className="flex-1">
                      <div className="font-bold">Pedido {r.ped}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2"><User className="size-3"/> {r.cli} • {r.bairro} • <CreditCard className="size-3"/> {r.pag}</div>
                    </div>
                    <div className={`text-xs px-3 py-1 rounded-full font-bold ${statusClasses(r.status)}`}>{r.status}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <button className="h-11 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] hover:bg-[#221D13] text-[#F2CE6B] font-bold flex items-center justify-center gap-2 transition">
                  <RouteIcon className="size-4"/> Ver rota
                </button>
                <button className="h-11 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] hover:bg-[#221D13] text-[#F2CE6B] font-bold flex items-center justify-center gap-2 transition">
                  <Edit className="size-4"/> Editar
                </button>
                <button disabled={!liberado} className={`h-11 rounded-xl font-extrabold flex items-center justify-center gap-2 transition ${liberado ? "bg-[#D4A94A] text-black border border-[#D4A94A] shadow-[0_0_20px_rgba(212,169,74,0.35)]" : "bg-[#D4A94A]/20 text-muted-foreground border border-[#D4A94A]/30 cursor-not-allowed"}`}>
                  <CheckCircle2 className="size-4"/> Liberar motoboy
                </button>
                <button className="h-11 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] hover:bg-[#221D13] text-[#F2CE6B] font-bold flex items-center justify-center gap-2 transition">
                  <AlertTriangle className="size-4"/> Avisar cozinha
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-4">
                <div className="border border-amber-700/40 rounded-xl p-3 bg-amber-950/20 text-sm flex items-center gap-2"><AlertTriangle className="size-4 text-amber-400"/> 1 pedido ainda em produção — Pedido #4598 está em produção na cozinha.</div>
                <div className="border border-green-700/40 rounded-xl p-3 bg-green-950/20 text-sm flex items-center gap-2"><CheckCircle2 className="size-4 text-green-400"/> Quando todos estiverem prontos, liberar rota.</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 shadow-[inset_0_1px_0_0_rgba(212,169,74,0.15)]">
            <div className="flex items-center justify-between mb-3">
              <div className="font-extrabold tracking-tight">Pedidos com rota</div>
              <div className="text-xs text-muted-foreground">Dados demonstrativos</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[#F2CE6B]/70 border-b border-[#D4A94A]/30">
                  <tr>
                    <th className="py-2">Rota</th><th className="py-2">Pedido(s)</th><th className="py-2">Cliente</th><th className="py-2">Bairro</th><th className="py-2">Status</th><th className="py-2">Observação</th><th className="py-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#D4A94A]/20">
                    <td className="py-3 font-bold">Rota 04</td><td>#4598, #4601, #4603</td><td>Ana Costa e outros</td><td>Centro / Vila Marina</td><td><span className={`text-xs px-3 py-1 rounded-full font-bold ${statusClasses("Aguardando liberação")}`}>Aguardando liberação</span></td><td>1 em produção</td><td><button className="h-8 rounded-lg bg-[#D4A94A] text-black font-bold px-3 text-xs">Ver rota</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
