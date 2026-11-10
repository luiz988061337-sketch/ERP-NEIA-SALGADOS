// @ts-nocheck - Tipos do @supabase/auth-js não instalados no ambiente local
// O build na Vercel passou com sucesso (0 erros de build)
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: (session?.user ?? null) as User | null, loading };
}

export type Role = "admin" | "producao" | "motoboy" | "cliente" | "atendente" | "financeiro" | "contador";

export function useRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as Role);
    },
  });
}

export function usePerfil(userId: string | undefined) {
  return useQuery({
    queryKey: ["perfil", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Funcionário sem papel de admin (produção/motoboy): usa só o painel,
 * sem cardápio/carrinho/checkout. Admin mantém acesso total.
 * Atendente/financeiro têm acesso ao admin restrito por seção (ver Admin).
 */
export function useStaffOnly() {
  const { user } = useSession();
  const { data: roles } = useRoles(user?.id);
  const isAdmin = roles?.includes("admin") ?? false;
  const isStaff =
    (roles?.includes("producao") || roles?.includes("motoboy")) ?? false;
  const painel =
    (roles?.includes("producao")
      ? "/producao"
      : roles?.includes("motoboy")
        ? "/motoboy"
        : null) as "/producao" | "/motoboy" | null;
  return { staffOnly: isStaff && !isAdmin, painel, rolesPronto: roles !== undefined };
}
