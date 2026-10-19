import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.cwd());

export async function resolve(specifier, context, next) {
  let s = specifier;
  if (s.startsWith("@/")) {
    s = pathToFileURL(path.join(root, "src", s.slice(2))).href;
  }
  try {
    return await next(s, context);
  } catch (e) {
    for (const t of [s + ".ts", s + ".tsx", s + "/index.ts"]) {
      try {
        return await next(t, context);
      } catch {
        /* tenta próxima */
      }
    }
    throw e;
  }
}

// Importações de asset (foto/ícone/CSS) não existem no Node: vira módulo vazio
// para conseguir testar a lógica de módulos que importam imagem.
const ASSET = /\.(jpe?g|png|webp|avif|gif|svg|css|scss)$/i;

// ---------------------------------------------------------------------------
// STUB DE `import.meta.env` PARA OS TESTES LOCAIS (Node)
// ---------------------------------------------------------------------------
// No build (Vite), `import.meta.env` é substituído em tempo de compilação por
// literais — é isso que permite eliminar o código morto do caminho legado.
//
// No Node não existe `import.meta.env`. Para que os módulos testáveis
// continuem usando o acesso DIRETO (obrigatório para o define do Vite),
// este loader reescreve `import.meta.env` para `globalThis.__vite_env_stub__`
// APENAS no ambiente de teste.
//
// O stub é preenchido pelo helper `scripts/env-teste.mjs`; por padrão é um
// objeto vazio (=> todas as flags de build ficam desligadas, que é o
// comportamento seguro de qualquer build que não seja o de corte).
export async function load(url, context, next) {
  if (ASSET.test(url)) {
    return { format: "module", source: "export default { url: '' };", shortCircuit: true };
  }
  const result = await next(url, context);
  const reescrever = (texto) =>
    texto.replace(/\bimport\.meta\.env\b/g, "(globalThis.__vite_env_stub__ ?? {})");
  if (typeof result?.source === "string" && /\.(ts|tsx)$/.test(url)) {
    return { ...result, source: reescrever(result.source) };
  }
  if (result?.source && typeof result.source !== "string" && /\.(ts|tsx)$/.test(url)) {
    const texto = new TextDecoder().decode(result.source);
    return { ...result, source: reescrever(texto) };
  }
  return result;
}
