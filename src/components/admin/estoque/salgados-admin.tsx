import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CircleHelp,
  ClipboardList,
  History,
  ListOrdered,
  MinusCircle,
  Package,
  Plus,
  Snowflake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ehModoDemo } from "@/lib/demo-preview";
import { usePerfil, useRoles, useSession } from "@/lib/session";
import {
  operacoesSalgados,
  validarMovimentoSalgados,
  type OperacaoSalgados,
} from "@/lib/operacoes-salgados";
import { DarkTable, DarkTableRow } from "@/components/admin/erp-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  categoriasProdutosSalgados,
  categoriasSaboresEstoque,
  organizarSaboresEstoque,
  type OperacaoSaborEstoque,
} from "@/lib/catalogo-sabores-estoque";
import {
  diasDaValidade,
  lerSituacaoSalgado,
  loteVencidoComSaldo,
  situacoesSalgados,
} from "@/lib/situacao-salgados";
import { EstoqueCategorias, FotoSabor, formatarQuantidade } from "./salgados-categorias";
import { HistoricoSalgados } from "./salgados-historico";
import { OrganizadorSabores } from "./salgados-organizador";
import "./salgados-admin.css";

/**
 * A lista oficial organiza o painel. Saldos, lotes e movimentações dos
 * sabores vinculados vêm das mesmas fontes operacionais do estoque E01.
 */

const numero = new Intl.NumberFormat("pt-BR");
const diaLoja = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

