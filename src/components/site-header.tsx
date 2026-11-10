// @ts-nocheck - Tipos do @supabase/auth-js não instalados localmente
import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, User, LogOut, LayoutDashboard, ChefHat, Bike, Menu, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import logo from "@/assets/neia-logo.png.asset.json";
import { useCart } from "@/lib/cart";
import { useRoles, useSession, useStaffOnly } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PWAInstallButton } from "@/components/PWAInstallButton";

export function SiteHeader() {
  const { totalItens } = useCart();
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const { staffOnly } = useStaffOnly();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdmin = roles?.includes("admin");
  const isContador = roles?.includes("contador") || isAdmin;
  const isFinanceiro = roles?.includes("financeiro") || isAdmin;
  const isProducao = roles?.includes("producao") || isAdmin;
  const isMotoboy = roles?.includes("motoboy") || isAdmin;
  const isAtendente = roles?.includes("atendente") || isAdmin;
  const isEntregas = isProducao || isMotoboy || isAtendente;

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logo.url}
            alt="Néia Salgados"
            width={160}
            height={40}
            className="h-10 w-auto rounded-md object-cover"
          />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Cardápio</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/combo">Montar combo</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/calculadora">Orçamento</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/parceiros">Parceiros</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/ajuda">Ajuda</Link>
            </Button>
          )}
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/historia">História</Link>
            </Button>
          )}
          {user && !staffOnly ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/conta">Meus pedidos</Link>
            </Button>
          ) : null}
          {user && (!staffOnly || isAtendente) ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/orcamentos">Orçamentos</Link>
            </Button>
          ) : null}
          {user && !staffOnly ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/recorrentes">Recorrentes</Link>
            </Button>
          ) : null}
          {isAtendente ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/atendente">Novo pedido</Link>
            </Button>
          ) : null}
          {isAtendente ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/pdv">PDV Balcão</Link>
            </Button>
          ) : null}
          {user ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/equipe">Equipe</Link>
            </Button>
          ) : null}
          {isContador ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/contador">Contador</Link>
            </Button>
          ) : null}
          {isProducao ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/producao">Produção</Link>
            </Button>
          ) : null}
          {isMotoboy ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/motoboy">Entregas</Link>
            </Button>
          ) : null}
          {isEntregas ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/central-entregas">Central</Link>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin">Admin</Link>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/gestao">Gestão</Link>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/clientes">Clientes</Link>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/campanhas">Campanhas</Link>
            </Button>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          {staffOnly ? null : (
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link to="/carrinho" aria-label="Carrinho">
                <ShoppingBag className="size-5" />
                {totalItens > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
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
                {isProducao ? (
                  <DropdownMenuItem asChild>
                    <Link to="/producao">
                      <ChefHat className="mr-2 size-4" /> Painel de produção
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isMotoboy ? (
                  <DropdownMenuItem asChild>
                    <Link to="/motoboy">
                      <Bike className="mr-2 size-4" /> Painel do motoboy
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isEntregas ? (
                  <DropdownMenuItem asChild>
                    <Link to="/central-entregas">
                      <Truck className="mr-2 size-4" /> Central de entregas
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
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link to="/clientes">
                      <LayoutDashboard className="mr-2 size-4" /> Clientes (CRM)
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link to="/campanhas">
                      <LayoutDashboard className="mr-2 size-4" /> Campanhas
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isFinanceiro ? (
                  <DropdownMenuItem asChild>
                    <Link to="/financeiro">
                      <LayoutDashboard className="mr-2 size-4" /> Financeiro
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isContador ? (
                  <DropdownMenuItem asChild>
                    <Link to="/contador">
                      <LayoutDashboard className="mr-2 size-4" /> Contador
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link to="/crm-config">
                      <LayoutDashboard className="mr-2 size-4" /> Config CRM
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {user && (!staffOnly || isAtendente) ? (
                  <DropdownMenuItem asChild>
                    <Link to="/orcamentos">
                      <LayoutDashboard className="mr-2 size-4" /> Orçamentos
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {user && !staffOnly ? (
                  <DropdownMenuItem asChild>
                    <Link to="/recorrentes">
                      <LayoutDashboard className="mr-2 size-4" /> Recorrentes
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isAtendente ? (
                  <DropdownMenuItem asChild>
                    <Link to="/atendente">
                      <LayoutDashboard className="mr-2 size-4" /> Novo pedido
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {isAtendente ? (
                  <DropdownMenuItem asChild>
                    <Link to="/pdv">
                      <LayoutDashboard className="mr-2 size-4" /> PDV Balcão
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={sair}>
                  <LogOut className="mr-2 size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {staffOnly ? null : (
                <DropdownMenuItem asChild>
                  <Link to="/">Cardápio</Link>
                </DropdownMenuItem>
              )}
              {staffOnly ? null : (
                <DropdownMenuItem asChild>
                  <Link to="/combo">Montar combo</Link>
                </DropdownMenuItem>
              )}
              {staffOnly ? null : (
                <DropdownMenuItem asChild>
                  <Link to="/calculadora">Orçamento</Link>
                </DropdownMenuItem>
              )}
              {user && !staffOnly ? (
                <DropdownMenuItem asChild>
                  <Link to="/conta">Meus pedidos</Link>
                </DropdownMenuItem>
              ) : null}
              {user && (!staffOnly || isAtendente) ? (
                <DropdownMenuItem asChild>
                  <Link to="/orcamentos">Orçamentos</Link>
                </DropdownMenuItem>
              ) : null}
              {user && !staffOnly ? (
                <DropdownMenuItem asChild>
                  <Link to="/recorrentes">Recorrentes</Link>
                </DropdownMenuItem>
              ) : null}
              {isAtendente ? (
                <DropdownMenuItem asChild>
                  <Link to="/atendente">Novo pedido</Link>
                </DropdownMenuItem>
              ) : null}
              {isAtendente ? (
                <DropdownMenuItem asChild>
                  <Link to="/pdv">PDV Balcão</Link>
                </DropdownMenuItem>
              ) : null}
              {user ? (
                <DropdownMenuItem asChild>
                  <Link to="/equipe">Equipe</Link>
                </DropdownMenuItem>
              ) : null}
              {isContador ? (
                <DropdownMenuItem asChild>
                  <Link to="/contador">Contador</Link>
                </DropdownMenuItem>
              ) : null}
              {isProducao ? (
                <DropdownMenuItem asChild>
                  <Link to="/producao">Produção</Link>
                </DropdownMenuItem>
              ) : null}
              {isMotoboy ? (
                <DropdownMenuItem asChild>
                  <Link to="/motoboy">Entregas</Link>
                </DropdownMenuItem>
              ) : null}
              {isEntregas ? (
                <DropdownMenuItem asChild>
                  <Link to="/central-entregas">Central</Link>
                </DropdownMenuItem>
              ) : null}
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link to="/admin">Admin</Link>
                </DropdownMenuItem>
              ) : null}
              {isAdmin ? (
                <DropdownMenuItem asChild>
                  <Link to="/gestao">Gestão</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!staffOnly && <PWAInstallButton />}
    </header>
  );
}
