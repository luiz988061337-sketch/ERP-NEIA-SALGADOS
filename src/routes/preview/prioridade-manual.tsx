import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { calcularPedido, type ItemPedidoPreview } from "@/lib/motor-prazo-preview";
import {
  calcularProducao,
  inicioRecomendadoProducao,
  MOTOR_PRODUCAO_CONFIG,
  type ItemProducao,
} from "@/lib/motor-producao";
import { criarFilaVoz, type FilaVoz, type VozInfo } from "@/routes/preview/producao-nova";

/**
 * PRÉVIA ISOLADA PM-01 — Prioridade manual do caixa ("Passar na frente").
 * Rota: /preview/prioridade-manual. Dados 100% fictícios, estado local.
 * NÃO lê/escreve Supabase, NÃO toca pedidos reais, NÃO confirma horários.
 * Reutiliza o motor existente (calcularPedido) — sem motor paralelo.
 */

export const Route = createFileRoute("/preview/prioridade-manual")({
  head: () => ({ meta: [{ title: "Prévia — Prioridade manual (PM-01)" }] }),
  component: PreviewPrioridadeManual,
});

type PedidoMock = {
  numero: number;
  cliente: string;
  status: "novo" | "preparando" | "agendado";
  limiteEmMin: number;
  etaEmMin: number;
  rota: number;
  ordem: number;
  itens: ItemPedidoPreview[];
};

const TRANSITO_MIN = 12; // FICTÍCIO: sistema não tem ETA real de trânsito.

const FILA_MOCK: PedidoMock[] = [
  { numero: 5001, cliente: "Helena", status: "novo", limiteEmMin: 100, etaEmMin: 70, rota: 1, ordem: 2, itens: [{ sabor: "Coxinha", qtd: 100, tipo: "frito" }, { sabor: "Esfiha", qtd: 50, tipo: "assado" }] },
  { numero: 5002, cliente: "Igor", status: "novo", limiteEmMin: 130, etaEmMin: 90, rota: 1, ordem: 3, itens: [{ sabor: "Coxinha", qtd: 1000, tipo: "frito" }] },
  { numero: 5003, cliente: "Julia", status: "preparando", limiteEmMin: 60, etaEmMin: 50, rota: 1, ordem: 1, itens: [{ sabor: "Coxinha", qtd: 300, tipo: "frito" }] },
  { numero: 5004, cliente: "Kleber", status: "novo", limiteEmMin: 90, etaEmMin: 70, rota: 2, ordem: 1, itens: [{ sabor: "Kibe", qtd: 200, tipo: "frito" }] },
  { numero: 5005, cliente: "Lia", status: "novo", limiteEmMin: 78, etaEmMin: 72, rota: 2, ordem: 2, itens: [{ sabor: "Pastel de carne", qtd: 100, tipo: "pastel" }] },
  { numero: 5006, cliente: "Mario", status: "novo", limiteEmMin: 86, etaEmMin: 80, rota: 2, ordem: 3, itens: [{ sabor: "Esfiha", qtd: 60, tipo: "assado" }] },
];

const MOTIVOS = [
  "Cliente pediu para adiantar a entrega",
  "Aniversário/evento com hora marcada",
  "Erro operacional — compensar cliente",
  "Outro (descrever na observação)",
];

type EstadoPM = "Solicitada" | "Aprovada" | "Não viável" | "Aguardando confirmação";

type Versao = { em: string; de: string; para: string; motivo: string; resultado: EstadoPM };

