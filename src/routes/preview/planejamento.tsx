import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  calcularPedido,
  fritadeirasPara,
  MOTOR_PREVIEW_CONFIG,
  type ItemPedidoPreview,
} from "@/lib/motor-prazo-preview";
import { criarFilaVoz, type FilaVoz, type VozInfo } from "@/routes/preview/producao-nova";

/**
 * PRÉVIA — Planejamento inteligente de datas comemorativas (módulo complementar).
 * Rota: /preview/planejamento. Dados 100% fictícios, estado local.
 * NÃO lê/escreve Supabase, NÃO cria migration, NÃO altera nada real.
 * Reutiliza o motor existente (calcularPedido) — nenhum motor paralelo.
 */

export const Route = createFileRoute("/preview/planejamento")({
  head: () => ({ meta: [{ title: "Prévia — Planejamento de datas comemorativas" }] }),
  component: PreviewPlanejamento,
});

type Nivel = "normal" | "alta" | "muito_alta";

type DiaMock = {
  data: string;
  rotulo: string;
  ocasiao: string | null;
  nivelSistema: Nivel;
  temHistorico: boolean;
  encomendas: { faixa: string; unidades: number; pedidos: number }[];
  confirmados: { faixa: string; unidades: number; pedidos: number }[];
};

/** Capacidade da PRÉVIA (parâmetros fictícios a validar na implementação real). */
const CAP_PREVIA = { unidadesHora: 600, entregasHora: 8, motoboys: 3 };
const FAIXAS = ["10–12h", "12–14h", "14–16h", "16–17h", "17–18h", "18–20h"];

function isoDia(base: number, deltaDias: number): string {
  const d = new Date(base + deltaDias * 86400000);
  return d.toISOString().slice(0, 10);
}

function criarDias(base: number): DiaMock[] {
  const mk = (
    delta: number,
    ocasiao: string | null,
    nivelSistema: Nivel,
    temHistorico: boolean,
    mult: number,
  ): DiaMock => {
    const encomendas = FAIXAS.map((faixa, i) => ({
      faixa,
      unidades: Math.round([120, 200, 180, 260, 420, 300][i]! * mult),
      pedidos: Math.round([4, 7, 6, 9, 14, 10][i]! * mult),
    }));
    const confirmados = FAIXAS.map((faixa, i) => ({
      faixa,
      unidades: Math.round([40, 90, 70, 150, 260, 120][i]! * mult),
      pedidos: Math.round([2, 3, 3, 5, 9, 4][i]! * mult),
    }));
    const data = isoDia(base, delta);
    return {
      data,
      rotulo: new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }),
      ocasiao,
      nivelSistema,
      temHistorico,
      encomendas,
      confirmados,
    };
  };
  return [
    mk(2, null, "normal", true, 1),
    mk(5, "Dia das Mães", "muito_alta", true, 2.2),
    mk(9, null, "normal", false, 0),
    mk(12, "Véspera de feriado", "alta", true, 1.6),
  ];
}

const COR_NIVEL: Record<Nivel, string> = {
  normal: "border-zinc-700",
  alta: "border-yellow-400",
  muito_alta: "border-red-500",
};

