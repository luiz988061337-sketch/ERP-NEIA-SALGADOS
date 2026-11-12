import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlarmClock,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  CircleCheck,
  Clock,
  Printer,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-steps";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdminShell } from "@/components/admin/admin-shell";
import { DonutChart, EmptyState, PageHeader, StatusCard } from "@/components/admin/ui-admin";
import { ERP_COLORS, KanbanColumn } from "@/components/admin/erp-ui";
import {
  avisoInterno,
  chaveAviso,
  elegivelAvisoCaixa,
  elegivelLiberacaoRetirada,
  linkAviso,
  TIPO_AVISO_CAIXA,
  TIPO_AVISO_RETIRADA,
} from "@/lib/producao-liberacao";
import { imagemProduto } from "@/lib/catalog";
import fritos from "@/assets/cat-fritos.jpg";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import {
  brl,
  dataHora,
  hora,
  mensagemStatus,
  type OrderStatus,
  type ProdStatus,
} from "@/lib/format";
import { mediaPorDiaSemana } from "@/lib/inteligencia";
import { tempoFrituraPedido, filtrarNovos, type AlertaSonoro } from "@/lib/cozinha";
import {
  DEPENDENCIAS_PADRAO,
  FLAGS_INTEGRACAO,
  registrarConsumoAtomico,
  type DependenciasIntegracao,
  type RpcClient,
} from "@/lib/reserva-integracao";
import {
  calcularProducao,
  classificarProcesso,
  estadoPrazoProducao,
  entradaJanelaProducao,
  inicioRecomendadoProducao,
  limiteImediatoProducao,
  ordenarFilaProducao,
  type EntradaFilaProducao,
  formatarMinutosProducao,
  NIVEL_META_PRODUCAO,
  MOTOR_PRODUCAO_CONFIG,
  type CalculoProducao,
} from "@/lib/motor-producao";
import { impressaoDireta, fichaDireta } from "@/lib/impressao";
import { E6_IMPRESSAO_ATIVA } from "@/lib/impressao-etapas";
import { notificarPedido } from "@/lib/notificacoes";
import { useRoles, useSession } from "@/lib/session";

// E9.1: trava de reenvio de ficha por evento (fora do estado React).
const filaEmVoo = new Set<string>();

/**
 * Attestation EXPLICITA do chamador de producao. A flag de ambiente continua
 * sendo o gate mestre; estas dependencias dizem que o painel foi implantado
 * junto com a retirada fisica (0091/0087). Nao ha fallback: se a RPC falhar,
 * a reserva permanece ativa e o operador ve o erro.
 */
const ATTESTACAO_CONSUMO: DependenciasIntegracao = {
  ...DEPENDENCIAS_PADRAO,
  registrar_consumo_0091: true,
  reserva_consumos_0087: true,
  producao_integrada: true,
};

type ReservaProducao = {
  id: string;
  pedido_id: string;
  produto_id: string;
  quantidade: number;
  status: string;
  nome: string;
  consumido: number;
  restante: number;
};

