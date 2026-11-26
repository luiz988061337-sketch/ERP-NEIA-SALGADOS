/**
 * Barreira obrigatória de destino dos bancos (P0 de 26/11/2026).
 *
 * Toda operação de escrita/migração remota precisa passar por
 * `avaliarOperacao()` (ou pelo CLI `validar-destino.mjs`). A barreira:
 *
 *  1. exige o destino declarado explicitamente (`--project-ref` ou
 *     `NEIA_PROJETO_ALVO`); `supabase --linked` e o `.env` NÃO são autoridade;
 *  2. bloqueia produção, destino desconhecido e destino divergente;
 *  3. bloqueia quando a configuração efetiva (ambiente + `.env`) aponta para
 *     produção, para impedir fallback silencioso;
 *  4. falha fechado: qualquer dúvida interrompe a operação.
 *
 * Nunca imprime valores de chaves, tokens ou senhas. As referências de projeto
 * citadas aqui são identificadores públicos, não segredos.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Projeto de homologação/desenvolvimento autorizado. */
export const PROJETO_HOMOLOGACAO = "lflzlcqinarrcgncafol";
/** Backend de produção protegido. */
export const PROJETO_PRODUCAO = "ruioyioynwwwiqbjznoa";
/** Projetos de produção/legado que nunca podem receber escrita local. */
export const PROJETOS_PRODUCAO = [PROJETO_PRODUCAO, "iqirsunzgavsuhgyjjsi"];

const BROKER_PROD = "-prod.lovable.cloud";
const PADRAO_REF = /^[a-z0-9]{20}$/;

/** Raiz do repositório (este arquivo fica em `scripts/`). */
export const RAIZ_PROJETO = dirname(dirname(fileURLToPath(import.meta.url)));

/** Remove aspas externas e espaços, sem alterar o valor interno. */
export function limparValor(valor) {
  let s = String(valor ?? "").trim();
  if (s.length >= 2) {
    const a = s.charCodeAt(0);
    const b = s.charCodeAt(s.length - 1);
    if ((a === 34 && b === 34) || (a === 39 && b === 39)) s = s.slice(1, -1).trim();
  }
  return s;
}

/** Verdadeiro quando o valor é uma referência de projeto de produção. */
export function ehProjetoProducao(valor) {
  const v = limparValor(valor).toLowerCase();
  if (!v) return false;
  return PROJETOS_PRODUCAO.includes(v);
}

/** Extrai a referência de um host `https://<ref>.supabase.co` (ou ""). */
export function extrairRefDaUrl(url) {
  const bruto = limparValor(url);
  if (!bruto) return "";
  try {
    const host = new URL(bruto).hostname.toLowerCase();
    if (host.endsWith(".supabase.co")) return host.slice(0, -".supabase.co".length);
    return "";
  } catch {
    return "";
  }
}

