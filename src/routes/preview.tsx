import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Menu, X, ShoppingBag, LayoutDashboard, User, LogOut, Home, Package, Bike, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart";
import { useSession, useStaffOnly } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/neia-logo.png.asset.json";

export const Route = createFileRoute("/preview")({
  head: ({ matches }) => ({
    meta: [
      { title: "Preview — Néia Salgados" },
      { name: "description", content: "Preview do novo layout Néia Salgados" },
    ],
    links: [
      // R2-B carrega seu CSS compilado no layout pai, nunca um caminho /src em produção.
      ...(matches.some((m) => m.pathname.startsWith("/preview/reembolsos-estornos-cliente"))
        ? [] : [{ rel: "stylesheet", href: "/src/styles-preview.css" }]),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: PreviewLayout,
});

function PreviewLayout() {
  const { pathname } = useLocation();
  // R2-B público: sem hooks de sessão, consultas ou chrome administrativo.
  if (pathname.startsWith("/preview/reembolsos-estornos-cliente")) return <R2BPublicLayout />;
  // Demonstração com shell administrativo próprio (Financeiro Premium,
  // Reembolsos/Estornos R1, Origens R2-A e Cliente R2-B). Não montar o chrome
  // público nem seus hooks de sessão nessas demonstrações sem banco.
  const ROTAS_SHELL_PROPRIO = [
    "/preview/financeiro-premium",
    "/preview/reembolsos-estornos",
    "/preview/reembolsos-estornos-origens",
  ];
  if (ROTAS_SHELL_PROPRIO.includes(pathname)) return <Outlet />;
  return <PreviewPublicLayout />;
}

function R2BPublicLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  return (
    <div className="r2b-public flex min-h-screen flex-col">
      <PreviewHeader
        totalItens={0} user={{}} loading={false} staffOnly={false} demoPublic
        mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen}
        userMenuOpen={userMenuOpen} setUserMenuOpen={setUserMenuOpen}
        isScrolled={false}
      />
      <main className="flex-1"><Outlet /></main>
      <PreviewFooter />
    </div>
  );
}

function PreviewPublicLayout() {
  const { totalItens } = useCart();
  const { user, loading } = useSession();
  const { staffOnly } = useStaffOnly();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // K7.2/K8.1/K9/L1: painéis e previews com layout próprio isolado.
  // Sem cabeçalho/rodapé públicos duplicados nessas rotas.
  const ehPainelProducao = location.pathname.startsWith("/preview/producao-painel");
  const ehCentralV2 = location.pathname.startsWith("/preview/central-entregas-v2");
  const ehPedidosV2 = location.pathname.startsWith("/preview/pedidos-atendente-v2");
  const ehL1 = location.pathname.startsWith("/preview/l1");
  if (ehPainelProducao || ehCentralV2 || ehPedidosV2 || ehL1) {
    return (
      <main className="min-h-screen bg-neutral-950">
        <Outlet />
      </main>
    );
  }

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PreviewHeader
        totalItens={totalItens}
        user={user}
        loading={loading}
        staffOnly={staffOnly}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        isScrolled={isScrolled}
        onSair={sair}
      />
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      <PreviewFooter />
    </div>
  );
}

