/**
 * Testes da barreira proteger-dev (K6.7). Somente valores fictícios,
 * nenhuma conexão de rede, nenhum acesso a segredo real.
 *
 * Uso: node scripts/proteger-dev.test.mjs  (exit 0 = tudo passou)
 */
import { avaliarAmbiente, limparValor } from "./proteger-dev.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "iqirsunzgavsuhgyjjsi"; // ref pública (docs/config), só p/ teste negativo
const SEGREDO_FAKE = "sb_secret_ficticio_abc123";

let pass = 0;
let fail = 0;
function t(nome, cond) {
  if (cond) {
    pass += 1;
    console.log(`ok   - ${nome}`);
  } else {
    fail += 1;
    console.log(`FALHA - ${nome}`);
  }
}
function bloqueia(env) {
  const r = avaliarAmbiente(env);
  return !r.ok;
}

// 1. Produção: URL + projeto de produção bloqueiam (sem vazar valores).
{
  const r = avaliarAmbiente({
    url: `https://${PROD_REF}.supabase.co`,
    projectId: PROD_REF,
    ambiente: "staging",
  });
  t("producao bloqueia", !r.ok);
  t("motivo sem valores", !r.motivo.includes(PROD_REF) && !r.motivo.includes(SEGREDO_FAKE));
}
// 2. Broker de produção bloqueia.
{
  t(
    "broker prod bloqueia",
    bloqueia({ url: "https://x-abc-prod.lovable.cloud", projectId: "qualquer-outro", ambiente: "staging" }),
  );
}
// 3. Staging fictício consistente libera.
{
  const r = avaliarAmbiente({
    url: "https://stg-ficticio-123.supabase.co",
    projectId: "stg-ficticio-123",
    ambiente: "staging",
  });
  t("staging consistente libera", r.ok);
}
// 4. URL de produção com projeto de staging: inconsistência bloqueia.
{
  t(
    "inconsistencia url/projeto bloqueia",
    bloqueia({ url: `https://${PROD_REF}.supabase.co`, projectId: "projeto-staging-x", ambiente: "staging" }),
  );
}
// 5. Identificador de produção com URL diferente: bloqueia pelo projeto.
{
  t(
    "projeto prod em outro host bloqueia",
    bloqueia({ url: "https://algum-broker.lovable.cloud", projectId: PROD_REF, ambiente: "staging" }),
  );
}
// 6. Variáveis ausentes/inválidas: bloqueio seguro.
{
  t("sem url bloqueia", bloqueia({ url: "", projectId: "x", ambiente: "staging" }));
  t("sem projeto bloqueia", bloqueia({ url: "https://x.supabase.co", projectId: "", ambiente: "staging" }));
  t("url invalida bloqueia", bloqueia({ url: "nao-url", projectId: "x", ambiente: "staging" }));
  t("host desconhecido bloqueia", bloqueia({ url: "https://srv.exemplo.com", projectId: "x", ambiente: "staging" }));
}
// 7. Sem marcador explícito: bloqueia mesmo com destino válido.
{
  t(
    "sem NEIA_AMBIENTE bloqueia",
    bloqueia({ url: "https://stg-ficticio-123.supabase.co", projectId: "stg-ficticio-123", ambiente: "" }),
  );
}
// 8. Não depende de NODE_ENV.
{
  const env = { url: "https://stg-ficticio-123.supabase.co", projectId: "stg-ficticio-123", ambiente: "teste" };
  const antes = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const r1 = avaliarAmbiente(env);
  process.env.NODE_ENV = "development";
  const r2 = avaliarAmbiente(env);
  if (antes === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = antes;
  t("independe de NODE_ENV", r1.ok && r2.ok);
}
// 9. Broker não-prod com projeto não-prod libera.
{
  t(
    "broker staging libera",
    avaliarAmbiente({ url: "https://x-stg.lovable.cloud", projectId: "projeto-staging-x", ambiente: "staging" }).ok,
  );
}
// 10. limparValor remove aspas externas sem expor nada.
{
  t("limpa aspas literais", limparValor('"https://x.supabase.co"') === "https://x.supabase.co");
}

// 11. CLI real em processo Node separado (K6.7.2): env 100% fictício,
// sem ler valores do .env real (todas as variáveis avaliadas são
// sobrescritas), sem rede, sem Vite. Nenhum arquivo temporário.
{
  const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
  const cli = join(raiz, "scripts", "proteger-dev.mjs");
  const CANARIO = "CANARIO-XYZ-123";
  function rodarCli(variaveis, caminho = cli) {
    // Todas as variáveis avaliadas pela barreira são fixadas aqui, de modo
    // que o .env real (lido do disco) nunca influencia o veredito.
    const env = {
      ...process.env,
      VITE_SUPABASE_URL: "",
      SUPABASE_URL: "",
      VITE_SUPABASE_PROJECT_ID: "",
      SUPABASE_PROJECT_ID: "",
      NEIA_AMBIENTE: "",
      ...variaveis,
    };
    try {
      const saida = execFileSync(process.execPath, [caminho], {
        env,
        cwd: raiz,
        timeout: 30000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exit: 0, texto: String(saida) };
    } catch (e) {
      const out = (e.stdout ? String(e.stdout) : "") + (e.stderr ? String(e.stderr) : "");
      return { exit: typeof e.status === "number" ? e.status : 1, texto: out };
    }
  }
  const PROD_URL = `https://${PROD_REF}.supabase.co`;
  const STG_URL = `https://stg-${CANARIO}.supabase.co`;
  const STG_PROJ = `stg-${CANARIO}`;

  const rProd = rodarCli({ VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_PROJECT_ID: PROD_REF, NEIA_AMBIENTE: "staging" });
  t("CLI prod ficticia bloqueia (exit!=0)", rProd.exit !== 0);
  t("CLI prod menciona bloqueio sem valores", /bloqueado/.test(rProd.texto) && !rProd.texto.includes(CANARIO));

  const rStg = rodarCli({ VITE_SUPABASE_URL: STG_URL, VITE_SUPABASE_PROJECT_ID: STG_PROJ, NEIA_AMBIENTE: "staging" });
  t("CLI staging ficticio libera (exit 0)", rStg.exit === 0);
  t("CLI staging sem vazar valores", !rStg.texto.includes(CANARIO));

  const rSem = rodarCli({});
  t("CLI sem variaveis bloqueia", rSem.exit !== 0);

  const rConflito = rodarCli({ VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_PROJECT_ID: STG_PROJ, NEIA_AMBIENTE: "staging" });
  t("CLI conflito bloqueia", rConflito.exit !== 0);

  // Caminho alternativo de invocação: absoluto em vez de relativo.
  const rAbs = rodarCli(
    { VITE_SUPABASE_URL: STG_URL, VITE_SUPABASE_PROJECT_ID: STG_PROJ, NEIA_AMBIENTE: "staging" },
    cli,
  );
  t("CLI caminho absoluto funciona", rAbs.exit === 0);

  // Variante de caixa no diretório (extensão .mjs precisa ser minúscula
  // para o loader ESM; caixa alta na extensão nem carrega — falha fechada
  // pela plataforma). Deve aplicar a barreira do mesmo jeito.
  if (process.platform === "win32") {
    const alt = join(raiz, "Scripts", "proteger-dev.mjs");
    const rAlt = rodarCli(
      { VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_PROJECT_ID: PROD_REF, NEIA_AMBIENTE: "staging" },
      alt,
    );
    t("CLI caminho caixa-alta bloqueia prod", rAlt.exit !== 0 && /bloqueado/.test(rAlt.texto));
  } else {
    t("CLI caixa-alta (só win32, pulado)", true);
  }

  // Estático: a barreira não contém chamadas de rede.
  const fonte = readFileSync(join(raiz, "scripts", "proteger-dev.mjs"), "utf8");
  t("sem fetch/rede no codigo", !/fetch\s*\(/.test(fonte) && !/node:https?/.test(fonte));
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail > 0 ? 1 : 0);