function RetiradaReserva({
  reserva,
  onAtualizado,
}: {
  reserva: ReservaProducao;
  onAtualizado: () => void;
}) {
  const [qtd, setQtd] = useState(String(reserva.restante));
  const [enviando, setEnviando] = useState(false);
  const idem = useRef<{ q: number; key: string } | null>(null);

  useEffect(() => {
    setQtd(String(reserva.restante));
    idem.current = null;
  }, [reserva.id, reserva.restante]);

  async function registrar() {
    const n = Math.floor(Number(qtd));
    if (!Number.isInteger(n) || n <= 0) {
      toast.error("Informe uma quantidade inteira maior que zero.");
      return;
    }
    if (n > reserva.restante) {
      toast.error(`Restam apenas ${reserva.restante} un nesta reserva.`);
      return;
    }
    if (!idem.current || idem.current.q !== n) {
      idem.current = { q: n, key: crypto.randomUUID() };
    }
    setEnviando(true);
    const r = await registrarConsumoAtomico(
      supabase as unknown as RpcClient,
      {
        reservaId: reserva.id,
        quantidade: n,
        produtoId: reserva.produto_id,
        idemKey: idem.current.key,
        observacao: "Retirada fisica do freezer (producao)",
      },
      { dependencias: ATTESTACAO_CONSUMO },
    );
    setEnviando(false);

    if (r.ok) {
      if (r.estado === "ja_registrado") {
        toast.info("Esta retirada ja estava registrada.");
      } else {
        toast.success(`${n} un de ${reserva.nome} retiradas do freezer.`);
      }
      idem.current = null;
      onAtualizado();
      return;
    }
    if (r.estado === "acima_do_restante") {
      toast.error(`Restam apenas ${r.restante} un nesta reserva.`);
      return;
    }
    if (r.estado === "desativado" || r.estado === "preparado") {
      toast.error("Retirada atomica desativada ou sem dependencias declaradas.");
      return;
    }
    toast.error(`Nao foi possivel registrar a retirada (${r.estado}).`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-card p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{reserva.nome}</p>
        <p className="text-[11px] text-muted-foreground">
          Reservado {reserva.quantidade} · retirado {reserva.consumido} · restante{" "}
          <strong className="text-foreground">{reserva.restante}</strong>
        </p>
      </div>
      <Input
        type="number"
        min={1}
        max={reserva.restante}
        step={1}
        value={qtd}
        onChange={(e) => setQtd(e.target.value)}
        className="h-8 w-20"
        aria-label={`Quantidade a retirar de ${reserva.nome}`}
      />
      <Button size="sm" disabled={enviando || reserva.restante <= 0} onClick={registrar}>
        {enviando ? "..." : "Retirar"}
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/producao")({
  head: () => ({
    meta: [
      { title: "Painel de Preparo — Néia Salgados" },
      { name: "description", content: "Fila de pedidos para preparo na cozinha." },
      { property: "og:title", content: "Painel de Preparo — Néia Salgados" },
      { property: "og:description", content: "Fila de pedidos para preparo na cozinha." },
    ],
  }),
  component: Producao,
});

/**
 * Painel de Produção / Cozinha.
 *
 * `preview` serve apenas à conferência visual (rota /preview-l2-producao):
 * injeta pedidos fictícios locais, dispensa sessão e bloqueia qualquer escrita
 * (status, impressão e reservas). Na rota real (/producao) o comportamento é
 * exatamente o de sempre (sessão, papéis, estoque, impressão e Central).
 */
export function Producao({
  preview = false,
  pedidosInjetados,
}: {
  preview?: boolean;
  pedidosInjetados?: any[];
} = {}) {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [sonsAtivos, setSonsAtivos] = useState(false);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  // Snapshot de status p/ detectar TRANSIÇÃO real para pronto (1 bip por pedido).
  const statusAnteriores = useRef(new Map<string, string>());
  // Relógio central do motor (§26): um único timer de 30s; cards/alertas derivam dele.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (preview) return;
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/producao" }, replace: true });
  }, [loading, user, navigate, preview]);

  const autorizado = preview ? true : roles?.includes("producao") || roles?.includes("admin");

  const { data: pedidosHook, isLoading } = useQuery({
    queryKey: ["fila-producao"],
    enabled: preview || !!autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("pedidos")
          .select("*, pedido_itens(*, produtos(tempo_fritura_s, categoria_id))")
          .in("status", ["recebido", "em_producao", "pronto"])
          .order("created_at");
        if (error) throw error;
        return data ?? [];
      } catch {
        const { data, error } = await supabase
          .from("pedidos")
          .select("*, pedido_itens(*)")
          .in("status", ["recebido", "em_producao", "pronto"])
          .order("created_at");
        if (error) throw error;
        return data ?? [];
      }
    },
  });

  const pedidos = pedidosInjetados ?? pedidosHook;

  const idsPedidos = useMemo(() => (pedidos ?? []).map((p: any) => String(p.id)), [pedidos]);
  // Reservas e consumos para a retirada fisica parcial. Leitura direta;
  // RLS restringe aos pedidos que o papel de producao ja pode ver.
  const { data: reservasProducao } = useQuery({
    queryKey: ["producao-reservas", idsPedidos.join(",")],
    enabled: !!autorizado && FLAGS_INTEGRACAO.consumo && idsPedidos.length > 0,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservas_estoque")
        .select("id, pedido_id, produto_id, quantidade, status, produtos(nome)")
        .in("pedido_id", idsPedidos)
        .in("status", ["ativa", "consumida"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const idsReservas = useMemo(
    () => (reservasProducao ?? []).map((r: any) => String(r.id)),
    [reservasProducao],
  );

  const { data: consumosProducao } = useQuery({
    queryKey: ["producao-consumos", idsReservas.join(",")],
    enabled: !!autorizado && FLAGS_INTEGRACAO.consumo && idsReservas.length > 0,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reserva_consumos")
        .select("reserva_id, quantidade")
        .in("reserva_id", idsReservas);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const reservasPorPedido = useMemo(() => {
    const consumidoPorReserva = new Map<string, number>();
    for (const c of consumosProducao ?? []) {
      consumidoPorReserva.set(
        String(c.reserva_id),
        (consumidoPorReserva.get(String(c.reserva_id)) ?? 0) + Number(c.quantidade ?? 0),
      );
    }
    const mapa = new Map<string, ReservaProducao[]>();
    for (const r of reservasProducao ?? []) {
      const consumido = consumidoPorReserva.get(String(r.id)) ?? 0;
      const restante = Math.max(0, Number(r.quantidade ?? 0) - consumido);
      const linha: ReservaProducao = {
        id: String(r.id),
        pedido_id: String(r.pedido_id),
        produto_id: String(r.produto_id),
        quantidade: Number(r.quantidade ?? 0),
        status: String(r.status),
        nome: String(r.produtos?.nome ?? `Produto ${String(r.produto_id).slice(0, 8)}`),
        consumido,
        restante,
      };
      const lista = mapa.get(linha.pedido_id) ?? [];
      lista.push(linha);
      mapa.set(linha.pedido_id, lista);
    }
    return mapa;
  }, [reservasProducao, consumosProducao]);

  useEffect(() => {
    if (!autorizado) return;
    const canal = supabase
      .channel("producao-fila")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [autorizado, queryClient]);

  const produzindo = (pedidos ?? []).filter((p: any) => p.status === "em_producao").length;
  const prontos = (pedidos ?? []).filter((p: any) => p.status === "pronto").length;

  // Categorias p/ classificar itens em processos (fritura/pastel/assado).
  // Falha aqui não quebra a fila: cai para classificação por nome.
  const { data: categorias } = useQuery({
    queryKey: ["categorias-slug"],
    enabled: !!autorizado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("categorias").select("id, slug");
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
  const slugPorCategoria = useMemo(
    () => new Map(((categorias ?? []) as any[]).map((c: any) => [c.id, c.slug])),
    [categorias],
  );

  // Motor: um cálculo por pedido (memoizado; recalcula ao chegar pedido/mudar status).
  const calculos = useMemo(() => {
    const map = new Map<string, CalculoProducao>();
    for (const p of (pedidos ?? []) as any[]) {
      const itens = ((p as any).pedido_itens ?? []).map((i: any) => ({
        nome: String(i.nome ?? ""),
        quantidade: Number(i.quantidade ?? 0),
        categoriaSlug:
          (i.produtos?.categoria_id != null
            ? (slugPorCategoria.get(i.produtos.categoria_id) as string | undefined)
            : null) ?? null,
      }));
      map.set(p.id, calcularProducao(itens));
    }
    return map;
  }, [pedidos, slugPorCategoria]);
  function calcDe(p: any): CalculoProducao | undefined {
    return calculos.get(p.id);
  }
  function estadoDe(p: any) {
    const calc = calcDe(p);
    return estadoPrazoProducao(
      {
        status: p.status,
        recebidoEm: p.agendado_para ? null : (p.created_at ?? null),
        solicitadoPara: p.agendado_para ?? null,
      },
      calc?.tecnicoMin ?? null,
      agora,
    );
  }
  // Agendado fora da janela de 1h30 não ocupa NOVOS (§10).
  function naJanela(p: any): boolean {
    if (!p.agendado_para) return true;
    try {
      return entradaJanelaProducao(p.agendado_para).getTime() <= agora.getTime();
    } catch {
      return true;
    }
  }
  // Ordenação da fila (motor): gravidade > instante de preparo > created_at > id.
  type LinhaFilaProducao = EntradaFilaProducao & { pedido: any };
  function ordenarListaProducao(lista: any[]): any[] {
    const entradas: LinhaFilaProducao[] = lista.map((p: any) => ({
      id: String(p.id),
      status: String(p.status),
      created_at: (p.created_at ?? null) as string | null,
      agendado_para: (p.agendado_para ?? null) as string | null,
      tecnicoMin: (calcDe(p)?.tecnicoMin ?? null) as number | null,
      pedido: p,
    }));
    return ordenarFilaProducao(entradas, agora).map((e) => e.pedido);
  }

  const [diaFiltro, setDiaFiltro] = useState(() => new Date().toISOString().slice(0, 10));
  const [incluirProntos, setIncluirProntos] = useState(false);
  const [dowPrevisao, setDowPrevisao] = useState<number>(6);

  const pedidosValidos = useMemo(() => {
    const base = (pedidos ?? []).filter(
      (p: any) => (incluirProntos ? true : p.status !== "pronto") && p.status !== "cancelado",
    );
    // Agendados aparecem no dia agendado; sem agendamento entram como "para agora".
    return base.filter((p: any) => {
      if (!p.agendado_para) return true;
      return String(p.agendado_para).slice(0, 10) === diaFiltro;
    });
  }, [pedidos, incluirProntos, diaFiltro]);

  const consolidado = useMemo(() => {
    type Linha = {
      nome: string;
      total: number;
      pendente: number;
      emProducao: number;
      pronto: number;
      pedidos: {
        numero: number;
        qtd: number;
        status: string;
        cliente: string;
        agendado: string | null;
      }[];
    };
    const map = new Map<string, Linha>();
    for (const p of pedidosValidos) {
      for (const i of (p as any).pedido_itens ?? []) {
        const cur: Linha = map.get(i.nome) ?? {
          nome: i.nome,
          total: 0,
          pendente: 0,
          emProducao: 0,
          pronto: 0,
          pedidos: [],
        };
        cur.total += i.quantidade;
        if (p.status === "recebido") cur.pendente += i.quantidade;
        else if (p.status === "em_producao") cur.emProducao += i.quantidade;
        else if (p.status === "pronto") cur.pronto += i.quantidade;
        cur.pedidos.push({
          numero: p.numero,
          qtd: i.quantidade,
          status: p.status,
          cliente: p.cliente_nome,
          agendado: p.agendado_para ?? null,
        });
        map.set(i.nome, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [pedidosValidos]);

  const totalGeral = consolidado.reduce((a, c) => a + c.total, 0);

  // Histórico p/ previsão (pedidos válidos 90d + itens)
  const { data: histPedidos } = useQuery({
    queryKey: ["producao-historico"],
    enabled: !!autorizado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const corte = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, created_at, status")
        .gte("created_at", corte)
        .neq("status", "cancelado")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: histItens } = useQuery({
    queryKey: ["producao-historico-itens", (histPedidos ?? []).length],
    enabled: !!autorizado && (histPedidos ?? []).length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const ids = (histPedidos ?? []).map((p: any) => p.id);
      const { data, error } = await supabase
        .from("pedido_itens")
        .select("pedido_id, nome, quantidade")
        .in("pedido_id", ids)
        .limit(8000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const previsao = useMemo(() => {
    const datas = new Map(((histPedidos ?? []) as any[]).map((p) => [p.id, p.created_at]));
    const itens = ((histItens ?? []) as any[])
      .map((i) => ({
        nome: i.nome,
        quantidade: i.quantidade,
        created_at: datas.get(i.pedido_id) ?? "",
      }))
      .filter((i) => i.created_at);
    const medias = mediaPorDiaSemana(itens);
    return medias.get(dowPrevisao) ?? new Map<string, number>();
  }, [histPedidos, histItens, dowPrevisao]);
  const nomesPrevisao = useMemo(() => {
    const nomes = new Set<string>([...previsao.keys()]);
    for (const c of consolidado) nomes.add(c.nome);
    return [...nomes].slice(0, 12);
  }, [previsao, consolidado]);
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const aguardandoLista = ordenarListaProducao(
    pedidosValidos.filter((p: any) => p.status === "recebido" && naJanela(p)),
  );
  const proximosLista = ordenarListaProducao(
    pedidosValidos.filter((p: any) => p.status === "recebido" && !naJanela(p)),
  );
  const preparoLista = ordenarListaProducao(
    pedidosValidos.filter((p: any) => p.status === "em_producao"),
  );
  // A coluna "Pronto" e a fila do dia: "pronto" nao entra na fila de preparo
  // (toggle "Incluir prontos"), mas precisa aparecer na coluna de entrega.
  const pedidosDoDia = useMemo(
    () =>
      (pedidos ?? []).filter(
        (p: any) =>
          p.status !== "cancelado" &&
          (!p.agendado_para || String(p.agendado_para).slice(0, 10) === diaFiltro),
      ),
    [pedidos, diaFiltro],
  );
  const prontosEntrega = pedidosDoDia.filter(
    (p: any) => p.status === "pronto" && p.tipo_entrega !== "retirada",
  );
  const prontosRetirada = pedidosDoDia.filter(
    (p: any) => p.status === "pronto" && p.tipo_entrega === "retirada",
  );
  // Prioridade no topo (mobile primeiro): risco + atraso de NOVOS e PREPARANDO.
  const prioridadeLista = ordenarListaProducao(
    [...aguardandoLista, ...preparoLista].filter((p: any) => {
      const n = estadoDe(p).nivel;
      return n === "risco" || n === "atrasado";
    }),
  );
  // "A Fazer": pedidos novos + agendados, SEM repetir os que ja estao em
  // preparo (cada pedido fica em uma unica coluna, como na referencia).
  // A prioridade (risco/atraso) ordena o topo da fila.
  const filaFazer = useMemo(() => {
    const mapa = new Map<string, any>();
    for (const p of [...aguardandoLista, ...proximosLista]) mapa.set(p.id, p);
    return ordenarListaProducao([...mapa.values()]);
  }, [aguardandoLista, proximosLista]);
  const atrasadosQtd = prioridadeLista.length;
  const fritEmUso = Math.min(
    MOTOR_PRODUCAO_CONFIG.maxFritadeiras,
    preparoLista.reduce((s: number, p: any) => s + (calcDe(p)?.fritadeiras ?? 0), 0),
  );
  const fornoEmUso = preparoLista.some((p: any) => (calcDe(p)?.qtdAssados ?? 0) > 0);

  // Resumo do dia (real): despachados = saíram da cozinha hoje.
  const hojeStr = new Date().toDateString();
  const despachadosHoje = useMemo(
    () =>
      (histPedidos ?? []).filter(
        (p: any) =>
          new Date(p.created_at).toDateString() === hojeStr &&
          ["pronto", "aguardando_motoboy", "em_rota", "entregue"].includes(p.status),
      ),
    [histPedidos, hojeStr],
  );
  const prontosCount = prontosEntrega.length + prontosRetirada.length;
  const totalDia = aguardandoLista.length + preparoLista.length + prontosCount;
  const pctProntos = totalDia > 0 ? (prontosCount / totalDia) * 100 : 0;

  function elapsedMin(iso: string | null | undefined): number {
    if (!iso) return 0;
    return Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000));
  }

  // Thumbs dos mais produzidos (consolidado da fila + cadastro).
  const { data: prodsThumb } = useQuery({
    queryKey: ["producao-produtos-thumb"],
    enabled: !!autorizado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("nome, imagem_url, categoria_id");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const slugPorId = useMemo(
    () => new Map(((categorias ?? []) as any[]).map((c: any) => [c.id, c.slug ?? ""])),
    [categorias],
  );
  const topProduzidos = useMemo(() => {
    const porNome = new Map(((prodsThumb ?? []) as any[]).map((p: any) => [String(p.nome), p]));
    return [...consolidado]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((c) => {
        const prod = porNome.get(c.nome) as any;
        return {
          nome: c.nome,
          total: c.total,
          img: imagemProduto(prod?.imagem_url, prod ? slugPorId.get(prod.categoria_id) : ""),
        };
      });
  }, [consolidado, prodsThumb, slugPorId]);

  function rolarPara(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const EMOJI_PROCESSO: Record<string, string> = { fritura: "🔥", pastel: "🥟", assado: "🥐" };
  function bordaPorNivel(nivel: string, agendadoFuturo: boolean): string {
    if (nivel === "atrasado") return "border-l-4 border-l-red-500";
    if (nivel === "risco") return "border-l-4 border-l-orange-500";
    if (nivel === "atencao") return "border-l-4 border-l-[#F59E0B]";
    if (agendadoFuturo) return "border-l-4 border-l-sky-500";
    return "";
  }

  function cardPedido(p: any, ctx: { cor: string; coluna: "fazer" | "preparo" | "pronto" }) {
    const calc = calcDe(p);
    const estado = estadoDe(p);
    const meta = NIVEL_META_PRODUCAO[estado.nivel];
    const retirada = p.tipo_entrega === "retirada";
    const qtdTotal = (p.pedido_itens ?? []).reduce(
      (s: number, i: any) => s + (Number(i.quantidade) || 0),
      0,
    );
    const pronto = p.status === "pronto";
    // Canto superior direito: "até HH:MM" na fila, "Finalizado HH:MM" quando pronto.
    const prazo = p.agendado_para
      ? hora(p.agendado_para)
      : p.created_at
        ? hora(limiteImediatoProducao(p.created_at).toISOString())
        : "--:--";
    return (
      <article
        key={p.id}
        className="rounded-xl border-2 bg-[#121110] p-3 shadow-card"
        style={{ borderColor: `${ctx.cor}66` }}
      >
        {/* Linha 1: numero + badge de prioridade + prazo/finalizado */}
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-bold leading-none text-foreground">
            #{p.numero}
          </h3>
          {estado.nivel !== "normal" ? (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{
                backgroundColor:
                  estado.nivel === "atrasado"
                    ? "rgba(241,106,106,.18)"
                    : estado.nivel === "risco"
                      ? "rgba(245,166,35,.18)"
                      : "rgba(212,169,74,.16)",
                color:
                  estado.nivel === "atrasado"
                    ? "#F16A6A"
                    : estado.nivel === "risco"
                      ? "#F5B301"
                      : "#F2CE6B",
              }}
              title={meta.rotulo}
            >
              {estado.nivel === "atrasado"
                ? "Atrasado"
                : estado.nivel === "risco"
                  ? "Atraso"
                  : estado.nivel === "atencao"
                    ? "Atenção"
                    : "Urgente"}
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-[#C9C2B8]">
            {pronto ? (
              <>
                <CircleCheck className="size-4 text-[#35C97C]" aria-hidden />
                Finalizado {p.pronto_em ? hora(p.pronto_em) : "--:--"}
              </>
            ) : (
              <>
                <Clock className="size-4 text-[#F2CE6B]" aria-hidden />
                até {prazo}
              </>
            )}
          </span>
        </div>

        {/* Linha 2: modalidade (entrega/retirada) + cliente */}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#2A2721] bg-[#17150F] px-2 py-0.5 font-bold text-[#F4F1EA]">
            {retirada ? "🏪 Retirada" : "🚚 Entrega"}
          </span>
          <span className="text-muted-foreground">• {p.cliente_nome}</span>
        </p>

        {/* Produtos e quantidades */}
        <ul className="mt-2 space-y-0.5 text-xs">
          {(p.pedido_itens ?? []).map((i: any) => {
            const cls = classificarProcesso({
              nome: String(i.nome ?? ""),
              categoriaSlug:
                i.produtos?.categoria_id != null
                  ? ((slugPorCategoria.get(i.produtos.categoria_id) as string | undefined) ?? null)
                  : null,
            });
            const emoji = EMOJI_PROCESSO[cls] ?? "•";
            return (
              <li key={i.id} className="flex items-center gap-1.5">
                <span className="text-[#F2CE6B]">{emoji}</span>
                <span className="font-bold text-foreground">{i.quantidade}x</span>
                <span className="min-w-0 flex-1 truncate text-[#F4F1EA]">{i.nome}</span>
              </li>
            );
          })}
        </ul>
        {qtdTotal > 0 ? (
          <p className="mt-1.5 text-xs">
            <b className="text-foreground">Total:</b>{" "}
            <b className="text-[#F2CE6B]">
              {qtdTotal} salgado{qtdTotal > 1 ? "s" : ""}
            </b>
          </p>
        ) : null}

        {/* Observacoes */}
        {p.observacoes ? (
          <p className="mt-2 rounded-lg border border-[#2A2721] bg-[#17150F] px-2 py-1.5 text-[11px] text-[#C9C2B8]">
            <b className="text-[#F2CE6B]">💬 Obs.:</b> {p.observacoes}
          </p>
        ) : null}

        {/* Tempos tecnicos internos ocultos (decisao do proprietario).
            O prazo do cliente ja aparece no topo do card ("ate HH:MM") e a
            urgencia fica na faixa de alerta. */}
        {calc?.tecnicoMin == null ? (
          <p className="mt-1 text-[11px] font-semibold text-[#F5B301]">
            ⚠️ Sem tempo estimado (
            {calc?.motivoSemTempo === "vazio"
              ? "pedido sem itens"
              : "sem processo reconhecido — validar cadastro"}
            ).
          </p>
        ) : null}
        {(calc?.naoReconhecidos?.length ?? 0) > 0 ? (
          <p className="mt-1.5 rounded-lg border border-[#F5B301]/35 bg-[#F5B301]/10 px-2 py-1.5 text-[11px] text-[#F5B301]">
            ⚠️ Não reconhecido:{" "}
            {(calc?.naoReconhecidos ?? []).map((n) => `${n.nome} (${n.quantidade})`).join(", ")}
          </p>
        ) : null}
        {estado.nivel !== "normal" && !pronto ? (
          <p
            className="mt-2 rounded-lg px-2 py-1.5 text-[11px] font-bold"
            style={{
              backgroundColor:
                estado.nivel === "atrasado"
                  ? "rgba(241,106,106,.14)"
                  : estado.nivel === "risco"
                    ? "rgba(245,166,35,.14)"
                    : "rgba(212,169,74,.12)",
              color:
                estado.nivel === "atrasado"
                  ? "#F16A6A"
                  : estado.nivel === "risco"
                    ? "#F5B301"
                    : "#F2CE6B",
            }}
          >
            {estado.nivel === "hora-preparar"
              ? `🔔 HORA DE PREPARAR — estimado ${calc?.tecnicoMin ?? "?"} min. INICIAR PREPARO.`
              : null}
            {estado.nivel === "atencao"
              ? `⚠️ ATENÇÃO — faltam ${formatarMinutosProducao(estado.restanteMin)} para o limite.`
              : null}
            {estado.nivel === "risco"
              ? `🚨 RISCO DE ATRASO — restante ${formatarMinutosProducao(estado.restanteMin)}, estimado ${calc?.tecnicoMin ?? "?"} min.`
              : null}
            {estado.nivel === "atrasado"
              ? `🔴 ATRASADO ${formatarMinutosProducao(estado.restanteMin)}.`
              : null}
          </p>
        ) : null}

        {FLAGS_INTEGRACAO.consumo && (reservasPorPedido.get(String(p.id))?.length ?? 0) > 0 ? (
          <details className="mt-2 rounded-lg border border-[#2A2721] bg-[#17150F] p-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-[#C9C2B8]">
              Retirada fisica do freezer ({reservasPorPedido.get(String(p.id))!.length} produto(s))
            </summary>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Registre SOMENTE o que saiu fisicamente. O restante continua reservado e o pedido nao
              muda de status por esta acao.
            </p>
            <div className="mt-2 space-y-2">
              {reservasPorPedido
                .get(String(p.id))!
                .filter((r) => r.restante > 0)
                .map((r) => (
                  <RetiradaReserva key={r.id} reserva={r} onAtualizado={recarregarReservas} />
                ))}
            </div>
          </details>
        ) : null}

        {/* Acoes de preparo/finalizacao (destaque total, como na referencia) */}
        <div className="mt-2.5 flex flex-col gap-1.5">
          {p.status === "recebido" ? (
            <Button
              size="sm"
              onClick={() => mudarStatus(p, "em_producao", "produzindo")}
              className="erp-btn-gold h-11 w-full border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-sm font-bold text-[#14120C] hover:brightness-105"
            >
              ▶ Iniciar preparo
            </Button>
          ) : null}
          {p.status === "em_producao" ? (
            <Button
              size="sm"
              onClick={() => mudarStatus(p, "pronto", "finalizado", { conferir: true })}
              className="h-11 w-full border border-[#5B93F5] bg-gradient-to-b from-[#5B93F5] to-[#2F62C8] text-sm font-bold text-white hover:brightness-105"
            >
              ✓ Finalizar
            </Button>
          ) : null}
          {pronto && !retirada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => avisarCaixa(p)}
              disabled={!p.conferido_em}
              className="erp-btn-gold h-11 w-full border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-sm font-bold text-[#14120C] hover:brightness-105 disabled:opacity-45"
            >
              🔔 Avisar caixa
            </Button>
          ) : null}
          {pronto && retirada ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => liberarRetirada(p)}
              disabled={!p.conferido_em}
              className="h-11 w-full border border-[#35C97C] bg-gradient-to-b from-[#35C97C] to-[#1E8F58] text-sm font-bold text-white hover:brightness-105 disabled:opacity-45"
            >
              🏪 Liberar retirada
            </Button>
          ) : null}
          {pronto && !p.conferido_em ? (
            <p className="rounded-lg border border-[#F5B301]/35 bg-[#F5B301]/10 px-2 py-1.5 text-[11px] text-[#F5B301]">
              ⚠️ Conferência pendente — conclua a conferência final para liberar.
            </p>
          ) : null}
          {p.conferido_em ? (
            <p className="text-[11px] text-muted-foreground">
              ✅ Conferido em {hora(p.conferido_em)}
            </p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => imprimirDireto(p)}
            className="h-8 w-full px-2 text-[11px] text-[#C9C2B8] hover:bg-[#F2CE6B]/12 hover:text-[#F2CE6B]"
          >
            <Printer className="mr-1 size-4" /> Imprimir
          </Button>
        </div>
      </article>
    );
  }

  function recarregarReservas() {
    queryClient.invalidateQueries({ queryKey: ["producao-reservas"] });
    queryClient.invalidateQueries({ queryKey: ["producao-consumos"] });
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
  }

  /** Registro de auditoria idempotente (mesma chave usada pelo app). */
  async function registrarAvisoInterno(p: any, canal: string) {
    try {
      const dia = new Date().toISOString().slice(0, 10);
      await supabase
        .from("notificacoes_log")
        .upsert(
          [
            {
              pedido_id: p.id,
              status: "pronto",
              canal,
              resultado: "enviado",
              mensagem: null,
              telefone_norm: null,
              idempotencia: chaveAviso(p.id, canal as "caixa" | "retirada", dia),
              created_by: user?.id ?? null,
            },
          ],
          { onConflict: "idempotencia", ignoreDuplicates: true },
        );
    } catch {
      /* auditoria e best-effort (tabela pode nao existir) */
    }
  }

  /**Ja existe aviso deste tipo para este pedido? (evita duplicidade) */
  async function jaAvisado(tipo: string, link: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from("notificacoes")
        .select("id")
        .eq("tipo", tipo)
        .eq("link", link)
        .limit(1);
      return (data ?? []).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * "Avisar caixa" (entrega pronta e conferida): avisa a Central de Pedidos
   * e registra o aviso. O pedido segue "pronto" — nao entra em motoboy.
   */
  async function avisarCaixa(p: any) {
    const chk = elegivelAvisoCaixa(p);
    if (!chk.elegivel) {
      toast.error(
        chk.motivo === "conferencia pendente"
          ? "Conferência pendente: conclua a conferência final antes de avisar o caixa."
          : "Só é possível avisar o caixa com o pedido pronto e conferido.",
      );
      return;
    }
    const link = linkAviso(p.id);
    if (await jaAvisado(TIPO_AVISO_CAIXA, link)) {
      toast.info("O caixa já foi avisado deste pedido.");
      return;
    }
    if (preview) {
      toast.info("Prévia visual: aviso de caixa desativado (nada é gravado).");
      return;
    }
    const { error } = await supabase
      .from("notificacoes")
      .insert(avisoInterno(p, "caixa"));
    if (error) {
      toast.error(error.message || "Não foi possível avisar o caixa.");
      return;
    }
    await registrarAvisoInterno(p, "caixa");
    toast.success("Caixa avisado. O pedido segue disponível na Central de Entregas.");
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
    queryClient.invalidateQueries({ queryKey: ["op-avisos"] });
  }

  /**
   * "Liberar retirada" (retirada pronta e conferida): libera para o balcao e
   * avisa a Central. O status permanece "pronto" (= Pronto para retirada);
   * nunca vira `aguardando_motoboy` nem `entregue`, e a confirmacao da
   * retirada (retirado_em) continua valendo.
   */
  async function liberarRetirada(p: any) {
    const chk = elegivelLiberacaoRetirada(p);
    if (!chk.elegivel) {
      toast.error(
        chk.motivo === "conferencia pendente"
          ? "Conferência pendente: conclua a conferência final antes de liberar a retirada."
          : chk.motivo === "retirada ja confirmada"
            ? "A retirada deste pedido já foi confirmada."
            : "Só é possível liberar a retirada com o pedido pronto e conferido.",
      );
      return;
    }
    const link = linkAviso(p.id);
    if (await jaAvisado(TIPO_AVISO_RETIRADA, link)) {
      toast.info("Este pedido já foi liberado para retirada.");
      return;
    }
    if (preview) {
      toast.info("Prévia visual: liberação de retirada desativada (nada é gravado).");
      return;
    }
    const { error } = await supabase
      .from("notificacoes")
      .insert(avisoInterno(p, "retirada"));
    if (error) {
      toast.error(error.message || "Não foi possível liberar a retirada.");
      return;
    }
    await registrarAvisoInterno(p, "retirada");
    toast.success("Retirada liberada no balcão. O cliente ainda confirma a retirada.");
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
    queryClient.invalidateQueries({ queryKey: ["op-avisos"] });
  }

  async function mudarStatus(
    pedido: any,
    status: OrderStatus,
    producao_status: ProdStatus,
    opts?: { conferir?: boolean },
  ) {
    if (preview) {
      toast.info("Prévia visual: alteração de status desativada (nada é gravado).");
      return;
    }
    // "Iniciar preparo" NÃO registra retirada física. Um clique no inicio do
    // preparo nao prova que o pedido inteiro saiu do freezer. A retirada
    // parcial tem uma acao explicita propria (detalhes "Retirada fisica do
    // freezer", acima), que chama a 0091 com quantidade. O layout K7.2
    // permanece intacto; a reserva continua ativa ate a retirada real.
    // "Finalizar" = conferencia final da cozinha + pedido pronto.
    // O marcador canônico do projeto é pedidos.conferido_em ("conferencia
    // final da cozinha", migration 0084) e nao altera status por si so.
    const campos: Record<string, unknown> = { status, producao_status };
    if (opts?.conferir) {
      campos["conferido_em"] = new Date().toISOString();
      campos["conferido_por"] = user?.id ?? null;
      if (status === "pronto") campos["pronto_em"] = new Date().toISOString();
    }
    const { error } = await supabase
      .from("pedidos")
      .update(campos)
      .eq("id", pedido.id);
    if (error) {
      console.error("Erro ao atualizar status do pedido:", error);
      toast.error(error.message || "Não foi possível atualizar o pedido.");
      return;
    }
    void notificarPedido({
      client: supabase,
      pedidoId: pedido.id,
      status,
      telefone: pedido.telefone,
      mensagem: mensagemStatus(status, pedido.cliente_nome, pedido.numero),
    });
    try {
      await supabase
        .from("pedido_status_historico")
        .insert({ pedido_id: pedido.id, de_status: pedido.status, para_status: status });
    } catch {
      /* sem migration — segue */
    }
    if (status === "em_producao") {
      try {
        const itens = (pedido.pedido_itens ?? []).map((i: any) => ({
          quantidade: Number(i.quantidade ?? 0),
          seg50: i.produtos?.tempo_fritura_s ?? null,
        }));
        const totalUn = itens.reduce((s: number, i: { quantidade: number }) => s + i.quantidade, 0);
        await supabase.from("fila_fritura").insert({
          pedido_id: pedido.id,
          quantidade: totalUn,
          tempo_est_s: tempoFrituraPedido(itens),
          status: "aguardando",
        });
      } catch {
        /* sem migration — segue */
      }
    }
    // Fase A: evita spam de cupom mínimo a cada troca de status.
    // O cupom completo já entra na fila no checkout; aqui só reimprime
    // automaticamente ao entrar em produção ou ficar pronto (use os
    // botões manuais para os demais casos).
    if (status === "em_producao" || status === "pronto") {
      // E9.1: trava de reenvio + uuid determinístico por evento (flag E6);
      // desligada = legado (uuid com timestamp). Conflito = já enfileirado.
      const chaveFila = `${pedido.id}:${status}`;
      if (filaEmVoo.has(chaveFila)) return;
      filaEmVoo.add(chaveFila);
      try {
        const linha = {
          trabalho_uuid: E6_IMPRESSAO_ATIVA ? chaveFila : `${chaveFila}:${Date.now()}`,
          pedido_id: pedido.id,
          tipo: "pedido",
          payload: `NEIA SALGADOS\nPEDIDO #${pedido.numero}\nSTATUS ${status}`,
          impressora: "Tanca TP-550",
        };
        if (E6_IMPRESSAO_ATIVA) {
          const { data, error } = await supabase
            .from("fila_impressao")
            .upsert(linha, { onConflict: "trabalho_uuid", ignoreDuplicates: true })
            .select("id");
          if (error) throw error;
          if (!data || data.length === 0) {
            toast.info("Comanda deste evento já está na fila (sem duplicar).");
          }
        } else {
          const { error } = await supabase.from("fila_impressao").insert(linha);
          if (error) throw error;
        }
      } catch {
        /* fila opcional */
      } finally {
        filaEmVoo.delete(chaveFila);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
  }

  async function imprimirDireto(pedido: any) {
    if (preview) {
      toast.info("Prévia visual: impressão desativada (nada é enviado à impressora).");
      return;
    }
    try {
      await impressaoDireta(supabase, pedido);
      toast.success(`Pedido nº ${pedido.numero} enviado para a Tanca.`);
    } catch {
      toast.error("Não entrou na fila. Confira em /impressao.");
    }
  }

  async function imprimirFicha() {
    try {
      await fichaDireta(
        supabase,
        consolidado.map((c) => ({ nome: c.nome, qtd: c.total })),
      );
      toast.success("Ficha enviada para a Tanca.");
    } catch {
      toast.error("Não entrou na fila. Confira em /impressao.");
    }
  }

  function bip(freq = 880) {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.4);
    } catch {
      /* sem áudio — mantém alerta visual */
    }
  }

  // Alertas sonoros (sem repetir): novo + hora de preparar + risco + atraso + pronto.
  // Reutiliza bip()/SONS_COZINHA/filtrarNovos; reavalia a cada tick do relógio.
  // O snapshot atualiza em toda avaliação (mesmo com som desligado): o bip de
  // pronto dispara só para transição observada ao vivo — nunca retroativo,
  // nunca repetido (dedup `pronto:<id>` + snapshot).
  useEffect(() => {
    const vistos = statusAnteriores.current;
    const primeiraLeitura = vistos.size === 0;
    const transicoesPronto = new Map<string, string>();
    for (const p of (pedidos ?? []) as any[]) {
      const antes = vistos.get(p.id);
      if (!primeiraLeitura && antes !== undefined && antes !== "pronto" && p.status === "pronto") {
        transicoesPronto.set(p.id, p.created_at);
      }
      vistos.set(p.id, p.status);
    }
    if (!sonsAtivos || !pedidos) return;
    const eventos: AlertaSonoro[] = [];
    for (const p of (pedidos ?? []) as any[]) {
      if (p.status === "recebido") {
        eventos.push({ id: `novo:${p.id}`, tipo: "novo_pedido", em: p.created_at });
      }
      if (p.status === "recebido" || p.status === "em_producao") {
        const nivel = estadoDe(p).nivel;
        if (nivel === "hora-preparar") {
          eventos.push({ id: `hora:${p.id}`, tipo: "inicio_preparacao", em: p.created_at });
        } else if (nivel === "risco") {
          eventos.push({ id: `risco:${p.id}`, tipo: "pedido_urgente", em: p.created_at });
        } else if (nivel === "atrasado") {
          eventos.push({ id: `atraso:${p.id}`, tipo: "pedido_atrasado", em: p.created_at });
        }
      }
    }
    for (const [id, em] of transicoesPronto) {
      eventos.push({ id: `pronto:${id}`, tipo: "pedido_pronto", em });
    }
    const novos = filtrarNovos(eventos, tocados);
    if (novos.length > 0) {
      const FREQ: Record<string, number> = {
        novo_pedido: 880,
        inicio_preparacao: 660,
        pedido_urgente: 440,
        pedido_atrasado: 330,
        pedido_pronto: 880,
      };
      const tipos = new Set(novos.map((n) => n.tipo));
      if (tipos.has("pedido_atrasado")) bip(FREQ["pedido_atrasado"] ?? 880);
      else if (tipos.has("pedido_urgente")) bip(FREQ["pedido_urgente"] ?? 880);
      else if (tipos.has("pedido_pronto") || tipos.has("novo_pedido")) bip();
      else if (tipos.has("inicio_preparacao")) bip(FREQ["inicio_preparacao"] ?? 880);
      else bip();
      setTocados((s) => new Set([...s, ...novos.map((n) => n.id)]));
      const qtdNovos = novos.filter((n) => n.tipo === "novo_pedido").length;
      const qtdRisco = novos.filter(
        (n) => n.tipo === "pedido_urgente" || n.tipo === "pedido_atrasado",
      ).length;
      const qtdProntos = novos.filter((n) => n.tipo === "pedido_pronto").length;
      if (qtdNovos > 0) toast.warning(`${qtdNovos} novo(s) pedido(s)!`);
      if (qtdRisco > 0) toast.error(`${qtdRisco} pedido(s) em risco/atraso!`);
      if (qtdProntos > 0) toast.success(`${qtdProntos} pedido(s) pronto(s)! 🔊`);
      if (qtdNovos === 0 && qtdRisco === 0 && qtdProntos === 0)
        toast.warning("Hora de preparar pedido(s)!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify((pedidos ?? []).map((p: any) => p.id + p.status)),
    sonsAtivos,
    Math.floor(agora.getTime() / 30000),
  ]);

  if (roles && !autorizado) {
    return (
      <p className="p-10 text-center text-muted-foreground">
        Você não tem acesso ao painel de Preparo.
      </p>
    );
  }

  return (
    <AdminShell
      aba="producao"
      onAba={() => {}}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ["fila-producao"] })}
      usuario={user?.email ?? null}
      modoPreview={preview}
      onSair={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Produção"
        onVoltar={() => navigate({ to: roles?.includes("admin") ? "/admin" : "/central-entregas" })}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="px-3 py-3">
        {/* Cabecalho do modulo (padrao da referencia) */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4A94A] bg-[#121110] px-4 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
              <ChefHat className="size-4 text-[#F2CE6B]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide text-foreground">
                Produção — Cozinha
              </h1>
              <p className="text-xs text-muted-foreground">
                Pedidos organizados por status, com prioridades e tempo de preparo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#35C97C]/55 bg-[#35C97C]/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#35C97C]">
              <span className="size-1.5 rounded-full bg-[#35C97C]" aria-hidden />
              Cozinha
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Em operação</span>
          </div>
        </section>

        {/* Kanban de produção — 3 colunas obrigatórias (especificação):
              A FAZER (prioridade/aguardando/agendados) • EM PREPARO • PRONTO */}
        <div className="mt-4 grid gap-3 lg:grid-cols-3" aria-label="Kanban de produção">
          <div id="sec-fazer" className="min-w-0">
            <KanbanColumn
              titulo="A Fazer"
              contador={filaFazer.length}
              cor={ERP_COLORS.orange}
              icone={AlarmClock}
              className="min-h-[480px]"
            >
              {filaFazer.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum pedido na fila.
                </p>
              ) : (
                filaFazer.map((p: any) =>
                  cardPedido(p, { cor: ERP_COLORS.orange, coluna: "fazer" }),
                )
              )}
            </KanbanColumn>
          </div>
          <div id="sec-preparo" className="min-w-0">
            <KanbanColumn
              titulo="Em Preparo"
              contador={preparoLista.length}
              cor={ERP_COLORS.blue}
              icone={UtensilsCrossed}
              className="min-h-[480px]"
            >
              {preparoLista.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Nada em preparo agora.
                </p>
              ) : (
                preparoLista.map((p: any) =>
                  cardPedido(p, { cor: ERP_COLORS.blue, coluna: "preparo" }),
                )
              )}
            </KanbanColumn>
          </div>
          <div id="sec-prontos" className="min-w-0">
            <KanbanColumn
              titulo="Pronto"
              contador={prontosEntrega.length + prontosRetirada.length}
              cor={ERP_COLORS.green}
              icone={CircleCheck}
              className="min-h-[480px]"
            >
              {[...prontosEntrega, ...prontosRetirada].length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum pedido pronto.
                </p>
              ) : (
                [...prontosEntrega, ...prontosRetirada].map((p: any) =>
                  cardPedido(p, { cor: ERP_COLORS.green, coluna: "pronto" }),
                )
              )}
            </KanbanColumn>
          </div>
        </div>

        {/* Detalhes da operacao (secundario, recolhivel) */}
        <details className="group mt-4 overflow-hidden rounded-2xl border border-[#D4A94A] bg-[#121110] shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-[#17150F]">
            <span className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
              <ChevronRight
                className="size-4 text-[#F2CE6B] transition-transform group-open:rotate-90"
                aria-hidden
              />
              Operação em detalhes
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              totais do dia, consolidado, listas e filtros
            </span>
          </summary>
          <div className="border-t border-[#D4A94A]/35 p-3 sm:p-4">
            <div className="relative min-h-36 overflow-hidden rounded-xl shadow-[var(--shadow-card)]">
              <img
                src={fritos}
                alt="Produção Néia"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent" />
              <div className="relative flex items-center gap-3 p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#D9B25E] to-[#C49A43] text-[#202B3A]">
                  <ChefHat className="size-7" aria-hidden />
                </span>
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    Despache (Produção)
                  </h1>
                  <p className="text-sm text-white/80">
                    Acompanhe e organize a produção dos pedidos.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatusCard
                className="border border-[#D4A94A] bg-[#1A1712] text-[#F4F1EA]"
                corIcone="#F2CE6B"
                corValor="#F2CE6B"
                icone={Clock}
                titulo="Em Produção"
                valor={preparoLista.length}
                onClick={() => rolarPara("sec-preparo")}
              />
              <StatusCard
                className="border border-[#D4A94A] bg-[#1A1712] text-[#F4F1EA]"
                corIcone="#35C97C"
                corValor="#35C97C"
                icone={CheckCircle2}
                titulo="Prontos p/ Despache"
                valor={prontosEntrega.length + prontosRetirada.length}
                onClick={() => rolarPara("sec-prontos")}
              />
              <StatusCard
                className="border border-[#D4A94A] bg-[#1A1712] text-[#F4F1EA]"
                corIcone="#5B93F5"
                corValor="#5B93F5"
                icone={Clock}
                titulo="Aguardando"
                valor={aguardandoLista.length}
                onClick={() => rolarPara("sec-fazer")}
              />
              <StatusCard
                className="border border-[#D4A94A] bg-[#1A1712] text-[#F4F1EA]"
                corIcone="#A78BFA"
                corValor="#A78BFA"
                icone={Truck}
                titulo="Despachados hoje"
                valor={despachadosHoje.length}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section
                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                aria-label="Produção do dia"
              >
                <h2 className="text-sm font-bold">Produção do Dia</h2>
                <div className="mt-2 flex items-center gap-4">
                  <DonutChart
                    pct={pctProntos}
                    cor="#35C97C"
                    rotulo="Prontos"
                    sub={`${prontosCount} de ${totalDia} no fluxo`}
                  />
                  <ul className="flex-1 space-y-1 text-sm">
                    <li className="flex justify-between">
                      <span>🔵 Em produção</span>
                      <b>{preparoLista.length}</b>
                    </li>
                    <li className="flex justify-between">
                      <span>🟡 Aguardando</span>
                      <b>{aguardandoLista.length}</b>
                    </li>
                    <li className="flex justify-between">
                      <span>🟢 Prontos</span>
                      <b>{prontosCount}</b>
                    </li>
                    <li className="flex justify-between">
                      <span>🟣 Despachados hoje</span>
                      <b>{despachadosHoje.length}</b>
                    </li>
                  </ul>
                </div>
              </section>
              <section
                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                aria-label="Produtos mais produzidos"
              >
                <h2 className="text-sm font-bold">Produtos Mais Produzidos</h2>
                {topProduzidos.length > 0 ? (
                  <ol className="mt-2 space-y-1">
                    {topProduzidos.map((t, i) => (
                      <li key={t.nome} className="flex items-center gap-2 rounded-lg px-1 py-1">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#C49A43] text-[11px] font-bold text-[#202B3A]">
                          {i + 1}
                        </span>
                        <img
                          src={t.img}
                          alt=""
                          className="size-9 shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-xs font-semibold">{t.nome}</p>
                          <p className="text-[11px] text-muted-foreground">{t.total} un.</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-2">
                    <EmptyState titulo="Nada em produção" />
                  </div>
                )}
              </section>
            </div>

            <section
              className="mt-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
              aria-label="Pedidos em produção"
            >
              <h2 className="text-sm font-bold">Pedidos em Produção</h2>
              {preparoLista.length > 0 ? (
                <ul className="mt-1 divide-y divide-border">
                  <li className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground sm:grid-cols-[64px_1fr_64px_64px_110px_24px]">
                    <span>Nº</span>
                    <span>Cliente</span>
                    <span>Itens</span>
                    <span className="hidden sm:block">Tempo</span>
                    <span className="hidden sm:block">Status</span>
                    <span />
                  </li>
                  {preparoLista.slice(0, 6).map((p: any) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => rolarPara("sec-preparo")}
                        className="grid min-h-[44px] w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-1 py-1.5 text-left text-xs hover:bg-muted sm:grid-cols-[64px_1fr_64px_64px_110px_24px] sm:text-[13px]"
                      >
                        <span className="font-bold">#{p.numero}</span>
                        <span className="truncate">{p.cliente_nome}</span>
                        <span className="text-muted-foreground">
                          {(p.pedido_itens ?? []).reduce(
                            (s: number, i: any) => s + (Number(i.quantidade) || 0),
                            0,
                          )}{" "}
                          un.
                        </span>
                        <span className="hidden text-muted-foreground sm:block">
                          {elapsedMin(p.created_at)} min
                        </span>
                        <span className="hidden sm:block">
                          <StatusBadge status={p.status} />
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <EmptyState titulo="Nada em preparo agora" />
                </div>
              )}
            </section>

            <PageHeader
              titulo="Painel de Preparo"
              descricao={
                <>
                  {isLoading
                    ? "Carregando fila..."
                    : `${pedidos?.length ?? 0} na fila • ${aguardandoLista.length} novos • ${produzindo} em preparo • ${prontos} prontos • ${atrasadosQtd} em risco/atraso • ${proximosLista.length} agendados`}
                  <span className="mt-1 block text-xs">
                    🔥 Fritadeiras em uso: {fritEmUso}/{MOTOR_PRODUCAO_CONFIG.maxFritadeiras}
                    {` • 🥐 Forno: ${fornoEmUso ? "em uso" : "livre"}`}
                    {" • O sabor que faz a diferença."}
                  </span>
                </>
              }
            />

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
              <div className="space-y-1">
                <Label htmlFor="dia-producao">Data de referência</Label>
                <Input
                  id="dia-producao"
                  type="date"
                  value={diaFiltro}
                  onChange={(e) => setDiaFiltro(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  checked={incluirProntos}
                  onChange={(e) => setIncluirProntos(e.target.checked)}
                />{" "}
                Incluir prontos
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  checked={sonsAtivos}
                  onChange={(e) => {
                    setSonsAtivos(e.target.checked);
                    if (e.target.checked) bip();
                  }}
                />{" "}
                Ativar sons
              </label>
              <Button size="sm" variant="outline" onClick={() => bip()}>
                Testar som
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Som + impressão têm eventos independentes. Sem repetir após reload.
              </p>
            </div>

            <section
              className="mt-4 rounded-xl border border-border bg-card p-4"
              aria-label="Consolidação"
            >
              <h2 className="font-display text-xl">
                Salgados consolidados — {totalGeral} un no total
              </h2>
              {consolidado.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nada a preparar.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {consolidado.map((c) => (
                    <li key={c.nome} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.nome}</span>
                        <span className="ml-auto font-display text-primary">{c.total} un</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Pendente: {c.pendente} • Em preparo: {c.emProducao} • Pronto: {c.pronto}
                      </p>
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground underline">
                          Ver pedidos ({c.pedidos.length})
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {c.pedidos.map((pp, idx) => (
                            <li key={idx}>
                              Pedido #{pp.numero} — {pp.cliente} — {pp.qtd}un — {pp.status}
                              {pp.agendado
                                ? ` — agendado ${new Date(pp.agendado).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="outline" className="mt-3" onClick={imprimirFicha}>
                <Printer className="mr-1 size-4" /> Imprimir ficha direto
              </Button>
            </section>

            <section
              className="mt-4 rounded-xl border border-border bg-card p-4"
              aria-label="Previsão"
            >
              <h2 className="font-display text-xl">Previsão de preparo (estimativa)</h2>
              <p className="text-xs text-muted-foreground">
                Média histórica do dia da semana (90 dias). Estimativa ≠ pedido real.
              </p>
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {DOW.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDowPrevisao(i)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${dowPrevisao === i ? "bg-primary text-primary-foreground" : "bg-card"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {nomesPrevisao.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Sem histórico para {DOW[dowPrevisao]}.
                </p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {nomesPrevisao.map((nome) => {
                    const conf = consolidado.find((c) => c.nome === nome)?.total ?? 0;
                    const est = previsao.get(nome) ?? 0;
                    return (
                      <li key={nome} className="flex justify-between gap-2">
                        <span>{nome}</span>
                        <span className="text-muted-foreground">
                          Confirmado: <strong className="text-foreground">{conf}</strong> •
                          Estimado: +{est} • Planejado:{" "}
                          <strong className="text-primary">{conf + est}</strong>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {isLoading ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Carregando fila">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-xl border border-border bg-card p-4"
                  >
                    <div className="h-5 w-1/3 rounded bg-muted" />
                    <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
                    <div className="mt-3 h-3 w-full rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : null}

            {pedidosValidos.length === 0 ? (
              <EmptyState titulo="Nenhum pedido na fila para este filtro" />
            ) : null}
          </div>
        </details>
      </div>
    </AdminShell>
  );
}
