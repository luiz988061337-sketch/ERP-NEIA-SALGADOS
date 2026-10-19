import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  alertaDe,
  dividirRota,
  emAtraso,
  localizacaoDesatualizada,
  podeAtribuir,
  podeCriarRota,
  pontuarDespacho,
  previsoesRota,
  proximoDoPrazo,
  reordenar,
  sugerirMotoboy,
  totaisRota,
  totalUnidades,
} from "@/lib/preview-central-entregas";
import type {
  AlertaEntrega,
  ColunaCentral,
  MotoboyCentral,
  OcorrenciaCentral,
  PedidoCentral,
  RotaDia,
  StatusMotoboy,
} from "@/lib/preview-central-entregas";
import {
  BarChart3,
  Bell,
  Bike,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Crosshair,
  Crown,
  DollarSign,
  Expand,
  History,
  Home,
  MapPin,
  Minus,
  Navigation,
  Package,
  Phone,
  Plus,
  Settings,
  ShoppingCart,
  TriangleAlert,
  UserCheck,
  Users,
  ChefHat,
  type LucideIcon,
} from "lucide-react";

/**
 * PREVIEW ONLY — Central de Entregas 2.0 (K8.1, layout aprovado em imagem).
 * Rota: /preview/central-entregas-v2. 100% fictício, estado local.
 * NÃO lê/escreve Supabase, NÃO usa GPS/mapas externos/Realtime,
 * NÃO altera /central-entregas, NÃO cria migration, NÃO faz commit/push/deploy.
 * Mapa é representação estática simulada (SVG próprio, sem tiles remotos).
 */

export const Route = createFileRoute("/preview/central-entregas-v2")({
  head: () => ({ meta: [{ title: "Preview — Central de Entregas 2.0" }] }),
  component: PreviewCentralEntregasV2,
});

const MIN = 60000;
const ENTREGUES_ANTERIORES = 18;

type TabSec = "visao" | "rotas" | "mapa" | "motoboys" | "historico" | "ocorrencias";

const NAV: Array<{ rotulo: string; icone: LucideIcon }> = [
  { rotulo: "Dashboard", icone: Home },
  { rotulo: "PDV", icone: ShoppingCart },
  { rotulo: "Produção", icone: ChefHat },
  { rotulo: "Entregas", icone: Bike },
  { rotulo: "Pedidos", icone: ClipboardList },
  { rotulo: "Cardápio", icone: BookOpen },
  { rotulo: "Estoque", icone: Package },
  { rotulo: "Clientes", icone: Users },
  { rotulo: "Financeiro", icone: DollarSign },
  { rotulo: "Relatórios", icone: BarChart3 },
  { rotulo: "Configurações", icone: Settings },
];

const STATUS_LABEL: Record<StatusMotoboy, string> = {
  disponivel: "Disponível",
  "em-rota": "Em rota",
  retornando: "Retornando à base",
  indisponivel: "Indisponível",
};

const COR_COLUNA: Record<ColunaCentral, string> = {
  aguardando: "#eab308",
  atribuidos: "#0284c7",
  rota: "#9333ea",
  entregues: "#16a34a",
};

/** Cor de destaque por motoboy nos cartões de rota (como na imagem aprovada). */
const COR_ROTA: Record<string, { anel: string; numero: string; icone: string }> = {
  "m-carlos": { anel: "border-green-600/60", numero: "bg-green-600", icone: "text-green-400" },
  "m-ana": { anel: "border-sky-600/60", numero: "bg-sky-600", icone: "text-sky-400" },
  "m-marcos": { anel: "border-yellow-500/60", numero: "bg-yellow-500", icone: "text-yellow-400" },
  "m-patricia": { anel: "border-purple-600/60", numero: "bg-purple-600", icone: "text-purple-400" },
  padrao: { anel: "border-neutral-700", numero: "bg-neutral-600", icone: "text-neutral-300" },
};

/** Posição fixa de cada destino no mapa simulado (viewBox 400x320). */
const COORDS: Record<string, { x: number; y: number }> = {
  loja: { x: 120, y: 150 },
  p1254: { x: 300, y: 70 },
  p1253: { x: 250, y: 210 },
  p1250: { x: 340, y: 170 },
  p1249: { x: 180, y: 90 },
  p1260: { x: 230, y: 250 },
  p1248: { x: 320, y: 240 },
  p1245: { x: 90, y: 240 },
  p1243: { x: 160, y: 200 },
  p1242: { x: 350, y: 120 },
  p1247: { x: 200, y: 60 },
  p1246: { x: 270, y: 130 },
  p1244: { x: 140, y: 110 },
};

