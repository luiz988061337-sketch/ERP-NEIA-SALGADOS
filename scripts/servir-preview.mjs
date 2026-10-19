/**
 * Serve dist-l1-preview/ em 127.0.0.1, arquivos estáticos apenas.
 * Sem backend, sem banco, sem credenciais, sem proxy. Uso: node scripts/servir-preview.mjs [porta].
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const raiz = join(process.cwd(), "dist-l1-preview");
const porta = Number(process.argv[2] ?? 4173);
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let arq = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
    if (!arq || arq.endsWith("/")) arq += "index.html";
    if (arq.includes("..")) { res.writeHead(400); res.end(); return; }
    let corpo;
    try {
      corpo = await readFile(join(raiz, arq));
    } catch {
      corpo = await readFile(join(raiz, "index.html"));
      arq = "index.html";
    }
    res.writeHead(200, { "Content-Type": tipos[extname(arq)] ?? "application/octet-stream" });
    res.end(corpo);
  } catch {
    res.writeHead(500); res.end();
  }
});

server.on("error", (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if ("code" in e && e.code === "EADDRINUSE") {
    console.error(`PORTA-EM-USO ${porta}`);
    process.exit(2);
  }
  console.error(msg);
  process.exit(1);
});

server.listen(porta, "127.0.0.1", () => console.log(`L1-ISOLADO http://127.0.0.1:${porta}/`));
