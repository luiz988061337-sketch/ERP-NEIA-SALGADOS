import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { calcularProducao } from "@/lib/motor-producao";

/**
 * PRÉVIA FASE B — Sistema Inteligente de Produção (cozinha).
 * Rota: /preview/cozinha-inteligente
 * 100% dados fictícios, estado local. NÃO lê/escreve Supabase,
 * NÃO cria migration, NÃO altera /producao real, NÃO grava nada.
 * Reutiliza apenas o motor puro existente (calcularProducao).
 *
 * Demonstra: trilha de etapas por pedido (separar/fritar-assar/drenar/
 * embalar/conferir), embalagens fictícias com falta e baixa simulada,
 * gargalos, bloqueio visual de liberação e agendados fora da janela.
 */

export const Route = createFileRoute("/preview/cozinha-inteligente")({
  head: () => ({ meta: [{ title: "Prévia — Cozinha inteligente (fictício)" }] }),
  component: PreviewCozinhaInteligente,
});

type ColunaPedido = "novo" | "preparando" | "pronto" | "liberado";
type TarefaEstado = "pendente" | "fazendo" | "feita";
type AlertaNivel = "critico" | "atencao" | "info";
type EtapaKey = "separar" | "fritar" | "assar" | "drenar" | "embalar" | "conferir";

type PedidoMock = {
  numero: number;
  cliente: string;
  modalidade: "entrega" | "retirada";
  coluna: ColunaPedido;
  prometidoEmMin: number; // relativo a Date.now() (negativo = já passou)
  recebidoHaMin: number;
  observacao?: string;
  itens: { nome: string; qtd: number; slug: string }[];
};

type LoteMock = {
  codigo: string;
  produto: string;
  restante: number;
  validade: string;
  estado: "ok" | "baixo" | "bloqueado" | "vencido";
  motivo?: string;
};

const BASE_MIN = 60000;
const hhmm = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function bip(freq = 880, ms = 350): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = freq;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* sem áudio — visual cobre */
  }
}

const ETAPA_LABEL: Record<EtapaKey, string> = {
  separar: "separar",
  fritar: "fritar",
  assar: "forno",
  drenar: "drenar",
  embalar: "embalar",
  conferir: "conferir",
};

/** Etapas aplicáveis por produto (demonstração): frito/pastel exige
 *  fritura + drenagem; assado exige forno (sem drenagem); os demais
 *  seguem só separar → embalar → conferir. Bebida seria ignorada. */
function etapasDoPedido(itens: PedidoMock["itens"]): EtapaKey[] {
  const s = itens.map((i) => `${i.slug} ${i.nome}`).join(" ").toLowerCase();
  const temFrito = /frit|congelado|kit|salgad|pastel|pastéis|coxinha|kibe|risole|bolinha/.test(s);
  const temAssado = /assad|pizza|empad|esfiha/.test(s);
  const out: EtapaKey[] = ["separar"];
  if (temFrito) out.push("fritar");
  if (temAssado) out.push("assar");
  if (temFrito) out.push("drenar");
  out.push("embalar", "conferir");
  return out;
}

/** Regra FICTÍCIA de demonstração (não é regra comercial): caixas de
 *  50/100 conforme o total do pedido. A regra real será cadastrada
 *  pelo administrador na implementação. */
function embalagemNecessaria(total: number): { tipo: string; qtd: number }[] {
  const out: { tipo: string; qtd: number }[] = [];
  const cx100 = Math.floor(total / 100);
  const resto = total % 100;
  if (cx100 > 0) out.push({ tipo: "CX-100", qtd: cx100 });
  if (resto > 50) out.push({ tipo: "CX-100", qtd: 1 });
  else if (resto > 0) out.push({ tipo: "CX-50", qtd: 1 });
  return out;
}

/** Saldo FICTÍCIO de demonstração (não é estoque real). */
const EMB_SALDO_INICIAL: Record<string, number> = { "CX-50": 1, "CX-100": 4 };

/** Ciclo de fritura em curso (demonstração fictícia, ex.: "2/3"). */
const CICLO_DEMO: Record<number, string> = { 9001: "2/3" };

/** Fritadeira designada por pedido (demonstração de independência F1/F2). */
const EQUIP_FRITAR: Record<number, string> = {
  9001: "F1",
  9003: "F2",
  9004: "F1/F2",
  9005: "F1+F2",
  9006: "F1",
  9007: "F2",
  9008: "F1",
};

