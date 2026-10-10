/**
 * Barreira local contra escritas acidentais em produção (K6.7).
 *
 * Uso: `node scripts/proteger-dev.mjs` antes de subir o app local.
 * Exit 0 = destino fora de produção (pode iniciar); exit 1/2 = bloqueado.
 *
 * Somente desenvolvimento local: o site publicado NÃO executa scripts npm,
 * então esta barreira nunca afeta produção. Nunca imprime valores de
 * variáveis — apenas nomes. Não faz nenhuma conexão de rede.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Referência pública do projeto de produção (supabase/config.toml, docs e
// migrations já citam este identificador; NÃO é segredo, é só um nome).
const PROJETO_PRODUCAO = "iqirsunzgavsuhgyjjsi";
// Padrão de host do broker de produção (genérico, sem valor específico).
const BROKER_PROD_PADRAO = "-prod.lovable.cloud";
const MARCADORES_PERMITIDOS = ["local", "desenvolvimento", "staging", "homologacao", "teste"];

const NOMES_URL = ["VITE_SUPABASE_URL", "SUPABASE_URL"];
const NOMES_PROJETO = ["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"];

/** Remove aspas externas literais e espaços (sem alterar o valor interno). */
export function limparValor(v) {
  let s = String(v ?? "").trim();
  if (s.length >= 2) {
    const a = s.charCodeAt(0);
    const b = s.charCodeAt(s.length - 1);
    if ((a === 34 && b === 34) || (a === 39 && b === 39)) s = s.slice(1, -1).trim();
  }
  return s;
}

function pegar(objs, nomes) {
  for (const n of nomes) {
    const v = limparValor(objs[n]);
    if (v) return v;
  }
  return "";
}

/** Lê URL/projeto/marcador do .env + ambiente do processo. Nunca imprime valores. */
export function carregarEnv(raiz) {
  const deArquivo = {};
  try {
    const arq = join(raiz, ".env");
    if (existsSync(arq)) {
      for (const linha of readFileSync(arq, "utf8").split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
        if (m && deArquivo[m[1]] === undefined) deArquivo[m[1]] = m[2];
      }
    }
  } catch {
    // sem .env legível: trata como ausente (fail-closed abaixo)
  }
  const fonte = { ...deArquivo, ...process.env };
  return {
    url: pegar(fonte, NOMES_URL),
    projectId: pegar(fonte, NOMES_PROJETO),
    ambiente: limparValor(fonte.NEIA_AMBIENTE),
  };
}

/**
 * Avalia o destino. Retorna { ok, motivo } — motivo cita SOMENTE nomes
 * de variáveis, nunca valores. Fail-closed: qualquer dúvida bloqueia.
 * Não depende de NODE_ENV.
 */
export function avaliarAmbiente({ url, projectId, ambiente }) {
  const falta = [];
  if (!url) falta.push("VITE_SUPABASE_URL");
  if (!projectId) falta.push("VITE_SUPABASE_PROJECT_ID");
  if (falta.length > 0) {
    return {
      ok: false,
      motivo: `configuração ausente (${falta.join(" / ")}). Defina URL e projeto de staging/desenvolvimento e rode de novo.`,
    };
  }
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, motivo: "VITE_SUPABASE_URL inválida. Confira a URL no ambiente dedicado (sem produção)." };
  }
  if (host.endsWith(".supabase.co")) {
    const sub = host.split(".")[0];
    // Hostnames são insensíveis a caixa; refs de projeto, minúsculas.
    if (String(projectId).toLowerCase() !== sub) {
      return {
        ok: false,
        motivo:
          "inconsistência entre VITE_SUPABASE_URL e VITE_SUPABASE_PROJECT_ID (host não corresponde ao projeto). Ajuste o par no ambiente dedicado.",
      };
    }
  }
  // Comparação em minúsculas: caixa alta não pode esconder produção.
  if (String(projectId).toLowerCase() === PROJETO_PRODUCAO || host.endsWith(BROKER_PROD_PADRAO)) {
    return {
      ok: false,
      motivo:
        "destino de PRODUÇÃO detectado (VITE_SUPABASE_URL/VITE_SUPABASE_PROJECT_ID). O servidor local não inicia contra produção. Use um projeto de staging com variáveis próprias.",
    };
  }
  const marcador = String(ambiente ?? "").toLowerCase();
  if (!MARCADORES_PERMITIDOS.includes(marcador)) {
    return {
      ok: false,
      motivo:
        "ambiente não declarado (NEIA_AMBIENTE). Defina NEIA_AMBIENTE=staging (ou desenvolvimento/homologacao/local/teste) junto a URL e projeto fora de produção.",
    };
  }
  if (!(host.endsWith(".supabase.co") || host.endsWith(".lovable.cloud"))) {
    return {
      ok: false,
      motivo:
        "destino desconhecido (VITE_SUPABASE_URL fora dos domínios verificáveis). Aponte para staging conhecido ou revise a configuração.",
    };
  }
  return { ok: true, motivo: "destino fora de produção." };
}

/**
 * Detecta execução direta sem igualdade estrita de caminho (K6.7.2):
 * resolve contra o cwd e normaliza caixa no Windows (FS insensível).
 * Limitação documentada: atalhos exóticos fora do FS normal (links
 * simbólicos encadeados, substituições de unidade não resolvidas pelo
 * resolve) podem não equivaler — nesses casos raros, prefira invocar
 * pelo caminho canônico. Fail-closed é garantido pela avaliação, não
 * por esta detecção: se não houver certeza de execução direta, o bloco
 * CLI apenas não roda (nunca libera nada implicitamente).
 */
function mesmoArquivo(a, b) {
  try {
    if (!a || !b) return false;
    const norm = (p) => {
      let s = resolve(p);
      if (process.platform === "win32") s = s.toLowerCase();
      return s;
    };
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}

const ehPrincipal = (() => {
  try {
    return mesmoArquivo(process.argv[1], fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (ehPrincipal && process.env.__LOVABLE_PROJECT_ID) {
  // Prévia do editor Lovable: só existe um backend, então a barreira não se aplica aqui.
  process.exit(0);
}
if (ehPrincipal) {
  const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
  const r = avaliarAmbiente(carregarEnv(raiz));
  if (r.ok) {
    console.log("✔ ambiente validado: destino fora de produção. Liberando início local.");
    process.exit(0);
  }
  console.error(`✖ dev bloqueado: ${r.motivo}`);
  console.error("  Nada foi iniciado e nenhuma conexão foi feita. Ajuste o ambiente e tente de novo.");
  process.exit(1);
}
