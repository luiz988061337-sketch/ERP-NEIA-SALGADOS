/**
 * Sonda o banco real via PostgREST (SOMENTE LEITURA, chave publicável).
 * Diz, por migration, se o objeto principal existe — para aplicar no
 * SQL Editor só o que falta (ou o PASSO-4 inteiro, que é idempotente).
 *
 * Uso (raiz do projeto, com .env): node scripts/verificar-banco.mjs
 * Interpretação:
 *   2xx          → existe (mesmo vazio)
 *   401/403      → existe, mas sem permissão p/ anônimo (tabelas staff)
 *   404/"does not exist" → NÃO existe (migration pendente)
 *
 * Nunca imprime segredos: só status + trechos de erro do PostgREST.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function carregarEnv() {
  const env = {};
  const arq = join(process.cwd(), ".env");
  if (existsSync(arq)) {
    for (const linha of readFileSync(arq, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = carregarEnv();
const URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
if (!URL || !KEY) {
  console.error("Sem URL/chave no .env — copie .env.example para .env e preencha.");
  process.exit(2);
}

// [migration, tabela, coluna?]
const SONDAS = [
  ["0015", "hero_carousel"],
  ["0016", "calculadora_config"],
  ["0017", "motoboys"],
  ["0018", "pedidos", "tipo_entrega"],
  ["0019", "calculadora_config", "zap_contato"],
  ["0021", "loja_config"],
  ["0022", "pedidos", "pagamento_status"],
  ["0023", "horario_config"],
  ["0023", "lotes"],
  ["0024", "rotas_entrega"],
  ["0024", "pedidos", "atraso_motivo"],
  ["0025", "fila_impressao"],
  ["0025", "pedidos", "impresso"],
  ["0026", "fila_fritura"],
  ["0027", "pedido_lembretes"],
  ["0028", "ajuda_artigos"],
  ["0029", "loja_config", "pix_chave"],
  ["0030", "reservas_estoque"],
  ["0032", "motoboys", "user_id"],
  ["0033", "empresa_fiscal"],
  ["0033", "documentos_fiscais"],
  ["0033", "produtos", "ncm"],
  ["0033", "pedidos", "cpf_cnpj"],
  ["0035", "loja_config", "instagram"],
  ["0036", "produtos", "tempo_fritura_s"],
  ["0037", "pedidos", "cep"],
  ["0039", "produtos", "tipo_venda"],
  ["0040", "pedidos", "cidade"],
  ["0041", "pedido_status_transicoes"],
  ["0042", "estoque_movimentacoes"],
  ["0043", "fritura_fila"],
  ["0044", "motoboy_historico"],
  ["0044", "rotas"],
  ["0044", "entrega_atrasos"],
  ["0045", "pedidos", "tipo_imovel"],
  ["0046", "fiscal_provedor_config"],
  ["0046", "documento_fiscal_itens"],
];

async function sondar(tabela, coluna) {
  const sel = coluna ? `${coluna}` : "id";
  let resp;
  try {
    resp = await fetch(`${URL}/rest/v1/${tabela}?select=${sel}&limit=0`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { estado: "ERRO-REDE", detalhe: e instanceof Error ? e.message : String(e) };
  }
  if (resp.ok) return { estado: "EXISTE" };
  let corpo = "";
  try {
    corpo = await resp.text();
  } catch { /* vazio */ }
  let msg = "";
  try {
    msg = JSON.parse(corpo)?.message ?? corpo;
  } catch {
    msg = corpo;
  }
  msg = String(msg).replace(/\s+/g, " ").slice(0, 160);
  if (/does not exist|not exist|not found|PGRST205|PGRST202/i.test(`${resp.status} ${msg}`)) {
    return { estado: "FALTA", detalhe: `HTTP ${resp.status} ${msg}` };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { estado: "EXISTE (sem acesso anon)", detalhe: `HTTP ${resp.status}` };
  }
  return { estado: `HTTP-${resp.status}`, detalhe: msg };
}

console.log(`Banco: ${URL.replace(/^https?:\/\//, "").slice(0, 40)}...\n`);
for (const [mig, tabela, coluna] of SONDAS) {
  const alvo = coluna ? `${tabela}.${coluna}` : tabela;
  const r = await sondar(tabela, coluna);
  console.log(`${mig}  ${alvo.padEnd(38)} ${r.estado}${r.detalhe ? ` — ${r.detalhe}` : ""}`);
}

// Parte 2 — prontidão fiscal (nota: 404 aqui pode ser cache do PostgREST;
// o PASSO-7 no SQL Editor é o veredito definitivo).
console.log("\n-- Prontidão fiscal --");
try {
  const resp = await fetch(`${URL}/rest/v1/produtos?select=id,nome,ncm,cfop_padrao,cst,csosn&limit=1000`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    console.log(`produtos: HTTP ${resp.status} (sem leitura pública? confira RLS)`);
  } else {
    const prods = await resp.json();
    const semNcm = prods.filter((p) => !p.ncm);
    const semCfop = prods.filter((p) => !p.cfop_padrao);
    const semTrib = prods.filter((p) => !p.cst && !p.csosn);
    console.log(`produtos: ${prods.length} | sem NCM: ${semNcm.length} | sem CFOP: ${semCfop.length} | sem CST/CSOSN: ${semTrib.length}`);
    for (const p of semNcm.slice(0, 15)) console.log(`   sem NCM: ${p.nome}`);
    if (semNcm.length > 15) console.log(`   ... e mais ${semNcm.length - 15}`);
  }
} catch (e) {
  console.log(`produtos: ERRO ${e instanceof Error ? e.message : String(e)}`);
}

for (const fn of ["fiscal-emitir", "resgatar-fidelidade", "enviar-lembretes"]) {
  try {
    const resp = await fetch(`${URL}/functions/v1/${fn}`, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(15000),
    });
    const corpo = (await resp.text()).slice(0, 80).replace(/\s+/g, " ");
    const deployada = resp.status !== 404 || !/not found/i.test(corpo);
    console.log(`função ${fn}: ${deployada ? `responde HTTP ${resp.status} (deployada?)` : "HTTP 404 (NÃO deployada)"}`);
  } catch (e) {
    console.log(`função ${fn}: ERRO ${e instanceof Error ? e.message : String(e)}`);
  }
}
