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
import { useSession, useStaffOnly } from "@/lib/session";

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
  const { staffOnly, painel, rolesPronto } = useStaffOnly();
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [whatsEnviadoPara, setWhatsEnviadoPara] = useState<string | null>(null);
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);

  const destino = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  useEffect(() => {
    if (!user || !rolesPronto) return;
    if (staffOnly && painel && destino === "/") navigate({ to: painel, replace: true });
    else if (destino.includes("?")) window.location.replace(destino);
    else navigate({ to: destino, replace: true });
  }, [user, destino, navigate, staffOnly, painel, rolesPronto]);

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
        emailRedirectTo: window.location.origin + destino,
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

  async function entrarWhats(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const tel = String(form.get("whats")).replace(/\D/g, "");
    if (tel.length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    setCarregando(true);
    const phone = tel.startsWith("55") ? `+${tel}` : `+55${tel}`;
    const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: "whatsapp" as never } });
    setCarregando(false);
    if (error) {
      toast.error("WhatsApp OTP indisponível. Ative o provider Phone/WhatsApp no Supabase ou entre por e-mail.");
      return;
    }
    setWhatsEnviadoPara(phone);
    toast.success("Código enviado no seu WhatsApp! Digite abaixo para entrar.");
  }

  async function verificarCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!whatsEnviadoPara) return;
    const form = new FormData(e.currentTarget);
    const token = String(form.get("codigo") ?? "").replace(/\D/g, "");
    if (token.length < 6) {
      toast.error("Digite o código de 6 dígitos recebido.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.verifyOtp({ phone: whatsEnviadoPara, token, type: "sms" });
    setCarregando(false);
    if (error) {
      toast.error("Código inválido ou expirado. Tente novamente.");
      return;
    }
    toast.success("Bem-vindo!");
  }

  async function recuperar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email-rec") ?? "").trim();
    if (!email || !email.includes("@")) {
      toast.error("Informe um e-mail válido para recuperar a senha.");
      return;
    }
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="entrar">Entrar</TabsTrigger>
          <TabsTrigger value="cadastrar">Criar conta</TabsTrigger>
          <TabsTrigger value="whats">WhatsApp</TabsTrigger>
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
            <button
              type="button"
              onClick={() => setMostrarRecuperar((v) => !v)}
              className="w-full text-xs text-muted-foreground underline"
            >
              Esqueci minha senha
            </button>
            {mostrarRecuperar ? (
              <form onSubmit={recuperar} className="space-y-2 rounded-lg bg-muted p-3">
                <Label htmlFor="email-rec">E-mail da conta</Label>
                <div className="flex gap-2">
                  <Input id="email-rec" name="email-rec" type="email" required placeholder="voce@email.com" className="bg-background" />
                  <Button type="submit" variant="outline" disabled={carregando}>
                    Enviar link
                  </Button>
                </div>
              </form>
            ) : null}
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

        <TabsContent value="whats" className="space-y-4">
          <form onSubmit={entrarWhats} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1.5">
              <Label htmlFor="whats">Seu WhatsApp</Label>
              <Input id="whats" name="whats" placeholder="(11) 90000-0000" required maxLength={20} autoComplete="tel" />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              {whatsEnviadoPara ? "Reenviar código" : "Receber código no WhatsApp"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Você receberá um código via WhatsApp (requer provider Phone/WhatsApp ativo no Supabase).
            </p>
          </form>
          {whatsEnviadoPara ? (
            <form onSubmit={verificarCodigo} className="space-y-4 rounded-xl border border-primary/40 bg-card p-5">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código de 6 dígitos</Label>
                <Input
                  id="codigo"
                  name="codigo"
                  inputMode="numeric"
                  placeholder="000000"
                  required
                  minLength={6}
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground">Enviado para {whatsEnviadoPara}</p>
              </div>
              <Button type="submit" className="w-full" disabled={carregando}>
                Confirmar e entrar
              </Button>
            </form>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
