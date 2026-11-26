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
  History,
  MinusCircle,
  Package,
  Plus,
  Snowflake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ehModoDemo } from "@/lib/demo-preview";
import {
  ActionButton,
  DarkTable,
  DarkTableRow,
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
import { categoriasProdutosSalgados, organizarSaboresEstoque } from "@/lib/catalogo-sabores-estoque";
import { diasDaValidade, lerSituacaoSalgado, loteVencidoComSaldo } from "@/lib/situacao-salgados";
import { EstoqueCategorias, FotoSabor, formatarQuantidade } from "./salgados-categorias";
import "./salgados-admin.css";

/**
 * A lista oficial organiza o painel. Saldos, lotes e movimentações dos
 * sabores vinculados vêm das mesmas fontes operacionais do estoque E01.
 */

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
const diaLoja = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const estilosTabela =
  "[&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-sm [&_th]:text-xs";

function formatarData(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

/** Lote com saldo e validade em até 7 dias (data real do banco). */
function alertaValidade(validade: string | null, hoje: string) {
  if (!validade) return false;
  const dias = diasDaValidade(validade, hoje);
  return dias >= 0 && dias <= 7;
}

/**
 * O emulador de demonstração não entende `select` aninhado do PostgREST.
 * Este caminho existe SOMENTE para as capturas locais (VITE_DEMO_PREVIEW=1);
 * no build operacional a consulta aninhada real permanece intacta abaixo.
 */
async function consultarSalgadosDemo() {
  const [{ data: produtosData, error: erroProdutos }, { data: lotes }, { data: reservas }, { data: consumos }, { data: pedidos }, { data: movimentos }] =
    await Promise.all([
      supabase
        .from("produtos")
        .select("id, nome, imagem_url, disponivel, estoque, estoque_minimo, tipo_venda, unidade_medida, categoria_id")
        .order("nome"),
      supabase.from("lotes").select("id, codigo, validade, restante, status, produto_id"),
      supabase.from("reservas_estoque").select("id, pedido_id, produto_id, quantidade, status"),
      supabase.from("reserva_consumos").select("id, reserva_id, quantidade"),
      supabase.from("pedidos").select("id, created_at").eq("status", "em_producao").limit(50),
      supabase.from("estoque_movimentacoes").select("produto_id"),
    ]);
  if (erroProdutos) throw erroProdutos;

  const categoriasDemo = new Map(
    (await supabase.from("categorias").select("id, nome, slug")).data?.map((c) => [c.id, c]) ?? [],
  );
  const produtos = (produtosData ?? [])
    .filter((p) => categoriasProdutosSalgados.includes(categoriasDemo.get(p.categoria_id)?.slug ?? ""))
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
        disponivel: fisico - reservado,
      };
    });
  return { produtos, pedidos: pedidos ?? [], vinculos: null };
}

