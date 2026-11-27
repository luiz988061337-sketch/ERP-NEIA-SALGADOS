import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { alertasOperacionais, gruposSonoros, MENSAGENS_ALERTA, permissoesAlerta, type ModoAlerta, type SomAlerta } from "@/lib/alertas-operacionais";
import { CHAVE_CONFIG_ALERTA, CHAVE_RECONHECIDOS, ESTADOS_CENTRAL, EVENTO_AVISO_COZINHA, TOPICO_AVISOS_COZINHA, TIPO_AVISO_CAIXA, TIPO_AVISO_RETIRADA, gravarArmazenamento, gravarReconhecidos, lerArmazenamento, lerConfig, lerReconhecidos, type AvisoCozinha, type ConfigAlerta, type PedidoCentral } from "@/lib/central-pedidos";
import { lerDashboard } from "@/lib/dashboard-a01-dados";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { useRoles, useSession } from "@/lib/session";
import "./central-pedidos.css";

const POLLING_MS = 15_000;
const rotulos = { novo: "Novo pedido", lembrete: "Aguardando aceite", retirada: "Retirada pronta", entrega: "Entrega pronta", atraso: "Pedido atrasado" };
const toques: Record<SomAlerta, number[]> = {
  novo: [660, 880], lembrete: [660, 660], retirada: [520, 700, 900],
  entrega: [900, 660, 520], atraso: [470, 940, 470],
};
type Comandos = {
  avisos: AvisoCozinha[];
  avisosErro: boolean;
  refazerAvisos: () => void;
  config: ConfigAlerta;
  salvarConfig: (config: ConfigAlerta) => void;
  reconhecidos: Set<string>;
  reconhecer: (chave: string) => void;
  testar: (tipo: SomAlerta) => void;
  audioBloqueado: boolean;
};
const Contexto = createContext<Comandos | null>(null);
export const useAlertasOperacionais = () => useContext(Contexto);

export function ControlesAlertas({ config, salvar, testar }: {
  config: ConfigAlerta;
  salvar: (config: ConfigAlerta) => void;
  testar?: ((tipo: SomAlerta) => void) | undefined;
}) {
  const [somTeste, setSomTeste] = useState<SomAlerta>("novo");
  const intervalos = [...new Set([15, 30, 60, config.intervaloSegundos])].sort((a, b) => a - b);
  return <section className="ca-audio" aria-label="Controles do alerta sonoro">
    <strong><Bell size={19} aria-hidden /> Alertas sonoros</strong>
    <label>
      <input type="checkbox" role="switch" aria-label="Alerta sonoro" checked={config.ativo}
        onChange={e => salvar({ ...config, ativo: e.target.checked })} />
      {config.ativo ? "Ativo" : "Desativado"}
    </label>
    <label>
      Volume
      <input type="range" min={0} max={100} step={5} value={Math.round(config.volume * 100)}
        onChange={e => salvar({ ...config, volume: Number(e.target.value) / 100 })} aria-label="Volume do alerta" />
      <span>{Math.round(config.volume * 100)}%</span>
    </label>
    <label>
      Repetir
      <select value={config.intervaloSegundos} aria-label="Intervalo de repetição"
        onChange={e => salvar({ ...config, intervaloSegundos: Number(e.target.value) })}>
        {intervalos.map(s => <option key={s} value={s}>{s} s</option>)}
      </select>
    </label>
    {testar && <>
      <label>
        Reprodução
        <select aria-label="Modo do alerta" value={config.modo ?? "toque-voz"}
          onChange={e => salvar({ ...config, modo: e.target.value as ModoAlerta })}>
          <option value="toque-voz">Toque seguido de voz</option>
          <option value="toque">Somente toque</option>
          <option value="voz">Somente voz</option>
        </select>
      </label>
      <label>
        Alerta para testar
        <select aria-label="Alerta para testar" value={somTeste} onChange={e => setSomTeste(e.target.value as SomAlerta)}>
          {Object.entries(rotulos).map(([tipo, texto]) => <option key={tipo} value={tipo}>{texto}</option>)}
        </select>
      </label>
      <button type="button" className="ca-primario inline-flex items-center gap-2 rounded-md border p-2" onClick={() => testar(somTeste)}>
        <BellRing size={17} aria-hidden /> Testar som
      </button>
    </>}
  </section>;
}

