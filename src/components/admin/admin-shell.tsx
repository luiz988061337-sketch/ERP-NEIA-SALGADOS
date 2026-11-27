import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, ClipboardList, Crown, LogOut, RefreshCw, UserRound } from "lucide-react";

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
import { ADMIN_NAV, CENTRAL_ATENDENTE_NAV_ITEM, menuAdmin, type AdminNavItem } from "./admin-nav";

const itemTarefas: AdminNavItem = {
  value: "minhas-tarefas",
  label: "Minhas tarefas",
  icon: ClipboardList,
  href: "/admin",
  hash: "minhas-tarefas",
};

/**
 * Tokens aprovados dos painéis A01/A02.1 (`dashboard-a01.css`).
 * Aplicados somente ao menu lateral para não alterar os painéis internos.
 */
const CORES_MENU = {
  fundo: "#0a1015",
  painel: "#10171d",
  item: "#131b22",
  linha: "#4e5861",
  texto: "#f5f7fa",
  suave: "#bac5cc",
  ouro: "#ffd252",
  escuro: "#17110a",
  hover: "#26313a",
  sucesso: "#63eb9e",
  alerta: "#ff8790",
} as const;

const estilosSidebar = {
  "--sidebar": CORES_MENU.fundo,
  "--sidebar-foreground": CORES_MENU.texto,
  "--sidebar-primary": CORES_MENU.ouro,
  "--sidebar-primary-foreground": CORES_MENU.escuro,
  "--sidebar-accent": CORES_MENU.hover,
  "--sidebar-accent-foreground": CORES_MENU.texto,
  "--sidebar-border": CORES_MENU.linha,
  "--sidebar-ring": CORES_MENU.ouro,
} as React.CSSProperties;

/**
 * Shell do Admin — menu lateral compartilhado em grafite azulado dos painéis
 * A01/A02.1: fundo #0a1015, divisórias cinza, textos claros e item ativo em
 * amarelo sólido. A identidade (coroa + NÉIA SALGADOS) e o usuário no rodapé
 * usam os mesmos tokens aprovados.
 *
 * O menu usa os grupos de ADMIN_NAV e os destinos operacionais do ambiente.
 */
