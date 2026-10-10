import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  calcularProducao,
  inicioRecomendadoProducao,
  MOTOR_PRODUCAO_CONFIG,
  type ItemProducao,
} from "@/lib/motor-producao";
import { criarFilaVoz, type FilaVoz, type VozInfo } from "@/routes/preview/producao-nova";

/**
 * PRÉVIA UNIFICADA (produção + entregas) — dados 100% fictícios, estado local.
 * Rota: /preview/operacao-integrada. NÃO lê/escreve Supabase, NÃO toca o real.
 * Reutiliza o motor existente — sem motor paralelo, sem rota real atribuída.
 */

export const Route = createFileRoute("/preview/operacao-integrada")({
  head: () => ({ meta: [{ title: "Prévia — Operação integrada" }] }),
  component: PreviewOperacaoIntegrada,
});

type PedidoU = {
  numero: number;
  cliente: string;
  tipo: "entrega" | "retirada";
  status: "novo" | "preparando" | "pronto" | "aguardando_motoboy" | "em_rota";
  limiteEmMin: number;
  solicitadoEmMin: number | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  distanciaKm: number | null;
  rotaId: string | null;
  saidaPrevista: string | null;
  itens: ItemProducao[];
};

const PEDIDOS_MOCK: PedidoU[] = [
  { numero: 8001, cliente: "Aline", tipo: "entrega", status: "novo", limiteEmMin: 70, solicitadoEmMin: 10, endereco: "Rua das Flores, 123", bairro: "Centro", cidade: "São Paulo", distanciaKm: null, rotaId: "R-X", saidaPrevista: null, itens: [{ nome: "Coxinha", quantidade: 100, categoriaSlug: "salgados-fritos" }] },
  { numero: 8002, cliente: "Beto", tipo: "entrega", status: "novo", limiteEmMin: 75, solicitadoEmMin: 12, endereco: "Av. Paulista, 1000", bairro: "Bela Vista", cidade: "São Paulo", distanciaKm: null, rotaId: "R-X", saidaPrevista: null, itens: [{ nome: "Kibe", quantidade: 200, categoriaSlug: "salgados-fritos" }] },
  { numero: 8003, cliente: "Cida", tipo: "retirada", status: "preparando", limiteEmMin: 60, solicitadoEmMin: 5, endereco: null, bairro: null, cidade: null, distanciaKm: null, rotaId: null, saidaPrevista: null, itens: [{ nome: "Coxinha", quantidade: 300, categoriaSlug: "salgados-fritos" }] },
  { numero: 8004, cliente: "Davi", tipo: "entrega", status: "novo", limiteEmMin: 130, solicitadoEmMin: 25, endereco: "Rua Augusta, 456", bairro: null, cidade: "São Paulo", distanciaKm: null, rotaId: null, saidaPrevista: null, itens: [{ nome: "Esfiha", quantidade: 60, categoriaSlug: "salgados-assados" }] },
  { numero: 8005, cliente: "Elisa", tipo: "entrega", status: "agendado" as unknown as PedidoU["status"], limiteEmMin: 200, solicitadoEmMin: null, endereco: "Rua X", bairro: "Y", cidade: "São Paulo", distanciaKm: null, rotaId: null, saidaPrevista: null, itens: [{ nome: "Pastel de carne", quantidade: 100, categoriaSlug: "mini-pasteis" }] },
  { numero: 8006, cliente: "Fabio", tipo: "entrega", status: "pronto", limiteEmMin: 40, solicitadoEmMin: -20, endereco: "Rua das Palmeiras, 789", bairro: "Pinheiros", cidade: "São Paulo", distanciaKm: null, rotaId: "R-Y", saidaPrevista: "14:50", itens: [{ nome: "Risole", quantidade: 50, categoriaSlug: "salgados-fritos" }] },
  { numero: 8007, cliente: "Gilda", tipo: "entrega", status: "em_rota", limiteEmMin: 30, solicitadoEmMin: -40, endereco: "Rua do Comércio, 200", bairro: "Centro", cidade: "São Paulo", distanciaKm: null, rotaId: "R-Y", saidaPrevista: "14:35", itens: [{ nome: "Bolinha de queijo", quantidade: 50, categoriaSlug: "salgados-fritos" }] },
  { numero: 8008, cliente: "Heitor", tipo: "entrega", status: "novo", limiteEmMin: 72, solicitadoEmMin: 15, endereco: null, bairro: null, cidade: null, distanciaKm: null, rotaId: null, saidaPrevista: null, itens: [{ nome: "Coxinha", quantidade: 50, categoriaSlug: "salgados-fritos" }] },
];

const PREVISTOS_HORA: Record<string, number> = {};
const CAP_FRI = 3;

