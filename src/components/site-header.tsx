import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, User, LogOut, LayoutDashboard, Menu, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/neia-logo.png.asset.json";
import { useCart } from "@/lib/cart";
import { useRoles, useSession, useStaffOnly } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SiteHeader() {
  const { totalItens } = useCart();
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const { staffOnly } = useStaffOnly();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  // HOMO-CLIENTE-14: o destaque é derivado SOMENTE da rota atual — nunca de
  // clique, hover, focus ou estado persistido. Um único item pode ser ativo.
  const ativo = (rota: string) => pathname === rota;
  const rotaAtiva = (rota: string) => {
    if (rota === "/carrinho") return ativo("/carrinho") || ativo("/checkout");
    // Acompanhamento pertence à seção "Meus pedidos".
    if (rota === "/conta") {
      return ativo("/conta") || pathname.startsWith("/pedido/");
    }
    return ativo(rota);
  };
  const linkClasse = (rota: string, destaqueCarrinho = false) =>
    cn(
      "h-9 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6B300] focus-visible:ring-offset-2",
      rotaAtiva(rota)
        ? "bg-[#C9000B] text-white shadow-[var(--shadow-card)] hover:bg-[#C9000B] hover:text-white"
        : destaqueCarrinho
          ? "bg-[#FFF4D8] text-[#B9000B] hover:bg-[#FFE9BC]"
          : "text-[#500B08] hover:bg-[#FFF4D8]",
    );
  // HOMO-CLIENTE-14 (ajuste visual): "Meus pedidos" mantém o ícone de pacote,
  // mas NÃO tem fundo caramelo no estado normal — segue neutro como os demais
  // itens do menu. O vermelho só aparece quando a rota atual é da seção.
  const pedidosClasse = cn(
    "h-10 gap-1.5 rounded-full border border-transparent px-3.5 text-sm font-bold text-[#500B08] shadow-none transition-colors hover:bg-[#FFF4D8] hover:text-[#500B08] focus-visible:ring-2 focus-visible:ring-[#F6B300] focus-visible:ring-offset-2",
    rotaAtiva("/conta") &&
      "border-[#C9000B] bg-[#C9000B] text-white shadow-[var(--shadow-card)] hover:bg-[#C9000B] hover:text-white focus-visible:ring-[#C9000B]",
  );

  const isAdmin = roles?.includes("admin");
  const podeVerEquipe = isAdmin || roles?.includes("financeiro") || roles?.includes("producao");

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    // Volta para a loja pública (o acesso interno é bloqueado pelos guards de cada rota).
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-3 px-4 sm:h-20">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img
            src={logo.url}
            alt="Néia Salgados"
            width={190}
            height={52}
            className="h-11 w-auto rounded-md object-contain sm:h-14"
          />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-0.5 lg:flex">
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm" className={linkClasse("/")}>
              <Link to="/" aria-current={rotaAtiva("/") ? "page" : undefined}>Cardápio</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm" className={linkClasse("/combo")}>
              <Link to="/combo" aria-current={rotaAtiva("/combo") ? "page" : undefined}>Montar combo</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm" className={linkClasse("/calculadora")}>
              <Link to="/calculadora" aria-current={rotaAtiva("/calculadora") ? "page" : undefined}>Orçamento</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm" className={linkClasse("/parceiros")}>
              <Link to="/parceiros" aria-current={rotaAtiva("/parceiros") ? "page" : undefined}>Parceiros</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm" className={linkClasse("/ajuda")}>
              <Link to="/ajuda" aria-current={rotaAtiva("/ajuda") ? "page" : undefined}>Ajuda</Link>
            </Button>
          )}
          {user && !staffOnly ? (
            <Button asChild variant="ghost" size="sm" className={pedidosClasse}>
              <Link to="/conta" aria-current={rotaAtiva("/conta") ? "page" : undefined}>
                <Package className="size-4 shrink-0" aria-hidden /> Meus pedidos
              </Link>
            </Button>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          {staffOnly ? null : (
            <Button
              asChild
              size="sm"
              className={cn(
                "relative h-10 gap-1.5 rounded-xl bg-[#E8AD16] px-2.5 font-bold text-[#3B2600] shadow-[var(--shadow-card)] hover:bg-[#f0bc2b] focus-visible:ring-2 focus-visible:ring-[#E8AD16] focus-visible:ring-offset-2 sm:px-3",
                rotaAtiva("/carrinho") && "ring-2 ring-[#C9000B] ring-offset-2",
              )}
            >
              <Link
                to="/carrinho"
                aria-label={`Carrinho com ${totalItens} ${totalItens === 1 ? "item" : "itens"}`}
                aria-current={rotaAtiva("/carrinho") ? "page" : undefined}
              >
                <ShoppingBag className="size-5" aria-hidden />
                <span className="text-xs sm:text-sm">Carrinho</span>
                {totalItens > 0 ? (
                  <span className="grid min-w-6 place-items-center rounded-full bg-[#650900] px-1 text-xs font-bold text-white">
                    {totalItens}
                  </span>
                ) : null}
              </Link>
            </Button>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Minha conta">
                  <User className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {staffOnly ? null : (
                  <DropdownMenuItem asChild>
                    <Link to="/conta">
                      <User className="mr-2 size-4" /> Minha conta
                    </Link>
                  </DropdownMenuItem>
                )}
                {podeVerEquipe ? (
                  <DropdownMenuItem asChild>
                    <Link to="/equipe">
                      <User className="mr-2 size-4" /> Equipe
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <LayoutDashboard className="mr-2 size-4" /> Administração
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={sair}>
                  <LogOut className="mr-2 size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48 text-sm">
              {staffOnly ? null : (
                <DropdownMenuItem asChild className={cn(rotaAtiva("/") && "bg-[#C9000B] font-semibold text-white")}>
                  <Link to="/" aria-current={rotaAtiva("/") ? "page" : undefined}>Cardápio</Link>
                </DropdownMenuItem>
              )}
              {staffOnly ? null : (
                <DropdownMenuItem asChild className={cn(rotaAtiva("/combo") && "bg-[#C9000B] font-semibold text-white")}>
                  <Link to="/combo" aria-current={rotaAtiva("/combo") ? "page" : undefined}>Montar combo</Link>
                </DropdownMenuItem>
              )}
              {staffOnly ? null : (
                <DropdownMenuItem asChild className={cn(rotaAtiva("/calculadora") && "bg-[#C9000B] font-semibold text-white")}>
                  <Link to="/calculadora" aria-current={rotaAtiva("/calculadora") ? "page" : undefined}>Orçamento</Link>
                </DropdownMenuItem>
              )}
              {staffOnly ? null : (
                <DropdownMenuItem asChild className={cn(rotaAtiva("/parceiros") && "bg-[#C9000B] font-semibold text-white")}>
                  <Link to="/parceiros" aria-current={rotaAtiva("/parceiros") ? "page" : undefined}>Parceiros</Link>
                </DropdownMenuItem>
              )}
              {staffOnly ? null : (
                <DropdownMenuItem asChild className={cn(rotaAtiva("/ajuda") && "bg-[#C9000B] font-semibold text-white")}>
                  <Link to="/ajuda" aria-current={rotaAtiva("/ajuda") ? "page" : undefined}>Ajuda</Link>
                </DropdownMenuItem>
              )}
              {user && !staffOnly ? (
                <DropdownMenuItem
                  asChild
                  className={cn(
                    "border border-transparent font-bold text-[#500B08] [&>a]:flex [&>a]:items-center [&>a]:gap-2",
                    rotaAtiva("/conta") && "border-[#C9000B] bg-[#C9000B] text-white",
                  )}
                >
                  <Link to="/conta" aria-current={rotaAtiva("/conta") ? "page" : undefined}>
                    <Package className="size-4 shrink-0" aria-hidden /> Meus pedidos
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {podeVerEquipe ? (
                <DropdownMenuItem asChild>
                  <Link to="/equipe">Equipe</Link>
                </DropdownMenuItem>
              ) : null}
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link to="/admin">Administração</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
