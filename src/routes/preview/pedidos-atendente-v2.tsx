import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  brl,
  emAtrasoAtendente,
  janelaLiberacao,
  mensagemWhatsApp,
  ordenarPorPrometido,
  parametrosJanela,
  podeAceitar,
  podeLiberar,
  resumoCSV,
  totalUnidades,
} from "@/lib/preview-pedidos-atendente";
import type { ColunaAtendente, PedidoAtendente } from "@/lib/preview-pedidos-atendente";
import {
  Archive,
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
  Eye,
  Headset,
  History,
  Home,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Printer,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  TriangleAlert,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * PREVIEW ONLY — Gestão de Pedidos / Atendente (K9, layout aprovado em imagem).
 * Rota: /preview/pedidos-atendente-v2. 100% fictício, estado local.
 * NÃO lê/escreve Supabase, NÃO altera Pedidos/Produção/Central reais,
 * NÃO cria migration, NÃO imprime de verdade, NÃO envia mensagens,
 * NÃO faz commit/push/deploy.
 */

export const Route = createFileRoute("/preview/pedidos-atendente-v2")({
  head: () => ({ meta: [{ title: "Preview — Gestão de Pedidos (Atendente)" }] }),
  component: PreviewPedidosAtendente,
});

const MIN = 60000;

const NAV: Array<{ rotulo: string; icone: LucideIcon }> = [
  { rotulo: "Dashboard", icone: Home },
  { rotulo: "Pedidos", icone: ClipboardList },
  { rotulo: "Produção", icone: ChefHat },
  { rotulo: "Central de Entregas", icone: Bike },
  { rotulo: "PDV / Balcão", icone: ShoppingCart },
  { rotulo: "Clientes", icone: Users },
  { rotulo: "Produtos", icone: Package },
  { rotulo: "Estoque", icone: Archive },
  { rotulo: "Financeiro", icone: DollarSign },
  { rotulo: "Relatórios", icone: BarChart3 },
  { rotulo: "Configurações", icone: Settings },
];

function fmtHora(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDataCurta(ts: number): string {
  const s = new Date(ts).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "long" });
  return s.replace(/\./g, "").replace(/^\w/, (c) => c.toUpperCase());
}

function montar(base: number): PedidoAtendente[] {
  const P = (o: Omit<PedidoAtendente, "valorCentavos"> & { valorCentavos?: number }): PedidoAtendente => ({
    valorCentavos: totalUnidades(o) * 100,
    ...o,
  });
  return [
    P({ id: "n1263", numero: 1263, cliente: "Fernanda Lima", telefone: "(11) 95555-6666", tipo: "entrega", endereco: "Rua das Acácias, 456 - Centro", distanciaKm: 2.8, prometidoEm: base + 40 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 25 }, { sabor: "Kibe", qtd: 20 }], pagamento: "Pix", pagamentoConfirmado: true, obs: "Sem orégano.", bloqueio: null, emAnalise: false, liberacaoEm: null, prontoEm: null, despacho: "nenhum", coluna: "novos" }),
    P({ id: "n1264", numero: 1264, cliente: "Juliana Pereira", telefone: "(11) 94444-5555", tipo: "retirada", distanciaKm: null, prometidoEm: base + 55 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 20 }, { sabor: "Risole de Queijo", qtd: 20 }], pagamento: "Cartão", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: null, prontoEm: null, despacho: "nenhum", coluna: "novos" }),
    P({ id: "n1265", numero: 1265, cliente: "Marcos Souza", telefone: "(11) 93333-4444", tipo: "entrega", endereco: "Rua das Flores, 123 - Centro", distanciaKm: 3.5, prometidoEm: base + 70 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 50 }, { sabor: "Kibe", qtd: 15 }], pagamento: "Dinheiro", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: null, prontoEm: null, despacho: "nenhum", coluna: "novos" }),
    P({ id: "n1266", numero: 1266, cliente: "Paulo Rocha", telefone: "(11) 90000-1111", tipo: "entrega", endereco: "Rua X, 10 - Centro", distanciaKm: 1.0, prometidoEm: base + 45 * MIN, agendado: false, itens: [{ sabor: "Kibe", qtd: 100 }], pagamento: "Pix", pagamentoConfirmado: false, obs: "Aguardando compensação.", bloqueio: "pagamento-pendente", emAnalise: false, liberacaoEm: null, prontoEm: null, despacho: "nenhum", coluna: "novos" }),
    P({ id: "a1261", numero: 1261, cliente: "Ana Costa", telefone: "(11) 98876-5432", tipo: "entrega", endereco: "Rua do Sol, 456 - Vila Nova", distanciaKm: 2.1, prometidoEm: base + 65 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 30 }, { sabor: "Kibe", qtd: 20 }], pagamento: "Pix", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base + 12 * MIN, prontoEm: null, despacho: "nenhum", coluna: "aceitos" }),
    P({ id: "a1262", numero: 1262, cliente: "Ricardo Santos", telefone: "(11) 97777-1111", tipo: "retirada", distanciaKm: null, prometidoEm: base + 70 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 30 }, { sabor: "Bolinha de Queijo", qtd: 20 }], pagamento: "Cartão", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base + 17 * MIN, prontoEm: null, despacho: "nenhum", coluna: "aceitos" }),
    P({ id: "a1257", numero: 1257, cliente: "Fernanda Lima", telefone: "(11) 95555-6666", tipo: "entrega", endereco: "Rua das Acácias, 456 - Centro", distanciaKm: 2.8, prometidoEm: base + 155 * MIN, agendado: true, itens: [{ sabor: "Coxinha de Frango", qtd: 25 }, { sabor: "Risole de Queijo", qtd: 20 }], pagamento: "Pix", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base + 75 * MIN, prontoEm: null, despacho: "nenhum", coluna: "aceitos" }),
    P({ id: "c1258", numero: 1258, cliente: "Carlos Souza", telefone: "(11) 91234-5678", tipo: "entrega", endereco: "Rua das Palmeiras, 789 - Centro", distanciaKm: 2.8, prometidoEm: base + 50 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 50 }, { sabor: "Risole de Queijo", qtd: 20 }], pagamento: "Dinheiro", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base - 20 * MIN, prontoEm: null, despacho: "nenhum", coluna: "producao" }),
    P({ id: "c1260", numero: 1260, cliente: "Patrícia Mendes", telefone: "(11) 98888-9999", tipo: "retirada", distanciaKm: null, prometidoEm: base + 60 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 25 }, { sabor: "Kibe", qtd: 25 }], pagamento: "Pix", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base - 15 * MIN, prontoEm: null, despacho: "nenhum", coluna: "producao" }),
    P({ id: "d1249", numero: 1249, cliente: "Roberto Lima", telefone: "(11) 90000-0000", tipo: "entrega", endereco: "Rua da Paz, 100 - Jardim", distanciaKm: 2.8, prometidoEm: base + 30 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 20 }], pagamento: "Pix", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base - 60 * MIN, prontoEm: base - 5 * MIN, despacho: "aguardando-motoboy", coluna: "prontos" }),
    P({ id: "d1248", numero: 1248, cliente: "Fernanda Alves", telefone: "(11) 96666-7777", tipo: "retirada", distanciaKm: null, prometidoEm: base + 35 * MIN, agendado: false, itens: [{ sabor: "Risole de Presunto e Queijo", qtd: 30 }], pagamento: "Cartão", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base - 55 * MIN, prontoEm: base - 3 * MIN, despacho: "aguardando-cliente", coluna: "prontos" }),
    P({ id: "e1247", numero: 1247, cliente: "Diego Almeida", telefone: "(11) 91111-2222", tipo: "entrega", endereco: "Rua Projetada, 55 - Centro", distanciaKm: 2.0, prometidoEm: base + 20 * MIN, agendado: false, itens: [{ sabor: "Enroladinho de Salsicha", qtd: 40 }], pagamento: "Pix", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base - 80 * MIN, prontoEm: base - 25 * MIN, motoboy: "Carlos", despacho: "em-rota", coluna: "entrega" }),
    P({ id: "f1245", numero: 1245, cliente: "Camila Rocha", telefone: "(11) 92222-3333", tipo: "retirada", distanciaKm: null, prometidoEm: base - 90 * MIN, agendado: false, itens: [{ sabor: "Kibe", qtd: 20 }], pagamento: "Dinheiro", pagamentoConfirmado: true, bloqueio: null, emAnalise: false, liberacaoEm: base - 150 * MIN, prontoEm: base - 100 * MIN, despacho: "aguardando-cliente", coluna: "concluidos" }),
    P({ id: "x1244", numero: 1244, cliente: "Lucas Ferreira", telefone: "(11) 93333-5555", tipo: "entrega", endereco: "Rua Paraná, 654 - Centro", distanciaKm: 3.1, prometidoEm: base + 10 * MIN, agendado: false, itens: [{ sabor: "Coxinha de Frango", qtd: 50 }], pagamento: "", pagamentoConfirmado: false, bloqueio: "sem-pagamento", emAnalise: false, liberacaoEm: null, prontoEm: null, despacho: "nenhum", coluna: "cancelados" }),
  ];
}

