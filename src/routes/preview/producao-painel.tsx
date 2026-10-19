import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  bloqueioCritico,
  embalar,
  jaNotificado,
  podeFinalizar,
  pontuar,
  recomendar,
  resumirFritura,
} from "@/lib/preview-producao";
import {
  BarChart3,
  Bell,
  Bike,
  BookOpen,
  Check,
  ChefHat,
  ChevronDown,
  ClipboardList,
  Clock,
  Crown,
  DollarSign,
  Home,
  Map as MapIcon,
  MapPin,
  Pause,
  Phone,
  Play,
  Printer,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Soup,
  TriangleAlert,
  User,
  Users,
  Package,
  type LucideIcon,
} from "lucide-react";

/**
 * PREVIEW ONLY — Painel de Produção K7.2 (layout definitivo aprovado em imagem).
 * Rota: /preview/producao-painel. 100% fictício, estado local.
 * NÃO lê/escreve Supabase, NÃO altera /producao, NÃO cria migration,
 * NÃO faz commit/push/deploy. Sem <img> de produtos/equipe.
 */

export const Route = createFileRoute("/preview/producao-painel")({
  head: () => ({ meta: [{ title: "Preview — Painel de Produção" }] }),
  component: PreviewProducaoPainel,
});

const MIN = 60000;

type ItemMock = { sabor: string; qtd: number; tipo: "frito" | "assado" };
type BlocoItem = { sabor: string; qtd: number };
type Bloco = {
  id: string;
  itemIdx: number;
  rotulo: string;
  qtd: number;
  feito: boolean;
  composicao: BlocoItem[];
};
type EstadoFinal =
  | "aguardando-retirada"
  | "aguardando-motoboy"
  | "motoboy-atribuido"
  | "saiu"
  | "entregue";
type PedidoMock = {
  id: string;
  numero: number;
  cliente: string;
  telefone: string;
  tipo: "entrega" | "retirada";
  endereco?: string;
  distanciaKm?: number;
  recebidoEm: number;
  prometidoEm: number;
  etaRotaMin: number | null;
  vencimentoEm: number;
  agendado: boolean;
  obs?: string;
  extras?: string[];
  prioridadeManual: boolean;
  itens: ItemMock[];
  coluna: "proximos" | "preparo" | "finalizados";
  blocos: Bloco[];
  conferencia: boolean;
  pausado: boolean;
  finalizado: {
    estado: EstadoFinal;
    motoboy?: string | undefined;
    saidaEm?: number | undefined;
    solicitado?: boolean;
  } | null;
};

type MotoboyMock = { nome: string; baseKm: number; emRota: boolean };

const MOTOBOYS_INI: MotoboyMock[] = [
  { nome: "Carlos", baseKm: 1.2, emRota: false },
  { nome: "Ana", baseKm: 2.1, emRota: false },
  { nome: "Marcos", baseKm: 0.8, emRota: true },
];

function blocosDe(itens: ItemMock[], prefixo: string): Bloco[] {
  const fila = itens.map((it, idx) => ({ ...it, idx }));
  const out: Bloco[] = [];
  let n = 1;
  while (fila.some((f) => f.qtd > 0)) {
    let resto = 50;
    const comp: BlocoItem[] = [];
    let principal = -1;
    for (const f of fila) {
      if (f.qtd <= 0 || resto <= 0) continue;
      const pega = Math.min(f.qtd, resto);
      comp.push({ sabor: f.sabor, qtd: pega });
      if (principal < 0) principal = f.idx;
      f.qtd -= pega;
      resto -= pega;
    }
    const total = comp.reduce((s, c) => s + c.qtd, 0);
    out.push({
      id: `${prefixo}-b${n}`,
      itemIdx: principal,
      rotulo: `Bloco ${n} — ${total} un.`,
      qtd: total,
      feito: false,
      composicao: comp,
    });
    n += 1;
  }
  return out;
}

