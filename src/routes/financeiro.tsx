import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AcertosMotoboyFinanceiro } from "@/components/admin/acertos-motoboy";
import { PageHeader } from "@/components/admin/ui-admin";
import { ERP_COLORS, MetricCard, ChartCard } from "@/components/admin/erp-ui";
import { brl } from "@/lib/format";
import { faixaCompetencia, hojeSP } from "@/lib/competencia";
import { downloadCSV } from "@/lib/export";
import {
  competenciaSaoPaulo,
  diferencaCaixa,
  dreMensal,
  montarFluxoCaixaMensal,
  montarDRE,
  pontoEquilibrio,
  resumoConciliacao,
  saldoCaixaEsperado,
  splitProdutosEntrega,
  statusConta,
  totalContas,
} from "@/lib/financeiro";
import { parseCSVExtrato, parseOFX, sugerirVinculo, type LancamentoExtrato } from "@/lib/ofx";
import {
  analisarColisoesFITID,
  assinaturaArquivoExtrato,
  correspondeArquivoLegado,
  identificarArquivoExtrato,
  importarLancamentosExtrato,
  prefixoIdentidadeArquivoExtrato,
  type LinhaExtratoExistente,
} from "@/lib/extratos-importacao";
import { reaisParaCentavos } from "@/lib/financeiro-pagamentos";
import { useRoles, useSession } from "@/lib/session";
import { ehModoDemo } from "@/lib/demo-preview";
import { FinanceiroPremium } from "@/routes/preview/financeiro-premium";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Néia Salgados" },
      { name: "description", content: "Caixa, contas a pagar/receber e conciliação." },
    ],
  }),
  component: () => (ehModoDemo() ? <FinanceiroPremium /> : <Financeiro />),
});

const MEIOS = ["dinheiro", "pix", "credito", "debito", "transferencia", "outro"] as const;

function rpcAtomicaAusente(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "PGRST202";
}

const avisoRpcFinanceira = "Operação pausada: a migration financeira ainda não está instalada. Nenhuma alteração foi confirmada.";