const MOTOBOYS_DEMO = ["Carlos", "Ana"];

type FiltroStatus = "todos" | "novos" | "aceitos" | "producao" | "prontos" | "entrega" | "agendados" | "cancelados";

export function PreviewPedidosAtendente() {
  const [pedidos, setPedidos] = useState<PedidoAtendente[]>(() => montar(Date.now()));
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [soAgendados, setSoAgendados] = useState(false);
  const [soPendentes, setSoPendentes] = useState(false);
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [ordem, setOrdem] = useState<"prometido" | "numero">("prometido");
  const [tabTabela, setTabTabela] = useState<"todos" | "aceitos" | "producao" | "prontos" | "entrega" | "agendados">("todos");
  const [kanbanMobile, setKanbanMobile] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [aviso, setAviso] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [zapId, setZapId] = useState<string | null>(null);
  const [comandaId, setComandaId] = useState<string | null>(null);
  const [pagId, setPagId] = useState<string | null>(null);
  const [histAberto, setHistAberto] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoTipo, setNovoTipo] = useState<"entrega" | "retirada">("entrega");
  const [novoQtd, setNovoQtd] = useState("30");

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function patch(id: string, fn: (p: PedidoAtendente) => PedidoAtendente) {
    setPedidos((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }

  const porId = (id: string) => pedidos.find((p) => p.id === id);
  const cont = (c: ColunaAtendente) => pedidos.filter((p) => p.coluna === c).length;
  const nAgendados = pedidos.filter((p) => p.agendado && p.coluna !== "concluidos" && p.coluna !== "cancelados").length;
  const nAtrasados = pedidos.filter((p) => emAtrasoAtendente(p, agora)).length;

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let lista = pedidos.filter((p) => {
      if (filtro !== "todos") {
        if (filtro === "agendados") {
          if (!p.agendado || p.coluna === "concluidos" || p.coluna === "cancelados") return false;
        } else if (p.coluna !== filtro) return false;
      }
      if (soAgendados && !p.agendado) return false;
      if (soPendentes && p.pagamentoConfirmado) return false;
      if (soAtrasados && !emAtrasoAtendente(p, agora)) return false;
      if (t && !`${p.numero} ${p.cliente} ${p.telefone} ${p.itens.map((i) => i.sabor).join(" ")}`.toLowerCase().includes(t)) return false;
      return true;
    });
    lista = ordem === "numero" ? [...lista].sort((a, b) => a.numero - b.numero) : ordenarPorPrometido(lista);
    return lista;
  }, [pedidos, filtro, busca, soAgendados, soPendentes, soAtrasados, ordem, agora]);

  const col = (c: ColunaAtendente) => visiveis.filter((p) => p.coluna === c);

  function aceitar(id: string) {
    const p = porId(id);
    if (!p) return;
    const v = podeAceitar(p);
    if (!v.ok) {
      setAviso(`Pedido #${p.numero} não pode ser aceito: ${v.motivos.join("; ")}. Use "Solicitar análise".`);
      return;
    }
    const par = parametrosJanela(totalUnidades(p), p.distanciaKm, p.tipo);
    const j = janelaLiberacao(p.prometidoEm, par.preparoMin, par.deslocMin, par.margemMin);
    patch(id, (x) => ({ ...x, coluna: "aceitos", liberacaoEm: j.liberacaoEm }));
    setAviso(`Pedido #${p.numero} aceito (simulação). Liberação fictícia às ${fmtHora(j.liberacaoEm)} (${par.preparoMin} preparo + ${par.deslocMin} rota + ${par.margemMin} margem). Prometido preservado.`);
  }

  function solicitarAnalise(id: string) {
    patch(id, (x) => ({ ...x, emAnalise: true }));
    const p = porId(id);
    setAviso(`Pedido #${p?.numero} enviado para análise do responsável (simulação local).`);
  }

  function liberar(id: string) {
    const p = porId(id);
    if (!p) return;
    if (!podeLiberar(p, agora)) {
      setAviso(`Pedido #${p.numero} ainda fora da janela de liberação.`);
      return;
    }
    patch(id, (x) => ({ ...x, coluna: "producao" }));
    setAviso(`Pedido #${p.numero} liberado para a cozinha (simulação). O preparo é da Produção.`);
  }

  function marcarPronto(id: string) {
    const p = porId(id);
    if (!p) return;
    patch(id, (x) => ({
      ...x,
      coluna: "prontos",
      prontoEm: Date.now(),
      despacho: x.tipo === "retirada" ? "aguardando-cliente" : "aguardando-motoboy",
    }));
    setAviso(`Simulação da cozinha: pedido #${p.numero} pronto e conferido.`);
  }

  function avancarDespacho(id: string) {
    const p = porId(id);
    if (!p) return;
    if (p.despacho === "aguardando-motoboy") {
      patch(id, (x) => ({ ...x, despacho: "atribuido", motoboy: MOTOBOYS_DEMO[0] }));
      setAviso(`Simulação: ${MOTOBOYS_DEMO[0]} atribuído ao pedido #${p.numero} (sem atribuição automática real).`);
    } else if (p.despacho === "atribuido") {
      patch(id, (x) => ({ ...x, despacho: "em-rota", coluna: "entrega" }));
      setAviso(`Simulação: pedido #${p.numero} saiu para entrega.`);
    } else if (p.despacho === "em-rota") {
      patch(id, (x) => ({ ...x, coluna: "concluidos" }));
      setAviso(`Simulação: pedido #${p.numero} entregue e concluído. Entrega só conta após confirmação.`);
    }
  }

  function confirmarRetirada(id: string) {
    const p = porId(id);
    if (!p) return;
    patch(id, (x) => ({ ...x, coluna: "concluidos" }));
    setAviso(`Retirada do pedido #${p.numero} confirmada (permissão demonstrativa).`);
  }

  function cancelar(id: string) {
    const p = porId(id);
    if (!p) return;
    patch(id, (x) => ({ ...x, coluna: "cancelados" }));
    setAviso(`Pedido #${p.numero} cancelado (simulação local, sem tocar pagamentos).`);
  }

  function criarPedidoDemo() {
    if (novoNome.trim().length < 2) {
      setAviso("Informe o nome do cliente (mínimo 2 caracteres).");
      return;
    }
    const qtd = Math.max(1, parseInt(novoQtd, 10) || 30);
    const numero = Math.max(...pedidos.map((p) => p.numero)) + 1;
    const novo: PedidoAtendente = {
      id: `n-${Date.now()}`,
      numero,
      cliente: novoNome.trim(),
      telefone: novoTel.trim() || "(11) 90000-0000",
      tipo: novoTipo,
      ...(novoTipo === "entrega" ? { endereco: "Rua a combinar - Centro" } : {}),
      distanciaKm: novoTipo === "entrega" ? 2.0 : null,
      prometidoEm: Date.now() + 60 * MIN,
      agendado: false,
      itens: [{ sabor: "Coxinha de Frango", qtd }],
      valorCentavos: qtd * 100,
      pagamento: "A combinar",
      pagamentoConfirmado: false,
      bloqueio: null,
      emAnalise: false,
      liberacaoEm: null,
      prontoEm: null,
      despacho: "nenhum",
      coluna: "novos",
    };
    setPedidos((prev) => [novo, ...prev]);
    setNovoAberto(false);
    setNovoNome("");
    setNovoTel("");
    setAviso(`Pedido #${numero} criado em Novos (simulação local).`);
  }

  function exportarCSV() {
    const base = tabTabela === "todos" ? visiveis.filter((p) => p.coluna !== "cancelados" && p.coluna !== "concluidos") : visiveis.filter((p) => (tabTabela === "aceitos" ? p.coluna === "aceitos" : p.coluna === tabTabela));
    const blob = new Blob([resumoCSV(base)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pedidos-atendente-demo.csv";
    a.click();
    URL.revokeObjectURL(url);
    setAviso("CSV demonstrativo exportado (dados fictícios).");
  }

  const tabela = (tabTabela === "todos"
    ? visiveis.filter((p) => ["aceitos", "producao", "prontos", "entrega"].includes(p.coluna))
    : tabTabela === "aceitos"
      ? visiveis.filter((p) => p.coluna === "aceitos")
      : visiveis.filter((p) => p.coluna === tabTabela)
  ).slice(0, 12);

  const detalhe = detalheId ? porId(detalheId) : null;
  const zap = zapId ? porId(zapId) : null;
  const comanda = comandaId ? porId(comandaId) : null;
  const pag = pagId ? porId(pagId) : null;

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100">
      <style>{`@keyframes piscar-vermelho { 0%,100% { border-color: #ef4444; box-shadow: 0 0 0 1px #ef4444; } 50% { border-color: transparent; box-shadow: none; } } .borda-atraso { animation: piscar-vermelho 1.2s infinite; } @media (prefers-reduced-motion: reduce) { .borda-atraso { animation: none; border-color: #ef4444; } } @media print { body * { visibility: hidden !important; } .comanda-print, .comanda-print * { visibility: visible !important; } .comanda-print { position: absolute !important; left: 50% !important; top: 0 !important; transform: translateX(-50%); } .no-print { display: none !important; } }`}</style>
      <p className="no-print bg-yellow-400 px-3 py-1 text-center text-xs font-bold text-black">
        PREVIEW — dados fictícios, interações demonstrativas. Nada é gravado.
      </p>

      <div className="no-print flex min-h-[calc(100vh-28px)]">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-neutral-800 bg-black px-3 py-4 lg:flex" aria-label="Navegação do preview">
          <div className="rounded-xl px-2 py-2 text-center">
            <p className="flex items-center justify-center gap-1 text-yellow-400"><Crown className="size-5" aria-hidden /></p>
            <p className="font-display text-3xl font-extrabold italic leading-none text-yellow-400">Néia</p>
            <p className="text-[11px] font-bold tracking-[0.3em] text-yellow-500">SALGADOS</p>
            <p className="mt-1 text-[11px] text-neutral-500">O sabor que faz a diferença</p>
          </div>
          <nav className="mt-4 space-y-1">
            {NAV.map((s) => {
              const Icone = s.icone;
              const ativo = s.rotulo === "Pedidos";
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
          <header className="flex flex-wrap items-start gap-2">
            <div className="min-w-52">
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-yellow-400">
                <Headset className="size-7" aria-hidden /> Gestão de Pedidos
              </h1>
              <p className="text-xs text-neutral-400">Atendimento • Néia Salgados<br />Receba, confirme e acompanhe os pedidos.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-stretch gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-yellow-600 bg-yellow-950/50 px-3 py-1.5">
                <Clock className="size-6 text-yellow-400" aria-hidden />
                <p className="font-display text-xl font-bold leading-none text-white">{cont("novos")}<span className="block text-[11px] font-normal text-yellow-200">Aguardando aceitação</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-sky-600 bg-sky-950/50 px-3 py-1.5">
                <ChefHat className="size-6 text-sky-400" aria-hidden />
                <p className="font-display text-xl font-bold leading-none text-white">{cont("producao")}<span className="block text-[11px] font-normal text-sky-200">Na produção</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-purple-600 bg-purple-950/50 px-3 py-1.5">
                <Package className="size-6 text-purple-400" aria-hidden />
                <p className="font-display text-xl font-bold leading-none text-white">{cont("prontos")}<span className="block text-[11px] font-normal text-purple-200">Prontos</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-green-700 bg-green-950/60 px-3 py-1.5">
                <Bike className="size-6 text-green-400" aria-hidden />
                <p className="font-display text-xl font-bold leading-none text-white">{cont("entrega")}<span className="block text-[11px] font-normal text-green-200">Em entrega</span></p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5">
                <p className="font-display text-xl font-bold leading-none text-white">{nAgendados}<span className="block text-[11px] font-normal text-neutral-400">Agendados</span></p>
              </div>
              <div className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-center leading-tight">
                <p className="text-[11px] text-neutral-400">{fmtDataCurta(agora)}</p>
                <p className="font-display text-xl font-bold text-white">{fmtHora(agora)}</p>
              </div>
              <button type="button" className="relative rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5" aria-label={`Alertas (${nAtrasados})`}>
                <Bell className="size-5" aria-hidden />
                {nAtrasados > 0 ? <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white">{nAtrasados}</span> : null}
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5">
                <span className="grid size-8 place-items-center rounded-full bg-yellow-500 text-xs font-extrabold text-black">NS</span>
                <span className="text-xs leading-tight"><b className="block">Néia Salgados</b><span className="text-neutral-400">Atendimento</span></span>
                <ChevronDown className="size-4 text-neutral-500" aria-hidden />
              </div>
            </div>
          </header>

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-2.5 py-1.5 text-[11px] text-neutral-400" aria-label="Motoboys demonstrativos">
            <Bike className="size-4 text-green-400" aria-hidden />
            <span>Motoboys na base (demo): <b className="text-neutral-200">{MOTOBOYS_DEMO.join(", ")}</b> • sem atribuição automática nesta etapa</span>
            {nAtrasados > 0 ? <span className="rounded bg-red-600 px-2 py-1 font-bold text-white">{nAtrasados} em atraso</span> : <span>Sem atrasos</span>}
            <span className="ml-auto flex gap-2">
              <button type="button" onClick={() => setNovoAberto(true)} className="flex min-h-[36px] items-center gap-1 rounded-lg bg-yellow-500 px-3 font-bold text-black hover:bg-yellow-400"><Plus className="size-4" aria-hidden /> Novo Pedido</button>
              <button type="button" onClick={() => setHistAberto(true)} className="flex min-h-[36px] items-center gap-1 rounded-lg border border-neutral-600 px-3 font-bold text-neutral-200 hover:bg-neutral-800"><History className="size-4" aria-hidden /> Histórico</button>
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {(
              [
                { v: "todos", rotulo: `Todos (${pedidos.filter((p) => p.coluna !== "concluidos" && p.coluna !== "cancelados").length})` },
                { v: "novos", rotulo: `Aguardando aceitação (${cont("novos")})` },
                { v: "aceitos", rotulo: `Aceitos (${cont("aceitos")})` },
                { v: "producao", rotulo: `Na produção (${cont("producao")})` },
                { v: "prontos", rotulo: `Prontos (${cont("prontos")})` },
                { v: "entrega", rotulo: `Em entrega (${cont("entrega")})` },
                { v: "agendados", rotulo: `Agendados (${nAgendados})` },
                { v: "cancelados", rotulo: `Cancelados (${cont("cancelados")})` },
              ] as const
            ).map((a) => (
              <button key={a.v} type="button" onClick={() => setFiltro(a.v)}
                className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-sm ${filtro === a.v ? "border-yellow-400 bg-yellow-400 font-bold text-black" : "border-neutral-700 bg-neutral-900 text-neutral-200"}`}>
                {a.rotulo}
              </button>
            ))}
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, cliente ou sabor…"
                className="min-h-[40px] w-full rounded-lg border border-neutral-700 bg-neutral-900 pl-9 pr-3 text-sm" aria-label="Buscar pedido" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-neutral-300">
              Ordenar:
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-sm" aria-label="Ordenação">
                <option value="prometido">Horário prometido</option>
                <option value="numero">Número</option>
              </select>
            </label>
            <button type="button" onClick={() => setFiltrosAbertos((v) => !v)} className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm" aria-expanded={filtrosAbertos}>
              <SlidersHorizontal className="size-4" aria-hidden /> Filtros
            </button>
          </div>
          {filtrosAbertos ? (
            <div className="mt-2 flex flex-wrap gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={soAgendados} onChange={(e) => setSoAgendados(e.target.checked)} /> Somente agendados</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} /> Pagamento pendente</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} /> Somente atrasados</label>
            </div>
          ) : null}
          {aviso ? <p role="status" className="mt-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-xs text-neutral-300">{aviso}</p> : null}

          <div className="mt-3 grid grid-cols-4 gap-1.5 lg:hidden" role="tablist" aria-label="Colunas">
            {(["Novos", "Aceitos", "Produção", "Prontos"] as const).map((t, i) => (
              <button key={t} type="button" role="tab" aria-selected={kanbanMobile === i} onClick={() => setKanbanMobile(i)}
                className={`min-h-[48px] rounded-lg border px-2 text-xs font-bold ${kanbanMobile === i ? "border-yellow-400 bg-yellow-400 text-black" : "border-neutral-700 text-neutral-200"}`}>{t}</button>
            ))}
          </div>

          <div className="mt-3 hidden overflow-x-auto lg:block">
            <div className="grid items-start gap-3" style={{ gridTemplateColumns: "repeat(4,minmax(240px,1fr))", minWidth: "1080px" }}>
              <div>
                <Coluna titulo="Novos Pedidos" sub="Aguardando aceitação da atendente" cabeca="bg-yellow-500 text-black" cont={col("novos").length} icone={Clock}>
                  {col("novos").map((p) => <CartaoNovo key={p.id} p={p} agora={agora} onAceitar={() => aceitar(p.id)} onAnalise={() => solicitarAnalise(p.id)} onCancelar={() => cancelar(p.id)} onDetalhe={() => setDetalheId(p.id)} />)}
                  {col("novos").length === 0 ? <Vazio texto="Nenhum pedido novo." /> : null}
                </Coluna>
              </div>
              <div>
                <Coluna titulo="Aceitos" sub="Aguardando momento de produção" cabeca="bg-sky-600 text-white" cont={col("aceitos").length} icone={Clock}>
                  {col("aceitos").map((p) => <CartaoAceito key={p.id} p={p} agora={agora} onLiberar={() => liberar(p.id)} onDetalhe={() => setDetalheId(p.id)} onPag={() => setPagId(p.id)} />)}
                  {col("aceitos").length === 0 ? <Vazio texto="Nenhum pedido aceito." /> : null}
                </Coluna>
              </div>
              <div>
                <Coluna titulo="Em Produção" sub="Pedidos na cozinha" cabeca="bg-purple-600 text-white" cont={col("producao").length} icone={ChefHat}>
                  {col("producao").map((p) => <CartaoProducao key={p.id} p={p} agora={agora} onDetalhe={() => setDetalheId(p.id)} onPronto={() => marcarPronto(p.id)} onComanda={() => setComandaId(p.id)} />)}
                  {col("producao").length === 0 ? <Vazio texto="Cozinha livre." /> : null}
                </Coluna>
              </div>
              <div>
                <Coluna titulo="Prontos" sub="Aguardando motoboy ou retirada" cabeca="bg-green-600 text-white" cont={col("prontos").length + col("entrega").length} icone={Check}>
                  {col("prontos").map((p) => <CartaoPronto key={p.id} p={p} agora={agora} onComanda={() => setComandaId(p.id)} onZap={() => setZapId(p.id)} onDetalhe={() => setDetalheId(p.id)} onAvancar={() => avancarDespacho(p.id)} onRetirada={() => confirmarRetirada(p.id)} />)}
                  {col("entrega").map((p) => <CartaoPronto key={p.id} p={p} agora={agora} onComanda={() => setComandaId(p.id)} onZap={() => setZapId(p.id)} onDetalhe={() => setDetalheId(p.id)} onAvancar={() => avancarDespacho(p.id)} onRetirada={() => confirmarRetirada(p.id)} />)}
                  {col("prontos").length + col("entrega").length === 0 ? <Vazio texto="Nenhum pedido pronto." /> : null}
                </Coluna>
              </div>
            </div>
          </div>

          <div className="mt-3 lg:hidden">
            {kanbanMobile === 0 ? (
              <Coluna titulo="Novos Pedidos" sub="Aguardando aceitação da atendente" cabeca="bg-yellow-500 text-black" cont={col("novos").length} icone={Clock}>
                {col("novos").map((p) => <CartaoNovo key={p.id} p={p} agora={agora} onAceitar={() => aceitar(p.id)} onAnalise={() => solicitarAnalise(p.id)} onCancelar={() => cancelar(p.id)} onDetalhe={() => setDetalheId(p.id)} />)}
              </Coluna>
            ) : null}
            {kanbanMobile === 1 ? (
              <Coluna titulo="Aceitos" sub="Aguardando momento de produção" cabeca="bg-sky-600 text-white" cont={col("aceitos").length} icone={Clock}>
                {col("aceitos").map((p) => <CartaoAceito key={p.id} p={p} agora={agora} onLiberar={() => liberar(p.id)} onDetalhe={() => setDetalheId(p.id)} onPag={() => setPagId(p.id)} />)}
              </Coluna>
            ) : null}
            {kanbanMobile === 2 ? (
              <Coluna titulo="Em Produção" sub="Pedidos na cozinha" cabeca="bg-purple-600 text-white" cont={col("producao").length} icone={ChefHat}>
                {col("producao").map((p) => <CartaoProducao key={p.id} p={p} agora={agora} onDetalhe={() => setDetalheId(p.id)} onPronto={() => marcarPronto(p.id)} onComanda={() => setComandaId(p.id)} />)}
              </Coluna>
            ) : null}
            {kanbanMobile === 3 ? (
              <Coluna titulo="Prontos" sub="Aguardando motoboy ou retirada" cabeca="bg-green-600 text-white" cont={col("prontos").length + col("entrega").length} icone={Check}>
                {col("prontos").map((p) => <CartaoPronto key={p.id} p={p} agora={agora} onComanda={() => setComandaId(p.id)} onZap={() => setZapId(p.id)} onDetalhe={() => setDetalheId(p.id)} onAvancar={() => avancarDespacho(p.id)} onRetirada={() => confirmarRetirada(p.id)} />)}
                {col("entrega").map((p) => <CartaoPronto key={p.id} p={p} agora={agora} onComanda={() => setComandaId(p.id)} onZap={() => setZapId(p.id)} onDetalhe={() => setDetalheId(p.id)} onAvancar={() => avancarDespacho(p.id)} onRetirada={() => confirmarRetirada(p.id)} />)}
              </Coluna>
            ) : null}
          </div>

          <section aria-label="Pedidos aceitos e agendados" className="mt-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60">
            <div className="flex flex-wrap items-center gap-2 p-3">
              <div>
                <h2 className="font-display text-base font-extrabold">Pedidos Aceitos / Agendados</h2>
                <p className="text-[11px] text-neutral-400">Acompanhe os pedidos confirmados e o momento de envio para a produção.</p>
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {(["todos", "aceitos", "producao", "prontos", "entrega", "agendados"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTabTabela(t)}
                    className={`min-h-[36px] rounded-lg border px-2.5 text-xs ${tabTabela === t ? "border-yellow-400 bg-yellow-400 font-bold text-black" : "border-neutral-700 text-neutral-300"}`}>
                    {t === "todos" ? `Todos (${tabela.length})` : t === "aceitos" ? "Aguardando Produção" : t === "producao" ? "Em Produção" : t === "prontos" ? "Prontos" : t === "entrega" ? "Em Entrega" : "Agendados"}
                  </button>
                ))}
                <button type="button" onClick={exportarCSV} className="min-h-[36px] rounded-lg border border-neutral-600 px-3 text-xs font-bold hover:bg-neutral-800">Exportar CSV</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead>
                  <tr className="border-y border-neutral-800 text-neutral-400">
                    <th className="px-3 py-2">#</th><th className="px-3 py-2">Horário Cliente</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Itens</th><th className="px-3 py-2">Quantidade</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Envio p/ produção</th><th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tabela.filter((p) => tabTabela === "agendados" ? p.agendado : true).map((p) => (
                    <tr key={p.id} className="border-b border-neutral-800/60">
                      <td className="px-3 py-2 font-bold">#{p.numero}</td>
                      <td className="px-3 py-2 font-bold text-yellow-400">{fmtHora(p.prometidoEm)}</td>
                      <td className="px-3 py-2">{p.cliente}</td>
                      <td className="px-3 py-2"><SeloTipo tipo={p.tipo} /></td>
                      <td className="px-3 py-2 text-neutral-300">{p.itens.map((i) => `${i.qtd} ${i.sabor.split(" ").slice(0, 2).join(" ")}`).join(", ")}</td>
                      <td className="px-3 py-2">{totalUnidades(p)} un.</td>
                      <td className="px-3 py-2">{brl(p.valorCentavos)}</td>
                      <td className="px-3 py-2"><SeloSituacao p={p} /></td>
                      <td className="px-3 py-2 text-neutral-300">{p.coluna === "aceitos" && p.liberacaoEm ? `em ${Math.max(0, Math.round((p.liberacaoEm - agora) / MIN))} min` : p.coluna === "producao" ? "na cozinha" : "—"}</td>
                      <td className="px-3 py-2"><button type="button" onClick={() => setDetalheId(p.id)} className="rounded-lg border border-neutral-600 px-2.5 py-1.5 font-bold hover:bg-neutral-800">Ver</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="mt-3 pb-6 text-center text-[11px] text-neutral-500">
            Preview com dados fictícios — nada é gravado. Aguardando aprovação para integrar ao painel real.
          </p>
        </div>
      </div>

      {detalhe ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Detalhes do pedido ${detalhe.numero}`}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">Pedido #{detalhe.numero} — {detalhe.cliente}</h2>
            <ul className="mt-2 space-y-1.5">
              <li className="rounded bg-neutral-800 px-2 py-1.5">Telefone: {detalhe.telefone} • {detalhe.tipo === "entrega" ? "Entrega" : "Retirada"}</li>
              {detalhe.endereco ? <li className="rounded bg-neutral-800 px-2 py-1.5">Endereço: {detalhe.endereco}</li> : null}
              <li className="rounded bg-neutral-800 px-2 py-1.5">Prometido: <b>{fmtHora(detalhe.prometidoEm)}</b>{detalhe.agendado ? " (agendado)" : ""}</li>
              <li className="rounded bg-neutral-800 px-2 py-1.5">{detalhe.itens.map((i) => `${i.qtd} ${i.sabor}`).join(" + ")} • Total {totalUnidades(detalhe)} un.</li>
              <li className="rounded bg-neutral-800 px-2 py-1.5">Valor: {brl(detalhe.valorCentavos)} • {detalhe.pagamento}{detalhe.pagamentoConfirmado ? " (confirmado)" : " (pendente)"}</li>
              <li className="rounded bg-neutral-800 px-2 py-1.5">Obs.: {detalhe.obs ?? "—"}</li>
              {detalhe.motoboy ? <li className="rounded bg-neutral-800 px-2 py-1.5">Motoboy: {detalhe.motoboy}</li> : null}
            </ul>
            <button type="button" onClick={() => setDetalheId(null)} className="mt-2 min-h-[48px] w-full rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Fechar</button>
          </div>
        </div>
      ) : null}

      {zap ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Prévia de WhatsApp">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">WhatsApp — prévia (sem envio)</h2>
            <p className="mt-2 rounded-lg bg-green-950 p-3 text-green-100">{mensagemWhatsApp(zap)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setZapId(null)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Fechar</button>
              <button type="button" onClick={() => { try { void navigator.clipboard.writeText(mensagemWhatsApp(zap)); setAviso("Mensagem copiada (simulação, nada enviado)."); } catch { setAviso("Não foi possível copiar."); } setZapId(null); }} className="min-h-[48px] rounded-lg bg-green-700 px-3 font-bold hover:bg-green-600">Copiar texto</button>
            </div>
          </div>
        </div>
      ) : null}

      {comanda ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Comanda do pedido ${comanda.numero}`}>
          <div className="no-print mb-3 flex w-full max-w-xl flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-white">Comanda demonstrativa — sem impressão física.</p>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setComandaId(null)} className="min-h-[44px] rounded-lg border border-neutral-600 px-3 text-sm font-bold text-white hover:bg-neutral-800">Fechar</button>
              <button type="button" onClick={() => window.print()} className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-500"><Printer className="size-4" aria-hidden /> Imprimir (demo)</button>
            </div>
          </div>
          <div className="comanda-print max-h-[70vh] w-[80mm] max-w-[92vw] overflow-y-auto bg-white p-3 font-mono text-[11px] leading-snug text-black">
            <p className="text-center text-sm font-extrabold">NÉIA SALGADOS</p>
            <p className="text-center">Comanda — atendimento (DEMO)</p>
            <p className="mt-1 border-t border-dashed border-black pt-1">Pedido #{comanda.numero} • {comanda.cliente}</p>
            <p>{comanda.tipo === "entrega" ? "ENTREGA" : "RETIRADA"} • Prometido: {fmtHora(comanda.prometidoEm)}</p>
            <ul>{comanda.itens.map((it, i) => <li key={i} className="flex justify-between"><span>{it.qtd}x {it.sabor}</span></li>)}</ul>
            <p className="font-bold">TOTAL: {totalUnidades(comanda)} un. • {brl(comanda.valorCentavos)}</p>
            <p>Obs.: {comanda.obs ?? "—"}</p>
          </div>
        </div>
      ) : null}

      {pag ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Consultar pagamento">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">Pagamento — #{pag.numero}</h2>
            <p className="mt-2 rounded bg-neutral-800 px-2 py-1.5">Forma: <b>{pag.pagamento || "—"}</b> • {pag.pagamentoConfirmado ? "confirmado" : "pendente"} • {brl(pag.valorCentavos)}</p>
            <p className="mt-1 text-xs text-neutral-400">Consulta demonstrativa — pagamentos nunca são alterados pelo preview.</p>
            <button type="button" onClick={() => setPagId(null)} className="mt-2 min-h-[48px] w-full rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Fechar</button>
          </div>
        </div>
      ) : null}

      {histAberto ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Histórico">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">Histórico (demo)</h2>
            <ul className="mt-2 space-y-1.5">
              {pedidos.filter((p) => p.coluna === "concluidos" || p.coluna === "cancelados").map((p) => (
                <li key={p.id} className="rounded bg-neutral-800 px-2 py-1.5">
                  <b>#{p.numero}</b> {p.cliente} • {p.coluna === "concluidos" ? "concluído" : "cancelado"}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setHistAberto(false)} className="mt-2 min-h-[48px] w-full rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Fechar</button>
          </div>
        </div>
      ) : null}

      {novoAberto ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Novo pedido demonstrativo">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            <h2 className="font-display text-lg font-bold">Novo Pedido (demo)</h2>
            <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Cliente</span>
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2" placeholder="Nome do cliente" />
            </label>
            <label className="mt-2 block"><span className="mb-1 block text-xs text-neutral-400">Telefone</span>
              <input value={novoTel} onChange={(e) => setNovoTel(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2" placeholder="(11) 90000-0000" />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-xs text-neutral-400">Tipo</span>
                <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as "entrega" | "retirada")} className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2">
                  <option value="entrega">Entrega</option><option value="retirada">Retirada</option>
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-xs text-neutral-400">Qtd. Coxinha</span>
                <input value={novoQtd} onChange={(e) => setNovoQtd(e.target.value)} inputMode="numeric" className="min-h-[44px] w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2" />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setNovoAberto(false)} className="min-h-[48px] rounded-lg border border-neutral-600 px-3 font-bold hover:bg-neutral-800">Cancelar</button>
              <button type="button" onClick={criarPedidoDemo} className="min-h-[48px] rounded-lg bg-yellow-500 px-3 font-bold text-black hover:bg-yellow-400">Criar em Novos</button>
            </div>
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

  function SeloTipo({ tipo }: { tipo: "entrega" | "retirada" }) {
    return tipo === "entrega"
      ? <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Entrega</span>
      : <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Retirada</span>;
  }

  function SeloSituacao({ p }: { p: PedidoAtendente }) {
    if (p.coluna === "aceitos") return <span className="rounded bg-yellow-500 px-1.5 py-0.5 text-[11px] font-bold text-black">Aguardando produção</span>;
    if (p.coluna === "producao") return <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Em produção</span>;
    if (p.coluna === "prontos" || p.coluna === "entrega") return <span className="rounded bg-green-700 px-1.5 py-0.5 text-[11px] font-bold text-white">Pronto</span>;
    return <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[11px] font-bold text-neutral-200">{p.coluna}</span>;
  }

  function LinhaBase({ p }: { p: PedidoAtendente }) {
    const atraso = emAtrasoAtendente(p, agora);
    return (
      <>
        <p className="mt-1 flex items-center gap-1.5 text-xs"><User className="size-3.5 shrink-0 text-neutral-400" aria-hidden />Cliente: <b>{p.cliente}</b></p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400"><Phone className="size-3 shrink-0" aria-hidden />{p.telefone}
          {p.tipo === "entrega" && p.distanciaKm != null ? <span className="ml-auto">↔ {p.distanciaKm.toFixed(1)} km</span> : null}
        </p>
        {p.endereco ? <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400"><MapPin className="size-3 shrink-0" aria-hidden /><span className="truncate">{p.endereco}</span></p> : null}
        <div className="mt-1 flex items-start gap-2">
          <ul className="min-w-0 flex-1 space-y-0.5 text-[13px]">
            {p.itens.map((it, i) => <li key={i}><span className="text-yellow-400" aria-hidden>▸ </span><b>{it.qtd}</b> {it.sabor}</li>)}
          </ul>
          <div className="w-[70px] shrink-0 rounded-lg bg-neutral-800/70 px-1.5 py-1 text-right text-[11px] leading-tight">
            <p className="text-neutral-400">Total</p>
            <p className="font-display text-base font-extrabold text-white">{totalUnidades(p)} un.</p>
            <p className="font-bold text-yellow-400">{brl(p.valorCentavos)}</p>
          </div>
        </div>
        <p className="mt-1 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-bold ${p.pagamentoConfirmado ? "bg-green-800 text-green-200" : "bg-red-800 text-red-200"}`}>
            {p.pagamento || "—"}{p.pagamentoConfirmado ? "" : " (pendente)"}
          </span>
          {atraso ? <span className="borda-atraso ml-1.5 rounded border-2 border-red-500 px-1.5 py-0.5 text-[11px] font-extrabold text-red-400">ATRASADO</span> : null}
        </p>
        {p.obs ? <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-1 text-[11px] text-amber-200">Obs.: {p.obs}</p> : null}
      </>
    );
  }

  function Cabecalho({ p, selo }: { p: PedidoAtendente; selo: React.ReactNode }) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="font-display text-lg font-extrabold">#{p.numero}</b>
        <span className="font-display text-lg font-extrabold text-yellow-400">{fmtHora(p.prometidoEm)}</span>
        {p.agendado ? <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-bold text-neutral-200">Agendado</span> : null}
        {selo}
        <span className="ml-auto"><SeloTipo tipo={p.tipo} /></span>
      </div>
    );
  }

  function CartaoNovo({ p, agora: ag, onAceitar, onAnalise, onCancelar, onDetalhe }: { p: PedidoAtendente; agora: number; onAceitar: () => void; onAnalise: () => void; onCancelar: () => void; onDetalhe: () => void }) {
    void ag;
    const atraso = emAtrasoAtendente(p, agora);
    return (
      <article className={`rounded-xl border bg-[#101013] p-2.5 ${atraso ? "borda-atraso border-2" : "border-amber-500/50"}`} aria-label={`Pedido ${p.numero} novo`}>
        <Cabecalho p={p} selo={<span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Novo agora</span>} />
        <LinhaBase p={p} />
        {p.bloqueio ? <p className="mt-1 rounded border border-red-600 bg-red-950 px-1.5 py-1 text-[11px] font-bold text-red-200">Bloqueio: {p.bloqueio}{p.emAnalise ? " • em análise" : ""}</p> : null}
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onAceitar} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-yellow-500 px-2 text-xs font-extrabold text-black hover:bg-yellow-400"><Check className="size-4" aria-hidden /> Aceitar Pedido</button>
          <button type="button" onClick={onDetalhe} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800"><Eye className="size-4" aria-hidden /> Ver detalhes</button>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onAnalise} className="min-h-[40px] rounded-lg border border-neutral-700 px-2 text-[11px] font-bold text-neutral-300 hover:bg-neutral-800"><TriangleAlert className="size-3 inline" aria-hidden /> Solicitar análise</button>
          <button type="button" onClick={onCancelar} className="min-h-[40px] rounded-lg border border-neutral-700 px-2 text-[11px] font-bold text-neutral-500 hover:bg-neutral-800">Cancelar</button>
        </div>
      </article>
    );
  }

  function CartaoAceito({ p, agora: ag, onLiberar, onDetalhe, onPag }: { p: PedidoAtendente; agora: number; onLiberar: () => void; onDetalhe: () => void; onPag: () => void }) {
    const falta = p.liberacaoEm ? Math.max(0, Math.round((p.liberacaoEm - ag) / MIN)) : 0;
    const liberado = podeLiberar(p, ag);
    return (
      <article className="rounded-xl border border-sky-700/50 bg-[#101013] p-2.5" aria-label={`Pedido ${p.numero} aceito`}>
        <Cabecalho p={p} selo={<span className="rounded bg-yellow-500 px-1.5 py-0.5 text-[11px] font-bold text-black">Aguardando produção</span>} />
        <LinhaBase p={p} />
        <p className="mt-1 rounded-lg bg-neutral-800/70 px-2 py-1.5 text-xs text-neutral-300">
          Previsão de envio para produção<br />
          <b className="font-display text-lg text-yellow-400">{p.liberacaoEm ? fmtHora(p.liberacaoEm) : "—"}</b>
          <span className="text-yellow-200"> {p.liberacaoEm ? (liberado ? "(liberado)" : `(em ${falta} min)`) : ""}</span>
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onLiberar} disabled={!liberado} title={liberado ? "Enviar para a cozinha (simulação)" : "Aguarde a janela de liberação"} className="min-h-[44px] rounded-lg bg-sky-600 px-2 text-xs font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40">
            {liberado ? "Liberar p/ cozinha" : `Libera em ${falta} min`}
          </button>
          <button type="button" onClick={onPag} className="min-h-[44px] rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800">Consultar pagamento</button>
        </div>
        <button type="button" onClick={onDetalhe} className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"><Eye className="size-3.5" aria-hidden /> Ver detalhes</button>
      </article>
    );
  }

  function CartaoProducao({ p, agora: ag, onDetalhe, onPronto, onComanda }: { p: PedidoAtendente; agora: number; onDetalhe: () => void; onPronto: () => void; onComanda: () => void }) {
    void ag;
    const atraso = emAtrasoAtendente(p, agora);
    return (
      <article className={`rounded-xl border bg-[#101013] p-2.5 ${atraso ? "borda-atraso border-2" : "border-purple-600/60"}`} aria-label={`Pedido ${p.numero} em produção`}>
        <Cabecalho p={p} selo={<span className="rounded bg-purple-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Em preparo</span>} />
        <LinhaBase p={p} />
        <p className="mt-1 rounded-lg bg-neutral-800/70 px-2 py-1.5 text-[11px] text-neutral-300">Na cozinha — a atendente acompanha, não opera o preparo.</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onDetalhe} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800"><Eye className="size-4" aria-hidden /> Ver detalhes</button>
          <button type="button" onClick={onComanda} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800"><Printer className="size-4" aria-hidden /> Comanda</button>
        </div>
        <button type="button" onClick={onPronto} className="mt-1.5 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-lg bg-purple-700 px-2 text-xs font-bold text-white hover:bg-purple-600">Simular cozinha: marcar pronto</button>
      </article>
    );
  }

  function CartaoPronto({ p, agora: ag, onComanda, onZap, onDetalhe, onAvancar, onRetirada }: { p: PedidoAtendente; agora: number; onComanda: () => void; onZap: () => void; onDetalhe: () => void; onAvancar: () => void; onRetirada: () => void }) {
    const haMin = p.prontoEm ? Math.max(0, Math.round((ag - p.prontoEm) / MIN)) : 0;
    const seloDespacho =
      p.despacho === "aguardando-motoboy" ? <span className="rounded bg-yellow-500 px-1.5 py-0.5 text-[11px] font-bold text-black">Aguardando Motoboy</span> :
      p.despacho === "atribuido" ? <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Atribuído{p.motoboy ? `: ${p.motoboy}` : ""}</span> :
      p.despacho === "em-rota" ? <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Em Rota{p.motoboy ? `: ${p.motoboy}` : ""}</span> :
      <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Aguardando Cliente</span>;
    return (
      <article className="rounded-xl border border-green-800/60 bg-[#101013] p-2.5" aria-label={`Pedido ${p.numero} pronto`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <b className="font-display text-lg font-extrabold">#{p.numero}</b>
          <span className="font-display text-lg font-extrabold text-yellow-400">{fmtHora(p.prometidoEm)}</span>
          <span className="rounded bg-green-700 px-1.5 py-0.5 text-[11px] font-bold text-white">Pronto</span>
          <span className="ml-auto"><SeloTipo tipo={p.tipo} /></span>
        </div>
        <LinhaBase p={p} />
        <p className="mt-1 rounded bg-green-950 px-1.5 py-1 text-[11px] font-bold text-green-200">Pronto há {haMin} min</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onComanda} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800"><Printer className="size-4" aria-hidden /> Imprimir</button>
          <button type="button" onClick={onZap} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-neutral-600 px-2 text-xs font-bold hover:bg-neutral-800"><MessageCircle className="size-4" aria-hidden /> WhatsApp</button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {seloDespacho}
          <button type="button" onClick={onDetalhe} aria-label="Ver detalhes" className="ml-auto grid size-9 place-items-center rounded-lg border border-neutral-600 hover:bg-neutral-800"><Eye className="size-4" aria-hidden /></button>
        </div>
        {p.tipo === "retirada" && p.despacho === "aguardando-cliente" ? (
          <button type="button" onClick={onRetirada} className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg bg-green-700 px-2 text-xs font-bold hover:bg-green-600"><Check className="size-4" aria-hidden /> Confirmar Retirada</button>
        ) : null}
        {p.tipo === "entrega" && p.despacho !== "em-rota" && p.coluna === "prontos" ? (
          <button type="button" onClick={onAvancar} className="mt-1.5 min-h-[40px] w-full rounded-lg border border-neutral-700 px-2 text-[11px] font-bold text-neutral-300 hover:bg-neutral-800">
            Demo despacho: {p.despacho === "aguardando-motoboy" ? "simular atribuído" : "simular saída"}
          </button>
        ) : null}
        {p.despacho === "em-rota" ? (
          <button type="button" onClick={onAvancar} className="mt-1.5 min-h-[40px] w-full rounded-lg bg-green-700 px-2 text-[11px] font-bold hover:bg-green-600">Demo: marcar entregue</button>
        ) : null}
      </article>
    );
  }
}
