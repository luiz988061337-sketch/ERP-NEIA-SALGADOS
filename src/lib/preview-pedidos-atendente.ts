/**
 * Lógica pura do preview de Gestão de Pedidos — Atendente (K9).
 * Sem banco, sem React. Testável em scripts/preview-pedidos-atendente.test.mjs.
 */

export type ColunaAtendente =
  | "novos"
  | "aceitos"
  | "producao"
  | "prontos"
  | "entrega"
  | "concluidos"
  | "cancelados";

export type TipoPedido = "entrega" | "retirada";

export type ItemAtendente = { sabor: string; qtd: number };

export type PedidoAtendente = {
  id: string;
  numero: number;
  cliente: string;
  telefone: string;
  tipo: TipoPedido;
  endereco?: string;
  distanciaKm: number | null;
  /** Horário prometido ao cliente. */
  prometidoEm: number;
  agendado: boolean;
  itens: ItemAtendente[];
  valorCentavos: number;
  pagamento: string;
  pagamentoConfirmado: boolean;
  obs?: string;
  /** Bloqueio operacional (ex.: "pagamento-pendente"). Null = liberado. */
  bloqueio: string | null;
  emAnalise: boolean;
  /** Janela fictícia de liberação para a cozinha (preenchida no aceite). */
  liberacaoEm: number | null;
  prontoEm: number | null;
  motoboy?: string | undefined;
  despacho: "nenhum" | "aguardando-motoboy" | "atribuido" | "em-rota" | "aguardando-cliente";
  coluna: ColunaAtendente;
};

export type JanelaCozinha = { liberacaoEm: number; vencimentoEm: number };

/**
 * Janela demonstrativa: vencimento = prometido − desloc − antecedência;
 * liberação = vencimento − tempo de preparo. Estimativas, nunca promessas.
 */
export function janelaLiberacao(
  prometidoEm: number,
  tempoPreparoMin: number,
  deslocMin: number | null,
  antecedenciaMin: number,
): JanelaCozinha {
  const vencimentoEm = prometidoEm - (deslocMin ?? 0) * 60000 - antecedenciaMin * 60000;
  return { liberacaoEm: vencimentoEm - tempoPreparoMin * 60000, vencimentoEm };
}

export type ParametrosJanela = { preparoMin: number; deslocMin: number; margemMin: number };

/**
 * Parâmetros por pedido (K9 ajuste 2): preparo escala com o total de
 * unidades, desloc escala com a distância (retirada = 0), margem fixa.
 * O prometido ao cliente nunca é alterado — só se deriva a liberação.
 */
export function parametrosJanela(
  totalUn: number,
  distanciaKm: number | null,
  tipo: "entrega" | "retirada",
): ParametrosJanela {
  const preparoMin = 15 + Math.ceil(Math.max(0, totalUn) / 10) * 5;
  const deslocMin = tipo === "entrega" ? Math.round((distanciaKm ?? 2) * 6) : 0;
  return { preparoMin, deslocMin, margemMin: 10 };
}

/** Aceite demonstrativo: valida dados e bloqueios, sem gravar nada. */
export function podeAceitar(p: Pick<PedidoAtendente, "cliente" | "itens" | "pagamento" | "bloqueio" | "coluna">): {
  ok: boolean;
  motivos: string[];
} {
  const motivos: string[] = [];
  if (p.coluna !== "novos") motivos.push("pedido não está em Novos");
  if (!p.cliente.trim()) motivos.push("cliente sem nome");
  if (p.itens.reduce((s, i) => s + i.qtd, 0) <= 0) motivos.push("sem itens");
  if (!p.pagamento.trim()) motivos.push("pagamento não informado");
  if (p.bloqueio) motivos.push(`bloqueio operacional: ${p.bloqueio}`);
  return { ok: motivos.length === 0, motivos };
}

/** Liberação para a cozinha: só após aceite e dentro da janela. */
export function podeLiberar(
  p: Pick<PedidoAtendente, "coluna" | "liberacaoEm" | "bloqueio">,
  agora: number,
): boolean {
  return p.coluna === "aceitos" && !p.bloqueio && p.liberacaoEm != null && agora >= p.liberacaoEm;
}

/** Atrasado: prometido passou e ainda não concluído/cancelado. */
export function emAtrasoAtendente(p: Pick<PedidoAtendente, "prometidoEm" | "coluna">, agora: number): boolean {
  return p.coluna !== "concluidos" && p.coluna !== "cancelados" && agora > p.prometidoEm;
}

export function totalUnidades(p: Pick<PedidoAtendente, "itens">): number {
  return p.itens.reduce((s, i) => s + i.qtd, 0);
}

export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Ordenação padrão: prometido mais próximo primeiro (empate: menor número). */
export function ordenarPorPrometido<T extends { prometidoEm: number; numero: number }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.prometidoEm - b.prometidoEm || a.numero - b.numero);
}

/** Mensagem pronta de WhatsApp (prévia local, sem envio). */
export function mensagemWhatsApp(
  p: Pick<PedidoAtendente, "numero" | "cliente" | "tipo" | "prometidoEm" | "itens">,
): string {
  const hora = new Date(p.prometidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const itens = p.itens.map((i) => `${i.qtd}x ${i.sabor}`).join(", ");
  const como = p.tipo === "entrega" ? "para entrega" : "para retirada";
  return `Olá, ${p.cliente}! Aqui é da Néia Salgados. Seu pedido #${p.numero} (${itens}) está pronto ${como}. Previsão: ${hora}. Obrigado!`;
}

/** CSV demonstrativo da tabela (download local). */
export function resumoCSV(pedidos: PedidoAtendente[]): string {
  const lin = (v: (string | number)[]) => v.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";");
  const linhas = [
    lin(["Pedido", "Cliente", "Tipo", "Prometido", "Itens", "Qtd", "Total", "Situacao"]),
    ...pedidos.map((p) =>
      lin([
        p.numero,
        p.cliente,
        p.tipo,
        new Date(p.prometidoEm).toLocaleString("pt-BR"),
        p.itens.map((i) => `${i.qtd}x ${i.sabor}`).join(" + "),
        totalUnidades(p),
        brl(p.valorCentavos),
        p.coluna,
      ]),
    ),
  ];
  return `\uFEFF${linhas.join("\r\n")}`;
}
