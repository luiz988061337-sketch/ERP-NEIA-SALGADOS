import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { Bike } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/preview/central-entregas-v2")({
  head: () => ({ meta: [{ title: "Prévia — Central de Entregas Rotas" }] }),
  component: PreviewCentralEntregasV2,
});

export function PreviewCentralEntregasV2() {
  const [liberado] = useState(false);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <AdminShell aba="central" onAba={() => {}} onRefresh={() => {}} usuario="preview@neia.local" modoPreview>
      <div className="min-h-screen bg-background p-3 sm:p-4">
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
            PRÉVIA — Central de Entregas Rotas. Dados demonstrativos locais, sem gravação.
          </p>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Bike className="size-7 text-[#F2CE6B]" />
              <div>
                <h1 className="font-display text-2xl font-bold text-[#F2CE6B]">CENTRAL DE ENTREGAS — ROTAS</h1>
                <p className="text-xs text-muted-foreground">Agrupamento inteligente de pedidos por rota</p>
              </div>
            </div>
            <div className="text-xs border border-[#D4A94A]/40 rounded px-3 py-1 bg-[#141310]">Hoje, {hoje} • Dados demonstrativos</div>
          </header>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {label:"Rotas em aberto",value:"6",info:"↓ -25%"},
              {label:"Pedidos aguardando rota",value:"12",info:"↑ +20%"},
              {label:"Motoboys disponíveis",value:"3",info:"Disponíveis"},
              {label:"Saídas previstas hoje",value:"8",info:"A partir de 10:00"},
            ].map((i,k)=>(
              <div key={k} className="rounded-xl border border-[#D4A94A]/40 bg-[#0F0E0C] p-3">
                <div className="text-xs text-muted-foreground">{i.label}</div>
                <div className="text-3xl font-bold">{i.value}</div>
                <div className="text-xs text-muted-foreground">{i.info}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3 rounded-xl border border-[#D4A94A]/40 bg-[#0F0E0C] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="border border-[#D4A94A] rounded-full px-3 py-1 text-sm font-bold">ROTA 04 — CENTRO</div>
                <div className="text-xs">ETA: 28 min</div>
                <div className="text-xs">Total: 7,2 km</div>
              </div>
              <div className="relative h-[340px] rounded-lg bg-[#0b0a08] border border-[#D4A94A]/20 overflow-hidden">
                <svg viewBox="0 0 600 340" className="absolute inset-0 w-full h-full">
                  <defs>
                    <linearGradient id="g" x1="0" x2="1">
                      <stop offset="0%" stopColor="#f2ce6b"/>
                      <stop offset="100%" stopColor="#d4a94a"/>
                    </linearGradient>
                  </defs>
                  <rect width="600" height="340" fill="#0b0a08"/>
                  {Array.from({length:12}).map((_,i)=><line key={i} x1="0" y1={i*28} x2="600" y2={i*28} stroke="#1f1c15" strokeWidth="1"/>)}
                  {Array.from({length:10}).map((_,i)=><line key={i} x1={i*60} y1="0" x2={i*60} y2="340" stroke="#1f1c15" strokeWidth="1"/>)}
                  <polyline points="80,240 150,180 260,190 340,140 480,130" fill="none" stroke="url(#g)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)"/>
                  <defs>
                    <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  </defs>
                  <circle cx="80" cy="240" r="12" fill="#1a1712" stroke="#D4A94A" strokeWidth="2"/><text x="80" y="245" textAnchor="middle" fill="#D4A94A" fontSize="10" fontWeight="bold">Loja</text>
                  <circle cx="150" cy="180" r="16" fill="#22c55e" stroke="#fff" strokeWidth="2"/><text x="150" y="185" textAnchor="middle" fill="#fff" fontWeight="bold">A</text>
                  <circle cx="260" cy="190" r="16" fill="#eab308" stroke="#000" strokeWidth="2"/><text x="260" y="195" textAnchor="middle" fill="#000" fontWeight="bold">B</text>
                  <circle cx="480" cy="130" r="16" fill="#ef4444" stroke="#fff" strokeWidth="2"/><text x="480" y="135" textAnchor="middle" fill="#fff" fontWeight="bold">C</text>
                </svg>
                <div className="absolute top-2 left-2 text-[10px] bg-black/70 px-2 py-1 rounded border border-[#D4A94A]/40">MAPA DEMONSTRATIVO — SEM GPS REAL</div>
              </div>
              <div className="mt-2 border border-[#D4A94A]/40 rounded p-2 text-sm">3 pedidos agrupados • 1 ainda em produção</div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  {letra:"A",ped:"#4598",cli:"Ana Costa",km:"2,1 km",t:"8 min"},
                  {letra:"B",ped:"#4601",cli:"Ricardo Souza",km:"2,7 km",t:"10 min"},
                  {letra:"C",ped:"#4603",cli:"Luciana Melo",km:"2,4 km",t:"10 min"},
                ].map((p,i)=>(
                  <div key={i} className="border border-[#D4A94A]/30 rounded-lg p-2 bg-[#141310]">
                    <div className="text-sm font-bold">{p.letra}ª Entrega {p.ped}</div>
                    <div className="text-xs text-muted-foreground">{p.cli}</div>
                    <div className="text-xs">{p.km} • {p.t}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-2 rounded-xl border border-[#D4A94A]/40 bg-[#0F0E0C] p-3 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="text-xl font-bold">Rota 04 — Centro</div>
                <div className="text-xs border border-[#D4A94A] rounded px-2">3 pedidos</div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="size-10 rounded-full bg-[#D4A94A]/20 border border-[#D4A94A]/50 grid place-items-center font-bold">C</div>
                <div>
                  <div className="text-sm text-muted-foreground">Motoboy</div>
                  <div className="font-bold">Carlos</div>
                </div>
                <div className="ml-auto text-sm">Status: <span className="bg-[#D4A94A] text-black rounded px-2">Aguardando liberação</span></div>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  {ped:"#4598",cli:"Ana Costa",bairro:"Centro",status:"Em produção",pag:"Pix pago"},
                  {ped:"#4601",cli:"Ricardo Souza",bairro:"Vila Marina",status:"Pronto",pag:"Pix pago"},
                  {ped:"#4603",cli:"Luciana Melo",bairro:"Centro",status:"Pronto",pag:"Cartão"},
                ].map((r,i)=>(
                  <div key={i} className="border border-[#D4A94A]/30 rounded p-2 flex justify-between items-center">
                    <div>
                      <div className="font-bold">Pedido {r.ped}</div>
                      <div className="text-xs text-muted-foreground">{r.cli} • {r.bairro} • {r.pag}</div>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded ${r.status==="Pronto" ? "bg-green-800/40 text-green-300" : "bg-amber-800/40 text-amber-300"}`}>{r.status}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button className="border border-[#D4A94A]/50 rounded px-3 py-1 text-sm">Ver rota</button>
                <button className="border border-[#D4A94A]/50 rounded px-3 py-1 text-sm">Editar agrupamento</button>
                <button disabled={!liberado} className={`rounded px-3 py-1 text-sm font-bold ${liberado ? "bg-[#D4A94A] text-black" : "bg-[#D4A94A]/30 text-muted-foreground cursor-not-allowed"}`}>Liberar motoboy</button>
                <button className="border border-[#D4A94A]/50 rounded px-3 py-1 text-sm">Avisar cozinha</button>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div className="border border-amber-700/40 rounded p-2 bg-amber-900/20 text-sm">1 pedido ainda em produção — Pedido #4598 está em produção na cozinha.</div>
                <div className="border border-green-700/40 rounded p-2 bg-green-900/20 text-sm">Quando todos estiverem prontos, liberar rota.</div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#D4A94A]/40 bg-[#0F0E0C] p-3">
            <div className="font-bold mb-2">Pedidos com rota</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th>Rota</th><th>Pedido(s)</th><th>Cliente</th><th>Bairro</th><th>Status</th><th>Observação</th><th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#D4A94A]/20">
                    <td>Rota 04</td><td>#4598, #4601, #4603</td><td>Ana Costa e outros</td><td>Centro / Vila Marina</td><td>Aguardando liberação</td><td>1 em produção</td><td>Ver rota</td>
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
