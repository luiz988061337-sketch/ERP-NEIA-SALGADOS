import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Bell, CheckCircle2, CircleHelp, ClipboardList, Eye, Layers, Package, Plus, Search, Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ActionButton, DarkTable, DarkTableRow, ERP_COLORS, MetricCard, ModuleHeader, SectionCard, StatusBadge } from "@/components/admin/erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const CATEGORIAS_SALGADOS = [
  "mini-fritos", "mini-assados", "mini-pasteis", "mini-pizzas", "mini-empadinhas",
  "mini-congelados", "salgados-fritos", "salgados-assados", "salgados-congelados", "mini-salgados",
];
const numero = new Intl.NumberFormat("pt-BR");
const dataValidade = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const fusoLoja = "America/Sao_Paulo";
const diaLoja = new Intl.DateTimeFormat("sv-SE", { timeZone: fusoLoja });
const dataMovimento = new Intl.DateTimeFormat("pt-BR", { timeZone: fusoLoja, dateStyle: "short", timeStyle: "short" });
const estilosTabela =
  "[&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-3.5 [&_td]:text-sm [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-3 [&_th]:text-sm [&_th]:normal-case";
const estiloFiltro = "h-11 min-w-0 rounded-lg border border-[#D4A94A]/30 bg-[#15130F] px-3 text-sm";
const estoqueKey = ["admin-estoque-salgados"];
type AcaoEstoque = "entrada" | "movimentacao";
type ProdutoMovimento = { id: string; nome: string; estoque: number };

function validade(data: string | null | undefined) {
  return data ? dataValidade.format(new Date(data)) : "—";
}

async function consultarSalgados(signal: AbortSignal) {
  const { data, error } = await supabase
    .from("produtos")
    .select(`
      id, nome, imagem_url, disponivel, estoque, estoque_minimo, categorias!inner(slug, nome),
      lotes(id, codigo, validade, restante, status),
      reservas_estoque(pedido_id, quantidade, reserva_consumos(quantidade))
    `)
    .in("categorias.slug", CATEGORIAS_SALGADOS)
    .gt("lotes.restante", 0)
    .eq("reservas_estoque.status", "ativa")
    .order("nome")
    .order("validade", { referencedTable: "lotes", ascending: true, nullsFirst: false })
    .order("created_at", { referencedTable: "lotes", ascending: true })
    .abortSignal(signal);

  if (error) throw error;

  const hoje = diaLoja.format(new Date());
  return data.map((produto) => {
    const reservas = produto.reservas_estoque.map((reserva) => ({
      pedidoId: reserva.pedido_id,
      pendente: Math.max(0, reserva.quantidade - reserva.reserva_consumos.reduce(
        (consumido, retirada) => consumido + retirada.quantidade, 0,
      )),
    }));
    // O saldo de produtos já desconta as reservas. A retirada parcial reduz só o restante da reserva.
    const disponivel = produto.estoque ?? 0;
    const reservado = reservas.reduce((total, reserva) => total + reserva.pendente, 0);
    const lotes = produto.lotes.map((lote) => {
      const status = lote.validade && lote.validade < hoje ? "vencido" : lote.status;
      return { ...lote, status };
    });
    const lotesFefo = lotes.filter((lote) => lote.status === "ativo");
    return {
      ...produto,
      estoque: disponivel,
      minimo: produto.estoque_minimo ?? 0,
      fisico: disponivel + reservado,
      saldoLotes: produto.lotes.reduce((total, lote) => total + lote.restante, 0),
      reservado,
      pedidos: new Set(reservas.filter((reserva) => reserva.pendente > 0).map((reserva) => reserva.pedidoId)).size,
      lotes: [...lotesFefo, ...lotes.filter((lote) => lote.status !== "ativo")],
      lotesFefo,
    };
  });
}

