/**
 * A02.1 — Néia Inteligência / Monitoramento preventivo.
 *
 * Regras puras sobre os mesmos dados operacionais da A01. O Dashboard e a
 * tela dedicada consomem este módulo, para que os alertas não divirjam.
 *
 * Nenhuma regra cria tarefa, compra, pagamento ou campanha: cada saída apenas
 * descreve o fato/estimativa/previsão, os dados usados e a ação sugerida.
 */

export const CATEGORIAS_NEIA = [
  ["estoque", "Estoque"],
  ["producao", "Produção"],
  ["entregas", "Entregas"],
  ["financeiro", "Financeiro"],
  ["comercial", "Comercial"],
] as const;
export type CategoriaNeia = (typeof CATEGORIAS_NEIA)[number][0];

export const NATUREZAS_NEIA = [
  ["fato", "Fato"],
  ["estimativa", "Estimativa"],
  ["previsao", "Previsão"],
] as const;
export type NaturezaNeia = (typeof NATUREZAS_NEIA)[number][0];

export const PRIORIDADES_NEIA = [
  ["critica", "Crítica"],
  ["alta", "Alta"],
  ["normal", "Normal"],
  ["baixa", "Baixa"],
] as const;
export type PrioridadeNeia = (typeof PRIORIDADES_NEIA)[number][0];

export type TomNeia = "verde" | "vermelho" | "ouro" | "azul";

export type RecomendacaoNeia = {
  id: string;
  categoria: CategoriaNeia;
  prioridade: PrioridadeNeia;
  natureza: NaturezaNeia;
  tom: TomNeia;
  titulo: string;
  motivo: string;
  dados: string[];
  atualizadoEm: string;
  acao: string;
  destino: { to: string; hash?: string; rotulo: string };
  tarefa: { titulo: string; descricao: string };
};

export type EntradaNeia = {
  atualizadoEm: string;
  estoque?:
    | {
        reposicao: number;
        vencendo: number;
        vencidos: number;
      }
    | undefined;
  producao?:
    | {
        emProducao: number;
        atrasados: number;
        minutosFila: number | null;
        prazosEmRisco: number | null;
      }
    | undefined;
  entregas?:
    | {
        aguardandoColeta: number;
        motoboysDisponiveis: number | null;
        tempoMedioMinutos: number | null;
      }
    | undefined;
  financeiro?:
    | {
        vencido: number | null;
        lucro: number | null;
        margemParcial: boolean;
        custosCobertos: number | null;
        custosTotal: number | null;
      }
    | undefined;
  comercial?:
    | {
        crescimento: number | null;
        totalAtual: number | null;
        totalAnterior: number | null;
        reativar60a89: number | null;
        campanhasProntas: number | null;
      }
    | undefined;
};

export type ResultadoNeia = {
  recomendacoes: RecomendacaoNeia[];
  fontes: { categoria: CategoriaNeia; disponivel: boolean }[];
  semDados: boolean;
  resumo: Record<PrioridadeNeia, number>;
};

/**
 * O Dashboard preserva o conjunto aprovado na A01. A tela da A02.1 usa o
 * escopo completo, que acrescenta acompanhamentos preventivos.
 */
const IDS_A01 = new Set([
  "comercial-vendas",
  "estoque-revisar",
  "producao-risco",
  "producao-atrasos",
  "entregas-sem-motoboy",
  "financeiro-vencido",
  "financeiro-custos",
  "comercial-reativacao",
]);

const ordemPrioridade: Record<PrioridadeNeia, number> = {
  critica: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};
const ordemCategoria = new Map<CategoriaNeia, number>(
  CATEGORIAS_NEIA.map(([id], indice) => [id, indice]),
);

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const listar = (ids: string[], limite = 5) =>
  ids.length > limite
    ? ids.slice(0, limite).join(", ") + " e mais " + (ids.length - limite)
    : ids.join(", ");

const plural = (valor: number, singular: string, pluralTexto: string) =>
  valor === 1 ? singular : pluralTexto;

const valido = (valor: number | null | undefined): valor is number =>
  typeof valor === "number" && Number.isFinite(valor);