export function PreviewPlanejamento() {
  const dias = useMemo(() => criarDias(Date.now()), []);
  const [diaSel, setDiaSel] = useState(dias[1]?.data ?? "");
  const [override, setOverride] = useState<Record<string, Nivel>>({});
  const dia = dias.find((d) => d.data === diaSel) ?? dias[0]!;
  const nivel: Nivel = override[dia.data] ?? dia.nivelSistema;

  const linhas = dia.encomendas.map((e, i) => {
    const conf = dia.confirmados[i]!;
    const cargaUn = e.unidades + conf.unidades;
    const usoProd = cargaUn / CAP_PREVIA.unidadesHora;
    const usoEnt = (e.pedidos + conf.pedidos) / CAP_PREVIA.entregasHora;
    return { ...e, confUn: conf.unidades, confPed: conf.pedidos, usoProd, usoEnt };
  });
  const alertas: { faixa: string; causa: string; sugestao: string; nivel: string }[] = [];
  for (const l of linhas) {
    if (!dia.temHistorico) continue;
    if (l.usoProd >= 1) {
      alertas.push({
        faixa: l.faixa,
        causa: `carga ${l.confUn + l.unidades} un ≥ capacidade ${CAP_PREVIA.unidadesHora} un/h`,
        sugestao: "Sugerir faixa alternativa ou análise do responsável; não confirmar além do teto sem autorização.",
        nivel: "🚨",
      });
    } else if (l.usoProd >= 0.85) {
      alertas.push({
        faixa: l.faixa,
        causa: `carga próxima da capacidade (${Math.round(l.usoProd * 100)}%)`,
        sugestao: "Antecipar preparo e reforçar fritadeiras/motoboys.",
        nivel: "⚠️",
      });
    }
    if (l.usoEnt >= 1) {
      alertas.push({
        faixa: l.faixa,
        causa: `entregas acima da capacidade (${CAP_PREVIA.entregasHora}/h com ${CAP_PREVIA.motoboys} motoboys)`,
        sugestao: "Redistribuir rotas ou sugerir retirada com incentivo.",
        nivel: "🚨",
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
          PRÉVIA — módulo complementar, dados fictícios, sem banco. Números abaixo são simulação para aprovação,
          nunca dados reais. Nada aqui altera pedidos, promessas, pagamentos ou estoque.
        </p>
        <h1 className="mt-3 text-2xl font-extrabold">📅 Planejamento de datas comemorativas (prévia)</h1>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {dias.map((d) => {
            const nv: Nivel = override[d.data] ?? d.nivelSistema;
            return (
              <button
                key={d.data}
                type="button"
                onClick={() => setDiaSel(d.data)}
                className={`rounded-xl border-2 ${COR_NIVEL[nv]} bg-zinc-900 p-3 text-left ${diaSel === d.data ? "ring-2 ring-amber-300" : ""}`}
              >
                <p className="font-extrabold">{d.rotulo}</p>
                <p className="text-xs text-zinc-400">{d.ocasiao ?? "Demanda normal"}</p>
                <p className="mt-1 text-xs">
                  {nv === "normal" ? "🟢 normal" : nv === "alta" ? "🟡 alta" : "🔴 muito alta"}
                  {override[d.data] ? " (manual)" : ""}
                </p>
              </button>
            );
          })}
        </div>

        <section className="mt-4 rounded-xl bg-zinc-900 p-4">
          <h2 className="font-extrabold">
            {dia.rotulo} {dia.ocasiao ? `— ${dia.ocasiao}` : ""}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span>Classificação:</span>
            {(["normal", "alta", "muito_alta"] as Nivel[]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setOverride((o) => ({ ...o, [dia.data]: n }))}
                className={`rounded-lg px-3 py-1.5 ${nivel === n ? "bg-amber-500 font-bold text-black" : "bg-zinc-800 hover:bg-zinc-700"}`}
              >
                {n === "normal" ? "🟢 normal" : n === "alta" ? "🟡 alta" : "🔴 muito alta"}
              </button>
            ))}
            <span className="text-zinc-500">(ajuste manual local; não salva no banco)</span>
          </div>

          {!dia.temHistorico ? (
            <p className="mt-3 rounded-lg bg-zinc-950 p-3 text-sm font-bold text-yellow-200">
              📊 Dados insuficientes para previsão — sem histórico desta data. Use estimativa manual com o responsável.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-400">
                    <th className="p-2">Faixa</th>
                    <th className="p-2">Previsão (un)</th>
                    <th className="p-2">Confirmados (un)</th>
                    <th className="p-2">Carga × capacidade</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.faixa} className="border-t border-zinc-800">
                      <td className="p-2 font-bold">{l.faixa}</td>
                      <td className="p-2">{l.unidades}</td>
                      <td className="p-2">{l.confUn}</td>
                      <td className="p-2">
                        <span className={l.usoProd >= 1 || l.usoEnt >= 1 ? "font-bold text-red-300" : l.usoProd >= 0.85 ? "font-bold text-yellow-200" : ""}>
                          {Math.round(l.usoProd * 100)}% prod · {Math.round(l.usoEnt * 100)}% entregas
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-zinc-500">
                Capacidade da prévia: {CAP_PREVIA.unidadesHora} un/h · {CAP_PREVIA.entregasHora} entregas/h ({CAP_PREVIA.motoboys} motoboys) — parâmetros a validar.
              </p>
            </div>
          )}

          {alertas.length > 0 ? (
            <div className="mt-3 space-y-2" aria-label="Alertas antecipados">
              {alertas.map((a, i) => (
                <p key={i} className="rounded-lg bg-zinc-950 p-2 text-xs">
                  <strong>{a.nivel} {a.faixa}</strong> — {a.causa}. <em>Sugestão: {a.sugestao}</em>
                </p>
              ))}
            </div>
          ) : dia.temHistorico ? (
            <p className="mt-3 text-xs text-emerald-300">✅ Nenhuma faixa acima da capacidade nesta data.</p>
          ) : null}
        </section>

        <PlanejamentoPorHorario />

        <section className="mt-4 rounded-xl bg-zinc-900 p-4 text-xs text-zinc-400">
          <h2 className="font-extrabold text-zinc-200">Como seria na implementação (proposta, sem motor paralelo)</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Datas em <code>datas_demanda</code> (já existe) + nível manual; previsão via histórico de <code>pedidos</code> (média por data/faixa, como <code>mediaPorDiaSemana</code>).</li>
            <li>Carga por faixa com o motor existente (<code>calcularPedido</code> por pedido agendado/confirmado) + teto (<code>teto_unidades_janela</code>).</li>
            <li>Pedidos confirmados nunca movidos; sem capacidade → sugerir faixa alternativa ou análise (bloqueio só por config explícita do admin).</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/**
 * PRÉVIA — Planejamento automático de produção por horário.
 * Agrupa pedidos por faixa de horário limite (bandas de 30 min), calcula a
 * carga COMBINADA com as regras do motor existente (MAX, sem somar cegamente)
 * e detecta disputa de capacidade e prazos inviáveis. Sem prometer novo
 * horário, sem repriorizar quem já está em preparo, sem motor paralelo.
 */
type PedidoFila = {
  numero: number;
  cliente: string;
  limiteEmMin: number;
  status: "novo" | "preparando" | "agendado";
  itens: ItemPedidoPreview[];
};

const FILA_MOCK: PedidoFila[] = [
  { numero: 3001, cliente: "Lúcia", limiteEmMin: 25, status: "novo", itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }, { sabor: "Esfiha", qtd: 50, tipo: "assado" }] },
  { numero: 3002, cliente: "Marcos", limiteEmMin: 30, status: "novo", itens: [{ sabor: "Kibe", qtd: 200, tipo: "frito" }] },
  { numero: 3003, cliente: "Paula", limiteEmMin: 35, status: "preparando", itens: [{ sabor: "Coxinha", qtd: 300, tipo: "frito" }, { sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }] },
  { numero: 3004, cliente: "Rafa", limiteEmMin: 55, status: "novo", itens: [{ sabor: "Coxinha", qtd: 400, tipo: "frito" }, { sabor: "Kibe", qtd: 300, tipo: "frito" }] },
  { numero: 3005, cliente: "Sofia", limiteEmMin: 60, status: "novo", itens: [{ sabor: "Esfiha", qtd: 100, tipo: "assado" }] },
  { numero: 3006, cliente: "Tiago", limiteEmMin: 150, status: "agendado", itens: [{ sabor: "Coxinha", qtd: 600, tipo: "frito" }] },
];

