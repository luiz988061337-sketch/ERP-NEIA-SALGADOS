import { useState } from "react";
import { toast } from "sonner";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CentralPedidos } from "@/components/central-pedidos";
import {
  AVISOS_ATENDENTE_L2,
  PEDIDOS_ATENDENTE_L2,
} from "@/components/admin/central-atendente-l2-data";
import { CONFIG_ALERTA_PADRAO, type AvisoCozinha, type PedidoCentral } from "@/lib/central-pedidos";

/**
 * Conteúdo da Central da Atendente aprovada (referência /preview-l2-atendente).
 *
 * Reutiliza o componente real `CentralPedidos`, com o mesmo layout de três
 * colunas, filtros e cards. As fixtures são locais e fictícias: o aceite da
 * atendente apenas move o card para "Em produção" neste estado em memória,
 * sem RPC, sem Supabase e sem qualquer efeito fora do Preview. O alerta sonoro
 * usa a configuração demonstrativa aprovada: ativo, 75% e repetição a cada 30s.
 */
export function CentralAtendenteL2({
  usuario = "neia@neiasalgados.com",
}: {
  usuario?: string | null;
}) {
  const [pedidos, setPedidos] = useState<PedidoCentral[]>(() =>
    PEDIDOS_ATENDENTE_L2.map((p) => ({ ...p })),
  );
  const [avisos, setAvisos] = useState<AvisoCozinha[]>(() =>
    AVISOS_ATENDENTE_L2.map((a) => ({ ...a })),
  );

  function aceitar(pedido: PedidoCentral) {
    const agora = new Date().toISOString();
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === pedido.id
          ? {
              ...p,
              aceito_em_atendente: agora,
              liberado_em: agora,
              status: "em_producao",
              producao_status: "produzindo",
            }
          : p,
      ),
    );
    toast.success(
      `Pedido #${pedido.numero} aceito pela atendente e encaminhado à produção (simulação local).`,
    );
  }

  function reconhecerAviso(id: string) {
    setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, lida: true } : a)));
  }

  return (
    <>
      <AdminTopbar usuario={usuario} acesso="Atendente" />
      <CentralPedidos
        preview
        pedidosInjetados={pedidos}
        avisosInjetados={avisos}
        onAceitar={aceitar}
        onAvisoReconhecido={reconhecerAviso}
        configInicial={CONFIG_ALERTA_PADRAO}
      />
    </>
  );
}
