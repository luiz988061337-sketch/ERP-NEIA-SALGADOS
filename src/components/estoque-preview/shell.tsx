import { useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModalEstoque } from "./compartilhados";

/** Mesmo AdminShell e mesma fonte de menu (ADMIN_NAV) de todas as áreas. */
const ABA_DA_ROTA: Record<string, string> = {
  "cadastro-produtos": "produtos",
  combos: "combos",
  "estoque-embalagens": "embalagens",
  "estoque-salgados": "insumos",
  "estoque-insumos": "insumos-demo",
};

export function EstoquesShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const ultimo = pathname.split("/").filter(Boolean).at(-1) ?? "estoque-salgados";
  const aba = ABA_DA_ROTA[ultimo] ?? ultimo;
  const [modal, setModal] = useState<string | null>(null);
  return (
    <AdminShell
      aba={aba}
      onAba={setModal}
      onRefresh={() =>
        toast.info(
          "Prévia atualizada: os saldos locais foram preservados. Nenhuma consulta ao banco.",
        )
      }
      usuario="Administracao@demo.local"
      modoPreview
    >
      <div className="estoques-preview" data-testid="estoques-preview">
        <div className="est-preview-ribbon">
          <SidebarTrigger aria-label="Abrir menu administrativo" />
          <span>
            <b>E1 + E2 + E3</b> · DADOS DEMONSTRATIVOS · Sem banco, sem movimentação real
          </span>
          <small>Referência: 14/11/2026</small>
        </div>
        <div className="est-content">{children}</div>
      </div>
      {modal && (
        <ModalEstoque titulo="Módulo em planejamento" fechar={() => setModal(null)}>
          <p className="text-sm">
            A seção {modal} entra em uma etapa futura. Nenhuma tela operacional aprovada foi
            substituída e nenhuma gravação real é feita nesta prévia.
          </p>
        </ModalEstoque>
      )}
    </AdminShell>
  );
}