function formatarData(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

/** Lote com saldo e validade em até 7 dias (data real do banco). */
function alertaValidade(validade: string | null, hoje: string) {
  if (!validade) return false;
  const dias = diasDaValidade(validade, hoje);
  return dias >= 0 && dias <= 7;
}

type ProdutoPainel = {
  id: string;
  nome: string;
  imagem_url: string | null;
  ativo: boolean;
  disponivel: boolean;
  estoque: number | null;
  estoque_minimo: number | null;
  tipo_venda: string;
  unidade_medida: string;
  categorias: { slug: string; nome: string };
};

type PedidoPainel = { id: string; numero: string | number | null; created_at: string };
type VinculoPainel = { chave: string; ordem: number; produto_id: string | null };
type OrdemPainel = { chave: string; ordem: number };

type DadosSalgados = {
  produtos: ProdutoPainel[];
  pedidos: PedidoPainel[];
  vinculos: VinculoPainel[] | null;
  ordens: OrdemPainel[];
  operacoesPorChave: Map<string, OperacaoSaborEstoque>;
  porChave: boolean;
};

/** O esquema anterior ainda pode atender ao painel antes da migration 0129. */
function erroEsquemaAntigo(falha: { code?: string; message?: string }) {
  const codigo = falha.code ?? "";
  return (
    ["42P01", "42703", "PGRST204", "PGRST205"].includes(codigo) ||
    /sabor_chave|sabores_estoque_vinculos/i.test(falha.message ?? "")
  );
}

function montarOperacao(args: {
  ativo: boolean;
  estoque: number | null;
  minimo: number | null;
  temMovimento: boolean;
  lotesTodos: OperacaoSaborEstoque["lotesTodos"];
  reservas: OperacaoSaborEstoque["reservas"];
}): OperacaoSaborEstoque {
  const lotesFefo = args.lotesTodos.filter((lote) => lote.status === "ativo" && lote.restante > 0);
  const fisico = lotesFefo.reduce((total, lote) => total + lote.restante, 0);
  const reservado = args.reservas.reduce((total, reserva) => total + reserva.pendente, 0);
  return {
    ativo: args.ativo,
    estoque: args.estoque ?? 0,
    minimo: args.minimo ?? 0,
    temMovimento: args.temMovimento,
    lotesTodos: args.lotesTodos,
    lotesFefo,
    reservas: args.reservas,
    fisico,
    reservado,
    disponivel: fisico - reservado,
  };
}

function operacaoDoSabor(sabor: {
  operacao?: OperacaoSaborEstoque | undefined;
  produto?: unknown;
}): OperacaoSaborEstoque | undefined {
  if (sabor.operacao) return sabor.operacao;
  const produto = sabor.produto as OperacaoSaborEstoque | undefined;
  return produto && Array.isArray(produto.lotesTodos) && Array.isArray(produto.reservas)
    ? produto
    : undefined;
}

/**
 * O emulador de demonstração não entende `select` aninhado do PostgREST.
 * Este caminho existe SOMENTE para as capturas locais (VITE_DEMO_PREVIEW=1);
 * no build operacional a consulta aninhada real permanece intacta abaixo.
 */
async function consultarSalgadosDemo() {
  const [
    { data: produtosData, error: erroProdutos },
    { data: lotes },
    { data: reservas },
    { data: consumos },
    { data: pedidos },
    { data: movimentos },
  ] = await Promise.all([
    supabase
      .from("produtos")
      .select(
        "id, nome, imagem_url, disponivel, estoque, estoque_minimo, tipo_venda, unidade_medida, categoria_id",
      )
      .order("nome"),
    supabase.from("lotes").select("id, codigo, validade, restante, status, produto_id"),
    supabase.from("reservas_estoque").select("id, pedido_id, produto_id, quantidade, status"),
    supabase.from("reserva_consumos").select("id, reserva_id, quantidade"),
    supabase.from("pedidos").select("id, numero, created_at").eq("status", "em_producao").limit(50),
    supabase.from("estoque_movimentacoes").select("produto_id"),
  ]);
  if (erroProdutos) throw erroProdutos;

  const categoriasDemo = new Map(
    (await supabase.from("categorias").select("id, nome, slug")).data?.map((c) => [c.id, c]) ?? [],
  );
  const produtos = (produtosData ?? [])
    .filter((p) =>
      categoriasProdutosSalgados.includes(categoriasDemo.get(p.categoria_id)?.slug ?? ""),
    )
    .map((p) => {
      const categoria = categoriasDemo.get(p.categoria_id);
      const lotesProduto = (lotes ?? []).filter((l) => l.produto_id === p.id);
      const reservasProduto = (reservas ?? [])
        .filter((r) => r.produto_id === p.id && r.status === "ativa")
        .map((r) => {
          const consumido = (consumos ?? [])
            .filter((c) => c.reserva_id === r.id)
            .reduce((s, c) => s + c.quantidade, 0);
          return {
            id: r.id,
            pedidoId: r.pedido_id,
            quantidade: r.quantidade,
            consumido,
            pendente: Math.max(0, r.quantidade - consumido),
          };
        });
      const lotesFefo = lotesProduto.filter((l) => l.status === "ativo" && l.restante > 0);
      const fisico = lotesFefo.reduce((total, l) => total + l.restante, 0);
      const reservado = reservasProduto.reduce((total, r) => total + r.pendente, 0);
      return {
        ...p,
        ativo: p.disponivel,
        imagem_url: null,
        categorias: { slug: categoria?.slug ?? "", nome: categoria?.nome ?? "—" },
        lotes: lotesProduto,
        lotesTodos: lotesProduto,
        lotesFefo,
        reservas: reservasProduto,
        estoque: p.estoque ?? 0,
        minimo: p.estoque_minimo ?? 0,
        temMovimento: movimentos?.some((m) => m.produto_id === p.id) ?? false,
        fisico,
        reservado,
        saldoDisponivel: fisico - reservado,
      };
    });
  return {
    produtos,
    pedidos: pedidos ?? [],
    vinculos: null,
    ordens: [],
    operacoesPorChave: new Map<string, OperacaoSaborEstoque>(),
    porChave: false,
  };
}

async function consultarSalgados(signal: AbortSignal): Promise<DadosSalgados> {
  if (ehModoDemo()) return consultarSalgadosDemo();
  const [{ data: produtosData, error: erroProdutos }, { data: pedidos }, cadastro] =
    await Promise.all([
      supabase
        .from("produtos")
        .select(
          "id, nome, imagem_url, disponivel, estoque, estoque_minimo, tipo_venda, unidade_medida, categorias!inner(slug, nome)",
        )
        .in("categorias.slug", categoriasProdutosSalgados)
        .order("nome")
        .abortSignal(signal),
      supabase
        .from("pedidos")
        .select("id, numero, created_at")
        .eq("status", "em_producao")
        .order("created_at", { ascending: false })
        .limit(50)
        .abortSignal(signal),
      supabase.from("sabores_estoque").select("chave, ordem, produto_id").abortSignal(signal),
    ]);
  if (erroProdutos) throw erroProdutos;
  // A versão anterior do banco ainda pode atender à tela antes do cadastro oficial.
  if (cadastro.error && !["42P01", "PGRST205"].includes(cadastro.error.code)) throw cadastro.error;

  const produtos: ProdutoPainel[] = (produtosData ?? []).map((produto) => ({
    ...produto,
    ativo: produto.disponivel,
  }));
  const saboresCadastro = cadastro.data ?? [];
  const ordens = saboresCadastro.map((sabor) => ({ chave: sabor.chave, ordem: sabor.ordem }));
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));
  const ordemPorChave = new Map(saboresCadastro.map((sabor) => [sabor.chave, sabor.ordem]));

  const vínculosResp = await supabase
    .from("sabores_estoque_vinculos")
    .select("chave, produto_id, ativo")
    .abortSignal(signal);
  let porChave = false;
  if (vínculosResp.error) {
    if (!erroEsquemaAntigo(vínculosResp.error)) throw vínculosResp.error;
  } else {
    porChave = true;
  }
  const ativos = porChave
    ? (vínculosResp.data ?? []).filter((vínculo) => vínculo.ativo)
    : [];
  const vinculos: VinculoPainel[] = porChave
    ? ativos.map((vínculo) => ({
        chave: vínculo.chave,
        ordem: ordemPorChave.get(vínculo.chave) ?? 0,
        produto_id: vínculo.produto_id,
      }))
    : saboresCadastro
        .filter((sabor) => !!sabor.produto_id)
        .map((sabor) => ({
          chave: sabor.chave,
          ordem: sabor.ordem,
          produto_id: sabor.produto_id,
        }));
  const produtoPorChave = new Map(vinculos.map((vínculo) => [vínculo.chave, vínculo.produto_id]));
  const chavePorProduto = new Map<string, string>();
  for (const sabor of saboresCadastro) {
    if (sabor.produto_id) chavePorProduto.set(sabor.produto_id, sabor.chave);
  }
  for (const vínculo of vinculos) {
    if (vínculo.produto_id) chavePorProduto.set(vínculo.produto_id, vínculo.chave);
  }

  const operacoesPorChave = new Map<string, OperacaoSaborEstoque>();
  if (porChave) {
    // A identidade canônica passa a ser a chave. Lotes, reservas e movimentos
    // escritos após a 0129 são lidos por sabor_chave; os antigos, por produto_id.
    const [lotesResp, reservasResp, movimentosResp] = await Promise.all([
      supabase
        .from("lotes")
        .select("id, codigo, validade, restante, status, produto_id, sabor_chave")
        .abortSignal(signal),
      supabase
        .from("reservas_estoque")
        .select(
          "id, pedido_id, produto_id, quantidade, status, sabor_chave, reserva_consumos(quantidade)",
        )
        .abortSignal(signal),
      supabase
        .from("estoque_movimentacoes")
        .select("id, produto_id, sabor_chave")
        .abortSignal(signal),
    ]);
    if (lotesResp.error) throw lotesResp.error;
    if (reservasResp.error) throw reservasResp.error;
    if (movimentosResp.error) throw movimentosResp.error;

    for (const sabor of saboresCadastro) {
      const produtoId = produtoPorChave.get(sabor.chave);
      const produto = produtoId ? porId.get(produtoId) : undefined;
      const lotesTodos = (lotesResp.data ?? []).filter(
        (lote) =>
          lote.sabor_chave === sabor.chave ||
          (!lote.sabor_chave &&
            !!lote.produto_id &&
            chavePorProduto.get(lote.produto_id) === sabor.chave),
      );
      const reservas = (reservasResp.data ?? [])
        .filter(
          (reserva) =>
            reserva.status === "ativa" &&
            (reserva.sabor_chave === sabor.chave ||
              (!reserva.sabor_chave &&
                !!reserva.produto_id &&
                chavePorProduto.get(reserva.produto_id) === sabor.chave)),
        )
        .map((reserva) => {
          const consumido = reserva.reserva_consumos.reduce(
            (total, retirada) => total + retirada.quantidade,
            0,
          );
          return {
            id: reserva.id,
            pedidoId: reserva.pedido_id,
            quantidade: reserva.quantidade,
            consumido,
            pendente: Math.max(0, reserva.quantidade - consumido),
          };
        });
      const temMovimento = (movimentosResp.data ?? []).some(
        (movimento) =>
          movimento.sabor_chave === sabor.chave ||
          (!movimento.sabor_chave &&
            !!movimento.produto_id &&
            chavePorProduto.get(movimento.produto_id) === sabor.chave),
      );
      // Um único físico por sabor e disponível = físico − reservado.
      // Reservado soma cada reserva uma vez, sem duplicar origens de combo.
      operacoesPorChave.set(
        sabor.chave,
        montarOperacao({
          ativo: produto ? produto.disponivel : true,
          estoque: produto?.estoque ?? 0,
          minimo: produto?.estoque_minimo ?? 0,
          temMovimento,
          lotesTodos,
          reservas,
        }),
      );
    }
  } else {
    const ids = produtos.map((produto) => produto.id);
    const operacoesResp = await supabase
      .from("produtos")
      .select(
        `
        id,
        lotes(id, codigo, validade, restante, status),
        movimentos:estoque_movimentacoes(id),
        reservas_estoque(id, pedido_id, quantidade, status, reserva_consumos(quantidade))
      `,
      )
      .in("id", ids)
      .abortSignal(signal);
    if (operacoesResp.error) throw operacoesResp.error;
    for (const sabor of saboresCadastro) {
      const produtoId = produtoPorChave.get(sabor.chave) ?? sabor.produto_id;
      if (!produtoId) continue;
      const operacao = (operacoesResp.data ?? []).find((item) => item.id === produtoId);
      if (!operacao) continue;
      const reservas = operacao.reservas_estoque
        .filter((reserva) => reserva.status === "ativa")
        .map((reserva) => {
          const consumido = reserva.reserva_consumos.reduce(
            (total, retirada) => total + retirada.quantidade,
            0,
          );
          return {
            id: reserva.id,
            pedidoId: reserva.pedido_id,
            quantidade: reserva.quantidade,
            consumido,
            pendente: Math.max(0, reserva.quantidade - consumido),
          };
        });
      operacoesPorChave.set(
        sabor.chave,
        montarOperacao({
          ativo: porId.get(produtoId)?.disponivel ?? false,
          estoque: porId.get(produtoId)?.estoque ?? 0,
          minimo: porId.get(produtoId)?.estoque_minimo ?? 0,
          temMovimento: operacao.movimentos.length > 0,
          lotesTodos: operacao.lotes,
          reservas,
        }),
      );
    }
  }

  return {
    produtos,
    pedidos: pedidos ?? [],
    vinculos,
    ordens,
    operacoesPorChave,
    porChave,
  };
}

