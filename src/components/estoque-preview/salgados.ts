// E1 — regras puras e fixtures locais. Nunca importa cliente de banco ou pedidos reais.
import { alocarFEFO, ordenarFEFO, validadeProxima, type Lote } from "@/lib/lotes";
import type { TipoVenda } from "@/lib/catalog";

export const DATA_DEMO = "2026-11-14";
export type Resultado<T> = { ok: true; estado: T; mensagem: string } | { ok: false; erro: string };
export type Movimento = {
  id: string;
  itemId: string;
  tipo: string;
  quantidade: number;
  antes: number;
  depois: number;
  unidade: string;
  motivo: string;
  referencia: string;
  data: string;
  lotes?: string;
};
export type ProdutoDemo = {
  id: string;
  nome: string;
  categoria: string;
  fornecedor: string;
  minimo: number;
  imagem: string;
  descricao: string;
  sabor: string;
  natureza: "salgado_congelado" | "bebida" | "outro";
  preparo: "frito" | "assado" | "outro";
  preco: number;
  tipoVenda: TipoVenda;
  ativo: boolean;
};
export type ReservaDemo = {
  id: string;
  pedido: string;
  produtoId: string;
  quantidade: number;
  consumida: number;
  liberada: number;
  /** Referência interna da origem (id do combo) para auditoria. Não cria saldo. */
  origemId?: string;
};
export type SalgadosState = {
  produtos: ProdutoDemo[];
  lotes: Lote[];
  reservas: ReservaDemo[];
  historico: Movimento[];
  processadas: string[];
};

export const PRODUTOS_DEMO: ProdutoDemo[] = (
  [
    {
      id: "produto-coxinha",
      nome: "Coxinha de Frango",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 1000,
      imagem: "coxinha",
    },
    {
      id: "produto-queijo",
      nome: "Bolinha de Queijo",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 800,
      imagem: "queijo",
    },
    {
      id: "produto-risoles",
      nome: "Risoles P&Q",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 800,
      imagem: "croquete",
    },
    {
      id: "produto-kibe",
      nome: "Kibe",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 1000,
      imagem: "kibe",
    },
    {
      id: "produto-croquete",
      nome: "Croquete",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 600,
      imagem: "croquete",
    },
    {
      id: "produto-calabresa",
      nome: "Bolinho de Calabresa",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 600,
      imagem: "kibe",
    },
    {
      id: "produto-milho",
      nome: "Bolinho de Milho c/ Queijo",
      categoria: "Fritos",
      fornecedor: "Produção Néia",
      minimo: 800,
      imagem: "queijo",
    },
    {
      id: "produto-esfiha",
      nome: "Esfiha de Carne",
      categoria: "Assados",
      fornecedor: "Produção Néia",
      minimo: 500,
      imagem: "croquete",
    },
    {
      id: "produto-enrolado",
      nome: "Enroladinho de Presunto",
      categoria: "Assados",
      fornecedor: "Produção Néia",
      minimo: 400,
      imagem: "croquete",
    },
  ] satisfies Omit<
    ProdutoDemo,
    "descricao" | "sabor" | "natureza" | "preparo" | "preco" | "tipoVenda" | "ativo"
  >[]
).map((p) => ({
  ...p,
  descricao: `${p.nome} — exemplo fictício para homologação.`,
  sabor: p.nome,
  natureza: "salgado_congelado",
  preparo: p.categoria === "Assados" ? "assado" : "frito",
  preco: p.categoria === "Assados" ? 2.3 : 1.6,
  tipoVenda: "combo_50",
  ativo: true,
}));
export const COMBO_DEMO = [
  { produtoId: "produto-coxinha", quantidade: 50 },
  { produtoId: "produto-queijo", quantidade: 30 },
  { produtoId: "produto-kibe", quantidade: 20 },
];
export function criarSalgadosDemo(): SalgadosState {
  const quantidades = [
    [800, 700, 500],
    [800, 700],
    [600, 600],
    [600, 700, 500],
    [1000],
    [600, 600],
    [700, 800],
    [300],
    [240],
  ];
  const reservas = [350, 250, 150, 300, 100, 150, 200, 50, 0];
  return {
    produtos: structuredClone(PRODUTOS_DEMO),
    lotes: PRODUTOS_DEMO.flatMap((p, i) =>
      (quantidades[i] ?? []).map((q, j) => ({
        id: `${p.id}-lote-${j}`,
        produto_id: p.id,
        codigo: `${i === 0 ? "CF" : `S${i + 1}`}-${76 + j}`,
        quantidade: q,
        restante: q,
        validade: ["2026-11-18", "2026-11-28", "2026-12-05"][j] ?? "2026-12-05",
        status: "ativo" as const,
      })),
    ),
    reservas: PRODUTOS_DEMO.flatMap((p, i) =>
      (reservas[i] ?? 0) > 0
        ? [
            {
              id: `reserva-inicial-${i}`,
              pedido: `PED-DEMO-${1053 + i}`,
              produtoId: p.id,
              quantidade: reservas[i] ?? 0,
              consumida: 0,
              liberada: 0,
            },
          ]
        : [],
    ),
    historico: [
      {
        id: "inicial-1",
        itemId: "produto-coxinha",
        tipo: "Entrada",
        quantidade: 1000,
        antes: 1000,
        depois: 2000,
        unidade: "un.",
        motivo: "Produção demonstrativa recebida no freezer",
        referencia: "PROD-DEMO-01",
        data: "2026-11-13T14:32:00",
      },
    ],
    processadas: [],
  };
}
export const restanteReserva = (r: ReservaDemo) => r.quantidade - r.consumida - r.liberada;
export const ehSalgadoCongelado = (p: ProdutoDemo) => p.natureza === "salgado_congelado";
export function saldoSalgado(s: SalgadosState, produtoId: string) {
  const fisico = s.lotes
    .filter((l) => l.produto_id === produtoId)
    .reduce((n, l) => n + l.restante, 0);
  const reservado = s.reservas
    .filter((r) => r.produtoId === produtoId)
    .reduce((n, r) => n + restanteReserva(r), 0);
  return { fisico, reservado, disponivel: fisico - reservado };
}
export function lotesFEFO(s: SalgadosState, produtoId: string) {
  return ordenarFEFO(s.lotes.filter((l) => l.produto_id === produtoId));
}
export const alertaValidade = (l: Lote) =>
  l.status === "ativo" &&
  l.restante > 0 &&
  validadeProxima(l.validade, 7, new Date(`${DATA_DEMO}T00:00:00`));
