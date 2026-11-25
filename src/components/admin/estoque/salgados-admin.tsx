import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Eye,
  Layers,
  Package,
  Pencil,
  Plus,
  Search,
  Snowflake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ehModoDemo } from "@/lib/demo-preview";
import {
  ActionButton,
  DarkTable,
  DarkTableRow,
  ERP_COLORS,
  MetricCard,
  ModuleHeader,
  SectionCard,
  StatusBadge,
} from "@/components/admin/erp-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * E01 — Este é o Estoque de Salgados operacional. A estrutura visual segue a
 * referência aprovada (`tela-salgados.tsx`), mas TODO dado vem do Supabase e
 * TODA ação chama RPC/serviços reais. Nenhuma fixture, quantidade, lote,
 * validade ou movimentação fictícia é criada aqui.
 */

const CATEGORIAS_SALGADOS = [
  "mini-fritos", "mini-assados", "mini-pasteis", "mini-pizzas", "mini-empadinhas",
  "mini-congelados", "salgados-fritos", "salgados-assados", "salgados-congelados", "mini-salgados",
];

/** Produção própria: os salgados são fabricados internamente. Não é dado
 * fictício de quantidade — é a origem operacional único deste módulo. */
const ORIGEM_SALGADOS = "Produção Néia";

type Operacao = "entrada" | "reserva" | "liberar" | "retirada" | "perda" | "ajuste";
type TipoMovimento =
  | "entrada_manual"
  | "venda"
  | "perda"
  | "ajuste"
  | "entrada_producao"
  | "reserva"
  | "liberacao"
  | "cancelamento"
  | "vencimento"
  | "devolucao"
  | "degustacao";

const TITULOS: Record<Operacao, string> = {
  entrada: "Registrar entrada de estoque",
  reserva: "Reservar quantidade",
  liberar: "Liberar reserva",
  retirada: "Registrar retirada do freezer",
  perda: "Registrar perda",
  ajuste: "Ajustar inventário",
};
const TIPO_RPC: Record<"entrada" | "retirada" | "perda" | "ajuste", TipoMovimento> = {
  entrada: "entrada_manual",
  retirada: "venda",
  perda: "perda",
  ajuste: "ajuste",
};

const numero = new Intl.NumberFormat("pt-BR");
const dataMovimento = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const estilosTabela =
  "[&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-sm [&_th]:text-xs";

function formatarData(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

/** Lote com saldo e validade em até 7 dias (data real do banco). */
function alertaValidade(validade: string | null | undefined) {
  if (!validade) return false;
  const dias = (new Date(`${validade.slice(0, 10)}T00:00:00`).getTime() - Date.now()) / 86_400_000;
  return dias >= 0 && dias <= 7;
}

/**
 * O emulador de demonstração não entende `select` aninhado do PostgREST.
 * Este caminho existe SOMENTE para as capturas locais (VITE_DEMO_PREVIEW=1);
 * no build operacional a consulta aninhada real permanece intacta abaixo.
 */
async function consultarSalgadosDemo() {
  const [{ data: produtosData, error: erroProdutos }, { data: lotes }, { data: reservas }, { data: consumos }, { data: pedidos }] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("id, nome, imagem_url, disponivel, estoque, estoque_minimo, tipo_venda, unidade_medida, categoria_id")
        .order("nome"),
      supabase.from("lotes").select("id, codigo, validade, restante, status, produto_id"),
      supabase.from("reservas_estoque").select("id, pedido_id, produto_id, quantidade, status"),
      supabase.from("reserva_consumos").select("id, reserva_id, quantidade"),
      supabase.from("pedidos").select("id, created_at").eq("status", "em_producao").limit(50),
    ]);
  if (erroProdutos) throw erroProdutos;

  const categoriasDemo = new Map(
    (await supabase.from("categorias").select("id, nome, slug")).data?.map((c) => [c.id, c]) ?? [],
  );
  const produtos = (produtosData ?? [])
    .filter((p) => CATEGORIAS_SALGADOS.includes(categoriasDemo.get(p.categoria_id)?.slug ?? ""))
    .map((p) => {
      const categoria = categoriasDemo.get(p.categoria_id);
      const lotesProduto = (lotes ?? []).filter((l) => l.produto_id === p.id);
      const reservasProduto = (reservas ?? [])
        .filter((r) => r.produto_id === p.id && r.status === "ativa")
        .map((r) => {
          const consumido = (consumos ?? []).filter((c) => c.reserva_id === r.id).reduce((s, c) => s + c.quantidade, 0);
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
        categorias: { slug: categoria?.slug ?? "", nome: categoria?.nome ?? "—" },
        lotes: lotesProduto,
        lotesTodos: lotesProduto,
        lotesFefo,
        reservas: reservasProduto,
        estoque: p.estoque ?? 0,
        minimo: p.estoque_minimo ?? 0,
        fisico,
        reservado,
        disponivel: fisico - reservado,
        pedidos: new Set(reservasProduto.filter((r) => r.pendente > 0).map((r) => r.pedidoId)).size,
      };
    });
  return { produtos, pedidos: pedidos ?? [] };
}