export function PreviewPrioridadeManual() {
  const agora = useMemo(() => Date.now(), []);
  const [numSel, setNumSel] = useState(5001);
  const [motivo, setMotivo] = useState("");
  const [desejado, setDesejado] = useState("");
  const [motoboyOk, setMotoboyOk] = useState(true);
  const [resultado, setResultado] = useState<{ estado: EstadoPM; detalhe: string; impactos: string[]; novoLimite: string } | null>(null);
  const [historico, setHistorico] = useState<Versao[]>([]);
  const voz = useRef<FilaVoz | null>(null);
  const [vozLigada, setVozLigada] = useState(false);
  const [vozInfo, setVozInfo] = useState<VozInfo>({ fila: 0, falando: false, status: "desativada" });
  if (!voz.current) voz.current = criarFilaVoz((info) => setVozInfo(info));

  const pedido = FILA_MOCK.find((p) => p.numero === numSel) ?? FILA_MOCK[0]!;
  const tec = calcularPedido(pedido.itens).tecnicoMin;
  const limiteAtual = new Date(agora + pedido.limiteEmMin * 60000);
  const hhmm = (t: number) => new Date(t).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  function avaliar(): void {
    if (!motivo) return;
    if (!desejado) return;
    const novoLimite = new Date(desejado).getTime();
    if (Number.isNaN(novoLimite)) return;
    const inicioNec = novoLimite - (tec + 10) * 60000;
    const impactos: string[] = [];
    for (const outro of FILA_MOCK) {
      if (outro.rota !== pedido.rota || outro.numero === pedido.numero || outro.status === "preparando") continue;
      const etaOutro = agora + outro.etaEmMin * 60000 + TRANSITO_MIN * 60000;
      const limiteOutro = agora + outro.limiteEmMin * 60000;
      if (etaOutro > limiteOutro) {
        impactos.push(`#${outro.numero} estoura o prazo em ${Math.round((etaOutro - limiteOutro) / 60000)} min`);
      }
    }
    let estado: EstadoPM;
    let detalhe: string;
    if (pedido.status === "preparando") {
      estado = "Aguardando confirmação";
      detalhe = "Pedido já em preparo: a equipe é avisada, sem interromper o processo. Confirmação manual.";
    } else if (inicioNec < agora) {
      const viavelEm = new Date(agora + (tec + 10) * 60000);
      estado = "Não viável";
      detalhe = `Cozinha não comporta: início necessário ${hhmm(inicioNec)} já passou. Sugerir ≥ ${hhmm(viavelEm.getTime())} + negociação.`;
    } else if (!motoboyOk) {
      estado = "Aguardando confirmação";
      detalhe = "Cozinha viável, mas motoboy indisponível/atrasado: antecipação NÃO garantida.";
    } else if (impactos.length > 0) {
      estado = "Aguardando confirmação";
      detalhe = "Há impacto em outros clientes da rota — avaliar antes de confirmar.";
    } else {
      estado = "Aprovada";
      detalhe = "Cozinha, rota e motoboy viáveis na simulação. Prioridade elevada (prévia).";
    }
    setResultado({ estado, detalhe, impactos, novoLimite: hhmm(novoLimite) });
    setHistorico((h) => [...h, { em: hhmm(agora), de: hhmm(limiteAtual.getTime()), para: hhmm(novoLimite), motivo, resultado: estado }]);
    voz.current?.anunciar({
      id: `pm:${pedido.numero}:${novoLimite}`,
      texto: `Prioridade manual solicitada para o pedido ${pedido.numero}. ${estado}.`,
      prioridade: 3,
    });
  }

  const corEstado = !resultado ? "" : resultado.estado === "Aprovada" ? "border-emerald-500 text-emerald-300" : resultado.estado === "Não viável" ? "border-red-500 text-red-300" : "border-yellow-400 text-yellow-200";

  return (
    <div className="min-h-screen bg-[#0c0c0f] px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <p className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-200">
          PRÉVIA ISOLADA PM-01 — dados fictícios, sem banco, sem pedidos reais. Solicitar prioridade NÃO confirma
          novo horário. Trânsito entre paradas é fictício (sistema não tem ETA real).
        </p>
        <h1 className="mt-3 text-2xl font-extrabold">⏩ Passar na frente — prioridade manual (prévia)</h1>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4">
          <h2 className="font-extrabold">1. Pedido</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {FILA_MOCK.map((p) => (
              <button key={p.numero} type="button" onClick={() => { setNumSel(p.numero); setResultado(null); }} className={`rounded-lg px-3 py-1.5 ${numSel === p.numero ? "bg-amber-500 font-bold text-black" : "bg-zinc-800 hover:bg-zinc-700"}`}>
                #{p.numero} {p.cliente}{p.status === "preparando" ? " 👨‍🍳" : ""}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Limite atual: {hhmm(limiteAtual.getTime())} • Preparo estimado: {tec} min • Status: {pedido.status}
          </p>
        </section>

        <section className="mt-3 rounded-xl bg-zinc-900 p-4">
          <h2 className="font-extrabold">2. Motivo (obrigatório) e horário desejado</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              Motivo
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm">
                <option value="">Selecione…</option>
                {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              Novo horário desejado
              <input type="datetime-local" value={desejado} onChange={(e) => setDesejado(e.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={motoboyOk} onChange={(e) => setMotoboyOk(e.target.checked)} />
            Motoboy da rota disponível (desmarque para simular indisponível/atrasado)
          </label>
          <button type="button" onClick={avaliar} disabled={!motivo || !desejado} className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-40">
            Avaliar viabilidade (prévia)
          </button>
        </section>

        {resultado ? (
          <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Resultado">
            <p className={`inline-block rounded-full border px-3 py-1 text-sm font-extrabold ${corEstado}`}>{resultado.estado}</p>
            <p className="mt-2 text-sm">{resultado.detalhe}</p>
            {resultado.impactos.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-orange-300">
                {resultado.impactos.map((i) => <li key={i}>{i}</li>)}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-zinc-400">Novo limite de preparo (proposto, não confirmado): {resultado.novoLimite}</p>
            <p className="mt-1 rounded-lg bg-zinc-950 p-2 text-xs">
              📢 Aviso à produção: motivo “{motivo}” — estado {resultado.estado}. Central atualizada se houver impacto na rota. Cliente só é comunicado após confirmação.
            </p>
          </section>
        ) : null}

        {historico.length > 0 ? (
          <section className="mt-3 rounded-xl bg-zinc-900 p-4">
            <h2 className="font-extrabold">Histórico (fictício — usa a versão mais recente)</h2>
            <ul className="mt-1 space-y-1 text-xs text-zinc-300">
              {historico.map((h, i) => (
                <li key={i}>v{i + 1} {h.em}: {h.de} → {h.para} • {h.motivo} • {h.resultado}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 p-3 text-xs" aria-label="Voz (prévia)">
          <button type="button" onClick={() => { const l = !vozLigada; setVozLigada(l); voz.current?.setAtivada(l); }} className={`rounded-lg px-3 py-1.5 font-bold ${vozLigada ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            🎙️ Voz: {vozLigada ? "ligada" : "desligada"}
          </button>
          <span className="ml-auto text-zinc-500">
            {vozInfo.status === "ativa" ? "🟢" : vozInfo.status === "silenciada" ? "🟡" : "⚪"}
            {vozInfo.falando ? " falando…" : ""}{vozInfo.fila > 0 ? ` fila: ${vozInfo.fila}` : ""}
          </span>
          <p className="w-full text-zinc-500">Fila inteligente compartilhada: sem sobreposição, com dedup; voz nunca desliga o visual.</p>
        </section>

        <AdminAntecipacoes agora={agora} />
        <CargaHoraria agora={agora} />
        <PrioridadePorRota agora={agora} />
      </div>
    </div>
  );
}

/** Capacidade da PRÉVIA — parâmetros fictícios, NÃO validados operacionalmente. */
const CAP_FICTICIA = { fritadeiras: 3 };

type SolicitacaoMock = {
  id: string;
  numero: number;
  cliente: string;
  tipo: "entrega" | "retirada";
  limiteOriginalMin: number;
  limiteSolicitadoMin: number;
  motivo: string;
  atendente: string;
  cozinha: string;
  rota: string;
};

const SOLICITACOES_MOCK: SolicitacaoMock[] = [
  { id: "S1", numero: 5001, cliente: "Helena", tipo: "entrega", limiteOriginalMin: 100, limiteSolicitadoMin: 70, motivo: "Cliente pediu para adiantar a entrega", atendente: "Ana (caixa)", cozinha: "viável", rota: "sem impacto" },
  { id: "S2", numero: 5004, cliente: "Kleber", tipo: "entrega", limiteOriginalMin: 90, limiteSolicitadoMin: 60, motivo: "Aniversário com hora marcada", atendente: "Bia (caixa)", cozinha: "viável", rota: "afeta #5005/#5006" },
  { id: "S3", numero: 5003, cliente: "Julia", tipo: "retirada", limiteOriginalMin: 60, limiteSolicitadoMin: 40, motivo: "Cliente pediu para adiantar a entrega", atendente: "Ana (caixa)", cozinha: "em preparo — sem interrupção", rota: "—" },
  { id: "S4", numero: 5005, cliente: "Lia", tipo: "retirada", limiteOriginalMin: 78, limiteSolicitadoMin: 40, motivo: "Erro operacional — compensar", atendente: "Bia (caixa)", cozinha: "inviável (início passado)", rota: "—" },
];

type EstadoAdmin = "SOLICITADA" | "EM ANÁLISE" | "APROVADA NA SIMULAÇÃO" | "NÃO VIÁVEL" | "AGUARDANDO CONFIRMAÇÃO";

function AdminAntecipacoes({ agora }: { agora: number }) {
  const [estados, setEstados] = useState<Record<string, EstadoAdmin>>({ S1: "SOLICITADA", S2: "EM ANÁLISE", S3: "AGUARDANDO CONFIRMAÇÃO", S4: "NÃO VIÁVEL" });
  const [novoHorario, setNovoHorario] = useState<Record<string, string>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const hhmm = (t: number) => new Date(t).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  function mudar(id: string, e: EstadoAdmin): void {
    setEstados((m) => ({ ...m, [id]: e }));
  }
  return (
    <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Admin de antecipações (prévia)">
      <h2 className="font-extrabold">🛡️ ADMIN — SOLICITAÇÕES DE ANTECIPAÇÃO (fictício)</h2>
      <div className="mt-2 space-y-2">
        {SOLICITACOES_MOCK.map((s) => (
          <article key={s.id} className="rounded-lg border border-zinc-800 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <strong>#{s.numero} {s.cliente}</strong>
              <span>{s.tipo === "entrega" ? "🛵 entrega" : "🏪 retirada"}</span>
              <span>⏰ {hhmm(agora + s.limiteOriginalMin * 60000)} → {hhmm(agora + s.limiteSolicitadoMin * 60000)}</span>
              <span className="ml-auto rounded-full border border-zinc-700 px-2 py-0.5 font-bold">{estados[s.id]}</span>
            </div>
            <p className="mt-1 text-zinc-400">Motivo: {s.motivo} • Cozinha: {s.cozinha} • Rota/motoboy: {s.rota} • Atendente: {s.atendente}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => mudar(s.id, "APROVADA NA SIMULAÇÃO")} className="rounded-lg bg-emerald-700 px-2.5 py-1 font-bold hover:bg-emerald-600">Aprovar</button>
              <button type="button" onClick={() => mudar(s.id, "NÃO VIÁVEL")} className="rounded-lg bg-red-800 px-2.5 py-1 font-bold hover:bg-red-700">Recusar</button>
              <button type="button" onClick={() => mudar(s.id, "EM ANÁLISE")} className="rounded-lg bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700">Analisar</button>
              <button type="button" onClick={() => setExpandido(expandido === s.id ? null : s.id)} className="rounded-lg bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700">Histórico</button>
              <input type="time" value={novoHorario[s.id] ?? ""} onChange={(e) => setNovoHorario((m) => ({ ...m, [s.id]: e.target.value }))} aria-label="Propor novo horário" className="rounded-lg bg-zinc-950 px-2 py-1" />
              <button type="button" onClick={() => mudar(s.id, "AGUARDANDO CONFIRMAÇÃO")} className="rounded-lg bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700">Propor horário</button>
            </div>
            {novoHorario[s.id] ? <p className="mt-1 text-zinc-400">Horário proposto (simulação): {novoHorario[s.id]} — sem confirmação automática.</p> : null}
            {expandido === s.id ? (
              <ul className="mt-1 space-y-0.5 text-zinc-400">
                <li>v1: limite {hhmm(agora + s.limiteOriginalMin * 60000)} → solicitado {hhmm(agora + s.limiteSolicitadoMin * 60000)} • {s.motivo} • {s.atendente}</li>
                <li>v2 (atual): estado {estados[s.id]} — usa a versão mais recente.</li>
              </ul>
            ) : null}
            {estados[s.id] === "APROVADA NA SIMULAÇÃO" ? (
              <p className="mt-1 rounded bg-emerald-950 p-1.5 font-bold text-emerald-300">Aprovação condicionada à verificação de capacidade e rota abaixo. Conflito = horário NÃO garantido.</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

type PedidoHora = {
  numero: number;
  cliente: string;
  tipo: "entrega" | "retirada";
  status: "novo" | "preparando" | "agendado";
  limiteEmMin: number;
  solicitadoEmMin: number | null;
  itens: ItemProducao[];
};

const PEDIDOS_HORA: PedidoHora[] = [
  { numero: 6001, cliente: "Nina", tipo: "entrega", status: "novo", limiteEmMin: 70, solicitadoEmMin: 10, itens: [{ nome: "Coxinha", quantidade: 100, categoriaSlug: "salgados-fritos" }, { nome: "Esfiha", quantidade: 50, categoriaSlug: "salgados-assados" }] },
  { numero: 6002, cliente: "Otto", tipo: "entrega", status: "novo", limiteEmMin: 95, solicitadoEmMin: 18, itens: [{ nome: "Kibe", quantidade: 200, categoriaSlug: "salgados-fritos" }] },
  { numero: 6003, cliente: "Pam", tipo: "retirada", status: "preparando", limiteEmMin: 80, solicitadoEmMin: 5, itens: [{ nome: "Coxinha", quantidade: 300, categoriaSlug: "salgados-fritos" }] },
  { numero: 6004, cliente: "Quim", tipo: "entrega", status: "novo", limiteEmMin: 130, solicitadoEmMin: 25, itens: [{ nome: "Coxinha", quantidade: 400, categoriaSlug: "salgados-fritos" }, { nome: "Kibe", quantidade: 300, categoriaSlug: "salgados-fritos" }] },
  { numero: 6005, cliente: "Rute", tipo: "retirada", status: "agendado", limiteEmMin: 200, solicitadoEmMin: null, itens: [{ nome: "Pastel de carne", quantidade: 100, categoriaSlug: "mini-pasteis" }] },
];

const PREVISTOS_POR_HORA: Record<string, number> = { "15h": 250, "16h": 400 };

function CargaHoraria({ agora }: { agora: number }) {
  const [expandida, setExpandida] = useState<string | null>(null);
  const [capDesconhecida, setCapDesconhecida] = useState(false);
  const [antecipacoes, setAntecipacoes] = useState<Record<number, number>>({});
  const hhmm = (t: number) => new Date(t).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const comLimite = PEDIDOS_HORA.map((p) => {
    const extra = antecipacoes[p.numero] ?? p.limiteEmMin;
    return { ...p, limite: agora + extra * 60000 };
  });
  const grupos = new Map<string, typeof comLimite>();
  for (const p of comLimite) {
    const d = new Date((p as { limite: number }).limite);
    const chave = `${String(d.getHours()).padStart(2, "0")}h`;
    const lista = grupos.get(chave) ?? [];
    lista.push(p);
    grupos.set(chave, lista);
  }
  const chaves = [...grupos.keys()].sort();
  const ocupadas = comLimite
    .filter((p) => p.status === "preparando")
    .reduce((s, p) => s + calcularProducao(p.itens).fritadeiras, 0);
  const livres = Math.max(0, CAP_FICTICIA.fritadeiras - ocupadas);

  return (
    <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Carga de produção por horário (prévia)">
      <h2 className="font-extrabold">📊 CARGA DE PRODUÇÃO POR HORÁRIO (fictício)</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Faixas de 1h pelo horário limite • fritadeiras ocupadas: {ocupadas}/{CAP_FICTICIA.fritadeiras} (em preparo, sem interromper) •
        livres: {livres}/{CAP_FICTICIA.fritadeiras} • <strong className="text-amber-300">CAPACIDADE NÃO VALIDADA</strong> (unidades/fritadeira desconhecidas).
      </p>
      <label className="mt-2 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={capDesconhecida} onChange={(e) => setCapDesconhecida(e.target.checked)} />
        Simular parâmetros de capacidade ausentes
      </label>
      {Object.keys(antecipacoes).length > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2 text-xs" aria-label="Simulação de antecipação ativa">
          <p className="font-extrabold">⏩ Antecipação simulada (antes → depois; sem confirmação):</p>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(antecipacoes).map(([num, novoMin]) => {
              const orig = PEDIDOS_HORA.find((p) => p.numero === Number(num));
              if (!orig) return null;
              return (
                <li key={num}>
                  #{num}: limite {hhmm(agora + orig.limiteEmMin * 60000)} → <strong className="text-amber-300">{hhmm(agora + novoMin * 60000)}</strong>
                  {" "}(faixas e viabilidade recalculadas acima; afetados listados por faixa)
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="mt-2 space-y-2">
        {chaves.map((chave) => {
          const lista = grupos.get(chave) ?? [];
          const confirmados = lista.filter((p) => p.status !== "agendado");
          const agendados = lista.filter((p) => p.status === "agendado");
          const un = lista.reduce((s, p) => s + calcularProducao(p.itens).qtdTotal, 0);
          const calc = calcularProducao(
            lista.flatMap((p) => p.itens),
          );
          const previstos = PREVISTOS_POR_HORA[chave] ?? 0;
          const ent = lista.filter((p) => p.tipo === "entrega").length;
          const ret = lista.filter((p) => p.tipo === "retirada").length;
          const precisaAntes = lista.filter((p) => {
            const c = calcularProducao(p.itens);
            if (c.tecnicoMin == null) return false;
            const lim = (p as unknown as { limite: number }).limite;
            const bandaIni = new Date(lim);
            bandaIni.setMinutes(0, 0, 0);
            return lim - (c.tecnicoMin + MOTOR_PRODUCAO_CONFIG.bufferOperacionalMin) * 60000 < bandaIni.getTime();
          });
          let situacao: string;
          let cor = "border-zinc-700";
          if (capDesconhecida || calc.tecnicoMin == null) {
            situacao = "DADOS INSUFICIENTES";
          } else if (calc.fritadeiras > livres + ocupadas || lista.some((p) => {
            const c = calcularProducao(p.itens);
            return c.tecnicoMin != null && (p as unknown as { limite: number }).limite - (c.tecnicoMin + 10) * 60000 < agora;
          })) {
            situacao = "RISCO";
            cor = "border-red-500";
          } else if (calc.fritadeiras >= livres || un + previstos > 600) {
            situacao = "ATENÇÃO";
            cor = "border-yellow-400";
          } else {
            situacao = "DENTRO DA CAPACIDADE";
            cor = "border-emerald-600";
          }
          return (
            <article key={chave} className={`rounded-xl border-2 ${cor} p-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold">{chave} ({chave}:00–{chave}:59)</h3>
                <span className="ml-auto rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-bold">{situacao}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                ✅ {confirmados.length} confirmados • {un} un (🔥 {calc.qtdFritos} + outros {calc.qtdPasteis + calc.qtdAssados}) •
                🛵 {ent} entregas • 🏪 {ret} retiradas • 📅 {agendados.length} agendados • 🔮 previstos {previstos} un (separado, não soma) •
                🎯 {calc.tecnicoMin ?? "?"} min • 🔥 {calc.fritadeiras}/3 necessárias, {livres} livres
              </p>
              {precisaAntes.length > 0 ? (
                <p className="mt-1 text-xs text-yellow-200">⏪ Precisam começar antes da faixa: {precisaAntes.map((p) => `#${p.numero}`).join(", ")}</p>
              ) : null}
              <button type="button" onClick={() => setExpandida(expandida === chave ? null : chave)} className="mt-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700">
                {expandida === chave ? "Recolher pedidos" : "Expandir pedidos"}
              </button>
              {expandida === chave ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {lista.map((p) => {
                    const c = calcularProducao(p.itens);
                    const lim = (p as unknown as { limite: number }).limite;
                    return (
                      <li key={p.numero}>
                        <strong>#{p.numero}</strong> {p.cliente} • {p.itens.map((i) => `${i.nome} ${i.quantidade}`).join(" + ")} •
                        solicitado {p.solicitadoEmMin != null ? hhmm(agora + p.solicitadoEmMin * 60000) : "—"} • limite {hhmm(lim)} •
                        {p.status}{p.status === "agendado" ? " (fora da janela — sem alerta prematuro)" : ""} • téc {c.tecnicoMin ?? "?"} min
                        {p.status !== "preparando" ? (
                          <>
                            {" • "}
                            <button type="button" onClick={() => setAntecipacoes((m) => ({ ...m, [p.numero]: Math.max(15, p.limiteEmMin - 60) }))} className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700">
                              Simular passar na frente
                            </button>
                          </>
                        ) : null}
                        {antecipacoes[p.numero] != null ? (
                          <span className="text-amber-300"> → limite simulado {hhmm(agora + (antecipacoes[p.numero] ?? 0) * 60000)} (recarga acima; sem confirmação)</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Antecipação simulada move o limite fictício e recarrega as faixas; afetados e viabilidade recalculados. Sem confirmação automática.</p>
    </section>
  );
}

/**
 * PRÉVIA — Prioridade por rota (saída planejada).
 * Auditoria: o app usa `rotas_entrega`+`rota_pedidos` (0024); `rotas`+`rota_pedidos`
 * (0044) é modelagem duplicada e está ORFÃ — nenhuma fonte operacional eleita.
 * Aqui: rotas fictícias com saída planejada; sem saída confiável → dados insuficientes.
 */
type RotaMock = {
  id: string;
  saidaEmMin: number | null;
  motoboy: string;
  pedidos: { numero: number; cliente: string; status: "preparando" | "pronto" | "aguardando_motoboy" | "em_rota" | "novo"; limiteEmMin: number; itens: ItemProducao[] }[];
};

const ROTAS_MOCK: RotaMock[] = [
  {
    id: "ROTA-A", saidaEmMin: 45, motoboy: "Carlos (fictício)",
    pedidos: [
      { numero: 7001, cliente: "Vera", status: "preparando", limiteEmMin: 50, itens: [{ nome: "Coxinha", quantidade: 100, categoriaSlug: "salgados-fritos" }] },
      { numero: 7002, cliente: "Wagner", status: "pronto", limiteEmMin: 55, itens: [{ nome: "Kibe", quantidade: 100, categoriaSlug: "salgados-fritos" }] },
    ],
  },
  {
    id: "ROTA-B", saidaEmMin: 120, motoboy: "Duda (fictícia)",
    pedidos: [
      { numero: 7003, cliente: "Xuxa", status: "novo", limiteEmMin: 130, itens: [{ nome: "Esfiha", quantidade: 60, categoriaSlug: "salgados-assados" }] },
    ],
  },
  { id: "ROTA-C", saidaEmMin: null, motoboy: "—", pedidos: [] },
];

function PrioridadePorRota({ agora }: { agora: number }) {
  const [expandida, setExpandida] = useState<string | null>(null);
  const hhmm = (t: number) => new Date(t).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="mt-3 rounded-xl bg-zinc-900 p-4" aria-label="Prioridade por rota (prévia)">
      <h2 className="font-extrabold">🛵 PRIORIDADE POR ROTA — saída planejada (fictício)</h2>
      <p className="mt-1 text-xs text-zinc-400">
        Prioridade só com necessidade demonstrada (saída × técnico × início); empate preserva chegada; em preparo não interrompe.
        Manual do caixa, risco do motor e em-preparo têm selos distintos.
      </p>
      <div className="mt-2 space-y-2">
        {ROTAS_MOCK.map((r) => {
          const semSaida = r.saidaEmMin == null;
          const semPedidos = r.pedidos.length === 0;
          const calc = semPedidos ? null : calcularProducao(r.pedidos.flatMap((p) => p.itens));
          const saida = semSaida ? null : agora + (r.saidaEmMin ?? 0) * 60000;
          const inicioNec = saida != null && calc?.tecnicoMin != null ? saida - (calc.tecnicoMin + MOTOR_PRODUCAO_CONFIG.bufferOperacionalMin) * 60000 : null;
          const precisaPriorizar = inicioNec != null && inicioNec <= agora + 15 * 60000;
          const situacao = semSaida || semPedidos ? "DADOS INSUFICIENTES" : precisaPriorizar ? "PRIORIZAR SAÍDA" : "DENTRO DO PRAZO";
          const cor = situacao === "DADOS INSUFICIENTES" ? "border-zinc-700" : situacao === "PRIORIZAR SAÍDA" ? "border-orange-500" : "border-emerald-600";
          return (
            <article key={r.id} className={`rounded-xl border-2 ${cor} p-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold">{r.id}</h3>
                <span className="text-xs text-zinc-400">🛵 {r.motoboy} • saída {saida != null ? hhmm(saida) : "sem horário confiável"}</span>
                <span className="ml-auto rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-bold">{situacao}</span>
              </div>
              {r.pedidos.length > 0 ? (
                <>
                  <p className="mt-1 text-xs text-zinc-300">
                    Carga: {calc?.qtdTotal} un • 🎯 {calc?.tecnicoMin ?? "?"} min • ▶️ início {inicioNec != null ? hhmm(inicioNec) : "—"}
                  </p>
                  <button type="button" onClick={() => setExpandida(expandida === r.id ? null : r.id)} className="mt-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700">
                    {expandida === r.id ? "Recolher" : "Expandir rota e pedidos"}
                  </button>
                </>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">Sem pedidos vinculados nesta simulação.</p>
              )}
              {expandida === r.id ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {r.pedidos.map((p) => {
                    const c = calcularProducao(p.itens);
                    const lim = agora + p.limiteEmMin * 60000;
                    const disp = lim - (c.tecnicoMin ?? 0) * 60000 - agora;
                    return (
                      <li key={p.numero}>
                        <strong>#{p.numero}</strong> {p.cliente} • {p.itens.map((i) => `${i.nome} ${i.quantidade}`).join(" + ")} •
                        limite {hhmm(lim)} • {p.status}{p.status === "preparando" ? " (não interromper)" : ""} •
                        téc {c.tecnicoMin ?? "?"} min • tempo disponível {Math.round(disp / 60000)} min
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Antecipação manual que toca uma rota: avaliar antes/depois na seção de carga acima. Selos: 🟣 manual do caixa • 🟠 risco do motor • 👨‍🍳 em preparo.
      </p>
    </section>
  );
}