export function AlertasOperacionais({ children, ativo }: { children: ReactNode; ativo: boolean }) {
  const { user } = useSession();
  const { data: papeis } = useRoles(ativo ? user?.id : undefined);
  const permissoes = permissoesAlerta(papeis ?? []);
  if (!ativo || !user || !papeis || !(permissoes.atendimento || permissoes.entregas)) return children;
  return <AlertasDoFuncionario key={user.id} usuario={user.id} papeis={papeis}>{children}</AlertasDoFuncionario>;
}

function AlertasDoFuncionario({ children, usuario, papeis }: { children: ReactNode; usuario: string; papeis: string[] }) {
  const queryClient = useQueryClient();
  const chaveConfig = CHAVE_CONFIG_ALERTA + ":" + usuario;
  const chaveReconhecidos = CHAVE_RECONHECIDOS + ":" + usuario;
  const origemLegada = CHAVE_CONFIG_ALERTA + ":titular-legado";
  const [config, setConfig] = useState(() => lerConfig(lerArmazenamento(chaveConfig)));
  const [reconhecidos, setReconhecidos] = useState(() => lerReconhecidos(chaveReconhecidos));
  const [pronto, setPronto] = useState(false);
  const [agora, setAgora] = useState(Date.now);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const ocupado = useRef(false);
  const cancelado = useRef(false);
  const fimVoz = useRef<(() => void) | null>(null);
  const conhecidos = useRef(new Set<string>());
  const carregou = useRef(false);
  const pedidosQuery = useQuery({
    queryKey: ["alertas-operacionais-pedidos", usuario],
    refetchInterval: POLLING_MS,
    refetchIntervalInBackground: true,
    queryFn: ({ signal }) => lerDashboard<PedidoCentral>((inicio, fim) =>
      supabase.from("pedidos")
        .select("id,numero,status,tipo_entrega,created_at,agendado_para,prazo_prometido_em,aceito_em_atendente,aceito_em,liberado_em,conferido_em,motoboy_id,retirado_em,pronto_em,atrasado")
        .in("status", [...ESTADOS_CENTRAL, "em_rota"]).is("retirado_em", null)
        .order("id").range(inicio, fim).abortSignal(signal)),
  });
  const avisosQuery = useQuery({
    queryKey: ["central-pedidos-avisos", usuario],
    refetchInterval: POLLING_MS,
    refetchIntervalInBackground: true,
    queryFn: async ({ signal }) => {
      // O histórico continua na tabela existente. Busca só os avisos dos pedidos ativos.
      const ids = (pedidosQuery.data ?? []).filter(p => p.status === "pronto" || p.status === "aguardando_motoboy").map(p => "/central-entregas?pedido=" + p.id);
      const avisos: AvisoCozinha[] = [];
      for (let i = 0; i < ids.length; i += 40) {
        const links = ids.slice(i, i + 40);
        avisos.push(...await lerDashboard<AvisoCozinha>((inicio, fim) =>
          supabase.from("notificacoes").select("id,tipo,titulo,detalhe,link,lida,created_at")
            .in("tipo", [TIPO_AVISO_CAIXA, TIPO_AVISO_RETIRADA]).in("link", links)
            .order("created_at", { ascending: false }).order("id").range(inicio, fim).abortSignal(signal)));
      }
      return avisos;
    },
  });

  useEffect(() => {
    if (pedidosQuery.data) void queryClient.invalidateQueries({ queryKey: ["central-pedidos-avisos", usuario] });
  }, [pedidosQuery.data, queryClient, usuario]);

  useEffect(() => {
    const atualizarAvisos = () => void queryClient.invalidateQueries({ queryKey: ["central-pedidos-avisos", usuario] });
    const atualizarPedidos = () => {
      void queryClient.invalidateQueries({ queryKey: ["alertas-operacionais-pedidos", usuario] });
      void queryClient.invalidateQueries({ queryKey: ["central-pedidos", usuario] });
      for (const chave of ["fila-producao", "central-j2-pedidos", "central-j3d-ocorrencias",
        "central-j3c-atrasos", "central-j3c-historico", "central-j3f-rotas", "central-j3h-rotas"]) {
        void queryClient.invalidateQueries({ queryKey: [chave] });
      }
    };
    const nome = "neia:erp-alertas-realtime:" + usuario;
    const ponte = navigator.locks && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(nome) : null;
    const controlador = new AbortController();
    const receber = (tipo: "pedidos" | "cozinha") => {
      if (tipo === "cozinha") atualizarAvisos();
      atualizarPedidos();
    };
    const propagar = (tipo: "pedidos" | "cozinha") => {
      if (controlador.signal.aborted) return;
      receber(tipo);
      ponte?.postMessage(tipo);
    };
    if (ponte) ponte.onmessage = ({ data }) => {
      if (data === "pedidos" || data === "cozinha") receber(data);
    };
    const assinar = () => {
      const canalPedidos = supabase.channel("erp-alertas-pedidos").on("postgres_changes",
        { schema: "public", table: "pedidos", event: "*" }, () => propagar("pedidos"))
        .subscribe((estado: string) => { if (estado === "SUBSCRIBED") propagar("pedidos"); });
      const canalAvisos = supabase.channel(TOPICO_AVISOS_COZINHA, { config: { private: true } })
        .on("broadcast", { event: EVENTO_AVISO_COZINHA }, () => propagar("cozinha"))
        .subscribe((estado: string) => { if (estado === "SUBSCRIBED") propagar("cozinha"); });
      controlador.signal.addEventListener("abort", () => {
        void supabase.removeChannel(canalPedidos);
        void supabase.removeChannel(canalAvisos);
      }, { once: true });
    };
    if (ponte) {
      // Uma aba assina, as demais recebem somente pedidos de atualização.
      void navigator.locks.request(nome, { signal: controlador.signal }, () => {
        if (controlador.signal.aborted) return;
        assinar();
        return new Promise<void>(resolve =>
          controlador.signal.addEventListener("abort", () => resolve(), { once: true }));
      }).catch(() => { if (!controlador.signal.aborted) assinar(); });
    } else assinar();
    return () => { controlador.abort(); ponte?.close(); };
  }, [queryClient, usuario]);

  useEffect(() => {
    if (!lerArmazenamento(origemLegada)) gravarArmazenamento(origemLegada, usuario);
    if (!lerArmazenamento(chaveConfig)) {
      const herdada = lerArmazenamento(origemLegada) === usuario ? lerArmazenamento(CHAVE_CONFIG_ALERTA) : null;
      const inicial = lerConfig(herdada);
      gravarArmazenamento(chaveConfig, JSON.stringify(inicial));
      setConfig(inicial);
    }
    if (!lerArmazenamento(chaveReconhecidos)) {
      const ids = lerReconhecidos("neia:central-pedidos:avisos-reconhecidos:" + usuario);
      if (lerArmazenamento(origemLegada) === usuario) for (const id of lerReconhecidos()) ids.add(id);
      gravarReconhecidos(ids, chaveReconhecidos);
      setReconhecidos(ids);
    }
    setPronto(true);
    const sincronizar = ({ key }: StorageEvent) => {
      if (key === chaveConfig) setConfig(lerConfig(lerArmazenamento(chaveConfig)));
      if (key === chaveReconhecidos) setReconhecidos(lerReconhecidos(chaveReconhecidos));
    };
    window.addEventListener("storage", sincronizar);
    return () => window.removeEventListener("storage", sincronizar);
  }, [usuario, origemLegada, chaveConfig, chaveReconhecidos]);

  const salvarConfig = useCallback((preferencia: ConfigAlerta) => {
    gravarArmazenamento(chaveConfig, JSON.stringify(preferencia));
    setConfig(preferencia);
  }, [chaveConfig]);
  const reconhecer = useCallback((chave: string) => {
    const gravar = () => {
      const ids = lerReconhecidos(chaveReconhecidos);
      ids.add(chave);
      gravarReconhecidos(ids, chaveReconhecidos);
      setReconhecidos(estado => new Set([...estado, ...ids]));
    };
    if (navigator.locks) void navigator.locks.request(chaveReconhecidos, gravar);
    else gravar();
  }, [chaveReconhecidos]);

  const liberarAudio = useCallback(async () => {
    try {
      const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return false;
      audio.current ??= new Ctx();
      if (audio.current.state !== "running") await audio.current.resume();
      const ok = audio.current?.state === "running";
      if (ok) setAudioBloqueado(false);
      return ok;
    } catch { return false; }
  }, []);

  useEffect(() => {
    cancelado.current = false;
    const gesto = () => { void liberarAudio(); };
    window.addEventListener("pointerdown", gesto, { once: true });
    window.addEventListener("keydown", gesto, { once: true });
    return () => {
      cancelado.current = true;
      window.removeEventListener("pointerdown", gesto);
      window.removeEventListener("keydown", gesto);
      fimVoz.current?.();
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
    };
  }, [liberarAudio]);

  const tocar = useCallback(async (categorias: SomAlerta[], teste = false, imediato = false) => {
    if (!categorias.length || !config.volume || ocupado.current) return;
    if (!teste && !config.ativo) return;
    if (audio.current?.state !== "running" && !(teste && await liberarAudio())) {
      setAudioBloqueado(true);
      return;
    }
    const executar = async () => {
      if (ocupado.current || cancelado.current) return;
      const ultima = "neia:alertas-operacionais:ultimo:" + usuario;
      const instante = Date.now();
      const tempos = Number(lerArmazenamento(ultima)) || 0;
      if (!teste && instante - tempos < 900) return;
      const janela = imediato ? 900 : config.intervaloSegundos * 1000 - 350;
      categorias = categorias.filter(tipo => teste || instante - Number(lerArmazenamento(ultima + ":" + tipo)) >= janela);
      if (!categorias.length) return;
      ocupado.current = true;
      try {
        if (!teste) gravarArmazenamento(ultima, String(instante));
        const modo: ModoAlerta = config.modo ?? "toque-voz";
        const sintese = window.speechSynthesis;
        const voz = typeof SpeechSynthesisUtterance === "undefined" ? undefined : sintese?.getVoices().find(v => v.localService && /^pt[-_]br$/i.test(v.lang) &&
          /female|feminina|maria|francisca|luciana|hel[oô]isa|vit[oó]ria|let[ií]cia/i.test(v.name));
        const toque = async (tipo: SomAlerta) => {
          const ctx = audio.current;
          if (!ctx || ctx.state !== "running") return;
          toques[tipo].forEach((frequencia, index) => {
            const inicio = ctx.currentTime + index * 0.18;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.value = frequencia;
            o.connect(g);
            g.connect(ctx.destination);
            g.gain.setValueAtTime(Math.max(0.001, config.volume * 0.23), inicio);
            g.gain.exponentialRampToValueAtTime(0.001, inicio + 0.15);
            o.onended = () => { o.disconnect(); g.disconnect(); };
            o.start(inicio);
            o.stop(inicio + 0.16);
          });
          await new Promise(resolve => window.setTimeout(resolve, toques[tipo].length * 180));
        };
        for (const tipo of categorias) {
          if (cancelado.current) break;
          if (!teste) gravarArmazenamento(ultima + ":" + tipo, String(Date.now()));
          if (modo !== "voz" || !voz) await toque(tipo);
          if (modo === "toque" || !voz || cancelado.current) continue;
          const falou = await new Promise<boolean>(resolve => {
            const fala = new SpeechSynthesisUtterance(MENSAGENS_ALERTA[tipo]);
            fala.voice = voz;
            fala.lang = "pt-BR";
            fala.volume = config.volume;
            const finalizar = (ok: boolean) => { clearTimeout(timeout); fimVoz.current = null; resolve(ok); };
            const timeout = window.setTimeout(() => fimVoz.current?.(), 10_000);
            fimVoz.current = () => { sintese.cancel(); finalizar(false); };
            fala.onend = () => finalizar(true);
            fala.onerror = () => finalizar(false);
            try { sintese.speak(fala); } catch { finalizar(false); }
          });
          if (!falou && modo === "voz" && !cancelado.current) await toque(tipo);
        }
      } finally { ocupado.current = false; }
    };
    if (navigator.locks) await navigator.locks.request("neia:erp-alertas-audio", { ifAvailable: true }, lock => lock ? executar() : undefined);
    else if (document.visibilityState === "visible") {
      // Sem Web Locks, só a aba em foco toca. Outras abas conservam os avisos visuais.
      if (document.hasFocus()) await executar();
    }
  }, [config, liberarAudio, usuario]);

  const pendentes = useMemo(
    () => alertasOperacionais(pedidosQuery.data ?? [], avisosQuery.isError ? [] : (avisosQuery.data ?? []), papeis, agora)
      .filter(a => !reconhecidos.has(a.chave)), [pedidosQuery.data, avisosQuery.data, avisosQuery.isError, papeis, agora, reconhecidos],
  );
  useEffect(() => {
    if (!pronto || !pedidosQuery.isSuccess) return;
    if (carregou.current && !pedidosQuery.isError)
      void tocar(gruposSonoros(pendentes, conhecidos.current, false), false, true);
    for (const p of pendentes) conhecidos.current.add(p.chave);
    carregou.current = true;
  }, [pronto, pendentes, pedidosQuery.isSuccess, pedidosQuery.isError, tocar]);
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const estado = useRef({ pendentes, disponivel: false });
  estado.current = { pendentes, disponivel: pronto && !pedidosQuery.isError };
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (estado.current.disponivel) void tocar(gruposSonoros(estado.current.pendentes, conhecidos.current, true));
    }, config.intervaloSegundos * 1000);
    return () => window.clearInterval(timer);
  }, [config.intervaloSegundos, tocar]);
  const [aberto, setAberto] = useState(false);
  const acesso = permissoesAlerta(papeis);
  const testar = (tipo: SomAlerta) => void tocar([tipo], true);
  return (
    <Contexto.Provider value={{ avisos: avisosQuery.data ?? [], avisosErro: avisosQuery.isError,
      refazerAvisos: () => void avisosQuery.refetch(), config, salvarConfig, reconhecer, reconhecidos,
      testar, audioBloqueado }}>
      {children}
      {pronto && (pendentes.length > 0 || !acesso.atendimento) && (
        <aside className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-lg border border-amber-500/40 bg-card p-2 text-card-foreground shadow-lg" aria-label="Alertas operacionais">
          <button type="button" className="flex items-center gap-2 px-2 py-1 text-sm font-semibold" aria-expanded={aberto} onClick={() => setAberto(v => !v)}>
            <BellRing size={16} aria-hidden /> {pendentes.length ? "Alertas (" + pendentes.length + ")" : "Alertas"}
          </button>
          {aberto && <div className="max-h-64 overflow-auto p-2">
            {audioBloqueado && <button type="button" className="underline" onClick={() => void tocar(["novo"], true)}>Liberar e testar áudio</button>}
            <ul className="space-y-2">
              {pendentes.map(a => <li key={a.chave} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                {a.tipo === "entrega" && acesso.entregas ? (
                  <Link to="/central-entregas" search={{ pedido: a.pedido.id }} className="underline">{rotulos[a.tipo]} #{a.pedido.numero}</Link>
                ) : acesso.atendimento ? (
                  <Link to="/admin" hash="central-atendente" className="underline">{rotulos[a.tipo]} #{a.pedido.numero}</Link>
                ) : (
                  <Link to="/central-entregas" search={{ pedido: a.pedido.id }} className="underline">{rotulos[a.tipo]} #{a.pedido.numero}</Link>
                )}
                <button type="button" onClick={() => reconhecer(a.chave)} className="rounded border border-border px-2 py-1" aria-label={`Reconhecer ${rotulos[a.tipo]} do pedido ${a.pedido.numero}`}>Reconhecer</button>
              </li>)}
            </ul>
            {!acesso.atendimento && <details className="mt-2 text-sm">
              <summary>Preferências de som</summary>
              <ControlesAlertas config={config} salvar={salvarConfig} testar={testar} />
            </details>}
          </div>}
        </aside>
      )}
    </Contexto.Provider>
  );
}
