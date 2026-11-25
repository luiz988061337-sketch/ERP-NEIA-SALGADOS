import { useEffect } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { hojeSP } from "@/lib/competencia";
import { agregarClientes, useCrmSettings } from "@/lib/crm";
import { calcularEstoqueDashboard } from "@/lib/dashboard-a01-estoque";
import {
  contem,
  faixaAnterior,
  type FaixaDashboard,
  type PedidoDashboard,
} from "@/lib/dashboard-a01";
import {
  montarFluxoCaixaMensal,
  type ContaCaixaLegada,
  type EventoPagamentoCaixa,
  type EventoPagamentoPedidoCaixa,
  type PedidoRecebidoCaixa,
} from "@/lib/financeiro";

type Pagina<T> = { data: T[] | null; error: { message: string } | null };
export async function lerDashboard<T>(
  consultar: (inicio: number, fim: number) => PromiseLike<Pagina<T>>,
) {
  const linhas: T[] = [];
  const tamanho = 200;
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await consultar(inicio, inicio + tamanho - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < tamanho) return linhas;
  }
}

const COL_PEDIDOS =
  "id,numero,cliente_nome,status,total,subtotal,desconto,created_at,tipo_entrega,taxa_entrega,atrasado,agendado_para,aceito_em_atendente,aceito_em,preparo_em,pronto_em,saiu_em,rota_id,entregue_em,pedido_itens(produto_id,nome,quantidade,preco_unitario)";

export async function consultarPedidoDashboard(faixa: FaixaDashboard, signal: AbortSignal) {
  const [vendas, eventos] = await Promise.all([
    lerDashboard<PedidoDashboard>((inicio, fim) =>
      supabase
        .from("pedidos")
        .select(COL_PEDIDOS)
        .gte("created_at", faixaAnterior(faixa).ini)
        .lt("created_at", faixa.fim)
        .order("id")
        .range(inicio, fim)
        .abortSignal(signal),
    ),
    lerDashboard<PedidoDashboard>((inicio, fim) =>
      supabase
        .from("pedidos")
        .select(COL_PEDIDOS)
        .or(
          ["agendado_para", "entregue_em", "pronto_em"]
            .map(
              (campo) =>
                "and(" + campo + ".gte." + faixa.ini + "," + campo + ".lt." + faixa.fim + ")",
            )
            .join(","),
        )
        .order("id")
        .range(inicio, fim)
        .abortSignal(signal),
    ),
  ]);
  return [...new Map([...vendas, ...eventos].map((pedido) => [pedido.id, pedido])).values()];
}

async function consultarFila(signal: AbortSignal) {
  return lerDashboard<PedidoDashboard>((inicio, fim) =>
    supabase
      .from("pedidos")
      .select(COL_PEDIDOS)
      .in("status", ["recebido", "em_producao", "pronto", "aguardando_motoboy", "em_rota"])
      .order("id")
      .range(inicio, fim)
      .abortSignal(signal),
  );
}

type Produto = {
  id: string;
  nome: string;
  imagem_url: string | null;
  estoque_minimo: number | null;
  custo: number | null;
  disponivel: boolean;
  destaque: boolean;
  categorias: { slug: string } | null;
};

type Lote = {
  id: string;
  produto_id: string;
  validade: string | null;
  restante: number;
  status: string;
};
type Reserva = { id: string; produto_id: string; quantidade: number };
type Consumo = { reserva_id: string; quantidade: number };

