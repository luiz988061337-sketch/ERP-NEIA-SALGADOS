import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Calculator, Check, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  estimarOrcamento,
  mensagemOrcamento,
  useCalculadoraConfig,
  DEFAULT_CALCULADORA_CONFIG,
} from "@/lib/calculadora-salgados";
import { COMBO_CATEGORIAS } from "@/lib/combo";
import { TAXA_ENTREGA, brl, whatsappLink } from "@/lib/format";
import { usePerfil, useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Orçamento de salgados para seu evento — Néia Salgados" },
      {
        name: "description",
        content:
          "Calcule quantos salgados o seu evento precisa e receba um orçamento pelo WhatsApp, sem compromisso.",
      },
      { property: "og:title", content: "Orçamento de salgados — Néia Salgados" },
      {
        property: "og:description",
        content: "Calcule a quantidade ideal e solicite seu orçamento pelo WhatsApp.",
      },
    ],
  }),
  component: Calculadora,
});

const TIPOS_EVENTO = [
  "Aniversário",
  "Casamento",
  "Chá de bebê",
  "Empresa",
  "Festa",
  "Confraternização",
  "Outro",
];

function Calculadora() {
  const { data: config } = useCalculadoraConfig();
  const cfg = config ?? DEFAULT_CALCULADORA_CONFIG;
  const { user } = useSession();
  const { data: perfil } = usePerfil(user?.id);
  const navigate = useNavigate();

  const [pessoas, setPessoas] = useState(30);
  const [porPessoa, setPorPessoa] = useState<number | "personalizado">(cfg.por_pessoa_padrao);
  const [personalizado, setPersonalizado] = useState(cfg.por_pessoa_padrao);
  const [slugCategoria, setSlugCategoria] = useState(COMBO_CATEGORIAS[0]?.slug ?? "");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipoEvento, setTipoEvento] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // Preenche nome/telefone do perfil uma vez, sem sobrescrever o que o cliente digitou.
  const [prefill, setPrefill] = useState(false);
  useEffect(() => {
    if (prefill) return;
    const p = perfil as { nome?: string; telefone?: string } | null;
    if (!p || (!p.nome && !p.telefone)) return;
    setNome((v) => v || p.nome || "");
    setTelefone((v) => v || p.telefone || "");
    setPrefill(true);
  }, [perfil, prefill]);

  const categoria = COMBO_CATEGORIAS.find((c) => c.slug === slugCategoria) ?? COMBO_CATEGORIAS[0];
  const porPessoaFinal = porPessoa === "personalizado" ? personalizado : porPessoa;
  const est = estimarOrcamento(pessoas, porPessoaFinal, categoria?.precoUnit ?? 0);

  const dados = {
    nome: nome.trim(),
    telefone: telefone.trim(),
    tipoEvento,
    dataEvento,
    pessoas: est.pessoas,
    porPessoa: est.porPessoa,
    unidades: est.unidades,
    unidadesCombo: est.unidadesCombo,
    categoria: categoria?.nome ?? "",
    precoUnit: categoria?.precoUnit ?? 0,
    subtotal: est.subtotal,
    validadeDias: cfg.orcamento_validade_dias,
    observacoes: observacoes.trim(),
  };

  const telefoneOk = dados.telefone.replace(/\D/g, "").length >= 10;

  function pedirNomeWhatsapp(): boolean {
    toast.error("Deixe seu WhatsApp para enviarmos o orçamento.");
    document.getElementById("orcam-whats")?.focus();
    return false;
  }

  function enviarWhatsapp(): void {
    if (!telefoneOk) {
      pedirNomeWhatsapp();
      return;
    }
    if (!cfg.zap_contato) {
      toast.error("Orçamento por WhatsApp ainda não configurado. Use o combo ou fale com a loja.");
      return;
    }
    const texto = `${mensagemOrcamento(dados)}\n\nMeu nome: ${dados.nome || "-"}`;
    window.open(whatsappLink(cfg.zap_contato, texto), "_blank", "noopener");
  }

  async function salvar(): Promise<void> {
    if (!user) {
      toast.info("Entre na sua conta para salvar o orçamento, ou envie pelo WhatsApp.");
      return;
    }
    if (!telefoneOk) {
      pedirNomeWhatsapp();
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("orcamentos").insert({
      user_id: user.id,
      cliente_nome: dados.nome,
      telefone: dados.telefone,
      tipo_evento: dados.tipoEvento,
      pessoas: est.pessoas,
      data_evento: dados.dataEvento || null,
      mix: [{ categoria: categoria?.nome ?? "", slug: slugCategoria, quantidade: est.unidadesCombo }],
      observacoes: `${dados.observacoes ? `${dados.observacoes} — ` : ""}${est.porPessoa} por pessoa, combo fechado em ${est.unidadesCombo} un.`,
      subtotal: est.subtotal,
      taxa_entrega: TAXA_ENTREGA,
      total: est.subtotal + TAXA_ENTREGA,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message.includes("column") || error.message.includes("does not exist")
        ? "Rode a migration de orçamento no Supabase para salvar."
        : error.message);
      return;
    }
    setSalvo(true);
    toast.success("Orçamento salvo! A loja entra em contato pelo WhatsApp.");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar ao cardápio
      </Link>
      <h1 className="font-display text-3xl">Orçamento para seu evento</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Calcule quantos salgados o seu evento precisa e receba o orçamento no WhatsApp, sem compromisso.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-xl">
          <Calculator className="size-5" /> 1. Quantidade
        </h2>
        <div className="space-y-1.5">
          <Label htmlFor="pessoas">Quantas pessoas?</Label>
          <Input
            id="pessoas"
            type="number"
            min={1}
            value={pessoas}
            onChange={(e) => setPessoas(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Quantos salgados por pessoa?</Label>
          <div className="flex flex-wrap gap-2">
            {[15, 20, 25, 30].map((op) => (
              <Button key={op} type="button" size="sm" variant={porPessoa === op ? "default" : "outline"} onClick={() => setPorPessoa(op)}>
                {op}
              </Button>
            ))}
            {cfg.permitir_personalizado ? (
              <Button type="button" size="sm" variant={porPessoa === "personalizado" ? "default" : "outline"} onClick={() => setPorPessoa("personalizado")}>
                Outro
              </Button>
            ) : null}
          </div>
          {porPessoa === "personalizado" ? (
            <Input
              type="number"
              className="mt-2"
              min={cfg.minimo_por_pessoa}
              max={cfg.maximo_por_pessoa}
              value={personalizado}
              onChange={(e) =>
                setPersonalizado(Math.min(cfg.maximo_por_pessoa, Math.max(cfg.minimo_por_pessoa, Number(e.target.value) || cfg.minimo_por_pessoa)))
              }
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Recomendamos entre {cfg.minimo_por_pessoa} e {cfg.maximo_por_pessoa} por pessoa.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat">Qual tipo de salgado?</Label>
          <select
            id="cat"
            value={slugCategoria}
            onChange={(e) => setSlugCategoria(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {COMBO_CATEGORIAS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome} — {brl(c.precoUnit)}/un
              </option>
            ))}
          </select>
          {categoria ? <p className="text-xs text-muted-foreground">{categoria.descricao}</p> : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">2. Seus dados</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="orcam-nome">Nome *</Label>
            <Input id="orcam-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como podemos te chamar" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orcam-whats">WhatsApp *</Label>
            <Input id="orcam-whats" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" inputMode="tel" />
            {telefone && !telefoneOk ? <p className="text-xs text-destructive">Informe DDD + número.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orcam-evento">Tipo de evento</Label>
            <select id="orcam-evento" value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Não é para evento</option>
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orcam-data">Data desejada</Label>
            <Input id="orcam-data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="orcam-obs">Observações</Label>
          <Textarea id="orcam-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex: sem cebola, para as 20h, montar com 3 sabores" maxLength={300} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">3. Resumo</h2>
        <p className="mt-2 font-display text-2xl">{est.unidades} salgados</p>
        <p className="text-sm text-muted-foreground">
          Para comprar em combos (múltiplos de 50), sugerimos <strong>{est.unidadesCombo} unidades</strong>
          {est.faltamParaCombo > 0 ? <> (faltam {est.faltamParaCombo} para fechar a caixa)</> : null}.
        </p>
        <div className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {est.unidadesCombo} x {categoria?.nome} ({brl(categoria?.precoUnit ?? 0)})
            </span>
            <span>{brl(est.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entrega</span>
            <span>combinada na confirmação</span>
          </div>
          <div className="flex justify-between font-display text-lg">
            <span>Estimativa</span>
            <span className="text-primary">{brl(est.subtotal)}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Estimativa válida por {cfg.orcamento_validade_dias} dias. O valor final confirma o mix e a taxa de entrega.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="lg" className="flex-1" onClick={enviarWhatsapp} disabled={est.unidadesCombo <= 0}>
            <MessageCircle className="mr-2 size-4" /> Solicitar pelo WhatsApp
          </Button>
          {user ? (
            <Button type="button" size="lg" variant="outline" className="flex-1" onClick={salvar} disabled={salvando || salvo || est.unidadesCombo <= 0}>
              {salvo ? <Check className="mr-2 size-4" /> : <Save className="mr-2 size-4" />}
              {salvo ? "Orçamento salvo" : salvando ? "Salvando..." : "Salvar orçamento"}
            </Button>
          ) : (
            <Button type="button" size="lg" variant="outline" className="flex-1" onClick={() => navigate({ to: "/auth", search: { redirect: "/calculadora" } })}>
              Entrar para salvar
            </Button>
          )}
        </div>
        {!cfg.zap_contato ? (
          <p className="mt-2 text-xs text-muted-foreground">
            O contato de WhatsApp ainda não foi configurado no painel admin — nesse caso, monte o combo pelo link abaixo.
          </p>
        ) : null}
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link to="/combo">Montar combo agora</Link>
        </Button>
      </div>
    </div>
  );
}