function JanelaEstoque({
  titulo,
  descricao,
  fechar,
  children,
}: {
  titulo: string;
  descricao: string;
  fechar: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent className="neia-a01-dialogo est-salgados-dialogo">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const horaLoja = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
type Janela =
  | OperacaoSalgados
  | "detalhes"
  | "historico"
  | "movimentos"
  | "alertas"
  | "ajuda"
  | "conferencia"
  | "foto";

export function SalgadosAdmin({ onProdutos }: { onProdutos: (nome?: string) => void }) {
  const [janela, setJanela] = useState<Janela>();
  const [organizando, setOrganizando] = useState(false);
  const [chave, setChave] = useState("");
  const [loteId, setLoteId] = useState("");
  const [contado, setContado] = useState("");
  const [historicoId, setHistoricoId] = useState<string>();
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const operacaoEmCurso = useRef(false);
  const envio = useRef<{ assinatura: string; id: string } | null>(null);
  const { user } = useSession();
  const { data: perfil } = usePerfil(user?.id);
  const { data: funcoes } = useRoles(user?.id);
  const admin = funcoes?.includes("admin") ?? false;
  const podeMovimentar = admin || !!funcoes?.includes("producao");
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["admin-estoque-salgados"],
    queryFn: ({ signal }) => consultarSalgados(signal),
  });
  const produtos = data?.produtos;
  const hoje = diaLoja.format(new Date());
  const { sabores, legados } = organizarSaboresEstoque<NonNullable<typeof produtos>[number]>(
    produtos ?? [],
    data?.vinculos ?? null,
    data?.ordens ?? [],
    data?.operacoesPorChave ?? null,
  );
  const idsConfirmados = new Map(data?.vinculos?.map((s) => [s.chave, s.produto_id]));
  const linhas = sabores.map((sabor) => ({
    ...sabor,
    situacao: lerSituacaoSalgado(operacaoDoSabor(sabor), hoje),
  }));
  const selecionado = linhas.find((s) => s.chave === chave);
  const produto = selecionado?.produto;
  const operacao = selecionado ? operacaoDoSabor(selecionado) : undefined;
  const situacao = selecionado?.situacao;
  // Com a 0129 a identidade é a chave; sem ela, depende do produto legado.
  const vinculado = !!produto && idsConfirmados.get(chave) === produto.id && !ehModoDemo();
  const identidadeAtiva =
    !ehModoDemo() && (data?.porChave ? !!selecionado : vinculado);
  const lotes = operacao?.lotesTodos ?? [];
  const lote = lotes.find((l) => l.id === loteId);
  const tipo = janela && janela in operacoesSalgados ? (janela as OperacaoSalgados) : undefined;
  const historicoProdutos = [
    ...linhas.map((s) => ({
      id: s.produto?.id ?? "",
      nome: s.nome,
      chave: s.chave,
    })),
    ...(admin
      ? legados
          .filter((p) => !linhas.some((s) => s.produto?.id === p.id))
          .map((p) => ({ id: p.id, nome: p.nome, chave: undefined as string | undefined }))
      : []),
  ];
  const pedidos = data?.pedidos ?? [];
  const numerosPedidos = new Map(pedidos.map((p) => [p.id, p.numero]));
  const pedidoLabel = (id: string) =>
    numerosPedidos.has(id) ? "#" + numerosPedidos.get(id) : "Pedido vinculado";
  const reservas = operacao?.reservas.filter((r) => r.pendente > 0) ?? [];
  const saldoUtil =
    operacao?.lotesFefo
      .filter((l) => !l.validade || l.validade >= hoje)
      .reduce((n, l) => n + l.restante, 0) ?? 0;
  const disponivelUtil = saldoUtil - (operacao?.reservado ?? 0);
  const responsavel = perfil?.nome || user?.email || "Sessão indisponível";

  function abrir(nova: Janela, sabor = chave) {
    setChave(sabor);
    setJanela(nova);
    setErro("");
    setLoteId("");
    setContado("");
    setHistoricoId(undefined);
  }
  function abrirHistorico(id?: string) {
    abrir("historico");
    setHistoricoId(id);
  }
  function fechar() {
    if (!operacaoEmCurso.current) setJanela(undefined);
  }
  function identificarEnvio(assinatura: string) {
    if (envio.current?.assinatura !== assinatura)
      envio.current = { assinatura, id: crypto.randomUUID() };
    return envio.current.id;
  }
  function erroGravacao(falha: unknown) {
    if (
      typeof falha === "object" &&
      falha !== null &&
      "code" in falha &&
      falha.code === "PGRST202"
    ) {
      return "A operação depende da instalação da rotina de lotes no banco.";
    }
    if (
      typeof falha === "object" &&
      falha !== null &&
      "code" in falha &&
      falha.code === "P0001" &&
      "message" in falha &&
      typeof falha.message === "string"
    )
      return falha.message;
    return falha instanceof Error
      ? falha.message
      : "O banco recusou a operação. Atualize os dados e confira o saldo.";
  }
  async function gravar(executar: () => Promise<void>, mensagem: string) {
    if (operacaoEmCurso.current) return;
    operacaoEmCurso.current = true;
    setSalvando(true);
    setErro("");
    try {
      await executar();
      toast.success(mensagem);
      envio.current = null;
      setJanela(undefined);
      await refetch();
    } catch (falha) {
      setErro(erroGravacao(falha));
    } finally {
      operacaoEmCurso.current = false;
      setSalvando(false);
    }
  }
  async function registrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !tipo ||
      !identidadeAtiva ||
      !user ||
      !podeMovimentar ||
      (tipo === "ajuste" && !admin) ||
      (tipo === "reserva" && !produto)
    )
      return;
    const dados = new FormData(event.currentTarget);
    const ler = (nome: string) => String(dados.get(nome) ?? "").trim();
    const quantidade = ler("quantidade"),
      codigo = ler("codigo"),
      fabricacao = ler("fabricacao"),
      validade = ler("validade");
    const motivo = ler("motivo"),
      notas = ler("observacoes"),
      pedido = ler("pedido");
    const reserva = reservas.find((r) => r.id === ler("reserva"));
    const erroCampo = validarMovimentoSalgados({
      tipo,
      quantidade,
      codigo,
      fabricacao,
      validade,
      motivo,
      hoje,
      disponivel: disponivelUtil,
      lote: lote ? { ...lote, inutilizavel: loteVencidoComSaldo(lote, hoje) } : undefined,
      reserva,
      pedido,
    });
    if (erroCampo) {
      setErro(erroCampo);
      return;
    }
    if (tipo === "entrada" && lotes.some((l) => l.codigo.toLowerCase() === codigo.toLowerCase())) {
      setErro("Já existe um lote com este código para o sabor.");
      return;
    }
    const observacao = [motivo, notas].filter(Boolean).join(" · ");
    const id = identificarEnvio(
      JSON.stringify([
        chave,
        tipo,
        produto?.id ?? null,
        quantidade,
        codigo,
        fabricacao,
        validade,
        loteId,
        pedido,
        reserva?.id,
        observacao,
      ]),
    );
    await gravar(async () => {
      if (tipo === "reserva") {
        if (!produto)
          throw new Error("A reserva exige um produto comercial vinculado ao pedido.");
        if (!pedidos.some((p) => p.id === pedido))
          throw new Error("Selecione um pedido em produção.");
        const r = await supabase.rpc("reservar_estoque_atomica", {
          p_pedido_id: pedido,
          p_produto_id: produto.id,
          p_qtd: Number(quantidade),
        });
        if (r.error) throw r.error;
        if (r.data !== true) throw new Error("O pedido ou o saldo disponível mudou.");
        return;
      }
      if (tipo === "liberar") {
        if (!reservas.some((r) => r.pedidoId === pedido))
          throw new Error("Selecione um pedido com reserva pendente.");
        const r = await supabase.rpc("cancelar_pedido_atomico", {
          p_pedido_id: pedido,
          p_motivo: observacao || "Cancelamento pelo estoque",
        });
        if (r.error) throw r.error;
        if (
          !r.data ||
          typeof r.data !== "object" ||
          !("status" in r.data) ||
          !["cancelado", "ja_cancelado"].includes(String(r.data["status"]))
        )
          throw new Error("O pedido não pôde ser cancelado.");
        return;
      }
      const r = await supabase.rpc("movimentar_lote_salgado", {
        p_sabor: chave,
        p_produto: produto?.id ?? null,
        p_tipo: tipo,
        p_quantidade: Number(quantidade),
        p_chave: id,
        ...(lote && (tipo === "perda" || tipo === "ajuste")
          ? { p_lote: lote.id, p_saldo_esperado: lote.restante }
          : {}),
        ...(tipo === "entrada"
          ? { p_codigo: codigo, p_fabricacao: fabricacao, p_validade: validade }
          : {}),
        ...(tipo === "retirada" && reserva ? { p_reserva: reserva.id } : {}),
        p_observacao: observacao,
      });
      if (r.error) throw r.error;
      if (r.data !== "registrado" && r.data !== "ja_registrado")
        throw new Error("A movimentação não foi confirmada.");
    }, "Movimentação confirmada no estoque.");
  }

  async function persistirOrdem(chaves: string[], acao: "salvar" | "restaurar") {
    if (!user || !admin) return;
    const resposta = await supabase.rpc("reordenar_sabores_estoque", {
      p_chaves: chaves,
      p_acao: acao,
    });
    if (resposta.error) {
      if (resposta.error.code === "PGRST202")
        throw new Error("A rotina de organização ainda não está instalada no banco.");
      throw resposta.error;
    }
    const dado: unknown = resposta.data;
    const status =
      typeof dado === "object" && dado !== null && "status" in dado
        ? String(dado.status)
        : "";
    if (!["ok", "sem_alteracao"].includes(status))
      throw new Error("O banco não confirmou a nova sequência.");
    toast.success(
      acao === "salvar" ? "Sequência dos sabores salva." : "Sequência anterior restaurada.",
    );
    setOrganizando(false);
    await refetch();
  }

  return (
    <div data-testid="estoque-salgados" className="neia-a01 est-salgados-painel">
      <header className="neia-a01-cabecalho">
        <div className="est-salgados-titulo">
          <span>
            <Snowflake size={26} aria-hidden />
          </span>
          <div>
            <h1>Estoque de Salgados</h1>
            <p>Controle por sabor, lotes, reservas e movimentações.</p>
          </div>
        </div>
        <div className="est-salgados-cabecalho-acoes">
          <button className="neia-a01-dourado" onClick={() => abrir("entrada")}>
            <Plus size={19} /> Entrada de estoque
          </button>
          <button className="neia-a01-dourado" onClick={() => abrir("perda")}>
            <MinusCircle size={17} /> Registrar perda
          </button>
          <button className="neia-a01-dourado" onClick={() => abrir("ajuste")}>
            <ClipboardList size={17} /> Inventário
          </button>
          <button className="neia-a01-dourado" onClick={() => abrirHistorico()}>
            <History size={17} /> Histórico
          </button>
          {admin && (
            <button className="neia-a01-dourado" onClick={() => setOrganizando(true)}>
              <ListOrdered size={17} /> Organizar sabores
            </button>
          )}
        </div>
      </header>
      {isPending && <p role="status">Carregando estoque e reservas…</p>}
      {isError && (
        <p role="alert">
          Não foi possível consultar o estoque.{" "}
          <button onClick={() => void refetch()}>Tentar novamente</button>
        </p>
      )}
      {!isPending && !isError && (
        <>
          <EstoqueCategorias
            sabores={linhas}
            cadastrados={
              linhas.filter((s) => !!s.produto && idsConfirmados.get(s.chave) === s.produto.id)
                .length
            }
            acoes={{
              onVer: (sabor) => abrir("detalhes", sabor),
              onHistorico: (id) =>
                abrirHistorico(linhas.find((s) => s.produto?.id === id)?.chave ?? id),
              onInventario: (id) =>
                abrir("ajuste", linhas.find((s) => s.produto?.id === id)?.chave),
            }}
          />
          <div className="est-salgados-cabecalho-acoes est-salgados-secundarias">
            <button onClick={() => abrir("movimentos")}>
              <ArrowLeftRight size={17} /> Movimentações
            </button>
            <button onClick={() => abrir("alertas")}>
              <Bell size={17} /> Alertas
            </button>
            <button onClick={() => abrir("ajuda")}>
              <CircleHelp size={17} /> Ajuda
            </button>
            {admin && (
              <button onClick={() => abrir("conferencia")}>
                <ClipboardList size={17} /> Conferência de cadastros
              </button>
            )}
          </div>
        </>
      )}

      {tipo && (
        <JanelaEstoque
          key={tipo}
          titulo={operacoesSalgados[tipo]}
          descricao="Controle por unidade e lote."
          fechar={fechar}
        >
          <form className="neia-a01-form" onSubmit={(event) => void registrar(event)}>
            <div className="est-dialog-grid">
              <label>
                Categoria
                <select
                  value={selecionado?.categoria ?? ""}
                  onChange={(e) => {
                    setChave(linhas.find((s) => s.categoria === e.target.value)?.chave ?? "");
                    setLoteId("");
                    setContado("");
                    setErro("");
                  }}
                >
                  <option value="">Selecione</option>
                  {categoriasSaboresEstoque.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sabor oficial
                <select
                  required
                  value={chave}
                  onChange={(e) => {
                    setChave(e.target.value);
                    setLoteId("");
                    setContado("");
                    setErro("");
                  }}
                >
                  <option value="">Selecione</option>
                  {linhas
                    .filter((s) => !selecionado || s.categoria === selecionado.categoria)
                    .map((s) => (
                      <option key={s.chave} value={s.chave}>
                        {s.nome}
                      </option>
                    ))}
                </select>
              </label>
              {(tipo === "perda" || tipo === "ajuste") && (
                <label>
                  Lote
                  <select required value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                    <option value="">Selecione um lote</option>
                    {lotes
                      .filter((l) =>
                        tipo === "ajuste"
                          ? !loteVencidoComSaldo(l, hoje) &&
                            l.status !== "vencido" &&
                            (!l.validade || l.validade >= hoje)
                          : l.restante > 0,
                      )
                      .map((l) => (
                        <option value={l.id} key={l.id}>
                          {l.codigo} · {l.restante} un.
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {tipo !== "liberar" && (
                <label>
                  {tipo === "ajuste" ? "Quantidade contada (un.)" : "Quantidade (un.)"}
                  <input
                    name="quantidade"
                    type="number"
                    required
                    step={1}
                    min={tipo === "ajuste" ? 0 : 1}
                    max={2147483647}
                    value={contado}
                    onChange={(e) => setContado(e.target.value)}
                  />
                </label>
              )}
              {tipo === "entrada" && (
                <>
                  <label>
                    Código do lote
                    <input name="codigo" required maxLength={80} />
                  </label>
                  <label>
                    Data de fabricação
                    <input name="fabricacao" type="date" required max={hoje} />
                  </label>
                  <label>
                    Data de validade
                    <input name="validade" type="date" required min={hoje} />
                  </label>
                </>
              )}
              {tipo === "retirada" && (
                <label>
                  Vínculo da retirada
                  <select name="reserva">
                    <option value="">Retirada avulsa (saldo disponível, FEFO)</option>
                    {reservas.map((r) => (
                      <option value={r.id} key={r.id}>
                        {pedidoLabel(r.pedidoId)} · {r.pendente} un.
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(tipo === "reserva" || tipo === "liberar") && (
                <label>
                  Pedido
                  <select name="pedido" required>
                    <option value="">Selecione</option>
                    {(tipo === "reserva"
                      ? pedidos.map((p) => p.id)
                      : [...new Set(reservas.map((r) => r.pedidoId))]
                    ).map((id) => (
                      <option key={id} value={id}>
                        {pedidoLabel(id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Responsável autenticado
                <input readOnly value={responsavel} />
              </label>
              {tipo === "perda" && (
                <label>
                  Data e horário
                  <input readOnly value={horaLoja.format(new Date())} />
                </label>
              )}
            </div>
            {tipo === "ajuste" && (
              <p>
                Saldo registrado <strong>{lote?.restante ?? "—"}</strong> · Diferença{" "}
                <strong>{lote && contado !== "" ? Number(contado) - lote.restante : "—"}</strong> ·
                Autorização {admin ? "Administrador" : "Necessário perfil administrador"}
              </p>
            )}
            {tipo === "liberar" && (
              <p>
                Esta ação cancela o pedido e libera somente as reservas que ainda não foram
                consumidas.
              </p>
            )}
            {(tipo === "perda" || tipo === "ajuste") && (
              <label>
                {tipo === "perda" ? "Motivo da perda" : "Justificativa"}
                <input name="motivo" required maxLength={200} />
              </label>
            )}
            <label>
              Observações
              <textarea name="observacoes" maxLength={300} rows={2} />
            </label>
            {!identidadeAtiva && (
              <p role="status">
                {selecionado
                  ? "A confirmação fica disponível quando o cadastro oficial do sabor estiver vinculado."
                  : "Selecione um sabor oficial para conferir o vínculo de estoque."}
              </p>
            )}
            {identidadeAtiva && (!podeMovimentar || (tipo === "ajuste" && !admin)) && (
              <p role="status">Seu perfil não tem autorização para confirmar esta operação.</p>
            )}
            {erro && <p role="alert">{erro}</p>}
            <div className="est-dialog-acoes">
              <button type="button" onClick={fechar}>
                Fechar
              </button>
              <button
                className="neia-a01-dourado"
                disabled={
                  salvando ||
                  !identidadeAtiva ||
                  !podeMovimentar ||
                  (tipo === "ajuste" && !admin)
                }
              >
                {salvando ? "Confirmando…" : "Confirmar operação"}
              </button>
            </div>
          </form>
        </JanelaEstoque>
      )}
      {janela === "detalhes" && selecionado && situacao && (
        <JanelaEstoque
          titulo={selecionado.nome}
          descricao="Saldos por unidade, validade e movimentações."
          fechar={fechar}
        >
          <div className="est-dialog-saldos">
            <FotoSabor imagem={selecionado.imagem} />
            {[
              ["Físico", situacao.fisico],
              ["Reservado", situacao.reservado],
              ["Disponível", situacao.disponivel],
              ["Estoque mínimo", situacao.minimo],
            ].map(([label, saldo]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{formatarQuantidade(saldo as number | null)}</strong>
              </div>
            ))}
          </div>
          <DarkTable
            className="est-dialog-tabela"
            colunas={["Lote", "Saldo", "Validade", "Situação"]}
            vazio={!lotes.length ? "Nenhum lote cadastrado para este sabor." : undefined}
          >
            {lotes.map((l) => (
              <DarkTableRow key={l.id}>
                <td>{l.codigo}</td>
                <td>{l.restante}</td>
                <td>{formatarData(l.validade)}</td>
                <td>
                  {loteVencidoComSaldo(l, hoje)
                    ? "Vencido"
                    : alertaValidade(l.validade, hoje) && l.restante > 0
                      ? "Próximo do vencimento"
                      : l.restante === 0
                        ? "Esgotado"
                        : "Em estoque"}
                </td>
              </DarkTableRow>
            ))}
          </DarkTable>
          {reservas.length > 0 && (
            <details>
              <summary>Reservas pendentes</summary>
              <ul className="est-dialog-lista">
                {reservas.map((r) => (
                  <li key={r.id}>
                    {pedidoLabel(r.pedidoId)} · {r.quantidade} reservadas · {r.consumido} retiradas
                    · {r.pendente} pendentes
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="est-dialog-acoes">
            <button onClick={() => abrirHistorico(chave || produto?.id)}>
              Histórico e movimentações
            </button>
            {podeMovimentar && (
              <button onClick={() => abrir("movimentos")}>Operações de estoque</button>
            )}
            {admin && <button onClick={() => abrir("foto")}>Editar produto e foto</button>}
          </div>
        </JanelaEstoque>
      )}
      {janela === "historico" && (
        <JanelaEstoque
          titulo="Histórico de estoque"
          descricao="Consulte o registro de movimentações por sabor e lote."
          fechar={fechar}
        >
          <HistoricoSalgados
            produtos={historicoProdutos}
            inicial={historicoId}
            porChave={data?.porChave ?? false}
          />
        </JanelaEstoque>
      )}
      {janela === "movimentos" && (
        <JanelaEstoque
          titulo="Movimentações de estoque"
          descricao="Escolha a ação que deseja conferir."
          fechar={fechar}
        >
          <div className="est-dialog-acoes">
            {Object.entries(operacoesSalgados).map(([id, nome]) => (
              <button key={id} onClick={() => abrir(id as OperacaoSalgados)}>
                {nome}
              </button>
            ))}
            <button onClick={() => abrirHistorico(chave || produto?.id)}>
              Consultar histórico
            </button>
          </div>
        </JanelaEstoque>
      )}
      {janela === "alertas" && (
        <JanelaEstoque
          titulo="Alertas do estoque de salgados"
          descricao="A análise usa somente os saldos, lotes e reservas disponíveis."
          fechar={fechar}
        >
          <p>
            {linhas.filter((s) => s.situacao.fisico === null).length} sabores sem dados operacionais
            de estoque.
          </p>
          <ul className="est-dialog-lista">
            {linhas
              .filter(
                (s) => s.situacao.fisico !== null && s.situacao.alertas.some((a) => a !== "normal"),
              )
              .map((s) => (
                <li key={s.chave}>
                  <strong>{s.nome}</strong> ·{" "}
                  {s.situacao.alertas.map((a) => situacoesSalgados[a].texto).join(" · ")}
                  {s.situacao.abaixo &&
                    s.situacao.minimo !== null &&
                    s.situacao.disponivel !== null && (
                      <span>
                        {" "}
                        · Reposição sugerida{" "}
                        {numero.format(s.situacao.minimo - s.situacao.disponivel)} un.
                      </span>
                    )}
                </li>
              ))}
          </ul>
        </JanelaEstoque>
      )}
      {janela === "ajuda" && (
        <JanelaEstoque
          titulo="Como funciona o estoque"
          descricao="Reservas, retirada e validade."
          fechar={fechar}
        >
          <ul className="est-dialog-lista">
            <li>O disponível é o físico menos o reservado.</li>
            <li>
              A confirmação do pedido reserva as unidades. A retirada do freezer dá baixa no físico.
            </li>
            <li>O cancelamento libera apenas a parte da reserva ainda não consumida.</li>
            <li>Use primeiro os lotes aptos que vencem mais cedo (FEFO).</li>
            <li>Um sabor precisa de vínculo oficial para registrar movimentações.</li>
          </ul>
        </JanelaEstoque>
      )}
      {janela === "conferencia" && admin && (
        <JanelaEstoque
          titulo="Conferência de cadastros"
          descricao="Produtos comerciais e antigos, fora da movimentação diária de sabores."
          fechar={fechar}
        >
          <ul className="est-dialog-lista">
            {legados.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{p.nome}</strong> · {p.categorias.nome}
                </span>{" "}
                <button onClick={() => abrirHistorico(p.id)}>Histórico</button>
              </li>
            ))}
          </ul>
          {!legados.length && <p>Nenhum produto para conferência.</p>}
          <div className="est-dialog-acoes">
            <button onClick={() => onProdutos()}>Abrir Cadastro de Produtos</button>
          </div>
        </JanelaEstoque>
      )}
      {janela === "foto" && selecionado && admin && (
        <JanelaEstoque titulo="Editar produto e foto" descricao={selecionado.nome} fechar={fechar}>
          <form
            className="neia-a01-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!vinculado || !produto) return;
              const url = String(new FormData(event.currentTarget).get("foto") ?? "").trim();
              if (url && !/^https:\/\//i.test(url)) {
                setErro("Informe um endereço de imagem HTTPS.");
                return;
              }
              void gravar(async () => {
                const r = await supabase
                  .from("produtos")
                  .update({ imagem_url: url || null })
                  .eq("id", produto.id)
                  .select("id")
                  .single();
                if (r.error || r.data?.id !== produto.id)
                  throw r.error ?? new Error("A atualização não foi confirmada.");
              }, "Foto do produto atualizada.");
            }}
          >
            <FotoSabor imagem={selecionado.imagem} />
            <label>
              Endereço HTTPS da foto
              <input
                name="foto"
                type="url"
                defaultValue={produto?.imagem_url ?? ""}
                disabled={!vinculado}
              />
            </label>
            {!vinculado && <p>Vincule o sabor oficial para editar o produto e a foto.</p>}
            {erro && <p role="alert">{erro}</p>}
            <div className="est-dialog-acoes">
              {vinculado && produto && (
                <button type="button" onClick={() => onProdutos(produto.nome)}>
                  Editar cadastro completo
                </button>
              )}
              <button className="neia-a01-dourado" disabled={!vinculado || salvando}>
                Salvar foto
              </button>
            </div>
          </form>
        </JanelaEstoque>
      )}

      {organizando && admin && (
        <OrganizadorSabores
          sabores={linhas}
          fechar={() => setOrganizando(false)}
          persistir={persistirOrdem}
        />
      )}
    </div>
  );
}