export function SalgadosAdmin({ onProdutos, renderMovimento }: {
  onProdutos: () => void;
  renderMovimento: (produto: ProdutoMovimento, acao: AcaoEstoque, atualizar: () => void) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [categoria, setCategoria] = useState("todos");
  const [abaixo, setAbaixo] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [painel, setPainel] = useState<"ajuda" | "alertas" | AcaoEstoque | null>(null);
  const [produtoMovimentoId, setProdutoMovimentoId] = useState("");
  const { data: produtos, isPending, isError, refetch } = useQuery({
    queryKey: estoqueKey,
    queryFn: ({ signal }) => consultarSalgados(signal),
  });

  const filtrosCategoria = new Map(produtos?.map((p) => [p.categorias.slug, p.categorias.nome]));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const alertas = produtos?.filter((p) => p.estoque < p.minimo) ?? [];
  const lista = produtos?.filter((p) =>
    p.nome.toLocaleLowerCase("pt-BR").includes(termo) &&
    (categoria === "todos" || categoria === p.categorias.slug) &&
    (!abaixo || p.estoque < p.minimo) &&
    (status === "todos" || p.disponivel === (status === "ativo")),
  ) ?? [];
  const sabor = lista.find((p) => p.id === foco) ?? lista[0];
  const visivel = !isPending && !isError ? produtos : undefined;
  const produtoMovimento = visivel?.find((p) => p.id === produtoMovimentoId);
  const total = (somar: (p: NonNullable<typeof produtos>[number]) => number) =>
    numero.format(produtos?.reduce((soma, p) => soma + somar(p), 0) ?? 0);

  function abrirMovimento(acao: AcaoEstoque, produtoId: string) {
    setProdutoMovimentoId(produtoId);
    setPainel(acao);
  }

  function atualizarMovimentos() {
    void queryClient.invalidateQueries({ queryKey: estoqueKey });
    void queryClient.invalidateQueries({ queryKey: ["admin-movimentacoes-salgado", produtoMovimentoId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-produtos"] });
  }

  return (
    <div className="space-y-4 px-3 sm:px-5 [&>div:first-child>div:first-child]:min-w-0 [&>div:first-child_h1]:text-2xl [&>div:first-child_h1]:normal-case [&>div:first-child_p]:whitespace-normal">
      <ModuleHeader
        icone={Snowflake}
        titulo="Estoque de Salgados"
        subtitulo="Controle de salgados por sabor, reservas, lotes e validade (FEFO)."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block w-full sm:w-72">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input aria-label="Buscar sabor" className="h-11 rounded-full pl-9" placeholder="Buscar sabor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            <Button variant="outline" size="icon" className="size-11 text-[#F2CE6B]" aria-label="Alertas de estoque" disabled={!visivel} onClick={() => setPainel("alertas")}><Bell aria-hidden /></Button>
            <Button variant="outline" size="icon" className="size-11 text-[#F2CE6B]" aria-label="Ajuda sobre estoque" onClick={() => setPainel("ajuda")}><CircleHelp aria-hidden /></Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton variant="ghost" className="min-h-11 normal-case text-sm" onClick={onProdutos}>
          <ClipboardList size={17} /> Cadastro de Produtos
        </ActionButton>
        <span aria-current="page" className="inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 py-2 text-sm font-semibold text-[#14120C]">
          <Snowflake size={17} aria-hidden /> Estoque de Salgados
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5 sm:gap-3 [&>div]:min-h-28 [&>div]:px-2 sm:[&>div]:px-3 [&>div:last-child]:col-span-2 xl:[&>div:last-child]:col-span-1 [&_p:first-child]:normal-case [&_p:nth-child(2)]:text-[clamp(1.05rem,2vw,1.5rem)]">
        <MetricCard icone={Package} label="Total físico" valor={<span className="text-[#F2CE6B]">{visivel ? `${total((p) => p.fisico)} un.` : "—"}</span>} detalhe="Saldo calculado" />
        <MetricCard icone={Layers} label="Total reservado" valor={<span className="text-[#79ACFF]">{visivel ? `${total((p) => p.reservado)} un.` : "—"}</span>} detalhe="Aguardando retirada" cor={ERP_COLORS.blue} />
        <MetricCard icone={CheckCircle2} label="Total disponível" valor={<span className="text-[#79DA8D]">{visivel ? `${total((p) => p.estoque)} un.` : "—"}</span>} detalhe="Físico menos reservado" cor={ERP_COLORS.green} />
        <MetricCard icone={AlertTriangle} label="Abaixo do mínimo" valor={<span className="text-[#F98787]">{visivel ? numero.format(alertas.length) : "—"}</span>} detalhe="Sabores para reposição" cor={ERP_COLORS.red} />
        <MetricCard icone={Package} label="Lotes ativos" valor={visivel ? `${total((p) => p.lotesFefo.length)} lotes` : "—"} detalhe="Primeiro que vence, primeiro que sai" />
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
          <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
            <label className="grid w-full gap-1 text-sm sm:w-auto">
              Categoria
              <select className={estiloFiltro} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="todos">Todas</option>
                {[...filtrosCategoria].map(([slug, nome]) => <option key={slug} value={slug}>{nome}</option>)}
              </select>
            </label>
            <label className="grid w-full gap-1 text-sm sm:w-auto">
              Situação
              <select className={estiloFiltro} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="ativo">Ativos no catálogo</option>
                <option value="inativo">Inativos no catálogo</option>
              </select>
            </label>
            <label className="col-span-2 grid min-w-0 gap-1 text-sm">
              Fornecedor
              <select className={estiloFiltro} disabled>
                <option>Sem vínculo cadastrado</option>
              </select>
            </label>
            <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[#D4A94A]" checked={abaixo} onChange={(e) => setAbaixo(e.target.checked)} />
              Apenas abaixo do mínimo
            </label>
            <div className="col-span-2 flex flex-wrap gap-2 sm:ms-auto">
              <ActionButton className="min-h-11 text-sm normal-case" disabled={!sabor} onClick={() => sabor && abrirMovimento("movimentacao", sabor.id)}>
                <ArrowLeftRight size={16} aria-hidden /> Movimentação
              </ActionButton>
              <ActionButton className="min-h-11 text-sm normal-case" disabled={!sabor} onClick={() => sabor && abrirMovimento("entrada", sabor.id)}>
                <Plus size={16} aria-hidden /> Registrar entrada de estoque
              </ActionButton>
            </div>
          </div>
          <SectionCard bodyClassName="p-0">
            <p className="px-3 py-2 text-xs text-muted-foreground sm:hidden">Deslize a tabela para ver todos os saldos e ações.</p>
            <DarkTable
              className={`${estilosTabela} max-h-[440px] overflow-y-auto [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-[#1A1712]`}
              colunas={["Produto / sabor", "Físico (un.)", "Reservado", "Disponível", "Est. mínimo", "Reservas", "Lotes ativos", "Próxima validade", "Ações"]}
              vazio={lista.length === 0 ? "Nenhum sabor neste filtro." : undefined}
            >
              {lista.map((p) => (
                <DarkTableRow key={p.id}>
                  <td className={sabor?.id === p.id ? "bg-[#D4A94A]/15" : undefined}>
                    <button type="button" aria-pressed={sabor?.id === p.id} onClick={() => setFoco(p.id)} className="flex min-h-11 items-center gap-2 text-left font-semibold aria-pressed:text-[#F2CE6B]">
                      {p.imagem_url && <img className="size-9 rounded-md object-cover" src={p.imagem_url} alt="" loading="lazy" />}
                      <span>
                        {p.nome}
                        {!p.disponivel && <small className="block font-normal text-muted-foreground">Inativo no catálogo</small>}
                      </span>
                    </button>
                  </td>
                  <td className="font-semibold">{numero.format(p.fisico)}</td>
                  <td className="text-[#79ACFF]">{numero.format(p.reservado)}</td>
                  <td className="font-semibold text-[#79DA8D]">{numero.format(p.estoque)}</td>
                  <td>
                    {numero.format(p.minimo)}
                    {p.estoque < p.minimo && <span className="mt-1 block"><StatusBadge tom="atencao">Abaixo do mínimo</StatusBadge></span>}
                  </td>
                  <td className="text-[#F2CE6B]">{numero.format(p.pedidos)} {p.pedidos === 1 ? "pedido" : "pedidos"}</td>
                  <td>{numero.format(p.lotesFefo.length)}</td>
                  <td>{validade(p.lotesFefo[0]?.validade)}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="icon" className="size-10 text-[#F2CE6B]" aria-label={`Ver lotes de ${p.nome}`} onClick={() => {
                        setFoco(p.id);
                        document.getElementById("salgados-detalhes")?.scrollIntoView({ block: "start" });
                      }}><Eye aria-hidden /></Button>
                      <Button variant="outline" size="icon" className="size-10 text-[#F2CE6B]" aria-label={`Movimentar ${p.nome}`} onClick={() => abrirMovimento("movimentacao", p.id)}><ArrowLeftRight aria-hidden /></Button>
                    </div>
                  </td>
                </DarkTableRow>
              ))}
            </DarkTable>
          </SectionCard>
          {sabor && (
            <div id="salgados-detalhes" className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
              <SectionCard titulo={sabor.nome}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Categoria</dt><dd>{sabor.categorias.nome}</dd>
                  <dt className="text-muted-foreground">Físico calculado</dt><dd>{numero.format(sabor.fisico)} un.</dd>
                  <dt className="text-muted-foreground">Reservado</dt><dd>{numero.format(sabor.reservado)} un.</dd>
                  <dt className="text-muted-foreground">Disponível</dt><dd>{numero.format(sabor.estoque)} un.</dd>
                  <dt className="text-muted-foreground">Estoque mínimo</dt><dd>{numero.format(sabor.minimo)} un.</dd>
                  <dt className="text-muted-foreground">Saldo em lotes</dt><dd>{sabor.lotes.length ? `${numero.format(sabor.saldoLotes)} un.` : "Sem lote registrado"}</dd>
                </dl>
              </SectionCard>
              <SectionCard titulo={`Lotes de ${sabor.nome} em ordem FEFO`} bodyClassName="p-0">
                <DarkTable
                  className={estilosTabela}
                  colunas={["Lote", "Validade", "Saldo registrado", "Status"]}
                  vazio={!sabor.lotes.length ? "Nenhum lote com saldo registrado para este sabor." : undefined}
                >
                  {sabor.lotes.map((lote) => (
                    <DarkTableRow key={lote.id}>
                      <td>{lote.codigo}</td>
                      <td>{validade(lote.validade)}</td>
                      <td>{numero.format(lote.restante)} un.</td>
                      <td className="capitalize"><StatusBadge tom={lote.status === "ativo" ? "ok" : "atencao"}>{lote.status}</StatusBadge></td>
                    </DarkTableRow>
                  ))}
                </DarkTable>
              </SectionCard>
              <MovimentacoesSalgado produtoId={sabor.id} />
            </div>
          )}
        </>
      )}
      <Dialog open={painel !== null} onOpenChange={(aberto) => { if (!aberto) setPainel(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {painel === "entrada" ? "Registrar entrada de estoque" :
                painel === "movimentacao" ? "Movimentação de estoque" :
                painel === "alertas" ? "Alertas de estoque" : "Como ler o estoque"}
            </DialogTitle>
            <DialogDescription>
              {painel === "entrada" || painel === "movimentacao"
                ? "A movimentação atualiza o saldo do produto. O registro de lotes é separado."
                : "Estoque de Salgados"}
            </DialogDescription>
          </DialogHeader>
          {painel === "ajuda" && (
            <ul className="space-y-2 text-sm">
              <li>O físico calculado soma o saldo disponível e as reservas que ainda aguardam retirada.</li>
              <li>O saldo em lotes soma os volumes registrados por lote. A conferência no freezer é uma etapa separada.</li>
              <li>FEFO organiza os lotes válidos pela data de vencimento, com os lotes sem data no fim.</li>
            </ul>
          )}
          {painel === "alertas" && (
            alertas.length === 0 ? <p className="text-sm">Nenhum sabor abaixo do mínimo.</p> :
              <ul className="divide-y divide-border text-sm">
                {alertas.map((p) => <li key={p.id} className="py-2">{p.nome} · {numero.format(p.estoque)} de {numero.format(p.minimo)} un.</li>)}
              </ul>
          )}
          {(painel === "entrada" || painel === "movimentacao") && (
            <>
              <label className="grid gap-1 text-sm">
                Produto / sabor
                <select value={produtoMovimentoId} className={estiloFiltro} onChange={(e) => setProdutoMovimentoId(e.target.value)}>
                  {visivel?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              {produtoMovimento && renderMovimento(produtoMovimento, painel, atualizarMovimentos)}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovimentacoesSalgado({ produtoId }: { produtoId: string }) {
  const { data, isError, isPending, refetch } = useQuery({
    queryKey: ["admin-movimentacoes-salgado", produtoId],
    queryFn: async ({ signal }) => {
      const { data: movimentos, error } = await supabase
        .from("estoque_movimentacoes")
        .select("id, tipo, created_at, quantidade")
        .eq("produto_id", produtoId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5)
        .abortSignal(signal);
      if (error) throw error;
      return movimentos;
    },
  });

  return (
    <SectionCard titulo={<span className="flex items-center gap-2"><ArrowLeftRight size={16} aria-hidden /> Últimas movimentações</span>}>
      {isPending && <p role="status" className="text-sm text-muted-foreground">Carregando movimentações…</p>}
      {isError && (
        <div role="alert" className="space-y-2 text-sm">
          <p>Não foi possível consultar as movimentações.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      )}
      {data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {data.map((mov) => (
            <li key={mov.id} className="flex flex-wrap justify-between gap-x-2 py-2">
              <span className="capitalize">{mov.tipo.replaceAll("_", " ")}</span>
              <strong>{numero.format(mov.quantidade)} un.</strong>
              <time dateTime={mov.created_at} className="w-full text-xs text-muted-foreground">{dataMovimento.format(new Date(mov.created_at))}</time>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