async function consultarSalgados(signal: AbortSignal) {
  if (ehModoDemo()) return consultarSalgadosDemo();
  const { data, error } = await supabase
    .from("produtos")
    .select(`
      id, nome, imagem_url, disponivel, estoque, estoque_minimo, tipo_venda, unidade_medida,
      categorias!inner(slug, nome),
      lotes(id, codigo, validade, restante, status),
      reservas_estoque(id, pedido_id, quantidade, status, reserva_consumos(quantidade))
    `)
    .in("categorias.slug", CATEGORIAS_SALGADOS)
    .order("nome")
    .order("validade", { referencedTable: "lotes", ascending: true, nullsFirst: false })
    .abortSignal(signal);

  if (error) throw error;

  // Pedidos em produção são a origem real para a reserva atômica (0042/0030).
  // Sem pedidos disponíveis o formulário apenas não oferece opções.
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, created_at")
    .eq("status", "em_producao")
    .order("created_at", { ascending: false })
    .limit(50)
    .abortSignal(signal);

  const produtos = data.map((produto) => {
    const reservas = produto.reservas_estoque
      .filter((reserva) => reserva.status === "ativa")
      .map((reserva) => {
        const consumido = reserva.reserva_consumos.reduce(
          (total, retirada) => total + retirada.quantidade, 0,
        );
        return {
          id: reserva.id,
          pedidoId: reserva.pedido_id,
          quantidade: reserva.quantidade,
          consumido,
          pendente: Math.max(0, reserva.quantidade - consumido),
        };
      });
    const lotesFefo = produto.lotes.filter((lote) => lote.status === "ativo" && lote.restante > 0);
    // Regra aprovada: um único físico por sabor e disponível = físico − reservado.
    // Reservado soma TODAS as modalidades (avulsas, combos fixos e personalizados)
    // uma única vez, sem dupla contagem por origem.
    const fisico = lotesFefo.reduce((total, lote) => total + lote.restante, 0);
    const reservado = reservas.reduce((total, reserva) => total + reserva.pendente, 0);
    return {
      ...produto,
      estoque: produto.estoque ?? 0,
      minimo: produto.estoque_minimo ?? 0,
      lotesTodos: produto.lotes,
      lotesFefo,
      reservas,
      fisico,
      reservado,
      disponivel: fisico - reservado,
      pedidos: new Set(reservas.filter((reserva) => reserva.pendente > 0).map((reserva) => reserva.pedidoId)).size,
    };
  });

  return { produtos, pedidos: pedidos ?? [] };
}

function Campo({
  label,
  name,
  value,
  type = "text",
  min,
  step,
  required = true,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  min?: number;
  step?: string | number;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`est-${name}`}>{label}</Label>
      <Input
        id={`est-${name}`}
        name={name}
        defaultValue={value}
        type={type}
        min={min}
        step={step}
        required={required}
      />
    </div>
  );
}

function Seletor({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`est-${name}`}>{label}</Label>
      <select id={`est-${name}`} name={name} className="est-select">
        {children}
      </select>
    </div>
  );
}

