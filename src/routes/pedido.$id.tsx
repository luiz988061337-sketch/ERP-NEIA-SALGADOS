import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Bike,
  ChefHat,
  Check,
  ClipboardList,
  Clock,
  Crown,
  Headset,
  Home,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  Phone,
  Star,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PagamentoStatusBadge } from "@/components/status-steps";
import { NotasCliente } from "@/components/pedido-notas";
import { MapView, rotaGoogleMaps } from "@/components/map-view";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import {
  brl,
  dataHora,
  PAGAMENTO_LABEL,
  statusFlow,
  statusLabel,
  telefoneWhatsappConfigurado,
  whatsappLink,
} from "@/lib/format";
import { decidirCancelamentoAtomico, type RpcClient } from "@/lib/reserva-integracao";
import { BUILD_DE_CORTE } from "@/lib/corte";
import {
  DEFAULT_LOJA_CONFIG,
  prazosAtendimento,
  useLojaConfig,
} from "@/lib/loja";
import { useConfigEntrega, type ConfigEntrega } from "@/lib/config-entrega";
import { pontosGanhos } from "@/lib/fidelidade";
import { DEFAULT_CRM_SETTINGS, useCrmSettings } from "@/lib/crm";
import { ehModoDemo } from "@/lib/demo-preview";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { comLocalizacaoSegura, lerLocalizacaoEntrega, MOTOBOY_RPC_ATIVO } from "@/lib/localizacao-entrega";
import { ativarPush, estadoPush } from "@/lib/push";

const ICONE_ETAPA: Record<string, typeof Check> = {
  recebido: ClipboardList,
  em_producao: ChefHat,
  pronto: PackageCheck,
  aguardando_motoboy: Clock,
  em_rota: Bike,
  entregue: Home,
};

function janelaPrevista(iso: string | null | undefined, min: number, max: number) {
  if (!iso) return null;
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return {
    de: hora(new Date(base.getTime() + min * 60_000)),
    ate: hora(new Date(base.getTime() + max * 60_000)),
  };
}

type EnderecoRetirada = {
  configurado: boolean;
  linhas: string[];
  texto: string;
  placeId: string | null;
};

/** Endereço oficial da loja: origem validada de config_entrega, com fallback
 * para loja_config. Nunca transforma texto de demonstração em endereço real. */
function enderecoRetirada(loja: any, cfg: ConfigEntrega | null | undefined): EnderecoRetirada {
  const origemTemTextoReal = !!cfg?.origem_logradouro &&
    !/demonstra|fictíci|simulação/i.test(
      [cfg.origem_nome, cfg.origem_logradouro, cfg.origem_bairro].filter(Boolean).join(" "),
    );
  const rua = origemTemTextoReal
    ? [cfg?.origem_logradouro, cfg?.origem_numero].filter(Boolean).join(", ")
    : String(loja?.endereco ?? "");
  const complemento = origemTemTextoReal ? String(cfg?.origem_complemento ?? "") : String(loja?.complemento ?? "");
  const bairro = origemTemTextoReal ? String(cfg?.origem_bairro ?? "") : String(loja?.bairro ?? "");
  const cidade = origemTemTextoReal ? String(cfg?.origem_cidade ?? "") : String(loja?.cidade ?? "");
  const uf = origemTemTextoReal ? String(cfg?.origem_uf ?? "") : "";
  const cep = origemTemTextoReal ? String(cfg?.origem_cep ?? "") : "";
  const referencia = String(loja?.referencia ?? "");
  const cidadeUf = [cidade, uf].filter(Boolean).join(" - ");
  const linhas = [
    [rua, complemento].filter(Boolean).join(", "),
    bairro,
    cidadeUf,
    cep,
    referencia ? `Referência: ${referencia}` : "",
  ].filter(Boolean);
  const texto = [rua, bairro, cidadeUf, cep].filter(Boolean).join(", ");
  const configurado =
    !ehModoDemo() &&
    !!texto &&
    !/demonstra|fictíci/i.test(texto);
  return {
    configurado,
    linhas,
    texto,
    placeId: origemTemTextoReal ? String(cfg?.origem_place_id ?? "") || null : null,
  };
}

function urlMapaRetirada(endereco: EnderecoRetirada): string {
  if (endereco.placeId) {
    return `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(endereco.placeId)}&travelmode=driving`;
  }
  return rotaGoogleMaps(endereco.texto);
}

