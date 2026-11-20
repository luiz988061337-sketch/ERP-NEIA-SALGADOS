/**
 * C1 — Layout do Preview Comercial.
 * Usa o AdminShell compartilhado e a FONTE ÚNICA do menu (ADMIN_NAV).
 * Nenhuma lista paralela de navegação: o grupo Comercial faz parte do menu
 * administrativo e fica acessível em todas as rotas.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ComercialProvider } from "./contexto";
import { ModalEstoque } from "@/components/estoque-preview/compartilhados";

/** Valores da suíte mapeados para os itens do menu lateral. */
const ABA_DA_SUITE: Record<string, string> = {
  painel: "painel-comercial",
  clientes: "clientes-crm",
  campanhas: "campanhas-comercial",
  pesquisas: "pesquisas-reclamacoes",
  sugestoes: "sugestoes-promocao",
  resultados: "resultados",
};

export function ComercialShell({
  children,
  abaSuite,
}: {
  children: ReactNode;
  abaSuite?: string | undefined;
}) {
  const { pathname } = useLocation();
  const ultimo = pathname.split("/").filter(Boolean).at(-1) ?? "painel";
  const aba = (abaSuite ? ABA_DA_SUITE[abaSuite] : undefined) ?? ABA_DA_SUITE[ultimo] ?? "painel-comercial";
  const [modal, setModal] = useState<string | null>(null);
  return (
    <AdminShell
      aba={aba}
      onAba={setModal}
      onRefresh={() =>
        toast.info("Prévia atualizada: os dados demonstrativos locais foram preservados.")
      }
      usuario="Administracao@demo.local"
      modoPreview
      grupoAtivo="Comercial"
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
          titulo="Módulo em planejamento"
          descricao="Esta seção entra em uma etapa futura, após aprovação do Painel Comercial."
          fechar={() => setModal(null)}
        >
          <p className="text-sm">
            A seção {modal} será construída na etapa correspondente, sempre com dados
            demonstrativos e sem alteração nos módulos já aprovados.
          </p>
        </ModalEstoque>
      ) : null}
    </AdminShell>
  );
}

export function ComercialProviderLayout({
  children,
  abaSuite,
}: {
  children: ReactNode;
  abaSuite?: string | undefined;
}) {
  return (
    <ComercialProvider>
      <ComercialShell abaSuite={abaSuite}>{children}</ComercialShell>
    </ComercialProvider>
  );
}

export const ICONE_PAINEL = Target;