function ModalEstoque({
  titulo,
  descricao,
  fechar,
  children,
}: {
  titulo: string;
  descricao: string;
  fechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent className="est-dialog max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type MovimentoReal = {
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
};

function HistoricoEstoque({
  movimentos,
  nomes,
}: {
  movimentos: MovimentoReal[];
  nomes: Record<string, string>;
}) {
  return (
    <DarkTable
      colunas={["Data", "Item / operação", "Quantidade", "Antes → Depois", "Justificativa / vínculo"]}
      vazio={!movimentos.length ? "Nenhuma movimentação registrada para este sabor." : undefined}
    >
      {movimentos.map((m) => (
        <DarkTableRow key={m.id}>
          <td>
            {formatarData(m.data)}
            <small>{m.data.slice(11, 16)}</small>
          </td>
          <td>
            <b>{nomes[m.itemId] ?? "Produto"}</b>
            <small>{m.tipo}</small>
          </td>
          <td>
            {numero.format(m.quantidade)} {m.unidade}
          </td>
          <td>
            {numero.format(m.antes)} → {numero.format(m.depois)} {m.unidade}
          </td>
          <td>
            {m.motivo}
            <small>{m.referencia}</small>
          </td>
        </DarkTableRow>
      ))}
    </DarkTable>
  );
}

function HistoricoMovimentos({
  produtoId,
  nomes,
}: {
  produtoId: string;
  nomes: Record<string, string>;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["admin-historico-salgado", produtoId],
    queryFn: async ({ signal }) => {
      const { data: movimentos, error } = await supabase
        .from("estoque_movimentacoes")
        .select(
          "id, tipo, quantidade, saldo_anterior, saldo_posterior, observacao, created_at, referencia_tipo",
        )
        .eq("produto_id", produtoId)
        .order("created_at", { ascending: false })
        .limit(50)
        .abortSignal(signal);
      if (error) throw error;
      return movimentos;
    },
  });

  if (isPending) return <p role="status" className="text-sm text-muted-foreground">Carregando histórico…</p>;
  if (isError) {
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p>Não foi possível consultar o histórico.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
      </div>
    );
  }
  const movimentos: MovimentoReal[] = (data ?? []).map((m) => ({
    id: m.id,
    itemId: produtoId,
    tipo: m.tipo.replaceAll("_", " "),
    quantidade: m.quantidade,
    antes: m.saldo_anterior,
    depois: m.saldo_posterior,
    unidade: "un.",
    motivo: m.observacao || "—",
    referencia: m.referencia_tipo || "—",
    data: m.created_at,
  }));
  return <HistoricoEstoque movimentos={movimentos} nomes={nomes} />;
}

function MovimentacoesSalgado({ produtoId }: { produtoId: string }) {
  const { data, isError, isPending, refetch } = useQuery({
    queryKey: ["admin-movimentacoes-salgado", produtoId],
    queryFn: async ({ signal }) => {
      const { data: movimentos, error } = await supabase
        .from("estoque_movimentacoes")
        .select("id, tipo, created_at, quantidade, observacao")
        .eq("produto_id", produtoId)
        .order("created_at", { ascending: false })
        .limit(3)
        .abortSignal(signal);
      if (error) throw error;
      return movimentos;
    },
  });

  if (isPending) return <p role="status" className="text-sm text-muted-foreground">Carregando movimentações…</p>;
  if (isError) {
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p>Não foi possível consultar as movimentações.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
      </div>
    );
  }
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>;

  return (
    <>
      <ul className="est-recent">
        {data.map((mov) => (
          <li key={mov.id}>
            <span className={mov.quantidade >= 0 ? "est-green" : "est-red"}>
              {mov.quantidade >= 0 ? "+" : "−"}
            </span>
            <div>
              <b>{mov.tipo.replaceAll("_", " ")}: {numero.format(Math.abs(mov.quantidade))} un.</b>
              <small>{mov.observacao || "—"}</small>
            </div>
            <small>{formatarData(mov.created_at)}</small>
          </li>
        ))}
      </ul>
      <p className="est-muted">
        Retirada com reserva resolve a pendência e reduz o físico uma única vez.
      </p>
    </>
  );
}

