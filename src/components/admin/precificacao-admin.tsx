import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Layers3,
  Package,
  Settings2,
  Target,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";
import { converterUnidade } from "@/lib/insumos";
import { ehModoDemo } from "@/lib/demo-preview";
import { ERP_COLORS, ModuleHeader, SectionCard } from "@/components/admin/erp-ui";
import {
  custoDireto,
  rateioFixoPorUnidade,
  precoSugerido,
  margemReal,
  seloMargem,
  custoKit,
  descontoEfetivoKit,
} from "@/lib/precificacao";

/**
 * H12 — Precificação Inteligente (homologação visual).
 * H12-B — apresentação da sincronização de custos fixos com o Financeiro Premium.
 * As fórmulas de src/lib/precificacao.ts permanecem inalteradas; nesta etapa
 * apenas a apresentação e a origem demonstrativa dos custos fixos mudam.
 */

/** Espelho demonstrativo do Financeiro Premium (Abril/2025). Nenhuma consulta
 * operacional é feita nesta fase: valores fictícios, identificados na tela. */
const FINANCEIRO_DEMO = {
  periodo: "Abril/2025",
  totalFixos: 14500,
  origem: "Financeiro Premium",
  linhas: [
    { descricao: "Aluguel", valor: 3500 },
    { descricao: "Equipe (demonstração mensal)", valor: 8700 },
    { descricao: "Energia e serviços (demonstração mensal)", valor: 2300 },
  ],
} as const;

const CANAIS: Record<string, string> = {
  pix: "Pix/balcão",
  debito: "Débito",
  credito: "Crédito",
  ifood: "iFood",
};

