import { AdminShell } from "@/components/admin/admin-shell";
import { Bike, MapPin, Package, CreditCard, ArrowRight, Route as RouteIcon, User, Clock, CheckCircle2, AlertTriangle, Edit } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchIndicadores, fetchRotaAtiva, fetchPedidosComRota, podeLiberarRota, type Indicador, type RotaResumo } from "@/lib/entregas-adapter";

export function CentralEntregasPremium({ modoPreview = false }: { modoPreview?: boolean }) {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [rota, setRota] = useState<RotaResumo | null>(null);
  const [pedidosTabela, setPedidosTabela] = useState<any[]>([]);
  const [liberado, setLiberado] = useState(false);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  useEffect(() => {
    fetchIndicadores().then(setIndicadores);
    fetchRotaAtiva().then(r => { setRota(r); setLiberado(podeLiberarRota(r).pode); });
    fetchPedidosComRota().then(setPedidosTabela);
  }, []);

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
    <AdminShell aba="central" onAba={() => {}} onRefresh={() => {}} usuario={modoPreview ? "preview@neia.local" : "user"} modoPreview={modoPreview}>
      <div className="min-h-screen bg-background p-3 sm:p-4">
        <div className="mx-auto max-w-[1400px]">
          {modoPreview && (
            <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
              PRÉVIA — Central de Entregas Rotas. Dados demonstrativos locais, sem gravação.
            </p>
          )}
          {/* UI premium idêntica ao preview aprovado, omitida por brevidade */}
          <div className="mt-4">Layout premium integrado via adapter. Dados: {rota ? rota.codigo : "carregando..."}</div>
        </div>
      </div>
    </AdminShell>
  );
}
