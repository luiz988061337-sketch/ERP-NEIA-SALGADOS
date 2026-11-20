import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  History,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ERP_COLORS,
  PremiumDemoBadge,
  PremiumKpi,
  PremiumPageHeader,
  PremiumSection,
  StatusBadge,
} from "@/components/admin/erp-ui";
import {
  FORNECEDORES_PREMIUM_DEMO,
  type FornecedorPremiumDemo,
} from "@/lib/estoque-premium-demo";
import { ehModoDemo } from "@/lib/demo-preview";

/** H18-A — Fornecedores Premium. Apenas dados fictícios e estado local. */
type FormFornecedor = {
  id?: string;
  nome: string;
  cnpj: string;
  contato: string;
  prazo: string;
  condicoes: string;
  categoria: string;
  ativo: boolean;
};

const FORM_VAZIO: FormFornecedor = {
  nome: "",
  cnpj: "",
  contato: "",
  prazo: "7",
  condicoes: "7 dias · boleto fictício",
  categoria: "Insumos secos",
  ativo: true,
};

type Filtro = "todos" | "ativo" | "inativo" | "alerta";

export function FornecedoresPremium() {
  const modoDemo = ehModoDemo();
  const [fornecedores, setFornecedores] = useState<FornecedorPremiumDemo[]>(
    () => FORNECEDORES_PREMIUM_DEMO.map((f) => ({ ...f })),
  );
  const [form, setForm] = useState<FormFornecedor>(FORM_VAZIO);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const metricas = useMemo(() => {
    const ativos = fornecedores.filter((f) => f.ativo).length;
    const prazo = fornecedores.length
      ? fornecedores.reduce((s, f) => s + f.prazo_entrega_dias, 0) / fornecedores.length
      : 0;
    const alertas = fornecedores.filter(
      (f) => f.atrasos_recentes > 0 || f.aumento_pct > 0,
    ).length;
    const categorias = new Map<string, number>();
    fornecedores.forEach((f) => categorias.set(f.categoria, (categorias.get(f.categoria) ?? 0) + 1));
    const topCategoria = [...categorias.entries()].sort((a, b) => b[1] - a[1])[0];
    return { ativos, prazo, alertas, topCategoria };
  }, [fornecedores]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return fornecedores.filter((f) => {
      const texto = `${f.nome} ${f.cnpj} ${f.categoria} ${f.contato}`.toLocaleLowerCase("pt-BR");
      if (q && !texto.includes(q)) return false;
      if (filtro === "ativo") return f.ativo;
      if (filtro === "inativo") return !f.ativo;
      if (filtro === "alerta") return f.atrasos_recentes > 0 || f.aumento_pct > 0;
      return true;
    });
  }, [fornecedores, busca, filtro]);

  const historico = useMemo(
    () =>
      fornecedores
        .flatMap((f) => f.historico.map((h) => ({ ...h, nome: f.nome })))
        .slice(0, 8),
    [fornecedores],
  );

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Informe o nome do fornecedor fictício.");
      return;
    }
    const anterior = fornecedores.find((f) => f.id === form.id);
    const registro: FornecedorPremiumDemo = {
      id: form.id ?? `forn-demo-${Date.now()}`,
      nome,
      cnpj: form.cnpj.trim() || "00.000.000/0000-00",
      contato: form.contato.trim() || "(11) 90000-0000",
      prazo_entrega_dias: Math.max(1, Number(form.prazo) || 7),
      condicoes_pagamento: form.condicoes.trim() || "7 dias · boleto fictício",
      categoria: form.categoria.trim() || "Insumos secos",
      ativo: form.ativo,
      atrasos_recentes: anterior?.atrasos_recentes ?? 0,
      aumento_pct: anterior?.aumento_pct ?? 0,
      historico: anterior?.historico ?? [
        { data: "20/11/2026", evento: "Cadastro fictício criado no Preview." },
      ],
    };
    setFornecedores((prev) =>
      form.id ? prev.map((f) => (f.id === form.id ? registro : f)) : [...prev, registro],
    );
    setForm(FORM_VAZIO);
    toast.success(
      modoDemo
        ? "Fornecedor fictício salvo. Nenhum dado real foi alterado."
        : "Fornecedor salvo na demonstração local.",
    );
  }

  function editar(f: FornecedorPremiumDemo) {
    setForm({
      id: f.id,
      nome: f.nome,
      cnpj: f.cnpj,
      contato: f.contato,
      prazo: String(f.prazo_entrega_dias),
      condicoes: f.condicoes_pagamento,
      categoria: f.categoria,
      ativo: f.ativo,
    });
    toast.info("Fornecedor fictício carregado no formulário.");
  }

  function alternar(f: FornecedorPremiumDemo) {
    setFornecedores((prev) =>
      prev.map((item) => (item.id === f.id ? { ...item, ativo: !item.ativo } : item)),
    );
    toast.success(f.ativo ? "Fornecedor fictício pausado." : "Fornecedor fictício reativado.");
  }

  return (
    <div className="space-y-5 pb-28">
      <PremiumPageHeader
        icone={Building2}
        titulo="Fornecedores Premium"
        subtitulo="Homologação visual de fornecedores · dados fictícios · nenhum fornecedor real é consultado ou alterado"
        demo={modoDemo}
        status={<PremiumDemoBadge>{modoDemo ? "Demonstração isolada" : "Preview"}</PremiumDemoBadge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { rotulo: "Fornecedores", valor: String(fornecedores.length), detalhe: `${metricas.ativos} ativos`, icone: Building2, cor: ERP_COLORS.goldStrong },
          { rotulo: "Prazo médio", valor: `${metricas.prazo.toFixed(1)} dias`, detalhe: "prazo fictício", icone: Clock3, cor: ERP_COLORS.blue },
          { rotulo: "Alertas", valor: String(metricas.alertas), detalhe: "atraso ou aumento", icone: AlertTriangle, cor: ERP_COLORS.orange },
          { rotulo: "Categoria líder", valor: metricas.topCategoria?.[0] ?? "—", detalhe: `${metricas.topCategoria?.[1] ?? 0} fornecedor(es)`, icone: TrendingUp, cor: ERP_COLORS.green },
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
        icone={Plus}
        titulo={form.id ? "Editar fornecedor fictício" : "Cadastrar fornecedor fictício"}
        subtitulo="Dados de homologação visual; nada é gravado em banco real."
      >
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[13px]">Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="EX.: Fornecedor fictício (demo)" />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">CNPJ fictício</Label>
            <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Contato</Label>
            <Input value={form.contato} onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))} placeholder="(11) 90000-0000" />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Prazo de entrega (dias)</Label>
            <Input type="number" min={1} value={form.prazo} onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Categoria</Label>
            <Input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Condições de pagamento</Label>
            <Input value={form.condicoes} onChange={(e) => setForm((f) => ({ ...f, condicoes: e.target.value }))} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-3">
            <label className="flex items-center gap-2 text-[14px] text-[#C9C2B8]">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} aria-label="Fornecedor ativo" />
              Fornecedor ativo
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {form.id ? (
                <Button type="button" variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                  Cancelar edição
                </Button>
              ) : null}
              <Button type="submit" className="erp-btn-gold min-h-10 gap-2 text-[14px] font-semibold text-[#14120C]">
                <Plus className="size-4" aria-hidden /> {form.id ? "Salvar alterações" : "Adicionar fornecedor"}
              </Button>
            </div>
          </div>
        </form>
        <p className="mt-3 text-[13px] leading-snug text-[#A09A8E]">
          Cadastro local do Preview. Nenhuma tabela real é consultada, nenhum log operacional é gerado.
        </p>
      </PremiumSection>

      <PremiumSection
        icone={LockKeyhole}
        titulo={`Lista de fornecedores · ${filtrados.length}`}
        subtitulo="Busque e filtre os fornecedores fictícios da demonstração."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[#A09A8E]" aria-hidden />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar fornecedor"
                className="h-9 pl-8 text-[14px]"
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className="h-9 rounded-md border border-[#D4A94A]/50 bg-[#141310] px-2 text-[14px] text-[#F4F1EA]"
            >
              <option value="todos">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="alerta">Com alerta</option>
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-[12px] uppercase tracking-wide text-[#C9C2B8]">
                <th className="px-3 py-2.5">Fornecedor</th>
                <th className="px-3 py-2.5">Categoria</th>
                <th className="px-3 py-2.5">Prazo</th>
                <th className="px-3 py-2.5">Condições</th>
                <th className="px-3 py-2.5">Alertas</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2721]">
              {filtrados.map((f) => (
                <tr key={f.id} className="hover:bg-[#211F18]">
                  <td className="px-3 py-3">
                    <div className="font-bold text-[#F2CE6B]">{f.nome}</div>
                    <div className="text-[13px] text-[#A09A8E]">{f.cnpj} · {f.contato}</div>
                  </td>
                  <td className="px-3 py-3">{f.categoria}</td>
                  <td className="px-3 py-3">{f.prazo_entrega_dias} dias</td>
                  <td className="px-3 py-3 text-[13px] text-[#C9C2B8]">{f.condicoes_pagamento}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {f.atrasos_recentes > 0 ? (
                        <StatusBadge tom="atencao">Atraso ×{f.atrasos_recentes}</StatusBadge>
                      ) : null}
                      {f.aumento_pct > 0 ? (
                        <StatusBadge tom="perigo">Alta +{f.aumento_pct}%</StatusBadge>
                      ) : null}
                      {f.atrasos_recentes === 0 && f.aumento_pct === 0 ? (
                        <StatusBadge tom="ok">Sem alerta</StatusBadge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tom={f.ativo ? "ok" : "neutro"}>
                      {f.ativo ? "Ativo" : "Pausado"}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Switch checked={f.ativo} onCheckedChange={() => alternar(f)} aria-label={`Ativar ${f.nome}`} />
                      <Button type="button" variant="outline" size="sm" onClick={() => editar(f)} aria-label={`Editar ${f.nome}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length === 0 ? (
            <p className="px-3 py-6 text-center text-[14px] text-[#A09A8E]">Nenhum fornecedor fictício encontrado.</p>
          ) : null}
        </div>
      </PremiumSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <PremiumSection
          icone={History}
          titulo="Histórico comercial fictício"
          subtitulo="Eventos simulados da base demonstrativa."
          bodyClassName="p-3"
        >
          <div className="space-y-2">
            {historico.map((h, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-[#2A2721] bg-[#141310] p-3 text-[13px] leading-snug text-[#C9C2B8]">
                <History className="mt-0.5 size-4 shrink-0 text-[#F2CE6B]" aria-hidden />
                <div>
                  <span className="font-semibold text-[#F4F1EA]">{h.data} · </span>
                  {h.evento}
                  <div className="text-[12px] text-[#A09A8E]">{h.nome}</div>
                </div>
              </div>
            ))}
          </div>
        </PremiumSection>

        <PremiumSection
          icone={TrendingUp}
          titulo="Análise comercial demonstrativa"
          subtitulo="Leitura visual da base fictícia."
          bodyClassName="p-3"
        >
          <div className="space-y-2.5">
            {[
              { icone: CheckCircle2, titulo: "Prazo competitivo", texto: `Fornecedores ativos têm prazo médio de ${metricas.prazo.toFixed(1)} dias na simulação.`, cor: "35C97C" },
              { icone: AlertTriangle, titulo: "Atenção a aumentos", texto: `${metricas.alertas} fornecedor(es) com atraso ou aumento simulado exigem revisão comercial.`, cor: "F5A623" },
              { icone: TrendingUp, titulo: "Mix de fornecedores", texto: `Categoria com maior presença: ${metricas.topCategoria?.[0] ?? "—"} (${metricas.topCategoria?.[1] ?? 0}).`, cor: "5B93F5" },
            ].map((item) => (
              <div
                key={item.titulo}
                className="rounded-lg border bg-[#141310] p-3"
                style={{ borderColor: `#${item.cor}66` }}
              >
                <div className="flex items-start gap-2">
                  <item.icone className="mt-0.5 size-4 shrink-0" style={{ color: `#${item.cor}` }} aria-hidden />
                  <div>
                    <p className="text-[14px] font-semibold text-[#F4F1EA]">{item.titulo}</p>
                    <p className="text-[12px] leading-snug text-[#A09A8E]">{item.texto}</p>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[12px] leading-snug text-[#A09A8E]">
              Esta análise não consulta preços reais, contratos ou pedidos operacionais.
            </p>
          </div>
        </PremiumSection>
      </div>
    </div>
  );
}
