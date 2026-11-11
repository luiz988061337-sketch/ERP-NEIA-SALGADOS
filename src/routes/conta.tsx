import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, MapPin, Star, Trophy, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-steps";
import { ProductCard } from "@/components/product-card";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import type { Database } from "@/integrations/supabase/types";
import { brl, dataHora } from "@/lib/format";
import { usePerfil, useSession, useStaffOnly } from "@/lib/session";
import { useAvaliacoes, useCategorias, useProdutos, precoFinal, tipoVendaProduto, type Produto } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { COMBO_CATEGORIAS } from "@/lib/combo";
import { MINIMO_COMBO, isMultiploCombo } from "@/lib/totals";
import { pedidoHabitual } from "@/lib/inteligencia";
import { useCrmSettings } from "@/lib/crm";
import { DEFAULT_FIDELIDADE, podeResgatar, type FidelidadeCfg } from "@/lib/fidelidade";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Néia Salgados" },
      { name: "description", content: "Pedidos, favoritos, fidelidade, endereços e avaliações." },
    ],
  }),
  component: Conta,
});

const PONTOS_POR_REAL = 0.2; // legado: 1 ponto a cada R$ 5 (regra atual em Configurações → CRM)

function Conta() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { staffOnly, painel } = useStaffOnly();
  const { data: perfil } = usePerfil(user?.id);
  const queryClient = useQueryClient();
  const [aba, setAba] = useState("pedidos");

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  // Guard de convidado tratado no render (sem redirecionar para /auth).

  const { data: pedidos } = useQuery({
    queryKey: ["meus-pedidos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*, pedido_item_componentes(*))")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: favoritosIds } = useQuery({
    queryKey: ["favoritos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("favoritos").select("produto_id").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((f: { produto_id: string }) => f.produto_id);
    },
  });

  const { data: produtos } = useProdutos();
  const { data: avaliacoes } = useAvaliacoes();
  const { data: categorias } = useCategorias();
  const slugCategoriaPorId = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.id, c.slug])),
    [categorias],
  );

  const { data: enderecos } = useQuery({
    queryKey: ["enderecos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("enderecos").select("*").eq("user_id", user!.id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: minhasAvaliacoes } = useQuery({
    queryKey: ["minhas-avaliacoes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("avaliacoes").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const favoritos = (produtos ?? []).filter((p) => favoritosIds?.includes(p.id));
  const totalGasto = (pedidos ?? []).filter((p: any) => p.status !== "cancelado").reduce((a: number, p: any) => a + Number(p.total), 0);
  const pontos = perfil?.pontos ?? 0;
  const { data: fidSettings } = useCrmSettings();
  const fid: FidelidadeCfg = {
    ativo: fidSettings?.fid_ativo ?? DEFAULT_FIDELIDADE.ativo,
    reaisPorPonto: fidSettings?.fid_reais_por_ponto ?? DEFAULT_FIDELIDADE.reaisPorPonto,
    metaPontos: fidSettings?.fid_meta_pontos ?? DEFAULT_FIDELIDADE.metaPontos,
    recompensaValor: fidSettings?.fid_recompensa_valor ?? DEFAULT_FIDELIDADE.recompensaValor,
  };
  const progresso = Math.min(100, (pontos / fid.metaPontos) * 100);
  const { add, clear } = useCart();

  /** Recompõe itens com PREÇOS ATUAIS; informa indisponíveis. Retorna {adicionados, indisponiveis}. */
  function montarItens(
    itens: {
      produto_id: string | null;
      nome: string;
      quantidade: number;
      pedido_item_componentes?: { produto_id: string; quantidade: number }[] | null;
    }[],
  ) {
    const adicionados: string[] = [];
    const indisponiveis: string[] = [];
    const mantidos: string[] = [];
    for (const it of itens) {
      const prod = (produtos ?? []).find((p) => p.id === it.produto_id);
      if (prod) {
        if (!prod.disponivel || prod.estoque <= 0) {
          indisponiveis.push(it.nome);
          continue;
        }
        const ehCombo = tipoVendaProduto(prod, slugCategoriaPorId.get(prod.categoria_id) ?? "") === "combo_50";
        add(
          {
            id: prod.id,
            nome: prod.nome,
            preco: precoFinal(prod),
            imagem: prod.imagem_url,
            produtoId: prod.id,
            combo: ehCombo,
          },
          ehCombo ? MINIMO_COMBO : it.quantidade,
        );
        adicionados.push(prod.nome);
        continue;
      }
      // Item de combo montado (sem produto_id).
      const m = it.nome.match(/^Combo (.+?) (\d+)un/);
      const cat = m ? COMBO_CATEGORIAS.find((c) => c.nome === m[1]) : undefined;
      const total = m ? Number(m[2]) : NaN;
      const componentes = (it.pedido_item_componentes ?? []).map((c) => ({
        produtoId: c.produto_id,
        quantidade: Number(c.quantidade),
      }));

      if (componentes.length > 0 && cat && Number.isFinite(total) && isMultiploCombo(total)) {
        const soma = componentes.reduce((s, c) => s + c.quantidade, 0);
        if (soma !== total) {
          mantidos.push(it.nome);
          continue;
        }
        const prods = componentes.map((c) => (produtos ?? []).find((p) => p.id === c.produtoId));
        if (prods.some((p) => !p || !p.disponivel || p.estoque <= 0)) {
          indisponiveis.push(it.nome);
          continue;
        }
        const cats = new Set(prods.map((p) => p!.categoria_id));
        if (cats.size !== 1) {
          mantidos.push(it.nome);
          continue;
        }
        const precoBanco = categorias?.find((c) => c.id === [...cats][0])?.combo_preco_unit;
        add(
          {
            id: `combo-${cat.slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            nome: it.nome,
            preco: Number(precoBanco ?? cat.precoUnit),
            imagem: null,
            produtoId: null,
            combo: true,
            componentes,
          },
          total,
        );
        adicionados.push(it.nome);
      } else if (cat && Number.isFinite(total) && isMultiploCombo(total)) {
        // Pedido antigo sem composição: mantém o comportamento legado (sem
        // componentes). A criação atômica rejeita este item em modo controlado.
        const precoBanco = categorias?.find((c) => c.slug === cat.slug)?.combo_preco_unit;
        add(
          {
            id: `combo-${cat.slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            nome: it.nome,
            preco: Number(precoBanco ?? cat.precoUnit),
            imagem: null,
            produtoId: null,
            combo: true,
          },
          total,
        );
        adicionados.push(it.nome);
      } else if (it.produto_id) {
        indisponiveis.push(it.nome);
      } else {
        mantidos.push(it.nome);
      }
    }
    return { adicionados, indisponiveis, mantidos };
  }

  function repetirPedido(p: any) {
    const itens = ((p.pedido_itens ?? []) as {
      produto_id: string | null;
      nome: string;
      quantidade: number;
      pedido_item_componentes?: { produto_id: string; quantidade: number }[] | null;
    }[]);
    if (itens.length === 0) {
      toast.error("Este pedido não tem itens para repetir.");
      return;
    }
    clear();
    const r = montarItens(itens);
    if (r.adicionados.length === 0) {
      toast.error("Nenhum item disponível no momento.");
      return;
    }
    if (r.indisponiveis.length > 0) toast.warning(`Indisponíveis agora: ${r.indisponiveis.slice(0, 3).join(", ")}${r.indisponiveis.length > 3 ? "…" : ""}`);
    if (r.mantidos.length > 0) toast.warning("Alguns itens personalizados não puderam ser recalculados e ficaram de fora.");
    toast.success(`${r.adicionados.length} item(ns) no carrinho com preços atuais. Confira antes de finalizar.`);
    navigate({ to: "/carrinho" });
  }

  const habitual = pedidoHabitual(((pedidos ?? []) as { status: string; pedido_itens?: { produto_id: string | null; nome: string; preco_unitario: string | number; quantidade: number }[] }[])).slice(0, 4);

  function repetirHabitual() {
    const itens = habitual
      .filter((h) => h.produto_id)
      .map((h) => ({ produto_id: h.produto_id, nome: h.nome, quantidade: Math.max(1, Math.round(h.qtdTotal / Math.max(1, h.vezes))) }));
    if (itens.length === 0) {
      toast.error("Sem histórico suficiente para montar o pedido habitual.");
      return;
    }
    clear();
    const r = montarItens(itens);
    if (r.adicionados.length === 0) {
      toast.error("Os produtos habituais estão indisponíveis no momento.");
      return;
    }
    if (r.indisponiveis.length > 0) toast.warning(`Indisponíveis agora: ${r.indisponiveis.slice(0, 3).join(", ")}`);
    toast.success("Pedido habitual no carrinho com preços atuais.");
    navigate({ to: "/carrinho" });
  }

  async function removerFavorito(id: string) {
    await supabase.from("favoritos").delete().eq("produto_id", id).eq("user_id", user!.id);
    queryClient.invalidateQueries({ queryKey: ["favoritos"] });
  }

  if (staffOnly) {
    return <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>;
  }

  // Sem conta: cliente não usa login — pede direto pelo cardápio (sem /auth).
  if (!loading && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl">Meus pedidos</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Aqui ficam os pedidos de quem tem conta. Você pode pedir direto pelo cardápio, sem login —
          basta informar nome e WhatsApp no checkout.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Ver cardápio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl">Minha conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {perfil?.nome ?? user?.email} {perfil?.telefone ? `• ${perfil.telefone}` : ""} • {brl(totalGasto)} em pedidos
      </p>

      {/* Fidelidade */}
      <section className="mt-4 rounded-xl border border-secondary/60 bg-gradient-to-r from-card to-secondary/20 p-4">
        <p className="flex items-center gap-2 font-display text-lg"><Trophy className="size-5 text-primary" /> Fidelidade Néia</p>
        <p className="text-sm text-muted-foreground">
          Você tem <strong className="text-foreground">{pontos} pontos</strong>. A cada {brl(fid.reaisPorPonto)} em pedidos você ganha 1 ponto. Com {fid.metaPontos} pontos você ganha um cupom de {brl(fid.recompensaValor)}.
        </p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{pontos}/{fid.metaPontos} pontos</p>
        <ResgateFidelidade pontos={pontos} userId={user?.id} telefoneAtual={perfil?.telefone ?? ""} cfg={fid} />
      </section>

      <Tabs value={aba} onValueChange={setAba} className="mt-4">
        <TabsList className="no-scrollbar flex w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="pedidos" className="shrink-0">Pedidos</TabsTrigger>
          <TabsTrigger value="favoritos" className="shrink-0">Favoritos</TabsTrigger>
          <TabsTrigger value="enderecos" className="shrink-0">Endereços</TabsTrigger>
          <TabsTrigger value="avaliar" className="shrink-0">Avaliar</TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4">
          {habitual.length > 0 ? (
            <section className="mb-4 rounded-xl border border-primary/40 bg-card p-4" aria-label="Pedido habitual">
              <p className="font-display text-lg">Seu pedido habitual</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {habitual.map((h) => (
                  <li key={h.produto_id ?? h.nome}>• {h.nome} <span className="text-xs">(pedido {h.vezes}x)</span></li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={repetirHabitual}>Repetir pedido habitual</Button>
                {pedidos && pedidos.length > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => repetirPedido(pedidos[0])}>Comprar novamente (último)</Button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Preços sempre recalculados pelos valores atuais.</p>
            </section>
          ) : null}
          <ul className="space-y-3">
            {(pedidos ?? []).map((p: any) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-4">
                <Link
                  to="/pedido/$id"
                  params={{ id: p.id }}
                  className="flex items-center gap-3 transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  <div className="flex-1">
                    <p className="font-display">Pedido nº {p.numero}</p>
                    <p className="text-xs text-muted-foreground">{dataHora(p.created_at)} • {(p.pedido_itens ?? []).length} itens</p>
                  </div>
                  <StatusBadge status={p.status} />
                  <span className="font-display text-primary">{brl(p.total)}</span>
                </Link>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/pedido/$id" params={{ id: p.id }}>Ver pedido</Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => repetirPedido(p)}>Repetir pedido</Button>
                </div>
              </li>
            ))}
          </ul>
          {pedidos && pedidos.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">Você ainda não fez pedidos.</p>
              <Button asChild className="mt-4"><Link to="/">Ver cardápio</Link></Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="favoritos" className="mt-4">
          {favoritos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Toque no <Heart className="inline size-4" /> dos produtos no cardápio para favoritar.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {favoritos.map((p: Produto) => (
                <div key={p.id} className="relative">
                  <ProductCard produto={p} slugCategoria="" favorito onToggleFavorito={() => removerFavorito(p.id)} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="enderecos" className="mt-4">
          <Enderecos userId={user?.id} lista={enderecos ?? []} />
        </TabsContent>

        <TabsContent value="avaliar" className="mt-4">
          <AvaliarProdutos
            pedidos={pedidos ?? []}
            produtos={produtos ?? []}
            minhas={minhasAvaliacoes ?? []}
            userId={user?.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function ResgateFidelidade({ pontos, userId, telefoneAtual, cfg }: { pontos: number; userId: string | undefined; telefoneAtual: string; cfg: FidelidadeCfg }) {
  const queryClient = useQueryClient();
  const [telefone, setTelefone] = useState(telefoneAtual);
  const [enviando, setEnviando] = useState(false);
  const [ultimoCupom, setUltimoCupom] = useState<string | null>(null);

  useEffect(() => {
    setTelefone(telefoneAtual);
  }, [telefoneAtual]);

  const telDig = telefone.replace(/\D/g, "");
  const { data: meusCupons } = useQuery({
    queryKey: ["meus-cupons", telDig],
    enabled: telDig.length >= 10,
    queryFn: async () => {
      const { data, error } = await supabase.from("cupons").select("codigo, valor, validade_fim, ativo").eq("cliente_telefone", telDig).eq("ativo", true).order("validade_fim");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function resgatar() {
    if (!userId) return;
    const chk = podeResgatar(pontos, cfg);
    if (!chk.ok) {
      toast.error(chk.motivo);
      return;
    }
    if (telDig.length < 10) {
      toast.error("Informe seu WhatsApp para vincular o cupom.");
      return;
    }
    if (!confirm(`Resgatar ${cfg.metaPontos} pontos por um cupom de ${brl(cfg.recompensaValor)}?`)) return;
    setEnviando(true);
    try {
      const { data: codigoGerado, error } = await supabase.rpc("resgatar_fidelidade", { p_telefone: telDig });
      if (error) throw error;
      const codigo = String(codigoGerado ?? "");
      if (telefone !== telefoneAtual) {
        await supabase.from("profiles").update({ telefone }).eq("id", userId);
      }
      setUltimoCupom(codigo);
      toast.success(`Cupom ${codigo} gerado! Válido por 30 dias, uso único.`);
      queryClient.invalidateQueries({ queryKey: ["perfil", userId] });
      queryClient.invalidateQueries({ queryKey: ["meus-cupons"] });
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível resgatar. Rode a migração 0010 no Supabase.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Seu WhatsApp" inputMode="tel" className="max-w-52" />
        <Button size="sm" disabled={enviando || pontos < cfg.metaPontos} onClick={resgatar}>
          {enviando ? "Gerando…" : `Resgatar ${brl(cfg.recompensaValor)} (${cfg.metaPontos} pts)`}
        </Button>
      </div>
      {ultimoCupom ? <p className="mt-1 text-sm">Seu cupom: <strong>{ultimoCupom}</strong> — use no checkout.</p> : null}
      {(meusCupons ?? []).length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {(meusCupons ?? []).map((c: any) => (
            <li key={c.codigo}>🎟️ {c.codigo} — {brl(c.valor)}{c.validade_fim ? ` • até ${new Date(c.validade_fim).toLocaleDateString("pt-BR")}` : ""}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Enderecos({ userId, lista }: { userId: string | undefined; lista: any[] }) {  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("enderecos").insert({
      user_id: userId,
      rua: String(f.get("rua")),
      numero: String(f.get("numero") ?? ""),
      bairro: String(f.get("bairro")),
      complemento: String(f.get("complemento") ?? ""),
      referencia: String(f.get("referencia") ?? ""),
    });
    if (error) toast.error("Não foi possível salvar.");
    else {
      toast.success("Endereço salvo!");
      (e.target as HTMLFormElement).reset();
      setAberto(false);
      queryClient.invalidateQueries({ queryKey: ["enderecos"] });
    }
  }

  async function excluir(id: string) {
    await supabase.from("enderecos").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["enderecos"] });
  }

  return (
    <div>
      <Button size="sm" onClick={() => setAberto(!aberto)}><Plus className="mr-1 size-4" /> Novo endereço</Button>
      {aberto && (
        <form onSubmit={salvar} className="mt-3 grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Rua / Avenida</Label><Input name="rua" required /></div>
          <div className="space-y-1"><Label>Número</Label><Input name="numero" /></div>
          <div className="space-y-1"><Label>Bairro</Label><Input name="bairro" required /></div>
          <div className="space-y-1"><Label>Complemento</Label><Input name="complemento" /></div>
          <div className="space-y-1"><Label>Referência</Label><Input name="referencia" /></div>
          <Button type="submit" className="sm:col-span-2">Salvar endereço</Button>
        </form>
      )}
      <ul className="mt-3 space-y-2">
        {lista.map((e) => (
          <li key={e.id} className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="flex-1">{e.rua}, {e.numero} — {e.bairro} {e.complemento ? `(${e.complemento})` : ""}</span>
            <Button size="icon" variant="ghost" onClick={() => excluir(e.id)}><Trash2 className="size-4" /></Button>
          </li>
        ))}
        {lista.length === 0 && <li className="text-sm text-muted-foreground">Nenhum endereço salvo.</li>}
      </ul>
    </div>
  );
}

function AvaliarProdutos({ pedidos, produtos, minhas, userId }: { pedidos: any[]; produtos: Produto[]; minhas: any[]; userId: string | undefined }) {
  const queryClient = useQueryClient();
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [prazos, setPrazos] = useState<Record<string, number>>({});
  const [atends, setAtends] = useState<Record<string, number>>({});
  const [coment, setComent] = useState<Record<string, string>>({});
  const [autoriza, setAutoriza] = useState<Record<string, boolean>>({});

  const comprados = [...new Set((pedidos ?? []).flatMap((p: any) => (p.pedido_itens ?? []).map((i: any) => i.produto_id).filter(Boolean)))];
  const paraAvaliar = produtos.filter((p) => comprados.includes(p.id));
  const avaliados = new Set(minhas.map((m) => m.produto_id));

  function Estrelas({ valor, onMudar, rotulo }: { valor: number; onMudar: (n: number) => void; rotulo: string }) {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => onMudar(n)} aria-label={`${rotulo}: ${n} estrelas`}>
              <Star className={cn("size-6", valor >= n ? "fill-secondary text-secondary" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  async function enviar(produtoId: string) {
    if (!userId) return;
    const nota = notas[produtoId] ?? 0;
    if (nota < 1 || nota > 5) {
      toast.error("Escolha de 1 a 5 estrelas para a qualidade.");
      return;
    }
    const payload: Record<string, any> = {
      produto_id: produtoId,
      user_id: userId,
      nota,
      comentario: coment[produtoId] ?? "",
      prazo: prazos[produtoId] ?? null,
      atendimento: atends[produtoId] ?? null,
      autoriza_publicar: !!autoriza[produtoId],
    };
    let { error } = await supabase.from("avaliacoes").upsert(payload, { onConflict: "produto_id,user_id" });
    if (error && String(error.message ?? "").includes("column")) {
      const { prazo: _pz, atendimento: _at, autoriza_publicar: _ap, ...legacy } = payload;
      const retry = await supabase.from("avaliacoes").upsert(legacy, { onConflict: "produto_id,user_id" });
      error = retry.error;
      if (!error) toast.warning("Avaliação salva sem prazo/atendimento — rode a migração 0004.");
    }
    if (error) toast.error("Não foi possível avaliar.");
    else {
      toast.success("Obrigado pela avaliação!");
      queryClient.invalidateQueries({ queryKey: ["minhas-avaliacoes"] });
      queryClient.invalidateQueries({ queryKey: ["avaliacoes"] });
    }
  }

  if (paraAvaliar.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Faça um pedido para avaliar os produtos.</p>;
  }

  return (
    <ul className="space-y-3">
      {paraAvaliar.map((p) => (
        <li key={p.id} className="rounded-xl border border-border bg-card p-4">
          <p className="font-display">{p.nome}</p>
          {avaliados.has(p.id)
            ? <p className="mt-1 text-sm text-success">Você já avaliou este produto. Pode atualizar abaixo.</p>
            : null}
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Estrelas valor={notas[p.id] ?? 0} onMudar={(n) => setNotas((s) => ({ ...s, [p.id]: n }))} rotulo="Qualidade *" />
            <Estrelas valor={prazos[p.id] ?? 0} onMudar={(n) => setPrazos((s) => ({ ...s, [p.id]: n }))} rotulo="Prazo de entrega" />
            <Estrelas valor={atends[p.id] ?? 0} onMudar={(n) => setAtends((s) => ({ ...s, [p.id]: n }))} rotulo="Atendimento" />
          </div>
          <Input
            value={coment[p.id] ?? ""}
            onChange={(e) => setComent((s) => ({ ...s, [p.id]: e.target.value }))}
            placeholder="Comentário (opcional)"
            className="mt-2"
            maxLength={200}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={!!autoriza[p.id]} onChange={(e) => setAutoriza((s) => ({ ...s, [p.id]: e.target.checked }))} className="size-4" />
            Autorizo publicar minha avaliação (nome abreviado, após aprovação da loja)
          </label>
          <Button size="sm" className="mt-2" onClick={() => enviar(p.id)}>Enviar avaliação</Button>
        </li>
      ))}
    </ul>
  );
}

export { PONTOS_POR_REAL };
