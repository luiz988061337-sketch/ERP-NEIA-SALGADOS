/**
 * Importação de extratos (OFX v1 SGML + CSV simples) — parser puro.
 * Sem banco/React: testável em scripts/ofx.test.mjs.
 * O vínculo com pedido/conta é SUGESTÃO (só humano confirma na tela).
 */

export type LancamentoExtrato = {
  referencia: string;
  data: string; // YYYY-MM-DD
  valor: number; // + entrada, − saída
  descricao: string;
};

/** Extrai o conteúdo de uma tag SGML (até "<" ou fim de linha). */
function tag(bloco: string, nome: string): string {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return (m?.[1] ?? "").trim();
}

function dataOFX(s: string): string {
  const d = s.slice(0, 8);
  if (!/^\d{8}$/.test(d)) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Parse de OFX 1.x (STMTTRN). Ignora blocos sem valor/data. */
export function parseOFX(texto: string): LancamentoExtrato[] {
  const out: LancamentoExtrato[] = [];
  const blocos = String(texto ?? "")
    .split(/<STMTTRN>/i)
    .slice(1);
  for (const b of blocos) {
    const valor = Number(tag(b, "TRNAMT").replace(",", "."));
    const data = dataOFX(tag(b, "DTPOSTED"));
    if (!Number.isFinite(valor) || valor === 0 || !data) continue;
    const memo = tag(b, "MEMO") || tag(b, "NAME") || "Lançamento";
    const fitid = tag(b, "FITID") || `${data}|${valor}|${memo}`.slice(0, 120);
    out.push({
      referencia: fitid,
      data,
      valor: Math.round(valor * 100) / 100,
      descricao: memo.slice(0, 200),
    });
  }
  return out;
}

/** Normaliza número pt-BR ("1.234,56" → 1234.56). */
export function numeroBR(s: string): number | null {
  const t = String(s ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!t) return null;
  const limpo = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * CSV simples com cabeçalho (data,descricao,valor) ou sem cabeçalho na
 * mesma ordem. Delimitador , ou ;. Data em YYYY-MM-DD ou DD/MM/YYYY.
 */
export function parseCSVExtrato(texto: string): LancamentoExtrato[] {
  const linhas = String(texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return [];
  const first = linhas[0] ?? "";
  const semi = (first.match(/;/g) ?? []).length;
  const virg = (first.match(/,/g) ?? []).length;
  const sep = semi >= virg ? ";" : ",";
  const partes = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  let ini = 0;
  const cab = partes(first).map((c) => c.toLowerCase());
  if (cab.some((c) => /data|descricao|descri|valor|amount/.test(c))) ini = 1;
  const out: LancamentoExtrato[] = [];
  for (let i = ini; i < linhas.length; i++) {
    const c = partes(linhas[i] ?? "");
    if (c.length < 3) continue;
    let data: string = c[0] ?? "";
    const descricao: string = c[1] ?? "";
    const sval: string = c[2] ?? "";
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
    if (m) data = `${m[3] ?? ""}-${m[2] ?? ""}-${m[1] ?? ""}`;
    const valor = numeroBR(sval);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || valor == null || valor === 0) continue;
    out.push({
      referencia: `csv:${data}|${valor}|${descricao}`.slice(0, 120),
      data,
      valor,
      descricao: descricao.slice(0, 200),
    });
  }
  return out;
}

export type CandidatoVinculo =
  { tipo: "pedido"; id: string; rotulo: string } | { tipo: "conta"; id: string; rotulo: string };

function diasEntre(a: string, b: string): number {
  return Math.abs(+new Date(a) - +new Date(b)) / 86400000;
}

/**
 * Sugere vínculo (nunca confirma sozinho):
 * - entrada (+) → pedido PIX/pendente ou conta a receber, mesmo valor ±2 dias;
 * - saída (−) → conta a pagar, |valor| ±2 dias.
 * Retorna no máximo 3, exato-primeiro. Vazio = vai p/ conferência manual.
 */
export function sugerirVinculo(
  lanc: LancamentoExtrato,
  pedidos: {
    id: string;
    numero?: number | null;
    total?: number | null;
    pagamento_status?: string | null;
    created_at?: string | null;
  }[],
  contas: {
    id: string;
    descricao?: string | null;
    valor?: number | null;
    vencimento?: string | null;
    status?: string | null;
    tipo?: string | null;
  }[],
): CandidatoVinculo[] {
  const out: { c: CandidatoVinculo; exato: boolean; perto: boolean }[] = [];
  if (lanc.valor > 0) {
    for (const p of pedidos ?? []) {
      if ((p.pagamento_status ?? "pendente") === "pago") continue;
      if (Math.abs((Number(p.total) || 0) - lanc.valor) > 0.005) continue;
      const d = p.created_at ? diasEntre(p.created_at.slice(0, 10), lanc.data) : 99;
      if (d > 2) continue;
      out.push({
        c: { tipo: "pedido", id: p.id, rotulo: `Pedido #${p.numero ?? "?"} • ${lanc.data}` },
        exato: d === 0,
        perto: true,
      });
    }
    for (const c of contas ?? []) {
      if (c.tipo !== "receber" || c.status === "paga" || c.status === "cancelada") continue;
      if (Math.abs((Number(c.valor) || 0) - lanc.valor) > 0.005) continue;
      const d = c.vencimento ? diasEntre(c.vencimento, lanc.data) : 99;
      if (d > 2) continue;
      out.push({
        c: { tipo: "conta", id: c.id, rotulo: `A receber: ${c.descricao}` },
        exato: d === 0,
        perto: true,
      });
    }
  } else {
    for (const c of contas ?? []) {
      if (c.tipo !== "pagar" || c.status === "paga" || c.status === "cancelada") continue;
      if (Math.abs((Number(c.valor) || 0) + lanc.valor) > 0.005) continue;
      const d = c.vencimento ? diasEntre(c.vencimento, lanc.data) : 99;
      if (d > 2) continue;
      out.push({
        c: { tipo: "conta", id: c.id, rotulo: `A pagar: ${c.descricao}` },
        exato: d === 0,
        perto: true,
      });
    }
  }
  return out
    .sort((a, b) => Number(b.exato) - Number(a.exato))
    .slice(0, 3)
    .map((x) => x.c);
}
