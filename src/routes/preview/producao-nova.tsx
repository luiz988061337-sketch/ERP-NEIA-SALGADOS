import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calcularPedido,
  entradaJanela,
  estadoPrazo,
  formatarMinutos,
  horaCurta,
  LIMIAR_ATENCAO_MIN,
  MOTOR_PREVIEW_CONFIG,
  NIVEL_META,
  inicioRecomendado,
  limiteImediato,
  type CalculoPedido,
  type ColunaPreview,
  type ItemPedidoPreview,
  type PedidoPreview,
} from "@/lib/motor-prazo-preview";

/**
 * PREVIEW ONLY (Fase 1.5) — Novo Painel de Produção + Motor de Prazos.
 * Rota: /preview/producao-nova. Dados 100% fictícios, estado local.
 * NÃO lê/escreve Supabase, NÃO altera o `/producao` real, NÃO cria migration.
 */

export const Route = createFileRoute("/preview/producao-nova")({
  head: () => ({ meta: [{ title: "Preview — Painel de Produção (motor de prazos)" }] }),
  component: PreviewProducaoNova,
});

const MIN = 60000;

function iso(base: number, deltaMin: number): string {
  return new Date(base + deltaMin * MIN).toISOString();
}

/** 12 cenários da Fase 1.5 + 3 apoios (2 prontos, 1 futuro distante). Tempos relativos ao relógio. */
function criarMocks(base: number): PedidoPreview[] {
  return [
    { numero: 2001, cliente: "Cenário 1 — Ana", tipoEntrega: "entrega", recebidoEm: iso(base, -5), solicitadoPara: null, coluna: "novo", itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }] },
    { numero: 2002, cliente: "Cenário 2 — Bruno", tipoEntrega: "retirada", recebidoEm: iso(base, -10), solicitadoPara: null, coluna: "novo", itens: [{ sabor: "Coxinha", qtd: 150, tipo: "frito" }, { sabor: "Kibe", qtd: 150, tipo: "frito" }] },
    { numero: 2003, cliente: "Cenário 3 — Carla", tipoEntrega: "entrega", recebidoEm: iso(base, -12), solicitadoPara: null, coluna: "preparando", itens: [{ sabor: "Coxinha", qtd: 200, tipo: "frito" }, { sabor: "Kibe", qtd: 150, tipo: "frito" }, { sabor: "Bolinha de queijo", qtd: 150, tipo: "frito" }, { sabor: "Risole", qtd: 100, tipo: "frito" }] },
    { numero: 2004, cliente: "Cenário 4 — Diego", tipoEntrega: "entrega", recebidoEm: iso(base, -20), solicitadoPara: null, coluna: "preparando", itens: [{ sabor: "Coxinha", qtd: 400, tipo: "frito" }, { sabor: "Kibe", qtd: 300, tipo: "frito" }, { sabor: "Pastel frito", qtd: 300, tipo: "frito" }] },
    { numero: 2005, cliente: "Cenário 5 — Elisa", tipoEntrega: "entrega", recebidoEm: iso(base, -8), solicitadoPara: null, coluna: "novo", itens: [{ sabor: "Coxinha", qtd: 500, tipo: "frito" }, { sabor: "Kibe", qtd: 400, tipo: "frito" }, { sabor: "Risole", qtd: 300, tipo: "frito" }] },
    { numero: 2006, cliente: "Cenário 6 — Fábio", tipoEntrega: "retirada", recebidoEm: iso(base, -6), solicitadoPara: null, coluna: "novo", itens: [{ sabor: "Pastel de carne", qtd: 50, tipo: "pastel" }, { sabor: "Pastel de queijo", qtd: 50, tipo: "pastel" }] },
    { numero: 2007, cliente: "Cenário 7 — Gabi", tipoEntrega: "retirada", recebidoEm: iso(base, -15), solicitadoPara: null, coluna: "novo", itens: [{ sabor: "Esfiha de carne", qtd: 60, tipo: "assado" }] },
    { numero: 2008, cliente: "Cenário 8 — Hélio", tipoEntrega: "entrega", recebidoEm: null, solicitadoPara: iso(base, 150), coluna: "agendado", itens: [{ sabor: "Coxinha", qtd: 120, tipo: "frito" }, { sabor: "Kibe", qtd: 80, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }, { sabor: "Esfiha de carne", qtd: 100, tipo: "assado" }] },
    { numero: 1060, cliente: "Cenário 9 — Iara (imediato)", tipoEntrega: "entrega", recebidoEm: iso(base, -20), solicitadoPara: null, coluna: "preparando", observacao: "Exemplo da especificação: recebido 14:20, prazo cliente 15:00–15:20.", itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 50, tipo: "pastel" }, { sabor: "Esfiha de carne", qtd: 50, tipo: "assado" }] },
    { numero: 1050, cliente: "Cenário 10 — João (agendado)", tipoEntrega: "entrega", recebidoEm: null, solicitadoPara: iso(base, 90), coluna: "novo", observacao: "Entrou na janela de produção agora (solicitado − 1h30).", itens: [{ sabor: "Coxinha", qtd: 120, tipo: "frito" }, { sabor: "Kibe", qtd: 80, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }, { sabor: "Esfiha de carne", qtd: 100, tipo: "assado" }] },
    { numero: 1051, cliente: "Cenário 10b — Hora de preparar", tipoEntrega: "retirada", recebidoEm: null, solicitadoPara: iso(base, 30), coluna: "novo", observacao: "Restam 30 min (≥ técnico 14) e o início recomendado (solicitado − 14 − buffer 10) já passou.", itens: [{ sabor: "Coxinha", qtd: 120, tipo: "frito" }, { sabor: "Kibe", qtd: 80, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }, { sabor: "Esfiha de carne", qtd: 100, tipo: "assado" }] },
    { numero: 1061, cliente: "Cenário 11 — No limite (60min)", tipoEntrega: "entrega", recebidoEm: iso(base, -55), solicitadoPara: null, coluna: "preparando", itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }, { sabor: "Esfiha de carne", qtd: 50, tipo: "assado" }] },
    { numero: 1052, cliente: "Cenário 12 — Risco de atraso", tipoEntrega: "entrega", recebidoEm: null, solicitadoPara: iso(base, 12), coluna: "novo", itens: [{ sabor: "Coxinha", qtd: 120, tipo: "frito" }, { sabor: "Kibe", qtd: 80, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }, { sabor: "Esfiha de carne", qtd: 100, tipo: "assado" }] },
    { numero: 1049, cliente: "Apoio — Marina", tipoEntrega: "entrega", recebidoEm: iso(base, -70), solicitadoPara: null, coluna: "pronto", itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }] },
    { numero: 1048, cliente: "Apoio — Nuno", tipoEntrega: "retirada", recebidoEm: iso(base, -65), solicitadoPara: null, coluna: "pronto", itens: [{ sabor: "Kibe", qtd: 50, tipo: "frito" }, { sabor: "Esfiha de carne", qtd: 50, tipo: "assado" }] },
    { numero: 1080, cliente: "Apoio — Olga (futuro)", tipoEntrega: "entrega", recebidoEm: null, solicitadoPara: iso(base, 240), coluna: "agendado", itens: [{ sabor: "Coxinha", qtd: 300, tipo: "frito" }, { sabor: "Pastel de queijo", qtd: 100, tipo: "pastel" }] },
  ];
}

