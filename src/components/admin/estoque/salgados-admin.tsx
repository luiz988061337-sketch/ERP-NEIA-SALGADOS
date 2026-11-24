import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ClipboardList, Layers, Package, Search, Snowflake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ActionButton, DarkTable, DarkTableRow, ERP_COLORS, MetricCard, ModuleHeader, SectionCard, StatusBadge } from "@/components/admin/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIAS_SALGADOS = [
  "mini-fritos", "mini-assados", "mini-pasteis", "mini-pizzas", "mini-empadinhas",
  "mini-congelados", "salgados-fritos", "salgados-assados", "salgados-congelados", "mini-salgados",
];
const numero = new Intl.NumberFormat("pt-BR");
const dataValidade = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dataMovimento = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const estilosTabela =
  "[&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-sm [&_th]:text-xs";

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
    .abortSignal(signal);

  if (error) throw error;

  return data.map((produto) => {
    const reservas = produto.reservas_estoque.map((reserva) => ({
      pedidoId: reserva.pedido_id,
      pendente: Math.max(0, reserva.quantidade - reserva.reserva_consumos.reduce(
        (consumido, retirada) => consumido + retirada.quantidade, 0,
      )),
    }));
    const lotesFefo = produto.lotes.filter((lote) => lote.status === "ativo");
    return {
      ...produto,
      estoque: produto.estoque ?? 0,
      minimo: produto.estoque_minimo ?? 0,
      saldoLotes: produto.lotes.reduce((total, lote) => total + lote.restante, 0),
      reservado: reservas.reduce((total, reserva) => total + reserva.pendente, 0),
      pedidos: new Set(reservas.filter((reserva) => reserva.pendente > 0).map((reserva) => reserva.pedidoId)).size,
      lotesFefo,
    };
  });
}