function fmtHora(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDataCurta(ts: number): string {
  const s = new Date(ts).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return s.replace(/\./g, "").replace(/^\w/, (c) => c.toUpperCase());
}

function montarBase(base: number): { pedidos: PedidoCentral[]; motoboys: MotoboyCentral[]; rotas: RotaDia[] } {
  const motoboys: MotoboyCentral[] = [
    { id: "m-carlos", nome: "Carlos", status: "disponivel", baseKm: 1.2, disponivelDesde: base - 42 * MIN, entregasHoje: 2, atualizacaoEm: base - 2 * MIN },
    { id: "m-ana", nome: "Ana", status: "disponivel", baseKm: 2.1, disponivelDesde: base - 15 * MIN, entregasHoje: 3, atualizacaoEm: base - 3 * MIN },
    { id: "m-marcos", nome: "Marcos", status: "em-rota", baseKm: 2.8, disponivelDesde: null, entregasHoje: 2, atualizacaoEm: base - 4 * MIN },
    { id: "m-patricia", nome: "Patrícia", status: "em-rota", baseKm: 1.9, disponivelDesde: null, entregasHoje: 1, atualizacaoEm: base - 14 * MIN },
    { id: "m-ricardo", nome: "Ricardo", status: "retornando", baseKm: 4.2, disponivelDesde: null, entregasHoje: 0, atualizacaoEm: base - 25 * MIN },
  ];
  const pedidosBase: Omit<PedidoCentral, "prioridadeManual">[] = [
    { id: "p1254", numero: 1254, cliente: "Juliana Pereira", endereco: "Rua Bela Vista, 321 - Jardim", distanciaKm: 2.8, prontoEm: base - 75 * MIN, prometidoEm: base - 15 * MIN, saidaPrevistaEm: null, saidaEm: null, chegadaPrevistaEm: null, entregueEm: null, deslocMin: 14, itens: [{ sabor: "Coxinha de Frango", qtd: 20 }, { sabor: "Kibe", qtd: 20 }], obs: "Portão verde.", motoboyId: null, coluna: "aguardando" },
    { id: "p1253", numero: 1253, cliente: "Marcos Souza", endereco: "Rua das Flores, 123 - Centro", distanciaKm: 3.5, prontoEm: base - 45 * MIN, prometidoEm: base + 8 * MIN, saidaPrevistaEm: null, saidaEm: null, chegadaPrevistaEm: null, entregueEm: null, deslocMin: 16, itens: [{ sabor: "Coxinha de Frango", qtd: 50 }], motoboyId: null, coluna: "aguardando" },
    { id: "p1250", numero: 1250, cliente: "Ana Carolina", endereco: "Av. São Paulo, 789 - Vila Nova", distanciaKm: 4.1, prontoEm: base - 35 * MIN, prometidoEm: base + 25 * MIN, saidaPrevistaEm: null, saidaEm: null, chegadaPrevistaEm: null, entregueEm: null, deslocMin: 18, itens: [{ sabor: "Risole de Presunto e Queijo", qtd: 30 }, { sabor: "Bolinha de Queijo", qtd: 20 }], obs: "Troco para R$ 100.", motoboyId: null, coluna: "aguardando" },
    { id: "p1249", numero: 1249, cliente: "José Carlos", endereco: "Rua das Palmeiras, 789 - Centro", distanciaKm: 2.8, prontoEm: base - 60 * MIN, prometidoEm: base + 35 * MIN, saidaPrevistaEm: base + 5 * MIN, saidaEm: null, chegadaPrevistaEm: null, entregueEm: null, deslocMin: 12, itens: [{ sabor: "Coxinha de Frango", qtd: 20 }, { sabor: "Risole de Queijo", qtd: 20 }], motoboyId: "m-carlos", coluna: "atribuidos" },
    { id: "p1260", numero: 1260, cliente: "Ana Costa", endereco: "Rua do Sol, 456 - Vila Nova", distanciaKm: 2.1, prontoEm: base - 40 * MIN, prometidoEm: base + 55 * MIN, saidaPrevistaEm: base + 12 * MIN, saidaEm: null, chegadaPrevistaEm: null, entregueEm: null, deslocMin: 10, itens: [{ sabor: "Coxinha de Frango", qtd: 30 }, { sabor: "Kibe", qtd: 20 }], motoboyId: "m-ana", coluna: "atribuidos" },
    { id: "p1248", numero: 1248, cliente: "Patrícia Mendes", endereco: "Rua da Paz, 100 - Jardim", distanciaKm: 1.9, prontoEm: base - 90 * MIN, prometidoEm: base + 5 * MIN, saidaPrevistaEm: base - 50 * MIN, saidaEm: base - 50 * MIN, chegadaPrevistaEm: base + 5 * MIN, entregueEm: null, deslocMin: 12, itens: [{ sabor: "Coxinha de Frango", qtd: 25 }, { sabor: "Kibe", qtd: 25 }], motoboyId: "m-ana", coluna: "rota" },
    { id: "p1245", numero: 1245, cliente: "Ricardo Santos", endereco: "Rua das Oliveiras, 321 - Centro", distanciaKm: 4.2, prontoEm: base - 100 * MIN, prometidoEm: base + 28 * MIN, saidaPrevistaEm: base - 37 * MIN, saidaEm: base - 37 * MIN, chegadaPrevistaEm: base + 28 * MIN, entregueEm: null, deslocMin: 22, itens: [{ sabor: "Coxinha de Frango", qtd: 30 }, { sabor: "Bolinha de Queijo", qtd: 20 }], motoboyId: "m-marcos", coluna: "rota" },
    { id: "p1243", numero: 1243, cliente: "Diego Almeida", endereco: "Rua Projetada, 55 - Centro", distanciaKm: 2.0, prontoEm: base - 80 * MIN, prometidoEm: base + 40 * MIN, saidaPrevistaEm: base - 20 * MIN, saidaEm: base - 20 * MIN, chegadaPrevistaEm: base + 40 * MIN, entregueEm: null, deslocMin: 11, itens: [{ sabor: "Enroladinho de Salsicha", qtd: 40 }], motoboyId: "m-marcos", coluna: "rota" },
    { id: "p1242", numero: 1242, cliente: "Camila Rocha", endereco: "Rua Alta, 900 - Jardim", distanciaKm: 1.9, prontoEm: base - 70 * MIN, prometidoEm: base + 18 * MIN, saidaPrevistaEm: base - 15 * MIN, saidaEm: base - 15 * MIN, chegadaPrevistaEm: base + 18 * MIN, entregueEm: null, deslocMin: 9, itens: [{ sabor: "Kibe", qtd: 20 }], motoboyId: "m-patricia", coluna: "rota" },
    { id: "p1247", numero: 1247, cliente: "Roberto Lima", endereco: "Rua da Paz, 100 - Jardim", distanciaKm: 2.8, prontoEm: base - 120 * MIN, prometidoEm: base - 60 * MIN, saidaPrevistaEm: base - 95 * MIN, saidaEm: base - 95 * MIN, chegadaPrevistaEm: base - 70 * MIN, entregueEm: base - 55 * MIN, deslocMin: 12, itens: [{ sabor: "Coxinha de Frango", qtd: 20 }], motoboyId: "m-carlos", coluna: "entregues" },
    { id: "p1246", numero: 1246, cliente: "Fernanda Alves", endereco: "Rua das Acácias, 456 - Centro", distanciaKm: 2.0, prontoEm: base - 130 * MIN, prometidoEm: base - 90 * MIN, saidaPrevistaEm: base - 110 * MIN, saidaEm: base - 110 * MIN, chegadaPrevistaEm: base - 95 * MIN, entregueEm: base - 90 * MIN, deslocMin: 10, itens: [{ sabor: "Risole de Presunto e Queijo", qtd: 30 }], motoboyId: "m-ana", coluna: "entregues" },
    { id: "p1244", numero: 1244, cliente: "Lucas Ferreira", endereco: "Rua Paraná, 654 - Centro", distanciaKm: 3.1, prontoEm: base - 150 * MIN, prometidoEm: base - 105 * MIN, saidaPrevistaEm: base - 130 * MIN, saidaEm: base - 130 * MIN, chegadaPrevistaEm: base - 110 * MIN, entregueEm: base - 105 * MIN, deslocMin: 15, itens: [{ sabor: "Coxinha de Frango", qtd: 50 }], motoboyId: "m-marcos", coluna: "entregues" },
  ];
  const pedidos: PedidoCentral[] = pedidosBase.map((p) => ({ ...p, prioridadeManual: false }));
  const rotas: RotaDia[] = [
    { id: "r-carlos", motoboyId: "m-carlos", paradas: ["p1249"], situacao: "planejada" },
    { id: "r-ana", motoboyId: "m-ana", paradas: ["p1260", "p1248"], situacao: "em-andamento" },
    { id: "r-marcos", motoboyId: "m-marcos", paradas: ["p1245", "p1243"], situacao: "em-andamento" },
    { id: "r-patricia", motoboyId: "m-patricia", paradas: ["p1242"], situacao: "em-andamento" },
  ];
  return { pedidos, motoboys, rotas };
}

export function PreviewCentralEntregasV2() {
  const [base] = useState(() => Date.now());
  const ini = useMemo(() => montarBase(base), [base]);
  const [pedidos, setPedidos] = useState<PedidoCentral[]>(ini.pedidos);
  const [motoboys, setMotoboys] = useState<MotoboyCentral[]>(ini.motoboys);
  const [rotas, setRotas] = useState<RotaDia[]>(ini.rotas);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaCentral[]>([
    { id: "oc1", pedidoNumero: 1253, tipo: "Embalagem aberta", descricao: "Conferir caixa antes da saída.", aberta: true },
  ]);
  const [tab, setTab] = useState<TabSec>("visao");
  const [kanbanMobile, setKanbanMobile] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [aviso, setAviso] = useState<string | null>(null);
  const [selPedido, setSelPedido] = useState<string | null>(null);
  const [selMotoboy, setSelMotoboy] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mapaCheio, setMapaCheio] = useState(false);
  // Modais
  const [atribPedido, setAtribPedido] = useState<string | null>(null);
  const [atribEscolha, setAtribEscolha] = useState<string | null>(null);
  const [saidaPedido, setSaidaPedido] = useState<string | null>(null);
  const [histPedido, setHistPedido] = useState<string | null>(null);
  const [novaRotaAberta, setNovaRotaAberta] = useState(false);
  const [novaRotaMoto, setNovaRotaMoto] = useState<string>("");
  const [novaRotaSel, setNovaRotaSel] = useState<string[]>([]);
  const [novaRotaExtra, setNovaRotaExtra] = useState(false);
  const [editRota, setEditRota] = useState<string | null>(null);
  const [editTroca, setEditTroca] = useState<string>("");
  const [editConfirma, setEditConfirma] = useState(false);
  const [dividirSel, setDividirSel] = useState<number[]>([]);
  const [ocAberta, setOcAberta] = useState(false);
  const [ocPedido, setOcPedido] = useState<string>("");
  const [ocTipo, setOcTipo] = useState("Atraso no trajeto");
  const [ocDesc, setOcDesc] = useState("");

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const porId = (id: string) => pedidos.find((p) => p.id === id);
  const motoPorId = (id: string | null) => motoboys.find((m) => m.id === id) ?? null;
  const rotasAtivas = rotas.filter((r) => r.situacao !== "concluida");
  const rotaDe = (motoboyId: string) => rotas.find((r) => r.motoboyId === motoboyId && r.situacao !== "concluida");

  const aguardando = pedidos.filter((p) => p.coluna === "aguardando");
  const atribuidos = pedidos.filter((p) => p.coluna === "atribuidos");
  const emRota = pedidos.filter((p) => p.coluna === "rota");
  const entregues = pedidos.filter((p) => p.coluna === "entregues");
  const entreguesHoje = ENTREGUES_ANTERIORES + entregues.length;
  const atrasados = pedidos.filter((p) => emAtraso(p, agora));
  const proximosPrazo = pedidos.filter((p) => !emAtraso(p, agora) && proximoDoPrazo(p, agora));
  const ocAbertas = ocorrencias.filter((o) => o.aberta);
  const sug = useMemo(() => sugerirMotoboy(motoboys), [motoboys]);

  const alertaPorId = useMemo(() => {
    const m: Record<string, AlertaEntrega> = {};
    for (const p of pedidos) m[p.id] = alertaDe(p, agora);
    return m;
  }, [pedidos, agora]);

  const aguardandoOrdenados = useMemo(
    () =>
      pedidos
        .filter((p) => p.coluna === "aguardando")
        .sort(
          (a, b) =>
            pontuarDespacho(b, alertaPorId[b.id]!, agora) -
              pontuarDespacho(a, alertaPorId[a.id]!, agora) || a.numero - b.numero,
        ),
    [pedidos, alertaPorId, agora],
  );

  const emAlerta = pedidos.filter((p) => p.coluna !== "entregues");
  const nAtrasadas = emAlerta.filter((p) => alertaPorId[p.id]?.estado === "atrasado").length;
  const nRisco = emAlerta.filter((p) => alertaPorId[p.id]?.estado === "risco").length;
  const nProxPrazo = emAlerta.filter(
    (p) => alertaPorId[p.id]?.estado === "no-prazo" && proximoDoPrazo(p, agora),
  ).length;
  const nSemPrev = emAlerta.filter((p) => alertaPorId[p.id]?.estado === "sem-previsao").length;

  const paradasReservadas: Record<string, number> = {};
  for (const r of rotasAtivas) paradasReservadas[r.motoboyId] = (paradasReservadas[r.motoboyId] ?? 0) + r.paradas.length;

  function selecionarNoMapa(pedidoId: string) {
    setSelPedido(pedidoId);
    const ped = porId(pedidoId);
    const rota = rotasAtivas.find((r) => r.paradas.includes(pedidoId));
    setSelMotoboy(rota?.motoboyId ?? ped?.motoboyId ?? null);
  }

  function patchPedido(id: string, fn: (p: PedidoCentral) => PedidoCentral) {
    setPedidos((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }

  function abrirAtribuir(pedidoId: string) {
    setAtribPedido(pedidoId);
    setAtribEscolha(sugerirMotoboy(motoboys).id);
  }

  function confirmarAtribuicao() {
    if (!atribPedido || !atribEscolha) return;
    const ped = porId(atribPedido);
    const moto = motoPorId(atribEscolha);
    if (!ped || !moto) return;
    const v = podeAtribuir(ped, moto, rotasAtivas);
    if (!v.ok) {
      setAviso(`Não é possível atribuir #${ped.numero}: ${v.motivos.join("; ")}.`);
      return;
    }
    patchPedido(ped.id, (p) => ({ ...p, motoboyId: moto.id, coluna: "atribuidos", saidaPrevistaEm: Date.now() + 10 * MIN }));
    setRotas((prev) => {
      const ex = prev.find((r) => r.motoboyId === moto.id && r.situacao !== "concluida");
      if (ex) {
        if (ex.paradas.includes(ped.id)) return prev;
        return prev.map((r) => (r.id === ex.id ? { ...r, paradas: [...r.paradas, ped.id] } : r));
      }
      return [...prev, { id: `r-${Date.now()}`, motoboyId: moto.id, paradas: [ped.id], situacao: "planejada" }];
    });
    setAviso(`Simulação: ${moto.nome} atribuído ao pedido #${ped.numero} (sem envio real). Saída ainda NÃO confirmada.`);
    setAtribPedido(null);
  }

  function confirmarSaida() {
    if (!saidaPedido) return;
    const ped = porId(saidaPedido);
    if (!ped || ped.coluna !== "atribuidos" || !ped.motoboyId) return;
    const chegada = Date.now() + (ped.deslocMin ?? 15) * MIN;
    patchPedido(ped.id, (p) => ({ ...p, coluna: "rota", saidaEm: Date.now(), chegadaPrevistaEm: chegada }));
    setRotas((prev) => prev.map((r) => (r.motoboyId === ped.motoboyId && r.situacao !== "concluida" ? { ...r, situacao: "em-andamento" as const } : r)));
    setMotoboys((prev) => prev.map((m) => (m.id === ped.motoboyId ? { ...m, status: "em-rota" as const, atualizacaoEm: Date.now() } : m)));
    setAviso(`Simulação: pedido #${ped.numero} saiu para entrega.`);
    setSaidaPedido(null);
  }

  function concluirEntrega(pedidoId: string) {
    const ped = porId(pedidoId);
    if (!ped || ped.coluna !== "rota") return;
    patchPedido(ped.id, (p) => ({ ...p, coluna: "entregues", entregueEm: Date.now() }));
    setRotas((prev) =>
      prev.map((r) => {
        if (!r.paradas.includes(ped.id) || r.situacao === "concluida") return r;
        const paradas = r.paradas.filter((id) => id !== ped.id);
        return { ...r, paradas, situacao: paradas.length === 0 ? ("concluida" as const) : r.situacao };
      }),
    );
    setMotoboys((prev) => {
      const aindaEmRota = (mId: string) =>
        pedidos.some((p) => p.motoboyId === mId && p.coluna === "rota" && p.id !== ped.id);
      return prev.map((m) =>
        m.id === ped.motoboyId
          ? { ...m, entregasHoje: m.entregasHoje + 1, status: aindaEmRota(m.id) ? m.status : ("retornando" as const), atualizacaoEm: Date.now() }
          : m,
      );
    });
    setAviso(`Simulação: pedido #${ped.numero} entregue. Motoboy em retorno — confirme a chegada para liberar.`);
  }

  function confirmarChegada(motoboyId: string) {
    setMotoboys((prev) =>
      prev.map((m) => (m.id === motoboyId ? { ...m, status: "disponivel" as const, disponivelDesde: Date.now(), atualizacaoEm: Date.now() } : m)),
    );
    setAviso("Simulação: chegada à base confirmada. Motoboy disponível.");
  }

  function criarRota() {
    if (!novaRotaMoto) {
      setAviso("Escolha o motoboy da nova rota.");
      return;
    }
    if (!podeCriarRota(novaRotaSel, novaRotaExtra)) {
      setAviso(novaRotaSel.length > 3 ? "Acima de 3 paradas exige confirmação explícita." : "Selecione ao menos 1 pedido aguardando.");
      return;
    }
    const moto = motoPorId(novaRotaMoto);
    if (!moto || moto.status === "indisponivel") {
      setAviso("Motoboy indisponível para nova rota.");
      return;
    }
    for (const pid of novaRotaSel) {
      const ped = porId(pid);
      if (!ped) continue;
      const v = podeAtribuir(ped, moto, rotasAtivas);
      if (!v.ok) {
        setAviso(`Pedido #${ped.numero} bloqueado: ${v.motivos.join("; ")}.`);
        return;
      }
    }
    novaRotaSel.forEach((pid) =>
      patchPedido(pid, (p) => ({ ...p, motoboyId: moto.id, coluna: "atribuidos", saidaPrevistaEm: Date.now() + 10 * MIN })),
    );
    setRotas((prev) => [...prev, { id: `r-${Date.now()}`, motoboyId: moto.id, paradas: [...novaRotaSel], situacao: "planejada" }]);
    setAviso(`Simulação: rota criada para ${moto.nome} com ${novaRotaSel.length} parada(s).`);
    setNovaRotaAberta(false);
    setNovaRotaSel([]);
    setNovaRotaMoto("");
    setNovaRotaExtra(false);
  }

  function moverParada(rotaId: string, idx: number, dir: -1 | 1) {
    setRotas((prev) => prev.map((r) => (r.id === rotaId ? { ...r, paradas: reordenar(r.paradas, idx, idx + dir) } : r)));
  }

  function removerParada(rotaId: string, pid: string) {
    const rota = rotas.find((r) => r.id === rotaId);
    if (!rota) return;
    if (rota.situacao === "em-andamento") {
      setAviso("Rota em andamento: remoção de parada exige confirmação — use a troca/divisão com confirmação marcada.");
      if (!editConfirma) return;
    }
    setRotas((prev) => prev.map((r) => (r.id === rotaId ? { ...r, paradas: r.paradas.filter((id) => id !== pid) } : r)));
    patchPedido(pid, (p) => (p.coluna === "atribuidos" ? { ...p, motoboyId: null, coluna: "aguardando", saidaPrevistaEm: null } : p));
  }

  function trocarMotoboyRota(rotaId: string) {
    const rota = rotas.find((r) => r.id === rotaId);
    if (!rota || !editTroca || editTroca === rota.motoboyId) return;
    const novo = motoPorId(editTroca);
    if (!novo || novo.status === "indisponivel") {
      setAviso("Novo motoboy indisponível.");
      return;
    }
    if (rota.situacao === "em-andamento" && !editConfirma) {
      setAviso("Trocar motoboy de rota em andamento exige confirmação explícita.");
      return;
    }
    rota.paradas.forEach((pid) => patchPedido(pid, (p) => ({ ...p, motoboyId: novo.id })));
    setRotas((prev) => prev.map((r) => (r.id === rotaId ? { ...r, motoboyId: novo.id } : r)));
    setAviso(`Simulação: rota agora com ${novo.nome}. Horários prometidos preservados.`);
  }

  function dividirRotaAtiva(rotaId: string) {
    const rota = rotas.find((r) => r.id === rotaId);
    if (!rota || dividirSel.length === 0 || dividirSel.length >= rota.paradas.length) {
      setAviso("Selecione ao menos 1 parada (e não todas) para formar a segunda rota.");
      return;
    }
    const [a, b] = dividirRota(rota.paradas, dividirSel);
    setRotas((prev) => [
      ...prev.map((r) => (r.id === rotaId ? { ...r, paradas: a } : r)),
      { id: `r-${Date.now()}`, motoboyId: rota.motoboyId, paradas: b, situacao: "planejada" },
    ]);
    setDividirSel([]);
    setAviso("Simulação: rota dividida. Nenhum pedido duplicado entre rotas.");
  }

  function registrarOcorrencia() {
    if (ocDesc.trim().length < 3) {
      setAviso("Descreva a ocorrência (mínimo 3 caracteres).");
      return;
    }
    const ped = ocPedido ? porId(ocPedido) : null;
    setOcorrencias((prev) => [...prev, { id: `oc-${Date.now()}`, pedidoNumero: ped ? ped.numero : null, tipo: ocTipo, descricao: ocDesc.trim(), aberta: true }]);
    setOcAberta(false);
    setOcDesc("");
    setOcPedido("");
    setAviso("Ocorrência registrada (simulação local).");
  }

  const sinoTotal = atrasados.length + ocAbertas.length;
  const kanbanTabs = ["Aguardando", "Atribuídos", "Em Rota", "Entregues"] as const;

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100">
      <style>{`@keyframes piscar-vermelho { 0%,100% { border-color: #ef4444; box-shadow: 0 0 0 1px #ef4444; } 50% { border-color: transparent; box-shadow: none; } } .borda-atraso { animation: piscar-vermelho 1.2s infinite; } @keyframes pulsar-mapa { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } } .pulso { animation: pulsar-mapa 1.4s infinite; } @media (prefers-reduced-motion: reduce) { .borda-atraso, .pulso { animation: none; } }`}</style>
      <p className="bg-yellow-400 px-3 py-1 text-center text-xs font-bold text-black">
        PREVIEW — dados fictícios, interações demonstrativas. Nada é gravado. Mapa simulado, sem GPS.
      </p>

      <div className="flex min-h-[calc(100vh-28px)]">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-neutral-800 bg-black px-3 py-4 lg:flex" aria-label="Navegação do preview">
          <div className="rounded-xl px-2 py-2 text-center">
            <p className="flex items-center justify-center gap-1 text-yellow-400"><Crown className="size-5" aria-hidden /></p>
            <p className="font-display text-3xl font-extrabold italic leading-none text-yellow-400">Néia</p>
            <p className="text-[11px] font-bold tracking-[0.3em] text-yellow-500">SALGADOS</p>
            <p className="mt-1 text-[11px] italic text-neutral-400">O sabor que faz a diferença</p>
          </div>
          <nav className="mt-4 space-y-1">
            {NAV.map((s) => {
              const Icone = s.icone;
              const ativo = s.rotulo === "Entregas";
              return (
                <span key={s.rotulo} aria-current={ativo ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${ativo ? "border border-yellow-500/60 bg-yellow-500/15 font-bold text-yellow-300" : "text-neutral-300"}`}>
                  <Icone className="size-4" aria-hidden />{s.rotulo}
                </span>
              );
            })}
          </nav>
          <div className="mt-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-green-400">
              <span className="size-2 rounded-full bg-green-500" aria-hidden /> Sistema Online
            </p>
            <p className="mt-1 font-display text-3xl font-bold text-white">{fmtHora(agora)}</p>
            <p className="text-xs text-neutral-400">{fmtDataCurta(agora)}</p>
            <p className="mt-2 text-[11px] text-neutral-500">v2.0.0</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-3">
          {/* Cabeçalho */}
          <header className="flex flex-wrap items-start gap-2">
            <div className="min-w-52">
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-yellow-400">
                <Bike className="size-7" aria-hidden /> Central de Entregas
              </h1>
              <p className="text-xs text-neutral-400">Gerencie os motoboys, rotas e entregas em tempo real.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-stretch gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-yellow-600 bg-yellow-950/50 px-3 py-1.5">
                <Users className="size-6 text-yellow-400" aria-hidden />
                <p className="font-display text-xl font-bold text-white leading-none">{aguardando.length}<span className="block text-[11px] font-normal text-yellow-200">Aguardando Motoboy</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-sky-600 bg-sky-950/50 px-3 py-1.5">
                <ClipboardList className="size-6 text-sky-400" aria-hidden />
                <p className="font-display text-xl font-bold text-white leading-none">{atribuidos.length}<span className="block text-[11px] font-normal text-sky-200">Atribuídos</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-purple-600 bg-purple-950/50 px-3 py-1.5">
                <Bike className="size-6 text-purple-400" aria-hidden />
                <p className="font-display text-xl font-bold text-white leading-none">{emRota.length}<span className="block text-[11px] font-normal text-purple-200">Em Rota</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-green-700 bg-green-950/60 px-3 py-1.5">
                <Check className="size-6 text-green-400" aria-hidden />
                <p className="font-display text-xl font-bold text-white leading-none">{entreguesHoje}<span className="block text-[11px] font-normal text-green-200">Entregues Hoje</span></p>
              </div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-center leading-tight">
                <p className="text-[11px] text-neutral-400">{fmtDataCurta(agora)}</p>
                <p className="font-display text-xl font-bold text-white">{fmtHora(agora)}</p>
              </div>
              <button type="button" className="relative rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5" aria-label={`Alertas (${sinoTotal})`}>
                <Bell className="size-5" aria-hidden />
                {sinoTotal > 0 ? <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white">{sinoTotal}</span> : null}
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5">
                <span className="grid size-8 place-items-center rounded-full bg-yellow-500 text-xs font-extrabold text-black">NS</span>
                <span className="text-xs leading-tight"><b className="block">Néia Salgados</b><span className="text-neutral-400">Entregas</span></span>
                <ChevronDown className="size-4 text-neutral-500" aria-hidden />
              </div>
            </div>
          </header>

          {/* Alertas inteligentes (K8.2): categorias exclusivas, sem dupla contagem */}
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-2.5 py-1.5 text-[11px]" role="status" aria-label="Alertas operacionais">
            {nAtrasadas > 0 ? <span className="rounded bg-red-600 px-2 py-1 font-bold text-white">▲ {nAtrasadas} atrasada(s)</span> : <span className="text-neutral-400">Sem atrasos</span>}
            {nRisco > 0 ? <span className="rounded bg-yellow-500 px-2 py-1 font-bold text-black">⚠ {nRisco} em risco: {emAlerta.filter((p) => alertaPorId[p.id]?.estado === "risco").map((p) => `#${p.numero}`).join(", ")}</span> : null}
            {nProxPrazo > 0 ? <span className="rounded bg-sky-600 px-2 py-1 font-bold text-white">◷ {nProxPrazo} próxima(s) do prazo</span> : null}
            {nSemPrev > 0 ? <span className="rounded border border-neutral-600 px-2 py-1 text-neutral-300">{nSemPrev} sem previsão</span> : null}
            {aguardando.length > 0 ? <span className="rounded border border-yellow-600 px-2 py-1 text-yellow-200">{aguardando.length} pronta(s) sem motoboy</span> : null}
            <span className="rounded border border-green-700 px-2 py-1 text-green-300">{motoboys.filter((m) => m.status === "disponivel").length} motoboy(s) na base</span>
            {ocAbertas.length > 0 ? <span className="rounded border border-orange-500 px-2 py-1 text-orange-300">{ocAbertas.length} ocorrência(s) aberta(s)</span> : null}
            <button type="button" onClick={() => setOcAberta(true)} className="ml-auto rounded-lg border border-neutral-700 px-2.5 py-1.5 font-bold text-neutral-200">Registrar ocorrência</button>
          </div>
          {aviso ? <p role="status" className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-xs text-neutral-300">{aviso}</p> : null}

          {/* Kanban + mapa */}
          {(tab === "visao" || tab === "mapa") ? (
            <>
              <div className="mt-3 grid grid-cols-4 gap-1.5 md:hidden" role="tablist" aria-label="Etapas de entrega">
                {kanbanTabs.map((t, i) => (
                  <button key={t} type="button" role="tab" aria-selected={kanbanMobile === i} onClick={() => setKanbanMobile(i)}
                    className={`min-h-[48px] rounded-lg border px-2 text-xs font-bold ${kanbanMobile === i ? "border-yellow-400 bg-yellow-400 text-black" : "border-neutral-700 text-neutral-200"}`}>{t}</button>
                ))}
              </div>
              {/* Desktop/tablet: 4 colunas + mapa sempre lado a lado (rolagem interna, sem rolagem da página) */}
              <div className="mt-3 hidden overflow-x-auto md:block">
              <div className="grid items-start gap-3" style={{ gridTemplateColumns: "repeat(4,minmax(230px,1fr)) 300px", minWidth: "1260px" }}>
                <div>
                  <Coluna titulo="Aguardando Motoboy" sub="Pedidos prontos para despacho" cabeca="bg-yellow-500 text-black" icone={Crosshair} cont={aguardando.length}>
                    {aguardandoOrdenados.map((p, i) => <CartaoAguardando key={p.id} p={p} agora={agora} sel={selPedido === p.id} ordem={i + 1}
                      onAtribuir={() => abrirAtribuir(p.id)} onMapa={() => selecionarNoMapa(p.id)} onPriorizar={() => patchPedido(p.id, (x) => ({ ...x, prioridadeManual: !x.prioridadeManual }))} />)}
                    {aguardando.length === 0 ? <Vazio texto="Nenhum pedido aguardando." /> : null}
                  </Coluna>
                </div>
                <div>
                  <Coluna titulo="Atribuídos" sub="Pedidos com motoboy selecionado" cabeca="bg-sky-600 text-white" icone={UserCheck} cont={atribuidos.length}>
                    {atribuidos.map((p) => <CartaoAtribuido key={p.id} p={p} agora={agora} moto={motoPorId(p.motoboyId)}
                      onSaida={() => setSaidaPedido(p.id)} onRota={() => { setSelPedido(p.id); setSelMotoboy(p.motoboyId); setTab("visao"); }} />)}
                    {atribuidos.length === 0 ? <Vazio texto="Nenhum pedido atribuído." /> : null}
                  </Coluna>
                </div>
                <div>
                  <Coluna titulo="Em Rota" sub="Pedidos em deslocamento" cabeca="bg-purple-600 text-white" icone={Navigation} cont={emRota.length}>
                    {emRota.map((p) => <CartaoRota key={p.id} p={p} agora={agora} moto={motoPorId(p.motoboyId)}
                      onMapa={() => { setSelPedido(p.id); setSelMotoboy(p.motoboyId); }} onConcluir={() => concluirEntrega(p.id)} />)}
                    {emRota.length === 0 ? <Vazio texto="Nenhuma entrega em rota." /> : null}
                  </Coluna>
                </div>
                <div>
                  <Coluna titulo="Entregues" sub={`Entregas concluídas hoje (${entreguesHoje})`} cabeca="bg-green-600 text-white" icone={CheckCircle2} cont={entregues.length}>
                    {entregues.map((p) => <CartaoEntregue key={p.id} p={p} moto={motoPorId(p.motoboyId)} onHist={() => setHistPedido(p.id)} />)}
                    {entregues.length === 0 ? <Vazio texto="Nenhuma entrega concluída." /> : null}
                    <button type="button" onClick={() => setTab("historico")} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-2 text-xs font-bold text-neutral-300 hover:bg-neutral-800">
                      <History className="size-4" aria-hidden /> Ver histórico de entregas
                    </button>
                  </Coluna>
                </div>
                <div>
                  <section aria-label="Mapa de entregas" className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <h2 className="flex items-center gap-1.5 font-display text-base font-extrabold"><MapPin className="size-4" aria-hidden /> Mapa de Entregas</h2>
                      <button type="button" onClick={() => setMapaCheio(true)} className="ml-auto flex items-center gap-1 rounded-lg border border-neutral-700 px-2 py-1 text-[11px] font-bold text-neutral-300 hover:bg-neutral-800">
                        <Expand className="size-3.5" aria-hidden /> Tela cheia
                      </button>
                    </div>
                    <MapaSimulado pedidos={pedidos} selPedido={selPedido} selMotoboy={selMotoboy} rotas={rotasAtivas} zoom={zoom} onZoom={setZoom} onSelecionar={selecionarNoMapa} />
                  </section>
                  {(tab === "visao") ? (
                    <section aria-label="Motoboys" className="mt-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
                      <div className="flex items-center px-3 py-2">
                        <h2 className="font-display text-base font-extrabold">Motoboys ({motoboys.length})</h2>
                        <button type="button" onClick={() => setTab("motoboys")} className="ml-auto rounded-lg border border-neutral-700 px-2 py-1 text-[11px] font-bold text-neutral-300 hover:bg-neutral-800">Ver todos</button>
                      </div>
                      <ul className="space-y-2 p-2.5">
                        {motoboys.map((m) => <LinhaMotoboy key={m.id} m={m} agora={agora} sugerido={sug.id === m.id}
                          atribuidas={pedidos.filter((p) => p.motoboyId === m.id && p.coluna !== "entregues").length}
                          reservado={paradasReservadas[m.id] ?? 0}
                          onAtribuir={() => { const alvo = aguardandoOrdenados[0]; if (alvo) abrirAtribuir(alvo.id); }}
                          onRota={() => { setSelMotoboy(m.id); setSelPedido(null); }}
                          onChegada={() => confirmarChegada(m.id)} />)}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </div>
              </div>
              {/* Celular: navegação por etapas */}
              <div className="mt-3 md:hidden">
                {kanbanMobile === 0 ? (
                  <Coluna titulo="Aguardando Motoboy" sub="Pedidos prontos para despacho" cabeca="bg-yellow-500 text-black" icone={Crosshair} cont={aguardando.length}>
                    {aguardandoOrdenados.map((p, i) => <CartaoAguardando key={p.id} p={p} agora={agora} sel={selPedido === p.id} ordem={i + 1}
                      onAtribuir={() => abrirAtribuir(p.id)} onMapa={() => selecionarNoMapa(p.id)} onPriorizar={() => patchPedido(p.id, (x) => ({ ...x, prioridadeManual: !x.prioridadeManual }))} />)}
                    {aguardando.length === 0 ? <Vazio texto="Nenhum pedido aguardando." /> : null}
                  </Coluna>
                ) : null}
                {kanbanMobile === 1 ? (
                  <Coluna titulo="Atribuídos" sub="Pedidos com motoboy selecionado" cabeca="bg-sky-600 text-white" icone={UserCheck} cont={atribuidos.length}>
                    {atribuidos.map((p) => <CartaoAtribuido key={p.id} p={p} agora={agora} moto={motoPorId(p.motoboyId)}
                      onSaida={() => setSaidaPedido(p.id)} onRota={() => { setSelPedido(p.id); setSelMotoboy(p.motoboyId); }} />)}
                    {atribuidos.length === 0 ? <Vazio texto="Nenhum pedido atribuído." /> : null}
                  </Coluna>
                ) : null}
                {kanbanMobile === 2 ? (
                  <Coluna titulo="Em Rota" sub="Pedidos em deslocamento" cabeca="bg-purple-600 text-white" icone={Navigation} cont={emRota.length}>
                    {emRota.map((p) => <CartaoRota key={p.id} p={p} agora={agora} moto={motoPorId(p.motoboyId)}
                      onMapa={() => { setSelPedido(p.id); setSelMotoboy(p.motoboyId); }} onConcluir={() => concluirEntrega(p.id)} />)}
                    {emRota.length === 0 ? <Vazio texto="Nenhuma entrega em rota." /> : null}
                  </Coluna>
                ) : null}
                {kanbanMobile === 3 ? (
                  <Coluna titulo="Entregues" sub={`Entregas concluídas hoje (${entreguesHoje})`} cabeca="bg-green-600 text-white" icone={CheckCircle2} cont={entregues.length}>
                    {entregues.map((p) => <CartaoEntregue key={p.id} p={p} moto={motoPorId(p.motoboyId)} onHist={() => setHistPedido(p.id)} />)}
                    {entregues.length === 0 ? <Vazio texto="Nenhuma entrega concluída." /> : null}
                  </Coluna>
                ) : null}
                <section aria-label="Mapa de entregas" className="mt-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <h2 className="flex items-center gap-1.5 font-display text-base font-extrabold"><MapPin className="size-4" aria-hidden /> Mapa de Entregas</h2>
                    <button type="button" onClick={() => setMapaCheio(true)} className="ml-auto flex items-center gap-1 rounded-lg border border-neutral-700 px-2 py-1 text-[11px] font-bold text-neutral-300 hover:bg-neutral-800">
                      <Expand className="size-3.5" aria-hidden /> Tela cheia
                    </button>
                  </div>
                  <MapaSimulado pedidos={pedidos} selPedido={selPedido} selMotoboy={selMotoboy} rotas={rotasAtivas} zoom={zoom} onZoom={setZoom} onSelecionar={selecionarNoMapa} />
                </section>
              </div>
            </>
          ) : null}

          {/* Menu secundário */}
          <nav className="mt-3 flex flex-wrap items-center gap-2" aria-label="Visões da central">
            {(Object.entries({ visao: "Visão Geral", rotas: "Rotas do Dia", mapa: "Mapa", motoboys: "Motoboys", historico: "Histórico", ocorrencias: `Ocorrências${ocAbertas.length > 0 ? ` (${ocAbertas.length})` : ""}` }) as Array<[TabSec, string]>).map(([v, rot]) => (
              <button key={v} type="button" onClick={() => setTab(v)}
                className={`min-h-[44px] rounded-lg border px-4 py-1.5 text-sm ${tab === v ? "border-yellow-400 bg-yellow-400 font-bold text-black" : "border-neutral-700 bg-neutral-900 text-neutral-200"}`}>{rot}</button>
            ))}
            <button type="button" onClick={() => { setNovaRotaAberta(true); setNovaRotaMoto(sug.id ?? ""); }}
              className="ml-auto flex min-h-[44px] items-center gap-1.5 rounded-lg bg-yellow-400 px-4 py-1.5 text-sm font-extrabold text-black hover:bg-yellow-300">
              <Plus className="size-4" aria-hidden /> Criar Nova Rota
            </button>
          </nav>

          {/* Rotas do dia */}
          {(tab === "visao" || tab === "rotas") ? (
            <section aria-label="Rotas do dia" className="mt-3 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
              {rotas.map((r) => {
                const moto = motoPorId(r.motoboyId);
                const stops = r.paradas.map((id) => porId(id)).filter((p): p is PedidoCentral => !!p);
                const t = totaisRota(pedidos, r.paradas);
                const cor = COR_ROTA[r.motoboyId] ?? COR_ROTA["padrao"]!;
                const partida = r.situacao === "em-andamento"
                  ? (stops.map((s) => s.saidaEm ?? agora).sort((a, b) => a - b)[0] ?? agora)
                  : agora;
                const prev = previsoesRota(pedidos, r.paradas, partida);
                const prevPorId: Record<string, { chegadaEm: number; atrasoMin: number }> = {};
                for (const pr of prev) prevPorId[pr.pedidoId] = pr;
                return (
                  <article key={r.id} className={`rounded-xl border bg-[#101013] p-3 ${cor.anel}`}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-full bg-neutral-800"><Bike className={`size-4 ${cor.icone}`} aria-hidden /></span>
                      <div className="leading-tight">
                        <p className="font-bold">{moto?.nome ?? "—"}</p>
                        <p className="text-[11px] text-neutral-400">{t.qtd} entrega(s) • {t.distKm.toFixed(1)} km • ~{t.tempoMin} min</p>
                      </div>
                      <span className={`ml-auto rounded px-2 py-0.5 text-[11px] font-bold ${r.situacao === "em-andamento" ? "bg-green-700 text-white" : r.situacao === "concluida" ? "bg-neutral-700 text-neutral-300" : "bg-yellow-500 text-black"}`}>
                        {r.situacao === "em-andamento" ? "Em andamento" : r.situacao === "concluida" ? "Concluída" : "Planejada"}
                      </span>
                    </div>
                    <ol className="mt-2 space-y-1.5">
                      {stops.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-2 rounded-lg bg-neutral-800/60 px-2 py-1.5 text-xs">
                          <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${p.coluna === "rota" || p.coluna === "atribuidos" ? "text-white" : "text-black"} ${cor.numero}`}>{i + 1}</span>
                          <span className="min-w-0 flex-1"><b>#{p.numero}</b> {p.cliente}<span className="block text-[11px] text-neutral-400">↔ {p.distanciaKm?.toFixed(1) ?? "?"} km • {totalUnidades(p)} un.</span></span>
                          <span className="shrink-0 text-right text-[11px] leading-tight">
                            <span className="block text-neutral-300">◷ {fmtHora(p.prometidoEm)}</span>
                            <span className={prevPorId[p.id]!.atrasoMin > 0 ? "block font-bold text-red-400" : "block text-neutral-500"} title="Previsão demonstrativa (sem trânsito real)">→ ~{fmtHora(prevPorId[p.id]!.chegadaEm)}{prevPorId[p.id]!.atrasoMin > 0 ? ` (+${prevPorId[p.id]!.atrasoMin})` : ""}</span>
                          </span>
                        </li>
                      ))}
                      {stops.length === 0 ? <li className="text-xs text-neutral-500">Sem paradas.</li> : null}
                    </ol>
                    <p className="mt-1.5 text-[11px] text-neutral-400">Total da rota: {t.distKm.toFixed(1)} km • ~{t.tempoMin} min • {t.totalUn} un.</p>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => { setSelMotoboy(r.motoboyId); setSelPedido(null); setTab("visao"); }} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800">Ver no Mapa</button>
                      <button type="button" onClick={() => { setEditRota(r.id); setEditTroca(r.motoboyId); setEditConfirma(false); setDividirSel([]); }} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800">Editar Rota</button>
                    </div>
                  </article>
                );
              })}
              {rotas.length === 0 ? <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-xs text-neutral-500">Nenhuma rota ativa.</p> : null}
            </section>
          ) : null}

          {(tab === "motoboys") ? (
            <section aria-label="Todos os motoboys" className="mt-3 grid gap-3 md:grid-cols-2">
              {motoboys.map((m) => (
                <div key={m.id} className="rounded-xl border border-neutral-800 bg-[#101013] p-3">
                  <LinhaMotoboy m={m} agora={agora} sugerido={sug.id === m.id}
                    atribuidas={pedidos.filter((p) => p.motoboyId === m.id && p.coluna !== "entregues").length}
                    reservado={paradasReservadas[m.id] ?? 0}
                    onAtribuir={() => { const alvo = aguardandoOrdenados[0]; if (alvo) abrirAtribuir(alvo.id); }}
                    onRota={() => { setSelMotoboy(m.id); }}
                    onChegada={() => confirmarChegada(m.id)} />
                  {rotaDe(m.id) ? <p className="mt-1.5 text-xs text-neutral-400">Rota: {rotaDe(m.id)!.paradas.map((id) => `#${porId(id)?.numero ?? "?"}`).join(" → ") || "—"}</p> : <p className="mt-1.5 text-xs text-neutral-500">Sem rota ativa.</p>}
                </div>
              ))}
            </section>
          ) : null}

          {(tab === "historico") ? (
            <section aria-label="Histórico" className="mt-3 space-y-2">
              {entregues.map((p) => {
                const moto = motoPorId(p.motoboyId);
                return (
                  <article key={p.id} className="rounded-xl border border-neutral-800 bg-[#101013] p-3 text-sm">
                    <p><b>#{p.numero}</b> {p.cliente} • Motoboy: {moto?.nome ?? "—"} • Entregue às {p.entregueEm ? fmtHora(p.entregueEm) : "—"}</p>
                    <p className="text-xs text-neutral-400">{p.itens.map((i) => `${i.qtd} ${i.sabor}`).join(" + ")} • Total {totalUnidades(p)} un. • {p.endereco}</p>
                    <button type="button" onClick={() => setHistPedido(p.id)} className="mt-1.5 flex min-h-[44px] items-center gap-1 rounded-lg border border-neutral-600 px-3 text-xs font-bold hover:bg-neutral-800"><History className="size-4" aria-hidden /> Consultar histórico</button>
                  </article>
                );
              })}
              <p className="text-xs text-neutral-500">+ {ENTREGUES_ANTERIORES} entregas anteriores de hoje (resumo demonstrativo).</p>
            </section>
          ) : null}

          {(tab === "ocorrencias") ? (
            <section aria-label="Ocorrências" className="mt-3 space-y-2">
              {ocorrencias.map((o) => (
                <article key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-[#101013] p-3 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${o.aberta ? "bg-orange-600 text-white" : "bg-neutral-700 text-neutral-300"}`}>{o.aberta ? "Aberta" : "Resolvida"}</span>
                  <span><b>{o.tipo}</b>{o.pedidoNumero ? ` — pedido #${o.pedidoNumero}` : ""}</span>
                  <span className="w-full text-xs text-neutral-400">{o.descricao}</span>
                  {o.aberta ? <button type="button" onClick={() => setOcorrencias((prev) => prev.map((x) => (x.id === o.id ? { ...x, aberta: false } : x)))} className="ml-auto flex min-h-[44px] items-center gap-1 rounded-lg bg-green-700 px-3 text-xs font-bold hover:bg-green-600"><Check className="size-4" aria-hidden /> Resolver</button> : null}
                </article>
              ))}
              {ocorrencias.length === 0 ? <p className="text-xs text-neutral-500">Nenhuma ocorrência.</p> : null}
            </section>
          ) : null}

          <p className="mt-3 pb-6 text-center text-[11px] text-neutral-500">
            Preview com dados fictícios — nada é gravado. Aguardando aprovação para integrar à central real.
          </p>
        </div>
      </div>

      {/* Modal atribuir */}
      {(() => {
        const ped = atribPedido ? porId(atribPedido) : null;
        if (!ped) return null;
        const disp = motoboys.filter((m) => m.status === "disponivel").sort((a, b) => (a.disponivelDesde ?? 0) - (b.disponivelDesde ?? 0));
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Atribuir motoboy ao pedido ${ped.numero}`}>
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4">
              <h2 className="font-display text-lg font-bold">Atribuir Motoboy — #{ped.numero}</h2>
              <p className="mt-1 text-xs text-neutral-400">Sugestão: disponível há mais tempo. Atribuir NÃO confirma saída. Sem atribuição automática.</p>
              <ul className="mt-2 space-y-1.5">
                {disp.map((m) => (
                  <li key={m.id}>
                    <label className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${atribEscolha === m.id ? "border-yellow-400 bg-yellow-950" : "border-neutral-700"}`}>
                      <input type="radio" name="moto" checked={atribEscolha === m.id} onChange={() => setAtribEscolha(m.id)} className="size-4" />
                      <span className="flex-1"><b>{m.nome}</b> <span className="text-xs text-neutral-400">• Na base{m.baseKm != null ? ` (${m.baseKm.toFixed(1)} km)` : ""} • {m.entregasHoje} hoje{(paradasReservadas[m.id] ?? 0) > 0 ? ` • reservado (${paradasReservadas[m.id]})` : ""}</span></span>
                      {sug.id === m.id ? <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[11px] font-bold text-black">Sugerido</span> : null}
                    </label>
                  </li>
                ))}
                {disp.length === 0 ? <li className="text-sm text-red-300">Nenhum motoboy disponível — pedido aguarda.</li> : null}
              </ul>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAtribPedido(null)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Cancelar</button>
                <button type="button" onClick={confirmarAtribuicao} disabled={!atribEscolha} className="min-h-[48px] rounded-lg bg-yellow-500 px-3 font-bold text-black hover:bg-yellow-400 disabled:opacity-40">Atribuir (simulação)</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal confirmar saída */}
      {(() => {
        const ped = saidaPedido ? porId(saidaPedido) : null;
        if (!ped) return null;
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Confirmar saída do pedido ${ped.numero}`}>
            <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4">
              <h2 className="font-display text-lg font-bold">Confirmar Saída — #{ped.numero}</h2>
              <p className="mt-1 text-sm text-neutral-300">Motoboy: <b>{motoPorId(ped.motoboyId)?.nome ?? "—"}</b> • {ped.endereco}</p>
              <p className="mt-1 text-xs text-neutral-400">Previsão de chegada: {fmtHora(Date.now() + (ped.deslocMin ?? 15) * MIN)} (estimativa simulada, não é GPS).</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSaidaPedido(null)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Voltar</button>
                <button type="button" onClick={confirmarSaida} className="min-h-[48px] rounded-lg bg-sky-600 px-3 font-bold text-white hover:bg-sky-500">Saiu para entrega</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal histórico */}
      {(() => {
        const ped = histPedido ? porId(histPedido) : null;
        if (!ped) return null;
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Histórico do pedido ${ped.numero}`}>
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
              <h2 className="font-display text-lg font-bold">Histórico — #{ped.numero}</h2>
              <ul className="mt-2 space-y-1.5">
                <li className="rounded bg-neutral-800 px-2 py-1.5">Pronto: {fmtHora(ped.prontoEm)} • Prometido: {fmtHora(ped.prometidoEm)}</li>
                <li className="rounded bg-neutral-800 px-2 py-1.5">Saída: {ped.saidaEm ? fmtHora(ped.saidaEm) : "—"} • Motoboy: {motoPorId(ped.motoboyId)?.nome ?? "—"}</li>
                <li className="rounded bg-neutral-800 px-2 py-1.5">Entrega: {ped.entregueEm ? fmtHora(ped.entregueEm) : "—"}</li>
                <li className="rounded bg-neutral-800 px-2 py-1.5">{ped.itens.map((i) => `${i.qtd} ${i.sabor}`).join(" + ")} • Total {totalUnidades(ped)} un.</li>
              </ul>
              <button type="button" onClick={() => setHistPedido(null)} className="mt-2 min-h-[48px] w-full rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Fechar</button>
            </div>
          </div>
        );
      })()}

      {/* Modal nova rota */}
      {novaRotaAberta ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Criar nova rota">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">Criar Nova Rota (simulação)</h2>
            <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Motoboy</span>
              <select value={novaRotaMoto} onChange={(e) => setNovaRotaMoto(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2">
                <option value="">Escolher…</option>
                {motoboys.filter((m) => m.status !== "indisponivel").map((m) => <option key={m.id} value={m.id}>{m.nome} — {STATUS_LABEL[m.status]}{sug.id === m.id ? " (sugerido)" : ""}</option>)}
              </select>
            </label>
            <p className="mb-1 mt-2 text-xs text-neutral-400">Pedidos aguardando (máx. 3 sem confirmação)</p>
            <ul className="space-y-1.5">
              {aguardando.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 px-2 py-1.5 hover:bg-neutral-800">
                    <input type="checkbox" checked={novaRotaSel.includes(p.id)} onChange={(e) => setNovaRotaSel((prev) => e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id))} className="size-4" />
                    <span><b>#{p.numero}</b> {p.cliente} <span className="text-xs text-neutral-400">• {p.distanciaKm?.toFixed(1)} km • até {fmtHora(p.prometidoEm)}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            {novaRotaSel.length > 3 ? (
              <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-yellow-500 px-2 text-xs font-bold text-yellow-300">
                <input type="checkbox" checked={novaRotaExtra} onChange={(e) => setNovaRotaExtra(e.target.checked)} className="size-4" />
                Confirmo rota com mais de 3 paradas
              </label>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setNovaRotaAberta(false)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Cancelar</button>
              <button type="button" onClick={criarRota} className="min-h-[48px] rounded-lg bg-yellow-500 px-3 font-bold text-black hover:bg-yellow-400">Criar rota</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal editar rota */}
      {(() => {
        const rota = editRota ? rotas.find((r) => r.id === editRota) : null;
        if (!rota) return null;
        const stops = rota.paradas.map((id) => porId(id)).filter((p): p is PedidoCentral => !!p);
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Editar rota">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
              <h2 className="font-display text-lg font-bold">Editar Rota — {motoPorId(rota.motoboyId)?.nome}</h2>
              <p className="text-xs text-neutral-400">Reordene, remova, divida ou troque o motoboy. Horários prometidos nunca mudam sozinhos.</p>
              <ol className="mt-2 space-y-1.5">
                {stops.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-2 py-1.5">
                    <span className="grid size-5 place-items-center rounded-full bg-sky-700 text-[11px] font-bold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1"><b>#{p.numero}</b> {p.cliente}</span>
                    <button type="button" aria-label="Subir parada" onClick={() => moverParada(rota.id, i, -1)} className="rounded border border-neutral-600 p-1.5 hover:bg-neutral-700"><ChevronUp className="size-4" aria-hidden /></button>
                    <button type="button" aria-label="Descer parada" onClick={() => moverParada(rota.id, i, 1)} className="rounded border border-neutral-600 p-1.5 hover:bg-neutral-700"><ChevronDown className="size-4" aria-hidden /></button>
                    <button type="button" aria-label="Remover parada" onClick={() => removerParada(rota.id, p.id)} className="rounded border border-neutral-600 p-1.5 hover:bg-neutral-700"><Minus className="size-4" aria-hidden /></button>
                    <label className="flex items-center gap-1 text-[11px] text-neutral-400" title="Marcar para segunda rota na divisão">
                      <input type="checkbox" checked={dividirSel.includes(i)} onChange={(e) => setDividirSel((prev) => e.target.checked ? [...prev, i] : prev.filter((x) => x !== i))} className="size-3.5" /> B
                    </label>
                  </li>
                ))}
              </ol>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => dividirRotaAtiva(rota.id)} className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800">Dividir (marcadas → rota B)</button>
              </div>
              <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Trocar motoboy (antes da saída; em andamento exige confirmação)</span>
                <select value={editTroca} onChange={(e) => setEditTroca(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2">
                  {motoboys.filter((m) => m.status !== "indisponivel").map((m) => <option key={m.id} value={m.id}>{m.nome} — {STATUS_LABEL[m.status]}</option>)}
                </select>
              </label>
              {rota.situacao === "em-andamento" ? (
                <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-yellow-500 px-2 text-xs font-bold text-yellow-300">
                  <input type="checkbox" checked={editConfirma} onChange={(e) => setEditConfirma(e.target.checked)} className="size-4" />
                  Confirmo alterar rota em andamento
                </label>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setEditRota(null)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Fechar</button>
                <button type="button" onClick={() => trocarMotoboyRota(rota.id)} className="min-h-[48px] rounded-lg bg-sky-600 px-3 font-bold text-white hover:bg-sky-500">Aplicar troca</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal ocorrência */}
      {ocAberta ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Registrar ocorrência">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">Registrar Ocorrência</h2>
            <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Pedido (opcional)</span>
              <select value={ocPedido} onChange={(e) => setOcPedido(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2">
                <option value="">Geral</option>
                {pedidos.filter((p) => p.coluna !== "entregues").map((p) => <option key={p.id} value={p.id}>#{p.numero} — {p.cliente}</option>)}
              </select>
            </label>
            <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Tipo</span>
              <select value={ocTipo} onChange={(e) => setOcTipo(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2">
                {["Atraso no trajeto", "Cliente ausente", "Endereço incorreto", "Embalagem aberta", "Motoboy sem contato"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Descrição</span>
              <textarea value={ocDesc} onChange={(e) => setOcDesc(e.target.value)} rows={3} maxLength={300} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5" placeholder="Descreva…" />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOcAberta(false)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Cancelar</button>
              <button type="button" onClick={registrarOcorrencia} className="min-h-[48px] rounded-lg bg-yellow-500 px-3 font-bold text-black hover:bg-yellow-400">Registrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mapa em tela cheia */}
      {mapaCheio ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Mapa de entregas ampliado">
          <div className="mx-auto max-w-3xl rounded-xl border border-neutral-700 bg-neutral-900 p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="font-bold">Mapa de Entregas (simulação)</p>
              <button type="button" onClick={() => setMapaCheio(false)} className="ml-auto min-h-[44px] rounded-lg border border-neutral-600 px-3 text-sm font-bold hover:bg-neutral-800">Fechar</button>
            </div>
            <MapaSimulado pedidos={pedidos} selPedido={selPedido} selMotoboy={selMotoboy} rotas={rotasAtivas} zoom={zoom} onZoom={setZoom} onSelecionar={selecionarNoMapa} grande />
          </div>
        </div>
      ) : null}
    </div>
  );

  function Vazio({ texto }: { texto: string }) {
    return <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-xs text-neutral-500">{texto}</p>;
  }

  function Coluna({ titulo, sub, cabeca, cont, icone: Icone, children }: { titulo: string; sub: string; cabeca: string; cont: number; icone: LucideIcon; children: React.ReactNode }) {
    return (
      <section aria-label={titulo} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
        <div className={`flex items-center gap-2 px-3 py-2 ${cabeca}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${cabeca.includes("text-black") ? "bg-black/70 text-yellow-400" : "bg-white/20 text-white"}`} aria-hidden>
            <Icone className="size-4" />
          </span>
          <div className="leading-tight">
            <h2 className="font-display text-base font-extrabold">{titulo} ({cont})</h2>
            <p className={`text-[11px] ${cabeca.includes("text-black") ? "text-black/70" : "text-white/80"}`}>{sub}</p>
          </div>
        </div>
        <div className="max-h-[440px] space-y-2 overflow-y-auto p-2">{children}</div>
      </section>
    );
  }

  function LinhaPedidoComum({ p }: { p: PedidoCentral }) {
    return (
      <>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{p.endereco}</span>
          <span className="shrink-0">↔ {p.distanciaKm?.toFixed(1) ?? "?"} km</span>
        </p>
        <ul className="mt-1.5 space-y-0.5 text-[13px]">
          {p.itens.map((it, i) => <li key={i}><b>{it.qtd}</b> {it.sabor}</li>)}
        </ul>
        <p className="mt-1 text-right text-xs text-neutral-300">Total: <b>{totalUnidades(p)} un.</b></p>
        {p.obs ? <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[11px] text-amber-200">Obs.: {p.obs}</p> : null}
      </>
    );
  }

  function SeloAlerta({ p }: { p: PedidoCentral }) {
    const a = alertaPorId[p.id]!;
    if (a.estado === "atrasado") {
      return <span className="borda-atraso rounded border-2 border-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-red-400">ATRASADO {a.atrasoMin} MIN</span>;
    }
    if (a.estado === "risco") {
      return (
        <span className="rounded bg-yellow-500 px-1.5 py-0.5 text-[11px] font-extrabold text-black" title={a.previsaoEm ? `Previsão de chegada ${fmtHora(a.previsaoEm)}` : undefined}>
          RISCO DE ATRASO — {a.atrasoMin} MIN
        </span>
      );
    }
    if (a.estado === "sem-previsao") {
      return <span className="rounded border border-neutral-600 px-1.5 py-0.5 text-[11px] font-bold text-neutral-400">SEM PREVISÃO</span>;
    }
    return (
      <span className="rounded border border-green-700 px-1.5 py-0.5 text-[11px] font-bold text-green-300" title={a.previsaoEm ? `Previsão de chegada ${fmtHora(a.previsaoEm)}` : undefined}>
        NO PRAZO{a.previsaoEm ? ` • prev. ${fmtHora(a.previsaoEm)}` : ""}
      </span>
    );
  }

  function LinhaPrometido({ p, grande }: { p: PedidoCentral; grande?: boolean }) {
    const a = alertaPorId[p.id]!;
    const cor = a.estado === "atrasado" || a.estado === "risco" ? "text-red-400" : a.estado === "sem-previsao" ? "text-neutral-300" : "text-white";
    return (
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] text-neutral-400">
        <span>Pronto: <b className="text-neutral-200">{fmtHora(p.prontoEm)}</b></span>
        <span>Cliente até: <b className={`font-display ${grande ? "text-2xl" : "text-lg"} font-extrabold ${cor}`}>{fmtHora(p.prometidoEm)}</b></span>
      </p>
    );
  }

  function CartaoAguardando({ p, agora: ag, sel, ordem, onAtribuir, onMapa, onPriorizar }: { p: PedidoCentral; agora: number; sel: boolean; ordem: number; onAtribuir: () => void; onMapa: () => void; onPriorizar: () => void }) {
    void ag;
    return (
      <article className={`rounded-xl border bg-[#101013] p-2.5 ${emAtraso(p, agora) ? "borda-atraso border-2" : sel ? "border-2 border-yellow-400" : "border-amber-500/50"}`} aria-label={`Pedido ${p.numero} aguardando motoboy`}>
        <div className="flex items-center gap-1.5">
          <b className="font-display text-lg font-extrabold">#{p.numero}</b>
          {p.prioridadeManual ? <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-extrabold text-black">★ PRIORITÁRIO</span> : <span className="text-[11px] text-neutral-500">#{ordem} na fila</span>}
          <span className="ml-auto rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Entrega</span>
        </div>
        <p className="mt-0.5 text-xs">Cliente: <b>{p.cliente}</b></p>
        <LinhaPrometido p={p} grande />
        <SeloAlerta p={p} />
        <LinhaPedidoComum p={p} />
        <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1.5">
          <button type="button" onClick={onAtribuir} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-yellow-500 px-2 text-xs font-extrabold text-black hover:bg-yellow-400"><Plus className="size-4" aria-hidden /> Atribuir Motoboy</button>
          <button type="button" onClick={onMapa} aria-label={`Ver pedido ${p.numero} no mapa`} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-neutral-600 hover:bg-neutral-800"><MapPin className="size-4" aria-hidden /></button>
        </div>
        <button type="button" onClick={onPriorizar} aria-pressed={p.prioridadeManual} className="mt-1.5 flex min-h-[36px] w-full items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold text-neutral-400 hover:bg-neutral-800 hover:text-yellow-300">
          ☆ {p.prioridadeManual ? "Prioritário (toque p/ remover)" : "Priorizar despacho"}
        </button>
      </article>
    );
  }

  function CartaoAtribuido({ p, agora: ag, moto, onSaida, onRota }: { p: PedidoCentral; agora: number; moto: MotoboyCentral | null; onSaida: () => void; onRota: () => void }) {
    void ag;
    return (
      <article className="rounded-xl border border-sky-700/50 bg-[#101013] p-2.5" aria-label={`Pedido ${p.numero} atribuído`}>
        <div className="flex items-center gap-1.5">
          <b className="font-display text-lg font-extrabold">#{p.numero}</b>
          <span className="ml-auto rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Entrega</span>
        </div>
        <p className="mt-0.5 text-xs">Cliente: <b>{p.cliente}</b></p>
        <p className="mt-0.5 text-[11px] text-neutral-400">Saída prevista: <b className="text-green-300">{p.saidaPrevistaEm ? fmtHora(p.saidaPrevistaEm) : "—"}</b></p>
        <LinhaPedidoComum p={p} />
        <p className="mt-1 flex items-center gap-1.5 text-xs text-sky-200"><Bike className="size-3.5" aria-hidden /> Motoboy: <b>{moto?.nome ?? "—"}</b><span className="size-1.5 rounded-full bg-green-500" aria-hidden /></p>
        <p className="text-[11px] text-neutral-500">Atribuído ≠ saiu. Saída exige confirmação.</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onSaida} className="min-h-[44px] rounded-lg bg-sky-600 px-2 text-xs font-bold text-white hover:bg-sky-500">Confirmar Saída</button>
          <button type="button" onClick={onRota} className="min-h-[44px] rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800">Ver Rota</button>
        </div>
      </article>
    );
  }

  function CartaoRota({ p, agora: ag, moto, onMapa, onConcluir }: { p: PedidoCentral; agora: number; moto: MotoboyCentral | null; onMapa: () => void; onConcluir: () => void }) {
    const prev = p.chegadaPrevistaEm ? fmtHora(p.chegadaPrevistaEm) : "—";
    return (
      <article className={`rounded-xl border bg-[#101013] p-2.5 ${emAtraso(p, ag) ? "borda-atraso border-2" : "border-purple-700/60"}`} aria-label={`Pedido ${p.numero} em rota`}>
        <div className="flex items-center gap-1.5">
          <b className="font-display text-lg font-extrabold">#{p.numero}</b>
          <span className="ml-auto rounded bg-purple-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Em Rota</span>
        </div>
        <p className="mt-0.5 text-xs">Cliente: <b>{p.cliente}</b></p>
        <p className="mt-0.5 text-[11px] text-neutral-400">Saiu às <b className="text-neutral-200">{p.saidaEm ? fmtHora(p.saidaEm) : "—"}</b> • Previsão: <b className="text-neutral-200">{prev}</b>{p.deslocMin != null ? ` (${p.deslocMin} min)` : " (sem dado confiável)"}</p>
        <SeloAlerta p={p} />
        <LinhaPedidoComum p={p} />
        <p className="mt-1 flex items-center gap-1.5 text-xs text-purple-200"><Bike className="size-3.5" aria-hidden /> Motoboy: <b>{moto?.nome ?? "—"}</b></p>
        <button type="button" onClick={onMapa} className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800">Acompanhar no Mapa</button>
        <button type="button" onClick={onConcluir} className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-green-700 px-2 text-xs font-bold hover:bg-green-600"><Check className="size-4" aria-hidden /> Concluir entrega (simulação)</button>
      </article>
    );
  }

  function CartaoEntregue({ p, moto, onHist }: { p: PedidoCentral; moto: MotoboyCentral | null; onHist: () => void }) {
    return (
      <article className="rounded-xl border border-green-800/60 bg-[#101013] p-2.5" aria-label={`Pedido ${p.numero} entregue`}>
        <div className="flex items-center gap-1.5">
          <b className="font-display text-lg font-extrabold">#{p.numero}</b>
          <span className="ml-auto rounded bg-green-700 px-1.5 py-0.5 text-[11px] font-bold text-white">Entregue</span>
        </div>
        <p className="mt-0.5 text-xs">Cliente: <b>{p.cliente}</b></p>
        <p className="mt-0.5 text-[11px] text-neutral-400">Entregue às <b className="text-green-300">{p.entregueEm ? fmtHora(p.entregueEm) : "—"}</b></p>
        <LinhaPedidoComum p={p} />
        <p className="mt-1 text-xs text-green-200">Motoboy: <b>{moto?.nome ?? "—"}</b></p>
        <button type="button" onClick={onHist} className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"><History className="size-3.5" aria-hidden /> Consultar histórico</button>
      </article>
    );
  }

  function LinhaMotoboy({ m, agora: ag, sugerido, atribuidas, reservado, onAtribuir, onRota, onChegada }: {
    m: MotoboyCentral; agora: number; sugerido: boolean; atribuidas: number; reservado: number;
    onAtribuir: () => void; onRota: () => void; onChegada: () => void;
  }) {
    const desat = localizacaoDesatualizada(m, ag);
    const dot = m.status === "disponivel" ? "bg-green-500" : m.status === "em-rota" ? "bg-yellow-500" : m.status === "retornando" ? "bg-sky-500" : "bg-neutral-500";
    const reservadoRota = m.status === "disponivel" && reservado > 0;
    return (
      <li className="flex items-center gap-2 rounded-lg bg-neutral-800/50 px-2 py-1.5 text-xs">
        <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="min-w-0 flex-1 leading-tight">
          <b className="block text-[13px]">{m.nome} {sugerido ? <span className="rounded bg-yellow-400 px-1 text-[10px] font-bold text-black">sugerido</span> : null} {reservadoRota ? <span className="rounded border border-yellow-500 px-1 text-[10px] font-bold text-yellow-300">reservado ({reservado})</span> : null}</b>
          <span className="text-neutral-400">{STATUS_LABEL[m.status]}{m.status === "disponivel" && m.baseKm != null ? ` • Na base (${m.baseKm.toFixed(1)} km)` : ""}{m.status === "em-rota" ? ` • ${atribuidas} entrega(s)` : ""}{m.status === "retornando" ? " • aguardando confirmação de chegada" : ""}</span>
          {desat ? <span className="block font-bold text-orange-300">Localização desatualizada (simulação)</span> : null}
        </span>
        {m.status === "disponivel" ? (
          <button type="button" onClick={onAtribuir} className="min-h-[40px] shrink-0 rounded-lg bg-yellow-500 px-3 font-extrabold text-black hover:bg-yellow-400">Atribuir</button>
        ) : m.status === "retornando" ? (
          <button type="button" onClick={onChegada} className="min-h-[40px] shrink-0 rounded-lg bg-sky-600 px-3 font-bold text-white hover:bg-sky-500">Chegou</button>
        ) : m.status === "em-rota" ? (
          <button type="button" onClick={onRota} className="min-h-[40px] shrink-0 rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-700">Ver rota</button>
        ) : (
          <span className="shrink-0 rounded-lg border border-neutral-700 px-3 py-2 text-neutral-500">Indisponível</span>
        )}
      </li>
    );
  }

  function MapaSimulado({ pedidos: peds, selPedido: selP, selMotoboy: selM, rotas: rts, zoom: z, onZoom, onSelecionar, grande }: {
    pedidos: PedidoCentral[]; selPedido: string | null; selMotoboy: string | null; rotas: RotaDia[];
    zoom: number; onZoom: (z: number) => void; onSelecionar: (id: string) => void; grande?: boolean;
  }) {
    const rotaSel = selM ? rts.find((r) => r.motoboyId === selM) : null;
    const rotaDoPedido = !rotaSel && selP ? rts.find((r) => r.paradas.includes(selP)) : null;
    const rotaDest = rotaSel ?? rotaDoPedido ?? null;
    const loja = COORDS["loja"]!;
    const pts = rotaDest ? [loja, ...rotaDest.paradas.map((id) => COORDS[id]).filter((c): c is { x: number; y: number } => !!c)] : [];
    const poly = pts.map((c) => `${c.x},${c.y}`).join(" ");
    const emDestaque = new Set(rotaDest ? rotaDest.paradas : []);
    const haSelecao = selM != null || selP != null;
    return (
      <div>
        <div className="flex flex-wrap gap-1 px-2.5 text-[10px] text-neutral-400" aria-label="Legenda do mapa">
          {[["Loja", "#eab308"], ["Aguardando", "#eab308"], ["Atribuído", "#0284c7"], ["Em Rota", "#9333ea"], ["Entregue", "#16a34a"]].map(([l, c]) => (
            <span key={l} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: c }} aria-hidden />{l}</span>
          ))}
          <span className="ml-auto font-bold text-yellow-300">SIMULAÇÃO — sem GPS real</span>
        </div>
        <div className="relative">
          <svg viewBox="0 0 400 320" className={`w-full ${grande ? "" : "h-64"} rounded-b-xl bg-[#0b0e13]`} role="img" aria-label="Mapa simulado das entregas">
            {Array.from({ length: 9 }).map((_, i) => (
              <Fragment key={`v${i}`}>
                <line x1={40 * (i + 1)} y1={0} x2={40 * (i + 1) - 30} y2={320} stroke="#1a2230" strokeWidth={i % 3 === 0 ? 3 : 1.5} />
                <line x1={0} y1={40 * (i + 1)} x2={400} y2={40 * (i + 1) - 20} stroke="#1a2230" strokeWidth={i % 3 === 0 ? 3 : 1.5} />
              </Fragment>
            ))}
            {/* Avenidas principais (traço claro, dados ilustrativos) */}
            <path d="M0 250 L400 180" stroke="#8a6d1c" strokeWidth={2} opacity={0.7} />
            <path d="M60 0 L200 320" stroke="#8a6d1c" strokeWidth={2} opacity={0.5} />
            <path d="M0 100 L400 130" stroke="#243044" strokeWidth={2.5} opacity={0.9} />
            <text x={24} y={52} fill="#475569" fontSize={10} letterSpacing={1}>JARDIM AMÉRICA</text>
            <text x={286} y={104} fill="#475569" fontSize={10} letterSpacing={1}>VILA NOVA</text>
            <text x={248} y={238} fill="#475569" fontSize={10} letterSpacing={1}>CENTRO</text>
            <text x={250} y={306} fill="#475569" fontSize={10} letterSpacing={1}>SETOR SUL</text>
            <g transform={`translate(200 160) scale(${z}) translate(-200 -160)`}>
              {poly.split(" ").length > 1 ? <polyline points={poly} fill="none" stroke="#eab308" strokeWidth={2.5} strokeDasharray="7 5" opacity={0.9} /> : null}
              <g>
                <circle cx={loja.x} cy={loja.y} r={13} fill="#eab308" />
                <text x={loja.x} y={loja.y + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#000">N</text>
                <text x={loja.x} y={loja.y + 26} textAnchor="middle" fontSize={9} fill="#eab308">Loja Néia</text>
              </g>
              {peds.filter((p) => p.coluna !== "entregues").map((p, i) => {
                const c = COORDS[p.id];
                if (!c) return null;
                const cor = COR_COLUNA[p.coluna];
                const ehSel = selP === p.id;
                const naRota = emDestaque.has(p.id);
                const apagado = haSelecao && !naRota && !ehSel;
                return (
                  <g key={p.id} onClick={() => onSelecionar(p.id)} style={{ cursor: "pointer" }} opacity={apagado ? 0.35 : 1}>
                    {ehSel ? <circle cx={c.x} cy={c.y} r={13} fill="none" stroke="#fff" strokeWidth={2} className="pulso" /> : naRota ? <circle cx={c.x} cy={c.y} r={12} fill="none" stroke="#fff" strokeWidth={1.5} /> : null}
                    <circle cx={c.x} cy={c.y} r={9} fill={cor} stroke="#000" strokeWidth={1.5} />
                    <text x={c.x} y={c.y + 3.5} textAnchor="middle" fontSize={9} fontWeight="bold" fill={p.coluna === "aguardando" ? "#000" : "#fff"}>{i + 1}</text>
                    <text x={c.x} y={c.y - 12} textAnchor="middle" fontSize={8.5} fill="#e2e8f0">#{p.numero}</text>
                  </g>
                );
              })}
              {rts.filter((r) => r.paradas.length > 0).map((r) => {
                const key = r.paradas[r.paradas.length - 1] ?? "";
                const cc: { x: number; y: number } | undefined = COORDS[key];
                if (!cc) return null;
                const inicial = (r.motoboyId.split("-")[1]?.[0] ?? "?").toUpperCase();
                return (
                  <g key={`moto-${r.id}`}>
                    <rect x={cc.x + 10} y={cc.y - 26} width={18} height={18} rx={9} fill="#0b0e13" stroke="#eab308" strokeWidth={1.5} />
                    <text x={cc.x + 19} y={cc.y - 13} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#eab308">{inicial}</text>
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="absolute bottom-2 right-2 flex flex-col gap-1">
            <button type="button" onClick={() => onZoom(Math.min(2, Math.round((z + 0.25) * 100) / 100))} aria-label="Ampliar mapa" className="grid size-9 place-items-center rounded-lg border border-neutral-600 bg-black/70 text-lg font-bold hover:bg-neutral-800">+</button>
            <button type="button" onClick={() => onZoom(Math.max(0.75, Math.round((z - 0.25) * 100) / 100))} aria-label="Reduzir mapa" className="grid size-9 place-items-center rounded-lg border border-neutral-600 bg-black/70 text-lg font-bold hover:bg-neutral-800">−</button>
          </div>
        </div>
        <p className="px-2.5 py-1.5 text-[11px] text-neutral-500">Toque num destino para destacar • selecione um motoboy para ver sua rota • zoom {Math.round(z * 100)}%</p>
      </div>
    );
  }
}
