import { createFileRoute, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import logo from "@/assets/neia-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { ehModoDemo } from "@/lib/demo-preview";
import { destinoInternoSeguro } from "@/lib/redirect-seguro";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Acesso da equipe — Néia Salgados" },
      { name: "description", content: "Área exclusiva da equipe Néia Salgados." },
      { property: "og:title", content: "Acesso da equipe — Néia Salgados" },
      { property: "og:description", content: "Área exclusiva da equipe Néia Salgados." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const search = useSearch({ from: "/auth" });
  const { user } = useSession();
  const { data: roles, isError: erroRoles } = useRoles(user?.id);
  const rolesPronto = roles !== undefined;
  const [carregando, setCarregando] = useState(false);
  const [erroLogin, setErroLogin] = useState<string | null>(null);
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [modo, setModo] = useState<'admin' | 'funcionario'>('admin');

  const destino = destinoInternoSeguro(search.redirect);
  const painelAdmin = /^\/(?:auth\/?)?(?:[?#]|$)/.test(destino) ? "/admin" : destino;

  // Painel por role (não inventar roles novas):
  // admin → /admin; produção → /producao; atendente → /atendente;
  // financeiro → /financeiro; motoboy → /motoboy.
  const isAdmin = roles?.includes("admin");
  const painelFuncionario = roles
    ? roles.includes("producao") ? "/producao"
      : roles.includes("atendente") ? "/atendente"
      : roles.includes("financeiro") ? "/financeiro"
      : roles.includes("motoboy") ? "/motoboy"
      : null
    : null;

  useEffect(() => {
    if (pathname !== "/auth" || !user) return;
    if (erroRoles) {
      setErroLogin("Sessão encontrada, mas não foi possível consultar as permissões. Verifique a conexão e tente novamente.");
      return;
    }
    if (!rolesPronto) return;
    if (modo === "admin") {
      if (!isAdmin) {
        setErroLogin("Esta conta está autenticada, mas não possui permissão de administrador neste ambiente de testes.");
        return;
      }
      void navigate({ href: painelAdmin, replace: true });
      return;
    }
    if (!painelFuncionario) {
      setErroLogin("Esta conta não possui um painel de funcionário habilitado no ambiente de testes.");
      return;
    }
    void navigate({ to: painelFuncionario, replace: true });
  }, [pathname, user, rolesPronto, erroRoles, modo, isAdmin, painelFuncionario, painelAdmin, navigate]);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setCarregando(true);
    setErroLogin(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("senha")),
      });
      if (error) {
        const codigo = "code" in error ? String(error.code) : "";
        const mensagem = codigo === "invalid_credentials"
          ? "E-mail ou senha inválidos neste Supabase de testes. A senha do ERP antigo não é necessariamente a mesma."
          : codigo === "email_not_confirmed"
            ? "O e-mail ainda não foi confirmado no Supabase de testes."
            : "Falha de autenticação. Verifique a conexão e os dados da conta de testes.";
        setErroLogin(mensagem);
        return;
      }
      if (!data.session && !ehModoDemo()) {
        setErroLogin("O servidor não devolveu uma sessão válida. O acesso não será liberado.");
        return;
      }
      // No Preview de homologação a sessão é fictícia: navegar explicitamente
      // evita depender de um papel real do Supabase para abrir o painel.
      if (ehModoDemo()) {
        const alvo = destino === "/" ? "/admin" : destino;
        if (alvo.includes("?")) window.location.assign(alvo);
        else await navigate({ to: alvo, replace: true });
        return;
      }
      toast.success("Bem-vindo de volta!");
      // Após login, o useEffect mudará o redirect automaticamente
    } catch {
      setErroLogin("Não foi possível conectar ao serviço de autenticação. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function recuperar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email-rec") ?? "").trim();
    if (!email || !email.includes("@")) {
      toast.error("Informe um e-mail válido para recuperar a senha.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) toast.error("Não foi possível enviar o e-mail.");
      else toast.success("Enviamos um link para redefinir sua senha.");
    } catch {
      toast.error("Não foi possível enviar o e-mail. Tente novamente em alguns instantes.");
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10">
      <img
        src={logo.url}
        alt="Néia Salgados"
        loading="lazy"
        width={320}
        height={210}
        className="mx-auto h-24 w-auto rounded-xl object-cover"
      />

      <div className="mt-8 mb-4 text-center">
        <h1 className="font-display text-xl text-foreground">Acesso da equipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">Área de funcionários. Clientes pedem direto pelo cardápio, sem login.</p>
      </div>

      {/* Seletor de modo de acesso */}
      <div className="mb-4 rounded-xl border border-background bg-card p-4">
        <h3 className="font-display text-sm text-foreground mb-3">Quem está entrando?</h3>
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer select-none ${
            modo === 'admin' ? 'bg-primary-600 text-primary-50' : 'bg-background text-foreground'}
            ${modo === 'admin' ? 'border border-primary-400' : 'border border-border'}`}
          onClick={() => setModo('admin')}
        >
          <span>Administrador</span>
        </label>
        <label
          className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer select-none ${
            modo === 'funcionario' ? 'bg-primary-600 text-primary-50' : 'bg-background text-foreground'}
            ${modo === 'funcionario' ? 'border border-primary-400' : 'border border-border'}`}
          onClick={() => setModo('funcionario')}
        >
          <span>Funcionário</span>
        </label>
      </div>

      <form onSubmit={entrar} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" name="senha" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full" disabled={carregando}>
          Entrar
        </Button>
        <button
          type="button"
          onClick={() => setMostrarRecuperar((v) => !v)}
          className="w-full text-xs text-muted-foreground underline"
        >
          Esqueci minha senha
        </button>
        {erroLogin ? (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {erroLogin}
          </p>
        ) : null}
      </form>
      {mostrarRecuperar ? (
          <form onSubmit={recuperar} className="mt-3 space-y-2 rounded-lg bg-muted p-3">
            <Label htmlFor="email-rec">E-mail da conta</Label>
            <div className="flex gap-2">
              <Input id="email-rec" name="email-rec" type="email" required placeholder="voce@email.com" className="bg-background" />
              <Button type="submit" variant="outline" disabled={carregando}>
                Enviar link
              </Button>
            </div>
          </form>
        ) : null}
    </div>
  );
}