export function SalgadosAdmin({ onProdutos }: { onProdutos: (nome?: string) => void }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [categoria, setCategoria] = useState("todos");
  const [fornecedor, setFornecedor] = useState("todos");
  const [baixos, setBaixos] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [modal, setModal] = useState<"movimento" | "historico" | "alertas" | "ajuda" | null>(null);
  const [tipo, setTipo] = useState<Operacao>("entrada");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["admin-estoque-salgados"],
    queryFn: ({ signal }) => consultarSalgados(signal),
  });

  const produtos = data?.produtos;
  const pedidos = data?.pedidos ?? [];
  const visivel = !isPending && !isError ? produtos : undefined;
  const categorias = new Map(produtos?.map((p) => [p.categorias.slug, p.categorias.nome]));

  const k = {
    fisico: produtos?.reduce((soma, p) => soma + p.fisico, 0) ?? 0,
    reservado: produtos?.reduce((soma, p) => soma + p.reservado, 0) ?? 0,
    disponivel: produtos?.reduce((soma, p) => soma + p.disponivel, 0) ?? 0,
    baixos: produtos?.filter((p) => p.disponivel < p.minimo).length ?? 0,
    lotes: produtos?.reduce((soma, p) => soma + p.lotesFefo.length, 0) ?? 0,
    vencendo: produtos?.reduce(
      (soma, p) => soma + p.lotesFefo.filter((l) => alertaValidade(l.validade)).length, 0,
    ) ?? 0,
  };

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const lista = produtos?.filter((p) =>
    p.nome.toLocaleLowerCase("pt-BR").includes(termo) &&
    (categoria === "todos" || categoria === p.categorias.slug) &&
    (fornecedor === "todos" || fornecedor === ORIGEM_SALGADOS) &&
    (!baixos || p.disponivel < p.minimo) &&
    (status === "todos" || (status === "baixo" ? p.disponivel < p.minimo : p.disponivel >= p.minimo)),
  ) ?? [];

  // O detalhe acompanha o sabor em foco mesmo quando ele sai do filtro, como
  // na referência aprovada.
  const produto = produtos?.find((p) => p.id === foco) ?? produtos?.[0];
  const nomes = Object.fromEntries((produtos ?? []).map((p) => [p.id, p.nome]));

  function abrir(operacao: Operacao, id = produto?.id) {
    if (!id) return;
    setFoco(id);
    setTipo(operacao);
    setErro("");
    setModal("movimento");
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!produto) return;
    const dados = new FormData(evento.currentTarget);
    const quantidade = Math.floor(Number(dados.get("quantidade")) || 0);
    const motivo = String(dados.get("motivo") ?? "").trim();
    const pedido = String(dados.get("pedido") ?? "");
    const reservaId = String(dados.get("reserva") ?? "");

    if (quantidade <= 0 && tipo !== "liberar") {
      setErro("Informe uma quantidade maior que zero.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      if (tipo === "reserva") {
        if (!pedido) throw new Error("Selecione um pedido em produção.");
        const { data: resultado, error } = await supabase.rpc("reservar_estoque_atomica", {
          p_pedido_id: pedido,
          p_produto_id: produto.id,
          p_qtd: quantidade,
        });
        if (error) throw error;
        if (resultado !== true) throw new Error("Estoque insuficiente ou pedido indisponível.");
      } else if (tipo === "liberar") {
        if (!pedido) throw new Error("Selecione um pedido com reserva pendente.");
        const { error } = await supabase.rpc("liberar_reserva_atomica", { p_pedido_id: pedido });
        if (error) throw error;
      } else if (tipo === "retirada" && reservaId) {
        // Consumo de reserva: a RPC registra a baixa física uma única vez.
        const { error } = await supabase.rpc("registrar_consumo_reserva", {
          p_reserva_id: reservaId,
          p_quantidade: quantidade,
          p_idem_key: crypto.randomUUID(),
          p_produto_id: produto.id,
          ...(motivo ? { p_observacao: motivo } : {}),
        });
        if (error) throw error;
      } else {
        let loteId: string | undefined;
        let delta = quantidade;

        if (tipo === "entrada") {
          const codigo = String(dados.get("codigo") ?? "").trim();
          if (!codigo) throw new Error("Informe o código do novo lote.");
          const validade = String(dados.get("validade") ?? "");
          const { data: lote, error: erroLote } = await supabase
            .from("lotes")
            .insert({
              produto_id: produto.id,
              codigo,
              quantidade,
              restante: quantidade,
              validade: validade || null,
              status: "ativo",
            })
            .select("id")
            .single();
          if (erroLote) throw erroLote;
          loteId = lote.id;
        }

        if (tipo === "ajuste") {
          const loteEscolhido = String(dados.get("lote") ?? "");
          const anterior = produto.lotesTodos.find((l) => l.id === loteEscolhido)?.restante ?? 0;
          delta = quantidade - anterior;
          if (loteEscolhido) {
            const { error: erroLote } = await supabase
              .from("lotes")
              .update({ restante: quantidade })
              .eq("id", loteEscolhido);
            if (erroLote) throw erroLote;
          }
        }

        if (tipo === "perda" || (tipo === "retirada" && !reservaId)) delta = -quantidade;

        const { error } = await supabase.rpc("registrar_mov_estoque", {
          p_produto_id: produto.id,
          p_tipo: TIPO_RPC[tipo],
          p_quantidade: delta,
          ...(loteId ? { p_lote_id: loteId } : {}),
          p_observacao: motivo || TITULOS[tipo],
          p_referencia_tipo: "manual",
        });
        if (error) throw error;
      }

      toast.success("Movimentação registrada no estoque.");
      setModal(null);
      await refetch();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar a movimentação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div data-testid="estoque-salgados" className="estoques-preview" style={{ minHeight: 0 }}>
      <ModuleHeader
        icone={Snowflake}
        titulo="Estoque de Salgados"
        subtitulo="Controle de congelados por sabor, reservas, lotes e validade (FEFO)."
        acoes={
          <>
            <div className="est-search">
              <Search size={16} />
              <Input
                aria-label="Buscar sabor"
                placeholder="Buscar sabor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button className="est-icon" aria-label="Alertas de salgados" onClick={() => setModal("alertas")}>
              <Bell size={20} />
            </button>
            <button className="est-icon" aria-label="Ajuda de salgados" onClick={() => setModal("ajuda")}>
              <CircleHelp size={20} />
            </button>
          </>
        }
      />

      <div className="est-tabs est-product-tabs">
        <ActionButton variant="ghost" onClick={() => onProdutos()}>
          <ClipboardList size={17} />
          Cadastro de Produtos
        </ActionButton>
        <span className="est-active-tab">
          <Snowflake size={17} />
          Estoque de Salgados
        </span>
      </div>

      <div className="est-kpis est-kpis-five">
        <MetricCard
          icone={Package}
          label="Total físico"
          valor={<span className="est-gold">{visivel ? `${numero.format(k.fisico)} un.` : "—"}</span>}
          detalhe="Salgados no freezer"
        />
        <MetricCard
          icone={Layers}
          label="Total reservado"
          valor={<span className="est-blue">{numero.format(k.reservado)} un.</span>}
          cor={ERP_COLORS.blue}
          detalhe="Pedidos confirmados"
        />
        <MetricCard
          icone={CheckCircle2}
          label="Total disponível"
          valor={<span className="est-green">{numero.format(k.disponivel)} un.</span>}
          cor={ERP_COLORS.green}
          detalhe="Físico − reservado"
        />
        <MetricCard
          icone={AlertTriangle}
          label="Abaixo do mínimo"
          valor={<span className="est-red">{visivel ? `${k.baixos} sabores` : "—"}</span>}
          cor={ERP_COLORS.red}
          detalhe="Sugestão de produção"
        />
        <MetricCard
          icone={Package}
          label="Lotes ativos"
          valor={`${k.lotes} lotes`}
          detalhe="Primeiro que vence, primeiro que sai"
        />
      </div>

      {isPending && <p role="status" className="text-sm text-muted-foreground">Carregando estoque e reservas…</p>}
      {isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive p-3 text-sm">
          <p>Não foi possível consultar o estoque de salgados.</p>
          <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      )}

      {visivel && (
        <>
          <div className="est-filters">
            <label>
              Categoria
              <select className="est-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="todos">Todas</option>
                {[...categorias].map(([slug, nome]) => <option key={slug} value={slug}>{nome}</option>)}
              </select>
            </label>
            <label>
              Status
              <select className="est-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="ok">OK</option>
                <option value="baixo">Abaixo do mínimo</option>
              </select>
            </label>
            <label>
              Fornecedor
              <select className="est-select" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                <option value="todos">Todos</option>
                <option>{ORIGEM_SALGADOS}</option>
              </select>
            </label>
            <label className="est-toggle">
              <input type="checkbox" checked={baixos} onChange={(e) => setBaixos(e.target.checked)} />
              Apenas abaixo do mínimo
            </label>
            <div className="est-filter-actions">
              <ActionButton onClick={() => abrir("retirada")}>
                <ArrowLeftRight size={16} />
                Movimentação
              </ActionButton>
              <ActionButton onClick={() => abrir("entrada")}>
                <Plus size={17} />
                Registrar entrada de estoque
              </ActionButton>
            </div>
          </div>

          <SectionCard className="est-table-panel estilos-tabela" bodyClassName="p-0">
            <p className="est-table-hint">Deslize a tabela para ver todos os saldos e ações →</p>
            <DarkTable
              className={estilosTabela}
              colunas={[
                "Produto / sabor",
                "Físico (un.)",
                "Reservado",
                "Disponível",
                "Est. mínimo",
                "Reservas (total único do sabor)",
                "Lotes",
                "Próxima validade",
                "Ações",
              ]}
              vazio={!lista.length ? "Nenhum sabor neste filtro." : undefined}
            >
              {lista.map((p) => (
                <DarkTableRow key={p.id}>
                  <td data-selecionado={p.id === produto?.id}>
                    <button
                      className="est-product"
                      onClick={() => setFoco(p.id)}
                      data-testid={`produto-${p.id}`}
                    >
                      {p.imagem_url ? (
                        <img src={p.imagem_url} alt="" loading="lazy" />
                      ) : (
                        <span className="est-icon"><Package size={16} aria-hidden /></span>
                      )}
                      <span>
                        <b>{p.nome}</b>
                        {!p.disponivel && <small>Inativo · saldo preservado</small>}
                      </span>
                    </button>
                  </td>
                  <td><b>{numero.format(p.fisico)}</b></td>
                  <td className="est-blue">{numero.format(p.reservado)}</td>
                  <td className="est-green"><b>{numero.format(p.disponivel)}</b></td>
                  <td>
                    {numero.format(p.minimo)}
                    {p.disponivel < p.minimo && <small className="est-red">Abaixo do mínimo</small>}
                  </td>
                  <td>
                    <button
                      className="est-text-action"
                      onClick={() => {
                        setFoco(p.id);
                        setModal("historico");
                      }}
                    >
                      <Layers size={14} />
                      {p.pedidos} pedido(s) · {numero.format(p.reservado)} un. reservadas
                    </button>
                  </td>
                  <td>{p.lotesFefo.length} lotes</td>
                  <td>
                    {formatarData(p.lotesFefo[0]?.validade)}
                    {p.lotesFefo[0] && alertaValidade(p.lotesFefo[0].validade) && (
                      <small className="est-gold">Vence em até 7 dias</small>
                    )}
                  </td>
                  <td>
                    <div className="est-row-actions">
                      <button
                        className="est-icon"
                        aria-label={`Ver lotes de ${p.nome}`}
                        onClick={() => {
                          setFoco(p.id);
                          document.getElementById("est-detalhe-salgado")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                        }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="est-icon"
                        aria-label={`Ajustar ${p.nome}`}
                        onClick={() => abrir("ajuste", p.id)}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </DarkTableRow>
              ))}
            </DarkTable>
          </SectionCard>

          {produto && (
            <div className="est-bottom-three" id="est-detalhe-salgado">
              <SectionCard
                titulo={<span className="est-inline"><Snowflake size={17} /> {produto.nome}</span>}
                acoes={<StatusBadge tom="neutro">{produto.categorias.nome}</StatusBadge>}
              >
                <div className="est-product-detail">
                  {produto.imagem_url ? (
                    <img src={produto.imagem_url} alt="" loading="lazy" />
                  ) : (
                    <span className="est-icon"><Package size={20} aria-hidden /></span>
                  )}
                  <p>
                    Produto do cadastro único<small>{produto.id}</small>
                  </p>
                </div>
                <div className="est-mini-metrics">
                  {[
                    ["Físico", produto.fisico],
                    ["Reservado", produto.reservado],
                    ["Disponível", produto.disponivel],
                    ["Mínimo", produto.minimo],
                  ].map(([titulo, valor]) => (
                    <div key={titulo}>
                      <small>{titulo}</small>
                      <b>{numero.format(Number(valor))}</b>
                    </div>
                  ))}
                </div>
                <div className="est-detail-actions">
                  <ActionButton variant="ghost" onClick={() => abrir("reserva")} disabled={!produto.disponivel}>
                    Reservar
                  </ActionButton>
                  <ActionButton variant="ghost" onClick={() => abrir("liberar")} disabled={!produto.reservas.length}>
                    Liberar reserva
                  </ActionButton>
                  <ActionButton variant="ghost" onClick={() => abrir("perda")}>
                    Registrar perda
                  </ActionButton>
                </div>
              </SectionCard>

              <SectionCard titulo={<span className="est-inline"><Package size={17} /> Lotes (FEFO)</span>}>
                <DarkTable colunas={["Lote", "Quantidade", "Validade", "Prioridade"]} className={estilosTabela}>
                  {produto.lotesFefo.map((lote, indice) => (
                    <DarkTableRow key={lote.id}>
                      <td>{lote.codigo}</td>
                      <td>{numero.format(lote.restante)}</td>
                      <td>{formatarData(lote.validade)}</td>
                      <td>
                        <StatusBadge tom={alertaValidade(lote.validade) ? "atencao" : "ok"}>
                          Usar {indice + 1}º{alertaValidade(lote.validade) ? " · Próximo" : ""}
                        </StatusBadge>
                      </td>
                    </DarkTableRow>
                  ))}
                </DarkTable>
              </SectionCard>

              <SectionCard
                titulo={<span className="est-inline"><ArrowLeftRight size={17} /> Últimas movimentações</span>}
                acoes={
                  <button className="est-text-action" onClick={() => setModal("historico")}>
                    Ver histórico →
                  </button>
                }
              >
                <MovimentacoesSalgado produtoId={produto.id} />
              </SectionCard>
            </div>
          )}
        </>
      )}

      {modal === "movimento" && produto && (
        <ModalEstoque
          titulo={TITULOS[tipo]}
          descricao="Operação registrada no banco de homologação."
          fechar={() => setModal(null)}
        >
          <p>
            <b>{produto.nome}</b> · Físico {numero.format(produto.fisico)} · Reservado{" "}
            {numero.format(produto.reservado)} · Disponível {numero.format(produto.disponivel)}
          </p>
          <form key={tipo} className="est-form" onSubmit={(evento) => void enviar(evento)}>
            {tipo === "entrada" && (
              <label htmlFor="est-produtoId">
                Produto cadastrado
                <select
                  id="est-produtoId"
                  name="produtoId"
                  className="est-select"
                  value={produto.id}
                  onChange={(e) => setFoco(e.target.value)}
                >
                  {(produtos ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}{!p.disponivel ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
                <small className="est-muted">
                  Para criar um sabor, utilize Cadastro de Produtos. Aqui são registrados apenas
                  lotes e quantidades.
                </small>
              </label>
            )}
            <label>
              Tipo de movimentação
              <select
                aria-label="Tipo de movimentação de salgados"
                className="est-select"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value as Operacao);
                  setErro("");
                }}
              >
                {Object.entries(TITULOS).map(([valor, titulo]) => (
                  <option key={valor} value={valor}>{titulo}</option>
                ))}
              </select>
            </label>
            {tipo === "liberar" ? (
              <>
                <p>O cancelamento libera todas as reservas ainda não consumidas deste pedido, sabor por sabor.</p>
                <Seletor label="Pedido a cancelar" name="pedido">
                  {produto.reservas.map((reserva) => (
                    <option key={reserva.id} value={reserva.pedidoId}>
                      {reserva.pedidoId} · {reserva.pendente} un. pendentes
                    </option>
                  ))}
                </Seletor>
              </>
            ) : (
              <>
                {tipo === "retirada" && (
                  <Seletor label="Vínculo da retirada" name="reserva">
                    <option value="">Retirada avulsa (somente disponível)</option>
                    {produto.reservas.map((reserva) => (
                      <option key={reserva.id} value={reserva.id}>
                        {reserva.pedidoId} · {reserva.pendente} un. pendentes
                      </option>
                    ))}
                  </Seletor>
                )}
                {tipo === "ajuste" && (
                  <Seletor label="Lote conferido" name="lote">
                    {produto.lotesTodos.map((lote) => (
                      <option key={lote.id} value={lote.id}>
                        {lote.codigo} · saldo {lote.restante}
                      </option>
                    ))}
                  </Seletor>
                )}
                <Campo
                  name="quantidade"
                  label={tipo === "ajuste" ? "Quantidade física contada no lote (un.)" : "Quantidade (un.)"}
                  type="number"
                  min={tipo === "ajuste" ? 0 : 1}
                  step="1"
                />
                {tipo === "reserva" && (
                  <label>
                    Pedido em produção
                    <select name="pedido" className="est-select" required>
                      <option value="">Selecione um pedido</option>
                      {pedidos.map((pedido) => (
                        <option key={pedido.id} value={pedido.id}>{pedido.id}</option>
                      ))}
                    </select>
                  </label>
                )}
                {tipo === "entrada" && (
                  <>
                    <Campo name="codigo" label="Código do novo lote" />
                    <Campo name="validade" label="Validade do lote" type="date" required={false} />
                  </>
                )}
                {tipo !== "reserva" && <Campo name="motivo" label="Justificativa / referência" />}
              </>
            )}
            {erro && <p role="alert" className="est-red">{erro}</p>}
            <p className="est-muted">
              As operações são registradas no banco de homologação. A ordem FEFO considera a
              validade real dos lotes.
            </p>
            <ActionButton type="submit" disabled={salvando}>
              <CheckCircle2 size={16} />
              {salvando ? "Registrando…" : "Confirmar movimentação"}
            </ActionButton>
          </form>
        </ModalEstoque>
      )}

      {modal === "historico" && produto && (
        <ModalEstoque
          titulo={`Histórico — ${produto.nome}`}
          descricao="Registros reais de reservas e movimentações."
          fechar={() => setModal(null)}
        >
          <div className="est-form">
            {produto.reservas.map((reserva) => (
              <p key={reserva.id}>
                <b>{reserva.pedidoId}</b> · Reservado {reserva.quantidade} · Retirado {reserva.consumido} ·
                Pendente {reserva.pendente}
              </p>
            ))}
            {!produto.reservas.length && <p className="est-muted">Nenhuma reserva ativa para este sabor.</p>}
          </div>
          <HistoricoMovimentos produtoId={produto.id} nomes={nomes} />
        </ModalEstoque>
      )}

      {modal === "alertas" && (
        <ModalEstoque
          titulo="Alertas do estoque de salgados"
          descricao="Indicadores calculados sobre os saldos reais."
          fechar={() => setModal(null)}
        >
          <p>
            {k.baixos} sabores abaixo do mínimo. {k.vencendo} lotes com vencimento em até 7 dias.
          </p>
          <ul>
            {(produtos ?? [])
              .filter((p) => p.disponivel < p.minimo)
              .map((p) => (
                <li key={p.id}>
                  {p.nome}: produzir pelo menos {numero.format(p.minimo - p.disponivel)} un. para
                  atingir o mínimo.
                </li>
              ))}
          </ul>
        </ModalEstoque>
      )}

      {modal === "ajuda" && (
        <ModalEstoque
          titulo="Como funciona o estoque de salgados"
          descricao="Regras operacionais do estoque."
          fechar={() => setModal(null)}
        >
          <p>
            Disponível = físico − reservado. Existe um único total reservado por sabor: vendas
            avulsas, combos fixos, combos personalizados e qualquer outro pedido confirmado entram
            na mesma soma, sem reservado separado por origem. Na retirada do freezer a reserva é
            consumida e o físico é baixado uma vez, pelo lote que vence primeiro. Cancelar libera
            apenas o que ainda não foi retirado. Insumos e embalagens nunca são baixados
            automaticamente nesta etapa.
          </p>
        </ModalEstoque>
      )}
    </div>
  );
}