/** Cria a recomendação somente quando a regra tem dados suficientes. */
function criar(
  entrada: EntradaNeia,
  base: Omit<RecomendacaoNeia, "atualizadoEm" | "tarefa"> & {
    tarefa?: { titulo: string; descricao: string };
  },
): RecomendacaoNeia {
  return {
    ...base,
    atualizadoEm: entrada.atualizadoEm,
    tarefa: base.tarefa ?? { titulo: base.titulo, descricao: base.motivo + " " + base.acao },
  };
}

export function gerarRecomendacoesNeia(
  entrada: EntradaNeia,
  opcoes: { escopo?: "completo" | "a01" } = {},
): ResultadoNeia {
  const recomendacoes: RecomendacaoNeia[] = [];
  const estoque = entrada.estoque;
  const producao = entrada.producao;
  const entregas = entrada.entregas;
  const financeiro = entrada.financeiro;
  const comercial = entrada.comercial;

  // Comercial — variação de vendas contra o período anterior.
  if (comercial && valido(comercial.crescimento)) {
    const alta = comercial.crescimento > 0;
    recomendacoes.push(
      criar(entrada, {
        id: "comercial-vendas",
        categoria: "comercial",
        prioridade: alta ? "baixa" : "alta",
        natureza: "fato",
        tom: alta ? "verde" : "vermelho",
        titulo: alta ? "Vendas em alta" : "Vendas em queda",
        motivo:
          (valido(comercial.totalAtual) ? moeda.format(comercial.totalAtual) : "—") +
          " no período e " +
          (valido(comercial.totalAnterior) ? moeda.format(comercial.totalAnterior) : "—") +
          " no anterior. Variação de " +
          numero.format(comercial.crescimento) +
          "%.",
        dados: ["Pedidos e faturamento do período", "Faturamento do período anterior"],
        acao: alta
          ? "Acompanhar o ritmo de vendas e a capacidade da cozinha."
          : "Revisar mix, preços e campanhas antes de projetar o próximo período.",
        destino: { to: "/admin", hash: "pedidos", rotulo: "Conferir pedidos" },
      }),
    );
  }

  // Estoque — saldo mínimo e validade na mesma leitura da A01.
  if (estoque) {
    const reposicao = valido(estoque.reposicao) ? estoque.reposicao : 0;
    const vencendo = valido(estoque.vencendo) ? estoque.vencendo : 0;
    const vencidos = valido(estoque.vencidos) ? estoque.vencidos : 0;
    if (reposicao > 0 || vencendo > 0 || vencidos > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "estoque-revisar",
          categoria: "estoque",
          prioridade: vencidos > 0 ? "critica" : "alta",
          natureza: "fato",
          tom: vencidos > 0 ? "vermelho" : "ouro",
          titulo: "Revisar estoque",
          motivo:
            reposicao +
            " " +
            plural(
              reposicao,
              "sabor com necessidade de reposição",
              "sabores com necessidade de reposição",
            ) +
            ", " +
            (vencendo + vencidos) +
            " " +
            plural(vencendo + vencidos, "com alerta de validade", "com alerta de validade") +
            (vencidos > 0
              ? " (" + vencidos + " " + plural(vencidos, "vencido", "vencidos") + ")"
              : "") +
            ".",
          dados: [
            "Saldos por sabor (lotes ativos, reservas e mínimo)",
            "Validade dos lotes ativos",
          ],
          acao: "Conferir lotes, retirar vencidos e registrar a reposição necessária.",
          destino: { to: "/admin", hash: "estoque-salgados", rotulo: "Conferir estoque" },
        }),
      );
    }
  }

  // Produção — previsão de atraso a partir da carga estimada da cozinha.
  if (producao) {
    if (
      valido(producao.prazosEmRisco) &&
      producao.prazosEmRisco > 0 &&
      valido(producao.minutosFila)
    ) {
      recomendacoes.push(
        criar(entrada, {
          id: "producao-risco",
          categoria: "producao",
          prioridade: "alta",
          natureza: "previsao",
          tom: "ouro",
          titulo: "Risco nos agendados",
          motivo:
            producao.prazosEmRisco +
            " " +
            plural(producao.prazosEmRisco, "prazo dentro dos", "prazos dentro dos") +
            " " +
            Math.round(producao.minutosFila) +
            " min estimados para a fila. Confira a ordem de preparo.",
          dados: ["Fila ativa de produção", "Tempos de preparo estimados", "Horários agendados"],
          acao: "Reordenar a fila de preparo antes do horário prometido ao cliente.",
          destino: { to: "/producao", rotulo: "Abrir produção" },
        }),
      );
    }
    if (valido(producao.atrasados) && producao.atrasados > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "producao-atrasos",
          categoria: "producao",
          prioridade: "critica",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Pedidos em atraso",
          motivo:
            producao.atrasados +
            " " +
            plural(producao.atrasados, "pedido ativo está", "pedidos ativos estão") +
            " sinalizado" +
            (producao.atrasados === 1 ? "" : "s") +
            " com atraso no ERP.",
          dados: ["Fila ativa de pedidos", "Sinalização de atraso do ERP"],
          acao: "Priorizar a conclusão e avisar o cliente sobre o novo prazo.",
          destino: { to: "/admin", hash: "pedidos", rotulo: "Conferir pedidos" },
        }),
      );
    }
  }

  // Entregas — pedidos parados sem condutor disponível.
  if (entregas) {
    const aguardando = valido(entregas.aguardandoColeta) ? entregas.aguardandoColeta : 0;
    if (aguardando > 0 && entregas.motoboysDisponiveis === 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "entregas-sem-motoboy",
          categoria: "entregas",
          prioridade: "alta",
          natureza: "fato",
          tom: "ouro",
          titulo: "Organizar próxima saída",
          motivo:
            aguardando +
            " " +
            plural(aguardando, "pedido aguardando", "pedidos aguardando") +
            " coleta e nenhum motoboy disponível na base. Confira retornos e endereços.",
          dados: ["Fila de entregas aguardando coleta", "Motoboys disponíveis na base"],
          acao: "Conferir disponibilidade da equipe de entregas antes de prometer novos prazos.",
          destino: { to: "/central-entregas", rotulo: "Abrir Central" },
        }),
      );
    }
    if (aguardando > 0 && valido(entregas.tempoMedioMinutos) && entregas.tempoMedioMinutos > 60) {
      recomendacoes.push(
        criar(entrada, {
          id: "entregas-tempo",
          categoria: "entregas",
          prioridade: "normal",
          natureza: "estimativa",
          tom: "ouro",
          titulo: "Tempo de entrega acima do usual",
          motivo:
            "Média de " +
            Math.round(entregas.tempoMedioMinutos) +
            " min entre saída e entrega no período, com " +
            aguardando +
            " " +
            plural(aguardando, "pedido ainda na fila", "pedidos ainda na fila") +
            ".",
          dados: ["Saída e entrega dos pedidos do período", "Fila atual de entregas"],
          acao: "Revisar rotas e a ordem de coleta para reduzir o tempo médio.",
          destino: { to: "/central-entregas", rotulo: "Abrir Central" },
        }),
      );
    }
  }

  // Financeiro — contas vencidas, resultado e custos incompletos.
  if (financeiro) {
    if (valido(financeiro.vencido) && financeiro.vencido > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "financeiro-vencido",
          categoria: "financeiro",
          prioridade: "critica",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Conferir contas vencidas",
          motivo:
            moeda.format(financeiro.vencido) + " de saldo pendente em contas a pagar vencidas.",
          dados: ["Contas a pagar do período", "Saldo pendente por vencimento"],
          acao: "Conferir as contas e programar o pagamento com o responsável.",
          destino: { to: "/financeiro", hash: "contas-financeiro", rotulo: "Abrir contas" },
        }),
      );
    }
    if (valido(financeiro.lucro) && financeiro.lucro < 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "financeiro-resultado",
          categoria: "financeiro",
          prioridade: "alta",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Resultado do período negativo",
          motivo:
            "Lucro estimado de " +
            moeda.format(financeiro.lucro) +
            " após custos dos produtos e despesas pagas.",
          dados: ["Margem por pedido", "Despesas pagas fora do custo dos produtos"],
          acao: "Revisar despesas e preços antes de assumir novos compromissos.",
          destino: { to: "/financeiro", hash: "relatorios", rotulo: "Abrir relatórios" },
        }),
      );
    }
    if (financeiro.margemParcial && valido(financeiro.custosTotal) && financeiro.custosTotal > 0) {
      const cobertos = valido(financeiro.custosCobertos) ? financeiro.custosCobertos : 0;
      recomendacoes.push(
        criar(entrada, {
          id: "financeiro-custos",
          categoria: "financeiro",
          prioridade: "normal",
          natureza: "estimativa",
          tom: "ouro",
          titulo: "Completar cadastro de custos",
          motivo:
            cobertos +
            " de " +
            financeiro.custosTotal +
            " pedidos têm custos registrados para todos os itens.",
          dados: ["Pedidos do período", "Custo cadastrado por produto"],
          acao: "Completar o custo dos produtos para fechar a margem do período.",
          destino: { to: "/admin", hash: "produtos", rotulo: "Ver produtos" },
        }),
      );
    }
  }

  // Comercial — reativação e campanhas prontas.
  if (comercial && valido(comercial.reativar60a89) && comercial.reativar60a89 > 0) {
    recomendacoes.push(
      criar(entrada, {
        id: "comercial-reativacao",
        categoria: "comercial",
        prioridade: "normal",
        natureza: "fato",
        tom: "verde",
        titulo: "Oportunidade de reativação",
        motivo:
          comercial.reativar60a89 +
          " clientes do CRM sem compra há 60–89 dias. Confira elegibilidade antes de preparar uma campanha.",
        dados: ["Base do CRM", "Última compra e opt-out de cada cliente"],
        acao: "Revisar a lista elegível antes de criar qualquer campanha.",
        destino: { to: "/campanhas", rotulo: "Abrir Comercial" },
      }),
    );
  }
  if (comercial && valido(comercial.campanhasProntas) && comercial.campanhasProntas > 0) {
    recomendacoes.push(
      criar(entrada, {
        id: "comercial-campanhas",
        categoria: "comercial",
        prioridade: "baixa",
        natureza: "fato",
        tom: "azul",
        titulo: "Campanhas prontas para revisão",
        motivo:
          comercial.campanhasProntas +
          " " +
          plural(comercial.campanhasProntas, "campanha está pronta", "campanhas estão prontas") +
          " aguardando revisão antes do envio.",
        dados: ["Campanhas do CRM com status pronta"],
        acao: "Revisar público e mensagem; o envio continua sendo uma decisão humana.",
        destino: { to: "/campanhas", hash: "campanhas", rotulo: "Revisar campanhas" },
      }),
    );
  }

  const unicas = new Map<string, RecomendacaoNeia>();
  for (const recomendacao of recomendacoes) {
    if (!unicas.has(recomendacao.id)) unicas.set(recomendacao.id, recomendacao);
  }
  const escopoA01 = opcoes.escopo === "a01";
  const lista = [...unicas.values()]
    .filter((recomendacao) => !escopoA01 || IDS_A01.has(recomendacao.id))
    .sort(
      (a, b) =>
        ordemPrioridade[a.prioridade] - ordemPrioridade[b.prioridade] ||
        (ordemCategoria.get(a.categoria) ?? 0) - (ordemCategoria.get(b.categoria) ?? 0) ||
        a.titulo.localeCompare(b.titulo, "pt-BR"),
    );

  const resumo: Record<PrioridadeNeia, number> = { critica: 0, alta: 0, normal: 0, baixa: 0 };
  for (const recomendacao of lista) resumo[recomendacao.prioridade] += 1;

  const fontes = CATEGORIAS_NEIA.map(([categoria]) => ({
    categoria,
    disponivel: Boolean(entrada[categoria]),
  }));

  return {
    recomendacoes: lista,
    fontes,
    semDados: fontes.every((fonte) => !fonte.disponivel),
    resumo,
  };
}

export function rotuloCategoriaNeia(categoria: CategoriaNeia) {
  return CATEGORIAS_NEIA.find(([id]) => id === categoria)?.[1] ?? categoria;
}

export function rotuloNaturezaNeia(natureza: NaturezaNeia) {
  return NATUREZAS_NEIA.find(([id]) => id === natureza)?.[1] ?? natureza;
}

export function rotuloPrioridadeNeia(prioridade: PrioridadeNeia) {
  return PRIORIDADES_NEIA.find(([id]) => id === prioridade)?.[1] ?? prioridade;
}
