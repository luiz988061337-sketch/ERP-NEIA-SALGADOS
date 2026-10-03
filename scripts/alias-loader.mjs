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
export async function load(url, context, next) {
  if (ASSET.test(url)) {
    return { format: "module", source: "export default { url: '' };", shortCircuit: true };
  }
  return next(url, context);
}