/** Linha do tempo horizontal do pedido (layout da referência aprovada). */
function TimelinePedido({
  status,
  tipoEntrega,
  createdAt,
}: {
  status: string;
  tipoEntrega?: string | null;
  createdAt?: string | null;
}) {
  const fluxo = statusFlow(tipoEntrega);
  const atual = fluxo.indexOf(status);
  const cancelado = status === "cancelado";

  return (
    <ol className="flex items-start gap-1 overflow-x-auto pb-1">
      {fluxo.map((s, i) => {
        const feito = atual >= 0 && i <= atual;
        const corrente = atual === i;
        const Icone = ICONE_ETAPA[s] ?? Check;
        return (
          <li key={s} className="relative flex min-w-24 flex-1 flex-col items-center px-1 text-center">
            {i > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[-50%] top-5 h-0.5 w-full",
                  feito ? "bg-success" : "bg-border",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 grid size-10 place-items-center rounded-full border-2 bg-card",
                corrente
                  ? "border-[#F6B300] bg-[#FFF4D8] text-[#650C09] shadow-[var(--shadow-card)]"
                  : feito
                    ? "border-success text-success"
                    : "border-border text-muted-foreground",
                cancelado && corrente && "border-destructive text-destructive",
              )}
            >
              {feito && !corrente ? <Check className="size-5" /> : <Icone className="size-5" />}
            </span>
            <span
              className={cn(
                "mt-2 text-xs font-semibold sm:text-sm",
                corrente ? "text-[#500B08] font-bold" : feito ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {statusLabel(s, tipoEntrega)}
            </span>
            {corrente ? (
              <span className="brand-gradient mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                {status === "entregue" ? "Concluído" : "Agora"}
              </span>
            ) : null}
            {corrente && createdAt && s !== "entregue" ? (
              <span className="mt-0.5 text-[10px] text-muted-foreground">
                {new Date(createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Nunca desenhar motoboy, rota ou percentual fictício como se fossem reais.
 * O título distingue "rota não liberada" de "GPS indisponível"; no preview,
 * uma posição válida só aparece identificada como simulação.
 */
function SemRastreamento({
  titulo,
  detalhe,
  simulado,
}: {
  titulo: string;
  detalhe: string;
  simulado?: { lat: number; lng: number } | null;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-2xl border-2 border-dashed border-[#F0D9A8] bg-[#FFFCF7] p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#FFF4D8] text-[#B9000B] shadow-[var(--shadow-card)]">
          <MapPin className="size-8" aria-hidden />
        </span>
        <p className="mt-3 font-display text-xl font-bold text-[#500B08]" data-testid="rastreamento-estado">
          {titulo}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-[#60524C]">{detalhe}</p>
        {simulado ? (
          <p
            className="mt-3 rounded-lg border border-[#F0D9A8] bg-white px-3 py-2 text-xs text-[#60524C]"
            data-testid="rastreamento-simulado"
          >
            Localização simulada válida (sem rede externa): {simulado.lat.toFixed(4)}, {simulado.lng.toFixed(4)}.
            <span className="mt-0.5 block font-semibold text-[#500B08]">Simulação — não é uma posição real.</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Legenda só aparece junto de um mapa real — nunca ilustra dados inventados. */
function LegendaMapa() {
  const itens = [
    { cor: "bg-[#B9000B]", texto: "Loja (Néia Salgados)" },
    { cor: "bg-[#F6B300]", texto: "Motoboy (em entrega)" },
    { cor: "bg-[#500B08]", texto: "Seu endereço" },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-[#FFFCF7] px-3 py-2.5 text-xs text-[#60524C]">
      <span className="font-semibold text-[#500B08]">Legenda:</span>
      {itens.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", i.cor)} aria-hidden /> {i.texto}
        </span>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/pedido/$id")({
  validateSearch: (search: Record<string, unknown>): { repetir?: boolean } => ({
    repetir: search["repetir"] === true || search["repetir"] === "true" || search["repetir"] === "1",
  }),
  head: () => ({
    meta: [
      { title: "Acompanhar pedido — Néia Salgados" },
      { name: "description", content: "Acompanhe em tempo real o preparo e a entrega do seu pedido." },
      { property: "og:title", content: "Acompanhar pedido — Néia Salgados" },
      { property: "og:description", content: "Acompanhe em tempo real o preparo e a entrega do seu pedido." },
    ],
  }),
  component: Acompanhar,
});

/** §75: marketing separado da comunicação operacional, só durante a espera. */
function MarketingEspera({ status, loja }: { status: string; loja: any }) {
  if (["entregue", "retirado", "cancelado"].includes(status)) return null;
  const links = [
    loja.instagram ? { nome: "Instagram", href: loja.instagram } : null,
    loja.facebook ? { nome: "Facebook", href: loja.facebook } : null,
    loja.site ? { nome: "Site", href: loja.site } : null,
  ].filter(Boolean) as { nome: string; href: string }[];
  if (links.length === 0 && !loja.telefone) return null;
  return (
    <section className="rounded-[22px] border border-[#F0D9A8] bg-white p-5 text-sm shadow-[var(--shadow-card)]">
      <h2 className="font-display text-xl font-bold text-[#500B08]">😊 Enquanto preparamos seu pedido...</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <Button key={l.nome} size="sm" variant="outline" asChild>
            <a href={l.href} target="_blank" rel="noopener noreferrer">{l.nome}</a>
          </Button>
        ))}
        {telefoneWhatsappConfigurado(loja.telefone) ? (
          <Button size="sm" variant="outline" asChild>
            <a
              href={whatsappLink(telefoneWhatsappConfigurado(loja.telefone)!, `Olá! Preciso de ajuda com o pedido.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Push opt-in: avisa "saiu para entrega/entregue" mesmo com o site fechado,
 * sem WhatsApp. Só para o dono logado (a inscrição é por usuário).
 */
function AvisoPush({ pedido }: { pedido: any }) {
  const { user } = useSession();
  const [estado, setEstado] = useState(() => estadoPush());
  const [salvando, setSalvando] = useState(false);
  if (!pedido || ["entregue", "retirado", "cancelado"].includes(pedido.status)) return null;
  if (!user?.id || pedido.user_id !== user.id) return null;
  if (estado === "nao-suportado" || estado === "negado") return null;
  if (estado === "ativo") {
    return (
      <p className="rounded-2xl border border-[#F0D9A8] bg-white p-3 text-center text-xs text-[#60524C] shadow-[var(--shadow-card)]">
        🔔 Notificações ativas neste aparelho — avisamos cada etapa por aqui.
      </p>
    );
  }
  async function ativar() {
    setSalvando(true);
    const r = await ativarPush(supabase, user!.id);
    setSalvando(false);
    if (r.ok) {
      setEstado("ativo");
      toast.success("Notificações ativadas!");
    } else if (r.motivo === "denied" || r.motivo === "negado") {
      setEstado("negado");
      toast.error("Permissão negada no navegador.");
    } else {
      toast.error("Não foi possível ativar neste aparelho.");
    }
    setEstado(estadoPush());
  }
  return (
    <div className="rounded-2xl border border-[#F0D9A8] bg-white p-4 text-center text-sm shadow-[var(--shadow-card)]">
      <p className="font-semibold text-[#500B08]">🔔 Avisar quando mudar de etapa?</p>
      <p className="mt-1 text-xs text-[#60524C]">
        {ehModoDemo()
          ? "Simulação: nenhuma notificação é enviada nesta demonstração."
          : "Avisos neste navegador quando houver suporte a push e permissão concedida. Fora do site, o recebimento depende do suporte do seu dispositivo."}
      </p>
      <Button size="sm" className="mt-2" disabled={salvando} onClick={ativar}>
        {salvando ? "Ativando…" : "Ativar notificações"}
      </Button>
    </div>
  );
}

/** §66: convite Google pós-entrega. Nunca condiciona benefício à nota. */
function ConviteGoogle({ status, loja, numero }: { status: string; loja: any; numero: number }) {
  if (!["entregue", "retirado"].includes(status)) return null;
  return (
    <section className="rounded-[22px] border border-[#F0D9A8] bg-white p-5 text-sm shadow-[var(--shadow-card)]">
      <h2 className="font-display text-xl font-bold text-[#500B08]">Gostou do pedido nº {numero}?</h2>
      <p className="mt-1 text-[#60524C]">Avalie os produtos em <Link className="font-semibold text-[#B9000B] underline" to="/conta">Minha conta</Link> e, se quiser, deixe sua avaliação pública no Google. Obrigado! ❤️</p>
      {loja.google_avaliacao ? (
        <Button size="sm" className="mt-2" asChild>
          <a href={loja.google_avaliacao} target="_blank" rel="noopener noreferrer">Avaliar no Google</a>
        </Button>
      ) : null}
    </section>
  );
}

function Acompanhar() {
  const { id } = Route.useParams();
  const { repetir } = Route.useSearch();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [cancelando, setCancelando] = useState(false);

  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido", id, MOTOBOY_RPC_ATIVO ? user?.id ?? null : null],
    // Fallback por polling caso o Realtime esteja bloqueado por RLS/rede
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (MOTOBOY_RPC_ATIVO && data) {
        const gps = user?.id && data.user_id === user.id && data.status === "em_rota"
          ? await lerLocalizacaoEntrega(id) : null;
        return comLocalizacaoSegura(data, gps);
      }
      return data;
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["pedido-itens", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedido_itens").select("*").eq("pedido_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel(`pedido-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pedido", id] });
          queryClient.invalidateQueries({ queryKey: ["pedido-itens", id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id, queryClient]);

  async function cancelar() {
    if (!pedido || !["recebido"].includes(pedido.status)) return;
    if (!window.confirm(`Cancelar o pedido nº ${pedido.numero}?`)) return;
    setCancelando(true);

    // Cancelamento atômico (0093) — atrás de flag OFF. Flag OFF => caminho
    // legado intacto. Flag ON + sucesso => RPC já cancelou e liberou. Flag ON
    // sem attestation/erro => aborta (NUNCA cai no UPDATE direto).
    const decisao = await decidirCancelamentoAtomico(
      supabase as unknown as RpcClient,
      pedido.id,
      "cliente",
    );
    if (decisao.modo === "erro") {
      setCancelando(false);
      toast.error(decisao.mensagem);
      return;
    }
    if (decisao.modo === "atomico") {
      setCancelando(false);
      toast.success("Pedido cancelado.");
      queryClient.invalidateQueries({ queryKey: ["pedido", id] });
      return;
    }

    // Cancelamento: no BUILD DE CORTE o caminho legado (UPDATE direto +
    // liberar_reserva_atomica + UPDATE direto em reservas_estoque) NAO e
    // compilado. O guard de versao + o lockdown de ACL bloqueiam bundles
    // antigos; este bundle so cancela via `cancelar_pedido_atomico` (0093).
    if (!BUILD_DE_CORTE) {
      const { error } = await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      // Libera reservas e devolve estoque (0030). Fallback legado se RPC não existir.
      try {
        await supabase.rpc("liberar_reserva_atomica", { p_pedido_id: pedido.id });
      } catch { /* sem migration — segue para fallback */ }
      try {
        await supabase.from("reservas_estoque").update({ status: "cancelada" }).eq("pedido_id", pedido.id).eq("status", "ativa");
      } catch { /* sem migration — segue */ }
      setCancelando(false);
      if (error) toast.error("Não foi possível cancelar. Fale com a loja.");
      else {
        toast.success("Pedido cancelado.");
        queryClient.invalidateQueries({ queryKey: ["pedido", id] });
      }
    }
  }

  const { data: lojaConfig } = useLojaConfig();
  const { data: configEntrega } = useConfigEntrega();
  const { data: settings } = useCrmSettings();

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">Carregando pedido...</p>;
  // A RLS do banco é a barreira principal; esta checagem cobre o cliente demo,
  // onde não existe política de acesso, e evita vazar pedido de outro cliente.
  const pedidoDeOutroCliente = !!(
    pedido?.user_id &&
    user?.id &&
    String(pedido.user_id) !== String(user.id)
  );
  if (!pedido || pedidoDeOutroCliente)
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button asChild className="mt-4">
          <Link to="/">Voltar ao cardápio</Link>
        </Button>
      </div>
    );

  const isRetirada = pedido.tipo_entrega === "retirada";
  const loja = lojaConfig ?? DEFAULT_LOJA_CONFIG;
  const retirada = enderecoRetirada(loja, configEntrega);
  const rotaLiberada =
    !!pedido.liberada_central_em || ["em_rota", "entregue"].includes(String(pedido.status));
  const latMotoboy = Number(pedido.motoboy_lat);
  const lngMotoboy = Number(pedido.motoboy_lng);
  const gpsValido =
    Number.isFinite(latMotoboy) &&
    Number.isFinite(lngMotoboy) &&
    (latMotoboy !== 0 || lngMotoboy !== 0);
  const gpsSimulado = ehModoDemo() && gpsValido ? { lat: latMotoboy, lng: lngMotoboy } : null;

  const fluxo = statusFlow(pedido.tipo_entrega);
  const atual = fluxo.indexOf(pedido.status);
  const progresso = atual >= 0 ? Math.round(((atual + 1) / fluxo.length) * 100) : 0;
  const prazos = prazosAtendimento(loja);
  // Estimativa só faz sentido durante a espera; pedido encerrado não tem ETA válida.
  const pedidoEncerrado = ["entregue", "retirado", "cancelado"].includes(pedido.status);
  const previsao = pedidoEncerrado
    ? null
    : isRetirada
      ? janelaPrevista(pedido.created_at, prazos.retiradaMin, prazos.retiradaMax)
      : janelaPrevista(pedido.created_at, prazos.entregaMin, prazos.entregaMax);
  // Fidelidade só aparece com o módulo realmente configurado; pontos, meta e
  // recompensa vêm da configuração do CRM — nunca de valores ilustrativos.
  const cfgFidelidade = {
    ativo: settings?.fid_ativo ?? DEFAULT_CRM_SETTINGS.fid_ativo,
    reaisPorPonto: settings?.fid_reais_por_ponto ?? DEFAULT_CRM_SETTINGS.fid_reais_por_ponto,
    metaPontos: settings?.fid_meta_pontos ?? DEFAULT_CRM_SETTINGS.fid_meta_pontos,
    recompensaValor: settings?.fid_recompensa_valor ?? DEFAULT_CRM_SETTINGS.fid_recompensa_valor,
  };
  const pontos = cfgFidelidade.ativo
    ? pontosGanhos(Number(pedido.total) || 0, cfgFidelidade)
    : 0;
  const meta = cfgFidelidade.metaPontos;
  const recompensa = cfgFidelidade.recompensaValor;
  const faltam = Math.max(0, meta - pontos);
  const pctFidelidade = meta > 0 ? Math.min(100, Math.round((pontos / meta) * 100)) : 0;
  const linkReembolso = ehModoDemo() ? "/preview/reembolsos-estornos-cliente/novo" : "/ajuda";
  const telAtendente = telefoneWhatsappConfigurado(loja.telefone);
  const linkAtendente = telAtendente
    ? whatsappLink(telAtendente, "Olá! Preciso de ajuda com um pedido da Néia Salgados.")
    : "/ajuda";
  const enderecoTexto = [pedido.endereco, pedido.complemento, pedido.bairro, pedido.cidade]
    .filter(Boolean)
    .join(" — ");
  // Endereço do cliente nunca é publicado no mapa. Só a posição autorizada do
  // motoboy, depois da liberação da rota, pode gerar um mapa real.
  const mostrarMapaReal = !ehModoDemo() && rotaLiberada && gpsValido;
  const pontosMapa: { lat: number; lng: number; label: string; moto?: boolean }[] = mostrarMapaReal
    ? [{ lat: latMotoboy, lng: lngMotoboy, label: "Motoboy", moto: true }]
    : [];
  const ultimaAtualizacao = pedido.motoboy_atualizado_em
    ? dataHora(pedido.motoboy_atualizado_em)
    : dataHora(pedido.updated_at ?? pedido.created_at);

  return (
    <div className="min-h-screen bg-[#FFFCF7]">
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Link
        to="/conta"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#60524C] transition hover:text-[#500B08]"
      >
        <ArrowLeft className="size-4" aria-hidden /> Meus pedidos
      </Link>

      {repetir ? (
        <p role="status" className="rounded-xl border border-[#F0D9A8] bg-white p-3 text-sm text-[#60524C]" data-testid="repetir-notice">
          Repetir pedido — demonstração. Os itens deste pedido foram selecionados para revisão; nenhuma compra ou cobrança foi realizada.
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <p className="text-sm text-[#60524C]">Pedido nº {pedido.numero}</p>
          <div className="mt-1 flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#FFF4D8] text-[#B9000B] shadow-[var(--shadow-card)]">
              <Package className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-[28px] font-bold leading-tight text-[#500B08] sm:text-[40px]">
                Acompanhe seu pedido
              </h1>
              <p className="mt-1 text-sm text-[#60524C]">Feito em {dataHora(pedido.created_at)}</p>
            </div>
          </div>
        </div>

        {cfgFidelidade.ativo ? (
          <aside className="rounded-[22px] bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] p-4 text-white shadow-[var(--shadow-card)]">
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              <Crown className="size-5" aria-hidden /> Plano Fidelidade Néia
            </p>
            <p className="mt-0.5 text-xs text-white/90">Acumule pontos a cada pedido conforme a regra configurada.</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-white/25 px-2.5 py-1 text-sm font-bold">
                <Star className="size-4" aria-hidden /> +{pontos} pontos
              </span>
              <span className="text-xs text-white/90">neste pedido</span>
            </div>
            <p className="mt-2 text-xs text-white/90">
              Faltam {faltam} pontos para um cupom de {brl(recompensa)}.
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pctFidelidade}%` }} />
            </div>
            <p className="mt-1 text-right text-[11px] text-white/85">
              {pontos} / {meta} pts
            </p>
          </aside>
        ) : null}
      </div>

      <section id="ciclo-pedido" className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
        <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
          <ClipboardList className="size-5" aria-hidden />
          <h2 className="font-display text-xl font-bold">Ciclo do pedido</h2>
        </div>
        <div className="p-4">
          <p className="text-xs text-[#60524C]">Acompanhe em tempo real cada etapa do seu pedido.</p>

          <div className="mt-4">
            <TimelinePedido status={pedido.status} tipoEntrega={pedido.tipo_entrega} createdAt={pedido.created_at} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-[#FFF4D8] p-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#B9000B]" aria-hidden />
              <strong>Status atual:</strong>
              <span className="brand-gradient rounded-full px-3 py-0.5 text-xs font-bold text-white">
                {statusLabel(pedido.status, pedido.tipo_entrega)}
              </span>
            </span>
            {ehModoDemo() ? (
              <span className="flex items-center gap-1.5 text-[#60524C]">
                <Clock className="size-4 text-[#B9000B]" aria-hidden /> Previsão indisponível nesta demonstração.
              </span>
            ) : previsao ? (
              <span className="flex items-center gap-1.5 text-[#60524C]">
                <Clock className="size-4 text-[#B9000B]" aria-hidden /> Previsão estimada de {isRetirada ? "retirada" : "entrega"}: entre{" "}
                <strong className="text-[#500B08]">
                  {previsao.de} e {previsao.ate}
                </strong>
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] text-white shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
            <Bell className="size-6" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold">Notificações do pedido</h2>
            <p className="text-sm leading-relaxed text-white/90">
              {isRetirada
                ? "Acompanhe cada etapa por aqui. Se você ativou as notificações neste aparelho, o aviso de pedido pronto aparece aqui também."
                : "Acompanhe cada etapa por aqui. Se você ativou as notificações neste aparelho, o aviso de saída para entrega aparece aqui também."}
            </p>
            {ehModoDemo() ? (
              <p className="mt-1 text-xs font-semibold text-white" data-testid="notificacoes-simulacao">
                Simulação: nenhuma notificação real é enviada nesta prévia.
              </p>
            ) : null}
          </div>
          <Button asChild variant="secondary" className="rounded-full font-bold">
            <a href={isRetirada ? "#ciclo-pedido" : "#entrega-mapa"}>
              {isRetirada ? (
                <ClipboardList className="size-4" aria-hidden />
              ) : (
                <MapPin className="size-4" aria-hidden />
              )}
              {isRetirada ? "Ver etapas do pedido" : "Acompanhar entrega"}
            </a>
          </Button>
        </div>
      </section>

      <AvisoPush pedido={pedido} />
      <MarketingEspera status={pedido.status} loja={loja} />
      <ConviteGoogle status={pedido.status} loja={loja} numero={pedido.numero} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
          <div className="brand-gradient flex items-center gap-2 px-4 py-2.5 text-white">
            <ClipboardList className="size-5" aria-hidden />
            <h2 className="font-display text-lg font-bold">Resumo do pedido</h2>
          </div>
          <div className="space-y-2 p-4 text-sm">
            <ul className="space-y-1">
              {(itens ?? []).map((i: any) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="text-[#60524C]">
                    {i.quantidade}x {i.nome}
                  </span>
                  <span className="shrink-0">{brl(Number(i.preco_unitario) * i.quantidade)}</span>
                </li>
              ))}
              {(itens ?? []).length === 0 ? <li className="text-[#60524C]">Itens do pedido indisponíveis.</li> : null}
            </ul>
            <div className="border-t border-[#F0D9A8] pt-2">
              <div className="flex justify-between">
                <span className="text-[#60524C]">{isRetirada ? "Retirada na loja" : "Taxa de entrega"}</span>
                <span>{isRetirada ? "Grátis" : brl(pedido.taxa_entrega)}</span>
              </div>
              {Number(pedido.desconto) > 0 ? (
                <div className="flex justify-between text-success">
                  <span>Desconto</span>
                  <span>-{brl(pedido.desconto)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex items-center justify-between font-display text-xl font-bold">
                <span>Total</span>
                <span className="text-[#D50909]">{brl(pedido.total)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0D9A8] pt-2 text-xs">
              <span className="text-[#60524C]">
                Pagamento: <strong className="text-[#500B08]">{PAGAMENTO_LABEL[pedido.forma_pagamento] ?? pedido.forma_pagamento}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-[#60524C]">
                Situação do pagamento: <PagamentoStatusBadge status={pedido.pagamento_status} />
              </span>
            </div>
            {pedido.pagamento_em ? (
              <p className="text-xs text-[#60524C]">Pago em {dataHora(pedido.pagamento_em)}</p>
            ) : null}
            <p className="flex items-center gap-1.5 border-t border-[#F0D9A8] pt-2 text-xs text-[#60524C]">
              <Store className="size-3.5 text-[#B9000B]" aria-hidden /> Vendido e entregue por Néia Salgados
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
          <div className="brand-gradient flex items-center gap-2 px-4 py-2.5 text-white">
            {isRetirada ? (
              <Store className="size-5" aria-hidden />
            ) : (
              <Truck className="size-5" aria-hidden />
            )}
            <h2 className="font-display text-lg font-bold">
              {isRetirada ? "Retirada na Néia Salgados" : "Entrega"}
            </h2>
          </div>
          <div className="space-y-2 p-4 text-sm">
            {isRetirada ? (
              <div data-testid="retirada-loja">
                {retirada.configurado ? (
                  <p className="flex items-start gap-2 text-[#60524C]">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-[#B9000B]" aria-hidden />
                    <span>
                      {retirada.linhas.map((linhaEndereco) => (
                        <span key={linhaEndereco} className="block">{linhaEndereco}</span>
                      ))}
                    </span>
                  </p>
                ) : (
                  <p className="text-[#60524C]" data-testid="retirada-sem-endereco">
                    Endereço da loja ainda não configurado.
                  </p>
                )}
                {retirada.configurado ? (
                  <Button asChild size="sm" variant="outline" className="mt-2">
                    <a href={urlMapaRetirada(retirada)} target="_blank" rel="noopener noreferrer">
                      <MapPin className="size-4" aria-hidden /> Como chegar pelo Google Maps
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="mt-2" disabled>
                    <MapPin className="size-4" aria-hidden /> Como chegar pelo Google Maps
                  </Button>
                )}
              </div>
            ) : (
              <p className="flex items-start gap-2 text-muted-foreground" data-testid="entrega-endereco">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-semibold text-[#500B08]">Endereço confirmado no checkout</span>
                  {enderecoTexto}
                  {pedido.cep ? <span className="mt-1 block">CEP {pedido.cep}</span> : null}
                  {pedido.tipo_imovel === "apartamento" || pedido.apartamento ? (
                    <span className="mt-1 block">
                      Apto {pedido.apartamento || "—"}
                      {pedido.bloco ? ` • Bloco/Torre ${pedido.bloco}` : ""}
                      {pedido.andar ? ` • Andar ${pedido.andar}` : ""}
                      {pedido.interfone ? ` • Interfone ${pedido.interfone}` : ""}
                      {pedido.pode_subir ? " • autorizado subir" : ""}
                    </span>
                  ) : null}
                </span>
              </p>
            )}
            <p className="flex items-center gap-2 text-[#60524C]">
              <Phone className="size-4 shrink-0 text-[#B9000B]" aria-hidden /> {pedido.telefone}
            </p>
            {previsao ? (
              <p className="flex items-center gap-2 text-[#60524C]" data-testid="previsao-retirada">
                <Clock className="size-4 shrink-0 text-[#B9000B]" aria-hidden />
                {isRetirada
                  ? `Previsão de retirada: entre ${previsao.de} e ${previsao.ate}`
                  : `Previsão de entrega: entre ${previsao.de} e ${previsao.ate}`}
              </p>
            ) : null}
            {isRetirada && loja.instrucoes_retirada ? (
              <p className="whitespace-pre-line text-xs text-[#60524C]">{loja.instrucoes_retirada}</p>
            ) : null}
          </div>
        </section>
      </div>

      {!isRetirada ? (
        <section
          id="entrega-mapa"
          className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]"
        >
          <div className="brand-gradient flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <MapPin className="size-5" aria-hidden /> Acompanhar entrega em tempo real
            </h2>
            {!ehModoDemo() && enderecoTexto && !/demonstra|fictíci|demonstrativa/i.test(enderecoTexto) ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoTexto)}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold underline underline-offset-2"
              >
                Ver rota no mapa
              </a>
            ) : (
              <span className="text-xs font-semibold text-white/90">Rota indisponível nesta demonstração</span>
            )}
          </div>

          <div className="p-3">
            <div className="grid gap-2 rounded-xl bg-[#FFF4D8] p-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-[#60524C]">Status da entrega</p>
                <p className="mt-0.5 inline-flex rounded-full bg-[#B9000B] px-2 py-0.5 font-bold text-white">
                  {statusLabel(pedido.status, pedido.tipo_entrega)}
                </p>
              </div>
              <div>
                <p className="text-[#60524C]">Previsão estimada</p>
                <p className="mt-0.5 font-bold text-[#500B08]">{ehModoDemo() ? "Indisponível" : previsao ? `${previsao.de} – ${previsao.ate}` : "—"}</p>
              </div>
              <div>
                <p className="text-[#60524C]">Última atualização</p>
                <p className="mt-0.5 font-bold text-[#500B08]">{ultimaAtualizacao}</p>
              </div>
              <div>
                <p className="text-[#60524C]">Etapas do pedido</p>
                <p className="mt-0.5 font-bold text-[#500B08]">
                  {atual >= 0 ? atual + 1 : 0} / {fluxo.length}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-[#F6B300]" style={{ width: `${progresso}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-3">
              {pontosMapa.length > 0 ? (
                <>
                  <MapView pontos={pontosMapa} className="h-60" />
                  <LegendaMapa />
                </>
              ) : (
                <SemRastreamento
                  titulo={
                    !rotaLiberada
                      ? "Aguardando liberação da entrega"
                      : gpsSimulado
                        ? "Localização simulada válida (demonstração)"
                        : "Rastreamento em tempo real indisponível no momento"
                  }
                  detalhe={
                    !rotaLiberada
                      ? "A Central de Entregas ainda não liberou a rota deste pedido. O rastreamento começa após a liberação."
                      : gpsSimulado
                        ? "Posição válida apenas nesta simulação: nenhum serviço externo, GPS real ou dado de cliente foi consultado."
                        : "A rota foi liberada, mas ainda não há uma posição GPS válida e autorizada para exibir."
                  }
                  simulado={gpsSimulado}
                />
              )}
            </div>
          </div>
        </section>
      ) : null}

      <NotasCliente pedidoId={pedido.id} />

      <section className="overflow-hidden rounded-[22px] bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] p-4 text-white shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20">
            <Headset className="size-7" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold leading-tight">Precisa de ajuda com este pedido?</h2>
            <p className="mt-1 text-sm text-white/90">
              Teve algum problema com os produtos, a entrega ou o pagamento? Você pode informar o ocorrido e solicitar
              um reembolso (total ou parcial), se aplicável.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="h-auto w-full justify-start whitespace-normal bg-white py-2 text-left text-primary hover:bg-white/90 sm:w-auto">
                <a href={linkReembolso}>
                  <MessageCircle className="size-4 shrink-0" aria-hidden /> Informar problema ou solicitar reembolso
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal border-white/70 bg-white/90 py-2 text-left text-primary hover:bg-white sm:w-auto"
              >
                <a
                  href={linkAtendente}
                  target={linkAtendente.startsWith("http") ? "_blank" : undefined}
                  rel={linkAtendente.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  <Headset className="size-4 shrink-0" aria-hidden /> Falar com a atendente
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2 pb-4 sm:flex-row">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/">
            <Package className="size-4" aria-hidden /> Voltar ao cardápio
          </Link>
        </Button>
        {pedido.status === "recebido" ? (
          <Button
            variant="outline"
            className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={cancelando}
            onClick={cancelar}
          >
            <XCircle className="size-4" aria-hidden /> {cancelando ? "Cancelando..." : "Cancelar pedido"}
          </Button>
        ) : null}
      </div>
      </div>
    </div>
  );
}
