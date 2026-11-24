import { useEffect, useState, type ReactNode } from "react";
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
import { ADMIN_NAV, menuAdmin } from "./admin-nav";

/**
 * Shell do Admin — aparência da referência preto/dourado:
 * sidebar compacta com moldura dourada, marca (coroa + NÉIA SALGADOS),
 * item ativo em pílula dourada, ícones claros e usuário no rodapé.
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
  /** Mantém o destaque dourado restrito ao grupo da suíte aberta. */
  grupoAtivo?: string | undefined;
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
              <p className="truncate font-display text-sm font-bold uppercase leading-tight tracking-wide text-[#F2CE6B]">
                Néia Salgados
              </p>
              <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
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

        <MenuLateral aba={aba} onAba={onAba} grupoAtivo={grupoAtivo}
          demonstrativo={menuDemonstrativo} pedidosAtendente={menuPedidosAtendente} />

        <SidebarFooter className="border-t border-[#D4A94A]/35 bg-[#141310]">
          <div className="flex items-center gap-2.5 px-1.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#D4A94A] bg-[#1A1712]">
              <UserRound className="size-4 text-[#F2CE6B]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-semibold text-foreground">
                {usuario?.split("@")[0] ?? "Equipe"}
              </p>
              <p className="truncate text-xs text-muted-foreground">Administradora</p>
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
      <SidebarInset className="min-w-0">
        {!modoPreview ? (
          <div className="flex border-b border-border bg-sidebar px-3 py-2 md:hidden">
            <SidebarTrigger
              aria-label="Abrir menu administrativo"
              className="size-11 border border-[#D4A94A]/60 bg-[#141310] text-[#F2CE6B] hover:bg-[#D4A94A]/15 hover:text-[#F2CE6B]"
            />
            <span className="self-center pl-3 text-sm font-semibold text-foreground">Menu administrativo</span>
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
}: {
  aba: string;
  onAba: (v: string) => void;
  grupoAtivo?: string | undefined;
  demonstrativo: boolean;
  pedidosAtendente: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname, hash } = useLocation();
  const grupos = menuAdmin(demonstrativo, pedidosAtendente);
  const itens = grupos.flatMap((grupo) => grupo.items);
  const candidatos = itens.filter((item) =>
    item.href === pathname || (item.href && pathname.startsWith(`${item.href}/`)),
  );
  const linkAtivo =
    candidatos.find((item) => item.hash && item.hash === hash) ??
    candidatos.find((item) => !item.hash || (pathname === "/admin" && item.value === aba)) ??
    itens.find((item) => item.value === aba);
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});
  useEffect(() => { setGruposAbertos(gruposIniciais()); }, []);

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
    <SidebarContent
      className="bg-[#0F0E0C] [scrollbar-color:rgba(212,169,74,0.55)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#D4A94A]/60 [&::-webkit-scrollbar-track]:bg-transparent"
    >
      {grupos.map((grupo) => {
        const aberto = gruposAbertos[grupo.label] !== false;
        const ehComercial = grupo.label === "Comercial";
        return (
          <SidebarGroup key={grupo.label} data-grupo={grupo.label} className="py-1">
            <SidebarGroupLabel
              asChild
              className="px-3 font-display text-xs uppercase tracking-wide text-[#C7B78E] group-data-[collapsible=icon]:hidden"
            >
              <button
                type="button"
                aria-expanded={aberto}
                aria-label={`${aberto ? "Recolher" : "Expandir"} ${grupo.label}`}
                onClick={() => alternarGrupo(grupo.label)}
                className="flex w-full items-center justify-between gap-2 text-left hover:text-[#F2CE6B]"
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
                      : item.href ? linkAtivo === item : aba === item.value;

                    const alturaItem = ehComercial
                      ? item.linhas
                        ? "h-[58px] min-h-[58px] py-0"
                        : "h-11 min-h-11 py-0"
                      : "h-10 min-h-10";
                    const classeTexto = ehComercial
                      ? "min-w-0 flex-1 leading-[17px]"
                      : "truncate";
                    const estiloTexto = ehComercial
                      ? ({ overflow: "visible", whiteSpace: "normal" } as const)
                      : undefined;
                    const classeIcone = `${
                      ehComercial ? "shrink-0" : ""
                    } ${ativo ? "text-[#14120C]" : "text-[#C9A24B]"}`;
                    const textoItem = item.linhas ? (
                      item.linhas.map((linha, indice) => (
                        <span key={`${item.value}-linha-${indice}`} className="block">
                          {linha}
                        </span>
                      ))
                    ) : (
                      item.label
                    );
                    const classes = `${
                      ativo
                        ? "erp-btn-gold rounded-lg border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 font-semibold text-[#14120C] shadow-card hover:bg-gradient-to-b hover:from-[#F2CE6B] hover:to-[#D4A94A] hover:text-[#14120C]"
                        : "rounded-lg border border-transparent px-3 text-sidebar-foreground hover:border-[#D4A94A]/50 hover:bg-[#D4A94A]/12 hover:text-[#F2CE6B]"
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
                              activeOptions={{ exact: true, includeHash: true }}
                              aria-current={ativo ? "page" : undefined}
                              {...(item.hash ? { hash: item.hash } : {})}
                              onClick={() => {
                                if (isMobile) setOpenMobile(false);
                              }}
                            >
                              <item.icon className={classeIcone} />
                              <span className={`${classeTexto}${ativo ? " text-[#14120C]" : ""}`} style={estiloTexto}>
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
