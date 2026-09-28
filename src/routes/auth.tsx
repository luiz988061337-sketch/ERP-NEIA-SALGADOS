import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import logo from "@/assets/neia-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Néia Salgados" },
      { name: "description", content: "Acesse sua conta para pedir e acompanhar suas entregas." },
      { property: "og:title", content: "Entrar — Néia Salgados" },
      { property: "og:description", content: "Acesse sua conta para pedir e acompanhar suas entregas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const { user } = useSession();
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const destino = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  useEffect(() => {
    if (user) navigate({ to: destino, replace: true });
  }, [user, destino, navigate]);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("senha")),
    });
    setCarregando(false);
    if (error) {
      toast.error("Não foi possível entrar. Confira e-mail e senha.");
      return;
    }
    toast.success("Bem-vindo de volta!");
  }

  async function cadastrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const schema = z.object({
      nome: z.string().trim().min(2, "Informe seu nome").max(100),
      telefone: z.string().trim().min(10, "Telefone inválido").max(20),
      email: z.string().trim().email("E-mail inválido").max(255),
      senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres").max(72),
    });
    const parsed = schema.safeParse({
      nome: form.get("nome"),
      telefone: form.get("telefone"),
      email: form.get("email"),
      senha: form.get("senha"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.senha,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome: parsed.data.nome, telefone: parsed.data.telefone },
      },
    });
    setCarregando(false);
    if (error) {
      toast.error(error.message.includes("registered") ? "Este e-mail já tem conta." : "Não foi possível cadastrar.");
      return;
    }
    if (!data.session) {
      setAviso("Enviamos um e-mail de confirmação. Confirme para acessar sua conta.");
    }
  }

  async function recuperar() {
    const email = window.prompt("Informe o e-mail da sua conta:");
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error("Não foi possível enviar o e-mail.");
    else toast.success("Enviamos um link para redefinir sua senha.");
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

      <Tabs defaultValue="entrar" className="mt-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="entrar">Entrar</TabsTrigger>
          <TabsTrigger value="cadastrar">Criar conta</TabsTrigger>
        </TabsList>

        <TabsContent value="entrar">
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
            <button type="button" onClick={recuperar} className="w-full text-xs text-muted-foreground underline">
              Esqueci minha senha
            </button>
          </form>
        </TabsContent>

        <TabsContent value="cadastrar">
          <form onSubmit={cadastrar} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" name="nome" required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">WhatsApp</Label>
              <Input id="telefone" name="telefone" placeholder="(11) 90000-0000" required maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-c">E-mail</Label>
              <Input id="email-c" name="email" type="email" required maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha-c">Senha</Label>
              <Input id="senha-c" name="senha" type="password" required minLength={6} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              Criar conta
            </Button>
            {aviso ? <p className="text-center text-xs text-muted-foreground">{aviso}</p> : null}
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
