import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  History,
  Lightbulb,
  LockKeyhole,
  Pencil,
  Plus,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { ehModoDemo } from "@/lib/demo-preview";
import { logAdmin } from "@/lib/operacao";
import {
  ERP_COLORS,
  PremiumDemoBadge,
  PremiumKpi,
  PremiumPageHeader,
  PremiumSection,
  StatusBadge,
} from "@/components/admin/erp-ui";

/**
 * H13 — Cupons e Promoções Premium (homologação visual).
 * Reaproveita a tabela `cupons` e as regras de validação existentes.
 * Nenhuma campanha é publicada automaticamente; a integração com C5 é apenas
 * um atalho visual para a suíte Comercial aprovada.
 */

type TipoCupom = "percentual" | "valor";

type CupomNormalizado = {
  id: string;
  codigo: string;
  descricao: string;
  tipo: TipoCupom;
  valor: number;
  minimo: number;
  maxDesconto: number;
  ativo: boolean;
  usos: number;
  maxUsos: number;
  descontoTotal: number;
  vendasTotal: number;
  inicio: string;
  fim: string;
  cliente: string;
  produtosIds: string[];
};

type Formulario = {
  id?: string;
  codigo: string;
  tipo: TipoCupom;
  valor: string;
  minimo: string;
  maxDesconto: string;
  maxUsos: string;
  inicio: string;
  fim: string;
  cliente: string;
  produtosIds: string[];
};

const FORM_VAZIO: Formulario = {
  codigo: "",
  tipo: "percentual",
  valor: "10",
  minimo: "0",
  maxDesconto: "0",
  maxUsos: "0",
  inicio: "",
  fim: "",
  cliente: "",
  produtosIds: [],
};

const CLIENTES_DEMO = [
  { telefone: "", nome: "Todos os clientes (demonstração)" },
  { telefone: "11900000001", nome: "Cliente fictício · 11 90000-0001" },
  { telefone: "11900000002", nome: "Cliente fictício · 11 90000-0002" },
];

/** Custos fictícios apenas para demonstrar margem validada/não validada. */
const CUSTOS_DEMO: Record<string, number> = {
  "00000000-0000-4000-8000-000000000001": 2.56,
};

const SUGESTOES = [
  {
    titulo: "Reativar 30–59 dias",
    detalhe: "Cupom de 10% com mínimo de R$ 40 e teto de R$ 12.",
    codigo: "VOLTA10",
    tipo: "percentual" as TipoCupom,
    valor: "10",
    minimo: "40",
    maxDesconto: "12",
  },
  {
    titulo: "Ticket médio baixo",
    detalhe: "R$ 5 fixos acima de R$ 80 para elevar o valor do pedido.",
    codigo: "FESTA5",
    tipo: "valor" as TipoCupom,
    valor: "5",
    minimo: "80",
    maxDesconto: "5",
  },
  {
    titulo: "Clientes VIP",
    detalhe: "15% com limite de 20 usos e aprovação administrativa.",
    codigo: "VIP15",
    tipo: "percentual" as TipoCupom,
    valor: "15",
    minimo: "60",
    maxDesconto: "20",
  },
];

