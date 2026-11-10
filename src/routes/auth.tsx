// @ts-nocheck - Tipos do @supabase/auth-js não instalados localmente
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { MessageCircle, Mail, Lock } from "lucide-react";
import logo from "@/assets/neia-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useStaffOnly } from "@/lib/session";

const searchSchema = z.object({ redirect: z.string().optional() });

const PROVEDOR_PENDENTE =
  "WHATSAPP OTP: AGUARDANDO CONFIGURAÇÃO DO PROVEDOR (Twilio). Enquanto isso, use \"Entrar com e-mail\".";

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Néia Salgados" },
      { name: "description", content: "Entre com seu WhatsApp para pedir e acompanhar suas entregas." },
      { property: "og:title", content: "Entrar — Néia Salgados" },
      { property: "og:description", content: "Entre com seu WhatsApp para pedir e acompanhar suas entregas." },
    ],
  }),
  component: AuthPage,
});

/** (15) 99999-9999 — formata conforme o usuário digita. */
function formatarWhats(valor: string): string {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Converte os dígitos digitados para E.164: +55DDDNÚMERO. */
function paraE164(valor: string): string {
  let d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  // Números móveis antigos com 10 dígitos (DDD + 8) ganham o 9º dígito.
  if (d.length === 10 && "6789".includes(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return `+55${d}`;
}

/** (+55) 15 9****-9999 — exibição mascarada. */
function mascararPhone(e164: string): string {
  const d = e164.replace("+55", "");
  if (d.length < 6) return e164;
  return `(+55) ${d.slice(0, 2)} ${d[2]}****-${d.slice(-4)}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const { user } = useSession();
  const { staffOnly, painel, rolesPronto } = useStaffOnly();
  const destino = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  const [modo, setModo] = useState<"whatsapp" | "email" | "funcionario">("whatsapp");
  const [etapa, setEtapa] = useState<"telefone" | "codigo">("telefone");
  const [whatsRaw, setWhatsRaw] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [provedorPendente, setProvedorPendente] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [perfil, setPerfil] = useState<{ nome?: string } | undefined>(undefined);

  // Carregar perfil para saber se falta o nome (cadastro automático por OTP).
  useEffect(() => {
    if (!user) {
      setPerfil(undefined);
      return;
    }
    supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setPerfil(data ?? {} as { nome?: string }));
  }, [user?.id]);

  const precisaNome =
    !!user && perfil !== undefined && !(perfil?.nome ?? "").trim() && !staffOnly;

  useEffect(() => {
    if (!user || !rolesPronto || precisaNome) return;
    if (staffOnly && painel && destino === "/") navigate({ to: painel, replace: true });
    else if (destino.includes("?")) window.location.replace(destino);
    else navigate({ to: destino, replace: true });
  }, [user, destino, navigate, staffOnly, painel, rolesPronto, precisaNome]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

  async function salvarNome(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nome = String(new FormData(e.currentTarget).get("nome") ?? "").trim();
    if (nome.length < 2) {
      toast.error("Informe seu nome.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.from("profiles").update({ nome }).eq("id", user!.id);
    setCarregando(false);
    if (error) {
      toast.error("Não foi possível salvar seu nome.");
      return;
    }
    setPerfil({ nome });
    toast.success("Bem-vindo à Néia Salgados!");
  }

  async function enviarCodigo() {
    const digitos = whatsRaw.replace(/\D/g, "");
    if (digitos.length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    const phone = paraE164(whatsRaw);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "whatsapp" as never },
    });
    setCarregando(false);
    if (error) {
      setProvedorPendente(true);
      toast.error(PROVEDOR_PENDENTE);
      return;
    }
    setProvedorPendente(false);
    setPhoneE164(phone);
    setEtapa("codigo");
    setCooldown(60);
    toast.success(cooldown > 0 ? "Aguarde para reenviar." : "Código enviado para seu WhatsApp!");
  }

  function enviarCodigoWhats(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void enviarCodigo();
  }

  async function verificarCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\D/g, "");
    if (token.length < 6) {
      toast.error("Digite o código de 6 dígitos recebido.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token,
      type: "sms",
    });
    setCarregando(false);
    if (error) {
      toast.error("Código inválido ou expirado. Tente novamente.");
      return;
    }
    setEtapa("telefone");
    toast.success("Bem-vindo!");
  }

  async function entrarComEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${destino}` },
    });
    setCarregando(false);
    if (error) {
      toast.error("Não foi possível enviar o link por e-mail.");
      return;
    }
    toast.success(`Enviamos um link de acesso para ${email}. Abra-o neste aparelho.`);
  }

  async function entrarFuncionario(e: React.FormEvent<HTMLFormElement>) {
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

      {precisaNome ? (
        <form onSubmit={salvarNome} className="mt-8 space-y-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="font-display text-lg text-foreground">Como podemos te chamar?</h2>
            <p className="text-sm text-muted-foreground">
              Só falta seu nome. Seu WhatsApp já está confirmado.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" required maxLength={100} placeholder="Seu nome" />
          </div>
          <Button type="submit" className="w-full" disabled={carregando}>
            Salvar e entrar
          </Button>
        </form>
      ) : modo === "whatsapp" ? (
        <div className="mt-8 space-y-4">
          <div className="text-center">
            <h1 className="font-display text-xl text-foreground">Entrar na Néia Salgados</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use seu WhatsApp. Sem senha — receba um código e entre.
            </p>
          </div>

          {etapa === "telefone" ? (
            <form onSubmit={enviarCodigoWhats} className="space-y-4 rounded-xl border border-border bg-card p-5">
              {provedorPendente ? (
                <p className="rounded-lg bg-amber-500/10 p-3 text-center text-xs text-amber-600 dark:text-amber-400">
                  {PROVEDOR_PENDENTE}
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="whats">WhatsApp</Label>
                <Input
                  id="whats"
                  name="whats"
                  inputMode="tel"
                  placeholder="(15) 99999-9999"
                  required
                  maxLength={16}
                  autoComplete="tel"
                  value={formatarWhats(whatsRaw)}
                  onChange={(e) => {
                    setWhatsRaw(e.target.value);
                    setProvedorPendente(false);
                  }}
                />
              </div>
              <Button type="submit" className="w-full" disabled={carregando}>
                <MessageCircle className="mr-2 size-4" />
                {carregando ? "Enviando..." : "Receber código no WhatsApp"}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground underline"
                onClick={() => setModo("email")}
              >
                Entrar com e-mail
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <form onSubmit={verificarCodigo} className="space-y-4 rounded-xl border border-primary/40 bg-card p-5">
                <div>
                  <h2 className="font-display text-lg text-foreground">
                    Enviamos um código para seu WhatsApp
                  </h2>
                  <p className="text-sm text-muted-foreground">{mascararPhone(phoneE164)}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="codigo">Código de 6 dígitos</Label>
                  <Input
                    id="codigo"
                    name="codigo"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="000000"
                    required
                    minLength={6}
                    maxLength={6}
                    autoComplete="one-time-code"
                    className="text-center text-lg tracking-[0.4em]"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={carregando}>
                  Entrar
                </Button>
              </form>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={cooldown > 0 || carregando}
                onClick={() => void enviarCodigo()}
              >
                {cooldown > 0 ? `Reenviar código (${cooldown}s)` : "Reenviar código"}
              </Button>
            </div>
          )}

          <button
            type="button"
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setModo("funcionario")}
          >
            <Lock className="size-3" />
            Funcionários: entrar com e-mail e senha
          </button>
        </div>
      ) : modo === "email" ? (
        <div className="mt-8 space-y-4">
          <div className="text-center">
            <h1 className="font-display text-xl text-foreground">Entrar com e-mail</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sem senha: enviamos um link de acesso.
            </p>
          </div>
          <form onSubmit={entrarComEmail} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" placeholder="voce@email.com" />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              <Mail className="mr-2 size-4" />
              {carregando ? "Enviando..." : "Enviar link de acesso"}
            </Button>
          </form>
          <button
            type="button"
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setModo("whatsapp")}
          >
            <MessageCircle className="size-3" />
            Continuar com WhatsApp
          </button>
          <button
            type="button"
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setModo("funcionario")}
          >
            <Lock className="size-3" />
            Funcionários: entrar com e-mail e senha
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="text-center">
            <h1 className="font-display text-xl text-foreground">Acesso da equipe</h1>
            <p className="mt-1 text-sm text-muted-foreground">Uso interno da Néia Salgados.</p>
          </div>
          <form onSubmit={entrarFuncionario} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1.5">
              <Label htmlFor="email-f">E-mail</Label>
              <Input id="email-f" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha-f">Senha</Label>
              <Input id="senha-f" name="senha" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              Entrar
            </Button>
          </form>
          <button
            type="button"
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setModo("whatsapp")}
          >
            <MessageCircle className="size-3" />
            Continuar com WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}
