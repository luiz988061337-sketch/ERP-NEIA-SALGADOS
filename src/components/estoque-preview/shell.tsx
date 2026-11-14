import { useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Boxes, ClipboardList, Layers, Snowflake, Wheat } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_NAV, type AdminNavGroup } from "@/components/admin/admin-nav";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModalEstoque } from "./compartilhados";

// Mesmo renderer/SidebarProvider/AdminShell aprovados. Apenas dados de menu da prévia.
const MENU: AdminNavGroup[] = [
  {
    label: "Principal",
    items: ADMIN_NAV[0]!.items.filter(
      (i) => !["produtos", "insumos", "financeiro", "loja"].includes(i.value),
    ),
  },
  {
    label: "Produtos",
    items: [
      {
        value: "cadastro-produtos",
        label: "Cadastro de Produtos",
        icon: ClipboardList,
        href: "/preview/cadastro-produtos",
      },
      {
        value: "estoque-salgados",
        label: "Estoque de Salgados",
        icon: Snowflake,
        href: "/preview/estoque-salgados",
      },
      { value: "combos", label: "Combos", icon: Layers, href: "/preview/combos" },
    ],
  },
  {
    label: "Estoque",
    items: [
      { value: "estoque-insumos", label: "Insumos", icon: Wheat, href: "/preview/estoque-insumos" },
      {
        value: "estoque-embalagens",
        label: "Embalagens",
        icon: Boxes,
        href: "/preview/estoque-embalagens",
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      ADMIN_NAV[0]!.items.find((i) => i.value === "financeiro")!,
      ...ADMIN_NAV[2]!.items.filter((i) => i.value !== "fichas"),
      ADMIN_NAV[0]!.items.find((i) => i.value === "loja")!,
    ],
  },
];
export function EstoquesShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const aba = pathname.split("/").filter(Boolean).at(-1) ?? "estoque-salgados";
  const [modal, setModal] = useState<string | null>(null);
  function abrir(valor: string) {
    setModal(valor);
  }
  return (
    <AdminShell
      aba={aba}
      onAba={abrir}
      onRefresh={() =>
        toast.info(
          "Prévia atualizada: os saldos locais foram preservados. Nenhuma consulta ao banco.",
        )
      }
      usuario="Administracao@demo.local"
      modoPreview
      menuPreview={MENU}
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
        <ModalEstoque titulo="Módulo operacional preservado" fechar={() => setModal(null)}>
          <p className="text-sm">
            Dashboard, PDV, Produção, Entregas, Financeiro e Compras continuam nos seus módulos
            aprovados. Esta prévia permite navegar e movimentar apenas os três estoques fictícios;
            nenhuma tela operacional foi substituída.
          </p>
        </ModalEstoque>
      )}
    </AdminShell>
  );
}
