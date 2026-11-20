import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calculator,
  CircleDollarSign,
  ClipboardList,
  History,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ERP_COLORS,
  PremiumDemoBadge,
  PremiumKpi,
  PremiumPageHeader,
  PremiumSection,
  StatusBadge,
} from "@/components/admin/erp-ui";
import {
  COMPRAS_PREMIUM_DEMO,
  FORNECEDORES_PREMIUM_DEMO,
  INSUMOS_COMPRA_PREMIUM_DEMO,
  REPOSICAO_PREMIUM_DEMO,
  STATUS_COMPRA_PREMIUM_DEMO,
  UNIDADES_COMPRA_PREMIUM_DEMO,
  dataCurta,
  dinheiroPremium,
  saldoCompraPremium,
  totalCompraPremium,
  type CompraPremiumDemo,
  type ItemCompraPremiumDemo,
  type StatusCompraPremiumDemo,
} from "@/lib/estoque-premium-demo";
import { ehModoDemo } from "@/lib/demo-preview";

/** H18-B — Compras Premium. Recebimentos e impactos são apenas demonstrativos. */
type FormCompra = {
  fornecedor_id: string;
  data_prevista: string;
  observacao: string;
  itens: ItemCompraPremiumDemo[];
};

type ItemDraft = {
  insumo: string;
  quantidade: string;
  unidade: string;
  preco_unitario: string;
};

const ITEM_VAZIO: ItemDraft = {
  insumo: INSUMOS_COMPRA_PREMIUM_DEMO[0] ?? "Farinha de trigo (demo)",
  quantidade: "10",
  unidade: "kg",
  preco_unitario: "3.20",
};

const TOM_STATUS: Record<StatusCompraPremiumDemo, "ok" | "info" | "atencao" | "perigo" | "neutro"> = {
  rascunho: "neutro",
  enviada: "info",
  recebida_parcial: "atencao",
  recebida_total: "ok",
  cancelada: "perigo",
};

function clonarCompras(): CompraPremiumDemo[] {
  return COMPRAS_PREMIUM_DEMO.map((c) => ({
    ...c,
    itens: c.itens.map((i) => ({ ...i })),
    historico: c.historico.map((h) => ({ ...h })),
  }));
}