function PreviewHeader({
  totalItens,
  user,
  loading,
  staffOnly,
  mobileMenuOpen,
  setMobileMenuOpen,
  userMenuOpen,
  setUserMenuOpen,
  isScrolled,
  onSair,
  demoPublic = false,
}: any) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-200",
        isScrolled ? "border-border/40 bg-card/95 backdrop-blur" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6 lg:px-8">
        <Link to="/preview" className="flex items-center gap-2 shrink-0" aria-label="Néia Salgados - Início">
          <img
            src={logo.url}
            alt="Néia Salgados"
            width={160}
            height={40}
            className="h-10 w-auto object-contain"
          />
        </Link>

        <nav className={cn("flex-1", "hidden md:flex items-center justify-center gap-1")}>
          {!staffOnly && (
            <>
              <PreviewNavLink to="/preview" label="Início" icon={Home} exact={demoPublic} />
              <PreviewNavLink to="/preview/cardapio" label="Cardápio" icon={Package} />
              <PreviewNavLink to="/preview/combo" label="Montar Combo" icon={Package} />
              <PreviewNavLink to="/preview/calculadora" label="Orçamento" icon={Package} />
            </>
          )}
          {user && !staffOnly && (
            <PreviewNavLink to={demoPublic ? "/preview/reembolsos-estornos-cliente" : "/preview/pedidos"} label="Meus Pedidos" icon={Package} />
          )}
          {user && staffOnly && (
            <>
              <PreviewNavLink to="/preview/admin" label="Dashboard" icon={LayoutDashboard} />
              <PreviewNavLink to="/preview/admin/entregas" label="Entregas" icon={Bike} />
              <PreviewNavLink to="/preview/admin/pedidos" label="Pedidos" icon={Package} />
              <PreviewNavLink to="/preview/admin/produtos" label="Produtos" icon={Package} />
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 ml-auto md:ml-4">
          {!staffOnly && (
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link to="/preview/carrinho" aria-label="Carrinho">
                <ShoppingBag className="size-5" />
                {totalItens > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {totalItens > 99 ? "99+" : totalItens}
                  </span>
                )}
              </Link>
            </Button>
          )}

          <div className="hidden md:flex items-center gap-1">
            {loading ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            ) : user ? (
              <div className="relative">
                <Button variant="ghost" size="icon" className="relative" onClick={() => setUserMenuOpen(!userMenuOpen)} aria-label="Minha conta">
                  <User className="size-5" />
                </Button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 animate-fade-in rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-float)]">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="font-display text-sm">Néia Salgados</p>
                      <p className="text-xs text-muted-foreground">Preview do novo layout</p>
                    </div>
                    {!staffOnly && (
                      <Link to={demoPublic ? "/preview/reembolsos-estornos-cliente" : "/preview/pedidos"} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg">
                        <Package className="size-4" /> Meus pedidos
                      </Link>
                    )}
                    {staffOnly && (
                      <>
                        <Link to="/preview/admin" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg">
                          <LayoutDashboard className="size-4" /> Dashboard Admin
                        </Link>
                        <Link to="/preview/admin/entregas" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg">
                          <Bike className="size-4" /> Central de Entregas
                        </Link>
                        <Link to="/preview/admin/pedidos" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg">
                          <Package className="size-4" /> Gestão de Pedidos
                        </Link>
                        <Link to="/preview/admin/produtos" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-lg">
                          <Package className="size-4" /> Produtos
                        </Link>
                      </>
                    )}
                    <hr className="my-2 border-border" />
                    {demoPublic ? <p className="px-3 py-2 text-xs text-muted-foreground">Conta demonstrativa — sem dados reais.</p> : <button onClick={onSair} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent rounded-lg">
                      <LogOut className="size-4" /> Sair
                    </button>}
                  </div>
                )}
              </div>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth" search={{ redirect: "/preview" }}>Entrar</Link>
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card animate-slide-up">
          <nav className="px-4 py-4 space-y-2">
            {!staffOnly && (
              <>
                <PreviewMobileNavLink to="/preview" label="Início" icon={Home} onClick={() => setMobileMenuOpen(false)} />
                <PreviewMobileNavLink to="/preview/cardapio" label="Cardápio" icon={Package} onClick={() => setMobileMenuOpen(false)} />
                <PreviewMobileNavLink to="/preview/combo" label="Montar Combo" icon={Package} onClick={() => setMobileMenuOpen(false)} />
                <PreviewMobileNavLink to="/preview/calculadora" label="Orçamento" icon={Package} onClick={() => setMobileMenuOpen(false)} />
              </>
            )}
            {user && !staffOnly && (
              <PreviewMobileNavLink to={demoPublic ? "/preview/reembolsos-estornos-cliente" : "/preview/pedidos"} label="Meus Pedidos" icon={Package} onClick={() => setMobileMenuOpen(false)} />
            )}
            {user && staffOnly && (
              <>
                <PreviewMobileNavLink to="/preview/admin" label="Dashboard" icon={LayoutDashboard} onClick={() => setMobileMenuOpen(false)} />
                <PreviewMobileNavLink to="/preview/admin/entregas" label="Entregas" icon={Bike} onClick={() => setMobileMenuOpen(false)} />
                <PreviewMobileNavLink to="/preview/admin/pedidos" label="Pedidos" icon={Package} onClick={() => setMobileMenuOpen(false)} />
                <PreviewMobileNavLink to="/preview/admin/produtos" label="Produtos" icon={Package} onClick={() => setMobileMenuOpen(false)} />
              </>
            )}
            {user && !demoPublic && (
              <Button variant="outline" className="w-full justify-start" onClick={onSair}>
                <LogOut className="mr-2 size-4" /> Sair
              </Button>
            )}
            {!user && !staffOnly && (
              <Button asChild className="w-full">
                <Link to="/auth" search={{ redirect: "/preview" }}>Entrar</Link>
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function PreviewNavLink({ to, label, icon: Icon, exact = false }: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50"
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function PreviewMobileNavLink({ to, label, icon: Icon, onClick }: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-foreground hover:bg-accent/50"
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

function PreviewFooter() {
  return (
    <footer className="border-t border-border/40 bg-card/50 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <img src={logo.url} alt="Néia Salgados" width={160} height={40} className="h-10 w-auto object-contain" />
            <p className="text-sm text-muted-foreground">Salgados artesanais feitos com carinho. Qualidade e sabor em cada mordida.</p>
          </div>
          <div>
            <h3 className="font-display text-sm text-foreground">Links rápidos</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/preview" className="hover:text-primary transition-colors">Início</Link></li>
              <li><Link to="/preview/cardapio" className="hover:text-primary transition-colors">Cardápio</Link></li>
              <li><Link to="/preview/combo" className="hover:text-primary transition-colors">Montar Combo</Link></li>
              <li><Link to="/preview/calculadora" className="hover:text-primary transition-colors">Orçamento</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-display text-sm text-foreground">Atendimento</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>WhatsApp: (11) 99999-9999</li>
              <li>Seg–Sáb: 08h–22h</li>
              <li>Dom: Fechado</li>
            </ul>
          </div>
          <div>
            <h3 className="font-display text-sm text-foreground">Entrega</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Taxa a partir de R$ 6,00</li>
              <li>40–60 minutos</li>
              <li>PIX e pagamento na entrega</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Néia Salgados. Todos os direitos reservados.</p>
          <p className="text-primary">Preview do novo layout — Não é a versão em produção</p>
        </div>
      </div>
    </footer>
  );
}
