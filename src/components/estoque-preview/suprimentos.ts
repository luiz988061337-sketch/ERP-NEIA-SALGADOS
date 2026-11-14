// E2/E3 — embalagens de compra e saldos locais. Não há baixa automática por venda.
import { converterUnidade, type Unidade } from "@/lib/insumos";
import { alertaEstoque } from "@/lib/lotes";
import type { Movimento, Resultado } from "./salgados";
import { DATA_DEMO } from "./salgados";
import { normalizarNome } from "./produtos";

export const UNIDADES_COMPRA = [
  "pacote",
  "saco",
  "quilo",
  "litro",
  "galão",
  "unidade",
  "bandeja",
  "caixa",
  "fardo",
] as const;
export type UnidadeCompra = (typeof UNIDADES_COMPRA)[number];
export type TipoSuprimento = "insumos" | "embalagens";
export const TIPOS_EMBALAGEM = ["Caixa", "Sacola", "Pote", "Guardanapo", "Outra"] as const;
export type TipoEmbalagem = (typeof TIPOS_EMBALAGEM)[number];
export const UNIDADES_EMBALAGEM = ["fardo", "pacote", "unidade"] as const;
export type Suprimento = {
  id: string;
  nome: string;
  descricao: string;
  unidadeCompra: UnidadeCompra;
  equivalente: number | null;
  unidadeBase: Unidade;
  saldo: number;
  minimo: number;
  custo: number;
  fornecedor: string;
  estimado: boolean;
  conferencia: string;
  tipoEmbalagem?: TipoEmbalagem;
};
export type SuprimentosState = {
  tipo: TipoSuprimento;
  itens: Suprimento[];
  historico: Movimento[];
  processadas: string[];
};
const item = (
  id: string,
  nome: string,
  descricao: string,
  unidadeCompra: UnidadeCompra,
  equivalente: number,
  unidadeBase: Unidade,
  saldo: number,
  minimo: number,
  custo: number,
  fornecedor: string,
  estimado: boolean,
): Suprimento => ({
  id,
  nome,
  descricao,
  unidadeCompra,
  equivalente,
  unidadeBase,
  saldo,
  minimo,
  custo,
  fornecedor,
  estimado,
  conferencia: "2026-11-12T18:40:00",
  ...(!estimado
    ? {
        tipoEmbalagem: id.includes("caixa")
          ? ("Caixa" as const)
          : id.includes("sacola")
            ? ("Sacola" as const)
            : id.includes("pote")
              ? ("Pote" as const)
              : ("Guardanapo" as const),
      }
    : {}),
});
export function criarSuprimentosDemo(tipo: TipoSuprimento): SuprimentosState {
  const itens =
    tipo === "insumos"
      ? [
          item(
            "ins-farinha",
            "Farinha de trigo",
            "Pacote de 5 kg",
            "pacote",
            5,
            "kg",
            20,
            2,
            17.9,
            "Fornecedor A",
            true,
          ),
          item(
            "ins-oleo",
            "Óleo",
            "Galão de 5 L",
            "galão",
            5,
            "l",
            15,
            2,
            35.9,
            "Fornecedor A",
            true,
          ),
          item(
            "ins-queijo",
            "Queijo",
            "Pacote de 1 kg",
            "pacote",
            1,
            "kg",
            2,
            3,
            42,
            "Fornecedor B",
            true,
          ),
          item(
            "ins-ovos",
            "Ovos",
            "Bandeja de 30 un.",
            "bandeja",
            30,
            "un",
            150,
            3,
            16.9,
            "Fornecedor A",
            true,
          ),
        ]
      : [
          item(
            "emb-caixa50",
            "Caixa para 50 salgados",
            "Caixa de papelão — 50 salgados",
            "fardo",
            50,
            "un",
            250,
            3,
            42,
            "Embalagens ABC",
            false,
          ),
          item(
            "emb-caixa100",
            "Caixa para 100 salgados",
            "Caixa de papelão — 100 salgados",
            "fardo",
            50,
            "un",
            100,
            4,
            58,
            "Embalagens ABC",
            false,
          ),
          item(
            "emb-sacola",
            "Sacola plástica",
            "Sacola reforçada",
            "pacote",
            100,
            "un",
            800,
            5,
            12,
            "Embalagens ABC",
            false,
          ),
          item(
            "emb-pote100",
            "Pote para molho (100 ml)",
            "Pote descartável",
            "pacote",
            50,
            "un",
            300,
            3,
            9.5,
            "Embalagens ABC",
            false,
          ),
          item(
            "emb-pote200",
            "Pote para molho (200 ml)",
            "Pote descartável",
            "pacote",
            50,
            "un",
            150,
            3,
            11,
            "Embalagens ABC",
            false,
          ),
          item(
            "emb-guardanapo",
            "Guardanapo",
            "Pacote com 500 unidades",
            "pacote",
            500,
            "un",
            1500,
            2,
            6.9,
            "Embalagens ABC",
            false,
          ),
        ];
  return {
    tipo,
    itens,
    processadas: [],
    historico: [
      {
        id: `${tipo}-inicial`,
        itemId: itens[0]!.id,
        tipo: "Compra",
        quantidade: itens[0]!.saldo,
        antes: 0,
        depois: itens[0]!.saldo,
        unidade: itens[0]!.unidadeBase,
        motivo: "Saldo inicial fictício da demonstração",
        referencia: "COMPRA-DEMO-01",
        data: "2026-11-13T09:24:00",
      },
    ],
  };
}
export const arredondar = (n: number) => Math.round(n * 1000000) / 1000000;
export const pacotes = (i: Suprimento) =>
  i.equivalente ? arredondar(i.saldo / i.equivalente) : null;