function mocks(
  base: number,
): Array<Omit<PedidoMock, "prometidoEm" | "etaRotaMin" | "prioridadeManual">> {
  return [
    {
      id: "p1257",
      numero: 1257,
      cliente: "Fernanda Lima",
      telefone: "(11) 95555-6666",
      tipo: "entrega",
      endereco: "Rua das Acácias, 456 - Centro",
      distanciaKm: 3.2,
      recebidoEm: base - 40 * MIN,
      vencimentoEm: base - 25 * MIN,
      agendado: false,
      obs: "Sem orégano.",
      itens: [
        { sabor: "Coxinha de Frango", qtd: 25, tipo: "frito" },
        { sabor: "Kibe", qtd: 20, tipo: "frito" },
        { sabor: "Risole de Queijo", qtd: 20, tipo: "frito" },
      ],
      coluna: "proximos",
      blocos: [],
      conferencia: false,
      pausado: false,
      finalizado: null,
    },
    {
      id: "p1258",
      numero: 1258,
      cliente: "João Santos",
      telefone: "(11) 91234-5678",
      tipo: "entrega",
      endereco: "Rua das Flores, 123 - Centro",
      distanciaKm: 2.8,
      recebidoEm: base - 10 * MIN,
      vencimentoEm: base + 20 * MIN,
      agendado: false,
      obs: "Tocar o interfone. Prédio azul.",
      itens: [
        { sabor: "Coxinha de Frango", qtd: 50, tipo: "frito" },
        { sabor: "Risole de Presunto e Queijo", qtd: 25, tipo: "frito" },
        { sabor: "Enroladinho de Salsicha", qtd: 25, tipo: "frito" },
      ],
      coluna: "proximos",
      blocos: [],
      conferencia: false,
      pausado: false,
      finalizado: null,
    },
    {
      id: "p1260",
      numero: 1260,
      cliente: "Ana Costa",
      telefone: "(11) 99876-5432",
      tipo: "retirada",
      recebidoEm: base - 5 * MIN,
      vencimentoEm: base + 35 * MIN,
      agendado: false,
      obs: "Sem pimenta.",
      itens: [
        { sabor: "Coxinha de Frango", qtd: 30, tipo: "frito" },
        { sabor: "Kibe", qtd: 20, tipo: "frito" },
      ],
      coluna: "proximos",
      blocos: [],
      conferencia: false,
      pausado: false,
      finalizado: null,
    },
    {
      id: "p1256",
      numero: 1256,
      cliente: "Carlos Oliveira",
      telefone: "(11) 97777-8888",
      tipo: "entrega",
      endereco: "Rua São Paulo, 789 - Vila Nova",
      distanciaKm: 2.1,
      recebidoEm: base - 30 * MIN,
      vencimentoEm: base + 5 * MIN,
      agendado: false,
      obs: "Adicionar maionese extra.",
      extras: ["Maionese extra"],
      itens: [
        { sabor: "Coxinha de Frango", qtd: 30, tipo: "frito" },
        { sabor: "Kibe", qtd: 20, tipo: "frito" },
        { sabor: "Risole de Queijo", qtd: 20, tipo: "frito" },
      ],
      coluna: "preparo",
      blocos: [
        {
          id: "p1256-b1",
          itemIdx: 0,
          rotulo: "Combo 1 — 50 un.",
          qtd: 50,
          feito: true,
          composicao: [
            { sabor: "Coxinha de Frango", qtd: 30 },
            { sabor: "Kibe", qtd: 20 },
          ],
        },
        {
          id: "p1256-b2",
          itemIdx: 2,
          rotulo: "Combo 2 — 20 un.",
          qtd: 20,
          feito: false,
          composicao: [{ sabor: "Risole de Queijo", qtd: 20 }],
        },
      ],
      conferencia: false,
      pausado: false,
      finalizado: null,
    },
    {
      id: "p1261",
      numero: 1261,
      cliente: "Roberto Alves",
      telefone: "(11) 93333-4444",
      tipo: "retirada",
      recebidoEm: base - 12 * MIN,
      vencimentoEm: base + 10 * MIN,
      agendado: false,
      obs: "Entregar no portão.",
      extras: ["Sachês de ketchup (4)"],
      itens: [
        { sabor: "Enroladinho de Salsicha", qtd: 40, tipo: "frito" },
        { sabor: "Kibe", qtd: 20, tipo: "frito" },
      ],
      coluna: "preparo",
      blocos: [
        {
          id: "p1261-b1",
          itemIdx: 0,
          rotulo: "Combo 1 — 50 un.",
          qtd: 50,
          feito: false,
          composicao: [
            { sabor: "Enroladinho de Salsicha", qtd: 40 },
            { sabor: "Kibe", qtd: 10 },
          ],
        },
        {
          id: "p1261-b2",
          itemIdx: 1,
          rotulo: "Combo 2 — 10 un.",
          qtd: 10,
          feito: false,
          composicao: [{ sabor: "Kibe", qtd: 10 }],
        },
      ],
      conferencia: false,
      pausado: false,
      finalizado: null,
    },
    {
      id: "p1262",
      numero: 1262,
      cliente: "Juliana Ferreira",
      telefone: "(11) 98888-9999",
      tipo: "entrega",
      endereco: "Rua das Palmeiras, 100 - Centro",
      distanciaKm: 1.5,
      recebidoEm: base - 8 * MIN,
      vencimentoEm: base + 15 * MIN,
      agendado: true,
      itens: [
        { sabor: "Coxinha de Frango", qtd: 25, tipo: "frito" },
        { sabor: "Bolinha de Queijo", qtd: 25, tipo: "assado" },
      ],
      coluna: "preparo",
      blocos: [
        {
          id: "p1262-b1",
          itemIdx: 0,
          rotulo: "Bloco 1 — 25 un.",
          qtd: 25,
          feito: true,
          composicao: [{ sabor: "Coxinha de Frango", qtd: 25 }],
        },
        {
          id: "p1262-b2",
          itemIdx: 1,
          rotulo: "Bloco 1 — 25 un.",
          qtd: 25,
          feito: false,
          composicao: [{ sabor: "Bolinha de Queijo", qtd: 25 }],
        },
      ],
      conferencia: false,
      pausado: false,
      finalizado: null,
    },
    {
      id: "p1254",
      numero: 1254,
      cliente: "Juliana Pereira",
      telefone: "(11) 94444-5555",
      tipo: "entrega",
      endereco: "Rua Bela Vista, 321 - Jardim",
      distanciaKm: 2.8,
      recebidoEm: base - 50 * MIN,
      vencimentoEm: base - 10 * MIN,
      agendado: false,
      itens: [
        { sabor: "Coxinha de Frango", qtd: 20, tipo: "frito" },
        { sabor: "Kibe", qtd: 20, tipo: "frito" },
      ],
      coluna: "finalizados",
      blocos: [
        {
          id: "p1254-b1",
          itemIdx: 0,
          rotulo: "Bloco 1 — 20 un.",
          qtd: 20,
          feito: true,
          composicao: [{ sabor: "Coxinha de Frango", qtd: 20 }],
        },
        {
          id: "p1254-b2",
          itemIdx: 1,
          rotulo: "Bloco 1 — 20 un.",
          qtd: 20,
          feito: true,
          composicao: [{ sabor: "Kibe", qtd: 20 }],
        },
      ],
      conferencia: true,
      pausado: false,
      finalizado: { estado: "aguardando-motoboy" },
    },
    {
      id: "p1255",
      numero: 1255,
      cliente: "Marcos Souza",
      telefone: "(11) 96666-7777",
      tipo: "entrega",
      endereco: "Rua das Flores, 123 - Centro",
      distanciaKm: 3.5,
      recebidoEm: base - 45 * MIN,
      vencimentoEm: base - 5 * MIN,
      agendado: false,
      itens: [{ sabor: "Coxinha de Frango", qtd: 50, tipo: "frito" }],
      coluna: "finalizados",
      blocos: [
        {
          id: "p1255-b1",
          itemIdx: 0,
          rotulo: "Combo 1 — 50 un.",
          qtd: 50,
          feito: true,
          composicao: [{ sabor: "Coxinha de Frango", qtd: 50 }],
        },
      ],
      conferencia: true,
      pausado: false,
      finalizado: { estado: "aguardando-motoboy" },
    },
    {
      id: "p1252",
      numero: 1252,
      cliente: "Patrícia Mendes",
      telefone: "(11) 98888-9999",
      tipo: "entrega",
      endereco: "Rua do Sol, 456 - Vila Nova",
      distanciaKm: 2.8,
      recebidoEm: base - 70 * MIN,
      vencimentoEm: base - 20 * MIN,
      agendado: false,
      itens: [
        { sabor: "Risole de Presunto e Queijo", qtd: 30, tipo: "frito" },
        { sabor: "Bolinha de Queijo", qtd: 30, tipo: "assado" },
      ],
      coluna: "finalizados",
      blocos: [
        {
          id: "p1252-b1",
          itemIdx: 0,
          rotulo: "Bloco 1 — 30 un.",
          qtd: 30,
          feito: true,
          composicao: [{ sabor: "Risole de Presunto e Queijo", qtd: 30 }],
        },
        {
          id: "p1252-b2",
          itemIdx: 1,
          rotulo: "Bloco 1 — 30 un.",
          qtd: 30,
          feito: true,
          composicao: [{ sabor: "Bolinha de Queijo", qtd: 30 }],
        },
      ],
      conferencia: true,
      pausado: false,
      finalizado: { estado: "saiu", motoboy: "Marcos", saidaEm: base - 14 * MIN },
    },
    {
      id: "p1253",
      numero: 1253,
      cliente: "José Carlos",
      telefone: "(11) 91234-0000",
      tipo: "entrega",
      endereco: "Rua das Palmeiras, 789 - Centro",
      distanciaKm: 2.5,
      recebidoEm: base - 90 * MIN,
      vencimentoEm: base - 40 * MIN,
      agendado: false,
      itens: [{ sabor: "Coxinha de Frango", qtd: 20, tipo: "frito" }],
      coluna: "finalizados",
      blocos: [
        {
          id: "p1253-b1",
          itemIdx: 0,
          rotulo: "Bloco 1 — 20 un.",
          qtd: 20,
          feito: true,
          composicao: [{ sabor: "Coxinha de Frango", qtd: 20 }],
        },
      ],
      conferencia: true,
      pausado: false,
      finalizado: { estado: "motoboy-atribuido", motoboy: "Ana" },
    },
    {
      id: "p1249",
      numero: 1249,
      cliente: "José Carlos",
      telefone: "(11) 91234-0000",
      tipo: "entrega",
      endereco: "Rua das Palmeiras, 789 - Centro",
      distanciaKm: 2.8,
      recebidoEm: base - 100 * MIN,
      vencimentoEm: base - 50 * MIN,
      agendado: false,
      itens: [{ sabor: "Coxinha de Frango", qtd: 20, tipo: "frito" }],
      coluna: "finalizados",
      blocos: [
        {
          id: "p1249-b1",
          itemIdx: 0,
          rotulo: "Bloco 1 — 20 un.",
          qtd: 20,
          feito: true,
          composicao: [{ sabor: "Coxinha de Frango", qtd: 20 }],
        },
      ],
      conferencia: true,
      pausado: false,
      finalizado: { estado: "entregue", motoboy: "Carlos", saidaEm: base - 60 * MIN },
    },
    {
      id: "p1248",
      numero: 1248,
      cliente: "Paulo Rocha",
      telefone: "(11) 90000-0000",
      tipo: "retirada",
      recebidoEm: base - 180 * MIN,
      vencimentoEm: base - 120 * MIN,
      agendado: false,
      itens: [{ sabor: "Kibe", qtd: 20, tipo: "frito" }],
      coluna: "finalizados",
      blocos: [
        {
          id: "p1248-b1",
          itemIdx: 0,
          rotulo: "Bloco 1 — 20 un.",
          qtd: 20,
          feito: true,
          composicao: [{ sabor: "Kibe", qtd: 20 }],
        },
      ],
      conferencia: true,
      pausado: false,
      finalizado: { estado: "aguardando-retirada" },
    },
  ];
}

const ETAS: Record<string, number> = {
  p1257: 15,
  p1258: 12,
  p1256: 10,
  p1262: 8,
  p1254: 14,
  p1255: 16,
  p1252: 18,
  p1253: 12,
  p1249: 6,
};

function montar(base: number): PedidoMock[] {
  return mocks(base).map((o) => {
    const eta = o.tipo === "entrega" ? (ETAS[o.id] ?? null) : null;
    const prometidoEm = o.vencimentoEm + (eta ?? 0) * MIN;
    return { ...o, prometidoEm, etaRotaMin: eta, prioridadeManual: false };
  });
}

type Problema = {
  id: string;
  pedidoId: string;
  categoria: string;
  descricao: string;
  gravidade: "baixa" | "media" | "critica";
  item?: string | undefined;
  resolvido: boolean;
};

type Notificacao = { pedidoId: string; texto: string; quando: number };

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