export function AdminShell({
  aba,
  onAba,
  onRefresh,
  usuario,
  onSair,
  children,
  modoPreview = false,
  grupoAtivo,
  menuDemonstrativo = modoPreview,
  menuPedidosAtendente = false,
  menuCentralAtendente = false,
  menuTarefas,
}: {
  aba: string;
  onAba: (v: string) => void;
  onRefresh: () => void;
  usuario?: string | null;
  onSair?: () => void;
  children: ReactNode;
  modoPreview?: boolean;
  menuDemonstrativo?: boolean;
  menuPedidosAtendente?: boolean;
  menuCentralAtendente?: boolean;
  menuTarefas?: "admin" | "equipe" | undefined;
  /** Mantém o destaque dourado restrito ao grupo da suíte aberta. */
  grupoAtivo?: string | undefined;
}) {
  // Operação usa o mesmo menu aprovado na A01.1 em todas as páginas
  // administrativas. A prévia/demonstração mantém o catálogo completo.
  const menuTarefasEfetivo = menuTarefas ?? (menuDemonstrativo ? undefined : "admin");
  const comTemaA01 =
    menuTarefasEfetivo &&
    (aba === "dashboard" || aba === "minhas-tarefas" || aba === "neia-inteligencia");
  return (
    <SidebarProvider className={comTemaA01 ? "neia-a01-shell" : undefined}
      style={
        {
          "--sidebar-width": "14rem",
          "--sidebar-width-icon": "3.25rem",
        } as React.CSSProperties
      }
    >
      <Sidebar
        collapsible="icon"
        style={estilosSidebar}
        className="border-r border-[#4e5861] bg-[#0a1015] group-data-[variant=inset]:bg-sidebar group-data-[collapsible=icon]:!p-2"
      >
        <SidebarHeader className="border-b border-[#4e5861] bg-[#10171d]">
          <div className="flex items-center gap-2.5 px-1.5 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#4e5861] bg-[#131b22]">
              <Crown className="size-[18px] text-[#ffd252]" aria-hidden />
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate font-display text-sm font-bold uppercase leading-tight tracking-wide text-[#ffd252]">
                Néia Salgados
              </p>
              <p className="truncate text-xs uppercase tracking-wider text-[#bac5cc]">
                Painel de Gestão
              </p>
              {modoPreview ? (
                <span className="mt-1 inline-block rounded-full border border-[#ffd252]/60 bg-[#ffd252]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ffd252]">
                  Prévia
                </span>
              ) : null}
            </div>
          </div>
        </SidebarHeader>

        <MenuLateral
          aba={aba}
          onAba={onAba}
          grupoAtivo={grupoAtivo}
          demonstrativo={menuDemonstrativo}
          pedidosAtendente={menuPedidosAtendente}
          centralAtendente={menuCentralAtendente}
          tarefas={menuTarefasEfetivo}
        />

        <SidebarFooter className="border-t border-[#4e5861] bg-[#10171d]">
          <div className="flex items-center gap-2.5 px-1.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#4e5861] bg-[#131b22]">
              <UserRound className="size-4 text-[#ffd252]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-semibold text-[#f5f7fa]">
                {usuario?.split("@")[0] ?? "Equipe"}
              </p>
              <p className="truncate text-xs text-[#bac5cc]">
                {menuTarefasEfetivo === "equipe" ? "Equipe" : "Administradora"}
              </p>
            </div>
            <span
              className="size-2 shrink-0 rounded-full bg-[#63eb9e] group-data-[collapsible=icon]:hidden"
              title="Online"
              aria-label="Online"
            />
          </div>
          <SidebarSeparator className="bg-[#4e5861]" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Atualizar dados"
                onClick={onRefresh}
                className="h-9 min-h-9 text-[#bac5cc] hover:bg-[#26313a] hover:text-[#f5f7fa]"
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
                  className="h-9 min-h-9 text-[#bac5cc] hover:bg-[#ff8790]/15 hover:text-[#ff8790]"
                >
                  <LogOut />
                  <span className="truncate">Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        {!modoPreview ? (
          <div className="flex border-b border-border bg-sidebar px-3 py-2 md:hidden">
            <SidebarTrigger
              aria-label="Abrir menu administrativo"
              className="size-11 border border-[#4e5861] bg-[#10171d] text-[#ffd252] hover:bg-[#26313a] hover:text-[#ffd252]"
            />
            <span className="self-center pl-3 text-sm font-semibold text-foreground">
              Menu administrativo
            </span>
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

const CHAVE_GRUPOS = "neia-admin-grupos-abertos";

function gruposIniciais(): Record<string, boolean> {
  const padrao: Record<string, boolean> = {};
  for (const grupo of ADMIN_NAV) padrao[grupo.label] = true;
  try {
    const salvo = localStorage.getItem(CHAVE_GRUPOS);
    if (!salvo) return padrao;
    const parseado = JSON.parse(salvo) as Record<string, boolean>;
    const resultado = { ...padrao };
    for (const [label, aberto] of Object.entries(parseado)) {
      if (label in resultado && typeof aberto === "boolean") resultado[label] = aberto;
    }
    return resultado;
  } catch {
    return padrao;
  }
}

/**
 * Navegação lateral única. No desktop fica sempre aberta; no celular fecha o
 * drawer ao escolher o destino. O estado dos grupos é persistido para não ser
 * perdido ao trocar de página ou recarregar (F5).
 */
function MenuLateral({
  aba,
  onAba,
  grupoAtivo,
  demonstrativo,
  pedidosAtendente,
  centralAtendente,
  tarefas,
}: {
  aba: string;
  onAba: (v: string) => void;
  grupoAtivo?: string | undefined;
  demonstrativo: boolean;
  pedidosAtendente: boolean;
  centralAtendente: boolean;
  tarefas?: "admin" | "equipe" | undefined;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname, hash } = useLocation();
  const gruposAdmin = menuAdmin(demonstrativo, pedidosAtendente, centralAtendente);
  const grupos =
    tarefas === "equipe"
      ? [{
          label: "Principal",
          items: centralAtendente ? [itemTarefas, CENTRAL_ATENDENTE_NAV_ITEM] : [itemTarefas],
        }]
      : gruposAdmin.map((grupo) => {
          if (tarefas !== "admin" || grupo.label !== "Principal") return grupo;
          const [inicio, ...resto] = grupo.items;
          return { ...grupo, items: inicio ? [inicio, itemTarefas, ...resto] : [itemTarefas] };
        });
  const itens = grupos.flatMap((grupo) => grupo.items);
  const candidatos = itens.filter(
    (item) => item.href === pathname || (item.href && pathname.startsWith(`${item.href}/`)),
  );
  const linkAtivo =
    candidatos.find((item) => item.hash && item.hash === hash) ??
    candidatos.find((item) => !item.hash || (pathname === "/admin" && item.value === aba)) ??
    itens.find((item) => item.value === aba);
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setGruposAbertos(gruposIniciais());
  }, []);

  function alternarGrupo(label: string) {
    setGruposAbertos((prev) => {
      const next = { ...prev, [label]: prev[label] === false };
      try {
        localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function ir(v: string) {
    onAba(v);
    if (isMobile) setOpenMobile(false);
  }

  return (
    <SidebarContent className="bg-[#0a1015] [scrollbar-color:#4e5861_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#4e5861]/80 [&::-webkit-scrollbar-track]:bg-transparent">
      {grupos.map((grupo) => {
        const aberto = gruposAbertos[grupo.label] !== false;
        const ehComercial = grupo.label === "Comercial";
        return (
          <SidebarGroup key={grupo.label} data-grupo={grupo.label} className="py-1">
            <SidebarGroupLabel
              asChild
              className="px-3 font-display text-xs uppercase tracking-wide text-[#bac5cc] group-data-[collapsible=icon]:hidden"
            >
              <button
                type="button"
                aria-expanded={aberto}
                aria-label={`${aberto ? "Recolher" : "Expandir"} ${grupo.label}`}
                onClick={() => alternarGrupo(grupo.label)}
                className="flex w-full items-center justify-between gap-2 text-left hover:text-[#ffd252]"
              >
                <span className="truncate">{grupo.label}</span>
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`}
                  aria-hidden
                />
              </button>
            </SidebarGroupLabel>
            {aberto ? (
              <SidebarGroupContent>
                <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
                  {grupo.items.map((item) => {
                    const ativo = grupoAtivo
                      ? grupo.label === grupoAtivo && aba === item.value
                      : item.href
                        ? linkAtivo === item
                        : aba === item.value;

                    const alturaItem = ehComercial
                      ? item.linhas
                        ? "h-[58px] min-h-[58px] py-0"
                        : "h-11 min-h-11 py-0"
                      : "h-10 min-h-10";
                    const classeTexto = ehComercial ? "min-w-0 flex-1 leading-[17px]" : "truncate";
                    const estiloTexto = ehComercial
                      ? ({ overflow: "visible", whiteSpace: "normal" } as const)
                      : undefined;
                    const classeIcone = `${
                      ehComercial ? "shrink-0" : ""
                    } ${ativo ? "text-[#17110a]" : "text-[#bac5cc]"}`;
                    const textoItem = item.linhas
                      ? item.linhas.map((linha, indice) => (
                          <span key={`${item.value}-linha-${indice}`} className="block">
                            {linha}
                          </span>
                        ))
                      : item.label;
                    // O SidebarMenuButton aplica `data-[active=true]:bg-sidebar-accent`
                    // depois das classes utilitárias; o estilo inline garante o
                    // amarelo sólido aprovado em todos os módulos.
                    const estiloAtivo = ativo
                      ? ({
                          backgroundColor: CORES_MENU.ouro,
                          backgroundImage: "none",
                          color: CORES_MENU.escuro,
                          borderColor: CORES_MENU.ouro,
                        } as const)
                      : undefined;
                    const classes = `${
                      ativo
                        ? "rounded-lg border border-[#ffd252] bg-[#ffd252] px-3 font-semibold text-[#17110a] shadow-card hover:bg-[#ffd252] hover:text-[#17110a]"
                        : "rounded-lg border border-transparent px-3 text-[#f5f7fa] hover:border-[#4e5861] hover:bg-[#26313a] hover:text-[#f5f7fa]"
                    } ${alturaItem}`;

                    return (
                      <SidebarMenuItem key={item.value}>
                        {item.href ? (
                          <SidebarMenuButton
                            asChild
                            tooltip={item.label}
                            data-value={item.value}
                            className={classes}
                            isActive={ativo}
                          >
                            <Link
                              to={item.href}
                              preload="intent"
                              hashScrollIntoView={false}
                              resetScroll={false}
                              activeOptions={{ exact: true, includeHash: true }}
                              aria-current={ativo ? "page" : undefined}
                              style={estiloAtivo}
                              {...(item.hash ? { hash: item.hash } : {})}
                              onClick={() => {
                                if (isMobile) setOpenMobile(false);
                              }}
                            >
                              <item.icon className={classeIcone} />
                              <span
                                className={`${classeTexto}${ativo ? " text-[#17110a]" : ""}`}
                                style={estiloTexto}
                              >
                                {textoItem}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton
                            tooltip={item.label}
                            data-value={item.value}
                            onClick={() => ir(item.value)}
                            aria-current={aba === item.value ? "page" : undefined}
                            className={classes}
                            style={estiloAtivo}
                          >
                            <item.icon className={classeIcone} />
                            <span className={classeTexto} style={estiloTexto}>
                              {textoItem}
                            </span>
                          </SidebarMenuButton>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </div>
              </SidebarGroupContent>
            ) : null}
          </SidebarGroup>
        );
      })}
    </SidebarContent>
  );
}
