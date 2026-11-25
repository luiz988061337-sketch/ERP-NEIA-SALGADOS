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

/**
 * Situação da leitura de cada fonte. Ausência de registros e falha de consulta
 * são estados diferentes e nunca são tratados como operação normal.
 */
export const SITUACOES_FONTE_NEIA = [
  ["suficiente", "Dados suficientes"],
  ["parcial", "Dados parciais"],
  ["sem-registros", "Sem registros"],
  ["falha", "Falha na consulta"],
] as const;
export type SituacaoFonteNeia = (typeof SITUACOES_FONTE_NEIA)[number][0];

export type SaborEstoqueNeia = {
  nome: string;
  /** `null` quando o sabor nunca teve lote cadastrado (não é estoque zerado). */
  fisico: number | null;
  reservado: number;
  disponivel: number | null;
  minimo: number | null;
};

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
  /** Situação explícita de cada fonte; prevalece sobre a inferência. */
  fontes?: Partial<Record<CategoriaNeia, SituacaoFonteNeia>>;
  estoque?:
    | {
        reposicao: number;
        vencendo: number;
        vencidos: number;
        /** Saldo físico por sabor, para separar ausência de cadastro de zero. */
        sabores?: SaborEstoqueNeia[];
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
        /** Pedidos ativos com atraso de entrega registrado. */
        atrasadas?: number | null;
      }
    | undefined;
  financeiro?:
    | {
        vencido: number | null;
        /** Contas a pagar que vencem nos próximos dias. */
        vencendo?: number | null;
        /** Contas a receber já vencidas. */
        recebimentosAtrasados?: number | null;
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
        reativar30a59?: number | null;
        reativar60a89: number | null;
        reativar90mais?: number | null;
        campanhasProntas: number | null;
      }
    | undefined;
};

export type FonteNeia = {
  categoria: CategoriaNeia;
  situacao: SituacaoFonteNeia;
  /** `true` quando a leitura foi confirmada (inclusive sem registros). */
  disponivel: boolean;
};

