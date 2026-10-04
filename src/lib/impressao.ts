/**
 * Fila de impressão (§16-18,21-22): payload térmico + anti-duplicidade.
 * A impressão física acontece no AGENTE Windows (print-agent/), nunca no browser.
 * Papel 80mm, modelo da casa: título ENTREGA/RETIRADA, prevista, Pedido em
 * destaque, itens com preço, cliente, pagamento com totais.
 * SOMENTE ASCII — acento derruba driver térmico. Linhas <= 42 col.
 */

export type ImpressaoStatus = "pendente" | "enviando" | "impresso" | "erro" | "cancelado";

export const LARGURA_CUPOM = 42;

/** Tira acentos p/ ASCII de impressora térmica (mantém caixa original). */
export function semAcento(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function lin(s: string): string {
  return semAcento(s).slice(0, LARGURA_CUPOM);
}

function centro(s: string): string {
  const t = lin(s);
  const esq = Math.max(0, Math.floor((LARGURA_CUPOM - t.length) / 2));
  return " ".repeat(esq) + t;
}

/** "R$ 1.234,56" sem espaços finos (que quebram alinhamento). */
export function moedaCupom(v: number): string {
  const [i, d] = (Number(v) || 0).toFixed(2).split(".") as [string, string];
  return `R$ ${Number(i).toLocaleString("pt-BR")},${d}`;
}

/** Linha com preço à direita: "(50) Coxinha            R$ 80,00". */
export function linhaItem(esquerda: string, direita: string): string {
  const l = lin(esquerda);
  const r = lin(direita);
  const espacos = Math.max(1, LARGURA_CUPOM - l.length - r.length);
  return (l + " ".repeat(espacos) + r).slice(0, LARGURA_CUPOM);
}

/** "Coxinha" p/ nomes vindos minúsculos do cadastro. */
export function tituloCaso(s: string): string {
  return lin(s).toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

const BARRA = "=".repeat(LARGURA_CUPOM);
const TRACO = "-".repeat(LARGURA_CUPOM);
const PONTOS = ".".repeat(LARGURA_CUPOM);

export type ItemCupom = { qtd: number; nome: string; precoUnit?: number | null };

export function textoCupom(p: {
  numero: number; dataHora: string; cliente: string; telefone: string;
  itens: ItemCupom[]; totalUnidades: number;
  entregaRetirada: string; horario: string; endereco: string;
  pagamento: string; observacoes: string; status: string;
  // Modelo da casa (opcionais — ausentes viram "-"/omitidos)
  bairro?: string | null; cidade?: string | null; cep?: string | null;
  complemento?: string | null; referencia?: string | null;
  subtotal?: number | null; taxaEntrega?: number | null; total?: number | null;
  pedidosCliente?: number | null; motoboy?: string | null;
  prevista?: string | null; agendadoEm?: string | null; agendadoPara?: string | null;
}): string {
  const L: string[] = [
    centro(p.entregaRetirada === "RETIRADA NA LOJA" ? "PARA RETIRADA" : "PARA ENTREGA"),
    BARRA,
    centro(p.dataHora),
  ];
  if (p.prevista) L.push(centro(`Entrega prevista: ${p.prevista}`));
  L.push(centro("Neia Salgados"));
  if (p.agendadoEm) L.push(centro(`Agendado em ${p.agendadoEm}`));
  if (p.agendadoPara) L.push(centro(`Agendado para ${p.agendadoPara}`));
  L.push(BARRA, centro(`Pedido ${p.numero}`), TRACO, "Itens");
  p.itens.forEach((i) => {
    const nome = tituloCaso(i.nome);
    if (i.precoUnit != null) {
      L.push(linhaItem(`(${i.qtd}) ${nome}`, moedaCupom(Number(i.precoUnit) * i.qtd)));
    } else {
      L.push(lin(`(${i.qtd}) ${nome}`));
    }
    L.push(PONTOS);
  });
  L.push(TRACO, "Cliente");
  L.push(lin(`Nome: ${p.cliente}`));
  L.push(lin(`Telefone: ${p.telefone}`));
  if (p.pedidosCliente != null) L.push(lin(`Quantidade de pedidos: ${String(p.pedidosCliente).padStart(2, "0")}`));
  L.push(lin(`Entrega: ${p.endereco}`));
  const bairroLinha = [p.bairro, p.cidade].filter(Boolean).join(" - ");
  if (bairroLinha) L.push(lin(`Bairro: ${bairroLinha}`));
  if (p.cep) L.push(lin(`CEP: ${p.cep}`));
  if (p.complemento) L.push(lin(`Comp: ${p.complemento}`));
  if (p.referencia) L.push(lin(`Ref: ${p.referencia}`));
  L.push(lin(`Entregador: ${p.motoboy || "-"}`));
  L.push(TRACO, "Pagamento");
  L.push(lin(`Forma de Pagamento: ${p.pagamento}`));
  if (p.status === "PENDENTE_PGTO") L.push(centro("* Cobrar do cliente *"));
  if (p.subtotal != null || p.taxaEntrega != null || p.total != null) {
    if (p.subtotal != null) L.push(linhaItem("Subtotal:", moedaCupom(p.subtotal)));
    if (p.taxaEntrega != null) L.push(linhaItem("Taxa de entrega:", moedaCupom(p.taxaEntrega)));
    if (p.total != null) L.push(linhaItem("Total:", moedaCupom(p.total)));
  } else {
    L.push(centro(`*** TOTAL: ${p.totalUnidades} UN ***`));
  }
  if (p.observacoes && p.observacoes !== "-") L.push(lin(`Obs: ${p.observacoes}`));
  L.push(BARRA);
  return L.join("\n");
}

export function textoTeste(): string {
  return ["NEIA SALGADOS", "TESTE DE IMPRESSAO", "Tanca TP-550", new Date().toLocaleString("pt-BR"), "Impressao funcionando."].join("\n");
}

/** uuid do trabalho: pedido + evento + tentativa (reimpressão = novo uuid com ref). */
export function idTrabalho(pedidoId: string, evento: string): string {
  return `${pedidoId}:${evento}`;
}
