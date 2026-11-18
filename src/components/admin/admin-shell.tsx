import { useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, Crown, LogOut, RefreshCw, UserRound } from "lucide-react";

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
import { ADMIN_NAV, type AdminNavItem, type AdminNavGroup } from "./admin-nav";
import { ehPreviewModulo } from "@/lib/preview-modulos";

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
  itemExtra,
  menuPreview,
  menuPreviewDuasLinhas = false,
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
  /**
   * Item de menu extra APENAS para prévias (ex.: "Reembolsos e Estornos").
   * Injetado logo após o item Financeiro no grupo Principal; quando ausente
   * (todos os módulos aprovados) o menu permanece idêntico ao original.
   */
  itemExtra?: AdminNavItem | undefined;
  /** Organização alternativa somente na demonstração de estoques; padrão intacto. */
  menuPreview?: AdminNavGroup[];
  /**
   * Permite quebra de linha nos rótulos do menu somente nesta prévia.
   * O padrão falso preserva todos os demais módulos e a largura da sidebar.
   */
  menuPreviewDuasLinhas?: boolean;
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

        <MenuLateral
          aba={aba}
          onAba={onAba}
          modoPreview={modoPreview}
          itemExtra={itemExtra}
          menuPreview={modoPreview ? menuPreview : undefined}
          duasLinhas={menuPreviewDuasLinhas}
        />

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
      <SidebarInset>
        {!modoPreview ? (
          <div className="pointer-events-none absolute left-3 top-3 z-30 md:hidden">
            <SidebarTrigger
              aria-label="Abrir menu administrativo"
              className="pointer-events-auto size-9 border border-[#D4A94A]/60 bg-[#141310] text-[#F2CE6B] hover:bg-[#D4A94A]/15 hover:text-[#F2CE6B]"
            />
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Rotas que executam um item de menu interno (aba do admin).
 * A Central da Atendente (/atendente) é o item "Pedidos" — sem criar um
 * segundo menu nem duplicar o módulo Atendimento.
 */
const ROTA_PARA_ABA: Record<string, string> = {
  "/atendente": "pedidos",
};

/**
 * Navegação lateral (dentro do provider): no desktop fica sempre aberta
 * (sem recolher); no celular fecha o drawer ao escolher o destino.
 * Item ativo = pilula dourada (como na referencia).
 */
function MenuLateral({
  aba,
  onAba,
  modoPreview = false,
  itemExtra,
  menuPreview,
  duasLinhas = false,
}: {
  aba: string;
  onAba: (v: string) => void;
  modoPreview?: boolean;
  itemExtra?: AdminNavItem | undefined;
  menuPreview?: AdminNavGroup[] | undefined;
  duasLinhas?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (s) => s.pathname });
  // Grupos começam abertos (todas as áreas visíveis ao rolar) e podem ser
  // recolhidos para alcançar os grupos inferiores sem percorrer a lista toda.
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});

  function ir(v: string) {
    onAba(v);
    if (isMobile) setOpenMobile(false);
  }

  // Item extra de prévia: entra somente no grupo que contém "financeiro"
  // (Principal), logo depois dele. Demais grupos ficam intactos.
  function itensDoGrupo(items: AdminNavItem[]): AdminNavItem[] {
    if (!itemExtra) return items;
    const indice = items.findIndex((i) => i.value === "financeiro");
    if (indice === -1) return items;
    return [...items.slice(0, indice + 1), itemExtra, ...items.slice(indice + 1)];
  }

  const alturaRotulo = duasLinhas ? "h-auto min-h-11 py-2" : "h-9 min-h-9";
  const classeRotulo = duasLinhas
    ? "min-w-0 flex-1 whitespace-normal leading-tight"
    : "truncate";
  const estiloRotulo = duasLinhas
    ? ({ overflow: "visible", whiteSpace: "normal" } as const)
    : undefined;

  return (
    <SidebarContent
      className="bg-[#0F0E0C] [scrollbar-color:rgba(212,169,74,0.55)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D4A94A]/60 [&::-webkit-scrollbar-track]:bg-transparent"
    >
      {(modoPreview && menuPreview ? menuPreview : ADMIN_NAV).map((grupo) => {
        const aberto = gruposAbertos[grupo.label] !== false;
        return (
        <SidebarGroup key={grupo.label} className="py-1">
          <SidebarGroupLabel asChild className="px-3 font-display text-[9px] uppercase tracking-[0.14em] text-[#8A7A52] group-data-[collapsible=icon]:hidden">
            <button
              type="button"
              aria-expanded={aberto}
              aria-label={`${aberto ? "Recolher" : "Expandir"} ${grupo.label}`}
              onClick={() =>
                setGruposAbertos((prev) => ({ ...prev, [grupo.label]: !aberto }))
              }
              className="flex w-full items-center justify-between gap-2 text-left hover:text-[#F2CE6B]"
            >
              <span className="truncate">{grupo.label}</span>
              <ChevronDown
                className={`size-3.5 shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`}
                aria-hidden
              />
            </button>
          </SidebarGroupLabel>
          {aberto ? <SidebarGroupContent>
            <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
              {itensDoGrupo(grupo.items).map((item) => {
                // Ativo por aba interna OU pela rota real (ex.: /pdv, /producao).
                // No modo conferencia (rotas /preview-l2-*) a aba informada marca o item.
                // A Central da Atendente (/atendente) destaca "Pedidos".
                const abaDaRota = ROTA_PARA_ABA[pathname];
                const ativo = item.href
                  ? pathname === item.href ||
                    pathname.startsWith(`${item.href}/`) ||
                    (modoPreview && aba === item.value)
                  : (abaDaRota ?? aba) === item.value;
                return (
                  <SidebarMenuItem key={item.value}>
                    {item.href ? (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        className={`${
                          ativo
                            ? "erp-btn-gold rounded-lg border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 font-semibold text-[#14120C] shadow-card hover:bg-gradient-to-b hover:from-[#F2CE6B] hover:to-[#D4A94A] hover:text-[#14120C]"
                            : "rounded-lg border border-transparent px-3 text-sidebar-foreground hover:border-[#D4A94A]/50 hover:bg-[#D4A94A]/12 hover:text-[#F2CE6B]"
                        } ${alturaRotulo}`}
                      >
                        <Link
                          to={item.href}
                          {...(item.hash ? { hash: item.hash } : {})}
                          onClick={(e) => {
                            if (modoPreview) {
                              if (!menuPreview || !ehPreviewModulo(item.href ?? "")) {
                                e.preventDefault();
                                if (menuPreview) ir(item.value);
                                return;
                              }
                              if (isMobile) setOpenMobile(false);
                              return;
                            }
                            if (isMobile) setOpenMobile(false);
                          }}
                        >
                          <item.icon className={ativo ? "text-[#14120C]" : "text-[#C9A24B]"} />
                          <span className={classeRotulo} style={estiloRotulo}>
                            {item.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        tooltip={item.label}
                        data-value={menuPreview ? item.value : undefined}
                        onClick={() => (modoPreview && !menuPreview ? undefined : ir(item.value))}
                        aria-current={aba === item.value ? "page" : undefined}
                        className={`${
                          ativo
                            ? "erp-btn-gold rounded-lg border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 font-semibold text-[#14120C] shadow-card hover:bg-gradient-to-b hover:from-[#F2CE6B] hover:to-[#D4A94A] hover:text-[#14120C]"
                            : "rounded-lg border border-transparent px-3 text-sidebar-foreground hover:border-[#D4A94A]/50 hover:bg-[#D4A94A]/12 hover:text-[#F2CE6B]"
                        } ${alturaRotulo}`}
                      >
                        <item.icon className={ativo ? "text-[#14120C]" : "text-[#C9A24B]"} />
                        <span className={classeRotulo} style={estiloRotulo}>
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </div>
          </SidebarGroupContent> : null}
        </SidebarGroup>
        );
      })}
    </SidebarContent>
  );
}