export type ResultadoNeia = {
  recomendacoes: RecomendacaoNeia[];
  fontes: FonteNeia[];
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

  // Comercial — variação de vendas contra o período anterior. Zero é neutro:
  // não representa queda nem alta.
  if (comercial && valido(comercial.crescimento)) {
    const variacao = comercial.crescimento;
    const alta = variacao > 0;
    const queda = variacao < 0;
    recomendacoes.push(
      criar(entrada, {
        id: "comercial-vendas",
        categoria: "comercial",
        prioridade: queda ? "alta" : "baixa",
        natureza: "fato",
        tom: queda ? "vermelho" : alta ? "verde" : "azul",
        titulo: queda ? "Vendas em queda" : alta ? "Vendas em alta" : "Vendas estáveis",
        motivo:
          (valido(comercial.totalAtual) ? moeda.format(comercial.totalAtual) : "—") +
          " no período e " +
          (valido(comercial.totalAnterior) ? moeda.format(comercial.totalAnterior) : "—") +
          " no anterior. Variação de " +
          numero.format(variacao) +
          "%" +
          (queda ? "." : alta ? "." : " — estabilidade não é queda."),
        dados: ["Pedidos e faturamento do período", "Faturamento do período anterior"],
        acao: queda
          ? "Revisar mix, preços e campanhas antes de projetar o próximo período."
          : alta
            ? "Acompanhar o ritmo de vendas e a capacidade da cozinha."
            : "Manter o acompanhamento do ritmo; estabilidade isolada não exige correção.",
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

    const sabores = estoque.sabores ?? [];
    const semLote = sabores.filter((sabor) => sabor.fisico === null);
    const zerados = sabores.filter((sabor) => sabor.fisico === 0);
    const semMinimo = sabores.filter((sabor) => sabor.minimo === null);
    const reservaExcedida = sabores.filter(
      (sabor) => valido(sabor.disponivel) && sabor.disponivel < 0,
    );

    // Ausência de cadastro é diferente de estoque zerado: o sabor nunca teve
    // lote registrado, então não há leitura de saldo para ele.
    if (semLote.length > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "estoque-sem-cadastro",
          categoria: "estoque",
          prioridade: "alta",
          natureza: "fato",
          tom: "ouro",
          titulo: "Sabores sem estoque cadastrado",
          motivo:
            semLote.length +
            " " +
            plural(semLote.length, "sabor não tem", "sabores não têm") +
            " lote de estoque físico registrado: " +
            listar(semLote.map((sabor) => sabor.nome)) +
            ". A ausência de cadastro não significa estoque zerado.",
          dados: ["Cadastro de sabores", "Lotes de estoque físico por sabor"],
          acao: "Conferir o cadastro e registrar o primeiro lote antes de prometer disponibilidade.",
          destino: { to: "/admin", hash: "estoque-salgados", rotulo: "Conferir estoque" },
          tarefa: {
            titulo: "Cadastrar estoque dos sabores sem lote",
            descricao:
              "Sabores sem lote físico registrado: " +
              listar(semLote.map((sabor) => sabor.nome)) +
              ". Registrar a entrada inicial ou confirmar que o sabor está fora de linha.",
          },
        }),
      );
    }
    if (zerados.length > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "estoque-zerado",
          categoria: "estoque",
          prioridade: "critica",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Estoque físico zerado",
          motivo:
            zerados.length +
            " " +
            plural(zerados.length, "sabor está", "sabores estão") +
            " com lote cadastrado e saldo físico zerado: " +
            listar(zerados.map((sabor) => sabor.nome)) +
            ". Há cadastro, mas não há saldo disponível.",
          dados: ["Lotes ativos por sabor", "Saldo físico e reservas"],
          acao: "Repor ou pausar a venda desses sabores até a entrada de um novo lote.",
          destino: { to: "/admin", hash: "estoque-salgados", rotulo: "Conferir estoque" },
        }),
      );
    }
    if (reservaExcedida.length > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "estoque-reserva",
          categoria: "estoque",
          prioridade: "critica",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Reserva acima do estoque físico",
          motivo:
            reservaExcedida.length +
            " " +
            plural(
              reservaExcedida.length,
              "sabor tem reserva maior que o físico",
              "sabores têm reserva maior que o físico",
            ) +
            ": " +
            listar(
              reservaExcedida.map(
                (sabor) =>
                  sabor.nome +
                  " (" +
                  sabor.reservado +
                  " reservados / " +
                  sabor.fisico +
                  " físico)",
              ),
            ) +
            ".",
          dados: ["Reservas ativas", "Consumos das reservas", "Lotes ativos por sabor"],
          acao: "Conferir as reservas e o estoque antes de confirmar novos pedidos.",
          destino: { to: "/admin", hash: "estoque-salgados", rotulo: "Conferir estoque" },
        }),
      );
    }
    if (semMinimo.length > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "estoque-sem-minimo",
          categoria: "estoque",
          prioridade: "normal",
          natureza: "fato",
          tom: "ouro",
          titulo: "Definir estoque mínimo",
          motivo:
            semMinimo.length +
            " " +
            plural(semMinimo.length, "sabor está", "sabores estão") +
            " sem estoque mínimo definido: " +
            listar(semMinimo.map((sabor) => sabor.nome)) +
            ". Sem mínimo, a reposição não tem parâmetro de comparação.",
          dados: ["Cadastro de produtos", "Estoque mínimo por sabor"],
          acao: "Definir o mínimo operacional de cada sabor para o alerta de reposição.",
          destino: { to: "/admin", hash: "produtos", rotulo: "Ver produtos" },
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
    if (valido(entregas.atrasadas) && entregas.atrasadas > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "entregas-atrasadas",
          categoria: "entregas",
          prioridade: "critica",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Entregas em atraso",
          motivo:
            entregas.atrasadas +
            " " +
            plural(
              entregas.atrasadas,
              "pedido tem atraso de entrega registrado",
              "pedidos têm atraso de entrega registrado",
            ) +
            " e ainda não foram resolvidos.",
          dados: ["Registros de atraso de entrega", "Fila ativa de entregas"],
          acao: "Conferir cada pedido atrasado, avisar o cliente e registrar a tratativa.",
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
    if (valido(financeiro.vencendo) && financeiro.vencendo > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "financeiro-vencendo",
          categoria: "financeiro",
          prioridade: "normal",
          natureza: "previsao",
          tom: "ouro",
          titulo: "Contas próximas do vencimento",
          motivo:
            moeda.format(financeiro.vencendo) +
            " de saldo pendente em contas a pagar que vencem nos próximos 7 dias.",
          dados: ["Contas a pagar pendentes", "Data de vencimento de cada conta"],
          acao: "Conferir o caixa e programar os pagamentos antes do vencimento.",
          destino: { to: "/financeiro", hash: "contas-financeiro", rotulo: "Abrir contas" },
        }),
      );
    }
    if (valido(financeiro.recebimentosAtrasados) && financeiro.recebimentosAtrasados > 0) {
      recomendacoes.push(
        criar(entrada, {
          id: "financeiro-recebimentos",
          categoria: "financeiro",
          prioridade: "alta",
          natureza: "fato",
          tom: "vermelho",
          titulo: "Recebimentos atrasados",
          motivo:
            moeda.format(financeiro.recebimentosAtrasados) +
            " de saldo pendente em contas a receber já vencidas.",
          dados: ["Contas a receber pendentes", "Data de vencimento de cada conta"],
          acao: "Conferir os recebimentos e cobrar os valores em atraso.",
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

  // Comercial — reativação por faixa de inatividade. Os totais recebidos já
  // respeitam o opt-out; a elegibilidade continua sendo conferida antes do envio.
  if (comercial) {
    const bandasReativacao = [
      {
        rotulo: "30–59 dias",
        total: valido(comercial.reativar30a59) ? comercial.reativar30a59 : 0,
      },
      {
        rotulo: "60–89 dias",
        total: valido(comercial.reativar60a89) ? comercial.reativar60a89 : 0,
      },
      {
        rotulo: "90 dias ou mais",
        total: valido(comercial.reativar90mais) ? comercial.reativar90mais : 0,
      },
    ];
    const comInativos = bandasReativacao.filter((banda) => banda.total > 0);
    if (comInativos.length > 0) {
      const total = comInativos.reduce((soma, banda) => soma + banda.total, 0);
      recomendacoes.push(
        criar(entrada, {
          id: "comercial-reativacao",
          categoria: "comercial",
          prioridade: "normal",
          natureza: "fato",
          tom: "verde",
          titulo: "Oportunidade de reativação",
          motivo:
            total +
            " " +
            plural(total, "cliente está", "clientes estão") +
            " sem compra e sem opt-out: " +
            comInativos.map((banda) => banda.total + " em " + banda.rotulo).join(", ") +
            ". Confira elegibilidade antes de preparar uma campanha.",
          dados: ["Base do CRM", "Última compra e opt-out de cada cliente"],
          acao: "Revisar a lista elegível antes de criar qualquer campanha.",
          destino: { to: "/campanhas", rotulo: "Abrir Comercial" },
        }),
      );
    }
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

  const fontes: FonteNeia[] = CATEGORIAS_NEIA.map(([categoria]) => {
    const situacao = entrada.fontes?.[categoria] ?? (entrada[categoria] ? "suficiente" : "falha");
    return {
      categoria,
      situacao,
      disponivel: situacao !== "falha",
    };
  });

  return {
    recomendacoes: lista,
    fontes,
    semDados: fontes.every(
      (fonte) => fonte.situacao === "falha" || fonte.situacao === "sem-registros",
    ),
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

export function rotuloSituacaoFonteNeia(situacao: SituacaoFonteNeia) {
  return SITUACOES_FONTE_NEIA.find(([id]) => id === situacao)?.[1] ?? situacao;
}

/** Cor da situação conforme a disponibilidade efetiva da fonte. */
export function tomSituacaoFonteNeia(situacao: SituacaoFonteNeia): TomNeia {
  switch (situacao) {
    case "suficiente":
      return "verde";
    case "parcial":
      return "ouro";
    case "sem-registros":
      return "azul";
    default:
      return "vermelho";
  }
}
