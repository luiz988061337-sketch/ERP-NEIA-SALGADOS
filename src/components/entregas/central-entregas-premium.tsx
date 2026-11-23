/**
 * CENTRAL DE ENTREGAS — ROTAS (layout premium grafite/dourado).
 *
 * Componente compartilhado entre /central-entregas (modo demonstração local)
 * e /preview/central-entregas-v2. Todos os dados são fictícios eLocais:
 * nenhuma rota é enviada, nenhum GPS ou notificação externa é acionado e
 * nenhuma gravação é feita no Supabase.
 */
import { EntregasResumo } from "./entregas-resumo";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  Edit,
  MapPin,
  Navigation,
  Package,
  Route as RouteIcon,
  Send,
  User,
  Users,
} from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

type Pedido = {
  id: string;
  numero: string;
  cliente: string;
  bairro: string;
  status: string;
  pagamento: string;
  prazo: string;
  conferido: boolean;
  agendado?: string;
  atrasado?: boolean;
};

type Motoboy = {
  id: string;
  nome: string;
  status: "disponível" | "indisponível" | "em rota";
  entregas: number;
};

type Rota = {
  id: string;
  codigo: string;
  motoboyId: string;
  pedidos: Pedido[];
  distanciaKm: number;
  etaMin: number;
  prazo: string;
  status: "Aguardando liberação" | "Em rota" | "Finalizada";
};

const MOTOBOYS_INICIAIS: Motoboy[] = [
  { id: "m1", nome: "Carlos", status: "disponível", entregas: 0 },
  { id: "m2", nome: "Bia", status: "em rota", entregas: 2 },
  { id: "m3", nome: "Diego", status: "indisponível", entregas: 0 },
  { id: "m4", nome: "Elisa", status: "disponível", entregas: 1 },
];

const ROTAS_INICIAIS: Rota[] = [
  {
    id: "rota-04",
    codigo: "ROTA 04 — CENTRO",
    motoboyId: "m1",
    distanciaKm: 7.2,
    etaMin: 28,
    prazo: "13:15",
    status: "Aguardando liberação",
    pedidos: [
      { id: "p1", numero: "#4598", cliente: "Ana Costa", bairro: "Centro", status: "Em produção", pagamento: "Pix pago", prazo: "12:30", conferido: false },
      { id: "p2", numero: "#4601", cliente: "Ricardo Souza", bairro: "Vila Marina", status: "Pronto", pagamento: "Pix pago", prazo: "13:00", conferido: true },
      { id: "p3", numero: "#4603", cliente: "Luciana Melo", bairro: "Centro", status: "Pronto", pagamento: "Cartão", prazo: "13:15", conferido: true },
    ],
  },
  {
    id: "rota-05",
    codigo: "ROTA 05 — VILA MARINA",
    motoboyId: "m2",
    distanciaKm: 5.8,
    etaMin: 22,
    prazo: "13:55",
    status: "Em rota",
    pedidos: [
      { id: "p4", numero: "#4604", cliente: "José Ribeiro", bairro: "Vila Marina", status: "Pronto", pagamento: "Pix pago", prazo: "13:40", conferido: true },
      { id: "p5", numero: "#4606", cliente: "Marta Nunes", bairro: "Vila Marina", status: "Pronto", pagamento: "Dinheiro", prazo: "13:55", conferido: true },
    ],
  },
  {
    id: "rota-06",
    codigo: "ROTA 06 — JARDIM",
    motoboyId: "m3",
    distanciaKm: 9.4,
    etaMin: 34,
    prazo: "14:20",
    status: "Aguardando liberação",
    pedidos: [
      { id: "p6", numero: "#4607", cliente: "Pedro Alves", bairro: "Jardim Sorocaba", status: "Aguardando conferência", pagamento: "Pix pago", prazo: "14:20", conferido: false },
    ],
  },
];

