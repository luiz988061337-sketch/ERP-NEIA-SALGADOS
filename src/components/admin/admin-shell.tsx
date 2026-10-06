import type { ReactNode } from "react";
import { RefreshCw, Store } from "lucide-react";

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
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ADMIN_ABA_DESCRICAO, ADMIN_ABA_TITULO, ADMIN_NAV } from "./admin-nav";

/**
 * Shell do Admin: menu lateral fixo e recolhivel no desktop, off-canvas no
 * celular. A aba ativa continua controlada pelo estado do React (sem URL),
 * exatamente como antes — o shell apenas reorganiza a navegacao.
 */
export function AdminShell({
  aba,
  onAba,
  onRefresh,
  children,
}: {
  aba: string;
  onAba: (v: string) => void;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const titulo = ADMIN_ABA_TITULO[aba] ?? "Administração";
  const descricao = ADMIN_ABA_DESCRICAO[aba] ?? "Gestão completa da operação Néia Salgados.";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex items-center gap-2.5 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="brand-gradient grid size-9 shrink-0 place-items-center rounded-lg text-primary-foreground shadow-card">
              <Store className="size-5" />
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-display text-base leading-tight">Néia Salgados</p>
              <p className="truncate text-xs text-muted-foreground">Administração</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="no-scrollbar">
          {ADMIN_NAV.map((grupo) => (
            <SidebarGroup key={grupo.label}>
              <SidebarGroupLabel className="font-display text-[0.7rem] uppercase tracking-wide">
                {grupo.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5">
                  {grupo.items.map((item) => (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        isActive={aba === item.value}
                        tooltip={item.label}
                        onClick={() => onAba(item.value)}
                        aria-current={aba === item.value ? "page" : undefined}
                        className={
                          aba === item.value
                            ? "bg-primary font-medium text-primary-foreground shadow-card hover:bg-primary hover:text-primary-foreground"
                            : undefined
                        }
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator className="bg-sidebar-border" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Atualizar dados" onClick={onRefresh}>
                <RefreshCw />
                <span>Atualizar dados</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        {/* Topo fixo: hamburger no celular + titulo da aba atual */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl lg:text-2xl">{titulo}</h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{descricao}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={onRefresh}>
            <RefreshCw className="mr-1.5 size-4" />
            <span className="hidden sm:inline">Atualizar dados</span>
            <span className="sm:hidden">Atualizar</span>
          </Button>
        </header>

        <div className="min-w-0 px-4 py-5 lg:px-6 lg:py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
