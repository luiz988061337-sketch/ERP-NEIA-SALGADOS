import type { LancamentoExtrato } from "@/lib/ofx";

export type LancamentoComId = LancamentoExtrato & { idTransacao?: string };

export type LinhaExtratoExistente = {
  linha: number;
  referencia: string;
  data: string;
  descricao: string;
  valor: number | string;
};

export type ReferenciaExtratoExistente = { referencia: string; arquivo: string };

export async function assinaturaArquivoExtrato(
  lancamentos: LancamentoComId[],
  conteudoOriginal?: string,
): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Assinatura segura indisponível neste navegador.");
  const conteudo = conteudoOriginal ?? JSON.stringify(lancamentos.map((l) => [
    l.data,
    Math.round(Number(l.valor) * 100) / 100,
    l.descricao,
    l.referencia,
    l.idTransacao ?? null,
  ]));
  const bytes = new TextEncoder().encode(conteudo);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** FITID não prova identidade sem escopo bancário; colisões servem só para alertar. */
export function analisarColisoesFITID(
  lancamentos: LancamentoComId[],
  existentes: ReferenciaExtratoExistente[],
  prefixoArquivoAtual: string,
): { duplicadosNoArquivo: number; encontradosEmOutrosArquivos: number } {
  const contagem = new Map<string, number>();
  for (const lancamento of lancamentos) {
    const fitid = lancamento.idTransacao?.trim();
    if (fitid) contagem.set(fitid, (contagem.get(fitid) ?? 0) + 1);
  }
  const duplicadosNoArquivo = [...contagem.values()].reduce(
    (soma, quantidade) => soma + Math.max(0, quantidade - 1),
    0,
  );
  const fitids = new Set(contagem.keys());
  const encontradosEmOutrosArquivos = new Set(
    existentes
      .filter((registro) => fitids.has(registro.referencia) && !registro.arquivo.startsWith(prefixoArquivoAtual))
      .map((registro) => registro.referencia),
  ).size;
  return { duplicadosNoArquivo, encontradosEmOutrosArquivos };
}

export function identificarArquivoExtrato(nome: string, assinatura: string): string {
  return `${prefixoIdentidadeArquivoExtrato(assinatura)}${nome}`;
}

export function prefixoIdentidadeArquivoExtrato(assinatura: string): string {
  return `sha256:${assinatura}|`;
}

function mesmaTransacao(a: LinhaExtratoExistente, b: LancamentoComId): boolean {
  return (
    Number(a.linha) > 0 &&
    a.referencia === b.referencia &&
    a.data === b.data &&
    a.descricao === b.descricao &&
    Number(a.valor) === Number(b.valor)
  );
}

/** Só considera um registro legado idêntico quando o arquivo inteiro confere. */
export function correspondeArquivoLegado(
  existentes: LinhaExtratoExistente[],
  lancamentos: LancamentoComId[],
): boolean {
  if (existentes.length !== lancamentos.length || lancamentos.length === 0) return false;
  const porLinha = new Map(existentes.map((e) => [Number(e.linha), e]));
  return lancamentos.every((l, i) => {
    const existente = porLinha.get(i + 1);
    return !!existente && mesmaTransacao(existente, l);
  });
}

export function validarValorConta(lanc: { data: unknown; error?: unknown }):
  | { ok: true; valor: number }
  | { ok: false; motivo: "consulta_falhou" | "conta_ausente" | "valor_invalido" } {
  if (lanc.error) return { ok: false, motivo: "consulta_falhou" };
  if (!lanc.data || typeof lanc.data !== "object" || !("valor" in lanc.data)) {
    return { ok: false, motivo: "conta_ausente" };
  }
  const bruto = (lanc.data as { valor?: unknown }).valor;
  if (bruto === null || bruto === undefined || (typeof bruto === "string" && bruto.trim() === "")) {
    return { ok: false, motivo: "valor_invalido" };
  }
  if (typeof bruto !== "number" && typeof bruto !== "string") {
    return { ok: false, motivo: "valor_invalido" };
  }
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, motivo: "valor_invalido" };
  return { ok: true, valor };
}

export async function importarLancamentosExtrato({
  lancamentos,
  linhasExistentes,
  inserir,
}: {
  lancamentos: LancamentoComId[];
  linhasExistentes: number[];
  inserir: (lancamento: LancamentoComId, linha: number) => Promise<void>;
}): Promise<{ importados: number; ignorados: number; falhas: number }> {
  const linhas = new Set(linhasExistentes.map(Number));
  let importados = 0;
  let ignorados = 0;
  let falhas = 0;

  for (let i = 0; i < lancamentos.length; i++) {
    const lancamento = lancamentos[i];
    if (!lancamento) continue;
    const linha = i + 1;
    if (linhas.has(linha)) {
      ignorados += 1;
      continue;
    }

    try {
      await inserir(lancamento, linha);
      linhas.add(linha);
      importados += 1;
    } catch {
      falhas += 1;
    }
  }

  return { importados, ignorados, falhas };
}
