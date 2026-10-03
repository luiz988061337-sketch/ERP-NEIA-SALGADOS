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
