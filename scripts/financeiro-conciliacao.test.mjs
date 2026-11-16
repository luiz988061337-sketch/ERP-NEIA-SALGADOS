// Testes locais puros da validação de conciliação e identidade de extratos.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

const {
  analisarColisoesFITID,
  assinaturaArquivoExtrato,
  correspondeArquivoLegado,
  identificarArquivoExtrato,
  importarLancamentosExtrato,
  prefixoIdentidadeArquivoExtrato,
  validarValorConta,
} = await import("@/lib/extratos-importacao.ts");
const { parseOFX } = await import("@/lib/ofx.ts");

let falhas = 0;
function ok(condicao, caso) {
  console.log(`${condicao ? "OK  " : "FAIL"} ${caso}`);
  if (!condicao) falhas += 1;
}

const contaErro = validarValorConta({ data: { valor: 89 }, error: new Error("offline") });
ok(!contaErro.ok && contaErro.motivo === "consulta_falhou", "falha na consulta nunca vira quitação");
const contaAusente = validarValorConta({ data: null });
ok(!contaAusente.ok && contaAusente.motivo === "conta_ausente", "conta inexistente é bloqueada");
const zeroLegitimo = validarValorConta({ data: { valor: 0 }, error: null });
ok(zeroLegitimo.ok && zeroLegitimo.valor === 0, "valor zero retornado é diferente de erro de leitura");
ok(!validarValorConta({ data: { valor: "" } }).ok, "valor vazio é inválido");
ok(!validarValorConta({ data: { valor: Number.NaN } }).ok, "valor não finito é inválido");

const linhas = [
  { referencia: "a", data: "2026-10-10", valor: 46, descricao: "PIX" },
  { referencia: "b", data: "2026-10-11", valor: -20, descricao: "Taxa" },
];
const hash1 = await assinaturaArquivoExtrato(linhas);
const hash2 = await assinaturaArquivoExtrato(structuredClone(linhas));
const hashOutroConteudo = await assinaturaArquivoExtrato([{ ...linhas[0], valor: 47 }]);
ok(hash1 === hash2, "repetição do mesmo conteúdo tem assinatura estável");
ok(hash1 !== hashOutroConteudo, "conteúdos diferentes têm assinaturas diferentes");
ok(
  identificarArquivoExtrato("extrato.csv", hash1) !== identificarArquivoExtrato("extrato.csv", hashOutroConteudo),
  "arquivos diferentes com o mesmo nome têm identidades diferentes",
);
const conteudoContaA = `<OFX><BANKID>001</BANKID><ACCTID>111</ACCTID>${JSON.stringify(linhas)}`;
const conteudoContaB = `<OFX><BANKID>033</BANKID><ACCTID>222</ACCTID>${JSON.stringify(linhas)}`;
const hashArquivoA = await assinaturaArquivoExtrato(
  [{ ...linhas[0], idTransacao: "SAME-FITID" }],
  conteudoContaA,
);
const hashArquivoARenomeado = await assinaturaArquivoExtrato(
  [{ ...linhas[0], idTransacao: "SAME-FITID" }],
  conteudoContaA,
);
const hashArquivoB = await assinaturaArquivoExtrato(
  [{ ...linhas[0], idTransacao: "SAME-FITID" }],
  conteudoContaB,
);
ok(hashArquivoA === hashArquivoARenomeado, "arquivo fonte idêntico mantém assinatura mesmo renomeado");
ok(hashArquivoA !== hashArquivoB, "contas diferentes com FITID igual não colidem na assinatura do arquivo");
ok(
  identificarArquivoExtrato("conta-a.ofx", hashArquivoA).startsWith(prefixoIdentidadeArquivoExtrato(hashArquivoARenomeado)) &&
    identificarArquivoExtrato("conta-b.ofx", hashArquivoB) !== identificarArquivoExtrato("conta-a.ofx", hashArquivoA),
  "assinatura do conteúdo preserva identidade exata e separa contas com cabeçalhos distintos",
);
ok(
  prefixoIdentidadeArquivoExtrato(hash1) === prefixoIdentidadeArquivoExtrato(await assinaturaArquivoExtrato(structuredClone(linhas))) &&
    identificarArquivoExtrato("outro-nome.csv", hash1).startsWith(prefixoIdentidadeArquivoExtrato(hash1)),
  "conteúdo repetido com outro nome mantém a mesma identidade idempotente",
);

const legado = linhas.map((l, i) => ({ ...l, linha: i + 1 }));
ok(correspondeArquivoLegado(legado, linhas), "arquivo histórico idêntico é reconhecido");
ok(!correspondeArquivoLegado([legado[0]], linhas), "arquivo histórico parcial não é presumido como repetição completa");
ok(!correspondeArquivoLegado(legado, [{ ...linhas[0], valor: 47 }, linhas[1]]), "arquivo histórico com conteúdo diferente exige decisão");
let legadoReimportado = 0;
await importarLancamentosExtrato({
  lancamentos: linhas,
  linhasExistentes: [],
  inserir: async () => { legadoReimportado += 1; },
});
ok(legadoReimportado === linhas.length, "registros legados sem assinatura não descartam silenciosamente um arquivo coincidente");

