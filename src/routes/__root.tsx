import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useLocation,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "@/lib/cart";
import { CartDock } from "@/components/cart-dock";
import { SiteHeader } from "@/components/site-header";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { GuardaVersao } from "@/components/guarda-versao";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao cardápio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado por aqui. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Néia Salgados — Delivery de salgados" },
      {
        name: "description",
        content: "Peça salgados fritos, assados, congelados e kits para festa com entrega rápida.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito+Sans:wght@400;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "icon", type: "image/svg+xml", href: "/icons/icon-192x192.svg", sizes: "192x192" },
      { rel: "icon", type: "image/svg+xml", href: "/icons/icon-512x512.svg", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Néia Salgados" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const { pathname } = useLocation();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  // Registrar Service Worker do PWA (apenas em rotas públicas, não em admin/staff)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-neia.js", { scope: "/" })
        .then((registration) => {
          console.log("[PWA] Service Worker registrado:", registration.scope);
        })
        .catch((error) => {
          console.warn("[PWA] Falha ao registrar Service Worker:", error);
        });
    }
  }, []);

  // Rotas internas (staff): sem chrome da loja pública — cada uma tem layout próprio.
  // Rotas públicas caem no fluxo normal, sem nenhuma mudança visual.
  // Exceções pontuais: previews com layout próprio isolado (K7.2, K8.1, K9, L1).
  const ehStaff =
    /^\/(admin|pdv|producao|central-entregas|motoboy|financeiro|fiscal|clientes|atendente|impressao|orcamentos|recorrentes|campanhas|crm-config|operacao|mcp)/.test(
      pathname,
    ) ||
    pathname.startsWith("/preview/producao-painel") ||
    pathname.startsWith("/preview/central-entregas-v2") ||
    pathname.startsWith("/preview/pedidos-atendente-v2") ||
    pathname.startsWith("/preview/l1");

  return (
    <QueryClientProvider client={queryClient}>
      <GuardaVersao>
        <CartProvider>
          <div className="flex min-h-screen flex-col">
            {ehStaff ? null : <SiteHeader />}
            <main className="flex-1">
              <Outlet />
            </main>
            {ehStaff ? null : (
              <footer className="border-t border-border/60 bg-card py-8 pb-24 md:pb-8">
                <div className="mx-auto max-w-6xl px-4 text-sm text-muted-foreground">
                  <p className="font-display text-base text-foreground">Néia Salgados</p>
                  <p className="mt-1">Salgados fritos, assados, congelados e kits para festa.</p>
                  <p className="mt-3 text-xs">
                    © {new Date().getFullYear()} Néia Salgados. Todos os direitos reservados.
                  </p>
                </div>
              </footer>
            )}
          </div>
          {ehStaff ? null : <CartDock />}
          <Toaster position="top-center" richColors />
        </CartProvider>
      </GuardaVersao>
    </QueryClientProvider>
  );
}
