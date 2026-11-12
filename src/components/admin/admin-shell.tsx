import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Crown, LogOut, RefreshCw, UserRound } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_NAV } from "./admin-nav";

/**
 * Shell do Admin — aparência da referência preto/dourado:
 * sidebar compacta com moldura dourada, marca (coroa + NÉIA SALGADOS),
 * item ativo em pilula dourada, ícones claros e usuário no rodapé.
 *
 * O menu continua sendo o existente (ADMIN_NAV) — nenhum item duplicado e
 * nenhuma função removida. A aba ativa continua controlada pelo estado do
 * React (sem URL); itens com `href` navegam para as rotas staff (PDV,
 * Produção, Central). Estilos usam os tokens .erp-admin (escuro/dourado).
 */
export function AdminShell({
  aba,
  onAba,
  onRefresh,
  usuario,
  onSair,
  children,
  modoPreview = false,
}: {
  aba: string;
  onAba: (v: string) => void;
  onRefresh: () => void;
  usuario?: string | null;
  onSair?: () => void;
  children: ReactNode;
  /**
   * Modo demonstração (rotas /preview-l2-*): mostra o mesmo shell para
   * conferência visual, mas sem navegação real e com selo "PRÉVIA" —
   * a administração real continua em /admin.
   */
  modoPreview?: boolean;
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "14rem",
          "--sidebar-width-icon": "3.25rem",
        } as React.CSSProperties
      }
    >
      <Sidebar
        collapsible="icon"
        className="border-r border-[#D4A94A]/45 bg-[#0F0E0C] group-data-[variant=inset]:bg-sidebar group-data-[collapsible=icon]:!p-2"
      >
        <SidebarHeader className="border-b border-[#D4A94A]/35 bg-[#141310]">
          <div className="flex items-center gap-2.5 px-1.5 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
              <Crown className="size-[18px] text-[#F2CE6B]" aria-hidden />
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-display text-[13px] font-bold uppercase leading-tight tracking-wide text-[#F2CE6B]">
                Néia Salgados
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                Painel de Gestão
              </p>
              {modoPreview ? (
                <span className="mt-1 inline-block rounded-full border border-[#F5B301]/60 bg-[#F5B301]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#F5B301]">
                  Prévia
                </span>
              ) : null}
            </div>
          </div>
        </SidebarHeader>

        <MenuLateral aba={aba} onAba={onAba} modoPreview={modoPreview} />

        <SidebarFooter className="border-t border-[#D4A94A]/35 bg-[#141310]">
          <div className="flex items-center gap-2.5 px-1.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#D4A94A] bg-[#1A1712]">
              <UserRound className="size-4 text-[#F2CE6B]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-semibold text-foreground">
                {usuario?.split("@")[0] ?? "Equipe"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">Administradora</p>
            </div>
            <span
              className="size-2 shrink-0 rounded-full bg-[#35C97C] group-data-[collapsible=icon]:hidden"
              title="Online"
              aria-label="Online"
            />
          </div>
          <SidebarSeparator className="bg-[#D4A94A]/25" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Atualizar dados"
                onClick={onRefresh}
                className="h-9 min-h-9 text-sidebar-foreground hover:bg-[#D4A94A]/15 hover:text-[#F2CE6B]"
              >
                <RefreshCw />
                <span className="truncate">Atualizar dados</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {onSair ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Sair"
                  onClick={onSair}
                  className="h-9 min-h-9 text-sidebar-foreground hover:bg-[#F16A6A]/15 hover:text-[#F16A6A]"
                >
                  <LogOut />
                  <span className="truncate">Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* Conteúdo da aba (antes era descartado: a página ficava só com a
          sidebar). O SidebarInset reserva o espaço da sidebar no desktop. */}
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Navegação lateral (dentro do provider): no desktop fica sempre aberta
 * (sem recolher); no celular fecha o drawer ao escolher o destino.
 * Item ativo = pilula dourada (como na referência).
 */
function MenuLateral({
  aba,
  onAba,
  modoPreview = false,
}: {
  aba: string;
  onAba: (v: string) => void;
  modoPreview?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (s) => s.pathname });

  function ir(v: string) {
    onAba(v);
    if (isMobile) setOpenMobile(false);
  }
  return (
    <SidebarContent className="no-scrollbar bg-[#0F0E0C]">
      {ADMIN_NAV.map((grupo) => (
        <SidebarGroup key={grupo.label} className="py-1">
          <SidebarGroupLabel className="px-3 font-display text-[9px] uppercase tracking-[0.14em] text-[#8A7A52] group-data-[collapsible=icon]:hidden">
            {grupo.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
              {grupo.items.map((item) => {
                // Ativo por aba interna OU pela rota real (ex.: /pdv, /producao).
                // No modo conferencia (rotas /preview-l2-*) a aba informada marca o item.
                const ativo = item.href
                  ? pathname === item.href ||
                    pathname.startsWith(`${item.href}/`) ||
                    (modoPreview && aba === item.value)
                  : aba === item.value;
                return (
                  <SidebarMenuItem key={item.value}>
                    {item.href ? (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        className={
                          ativo
                            ? "erp-btn-gold h-9 min-h-9 rounded-lg border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 font-semibold text-[#14120C] shadow-card hover:bg-gradient-to-b hover:from-[#F2CE6B] hover:to-[#D4A94A] hover:text-[#14120C]"
                            : "h-9 min-h-9 rounded-lg border border-transparent px-3 text-sidebar-foreground hover:border-[#D4A94A]/50 hover:bg-[#D4A94A]/12 hover:text-[#F2CE6B]"
                        }
                      >
                        <Link
                          to={item.href}
                          onClick={(e) => {
                            if (modoPreview) {
                              e.preventDefault();
                              return;
                            }
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <item.icon className={ativo ? "text-[#14120C]" : "text-[#C9A24B]"} />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        tooltip={item.label}
                        onClick={() => (modoPreview ? undefined : ir(item.value))}
                        aria-current={aba === item.value ? "page" : undefined}
                        className={
                          ativo
                            ? "erp-btn-gold h-9 min-h-9 rounded-lg border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 font-semibold text-[#14120C] shadow-card hover:bg-gradient-to-b hover:from-[#F2CE6B] hover:to-[#D4A94A] hover:text-[#14120C]"
                            : "h-9 min-h-9 rounded-lg border border-transparent px-3 text-sidebar-foreground hover:border-[#D4A94A]/50 hover:bg-[#D4A94A]/12 hover:text-[#F2CE6B]"
                        }
                      >
                        <item.icon className={ativo ? "text-[#14120C]" : "text-[#C9A24B]"} />
                        <span className="truncate">{item.label}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  );
}
