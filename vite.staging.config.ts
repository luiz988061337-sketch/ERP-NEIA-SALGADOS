import type { ConfigEnv, UserConfig } from "vite";
import baseConfig from "./vite.config";

const refsProducao = new Set(["ruioyioynwwwiqbjznoa","iqirsunzgavsuhgyjjsi"]);

export function destinoPreview(env: NodeJS.ProcessEnv) {
  if (env["VERCEL_ENV"] === "production" || env["NEIA_AMBIENTE"] !== "staging") {
    throw new Error("Use a configuração de staging apenas em Preview ou homologação local.");
  }
  const ref = env["NEIA_STAGING_REF_AUTORIZADA"] ?? "";
  const url = `https://${ref}.supabase.co`;
  if (!/^[a-z0-9]{20}$/.test(ref) || refsProducao.has(ref)) {
    throw new Error("A referência de staging deve ser distinta dos projetos produtivos.");
  }
  if (env["VITE_SUPABASE_URL"] !== url || env["SUPABASE_URL"] !== url ||
      (env["VITE_SUPABASE_PROJECT_ID"] && env["VITE_SUPABASE_PROJECT_ID"] !== ref) ||
      (env["SUPABASE_PROJECT_ID"] && env["SUPABASE_PROJECT_ID"] !== ref)) {
    throw new Error("As URLs e a referência da API precisam corresponder ao staging autorizado.");
  }
  const chave = env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(chave) || env["SUPABASE_PUBLISHABLE_KEY"] !== chave) {
    throw new Error("Use a mesma chave publishable de staging no cliente e no servidor.");
  }
  if (env["SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_SERVICE_ROLE_KEY"]) {
    throw new Error("A homologação inicial usa somente usuários autenticados sem chave administrativa.");
  }
  return { url, chave, ref };
}

export default async function (env: ConfigEnv): Promise<UserConfig> {
  const {url,chave,ref} = destinoPreview(process.env);
  const base = typeof baseConfig === "function" ? await baseConfig(env) : await baseConfig;
  return {
    ...base,
    envDir: false,
    envPrefix: "__NEIA_STAGING_SEM_ENV_AUTOMATICO__",
    define: {
      ...base.define,
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(chave),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(ref),
      "import.meta.env.VITE_NEIA_MOTOBOY_RPC": JSON.stringify("1"),
      "import.meta.env.VITE_NEIA_PREVIEW_URL": JSON.stringify(url),
      "import.meta.env.VITE_NEIA_PREVIEW_CHAVE": JSON.stringify(chave),
      "import.meta.env.VITE_FF_CRIACAO_ATOMICA": JSON.stringify("on"),
      "import.meta.env.VITE_FF_RESERVA_ATOMICA": JSON.stringify("off"),
      "import.meta.env.VITE_FF_CONSUMO_RESERVA": JSON.stringify("on"),
      "import.meta.env.VITE_FF_CANCELAMENTO_ATOMICO": JSON.stringify("on"),
      "import.meta.env.VITE_FF_ACEITE_ATENDENTE": JSON.stringify("on"),
      "import.meta.env.VITE_FF_ATRIBUICAO_TX": JSON.stringify("on"),
      "import.meta.env.VITE_FF_LIBERACAO_COZINHA": JSON.stringify("on"),
      "import.meta.env.VITE_FF_CONFERENCIA_FINAL": JSON.stringify("on"),
    },
  };
}
