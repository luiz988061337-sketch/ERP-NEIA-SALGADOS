// Declarações de tipo suplementares para @supabase/supabase-js v2.117.2
// O pacote @supabase/auth-js não possui arquivos .d.ts instalados,
// causando erros de tipo em métodos de autenticação.

export type Session = any;
export type User = any;

declare module "@supabase/supabase-js" {
  // Augmentar SupabaseClient (interface, não classe) para ter auth: any
  // Isso permite que qualquer método de auth seja chamado sem erro de tipo
  interface SupabaseClient {
    auth: any;
  }
}
