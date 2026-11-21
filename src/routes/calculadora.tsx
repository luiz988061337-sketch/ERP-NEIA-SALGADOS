import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Copy,
  FilePenLine,
  Info,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Save,
  Search,
  Send,
  ShoppingBag,
} from "lucide-react";
import arteOrcamento from "@/assets/orcamento-arte-aprovada.png";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PublicPageHero } from "@/components/public-page-hero";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  arredondarCombo,
  estimarOrcamento,
  mensagemOrcamento,
  useCalculadoraConfig,
  DEFAULT_CALCULADORA_CONFIG,
} from "@/lib/calculadora-salgados";
import { COMBO_CATEGORIAS } from "@/lib/combo";
import { useLojaConfig } from "@/lib/loja";
import { TAXA_ENTREGA, brl, whatsappLink } from "@/lib/format";
import {
  getDisponibilidadeProduto,
  imagemProduto,
  precoFinal,
  useCategorias,
  useProdutos,
  type Produto,
} from "@/lib/catalog";
import { regraQuantidade } from "@/lib/quantidade";
import { usePerfil, useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { supabaseLoose } from "@/lib/supabase-loose";

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Orçamento de salgados — Néia Salgados" },
      {
        name: "description",
        content:
          "Monte uma estimativa de salgados, confira o resumo e solicite um orçamento. Fornecemos somente os salgados.",
      },
      { property: "og:title", content: "Orçamento de salgados — Néia Salgados" },
      {
        property: "og:description",
        content: "Monte sua estimativa e confira o resumo antes de solicitar o orçamento.",
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

type ItemEscolhido = { produto: Produto; quantidade: number };
type ModoQuantidade = "pessoas" | "direto";

function Calculadora() {
  const { data: config } = useCalculadoraConfig();
  const cfg = config ?? DEFAULT_CALCULADORA_CONFIG;
  const { data: lojaConfig } = useLojaConfig();
  // Sem contato na Calculadora, usa o WhatsApp cadastrado na aba Loja.
  const zapContato = cfg.zap_contato || (lojaConfig?.telefone ?? "");
  const { user } = useSession();
  const { data: perfil } = usePerfil(user?.id);
  const {
    data: produtos,
    isLoading: carregandoCatalogo,
    isError: erroCatalogo,
    refetch: recarregarCatalogo,
  } = useProdutos();
  const { data: categorias } = useCategorias();
  const navigate = useNavigate();

  const [pessoas, setPessoas] = useState(30);
  const [porPessoa, setPorPessoa] = useState<number | "personalizado">(cfg.por_pessoa_padrao);
  const [personalizado, setPersonalizado] = useState(cfg.por_pessoa_padrao);
  const [modoQtd, setModoQtd] = useState<ModoQuantidade>("pessoas");
  const [qtdDireta, setQtdDireta] = useState(0);
  const [slugCategoria, setSlugCategoria] = useState(COMBO_CATEGORIAS[0]?.slug ?? "");
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<Record<string, number>>({});
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipoEvento, setTipoEvento] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [textoManual, setTextoManual] = useState("");

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

  // O rótulo "Copiado" só vale para o texto copiado: qualquer alteração o invalida.
  useEffect(() => {
    setCopiado(false);
  }, [
    pessoas,
    porPessoa,
    personalizado,
    modoQtd,
    qtdDireta,
    slugCategoria,
    escolhidos,
    nome,
    telefone,
    tipoEvento,
    dataEvento,
    observacoes,
  ]);

  const slugCategoriaPorId = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.id, c.slug])),
    [categorias],
  );

  const regrasPorProduto = useMemo(
    () =>
      new Map(
        (produtos ?? []).map((p) => [
          p.id,
          regraQuantidade(p, slugCategoriaPorId.get(p.categoria_id)),
        ]),
      ),
    [produtos, slugCategoriaPorId],
  );

  // Regra central de disponibilidade (mesma de catálogo/carrinho/checkout).
  // Antes: `p.disponivel` estrito descartava cadastros sem o campo preenchido.
  const catalogo = useMemo(
    () =>
      (produtos ?? []).filter(
        (p) => getDisponibilidadeProduto(p, slugCategoriaPorId.get(p.categoria_id)).disponivel,
      ),
    [produtos, slugCategoriaPorId],
  );

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo
      ? catalogo.filter(
          (p) =>
            p.nome.toLowerCase().includes(termo) ||
            (p.descricao ?? "").toLowerCase().includes(termo),
        )
      : catalogo;
    return base.slice(0, 12);
  }, [catalogo, busca]);

  const itens: ItemEscolhido[] = useMemo(
    () =>
      catalogo
        .map((p) => ({ produto: p, quantidade: escolhidos[p.id] ?? 0 }))
        .filter((i) => i.quantidade > 0),
    [catalogo, escolhidos],
  );

  const categoria = COMBO_CATEGORIAS.find((c) => c.slug === slugCategoria) ?? COMBO_CATEGORIAS[0];
  const porPessoaFinal = porPessoa === "personalizado" ? personalizado : porPessoa;
  const est = estimarOrcamento(pessoas, porPessoaFinal, categoria?.precoUnit ?? 0);
  const precoUnitBase = categoria?.precoUnit ?? 0;

  // Entrada direta: nunca arredondamento oculto — o ajuste aparece no resumo.
  const qtdDiretaInformada = Math.max(0, Math.floor(Number(qtdDireta) || 0));
  const qtdDiretaAjustada = arredondarCombo(qtdDiretaInformada);
  const ajusteDireto = qtdDiretaAjustada - qtdDiretaInformada;

  // Com produtos escolhidos o orçamento usa o mix real; senão usa pessoas × por pessoa
  // ou a quantidade informada diretamente, sempre com preços reais do catálogo.
  const totalMix = itens.reduce((acc, i) => acc + precoFinal(i.produto) * i.quantidade, 0);
  const unidadesMix = itens.reduce((acc, i) => acc + i.quantidade, 0);
  const usandoMix = itens.length > 0;
  const unidadesBase = modoQtd === "direto" ? qtdDiretaAjustada : est.unidades;
  const unidades = usandoMix ? unidadesMix : unidadesBase;
  const subtotal = usandoMix
    ? totalMix
    : modoQtd === "direto"
      ? unidadesBase * precoUnitBase
      : est.subtotal;
  const unidadesCombo = usandoMix
    ? unidades
    : modoQtd === "direto"
      ? qtdDiretaAjustada
      : est.unidadesCombo;
  const faltamParaCombo = usandoMix
    ? 0
    : modoQtd === "direto"
      ? ajusteDireto
      : est.faltamParaCombo;

  const linhasWhatsapp = usandoMix
    ? itens.map(
        (i) => `${i.quantidade}x ${i.produto.nome} — ${brl(precoFinal(i.produto) * i.quantidade)}`,
      )
    : [];

  const dados = {
    nome: nome.trim(),
    telefone: telefone.trim(),
    tipoEvento,
    dataEvento,
    pessoas: modoQtd === "pessoas" ? est.pessoas : 0,
    porPessoa: modoQtd === "pessoas" ? est.porPessoa : 0,
    quantidadeDireta: !usandoMix && modoQtd === "direto" ? unidades : undefined,
    unidades,
    unidadesCombo,
    categoria: usandoMix ? `${itens.length} produto(s) do cardápio` : (categoria?.nome ?? ""),
    precoUnit: usandoMix ? 0 : precoUnitBase,
    subtotal,
    validadeDias: cfg.orcamento_validade_dias,
    observacoes: observacoes.trim(),
    itens: linhasWhatsapp,
  };

  const telefoneOk = dados.telefone.replace(/\D/g, "").length >= 10;
  const faltantes: string[] = [];
  if (!nome.trim()) faltantes.push("Seu nome");
  if (!telefoneOk) faltantes.push("Telefone/WhatsApp válido");
  if (unidades <= 0) faltantes.push("Quantidade de salgados");
  if (tipoEvento && !dataEvento) faltantes.push("Data do evento");

  function ajustar(produto: Produto, delta: number) {
    const regra =
      regrasPorProduto.get(produto.id) ??
      regraQuantidade(produto, slugCategoriaPorId.get(produto.categoria_id));
    setEscolhidos((atual) => {
      const proximo = Math.max(0, (atual[produto.id] ?? 0) + delta * regra.passo);
      const copia = { ...atual };
      if (proximo === 0) delete copia[produto.id];
      else copia[produto.id] = proximo;
      return copia;
    });
    setSalvo(false);
  }

  function focarBusca() {
    document.getElementById("orcam-busca")?.focus();
  }

  function pedirWhatsapp(): void {
    toast.error("Deixe seu WhatsApp para enviarmos o orçamento.");
    document.getElementById("orcam-whats")?.focus();
  }

  function enviarWhatsapp(): void {
    if (!telefoneOk) {
      pedirWhatsapp();
      return;
    }
    if (!zapContato) {
      toast.error("Orçamento por WhatsApp ainda não configurado. Use o combo ou fale com a loja.");
      return;
    }
    const texto = `${mensagemOrcamento(dados)}\n\nMeu nome: ${dados.nome || "-"}`;
    window.open(whatsappLink(zapContato, texto), "_blank", "noopener");
  }

  /** Sempre disponível: mesmo sem contato configurado, o cliente leva o orçamento. */
  async function copiarOrcamento(): Promise<void> {
    const texto = `${mensagemOrcamento(dados)}\n\nMeu nome: ${dados.nome || "-"}\nMeu WhatsApp: ${dados.telefone || "-"}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success("Orçamento copiado. Cole no WhatsApp da Néia Salgados.");
    } catch {
      // clipboard bloqueado (http/permission): mostra o texto para copiar na mao
      setTextoManual(texto);
    }
  }

  /**
   * Ação real de solicitação: existe apenas com canal configurado e abre o WhatsApp
   * com o texto pronto. Sem canal, o botão principal é a própria ação de copiar —
   * nunca há duplicação de ações nem mensagem que afirme envio realizado.
   */
  async function solicitar(): Promise<void> {
    if (faltantes.length > 0) {
      toast.error(`Faltam dados: ${faltantes.join(", ")}.`);
      return;
    }
    setEnviando(true);
    try {
      enviarWhatsapp();
      toast.success("Abrimos o WhatsApp com o orçamento pronto. Confira e envie você mesmo.");
    } finally {
      setEnviando(false);
    }
  }

  async function salvar(): Promise<void> {
    if (!user) {
      toast.info("Entre na sua conta para salvar o orçamento, ou envie pelo WhatsApp.");
      return;
    }
    if (!telefoneOk) {
      pedirWhatsapp();
      return;
    }
    setSalvando(true);
    const mix = usandoMix
      ? itens.map((i) => ({
          produto_id: i.produto.id,
          nome: i.produto.nome,
          quantidade: i.quantidade,
          preco_unitario: precoFinal(i.produto),
        }))
      : [
          {
            produto_id: null,
            nome: categoria?.nome ?? "",
            quantidade: unidades,
            preco_unitario: precoUnitBase,
          },
        ];
    const validade = new Date();
    validade.setDate(validade.getDate() + Math.max(1, cfg.orcamento_validade_dias));
    const validadeIso = validade.toISOString().slice(0, 10);
    const origemQuantidade = usandoMix
      ? "mix escolhido no cardápio"
      : modoQtd === "direto"
        ? `${qtdDiretaInformada} un informadas, ajustadas para ${unidades} un`
        : `${est.porPessoa} por pessoa, fechado em ${est.unidadesCombo} un`;

    const payload = {
      user_id: user.id,
      cliente_nome: dados.nome,
      telefone: dados.telefone,
      tipo_evento: dados.tipoEvento,
      pessoas: dados.pessoas,
      data_evento: dados.dataEvento || null,
      mix,
      observacoes: [observacoes.trim(), origemQuantidade, "orçamento do cliente: só salgados, sem serviço de evento"]
        .filter(Boolean)
        .join(" — "),
      subtotal,
      taxa_entrega: TAXA_ENTREGA,
      total: subtotal + TAXA_ENTREGA,
      // O cliente já solicitou: entra como "enviado", não como rascunho da loja.
      status: "enviado",
      validade: validadeIso,
    };

    let { error } = await supabaseLoose.from("orcamentos").insert(payload);
    if (error && /column|does not exist/i.test(error.message)) {
      // Banco sem a migration 0007 (coluna validade): salva sem a data.
      const { validade: _v, ...semValidade } = payload;
      const retry = await supabaseLoose.from("orcamentos").insert(semValidade);
      error = retry.error;
      if (!retry.error)
        toast.warning("Orçamento salvo sem validade — rode a migration 0007 no Supabase.");
    }
    setSalvando(false);
    if (error) {
      toast.error(
        /column|does not exist|schema/i.test(error.message)
          ? "Rode as migrations de orçamento no Supabase (0004 e 0007) para salvar."
          : error.message,
      );
      return;
    }
    setSalvo(true);
    toast.success("Orçamento salvo! A loja entra em contato pelo WhatsApp.");
  }

  const avisoUnico =
    "Fornecemos os salgados para seu evento. Não realizamos serviço de buffet, decoração ou organização.";

  // Estados desabilitados com contraste legível (sem opacity baixa sobre o gradiente).
  const classeBotaoPrimario =
    "mt-4 h-[56px] w-full rounded-[14px] bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] text-base font-extrabold uppercase tracking-wide text-white shadow-[var(--shadow-card)] transition hover:brightness-105 focus-visible:ring-4 focus-visible:ring-[#F6B300]/50 disabled:cursor-not-allowed disabled:border-[#D8CBB8] disabled:bg-[#EDE4D8] disabled:text-[#5F5148] disabled:opacity-100";
  const classeBotaoSecundario =
    "h-[52px] flex-1 disabled:cursor-not-allowed disabled:border-[#D8CBB8] disabled:bg-[#F3EDE4] disabled:text-[#5F5148] disabled:opacity-100";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8" data-testid="orcamento-page">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[#60524C] hover:text-[#500B08]"
      >
        <ArrowLeft className="size-4" /> Voltar ao cardápio
      </Link>
      <PublicPageHero
        icon={FilePenLine}
        titulo="Orçamentos"
        descricao="Monte sua estimativa, confira o resumo e depois solicite seu orçamento. É rápido, simples e sem compromisso!"
        className="mt-3"
      />

      {/* Aviso comercial único — não repetido no formulário, resumo ou rodapé. */}
      <div
        className="mt-4 flex gap-3 rounded-2xl border border-secondary/40 bg-secondary/15 p-4 text-sm"
        data-testid="orcamento-aviso-unico"
      >
        <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="font-semibold text-[#500B08]">{avisoUnico}</p>
      </div>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* 1 — QUANTIDADE E PRODUTOS */}
          <section className="rounded-2xl border border-[#F0D9A8] bg-white p-5 shadow-[var(--shadow-card)]" aria-labelledby="orc-sec-1">
            <h2 id="orc-sec-1" className="font-display text-xl font-bold text-[#500B08]">
              1. Quantidade e produtos
            </h2>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Como informar a quantidade">
              <Button
                type="button"
                size="sm"
                variant={modoQtd === "pessoas" ? "default" : "outline"}
                aria-pressed={modoQtd === "pessoas"}
                onClick={() => setModoQtd("pessoas")}
              >
                Vou informar pessoas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={modoQtd === "direto" ? "default" : "outline"}
                aria-pressed={modoQtd === "direto"}
                onClick={() => setModoQtd("direto")}
              >
                Já sabe quantos salgados deseja?
              </Button>
            </div>

            {modoQtd === "pessoas" ? (
              <div className="mt-4 space-y-4" data-testid="orcamento-modo-pessoas">
                <div className="space-y-1.5">
                  <Label htmlFor="pessoas" className="font-bold text-[#500B08]">
                    Quantidade de pessoas (estimada) *
                  </Label>
                  <Input
                    id="pessoas"
                    type="number"
                    min={1}
                    value={pessoas}
                    onChange={(e) => setPessoas(Math.max(0, Number(e.target.value) || 0))}
                    className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pessoas é a estimativa de convidados — não é a quantidade de salgados.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Quantos salgados por pessoa?</Label>
                  <div className="flex flex-wrap gap-2">
                    {[15, 20, 25, 30].map((op) => (
                      <Button
                        key={op}
                        type="button"
                        size="sm"
                        variant={porPessoa === op ? "default" : "outline"}
                        onClick={() => setPorPessoa(op)}
                      >
                        {op}
                      </Button>
                    ))}
                    {cfg.permitir_personalizado ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={porPessoa === "personalizado" ? "default" : "outline"}
                        onClick={() => setPorPessoa("personalizado")}
                      >
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
                        setPersonalizado(
                          Math.min(
                            cfg.maximo_por_pessoa,
                            Math.max(
                              cfg.minimo_por_pessoa,
                              Number(e.target.value) || cfg.minimo_por_pessoa,
                            ),
                          ),
                        )
                      }
                    />
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Recomendamos entre {cfg.minimo_por_pessoa} e {cfg.maximo_por_pessoa} por pessoa.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-1.5" data-testid="orcamento-modo-direto">
                <Label htmlFor="qtd-direta" className="font-bold text-[#500B08]">
                  Quantos salgados você deseja? *
                </Label>
                <Input
                  id="qtd-direta"
                  type="number"
                  min={0}
                  step={50}
                  inputMode="numeric"
                  value={qtdDireta || ""}
                  onChange={(e) => setQtdDireta(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Ex.: 600"
                  className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]"
                />
                <p className="text-xs text-muted-foreground">
                  Quantidade de produtos, diferente de pessoas. Salgados prontos são vendidos em
                  múltiplos de 50; congelados respeitam a unidade cadastrada quando escolhidos no cardápio.
                </p>
                {qtdDiretaInformada > 0 && ajusteDireto > 0 ? (
                  <p className="rounded-lg bg-[#FFF4D8] p-2.5 text-xs text-[#80511A]" role="status">
                    Você informou {qtdDiretaInformada} un. Ajuste necessário: {qtdDiretaAjustada} un
                    (múltiplo de 50). O valor ajustado é usado no resumo.
                  </p>
                ) : null}
                {usandoMix ? (
                  <p
                    className="mt-2 rounded-lg bg-[#FFF4D8] p-2.5 text-xs text-[#80511A]"
                    role="status"
                    data-testid="orcamento-mix-sobrescreve"
                  >
                    Você selecionou produtos no cardápio: o resumo usa as quantidades desses produtos.
                    Limpe a seleção para usar a quantidade informada acima.
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="cat" className="font-bold text-[#500B08]">
                Tipo de salgado para a estimativa
              </Label>
              <select
                id="cat"
                value={slugCategoria}
                onChange={(e) => setSlugCategoria(e.target.value)}
                className="h-[52px] w-full rounded-[14px] border border-[#E8D9BE] bg-[#FFFCF7] px-3 text-sm"
              >
                {COMBO_CATEGORIAS.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nome} — {brl(c.precoUnit)}/un
                  </option>
                ))}
              </select>
              {categoria ? (
                <p className="text-xs text-muted-foreground">{categoria.descricao}</p>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-[#FFFCF7] p-4">
              <h3 className="font-display text-lg font-bold text-[#500B08]">
                Buscar salgados no cardápio <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Preços reais do catálogo. Ao escolher produtos, o resumo usa o mix selecionado.
              </p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="orcam-busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Ex: coxinha, esfiha, pastel, pizza…"
                  className="pl-9"
                />
              </div>
              {carregandoCatalogo ? (
                <p className="mt-3 text-sm text-muted-foreground" role="status">
                  Carregando cardápio…
                </p>
              ) : erroCatalogo ? (
                <div className="mt-3 rounded-lg bg-[#FFF4D8] p-3 text-sm text-[#80511A]" role="alert">
                  <p>Não foi possível carregar o cardápio. A estimativa simplificada continua disponível.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void recarregarCatalogo()}>
                    Tentar novamente
                  </Button>
                </div>
              ) : catalogo.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground" role="status">
                  Nenhum salgado disponível agora. Use a estimativa por quantidade acima.
                </p>
              ) : (
                <ul className="mt-3 space-y-2" data-testid="orcamento-catalogo">
                  {resultados.map((p) => {
                    const qtd = escolhidos[p.id] ?? 0;
                    const slug = slugCategoriaPorId.get(p.categoria_id);
                    const regra =
                      regrasPorProduto.get(p.id) ?? regraQuantidade(p, slug);
                    const ajustado = qtd > 0 && regra.tipoVenda === "combo_50" && qtd % regra.passo !== 0
                      ? Math.ceil(qtd / regra.passo) * regra.passo
                      : null;
                    return (
                      <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-white p-2">
                        <img
                          src={imagemProduto(p.imagem_url, slug)}
                          alt=""
                          className="size-12 shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{p.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {brl(precoFinal(p))}/un · {regra.unidadeVenda}
                            {regra.tipoVenda === "combo_50" ? ` · múltiplos de ${regra.passo}` : " · unidade livre"}
                            {qtd > 0 ? ` · ${qtd} un = ${brl(precoFinal(p) * qtd)}` : ""}
                          </p>
                          {ajustado ? (
                            <p className="text-xs text-[#80511A]">Vai fechar em {ajustado} un (múltiplo de {regra.passo}).</p>
                          ) : null}
                          {regra.ambiguidade ? (
                            <p className="text-xs text-[#80511A]">{regra.ambiguidade}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={`Remover ${p.nome}`}
                            onClick={() => ajustar(p, -1)}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="w-10 text-center text-sm font-semibold">{qtd}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={`Adicionar ${p.nome}`}
                            onClick={() => ajustar(p, 1)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                  {resultados.length === 0 ? (
                    <li className="text-sm text-muted-foreground">Nada encontrado por “{busca}”.</li>
                  ) : null}
                </ul>
              )}
              {itens.length > 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {itens.length} produto(s) selecionado(s) — {unidadesMix} unidades.{" "}
                  <button type="button" className="underline" onClick={() => setEscolhidos({})}>
                    limpar seleção
                  </button>
                </p>
              ) : null}
            </div>
          </section>

          {/* 2 — DADOS E PREFERÊNCIAS */}
          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]" aria-labelledby="orc-sec-2">
            <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
              <CalendarDays className="size-5" aria-hidden />
              <h2 id="orc-sec-2" className="font-display text-xl font-bold">2. Dados e preferências</h2>
            </div>
            <div className="p-5" data-testid="orcamento-dados">
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="orcam-nome" className="font-bold text-[#500B08]">Seu nome *</Label>
                  <Input
                    id="orcam-nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Como podemos te chamar"
                    className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orcam-whats" className="font-bold text-[#500B08]">Telefone / WhatsApp *</Label>
                  <Input
                    id="orcam-whats"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(11) 90000-0000"
                    inputMode="tel"
                    className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]"
                  />
                  {telefone && !telefoneOk ? (
                    <p className="text-xs text-destructive">Informe DDD + número.</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orcam-evento" className="font-bold text-[#500B08]">Tipo de evento</Label>
                  <select
                    id="orcam-evento"
                    value={tipoEvento}
                    onChange={(e) => setTipoEvento(e.target.value)}
                    className="h-[52px] w-full rounded-[14px] border border-[#E8D9BE] bg-[#FFFCF7] px-3 text-sm"
                  >
                    <option value="">Não é para evento</option>
                    {TIPOS_EVENTO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orcam-data" className="font-bold text-[#500B08]">
                    {tipoEvento ? "Data do evento *" : "Data desejada (opcional)"}
                  </Label>
                  <Input
                    id="orcam-data"
                    type="date"
                    value={dataEvento}
                    onChange={(e) => setDataEvento(e.target.value)}
                    className="h-[52px] rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]"
                  />
                  <p className="text-xs text-[#60524C]">
                    {tipoEvento
                      ? "Confirmamos a disponibilidade desta data pelo canal da loja."
                      : "Se você já tem uma data em mente, podemos considerá-la."}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="orcam-obs" className="font-bold text-[#500B08]">Observações (opcional)</Label>
                <Textarea
                  id="orcam-obs"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex: sabores desejados, local, horário e quantidades aproximadas"
                  maxLength={300}
                  className="min-h-28 rounded-[14px] border-[#E8D9BE] bg-[#FFFCF7]"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Sem sticky: o bloco contentor do sticky era o grid inteiro e a foto
            deslizava para a linha da seção 4, cobrindo botões e textos. */}
        <aside className="space-y-4" aria-label="Resumo e informações">
          {/* 3 — RESUMO DA ESTIMATIVA */}
          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]" aria-labelledby="orc-sec-3" data-testid="orcamento-resumo">
            <div className="brand-gradient px-4 py-3 text-white">
              <h2 id="orc-sec-3" className="font-display text-lg font-bold">3. Resumo do orçamento</h2>
            </div>
            <div className="p-5">
              <p className="text-xs uppercase tracking-wide text-[#897353]">Quantidade de salgados</p>
              <p className="font-display text-3xl font-extrabold text-[#C0000B]" data-testid="orcamento-quantidade">
                {unidades} {unidades === 1 ? "unidade" : "unidades"}
              </p>
              {usandoMix ? (
                <p className="mt-1 text-xs text-[#60524C]">
                  Quantidades escolhidas no cardápio — {itens.length} produto(s), {unidadesMix} unidades.
                </p>
              ) : modoQtd === "direto" ? (
                <p className="mt-1 text-xs text-[#60524C]">
                  Você informou {qtdDiretaInformada} un
                  {ajusteDireto > 0 ? `, ajustadas para ${unidades} un (múltiplo de 50).` : "."}
                </p>
              ) : (
                <p className="mt-1 text-xs text-[#60524C]">
                  Sugestão para {est.pessoas} pessoas × {est.porPessoa} por pessoa
                  {faltamParaCombo > 0 ? `, fechando em ${unidades} un (múltiplo de 50).` : "."}
                </p>
              )}

              <div className="mt-4 border-t border-[#EEE5D8] pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[#897353]">Produtos escolhidos</p>
                {usandoMix ? (
                  <ul className="mt-2 space-y-2" data-testid="orcamento-linhas">
                    {itens.map((i) => (
                      <li key={i.produto.id} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0 text-[#60524C]">
                          {i.quantidade}× {i.produto.nome}
                          <span className="block text-xs">Unitário: {brl(precoFinal(i.produto))}</span>
                        </span>
                        <span className="shrink-0 font-semibold">{brl(precoFinal(i.produto) * i.quantidade)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#60524C]" data-testid="orcamento-linhas">
                    {unidades} × {categoria?.nome ?? "salgados"} — unitário {brl(precoUnitBase)}
                  </p>
                )}
              </div>

              <div className="mt-3 space-y-1.5 border-t border-[#EEE5D8] pt-3 text-sm">
                <div className="flex justify-between text-[#60524C]">
                  <span>Subtotal dos produtos</span>
                  <span>{brl(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="font-display font-bold text-[#500B08]">Estimativa final dos produtos</span>
                  <span className="font-display text-2xl font-extrabold text-[#C0000B]" data-testid="orcamento-total">
                    {brl(subtotal)}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-xs text-[#60524C]">Entrega a calcular conforme endereço.</p>
              {cfg.orcamento_validade_dias > 0 ? (
                <p className="mt-1 text-xs text-[#60524C]">
                  Estimativa válida por {cfg.orcamento_validade_dias} dias.
                </p>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            <div className="brand-gradient px-4 py-3 text-white">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Check className="size-5" aria-hidden /> Vantagens do nosso orçamento
              </h2>
            </div>
            <ul className="space-y-3 p-5 text-sm text-[#60524C]">
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Atendimento personalizado para o seu evento.</li>
              <li className="flex gap-2"><ShoppingBag className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Combos montados conforme a necessidade informada.</li>
              <li className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Agendamento com antecedência, sujeito a confirmação.</li>
              <li className="flex gap-2"><MessageCircle className="mt-0.5 size-4 shrink-0 text-[#D50909]" aria-hidden /> Resposta pelo canal de contato configurado da loja.</li>
            </ul>
          </section>
          <section className="rounded-[22px] border border-[#F6B300] bg-[#FFF4D8] p-5 text-sm shadow-[var(--shadow-card)]">
            <h2 className="font-display text-lg font-bold text-[#500B08]">Como funciona?</h2>
            <p className="mt-2 leading-relaxed text-[#60524C]">
              Monte a estimativa, confira o resumo e solicite. A equipe responde com disponibilidade
              e valor final pelo canal configurado da loja.
            </p>
            <Link to="/ajuda" className="mt-3 inline-block font-semibold text-[#B9000B] underline">
              Ver perguntas frequentes
            </Link>
          </section>
          {/* Cartão da arte dimensionado junto à imagem: evita faixas vazias na coluna. */}
          <section className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
            {/* Proporção original preservada (sem aspect fixo, sem object-cover, sem esticamento). */}
            <img
              src={arteOrcamento}
              alt="Arte aprovada Néia Salgados"
              className="h-auto w-full max-w-full object-contain"
              data-testid="orcamento-arte-lateral"
            />
          </section>
        </aside>

        {/* 4 — ENVIO OU SALVAMENTO (sempre depois do resumo) */}
        <section className="relative z-10 min-w-0 lg:col-span-2" aria-labelledby="orc-sec-4" data-testid="orcamento-envio">
          <div className="rounded-[22px] border border-[#F0D9A8] bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 id="orc-sec-4" className="font-display text-xl font-bold text-[#500B08]">
              4. Envio ou salvamento do orçamento
            </h2>
            {faltantes.length > 0 ? (
              <div className="mt-3 rounded-lg bg-[#FFF4D8] p-3 text-sm text-[#80511A]" role="status" data-testid="orcamento-faltantes">
                <p className="font-semibold">Faltam dados para solicitar:</p>
                <ul className="mt-1 list-disc pl-5">
                  {faltantes.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <p className="mt-2">Preencha os campos acima; as informações já digitadas foram mantidas.</p>
              </div>
            ) : null}

            {/* Sem canal automático, o próprio botão principal é a ação de copiar:
                uma única ação, com o nome do que realmente faz. */}
            {zapContato ? (
              <Button
                type="button"
                size="lg"
                className={classeBotaoPrimario}
                disabled={faltantes.length > 0 || enviando}
                onClick={() => void solicitar()}
                data-testid="orcamento-solicitar"
              >
                {enviando ? (
                  <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 size-5" aria-hidden />
                )}
                {enviando ? "Preparando…" : "Solicitar orçamento"}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className={classeBotaoPrimario}
                disabled={faltantes.length > 0 || unidades <= 0}
                onClick={() => void copiarOrcamento()}
                data-testid="orcamento-copiar"
              >
                {copiado ? <Check className="mr-2 size-5" aria-hidden /> : <Copy className="mr-2 size-5" aria-hidden />}
                {copiado ? "Copiado" : "Copiar orçamento"}
              </Button>
            )}

            <p className="mt-2 text-xs leading-relaxed text-[#5F5148]" data-testid="orcamento-sem-canal">
              {zapContato
                ? "O botão abre o WhatsApp com o texto pronto. Confira e envie você mesmo — nenhum envio é confirmado automaticamente."
                : "Envio automático não configurado nesta prévia. Copie o orçamento e envie pelo canal da loja — nenhum envio é confirmado automaticamente."}
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {zapContato ? (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className={classeBotaoSecundario}
                  onClick={() => void copiarOrcamento()}
                  disabled={unidades <= 0}
                  data-testid="orcamento-copiar"
                >
                  {copiado ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
                  {copiado ? "Copiado" : "Copiar orçamento"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="lg"
                variant="outline"
                className={classeBotaoSecundario}
                onClick={() => void salvar()}
                disabled={salvando || salvo || unidades <= 0 || !user}
                data-testid="orcamento-salvar"
              >
                {salvo ? <Check className="mr-2 size-4" /> : <Save className="mr-2 size-4" />}
                {salvo ? "Orçamento salvo" : salvando ? "Salvando..." : "Salvar orçamento"}
              </Button>
            </div>
            {!user ? (
              <p className="mt-2 text-xs leading-relaxed text-[#5F5148]" data-testid="orcamento-salvar-indisponivel">
                Salvar orçamento requer conta da equipe e banco configurado. Sem login, use Copiar orçamento.
              </p>
            ) : null}
            {textoManual ? (
              <div className="mt-3 space-y-1">
                <Label htmlFor="orcam-texto">
                  Não conseguimos copiar automático — selecione e copie:
                </Label>
                <Textarea
                  id="orcam-texto"
                  readOnly
                  value={textoManual}
                  rows={8}
                  className="text-xs"
                />
              </div>
            ) : null}
            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link to="/combo">Montar combo agora</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