const TIPO_EMOJI = { frito: "🔥", pastel: "🥟", assado: "🥐" } as const;

/** Testes obrigatórios da correção final (esperado pela regra MAX, sem +10 automático). */
const TESTES_A_H: { id: string; composicao: string; esperado: number; itens: ItemPedidoPreview[] }[] = [
  { id: "A", composicao: "100 fritos + assado → MAX(7, 10)", esperado: 10, itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }, { sabor: "Esfiha", qtd: 50, tipo: "assado" }] },
  { id: "B", composicao: "200 fritos + assado → MAX(14, 10)", esperado: 14, itens: [{ sabor: "Coxinha", qtd: 200, tipo: "frito" }, { sabor: "Esfiha", qtd: 50, tipo: "assado" }] },
  { id: "C", composicao: "300 fritos + assado → MAX(21, 10)", esperado: 21, itens: [{ sabor: "Coxinha", qtd: 300, tipo: "frito" }, { sabor: "Esfiha", qtd: 50, tipo: "assado" }] },
  { id: "D", composicao: "Somente assado (30 esfihas)", esperado: 10, itens: [{ sabor: "Esfiha", qtd: 30, tipo: "assado" }] },
  { id: "E", composicao: "100 pastéis + assado → MAX(4, 10)", esperado: 10, itens: [{ sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }, { sabor: "Esfiha", qtd: 50, tipo: "assado" }] },
  { id: "F", composicao: "200 fritos + 100 pastéis + assado → MAX(14, 4, 10)", esperado: 14, itens: [{ sabor: "Coxinha", qtd: 200, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }, { sabor: "Esfiha", qtd: 100, tipo: "assado" }] },
  { id: "G", composicao: "Somente frito (600, 2 fritadeiras)", esperado: 21, itens: [{ sabor: "Coxinha", qtd: 600, tipo: "frito" }] },
  { id: "H", composicao: "Somente pastel (100)", esperado: 4, itens: [{ sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }] },
];

/** Som do preview: tons distintos por evento (o real reutiliza `filtrarNovos` + `SONS_COZINHA`). */
function bipPreview(freq: number, durMs = 350): void {
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
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durMs / 1000);
    o.stop(ctx.currentTime + durMs / 1000);
  } catch {
    /* sem áudio — mantém alerta visual */
  }
}