type MotoboyMock = {
  nome: string;
  status: "disponível" | "atribuído" | "em rota" | "indisponível";
  desde: string;
  rota: string | null;
  pendentes: number;
};

const MOTOBOYS_MOCK: MotoboyMock[] = [
  { nome: "Carlos", status: "disponível", desde: "13:40", rota: null, pendentes: 0 },
  { nome: "Duda", status: "em rota", desde: "14:35", rota: "R-Y", pendentes: 2 },
  { nome: "Edson", status: "indisponível", desde: "12:00", rota: null, pendentes: 0 },
];

const hhmm = (t: number) => new Date(t).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function distribuirRotas(numeros: number[]): string[][] {
  const rotas: string[][] = [];
  for (let i = 0; i < numeros.length; i += 3) rotas.push(numeros.slice(i, i + 3).map(String));
  return rotas;
}

export function PreviewOperacaoIntegrada() {
  const agora = useMemo(() => Date.now(), []);
  const [rotas, setRotas] = useState<{ id: string; motoboy: string | null; saida: string; paradas: number[]; iniciada: boolean }[]>([
    { id: "R-X", motoboy: null, saida: hhmm(agora + 50 * 60000), paradas: [8001, 8002], iniciada: false },
    { id: "R-Y", motoboy: "Duda", saida: hhmm(agora - 5 * 60000), paradas: [8006, 8007], iniciada: true },
  ]);
  const [hist, setHist] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [solSel, setSolSel] = useState(8001);
  const [solHora, setSolHora] = useState("");
  const [solMotivo, setSolMotivo] = useState("Cliente pediu antecipação da entrega");
  const [solResultado, setSolResultado] = useState<string | null>(null);
  const voz = useRef<FilaVoz | null>(null);
  const [vozLigada, setVozLigada] = useState(false);
  const [vozInfo, setVozInfo] = useState<VozInfo>({ fila: 0, falando: false, status: "desativada" });
  if (!voz.current) voz.current = criarFilaVoz((info) => setVozInfo(info));

  const comLimite = PEDIDOS_MOCK.map((p) => ({ ...p, limite: agora + p.limiteEmMin * 60000 }));
  const grupos = new Map<string, typeof comLimite>();
  for (const p of comLimite) {
    const d = new Date(p.limite);
    const chave = `${String(d.getHours()).padStart(2, "0")}h`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), p]);
  }
  const ocupadas = comLimite.filter((p) => p.status === "preparando").reduce((s, p) => s + calcularProducao(p.itens).fritadeiras, 0);
  const livres = Math.max(0, CAP_FRI - ocupadas);

  const pendentes = comLimite.filter((p) => (p.status === "novo" || p.status === "pronto") && p.tipo === "entrega" && !rotas.some((r) => r.paradas.includes(p.numero)));
  const sugestao = distribuirRotas(pendentes.map((p) => p.numero));
  const dispMotoboys = MOTOBOYS_MOCK.filter((m) => m.status === "disponível").sort((a, b) => (a.desde < b.desde ? -1 : 1));

  function avaliarAntecipacao(): void {
    const p = comLimite.find((x) => x.numero === solSel);
    if (!p || !solHora) return;
    const [h, m] = solHora.split(":").map(Number);
    const d = new Date(agora);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    const c = calcularProducao(p.itens);
    const inicioNec = d.getTime() - ((c.tecnicoMin ?? 0) + 10) * 60000;
    setSolResultado(
      p.status === "preparando"
        ? "AGUARDANDO: em preparo, sem interromper."
        : inicioNec < agora
          ? `NÃO VIÁVEL: início necessário ${hhmm(inicioNec)} já passou. Sem confirmação.`
          : `VIÁVEL (simulação): início ${hhmm(inicioNec)}, fritadeiras livres ${livres}/3. Afetados: recalcular faixas.`,
    );
    voz.current?.anunciar({ id: `sol:${p.numero}:${solHora}`, texto: `Antecipação solicitada para o pedido ${p.numero}.`, prioridade: 3 });
  }

  function editarRota(id: string, fn: (r: (typeof rotas)[number]) => (typeof rotas)[number] | null, motivo: string): void {
    const alvo = rotas.find((r) => r.id === id);
    if (!alvo) return;
    if (alvo.iniciada) {
      setHist((h) => [`${hhmm(agora)} [${id}] BLOQUEADO: rota em andamento — ${motivo}`, ...h]);
      return;
    }
    const nova = fn({ ...alvo, paradas: [...alvo.paradas] });
    if (!nova) return;
    if (nova.paradas.length > 3) {
      setHist((h) => [`${hhmm(agora)} [${id}] BLOQUEADO: máximo 3 entregas — ${motivo}`, ...h]);
      return;
    }
    const todas = rotas.flatMap((r) => (r.id === id ? [] : r.paradas));
    if (nova.paradas.some((n) => todas.includes(n))) {
      setHist((h) => [`${hhmm(agora)} [${id}] BLOQUEADO: pedido em duas rotas — ${motivo}`, ...h]);
      return;
    }
    setHist((h) => [`${hhmm(agora)} [${id}] ${motivo} (admin fictício): [${alvo.paradas}] → [${nova.paradas}] motoboy ${alvo.motoboy ?? "—"} → ${nova.motoboy ?? "—"}`, ...h]);
    setRotas((rs) => rs.map((r) => (r.id === id ? nova : r)));
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-6xl">
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
          PRÉVIA UNIFICADA — dados fictícios, sem banco, sem ações reais. Distância rodoviária indisponível (sem cálculo confiável). Voz: ligar p/ testar.
        </p>
        <h1 className="mt-3 text-2xl font-extrabold">Operação integrada — produção + entregas (prévia)</h1>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Demanda por hora">
          <h2 className="font-extrabold">📊 Demanda por hora (pelo horário limite)</h2>
          <div className="mt-2 space-y-2">
            {[...grupos.keys()].sort().map((chave) => {
              const lista = grupos.get(chave) ?? [];
              const conf = lista.filter((p) => p.status !== ("agendado" as string));
              const calc = calcularProducao(lista.flatMap((p) => p.itens));
              const un = calc.qtdTotal;
              return (
                <article key={chave} className="rounded-xl border border-zinc-800 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-extrabold">{chave} ({chave}:00–{chave}:59)</h3>
                    <span className="ml-auto text-xs text-zinc-400">{lista.length} prazo(s) • ✅ {conf.length} confirmados • 🔮 previstos separados</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-300">
                    {un} un (🔥 {calc.qtdFritos} + outros {calc.qtdPasteis + calc.qtdAssados}) • 🎯 {calc.tecnicoMin ?? "?"} min •
                    🔥 {calc.fritadeiras}/3 nec, {livres} livres • rotas c/ saída na faixa: {rotas.filter((r) => r.id === "R-X" || r.id === "R-Y").map((r) => r.id).join(", ") || "—"}
                  </p>
                  <button type="button" onClick={() => setExpandida(expandida === chave ? null : chave)} className="mt-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700">
                    {expandida === chave ? "Recolher" : "Expandir pedidos"}
                  </button>
                  {expandida === chave ? (
                    <ul className="mt-1 space-y-1 text-xs">
                      {lista.map((p) => (
                        <li key={p.numero}>
                          <strong>#{p.numero}</strong> {p.cliente} • {p.itens.map((i) => `${i.nome} ${i.quantidade}`).join(" + ")} •
                          limite {hhmm(p.limite)} • {p.status} • {p.tipo}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Fritadeiras">
          <h2 className="font-extrabold">🔥 Fritadeiras (motor existente, MAX)</h2>
          <p className="mt-1 text-xs text-zinc-300">
            Ocupadas: {ocupadas}/3 (em preparo, sem interromper) • Livres: {livres}/3 • <strong className="text-amber-300">CAPACIDADE NÃO VALIDADA</strong> •
            buffer 10 só no início • <strong className="text-amber-300">DADOS INSUFICIENTES</strong> p/ unidades/fritadeira.
          </p>
        </section>

        <section className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-zinc-900 p-4" aria-label="Prioridades">
            <h2 className="font-extrabold">🎯 Prioridades de produção (prévia)</h2>
            <ul className="mt-1 space-y-1 text-xs">
              {comLimite.filter((p) => p.status === "novo" || p.status === "preparando").slice(0, 5).map((p) => {
                const c = calcularProducao(p.itens);
                return <li key={p.numero}>#{p.numero} — téc {c.tecnicoMin ?? "?"} min — limite {hhmm(p.limite)} — {p.status}</li>;
              })}
            </ul>
          </div>
          <div className="rounded-xl bg-zinc-900 p-4" aria-label="Antecipação">
            <h2 className="font-extrabold">⏩ Antecipação do atendente (simulação)</h2>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <select value={solSel} onChange={(e) => setSolSel(Number(e.target.value))} className="rounded-lg bg-zinc-950 px-2 py-1">
                {comLimite.filter((p) => p.status === "novo").map((p) => <option key={p.numero} value={p.numero}>#{p.numero} {p.cliente}</option>)}
              </select>
              <select value={solMotivo} onChange={(e) => setSolMotivo(e.target.value)} className="rounded-lg bg-zinc-950 px-2 py-1">
                <option>Cliente pediu antecipação da entrega</option>
                <option>Cliente chegou para retirada</option>
                <option>Alteração de horário</option>
              </select>
              <input type="time" value={solHora} onChange={(e) => setSolHora(e.target.value)} className="rounded-lg bg-zinc-950 px-2 py-1" aria-label="Horário solicitado" />
              <button type="button" onClick={avaliarAntecipacao} className="rounded-lg bg-amber-500 px-3 py-1 font-bold text-black">Avaliar</button>
            </div>
            {solResultado ? <p className="mt-1 text-xs">{solResultado}</p> : null}
          </div>
        </section>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Rotas e motoboys">
          <h2 className="font-extrabold">🛵 Rotas (máx 3 entregas) + motoboys (prévia)</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {rotas.map((r) => (
              <article key={r.id} className="rounded-xl border border-zinc-800 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold">{r.id}</h3>
                  <span>🛵 {r.motoboy ?? "sem motoboy"} • saída {r.saida} • {r.paradas.length}/3 entregas{r.iniciada ? " • EM ANDAMENTO" : ""}</span>
                </div>
                <p className="mt-1 text-zinc-400">Paradas: {r.paradas.join(" → ") || "—"}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => editarRota(r.id, (x) => (x.paradas.length >= 3 ? null : x), "tentativa 4ª entrega")} className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700">+ 4ª entrega (bloqueia)</button>
                  <button type="button" onClick={() => editarRota(r.id, (x) => ({ ...x, paradas: [...x.paradas].reverse() }), "reordenar paradas")} className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700">Inverter ordem</button>
                  <button type="button" onClick={() => editarRota(r.id, (x) => ({ ...x, motoboy: x.motoboy === "Carlos" ? "Duda" : "Carlos" }), "trocar motoboy")} className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700">Trocar motoboy</button>
                  <button type="button" onClick={() => editarRota(r.id, (x) => ({ ...x, paradas: x.paradas.slice(0, 2) }), "dividir rota")} className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700">Dividir</button>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-400">Sugestão automática (por prazo, ≤3): {sugestao.map((s, i) => `Rota ${i + 1}: [${s.join(", ")}]`).join(" · ") || "—"} • excedentes aguardam (sem motoboy suficiente).</p>
          <div className="mt-2 space-y-1 text-xs">
            {MOTOBOYS_MOCK.map((m) => (
              <p key={m.nome}>🛵 <strong>{m.nome}</strong> — {m.status} desde {m.desde}{m.rota ? ` • ${m.rota}` : ""} • pendentes: {m.pendentes} • próxima ação: {m.status === "disponível" ? "atribuir rota pendente (disponível há mais tempo primeiro)" : m.status === "em rota" ? "concluir entregas" : "aguardar disponibilidade"}</p>
            ))}
          </div>
          {hist.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
              {hist.slice(0, 6).map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          ) : null}
        </section>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Cartões com endereço">
          <h2 className="font-extrabold">🧾 Cartões — endereço e distância (prévia)</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {comLimite.slice(0, 4).map((p) => (
              <article key={p.numero} className="rounded-xl border border-zinc-800 p-3 text-xs">
                <p><strong>#{p.numero}</strong> {p.cliente} • {p.itens.map((i) => `${i.nome} ${i.quantidade}`).join(" + ")} • {p.tipo}</p>
                {p.tipo === "retirada" ? (
                  <p className="mt-1">🏪 Retirada no balcão</p>
                ) : (
                  <p className="mt-1">
                    📍 {[p.endereco, p.bairro, p.cidade].filter(Boolean).join(" — ") || "Endereço incompleto"}
                    {(!p.endereco || !p.bairro) && p.tipo === "entrega" ? " ⚠️ incompleto" : ""} •
                    distância: {p.distanciaKm != null ? `${p.distanciaKm} km` : "Distância indisponível"} •
                    rota: {p.rotaId ?? "—"} • saída: {p.saidaPrevista ?? "—"}
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Detalhe completo ao expandir (complemento, prazo, rota). Distância em linha reta nunca usada como rodoviária; sem cálculo confiável.</p>
        </section>

        <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 p-3 text-xs" aria-label="Voz">
          <button type="button" onClick={() => { const l = !vozLigada; setVozLigada(l); voz.current?.setAtivada(l); }} className={`rounded-lg px-3 py-1.5 font-bold ${vozLigada ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            🎙️ Voz: {vozLigada ? "ligada" : "desligada"}
          </button>
          <button type="button" onClick={() => voz.current?.anunciar({ id: "pico:geral", texto: "Atenção: pico de produção na próxima faixa.", prioridade: 3 })} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">
            Anunciar pico
          </button>
          <span className="ml-auto text-zinc-500">
            {vozInfo.status === "ativa" ? "🟢" : vozInfo.status === "silenciada" ? "🟡" : "⚪"}
            {vozInfo.falando ? " falando…" : ""}{vozInfo.fila > 0 ? ` fila: ${vozInfo.fila}` : ""}
          </span>
        </section>
      </div>
    </div>
  );
}
