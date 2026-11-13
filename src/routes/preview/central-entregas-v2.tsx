import { createFileRoute } from "@tanstack/react-router";
import { Bike, ChefHat, Home, ShoppingCart, ClipboardList, BikeIcon, Users } from "lucide-react";

export const Route = createFileRoute("/preview/central-entregas-v2")({
  head: () => ({ meta: [{ title: "Preview — Central de Entregas Rotas" }] }),
  component: PreviewCentralEntregasV2,
});

export function PreviewCentralEntregasV2() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-yellow-600/30 bg-black p-4 hidden lg:block">
          <div className="text-center">
            <div className="text-yellow-400 text-2xl font-bold">NÉIA<br/>SALGADOS</div>
          </div>
          <nav className="mt-6 space-y-2 text-sm">
            {[
              ["Dashboard"],
              ["Pedidos"],
              ["Produção"],
              ["Central de Entregas"],
              ["PDV / Balcão"],
              ["Clientes"],
              ["Estoque"],
              ["Financeiro"],
              ["Configurações"],
            ].map(([label], i) => (
              <div key={i} className={`px-3 py-2 rounded ${label==="Central de Entregas" ? "bg-yellow-500 text-black font-bold" : "text-neutral-300"}`}>{label}</div>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bike className="text-yellow-400" />
              <div>
                <h1 className="text-2xl font-bold">CENTRAL DE ENTREGAS — ROTAS</h1>
                <p className="text-sm text-neutral-400">Agrupamento inteligente de pedidos por rota</p>
              </div>
            </div>
            <div className="text-sm border border-neutral-700 rounded px-3 py-1">Hoje, 23 de Abril de 2025</div>
          </header>

          {/* Indicadores */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {icon:"📍",label:"Rotas em aberto",value:"6",info:"↓ -25%"},
              {icon:"📦",label:"Pedidos aguardando rota",value:"12",info:"↑ +20%"},
              {icon:"🪖",label:"Motoboys disponíveis",value:"3",info:"Disponíveis"},
              {icon:"🕒",label:"Saídas previstas hoje",value:"8",info:"A partir de 10:00"},
            ].map((i,k)=>(
              <div key={k} className="border border-yellow-600/40 rounded-lg bg-neutral-900 p-3">
                <div className="flex items-center gap-2 text-yellow-400">{i.icon}</div>
                <div className="text-sm text-neutral-300">{i.label}</div>
                <div className="text-3xl font-bold">{i.value}</div>
                <div className="text-xs text-neutral-400">{i.info}</div>
              </div>
            ))}
          </div>

          {/* Mapa + Painel */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="border border-yellow-600/40 rounded-xl bg-neutral-950 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="border border-yellow-500 rounded-full px-3 py-1 text-sm">ROTA 04 — CENTRO</div>
                <div className="text-xs">ETA: 28 min</div>
                <div className="text-xs">Total: 7,2 km</div>
              </div>
              <div className="h-64 bg-neutral-900 rounded-lg flex items-center justify-center text-neutral-500">Mapa simulado</div>
              <div className="mt-2 border border-yellow-600/40 rounded p-2 text-sm">3 pedidos agrupados • 1 ainda em produção</div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  {letra:"A",ped:"#4598",cli:"Ana Costa",km:"2,1 km",t:"8 min"},
                  {letra:"B",ped:"#4601",cli:"Ricardo Souza",km:"2,7 km",t:"10 min"},
                  {letra:"C",ped:"#4603",cli:"Luciana Melo",km:"2,4 km",t:"10 min"},
                ].map((p,i)=>(
                  <div key={i} className="border border-neutral-700 rounded-lg p-2 bg-neutral-900">
                    <div className="text-sm font-bold">{p.letra}ª Entrega {p.ped}</div>
                    <div className="text-xs text-neutral-300">{p.cli}</div>
                    <div className="text-xs">{p.km} • {p.t}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-yellow-600/40 rounded-xl bg-neutral-950 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xl font-bold">Rota 04 — Centro</div>
                <div className="text-xs border border-yellow-600 rounded px-2">3 pedidos</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>Motoboy: <b>Carlos</b></div>
                <div>Status da rota: <span className="bg-yellow-500 text-black rounded px-2">Aguardando liberação</span></div>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  {ped:"#4598",cli:"Ana Costa",bairro:"Centro",status:"Em produção"},
                  {ped:"#4601",cli:"Ricardo Souza",bairro:"Vila Marina",status:"Pronto"},
                  {ped:"#4603",cli:"Luciana Melo",bairro:"Centro",status:"Pronto"},
                ].map((r,i)=>(
                  <div key={i} className="border border-neutral-800 rounded p-2 flex justify-between">
                    <div>Pedido {r.ped}<br/><span className="text-xs">{r.cli} • {r.bairro}</span></div>
                    <div className="text-xs">{r.status}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button className="border rounded px-3 py-1 text-sm">Ver rota</button>
                <button className="border rounded px-3 py-1 text-sm">Editar agrupamento</button>
                <button className="bg-yellow-500 text-black rounded px-3 py-1 text-sm font-bold">Liberar motoboy</button>
                <button className="border rounded px-3 py-1 text-sm">Avisar cozinha</button>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="border border-yellow-600/40 rounded p-2 bg-yellow-900/20 text-sm">1 pedido ainda em produção</div>
                <div className="border border-green-700 rounded p-2 bg-green-900/20 text-sm">Quando todos estiverem prontos, liberar rota.</div>
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="border border-yellow-600/40 rounded-xl bg-neutral-950 p-3">
            <div className="font-bold mb-2">Pedidos com rota</div>
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-400">
                <tr>
                  <th>Rota</th><th>Pedido(s)</th><th>Cliente</th><th>Bairro</th><th>Status</th><th>Observação</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-neutral-800">
                  <td>Rota 04</td><td>#4598, #4601, #4603</td><td>Ana Costa e outros</td><td>Centro / Vila Marina</td><td>Aguardando liberação</td><td>1 em produção</td><td>Ver rota</td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