const PEDIDOS: PedidoMock[] = [
  { numero: 9001, cliente: "Fictícia Ana", modalidade: "entrega", coluna: "preparando", prometidoEmMin: 18, recebidoHaMin: 32, itens: [{ nome: "Coxinha", qtd: 100, slug: "salgados-fritos" }, { nome: "Kibe", qtd: 50, slug: "salgados-fritos" }] },
  { numero: 9002, cliente: "Fictício Beto", modalidade: "retirada", coluna: "preparando", prometidoEmMin: 35, recebidoHaMin: 20, itens: [{ nome: "Esfiha de carne", qtd: 60, slug: "salgados-assados" }] },
  { numero: 9003, cliente: "Fictícia Cida", modalidade: "entrega", coluna: "novo", prometidoEmMin: 55, recebidoHaMin: 5, itens: [{ nome: "Coxinha", qtd: 200, slug: "salgados-fritos" }, { nome: "Risole", qtd: 100, slug: "salgados-fritos" }] },
  { numero: 9004, cliente: "Fictício Davi", modalidade: "entrega", coluna: "novo", prometidoEmMin: 95, recebidoHaMin: 2, observacao: "Agendado — só entra em execução no início calculado.", itens: [{ nome: "Pastel de carne", qtd: 100, slug: "mini-pasteis" }, { nome: "Coxinha", qtd: 150, slug: "salgados-fritos" }] },
  { numero: 9005, cliente: "Fictícia Elisa", modalidade: "entrega", coluna: "novo", prometidoEmMin: 130, recebidoHaMin: 1, observacao: "Pedido grande 500 un — usa F1+F2 em paralelo.", itens: [{ nome: "Coxinha", qtd: 300, slug: "salgados-fritos" }, { nome: "Bolinha de queijo", qtd: 200, slug: "salgados-fritos" }] },
  { numero: 9006, cliente: "Fictício Fábio", modalidade: "retirada", coluna: "pronto", prometidoEmMin: -8, recebidoHaMin: 70, itens: [{ nome: "Kibe", qtd: 50, slug: "salgados-fritos" }] },
  { numero: 9007, cliente: "Fictícia Gilda", modalidade: "entrega", coluna: "pronto", prometidoEmMin: 12, recebidoHaMin: 65, itens: [{ nome: "Risole", qtd: 50, slug: "salgados-fritos" }] },
  { numero: 9008, cliente: "Fictício Heitor", modalidade: "entrega", coluna: "liberado", prometidoEmMin: -25, recebidoHaMin: 90, itens: [{ nome: "Coxinha", qtd: 50, slug: "salgados-fritos" }] },
];

const LOTES: LoteMock[] = [
  { codigo: "L-231", produto: "Coxinha", restante: 400, validade: "20/12/2026", estado: "ok" },
  { codigo: "L-118", produto: "Kibe", restante: 120, validade: "05/11/2026", estado: "baixo", motivo: "Validade próxima (FEFO primeiro) + saldo baixo" },
  { codigo: "L-301", produto: "Pastel de carne", restante: 300, validade: "15/01/2027", estado: "ok" },
  { codigo: "L-410", produto: "Esfiha de carne", restante: 500, validade: "10/02/2027", estado: "ok" },
  { codigo: "L-099", produto: "Risole", restante: 80, validade: "01/10/2026", estado: "vencido", motivo: "Vencido — BLOQUEADO até decisão autorizada" },
];

const EQUIPE = [
  { nome: "Ana", foco: "Fritura / retirada dos lotes", presente: true, pin: "PIN **** (fictício)", tarefa: "F1 · pedido 9001" },
  { nome: "Bia", foco: "Separação / embalagem", presente: true, pin: "PIN **** (fictício)", tarefa: "Embalar 9001 em paralelo" },
  { nome: "Carlos", foco: "Assados / forno", presente: true, pin: "PIN **** (fictício)", tarefa: "Forno · pedido 9002" },
  { nome: "Duda", foco: "Reforço pico", presente: false, pin: "—", tarefa: "Ausente (fictício)" },
];

const CHECK_CONFERENCIA = [
  "Quantidade total confere",
  "Quantidade por sabor confere",
  "Fritos e assados corretos",
  "Embalagens e identificação ok",
  "Instruções especiais verificadas",
  "Pedido, horário e modalidade corretos",
];

const ESTAGIOS_INICIAIS: Record<string, TarefaEstado> = {
  "9001:separar": "feita",
  "9001:fritar": "fazendo",
  "9002:separar": "feita",
  "9002:assar": "fazendo",
  "9006:separar": "feita",
  "9006:fritar": "feita",
  "9006:drenar": "feita",
  "9006:embalar": "feita",
  "9006:conferir": "fazendo",
  "9007:separar": "feita",
  "9007:fritar": "feita",
  "9007:drenar": "feita",
  "9007:embalar": "feita",
  "9007:conferir": "feita",
  "9008:separar": "feita",
  "9008:fritar": "feita",
  "9008:drenar": "feita",
  "9008:embalar": "feita",
  "9008:conferir": "feita",
};