const AGUARDANDO_INICIAL: Pedido[] = [
  { id: "h1", numero: "#4610", cliente: "Fernanda Lima", bairro: "Centro", status: "Pronto", pagamento: "Pix pago", prazo: "14:00", conferido: true, agendado: "14:00" },
  { id: "h2", numero: "#4611", cliente: "Rafael Gomes", bairro: "Vila Marina", status: "Pronto", pagamento: "Cartão", prazo: "12:45", conferido: true, atrasado: true },
  { id: "h3", numero: "#4612", cliente: "Camila Souza", bairro: "Jardim", status: "Pronto", pagamento: "Pix pago", prazo: "14:30", conferido: true },
  { id: "h4", numero: "#4613", cliente: "Bruno Costa", bairro: "Centro", status: "Em produção", pagamento: "Dinheiro", prazo: "14:45", conferido: false, agendado: "14:30" },
  { id: "h5", numero: "#4614", cliente: "Lívia Mendes", bairro: "Vila Marina", status: "Pronto", pagamento: "Pix pago", prazo: "15:00", conferido: true },
];

const HISTORICO = [
  { hora: "12:05", rotulo: "Rota 03 — Centro entregue", detalhe: "3/3 entregas • motoboy Bia", tipo: "entrega" },
  { hora: "11:42", rotulo: "Atraso registrado — Pedido #4587", detalhe: "Trânsito • resolvido pela atendente", tipo: "ocorrencia" },
  { hora: "11:10", rotulo: "Rota 02 — Vila Marina finalizada", detalhe: "2/2 entregas • motoboy Carlos", tipo: "entrega" },
];

function classeStatus(status: string) {
  const s = status.toLowerCase();
  if (s.includes("atrasado")) return "border-red-700/50 bg-red-950/30 text-red-300";
  if (s.includes("aguardando liberação")) return "border-amber-700/50 bg-amber-950/30 text-amber-300";
  if (s.includes("produção") || s.includes("conferência")) return "border-orange-700/50 bg-orange-950/30 text-orange-300";
  if (s.includes("em rota")) return "border-blue-700/50 bg-blue-950/30 text-blue-300";
  if (s.includes("pronto") || s.includes("entregue") || s.includes("finalizada")) return "border-green-700/50 bg-green-950/30 text-green-300";
  if (s.includes("indisponível")) return "border-neutral-600/50 bg-neutral-800/40 text-neutral-300";
  return "border-[#D4A94A]/35 bg-[#17150F] text-[#F2CE6B]";
}

function corMotoboy(status: Motoboy["status"]) {
  if (status === "em rota") return "#5B93F5";
  if (status === "disponível") return "#35C97C";
  return "#8B8579";
}

/** Mapa vetorial demonstrativo — sem GPS, sem tiles externos. */
function MapaDemo({ rotas }: { rotas: Rota[] }) {
  const pontos = [
    { x: 150, y: 200, letra: "A", cor: "#22c55e" },
    { x: 260, y: 210, letra: "B", cor: "#eab308" },
    { x: 480, y: 150, letra: "C", cor: "#ef4444" },
  ];
  return (
    <div className="relative h-[340px] overflow-hidden rounded-xl border border-[#D4A94A]/20 bg-[#0b0a08]">
      <svg viewBox="0 0 600 360" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="rota-premium" x1="0" x2="1">
            <stop offset="0%" stopColor="#f2ce6b" />
            <stop offset="100%" stopColor="#d4a94a" />
          </linearGradient>
          <filter id="brilho-premium">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="600" height="360" fill="#0b0a08" />
        {Array.from({ length: 14 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 26} x2="600" y2={i * 26} stroke="#1f1c15" strokeWidth="1" />)}
        {Array.from({ length: 12 }).map((_, i) => <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="360" stroke="#1f1c15" strokeWidth="1" />)}
        <polyline points="80,260 150,200 260,210 340,160 480,150" fill="none" stroke="url(#rota-premium)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#brilho-premium)" />
        <circle cx="80" cy="260" r="14" fill="#1a1712" stroke="#D4A94A" strokeWidth="2.5" />
        <text x="80" y="265" textAnchor="middle" fill="#D4A94A" fontSize="11" fontWeight="800">LOJA</text>
        {pontos.map((p) => (
          <g key={p.letra}>
            <circle cx={p.x} cy={p.y} r="18" fill={p.cor} stroke="#fff" strokeWidth="3" />
            <text x={p.x} y={p.y + 5} textAnchor="middle" fill="#fff" fontWeight="900">{p.letra}</text>
          </g>
        ))}
      </svg>
      <div className="absolute left-3 top-3 rounded-md border border-[#D4A94A]/40 bg-black/75 px-2.5 py-1 text-[10px] tracking-wide">
        MAPA DEMONSTRATIVO — SEM GPS REAL
      </div>
      <div className="absolute bottom-3 right-3 rounded-md border border-[#D4A94A]/40 bg-black/75 px-2.5 py-1 text-[10px]">
        {rotas.length} rotas • 6 paradas
      </div>
    </div>
  );
}

