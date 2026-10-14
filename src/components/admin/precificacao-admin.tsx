import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";
import { converterUnidade } from "@/lib/insumos";
import {
  custoDireto,
  rateioFixoPorUnidade,
  precoSugerido,
  margemReal,
  seloMargem,
  custoKit,
  descontoEfetivoKit,
} from "@/lib/precificacao";

const SELO_COR: Record<string, string> = {
  prejuizo: "bg-red-100 text-red-800",
  margem_baixa: "bg-yellow-100 text-yellow-800",
  saudavel: "bg-green-100 text-green-800",
};

const SELO_LABEL: Record<string, string> = {
  prejuizo: "prejuízo",
  margem_baixa: "margem baixa",
  saudavel: "saudável",
};

/** Aba Precificação: custo real, margem, preço sugerido, simulador e kits. */
export function PrecificacaoAdmin() {
  const queryClient = useQueryClient();
  const [canal, setCanal] = useState("pix");
  const [margemSim, setMargemSim] = useState<Record<string, string>>({});
  const [kitIds, setKitIds] = useState<string[]>([]);
  const [kitEmbalagem, setKitEmbalagem] = useState("2");
  const [kitPreco, setKitPreco] = useState("");

  const { data: config } = useQuery({
    queryKey: ["precificacao-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("precificacao_config").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });

  const { data: produtos } = useQuery({
    queryKey: ["precificacao-produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, preco, preco_promocional, embalagem_custo, tempo_fritura_s, tempo_mao_obra_min")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: fichas } = useQuery({
    queryKey: ["precificacao-fichas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fichas_tecnicas").select("*, ficha_itens(*, insumos(custo_medio, unidade_base))");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const taxaCanal = useMemo(() => {
    if (!config) return 0;
    if (canal === "credito") return Number(config.taxa_credito_pct ?? 0);
    if (canal === "debito") return Number(config.taxa_debito_pct ?? 0);
    if (canal === "ifood") return Number(config.taxa_ifood_pct ?? 0);
    return Number(config.taxa_pix_pct ?? 0);
  }, [config, canal]);

  const linhas = useMemo(() => {
    if (!config || !produtos) return [];
    const fichaPorProduto = new Map((fichas ?? []).map((f: any) => [f.produto_id, f]));
    const rateio = rateioFixoPorUnidade(Number(config.custos_fixos_mensais ?? 0), Number(config.volume_mensal_estimado ?? 0));
    return produtos.map((p: any) => {
      const ficha = fichaPorProduto.get(p.id) as any;
      let custoInsumos = 0;
      let temFicha = false;
      if (ficha) {
        temFicha = true;
        for (const it of ficha.ficha_itens ?? []) {
          const base = converterUnidade(Number(it.quantidade), it.unidade, it.insumos?.unidade_base ?? it.unidade);
          if (base == null) continue;
          const qtd = (ficha.por_cento ? base / 100 : base) * (1 + Number(ficha.perda_pct ?? 0) / 100);
          custoInsumos += qtd * Number(it.insumos?.custo_medio ?? 0);
        }
      }
      const direto = custoDireto({
        custoInsumos,
        embalagem: Number(p.embalagem_custo ?? 0),
        tempoMaoObraMin: Number(p.tempo_mao_obra_min ?? 0.5),
        maoObraHora: Number(config.mao_obra_hora ?? 0),
        rendimento: Number(ficha?.rendimento ?? 1),
        tempoFrituraS: Number(p.tempo_fritura_s ?? 210),
        gasHora: Number(config.gas_hora ?? 0),
      });
      const total = direto + rateio;
      const precoAtual = Number(p.preco_promocional ?? p.preco ?? 0);
      const margemCfg = margemSim[p.id] !== undefined && margemSim[p.id] !== "" ? Number(margemSim[p.id]) : Number(config.margem_desejada_pct ?? 40);
      const sugerido = precoSugerido(total, margemCfg, taxaCanal);
      const margem = margemReal(precoAtual, total, taxaCanal);
      return { p, temFicha, custoInsumos, direto, total, precoAtual, margemCfg, sugerido, margem, selo: seloMargem(margem, Number(config.margem_baixa_pct ?? 15)) };
    });
  }, [config, produtos, fichas, taxaCanal, margemSim]);

  const kitInfo = useMemo(() => {
    const itens = linhas.filter((l) => kitIds.includes(l.p.id));
    if (itens.length === 0) return null;
    const custo = custoKit(itens.map((l) => l.direto), Number(kitEmbalagem) || 0);
    const avulsos = itens.reduce((s, l) => s + l.precoAtual, 0);
    const preco = Number(kitPreco) || 0;
    return { custo, avulsos, desconto: descontoEfetivoKit(preco, avulsos), qtd: itens.length };
  }, [linhas, kitIds, kitEmbalagem, kitPreco]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["precificacao-produtos"] });
  }

  async function salvarConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, number> = {};
    for (const k of ["margem_desejada_pct", "margem_baixa_pct", "mao_obra_hora", "gas_hora", "custos_fixos_mensais", "taxa_credito_pct", "taxa_debito_pct", "taxa_pix_pct", "taxa_ifood_pct"]) {
      body[k] = Number(f.get(k) ?? 0) || 0;
    }
    body["volume_mensal_estimado"] = Number(f.get("volume_mensal_estimado") ?? 0) || 1;
    const { error } = await supabase.from("precificacao_config").update({ ...body, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) {
      toast.error("Falha ao salvar. Rode a migration 0076.");
      return;
    }
    void logAdmin("precificacao_config", "parâmetros atualizados");
    toast.success("Configuração salva.");
    queryClient.invalidateQueries({ queryKey: ["precificacao-config"] });
  }

  async function aplicarPreco(l: (typeof linhas)[number]) {
    if (l.sugerido == null) return;
    if (!window.confirm(`Aplicar R$ ${l.sugerido.toFixed(2)} em ${l.p.nome}? (atual R$ ${l.precoAtual.toFixed(2)})`)) return;
    const { error: e1 } = await supabase.from("produtos").update({ preco: l.sugerido }).eq("id", l.p.id);
    if (e1) {
      toast.error("Falha ao aplicar preço.");
      return;
    }
    await supabase.from("preco_historico").insert({
      produto_id: l.p.id,
      preco_antigo: l.precoAtual,
      preco_novo: l.sugerido,
      motivo: `aplicar sugerido (margem ${l.margemCfg}%, canal ${canal})`,
    });
    void logAdmin("preco_aplicado", `${l.p.nome}: ${l.precoAtual} → ${l.sugerido}`);
    toast.success("Preço aplicado e registrado no histórico.");
    refresh();
  }

  if (!config) return <p className="text-sm text-muted-foreground">Carregando… (rode a migration 0076)</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Parâmetros</h2>
        <form onSubmit={salvarConfig} className="mt-3 grid gap-3 sm:grid-cols-3" key={config.updated_at}>
          <div className="space-y-1"><Label>Margem desejada (%)</Label><Input name="margem_desejada_pct" type="number" step="any" defaultValue={config.margem_desejada_pct} /></div>
          <div className="space-y-1"><Label>Margem baixa abaixo de (%)</Label><Input name="margem_baixa_pct" type="number" step="any" defaultValue={config.margem_baixa_pct} /></div>
          <div className="space-y-1"><Label>Mão de obra (R$/h)</Label><Input name="mao_obra_hora" type="number" step="any" defaultValue={config.mao_obra_hora} /></div>
          <div className="space-y-1"><Label>Gás/energia (R$/h fritura)</Label><Input name="gas_hora" type="number" step="any" defaultValue={config.gas_hora} /></div>
          <div className="space-y-1"><Label>Custos fixos mensais (R$)</Label><Input name="custos_fixos_mensais" type="number" step="any" defaultValue={config.custos_fixos_mensais} /></div>
          <div className="space-y-1"><Label>Volume mensal estimado (un)</Label><Input name="volume_mensal_estimado" type="number" defaultValue={config.volume_mensal_estimado} /></div>
          <div className="space-y-1"><Label>Taxa crédito (%)</Label><Input name="taxa_credito_pct" type="number" step="any" defaultValue={config.taxa_credito_pct} /></div>
          <div className="space-y-1"><Label>Taxa débito (%)</Label><Input name="taxa_debito_pct" type="number" step="any" defaultValue={config.taxa_debito_pct} /></div>
          <div className="space-y-1"><Label>Taxa Pix (%)</Label><Input name="taxa_pix_pct" type="number" step="any" defaultValue={config.taxa_pix_pct} /></div>
          <div className="space-y-1"><Label>Taxa iFood (%)</Label><Input name="taxa_ifood_pct" type="number" step="any" defaultValue={config.taxa_ifood_pct} /></div>
          <div className="sm:col-span-3"><Button type="submit">Salvar parâmetros</Button></div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl">Produtos</h2>
          <label className="ml-auto flex items-center gap-2 text-sm">
            Canal
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
              <option value="pix">Pix/balcão ({config.taxa_pix_pct}%)</option>
              <option value="debito">Débito ({config.taxa_debito_pct}%)</option>
              <option value="credito">Crédito ({config.taxa_credito_pct}%)</option>
              <option value="ifood">iFood ({config.taxa_ifood_pct}%)</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Rateio fixo atual: R$ {rateioFixoPorUnidade(Number(config.custos_fixos_mensais ?? 0), Number(config.volume_mensal_estimado ?? 0)).toFixed(2)}/un. Sem ficha, o custo de insumos é zero.</p>
        <ul className="mt-2 space-y-2">
          {linhas.map((l) => (
            <li key={l.p.id} className={`rounded border border-border p-3 ${l.selo === "prejuizo" ? "border-red-400" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{l.p.nome}</span>
                {!l.temFicha && <Badge variant="outline">sem ficha</Badge>}
                <Badge className={SELO_COR[l.selo]}>{SELO_LABEL[l.selo]}</Badge>
                <label className="ml-auto flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={kitIds.includes(l.p.id)} onChange={(e) => setKitIds(e.target.checked ? [...kitIds, l.p.id] : kitIds.filter((id) => id !== l.p.id))} /> kit
                </label>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground sm:grid-cols-4">
                <span>insumos R$ {l.custoInsumos.toFixed(2)}</span>
                <span>direto R$ {l.direto.toFixed(2)}</span>
                <span>total c/ rateio R$ {l.total.toFixed(2)}</span>
                <span>atual R$ {l.precoAtual.toFixed(2)} • margem {l.margem != null ? `${(l.margem * 100).toFixed(1)}%` : "—"}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs">margem sim. <Input className="h-7 w-16" type="number" step="any" value={margemSim[l.p.id] ?? ""} placeholder={String(config.margem_desejada_pct)} onChange={(e) => setMargemSim({ ...margemSim, [l.p.id]: e.target.value })} /> %</label>
                <span className="text-sm">sugerido: <b>{l.sugerido != null ? `R$ ${l.sugerido.toFixed(2)}` : "—"}</b></span>
                <Button size="sm" disabled={l.sugerido == null} onClick={() => aplicarPreco(l)}>Aplicar</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Simulador de kit</h2>
        <p className="text-xs text-muted-foreground">Marque “kit” nos produtos acima.</p>
        <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
          <div className="space-y-1"><Label>Embalagem do kit (R$)</Label><Input type="number" step="any" value={kitEmbalagem} onChange={(e) => setKitEmbalagem(e.target.value)} /></div>
          <div className="space-y-1"><Label>Preço do kit (R$)</Label><Input type="number" step="any" value={kitPreco} onChange={(e) => setKitPreco(e.target.value)} /></div>
          <div className="flex items-end">
            {kitInfo ? (
              <p>custo R$ {kitInfo.custo.toFixed(2)} • avulsos R$ {kitInfo.avulsos.toFixed(2)} • desconto efetivo <b>{kitInfo.desconto != null ? `${(kitInfo.desconto * 100).toFixed(1)}%` : "—"}</b></p>
            ) : (
              <p className="text-muted-foreground">Nenhum produto marcado.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