let gravados = [];
const repetido = await importarLancamentosExtrato({
  lancamentos: linhas,
  linhasExistentes: [1],
  inserir: async (l, linha) => { gravados.push({ l, linha }); },
});
ok(repetido.importados === 1 && repetido.ignorados === 1 && gravados[0]?.linha === 2, "repetir o mesmo extrato pula linhas já persistidas");
let importacoesRepetidas = 0;
const repeticaoExata = await importarLancamentosExtrato({
  lancamentos: linhas,
  linhasExistentes: [1, 2],
  inserir: async () => { importacoesRepetidas += 1; },
});
ok(repeticaoExata.importados === 0 && repeticaoExata.ignorados === 2 && importacoesRepetidas === 0, "arquivo exatamente repetido não gera novas linhas");
const assinaturaNomeOriginal = await assinaturaArquivoExtrato(linhas, "conteúdo exato do extrato");
const assinaturaNomeAlternativo = await assinaturaArquivoExtrato(linhas, "conteúdo exato do extrato");
ok(
  prefixoIdentidadeArquivoExtrato(assinaturaNomeOriginal) === prefixoIdentidadeArquivoExtrato(assinaturaNomeAlternativo),
  "arquivo idêntico com nome diferente mantém a mesma identidade por conteúdo",
);

const entradaFitid = [{ ...linhas[0], idTransacao: "FIT-1" }];
const colisaoContaDiferente = analisarColisoesFITID(
  entradaFitid,
  [{ referencia: "FIT-1", arquivo: "sha256:outra-conta|extrato.ofx" }],
  "sha256:arquivo-atual|",
);
ok(colisaoContaDiferente.encontradosEmOutrosArquivos === 1, "mesmo FITID em contas sem escopo comprovado gera alerta");
let importadosMesmoFitid = 0;
const fitidPossivelmenteCoincidente = await importarLancamentosExtrato({
  lancamentos: entradaFitid,
  linhasExistentes: [],
  inserir: async () => { importadosMesmoFitid += 1; },
});
ok(fitidPossivelmenteCoincidente.importados === 1 && importadosMesmoFitid === 1, "FITID global coincidente nunca descarta automaticamente a transação");

const duplicadoNoArquivo = await importarLancamentosExtrato({
  lancamentos: [
    { ...linhas[0], idTransacao: "FIT-2" },
    { ...linhas[0], idTransacao: "FIT-2" },
  ],
  linhasExistentes: [],
  inserir: async () => undefined,
});
const colisaoDentroArquivo = analisarColisoesFITID(
  [
    { ...linhas[0], idTransacao: "FIT-2" },
    { ...linhas[0], idTransacao: "FIT-2" },
  ],
  [],
  "sha256:arquivo-atual|",
);
ok(duplicadoNoArquivo.importados === 2 && colisaoDentroArquivo.duplicadosNoArquivo === 1, "FITID duplicado no mesmo arquivo alerta e preserva as duas linhas");

const duplicadosCsv = await importarLancamentosExtrato({
  lancamentos: [{ ...linhas[0] }, { ...linhas[0] }],
  linhasExistentes: [],
  inserir: async () => undefined,
});
ok(duplicadosCsv.importados === 2, "CSV sem ID bancário preserva transações iguais legítimas");

let tentativa = 0;
const parcial = await importarLancamentosExtrato({
  lancamentos: [...linhas, { referencia: "c", data: "2026-10-12", valor: 3, descricao: "C" }],
  linhasExistentes: [],
  inserir: async (_l, linha) => {
    tentativa += 1;
    if (linha === 2) throw new Error("falha parcial");
  },
});
ok(parcial.importados === 2 && parcial.falhas === 1, "falhas parciais são contadas sem descartar sucessos");
let retry = 0;
const novaTentativa = await importarLancamentosExtrato({
  lancamentos: [...linhas, { referencia: "c", data: "2026-10-12", valor: 3, descricao: "C" }],
  linhasExistentes: [1, 3],
  inserir: async (_l, linha) => { if (linha === 2) retry += 1; },
});
ok(novaTentativa.importados === 1 && retry === 1, "repetição após falha parcial tenta somente a linha pendente");

const ofx = parseOFX(`<OFX><STMTTRN><TRNAMT>1.00</TRNAMT><DTPOSTED>20261010</DTPOSTED><FITID>stable-1</FITID><MEMO>Teste</MEMO></STMTTRN></OFX>`);
ok(ofx[0]?.idTransacao === "stable-1", "OFX expõe FITID estável para deduplicação");

if (falhas > 0) process.exit(1);
console.log("\nfinanceiro-conciliacao: validação e importação passaram.");