export function CentralEntregasPremium({
  modoPreview = false,
}: {
  modoPreview?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pedidoParam = useMemo(() => {
    const busca = new URLSearchParams(location.searchStr ?? "");
    return busca.get("pedido") ?? "";
  }, [location.searchStr]);

  const [motoboys, setMotoboys] = useState<Motoboy[]>(MOTOBOYS_INICIAIS);
  const [rotas, setRotas] = useState<Rota[]>(ROTAS_INICIAIS);
  const [aguardando, setAguardando] = useState<Pedido[]>(AGUARDANDO_INICIAL);
  const [filtroMotoboy, setFiltroMotoboy] = useState("todos");
  const [motoboySelecionado, setMotoboySelecionado] = useState("m1");
  const [rotaAtivaId, setRotaAtivaId] = useState("rota-04");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [retiradaLiberada, setRetiradaLiberada] = useState(false);
  const [abaHistorico, setAbaHistorico] = useState(false);

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const rotaAtiva = rotas.find((r) => r.id === rotaAtivaId) ?? rotas[0];
  const motoboyDaRota = motoboys.find((m) => m.id === rotaAtiva?.motoboyId);
  const todasProntas = rotaAtiva?.pedidos.every((p) => p.status === "Pronto" && p.conferido) ?? false;
  const podeEnviar = Boolean(retiradaLiberada && todasProntas && motoboyDaRota?.status === "disponível");

  const destaque = pedidoParam
    ? aguardando.find((p) => p.id === pedidoParam) ?? aguardando[0]
    : null;

  function ir(v: string) {
    if (v === "dashboard") navigate({ to: "/admin" });
    else if (v === "pedidos") navigate({ to: "/preview-l2-atendente" });
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) => atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);
  }

  function selecionarMotoboy(id: string) {
    setMotoboySelecionado(id);
    const m = motoboys.find((x) => x.id === id);
    toast.info(`Motoboy ${m?.nome ?? ""} selecionado para a rota (simulação).`);
  }

  function adicionarPedidos() {
    if (selecionados.length === 0) {
      toast.info("Selecione ao menos um pedido aguardando.");
      return;
    }
    const motoboy = motoboys.find((m) => m.id === motoboySelecionado);
    if (!motoboy || motoboy.status !== "disponível") {
      toast.error("Selecione um motoboy disponível.");
      return;
    }
    const capacidade = 3 - motoboy.entregas - (rotaAtiva?.pedidos.length ?? 0);
    if (capacidade <= 0 || selecionados.length > capacidade) {
      toast.error("Limite operacional de até 3 entregas por motoboy.");
      return;
    }
    const novos = aguardando.filter((p) => selecionados.includes(p.id));
    const semDuplicatas = novos.filter((p) => !rotas.some((r) => r.pedidos.some((x) => x.id === p.id)));
    setRotas((atual) => atual.map((r) => r.id === rotaAtivaId ? { ...r, pedidos: [...r.pedidos, ...semDuplicatas] } : r));
    setAguardando((atual) => atual.filter((p) => !selecionados.includes(p.id)));
    setSelecionados([]);
    toast.success(`${semDuplicatas.length} pedido(s) adicionado(s) à rota — somente nesta simulação.`);
  }

  function montarRota() {
    toast.info("Rota montada com os pedidos disponíveis (simulação local, nada gravado).");
  }

  function enviarRota() {
    if (!podeEnviar) {
      toast.error("A rota só pode iniciar após liberação e confirmação da retirada.");
      return;
    }
    toast.success("Envio simulado com sucesso — nenhuma notificação real foi disparada.");
  }

  const motoboysFiltrados = filtroMotoboy === "todos"
    ? motoboys
    : motoboys.filter((m) => m.id === filtroMotoboy);

  return (
    <AdminShell
      aba="central"
      onAba={ir}
      onRefresh={() => toast.info("Dados demonstrativos atualizados.")}
      usuario="demonstracao@neiasalgados.local"
      modoPreview={modoPreview}
      onSair={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      <div className="l1b-deliveries min-h-screen bg-background p-3 sm:p-4">
        <div className="mx-auto max-w-[1400px]">
          {modoPreview ? (
            <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
              PRÉVIA — Central de Entregas Rotas. Dados demonstrativos locais, sem gravação.
            </p>
          ) : null}

          <EntregasResumo
            aguardando={aguardando.length}
            atribuidos={rotas.filter((r) => r.status !== "Em rota" && r.status !== "Finalizada").reduce((total, rota) => total + rota.pedidos.length, 0)}
            emRota={rotas.filter((r) => r.status === "Em rota").reduce((total, rota) => total + rota.pedidos.length, 0)}
            entregues={12}
            disponiveis={motoboys.filter((m) => m.status === "disponível").length}
            acoes={<span className="rounded-full border border-[#D4A94A]/40 bg-[#141310] px-4 py-2 text-sm">Hoje, {hoje} · Dados demonstrativos</span>}
          />

          {destaque ? (
            <div className="mt-3 rounded-xl border border-[#D4A94A] bg-[#F2CE6B]/10 px-4 py-3 text-sm">
              <b className="text-[#F2CE6B]">Pedido {destaque.numero} destacado</b>
              <span className="text-[#C9C2B8]"> — veio da Central da Atendente. {destaque.cliente} • cliente até {destaque.prazo}. Seleção demonstrativa, sem persistência.</span>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
            <section className="rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 shadow-[inset_0_1px_0_0_rgba(212,169,74,0.15)] xl:col-span-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="rounded-full border border-[#D4A94A] px-4 py-1.5 text-sm font-extrabold tracking-wide">
                  {rotaAtiva?.codigo ?? "ROTA 04 — CENTRO"}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1"><Clock className="size-3 text-[#F2CE6B]" /> ETA: {rotaAtiva?.etaMin ?? 28} min</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3 text-[#F2CE6B]" /> {(rotaAtiva?.distanciaKm ?? 7.2).toFixed(1)} km</span>
                </div>
              </div>

              <MapaDemo rotas={rotas} />

              <div className="mt-3 grid grid-cols-3 gap-3">
                {(rotaAtiva?.pedidos ?? []).slice(0, 3).map((p, i) => (
                  <div key={p.id} className="rounded-xl border border-[#D4A94A]/30 bg-[#141310] p-3">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center rounded-full border border-[#D4A94A]/40 bg-[#D4A94A]/15 font-bold text-[#F2CE6B]">
                        {String.fromCharCode(65 + i)}
                      </div>
                      <div className="text-sm font-extrabold">{p.numero}</div>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{p.cliente}</div>
                    <div className="mt-2 text-[11px] font-bold text-[#F2CE6B]">Cliente até {p.prazo}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 shadow-[inset_0_1px_0_0_rgba(212,169,74,0.15)] xl:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-xl font-extrabold tracking-tight">{rotaAtiva?.codigo ?? "Rota 04"}</div>
                <div className="rounded-full border border-[#D4A94A] px-3 py-1 text-[11px] font-bold">
                  {rotaAtiva?.pedidos.length ?? 0} PEDIDOS
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="grid size-14 place-items-center rounded-2xl border border-[#D4A94A]/50 bg-[#D4A94A]/10 text-[#F2CE6B]">
                  <User className="size-7" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#F2CE6B]/70">Motoboy</div>
                  <div className="text-lg font-extrabold">{motoboyDaRota?.nome ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{motoboyDaRota?.status ?? "—"} • até 3 entregas</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="mb-1 text-[11px] uppercase text-muted-foreground">Status</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${classeStatus(rotaAtiva?.status ?? "")}`}>
                    {rotaAtiva?.status ?? "—"}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {(rotaAtiva?.pedidos ?? []).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#D4A94A]/30 bg-[#141310] p-3">
                    <div className="grid size-10 place-items-center rounded-lg border border-[#D4A94A]/40 bg-[#D4A94A]/10 text-[#F2CE6B]"><Package className="size-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">Pedido {p.numero}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.cliente} • {p.bairro}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${classeStatus(p.status)}`}>{p.status}</span>
                  </div>
                ))}
              </div>

              {!todasProntas ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                  <AlertTriangle className="size-4" /> Pedido ainda em produção/sem conferência — liberar rota somente quando todos estiverem prontos.
                </div>
              ) : null}
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-[#D4A94A]/30 bg-[#141310] p-3 text-xs">
                <input type="checkbox" checked={retiradaLiberada} onChange={(e) => setRetiradaLiberada(e.target.checked)} className="accent-[#D4A94A]" />
                Retirada liberada e conferida na cozinha (regra obrigatória)
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button onClick={montarRota} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] text-sm font-bold text-[#F2CE6B] hover:bg-[#221D13]">
                  <RouteIcon className="size-4" /> Montar rota
                </button>
                <button onClick={adicionarPedidos} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] text-sm font-bold text-[#F2CE6B] hover:bg-[#221D13]">
                  <Package className="size-4" /> Adicionar pedido
                </button>
                <button onClick={() => selecionarMotoboy(motoboySelecionado)} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] text-sm font-bold text-[#F2CE6B] hover:bg-[#221D13]">
                  <Users className="size-4" /> Selecionar motoboy
                </button>
                <button onClick={() => toast.info("Sequência de paradas exibida no mapa ao lado (simulação).")} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] text-sm font-bold text-[#F2CE6B] hover:bg-[#221D13]">
                  <Navigation className="size-4" /> Ver rota
                </button>
                <button onClick={() => toast.info("Edição disponível na fase funcional (simulação).")} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D4A94A]/60 bg-[#1A170F] text-sm font-bold text-[#F2CE6B] hover:bg-[#221D13]">
                  <Edit className="size-4" /> Editar
                </button>
                <button
                  onClick={enviarRota}
                  disabled={!podeEnviar}
                  className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold ${podeEnviar ? "border border-[#D4A94A] bg-[#D4A94A] text-black shadow-[0_0_20px_rgba(212,169,74,0.35)]" : "cursor-not-allowed border border-[#D4A94A]/30 bg-[#D4A94A]/20 text-muted-foreground"}`}
                >
                  <Send className="size-4" /> Enviar rota
                </button>
              </div>
            </section>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold uppercase text-[#F2CE6B]">Pedidos aguardando e reservados</h2>
                <span className="rounded-full border border-[#D4A94A]/40 px-3 py-1 text-[11px]">{aguardando.length} pedidos</span>
              </div>
              <div className="space-y-2">
                {aguardando.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => alternarSelecao(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selecionados.includes(p.id) ? "border-[#F2CE6B] bg-[#F2CE6B]/10" : "border-[#D4A94A]/30 bg-[#141310] hover:border-[#D4A94A]/60"} ${destaque?.id === p.id ? "ring-2 ring-[#F2CE6B]/70" : ""}`}
                  >
                    <span className="grid size-9 place-items-center rounded-lg border border-[#D4A94A]/40 bg-[#D4A94A]/10 text-[#F2CE6B]"><Package className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{p.numero} • {p.cliente}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{p.bairro} • {p.pagamento}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                        {p.agendado ? <span className="rounded-full border border-sky-700/50 bg-sky-950/30 px-2 py-0.5 text-sky-300">AGENDADO {p.agendado}</span> : null}
                        {p.atrasado ? <span className="rounded-full border border-red-700/50 bg-red-950/30 px-2 py-0.5 text-red-300">ATRASADO</span> : null}
                        <span className="text-[#F2CE6B]">Cliente até {p.prazo}</span>
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${classeStatus(p.status)}`}>{p.status}</span>
                    {selecionados.includes(p.id) ? <CheckCircle2 className="size-4 text-[#F2CE6B]" /> : null}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold uppercase text-[#F2CE6B]">Motoboys</h2>
                <div className="flex items-center gap-2">
                  <label htmlFor="filtro-motoboy" className="text-[11px] text-muted-foreground">Filtrar:</label>
                  <select
                    id="filtro-motoboy"
                    value={filtroMotoboy}
                    onChange={(e) => setFiltroMotoboy(e.target.value)}
                    className="rounded-lg border border-[#D4A94A]/40 bg-[#17150F] px-2 py-1 text-xs text-[#F4F1EA]"
                  >
                    <option value="todos">Todos</option>
                    {motoboys.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                {motoboysFiltrados.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selecionarMotoboy(m.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${motoboySelecionado === m.id ? "border-[#F2CE6B] bg-[#F2CE6B]/10" : "border-[#D4A94A]/30 bg-[#141310]"}`}
                  >
                    <span className="grid size-10 place-items-center rounded-full text-sm font-bold text-[#14120C]" style={{ backgroundColor: corMotoboy(m.status) }}>
                      {m.nome.charAt(0)}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{m.nome}</span>
                      <span className="block text-[11px] text-muted-foreground">{m.entregas}/3 entregas</span>
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${classeStatus(m.status)}`}>{m.status}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Limite operacional: até 3 entregas por motoboy. Motoboy não precisa aceitar a rota.</p>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold uppercase text-[#F2CE6B]">Cartões de rotas</h2>
              <span className="rounded-full border border-[#D4A94A]/40 px-3 py-1 text-[11px]">{rotas.length} rotas</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {rotas.map((r) => {
                const m = motoboys.find((x) => x.id === r.motoboyId);
                return (
                  <button
                    key={r.id}
                    onClick={() => setRotaAtivaId(r.id)}
                    className={`rounded-xl border p-4 text-left transition ${rotaAtivaId === r.id ? "border-[#F2CE6B] bg-[#F2CE6B]/10" : "border-[#D4A94A]/35 bg-[#141310] hover:border-[#D4A94A]/70"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-extrabold">{r.codigo}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${classeStatus(r.status)}`}>{r.status}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <User className="size-3 text-[#F2CE6B]" /> {m?.nome ?? "—"}
                      <span className="text-muted-foreground">• {m?.status ?? "—"}</span>
                    </div>
                    <div className="mt-2 text-xs text-[#C9C2B8]">
                      {r.pedidos.map((p, i) => (
                        <span key={p.id}>{i > 0 ? <ArrowRight className="inline size-3" /> : null} {p.numero}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#D4A94A]/20 pt-2 text-[11px]">
                      <span className="text-[#F2CE6B]">{r.distanciaKm.toFixed(1)} km • {r.etaMin} min</span>
                      <span className="text-muted-foreground">Prazo {r.prazo}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4">
            <button onClick={() => setAbaHistorico((v) => !v)} className="flex w-full items-center justify-between text-left">
              <h2 className="font-display text-lg font-bold uppercase text-[#F2CE6B]">Histórico de entregas e ocorrências</h2>
              <span className="text-xs text-muted-foreground">{abaHistorico ? "Recolher" : "Expandir"}</span>
            </button>
            {abaHistorico ? (
              <div className="mt-3 space-y-2">
                {HISTORICO.map((h) => (
                  <div key={h.hora} className="flex items-center gap-3 rounded-xl border border-[#D4A94A]/30 bg-[#141310] p-3">
                    <span className={`grid size-9 place-items-center rounded-lg ${h.tipo === "ocorrencia" ? "bg-red-950/30 text-red-300" : "bg-green-950/30 text-green-300"}`}>
                      {h.tipo === "ocorrencia" ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{h.rotulo}</span>
                      <span className="block text-[11px] text-muted-foreground">{h.detalhe}</span>
                    </span>
                    <span className="text-xs text-[#F2CE6B]">{h.hora}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
