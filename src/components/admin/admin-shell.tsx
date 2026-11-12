import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, RefreshCw, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";

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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_NAV } from "./admin-nav";
import { AdminTopbar } from "./admin-topbar";
import logo from "@/assets/neia-logo.png.asset.json";

/**
 * Shell do Admin (identidade clara): sidebar branca com pill dourada ativa
 * e topbar clara com conexão real, relógio, usuário e saída.
 * A aba ativa continua controlada pelo estado do React (sem URL).
 * Itens com `href` navegam para rotas staff (PDV, Produção, Central).
 * Todos os estilos usam os tokens .erp-admin (identidade clara oficial).
 * A loja pública nunca recebe essa classe, então nada muda visualmente fora do admin.
 */
export function AdminShell({
  aba,
  onAba,
  onRefresh,
  usuario,
  onSair,
  children,
}: {
  aba: string;
  onAba: (v: string) => void;
  onRefresh: () => void;
  usuario?: string | null;
  onSair?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="group-data-[variant=inset]:bg-sidebar group-data-[collapsible=icon]:!p-2"
      >
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 px-1 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={logo.url} alt="Néia Salgados" className="h-9 w-auto shrink-0" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-display text-base leading-tight text-sidebar-foreground">
                Néia Salgados
              </p>
              <p className="truncate text-xs text-sidebar-foreground/70">Administração</p>
            </div>
          </div>
        </SidebarHeader>

        <MenuLateral aba={aba} onAba={onAba} />

        <SidebarFooter>
          <SidebarSeparator className="bg-sidebar-border" />
          <SidebarMenu>
            {usuario ? (
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={usuario} className="cursor-default text-sidebar-foreground">
                  <UserRound />
                  <span className="truncate">{usuario}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Atualizar dados"
                onClick={onRefresh}
                className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <RefreshCw />
                <span>Atualizar dados</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {onSair ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Sair"
                  onClick={onSair}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <LogOut />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}

/**
 * Navegação lateral (dentro do provider): no desktop fica sempre aberta
 * (sem recolher); no celular fecha o drawer ao escolher o destino.
 */
function MenuLateral({ aba, onAba }: { aba: string; onAba: (v: string) => void }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  function ir(v: string) {
    onAba(v);
    if (isMobile) setOpenMobile(false);
  }
  return (
    <SidebarContent className="no-scrollbar">
      {ADMIN_NAV.map((grupo) => (
        <SidebarGroup key={grupo.label}>
          <SidebarGroupLabel className="px-2 font-display text-[0.7rem] uppercase tracking-wide text-sidebar-foreground/70">
            {grupo.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5">
              {grupo.items.map((item) => (
                <SidebarMenuItem key={item.value}>
                  {item.href ? (
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      className="min-h-[44px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <Link to={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      tooltip={item.label}
                      onClick={() => ir(item.value)}
                      aria-current={aba === item.value ? "page" : undefined}
                      className={aba === item.value
                        ? "min-h-[44px] bg-sidebar-accent font-semibold text-sidebar-foreground shadow-card hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        : "min-h-[44px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  );
}