export function indicadoresSalgados(s: SalgadosState) {
  return s.produtos.filter(ehSalgadoCongelado).reduce(
    (total, p) => {
      const saldo = saldoSalgado(s, p.id);
      return {
        fisico: total.fisico + saldo.fisico,
        reservado: total.reservado + saldo.reservado,
        disponivel: total.disponivel + saldo.disponivel,
        baixos: total.baixos + Number(saldo.disponivel < p.minimo),
        lotes: total.lotes + lotesFEFO(s, p.id).length,
      };
    },
    { fisico: 0, reservado: 0, disponivel: 0, baixos: 0, lotes: 0 },
  );
}
function validarOperacao(s: SalgadosState, id: string) {
  return !id.trim()
    ? "Operação sem identificador."
    : s.processadas.includes(id)
      ? "Movimentação já registrada; baixa duplicada bloqueada."
      : null;
}
function evento(s: SalgadosState, id: string, dados: Omit<Movimento, "id" | "data" | "unidade">) {
  s.historico.unshift({
    ...dados,
    id: `${id}-${s.historico.length}`,
    data: `${DATA_DEMO}T10:${String(s.historico.length % 60).padStart(2, "0")}:00`,
    unidade: "un.",
  });
}
export function reservarPedido(
  s: SalgadosState,
  id: string,
  pedido: string,
  itens: { produtoId: string; quantidade: number }[],
  origem?: string,
  origemId?: string,
): Resultado<SalgadosState> {
  const erro = validarOperacao(s, id);
  if (erro) return { ok: false, erro };
  const referencia = pedido.trim();
  if (!referencia || !itens.length)
    return { ok: false, erro: "Informe a referência do pedido confirmado e seus sabores." };
  if (s.reservas.some((r) => r.pedido === referencia))
    return {
      ok: false,
      erro: "Pedido já possui reserva registrada. Confirmação duplicada bloqueada.",
    };
  const agrupados = new Map<string, number>();
  for (const item of itens) {
    if (
      !Number.isSafeInteger(item.quantidade) ||
      item.quantidade <= 0 ||
      !s.produtos.some((p) => p.id === item.produtoId && p.ativo && ehSalgadoCongelado(p))
    )
      return { ok: false, erro: "Sabor e quantidade inteira positiva são obrigatórios." };
    agrupados.set(item.produtoId, (agrupados.get(item.produtoId) ?? 0) + item.quantidade);
  }
  for (const [produtoId, quantidade] of agrupados) {
    if (quantidade > saldoSalgado(s, produtoId).disponivel)
      return { ok: false, erro: "Reserva acima do disponível. Nenhum sabor foi reservado." };
  }
  const novo = structuredClone(s);
  for (const [produtoId, quantidade] of agrupados) {
    const fisico = saldoSalgado(novo, produtoId).fisico;
    novo.reservas.push({
      id: `${id}-${produtoId}`,
      pedido: referencia,
      produtoId,
      quantidade,
      consumida: 0,
      liberada: 0,
      ...(origemId ? { origemId } : {}),
    });
    evento(novo, id, {
      itemId: produtoId,
      tipo: "Reserva",
      quantidade,
      antes: fisico,
      depois: fisico,
      motivo: origem
        ? `${origem} — pedido confirmado, reserva por sabor, sem baixa física`
        : "Pedido confirmado — reserva por sabor, sem baixa física",
      referencia,
    });
  }
  novo.processadas.push(id);
  return {
    ok: true,
    estado: novo,
    mensagem: "Pedido reservado por sabor. O estoque físico não foi reduzido.",
  };
}
export function cancelarReserva(
  s: SalgadosState,
  id: string,
  pedido: string,
): Resultado<SalgadosState> {
  const erro = validarOperacao(s, id);
  if (erro) return { ok: false, erro };
  const reservas = s.reservas.filter((r) => r.pedido === pedido && restanteReserva(r) > 0);
  if (!reservas.length)
    return { ok: false, erro: "Não há reserva pendente para liberar neste pedido." };
  const novo = structuredClone(s);
  for (const r of novo.reservas.filter((r) => r.pedido === pedido && restanteReserva(r) > 0)) {
    const quantidade = restanteReserva(r),
      fisico = saldoSalgado(novo, r.produtoId).fisico;
    r.liberada += quantidade;
    evento(novo, id, {
      itemId: r.produtoId,
      tipo: "Liberação de reserva",
      quantidade,
      antes: fisico,
      depois: fisico,
      motivo: "Cancelamento: libera somente a parte não retirada",
      referencia: pedido,
    });
  }
  novo.processadas.push(id);
  return {
    ok: true,
    estado: novo,
    mensagem: "Reserva ainda não consumida liberada; o físico não foi alterado.",
  };
}
export type AcaoSalgado = {
  id: string;
  produtoId: string;
  tipo: "entrada" | "retirada" | "perda" | "ajuste";
  quantidade: number;
  motivo: string;
  codigo?: string;
  validade?: string;
  loteId?: string;
  reservaId?: string;
};
export function movimentarSalgado(s: SalgadosState, a: AcaoSalgado): Resultado<SalgadosState> {
  const erro = validarOperacao(s, a.id);
  if (erro) return { ok: false, erro };
  if (!s.produtos.some((p) => p.id === a.produtoId && ehSalgadoCongelado(p)))
    return { ok: false, erro: "Produto não encontrado no cadastro de salgados congelados." };
  if (
    !Number.isSafeInteger(a.quantidade) ||
    a.quantidade < 0 ||
    (a.tipo !== "ajuste" && a.quantidade === 0)
  )
    return {
      ok: false,
      erro: "Informe quantidade inteira válida; não são permitidos saldos negativos.",
    };
  if (!a.motivo.trim())
    return { ok: false, erro: "Informe a justificativa ou referência da movimentação." };
  const saldo = saldoSalgado(s, a.produtoId);
  const novo = structuredClone(s);
  let delta = a.quantidade,
    referencia = a.codigo?.trim() ?? "Manual",
    alocacao = "";
  if (a.tipo === "entrada") {
    if (
      !a.codigo?.trim() ||
      !a.validade ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.validade) ||
      !Number.isFinite(Date.parse(a.validade)) ||
      new Date(a.validade).toISOString().slice(0, 10) !== a.validade ||
      a.validade < DATA_DEMO
    )
      return {
        ok: false,
        erro: "Informe lote e validade válida, não vencida na data demonstrativa.",
      };
    if (!Number.isSafeInteger(saldo.fisico + a.quantidade))
      return { ok: false, erro: "Quantidade acima do limite de precisão permitido." };
    if (
      s.lotes.some(
        (l) =>
          l.produto_id === a.produtoId && l.codigo.toLowerCase() === a.codigo!.trim().toLowerCase(),
      )
    )
      return { ok: false, erro: "Código de lote já cadastrado para este produto." };
    novo.lotes.push({
      id: `lote-${a.id}`,
      produto_id: a.produtoId,
      codigo: a.codigo.trim(),
      quantidade: a.quantidade,
      restante: a.quantidade,
      validade: a.validade,
      status: "ativo",
    });
  } else if (a.tipo === "ajuste") {
    const lote = novo.lotes.find((l) => l.id === a.loteId && l.produto_id === a.produtoId);
    if (!lote) return { ok: false, erro: "Selecione o lote contado no inventário." };
    delta = a.quantidade - lote.restante;
    if (saldo.fisico + delta < saldo.reservado)
      return {
        ok: false,
        erro: "A contagem deixaria saldo físico menor que o reservado. Confira as reservas.",
      };
    lote.restante = a.quantidade;
    lote.quantidade = Math.max(lote.quantidade, a.quantidade);
    lote.status = a.quantidade ? "ativo" : "esgotado";
    referencia = lote.codigo;
  } else {
    const reserva = a.reservaId
      ? novo.reservas.find((r) => r.id === a.reservaId && r.produtoId === a.produtoId)
      : undefined;
    if (
      a.reservaId &&
      (!reserva || a.tipo !== "retirada" || a.quantidade > restanteReserva(reserva))
    )
      return {
        ok: false,
        erro: "Reserva inexistente, já consumida/liberada ou quantidade acima do saldo reservado.",
      };
    if (!reserva && a.quantidade > saldo.disponivel)
      return {
        ok: false,
        erro: "Quantidade acima do disponível. Reservas de outros pedidos estão protegidas.",
      };
    const alocacoes = alocarFEFO(
      novo.lotes.filter(
        (l) => l.produto_id === a.produtoId && !!l.validade && l.validade >= DATA_DEMO,
      ),
      a.quantidade,
    );
    if (!alocacoes)
      return { ok: false, erro: "Não há lotes utilizáveis suficientes para a retirada FEFO." };
    for (const parte of alocacoes) {
      const lote = novo.lotes.find((l) => l.id === parte.loteId)!;
      lote.restante -= parte.qtd;
      if (!lote.restante) lote.status = "esgotado";
    }
    if (reserva) {
      reserva.consumida += a.quantidade;
      referencia = reserva.pedido;
    }
    alocacao = alocacoes
      .map((p) => `${novo.lotes.find((l) => l.id === p.loteId)!.codigo}: ${p.qtd} un.`)
      .join("; ");
    delta = -a.quantidade;
  }
  evento(novo, a.id, {
    itemId: a.produtoId,
    tipo: {
      entrada: "Entrada",
      retirada: "Retirada do freezer",
      perda: "Perda",
      ajuste: "Ajuste de inventário",
    }[a.tipo],
    quantidade: delta,
    antes: saldo.fisico,
    depois: saldo.fisico + delta,
    motivo: a.motivo.trim(),
    referencia,
    lotes: alocacao,
  });
  novo.processadas.push(a.id);
  return {
    ok: true,
    estado: novo,
    mensagem: "Movimentação demonstrativa registrada. Saldos e histórico atualizados.",
  };
}
