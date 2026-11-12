import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Store, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { enderecoLoja, useLojaConfig } from "@/lib/loja";

/**
 * Topbar escura do staff (Projeto A1): loja, conexão real, relógio,
 * usuário e saída. Uso exclusivo interno — nunca na loja pública.
 */
export function AdminTopbar({
  usuario,
  onSair,
  onLojaClick,
  menuButton,
  acesso = "Acesso total",
  onVoltar,
}: {
  usuario?: string | null | undefined;
  onSair?: (() => void) | undefined;
  /** Ação do botão ← Voltar. Sem ação, sem botão. */
  onVoltar?: (() => void) | null;
  /** Sem destino (ex.: produção), o chip da loja vira só informativo. */
  onLojaClick?: (() => void) | null;
  menuButton?: ReactNode;
  acesso?: string;
}) {
  const { data: loja } = useLojaConfig();
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  // Ping real de conexão (mesma leitura pública da loja; sem ele, offline).
  const ping = useQuery({
    queryKey: ["admin-online-ping"],
    retry: false,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loja_config")
        .select("id")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const online = ping.isSuccess;
  const conectando = ping.isPending;

  const nomeLoja = loja?.nome || "Néia Salgados";
  const endLoja = loja ? enderecoLoja(loja) : "";

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] bg-white px-4 py-2 text-[#202B3A]">
      {menuButton}
      {onVoltar ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onVoltar}
          className="min-h-[44px] shrink-0 border-[#E5E7EB] bg-transparent text-[#202B3A] hover:bg-[#F1F5F9] hover:text-[#202B3A]"
          aria-label="Voltar"
        >
          ← Voltar
        </Button>
      ) : null}
      {onLojaClick ? (
        <button
          type="button"
          onClick={onLojaClick}
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-left"
          aria-label="Loja — ir para Configurações"
        >
          <Store className="size-5 text-[#C49A43]" aria-hidden />
          <span className="leading-tight">
            <span className="block text-xs font-bold">{nomeLoja}</span>
            <span className="block max-w-44 truncate text-[11px] text-[#64748B]">
              {endLoja || "Endereço a definir"}
            </span>
          </span>
        </button>
      ) : (
        <span className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-1.5">
          <Store className="size-5 text-[#C49A43]" aria-hidden />
          <span className="leading-tight">
            <span className="block text-xs font-bold">{nomeLoja}</span>
            <span className="block max-w-44 truncate text-[11px] text-[#64748B]">
              {endLoja || "Endereço a definir"}
            </span>
          </span>
        </span>
      )}
      <span
        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-1.5"
        role="status"
      >
        <span
          className={`size-2.5 rounded-full ${online ? "bg-[#21835D]" : conectando ? "bg-[#F59E0B]" : "bg-[#DC2626]"}`}
          aria-hidden
        />
        <span className="leading-tight">
          <span className="block text-xs font-bold">
            {online ? "Sistema online" : conectando ? "Conectando…" : "Sem conexão"}
          </span>
          <span className="block text-[11px] text-[#64748B]">
            {online ? "Todos os serviços funcionando" : "verifique a internet"}
          </span>
        </span>
      </span>
      <span
        className="hidden min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-center sm:flex"
        aria-label="Data e hora atuais"
      >
        <span className="leading-tight">
          <span className="block text-xs font-bold">{agora.toLocaleDateString("pt-BR")}</span>
          <span className="block text-sm font-bold">
            {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="block text-[11px] capitalize text-[#64748B]">
            {agora.toLocaleDateString("pt-BR", { weekday: "long" })}
          </span>
        </span>
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="hidden min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-1.5 md:flex">
          <UserRound className="size-5 text-[#94A3B8]" aria-hidden />
          <span className="leading-tight">
            <span className="block max-w-40 truncate text-xs font-bold">
              {usuario?.split("@")[0] ?? "Equipe"}
            </span>
            <span className="block text-[11px] text-[#64748B]">{acesso}</span>
          </span>
        </span>
        {onSair ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onSair}
            className="min-h-[44px] border-[#E5E7EB] bg-transparent text-[#202B3A] hover:bg-[#F1F5F9] hover:text-[#202B3A]"
          >
            <LogOut className="mr-1.5 size-4" />
            Sair
          </Button>
        ) : null}
      </span>
    </header>
  );
}