export function ComprasPremium() {
  const modoDemo = ehModoDemo();
  const [compras, setCompras] = useState<CompraPremiumDemo[]>(clonarCompras);
  const [focoId, setFocoId] = useState<string>(COMPRAS_PREMIUM_DEMO[0]?.id ?? "comp-demo-001");
  const [form, setForm] = useState<FormCompra>({
    fornecedor_id: FORNECEDORES_PREMIUM_DEMO[0]?.id ?? "forn-demo-001",
    data_prevista: "2026-11-25",
    observacao: "",
    itens: [],
  });
  const [item, setItem] = useState<ItemDraft>(ITEM_VAZIO);
  const [recebimentos, setRecebimentos] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusCompraPremiumDemo | "todos">("todos");

  const foco = compras.find((c) => c.id === focoId) ?? compras[0] ?? null;

  const metricas = useMemo(() => {
    const ativas = compras.filter((c) =>
      ["rascunho", "enviada", "recebida_parcial"].includes(c.status),
    ).length;
    const parciais = compras.filter((c) => c.status === "recebida_parcial").length;
    const valor = compras.reduce((s, c) => s + totalCompraPremium(c), 0);
    return { ativas, parciais, valor };
  }, [compras]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return compras.filter((c) => {
      const fornecedor = FORNECEDORES_PREMIUM_DEMO.find((f) => f.id === c.fornecedor_id);
      const texto = `${c.codigo} ${fornecedor?.nome ?? ""} ${c.observacao}`.toLocaleLowerCase("pt-BR");
      if (q && !texto.includes(q)) return false;
      if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
      return true;
    });
  }, [compras, busca, filtroStatus]);

  const impacto = useMemo(() => {
    if (!foco) return { unidades: 0, valor: 0, unitario: 0 };
    const unidades = foco.itens.reduce((s, i) => s + Math.max(0, i.quantidade - i.recebido), 0);
    const valor = saldoCompraPremium(foco);
    return { unidades, valor, unitario: unidades > 0 ? valor / unidades : 0 };
  }, [foco]);

  function adicionarItem() {
    const quantidade = Number(item.quantidade);
    const preco = Number(item.preco_unitario);
    if (!item.insumo.trim() || !(quantidade > 0) || !(preco >= 0)) {
      toast.error("Preencha insumo, quantidade e preço fictícios.");
      return;
    }
    setForm((f) => ({
      ...f,
      itens: [
        ...f.itens,
        {
          id: `item-demo-${Date.now()}`,
          insumo: item.insumo.trim(),
          quantidade,
          unidade: item.unidade,
          preco_unitario: preco,
          recebido: 0,
        },
      ],
    }));
    setItem(ITEM_VAZIO);
    toast.info("Item fictício adicionado ao rascunho.");
  }

  function salvarCompra(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.itens.length === 0) {
      toast.error("Adicione ao menos um item fictício.");
      return;
    }
    const codigo = `OC-DEMO-${String(compras.length + 1).padStart(3, "0")}`;
    const compra: CompraPremiumDemo = {
      id: `comp-demo-${Date.now()}`,
      codigo,
      fornecedor_id: form.fornecedor_id,
      data_emissao: "2026-11-20",
      data_prevista: form.data_prevista || "2026-11-25",
      status: "rascunho",
      observacao: form.observacao || "Rascunho fictício criado no Preview.",
      itens: form.itens.map((i) => ({ ...i })),
      historico: [{ data: "20/11/2026", evento: "Rascunho fictício criado no Preview." }],
    };
    setCompras((prev) => [compra, ...prev]);
    setFocoId(compra.id);
    setForm((f) => ({ ...f, observacao: "", itens: [] }));
    toast.success("Pedido fictício criado como rascunho. Nada foi enviado.");
  }

  function marcarEnviada(c: CompraPremiumDemo) {
    if (c.status !== "rascunho") return;
    setCompras((prev) =>
      prev.map((item) =>
        item.id === c.id
          ? {
              ...item,
              status: "enviada",
              historico: [...item.historico, { data: "20/11/2026", evento: "Envio simulado ao fornecedor fictício." }],
            }
          : item,
      ),
    );
    toast.info("Envio simulado. Nenhuma mensagem real foi enviada.");
  }

  function registrarRecebimento(c: CompraPremiumDemo, i: ItemCompraPremiumDemo, total: boolean) {
    const saldo = Math.max(0, i.quantidade - i.recebido);
    const digitado = Number(String(recebimentos[i.id] ?? "").replace(",", "."));
    const qtd = total ? saldo : digitado;
    if (!(qtd > 0) || qtd > saldo) {
      toast.error(`Informe uma quantidade entre 1 e ${saldo} ${i.unidade}.`);
      return;
    }
    setCompras((prev) =>
      prev.map((pedido) => {
        if (pedido.id !== c.id) return pedido;
        const itens = pedido.itens.map((item) =>
          item.id === i.id ? { ...item, recebido: Math.min(item.quantidade, item.recebido + qtd) } : item,
        );
        const concluido = itens.every((item) => item.recebido >= item.quantidade);
        const status: StatusCompraPremiumDemo = concluido ? "recebida_total" : "recebida_parcial";
        return {
          ...pedido,
          itens,
          status,
          historico: [
            ...pedido.historico,
            {
              data: "20/11/2026",
              evento: `Recebimento simulado de ${qtd} ${i.unidade} em ${i.insumo}.`,
            },
          ],
        };
      }),
    );
    setRecebimentos((r) => ({ ...r, [i.id]: "" }));
    toast.success("Recebimento simulado. Estoque e financeiro reais não foram alterados.");
  }

  function aplicarSugestao(s: (typeof REPOSICAO_PREMIUM_DEMO)[number]) {
    setForm((f) => ({
      ...f,
      fornecedor_id:
        FORNECEDORES_PREMIUM_DEMO.find((forn) => forn.nome === s.fornecedor)?.id ?? f.fornecedor_id,
      itens: [
        {
          id: `item-demo-${Date.now()}`,
          insumo: s.insumo,
          quantidade: s.sugerido,
          unidade: s.unidade,
          preco_unitario: 0,
          recebido: 0,
        },
      ],
    }));
    toast.info("Sugestão carregada no formulário. Ajuste o preço fictício antes de salvar.");
  }

  return (
    <div className="space-y-5 pb-28">
      <PremiumPageHeader
        icone={ShoppingCart}
        titulo="Compras Premium"
        subtitulo="Homologação visual · pedidos de compra e recebimentos fictícios (demonstração operacional)"
        demo={modoDemo}
        status={<PremiumDemoBadge>{modoDemo ? "Demonstração isolada" : "Preview"}</PremiumDemoBadge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { rotulo: "Pedidos ativos", valor: String(metricas.ativas), detalhe: "rascunho, enviado ou parcial", icone: ClipboardList, cor: ERP_COLORS.blue },
          { rotulo: "Recebimentos parciais", valor: String(metricas.parciais), detalhe: "aguardando complemento", icone: Truck, cor: ERP_COLORS.orange },
          { rotulo: "Valor planejado", valor: dinheiroPremium(metricas.valor), detalhe: "soma fictícia", icone: CircleDollarSign, cor: ERP_COLORS.goldStrong },
          { rotulo: "Alertas de reposição", valor: String(REPOSICAO_PREMIUM_DEMO.length), detalhe: "itens abaixo do mínimo", icone: AlertTriangle, cor: ERP_COLORS.red },
        ].map((k) => (
          <PremiumKpi
            key={k.rotulo}
            rotulo={k.rotulo}
            valor={k.valor}
            detalhe={k.detalhe}
            icone={k.icone}
            cor={k.cor}
          />
        ))}
      </div>

      <PremiumSection
        icone={ClipboardList}
        titulo={`Pedidos de compra · ${filtradas.length}`}
        subtitulo="Pedidos de compra fictícios para homologação e acompanhamento."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[#A09A8E]" aria-hidden />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido" className="h-9 pl-8 text-[14px]" />
            </div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as StatusCompraPremiumDemo | "todos")}
              className="h-9 rounded-md border border-[#D4A94A]/50 bg-[#141310] px-2 text-[14px] text-[#F4F1EA]"
            >
              <option value="todos">Todos os status</option>
              {Object.entries(STATUS_COMPRA_PREMIUM_DEMO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[12px] uppercase tracking-wide text-[#C9C2B8]">
                <th className="px-3 py-2.5">Pedido</th>
                <th className="px-3 py-2.5">Fornecedor</th>
                <th className="px-3 py-2.5">Previsão</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Total fictício</th>
                <th className="px-3 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2721]">
              {filtradas.map((c) => {
                const fornecedor = FORNECEDORES_PREMIUM_DEMO.find((f) => f.id === c.fornecedor_id);
                return (
                  <tr key={c.id} className={c.id === foco?.id ? "bg-[#F2CE6B]/10" : "hover:bg-[#211F18]"}>
                    <td className="px-3 py-3">
                      <div className="font-bold text-[#F2CE6B]">{c.codigo}</div>
                      <div className="text-[13px] text-[#A09A8E]">Emitido em {dataCurta(c.data_emissao)}</div>
                    </td>
                    <td className="px-3 py-3">{fornecedor?.nome ?? "—"}</td>
                    <td className="px-3 py-3">{dataCurta(c.data_prevista)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge tom={TOM_STATUS[c.status]}>{STATUS_COMPRA_PREMIUM_DEMO[c.status]}</StatusBadge>
                    </td>
                    <td className="px-3 py-3 font-semibold">{dinheiroPremium(totalCompraPremium(c))}</td>
                    <td className="px-3 py-3 text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => setFocoId(c.id)}>
                        Ver <ArrowRight className="size-3.5" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtradas.length === 0 ? (
            <p className="px-3 py-6 text-center text-[14px] text-[#A09A8E]">Nenhum pedido fictício encontrado.</p>
          ) : null}
        </div>
      </PremiumSection>

      <PremiumSection
        icone={Plus}
        titulo="Novo pedido fictício"
        subtitulo="Cadastro de pedido de compra fictício para simulação de compras e recebimentos."
      >
        <form onSubmit={salvarCompra} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[13px]">Fornecedor</Label>
            <select
              value={form.fornecedor_id}
              onChange={(e) => setForm((f) => ({ ...f, fornecedor_id: e.target.value }))}
              className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[15px] text-[#F4F1EA]"
            >
              {FORNECEDORES_PREMIUM_DEMO.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Data prevista</Label>
            <Input type="date" value={form.data_prevista} onChange={(e) => setForm((f) => ({ ...f, data_prevista: e.target.value }))} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[13px]">Observação</Label>
            <Input value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Observação fictícia (opcional)" />
          </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <Label className="text-[13px]">Insumo</Label>
            <select
              value={item.insumo}
              onChange={(e) => setItem((i) => ({ ...i, insumo: e.target.value }))}
              className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[15px] text-[#F4F1EA]"
            >
              {INSUMOS_COMPRA_PREMIUM_DEMO.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Quantidade</Label>
            <Input type="number" min={0} value={item.quantidade} onChange={(e) => setItem((i) => ({ ...i, quantidade: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Unidade</Label>
            <select
              value={item.unidade}
              onChange={(e) => setItem((i) => ({ ...i, unidade: e.target.value }))}
              className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[15px] text-[#F4F1EA]"
            >
              {UNIDADES_COMPRA_PREMIUM_DEMO.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Preço unitário fictício (R$)</Label>
            <Input type="number" min={0} step="0.01" value={item.preco_unitario} onChange={(e) => setItem((i) => ({ ...i, preco_unitario: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={adicionarItem} className="w-full">
              <Plus className="size-4" aria-hidden /> Adicionar item
            </Button>
          </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-2">
              <Label className="text-[13px]">Itens do pedido ({form.itens.length})</Label>
              {form.itens.length === 0 ? (
                <p className="rounded-lg border border-[#2A2721] bg-[#141310] p-6 text-center text-[14px] text-[#A09A8E]">
                  Nenhum item adicionado.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#2A2721]">
                  <table className="w-full min-w-[560px] border-collapse text-[14px]">
                    <thead>
                      <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[12px] uppercase tracking-wide text-[#C9C2B8]">
                        <th className="px-3 py-2">Insumo</th>
                        <th className="px-3 py-2">Quantidade</th>
                        <th className="px-3 py-2">Unidade</th>
                        <th className="px-3 py-2">Preço unitário</th>
                        <th className="px-3 py-2">Subtotal</th>
                        <th className="px-3 py-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A2721]">
                      {form.itens.map((i) => (
                        <tr key={i.id}>
                          <td className="px-3 py-2">{i.insumo}</td>
                          <td className="px-3 py-2">{i.quantidade}</td>
                          <td className="px-3 py-2">{i.unidade}</td>
                          <td className="px-3 py-2">{dinheiroPremium(i.preco_unitario)}</td>
                          <td className="px-3 py-2 font-semibold">{dinheiroPremium(i.quantidade * i.preco_unitario)}</td>
                          <td className="px-3 py-2 text-right">
                            <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, itens: f.itens.filter((x) => x.id !== i.id) }))} aria-label={`Remover ${i.insumo}`}>
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#D4A94A]/70 bg-[#1B1811] p-3">
              <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[#F2CE6B]">
                <ClipboardList className="size-4" aria-hidden /> Resumo do pedido
              </p>
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#A09A8E]">Itens</dt>
                  <dd className="font-semibold text-[#F4F1EA]">{form.itens.length}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#A09A8E]">Quantidade total</dt>
                  <dd className="font-semibold text-[#F4F1EA]">
                    {form.itens.reduce((s, i) => s + i.quantidade, 0)}{" "}
                    {form.itens[0]?.unidade ?? "kg"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-[#2A2721] pt-2">
                  <dt className="text-[#A09A8E]">Valor total (fictício)</dt>
                  <dd className="text-[16px] font-bold text-[#F2CE6B]">
                    {dinheiroPremium(form.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0))}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <Button type="submit" className="erp-btn-gold min-h-10 w-full gap-2 text-[14px] font-semibold text-[#14120C]">
            <PackagePlus className="size-4" aria-hidden /> Criar rascunho fictício
          </Button>
        </form>
      </PremiumSection>

      <div className="grid gap-4 lg:grid-cols-2">
        {foco ? (
          <PremiumSection
            icone={PackageCheck}
            titulo="Recebimento e acompanhamento"
            subtitulo={`${foco.codigo} · controle de recebimento de insumos (demonstração).`}
            acoes={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tom={TOM_STATUS[foco.status]}>{STATUS_COMPRA_PREMIUM_DEMO[foco.status]}</StatusBadge>
                {foco.status === "rascunho" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => marcarEnviada(foco)}>
                    <Send className="size-4" aria-hidden /> Simular envio
                  </Button>
                ) : null}
              </div>
            }
            bodyClassName="p-3"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[12px] uppercase tracking-wide text-[#C9C2B8]">
                    <th className="px-3 py-2">Insumo</th>
                    <th className="px-3 py-2">Pedido</th>
                    <th className="px-3 py-2">Recebido</th>
                    <th className="px-3 py-2">Saldo</th>
                    <th className="px-3 py-2">Qtd. a receber</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2721]">
                  {foco.itens.map((i) => {
                    const saldo = Math.max(0, i.quantidade - i.recebido);
                    return (
                      <tr key={i.id}>
                        <td className="px-3 py-3">{i.insumo}</td>
                        <td className="px-3 py-3">{i.quantidade} {i.unidade}</td>
                        <td className="px-3 py-3">{i.recebido} {i.unidade}</td>
                        <td className="px-3 py-3">{saldo} {i.unidade}</td>
                        <td className="px-3 py-3">
                          <Input
                            type="number"
                            min={0}
                            max={saldo}
                            value={recebimentos[i.id] ?? ""}
                            onChange={(e) => setRecebimentos((r) => ({ ...r, [i.id]: e.target.value }))}
                            disabled={saldo === 0}
                            className="h-9 w-24 text-[14px]"
                            aria-label={`Quantidade a receber de ${i.insumo}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={saldo === 0} onClick={() => registrarRecebimento(foco, i, false)}>
                              Parcial
                            </Button>
                            <Button type="button" size="sm" className="erp-btn-gold text-[13px] font-semibold text-[#14120C]" disabled={saldo === 0} onClick={() => registrarRecebimento(foco, i, true)}>
                              <PackageCheck className="size-4" aria-hidden /> Total
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { rotulo: "Itens do pedido", valor: `${foco.itens.length}` },
                { rotulo: "Saldo pendente", valor: `${impacto.unidades} un` },
                { rotulo: "Valor a receber", valor: dinheiroPremium(impacto.valor) },
              ].map((s) => (
                <div key={s.rotulo} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                  <p className="text-[11px] text-[#A09A8E]">{s.rotulo}</p>
                  <p className="text-[15px] font-bold text-[#F4F1EA]">{s.valor}</p>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#F4F1EA]">
                <History className="size-4 text-[#F2CE6B]" aria-hidden /> Acompanhamento
              </p>
              <div className="space-y-1.5">
                {foco.historico.map((h, i) => (
                  <div key={i} className="flex gap-2 text-[12px] leading-snug text-[#C9C2B8]">
                    <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#35C97C]" aria-hidden />
                    <span>
                      <span className="font-semibold text-[#F4F1EA]">{h.data} · </span>{h.evento}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </PremiumSection>
        ) : null}

        <div className="space-y-4">
          <PremiumSection
            icone={Calculator}
            titulo="Impacto futuro demonstrativo"
            subtitulo="Simulação visual; nada é movimentado."
            bodyClassName="p-3"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { titulo: "Estoque", valor: `${impacto.unidades} un`, detalhe: "entradas previstas", icone: Boxes, cor: ERP_COLORS.blue },
                { titulo: "Financeiro", valor: dinheiroPremium(impacto.valor), detalhe: "compromisso estimado", icone: CircleDollarSign, cor: ERP_COLORS.goldStrong },
                { titulo: "Precificação", valor: dinheiroPremium(impacto.unitario), detalhe: "custo projetado / un", icone: Calculator, cor: ERP_COLORS.orange },
              ].map((k) => (
                <div key={k.titulo} className="rounded-lg border border-[#2A2721] bg-[#141310] p-2.5">
                  <div className="flex items-center gap-1.5 text-[12px] text-[#A09A8E]">
                    <k.icone className="size-3.5" style={{ color: k.cor }} aria-hidden /> {k.titulo}
                  </div>
                  <p className="mt-1 truncate font-display text-[16px] font-bold text-[#F4F1EA]">{k.valor}</p>
                  <p className="text-[11px] text-[#C9C2B8]">{k.detalhe}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-[#A09A8E]">
              Nenhuma movimentação de estoque, lançamento financeiro ou alteração de preço é realizada.
            </p>
          </PremiumSection>

          <PremiumSection
            icone={AlertTriangle}
            titulo="Sugestões de reposição"
            subtitulo="Itens com estoque abaixo do mínimo (simulação)."
            bodyClassName="p-3"
          >
            <div className="space-y-2">
              {REPOSICAO_PREMIUM_DEMO.map((s) => (
                <div key={s.insumo} className="flex flex-wrap items-start gap-2 rounded-lg border border-[#2A2721] bg-[#141310] p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#F5A623]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[#F4F1EA]">{s.insumo}</p>
                    <p className="text-[12px] leading-snug text-[#A09A8E]">
                      Estoque {s.estoque} {s.unidade} · mínimo {s.minimo} {s.unidade} · sugerido {s.sugerido} {s.unidade} · {s.fornecedor}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => aplicarSugestao(s)}>
                    Carregar no pedido
                  </Button>
                </div>
              ))}
            </div>
          </PremiumSection>
        </div>
      </div>
    </div>
  );
}
