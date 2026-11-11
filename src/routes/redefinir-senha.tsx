// @ts-nocheck - Tipos do @supabase/auth-js não instalados localmente
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/neia-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Néia Salgados" },
      { name: "description", content: "Defina uma nova senha para acessar a área de funcionários." },
    ],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const navigate = useNavigate();

  const [temSessao, setTemSessao] = useState<boolean | null>(null); // null = verificando
  const [carregando, setCarregando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O link de recuperação chega como /redefinir-senha#access_token=...&type=recovery.
  // O supabase-js (detectSessionInUrl) troca o token por uma sessão e dispara
  // onAuthStateChange; aguardamos esse evento (com fallback de timeout).
  useEffect(() => {
    let encerrado = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!encerrado && s) setTemSessao(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!encerrado && data.session) setTemSessao(true);
    });
    const t = setTimeout(() => {
      if (!encerrado) {
        encerrado = true;
        setTemSessao(false);
      }
    }, 8000);
    return () => {
      encerrado = true;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleAlterarSenha(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const novaSenha = String(form.get("nova-senha") ?? "");
    const confirmarSenha = String(form.get("confirmar-senha") ?? "");
    if (novaSenha.length < 6) {
      setErro("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não conferem.");
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      setSucesso(true);
      toast.success("Senha alterada com sucesso.");
      setTimeout(() => navigate({ to: "/auth", replace: true }), 2000);
    } catch (err: any) {
      setErro(err?.message ?? "Não foi possível alterar a senha.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10">
      <img
        src={logo.url}
        alt="Néia Salgados"
        loading="eager"
        decoding="async"
        className="mb-6 h-14 w-auto self-start object-contain"
      />
      <h1 className="font-display text-xl text-foreground mb-6">Redefinir senha</h1>

      {sucesso ? (
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-success-foreground">✓</p>
          <h2 className="text-lg font-medium">Senha alterada com sucesso</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Você já pode fazer login com sua nova senha.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="mt-4"
          >
            Fazer login
          </Button>
        </div>
      ) : temSessao === null ? (
        <p className="text-sm text-muted-foreground">Verificando link de recuperação…</p>
      ) : temSessao === false ? (
        <div className="mb-6 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive/80">
          <p className="font-medium">
            Link de recuperação inválido ou expirado.
          </p>
          <p className="mt-1 text-sm">
            Solicite um novo link em “Esqueci minha senha” na página de login.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/auth", replace: true })}
            className="mt-4"
          >
            Voltar ao login
          </Button>
        </div>
      ) : (
        <form onSubmit={handleAlterarSenha} className="space-y-4">
          <div>
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              name="nova-senha"
              type="password"
              required
              aria-describedby="senha-help"
              placeholder="Digite sua nova senha"
            />
            <p className="mt-1 text-sm text-muted-foreground" id="senha-help">
              Use no mínimo 6 caracteres.
            </p>
          </div>
          <div>
            <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
            <Input
              id="confirmar-senha"
              name="confirmar-senha"
              type="password"
              required
              placeholder="Confirme sua nova senha"
            />
          </div>
          {erro ? (
            <p className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive/80 text-sm">
              {erro}
            </p>
          ) : null}
          <Button type="submit" disabled={carregando}>
            {carregando ? "Atualizando..." : "Alterar senha"}
          </Button>
        </form>
      )}
    </div>
  );
}
