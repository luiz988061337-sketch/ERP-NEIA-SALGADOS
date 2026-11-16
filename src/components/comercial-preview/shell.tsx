/**
 * C1 — Layout do Preview Comercial.
 * Mesmo AdminShell aprovado (nenhum shell novo), dados de menu exclusivos do
 * Preview e estado local compartilhado entre as rotas.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Layers,
  Lightbulb,
  Megaphone,
  MessageSquareWarning,
  Snowflake,
  Target,
  Users,
  Wheat,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_NAV, type AdminNavGroup } from "@/components/admin/admin-nav";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ComercialProvider } from "./contexto";
import { ModalEstoque } from "@/components/estoque-preview/compartilhados";

const ETAPAS_FUTURAS: Record<string, string> = {
  campanhas: "Campanhas (C2)",
  resultados: "Resultados (C5)",
};

const MENU: AdminNavGroup[] = [
  {
    label: "Principal",
    items: ADMIN_NAV[0]!.items.filter(
      (i) => !["produtos", "insumos", "financeiro", "loja", "comercial"].includes(i.value),
    ),
  },
  {
    label: "Comercial",
    items: [
      {
        value: "painel-comercial",
        label: "Painel / Marketing e Reativação",
        icon: Megaphone,
        href: "/preview/comercial/painel",
      },
      {
        value: "clientes-crm",
        label: "Clientes / CRM",
        icon: Users,
        href: "/preview/comercial/clientes",
      },
      {
        value: "campanhas",
        label: "Campanhas",
        icon: Megaphone,
        href: "/preview/comercial/campanhas",
      },
      {
        value: "pesquisas-reclamacoes",
        label: "Pesquisas e Reclamações",
        icon: MessageSquareWarning,
        href: "/preview/comercial/pesquisas-reclamacoes",
      },
      {
        value: "sugestoes-promocao",
        label: "Sugestões de Promoção",
        icon: Lightbulb,
        href: "/preview/comercial/sugestoes",
      },
      {
        value: "resultados",
        label: "Resultados",
        icon: BarChart3,
      },
    ],
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

export function ComercialShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const aba = pathname.split("/").filter(Boolean).at(-1) ?? "painel-comercial";
  const [modal, setModal] = useState<string | null>(null);
  return (
    <AdminShell
      aba={aba}
      onAba={(v) => setModal(v)}
      onRefresh={() =>
        toast.info("Prévia atualizada: os dados demonstrativos locais foram preservados.")
      }
      usuario="Administracao@demo.local"
      modoPreview
      menuPreview={MENU}
      menuPreviewDuasLinhas
    >
      <div className="comercial-preview" data-testid="comercial-preview">
        <div className="com-ribbon">
          <SidebarTrigger aria-label="Abrir menu administrativo" />
          <span>
            <b>C1</b> · COMERCIAL DEMONSTRATIVO · Dados fictícios · Sem banco, sem campanha real
          </span>
          <small>Referência: 14/11/2026</small>
        </div>
        <div className="com-content">{children}</div>
      </div>
      {modal ? (
        <ModalEstoque
          titulo={ETAPAS_FUTURAS[modal] ?? "Módulo em preparação"}
          descricao="Esta seção entra em uma etapa futura, após aprovação do Painel Comercial."
          fechar={() => setModal(null)}
        >
          <p className="text-sm">
            A seção {ETAPAS_FUTURAS[modal] ?? modal} será construída na etapa correspondente,
            sempre com dados demonstrativos e sem alteração nos módulos já aprovados.
          </p>
        </ModalEstoque>
      ) : null}
    </AdminShell>
  );
}

export function ComercialProviderLayout({ children }: { children: ReactNode }) {
  return (
    <ComercialProvider>
      <ComercialShell>{children}</ComercialShell>
    </ComercialProvider>
  );
}

export const ICONE_PAINEL = Target;
