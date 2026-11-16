import { DEFAULT_CRM_SETTINGS, isFrequenteCfg, isVipCfg } from "@/lib/crm";
import { intervaloHabitual, proximaRecompra } from "@/lib/inteligencia";
import { DATA_COMERCIAL, type ClienteDemo } from "./dados";
import type { CandidatoCampanha } from "./campanhas-regras";

const DATA_CONTATO_DEMO: Record<string, number> = {
  "cli-demo-2": 3, "cli-demo-9": 5, "cli-demo-20": 2, "cli-demo-33": 6, "cli-demo-47": 4,
};
const OPT_OUT_DEMO = new Set(["cli-demo-1", "cli-demo-15", "cli-demo-32", "cli-demo-50"]);
const DIA = 86_400_000;

export function candidatoCampanha(cliente: ClienteDemo): CandidatoCampanha {
  const ultimo = cliente.historico.find((evento) => evento.tipo === "Pedido")?.data;
  // O histórico C1 tem um único pedido datado. Para a simulação, acrescenta
  // um pedido fictício anterior apenas quando a base indica pelo menos dois pedidos.
  const datas = ultimo && cliente.totalPedidos >= 2
    ? [new Date(Date.parse(ultimo) - 21 * DIA).toISOString(), ultimo]
    : [];
  const proxima = proximaRecompra(ultimo ?? null, intervaloHabitual(datas));
  const dias = proxima ? Math.ceil((proxima.getTime() - Date.parse(DATA_COMERCIAL)) / DIA) : null;
  return {
    id: cliente.id, nome: cliente.nome, diasSemComprar: cliente.diasSemComprar,
    vip: isVipCfg(cliente.totalGasto, cliente.totalPedidos, DEFAULT_CRM_SETTINGS),
    recorrente: isFrequenteCfg(cliente.totalPedidos, DEFAULT_CRM_SETTINGS),
    reclamacao: cliente.origem === "Reclamação",
    optOut: OPT_OUT_DEMO.has(cliente.id),
    diasDesdeContato: DATA_CONTATO_DEMO[cliente.id] ?? null,
    recompra: dias !== null && dias >= 0 && dias <= 7,
  };
}