const SOM_EVENTO: Record<string, { freq: number; rotulo: string }> = {
  inicio_preparacao: { freq: 660, rotulo: "Hora de preparar" },
  pedido_proximo: { freq: 520, rotulo: "Atenção" },
  pedido_urgente: { freq: 440, rotulo: "Risco de atraso" },
  pedido_pronto: { freq: 880, rotulo: "Pedido pronto" },
};

/**
 * Fila inteligente de voz (PREVIEW ONLY) — pt-BR, um anúncio por vez.
 * Prioridade: atrasado 5 > risco 4 > atenção 3 > pronto 2 > hora-preparar 1.
 * - Crítico passa à frente dos normais na fila, sem interromper quem fala.
 * - Dedup por id de evento; reaviso só com escalada (id inclui o nível) e
 *   após VOZ_REANUNCIO_MIN (sem repetição contínua).
 * - Mudo temporário afeta só a voz (visual e prioridades seguem).
 * - speechSynthesis exige gesto do usuário: ativar com um clique; aba inativa
 *   pode pausar — tratar com resume + fallback visual.
 */
export type VozPrioridade = 1 | 2 | 3 | 4 | 5;
export type VozEvento = { id: string; texto: string; prioridade: VozPrioridade };
export type VozStatus = "indisponivel" | "desativada" | "ativa" | "silenciada";
export const VOZ_REANUNCIO_MIN = 10;

export type VozInfo = { fila: number; falando: boolean; status: VozStatus };

export function criarFilaVoz(aoMudar?: (info: VozInfo) => void) {
  const fila: VozEvento[] = [];
  const vistos = new Map<string, number>();
  let falando = false;
  let ativada = false;
  let silenciadaAte = 0;
  let volume = 1;
  let suporte: boolean | null = null;

  function disponivel(): boolean {
    if (suporte === null) {
      suporte = typeof window !== "undefined" && "speechSynthesis" in window;
    }
    return suporte;
  }
  function estado(): VozStatus {
    if (!disponivel()) return "indisponivel";
    if (!ativada) return "desativada";
    if (Date.now() < silenciadaAte) return "silenciada";
    return "ativa";
  }
  function notificar(): void {
    aoMudar?.({ fila: fila.length, falando, status: estado() });
  }
  function falarTexto(texto: string): void {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "pt-BR";
      u.volume = volume;
      u.rate = 1.05;
      u.onend = () => {
        falando = false;
        notificar();
        proximo();
      };
      u.onerror = () => {
        falando = false;
        notificar();
        proximo();
      };
      falando = true;
      notificar();
      synth.speak(u);
    } catch {
      falando = false;
      notificar();
      proximo();
    }
  }
  function proximo(): void {
    if (falando || estado() !== "ativa" || fila.length === 0) {
      notificar();
      return;
    }
    fila.sort((a, b) => b.prioridade - a.prioridade);
    const ev = fila.shift();
    if (!ev) {
      notificar();
      return;
    }
    vistos.set(ev.id, Date.now());
    falarTexto(ev.texto);
  }
  return {
    anunciar(ev: VozEvento): void {
      if (fila.some((e) => e.id === ev.id)) return;
      const ultimo = vistos.get(ev.id) ?? 0;
      if (Date.now() - ultimo < VOZ_REANUNCIO_MIN * 60000) return;
      const i = fila.findIndex((e) => e.prioridade < ev.prioridade);
      if (i < 0) fila.push(ev);
      else fila.splice(i, 0, ev);
      notificar();
      proximo();
    },
    setAtivada(v: boolean): void {
      ativada = v;
      if (v) {
        try {
          window.speechSynthesis.resume();
        } catch {
          /* aba inativa — visual cobre */
        }
      }
      notificar();
      proximo();
    },
    setVolume(v: number): void {
      volume = Math.min(1, Math.max(0, v));
      notificar();
    },
    silenciar(min = 10): void {
      silenciadaAte = Date.now() + min * 60000;
      notificar();
    },
    testar(): void {
      if (!disponivel() || !ativada) return;
      falarTexto("Teste de voz da cozinha. Pedido 2001: hora de iniciar a preparação.");
    },
    limpar(): void {
      fila.length = 0;
      notificar();
    },
    info(): VozInfo {
      return { fila: fila.length, falando, status: estado() };
    },
  };
}

export type FilaVoz = ReturnType<typeof criarFilaVoz>;

const VOZ_PRIORIDADE_NIVEL: Record<string, VozPrioridade> = {
  atrasado: 5,
  risco: 4,
  atencao: 3,
  pronto: 2,
  "hora-preparar": 1,
};