function dinheiro(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percentual(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(1)}%`;
}

function Etiqueta({
  tom = "neutro",
  children,
}: {
  tom?: "ok" | "atencao" | "perigo" | "neutro";
  children: ReactNode;
}) {
  const cores = {
    ok: { bg: "rgba(53,201,124,.16)", fg: ERP_COLORS.green },
    atencao: { bg: "rgba(245,166,35,.18)", fg: ERP_COLORS.orange },
    perigo: { bg: "rgba(241,106,106,.16)", fg: ERP_COLORS.red },
    neutro: { bg: "rgba(255,255,255,.06)", fg: ERP_COLORS.gray },
  }[tom];
  return (
    <span
      className="inline-flex min-h-[28px] items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-bold"
      style={{ backgroundColor: cores.bg, color: cores.fg, borderColor: `${cores.fg}66` }}
    >
      {children}
    </span>
  );
}

function CartaoResumo({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  alerta = false,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: string;
  icone: typeof Package;
  alerta?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[96px] items-center gap-4 rounded-xl border bg-[#17150F] p-4 shadow-card ${
        alerta ? "border-[#F16A6A]/60" : "border-[#D4A94A]"
      }`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#D4A94A]/60 bg-[#1A1712]">
        <Icone className="size-5" style={{ color: alerta ? ERP_COLORS.red : ERP_COLORS.goldStrong }} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#A09A8E]">{rotulo}</p>
        <p className={`truncate font-display text-[22px] font-bold leading-tight ${alerta ? "text-[#F16A6A]" : "text-[#F4F1EA]"}`}>
          {valor}
        </p>
        {detalhe ? <p className="mt-1 truncate text-[13px] text-[#C9C2B8]">{detalhe}</p> : null}
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  children,
  destaque = false,
  grande = false,
}: {
  rotulo: string;
  children: ReactNode;
  destaque?: boolean;
  grande?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold leading-snug text-[#A09A8E]">{rotulo}</p>
      <div
        className={`mt-1 leading-snug ${
          grande ? "font-display text-lg font-bold" : "text-[15px]"
        } ${destaque ? "text-[#F2CE6B]" : "text-[#F4F1EA]"}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Botão dourado local do módulo: mantém o comportamento, amplia a área útil. */
function BotaoGold({
  children,
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`erp-btn-gold inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] px-5 text-[15px] font-bold text-[#14120C] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/** Título de seção com tipografia H12-C (18–20 px, sem caixa alta forçada). */
function TituloSecao({ icone: Icone, children }: { icone: typeof Package; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2" style={{ fontSize: 18, textTransform: "none", letterSpacing: 0, lineHeight: 1.3 }}>
      <Icone className="size-[18px] shrink-0 text-[#F2CE6B]" aria-hidden />
      {children}
    </span>
  );
}

/** Aba Precificação: custo real, margem, preço sugerido, simulador e kits. */
export function PrecificacaoAdmin() {
  const queryClient = useQueryClient();
  const modoDemo = ehModoDemo();
  const [canal, setCanal] = useState("pix");
  const [margemSim, setMargemSim] = useState<Record<string, string>>({});
  const [kitIds, setKitIds] = useState<string[]>([]);
  const [kitEmbalagem, setKitEmbalagem] = useState("2");
  const [kitPreco, setKitPreco] = useState("");
  /** Simulação local do volume: nunca grava no Financeiro nem nos parâmetros. */
  const [volumeSim, setVolumeSim] = useState("");

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

  /** H12-B: na demonstração o Financeiro Premium fornece os fixos; na fase
   * funcional a integração real substituirá esta constante. */
  const custosFixos = modoDemo ? FINANCEIRO_DEMO.totalFixos : Number(config?.custos_fixos_mensais ?? 0);
  const fixosDisponiveis = custosFixos > 0;

  const volumeEfetivo = useMemo(() => {
    const atual = Number(config?.volume_mensal_estimado ?? 0);
    if (volumeSim.trim() === "") return atual;
    const simulado = Number(volumeSim);
    return Number.isFinite(simulado) && simulado > 0 ? simulado : atual;
  }, [config, volumeSim]);

  const rateio = rateioFixoPorUnidade(custosFixos, volumeEfetivo);

  const linhas = useMemo(() => {
    if (!config || !produtos) return [];
    const fichaPorProduto = new Map((fichas ?? []).map((f: any) => [f.produto_id, f]));
    return produtos.map((p: any) => {
      const ficha = fichaPorProduto.get(p.id) as any;
      let custoInsumosBase = 0;
      let custoPerdas = 0;
      let temFicha = false;
      if (ficha) {
        temFicha = true;
        for (const it of ficha.ficha_itens ?? []) {
          const base = converterUnidade(Number(it.quantidade), it.unidade, it.insumos?.unidade_base ?? it.unidade);
          if (base == null) continue;
          const quantidadeBase = ficha.por_cento ? base / 100 : base;
          const quantidadeComPerda = quantidadeBase * (1 + Number(ficha.perda_pct ?? 0) / 100);
          const custoUnitario = Number(it.insumos?.custo_medio ?? 0);
          custoInsumosBase += quantidadeBase * custoUnitario;
          custoPerdas += (quantidadeComPerda - quantidadeBase) * custoUnitario;
        }
      }
      const custoInsumos = custoInsumosBase + custoPerdas;
      const embalagem = Number(p.embalagem_custo ?? 0);
      const tempoMaoObraMin = Number(p.tempo_mao_obra_min ?? 0.5);
      const maoObraHora = Number(config.mao_obra_hora ?? 0);
      const gasHora = Number(config.gas_hora ?? 0);
      const tempoFrituraS = Number(p.tempo_fritura_s ?? 210);
      const rendimento = Number(ficha?.rendimento ?? 1);
      const rend = rendimento > 0 ? rendimento : 1;
      const maoObraUnit = (tempoMaoObraMin / 60) * maoObraHora / rend;
      const energiaUnit = (tempoFrituraS / 3600) * gasHora / rend;

      // Fórmula original preservada (src/lib/precificacao.ts).
      const direto = custoDireto({
        custoInsumos,
        embalagem,
        tempoMaoObraMin,
        maoObraHora,
        rendimento,
        tempoFrituraS,
        gasHora,
      });
      const total = direto + rateio;
      const precoAtual = Number(p.preco_promocional ?? p.preco ?? 0);
      const margemCfg = margemSim[p.id] !== undefined && margemSim[p.id] !== "" ? Number(margemSim[p.id]) : Number(config.margem_desejada_pct ?? 40);
      const margem = margemReal(precoAtual, total, taxaCanal);
      const taxaUnit = precoAtual * taxaCanal / 100;
      const lucroUnit = precoAtual - total - taxaUnit;
      const custoCompleto = temFicha && custoInsumos > 0 && embalagem > 0 && maoObraUnit > 0 && fixosDisponiveis;
      const sugerido = custoCompleto ? precoSugerido(total, margemCfg, taxaCanal) : null;
      const selo = custoCompleto ? seloMargem(margem, Number(config.margem_baixa_pct ?? 15)) : "pendente";
      return {
        p, temFicha, custoInsumosBase, custoPerdas, custoInsumos, embalagem,
        maoObraUnit, energiaUnit, taxaUnit, direto, total, rateio,
        precoAtual, margemCfg, sugerido, margem, lucroUnit, selo, custoCompleto,
      };
    });
  }, [config, produtos, fichas, taxaCanal, margemSim, rateio, fixosDisponiveis]);

  const kitInfo = useMemo(() => {
    const itens = linhas.filter((l) => kitIds.includes(l.p.id));
    if (itens.length === 0) return null;
    const custo = custoKit(itens.map((l) => l.direto), Number(kitEmbalagem) || 0);
    const avulsos = itens.reduce((s, l) => s + l.precoAtual, 0);
    const preco = Number(kitPreco) || 0;
    return { custo, avulsos, desconto: descontoEfetivoKit(preco, avulsos), qtd: itens.length };
  }, [linhas, kitIds, kitEmbalagem, kitPreco]);

  const totalPendencias = linhas.filter((l) => !l.custoCompleto).length;
  const totalCompletos = linhas.length - totalPendencias;

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
    toast.success(modoDemo ? "Configuração simulada (demonstração, sem dados reais)." : "Configuração salva.");
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
    toast.success(modoDemo ? "Preço simulado apenas na demonstração (dados fictícios)." : "Preço aplicado e registrado no histórico.");
    refresh();
  }

  if (!config) return <p className="text-[15px] text-muted-foreground">Carregando… (rode a migration 0076)</p>;

  return (
    <div className="space-y-5 pb-28 [&_h1]:!text-[26px] [&_h1+p]:!text-[14px] [&_h1+p]:whitespace-normal">
      <ModuleHeader
        icone={Calculator}
        titulo="Precificação Inteligente"
        subtitulo={
          modoDemo
            ? "Homologação visual • dados fictícios identificados • nenhuma alteração em banco real"
            : "Custos, margens, múltiplos de 50 e simuladores de preço"
        }
        status={
          <Etiqueta tom={modoDemo ? "atencao" : "ok"}>
            {modoDemo ? "Demonstração visual" : "Ambiente operacional"}
          </Etiqueta>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoResumo
          rotulo="Produtos analisados"
          valor={String(linhas.length)}
          detalhe="Catálogo em análise"
          icone={Package}
        />
        <CartaoResumo
          rotulo="Custos completos"
          valor={String(totalCompletos)}
          detalhe={`de ${linhas.length} produtos`}
          icone={CheckCircle2}
        />
        <CartaoResumo
          rotulo="Margem desejada"
          valor={percentual(Number(config.margem_desejada_pct ?? 0))}
          detalhe={`Canal: ${CANAIS[canal] ?? canal}`}
          icone={Target}
        />
        <CartaoResumo
          rotulo="Pendências"
          valor={String(totalPendencias)}
          detalhe="Preço não validado"
          icone={AlertTriangle}
          alerta={totalPendencias > 0}
        />
      </div>

      <SectionCard
        titulo={<TituloSecao icone={Wallet}>Sincronização de custos fixos — Financeiro Premium</TituloSecao>}
        acoes={
          <Etiqueta tom={modoDemo && fixosDisponiveis ? "ok" : "atencao"}>
            {modoDemo && fixosDisponiveis ? "Demonstrativo" : "Integração pendente"}
          </Etiqueta>
        }
        bodyClassName="p-4 sm:p-5"
      >
        {modoDemo && fixosDisponiveis ? (
          <>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Período de referência" grande>{FINANCEIRO_DEMO.periodo}</Campo>
              <Campo rotulo="Total de custos fixos" destaque grande>{dinheiro(FINANCEIRO_DEMO.totalFixos)}</Campo>
              <Campo rotulo="Origem dos dados" grande>{FINANCEIRO_DEMO.origem} (demonstrativo)</Campo>
              <div className="min-w-0">
                <Label className="text-[13px] font-semibold text-[#A09A8E]">
                  Volume mensal estimado (simulação local)
                </Label>
                <Input
                  className="mt-1 h-11 text-[15px]"
                  type="number"
                  min={1}
                  value={volumeSim}
                  placeholder={String(config.volume_mensal_estimado ?? 0)}
                  onChange={(e) => setVolumeSim(e.target.value)}
                />
              </div>
              <Campo rotulo="Rateio por unidade" grande>{dinheiro(rateio)}/un.</Campo>
              <Campo rotulo="Rateio caixa 50 / caixa 100" grande>
                {dinheiro(rateio * 50)} / {dinheiro(rateio * 100)}
              </Campo>
            </div>
            <div className="mt-4 rounded-lg border border-[#D4A94A]/30 bg-[#11100D] p-4">
              <p className="text-[15px] font-bold text-[#F2CE6B]">
                Composição dos fixos (Abril/2025 — fictícia)
              </p>
              <ul className="mt-3 grid gap-2 text-[15px] text-[#C9C2B8] sm:grid-cols-3">
                {FINANCEIRO_DEMO.linhas.map((item) => (
                  <li key={item.descricao} className="flex items-center justify-between gap-2">
                    <span>{item.descricao}</span>
                    <b className="text-[#F4F1EA]">{dinheiro(item.valor)}</b>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-4 border-t border-[#2A2721] pt-4 sm:grid-cols-3">
                <Campo rotulo="Fixos — incluídos no rateio" destaque grande>{dinheiro(FINANCEIRO_DEMO.totalFixos)}</Campo>
                <Campo rotulo="Variáveis / extraordinárias / taxas" grande>Não inclusas</Campo>
                <Campo rotulo="Energia e mão de obra" grande>Já no custo direto</Campo>
              </div>
            </div>
            <p className="mt-3 text-[14px] leading-snug text-[#A09A8E]">
              Fonte oficial: Financeiro Premium. Apenas despesas classificadas como fixas entram no rateio; variáveis,
              extraordinárias, taxas por transação e energia/mão de obra já incluídas no custo direto ficam de fora —
              sem dupla contagem. Alterar o volume acima é simulação local: não grava no Financeiro nem nos parâmetros.
              Fórmula: custos fixos mensais ÷ volume mensal estimado.
            </p>
            <p className="mt-2 text-[14px] leading-snug text-[#C9C2B8]">
              <b className="text-[#F2CE6B]">Pendência funcional:</b> verificar, na integração real, possível dupla
              contagem de mão de obra e energia entre os custos fixos e os custos diretos.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <p className="rounded-lg border border-[#F16A6A]/60 bg-[#F16A6A]/12 px-3 py-2 text-[15px] font-bold text-[#F16A6A]">
              Custos fixos não disponíveis
            </p>
            <p className="text-[14px] leading-snug text-[#C9C2B8]">
              A sincronização automática com o Financeiro Premium será habilitada na fase funcional. Valor zero não é
              considerado custo validado; os cálculos seguem usando temporariamente o parâmetro de custos fixos existente.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        titulo={<TituloSecao icone={Settings2}>Parâmetros operacionais</TituloSecao>}
        acoes={<Etiqueta tom="neutro">{modoDemo ? "Edição simulada" : "Edição operacional"}</Etiqueta>}
        bodyClassName="p-4 sm:p-5"
      >
        <details className="group">
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-lg border border-[#D4A94A]/45 bg-[#11100D] px-4 py-2 text-[15px] font-semibold text-[#F2CE6B] [&::-webkit-details-marker]:hidden">
            Expandir parâmetros (margens, mão de obra, gás, volume e taxas)
            <ChevronDown className="ml-auto size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <form onSubmit={salvarConfig} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" key={config.updated_at}>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Margem desejada (%)</Label><Input className="h-11 text-[15px]" name="margem_desejada_pct" type="number" step="any" defaultValue={config.margem_desejada_pct} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Margem baixa abaixo de (%)</Label><Input className="h-11 text-[15px]" name="margem_baixa_pct" type="number" step="any" defaultValue={config.margem_baixa_pct} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Mão de obra (R$/h)</Label><Input className="h-11 text-[15px]" name="mao_obra_hora" type="number" step="any" defaultValue={config.mao_obra_hora} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Gás/energia (R$/h fritura)</Label><Input className="h-11 text-[15px]" name="gas_hora" type="number" step="any" defaultValue={config.gas_hora} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Custos fixos mensais (R$)</Label><Input className="h-11 text-[15px]" name="custos_fixos_mensais" type="number" step="any" defaultValue={config.custos_fixos_mensais} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Volume mensal estimado (un)</Label><Input className="h-11 text-[15px]" name="volume_mensal_estimado" type="number" defaultValue={config.volume_mensal_estimado} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Taxa crédito (%)</Label><Input className="h-11 text-[15px]" name="taxa_credito_pct" type="number" step="any" defaultValue={config.taxa_credito_pct} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Taxa débito (%)</Label><Input className="h-11 text-[15px]" name="taxa_debito_pct" type="number" step="any" defaultValue={config.taxa_debito_pct} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Taxa Pix (%)</Label><Input className="h-11 text-[15px]" name="taxa_pix_pct" type="number" step="any" defaultValue={config.taxa_pix_pct} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] text-[#C9C2B8]">Taxa iFood (%)</Label><Input className="h-11 text-[15px]" name="taxa_ifood_pct" type="number" step="any" defaultValue={config.taxa_ifood_pct} /></div>
            <div className="sm:col-span-2 lg:col-span-3"><BotaoGold type="submit">Salvar parâmetros</BotaoGold></div>
          </form>
        </details>
      </SectionCard>

      <SectionCard
        titulo={<TituloSecao icone={Package}>Produtos analisados — unidade, caixa de 50 e caixa de 100</TituloSecao>}
        acoes={
          <label className="flex items-center gap-2 text-[15px] text-[#C9C2B8]">
            Canal
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="min-h-[44px] rounded-lg border border-[#D4A94A]/45 bg-[#11100D] px-3 text-[15px] text-[#F4F1EA]"
            >
              <option value="pix">Pix/balcão ({config.taxa_pix_pct}%)</option>
              <option value="debito">Débito ({config.taxa_debito_pct}%)</option>
              <option value="credito">Crédito ({config.taxa_credito_pct}%)</option>
              <option value="ifood">iFood ({config.taxa_ifood_pct}%)</option>
            </select>
          </label>
        }
        bodyClassName="p-4 sm:p-5"
      >
        <p className="mb-4 text-[14px] leading-snug text-[#A09A8E]">
          Vendas em múltiplos de 50 unidades. Rateio fixo aplicado: {dinheiro(rateio)} por unidade. Sem ficha técnica, o
          custo de insumos é zero e o preço não é validado.
        </p>
        <div className="space-y-4">
          {linhas.map((l) => (
            <article
              key={l.p.id}
              className={`rounded-xl border bg-[#121110] p-4 shadow-card sm:p-5 ${
                l.custoCompleto ? "border-[#D4A94A]/45" : "border-[#F16A6A]/55"
              }`}
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2A2721] pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[18px] font-bold leading-snug text-[#F4F1EA]">{l.p.nome}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Etiqueta tom={l.temFicha ? "ok" : "atencao"}>
                      {l.temFicha ? "ficha técnica ok" : "ficha técnica ausente"}
                    </Etiqueta>
                    {l.custoCompleto ? (
                      <Etiqueta tom={l.selo === "prejuizo" ? "perigo" : l.selo === "margem_baixa" ? "atencao" : "ok"}>
                        margem {l.selo === "prejuizo" ? "prejuízo" : l.selo === "margem_baixa" ? "baixa" : "saudável"}
                      </Etiqueta>
                    ) : (
                      <Etiqueta tom="perigo">margem não validada</Etiqueta>
                    )}
                    {modoDemo ? <Etiqueta tom="neutro">produto fictício</Etiqueta> : null}
                  </div>
                </div>
                <label className="flex min-h-[44px] items-center gap-2 text-[15px] text-[#C9C2B8]">
                  <input
                    type="checkbox"
                    className="size-[18px] accent-[#D4A94A]"
                    checked={kitIds.includes(l.p.id)}
                    onChange={(e) => setKitIds(e.target.checked ? [...kitIds, l.p.id] : kitIds.filter((id) => id !== l.p.id))}
                  />
                  incluir no kit
                </label>
              </header>

              {!l.custoCompleto ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg border border-[#F16A6A]/60 bg-[#F16A6A]/12 px-3 py-2 text-[14px] font-bold text-[#F16A6A]">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  Custo incompleto — preço não validado
                </p>
              ) : null}

              <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                <Campo rotulo="Preço atual (un)" grande>{dinheiro(l.precoAtual)}</Campo>
                <Campo
                  rotulo={l.custoCompleto ? "Custo por unidade" : "Custo parcial — não validado (un)"}
                  destaque
                  grande
                >
                  {dinheiro(l.total)}
                </Campo>
                <Campo rotulo="Margem estimada" grande>
                  {l.custoCompleto ? percentual(l.margem != null ? l.margem * 100 : null) : "—"}
                </Campo>
                <Campo rotulo="Lucro estimado (un)" grande>
                  {l.custoCompleto ? dinheiro(l.lucroUnit) : "—"}
                </Campo>
              </div>

              <div className="mt-4 grid gap-x-5 gap-y-4 border-t border-[#2A2721] pt-4 sm:grid-cols-2 xl:grid-cols-4">
                <Campo
                  rotulo={l.custoCompleto ? "Custo · 50 unidades" : "Custo parcial — não validado · 50 unidades"}
                  grande
                >
                  {dinheiro(l.total * 50)}
                </Campo>
                <Campo rotulo="Preço · 50 unidades" grande>{dinheiro(l.precoAtual * 50)}</Campo>
                <Campo
                  rotulo={l.custoCompleto ? "Custo · 100 unidades" : "Custo parcial — não validado · 100 unidades"}
                  grande
                >
                  {dinheiro(l.total * 100)}
                </Campo>
                <Campo rotulo="Preço · 100 unidades" grande>{dinheiro(l.precoAtual * 100)}</Campo>
              </div>

              <div className="mt-4 rounded-lg border border-[#D4A94A]/30 bg-[#17150F] p-4">
                <p className="text-[15px] font-bold text-[#F2CE6B]">
                  Detalhamento dos custos (por unidade)
                </p>
                <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo rotulo="Insumos">{dinheiro(l.custoInsumosBase)}</Campo>
                  <Campo rotulo="Perdas">{dinheiro(l.custoPerdas)}</Campo>
                  <Campo rotulo="Embalagens">{dinheiro(l.embalagem)}</Campo>
                  <Campo rotulo="Mão de obra">{dinheiro(l.maoObraUnit)}</Campo>
                  <Campo rotulo="Energia/gás">{dinheiro(l.energiaUnit)}</Campo>
                  <Campo rotulo="Rateio fixo">{dinheiro(l.rateio)}</Campo>
                  <Campo rotulo={`Taxa ${CANAIS[canal] ?? canal}`}>{dinheiro(l.taxaUnit)}</Campo>
                  <Campo
                    rotulo={l.custoCompleto ? "Custo total" : "Custo total (parcial — não validado)"}
                    destaque
                  >
                    {dinheiro(l.total)}
                  </Campo>
                </div>
              </div>

              <div className="mt-4 grid gap-x-5 gap-y-4 border-t border-[#2A2721] pt-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <div className="min-w-0">
                  <Label className="text-[13px] text-[#A09A8E]">Margem simulada (%)</Label>
                  <Input
                    className="mt-1 h-11 w-full text-[15px] sm:w-28"
                    type="number"
                    step="any"
                    value={margemSim[l.p.id] ?? ""}
                    placeholder={String(config.margem_desejada_pct)}
                    onChange={(e) => setMargemSim({ ...margemSim, [l.p.id]: e.target.value })}
                  />
                </div>
                <Campo rotulo="Preço sugerido (un)" destaque grande>
                  {l.sugerido != null ? dinheiro(l.sugerido) : "Não validado"}
                </Campo>
                <Campo rotulo="Sugerido · 50 unidades" grande>
                  {l.sugerido != null ? dinheiro(l.sugerido * 50) : "—"}
                </Campo>
                <Campo rotulo="Sugerido · 100 unidades" grande>
                  {l.sugerido != null ? dinheiro(l.sugerido * 100) : "—"}
                </Campo>
                <div className="sm:col-span-2 xl:col-span-4">
                  <BotaoGold className="w-full sm:w-auto" disabled={l.sugerido == null} onClick={() => aplicarPreco(l)}>
                    Aplicar sugerido
                  </BotaoGold>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        titulo={<TituloSecao icone={Layers3}>Simulador de kits/combos</TituloSecao>}
        acoes={<Etiqueta tom="neutro">Marque “incluir no kit” acima</Etiqueta>}
        bodyClassName="p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[#C9C2B8]">Embalagem do kit (R$)</Label>
            <Input className="h-11 text-[15px]" type="number" step="any" value={kitEmbalagem} onChange={(e) => setKitEmbalagem(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[#C9C2B8]">Preço do kit (R$)</Label>
            <Input className="h-11 text-[15px]" type="number" step="any" value={kitPreco} onChange={(e) => setKitPreco(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[#C9C2B8]">Itens selecionados</Label>
            <p className="mt-1 text-[18px] font-bold text-[#F4F1EA]">{kitInfo?.qtd ?? 0} produto(s)</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[#C9C2B8]">Kits de 50 / 100 unidades</Label>
            <p className="mt-1 text-[14px] leading-snug text-[#A09A8E]">Venda sempre em múltiplos de 50.</p>
          </div>
        </div>
        {kitInfo ? (
          <div className="mt-4 grid gap-4 rounded-lg border border-[#D4A94A]/30 bg-[#11100D] p-4 sm:grid-cols-3">
            <Campo rotulo="Custo do kit" grande>{dinheiro(kitInfo.custo)}</Campo>
            <Campo rotulo="Soma dos avulsos" grande>{dinheiro(kitInfo.avulsos)}</Campo>
            <Campo rotulo="Desconto efetivo" destaque grande>
              {kitInfo.desconto != null ? percentual(kitInfo.desconto * 100) : "—"}
            </Campo>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-[#D4A94A]/30 bg-[#11100D] p-4 text-[15px] text-[#A09A8E]">
            Nenhum produto marcado. Selecione itens na lista acima para simular o combo.
          </p>
        )}
        <p className="mt-3 text-[14px] leading-snug text-[#A09A8E]">
          Simulação visual: o resultado considera apenas o custo direto dos itens e a embalagem do kit; nenhum preço real
          é alterado nesta etapa.
        </p>
      </SectionCard>

      {modoDemo ? (
        <p className="rounded-lg border border-[#D4A94A]/30 bg-[#17150F] p-4 text-[14px] leading-snug text-[#C9C2B8]">
          <b className="text-[#F2CE6B]">Homologação visual:</b> produtos, fichas, custos fixos e valores do Financeiro
          exibidos aqui são fictícios. A integração real e a validação financeira dos cálculos ficam para a fase funcional.
        </p>
      ) : null}
    </div>
  );
}