export async function consultarEstoque(signal: AbortSignal) {
  const [produtos, lotes, reservas, consumos] = await Promise.all([
    lerDashboard<Produto>((i, f) =>
      supabase
        .from("produtos")
        .select("id,nome,imagem_url,estoque_minimo,custo,disponivel,destaque,categorias(slug)")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    lerDashboard<Lote>((i, f) =>
      supabase
        .from("lotes")
        .select("id,produto_id,validade,restante,status")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    lerDashboard<Reserva>((i, f) =>
      supabase
        .from("reservas_estoque")
        .select("id,produto_id,quantidade")
        .eq("status", "ativa")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    lerDashboard<Consumo>((i, f) =>
      supabase
        .from("reserva_consumos")
        .select("reserva_id,quantidade,reservas_estoque!inner(status)")
        .eq("reservas_estoque.status", "ativa")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
  ]);
  const saldoDoSabor = calcularEstoqueDashboard(lotes, reservas, consumos, hojeSP());
  const salgados = produtos.filter((produto) =>
    [
      "mini-fritos",
      "mini-assados",
      "mini-pasteis",
      "mini-pizzas",
      "mini-empadinhas",
      "mini-congelados",
      "salgados-fritos",
      "salgados-assados",
      "salgados-congelados",
      "mini-salgados",
    ].includes(produto.categorias?.slug ?? ""),
  );
  const linhas = salgados
    .map((produto) => ({
      id: produto.id,
      nome: produto.nome,
      imagem: produto.imagem_url?.trim() || null,
      destaque: produto.destaque,
      ...saldoDoSabor(produto),
    }))
    .sort(
      (a, b) =>
        b.prioridade - a.prioridade ||
        Number(b.destaque) - Number(a.destaque) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  return {
    linhas,
    custos: new Map(
      produtos.flatMap((produto) => (produto.custo ? [[produto.id, produto.custo] as const] : [])),
    ),
  };
}

type Conta = ContaCaixaLegada & { vencimento: string | null };

async function consultarFinanceiro(signal: AbortSignal) {
  const [contas, eventos, eventosPedidos, pedidosPagos, sessao] = await Promise.all([
    lerDashboard<Conta>((i, f) =>
      supabase
        .from("contas")
        .select(
          "id,tipo,categoria,meio,pedido_id,status,valor,valor_pago,pagamento_abertura_centavos,pago_em,vencimento",
        )
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    lerDashboard<EventoPagamentoCaixa>((i, f) =>
      supabase
        .from("conta_pagamento_eventos")
        .select("conta_id,tipo,valor_centavos,created_at")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    lerDashboard<EventoPagamentoPedidoCaixa>((i, f) =>
      supabase
        .from("pedido_pagamento_eventos")
        .select("pedido_id,tipo,valor_centavos,forma_pagamento,created_at")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    lerDashboard<PedidoRecebidoCaixa>((i, f) =>
      supabase
        .from("pedidos")
        .select("id,total,forma_pagamento,pagamento_status,status,pagamento_em")
        .eq("pagamento_status", "pago")
        .neq("status", "cancelado")
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
    supabase
      .from("caixa_sessoes")
      .select("aberta_em,saldo_inicial")
      .eq("status", "aberta")
      .order("aberta_em", { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(),
  ]);
  if (sessao.error) throw new Error(sessao.error.message);
  return {
    contas,
    eventos,
    eventosPedidos,
    pedidosPagos,
    sessao: sessao.data as { aberta_em: string; saldo_inicial: number } | null,
  };
}

export function financeiroDashboard(
  dados: Awaited<ReturnType<typeof consultarFinanceiro>>,
  faixa: FaixaDashboard,
) {
  const { contas, eventos, eventosPedidos, pedidosPagos, sessao } = dados;
  const pagoSemData = pedidosPagos.filter((pedido) => !pedido.pagamento_em).length;
  const competencias = (ini: string, ultimo: string) => [
    ...new Set(
      [
        ini,
        ultimo,
        ...[...eventos, ...eventosPedidos].map((evento) => hojeSP(new Date(evento.created_at))),
        ...pedidosPagos.flatMap((pedido) =>
          pedido.pagamento_em ? [hojeSP(new Date(pedido.pagamento_em))] : [],
        ),
      ]
        .filter((dia) => dia >= ini && dia <= ultimo)
        .map((dia) => dia.slice(0, 7)),
    ),
  ];
  const args = { eventos, eventosPedidos, contas, pedidosPagos, pedidosPagosSemData: pagoSemData };
  const periodo = montarFluxoCaixaMensal({
    ...args,
    competencias: competencias(faixa.inicio, faixa.ultimoDia),
    aPartirDe: faixa.ini,
    antesDe: faixa.fim,
  });
  const contasPorId = new Map(contas.map((conta) => [conta.id, conta]));
  const despesas = eventos.filter((evento) => {
    const conta = contasPorId.get(evento.conta_id);
    return (
      conta?.tipo === "pagar" && conta.categoria !== "sangria" && contem(faixa, evento.created_at)
    );
  });
  const realizado = (excluirInsumos: boolean) =>
    despesas.reduce((total, evento) => {
      if (excluirInsumos && contasPorId.get(evento.conta_id)?.categoria === "insumos") return total;
      return total + (evento.tipo === "pagamento" ? evento.valor_centavos : -evento.valor_centavos);
    }, 0) / 100;
  const pendentes = contas.filter(
    (conta) => conta.status !== "cancelada" && conta.status !== "paga",
  );
  const saldo = (conta: Conta) =>
    Math.max(
      0,
      Math.round(Number(conta.valor ?? 0) * 100) - Math.round(Number(conta.valor_pago ?? 0) * 100),
    );
  const total = (linhas: Conta[]) => linhas.reduce((soma, conta) => soma + saldo(conta), 0) / 100;
  const movimento = sessao
    ? montarFluxoCaixaMensal({
        ...args,
        competencias: competencias(hojeSP(new Date(sessao.aberta_em)), hojeSP()),
        aPartirDe: sessao.aberta_em,
        antesDe: new Date().toISOString(),
        meiosIncluidos: ["dinheiro"],
      })
    : [];
  const incompleto = periodo.some((item) => item.eventosSemData > 0);
  const caixaIncompleto = movimento.some(
    (item) => item.eventosSemData > 0 || item.eventosContaMeioDesconhecido > 0,
  );
  const entradasCaixa = movimento.reduce((soma, item) => soma + item.entradasCentavos, 0) / 100;
  const saidasCaixa = movimento.reduce((soma, item) => soma + item.saidasCentavos, 0) / 100;
  return {
    recebimentos: periodo.reduce((soma, item) => soma + item.entradasOperacionaisCentavos, 0) / 100,
    realizado: realizado(false),
    despesaSemInsumos: realizado(true),
    parcial: incompleto,
    previsto: total(
      pendentes.filter(
        (conta) =>
          conta.tipo === "pagar" &&
          conta.vencimento &&
          conta.vencimento >= faixa.inicio &&
          conta.vencimento <= faixa.ultimoDia,
      ),
    ),
    pagar: total(pendentes.filter((conta) => conta.tipo === "pagar")),
    receber: total(pendentes.filter((conta) => conta.tipo === "receber")),
    vencido: total(
      pendentes.filter(
        (conta) => conta.tipo === "pagar" && conta.vencimento && conta.vencimento < hojeSP(),
      ),
    ),
    sessao,
    caixaIncompleto,
    entradasCaixa,
    saidasCaixa,
    saldoCaixa:
      sessao && !caixaIncompleto
        ? Number(sessao.saldo_inicial) + entradasCaixa - saidasCaixa
        : null,
  };
}

async function consultarEntregas(signal: AbortSignal) {
  const [motoboys, rotas, atrasos] = await Promise.all([
    supabase
      .from("motoboys")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true)
      .eq("status", "disponivel_base")
      .abortSignal(signal),
    supabase
      .from("rotas_entrega")
      .select("id", { count: "exact", head: true })
      .not("saiu_em", "is", null)
      .is("chegou_em", null)
      .not("status", "in", "(cancelada,concluida)")
      .abortSignal(signal),
    lerDashboard<{ pedido_id: string }>((i, f) =>
      supabase
        .from("entrega_atrasos")
        .select("pedido_id")
        .is("resolvido_em", null)
        .order("id")
        .range(i, f)
        .abortSignal(signal),
    ),
  ]);
  if (motoboys.error || rotas.error || motoboys.count === null || rotas.count === null)
    throw new Error("Falha nos dados de entregas.");
  return {
    motoboys: motoboys.count,
    rotas: rotas.count,
    atrasos: new Set(atrasos.map((linha) => linha.pedido_id)),
  };
}

async function consultarNotificacoes(signal: AbortSignal) {
  const [lista, pendentes] = await Promise.all([
    supabase
      .from("notificacoes")
      .select("id,titulo,detalhe,link,lida,created_at")
      .order("lida")
      .order("created_at", { ascending: false })
      .limit(20)
      .abortSignal(signal),
    supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("lida", false)
      .abortSignal(signal),
  ]);
  if (lista.error || pendentes.error || pendentes.count === null)
    throw new Error("Falha ao consultar notificações.");
  return {
    lista: (lista.data ?? []) as {
      id: string;
      titulo: string;
      detalhe: string | null;
      lida: boolean;
    }[],
    pendentes: pendentes.count,
  };
}

async function consultarCampanhas(signal: AbortSignal) {
  const { error, count } = await supabase
    .from("crm_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "pronta")
    .abortSignal(signal);
  if (error || count === null) throw new Error("Falha ao consultar campanhas.");
  return count;
}

export function useDadosDashboard(usuarioId: string, faixa: FaixaDashboard) {
  const client = useQueryClient();
  useEffect(() => {
    const canal = supabase
      .channel("dashboard-a01-" + usuarioId)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        void client.invalidateQueries({ queryKey: ["dashboard-a01", usuarioId, "pedidos"] });
        void client.invalidateQueries({ queryKey: ["dashboard-a01", usuarioId, "fila"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [client, usuarioId]);
  return useQueries({
    queries: [
      {
        queryKey: ["dashboard-a01", usuarioId, "pedidos", faixa.ini, faixa.fim],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarPedidoDashboard(faixa, signal),
        refetchInterval: 30000,
      },
      {
        queryKey: ["dashboard-a01", usuarioId, "fila"],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarFila(signal),
        refetchInterval: 30000,
      },
      {
        queryKey: ["dashboard-a01", usuarioId, "estoque"],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarEstoque(signal),
        refetchInterval: 60000,
      },
      {
        queryKey: ["dashboard-a01", usuarioId, "financeiro"],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarFinanceiro(signal),
        refetchInterval: 120000,
      },
      {
        queryKey: ["dashboard-a01", usuarioId, "entregas"],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarEntregas(signal),
        refetchInterval: 30000,
      },
      {
        queryKey: ["dashboard-a01", usuarioId, "notificacoes"],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarNotificacoes(signal),
        refetchInterval: 30000,
      },
      {
        queryKey: ["dashboard-a01", usuarioId, "campanhas"],
        queryFn: ({ signal }: { signal: AbortSignal }) => consultarCampanhas(signal),
        refetchInterval: 120000,
      },
    ] as const,
  });
}

export function useInicioRotasDashboard(usuarioId: string, ids: string[]) {
  return useQuery({
    queryKey: ["dashboard-a01", usuarioId, "inicio-rotas", ids],
    enabled: ids.length > 0,
    queryFn: async ({ signal }) => {
      const inicio = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("rotas_entrega")
          .select("id,saiu_em")
          .in("id", ids.slice(i, i + 100))
          .not("saiu_em", "is", null)
          .abortSignal(signal);
        if (error) throw error;
        for (const rota of data ?? []) inicio.set(rota.id, rota.saiu_em);
      }
      return inicio;
    },
  });
}

export function useClientesDashboard(usuarioId: string) {
  const { data: configuracao } = useCrmSettings();
  return useQuery({
    queryKey: ["dashboard-a01", usuarioId, "crm", configuracao],
    enabled: !!configuracao,
    refetchInterval: 120000,
    queryFn: async ({ signal }) => {
      if (!configuracao) throw new Error("Configuração do CRM indisponível.");
      type Compra = Omit<Parameters<typeof agregarClientes>[0][number], "bairro" | "endereco">;
      const [compras, contatos] = await Promise.all([
        lerDashboard<Compra>((i, f) =>
          supabase
            .from("pedidos")
            .select("telefone,cliente_nome,created_at,total,status,user_id")
            .neq("status", "cancelado")
            .order("id")
            .range(i, f)
            .abortSignal(signal),
        ),
        lerDashboard<{ telefone_norm: string; opt_out: boolean }>((i, f) =>
          supabase
            .from("crm_customers")
            .select("telefone_norm,opt_out")
            .order("telefone_norm")
            .range(i, f)
            .abortSignal(signal),
        ),
      ]);
      const optOut = new Map(contatos.map((contato) => [contato.telefone_norm, contato.opt_out]));
      return agregarClientes(
        compras.map((compra) => ({ ...compra, bairro: null, endereco: "" })),
        configuracao,
        optOut,
      );
    },
  });
}

export function useBuscaDashboard(usuarioId: string, termo: string) {
  return useQuery({
    queryKey: ["dashboard-a01", usuarioId, "busca", termo],
    enabled: termo.length >= 2 || /^\d+$/.test(termo),
    queryFn: async ({ signal }) => {
      const padrao = "%" + termo.replace(/[\\%_*]/g, "\\$&") + "%";
      const consulta = supabase
        .from("pedidos")
        .select("id,numero,cliente_nome")
        .order("created_at", { ascending: false })
        .limit(5)
        .abortSignal(signal);
      const numero = /^\d{1,10}$/.test(termo) && Number(termo) <= 2147483647;
      const [pedidos, clientes, produtos] = await Promise.all([
        numero ? consulta.eq("numero", Number(termo)) : consulta.ilike("cliente_nome", padrao),
        supabase
          .from("profiles")
          .select("id,nome")
          .ilike("nome", padrao)
          .order("nome")
          .limit(5)
          .abortSignal(signal),
        supabase
          .from("produtos")
          .select("id,nome")
          .ilike("nome", padrao)
          .order("nome")
          .limit(5)
          .abortSignal(signal),
      ]);
      if (pedidos.error || clientes.error || produtos.error)
        throw new Error("A busca não pôde ser concluída.");
      return {
        pedidos: (pedidos.data ?? []) as { id: string; numero: number; cliente_nome: string }[],
        clientes: (clientes.data ?? []) as { id: string; nome: string }[],
        produtos: (produtos.data ?? []) as { id: string; nome: string }[],
      };
    },
  });
}
