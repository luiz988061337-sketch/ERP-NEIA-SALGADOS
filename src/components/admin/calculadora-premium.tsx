import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  FileText,
  Info,
  LockKeyhole,
  Package,
  PlayCircle,
  ShieldCheck,
  Users,
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
  PremiumSection,
} from "@/components/admin/erp-ui";
import {
  DEFAULT_CALCULADORA_CONFIG,
  estimarOrcamento,
  mensagemOrcamento,
  type CalculadoraConfig,
} from "@/lib/calculadora-salgados";
import { brl } from "@/lib/format";
import { ehModoDemo } from "@/lib/demo-preview";

/**
 * H14 — Simulador visual de Calculadora e Orçamentos.
 * A configuração administrativa existente permanece intacta: este componente
 * apenas a lê e demonstra as regras em dados fictícios, sem salvar orçamentos,
 * sem enviar mensagens e sem alterar a calculadora pública.
 */

const LIMITE_DESCONTO = 10;
const MINIMO_UNIDADES = 50;
const MARGEM_MINIMA = 15;
const PRECO_DEMO = 7.9;
const CUSTO_DEMO = 2.56;

function numero(valor: string, fallback = 0): number {
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function opcoesPorPessoa(config: CalculadoraConfig): number[] {
  const min = Math.max(1, Math.round(config.minimo_por_pessoa));
  const max = Math.max(min, Math.round(config.maximo_por_pessoa));
  const padrao = Math.round(config.por_pessoa_padrao);
  const valores = new Set<number>([min, max, padrao]);
  for (let v = min; v <= max; v += 5) valores.add(v);
  return [...valores].sort((a, b) => a - b);
}

function rotuloPessoas(config: CalculadoraConfig): string {
  return `${config.minimo_por_pessoa}–${config.maximo_por_pessoa}`;
}

export function CalculadoraPremium({ config }: { config?: CalculadoraConfig | null }) {
  const modoDemo = ehModoDemo();
  const cfg = useMemo<CalculadoraConfig>(
    () => ({ ...DEFAULT_CALCULADORA_CONFIG, ...(config ?? {}) }),
    [config],
  );

  const [pessoas, setPessoas] = useState("80");
  const [porPessoa, setPorPessoa] = useState(String(cfg.por_pessoa_padrao));
  const [precoUnit, setPrecoUnit] = useState(String(PRECO_DEMO));
  const [custoUnit, setCustoUnit] = useState(String(CUSTO_DEMO));
  const [desconto, setDesconto] = useState("0");
  const [visaoAtendente, setVisaoAtendente] = useState(false);
  const [aprovacao, setAprovacao] = useState(false);

  const opcoes = useMemo(() => opcoesPorPessoa(cfg), [cfg]);
  const personalizado = opcoes.includes(numero(porPessoa, cfg.por_pessoa_padrao));

  const simulacao = useMemo(() => {
    const p = Math.max(0, Math.round(numero(pessoas)));
    const pp = Math.max(
      cfg.minimo_por_pessoa,
      Math.min(cfg.maximo_por_pessoa, Math.round(numero(porPessoa, cfg.por_pessoa_padrao))),
    );
    const preco = Math.max(0, numero(precoUnit, PRECO_DEMO));
    const custo = Math.max(0, numero(custoUnit, CUSTO_DEMO));
    const desc = Math.max(0, Math.min(100, numero(desconto)));
    const bruto = estimarOrcamento(p, pp, preco);
    const unidadesFechadas = bruto.unidades > 0 ? Math.max(MINIMO_UNIDADES, bruto.unidadesCombo) : 0;
    const subtotal = unidadesFechadas * preco;
    const valorDesconto = subtotal * (desc / 100);
    const total = Math.max(0, subtotal - valorDesconto);
    const custoTotal = unidadesFechadas * custo;
    const margem = total > 0 ? ((total - custoTotal) / total) * 100 : null;
    return {
      pessoas: p,
      porPessoa: pp,
      unidadesBase: bruto.unidades,
      unidadesFechadas,
      faltamParaCombo: Math.max(0, unidadesFechadas - bruto.unidades),
      subtotal,
      valorDesconto,
      total,
      custoTotal,
      margem,
      desconto: desc,
      dependeAprovacao: desc > LIMITE_DESCONTO,
    };
  }, [pessoas, porPessoa, precoUnit, custoUnit, desconto, cfg]);

  const textoOrcamento = useMemo(
    () =>
      mensagemOrcamento({
        nome: "Cliente fictício",
        telefone: "",
        tipoEvento: "Evento demonstrativo",
        dataEvento: "2026-12-10",
        pessoas: simulacao.pessoas,
        porPessoa: simulacao.porPessoa,
        unidades: simulacao.unidadesBase,
        unidadesCombo: simulacao.unidadesFechadas,
        categoria: "Salgados · Fritos (demo)",
        precoUnit: numero(precoUnit, PRECO_DEMO),
        subtotal: simulacao.total,
        validadeDias: cfg.orcamento_validade_dias,
        observacoes:
          simulacao.desconto > 0
            ? `Desconto demonstrativo de ${simulacao.desconto}%. ${simulacao.dependeAprovacao ? "Aguardando aprovação administrativa." : "Dentro do limite permitido."}`
            : "Simulação visual — nenhum orçamento foi salvo ou enviado.",
      }),
    [simulacao, precoUnit, cfg.orcamento_validade_dias],
  );

  const bloquearAcao = simulacao.dependeAprovacao && !aprovacao;
  const margemBaixa = simulacao.margem != null && simulacao.margem < MARGEM_MINIMA;

  const kpis = [
    { rotulo: "Pessoas", valor: String(simulacao.pessoas), detalhe: `${simulacao.porPessoa} por pessoa`, icone: Users, cor: ERP_COLORS.blue },
    { rotulo: "Unidades fechadas", valor: `${simulacao.unidadesFechadas} un`, detalhe: `mínimo ${MINIMO_UNIDADES} · múltiplos de ${MINIMO_UNIDADES}`, icone: Package, cor: ERP_COLORS.goldStrong },
    { rotulo: "Total estimado", valor: brl(simulacao.total), detalhe: simulacao.desconto > 0 ? `desconto de ${simulacao.desconto}%` : "sem desconto", icone: CircleDollarSign, cor: ERP_COLORS.orange },
    {
      rotulo: "Margem",
      valor: visaoAtendente ? "Bloqueado" : simulacao.margem == null ? "—" : `${simulacao.margem.toFixed(1)}%`,
      detalhe: visaoAtendente ? "visão do atendente" : margemBaixa ? "abaixo de 15%" : "administrador",
      icone: visaoAtendente ? LockKeyhole : ShieldCheck,
      cor: visaoAtendente ? ERP_COLORS.gray : margemBaixa ? ERP_COLORS.red : ERP_COLORS.green,
    },
  ];

  return (
    <div className="space-y-5 pb-28">
      <div className="space-y-5 rounded-xl border border-[#D4A94A] bg-[#17150F] p-3 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
              <Calculator className="size-6 text-[#F2CE6B]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[22px] font-bold uppercase leading-tight tracking-wide text-[#F4F1EA]">
                Calculadora e Orçamentos — Simulador
              </h2>
              <p className="text-[13px] leading-snug text-[#A09A8E]">
                Demonstração visual · regras existentes preservadas · nenhum orçamento é salvo ou enviado
              </p>
            </div>
          </div>
          <PremiumDemoBadge>{modoDemo ? "Demonstração isolada" : "Somente leitura"}</PremiumDemoBadge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
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
      </div>

      <PremiumSection
        icone={PlayCircle}
        titulo="Simulação demonstrativa"
        acoes={
          <label className="flex items-center gap-2 text-[14px] text-[#C9C2B8]">
            <Switch
              checked={visaoAtendente}
              onCheckedChange={setVisaoAtendente}
              aria-label="Alternar visão do atendente"
            />
            Visão do atendente
          </label>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-[13px]">Pessoas</Label>
            <Input
              type="number"
              min={1}
              value={pessoas}
              onChange={(e) => setPessoas(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Por pessoa · permitido {rotuloPessoas(cfg)}</Label>
            {cfg.permitir_personalizado ? (
              <>
                <select
                  value={personalizado ? porPessoa : "custom"}
                  onChange={(e) => setPorPessoa(e.target.value === "custom" ? String(cfg.por_pessoa_padrao) : e.target.value)}
                  className="h-10 w-full rounded-md border border-[#D4A94A]/50 bg-[#141310] px-3 text-[15px] text-[#F4F1EA]"
                >
                  {opcoes.map((v) => (
                    <option key={v} value={String(v)}>{v} un/pessoa</option>
                  ))}
                  <option value="custom">Personalizado</option>
                </select>
                {!personalizado ? (
                  <Input
                    type="number"
                    min={cfg.minimo_por_pessoa}
                    max={cfg.maximo_por_pessoa}
                    value={porPessoa}
                    onChange={(e) => setPorPessoa(e.target.value)}
                    className="mt-2"
                  />
                ) : null}
              </>
            ) : (
              <Input value={`${cfg.por_pessoa_padrao} un/pessoa (fixo)`} readOnly />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Preço unitário fictício (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={precoUnit}
              onChange={(e) => setPrecoUnit(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Custo unitário fictício (R$)</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={visaoAtendente ? "" : custoUnit}
                onChange={(e) => setCustoUnit(e.target.value)}
                disabled={visaoAtendente}
                aria-label="Custo unitário fictício"
              />
              {visaoAtendente ? (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#A09A8E]">••••</span>
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px]">Desconto demonstrativo (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#A09A8E]">
          <p className="flex items-center gap-1">
            {visaoAtendente ? <LockKeyhole className="size-3.5" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
            {visaoAtendente
              ? "Custo e margem bloqueados para atendente."
              : "Custo e margem visíveis somente nesta visão administrativa."}
          </p>
          <p>Limite sem aprovação: {LIMITE_DESCONTO}%</p>
        </div>

        <div className="mt-4 rounded-xl border border-[#D4A94A]/50 bg-[#141310] p-3">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[#F4F1EA]">
            <BarChart3 className="size-4 text-[#F2CE6B]" aria-hidden /> Resultado da simulação
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ["Unidades base", `${simulacao.unidadesBase} un`],
              ["Arredondamento", `+${simulacao.faltamParaCombo} un`, `para múltiplo de ${MINIMO_UNIDADES}`],
              ["Subtotal", brl(simulacao.subtotal)],
              ["Desconto", brl(simulacao.valorDesconto), `(${simulacao.desconto}%)`],
              ["Total final", brl(simulacao.total)],
              [
                "Margem após desconto",
                visaoAtendente ? "Bloqueado" : simulacao.margem == null ? "—" : `${simulacao.margem.toFixed(1)}%`,
              ],
            ].map(([rotulo, valor, complemento]) => (
              <div
                key={rotulo}
                className={`rounded-lg border px-3 py-2 ${
                  rotulo === "Total final"
                    ? "border-[#D4A94A] bg-[#211B0F]"
                    : "border-[#2A2721] bg-[#17150F]"
                }`}
              >
                <p className="text-[12px] text-[#A09A8E]">{rotulo}</p>
                <p className="text-[16px] font-bold leading-tight text-[#F4F1EA]">{valor}</p>
                {complemento ? <p className="text-[11px] text-[#A09A8E]">{complemento}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {simulacao.dependeAprovacao ? (
            <div className="flex gap-2 rounded-lg border border-[#F5A623]/60 bg-[#F5A623]/10 p-3 text-[14px] leading-snug text-[#F5C46B]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                Desconto acima de {LIMITE_DESCONTO}% depende de aprovação administrativa.
                <label className="mt-2 flex items-center gap-2 text-[14px]">
                  <Switch
                    checked={aprovacao}
                    onCheckedChange={setAprovacao}
                    aria-label="Confirmar aprovação demonstrativa"
                  />
                  Aprovação demonstrativa registrada
                </label>
              </div>
            </div>
          ) : null}
          {margemBaixa && !visaoAtendente ? (
            <div className="flex gap-2 rounded-lg border border-[#F16A6A]/60 bg-[#F16A6A]/10 p-3 text-[14px] text-[#F16A6A]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Margem abaixo de {MARGEM_MINIMA}% nesta simulação.
            </div>
          ) : null}
          {!bloquearAcao && !margemBaixa ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#35C97C]/60 bg-[#35C97C]/10 px-3 py-2 text-[13px] text-[#35C97C]">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                Simulação dentro das regras demonstrativas.
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#35C97C]/50 bg-[#0F1A12] px-2.5 py-1 text-[11px] font-semibold">
                <CheckCircle2 className="size-3.5" aria-hidden /> Desconto seguro (≤ {LIMITE_DESCONTO}%)
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="erp-btn-gold min-h-10 gap-2 text-[14px] font-semibold text-[#14120C]"
              disabled={bloquearAcao}
              onClick={() =>
                toast.success(
                  bloquearAcao
                    ? "Aprovação pendente."
                    : "Orçamento demonstrativo gerado. Nada foi salvo ou enviado.",
                )
              }
            >
              Gerar orçamento (demo)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(textoOrcamento);
                  toast.info("Texto copiado. Nenhuma mensagem foi enviada.");
                } catch {
                  toast.error("Não foi possível copiar neste navegador.");
                }
              }}
            >
              <Copy className="size-4" aria-hidden /> Copiar texto
            </Button>
          </div>
        </div>
      </PremiumSection>

      <div className="grid gap-4 lg:grid-cols-2">
      <PremiumSection
        icone={FileText}
        titulo="Prévia do texto do orçamento"
        subtitulo="Mensagem gerada localmente, sem envio."
        bodyClassName="p-3"
      >
        <textarea
          readOnly
          value={textoOrcamento}
          rows={12}
          className="w-full resize-y rounded-lg border border-[#2A2721] bg-[#141310] p-3 text-[14px] leading-snug text-[#C9C2B8]"
        />
        <p className="mt-2 text-[12px] leading-snug text-[#A09A8E]">
          Texto gerado localmente com as mesmas regras de redação da calculadora. Nenhum link de
          WhatsApp é acionado nesta tela.
        </p>
      </PremiumSection>

      <PremiumSection
        icone={ShieldCheck}
        titulo="Regras preservadas da configuração"
        subtitulo="Valores vigentes lidos pela calculadora pública."
        bodyClassName="p-3"
      >
        <div className="grid gap-2">
          {[
            { icone: Package, texto: `Quantidade mínima de ${MINIMO_UNIDADES} unidades e fechamento em múltiplos de ${MINIMO_UNIDADES}.` },
            { icone: Users, texto: `Padrão de ${cfg.por_pessoa_padrao} por pessoa; faixa configurável de ${cfg.minimo_por_pessoa} a ${cfg.maximo_por_pessoa}.` },
            { icone: ShieldCheck, texto: `Validade do orçamento: ${cfg.orcamento_validade_dias} dias.` },
            { icone: Info, texto: `WhatsApp configurado: ${cfg.zap_contato || "não informado (demo)"}.` },
            { icone: LockKeyhole, texto: "Custos e margens ficam bloqueados na visão do atendente." },
            { icone: AlertTriangle, texto: `Descontos acima de ${LIMITE_DESCONTO}% exigem aprovação administrativa.` },
          ].map((item, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-[#2A2721] bg-[#141310] px-3 py-2 text-[12px] leading-snug text-[#C9C2B8]">
              <item.icone className="mt-0.5 size-4 shrink-0 text-[#F2CE6B]" aria-hidden />
              {item.texto}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-snug text-[#A09A8E]">
          O formulário de configuração acima continua operacional e inalterado; este simulador apenas
          lê os valores vigentes para fins de homologação visual.
        </p>
      </PremiumSection>
      </div>
    </div>
  );
}