async function consultarSalgados(signal: AbortSignal) {
  if (ehModoDemo()) return consultarSalgadosDemo();
  const [{ data, error }, { data: pedidos }, cadastro] = await Promise.all([
    supabase
      .from("produtos")
      .select(`
        id, nome, imagem_url, disponivel, estoque, estoque_minimo, tipo_venda, unidade_medida,
        categorias!inner(slug, nome),
        lotes(id, codigo, validade, restante, status),
        movimentos:estoque_movimentacoes(id),
        reservas_estoque(id, pedido_id, quantidade, status, reserva_consumos(quantidade))
      `)
      .in("categorias.slug", categoriasProdutosSalgados)
      .order("nome")
      .order("validade", { referencedTable: "lotes", ascending: true, nullsFirst: false })
      .limit(1, { referencedTable: "movimentos" })
      .abortSignal(signal),
    supabase
      .from("pedidos")
      .select("id, created_at")
      .eq("status", "em_producao")
      .order("created_at", { ascending: false })
      .limit(50)
      .abortSignal(signal),
    supabase.from("sabores_estoque").select("chave, produto_id").abortSignal(signal),
  ]);
  if (error) throw error;
  // A versão anterior do banco ainda pode atender à tela antes do cadastro oficial.
  if (cadastro.error && !["42P01", "PGRST205"].includes(cadastro.error.code)) throw cadastro.error;

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
      ativo: produto.disponivel,
      estoque: produto.estoque ?? 0,
      minimo: produto.estoque_minimo ?? 0,
      temMovimento: produto.movimentos.length > 0,
      lotesTodos: produto.lotes,
      lotesFefo,
      reservas,
      fisico,
      reservado,
      disponivel: fisico - reservado,
    };
  });

  return { produtos, pedidos: pedidos ?? [], vinculos: cadastro.data };
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
  const hoje = diaLoja.format(new Date());
  const { sabores, legados } = organizarSaboresEstoque<NonNullable<typeof produtos>[number]>(
    produtos ?? [],
    data?.vinculos ?? null,
  );
  const linhas = sabores.map((sabor) => ({ ...sabor, situacao: lerSituacaoSalgado(sabor.produto, hoje) }));
  const linhasLegadas = legados.map((p) => ({
    chave: p.id,
    nome: p.nome,
    imagem: p.imagem_url,
    produto: p,
    situacao: lerSituacaoSalgado(p, hoje),
  }));
  const estadosPorProduto = new Map(
    [...linhas, ...linhasLegadas].flatMap((linha) =>
      linha.produto ? [[linha.produto.id, linha.situacao] as const] : [],
    ),
  );
  const estados = [...estadosPorProduto.values()];
  const baixos = estados.filter((estado) => estado.abaixo).length;
  const vencendo = estados.reduce((total, estado) => total + estado.vencendo, 0);
  const vencidos = estados.filter((estado) => estado.alertas.includes("vencido")).length;
  const reservasExcedentes = estados.filter((estado) => estado.alertas.includes("excedente")).length;
  const primeiroVinculado = sabores.find((sabor) => sabor.produto)?.produto;
  const produto = produtos?.find((p) => p.id === foco) ?? primeiroVinculado ?? produtos?.[0];
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

  const situacaoProduto = produto ? estadosPorProduto.get(produto.id) : undefined;

  return (
    <div data-testid="estoque-salgados" className="neia-a01 est-salgados-painel">
      <header className="neia-a01-cabecalho">
        <div className="est-salgados-titulo">
          <span><Snowflake size={26} aria-hidden /></span>
          <div>
            <h1>Estoque de Salgados</h1>
            <p>Controle por sabor, lotes, reservas e movimentações.</p>
          </div>
        </div>
        <div className="est-salgados-cabecalho-acoes">
          <button className="neia-a01-dourado" disabled={!produto || isError} onClick={() => abrir("entrada")}>
            <Plus size={19} /> Entrada de estoque
          </button>
          <button disabled={!produto || isError} onClick={() => abrir("perda")}><MinusCircle size={17} /> Registrar perda</button>
          <button disabled={!produto || isError} onClick={() => abrir("ajuste")}><ClipboardList size={17} /> Inventário</button>
          <button disabled={!produto || isError} onClick={() => setModal("historico")}><History size={17} /> Histórico</button>
        </div>
      </header>

      {isPending && <p role="status">Carregando estoque e reservas…</p>}
      {isError && (
        <div role="alert" className="neia-a01-estado flex flex-wrap items-center justify-between gap-2">
          <p>Não foi possível consultar o estoque de salgados.</p>
          <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      )}

      {visivel && (
        <>
          <EstoqueCategorias
            sabores={linhas}
            legados={linhasLegadas}
            cadastrados={data?.vinculos?.length ?? 0}
            acoes={{
              onVer: (id) => {
                setFoco(id);
                requestAnimationFrame(() => document.getElementById("est-detalhe-salgado")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
              },
              onHistorico: (id) => { setFoco(id); setModal("historico"); },
              onInventario: (id) => abrir("ajuste", id),
            }}
          />
          <div className="est-salgados-cabecalho-acoes est-salgados-secundarias">
            <button onClick={() => onProdutos()}><ClipboardList size={17} /> Cadastro de Produtos</button>
            <button disabled={!produto} onClick={() => abrir("retirada")}><ArrowLeftRight size={17} /> Movimentação</button>
            <button onClick={() => setModal("alertas")}><Bell size={17} /> Alertas</button>
            <button onClick={() => setModal("ajuda")}><CircleHelp size={17} /> Ajuda</button>
          </div>

          {produto && foco && (
            <div className="est-bottom-three" id="est-detalhe-salgado">
              <SectionCard
                titulo={<span className="est-inline"><Snowflake size={17} /> {produto.nome}</span>}
                acoes={<StatusBadge tom="neutro">{produto.categorias.nome}</StatusBadge>}
              >
                <div className="est-product-detail">
                  <FotoSabor imagem={produto.imagem_url} />
                  <p>
                    Produto do cadastro único<small>{produto.id}</small>
                  </p>
                </div>
                <div className="est-mini-metrics">
                  {[
                    ["Físico", situacaoProduto?.fisico ?? null],
                    ["Reservado", situacaoProduto?.reservado ?? null],
                    ["Disponível", situacaoProduto?.disponivel ?? null],
                    ["Mínimo", situacaoProduto?.minimo ?? null],
                  ].map(([titulo, valor]) => (
                    <div key={titulo}>
                      <small>{titulo}</small>
                      <b>{formatarQuantidade(typeof valor === "number" ? valor : null)}</b>
                    </div>
                  ))}
                </div>
                <div className="est-detail-actions">
                  <ActionButton variant="ghost" onClick={() => onProdutos(produto.nome)}>
                    Editar produto e foto
                  </ActionButton>
                  <ActionButton variant="ghost" onClick={() => abrir("reserva")} disabled={produto.disponivel <= 0}>
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
                  {produto.lotesFefo.filter((lote) => !lote.validade || lote.validade >= hoje).map((lote, indice) => (
                    <DarkTableRow key={lote.id}>
                      <td>{lote.codigo}</td>
                      <td>{numero.format(lote.restante)}</td>
                      <td>{formatarData(lote.validade)}</td>
                      <td>
                        <StatusBadge tom={alertaValidade(lote.validade, hoje) ? "atencao" : "ok"}>
                          Usar {indice + 1}º{alertaValidade(lote.validade, hoje) ? " · Próximo" : ""}
                        </StatusBadge>
                      </td>
                    </DarkTableRow>
                  ))}
                  {produto.lotesTodos.filter((lote) => loteVencidoComSaldo(lote, hoje)).map((lote) => (
                    <DarkTableRow key={lote.id}>
                      <td>{lote.codigo}</td>
                      <td>{numero.format(lote.restante)}</td>
                      <td>{formatarData(lote.validade)}</td>
                      <td><StatusBadge tom="perigo">Vencido</StatusBadge></td>
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
            <label htmlFor="est-produtoId">
                Produto cadastrado
                <select
                  id="est-produtoId"
                  name="produtoId"
                  className="est-select"
                  value={produto.id}
                  onChange={(e) => setFoco(e.target.value)}
                >
                  {primeiroVinculado && (
                    <optgroup label="Sabores com estoque vinculado">
                      {sabores.flatMap(({ produto: p, nome }) => p ? [
                        <option key={p.id} value={p.id}>{nome}{!p.ativo ? " (inativo)" : ""}</option>,
                      ] : [])}
                    </optgroup>
                  )}
                  {!!legados.length && (
                    <optgroup label="Produtos fora do cadastro oficial">
                      {legados.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}{!p.ativo ? " (inativo)" : ""}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
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
            {baixos} sabores abaixo do mínimo. {vencendo} lotes com vencimento em até 7 dias. {" "}{vencidos} sabores com lote vencido. {reservasExcedentes} com reserva acima do físico.
          </p>
          <ul>
            {(produtos ?? [])
              .filter((p) => estadosPorProduto.get(p.id)?.abaixo)
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
