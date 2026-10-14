import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, RefreshCw, UserRound } from "lucide-react";

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
import { ADMIN_NAV } from "./admin-nav";
import { AdminTopbar } from "./admin-topbar";
import logo from "@/assets/neia-logo.png.asset.json";
import fritos from "@/assets/cat-fritos.jpg";

/**
 * Shell do Admin (visual Projeto A1): sidebar escura com pill amarela ativa
 * e topbar com loja, conexão real, relógio, usuário e saída.
 * A aba ativa continua controlada pelo estado do React (sem URL).
 * Itens com `href` navegam para rotas staff (PDV, Produção, Central).
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
        className="admin-dark border-r border-neutral-800 bg-neutral-950 text-neutral-200"
      >
        <SidebarHeader className="border-b border-neutral-800">
          <div className="flex items-center gap-2.5 px-1 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={logo.url} alt="Néia Salgados" className="h-9 w-auto shrink-0" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-display text-base leading-tight text-white">
                Néia Salgados
              </p>
              <p className="truncate text-xs text-neutral-400">Administração</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="no-scrollbar">
          {ADMIN_NAV.map((grupo) => (
            <SidebarGroup key={grupo.label}>
              <SidebarGroupLabel className="px-2 font-display text-[0.7rem] uppercase tracking-wide text-neutral-500">
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
                          className="min-h-[44px] text-neutral-200 hover:bg-neutral-800 hover:text-white"
                        >
                          <Link to={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          tooltip={item.label}
                          onClick={() => onAba(item.value)}
                          aria-current={aba === item.value ? "page" : undefined}
                          className={
                            aba === item.value
                              ? "min-h-[44px] bg-yellow-400 font-semibold text-black shadow-card hover:bg-yellow-400 hover:text-black"
                              : "min-h-[44px] text-neutral-200 hover:bg-neutral-800 hover:text-white"
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

        <SidebarFooter>
          <SidebarSeparator className="bg-neutral-800" />
          <div className="overflow-hidden rounded-xl border border-neutral-800 group-data-[collapsible=icon]:hidden">
            <img
              src={fritos}
              alt="Salgados Néia"
              className="h-24 w-full object-cover"
              loading="lazy"
            />
            <p className="bg-neutral-900 px-3 py-2 text-xs italic text-neutral-300">
              Qualidade, sabor e confiança em cada pedido!
            </p>
          </div>
          <SidebarMenu>
            {usuario ? (
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={usuario} className="cursor-default text-neutral-200">
                  <UserRound />
                  <span className="truncate">{usuario}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Atualizar dados"
                onClick={onRefresh}
                className="text-neutral-200 hover:bg-neutral-800 hover:text-white"
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
                  className="text-neutral-200 hover:bg-neutral-800 hover:text-white"
                >
                  <LogOut />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <AdminTopbar
          usuario={usuario}
          onSair={onSair}
          onLojaClick={() => onAba("loja")}
          menuButton={
            <SidebarTrigger className="-ml-1 text-neutral-200 hover:bg-neutral-800 hover:text-white" />
          }
        />

        <div className="min-w-0 bg-neutral-100 px-4 py-5 lg:px-6 lg:py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
