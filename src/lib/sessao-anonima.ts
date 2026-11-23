// Acesso direto do cliente — sessão anônima (Supabase Anonymous Auth).
// Sem senha, sem OTP, sem Twilio. Funcionários continuam com e-mail/senha.
// @ts-nocheck - Tipos do @supabase/auth-js não instalados no ambiente local
import { supabase } from "@/integrations/supabase/client";

/**
 * Garante uma sessão quando NÃO houver sessão atual:
 * - sessão existente (anônima ou de funcionário) → não cria usuário novo;
 * - sem sessão → `signInAnonymously()` (Supabase gera `is_anonymous=true`).
 * Segura para chamar em qualquer tela; no-op quando já existir sessão.
 */
export async function garantirSessaoAnonima(podeIniciar?: () => boolean): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  // Se já há sessão (staff ou anon), não criar nova session anônima.
  // A sessão existente é preservada.
  if (session) {
    return;
  }

  // Uma navegação para /auth ou área staff durante getSession cancela o início.
  // Evita trocar a autenticação do funcionário por uma sessão anônima.
  if (podeIniciar && !podeIniciar()) return;

  // Só cria session anônima se realmente não houver sessão.
  const { error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw error;
  }
}