export function SalgadosAdmin({ onProdutos }: { onProdutos: (nome?: string) => void }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [categoria, setCategoria] = useState("todos");
  const [foco, setFoco] = useState<string | null>(null);
  const { data: produtos, isPending, isError, refetch } = useQuery({
    queryKey: ["admin-estoque-salgados"],
    queryFn: ({ signal }) => consultarSalgados(signal),
  });

  const filtrosCategoria = new Map(produtos?.map((p) => [p.categorias.slug, p.categorias.nome]));
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const lista = produtos?.filter((p) =>
    p.nome.toLocaleLowerCase("pt-BR").includes(termo) &&
    (categoria === "todos" || categoria === p.categorias.slug) &&
    (status === "todos" || (p.estoque < p.minimo) === (status === "baixo")),
  ) ?? [];
  const sabor = lista.find((p) => p.id === foco) ?? lista[0];
  const visivel = !isPending && !isError ? produtos : undefined;
  const total = (somar: (p: NonNullable<typeof produtos>[number]) => number) =>
    numero.format(produtos?.reduce((soma, p) => soma + somar(p), 0) ?? 0);

  return (
    <div className="space-y-4">
      <ModuleHeader
        icone={Snowflake}
        titulo="Estoque de Salgados"
        subtitulo="Controle de salgados por sabor, reservas, lotes e validade (FEFO)."
        acoes={
          <label className="relative block min-w-0 grow sm:grow-0">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Buscar sabor" className="rounded-full pl-9 sm:w-64" placeholder="Buscar sabor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <ActionButton variant="ghost" onClick={() => onProdutos()}>
          <ClipboardList size={17} /> Cadastro de Produtos
        </ActionButton>
        <span aria-current="page" className="inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-3 py-2 text-sm font-semibold text-[#14120C]">
          <Snowflake size={17} aria-hidden /> Estoque de Salgados
        </span>
      </div>

      <div className="grid gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 [&>div]:min-h-24">
        <MetricCard icone={Package} label="Saldo em lotes" valor={<span className="text-[#F2CE6B]">{visivel?.some((p) => p.lotes.length > 0) ? `${total((p) => p.saldoLotes)} un.` : "—"}</span>} detalhe="Saldo registrado nos lotes" />
        <MetricCard icone={Layers} label="Total reservado" valor={<span className="text-[#79ACFF]">{visivel ? `${total((p) => p.reservado)} un.` : "—"}</span>} detalhe="Aguardando retirada" cor={ERP_COLORS.blue} />
        <MetricCard icone={CheckCircle2} label="Total disponível" valor={<span className="text-[#79DA8D]">{visivel ? `${total((p) => p.estoque)} un.` : "—"}</span>} detalhe="Saldo do cadastro de produtos" cor={ERP_COLORS.green} />
        <MetricCard icone={AlertTriangle} label="Abaixo do mínimo" valor={<span className="text-[#F98787]">{visivel ? total((p) => Number(p.estoque < p.minimo)) : "—"}</span>} detalhe="Sabores" cor={ERP_COLORS.red} />
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
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid w-full gap-1 text-sm sm:w-auto">
              Categoria
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="todos">Todas</option>
                {[...filtrosCategoria].map(([slug, nome]) => <option key={slug} value={slug}>{nome}</option>)}
              </select>
            </label>
            <label className="grid w-full gap-1 text-sm sm:w-auto">
              Status
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="ok">No mínimo ou acima</option>
                <option value="baixo">Abaixo do mínimo</option>
              </select>
            </label>
          </div>
          <SectionCard bodyClassName="p-0">
            <p className="px-3 py-2 text-xs text-muted-foreground sm:hidden">Deslize a tabela para ver todos os saldos e ações.</p>
            <DarkTable
              className={estilosTabela}
              colunas={["Produto / sabor", "Saldo em lotes", "Reservado", "Disponível", "Est. mínimo", "Pedidos com reservas", "Lotes ativos", "Próxima validade", "Ações"]}
              vazio={lista.length === 0 ? "Nenhum sabor neste filtro." : undefined}
            >
              {lista.map((p) => (
                <DarkTableRow key={p.id}>
                  <td>
                    <button type="button" aria-pressed={sabor?.id === p.id} onClick={() => setFoco(p.id)} className="flex items-center gap-2 text-left font-semibold aria-pressed:text-accent">
                      {p.imagem_url && <img className="size-9 rounded-md object-cover" src={p.imagem_url} alt="" loading="lazy" />}
                      <span>
                        {p.nome}
                        {!p.disponivel && <small className="block font-normal text-muted-foreground">Inativo no catálogo</small>}
                      </span>
                    </button>
                  </td>
                  <td>{p.lotes.length ? numero.format(p.saldoLotes) : "—"}</td>
                  <td className="text-[#79ACFF]">{numero.format(p.reservado)}</td>
                  <td className="font-semibold text-[#79DA8D]">{numero.format(p.estoque)}</td>
                  <td>
                    {numero.format(p.minimo)}
                    {p.estoque < p.minimo && <span className="mt-1 block"><StatusBadge tom="atencao">Abaixo do mínimo</StatusBadge></span>}
                  </td>
                  <td>{numero.format(p.pedidos)}</td>
                  <td>{numero.format(p.lotesFefo.length)}</td>
                  <td>{validade(p.lotesFefo[0]?.validade)}</td>
                  <td><Button variant="outline" size="sm" onClick={() => onProdutos(p.nome)}>Estoque em Produtos</Button></td>
                </DarkTableRow>
              ))}
            </DarkTable>
          </SectionCard>
          {sabor && (
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
              <SectionCard titulo={sabor.nome}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Categoria</dt><dd>{sabor.categorias.nome}</dd>
                  <dt className="text-muted-foreground">Reservado</dt><dd>{numero.format(sabor.reservado)} un.</dd>
                  <dt className="text-muted-foreground">Disponível</dt><dd>{numero.format(sabor.estoque)} un.</dd>
                  <dt className="text-muted-foreground">Estoque mínimo</dt><dd>{numero.format(sabor.minimo)} un.</dd>
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
                    <td><StatusBadge tom={lote.status === "ativo" ? "ok" : "atencao"}>{lote.status}</StatusBadge></td>
                  </DarkTableRow>
                ))}
              </DarkTable>
              </SectionCard>
              <MovimentacoesSalgado produtoId={sabor.id} />
            </div>
          )}
        </>
      )}
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