function PlanejamentoPorHorario() {
  const agora = useMemo(() => new Date(), []);
  const voz = useRef<FilaVoz | null>(null);
  const [vozLigada, setVozLigada] = useState(false);
  const [vozInfo, setVozInfo] = useState<VozInfo>({ fila: 0, falando: false, status: "desativada" });
  if (!voz.current) voz.current = criarFilaVoz((info) => setVozInfo(info));

  const buffer = MOTOR_PREVIEW_CONFIG.bufferOperacionalMin;
  const fritEmPreparo = FILA_MOCK.filter((p) => p.status === "preparando")
    .reduce((s, p) => s + fritadeirasPara(p.itens.filter((i) => i.tipo === "frito").reduce((a, i) => a + i.qtd, 0)), 0);
  const livres = Math.max(0, 3 - fritEmPreparo);

  const bandas = useMemo(() => {
    const mapa = new Map<number, PedidoFila[]>();
    for (const p of FILA_MOCK) {
      const banda = Math.floor(p.limiteEmMin / 30) * 30;
      const lista = mapa.get(banda) ?? [];
      lista.push(p);
      mapa.set(banda, lista);
    }
    return [...mapa.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bandaMin, pedidos]) => {
        const ag = (tipo: ItemPedidoPreview["tipo"]) =>
          pedidos.reduce(
            (s, p) => s + p.itens.filter((i) => i.tipo === tipo).reduce((a, i) => a + i.qtd, 0),
            0,
          );
        // Carga combinada com o motor existente (agregado por tipo, MAX — sem somar cegamente).
        const calc = calcularPedido([
          { sabor: "Fritos (banda)", qtd: ag("frito"), tipo: "frito" },
          { sabor: "Pastéis (banda)", qtd: ag("pastel"), tipo: "pastel" },
          { sabor: "Assados (banda)", qtd: ag("assado"), tipo: "assado" },
        ]);
        const limite = new Date(agora.getTime() + (bandaMin + 30) * 60000);
        const inicio = new Date(limite.getTime() - (calc.tecnicoMin + buffer) * 60000);
        const inviavel = inicio.getTime() < agora.getTime();
        const disputa = calc.fritadeiras > livres && pedidos.some((p) => p.status === "novo");
        const temPreparo = pedidos.some((p) => p.status === "preparando");
        const temAgendado = pedidos.some((p) => p.status === "agendado");
        return { bandaMin, pedidos, calc, limite, inicio, inviavel, disputa, temPreparo, temAgendado };
      });
  }, [agora, buffer, livres]);

  function anunciarPicos(): void {
    const f = voz.current;
    if (!f) return;
    for (const b of bandas) {
      if (b.inviavel) {
        f.anunciar({ id: `pico-inviavel:${b.bandaMin}`, texto: `Alerta: pico das ${b.bandaMin} com prazo inviável. Análise do responsável.`, prioridade: 4 });
      } else if (b.disputa) {
        f.anunciar({ id: `pico-disputa:${b.bandaMin}`, texto: `Atenção: pedidos disputando fritadeiras na faixa das ${b.bandaMin}.`, prioridade: 3 });
      }
    }
  }

  const hora = (d: Date) => d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="mt-4 rounded-xl bg-zinc-900 p-4" aria-label="Planejamento por horário (prévia)">
      <h2 className="font-extrabold">⏱️ Planejamento por horário (prévia)</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Bandas de 30 min pelo horário limite • fritadeiras ocupadas: {fritEmPreparo}/3 (em preparo, não mexer) • livres: {livres}/3 •
        início = limite − técnico − buffer {buffer} min (sem duplicar) • sem novo horário automático.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => { const l = !vozLigada; setVozLigada(l); voz.current?.setAtivada(l); }} className={`rounded-lg px-3 py-1.5 font-bold ${vozLigada ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
          🎙️ Voz: {vozLigada ? "ligada" : "desligada"}
        </button>
        <button type="button" onClick={anunciarPicos} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
          Anunciar picos
        </button>
        <span className="ml-auto text-zinc-500">
          {vozInfo.status === "ativa" ? "🟢" : vozInfo.status === "silenciada" ? "🟡" : "⚪"}
          {vozInfo.falando ? " falando…" : ""}{vozInfo.fila > 0 ? ` fila: ${vozInfo.fila}` : ""}
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {bandas.map((b) => (
          <article key={b.bandaMin} className={`rounded-xl border-2 p-3 ${b.inviavel ? "border-red-500" : b.disputa ? "border-orange-500" : "border-zinc-700"}`}>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold">Faixa até {hora(b.limite)}</h3>
              <span className="ml-auto text-xs text-zinc-400">{b.pedidos.length} pedido(s)</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs">
              {b.pedidos.map((p) => (
                <li key={p.numero}>
                  <strong>#{p.numero}</strong> {p.cliente} — {p.itens.map((i) => `${i.sabor} ${i.qtd}`).join(" + ")}
                  {p.status === "preparando" ? " 👨‍🍳 em preparação (não mexer)" : null}
                  {p.status === "agendado" ? " 📅 agendado (fora da janela — detecção antecipada)" : null}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-zinc-300">
              Carga combinada: 🔥 {b.calc.qtdFritos} + 🥟 {b.calc.qtdPasteis} + 🥐 {b.calc.qtdAssados} ={" "}
              <strong className="text-emerald-300">{b.calc.tecnicoMin} min</strong> ({b.calc.fritadeiras}/3 fritadeiras
              {b.calc.paralelismoEstimado ? " ⚠️est." : ""}) • ▶️ iniciar às {hora(b.inicio)}
            </p>
            {b.inviavel ? (
              <p className="mt-1 rounded bg-red-950 p-1.5 text-xs font-bold text-red-300">
                🚨 Prazo inviável — sinalizado para análise do responsável. Sem novo horário automático.
              </p>
            ) : null}
            {!b.inviavel && b.disputa ? (
              <p className="mt-1 rounded bg-orange-950 p-1.5 text-xs font-bold text-orange-300">
                ⚠️ Disputa de fritadeiras nesta faixa — avaliar sequência com o responsável.
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