export const situacao = (i: Suprimento) =>
  i.equivalente ? alertaEstoque(i.saldo, i.minimo * i.equivalente) : "configurar";
export const reposicao = (i: Suprimento) =>
  i.equivalente
    ? Math.max(situacao(i) === "ok" ? 0 : 1, Math.ceil(i.minimo - i.saldo / i.equivalente))
    : 0;
export function indicadoresSuprimentos(s: SuprimentosState) {
  return {
    total: s.itens.length,
    ok: s.itens.filter((i) => situacao(i) === "ok").length,
    baixos: s.itens.filter((i) => situacao(i) !== "ok").length,
    fornecedores: new Set(s.itens.map((i) => i.fornecedor)).size,
    pacotes: arredondar(s.itens.reduce((v, i) => v + (pacotes(i) ?? 0), 0)),
    custo: Math.round(s.itens.reduce((v, i) => v + (pacotes(i) ?? 0) * i.custo, 0) * 100) / 100,
    semConversao: s.itens.filter((i) => !i.equivalente).length,
  };
}
export function quantidadeBase(i: Suprimento, qtd: number, unidade: string): number | null {
  if (!Number.isFinite(qtd)) return null;
  if (unidade === "compra") return i.equivalente ? arredondar(qtd * i.equivalente) : null;
  const convertida = converterUnidade(qtd, unidade, i.unidadeBase);
  return convertida === null ? null : arredondar(convertida);
}
function validarConfig(i: Suprimento, tipo: TipoSuprimento): string | null {
  if (!i.nome.trim() || !i.fornecedor.trim()) return "Informe nome e fornecedor.";
  if (!UNIDADES_COMPRA.includes(i.unidadeCompra)) return "Unidade de compra inválida.";
  if (
    tipo === "embalagens" &&
    (!UNIDADES_EMBALAGEM.some((u) => u === i.unidadeCompra) ||
      (i.tipoEmbalagem !== undefined && !TIPOS_EMBALAGEM.includes(i.tipoEmbalagem)))
  )
    return "Informe o tipo e a unidade de compra: fardo, pacote ou unidade.";
  if (!["g", "kg", "ml", "l", "un"].includes(i.unidadeBase)) return "Unidade equivalente inválida.";
  if (!Number.isFinite(i.custo) || i.custo < 0 || !Number.isFinite(i.minimo) || i.minimo < 0)
    return "Custo e estoque mínimo devem ser valores não negativos.";
  if (i.equivalente !== null && (!Number.isFinite(i.equivalente) || i.equivalente <= 0))
    return "A quantidade por embalagem deve ser positiva ou ficar a definir.";
  if (tipo === "insumos" && !i.equivalente)
    return "Informe a quantidade equivalente da embalagem de compra.";
  if (
    tipo === "embalagens" &&
    (i.unidadeBase !== "un" || (i.equivalente !== null && !Number.isSafeInteger(i.equivalente)))
  )
    return "Embalagens exigem unidades inteiras por fardo/pacote.";
  return null;
}
export type AcaoSuprimento = {
  id: string;
  itemId: string;
  tipo: "compra" | "fechada" | "parcial" | "conferencia" | "ajuste";
  quantidade: number;
  unidade: string;
  motivo: string;
  custo?: number;
  fornecedor?: string;
};
export function movimentarSuprimento(
  s: SuprimentosState,
  a: AcaoSuprimento,
): Resultado<SuprimentosState> {
  if (!a.id.trim() || s.processadas.includes(a.id))
    return { ok: false, erro: "Movimentação já registrada ou sem identificador." };
  const original = s.itens.find((i) => i.id === a.itemId);
  if (!original) return { ok: false, erro: "Item não encontrado neste estoque." };
  if (!a.motivo.trim())
    return { ok: false, erro: "Informe justificativa ou referência para registrar o histórico." };
  const qtd = quantidadeBase(original, a.quantidade, a.unidade);
  const contagem = a.tipo === "conferencia" || a.tipo === "ajuste";
  if (qtd === null || !Number.isFinite(qtd) || qtd < 0 || (!contagem && qtd === 0))
    return {
      ok: false,
      erro: "Quantidade/unidade inválida. Configure o conteúdo do fardo/pacote, se necessário.",
    };
  if (s.tipo === "embalagens" && !Number.isSafeInteger(qtd))
    return { ok: false, erro: "A quantidade de embalagens deve corresponder a unidades inteiras." };
  if (a.tipo === "fechada" && (a.unidade !== "compra" || !Number.isSafeInteger(a.quantidade)))
    return { ok: false, erro: "A retirada fechada exige quantidade inteira de fardos/pacotes." };
  if (
    a.tipo === "compra" &&
    ((a.custo !== undefined && (!Number.isFinite(a.custo) || a.custo < 0)) ||
      (a.fornecedor !== undefined && !a.fornecedor.trim()))
  )
    return { ok: false, erro: "Informe custo e fornecedor válidos para a compra." };
  const depois = arredondar(
    contagem ? qtd : a.tipo === "compra" ? original.saldo + qtd : original.saldo - qtd,
  );
  if (depois < 0)
    return { ok: false, erro: "Saldo insuficiente. Não é permitido estoque negativo." };
  if (!Number.isFinite(depois) || (s.tipo === "embalagens" && !Number.isSafeInteger(depois)))
    return { ok: false, erro: "Saldo acima do limite de precisão permitido." };
  const novo = structuredClone(s),
    i = novo.itens.find((i) => i.id === a.itemId)!;
  i.saldo = depois;
  if (a.tipo === "compra") {
    i.custo = a.custo ?? i.custo;
    i.fornecedor = a.fornecedor?.trim() ?? i.fornecedor;
  }
  if (a.tipo === "conferencia") i.conferencia = `${DATA_DEMO}T10:45:00`;
  i.estimado = s.tipo === "insumos";
  novo.processadas.push(a.id);
  novo.historico.unshift({
    id: a.id,
    itemId: i.id,
    tipo: {
      compra: "Compra",
      fechada: "Retirada de embalagem fechada",
      parcial: "Retirada parcial",
      conferencia: "Conferência",
      ajuste: "Ajuste de saldo",
    }[a.tipo],
    quantidade: arredondar(depois - original.saldo),
    antes: original.saldo,
    depois,
    unidade: i.unidadeBase,
    motivo: a.motivo.trim(),
    referencia: a.tipo === "compra" ? i.fornecedor : "Manual demonstrativo",
    data: `${DATA_DEMO}T10:45:00`,
  });
  return {
    ok: true,
    estado: novo,
    mensagem: "Movimentação local registrada; saldo e histórico atualizados.",
  };
}
export function salvarSuprimento(
  s: SuprimentosState,
  idOperacao: string,
  dados: Omit<Suprimento, "saldo" | "estimado" | "conferencia">,
): Resultado<SuprimentosState> {
  if (!idOperacao.trim() || s.processadas.includes(idOperacao))
    return { ok: false, erro: "Cadastro/configuração já registrado." };
  const anterior = s.itens.find((i) => i.id === dados.id);
  const saldoConvertido = anterior
    ? converterUnidade(anterior.saldo, anterior.unidadeBase, dados.unidadeBase)
    : 0;
  if (saldoConvertido === null)
    return {
      ok: false,
      erro: "Unidades incompatíveis com o saldo existente. Massa, volume e unidades não se misturam.",
    };
  const novoItem: Suprimento = {
    ...dados,
    nome: dados.nome.trim().replace(/\s+/g, " "),
    fornecedor: dados.fornecedor.trim(),
    saldo: arredondar(saldoConvertido),
    estimado: s.tipo === "insumos",
    conferencia: anterior?.conferencia ?? "",
  };
  const erro = validarConfig(novoItem, s.tipo);
  if (erro) return { ok: false, erro };
  if (
    s.itens.some(
      (i) => i.id !== dados.id && normalizarNome(i.nome) === normalizarNome(novoItem.nome),
    )
  )
    return { ok: false, erro: "Já existe um item com este nome neste estoque." };
  const novo = structuredClone(s);
  if (anterior) novo.itens = novo.itens.map((i) => (i.id === dados.id ? novoItem : i));
  else novo.itens.push(novoItem);
  novo.processadas.push(idOperacao);
  novo.historico.unshift({
    id: idOperacao,
    itemId: dados.id,
    tipo: anterior ? "Configuração" : "Cadastro",
    quantidade: 0,
    antes: novoItem.saldo,
    depois: novoItem.saldo,
    unidade: novoItem.unidadeBase,
    motivo: `Unidade de compra: ${dados.unidadeCompra}; equivalente: ${dados.equivalente ?? "a definir"} ${dados.unidadeBase}. Saldo físico preservado.`,
    referencia: novoItem.fornecedor,
    data: `${DATA_DEMO}T10:45:00`,
  });
  return {
    ok: true,
    estado: novo,
    mensagem: "Configuração salva apenas na demonstração; saldo físico preservado.",
  };
}