function dinheiro(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function inteiro(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return Math.round(valor).toLocaleString("pt-BR");
}

function normalizar(row: any): CupomNormalizado {
  const tipo: TipoCupom = row?.tipo === "valor" ? "valor" : "percentual";
  const valor = Number(
    tipo === "percentual" ? (row?.valor ?? row?.percentual ?? 0) : (row?.valor ?? 0),
  ) || 0;
  return {
    id: String(row?.id ?? Math.random().toString(36).slice(2)),
    codigo: String(row?.codigo ?? "SEM-CODIGO"),
    descricao: String(row?.descricao ?? "Cupom demonstrativo"),
    tipo,
    valor,
    minimo: Number(row?.minimo ?? 0) || 0,
    maxDesconto: Number(row?.max_desconto ?? 0) || 0,
    ativo: Boolean(row?.ativo),
    usos: Number(row?.usos ?? 0) || 0,
    maxUsos: Number(row?.max_usos ?? 0) || 0,
    descontoTotal: Number(row?.desconto_total ?? 0) || 0,
    vendasTotal: Number(row?.vendas_total ?? 0) || 0,
    inicio: String(row?.validade_ini ?? ""),
    fim: String(row?.validade_fim ?? ""),
    cliente: String(row?.cliente_telefone ?? ""),
    produtosIds: Array.isArray(row?.produtos_ids) ? row.produtos_ids.map(String) : [],
  };
}

function periodo(c: CupomNormalizado): string {
  const ini = c.inicio ? new Date(c.inicio).toLocaleDateString("pt-BR") : "livre";
  const fim = c.fim ? new Date(c.fim).toLocaleDateString("pt-BR") : "sem fim";
  return `${ini} → ${fim}`;
}

function descontoRotulo(c: CupomNormalizado): string {
  if (c.tipo === "percentual") {
    return `${c.valor}%${c.maxDesconto > 0 ? ` · teto ${dinheiro(c.maxDesconto)}` : ""}`;
  }
  return `${dinheiro(c.valor)} fixo`;
}

export function CuponsPremium({
  cupons,
  produtos,
  onChange,
}: {
  cupons: any[];
  produtos: any[];
  onChange: () => void;
}) {
  const modoDemo = ehModoDemo();
  const [locais, setLocais] = useState<CupomNormalizado[] | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [produtoAnalise, setProdutoAnalise] = useState("");
  const [cupomAnalise, setCupomAnalise] = useState("");

  const linhas = useMemo(
    () => (locais ?? (cupons ?? []).map(normalizar)),
    [locais, cupons],
  );

  const produtosValidos = useMemo(
    () => (produtos ?? []).filter((p) => p?.id && p?.nome),
    [produtos],
  );

  const produtoSelecionado =
    produtosValidos.find((p) => String(p.id) === produtoAnalise) ?? produtosValidos[0] ?? null;
  const cupomSelecionado =
    linhas.find((c) => c.id === cupomAnalise) ?? linhas.find((c) => c.ativo) ?? linhas[0] ?? null;

  const kpis = useMemo(() => {
    const ativos = linhas.filter((c) => c.ativo).length;
    const utilizacoes = linhas.reduce((s, c) => s + c.usos, 0);
    const descontos = linhas.reduce((s, c) => s + c.descontoTotal, 0);
    const vendas = linhas.reduce((s, c) => s + c.vendasTotal, 0);
    return { ativos, utilizacoes, descontos, vendas };
  }, [linhas]);

  const precoOriginal = Number(produtoSelecionado?.preco ?? 0) || 0;
  const custoUnitario = produtoSelecionado
    ? produtoSelecionado.custo_medio ??
      produtoSelecionado.custo ??
      (modoDemo ? CUSTOS_DEMO[String(produtoSelecionado.id)] : undefined) ??
      null
    : null;
  const custoValido = custoUnitario != null && Number.isFinite(Number(custoUnitario));
  const desconto = cupomSelecionado
    ? cupomSelecionado.tipo === "percentual"
      ? Math.min(
          precoOriginal * (cupomSelecionado.valor / 100),
          cupomSelecionado.maxDesconto > 0 ? cupomSelecionado.maxDesconto : Infinity,
        )
      : Math.min(cupomSelecionado.valor, cupomSelecionado.maxDesconto > 0 ? cupomSelecionado.maxDesconto : Infinity)
    : 0;
  const precoFinal = Math.max(0, precoOriginal - desconto);
  const margem = custoValido && precoFinal > 0 ? ((precoFinal - Number(custoUnitario)) / precoFinal) * 100 : null;
  const margemInsuficiente = margem != null && margem < 15;

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = form.codigo.trim().toUpperCase();
    if (!codigo) {
      toast.error("Informe o código do cupom.");
      return;
    }
    if (modoDemo) {
      const existente = linhas.find((c) => c.codigo === codigo && c.id !== form.id);
      if (existente) {
        toast.error("Código já existe na demonstração.");
        return;
      }
      const registro: CupomNormalizado = {
        id: form.id ?? `demo-${codigo}-${Date.now()}`,
        codigo,
        descricao: form.id ? "Cupom fictício editado" : "Cupom fictício criado",
        tipo: form.tipo,
        valor: Number(form.valor) || 0,
        minimo: Number(form.minimo) || 0,
        maxDesconto: Number(form.maxDesconto) || 0,
        ativo: false,
        usos: linhas.find((c) => c.id === form.id)?.usos ?? 0,
        maxUsos: Number(form.maxUsos) || 0,
        descontoTotal: linhas.find((c) => c.id === form.id)?.descontoTotal ?? 0,
        vendasTotal: linhas.find((c) => c.id === form.id)?.vendasTotal ?? 0,
        inicio: form.inicio,
        fim: form.fim,
        cliente: form.cliente,
        produtosIds: form.produtosIds,
      };
      setLocais((prev) => {
        const base = prev ?? linhas;
        return form.id ? base.map((c) => (c.id === form.id ? registro : c)) : [...base, registro];
      });
      toast.success(
        form.id
          ? "Cupom fictício atualizado. Nenhuma promoção foi publicada."
          : "Cupom fictício criado como rascunho. Ativação manual.",
      );
      setForm(FORM_VAZIO);
      return;
    }

    const payload: Record<string, any> = {
      codigo,
      tipo: form.tipo,
      valor: Number(form.valor) || 0,
      minimo: Number(form.minimo) || 0,
      max_desconto: Number(form.maxDesconto) || 0,
      ativo: false,
      cliente_telefone: form.cliente.replace(/\D/g, ""),
      validade_ini: form.inicio || null,
      validade_fim: form.fim || null,
      max_usos: Number(form.maxUsos) || 0,
      produtos_ids: form.produtosIds,
    };
    let { error } = form.id
      ? await supabase.from("cupons").update(payload).eq("id", form.id)
      : await supabase.from("cupons").insert(payload);
    if (error && String(error.message ?? "").includes("column")) {
      const {
        max_desconto: _max,
        cliente_telefone: _cliente,
        validade_ini: _ini,
        validade_fim: _fim,
        max_usos: _usos,
        produtos_ids: _produtos,
        ...legado
      } = payload;
      const retry = form.id
        ? await supabase.from("cupons").update(legado).eq("id", form.id)
        : await supabase.from("cupons").insert(legado);
      error = retry.error;
      if (!error) toast.error("Salvo sem personalização — rode a migração 0006.");
    }
    if (error) {
      toast.error("Não foi possível salvar o cupom.");
      return;
    }
    void logAdmin(form.id ? "cupom_alterado" : "cupom_criado", codigo);
    toast.success(form.id ? "Cupom atualizado como rascunho." : "Cupom criado como rascunho.");
    setForm(FORM_VAZIO);
    onChange();
  }

  function alternar(c: CupomNormalizado) {
    if (modoDemo) {
      setLocais((prev) =>
        (prev ?? linhas).map((item) => (item.id === c.id ? { ...item, ativo: !item.ativo } : item)),
      );
      toast.success(c.ativo ? "Cupom desativado na demonstração." : "Cupom ativado manualmente na demonstração.");
      return;
    }
    void supabase.from("cupons").update({ ativo: !c.ativo }).eq("id", c.id).then(() => onChange());
  }

  function editar(c: CupomNormalizado) {
    setForm({
      id: c.id,
      codigo: c.codigo,
      tipo: c.tipo,
      valor: String(c.valor),
      minimo: String(c.minimo),
      maxDesconto: String(c.maxDesconto),
      maxUsos: String(c.maxUsos),
      inicio: c.inicio,
      fim: c.fim,
      cliente: c.cliente,
      produtosIds: c.produtosIds,
    });
  }

  function aplicarSugestao(s: (typeof SUGESTOES)[number]) {
    setForm({
      ...FORM_VAZIO,
      codigo: s.codigo,
      tipo: s.tipo,
      valor: s.valor,
      minimo: s.minimo,
      maxDesconto: s.maxDesconto,
      maxUsos: "20",
    });
    toast.info("Sugestão carregada no formulário. Nenhuma promoção foi publicada.");
  }

  return (
    <div className="space-y-5 pb-28">
      <PremiumPageHeader
        icone={Tag}
        titulo="Cupons e Promoções Premium"
        subtitulo={
          modoDemo
            ? "Homologação visual do módulo · dados fictícios de demonstração · sem publicação automática"
            : "Gestão de cupons, análise de margem e histórico"
        }
        demo={modoDemo}
        status={<PremiumDemoBadge>{modoDemo ? "Demonstração isolada" : "Operacional"}</PremiumDemoBadge>}
        acoes={
          <Link
            to="/preview/comercial/resultados"
            className="erp-btn-gold inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#D4A94A] px-3 text-[13px] font-semibold text-[#14120C]"
          >
            <BarChart3 className="size-4" aria-hidden /> Ver resultados C5
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { rotulo: "Cupons ativos", valor: inteiro(kpis.ativos), detalhe: `${linhas.length} cadastrados`, icone: CheckCircle2, cor: ERP_COLORS.green },
          { rotulo: "Utilizações", valor: inteiro(kpis.utilizacoes), detalhe: "somando cupons fictícios", icone: Users, cor: ERP_COLORS.blue },
          { rotulo: "Descontos concedidos", valor: dinheiro(kpis.descontos), detalhe: "estimativa demonstrativa", icone: Tag, cor: ERP_COLORS.goldStrong },
          { rotulo: "Vendas associadas", valor: dinheiro(kpis.vendas), detalhe: "estimativa demonstrativa", icone: TrendingUp, cor: ERP_COLORS.orange },
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
        icone={Tag}
        titulo={form.id ? "Editar cupom" : "Criar cupom"}
        subtitulo={
          form.id
            ? "Atualize o rascunho do cupom; a ativação continua manual."
            : "Cadastre um novo cupom de desconto ou promoção."
        }
        acoes={
          form.id ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setForm(FORM_VAZIO)}>
              Cancelar edição
            </Button>
          ) : null
        }
      >
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[13px]">
              Código <span className="text-[#F2CE6B]">*</span>
            </Label>
            <Input
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              placeholder="EX.: VOLTA10"
              maxLength={20}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">
              Tipo de desconto <span className="text-[#F2CE6B]">*</span>
            </Label>
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoCupom }))}
              className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[15px] text-[#F4F1EA]"
            >
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor fixo (R$)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">
              {form.tipo === "percentual" ? "Percentual (%)" : "Valor (R$)"}{" "}
              <span className="text-[#F2CE6B]">*</span>
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Pedido mínimo (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.minimo}
              onChange={(e) => setForm((f) => ({ ...f, minimo: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Desconto máximo (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.maxDesconto}
              onChange={(e) => setForm((f) => ({ ...f, maxDesconto: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Limite de utilizações (0 = ilimitado)</Label>
            <Input
              type="number"
              min="0"
              value={form.maxUsos}
              onChange={(e) => setForm((f) => ({ ...f, maxUsos: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Válido de</Label>
            <Input
              type="datetime-local"
              value={form.inicio}
              onChange={(e) => setForm((f) => ({ ...f, inicio: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Válido até</Label>
            <Input
              type="datetime-local"
              value={form.fim}
              onChange={(e) => setForm((f) => ({ ...f, fim: e.target.value }))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[13px]">Cliente elegível</Label>
            <select
              value={form.cliente}
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
              className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[15px] text-[#F4F1EA]"
            >
              {CLIENTES_DEMO.map((c) => (
                <option key={c.telefone} value={c.telefone}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[13px]">Produtos elegíveis</Label>
            <div className="h-[110px] overflow-y-auto rounded-md border border-[#D4A94A]/40 bg-[#141310] p-2">
              {produtosValidos.length === 0 ? (
                <p className="text-[13px] text-[#A09A8E]">Nenhum produto disponível.</p>
              ) : (
                produtosValidos.map((p) => (
                  <label key={p.id} className="flex min-h-8 items-center gap-2 text-[14px] text-[#C9C2B8]">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#D4A94A]"
                      checked={form.produtosIds.includes(String(p.id))}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          produtosIds: e.target.checked
                            ? [...f.produtosIds, String(p.id)]
                            : f.produtosIds.filter((id) => id !== String(p.id)),
                        }))
                      }
                    />
                    {p.nome}
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="flex items-end xl:col-span-4">
            <Button type="submit" className="erp-btn-gold min-h-10 w-full gap-2 text-[14px] font-semibold text-[#14120C]">
              <Plus className="size-4" aria-hidden />
              {form.id ? "Salvar alterações" : "Criar cupom como rascunho"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-[13px] leading-snug text-[#A09A8E]">
          Cupons criados ou editados ficam como rascunho. A ativação é manual na lista abaixo;
          nenhuma promoção é publicada automaticamente.
        </p>
      </PremiumSection>

      <PremiumSection
        icone={LockKeyhole}
        titulo={`Lista de cupons · ${linhas.length}`}
        subtitulo="Cupons cadastrados no ambiente de demonstração."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[12px] uppercase tracking-wide text-[#C9C2B8]">
                <th className="px-3 py-2.5">Código</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Desconto</th>
                <th className="px-3 py-2.5">Período</th>
                <th className="px-3 py-2.5">Usos</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2721]">
              {linhas.map((c) => (
                <tr key={c.id} className="hover:bg-[#211F18]">
                  <td className="px-3 py-3">
                    <div className="font-bold text-[#F2CE6B]">{c.codigo}</div>
                    <div className="text-[13px] text-[#A09A8E]">{c.descricao}</div>
                  </td>
                  <td className="px-2 py-3">{c.tipo === "percentual" ? "Percentual" : "Valor fixo"}</td>
                  <td className="px-2 py-3">
                    <div>{descontoRotulo(c)}</div>
                    <div className="text-[13px] text-[#A09A8E]">mín. {dinheiro(c.minimo)}</div>
                  </td>
                  <td className="px-2 py-3 text-[13px] text-[#C9C2B8]">{periodo(c)}</td>
                  <td className="px-2 py-3">
                    {c.usos}
                    {c.maxUsos > 0 ? ` / ${c.maxUsos}` : " / livre"}
                  </td>
                  <td className="px-2 py-3">
                    <StatusBadge tom={c.ativo ? "ok" : "atencao"}>
                      {c.ativo ? "Ativo" : "Rascunho"}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Switch checked={c.ativo} onCheckedChange={() => alternar(c)} aria-label={`Ativar ${c.codigo}`} />
                      <Button type="button" variant="outline" size="sm" onClick={() => editar(c)} aria-label={`Editar ${c.codigo}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setForm((f) => ({ ...f, codigo: `${c.codigo}-COPIA` }));
                          toast.info("Código copiado para o formulário.");
                        }}
                        aria-label={`Copiar ${c.codigo}`}
                      >
                        <Copy className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhas.length === 0 ? (
            <p className="px-3 py-6 text-center text-[14px] text-[#A09A8E]">Nenhum cupom cadastrado.</p>
          ) : null}
        </div>
      </PremiumSection>

      <div className="grid gap-4 xl:grid-cols-3">
        <PremiumSection
          icone={BarChart3}
          titulo="Análise de rentabilidade"
          subtitulo="Simulação visual e isolada por produto e cupom."
          bodyClassName="p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[12px]">Produto</Label>
              <select
                value={produtoAnalise || String(produtoSelecionado?.id ?? "")}
                onChange={(e) => setProdutoAnalise(e.target.value)}
                className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[14px] text-[#F4F1EA]"
              >
                {produtosValidos.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[12px]">Cupom aplicado</Label>
              <select
                value={cupomAnalise || String(cupomSelecionado?.id ?? "")}
                onChange={(e) => setCupomAnalise(e.target.value)}
                className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[14px] text-[#F4F1EA]"
              >
                {linhas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} · {descontoRotulo(c)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["Preço original", dinheiro(precoOriginal)],
              ["Custo estimado", custoValido ? dinheiro(Number(custoUnitario)) : "Não validado"],
              ["Desconto", dinheiro(desconto)],
              ["Preço final", dinheiro(precoFinal)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
                <p className="text-[12px] text-[#A09A8E]">{rotulo}</p>
                <p className="text-[16px] font-bold text-[#F4F1EA]">{valor}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2">
            <p className="text-[12px] text-[#A09A8E]">Margem estimada</p>
            <p
              className={`text-[16px] font-bold ${
                margem == null ? "text-[#F5A623]" : margemInsuficiente ? "text-[#F16A6A]" : "text-[#35C97C]"
              }`}
            >
              {margem == null ? "Margem não validada" : `${margem.toFixed(1)}%`}
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {margem == null ? (
              <div className="flex gap-2 rounded-lg border border-[#F5A623]/60 bg-[#F5A623]/10 p-2.5 text-[12px] leading-snug text-[#F5C46B]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Margem não validada: o produto selecionado não possui custo confiável na demonstração.
              </div>
            ) : margemInsuficiente ? (
              <div className="flex gap-2 rounded-lg border border-[#F16A6A]/60 bg-[#F16A6A]/10 p-2.5 text-[12px] leading-snug text-[#F16A6A]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Margem insuficiente: o desconto simulado deixa a operação abaixo de 15%.
              </div>
            ) : (
              <div className="flex gap-2 rounded-lg border border-[#35C97C]/60 bg-[#35C97C]/10 p-2.5 text-[12px] leading-snug text-[#35C97C]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                Margem saudável na simulação demonstrativa.
              </div>
            )}
            <p className="text-[12px] leading-snug text-[#A09A8E]">
              A análise é visual e isolada: não altera preços reais, não aplica descontos em pedidos
              e não publica campanhas.
            </p>
            <Link
              to="/preview/comercial/resultados"
              className="erp-btn-gold inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#D4A94A] px-3 text-[12px] font-semibold text-[#14120C]"
            >
              <BarChart3 className="size-4" aria-hidden /> Abrir Resultados C5
            </Link>
          </div>
        </PremiumSection>

        <PremiumSection
          icone={Lightbulb}
          titulo="Sugestões inteligentes"
          subtitulo="Ideias de ofertas baseadas em boas práticas."
          bodyClassName="p-3"
        >
          <div className="space-y-2.5">
            {SUGESTOES.map((s) => (
              <div
                key={s.codigo}
                className="flex items-start gap-2 rounded-lg border border-[#2A2721] bg-[#141310] p-3"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-[#D4A94A]/60 bg-[#1A1712]">
                  <Lightbulb className="size-3.5 text-[#F2CE6B]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#F4F1EA]">{s.titulo}</p>
                  <p className="text-[12px] leading-snug text-[#A09A8E]">{s.detalhe}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={() => aplicarSugestao(s)}
                >
                  Usar ideia
                </Button>
              </div>
            ))}
          </div>
        </PremiumSection>

        <PremiumSection
          icone={Clock3}
          titulo="Histórico e resultados"
          subtitulo="Principais eventos e vigências dos cupons."
          bodyClassName="p-3"
        >
          <div className="space-y-2.5">
            {[
              { icone: Clock3, texto: "DEMO10 · 18 utilizações simuladas em novembro/2026." },
              { icone: CalendarDays, texto: "FESTA5 · vigência fictícia até 15/12/2026." },
              { icone: History, texto: "VOLTA15 · criado como rascunho, aguardando ativação manual." },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-[#2A2721] bg-[#141310] p-3 text-[12px] leading-snug text-[#C9C2B8]"
              >
                <item.icone className="mt-0.5 size-4 shrink-0 text-[#F2CE6B]" aria-hidden />
                {item.texto}
              </div>
            ))}
            <p className="text-[12px] leading-snug text-[#A09A8E]">
              Este histórico é fictício. Campanhas reais e rentabilidade agregada permanecem apenas
              na suíte Comercial C5.
            </p>
          </div>
        </PremiumSection>
      </div>
    </div>
  );
}
