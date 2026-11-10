// Acesso direto do cliente — sessão anônima (Supabase Anonymous Auth).
// Sem senha, sem OTP, sem Twilio. Funcionários continuam com e-mail/senha.
// @ts-nocheck - Tipos do @supabase/auth-js não instalados no ambiente local
import { supabase } from "@/integrations/supabase/client";

let concedida = false;

/**
 * Garante uma sessão quando NÃO houver sessão atual:
 * - sessão existente (anônima ou de funcionário) → não cria usuário novo;
 * - sem sessão → `signInAnonymously()` (Supabase gera `is_anonymous=true`).
 * Segura para chamar em qualquer tela; no-op quando já existe sessão.
 */
export async function garantirSessaoAnonima(): Promise<void> {
  if (concedida) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    concedida = true;
    return;
  }
  const { error } = await supabase.auth.signInAnonymously();
  if (!error) concedida = true;
  // Sem tela de login e sem ruído: falha silenciosa mantém a navegação fluida
  // (pedidos/carrinho dependem de sessão; retries ocorrem no próximo acesso).
}
