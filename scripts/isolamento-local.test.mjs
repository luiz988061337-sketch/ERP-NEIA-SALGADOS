/**
 * FUNC-01-B1 — provas locais de isolamento.
 *
 * Uso: node --experimental-transform-types scripts/isolamento-local.test.mjs
 * Deve ser executado com o preload `visual-aprovados-sem-rede.mjs`.
 * Nenhum valor secreto é lido ou impresso; todos os destinos são fictícios.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

const iso = await import("@/lib/isolamento-local.ts");

let pass = 0;
let fail = 0;
function t(nome, condicao) {
  if (condicao) {
    pass += 1;
    console.log(`ok   - ${nome}`);
  } else {
    fail += 1;
    console.log(`FALHOU - ${nome}`);
  }
}
function lanca(fn, trecho) {
  try {
    fn();
    return false;
  } catch (erro) {
    return String(erro?.message ?? erro).includes(trecho);
  }
}
async function rejeita(promise, trecho) {
  try {
    await promise;
    return false;
  } catch (erro) {
    return String(erro?.message ?? erro).includes(trecho);
  }
}
function definir(objeto, chave, valor) {
  Object.defineProperty(objeto, chave, { value: valor, configurable: true, writable: true });
}

const PROD = "ruioyioynwwwiqbjznoa";
const SEGURANCA = {
  VITE_DEMO_PREVIEW: "1",
  VITE_NEIA_AMBIENTE: "teste",
  NEIA_AMBIENTE: "teste",
  VITE_SUPABASE_URL: "https://visual-demo.invalid",
  SUPABASE_URL: "https://visual-demo.invalid",
  VITE_SUPABASE_PROJECT_ID: "visual-demo",
  SUPABASE_PROJECT_ID: "visual-demo",
  VITE_SUPABASE_PUBLISHABLE_KEY: "demo-nao-e-credencial",
  SUPABASE_PUBLISHABLE_KEY: "demo-nao-e-credencial",
  VERCEL: "0",
};
const com = (sobre) => ({ ...SEGURANCA, ...sobre });

// ---------------------------------------------------------------------------
// 1. Validação fail-closed da configuração
// ---------------------------------------------------------------------------
t("config segura é aceita", iso.validarConfiguracaoIsolamento(SEGURANCA).ok === true);
t("demo sozinha não caracteriza teste", iso.ehModoTesteLocal(com({ NEIA_AMBIENTE: "", VITE_NEIA_AMBIENTE: "" })) === false);
t("marcador SSR também habilita", iso.ehModoTesteLocal(com({ VITE_NEIA_AMBIENTE: "" })) === true);
t("marcador cliente também habilita", iso.ehModoTesteLocal(com({ NEIA_AMBIENTE: "" })) === true);
t("produção explícita é rejeitada", iso.validarConfiguracaoIsolamento(com({ VERCEL: "1" })).ok === false);
t("VERCEL_ENV production é rejeitada", iso.validarConfiguracaoIsolamento(com({ VERCEL: "0", VERCEL_ENV: "production" })).ok === false);
t("URL do projeto produtivo é rejeitada", iso.validarConfiguracaoIsolamento(com({ VITE_SUPABASE_URL: `https://${PROD}.supabase.co` })).ok === false);
t("qualquer backend Supabase é rejeitado", iso.validarConfiguracaoIsolamento(com({ SUPABASE_URL: "https://outro-exemplo.supabase.co" })).ok === false);
t("broker Lovable é rejeitado", iso.validarConfiguracaoIsolamento(com({ SUPABASE_URL: "https://app.lovable.cloud" })).ok === false);
t("service role é rejeitada", iso.validarConfiguracaoIsolamento(com({ SUPABASE_SERVICE_ROLE_KEY: "fake" })).ok === false);
t("chave secreta na publicável é rejeitada", iso.validarConfiguracaoIsolamento(com({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fake" })).ok === false);
t("projeto simulado inválido é rejeitado", iso.validarConfiguracaoIsolamento(com({ SUPABASE_PROJECT_ID: "outro" })).ok === false);
{
  const r = iso.validarConfiguracaoIsolamento(com({ VITE_SUPABASE_URL: `https://${PROD}.supabase.co` }));
  const unido = r.motivos.join(" ");
  t("motivos não revelam valores", !unido.includes(PROD) && unido.includes("VITE_SUPABASE_URL"));
}

// ---------------------------------------------------------------------------
// 2. Instalação inerte fora do modo de teste
// ---------------------------------------------------------------------------
{
  const antes = globalThis.fetch;
  Object.assign(process.env, SEGURANCA, { VITE_DEMO_PREVIEW: "0", NEIA_AMBIENTE: "preview", VITE_NEIA_AMBIENTE: "preview" });
  iso.ativarBarreiraLocal();
  t("inerte quando a flag demo está desligada", globalThis.fetch === antes);
  Object.assign(process.env, SEGURANCA);
}

// ---------------------------------------------------------------------------
// 3. Barreira de efeitos externos
// ---------------------------------------------------------------------------
const stubs = {};
const listeners = new Map();
stubs.fetch = async (input) => ({ ok: true, input: String(input) });
stubs.xhrOpen = function open(_metodo, url) {
  this.url = String(url);
  return true;
};
stubs.window = {
  open: (url) => ({ aberta: String(url) }),
  location: {
    origin: "http://localhost:5173",
    href: "http://localhost:5173/",
  },
  addEventListener: (tipo, fn) => listeners.set(`win:${tipo}`, fn),
  removeEventListener: (tipo) => listeners.delete(`win:${tipo}`),
};
stubs.document = {
  addEventListener: (tipo, fn) => listeners.set(`doc:${tipo}`, fn),
  removeEventListener: (tipo) => listeners.delete(`doc:${tipo}`),
};
stubs.navigator = {
  geolocation: {
    getCurrentPosition: () => ({ posicao: true }),
    watchPosition: () => 1,
    clearWatch: () => undefined,
  },
  sendBeacon: () => true,
  serviceWorker: { register: async () => ({ registro: true }) },
  userAgent: "teste-local",
};
stubs.Notification = { requestPermission: async () => "granted" };
stubs.PushManager = class {
  subscribe() {
    return Promise.resolve({ endpoint: "local" });
  }
};
stubs.WebSocket = class {
  constructor(url) {
    this.url = String(url);
  }
};

definir(globalThis, "fetch", stubs.fetch);
definir(globalThis, "window", stubs.window);
definir(globalThis, "document", stubs.document);
definir(globalThis, "navigator", stubs.navigator);
definir(globalThis, "Notification", stubs.Notification);
definir(globalThis, "PushManager", stubs.PushManager);
definir(globalThis, "WebSocket", stubs.WebSocket);
definir(globalThis, "XMLHttpRequest", class {
  open(...args) {
    return stubs.xhrOpen.apply(this, args);
  }
});

const chamadosFetch = [];
globalThis.fetch = async (input) => {
  chamadosFetch.push(String(input));
  return { ok: true };
};
Object.assign(process.env, SEGURANCA);
iso.limparTentativas();
iso.ativarBarreiraLocal();

t("fetch externo é rejeitado", await rejeita(fetch("https://app.supabase.co/rest/v1/pedidos"), "ISOLAMENTO_LOCAL"));
t("fetch externo não chega ao transporte", chamadosFetch.length === 0);
await fetch("http://localhost:5173/api/versao");
t("fetch same-origin é permitido", chamadosFetch.length === 1);
t("XHR externo é bloqueado", lanca(() => new XMLHttpRequest().open("GET", "https://wa.me/5511999999999"), "ISOLAMENTO_LOCAL"));
t("window.open externo é bloqueado", lanca(() => window.open("https://wa.me/5511999999999"), "ISOLAMENTO_LOCAL"));
t("nenhuma falha de instalação foi registrada", Array.isArray(iso.falhasIsolamento()) && iso.falhasIsolamento().length === 0);
t("geolocalização é bloqueada", lanca(() => navigator.geolocation.getCurrentPosition(() => {}), "ISOLAMENTO_LOCAL"));
t("watchPosition é bloqueado", lanca(() => navigator.geolocation.watchPosition(() => {}), "ISOLAMENTO_LOCAL"));
t("sendBeacon externo é bloqueado", lanca(() => navigator.sendBeacon("https://api.exemplo.com", "x"), "ISOLAMENTO_LOCAL"));
t("service worker é bloqueado", lanca(() => navigator.serviceWorker.register("/sw-neia.js"), "ISOLAMENTO_LOCAL"));
t("permissão de notificação é bloqueada", (() => {
  try {
    Notification.requestPermission();
    return false;
  } catch (e) {
    return String(e?.message ?? "").includes("ISOLAMENTO_LOCAL");
  }
})());
t("inscrição push é bloqueada", lanca(() => new PushManager().subscribe(), "ISOLAMENTO_LOCAL"));
t("WebSocket externo é bloqueado", lanca(() => new WebSocket("wss://app.supabase.co/realtime"), "ISOLAMENTO_LOCAL"));
{
  const evento = {
    target: { closest: () => ({ getAttribute: () => "https://wa.me/5511999999999" }) },
    preventDefault() {
      this.impedido = true;
    },
    stopPropagation() {
      this.parado = true;
    },
  };
  const ouvinte = listeners.get("doc:click") ?? listeners.get("click");
  let bloqueou = false;
  try {
    ouvinte?.(evento);
  } catch (erro) {
    bloqueou = String(erro?.message ?? "").includes("ISOLAMENTO_LOCAL");
  }
  t("link externo é bloqueado no clique", bloqueou);
  t("clique externo é impedido", evento.impedido === true && evento.parado === true);
}
t("tentativas são registradas sem valores sensíveis", iso.tentativasIsolamento().length >= 8 && iso.tentativasIsolamento().every((x) => x.destino && x.tipo));

iso.desativarIsolamentoLocal();
t("desinstalação restaura fetch", globalThis.fetch !== stubs.fetch && typeof globalThis.fetch === "function");

// ---------------------------------------------------------------------------
// 4. Fail-closed com configuração insegura
// ---------------------------------------------------------------------------
{
  Object.assign(process.env, SEGURANCA, { VITE_SUPABASE_URL: `https://${PROD}.supabase.co` });
  t("config insegura impede a instalação", lanca(() => iso.ativarBarreiraLocal(), "ISOLAMENTO_LOCAL"));
  t("config insegura não instala barreira", globalThis.fetch !== stubs.fetch);
  Object.assign(process.env, SEGURANCA);
  iso.desativarIsolamentoLocal();
}

// ---------------------------------------------------------------------------
// 5. Cliente Supabase em modo demo não toca a rede
// ---------------------------------------------------------------------------
{
  Object.assign(process.env, SEGURANCA);
  iso.limparTentativas();
  const { supabase } = await import("@/integrations/supabase/client.ts");
  const antes = chamadosFetch.length;
  const leitura = await supabase.from("pedidos").select("*").limit(1);
  const rpc = await supabase.rpc("consultar_localizacao_entrega", { p_pedido_id: "demo" });
  t("cliente demo responde leitura sem rede", leitura.error === null && Array.isArray(leitura.data));
  t("cliente demo responde RPC sem rede", rpc.error === null);
  t("cliente demo não chamou fetch", chamadosFetch.length === antes);
  t("cliente demo não gerou tentativas na barreira", iso.tentativasIsolamento().length === 0);
}

// ---------------------------------------------------------------------------
// 6. Fontes: clientes e efeitos continuam com desvio explícito para demo
// ---------------------------------------------------------------------------
const fonte = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
t("cliente navegador desvia para demo", fonte("src/integrations/supabase/client.ts").includes("if (ehModoDemo()) return criarClienteDemo();"));
t("cliente SSR desvia para demo", fonte("src/integrations/supabase/client.server.ts").includes("if (ehModoDemo()) return criarClienteDemo();"));
t("middleware de auth desvia para demo", fonte("src/integrations/supabase/auth-middleware.ts").includes("if (ehModoDemo())"));
t("MCP desvia para demo", fonte("src/lib/mcp/supabase.ts").includes("if (ehModoDemo()) return criarClienteDemo();"));
t("WhatsApp automático permanece desligado", /WHATSAPP_AUTOMATICO_ENABLED = false/.test(fonte("src/lib/whatsapp-api.ts")));
t("Pix automático permanece desligado", /WHATSAPP_AUTOMATICO_ENABLED = false/.test(fonte("src/lib/whatsapp-api.ts")) && !/urlQrPix\(/.test(fonte("src/routes/checkout.tsx")));
t("Mapa desativa em demo", /ehModoDemo\(\)/.test(fonte("src/components/map-view.tsx")));
t("ViaCEP desativa em demo", /ehModoDemo\(\)/.test(fonte("src/lib/cep.ts")));
t("Fiscal desativa em demo", /ehModoDemo\(\)/.test(fonte("src/routes/fiscal.tsx")));

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