const COLUNA_INICIAL: Record<number, ColunaPedido> = {
  9001: "preparando",
  9002: "preparando",
  9003: "novo",
  9004: "novo",
  9005: "novo",
  9006: "pronto",
  9007: "pronto",
  9008: "liberado",
};

export function PreviewCozinhaInteligente() {
  const agora = useMemo(() => Date.now(), []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const agoraTick = agora + tick * 1000;

  const [etapas, setEtapas] = useState<Record<string, TarefaEstado>>(ESTAGIOS_INICIAIS);
  const [colunaPorPedido, setColunaPorPedido] = useState<Record<number, ColunaPedido>>(COLUNA_INICIAL);
  const [embBaixado, setEmbBaixado] = useState<Record<string, number>>({});
  const [somAtivo, setSomAtivo] = useState(false);
  const [emergencia, setEmergencia] = useState(false);
  const [check, setCheck] = useState<Record<string, boolean>>({});
  const [simQtd, setSimQtd] = useState(150);
  const [simMin, setSimMin] = useState(60);
  const [turnoAberto, setTurnoAberto] = useState(false);

  const saldoEmb = (tipo: string): number =>
    (EMB_SALDO_INICIAL[tipo] ?? 0) - (embBaixado[tipo] ?? 0);

  function estadoEtapa(numero: number, etapa: EtapaKey): TarefaEstado {
    return etapas[`${numero}:${etapa}`] ?? "pendente";
  }

  function alternarEtapa(numero: number, etapa: EtapaKey, total: number): void {
    const key = `${numero}:${etapa}`;
    const antes = etapas[key] ?? "pendente";
    const depois: TarefaEstado =
      antes === "pendente" ? "fazendo" : antes === "fazendo" ? "feita" : "pendente";
    setEtapas((v) => ({ ...v, [key]: depois }));
    // Baixa SIMULADA de embalagens (demonstração local): concluir "embalar"
    // consome o previsto; reabrir a etapa estorna. Nada toca estoque real.
    if (etapa === "embalar") {
      const need = embalagemNecessaria(total);
      setEmbBaixado((v) => {
        const n = { ...v };
        for (const it of need) {
          const delta = depois === "feita" ? it.qtd : antes === "feita" ? -it.qtd : 0;
          n[it.tipo] = (n[it.tipo] ?? 0) + delta;
        }
        return n;
      });
    }
  }

  function reiniciarDemo(): void {
    setEtapas(ESTAGIOS_INICIAIS);
    setColunaPorPedido(COLUNA_INICIAL);
    setEmbBaixado({});
    setCheck({});
  }

  const pedidosCalc = useMemo(
    () =>
      PEDIDOS.map((p) => {
        const calc = calcularProducao(
          p.itens.map((i) => ({ nome: i.nome, quantidade: i.qtd, categoriaSlug: i.slug })),
        );
        const tecnico = calc.tecnicoMin ?? 0;
        // Programação de trás para frente (prévia): técnico + separar/embalar/conf + margem 10.
        const extraMin = 3 + 2 + 3 + 10;
        const prometido = agora + p.prometidoEmMin * BASE_MIN;
        const inicio = prometido - (tecnico + extraMin) * BASE_MIN;
        const restanteMin = (prometido - agoraTick) / BASE_MIN;
        const coluna = colunaPorPedido[p.numero] ?? p.coluna;
        let nivel: AlertaNivel = "info";
        let rotulo = "No prazo";
        if (coluna === "liberado") {
          nivel = "info";
          rotulo = "Liberado";
        } else if (restanteMin < 0) {
          nivel = "critico";
          rotulo = `ATRASADO ${Math.abs(Math.round(restanteMin))} min`;
        } else if (restanteMin < tecnico + extraMin) {
          nivel = "critico";
          rotulo = "RISCO — inicia já";
        } else if (restanteMin <= 20) {
          nivel = "atencao";
          rotulo = "Atenção — próximo do limite";
        }
        const etapasLista = etapasDoPedido(p.itens);
        const total = p.itens.reduce((s, i) => s + i.qtd, 0);
        const pendentes = etapasLista.filter(
          (e) => (etapas[`${p.numero}:${e}`] ?? "pendente") !== "feita",
        ).length;
        const embNeed = embalagemNecessaria(total);
        const embFalta = embNeed.filter((n) => n.qtd > saldoEmb(n.tipo));
        return { ...p, coluna, calc, tecnico, inicio, prometido, restanteMin, nivel, rotulo, etapasLista, total, pendentes, embNeed, embFalta };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agora, agoraTick, etapas, colunaPorPedido, embBaixado],
  );

  const porColuna = (c: ColunaPedido) => pedidosCalc.filter((p) => p.coluna === c);
  const emPreparo = pedidosCalc.filter((p) => p.coluna === "preparando");
  const drenAg = emPreparo.filter((p) => p.etapasLista.includes("drenar") && estadoEtapa(p.numero, "drenar") === "pendente").length;
  const drenProc = emPreparo.filter((p) => p.etapasLista.includes("drenar") && estadoEtapa(p.numero, "drenar") === "fazendo").length;
  const embRisco = pedidosCalc.filter(
    (p) => (p.coluna === "novo" || p.coluna === "preparando") && p.embFalta.length > 0,
  ).length;

  function filaEquip(equip: "F1" | "F2" | "FORNO") {
    return pedidosCalc.filter((p) => {
      if (p.coluna !== "novo" && p.coluna !== "preparando") return false;
      if (equip === "FORNO") return p.etapasLista.includes("assar");
      const desig = EQUIP_FRITAR[p.numero] ?? "";
      return p.etapasLista.includes("fritar") && desig.includes(equip);
    });
  }

  const alertas: { nivel: AlertaNivel; texto: string }[] = useMemo(() => {
    const a: { nivel: AlertaNivel; texto: string }[] = [];
    for (const p of pedidosCalc) {
      if (p.nivel === "critico" && p.coluna !== "liberado")
        a.push({ nivel: "critico", texto: `#${p.numero} ${p.rotulo} — causa: ${p.prometidoEmMin < 0 ? "horário prometido passou" : "tempo técnico ≥ restante"} (fictício)` });
      else if (p.nivel === "atencao")
        a.push({ nivel: "atencao", texto: `#${p.numero} ${p.rotulo} — preparar início às ${hhmm(p.inicio)} (fictício)` });
      for (const f of p.embFalta) {
        if (p.coluna === "novo" || p.coluna === "preparando")
          a.push({ nivel: "critico", texto: `#${p.numero} FALTA EMBALAGEM ${f.tipo} ×${f.qtd} (saldo fictício ${saldoEmb(f.tipo)}) — risco de não cumprir o prazo (fictício)` });
      }
    }
    a.push({ nivel: "critico", texto: "Lote L-099 Risole VENCIDO — bloqueado, sem substituição automática (fictício)" });
    if (emergencia)
      a.push({ nivel: "critico", texto: "EMERGÊNCIA (fictícia): F2 indisponível — capacidade recalculada p/ 1 fritadeira; 9005 em risco" });
    if (drenAg + drenProc > 0)
      a.push({ nivel: "atencao", texto: `Drenagem: ${drenAg} aguardando + ${drenProc} em processo (tempo: A definir — sem padrão operacional)` });
    a.push({ nivel: "atencao", texto: "Lote L-118 Kibe baixo + validade próxima — usar FEFO primeiro (fictício)" });
    a.push({ nivel: "atencao", texto: "Motoboy aguardando há 8 min · pedido 9007 pronto (fictício)" });
    a.push({ nivel: "atencao", texto: "Pedido 9006 pronto aguardando retirada — avisar cliente (fictício)" });
    a.push({ nivel: "info", texto: "Forno turbo livre após 9002 · F1 em ciclo 3min30 ref · embalagem em paralelo (fictício)" });
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidosCalc, emergencia]);

  const criticos = alertas.filter((a) => a.nivel === "critico").length;
  const atencao = alertas.filter((a) => a.nivel === "atencao").length;

  const simCalc = useMemo(
    () => calcularProducao([{ nome: "Coxinha", quantidade: simQtd, categoriaSlug: "salgados-fritos" }]),
    [simQtd],
  );
  const simViavel = (simCalc.tecnicoMin ?? 0) + 13 <= simMin;

  const confFeitas = CHECK_CONFERENCIA.filter((c) => check[c]).length;
  const confCompleta = confFeitas === CHECK_CONFERENCIA.length;

  function estiloAlerta(n: AlertaNivel): string {
    if (n === "critico") return "border-red-500 bg-red-950/60 text-red-100 animate-pulse";
    if (n === "atencao") return "border-amber-400/60 bg-amber-950/40 text-amber-100";
    return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }

  function estiloChip(e: TarefaEstado): string {
    if (e === "feita") return "bg-emerald-900 text-emerald-200 border-emerald-600";
    if (e === "fazendo") return "bg-sky-900 text-sky-200 border-sky-500 animate-pulse";
    return "bg-zinc-950 text-zinc-400 border-zinc-700";
  }

  function trilha(p: (typeof pedidosCalc)[number]) {
    return (
      <div className="mt-2 flex flex-wrap gap-1" aria-label={`Etapas do pedido ${p.numero}`}>
        {p.etapasLista.map((e) => {
          const est = estadoEtapa(p.numero, e);
          const icone = est === "feita" ? "✔" : est === "fazendo" ? "◉" : "○";
          const ciclo = e === "fritar" && CICLO_DEMO[p.numero] ? ` ${CICLO_DEMO[p.numero]}` : "";
          const need =
            e === "embalar" ? ` ${p.embNeed.map((n) => `${n.tipo}×${n.qtd}`).join("+")}` : "";
          const extra =
            e === "fritar" ? ` ${EQUIP_FRITAR[p.numero] ?? "F1/F2"}${ciclo}` :
            e === "drenar" ? " (tempo: A definir)" : "";
          return (
            <button
              key={e}
              type="button"
              onClick={() => alternarEtapa(p.numero, e, p.total)}
              title={`Toque para avançar (demonstração local): ${ETAPA_LABEL[e]} — ${est}`}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${estiloChip(est)}`}
            >
              {icone} {ETAPA_LABEL[e]}{extra}{need}
            </button>
          );
        })}
      </div>
    );
  }

  function linhaEmbalagem(p: (typeof pedidosCalc)[number]) {
    if (p.embFalta.length > 0) {
      const f = p.embFalta[0];
      if (!f) return null;
      return (
        <p className="mt-1 rounded bg-red-950 p-1.5 text-center text-[11px] font-extrabold text-red-200">
          🔴 📦 {p.embNeed.map((n) => `${n.tipo}×${n.qtd}`).join(" + ")} · FALTA {f.tipo}×{f.qtd} (saldo fictício {saldoEmb(f.tipo)}) — risco ao prazo
        </p>
      );
    }
    return (
      <p className="mt-1 rounded bg-zinc-950 p-1.5 text-center text-[11px] text-zinc-300">
        📦 {p.embNeed.map((n) => `${n.tipo}×${n.qtd}`).join(" + ")} · saldo fictício OK (demonstração)
      </p>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
          PRÉVIA FASE B — dados 100% fictícios, estado local, sem banco, sem gravar nada. Tempos (3min30/ciclo,
          margem 10min, forno 800un) são referências iniciais a validar — não são padrão oficial.
          Drenagem: tempo <strong>A definir</strong> (sem padrão operacional). Embalagens: tipos, saldos e
          regra por total são <strong>demonstração fictícia</strong>. Relógio demo: {hhmm(agoraTick)}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold">🍳 Cozinha inteligente — painel principal (prévia)</h1>
          <span className="ml-auto flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-red-600 px-3 py-1 font-bold">🔴 {criticos} críticos</span>
            <span className="rounded-full bg-amber-500 px-3 py-1 font-bold text-black">🟡 {atencao} atenção</span>
            <span className="rounded-full bg-sky-600 px-3 py-1 font-bold">⏳ Drenagem: {drenAg} aguard. + {drenProc} em proc.</span>
            <span className="rounded-full bg-zinc-700 px-3 py-1 font-bold">🧱 Embalagem: {embRisco} em risco</span>
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => { const v = !somAtivo; setSomAtivo(v); if (v) bip(); }} className={`rounded-lg px-3 py-1.5 font-bold ${somAtivo ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            🔊 Som: {somAtivo ? "ligado" : "desligado"}
          </button>
          <button type="button" onClick={() => { if (somAtivo) bip(330); }} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">Testar crítico</button>
          <button type="button" onClick={() => setEmergencia((e) => !e)} className={`rounded-lg px-3 py-1.5 font-bold ${emergencia ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            🚨 Emergência F2: {emergencia ? "ATIVA (fictícia)" : "desligada"}
          </button>
          <button type="button" onClick={() => setTurnoAberto((v) => !v)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
            📋 Turno: {turnoAberto ? "aberto (checklist fictício)" : "abrir checklist"}
          </button>
          <button type="button" onClick={reiniciarDemo} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
            ↺ Reiniciar demo
          </button>
        </div>

        {turnoAberto ? (
          <section className="mt-3 rounded-xl bg-zinc-900 p-4 text-xs" aria-label="Abertura de turno">
            <h2 className="font-extrabold">📋 Abertura de turno (fictícia — nada é salvo)</h2>
            <ul className="mt-1 grid gap-1 md:grid-cols-2">
              {["Equipe presente confirmada (PIN fictício)", "Óleo + fritadeiras aquecidas ~10min ref", "Forno turbo verificado", "Estoque congelado + validades conferidos", "Pedidos agendados revisados", "Caixas 50/100 + etiquetas disponíveis"].map((c) => (
                <li key={c} className="rounded bg-zinc-950 p-2">☑ {c}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-3 grid gap-3 lg:grid-cols-3" aria-label="Equipamentos">
          {([
            { nome: "🔥 Fritadeira 1", lista: filaEquip("F1"), extra: "50 un/ciclo · 3min30 ref · aquecimento ~10min ref · sem misturar pedidos" },
            { nome: emergencia ? "🔥 Fritadeira 2 — INDISPONÍVEL" : "🔥 Fritadeira 2", lista: emergencia ? [] : filaEquip("F2"), extra: "50 un/ciclo · 3min30 ref · independente" },
            { nome: "🥐 Forno turbo", lista: filaEquip("FORNO"), extra: "Até 800+ un ref · confirmação visual, sem liberação automática" },
          ] as { nome: string; lista: typeof pedidosCalc; extra: string }[]).map((e) => {
            const fazendo = e.lista.find((p) => {
              const etapa = e.nome.includes("Forno") ? "assar" : "fritar";
              return estadoEtapa(p.numero, etapa as EtapaKey) === "fazendo";
            });
            return (
              <article key={e.nome} className="rounded-xl bg-zinc-900 p-4 text-xs">
                <h2 className="font-extrabold">{e.nome}</h2>
                <p className="mt-1 text-zinc-400">{e.extra}</p>
                <p className="mt-1 font-bold text-emerald-300">
                  {emergencia && e.nome.includes("2") ? "🚨 Em manutenção (fictícia) — capacidade fora do cálculo" : fazendo ? `Em processo: #${fazendo.numero} (toque no chip do cartão)` : e.lista.length > 0 ? `Livre · na fila: ${e.lista.map((p) => `#${p.numero}`).join(", ")}` : "Livre · sem fila"}
                </p>
                <ul className="mt-2 space-y-1">
                  {e.lista.length === 0 ? <li className="text-zinc-500">Sem tarefas na fila.</li> : null}
                  {e.lista.map((p) => {
                    const etapa = e.nome.includes("Forno") ? "assar" : "fritar";
                    return (
                      <li key={p.numero} className="rounded bg-zinc-950 p-2">
                        <strong>#{p.numero}</strong> {p.itens.map((i) => `${i.nome} ${i.qtd}`).join(" + ")} · {estadoEtapa(p.numero, etapa as EtapaKey)}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Alertas">
          <h2 className="font-extrabold">🚦 Alertas (críticos ≠ avisos comuns)</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {alertas.map((a, i) => (
              <p key={i} className={`rounded-lg border-2 p-2 text-xs font-semibold ${estiloAlerta(a.nivel)}`}>
                {a.nivel === "critico" ? "🔴 CRÍTICO — " : a.nivel === "atencao" ? "🟡 ATENÇÃO — " : "🔵 INFO — "}{a.texto}
              </p>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Críticos: vermelhos, pulsantes, só somem com confirmação (na implementação real). Som pode silenciar sem apagar o alerta.</p>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
          {([["🆕 NOVOS", "novo"], ["👨‍🍳 EM PREPARAÇÃO", "preparando"], ["✅ PRONTOS", "pronto"], ["📦 LIBERADOS", "liberado"]] as [string, ColunaPedido][]).map(([titulo, col]) => (
            <section key={col} aria-label={titulo}>
              <h2 className="font-extrabold">{titulo} ({porColuna(col).length})</h2>
              <div className="mt-2 space-y-3">
                {porColuna(col).map((p) => (
                  <article key={p.numero} className={`rounded-xl border-2 bg-zinc-900 p-3 text-xs ${p.nivel === "critico" ? "border-red-500" : p.nivel === "atencao" ? "border-amber-400" : "border-zinc-700"}`}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold">#{p.numero}</h3>
                      <span className="ml-auto text-zinc-400">{p.modalidade === "entrega" ? "🚚" : "🏪"} {p.modalidade}</span>
                    </div>
                    <p className="font-semibold">{p.cliente}</p>
                    <ul className="mt-1 space-y-0.5 rounded bg-zinc-950 p-2">
                      {p.itens.map((i) => (
                        <li key={i.nome} className="flex justify-between"><span>{i.nome}</span><strong className="text-amber-300">{i.qtd}</strong></li>
                      ))}
                    </ul>
                    {trilha(p)}
                    {linhaEmbalagem(p)}
                    <p className="mt-1 text-zinc-300">🎯 Técnico {p.tecnico} min (motor existente) · ▶️ início {hhmm(p.inicio)} · ⏰ prometido {hhmm(p.prometido)}</p>
                    <p className={`mt-1 rounded p-1.5 text-center font-extrabold ${p.nivel === "critico" ? "bg-red-950 text-red-200" : p.nivel === "atencao" ? "bg-amber-950 text-amber-200" : "bg-zinc-950 text-zinc-200"}`}>
                      {p.coluna === "liberado" ? "✅ LIBERADO (demo)" : `⏱️ ${p.rotulo} · restam ${Math.round(p.restanteMin)} min`}
                    </p>
                    {p.observacao ? <p className="mt-1 italic text-zinc-500">{p.observacao}</p> : null}
                    {p.coluna === "preparando" ? (
                      p.pendentes > 0 ? (
                        <p className="mt-1 rounded bg-red-950 p-1.5 text-center text-[11px] font-extrabold text-red-200">
                          🔒 Liberação bloqueada — {p.pendentes} etapa(s) obrigatória(s) pendente(s) (demo)
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setColunaPorPedido((v) => ({ ...v, [p.numero]: "pronto" }))}
                          className="mt-1 w-full rounded-lg bg-emerald-600 p-1.5 text-[11px] font-extrabold hover:bg-emerald-500"
                        >
                          ✅ Etapas completas — mover p/ PRONTOS (demo)
                        </button>
                      )
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">Trilha: ✔ concluído · ◉ em andamento · ○ aguardando (toque no chip p/ avançar — demonstração local). Só aparecem as etapas aplicáveis ao produto; drenagem sem tempo padrão (a definir).</p>

        <section className="mt-4 grid gap-3 lg:grid-cols-2" aria-label="Drenagem e equipe">
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">💧 Drenagem por item (demonstração — tempo a definir)</h2>
            <ul className="mt-2 space-y-1.5">
              {emPreparo.filter((p) => p.etapasLista.includes("drenar")).map((p) => {
                const est = estadoEtapa(p.numero, "drenar");
                return (
                  <li key={p.numero} className="rounded-lg bg-zinc-950 p-2">
                    <strong>#{p.numero}</strong> {p.itens.filter((i) => /frit|pastel|coxinha|kibe|risole|bolinha/i.test(`${i.slug} ${i.nome}`)).map((i) => i.nome).join(", ") || "fritos"} —{" "}
                    {est === "feita" ? "✅ liberado p/ montagem" : est === "fazendo" ? "◉ em processo (início registrado na demo)" : "○ aguardando fritura terminar"}
                    <span className="block text-zinc-400">Responsável demo: Ana (fritura) · atraso de etapa não marca o pedido todo como atrasado</span>
                  </li>
                );
              })}
              {emPreparo.filter((p) => p.etapasLista.includes("drenar")).length === 0 ? (
                <li className="text-zinc-500">Nenhum pedido em preparo exige drenagem agora.</li>
              ) : null}
            </ul>
          </div>
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">👥 Equipe disponível (2–5, sem cargo fixo — PIN fictício)</h2>
            <ul className="mt-2 space-y-1.5">
              {EQUIPE.map((f) => (
                <li key={f.nome} className={`rounded-lg p-2 ${f.presente ? "bg-zinc-950" : "bg-zinc-950/50 text-zinc-500"}`}>
                  <strong>{f.presente ? "🟢" : "⚪"} {f.nome}</strong> — {f.foco} · {f.pin}
                  <span className="block text-zinc-400">{f.tarefa}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-zinc-500">Responsável redistribui pelo gargalo; quem está na fritadeira não larga o equipamento p/ o forno.</p>
          </div>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-2" aria-label="Estoque e conferência">
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">❄️ Estoque congelado — lotes + FEFO (fictício)</h2>
            <ul className="mt-2 space-y-1.5">
              {LOTES.map((l) => (
                <li key={l.codigo} className={`rounded-lg border p-2 ${l.estado === "vencido" || l.estado === "bloqueado" ? "border-red-500 bg-red-950/40" : l.estado === "baixo" ? "border-amber-400/60 bg-amber-950/30" : "border-zinc-800 bg-zinc-950"}`}>
                  <strong>{l.codigo}</strong> · {l.produto} · restam <strong>{l.restante}</strong> · val {l.validade}
                  {l.motivo ? <span className="block">{l.estado === "baixo" ? "⚠️" : "🔴"} {l.motivo}</span> : null}
                </li>
              ))}
            </ul>
            <h3 className="mt-3 font-extrabold">📦 Embalagens (demonstração fictícia — nada é real)</h3>
            <ul className="mt-1 space-y-1.5">
              {Object.keys(EMB_SALDO_INICIAL).map((t) => {
                const saldo = saldoEmb(t);
                const nivel = saldo <= 1 ? "critico" : saldo <= 4 ? "atencao" : "ok";
                return (
                  <li key={t} className={`rounded-lg border p-2 ${nivel === "critico" ? "border-red-500 bg-red-950/40" : nivel === "atencao" ? "border-amber-400/60 bg-amber-950/30" : "border-zinc-800 bg-zinc-950"}`}>
                    <strong>{t}</strong> · saldo fictício <strong>{saldo}</strong> · consumo confirmado na montagem (demo): <strong>{embBaixado[t] ?? 0}</strong>
                    {nivel === "critico" ? <span className="block">🔴 Estoque crítico — repor antes que trave prazos (demonstração)</span> : null}
                    {nivel === "atencao" ? <span className="block">🟡 Estoque baixo — programar reposição (demonstração)</span> : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-zinc-500">Ex.: se um pedido precisa 2× CX-50 e há 1 disponível → 🔴 falta, pedido sinalizado e liberação travada; os demais seguem (demonstração).</p>
            <p className="mt-1 text-zinc-500">Reserva após confirmação · baixa física ao retirar do freezer/montar · cancelamento libera reserva sem repor físico sozinho.</p>
          </div>
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">✅ Conferência final — pedido 9006 (local, bloqueia liberação)</h2>
            <ul className="mt-2 space-y-1.5">
              {CHECK_CONFERENCIA.map((c) => (
                <li key={c}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-950 p-2 hover:bg-zinc-800">
                    <input type="checkbox" checked={Boolean(check[c])} onChange={() => setCheck((v) => ({ ...v, [c]: !v[c] }))} />
                    {c}
                  </label>
                </li>
              ))}
            </ul>
            <p className={`mt-2 rounded-lg p-2 text-center font-extrabold ${confCompleta ? "bg-emerald-900 text-emerald-200" : "bg-red-950 text-red-200"}`}>
              {confCompleta ? "✅ Liberado p/ retirada/entrega (demo local)" : `🔒 Divergência bloqueia — faltam ${CHECK_CONFERENCIA.length - confFeitas} itens`}
            </p>
            <p className="mt-1 text-zinc-500">Retirada: confirmar entrega ao cliente · Entrega: motoboy confirma recebimento antes da rota.</p>
          </div>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-3" aria-label="Retirada, entrega e indicadores">
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">🛵 Aguardando motoboy / 🏪 retirada</h2>
            <ul className="mt-2 space-y-1.5">
              <li className="rounded bg-zinc-950 p-2">🏪 #9006 Fábio — aguardando cliente (avisar · não marcar sem confirmação)</li>
              <li className="rounded bg-zinc-950 p-2">🛵 #9007 Gilda — liberado, motoboy a caminho · espera 8 min · permanência máx 10 min (regra operacional)</li>
              <li className="rounded bg-zinc-950 p-2">🛵 Rota demo (≤3 entregas): 9007 → 9001 → 9003 · Carlos disponível, Duda em rota</li>
            </ul>
          </div>
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">📊 Indicadores (fictícios)</h2>
            <ul className="mt-2 space-y-1.5">
              <li className="rounded bg-zinc-950 p-2">Pontualidade: <strong className="text-emerald-300">92%</strong> · em risco: 2 · atrasados: 1</li>
              <li className="rounded bg-zinc-950 p-2">Previsto × real: fritura +0,4 min/ciclo · embalagem −0,1 min/50un (sugestão, sem auto-alterar padrão)</li>
              <li className="rounded bg-zinc-950 p-2">Desperdício: 12 un (drenagem) + 2 cx · motivo, lote, responsável registrados</li>
              <li className="rounded bg-zinc-950 p-2">Utilização: F1 85% · F2 {emergencia ? "0% (emergência)" : "40%"} · forno 60% · motoboy espera 8 min</li>
            </ul>
          </div>
          <div className="rounded-xl bg-zinc-900 p-4 text-xs">
            <h2 className="font-extrabold">⏱️ Simulação de prazo (site)</h2>
            <label className="mt-2 block">Quantidade (un)
              <input type="number" value={simQtd} min={50} step={50} onChange={(e) => setSimQtd(Number(e.target.value) || 50)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2" />
            </label>
            <label className="mt-2 block">Prazo desejado (min)
              <input type="number" value={simMin} min={10} onChange={(e) => setSimMin(Number(e.target.value) || 10)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2" />
            </label>
            <p className={`mt-2 rounded-lg p-2 text-center font-extrabold ${simViavel ? "bg-emerald-900 text-emerald-200" : "bg-red-950 text-red-200"}`}>
              {simViavel ? `✅ Viável — técnico ${simCalc.tecnicoMin ?? "?"} min + margem` : `🚨 Inviável — técnico ${simCalc.tecnicoMin ?? "?"} min > prazo · sugerir alternativa ou responsável`}
            </p>
            <p className="mt-1 text-zinc-500">Carrinho não confirmado nunca bloqueia capacidade (reserva temporária expira).</p>
          </div>
        </section>

        <p className="mt-4 pb-10 text-center text-xs text-zinc-500">
          Prévia navegável em /preview/cozinha-inteligente · reutiliza motor-producao + padrões das prévias existentes ·
          próxima etapa (após sua aprovação visual): fundação, permissões e estados de tarefas — sem tocar no real antes.
        </p>
      </div>
    </div>
  );
}