function ultimasCompetencias(mes: string, quantidade = 6): string[] {
  const [ano, numeroMes] = mes.split("-").map(Number);
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date(Date.UTC(ano || 2000, (numeroMes || 1) - quantidade + indice, 1));
    return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

async function lerPaginado<T>(buscar: (inicio: number, fim: number) => Promise<{
  data: T[] | null;
  error: { code?: string } | null;
}>): Promise<{ rows: T[]; errorCode: string | null }> {
  const rows: T[] = [];
  const tamanhoPagina = 1000;
  const limite = 50000;
  for (let inicio = 0; inicio <= limite; inicio += tamanhoPagina) {
    const { data, error } = await buscar(inicio, inicio + tamanhoPagina - 1);
    if (error) return { rows: [], errorCode: error.code ?? "QUERY_ERROR" };
    const pagina = data ?? [];
    rows.push(...pagina);
    if (pagina.length < tamanhoPagina) return { rows, errorCode: null };
  }
  return { rows: [], errorCode: "LIMITE_PAGINACAO" };
}

function Financeiro() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(() => competenciaSaoPaulo(new Date().toISOString()) ?? new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const irParaHash = () => {
      const alvo = window.location.hash.replace(/^#/, "");
      if (alvo !== "caixa" && alvo !== "relatorios") return;
      window.requestAnimationFrame(() => {
        document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    irParaHash();
    window.addEventListener("hashchange", irParaHash);
    return () => window.removeEventListener("hashchange", irParaHash);
  }, []);
  const chavesOperacao = useRef(new Map<string, string>());

  function chaveOperacao(identidade: string): string {
    const existente = chavesOperacao.current.get(identidade);
    if (existente) return existente;
    const chave = globalThis.crypto?.randomUUID?.();
    if (!chave) throw new Error("Este navegador não oferece uma chave segura para a operação.");
    chavesOperacao.current.set(identidade, chave);
    return chave;
  }

  function invalidarFluxoFinanceiro() {
    queryClient.invalidateQueries({ queryKey: ["fin-eventos-pagamento-caixa"] });
    queryClient.invalidateQueries({ queryKey: ["fin-eventos-pedido-caixa"] });
    queryClient.invalidateQueries({ queryKey: ["fin-pedidos-recebidos-caixa"] });
    queryClient.invalidateQueries({ queryKey: ["fin-pedidos-pagos-sem-data"] });
  }

  if (!loading && !user) {
    navigate({ to: "/auth", search: { redirect: "/financeiro" }, replace: true });
  }
  const autorizado = roles?.includes("admin") || roles?.includes("financeiro");
  const competenciasFluxo = useMemo(() => ultimasCompetencias(mes), [mes]);
  const faixaFluxo = useMemo(() => ({
    ini: faixaCompetencia(competenciasFluxo[0] ?? mes).ini,
    fim: faixaCompetencia(competenciasFluxo[competenciasFluxo.length - 1] ?? mes).fim,
  }), [competenciasFluxo, mes]);

  const { data: pedidos, isError: erroPedidos } = useQuery({
    queryKey: ["fin-pedidos", mes],
    enabled: !!autorizado,
    refetchInterval: 30000,
    queryFn: async () => {
      try {
        const fx = faixaCompetencia(mes);
        const { data, error } = await supabase
          .from("pedidos")
          .select(
            "id, numero, total, desconto, pagamento_status, status, forma_pagamento, created_at",
          )
          .gte("created_at", fx.ini)
          .lt("created_at", fx.fim)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: contas, isError: erroContas } = useQuery({
    queryKey: ["fin-contas"],
    enabled: !!autorizado,
    queryFn: async () => {
      const resultado = await lerPaginado<any>((inicio, fim) => supabase
        .from("contas")
        .select("*")
        .order("vencimento", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(inicio, fim));
      if (resultado.errorCode) throw new Error(`Leitura de contas incompleta: ${resultado.errorCode}`);
      return resultado.rows;
    },
  });

  const { data: eventosPagamentoCaixa } = useQuery({
    queryKey: ["fin-eventos-pagamento-caixa", faixaFluxo.ini, faixaFluxo.fim],
    enabled: !!autorizado,
    queryFn: async () => {
      const resultado = await lerPaginado<any>((inicio, fim) => supabase
        .from("conta_pagamento_eventos")
        .select("conta_id, tipo, valor_centavos, created_at")
        .gte("created_at", faixaFluxo.ini)
        .lt("created_at", faixaFluxo.fim)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(inicio, fim));
      return { available: !resultado.errorCode, errorCode: resultado.errorCode, rows: resultado.rows };
    },
  });

  const { data: eventosPedidoCaixa } = useQuery({
    queryKey: ["fin-eventos-pedido-caixa", faixaFluxo.ini, faixaFluxo.fim],
    enabled: !!autorizado,
    queryFn: async () => {
      const resultado = await lerPaginado<any>((inicio, fim) => supabase
        .from("pedido_pagamento_eventos")
        .select("pedido_id, tipo, valor_centavos, forma_pagamento, created_at")
        .gte("created_at", faixaFluxo.ini)
        .lt("created_at", faixaFluxo.fim)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(inicio, fim));
      return { available: !resultado.errorCode, errorCode: resultado.errorCode, rows: resultado.rows };
    },
  });

  const { data: pedidosRecebidosCaixa } = useQuery({
    queryKey: ["fin-pedidos-recebidos-caixa", faixaFluxo.ini, faixaFluxo.fim],
    enabled: !!autorizado,
    queryFn: async () => {
      const resultado = await lerPaginado<any>((inicio, fim) => supabase
        .from("pedidos")
        .select("id, total, forma_pagamento, pagamento_status, status, pagamento_em")
        .eq("pagamento_status", "pago")
        .neq("status", "cancelado")
        .gte("pagamento_em", faixaFluxo.ini)
        .lt("pagamento_em", faixaFluxo.fim)
        .order("pagamento_em", { ascending: true })
        .order("id", { ascending: true })
        .range(inicio, fim));
      return { available: !resultado.errorCode, errorCode: resultado.errorCode, rows: resultado.rows };
    },
  });

  const { data: pedidosSemDataCaixa } = useQuery({
    queryKey: ["fin-pedidos-pagos-sem-data", faixaFluxo.ini, faixaFluxo.fim],
    enabled: !!autorizado,
    queryFn: async () => {
      const resultado = await lerPaginado<any>((inicio, fim) => supabase
        .from("pedidos")
        .select("id")
        .eq("pagamento_status", "pago")
        .is("pagamento_em", null)
        .range(inicio, fim));
      return { available: !resultado.errorCode, errorCode: resultado.errorCode, count: resultado.rows.length };
    },
  });

  const { data: caixaAberto, isError: erroCaixaAberto } = useQuery({
    queryKey: ["fin-caixa-aberto"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("caixa_sessoes")
          .select("*")
          .eq("status", "aberta")
          .order("aberta_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data ?? null) as any;
      } catch {
        return null;
      }
    },
  });

  const { data: caixas } = useQuery({
    queryKey: ["fin-caixas"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("caixa_sessoes")
          .select("*")
          .eq("status", "fechada")
          .order("fechada_em", { ascending: false })
          .limit(30);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: bancos, isError: erroBancos } = useQuery({
    queryKey: ["fin-bancos"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("contas_bancarias")
          .select("*")
          .order("nome")
          .limit(100);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const [previa, setPrevia] = useState<LancamentoExtrato[] | null>(null);
  const [nomeArq, setNomeArq] = useState("");
  const [conteudoArq, setConteudoArq] = useState("");
  const [gravandoExtrato, setGravandoExtrato] = useState(false);

  const { data: extratos, isError: erroExtratos } = useQuery({
    queryKey: ["fin-extratos"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("extratos")
          .select("*")
          .eq("status", "pendente")
          .order("data", { ascending: false })
          .limit(200);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const pedidosDisponiveis = !erroPedidos && pedidos !== undefined;
  const contasDisponiveis = !erroContas && contas !== undefined;
  const extratosDisponiveis = !erroExtratos && extratos !== undefined;
  const bancosDisponiveis = !erroBancos && bancos !== undefined;
  const valorPedidos = (valor: number) => pedidosDisponiveis ? brl(valor) : "—";
  const valorContas = (valor: number) => contasDisponiveis ? brl(valor) : "—";

  async function lerArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    const texto = await arq.text();
    const parsed = /\.ofx$/i.test(arq.name) ? parseOFX(texto) : parseCSVExtrato(texto);
    if (parsed.length === 0) {
      toast.error("Nenhum lançamento válido (OFX ou CSV data;descricao;valor).");
      return;
    }
    setPrevia(parsed);
    setNomeArq(arq.name);
    setConteudoArq(texto);
    e.target.value = "";
  }

  function baixarModeloCSV() {
    const blob = new Blob(["data;descricao;valor\n10/10/2026;PIX recebido;46,00\n"], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-extrato.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function gravarExtrato() {
    if (!previa?.length || gravandoExtrato) return;
    setGravandoExtrato(true);
    try {
      // Arquivos antigos da F1-A guardam apenas hash dos lançamentos parseados.
      // Ele serve para detectar legado ambíguo, nunca para descartar linhas.
      const assinaturaLegada = await assinaturaArquivoExtrato(previa);
      const assinatura = await assinaturaArquivoExtrato(previa, conteudoArq);
      const arquivoId = identificarArquivoExtrato(nomeArq, assinatura);
      const linhasDoArquivo: { linha: number }[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase
          .from("extratos")
          .select("linha")
          .like("arquivo", `${prefixoIdentidadeArquivoExtrato(assinatura)}%`)
          .order("linha", { ascending: true })
          .range(inicio, inicio + 499);
        if (error) throw error;
        const pagina = data ?? [];
        linhasDoArquivo.push(...pagina);
        if (pagina.length < 500) break;
      }

      const { data: linhasAssinaturaLegada, error: erroAssinaturaLegada } = await supabase
        .from("extratos")
        .select("arquivo")
        .like("arquivo", `${prefixoIdentidadeArquivoExtrato(assinaturaLegada)}%`)
        .limit(1);
      if (erroAssinaturaLegada) throw erroAssinaturaLegada;

      // Compatibilidade: registros sem hash bruto não provam identidade do
      // arquivo; até uma coincidência completa exige revisão do operador.
      const linhasLegadas: LinhaExtratoExistente[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase
          .from("extratos")
          .select("linha,referencia,data,descricao,valor")
          .eq("arquivo", nomeArq)
          .order("linha", { ascending: true })
          .range(inicio, inicio + 499);
        if (error) throw error;
        const pagina = (data ?? []) as LinhaExtratoExistente[];
        linhasLegadas.push(...pagina);
        if (pagina.length < 500) break;
      }
      const mesmoLegado = correspondeArquivoLegado(linhasLegadas, previa);
      if (linhasLegadas.length > 0 || linhasAssinaturaLegada?.length) {
        const continuar = window.confirm(
          `Há lançamentos antigos que podem corresponder a este arquivo “${nomeArq}”, mas os registros históricos não guardam o conteúdo original nem uma identidade bancária validada. ${mesmoLegado ? "Os lançamentos parseados parecem iguais, mas podem vir de outra conta." : "Os lançamentos não permitem confirmar se é uma repetição."} Confirme para importar sem descartar linhas; cancele para revisar o arquivo manualmente.`,
        );
        if (!continuar) return;
      }

      const referenciasEstaveis = [...new Set(
        previa.map((l) => l.idTransacao?.trim()).filter((id): id is string => !!id),
      )];
      let referenciasExistentes: { referencia: string; arquivo: string }[] = [];
      for (let inicio = 0; inicio < referenciasEstaveis.length; inicio += 200) {
        const loteReferencias = referenciasEstaveis.slice(inicio, inicio + 200);
        const { data, error } = await supabase
          .from("extratos")
          .select("referencia,arquivo")
          .in("referencia", loteReferencias);
        if (error) throw error;
        referenciasExistentes.push(...(data ?? []).map((r: any) => ({
          referencia: String(r.referencia ?? ""),
          arquivo: String(r.arquivo ?? ""),
        })));
      }

      const linhasParaPular = (linhasDoArquivo ?? []).map((r: any) => Number(r.linha));
      const colisoesFITID = analisarColisoesFITID(
        previa,
        referenciasExistentes,
        prefixoIdentidadeArquivoExtrato(assinatura),
      );
      const linhasJaImportadas = new Set(linhasParaPular);
      const arquivoJaImportado = previa.every((_, indice) => linhasJaImportadas.has(indice + 1));
      if (!arquivoJaImportado && (colisoesFITID.duplicadosNoArquivo > 0 || colisoesFITID.encontradosEmOutrosArquivos > 0)) {
        const continuar = window.confirm(
          `Foram encontrados ${colisoesFITID.duplicadosNoArquivo} FITID(s) repetido(s) neste arquivo e ${colisoesFITID.encontradosEmOutrosArquivos} já presentes em outros arquivos. Como a conta bancária de origem não está comprovada, FITID igual pode representar transações distintas. Nenhum lançamento será descartado por esse motivo. Revise e confirme para importar.`,
        );
        if (!continuar) return;
      }

      const resultado = await importarLancamentosExtrato({
        lancamentos: previa,
        linhasExistentes: linhasParaPular,
        inserir: async (l, linha) => {
          const { error } = await supabase.from("extratos").insert({
            arquivo: arquivoId,
            linha,
            data: l.data,
            descricao: l.descricao,
            valor: l.valor,
            referencia: l.referencia,
            created_by: user!.id,
          });
          if (error) throw error;
        },
      });

      queryClient.invalidateQueries({ queryKey: ["fin-extratos"] });
      if (resultado.falhas > 0) {
        toast.error(
          `${resultado.importados} lançamento(s) importado(s), ${resultado.ignorados} ignorado(s) e ${resultado.falhas} com falha. A prévia foi mantida; repita para tentar somente os pendentes.`,
        );
        return;
      }
      if (resultado.importados === 0) {
        toast.info(`${resultado.ignorados} lançamento(s) já constavam no sistema.`);
      } else {
        toast.success(
          `${resultado.importados} lançamento(s) importado(s)${resultado.ignorados > 0 ? `, ${resultado.ignorados} duplicado(s) ignorado(s)` : ""}.`,
        );
      }
      setPrevia(null);
      setNomeArq("");
      setConteudoArq("");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível verificar o extrato.");
    } finally {
      setGravandoExtrato(false);
    }
  }

  async function conciliar(ex: any, cand: { tipo: string; id: string }) {
    const { data, error } = await supabase.rpc("conciliar_extrato_atomico", {
      p_extrato_id: ex.id,
      p_vinculo_tipo: cand.tipo,
      p_vinculo_id: cand.id,
    });
    if (error) {
      toast.error(rpcAtomicaAusente(error)
        ? avisoRpcFinanceira
        : "Não foi possível confirmar a conciliação. Atualize o extrato antes de repetir.");
      return;
    }
    const resultado = data as { status?: string } | null;
    if (resultado?.status !== "conciliado" && resultado?.status !== "repetido") {
      const motivos: Record<string, string> = {
        nao_autorizado: "Seu perfil não pode conciliar lançamentos.",
        conta_inexistente: "A conta selecionada não existe.",
        pedido_inexistente: "O pedido selecionado não existe.",
        pedido_nao_conciliavel: "O valor do extrato não corresponde ao saldo integral do pedido.",
        pedido_ja_pago: "O pedido já consta como pago.",
        valor_superior_ao_saldo: "O extrato excede o saldo restante da conta.",
        chave_idempotencia_conflitante: "Este extrato já foi aplicado em outra operação.",
        extrato_indisponivel: "Este lançamento já foi conciliado ou ignorado.",
        sinal_incompativel: "O sinal do extrato não corresponde a pagar/receber.",
        revisao_necessaria: "A conta possui um saldo histórico inconsistente e precisa de revisão.",
      };
      toast.error(motivos[resultado?.status ?? ""] ?? "O lançamento não pôde ser conciliado.");
      queryClient.invalidateQueries({ queryKey: ["fin-extratos"] });
      return;
    }
    toast.success(resultado.status === "repetido" ? "Este lançamento já estava conciliado." : "Conciliado.");
    queryClient.invalidateQueries({ queryKey: ["fin-extratos"] });
    queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
    queryClient.invalidateQueries({ queryKey: ["fin-pedidos", mes] });
    invalidarFluxoFinanceiro();
  }

  async function ignorarExtrato(id: string) {
    // Proteção contra concorrência: "ignorar" só pode agir sobre lançamento
    // ainda pendente. Sem o filtro .eq("status","pendente") + verificação de
    // linhas, um operador mais lento sobrescrevia um extrato já conciliado
    // (via conciliar) ou já ignorado por outra pessoa. Ambos os estados
    // possíveis virariam "ignorado" sem trilha de quem os alterou.
    const { data: claim, error } = await supabase
      .from("extratos")
      .update({ status: "ignorado" })
      .eq("id", id)
      .eq("status", "pendente")
      .select("id");
    if (error) {
      toast.error("Falha ao ignorar o lançamento.");
      return;
    }
    if (!claim || claim.length === 0) {
      toast.error("Este lançamento já foi conciliado ou ignorado por outra pessoa.");
      queryClient.invalidateQueries({ queryKey: ["fin-extratos"] });
      return;
    }
    toast.success("Lançamento ignorado.");
    queryClient.invalidateQueries({ queryKey: ["fin-extratos"] });
  }

  if (roles && !autorizado) {
    return <p className="p-10 text-center">Acesso do admin/financeiro.</p>;
  }

  const hoje = hojeSP();
  const contasComStatus = (contas ?? []).map((c: any) => ({ ...c, efetivo: statusConta(c, hoje) }));
  const argumentosFluxo = {
    competencias: competenciasFluxo,
    eventos: eventosPagamentoCaixa?.rows ?? [],
    eventosPedidos: eventosPedidoCaixa?.rows ?? [],
    contas: contas ?? [],
    pedidosPagos: pedidosRecebidosCaixa?.rows ?? [],
    pedidosPagosSemData: pedidosSemDataCaixa?.count ?? 0,
  };
  const fluxoCaixaCalculado = montarFluxoCaixaMensal(argumentosFluxo);
  const fluxoMes = fluxoCaixaCalculado.find((item) => item.competencia === mes);
  const ledgerDisponivel = eventosPagamentoCaixa?.available === true && eventosPedidoCaixa?.available === true;
  const fallbackLegadoDisponivel = eventosPagamentoCaixa?.errorCode === "PGRST205" &&
    eventosPedidoCaixa?.errorCode === "PGRST205";
  const fluxoDisponivel = (ledgerDisponivel || fallbackLegadoDisponivel) &&
    pedidosRecebidosCaixa?.available === true && pedidosSemDataCaixa?.available === true &&
    !erroContas && contas !== undefined;
  const concBase = resumoConciliacao(pedidos ?? []);
  const conc = {
    ...concBase,
    recebido: (fluxoMes?.entradasOperacionaisCentavos ?? 0) / 100,
    qtdRecebido: fluxoMes?.pagamentos ?? 0,
    porMeio: Object.fromEntries(Object.entries(fluxoMes?.porMeioCentavos ?? {})
      .map(([meio, centavos]) => [meio, centavos / 100])),
  };
  const aPagar = totalContas(
    contasComStatus.filter((c: any) => c.tipo === "pagar" && c.efetivo !== "paga"),
    "pagar",
  );
  const aReceber = totalContas(
    contasComStatus.filter((c: any) => c.tipo === "receber" && c.efetivo !== "paga"),
    "receber",
  );
  const vencidas = contasComStatus.filter((c: any) => c.efetivo === "vencida");
  const vencidasSaldo = totalContas(vencidas.filter((c: any) => c.tipo === "pagar"), "pagar")
    + totalContas(vencidas.filter((c: any) => c.tipo === "receber"), "receber");

  // Caixa da sessão: usa pagamento_em e eventos do ledger após o instante de abertura.
  const fluxoSessao = montarFluxoCaixaMensal({
    ...argumentosFluxo,
    aPartirDe: caixaAberto?.aberta_em ?? null,
    meiosIncluidos: ["dinheiro"],
  });
  const sessaoDentroDaJanela = !caixaAberto ||
    (Date.parse(String(caixaAberto.aberta_em ?? "")) >= Date.parse(faixaFluxo.ini));
  const pagamentosSemDataConfiavel = fluxoSessao.reduce((soma, item) => soma + item.eventosSemData, 0);
  const eventosContaSemMeioCaixa = fluxoSessao.reduce((soma, item) => soma + item.eventosContaMeioDesconhecido, 0);
  const fechamentoDisponivel = fluxoDisponivel && sessaoDentroDaJanela &&
    pagamentosSemDataConfiavel === 0 && eventosContaSemMeioCaixa === 0;
  const entPedidos = fluxoSessao.reduce((soma, item) => soma + item.entradasPedidosCentavos, 0) / 100;
  const entContas = fluxoSessao.reduce((soma, item) => soma + item.entradasContasCentavos, 0) / 100;
  const saiContas = fluxoSessao.reduce((soma, item) => soma + item.saidasContasCentavos, 0) / 100;
  const esperado = caixaAberto
    ? fechamentoDisponivel
      ? saldoCaixaEsperado(Number(caixaAberto.saldo_inicial ?? 0), entPedidos + entContas, saiContas)
      : 0
    : 0;

  // DRE do mês centralizada (montarDRE: bruta recomposta, sem dedução dupla).
  const dre = useMemo(() => {
    const comPagamento = contasComStatus.filter((c: any) =>
      c.tipo === "pagar" && c.efetivo !== "cancelada" &&
      (c.efetivo === "paga" || Number(c.valor_pago ?? 0) > 0),
    );
    return montarDRE(pedidos ?? [], comPagamento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos, contas]);
  const mc = dre.liquida > 0 ? (dre.liquida - dre.cmv) / dre.liquida : 0;
  const pe = pontoEquilibrio(dre.despesas, mc);

  // Fluxo projetado 90 dias: pendentes/vencidas por vencimento.
  const fluxo90 = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() + 90);
    const lim = limite.toISOString().slice(0, 10);
    let rec = 0;
    let pag = 0;
    for (const c of contasComStatus) {
      if (c.efetivo === "paga" || c.efetivo === "cancelada") continue;
      if (!c.vencimento || c.vencimento > lim) continue;
      const falta = (Number(c.valor ?? 0) || 0) - (Number(c.valor_pago ?? 0) || 0);
      if (c.tipo === "receber") rec += falta;
      else pag += falta;
    }
    return { rec, pag, saldo: rec - pag };
  }, [contas]);

  // DRE permanece pela data do pedido; caixa usa data dos eventos/pagamento efetivo.
  const fluxoMensal = fluxoCaixaCalculado.map((periodo) => ({
    chave: periodo.competencia,
    rotulo: new Date(`${periodo.competencia}-01T12:00:00-03:00`)
      .toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", ""),
    entradas: periodo.entradasCentavos / 100,
    saidas: periodo.saidasCentavos / 100,
  }));

  async function abrirCaixa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("caixa_sessoes").insert({
      saldo_inicial: Number(f.get("saldo_inicial") ?? 0),
      responsavel: user!.id,
      observacao: String(f.get("observacao") ?? ""),
    });
    if (error) {
      toast.error("Não foi possível abrir. Rode a migration 0072 no Supabase.");
      return;
    }
    toast.success("Caixa aberto.");
    queryClient.invalidateQueries({ queryKey: ["fin-caixa-aberto"] });
    invalidarFluxoFinanceiro();
  }

  async function fecharCaixa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!caixaAberto) return;
    if (!fechamentoDisponivel) {
      toast.error(pagamentosSemDataConfiavel > 0
        ? "Fechamento bloqueado: há pagamentos históricos sem data confiável. Revise os eventos e a sessão antes de fechar."
        : eventosContaSemMeioCaixa > 0
          ? "Fechamento bloqueado: o meio efetivo de uma ou mais baixas de contas não está registrado. Revise o caixa antes de fechar."
          : "Fechamento bloqueado: recebimentos ou eventos financeiros não puderam ser lidos. Atualize os dados antes de fechar.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const informado = Number(f.get("saldo_informado") ?? 0);
    const dif = diferencaCaixa(informado, esperado);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "fechada",
        fechada_em: new Date().toISOString(),
        saldo_informado: informado,
        diferenca: dif,
      })
      .eq("id", caixaAberto.id)
      .eq("status", "aberta");
    if (error) {
      toast.error("Não foi possível fechar (sessão já fechada por outro turno?).");
      return;
    }
    toast.success(dif === 0 ? "Caixa fechado exato." : `Fechado com diferença de ${brl(dif)}.`);
    queryClient.invalidateQueries({ queryKey: ["fin-caixa-aberto"] });
    queryClient.invalidateQueries({ queryKey: ["fin-caixas"] });
    invalidarFluxoFinanceiro();
  }

  async function salvarConta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("contas").insert({
      tipo: String(f.get("tipo") ?? "pagar"),
      descricao: String(f.get("descricao") ?? ""),
      categoria: String(f.get("categoria") ?? ""),
      centro_custo: String(f.get("centro_custo") ?? ""),
      conta_bancaria_id: String(f.get("conta_bancaria_id") ?? "") || null,
      anexo_url: String(f.get("anexo_url") ?? ""),
      fornecedor: String(f.get("fornecedor") ?? ""),
      valor: Number(f.get("valor") ?? 0),
      meio: String(f.get("meio") ?? "dinheiro"),
      vencimento: String(f.get("vencimento") ?? "") || null,
      parcela_atual: Number(f.get("parcela_atual") ?? 1),
      parcela_total: Number(f.get("parcela_total") ?? 1),
      recorrente: String(f.get("recorrente") ?? "") === "on",
      created_by: user!.id,
    });
    if (error) {
      toast.error("Não foi possível salvar. Rode a migration 0072 no Supabase.");
      return;
    }
    toast.success("Conta registrada.");
    (e.target as HTMLFormElement).reset();
    queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
    invalidarFluxoFinanceiro();
  }

  async function mudarConta(c: any, status: string) {
    const identidade = `estado:${c.id}:${status}`;
    let error: unknown = null;
    let resultado: any = null;
    try {
      if (status === "paga") {
        const resposta = await supabase.rpc("registrar_pagamento_conta", {
          p_conta_id: c.id,
          p_valor_centavos: null,
          p_chave_idempotencia: chaveOperacao(identidade),
        });
        error = resposta.error;
        resultado = resposta.data;
      } else if (status === "cancelada") {
        const resposta = await supabase.rpc("cancelar_conta_financeira", { p_conta_id: c.id });
        error = resposta.error;
        resultado = resposta.data;
      } else {
        toast.error("Estado não suportado.");
        return;
      }
    } catch (e) {
      error = e;
    }
    if (error) {
      toast.error(rpcAtomicaAusente(error)
        ? avisoRpcFinanceira
        : "Não foi possível confirmar a atualização; consulte a conta antes de repetir.");
      return;
    }
    chavesOperacao.current.delete(identidade);
    if (resultado?.status !== "registrado" && resultado?.status !== "cancelada" && resultado?.status !== "repetido") {
      toast.error("A conta não foi alterada. Confira o saldo e o histórico antes de tentar novamente.");
      return;
    }
    toast.success(status === "paga" ? "Conta quitada." : `Conta ${status}.`);
    queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
    invalidarFluxoFinanceiro();
  }

  /** Baixa parcial: acumula valor_pago; quita ao atingir o valor. */
  async function darBaixa(e: React.FormEvent<HTMLFormElement>, c: any) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const valorCentavos = reaisParaCentavos(String(f.get("baixa") ?? ""));
    if (valorCentavos == null || valorCentavos <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    const identidade = `baixa:${c.id}:${valorCentavos}`;
    let error: unknown = null;
    let resultado: any = null;
    try {
      const resposta = await supabase.rpc("registrar_pagamento_conta", {
        p_conta_id: c.id,
        p_valor_centavos: valorCentavos,
        p_chave_idempotencia: chaveOperacao(identidade),
      });
      error = resposta.error;
      resultado = resposta.data;
    } catch (e) {
      error = e;
    }
    if (error) {
      toast.error(rpcAtomicaAusente(error)
        ? avisoRpcFinanceira
        : "Falha ao confirmar a baixa; consulte a conta antes de repetir o valor.");
      return;
    }
    chavesOperacao.current.delete(identidade);
    if (resultado?.status !== "registrado" && resultado?.status !== "repetido") {
      const saldo = Number(resultado?.saldo_centavos);
      toast.error(resultado?.status === "valor_superior_ao_saldo" && Number.isFinite(saldo)
        ? `O pagamento excede o saldo restante de ${brl(saldo / 100)}.`
        : "A baixa não foi registrada. Confira o saldo da conta.");
      return;
    }
    const saldo = Number(resultado?.saldo_centavos);
    toast.success(Number.isFinite(saldo) && saldo === 0
      ? "Conta quitada."
      : `Baixa de ${brl(valorCentavos / 100)} registrada (falta ${brl((Number.isFinite(saldo) ? saldo : 0) / 100)}).`);
    (e.target as HTMLFormElement).reset();
    queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
    invalidarFluxoFinanceiro();
  }

  /** Sangria/suprimento: movimento de caixa via conta em dinheiro paga na hora. */
  async function movimentoCaixa(kind: "sangria" | "suprimento", valor: number) {
    const valorCentavos = reaisParaCentavos(valor);
    if (valorCentavos == null || valorCentavos <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    const identidade = `movimento:${kind}:${valorCentavos}`;
    let error: unknown = null;
    let resultado: any = null;
    try {
      const resposta = await supabase.rpc("registrar_movimento_caixa", {
        p_tipo: kind,
        p_valor_centavos: valorCentavos,
        p_chave_idempotencia: chaveOperacao(identidade),
      });
      error = resposta.error;
      resultado = resposta.data;
    } catch (e) {
      error = e;
    }
    if (error) {
      toast.error(rpcAtomicaAusente(error)
        ? avisoRpcFinanceira
        : "Falha ao confirmar o movimento; consulte o caixa antes de repetir.");
      return;
    }
    chavesOperacao.current.delete(identidade);
    if (resultado?.status !== "registrado" && resultado?.status !== "repetido") {
      toast.error("O movimento não foi registrado.");
      return;
    }
    toast.success(`${kind === "sangria" ? "Sangria" : "Suprimento"} de ${brl(valor)} registrado.`);
    queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
    invalidarFluxoFinanceiro();
  }

  async function salvarBanco(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nome = String(f.get("nome") ?? "").trim();
    if (nome.length < 2) {
      toast.error("Informe o nome.");
      return;
    }
    const { error } = await supabase.from("contas_bancarias").insert({
      nome,
      tipo: String(f.get("tipo") ?? "banco"),
      saldo_inicial: Number(f.get("saldo_inicial") ?? 0) || 0,
    });
    if (error) {
      toast.error("Falha ao salvar. Rode a migration 0078.");
      return;
    }
    toast.success("Conta cadastrada.");
    (e.target as HTMLFormElement).reset();
    queryClient.invalidateQueries({ queryKey: ["fin-bancos"] });
  }

  function exportar(tipo: string) {
    if (tipo === "conciliacao") {
      downloadCSV(`conciliacao-${mes}.csv`, [
        { metrica: "recebido", valor: conc.recebido, qtd: conc.qtdRecebido },
        { metrica: "pendente", valor: conc.pendente, qtd: conc.qtdPendente },
        { metrica: "cancelado", valor: conc.cancelado, qtd: 0 },
        ...Object.entries(conc.porMeio).map(([meio, valor]) => ({
          metrica: `recebido_${meio}`,
          valor,
          qtd: 0,
        })),
      ]);
    } else {
      downloadCSV(
        `contas-${hoje}.csv`,
        contasComStatus.map((c: any) => ({
          tipo: c.tipo,
          descricao: c.descricao,
          categoria: c.categoria,
          fornecedor: c.fornecedor,
          valor: c.valor,
          meio: c.meio,
          vencimento: c.vencimento,
          status: c.efetivo,
          parcela: `${c.parcela_atual}/${c.parcela_total}`,
        })),
      );
    }
  }

  return (
    <>
      {/* Shell real compartilhado com os módulos H01–H07.
          Exibir os números do Supabase, sem carregar a demo financeira. */}
      <div className="financeiro-operacional-premium mx-auto max-w-[1600px] space-y-5 px-3 py-4 sm:px-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D4A94A] bg-[#121110] p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl border border-[#D4A94A] bg-[#201B11] text-[#F2CE6B]">
              <Wallet className="size-7" aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide text-[#F2CE6B]">
                Financeiro — Gestão Completa
              </h1>
              <p className="text-sm text-[#C9C2B8]">
                Caixa, contas, conciliação e resultados reais da Néia Salgados
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-[#F2CE6B]">
            Competência
            <Input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="min-h-11 w-44 border-[#D4A94A]/60 bg-[#17150F] text-base text-foreground"
              aria-label="Mês"
            />
          </label>
        </header>

        <section aria-label="Indicadores financeiros reais" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard icone={ArrowUpCircle} label="Recebimentos do mês"
            valor={fluxoDisponivel ? brl(conc.recebido) : "—"}
            detalhe={fluxoDisponivel ? "entradas confirmadas" : "aguardando dados confiáveis"}
            cor={ERP_COLORS.green} />
          <MetricCard icone={ArrowDownCircle} label="Contas a pagar"
            valor={contas === undefined ? "—" : brl(aPagar)}
            detalhe="saldo ainda pendente" cor={ERP_COLORS.red} />
          <MetricCard icone={Wallet} label="Contas a receber"
            valor={contas === undefined ? "—" : brl(aReceber)}
            detalhe="saldo ainda pendente" cor={ERP_COLORS.blue} />
          <MetricCard icone={ArrowUpCircle} label="Receita bruta"
            valor={pedidosDisponiveis ? brl(dre.bruta) : "—"}
            detalhe="pedidos não cancelados" cor={ERP_COLORS.gold} />
          <MetricCard icone={ArrowDownCircle} label="Despesas contabilizadas"
            valor={pedidosDisponiveis && contas !== undefined ? brl(dre.despesas) : "—"}
            detalhe="despesas operacionais" cor={ERP_COLORS.orange} />
          <MetricCard icone={Wallet} label="Resultado estimado"
            valor={pedidosDisponiveis && contas !== undefined ? brl(dre.resultado) : "—"}
            detalhe="DRE baseada em registros disponíveis" cor={ERP_COLORS.gold} />
        </section>

        <nav aria-label="Seções do financeiro" className="flex flex-wrap gap-2 rounded-xl border border-[#D4A94A]/50 bg-[#141310] p-2">
          <a href="#caixa" className="rounded-lg border border-[#D4A94A]/60 px-4 py-2.5 text-sm font-bold text-[#F2CE6B] hover:bg-[#D4A94A]/15">Caixa</a>
          <a href="#contas-financeiro" className="rounded-lg border border-[#D4A94A]/60 px-4 py-2.5 text-sm font-bold text-[#F2CE6B] hover:bg-[#D4A94A]/15">Contas a pagar e receber</a>
          <a href="#relatorios" className="rounded-lg border border-[#D4A94A]/60 px-4 py-2.5 text-sm font-bold text-[#F2CE6B] hover:bg-[#D4A94A]/15">Relatórios e gráficos</a>
          <a href="#conciliacao-financeiro" className="rounded-lg border border-[#D4A94A]/60 px-4 py-2.5 text-sm font-bold text-[#F2CE6B] hover:bg-[#D4A94A]/15">Conciliação</a>
        </nav>

        {autorizado && user && (
          <AcertosMotoboyFinanceiro usuario={user.id} admin={roles?.includes("admin") ?? false}
            financeiro={roles?.includes("financeiro") ?? false} />
        )}

        {/* Linha 1 — 3 métricas do caixa (dados reais da sessão aberta) */}
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            icone={ArrowUpCircle}
            label="Entradas"
            valor={caixaAberto && fechamentoDisponivel ? brl(entPedidos + entContas) : "—"}
            detalhe="dinheiro recebido no período"
            cor={ERP_COLORS.green}
          />
          <MetricCard
            icone={ArrowDownCircle}
            label="Saídas"
            valor={caixaAberto && fechamentoDisponivel ? brl(saiContas) : "—"}
            detalhe="dinheiro pago no período"
            cor={ERP_COLORS.red}
          />
          <MetricCard
            icone={Wallet}
            label="Saldo"
            valor={caixaAberto && fechamentoDisponivel ? brl(esperado) : "—"}
            detalhe={erroCaixaAberto ? "estado do caixa indisponível" : caixaAberto ? "caixa aberto (esperado)" : "caixa fechado"}
            cor={ERP_COLORS.gold}
          />
        </div>

        {/* Linha 2 — gráfico de fluxo de caixa mensal */}
        <ChartCard titulo="Fluxo de Caixa (últimos 6 meses)" altura="h-64">
          {fluxoDisponivel ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fluxoMensal} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(212,169,74,0.25)" />
              <XAxis
                dataKey="rotulo"
                tick={{ fontSize: 11, fill: "#A09A8E" }}
                axisLine={{ stroke: "#E5E7EB" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10, fill: "#A09A8E" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  background: "#151412",
                  border: "1px solid #D4A94A",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#F4F1EA",
                }}
                labelStyle={{ color: "#A09A8E" }}
                formatter={(v: number, name: string) => [brl(v), name]}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "#A09A8E", fontSize: 11, textTransform: "uppercase" }}>
                    {value}
                  </span>
                )}
              />
              <Bar
                dataKey="entradas"
                name="Entradas"
                fill={ERP_COLORS.green}
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="saidas" name="Saídas" fill={ERP_COLORS.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : <p className="p-6 text-sm text-muted-foreground">
            {eventosPagamentoCaixa === undefined || eventosPedidoCaixa === undefined ||
            pedidosRecebidosCaixa === undefined || pedidosSemDataCaixa === undefined || contas === undefined
              ? "Carregando eventos financeiros…"
              : "Fluxo não calculado: não foi possível ler os eventos de pagamento e as contas. Nenhum total estimado é exibido."}
          </p>}
        </ChartCard>

        {fluxoDisponivel && (fluxoMes?.eventosSemData ?? 0) > 0 && (
          <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            {fluxoMes?.eventosSemData} pagamento(s) ou saldo(s) histórico(s) não incluído(s) no fluxo por falta de eventos ou datas confiáveis.
          </p>
        )}
        {fluxoDisponivel && (fluxoMes?.eventosContaMeioDesconhecido ?? 0) > 0 && (
          <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            {fluxoMes?.eventosContaMeioDesconhecido} baixa(s) de conta sem meio de pagamento registrado; o valor permanece no fluxo total, mas não é atribuído a dinheiro, PIX ou cartão.
          </p>
        )}

        <section id="conciliacao-financeiro" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Conciliação — {mes}</h2>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => exportar("conciliacao")}
            >
              Exportar CSV
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Recebido usa a data efetiva dos eventos de caixa; pedidos a receber e cancelados permanecem agrupados pela competência de criação. A DRE segue a data do pedido.
          </p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>Recebido ({conc.qtdRecebido})</span>
              <strong>{fluxoDisponivel ? brl(conc.recebido) : "—"}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>A receber ({conc.qtdPendente})</span>
              <strong>{valorPedidos(conc.pendente)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>Cancelados</span>
              <strong>{valorPedidos(conc.cancelado)}</strong>
            </p>
          </div>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
            {(["pix", "dinheiro", "credito", "debito"] as const).map((m) => (
              <p key={m} className="flex justify-between rounded-lg border border-border p-2.5">
                <span>Recebido {m}</span>
              <strong>{fluxoDisponivel ? brl(conc.porMeio[m] ?? 0) : "—"}</strong>
              </p>
            ))}
          </div>
        </section>

        <section id="relatorios" className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">DRE do mês — {mes}</h2>
          <p className="text-xs text-muted-foreground">
            Receita de pedidos não cancelados; CMV = insumos pagos; despesas = demais contas pagas.
          </p>
          <div className="mt-3 space-y-1 text-sm">
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>Receita bruta</span>
              <strong>{valorPedidos(dre.bruta)}</strong>
            </p>
            {/* 0103: split Produtos × Entrega (a taxa já está dentro da bruta). */}
            {(() => {
              const sp = splitProdutosEntrega(pedidos ?? []);
              return sp.total > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Produtos {brl(sp.produtos)} • Entrega {brl(sp.entrega)} • Total {brl(sp.total)}
                </p>
              ) : null;
            })()}
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>(−) Cancelamentos</span>
              <strong>{valorPedidos(dre.cancelamentos)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>(−) Descontos</span>
              <strong>{valorPedidos(dre.descontos)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>= Receita líquida</span>
              <strong>{valorPedidos(dre.liquida)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>(−) CMV (insumos)</span>
              <strong>{valorPedidos(dre.cmv)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>= Lucro bruto</span>
              <strong>{valorPedidos(dre.lucroBruto)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>(−) Despesas operacionais</span>
              <strong>{valorPedidos(dre.despesas)}</strong>
            </p>
            <p className="flex justify-between rounded-lg border border-primary/40 bg-primary/5 p-2.5">
              <span>= Resultado</span>
              <strong>
                {pedidosDisponiveis ? `${brl(dre.resultado)} (${dre.margemPct.toFixed(1)}%)` : "—"}
              </strong>
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ponto de equilíbrio:{" "}
            <strong className="text-foreground">
              {!pedidosDisponiveis ? "—" : pe != null ? brl(pe) + "/mês" : "sem base (margem zerada)"}
            </strong>
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Fluxo projetado (90 dias)</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>A receber</span>
              <strong>{valorContas(fluxo90.rec)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>A pagar</span>
              <strong>{valorContas(fluxo90.pag)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>Saldo projetado</span>
              <strong>{valorContas(fluxo90.saldo)}</strong>
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Importar extrato (OFX/CSV)</h2>
            <Button size="sm" variant="outline" className="ml-auto" onClick={baixarModeloCSV}>
              Modelo CSV
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            O vínculo é só sugestão (valor ±2 dias) — confirmar é manual. Confirmar pedido pago
            imprime o cupom.
          </p>
          <div className="mt-2">
            <Input
              type="file"
              accept=".ofx,.csv,.txt"
              onChange={lerArquivo}
              aria-label="Arquivo de extrato"
            />
          </div>
          {previa ? (
            <div className="mt-2 rounded-lg border border-border p-2 text-sm">
              <p className="font-semibold">
                {nomeArq}: {previa.length} lançamento(s). Confira e grave.
              </p>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {previa.slice(0, 20).map((l, i) => (
                  <li key={i}>
                    {l.data} • {l.descricao} • {brl(l.valor)}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={gravarExtrato} disabled={gravandoExtrato}>
                  {gravandoExtrato ? "Gravando…" : "Gravar lançamentos"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPrevia(null)}>
                  Descartar
                </Button>
              </div>
            </div>
          ) : null}
          <ul className="mt-3 space-y-2 text-sm">
            {(extratos ?? []).map((ex: any) => {
              const cands = sugerirVinculo(
                {
                  referencia: ex.referencia,
                  data: ex.data,
                  valor: Number(ex.valor),
                  descricao: ex.descricao,
                },
                (pedidos ?? []).filter((p: any) => p.pagamento_status !== "pago"),
                (contas ?? []).filter((c: any) => c.status !== "paga" && c.status !== "cancelada"),
              );
              return (
                <li key={ex.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {ex.data} • {ex.descricao}
                    </span>
                    <b className="ml-auto">{brl(ex.valor)}</b>
                    <Button size="sm" variant="ghost" onClick={() => ignorarExtrato(ex.id)}>
                      Ignorar
                    </Button>
                  </div>
                  {cands.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {cands.map((c) => (
                        <Button
                          key={`${c.tipo}-${c.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => conciliar(ex, c)}
                        >
                          Vincular: {c.rotulo}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sem sugestão — conferência manual.
                    </p>
                  )}
                </li>
              );
            })}
            {(extratos ?? []).length === 0 && !previa ? (
              <li className="text-muted-foreground">
                {extratosDisponiveis ? "Nenhum lançamento pendente." : "Não foi possível ler os lançamentos pendentes."}
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Contas e carteiras</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(bancos ?? []).map((b: any) => (
              <li
                key={b.id}
                className="flex justify-between gap-2 rounded-lg border border-border p-2.5"
              >
                <span>
                  {b.nome} <span className="text-muted-foreground">• {b.tipo}</span>
                </span>
                <span className="text-muted-foreground">inicial {brl(b.saldo_inicial)}</span>
              </li>
            ))}
            {(bancos ?? []).length === 0 ? (
              <li className="text-muted-foreground">
                {bancosDisponiveis ? "Nenhuma conta cadastrada." : "Não foi possível ler as contas cadastradas."}
              </li>
            ) : null}
          </ul>
          <form onSubmit={salvarBanco} className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome *</Label>
              <Input name="nome" required maxLength={80} placeholder="Banco, PIX, maquininha…" />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                name="tipo"
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                defaultValue="banco"
              >
                <option value="banco">Banco</option>
                <option value="pix">PIX</option>
                <option value="maquininha">Maquininha</option>
                <option value="caixa">Caixa</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Saldo inicial</Label>
              <Input name="saldo_inicial" type="number" min={0} step="0.01" defaultValue={0} />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" size="sm">
                Cadastrar conta
              </Button>
            </div>
          </form>
        </section>

        <section id="caixa" className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-display text-xl">Caixa</h2>
          {erroCaixaAberto ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Estado do caixa indisponível. Atualize a lista antes de abrir ou fechar uma sessão.
            </p>
          ) : caixaAberto ? (
            <form onSubmit={fecharCaixa} className="mt-3 space-y-2 text-sm">
              <p>
                Aberto em {caixaAberto.aberta_em} • Inicial{" "}
                <strong>{brl(caixaAberto.saldo_inicial)}</strong>
              </p>
              <p>
                {fechamentoDisponivel ? <>
                  Entradas (dinheiro) <strong>{brl(entPedidos + entContas)}</strong> • Saídas
                  (dinheiro) <strong>{brl(saiContas)}</strong> • Esperado <strong>{brl(esperado)}</strong>
                </> : pagamentosSemDataConfiavel > 0
                  ? "Fechamento indisponível: existem pagamentos sem data confiável; revise o histórico antes de fechar."
                  : eventosContaSemMeioCaixa > 0
                    ? "Fechamento indisponível: o meio efetivo de baixas de contas não foi registrado."
                    : "Valores do caixa indisponíveis até a leitura completa dos eventos da sessão."}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label>Saldo contado no fechamento</Label>
                  <Input
                    name="saldo_informado"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    className="w-44"
                  />
                </div>
                <Button type="submit" size="sm">
                  Fechar caixa
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={abrirCaixa} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
              <div className="space-y-1">
                <Label>Saldo inicial</Label>
                <Input
                  name="saldo_inicial"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={0}
                  className="w-44"
                />
              </div>
              <div className="space-y-1">
                <Label>Observação</Label>
                <Input name="observacao" maxLength={200} className="w-64" />
              </div>
              <Button type="submit" size="sm">
                Abrir caixa
              </Button>
            </form>
          )}
          {caixaAberto ? (
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  movimentoCaixa(
                    "sangria",
                    Number(new FormData(e.currentTarget).get("valor") ?? 0),
                  );
                  (e.target as HTMLFormElement).reset();
                }}
                className="flex items-end gap-2 rounded-lg border border-border p-2"
              >
                <div className="space-y-1">
                  <Label>Sangria (retirada)</Label>
                  <Input name="valor" type="number" min={0} step="0.01" required className="w-32" />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Registrar
                </Button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  movimentoCaixa(
                    "suprimento",
                    Number(new FormData(e.currentTarget).get("valor") ?? 0),
                  );
                  (e.target as HTMLFormElement).reset();
                }}
                className="flex items-end gap-2 rounded-lg border border-border p-2"
              >
                <div className="space-y-1">
                  <Label>Suprimento (reforço)</Label>
                  <Input name="valor" type="number" min={0} step="0.01" required className="w-32" />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Registrar
                </Button>
              </form>
            </div>
          ) : null}
          {(caixas ?? []).length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {(caixas ?? []).map((s: any) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{String(s.fechada_em ?? "").slice(0, 10)}</span>
                  <span>
                    Inicial {brl(s.saldo_inicial)} • Informado {brl(s.saldo_informado)} • Diferença{" "}
                    {brl(s.diferenca)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section id="contas-financeiro" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Contas a pagar e receber</h2>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => exportar("contas")}
            >
              Exportar CSV
            </Button>
          </div>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>A pagar</span>
              <strong>{valorContas(aPagar)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>A receber</span>
              <strong>{valorContas(aReceber)}</strong>
            </p>
            <p className="flex justify-between rounded-lg bg-muted p-2.5">
              <span>Vencidas ({vencidas.length})</span>
              <strong>{valorContas(vencidasSaldo)}</strong>
            </p>
          </div>
          <form onSubmit={salvarConta} className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                name="tipo"
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                defaultValue="pagar"
              >
                <option value="pagar">A pagar</option>
                <option value="receber">A receber</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Descrição *</Label>
              <Input name="descricao" required maxLength={200} />
            </div>
            <div className="space-y-1">
              <Label>Valor *</Label>
              <Input name="valor" type="number" min={0} step="0.01" required />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input name="categoria" maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label>Centro de custo</Label>
              <Input name="centro_custo" maxLength={60} placeholder="cozinha, entrega…" />
            </div>
            <div className="space-y-1">
              <Label>Conta / carteira</Label>
              <select
                name="conta_bancaria_id"
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                defaultValue=""
              >
                <option value="">—</option>
                {(bancos ?? []).map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Anexo (URL do comprovante)</Label>
              <Input name="anexo_url" maxLength={500} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Input name="fornecedor" maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label>Meio</Label>
              <select
                name="meio"
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                defaultValue="dinheiro"
              >
                {MEIOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Vencimento</Label>
              <Input name="vencimento" type="date" />
            </div>
            <div className="space-y-1">
              <Label>Parcela atual</Label>
              <Input name="parcela_atual" type="number" min={1} defaultValue={1} />
            </div>
            <div className="space-y-1">
              <Label>Total de parcelas</Label>
              <Input name="parcela_total" type="number" min={1} defaultValue={1} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="recorrente" /> Conta recorrente
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm">
                Registrar conta
              </Button>
            </div>
          </form>
          <ul className="mt-3 space-y-2 text-sm">
            {(contasComStatus ?? []).map((c: any) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
              >
                <span className="font-semibold">
                  {c.tipo === "pagar" ? "A pagar" : "A receber"} • {brl(c.valor)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.descricao} {c.fornecedor ? `• ${c.fornecedor}` : ""}{" "}
                  {c.vencimento ? `• vence ${c.vencimento}` : ""} • parcela {c.parcela_atual}/
                  {c.parcela_total}
                  {c.recorrente ? " • recorrente" : ""} • {c.efetivo}
                  {Number(c.valor_pago ?? 0) > 0 && c.efetivo !== "paga"
                    ? ` • pago parcial ${brl(c.valor_pago)}`
                    : ""}
                  {c.centro_custo ? ` • ${c.centro_custo}` : ""}
                </span>
                <span className="ml-auto flex flex-wrap gap-1">
                  {c.efetivo !== "paga" ? (
                    <form onSubmit={(e) => darBaixa(e, c)} className="flex items-center gap-1">
                      <Input
                        name="baixa"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Baixa R$"
                        className="h-8 w-28"
                        aria-label={`Baixa parcial em ${c.descricao}`}
                      />
                      <Button size="sm" variant="outline" type="submit">
                        Baixar
                      </Button>
                    </form>
                  ) : null}
                  {c.efetivo !== "paga" ? (
                    <Button size="sm" variant="outline" onClick={() => mudarConta(c, "paga")}>
                      Marcar paga
                    </Button>
                  ) : null}
                  {c.efetivo !== "cancelada" ? (
                    <Button size="sm" variant="ghost" onClick={() => mudarConta(c, "cancelada")}>
                      Cancelar
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
            {(contasComStatus ?? []).length === 0 ? (
              <li className="text-muted-foreground">Nenhuma conta registrada.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </>
  );
}