function hostDaUrl(url) {
  try {
    return new URL(limparValor(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Hosts locais (Supabase local). Nunca recebem escrita remota por engano. */
export function ehHostLocal(url) {
  const host = hostDaUrl(url);
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** Lê um `.env` simples (sem interpolação). Devolve mapa nome → valor. */
export function lerEnvArquivo(raiz = RAIZ_PROJETO, nomeArquivo = ".env") {
  const mapa = {};
  try {
    const arq = join(raiz, nomeArquivo);
    if (!existsSync(arq)) return mapa;
    for (const linha of readFileSync(arq, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
      if (m && mapa[m[1]] === undefined) mapa[m[1]] = m[2];
    }
  } catch {
    // Sem arquivo legível: tratado como ausente (fail-closed adiante).
  }
  return mapa;
}

/**
 * Resolve a configuração efetiva de Supabase, com a mesma precedência dos
 * scripts atuais: variáveis de ambiente > `.env`.
 */
export function carregarConfiguracao(raiz = RAIZ_PROJETO, env = process.env) {
  const arquivo = lerEnvArquivo(raiz);
  const efetivo = { ...arquivo, ...env };
  const url = limparValor(efetivo.VITE_SUPABASE_URL) || limparValor(efetivo.SUPABASE_URL) || "";
  const projeto =
    limparValor(efetivo.VITE_SUPABASE_PROJECT_ID) || limparValor(efetivo.SUPABASE_PROJECT_ID) || "";
  const ambiente = limparValor(efetivo.NEIA_AMBIENTE).toLowerCase();
  return { url, projeto, ambiente };
}

/** Lê o destino declarado nos argumentos (nunca de `.env`/`--linked`). */
export function lerAlvoDosArgumentos(argv = process.argv.slice(2), env = process.env) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] ?? "");
    if (arg === "--project-ref") return limparValor(argv[i + 1]).toLowerCase();
    if (arg.startsWith("--project-ref=")) {
      return limparValor(arg.slice("--project-ref=".length)).toLowerCase();
    }
  }
  const declarado =
    limparValor(env.NEIA_PROJETO_ALVO) || limparValor(env.SUPABASE_PROJECT_REF) || "";
  return declarado.toLowerCase();
}

const MOTIVOS = {
  destino_nao_declarado:
    "destino não declarado. Informe --project-ref <ref> (ou NEIA_PROJETO_ALVO). " +
    "--linked e .env não são aceitos como autoridade.",
  destino_invalido: "referência de projeto inválida (formato esperado: 20 caracteres a-z/0-9).",
  producao: "destino de PRODUÇÃO detectado. Operação bloqueada antes de qualquer conexão.",
  fora_de_homologacao:
    "destino não autorizado. Somente o projeto de homologação pode receber escrita/migração.",
  configuracao_ausente:
    "configuração de Supabase ausente ou incompleta: impossível confirmar o destino efetivo.",
  configuracao_producao:
    "a configuração efetiva (ambiente/.env) aponta para produção. " +
    "Corrija o ambiente antes de executar; fallback para produção é proibido.",
  divergencia:
    "destino divergente: a URL/projeto efetivo não corresponde ao --project-ref informado.",
  url_invalida: "URL de Supabase inválida na configuração efetiva.",
  destino_desconhecido: "destino desconhecido: URL fora dos domínios verificáveis (*.supabase.co).",
};

function bloquear(codigo) {
  return { ok: false, codigo, motivo: MOTIVOS[codigo] ?? "operação bloqueada." };
}

/**
 * Avalia uma operação de escrita/migração.
 *
 * @param {object} opcoes
 * @param {string} opcoes.alvo        Referência declarada explicitamente.
 * @param {string} [opcoes.raiz]      Raiz do projeto (para ler `.env`).
 * @param {object} [opcoes.env]       Ambiente do processo (padrão: process.env).
 * @returns {{ok: boolean, codigo?: string, motivo: string, projeto?: string}}
 */
export function avaliarOperacao({ alvo, raiz = RAIZ_PROJETO, env = process.env } = {}) {
  const ref = limparValor(alvo).toLowerCase();

  if (!ref) return bloquear("destino_nao_declarado");
  if (!PADRAO_REF.test(ref)) return bloquear("destino_invalido");
  if (ehProjetoProducao(ref)) return bloquear("producao");
  if (ref !== PROJETO_HOMOLOGACAO) return bloquear("fora_de_homologacao");

  const { url, projeto } = carregarConfiguracao(raiz, env);
  if (!url && !projeto) return bloquear("configuracao_ausente");

  const refUrl = extrairRefDaUrl(url);
  const host = hostDaUrl(url);

  if (url) {
    // Escrita remota autorizada apenas no projeto de homologação: banco local
    // também é recusado, para nunca confundir "local" com "homologação".
    if (ehHostLocal(url)) return bloquear("fora_de_homologacao");
    if (!refUrl) {
      if (!host) return bloquear("url_invalida");
      if (host.endsWith(BROKER_PROD)) return bloquear("configuracao_producao");
      return bloquear("destino_desconhecido");
    }
  }

  if (
    ehProjetoProducao(projeto) ||
    ehProjetoProducao(refUrl) ||
    (host && host.endsWith(BROKER_PROD))
  ) {
    return bloquear("configuracao_producao");
  }

  if (projeto && projeto.toLowerCase() !== ref) return bloquear("divergencia");
  if (refUrl && refUrl !== ref) return bloquear("divergencia");

  return {
    ok: true,
    projeto: ref,
    motivo: "destino autorizado: homologação, configuração coerente.",
  };
}

/** Conveniência: `true` quando a operação pode prosseguir. */
export function destinoAutorizado(opcoes) {
  return avaliarOperacao(opcoes).ok;
}

/** Caminho absoluto do script atual, para detectar execução direta. */
export function ehExecucaoDireta(urlModulo, argv1 = process.argv[1]) {
  try {
    if (!argv1) return false;
    const normalizar = (p) => {
      let s = resolve(p);
      if (process.platform === "win32") s = s.toLowerCase();
      return s;
    };
    return normalizar(argv1) === normalizar(fileURLToPath(urlModulo));
  } catch {
    return false;
  }
}
