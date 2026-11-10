// @ts-nocheck - Tipos do @supabase/auth-js não instalados localmente
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { MessageCircle, Lock } from "lucide-react";
import logo from "@/assets/neia-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useStaffOnly } from "@/lib/session";
import { garantirSessaoAnonima } from "@/lib/sessao-anonima";

// RECUPERAÇÃO OPCIONAL (futuro): fluxo OTP por WhatsApp mantido desativado.
// Ativar só quando houver provedor (Twilio) configurado no Supabase.
const MODO_OTP_RECUPERACAO = false;

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

/** Ajuda em formato (15) 99999-9999. */
function formatarWhats(valor: string): string {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function paraE164(valor: string): string {
  let d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 10 && "6789".includes(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return `+55${d}`;
}

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
  const [carregando, setCarregando] = useState(false);

  const destino = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";

  useEffect(() => {
    if (!user || !rolesPronto) return;
    if (staffOnly && painel && destino === "/") navigate({ to: painel, replace: true });
    else if (destino.includes("?")) window.location.replace(destino);
    else navigate({ to: destino, replace: true });
  }, [user, destino, navigate, staffOnly, painel, rolesPronto]);

  // Funcionários: autenticação normal por e-mail e senha (inalterada).
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

      <div className="mt-8 space-y-4">
        <div className="text-center">
          <h1 className="font-display text-xl text-foreground">Entrar na Néia Salgados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Você não precisa de login para pedir — sua sessão de acesso já fica ativa neste
            aparelho.
          </p>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={carregando}
          onClick={() => void garantirSessaoAnonima()}
        >
          <MessageCircle className="mr-2 size-4" />
          {user ? "Continuar" : "Continuar como cliente"}
        </Button>

        {MODO_OTP_RECUPERACAO ? <LoginWhatsappOtp destino={destino} /> : null}

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-center font-display text-sm text-foreground">Funcionários</p>
          <p className="text-center text-xs text-muted-foreground">Uso interno da equipe.</p>
          <form onSubmit={entrarFuncionario} className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email-f">E-mail</Label>
              <Input id="email-f" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha-f">Senha</Label>
              <Input id="senha-f" name="senha" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" variant="outline" disabled={carregando}>
              <Lock className="mr-2 size-3" />
              Entrar da equipe
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * RECUPERAÇÃO OPCIONAL — módulo de OTP por WhatsApp (dormante).
 * Mantido sem alterações para reativação futura ("Recuperar minha conta")
 * quando o provedor (Twilio) estiver configurado. NÃO está no fluxo atual.
 */
const PROVEDOR_PENDENTE =
  "WHATSAPP OTP: AGUARDANDO CONFIGURAÇÃO DO PROVEDOR (Twilio).";

function LoginWhatsappOtp({ destino }: { destino: string }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [whatsRaw, setWhatsRaw] = useState("");
  const [etapa, setEtapa] = useState<"telefone" | "codigo">("telefone");
  const [phoneE164, setPhoneE164] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [provedorPendente, setProvedorPendente] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (destino.includes("?")) window.location.replace(destino);
    else navigate({ to: destino, replace: true });
  }, [user, destino, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

  async function enviarCodigo() {
    if (whatsRaw.replace(/\D/g, "").length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: paraE164(whatsRaw),
      options: { channel: "whatsapp" as never },
    });
    setCarregando(false);
    if (error) {
      setProvedorPendente(true);
      toast.error(PROVEDOR_PENDENTE);
      return;
    }
    setProvedorPendente(false);
    setPhoneE164(paraE164(whatsRaw));
    setEtapa("codigo");
    setCooldown(60);
  }

  async function verificarCodigo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\D/g, "");
    if (token.length < 6) {
      toast.error("Digite o código de 6 dígitos recebido.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: "sms" });
    setCarregando(false);
    if (error) toast.error("Código inválido ou expirado. Tente novamente.");
  }

  if (etapa === "telefone") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void enviarCodigo(); }} className="space-y-4 rounded-xl border border-border bg-card p-5">
        {provedorPendente ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-center text-xs text-amber-600 dark:text-amber-400">
            {PROVEDOR_PENDENTE}
          </p>
        ) : null}
        <Label htmlFor="whats-rec">WhatsApp</Label>
        <Input
          id="whats-rec"
          inputMode="tel"
          placeholder="(15) 99999-9999"
          required
          maxLength={16}
          value={formatarWhats(whatsRaw)}
          onChange={(e) => setWhatsRaw(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={carregando || cooldown > 0}>
          {cooldown > 0 ? `Reenviar código (${cooldown}s)` : "Receber código no WhatsApp"}
        </Button>
      </form>
    );
  }
  return (
    <form onSubmit={verificarCodigo} className="space-y-4 rounded-xl border border-primary/40 bg-card p-5">
      <p className="text-sm text-muted-foreground">Código enviado para {mascararPhone(phoneE164)}</p>
      <Input
        name="codigo"
        inputMode="numeric"
        placeholder="000000"
        required
        minLength={6}
        maxLength={6}
        autoComplete="one-time-code"
        className="text-center text-lg tracking-[0.4em]"
      />
      <Button type="submit" className="w-full" disabled={carregando}>
        Entrar
      </Button>
    </form>
  );
}