export function PreviewProducaoPainel() {
  const [pedidos, setPedidos] = useState<PedidoMock[]>(() => montar(Date.now()));
  const [motoboys] = useState<MotoboyMock[]>(MOTOBOYS_INI);
  const [motoboysLigados, setMotoboysLigados] = useState(true);
  const [aba, setAba] = useState<"todos" | "retirada" | "entrega" | "agendados">("todos");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"horario" | "atrasados" | "maior">("horario");
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [soObs, setSoObs] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [notifs, setNotifs] = useState<Notificacao[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [confAberto, setConfAberto] = useState<string | null>(null);
  const [embOk, setEmbOk] = useState(false);
  const [aprovado, setAprovado] = useState(false);
  const [probAberto, setProbAberto] = useState<string | null>(null);
  const [probCat, setProbCat] = useState("Produto insuficiente");
  const [probDesc, setProbDesc] = useState("");
  const [probGrav, setProbGrav] = useState<"baixa" | "media" | "critica">("media");
  const [probItem, setProbItem] = useState("");
  const [modoCozinha, setModoCozinha] = useState(false);
  const [abaMobile, setAbaMobile] = useState<0 | 1 | 2>(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [comandaId, setComandaId] = useState<string | null>(null);
  const [reimp, setReimp] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const disponiveis = motoboysLigados ? motoboys.filter((m) => !m.emRota) : [];
  const emRota = motoboys.filter((m) => m.emRota);
  const prontasAguardando = pedidos.filter(
    (p) => p.coluna === "finalizados" && p.finalizado?.estado === "aguardando-motoboy",
  ).length;

  function atrasoDe(p: PedidoMock): number {
    return Math.max(0, Math.round((agora - p.vencimentoEm) / MIN));
  }
  function emAndamento(p: PedidoMock) {
    return p.coluna !== "finalizados";
  }

  const visiveis = useMemo(() => {
    const atraso = (p: PedidoMock) => Math.max(0, Math.round((agora - p.vencimentoEm) / MIN));
    const t = busca.trim().toLowerCase();
    let lista = pedidos.filter((p) => {
      if (aba === "retirada" && p.tipo !== "retirada") return false;
      if (aba === "entrega" && p.tipo !== "entrega") return false;
      if (aba === "agendados" && !p.agendado) return false;
      if (soAtrasados && !(emAndamento(p) && atraso(p) > 0)) return false;
      if (soObs && !p.obs) return false;
      if (
        t &&
        !`${p.numero} ${p.cliente} ${p.itens.map((i) => i.sabor).join(" ")}`
          .toLowerCase()
          .includes(t)
      )
        return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      if (ordem === "atrasados") return atraso(b) - atraso(a) || a.vencimentoEm - b.vencimentoEm;
      if (ordem === "maior") return totalDe(b) - totalDe(a);
      return a.vencimentoEm - b.vencimentoEm;
    });
    return lista;
  }, [pedidos, aba, busca, ordem, soAtrasados, soObs, agora]);

  function totalDe(p: PedidoMock) {
    return p.itens.reduce((s, i) => s + i.qtd, 0);
  }
  function fritosDe(p: PedidoMock) {
    return p.itens.filter((i) => i.tipo === "frito").reduce((s, i) => s + i.qtd, 0);
  }
  function assadosDe(p: PedidoMock) {
    return p.itens.filter((i) => i.tipo === "assado").reduce((s, i) => s + i.qtd, 0);
  }

  const col = (c: PedidoMock["coluna"]) => visiveis.filter((p) => p.coluna === c);
  const nAtraso = pedidos.filter((p) => emAndamento(p) && atrasoDe(p) > 0).length;
  const nProblemas = problemas.filter((p) => !p.resolvido).length;

  const recomendado = useMemo(
    () =>
      recomendar(
        pedidos.filter((p) => p.coluna === "proximos"),
        agora,
      ),
    [pedidos, agora],
  );

  const resumo = useMemo(() => resumirFritura(pedidos, agora), [pedidos, agora]);

  function patch(id: string, fn: (p: PedidoMock) => PedidoMock) {
    setPedidos((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }

  function alternarPrioridade(id: string) {
    patch(id, (p) => ({ ...p, prioridadeManual: !p.prioridadeManual }));
  }

  function abrirProblema(id: string) {
    setProbAberto(id);
    setProbCat("Produto insuficiente");
    setProbDesc("");
    setProbGrav("media");
    setProbItem("");
  }

  function confirmarProblema() {
    if (!probAberto || probDesc.trim().length < 3) {
      setAviso("Descreva o problema (mínimo 3 caracteres).");
      return;
    }
    const id = `prob-${Date.now()}`;
    setProblemas((prev) => [
      ...prev,
      {
        id,
        pedidoId: probAberto,
        categoria: probCat,
        descricao: probDesc.trim(),
        gravidade: probGrav,
        item: probItem || undefined,
        resolvido: false,
      },
    ]);
    setProbAberto(null);
    setAviso("Problema registrado no pedido (simulação local, sem travar outros pedidos).");
  }

  function resolverProblema(id: string) {
    setProblemas((prev) => prev.map((p) => (p.id === id ? { ...p, resolvido: true } : p)));
    setAviso("Problema resolvido (simulação de perfil administrador).");
  }

  function problemasDe(pedidoId: string) {
    return problemas.filter((p) => p.pedidoId === pedidoId && !p.resolvido);
  }

  function iniciarPreparo(id: string) {
    patch(id, (p) => ({
      ...p,
      coluna: "preparo",
      blocos: p.blocos.length > 0 ? p.blocos : blocosDe(p.itens, id),
    }));
    setAviso(null);
  }
  function alternarBloco(id: string, blocoId: string) {
    patch(id, (p) => ({
      ...p,
      blocos: p.blocos.map((b) => (b.id === blocoId ? { ...b, feito: !b.feito } : b)),
    }));
  }
  function finalizarCombo(id: string) {
    patch(id, (p) => ({ ...p, blocos: p.blocos.map((b) => ({ ...b, feito: true })) }));
  }
  function elegivel(p: PedidoMock): { ok: boolean; motivos: string[] } {
    return podeFinalizar(
      p.blocos,
      true,
      problemas.some((x) => x.pedidoId === p.id && x.gravidade === "critica" && !x.resolvido),
    );
  }

  function abrirConf(id: string) {
    const p = pedidos.find((x) => x.id === id);
    if (!p) return;
    const e = elegivel(p);
    if (!e.ok) {
      setAviso(`Não é possível concluir #${p.numero}: ${e.motivos.join("; ")}.`);
      return;
    }
    setEmbOk(false);
    setAprovado(false);
    setConfAberto(id);
  }

  function aprovarConf() {
    if (!confAberto || !aprovado) return;
    patch(confAberto, (p) => {
      if (p.blocos.some((b) => !b.feito)) return p;
      return {
        ...p,
        coluna: "finalizados",
        pausado: false,
        conferencia: true,
        finalizado:
          p.tipo === "retirada"
            ? { estado: "aguardando-retirada" }
            : { estado: "aguardando-motoboy" },
      };
    });
    const alvo = pedidos.find((x) => x.id === confAberto);
    if (alvo && alvo.tipo === "entrega" && !jaNotificado(notifs, confAberto)) {
      setNotifs((prev) => [
        ...prev,
        {
          pedidoId: confAberto,
          texto: `Entrega pronta — pedido #${alvo.numero} aguardando motoboy`,
          quando: Date.now(),
        },
      ]);
    }
    setConfAberto(null);
  }

  function finalizarPedido(id: string) {
    abrirConf(id);
  }

  function atribuirMotoboy(id: string, nome?: string) {
    const alvo = pedidos.find((p) => p.id === id);
    const nomeFinal = nome ?? disponiveis[0]?.nome;
    if (!alvo || !nomeFinal) {
      setAviso("Nenhum motoboy disponível para simular atribuição.");
      return;
    }
    patch(id, (p) => ({
      ...p,
      finalizado: { estado: "motoboy-atribuido", motoboy: nomeFinal },
    }));
    setAviso(`Simulação local: ${nomeFinal} atribuído ao pedido #${alvo.numero} (sem envio real).`);
  }

  function trocarMotoboy(id: string) {
    const alvo = pedidos.find((p) => p.id === id);
    if (!alvo || disponiveis.length < 2) {
      setAviso("Só há um motoboy disponível na simulação.");
      return;
    }
    const atual = alvo.finalizado?.motoboy ?? disponiveis[0]?.nome;
    const idx = disponiveis.findIndex((m) => m.nome === atual);
    const prox = disponiveis[(idx + 1) % disponiveis.length]?.nome ?? disponiveis[0]?.nome;
    if (prox) atribuirMotoboy(id, prox);
  }

  function marcarSaiu(id: string) {
    patch(id, (p) => ({
      ...p,
      finalizado: {
        estado: "saiu",
        motoboy: p.finalizado?.motoboy ?? disponiveis[0]?.nome ?? "—",
        saidaEm: Date.now(),
      },
    }));
  }

  function marcarEntregue(id: string) {
    patch(id, (p) => ({
      ...p,
      finalizado: {
        estado: "entregue",
        motoboy: p.finalizado?.motoboy,
        saidaEm: p.finalizado?.saidaEm,
      },
    }));
  }

  function abrirComanda(id: string) {
    setComandaId(id);
  }

  function imprimirComandaDemo() {
    if (!comandaId) return;
    setReimp((prev) => ({ ...prev, [comandaId]: (prev[comandaId] ?? 0) + 1 }));
    window.print();
  }

  const contas = {
    proximos: col("proximos").length,
    preparo: col("preparo").length,
    finalizados: col("finalizados").length,
  };
  const totalEntrega = pedidos.filter((p) => p.tipo === "entrega").length;
  const totalRetirada = pedidos.filter((p) => p.tipo === "retirada").length;
  const totalAgendados = pedidos.filter((p) => p.agendado).length;
  const sinoBadge = notifs.length + nProblemas + (nAtraso > 0 ? 1 : 0);

  const cp = confAberto ? pedidos.find((x) => x.id === confAberto) : undefined;
  const pp = probAberto ? pedidos.find((x) => x.id === probAberto) : undefined;
  const comanda = comandaId ? pedidos.find((x) => x.id === comandaId) : undefined;

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100">
      <style>{`@keyframes piscar-vermelho { 0%,100% { border-color: #ef4444; box-shadow: 0 0 0 1px #ef4444; } 50% { border-color: transparent; box-shadow: none; } } .borda-atraso { animation: piscar-vermelho 1.2s infinite; } @keyframes mexer-colher { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } } .mexendo { display: inline-block; animation: mexer-colher 1.6s ease-in-out infinite; transform-origin: 50% 60%; } @media (prefers-reduced-motion: reduce) { .borda-atraso { animation: none; border-color: #ef4444; } .mexendo { animation: none; } } @media print { body * { visibility: hidden !important; } .comanda-print, .comanda-print * { visibility: visible !important; } .comanda-print { position: absolute !important; left: 50% !important; top: 0 !important; transform: translateX(-50%); } .no-print { display: none !important; } }`}</style>
      <p className="no-print bg-yellow-400 px-3 py-1 text-center text-xs font-bold text-black">
        PREVIEW — dados fictícios, interações demonstrativas. Nada é gravado.
      </p>

      <div className="no-print flex min-h-[calc(100vh-28px)]">
        {/* Sidebar fixa estilo imagem */}
        {modoCozinha ? null : (
          <aside
            className="hidden w-56 shrink-0 flex-col border-r border-neutral-800 bg-black px-3 py-4 lg:flex"
            aria-label="Navegação do preview"
          >
            <div className="rounded-xl px-2 py-2 text-center">
              <p className="flex items-center justify-center gap-1 text-yellow-400">
                <Crown className="size-5" aria-hidden />
              </p>
              <p className="font-display text-3xl font-extrabold italic leading-none text-yellow-400">
                Néia
              </p>
              <p className="text-[11px] font-bold tracking-[0.3em] text-yellow-500">SALGADOS</p>
            </div>
            <nav className="mt-4 space-y-1">
              {NAV.map((s) => {
                const Icone = s.icone;
                const ativo = s.rotulo === "Produção";
                return (
                  <span
                    key={s.rotulo}
                    aria-current={ativo ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${ativo ? "border border-yellow-500/60 bg-yellow-500/15 font-bold text-yellow-300" : "text-neutral-300"}`}
                  >
                    <Icone className="size-4" aria-hidden />
                    {s.rotulo}
                  </span>
                );
              })}
            </nav>
            <div className="mt-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-green-400">
                <span className="size-2 rounded-full bg-green-500" aria-hidden /> Produção Online
              </p>
              <p className="mt-1 font-display text-3xl font-bold text-white">{fmtHora(agora)}</p>
              <p className="text-xs text-neutral-400">{fmtDataCurta(agora)}</p>
              <p className="mt-2 text-[11px] text-neutral-500">v2.0.0</p>
            </div>
          </aside>
        )}

        <div className="min-w-0 flex-1 p-3">
          {/* Topo: título + indicadores coloridos */}
          <header className="flex flex-wrap items-start gap-2">
            <div className="min-w-48">
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-yellow-400">
                <ChefHat className="size-7" aria-hidden /> Produção
              </h1>
              <p className="text-xs text-neutral-400">
                Prepare os pedidos na ordem de prioridade, considerando entregas e horários.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-stretch gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-700 bg-green-950/60 px-3 py-1.5">
                <Bike className="size-6 text-green-400" aria-hidden />
                <div className="leading-tight">
                  <p className="font-display text-xl font-bold text-white">
                    {disponiveis.length}{" "}
                    <span className="text-xs font-normal text-green-300">
                      Motoboys disponíveis
                      <br />
                      {disponiveis.map((m) => m.nome).join(", ") || "—"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-yellow-600 bg-yellow-950/50 px-3 py-1.5">
                <Bike className="size-6 text-yellow-400" aria-hidden />
                <div className="leading-tight">
                  <p className="font-display text-xl font-bold text-white">
                    {emRota.length}{" "}
                    <span className="text-xs font-normal text-yellow-200">
                      Em rota
                      <br />
                      {emRota.map((m) => m.nome).join(", ") || "—"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-red-700 bg-red-950/60 px-3 py-1.5">
                <Package className="size-6 text-red-400" aria-hidden />
                <div className="leading-tight">
                  <p className="font-display text-xl font-bold text-white">
                    {prontasAguardando}{" "}
                    <span className="text-xs font-normal text-red-200">
                      Prontos p/ despacho
                      <br />
                      Aguardando motoboy
                    </span>
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-center leading-tight">
                <p className="text-[11px] text-neutral-400">{fmtDataCurta(agora)}</p>
                <p className="font-display text-xl font-bold text-white">{fmtHora(agora)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotifs((v) => !v)}
                className="relative rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5"
                aria-label={`Alertas (${sinoBadge})`}
                aria-expanded={showNotifs}
              >
                <Bell className="size-5" aria-hidden />
                {sinoBadge > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white">
                    {sinoBadge}
                  </span>
                ) : null}
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5">
                <span className="grid size-8 place-items-center rounded-full bg-yellow-500 text-xs font-extrabold text-black">
                  NS
                </span>
                <span className="text-xs leading-tight">
                  <b className="block">Néia Salgados</b>
                  <span className="text-neutral-400">Produção</span>
                </span>
                <ChevronDown className="size-4 text-neutral-500" aria-hidden />
              </div>
            </div>
          </header>

          {showNotifs ? (
            <div
              className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs"
              role="status"
              aria-label="Avisos de despacho"
            >
              <p className="font-bold text-yellow-400">
                Avisos ao administrador (demonstração — sem envio real)
              </p>
              {notifs.length === 0 && nAtraso === 0 ? (
                <p className="mt-1 text-neutral-400">
                  Nenhum aviso ainda. Conclua uma entrega para gerar.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {nAtraso > 0 ? (
                    <li className="rounded bg-red-950 px-2 py-1.5 font-bold text-red-200">
                      {nAtraso} pedido(s) com preparo em atraso — horário necessário já passou.
                    </li>
                  ) : null}
                  {notifs.map((n) => (
                    <li key={`${n.pedidoId}-${n.quando}`} className="rounded bg-neutral-800 px-2 py-1.5">
                      {n.texto}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {/* Linha compacta secundária (não prejudica leitura) */}
          <div
            className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-2.5 py-1.5 text-[11px] text-neutral-400"
            aria-label="Operação agora"
          >
            <span>
              Fritura: <b className="text-neutral-200">{resumo.fritosPendente}</b> fritos pendentes •{" "}
              <b className="text-neutral-200">{resumo.fritosProximaHora}</b> p/ próxima hora
            </span>
            <span aria-hidden>•</span>
            <span>
              {resumo.emPreparo} em preparo • {resumo.atrasados} atrasados
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-neutral-300">
              <input
                type="checkbox"
                checked={motoboysLigados}
                onChange={(e) => setMotoboysLigados(e.target.checked)}
                className="size-3.5"
              />
              simular disponibilidade
            </label>
            <button
              type="button"
              onClick={() => setModoCozinha((v) => !v)}
              className={`rounded-lg border px-2.5 py-1.5 font-bold ${modoCozinha ? "border-yellow-400 bg-yellow-400 text-black" : "border-neutral-700 text-neutral-200"}`}
              aria-pressed={modoCozinha}
            >
              Modo Cozinha
            </button>
          </div>

          {/* Filtros */}
          {!modoCozinha ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {(
                [
                  { v: "todos", rotulo: `Todos (${pedidos.length})` },
                  { v: "entrega", rotulo: `Entrega (${totalEntrega})` },
                  { v: "retirada", rotulo: `Retirada (${totalRetirada})` },
                  { v: "agendados", rotulo: `Agendados (${totalAgendados})` },
                ] as const
              ).map((a) => (
                <button
                  key={a.v}
                  type="button"
                  onClick={() => setAba(a.v)}
                  className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-sm ${aba === a.v ? "border-yellow-400 bg-yellow-400 font-bold text-black" : "border-neutral-700 bg-neutral-900 text-neutral-200"}`}
                >
                  {a.rotulo}
                </button>
              ))}
              <div className="relative min-w-52 flex-1">
                <Search
                  className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
                  aria-hidden
                />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por número, cliente ou sabor…"
                  className="min-h-[40px] w-full rounded-lg border border-neutral-700 bg-neutral-900 pl-9 pr-3 text-sm"
                  aria-label="Buscar pedido"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-neutral-300">
                Ordenar por:
                <select
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value as typeof ordem)}
                  className="min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-sm"
                  aria-label="Ordenação"
                >
                  <option value="horario">Horário necessário</option>
                  <option value="atrasados">Atrasados primeiro</option>
                  <option value="maior">Maior pedido</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setFiltrosAbertos((v) => !v)}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm"
                aria-expanded={filtrosAbertos}
              >
                <SlidersHorizontal className="size-4" aria-hidden /> Filtros
              </button>
            </div>
          ) : null}
          {filtrosAbertos && !modoCozinha ? (
            <div className="mt-2 flex flex-wrap gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={soAtrasados}
                  onChange={(e) => setSoAtrasados(e.target.checked)}
                />{" "}
                Somente atrasados
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={soObs} onChange={(e) => setSoObs(e.target.checked)} />{" "}
                Somente com observações
              </label>
            </div>
          ) : null}
          {aviso ? (
            <p
              role="status"
              className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-xs text-neutral-300"
            >
              {aviso}
            </p>
          ) : null}

          {/* Abas mobile */}
          <div className="mt-3 grid grid-cols-3 gap-1.5 lg:hidden" role="tablist" aria-label="Colunas">
            {(["Próximos", "Preparo", "Finalizados"] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={abaMobile === i}
                onClick={() => setAbaMobile(i as 0 | 1 | 2)}
                className={`min-h-[48px] rounded-lg border px-2 text-sm font-bold ${abaMobile === i ? "border-yellow-400 bg-yellow-400 text-black" : "border-neutral-700 text-neutral-200"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Três colunas simultâneas no desktop */}
          <div className="mt-3 grid items-start gap-3 lg:grid-cols-3">
            <div className={abaMobile !== 0 ? "hidden lg:block" : ""}>
              <Coluna
                titulo="Próximos Pedidos"
                sub="Em ordem de horário para preparo"
                cabeca="bg-sky-600 text-white"
                icone={Clock}
                pedidos={col("proximos")}
              >
                {(p) => (
                  <CartaoProximo
                    p={p}
                    atraso={atrasoDe(p)}
                    disponiveis={disponiveis}
                    recomendado={recomendado.id === p.id}
                    motivo={recomendado.id === p.id ? recomendado.motivo : ""}
                    onIniciar={() => iniciarPreparo(p.id)}
                    onPrioridade={() => alternarPrioridade(p.id)}
                    onProblema={() => abrirProblema(p.id)}
                  />
                )}
              </Coluna>
            </div>
            <div className={abaMobile !== 1 ? "hidden lg:block" : ""}>
              <Coluna
                titulo="Em Preparo"
                sub="Pedidos sendo preparados"
                cabeca="bg-yellow-500 text-black"
                icone={Soup}
                pedidos={col("preparo")}
              >
                {(p) => (
                  <CartaoPreparo
                    p={p}
                    atraso={atrasoDe(p)}
                    agora={agora}
                    onBloco={(b) => alternarBloco(p.id, b)}
                    onPausar={() => patch(p.id, (x) => ({ ...x, pausado: !x.pausado }))}
                    onFinalizarCombo={() => finalizarCombo(p.id)}
                    onFinalizar={() => finalizarPedido(p.id)}
                    onProblema={() => abrirProblema(p.id)}
                  />
                )}
              </Coluna>
            </div>
            <div className={abaMobile !== 2 ? "hidden lg:block" : ""}>
              <Coluna
                titulo="Finalizados"
                sub="Preparo concluído • Aguardando retirada/entrega"
                cabeca="bg-green-600 text-white"
                icone={Check}
                pedidos={col("finalizados")}
              >
                {(p) => (
                  <CartaoFinalizado
                    p={p}
                    disponiveis={disponiveis}
                    reimpressoes={reimp[p.id] ?? 0}
                    onAtribuir={() => atribuirMotoboy(p.id)}
                    onTrocar={() => trocarMotoboy(p.id)}
                    onSaiu={() => marcarSaiu(p.id)}
                    onEntregue={() => marcarEntregue(p.id)}
                    onRetirada={() =>
                      patch(p.id, (x) => ({ ...x, finalizado: { estado: "entregue" } }))
                    }
                    onMapa={() =>
                      setAviso(
                        `Mapa demonstrativo: rota de ${p.cliente} (${p.endereco ?? "balcão"}).`,
                      )
                    }
                    onComanda={() => abrirComanda(p.id)}
                  />
                )}
              </Coluna>
            </div>
          </div>
          <p className="mt-3 pb-6 text-center text-[11px] text-neutral-500">
            Preview com dados fictícios — nada é gravado. Aguardando aprovação para integrar ao
            painel real.
          </p>
        </div>
      </div>

      {/* Modal conferência final */}
      {cp ? (
        <div
          className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Conferência final pedido ${cp.numero}`}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4">
            <h2 className="font-display text-xl font-bold">CONFERÊNCIA FINAL — PEDIDO #{cp.numero}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between rounded bg-neutral-800 px-2 py-1.5">
                <span>Quantidade total</span>
                <b>{cp.itens.reduce((s, i) => s + i.qtd, 0)} un.</b>
              </li>
              {cp.itens.map((it, i) => (
                <li key={i} className="flex justify-between rounded bg-neutral-800 px-2 py-1.5">
                  <span>
                    {it.qtd} {it.sabor}
                  </span>
                  <span className="text-neutral-400">{it.tipo}</span>
                </li>
              ))}
              {cp.blocos.map((b) => (
                <li key={b.id} className="rounded bg-neutral-800 px-2 py-1.5">
                  <span className="flex justify-between">
                    <span>{b.rotulo}</span>
                    <b className="text-green-400">✓</b>
                  </span>
                  <span className="block text-xs text-neutral-400">
                    {b.composicao.map((c) => `${c.qtd} ${c.sabor}`).join(" + ")}
                  </span>
                </li>
              ))}
              <li className="rounded bg-neutral-800 px-2 py-1.5">
                <b>Obs.:</b> {cp.obs ?? "—"}
              </li>
              <li className="rounded bg-neutral-800 px-2 py-1.5">
                <b>Acompanhamentos:</b> {(cp.extras ?? []).join(", ") || "nenhum registrado"}
              </li>
              <li className="rounded bg-neutral-800 px-2 py-1.5">
                <b>Embalagens (sugestão):</b>{" "}
                {(() => {
                  const e = embalar(cp.itens.reduce((s, i) => s + i.qtd, 0));
                  const partes = [];
                  if (e.c100 > 0) partes.push(`${e.c100} caixa(s) de 100`);
                  if (e.c50 > 0) partes.push(`${e.c50} caixa(s) de 50`);
                  if (e.avulsas > 0) partes.push(`${e.avulsas} avulsas`);
                  return partes.join(" + ") || "—";
                })()}
                <label className="mt-1.5 flex min-h-[44px] cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={embOk}
                    onChange={(e) => setEmbOk(e.target.checked)}
                    className="size-4"
                  />
                  Embalagens separadas conforme a loja
                </label>
              </li>
              <li className="rounded bg-neutral-800 px-2 py-1.5">
                <b>Modalidade:</b> {cp.tipo === "entrega" ? "Entrega" : "Retirada"}
              </li>
            </ul>
            <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-yellow-500 px-2 text-sm font-bold text-yellow-300">
              <input
                type="checkbox"
                checked={aprovado}
                onChange={(e) => setAprovado(e.target.checked)}
                className="size-4"
              />
              Aprovo a conferência — pode concluir
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfAberto(null)}
                className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={aprovarConf}
                disabled={!embOk || !aprovado}
                className="min-h-[48px] rounded-lg bg-green-700 px-3 font-bold hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aprovar e concluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal problema */}
      {pp ? (
        <div
          className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Informar problema pedido ${pp.numero}`}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4">
            <h2 className="font-display text-xl font-bold">Informar problema — #{pp.numero}</h2>
            <div className="mt-2 space-y-2 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Categoria</span>
                <select
                  value={probCat}
                  onChange={(e) => setProbCat(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2"
                >
                  {[
                    "Produto insuficiente",
                    "Produto danificado",
                    "Problema com equipamento",
                    "Problema de qualidade",
                    "Outro problema",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Descrição</span>
                <textarea
                  value={probDesc}
                  onChange={(e) => setProbDesc(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5"
                  placeholder="Descreva o impedimento…"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">
                  Gravidade (crítica trava a finalização)
                </span>
                <select
                  value={probGrav}
                  onChange={(e) => setProbGrav(e.target.value as "baixa" | "media" | "critica")}
                  className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="critica">Crítica</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Item afetado (opcional)</span>
                <select
                  value={probItem}
                  onChange={(e) => setProbItem(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2"
                >
                  <option value="">Pedido todo</option>
                  {pp.itens.map((it, i) => (
                    <option key={i} value={it.sabor}>
                      {it.qtd} {it.sabor}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProbAberto(null)}
                className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarProblema}
                className="min-h-[48px] rounded-lg bg-yellow-500 px-3 font-bold text-black hover:bg-yellow-400"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal comanda térmica 80mm (demo navegador, sem fila real) */}
      {comanda ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Pré-visualização da comanda do pedido ${comanda.numero}`}
        >
          <div className="no-print mb-3 flex w-full max-w-xl flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-white">
              Pré-visualização 80 mm — demonstração pelo navegador (sem TANCA, sem fila real).
            </p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setComandaId(null)}
                className="min-h-[44px] rounded-lg border border-neutral-600 px-3 text-sm font-bold text-white hover:bg-neutral-800"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={imprimirComandaDemo}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-500"
              >
                <Printer className="size-4" aria-hidden /> Imprimir (demo)
              </button>
            </div>
          </div>
          <ComandaTermica pedido={comanda} reimpressoes={reimp[comanda.id] ?? 0} />
          <p className="no-print mt-2 max-w-xl text-center text-[11px] text-neutral-400">
            Imprimir não altera o status do pedido.{" "}
            {(reimp[comanda.id] ?? 0) > 0
              ? `Esta será a reimpressão nº ${reimp[comanda.id]}.`
              : "Primeira via demonstrativa."}
          </p>
        </div>
      ) : null}
    </div>
  );

  function Coluna({
    titulo,
    sub,
    cabeca,
    icone: Icone,
    pedidos,
    children,
  }: {
    titulo: string;
    sub: string;
    cabeca: string;
    icone: LucideIcon;
    pedidos: PedidoMock[];
    children: (p: PedidoMock) => React.ReactNode;
  }) {
    return (
      <section
        aria-label={titulo}
        className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60"
      >
        <div className={`px-3 py-2.5 ${cabeca}`}>
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Icone className={`size-5 ${titulo === "Em Preparo" ? "mexendo" : ""}`} aria-hidden />
            {titulo} ({pedidos.length})
          </h2>
          <p className={`text-[11px] ${cabeca.includes("text-black") ? "text-black/70" : "text-white/80"}`}>
            {sub}
          </p>
        </div>
        <div className="space-y-2.5 p-2.5">
          {pedidos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-xs text-neutral-500">
              Nenhum pedido aqui.
            </p>
          ) : null}
          {pedidos.map((p) => (
            <Fragment key={p.id}>{children(p)}</Fragment>
          ))}
        </div>
      </section>
    );
  }

  function LinhaHorarios({ p, grande }: { p: PedidoMock; grande?: boolean }) {
    const atraso = atrasoDe(p);
    if (p.tipo === "retirada") {
      return (
        <p
          className="text-[11px] text-neutral-400"
          title="Retirada: horário combinado com o cliente. Nada é alterado automaticamente."
        >
          Retirada às <b className="text-neutral-200">{fmtHora(p.vencimentoEm)}</b>
          {p.agendado ? " • agendado" : ""}
        </p>
      );
    }
    return (
      <p
        className="text-[11px] text-neutral-400"
        title={
          p.etaRotaMin != null
            ? `Necessário (cozinha) ${fmtHora(p.vencimentoEm)} = prometido ${fmtHora(p.prometidoEm)} − ETA ${p.etaRotaMin} min`
            : `Sem ETA confiável: necessário = prometido ${fmtHora(p.prometidoEm)} (sem desconto)`
        }
      >
        Pronto às <b className="text-neutral-200">{fmtHora(p.vencimentoEm)}</b> • Cliente até{" "}
        <b className="text-neutral-200">{fmtHora(p.prometidoEm)}</b>
        {p.etaRotaMin != null ? ` (ETA ${p.etaRotaMin} min)` : " (sem ETA)"}
        {grande ? null : null}
        {atraso > 0 ? null : null}
      </p>
    );
  }

  function SeloTipo({ tipo }: { tipo: "entrega" | "retirada" }) {
    return tipo === "entrega" ? (
      <span className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white">
        <Bike className="size-3.5" aria-hidden /> Entrega
      </span>
    ) : (
      <span className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-yellow-400 px-2 py-1 text-xs font-bold text-black">
        <Package className="size-3.5" aria-hidden /> Retirada
      </span>
    );
  }

  function SeloAtraso({ atraso }: { atraso: number }) {
    if (atraso > 0) {
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white">
          <TriangleAlert className="size-3.5" aria-hidden /> ATRASADO {atraso} min
        </span>
      );
    }
    return null;
  }

  function SeloFalta({ p }: { p: PedidoMock }) {
    const atraso = atrasoDe(p);
    if (atraso > 0) return null;
    const falta = Math.max(0, Math.round((p.vencimentoEm - agora) / MIN));
    return (
      <span className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-bold text-white">
        {falta <= 1 ? "Em 1 min" : `Em ${falta} min`}
      </span>
    );
  }

  function Itens({ p, comProgresso }: { p: PedidoMock; comProgresso?: boolean }) {
    function feitoDo(sabor: string): { un: number; blocos: number; totalBlocos: number } {
      let un = 0;
      let blocos = 0;
      let totalBlocos = 0;
      for (const b of p.blocos) {
        const c = b.composicao.find((x) => x.sabor === sabor);
        if (!c) continue;
        totalBlocos += 1;
        if (b.feito) {
          blocos += 1;
          un += c.qtd;
        }
      }
      return { un, blocos, totalBlocos };
    }
    return (
      <ul className="mt-2 min-w-0 flex-1 space-y-1">
        {p.itens.map((it, idx) => {
          const pr = feitoDo(it.sabor);
          const pronto = comProgresso && pr.totalBlocos > 0 && pr.un >= it.qtd;
          const parcial = comProgresso && pr.totalBlocos > 0 && pr.un > 0 && pr.un < it.qtd;
          return (
            <li key={idx}>
              <span className="flex items-baseline gap-2 text-[15px] leading-snug">
                <span className="text-yellow-400" aria-hidden>
                  ▸
                </span>
                <b className="font-bold">
                  {it.qtd} {it.sabor}
                </b>
                {comProgresso && pr.totalBlocos > 0 ? (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-neutral-400">
                    {pr.un}/{it.qtd}
                    {pronto ? (
                      <span className="grid size-4 place-items-center rounded bg-green-700 text-[11px] font-bold text-white" aria-label="sabor pronto">
                        ✓
                      </span>
                    ) : parcial ? (
                      <span className="grid size-4 place-items-center rounded bg-neutral-700 text-[11px] text-neutral-300" aria-hidden>
                        ◐
                      </span>
                    ) : (
                      <span className="grid size-4 place-items-center rounded bg-neutral-700 text-[11px] text-neutral-500" aria-hidden>
                        ○
                      </span>
                    )}
                  </span>
                ) : null}
              </span>
              {comProgresso && pr.totalBlocos > 0 ? (
                <span className="mt-1 block h-1.5 overflow-hidden rounded bg-neutral-700" aria-hidden>
                  <span
                    className={`block h-full ${pronto ? "bg-green-500" : "bg-yellow-400"}`}
                    style={{ width: `${Math.min(100, (pr.un / Math.max(1, it.qtd)) * 100)}%` }}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  function TotaisBox({ p }: { p: PedidoMock }) {
    return (
      <div className="w-20 shrink-0 rounded-lg bg-neutral-800/70 px-2 py-1.5 text-right text-xs leading-tight">
        <p className="text-neutral-400">Total</p>
        <p className="font-display text-lg font-extrabold text-white">{totalDe(p)} und.</p>
        <p className="text-neutral-400">Fritos: {fritosDe(p)}</p>
        <p className="text-neutral-400">Assados: {assadosDe(p)}</p>
      </div>
    );
  }

  function Obs({ texto }: { texto?: string | undefined }) {
    if (!texto) return null;
    return (
      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
        <input type="checkbox" className="mt-0.5 size-3.5 shrink-0" aria-label="Observação lida" />
        <span>
          <b>Obs.:</b> {texto}
        </span>
      </p>
    );
  }

  function CartaoProximo({
    p,
    atraso,
    disponiveis,
    recomendado,
    motivo,
    onIniciar,
    onPrioridade,
    onProblema,
  }: {
    p: PedidoMock;
    atraso: number;
    disponiveis: MotoboyMock[];
    recomendado: boolean;
    motivo: string;
    onIniciar: () => void;
    onPrioridade: () => void;
    onProblema: () => void;
  }) {
    const probs = problemasDe(p.id);
    const primeiro = disponiveis[0];
    return (
      <article
        className={`rounded-xl border bg-[#101013] p-3 ${atraso > 0 ? "borda-atraso border-2" : recomendado ? "border-2 border-yellow-400" : "border-neutral-800"}`}
        aria-label={atraso > 0 ? `Pedido ${p.numero} atrasado ${atraso} minutos` : `Pedido ${p.numero}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {recomendado ? (
            <span className="rounded bg-yellow-400 px-2 py-0.5 text-[11px] font-extrabold text-black">
              ★ PRÓXIMO RECOMENDADO
            </span>
          ) : null}
          <SeloAtraso atraso={atraso} />
        </div>
        {recomendado && motivo ? <p className="mt-1 text-[11px] text-yellow-200/70">{motivo}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <b className="font-display text-2xl font-extrabold text-white">#{p.numero}</b>
          <span
            className={`font-display text-2xl font-extrabold ${atraso > 0 ? "text-red-500" : "text-yellow-400"}`}
          >
            {fmtHora(p.vencimentoEm)}
          </span>
          <SeloFalta p={p} />
          <SeloTipo tipo={p.tipo} />
        </div>
        <LinhaHorarios p={p} grande />
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
          <User className="size-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="font-semibold">{p.cliente}</span>
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <Phone className="size-3" aria-hidden />
            {p.telefone}
          </span>
        </p>
        {p.tipo === "entrega" ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.endereco}</span>
            <span className="shrink-0 text-red-300">🛵 {p.distanciaKm?.toFixed(1)} km</span>
          </p>
        ) : null}
        <div className="mt-1 flex items-start gap-2">
          <Itens p={p} />
          <TotaisBox p={p} />
        </div>
        {p.tipo === "entrega" ? (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-800 bg-green-950/70 px-2 py-1.5 text-xs">
            <Bike className="size-4 shrink-0 text-green-400" aria-hidden />
            {primeiro ? (
              <span className="text-green-200">
                <b>{primeiro.nome}</b> • Na base ({primeiro.baseKm.toFixed(1)} km)
              </span>
            ) : (
              <span className="font-bold text-red-300">Motoboy indisponível</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1 rounded bg-green-800 px-1.5 py-0.5 font-bold text-green-100">
              🟢 {disponiveis.length} disponíveis
            </span>
          </p>
        ) : null}
        <Obs texto={p.obs} />
        {probs.length > 0 ? (
          <div className="mt-2 space-y-1">
            {probs.map((pr) => (
              <p
                key={pr.id}
                className="flex items-center gap-2 rounded-lg border border-orange-600 bg-orange-950 px-2 py-1.5 text-xs font-bold text-orange-200"
              >
                ⚠ {pr.categoria} ({pr.gravidade === "critica" ? "crítico" : pr.gravidade})
                <button
                  type="button"
                  onClick={() => resolverProblema(pr.id)}
                  className="ml-auto min-h-[44px] rounded bg-orange-800 px-2 underline"
                >
                  Resolver (admin)
                </button>
              </p>
            ))}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onIniciar}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-700 px-3 text-sm font-bold text-white hover:bg-amber-600"
          >
            ▶ Iniciar Preparo
          </button>
          <button
            type="button"
            onClick={onPrioridade}
            aria-pressed={p.prioridadeManual}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold ${p.prioridadeManual ? "border-yellow-400 bg-yellow-950 text-yellow-300" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"}`}
          >
            ☆ {p.prioridadeManual ? "Prioritário" : "Priorizar"}
          </button>
        </div>
        <button
          type="button"
          onClick={onProblema}
          className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <TriangleAlert className="size-3.5" aria-hidden /> Informar problema
        </button>
      </article>
    );
  }

  function CartaoPreparo({
    p,
    atraso,
    agora: agoraLocal,
    onBloco,
    onPausar,
    onFinalizarCombo,
    onFinalizar,
    onProblema,
  }: {
    p: PedidoMock;
    atraso: number;
    agora: number;
    onBloco: (b: string) => void;
    onPausar: () => void;
    onFinalizarCombo: () => void;
    onFinalizar: () => void;
    onProblema: () => void;
  }) {
    const todosFeitos = p.blocos.length > 0 && p.blocos.every((b) => b.feito);
    const feitos = p.blocos.filter((b) => b.feito).length;
    void agoraLocal;
    void pontuar;
    return (
      <article
        className={`rounded-xl border bg-[#101013] p-3 ${atraso > 0 ? "borda-atraso border-2" : "border-neutral-800"}`}
        aria-label={
          atraso > 0 ? `Pedido ${p.numero} atrasado ${atraso} minutos` : `Pedido ${p.numero} em preparo`
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-display text-2xl font-extrabold text-white">#{p.numero}</b>
          <span
            className={`font-display text-2xl font-extrabold ${atraso > 0 ? "text-red-500" : "text-yellow-400"}`}
          >
            {fmtHora(p.vencimentoEm)}
          </span>
          <SeloAtraso atraso={atraso} />
          {atraso === 0 ? <SeloFalta p={p} /> : null}
          <SeloTipo tipo={p.tipo} />
        </div>
        <LinhaHorarios p={p} />
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
          <User className="size-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="font-semibold">{p.cliente}</span>
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <Phone className="size-3" aria-hidden />
            {p.telefone}
          </span>
        </p>
        {p.tipo === "entrega" ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.endereco}</span>
            <span className="shrink-0 text-red-300">🛵 {p.distanciaKm?.toFixed(1)} km</span>
          </p>
        ) : null}
        <div className="mt-1 flex items-start gap-2">
          <Itens p={p} comProgresso />
          <TotaisBox p={p} />
        </div>
        {p.blocos.length > 0 ? (
          <div className="mt-2 rounded-lg bg-neutral-800/50 p-2 text-xs">
            <p className="font-bold text-neutral-200">
              Combos (blocos de 50) — {feitos}/{p.blocos.length} concluídos
            </p>
            <ul className="mt-1 space-y-1">
              {p.blocos.map((b) => (
                <li key={b.id} className="rounded-md bg-black/40 px-1.5 py-1">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={b.feito}
                      onChange={() => onBloco(b.id)}
                      className="size-4 shrink-0"
                      aria-label={`Finalizar ${b.rotulo}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${b.feito ? "text-neutral-500 line-through" : "text-neutral-100"}`}>
                        {b.rotulo}
                      </span>
                      <span className="block text-[11px] text-neutral-400">
                        {b.composicao.map((c) => `${c.qtd} ${c.sabor}`).join(" + ")}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${b.feito ? "bg-green-700 text-green-100" : "bg-neutral-700 text-neutral-300"}`}
                    >
                      {b.feito ? "Concluído" : "Em preparo"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          ⚠ Obs.: {p.obs ?? "—"}
        </div>
        {problemasDe(p.id).length > 0 ? (
          <div className="mt-2 space-y-1">
            {problemasDe(p.id).map((pr) => (
              <p
                key={pr.id}
                className="flex items-center gap-2 rounded-lg border border-orange-600 bg-orange-950 px-2 py-1.5 text-xs font-bold text-orange-200"
              >
                ⚠ {pr.categoria} (
                {pr.gravidade === "critica" ? "crítico — trava a finalização" : pr.gravidade})
                <button
                  type="button"
                  onClick={() => resolverProblema(pr.id)}
                  className="ml-auto min-h-[44px] rounded bg-orange-800 px-2 underline"
                >
                  Resolver (admin)
                </button>
              </p>
            ))}
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onPausar}
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-red-800 px-2 text-xs font-bold hover:bg-red-700"
          >
            {p.pausado ? (
              <>
                <Play className="size-4" aria-hidden /> Retomar
              </>
            ) : (
              <>
                <Pause className="size-4" aria-hidden /> Pausar
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onFinalizarCombo}
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-yellow-500 px-2 text-xs font-bold text-black hover:bg-yellow-400"
          >
            <Check className="size-4" aria-hidden /> Finalizar Combo
          </button>
          <button
            type="button"
            onClick={onFinalizar}
            disabled={!todosFeitos || bloqueioCritico(problemas, p.id)}
            title={
              !todosFeitos
                ? "Conclua todos os blocos"
                : bloqueioCritico(problemas, p.id)
                  ? "Impedimento crítico aberto — resolva antes"
                  : "Abrir conferência final"
            }
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-green-700 px-2 text-xs font-bold hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="size-4" aria-hidden /> Finalizar Pedido
          </button>
        </div>
        <button
          type="button"
          onClick={onProblema}
          className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <TriangleAlert className="size-3.5" aria-hidden /> Informar problema
        </button>
      </article>
    );
  }

  function CartaoFinalizado({
    p,
    disponiveis,
    reimpressoes,
    onAtribuir,
    onTrocar,
    onSaiu,
    onEntregue,
    onRetirada,
    onMapa,
    onComanda,
  }: {
    p: PedidoMock;
    disponiveis: MotoboyMock[];
    reimpressoes: number;
    onAtribuir: () => void;
    onTrocar: () => void;
    onSaiu: () => void;
    onEntregue: () => void;
    onRetirada: () => void;
    onMapa: () => void;
    onComanda: () => void;
  }) {
    const f = p.finalizado;
    const sugerido = disponiveis[0];
    return (
      <article className="rounded-xl border border-neutral-800 bg-[#101013] p-3" aria-label={`Pedido ${p.numero} finalizado`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="font-display text-xl font-extrabold text-white">#{p.numero}</b>
          <span className="font-display text-xl font-extrabold text-yellow-400">
            {fmtHora(p.vencimentoEm)}
          </span>
          <span className="rounded bg-green-700 px-2 py-0.5 text-[11px] font-bold text-white">
            Preparo concluído
          </span>
          {f?.estado === "aguardando-motoboy" ? (
            <span className="ml-auto rounded bg-yellow-400 px-2 py-0.5 text-[11px] font-bold text-black">
              🛵 Aguardando Motoboy
            </span>
          ) : null}
          {f?.estado === "motoboy-atribuido" ? (
            <span className="ml-auto rounded bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">
              🛵 Motoboy Atribuído
            </span>
          ) : null}
          {f?.estado === "saiu" ? (
            <span className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
              🛵 Saiu para Entrega
            </span>
          ) : null}
          {f?.estado === "aguardando-retirada" ? (
            <span className="ml-auto rounded bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">
              🛍 Aguardando Retirada
            </span>
          ) : null}
          {f?.estado === "entregue" ? (
            <span className="ml-auto rounded bg-green-700 px-2 py-0.5 text-[11px] font-bold text-white">
              ✓ Entregue
            </span>
          ) : null}
        </div>
        <LinhaHorarios p={p} />
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
          <User className="size-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="font-semibold">{p.cliente}</span>
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <Phone className="size-3" aria-hidden />
            {p.telefone}
          </span>
        </p>
        {p.tipo === "entrega" ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.endereco}</span>
            <span className="shrink-0">🛵 {p.distanciaKm?.toFixed(1)} km</span>
          </p>
        ) : null}
        <div className="mt-1 flex items-start gap-2">
          <Itens p={p} />
          <TotaisBox p={p} />
        </div>

        {p.tipo === "entrega" && f && ["aguardando-motoboy", "motoboy-atribuido", "saiu"].includes(f.estado) ? (
          <div className="mt-2 rounded-lg bg-neutral-800/50 p-2 text-xs">
            {f.estado === "aguardando-motoboy" ? (
              <>
                <p className="text-neutral-300">
                  Motoboy sugerido: <b className="text-white">{sugerido?.nome ?? "nenhum disponível"}</b>
                </p>
                {sugerido ? (
                  <p className="flex items-center gap-1.5 text-green-300">
                    <span className="grid size-5 place-items-center rounded-full bg-neutral-700 text-[11px]" aria-hidden>
                      ◉
                    </span>
                    {sugerido.nome} — A {sugerido.baseKm.toFixed(1)} km • Disponível
                  </p>
                ) : (
                  <p className="font-bold text-red-300">Nenhum motoboy disponível — aguarda, sem voltar ao preparo.</p>
                )}
                <button
                  type="button"
                  disabled={!sugerido}
                  onClick={onAtribuir}
                  className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg bg-yellow-500 px-2 font-bold text-black hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Atribuir Motoboy
                </button>
                <button
                  type="button"
                  onClick={onTrocar}
                  className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg bg-neutral-700 px-2 font-bold text-neutral-200 hover:bg-neutral-600"
                >
                  Escolher outro
                </button>
              </>
            ) : null}
            {f.estado === "motoboy-atribuido" ? (
              <>
                <p className="font-bold text-white">Motoboy: {f.motoboy}</p>
                <p className="text-neutral-400">Atribuído — aguardando saída (simulação admin).</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onTrocar}
                    className="min-h-[40px] rounded-lg bg-neutral-700 px-2 font-bold text-neutral-200 hover:bg-neutral-600"
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={onSaiu}
                    className="min-h-[40px] rounded-lg bg-blue-600 px-2 font-bold text-white hover:bg-blue-500"
                  >
                    Saiu p/ entrega
                  </button>
                </div>
              </>
            ) : null}
            {f.estado === "saiu" ? (
              <>
                <p className="font-bold text-white">Motoboy: {f.motoboy}</p>
                <p className="text-green-300">Saiu às {f.saidaEm ? fmtHora(f.saidaEm) : "—"}</p>
                <button
                  type="button"
                  onClick={onEntregue}
                  className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg bg-green-700 px-2 font-bold text-white hover:bg-green-600"
                >
                  <Check className="size-4" aria-hidden /> Marcar entregue (simulação)
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {p.tipo === "retirada" && f?.estado === "aguardando-retirada" ? (
          <div className="mt-2 rounded-lg bg-neutral-800/50 p-2 text-xs">
            <p className="font-bold text-sky-200">Aguardando o cliente retirar.</p>
            <button
              type="button"
              onClick={onRetirada}
              className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg bg-green-700 px-2 font-bold text-white hover:bg-green-600"
            >
              <Check className="size-4" aria-hidden /> Confirmar retirada
            </button>
          </div>
        ) : null}
        {f?.estado === "entregue" ? (
          <p className="mt-2 rounded-lg bg-green-950 px-2 py-1.5 text-xs font-bold text-green-200">
            Motoboy: {f.motoboy ?? "—"} • Entregue{f.saidaEm ? ` às ${fmtHora(f.saidaEm)}` : ""}
          </p>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onComanda}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 text-sm font-bold text-white hover:bg-blue-500"
          >
            <Printer className="size-4" aria-hidden /> Imprimir Comanda
            {reimpressoes > 0 ? <span className="text-[11px] opacity-80">({reimpressoes}x)</span> : null}
          </button>
          <button
            type="button"
            onClick={onMapa}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-neutral-600 px-2 text-sm font-bold text-neutral-200 hover:bg-neutral-800"
          >
            <MapIcon className="size-4" aria-hidden /> Ver no mapa
          </button>
        </div>
      </article>
    );
  }

  function ComandaTermica({ pedido, reimpressoes }: { pedido: PedidoMock; reimpressoes: number }) {
    const total = totalDe(pedido);
    const emb = embalar(total);
    const partesEmb = [];
    if (emb.c100 > 0) partesEmb.push(`${emb.c100} cx 100`);
    if (emb.c50 > 0) partesEmb.push(`${emb.c50} cx 50`);
    if (emb.avulsas > 0) partesEmb.push(`${emb.avulsas} avulsas`);
    return (
      <div
        className="comanda-print max-h-[70vh] w-[80mm] max-w-[92vw] overflow-y-auto bg-white p-3 font-mono text-[11px] leading-snug text-black"
        aria-label="Comanda térmica demonstrativa"
      >
        <p className="text-center text-sm font-extrabold">NÉIA SALGADOS</p>
        <p className="text-center">Comanda — via cozinha (DEMO)</p>
        {reimpressoes > 0 ? (
          <p className="mt-1 border border-black px-1 text-center font-extrabold">
            REIMPRESSÃO Nº {reimpressoes}
          </p>
        ) : null}
        <p className="mt-1 border-t border-dashed border-black pt-1">Pedido #{pedido.numero}</p>
        <p>Cliente: {pedido.cliente}</p>
        <p>Tel: {pedido.telefone}</p>
        <p>Modalidade: {pedido.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}</p>
        <p>
          Necessário (cozinha): <b>{fmtHora(pedido.vencimentoEm)}</b>
        </p>
        <p>
          Prazo ao cliente: <b>{fmtHora(pedido.prometidoEm)}</b>
          {pedido.tipo === "entrega" && pedido.etaRotaMin != null
            ? ` (rota ~${pedido.etaRotaMin} min)`
            : ""}
        </p>
        <p className="mt-1 border-t border-dashed border-black pt-1 font-bold">SABORES</p>
        <ul>
          {pedido.itens.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {it.qtd}x {it.sabor}
              </span>
              <span>{it.tipo}</span>
            </li>
          ))}
        </ul>
        <p className="font-bold">TOTAL: {total} un.</p>
        <p>Obs.: {pedido.obs ?? "—"}</p>
        <p>Acomp.: {(pedido.extras ?? []).join(", ") || "—"}</p>
        <p>Embalagens: {partesEmb.join(" + ") || "—"}</p>
        {pedido.tipo === "entrega" ? <p>Endereço: {pedido.endereco ?? "—"}</p> : null}
        {pedido.finalizado?.motoboy ? <p>Motoboy: {pedido.finalizado.motoboy}</p> : null}
        <p className="mt-1 border border-black p-1">[ ] Conferência: qtd / sabores / embalagem</p>
        <p className="mt-1 text-center">Demonstração — sem valor fiscal</p>
      </div>
    );
  }
}
