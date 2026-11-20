/**
 * Camada explícita de isolamento para TESTES LOCAIS SIMULADOS (FUNC-01-B1).
 *
 * Esta camada é INERTE em produção e na demonstração comum do Lovable: só
 * ativa quando `VITE_DEMO_PREVIEW` está ligado E `NEIA_AMBIENTE=teste`.
 * Quando ativa, ela:
 *
 *  1. valida a configuração e falha fechado se houver destino real/produção;
 *  2. bloqueia fetch/XHR/window.open/geolocalização/beacon para fora do local;
 *  3. registra cada tentativa bloqueada para verificação automatizada.
 *
 * Não altera layout, não desativa fluxo de produção e não faz requisições.
 */

type Ambiente = Record<string, unknown>;
type Tentativa = { tipo: string; destino: string };
type OuvinteClique = (evento: Event) => void;

const CHAVE_DEMO = "VITE_DEMO_PREVIEW";
// `NEIA_AMBIENTE` existe no SSR; o espelho VITE_* é necessário no navegador,
// onde o Vite só expõe variáveis prefixadas com VITE_.
const CHAVE_AMBIENTE = "NEIA_AMBIENTE";
const CHAVE_AMBIENTE_CLIENTE = "VITE_NEIA_AMBIENTE";
const MARCADOR_TESTE = "teste";

// Sincronizado com scripts/proteger-dev.mjs e vite.staging.config.ts.
// São identificadores públicos, não segredos.
const PROJETOS_PRODUCAO = ["ruioyioynwwwiqbjznoa", "iqirsunzgavsuhgyjjsi"];
const CHAVES_URL = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_NEIA_PREVIEW_URL",
  "NEIA_STAGING_URL",
] as const;
const CHAVES_PROJETO = ["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"] as const;
const CHAVES_PRIVILEGIADAS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
] as const;
const PROJETOS_SIMULADOS = ["visual-demo", "teste", "local", "demo", "demonstracao"] as const;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function ligado(valor: unknown): boolean {
  const s = texto(valor).trim().toLowerCase();
  return s === "1" || s === "true";
}

/** Lê build-time (Vite) e runtime (Node). Nunca imprime valores. */
function lerEnv(): Ambiente {
  const resultado: Ambiente = {};
  try {
    const meta = (import.meta as unknown as { env?: Ambiente }).env;
    if (meta) for (const [chave, valor] of Object.entries(meta)) resultado[chave] = valor;
  } catch {
    // import.meta indisponível: segue apenas com process.env.
  }
  try {
    const proc = (globalThis as unknown as { process?: { env?: Ambiente } }).process;
    if (proc?.env) for (const [chave, valor] of Object.entries(proc.env)) resultado[chave] = valor;
  } catch {
    // sem process.env: fail-closed na validação.
  }
  return resultado;
}

/** Verdadeiro somente no modo de teste local explicitamente marcado. */
export function ehModoTesteLocal(env: Ambiente = lerEnv()): boolean {
  const ambiente =
    texto(env[CHAVE_AMBIENTE]).trim().toLowerCase() ||
    texto(env[CHAVE_AMBIENTE_CLIENTE]).trim().toLowerCase();
  return ligado(env[CHAVE_DEMO]) && ambiente === MARCADOR_TESTE;
}

function ehProducao(valor: unknown): boolean {
  const v = texto(valor).trim().toLowerCase();
  return PROJETOS_PRODUCAO.some((projeto) => v === projeto || v.includes(projeto));
}

/**
 * Valida o destino sem revelar valores. Retorna apenas nomes de variáveis e
 * motivos. Qualquer dúvida (URL real, projeto de produção, chave privilegiada,
 * marcador ausente) é considerada falha.
 */
