import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Check, Info, MessageCircle, Minus, Plus, Save, Search } from "lucide-react";
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
import { imagemProduto, precoFinal, tipoVendaProduto, useCategorias, useProdutos, type Produto } from "@/lib/catalog";
import { usePerfil, useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Orçamento de salgados — Néia Salgados" },
      {
        name: "description",
        content:
          "Calcule quantos salgados o seu evento precisa e receba um orçamento pelo WhatsApp. Fornecemos somente os salgados.",
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

const TIPOS_EVENTO = ["Aniversário", "Casamento", "Chá de bebê", "Empresa", "Festa", "Confraternização", "Outro"];

type ItemEscolhido = { produto: Produto; quantidade: number };

function Calculadora() {
  const { data: config } = useCalculadoraConfig();
  const cfg = config ?? DEFAULT_CALCULADORA_CONFIG;
  const { user } = useSession();
  const { data: perfil } = usePerfil(user?.id);
  const { data: produtos } = useProdutos();
  const { data: categorias } = useCategorias();
  const navigate = useNavigate();

  const [pessoas, setPessoas] = useState(30);
  const [porPessoa, setPorPessoa] = useState<number | "personalizado">(cfg.por_pessoa_padrao);
  const [personalizado, setPersonalizado] = useState(cfg.por_pessoa_padrao);
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

  const slugCategoriaPorId = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.id, c.slug])),
    [categorias],
  );

  const catalogo = useMemo(() => (produtos ?? []).filter((p) => p.disponivel), [produtos]);

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo
      ? catalogo.filter(
          (p) => p.nome.toLowerCase().includes(termo) || (p.descricao ?? "").toLowerCase().includes(termo),
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

  // Com produtos escolhidos o orçamento usa o mix real; senão usa pessoas x por pessoa.
  const totalMix = itens.reduce((acc, i) => acc + precoFinal(i.produto) * i.quantidade, 0);
  const unidadesMix = itens.reduce((acc, i) => acc + i.quantidade, 0);
  const usandoMix = itens.length > 0;
  const unidades = usandoMix ? unidadesMix : est.unidades;
  const subtotal = usandoMix ? totalMix : est.subtotal;

  const linhasWhatsapp = usandoMix
    ? itens.map((i) => `${i.quantidade}x ${i.produto.nome} — ${brl(precoFinal(i.produto) * i.quantidade)}`)
    : [];

  const dados = {
    nome: nome.trim(),
    telefone: telefone.trim(),
    tipoEvento,
    dataEvento,
    pessoas: est.pessoas,
    porPessoa: est.porPessoa,
    unidades,
    unidadesCombo: usandoMix ? unidades : est.unidadesCombo,
    categoria: usandoMix ? `${itens.length} produto(s) do cardápio` : (categoria?.nome ?? ""),
    precoUnit: usandoMix ? 0 : (categoria?.precoUnit ?? 0),
    subtotal,
    validadeDias: cfg.orcamento_validade_dias,
    observacoes: observacoes.trim(),
    itens: linhasWhatsapp,
  };

  const telefoneOk = dados.telefone.replace(/\D/g, "").length >= 10;

  function ajustar(produto: Produto, delta: number) {
    setEscolhidos((atual) => {
      const proximo = Math.max(0, (atual[produto.id] ?? 0) + delta);
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
      : [{ produto_id: null, nome: categoria?.nome ?? "", quantidade: est.unidadesCombo, preco_unitario: categoria?.precoUnit ?? 0 }];
    const validade = new Date();
    validade.setDate(validade.getDate() + Math.max(1, cfg.orcamento_validade_dias));
    const validadeIso = validade.toISOString().slice(0, 10);

    const payload = {
      user_id: user.id,
      cliente_nome: dados.nome,
      telefone: dados.telefone,
      tipo_evento: dados.tipoEvento,
      pessoas: est.pessoas,
      data_evento: dados.dataEvento || null,
      mix,
      observacoes: [
        observacoes.trim(),
        usandoMix ? "mix escolhido no cardápio" : `${est.porPessoa} por pessoa, fechado em ${est.unidadesCombo} un`,
        "orçamento do cliente: só salgados, sem serviço de evento",
      ]
        .filter(Boolean)
        .join(" — "),
      subtotal,
      taxa_entrega: TAXA_ENTREGA,
      total: subtotal + TAXA_ENTREGA,
      // O cliente já solicitou: entra como "enviado", não como rascunho da loja.
      status: "enviado",
      validade: validadeIso,
    };

    let { error } = await supabase.from("orcamentos").insert(payload);
    if (error && /column|does not exist/i.test(error.message)) {
      // Banco sem a migration 0007 (coluna validade): salva sem a data.
      const { validade: _v, ...semValidade } = payload;
      const retry = await supabase.from("orcamentos").insert(semValidade);
      error = retry.error;
      if (!retry.error) toast.warning("Orçamento salvo sem validade — rode a migration 0007 no Supabase.");
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar ao cardápio
      </Link>
      <h1 className="font-display text-3xl">Orçamento de salgados</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Calcule quantos salgados o seu evento precisa e receba o orçamento no WhatsApp, sem compromisso.
      </p>

      <div className="mt-4 flex gap-3 rounded-2xl border border-secondary/40 bg-secondary/15 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-semibold">Fornecemos somente os salgados — não realizamos eventos.</p>
          <p className="text-muted-foreground">
            Não temos buffet, equipe de salgadeiro nem serviço de buffet: fazemos{" "}
            <strong className="text-foreground">entregas e retiradas</strong>, com os salgados sempre prontos —
            entregues no seu endereço ou retirados na loja. O buffet, a decoração, as bebidas e o serviço
            ficam por conta do organizador(a) do evento. O orçamento abaixo é só dos salgados.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-xl">
          <Calculator className="size-5" /> 1. Quantidade de salgados
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
        <h2 className="font-display text-xl">2. Buscar salgados no cardápio</h2>
        <p className="text-xs text-muted-foreground">
          Opcional: se já souber o que quer, procure pelo nome e escolha os itens. O orçamento passa a usar os
          preços reais do cardápio.
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
        {catalogo.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Cardápio carregando…</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {resultados.map((p) => {
              const qtd = escolhidos[p.id] ?? 0;
              const slug = slugCategoriaPorId.get(p.categoria_id);
              const combo = tipoVendaProduto(p, slug) === "combo_50";
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagemProduto(p.imagem_url, slug)}
                    alt=""
                    className="size-12 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {brl(precoFinal(p))}/un
                      {combo ? " • múltiplos de 50" : ""}
                      {qtd > 0 ? ` • ${qtd} un = ${brl(precoFinal(p) * qtd)}` : ""}
                    </p>
                    {combo && qtd % 50 !== 0 && qtd > 0 ? (
                      <p className="text-xs text-secondary">
                        vai fechar em {qtd + (50 - (qtd % 50))} un (múltiplo de 50)
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="icon" variant="outline" aria-label={`Remover ${p.nome}`} onClick={() => ajustar(p, -1)}>
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-10 text-center text-sm font-semibold">{qtd}</span>
                    <Button type="button" size="icon" variant="outline" aria-label={`Adicionar ${p.nome}`} onClick={() => ajustar(p, combo ? 50 : 1)}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
            {resultados.length === 0 ? <li className="text-sm text-muted-foreground">Nada encontrado por “{busca}”.</li> : null}
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

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">3. Seus dados</h2>
        <p className="text-xs text-muted-foreground">É só para a gente saber com quem falar sobre os salgados.</p>
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
            <Label htmlFor="orcam-evento">É para um evento?</Label>
            <select id="orcam-evento" value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Não é para evento</option>
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Só para referência — a gente não organiza o seu evento, fornece os salgados.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orcam-data">Data desejada</Label>
            <Input id="orcam-data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
            <p className="text-xs text-muted-foreground">Confirmamos a disponibilidade desta data pelo WhatsApp.</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="orcam-obs">Observações</Label>
          <Textarea id="orcam-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex: sem cebola, para as 20h, montar com 3 sabores" maxLength={300} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">4. Resumo</h2>
        <p className="mt-2 font-display text-2xl">{unidades} salgados</p>
        <p className="text-sm text-muted-foreground">
          {usandoMix ? (
            <>
              Itens escolhidos no cardápio: <strong>{unidades} unidades</strong> em {itens.length} produto(s).
            </>
          ) : (
            <>
              Para comprar em combos (múltiplos de 50), sugerimos <strong>{est.unidadesCombo} unidades</strong>
              {est.faltamParaCombo > 0 ? <> (faltam {est.faltamParaCombo} para fechar a caixa)</> : null}.
            </>
          )}
        </p>
        <div className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
          {usandoMix ? (
            itens.map((i) => (
              <div key={i.produto.id} className="flex justify-between">
                <span className="text-muted-foreground">
                  {i.quantidade}x {i.produto.nome}
                </span>
                <span>{brl(precoFinal(i.produto) * i.quantidade)}</span>
              </div>
            ))
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {est.unidadesCombo} x {categoria?.nome} ({brl(categoria?.precoUnit ?? 0)})
              </span>
              <span>{brl(est.subtotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entregas e retiradas</span>
            <span>combinada na confirmação</span>
          </div>
          <div className="flex justify-between font-display text-lg">
            <span>Estimativa dos salgados</span>
            <span className="text-primary">{brl(subtotal)}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Estimativa válida por {cfg.orcamento_validade_dias} dias. O valor final confirma o mix e a taxa de entrega.
        </p>
        <p className="mt-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
          <strong className="text-foreground">Fica claro:</strong> este orçamento é somente dos salgados que a
          gente fornece. Não realizamos eventos, não montamos buffet e não servimos os salgados no local — a
          organização do evento é do cliente.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="lg" className="flex-1" onClick={enviarWhatsapp} disabled={unidades <= 0}>
            <MessageCircle className="mr-2 size-4" /> Solicitar pelo WhatsApp
          </Button>
          {user ? (
            <Button type="button" size="lg" variant="outline" className="flex-1" onClick={salvar} disabled={salvando || salvo || unidades <= 0}>
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