function CardPedido({
  pedido,
  agora,
  aoMover,
  destacar,
}: {
  pedido: PedidoPreview;
  agora: Date;
  aoMover: (numero: number, coluna: ColunaPreview) => void;
  destacar?: boolean;
}) {
  const calc: CalculoPedido = calcularPedido(pedido.itens);
  const estado = estadoPrazo(pedido, calc, agora);
  const meta = NIVEL_META[estado.nivel];
  const borda =
    estado.nivel === "atrasado"
      ? "border-red-500"
      : estado.nivel === "risco"
        ? "border-orange-500"
        : estado.nivel === "atencao"
          ? "border-yellow-400"
          : pedido.solicitadoPara
            ? "border-sky-500"
            : "border-zinc-700";
  return (
    <article className={`rounded-xl border-2 ${borda} bg-zinc-900 p-4 text-zinc-100 ${destacar ? "ring-2 ring-amber-300" : ""}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-xl font-extrabold">#{pedido.numero}</h3>
        <span className="text-lg" title={meta.rotulo}>
          {meta.cor}
        </span>
        <span className="ml-auto text-xs text-zinc-400">
          {pedido.tipoEntrega === "entrega" ? "🚚 Entrega" : "🛍️ Retirada"}
        </span>
      </div>
      <p className="mt-0.5 text-sm font-semibold">{pedido.cliente}</p>
      <p className="text-xs text-zinc-400">
        {pedido.solicitadoPara ? `🕕 Solicitado: ${horaCurta(pedido.solicitadoPara)} • ` : null}
        {calc.qtdTotal} un
      </p>
      {/* Prévia cozinha: HORÁRIO LIMITE em destaque + contagem regressiva.
          Sem prazo máximo de chegada, sem trânsito, sem detalhe de margem. */}
      {pedido.coluna === "pronto" ? (
        <p className="mt-2 rounded-lg bg-emerald-950 p-2 text-center text-sm font-extrabold text-emerald-300">
          ✅ PRONTO P/ SAIR
        </p>
      ) : (
        <p
          className={`mt-2 rounded-lg p-2 text-center text-sm font-extrabold ${
            estado.nivel === "atrasado"
              ? "bg-red-950 text-red-300"
              : estado.nivel === "risco"
                ? "bg-orange-950 text-orange-300"
                : estado.nivel === "atencao"
                  ? "bg-yellow-950 text-yellow-200"
                  : "bg-zinc-950 text-zinc-100"
          }`}
        >
          ⏰ LIMITE P/ FICAR PRONTO:{" "}
          {horaCurta(
            (pedido.solicitadoPara ?? (pedido.recebidoEm ? limiteImediato(pedido.recebidoEm).toISOString() : new Date(agora.getTime()).toISOString())),
          )}{" "}
          •           ⏱️ {formatarMinutos(estado.restanteMin)}
        </p>
      )}

      <ul className="mt-2 space-y-0.5 rounded-lg bg-zinc-950 p-2 text-sm">
        {pedido.itens.map((i) => (
          <li key={`${i.sabor}-${i.tipo}`} className="flex justify-between gap-2">
            <span>
              {TIPO_EMOJI[i.tipo]} <strong>{i.sabor}</strong>
            </span>
            <span className="font-bold text-amber-300">{i.qtd}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 rounded-lg bg-zinc-950 p-2 text-center text-sm font-extrabold text-emerald-300">
        ⏱️ Preparo estimado: {calc.tecnicoMin} min
      </p>
      <details className="mt-1 text-xs text-zinc-500">
        <summary className="cursor-pointer underline">Detalhe técnico (encarregado)</summary>
        <dl className="mt-1 space-y-0.5">
          {calc.qtdFritos > 0 ? (
            <div className="flex justify-between">
              <dt>
                🔥 Fritos ({calc.qtdFritos} un · {calc.fritadeiras}/3 fritadeiras)
              </dt>
              <dd>
                {calc.minFritosEfetivo} min{calc.paralelismoEstimado ? " ⚠️est." : ""}
              </dd>
            </div>
          ) : null}
          {calc.qtdPasteis > 0 ? (
            <div className="flex justify-between">
              <dt>🥟 Pastéis ({calc.qtdPasteis} un) ⚠️ref. a validar</dt>
              <dd>{calc.minPasteis} min</dd>
            </div>
          ) : null}
          {calc.qtdAssados > 0 ? (
            <div className="flex justify-between">
              <dt>🥐 Assados ({calc.qtdAssados} un, 10 min no MAX)</dt>
              <dd>{calc.minAssados} min</dd>
            </div>
          ) : null}
        </dl>
      </details>

      {pedido.solicitadoPara ? (
        <p className="mt-1 text-xs font-bold text-zinc-200">
          ▶️ Iniciar às {horaCurta(inicioRecomendado(pedido.solicitadoPara, calc.tecnicoMin).toISOString())}
          {estado.paraInicioMin > 0 ? ` (preparar em ${formatarMinutos(estado.paraInicioMin)})` : " (já passou da hora de iniciar)"}
        </p>
      ) : null}

      {estado.nivel !== "normal" ? (
        <p className="mt-2 rounded-lg bg-zinc-950 p-2 text-xs font-bold">
          {estado.nivel === "hora-preparar" ? `🔔 HORA DE PREPARAR — tempo estimado ${calc.tecnicoMin} min. INICIAR PREPARO. 🔊 som: inicio_preparacao` : null}
          {estado.nivel === "atencao" ? `⚠️ ATENÇÃO — faltam ${formatarMinutos(estado.restanteMin)} para o limite. 🔊 som: pedido_proximo` : null}
          {estado.nivel === "risco" ? `🚨 RISCO DE ATRASO — restante ${formatarMinutos(estado.restanteMin)}, estimado ${calc.tecnicoMin} min. Prioridade máxima. 🔊 som: pedido_urgente` : null}
          {estado.nivel === "atrasado" ? `🔴 ATRASADO ${formatarMinutos(estado.restanteMin)}. 🔊 som: pedido_atrasado` : null}
        </p>
      ) : null}

      {pedido.coluna === "pronto" ? (
        <p className="mt-2 rounded-lg bg-emerald-950 p-2 text-xs font-bold text-emerald-300">
          🟢 PEDIDO #{pedido.numero} PRONTO —{" "}
          {pedido.tipoEntrega === "entrega" ? "🚚 AGUARDANDO ENTREGA" : "🛍️ AGUARDANDO RETIRADA"} 🔊 som: pedido_pronto
        </p>
      ) : null}

      {pedido.observacao ? <p className="mt-1 text-xs italic text-zinc-500">{pedido.observacao}</p> : null}

      <div className="mt-2 flex gap-2">
        {pedido.coluna === "novo" ? (
          <button type="button" onClick={() => aoMover(pedido.numero, "preparando")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500">
            Iniciar preparo
          </button>
        ) : null}
        {pedido.coluna === "preparando" ? (
          <button type="button" onClick={() => aoMover(pedido.numero, "pronto")} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold hover:bg-sky-500">
            Marcar pronto
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function PreviewProducaoNova() {
  const [offsetMin, setOffsetMin] = useState(0);
  const [movidos, setMovidos] = useState<Record<string, ColunaPreview>>({});
  const [ordemPrioridade, setOrdemPrioridade] = useState(false);
  const [vozLigada, setVozLigada] = useState(false);
  const [volume, setVolume] = useState(80);
  // Busca local (prévia): nº, cliente ou sabor — em TODAS as colunas, inclusive
  // agendados fora da janela. Só filtra a exibição; não muda status, ordem,
  // prazos, agendamentos nem alertas.
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  function casaCom(p: PedidoPreview): boolean {
    if (!termo) return true;
    if (String(p.numero).includes(termo)) return true;
    if (p.cliente.toLowerCase().includes(termo)) return true;
    return p.itens.some((i) => i.sabor.toLowerCase().includes(termo));
  }
  const [vozInfo, setVozInfo] = useState<VozInfo>({ fila: 0, falando: false, status: "desativada" });
  const agora = useMemo(() => new Date(Date.now() + offsetMin * MIN), [offsetMin]);
  const voz = useRef<FilaVoz | null>(null);
  if (!voz.current) voz.current = criarFilaVoz((info) => setVozInfo(info));

  const pedidos = useMemo(() => {
    const base = agora.getTime();
    return criarMocks(base).map((p) => {
      const mov = movidos[String(p.numero)];
      return mov ? { ...p, coluna: mov } : p;
    });
  }, [agora, movidos]);

  function aoMover(numero: number, coluna: ColunaPreview): void {
    setMovidos((m) => ({ ...m, [String(numero)]: coluna }));
    if (coluna === "pronto") {
      bipPreview(SOM_EVENTO["pedido_pronto"]?.freq ?? 880);
      voz.current?.anunciar({ id: `pronto:#${numero}`, texto: `Pedido ${numero} pronto para sair.`, prioridade: 2 });
    }
  }

  // Voz: deriva eventos dos pedidos ativos (NOVOS + PREPARANDO). Agendados fora
  // da janela não geram avisos prematuros; visual e prioridades seguem com ou sem voz.
  useEffect(() => {
    const f = voz.current;
    if (!f) return;
    const textos: Record<string, (n: number) => string> = {
      "hora-preparar": (n) => `Pedido ${n}: hora de iniciar a preparação.`,
      atencao: (n) => `Atenção: pedido ${n} próximo do horário limite.`,
      risco: (n) => `Alerta: pedido ${n} em risco de atraso.`,
      atrasado: (n) => `Alerta crítico: pedido ${n} atrasado.`,
    };
    for (const p of pedidos) {
      const col = colunaExibicao(p);
      if (col !== "novo" && col !== "preparando") continue;
      const nivel = estadoPrazo(p, calcularPedido(p.itens), agora).nivel;
      const fala = textos[nivel];
      if (!fala) continue;
      f.anunciar({ id: `${nivel}:#${p.numero}`, texto: fala(p.numero), prioridade: VOZ_PRIORIDADE_NIVEL[nivel] ?? 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agora, pedidos]);

  /** Deriva a coluna de exibição: agendado distante fica em PRÓXIMOS; na janela entra em NOVOS. */
  function colunaExibicao(p: PedidoPreview): ColunaPreview | "proximos" {
    if (p.coluna === "pronto" || p.coluna === "preparando") return p.coluna;
    if (p.solicitadoPara) {
      return entradaJanela(p.solicitadoPara).getTime() <= agora.getTime() ? "novo" : "proximos";
    }
    return "novo";
  }

  const novos = pedidos.filter((p) => colunaExibicao(p) === "novo");
  const preparando = pedidos.filter((p) => colunaExibicao(p) === "preparando");
  const prontos = pedidos.filter((p) => colunaExibicao(p) === "pronto");
  const proximos = pedidos.filter((p) => colunaExibicao(p) === "proximos");
  const atrasados = pedidos.filter((p) => {
    if (colunaExibicao(p) === "pronto" || colunaExibicao(p) === "proximos") return false;
    const nivel = estadoPrazo(p, calcularPedido(p.itens), agora).nivel;
    return nivel === "risco" || nivel === "atrasado";
  });

  // Proposta de ordenação (só visual): risco > atenção > hora de preparar > normal;
  // desempate pelo menor restante; PREPARANDO mantém ordem de chegada (não interrompe).
  const PESO_NIVEL: Record<string, number> = { atrasado: 0, risco: 1, atencao: 2, "hora-preparar": 3, normal: 4 };
  const novosOrdenados = ordemPrioridade
    ? [...novos].sort((a, b) => {
        const ea = estadoPrazo(a, calcularPedido(a.itens), agora);
        const eb = estadoPrazo(b, calcularPedido(b.itens), agora);
        const pa = PESO_NIVEL[ea.nivel] ?? 9;
        const pb = PESO_NIVEL[eb.nivel] ?? 9;
        if (pa !== pb) return pa - pb;
        return ea.restanteMin - eb.restanteMin;
      })
    : novos;

  function alternarVoz(): void {
    const f = voz.current;
    if (!f) return;
    const ligar = !vozLigada;
    setVozLigada(ligar);
    f.setAtivada(ligar);
  }
  const fritEmUso = Math.min(3, preparando.reduce((s, p) => s + calcularPedido(p.itens).fritadeiras, 0));
  const fornoEmUso = preparando.some((p) => calcularPedido(p.itens).qtdAssados > 0);

  return (
    <div className="min-h-screen bg-[#0c0c0f] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
          PREVIEW FASE 1.5.1 — dados fictícios, sem banco, sem alterar o <strong>/producao</strong> real. Capacidade por lote da fritadeira ainda precisa de confirmação operacional: tempos com 2–3 fritadeiras estão marcados com ⚠️est. Referência de ciclo do pastel também pendente de validação (⚠️ref. a validar).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold">Painel de Produção — preview do motor de prazos</h1>
          <span className="ml-auto rounded-full bg-zinc-800 px-3 py-1 text-xs">
            Relógio simulado: {agora.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {offsetMin !== 0 ? ` (+${offsetMin}min)` : ""}
          </span>
        </div>
        <div className="sticky top-0 z-10 mt-3 flex items-center gap-2 rounded-xl bg-zinc-900 p-2" role="search">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nº, cliente ou sabor (vale p/ agendados)…"
            aria-label="Buscar pedidos por número, cliente ou sabor"
            className="w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
          {busca ? (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar pesquisa" className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold hover:bg-zinc-700">
              ✕ Limpar
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => setOffsetMin((o) => o + 15)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">+15min</button>
          <button type="button" onClick={() => setOffsetMin((o) => o + 30)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">+30min</button>
          <button type="button" onClick={() => setOffsetMin((o) => o + 60)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">+60min</button>
          <button type="button" onClick={() => { setOffsetMin(0); setMovidos({}); }} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">Reiniciar demo</button>
          <button type="button" onClick={() => setOrdemPrioridade((o) => !o)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
            Ordem NOVOS: {ordemPrioridade ? "prioridade" : "chegada"}
          </button>
          <span className="ml-auto flex flex-wrap gap-2">
            {Object.entries(SOM_EVENTO).map(([chave, som]) => (
              <button key={chave} type="button" onClick={() => bipPreview(som.freq)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
                🔊 {som.rotulo}
              </button>
            ))}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 p-3 text-xs" aria-label="Voz da cozinha (prévia)">
          <button type="button" onClick={alternarVoz} className={`rounded-lg px-3 py-1.5 font-bold ${vozLigada ? "bg-emerald-600 hover:bg-emerald-500" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            🎙️ Voz: {vozLigada ? "ligada" : "desligada"}
          </button>
          <button type="button" onClick={() => voz.current?.testar()} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
            Testar áudio
          </button>
          <label className="flex items-center gap-2">
            Volume
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                voz.current?.setVolume(Number(e.target.value) / 100);
              }}
              className="w-24"
            />
          </label>
          <button type="button" onClick={() => voz.current?.silenciar(10)} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
            Silenciar 10 min
          </button>
          <span className="ml-auto rounded-full bg-zinc-800 px-3 py-1">
            {vozInfo.status === "ativa" ? "🟢 voz ativa" : null}
            {vozInfo.status === "silenciada" ? "🟡 voz silenciada (visual segue)" : null}
            {vozInfo.status === "desativada" ? "⚪ voz desligada" : null}
            {vozInfo.status === "indisponivel" ? "🔴 voz indisponível (visual cobre)" : null}
            {vozInfo.falando ? " • falando…" : null}
            {vozInfo.fila > 0 ? ` • fila: ${vozInfo.fila}` : null}
          </span>
          <p className="w-full text-zinc-500">
            Prévia: 1 anúncio por vez, críticos passam à frente sem interromper, sem duplicados, sem repetição contínua. Ative com um clique (navegador exige gesto). Silenciar afeta só a voz.
          </p>
        </div>

        <section className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6" aria-label="Indicadores">
          {[
            { rotulo: "NOVOS", valor: novos.length },
            { rotulo: "PREPARANDO", valor: preparando.length },
            { rotulo: "PRONTOS", valor: prontos.length },
            { rotulo: "ATRASADOS", valor: atrasados.length },
            { rotulo: "AGENDADOS", valor: proximos.length },
          ].map((k) => (
            <div key={k.rotulo} className="rounded-xl bg-zinc-900 p-3 text-center">
              <p className="text-2xl font-extrabold">{k.valor}</p>
              <p className="text-xs text-zinc-400">{k.rotulo}</p>
            </div>
          ))}
          <div className="rounded-xl bg-zinc-900 p-3 text-center text-xs">
            <p className="font-bold">🔥 Fritadeiras: {fritEmUso}/3</p>
            <p className={fornoEmUso ? "text-orange-300" : "text-zinc-400"}>🥐 Forno: {fornoEmUso ? "em uso" : "livre"}</p>
          </div>
        </section>

        <section className="mt-2 rounded-xl bg-zinc-900 p-3 text-xs text-zinc-400" aria-label="Parâmetros do motor">
          <p className="font-bold text-zinc-200">⚙️ Parâmetros do motor (preview — futura parametrização em tela admin)</p>
          <p className="mt-1">
            Fritos {MOTOR_PREVIEW_CONFIG.fritosMinPorLote} min/{MOTOR_PREVIEW_CONFIG.baseFritosQtd} un (1 até{" "}
            {MOTOR_PREVIEW_CONFIG.fritadeiraLimite1}, 2 até {MOTOR_PREVIEW_CONFIG.fritadeiraLimite2}, teto{" "}
            {MOTOR_PREVIEW_CONFIG.maxFritadeiras}) • Pastéis {MOTOR_PREVIEW_CONFIG.pasteisMinPorLote} min/
            {MOTOR_PREVIEW_CONFIG.basePasteisQtd} un ⚠️ref. a validar • Assados {MOTOR_PREVIEW_CONFIG.assadosMinFixo} min
            fixos no MAX (sem +10) • 🛡️ Buffer {MOTOR_PREVIEW_CONFIG.bufferOperacionalMin} min • Janela{" "}
            {MOTOR_PREVIEW_CONFIG.janelaAgendadoMin} min • Cliente {MOTOR_PREVIEW_CONFIG.prazoClienteMin}–
            {MOTOR_PREVIEW_CONFIG.prazoClienteMax} min
          </p>
        </section>

        {termo ? (
          (() => {
            const total = [...novosOrdenados, ...preparando, ...prontos, ...proximos].filter(casaCom).length;
            if (total > 0) return null;
            return (
              <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center" role="status">
                <p className="font-bold">Nenhum pedido encontrado para “{busca.trim()}”.</p>
                <p className="mt-1 text-xs text-zinc-400">Busque por número, cliente ou sabor — inclusive agendados.</p>
                <button type="button" onClick={() => setBusca("")} className="mt-3 rounded-lg bg-zinc-800 px-4 py-1.5 text-xs font-bold hover:bg-zinc-700">
                  Limpar pesquisa e voltar à visualização completa
                </button>
              </div>
            );
          })()
        ) : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
          <section aria-label="Novos">
            <h2 className="font-extrabold">NOVOS ({novosOrdenados.filter(casaCom).length}){ordemPrioridade ? " · por prioridade" : ""}</h2>
            <div className="mt-2 space-y-3">
              {novosOrdenados.filter(casaCom).map((p) => <CardPedido key={p.numero} pedido={p} agora={agora} aoMover={aoMover} destacar={Boolean(termo)} />)}
            </div>
          </section>
          <section aria-label="Preparando">
            <h2 className="font-extrabold">PREPARANDO ({preparando.filter(casaCom).length})</h2>
            <div className="mt-2 space-y-3">
              {preparando.filter(casaCom).map((p) => <CardPedido key={p.numero} pedido={p} agora={agora} aoMover={aoMover} destacar={Boolean(termo)} />)}
            </div>
          </section>
          <section aria-label="Prontos">
            <h2 className="font-extrabold">PRONTOS ({prontos.filter(casaCom).length})</h2>
            <div className="mt-2 space-y-3">
              {prontos.filter(casaCom).map((p) => <CardPedido key={p.numero} pedido={p} agora={agora} aoMover={aoMover} destacar={Boolean(termo)} />)}
            </div>
          </section>
          <section aria-label="Próximos agendados">
            <h2 className="font-extrabold">📅 PRÓXIMOS AGENDADOS ({proximos.filter(casaCom).length})</h2>
            <div className="mt-2 space-y-3">
              {proximos.filter(casaCom).map((p) => <CardPedido key={p.numero} pedido={p} agora={agora} aoMover={aoMover} destacar={Boolean(termo)} />)}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-xl bg-zinc-900 p-4" aria-label="Cenários">
          <h2 className="font-extrabold">12 cenários — resultado do motor (valores calculados ao vivo)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-400">
                  <th className="p-2">Cenário</th>
                  <th className="p-2">Fritadeiras</th>
                  <th className="p-2">Fritos</th>
                  <th className="p-2">Pastéis</th>
                    <th className="p-2">Assado (no MAX)</th>
                  <th className="p-2">Técnico</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.slice(0, 13).map((p) => {
                  const c = calcularPedido(p.itens);
                  return (
                    <tr key={p.numero} className="border-t border-zinc-800">
                      <td className="p-2 font-bold">#{p.numero} {p.cliente}</td>
                      <td className="p-2">{c.fritadeiras}/3</td>
                      <td className="p-2">{c.qtdFritos > 0 ? `${c.minFritosEfetivo} min (ref ${c.minFritosRef})${c.paralelismoEstimado ? " ⚠️est." : ""}` : "—"}</td>
                      <td className="p-2">{c.qtdPasteis > 0 ? `${c.minPasteis} min` : "—"}</td>
                      <td className="p-2">{c.qtdAssados > 0 ? `${c.minAssados} min` : "—"}</td>
                      <td className="p-2 font-bold text-emerald-300">{c.tecnicoMin} min</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Limiar de atenção: {LIMIAR_ATENCAO_MIN} min. Janela do agendado: solicitado −{" "}
            {MOTOR_PREVIEW_CONFIG.janelaAgendadoMin} min. Início recomendado = solicitado − técnico − buffer (🛡️{" "}
            {MOTOR_PREVIEW_CONFIG.bufferOperacionalMin} min). Prazo do cliente (imediato):{" "}
            {MOTOR_PREVIEW_CONFIG.prazoClienteMin}–{MOTOR_PREVIEW_CONFIG.prazoClienteMax} min — nunca substituído pelo
            tempo técnico.
          </p>
        </section>

        <section className="mt-4 rounded-xl bg-zinc-900 p-4" aria-label="Testes obrigatórios A–H">
          <h2 className="font-extrabold">Testes obrigatórios A–H — esperado × calculado (ao vivo)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-400">
                  <th className="p-2">Teste</th>
                  <th className="p-2">Composição</th>
                  <th className="p-2">Esperado</th>
                  <th className="p-2">Calculado</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {TESTES_A_H.map((t) => {
                  const calc = calcularPedido(t.itens);
                  const ok = calc.tecnicoMin === t.esperado;
                  return (
                    <tr key={t.id} className="border-t border-zinc-800">
                      <td className="p-2 font-bold">{t.id}</td>
                      <td className="p-2">{t.composicao}</td>
                      <td className="p-2">{t.esperado} min</td>
                      <td className="p-2 font-bold text-emerald-300">{calc.tecnicoMin} min</td>
                      <td className="p-2">{ok ? "✅" : "❌"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            G usa 2 fritadeiras (⚠️est.) e H usa a referência de pastel (⚠️ref. a validar).
          </p>
        </section>
      </div>
    </div>
  );
}