export function validarConfiguracaoIsolamento(env: Ambiente = lerEnv()): {
  ok: boolean;
  motivos: string[];
} {
  const motivos: string[] = [];

  if (!ligado(env[CHAVE_DEMO])) motivos.push(`${CHAVE_DEMO} não está ativo`);
  const ambiente =
    texto(env[CHAVE_AMBIENTE]).trim().toLowerCase() ||
    texto(env[CHAVE_AMBIENTE_CLIENTE]).trim().toLowerCase();
  if (ambiente !== MARCADOR_TESTE) {
    motivos.push(`${CHAVE_AMBIENTE}/${CHAVE_AMBIENTE_CLIENTE} não é "${MARCADOR_TESTE}"`);
  }
  if (texto(env["VERCEL"]).trim() === "1" || texto(env["VERCEL_ENV"]).trim() === "production") {
    motivos.push("execução em Vercel/Production não é permitida no teste local");
  }

  for (const chave of CHAVES_URL) {
    const valor = texto(env[chave]).trim();
    if (!valor) continue;
    if (ehProducao(valor)) {
      motivos.push(`destino de produção detectado em ${chave}`);
      continue;
    }
    if (/supabase\.(co|com|in)|lovable\.(cloud|app)|lovableproject/i.test(valor)) {
      motivos.push(`backend real detectado em ${chave}`);
      continue;
    }
    if (/^https?:\/\//i.test(valor) || /^wss?:\/\//i.test(valor)) {
      const permitido =
        /\.invalid$/i.test(valor) ||
        /^https?:\/\/localhost(?::\d+)?\/?$/i.test(valor) ||
        /^https?:\/\/127\.0\.0\.1(?::\d+)?\/?$/i.test(valor);
      if (!permitido) motivos.push(`destino externo não autorizado em ${chave}`);
    }
  }

  for (const chave of CHAVES_PROJETO) {
    const valor = texto(env[chave]).trim();
    if (!valor) continue;
    if (ehProducao(valor)) {
      motivos.push(`projeto de produção detectado em ${chave}`);
      continue;
    }
    if (!PROJETOS_SIMULADOS.includes(valor.toLowerCase() as (typeof PROJETOS_SIMULADOS)[number])) {
      motivos.push(`projeto simulado inválido em ${chave}`);
    }
  }

  for (const chave of CHAVES_PRIVILEGIADAS) {
    if (texto(env[chave]).trim()) motivos.push(`chave administrativa presente em ${chave}`);
  }

  const chavePublica = texto(env["VITE_SUPABASE_PUBLISHABLE_KEY"]).trim();
  if (chavePublica.startsWith("sb_secret_")) {
    motivos.push("chave secreta indevida em VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  return { ok: motivos.length === 0, motivos };
}

/** Falha fechado quando o modo de teste está ativo e a configuração não é segura. */
export function garantirIsolamentoLocal(env: Ambiente = lerEnv()): void {
  if (!ehModoTesteLocal(env)) return;
  const resultado = validarConfiguracaoIsolamento(env);
  if (!resultado.ok) {
    throw new Error(`ISOLAMENTO_LOCAL: configuração insegura (${resultado.motivos.join("; ")})`);
  }
}

function origemLocal(): string {
  try {
    return typeof location !== "undefined" ? String(location.origin ?? "") : "";
  } catch {
    return "";
  }
}

function hostSeguro(destino: unknown): string {
  try {
    return new URL(texto(destino), origemLocal() || undefined).hostname || "(sem host)";
  } catch {
    return "(destino inválido)";
  }
}

/** Somente destinos relativos, same-origin ou localhost são permitidos. */
function destinoExterno(destino: unknown): boolean {
  const s = texto(destino).trim();
  if (!s) return false;
  if (/^\/|^\.\.?\/|^#|^data:|^blob:/.test(s)) return false;
  let url: URL;
  try {
    url = new URL(s, origemLocal() || undefined);
  } catch {
    return true;
  }
  if (!/^(https?|wss?):$/i.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return false;
  }
  const origem = origemLocal();
  if (origem) {
    try {
      if (url.origin === origem) return false;
    } catch {
      // origem indisponível: mantém bloqueio.
    }
  }
  return true;
}

const estado: {
  instalada: boolean;
  tentativas: Tentativa[];
  originais: Record<string, unknown>;
  ouvinteClique: OuvinteClique | null;
} = {
  instalada: false,
  tentativas: [],
  originais: {},
  ouvinteClique: null,
};

function erroBloqueio(tipo: string, destino: unknown): Error {
  const registro: Tentativa = { tipo, destino: hostSeguro(destino) };
  estado.tentativas.push(registro);
  return new Error(
    `ISOLAMENTO_LOCAL: ${tipo} bloqueado para ${registro.destino} durante teste simulado`,
  );
}

function instalarFetch(): void {
  const atual = (globalThis as unknown as { fetch?: unknown }).fetch;
  if (typeof atual !== "function") return;
  const original = atual as (...args: unknown[]) => Promise<unknown>;
  estado.originais["fetch"] = original;
  (globalThis as unknown as { fetch: unknown }).fetch = (input: unknown, init?: unknown) => {
    const destino =
      typeof input === "string"
        ? input
        : input && typeof (input as { url?: unknown }).url === "string"
          ? (input as { url: string }).url
          : String(input);
    if (destinoExterno(destino)) return Promise.reject(erroBloqueio("fetch", destino));
    return original.call(globalThis, input, init);
  };
}

function instalarXhr(): void {
  const ctor = (globalThis as unknown as { XMLHttpRequest?: { prototype: Record<string, unknown> } })
    .XMLHttpRequest;
  const proto = ctor?.prototype;
  if (!proto || typeof proto["open"] !== "function") return;
  const original = proto["open"] as (...args: unknown[]) => unknown;
  estado.originais["xhrOpen"] = original;
  proto["open"] = function (this: unknown, ...args: unknown[]) {
    if (destinoExterno(args[1])) throw erroBloqueio("XMLHttpRequest", args[1]);
    return original.apply(this, args);
  };
}

function instalarWindow(): void {
  const win = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  if (!win || typeof win["open"] !== "function") return;
  const original = win["open"] as (...args: unknown[]) => unknown;
  estado.originais["windowOpen"] = original;
  win["open"] = (...args: unknown[]) => {
    if (destinoExterno(args[0])) throw erroBloqueio("window.open", args[0]);
    return original.apply(win, args);
  };
}

function instalarGeolocalizacao(): void {
  const nav = (globalThis as unknown as { navigator?: { geolocation?: Record<string, unknown> } })
    .navigator;
  const geo = nav?.["geolocation"];
  if (!geo) return;
  for (const metodo of ["getCurrentPosition", "watchPosition"]) {
    const original = geo[metodo];
    if (typeof original !== "function") continue;
    estado.originais[`geo_${metodo}`] = original;
    geo[metodo] = () => {
      throw erroBloqueio("geolocalização", metodo);
    };
  }
}

function instalarBeacon(): void {
  const nav = (globalThis as unknown as { navigator?: { sendBeacon?: unknown } }).navigator;
  if (!nav || typeof nav["sendBeacon"] !== "function") return;
  const original = nav["sendBeacon"] as (...args: unknown[]) => unknown;
  estado.originais["sendBeacon"] = original;
  nav["sendBeacon"] = (...args: unknown[]) => {
    if (destinoExterno(args[0])) throw erroBloqueio("sendBeacon", args[0]);
    return original.apply(nav, args);
  };
}

/** Push, service worker e notificações não devem ser ativados em teste local. */
function instalarPush(): void {
  const nav = (globalThis as unknown as {
    navigator?: { serviceWorker?: { register?: unknown } };
  }).navigator;
  const registro = nav?.["serviceWorker"]?.["register"];
  if (typeof registro === "function") {
    estado.originais["serviceWorkerRegister"] = registro;
    (nav!["serviceWorker"] as Record<string, unknown>)["register"] = () => {
      throw erroBloqueio("service worker", "registro desativado no teste local");
    };
  }

  const notificacao = (globalThis as unknown as {
    Notification?: { requestPermission?: unknown };
  }).Notification;
  if (notificacao && typeof notificacao["requestPermission"] === "function") {
    estado.originais["requestPermission"] = notificacao["requestPermission"];
    notificacao["requestPermission"] = () => {
      throw erroBloqueio("notificação", "permissão desativada no teste local");
    };
  }

  const pushManager = (globalThis as unknown as {
    PushManager?: { prototype?: Record<string, unknown> };
  }).PushManager?.prototype;
  const subscrever = pushManager?.["subscribe"];
  if (pushManager && typeof subscrever === "function") {
    estado.originais["pushSubscribe"] = subscrever;
    pushManager["subscribe"] = () => {
      throw erroBloqueio("push", "inscrição desativada no teste local");
    };
  }
}

/** WebSocket externo (Realtime legado) também é barrado. */
function instalarWebSocket(): void {
  const globalComo = globalThis as unknown as { WebSocket?: new (...args: unknown[]) => unknown };
  const Original = globalComo["WebSocket"];
  if (typeof Original !== "function") return;
  estado.originais["WebSocket"] = Original;
  globalComo["WebSocket"] = class extends (Original as new (...args: unknown[]) => object) {
    constructor(...args: unknown[]) {
      if (destinoExterno(args[0])) throw erroBloqueio("WebSocket", args[0]);
      super(...args);
    }
  } as unknown as new (...args: unknown[]) => unknown;
}

/** Navegação externa via location.assign/replace também é barrada. */
function instalarNavegacao(): void {
  const win = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  const location = win?.["location"] as
    | { assign?: unknown; replace?: unknown; href?: unknown }
    | undefined;
  if (!location) return;
  for (const metodo of ["assign", "replace"] as const) {
    const original = location[metodo];
    if (typeof original !== "function") continue;
    estado.originais[`location_${metodo}`] = original;
    location[metodo] = (...args: unknown[]) => {
      if (destinoExterno(args[0])) throw erroBloqueio(`location.${metodo}`, args[0]);
      return (original as (...a: unknown[]) => unknown).apply(location, args);
    };
  }
}

function instalarCliques(): void {
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (!doc || typeof doc.addEventListener !== "function") return;
  const ouvinte: OuvinteClique = (evento) => {
    const alvo = evento.target as { closest?: (seletor: string) => { getAttribute?: (n: string) => string | null } | null } | null;
    const ancora = alvo?.closest?.("a[href]");
    const href = ancora?.getAttribute?.("href");
    if (href && destinoExterno(href)) {
      evento.preventDefault();
      evento.stopPropagation();
      throw erroBloqueio("link externo", href);
    }
  };
  doc.addEventListener("click", ouvinte, true);
  estado.ouvinteClique = ouvinte;
}

/** Instala a barreira (idempotente). Só atua no modo de teste local. */
export function ativarBarreiraLocal(): void {
  if (!ehModoTesteLocal()) return;
  garantirIsolamentoLocal();
  if (estado.instalada) return;
  estado.instalada = true;
  instalarFetch();
  instalarXhr();
  instalarWindow();
  instalarNavegacao();
  instalarGeolocalizacao();
  instalarBeacon();
  instalarPush();
  instalarWebSocket();
  instalarCliques();
}

/** Restaura os globais. Uso exclusivo de testes. */
export function desativarIsolamentoLocal(): void {
  const globalComo = globalThis as unknown as Record<string, unknown>;
  if (typeof estado.originais["fetch"] === "function") globalComo["fetch"] = estado.originais["fetch"];
  if (typeof estado.originais["xhrOpen"] === "function" && estado.originais["xhrOpen"]) {
    const ctor = globalComo["XMLHttpRequest"] as { prototype: Record<string, unknown> } | undefined;
    if (ctor?.prototype) ctor.prototype["open"] = estado.originais["xhrOpen"];
  }
  if (typeof estado.originais["windowOpen"] === "function") {
    const win = globalComo["window"] as Record<string, unknown> | undefined;
    if (win) win["open"] = estado.originais["windowOpen"];
  }
  const nav = globalComo["navigator"] as Record<string, unknown> | undefined;
  const geo = nav?.["geolocation"] as Record<string, unknown> | undefined;
  for (const metodo of ["getCurrentPosition", "watchPosition"]) {
    const original = estado.originais[`geo_${metodo}`];
    if (typeof original === "function" && geo) geo[metodo] = original;
  }
  if (typeof estado.originais["sendBeacon"] === "function" && nav) {
    nav["sendBeacon"] = estado.originais["sendBeacon"];
  }
  if (typeof estado.originais["serviceWorkerRegister"] === "function") {
    const serviceWorker = (nav?.["serviceWorker"] ?? undefined) as Record<string, unknown> | undefined;
    if (serviceWorker) serviceWorker["register"] = estado.originais["serviceWorkerRegister"];
  }
  if (typeof estado.originais["requestPermission"] === "function") {
    const notificacao = globalComo["Notification"] as Record<string, unknown> | undefined;
    if (notificacao) notificacao["requestPermission"] = estado.originais["requestPermission"];
  }
  if (typeof estado.originais["pushSubscribe"] === "function") {
    const pushManager = globalComo["PushManager"] as { prototype?: Record<string, unknown> } | undefined;
    if (pushManager?.prototype) pushManager.prototype["subscribe"] = estado.originais["pushSubscribe"];
  }
  if (typeof estado.originais["WebSocket"] === "function") {
    globalComo["WebSocket"] = estado.originais["WebSocket"];
  }
  const win = globalComo["window"] as Record<string, unknown> | undefined;
  const location = win?.["location"] as Record<string, unknown> | undefined;
  for (const metodo of ["assign", "replace"] as const) {
    const original = estado.originais[`location_${metodo}`];
    if (typeof original === "function" && location) location[metodo] = original;
  }
  const doc = globalComo["document"] as Document | undefined;
  if (doc && estado.ouvinteClique) doc.removeEventListener("click", estado.ouvinteClique, true);
  estado.originais = {};
  estado.ouvinteClique = null;
  estado.instalada = false;
}

/** Cópia das tentativas bloqueadas, para asserções de ausência de rede. */
export function tentativasIsolamento(): Tentativa[] {
  return estado.tentativas.map((t) => ({ ...t }));
}

export function limparTentativas(): void {
  estado.tentativas = [];
}
