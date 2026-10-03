import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, Loader2, QrCode, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import type { Database } from "@/integrations/supabase/types";
import { useCart, isComboItem } from "@/lib/cart";
import { usePerfil, useSession, useStaffOnly } from "@/lib/session";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA, whatsappLink, mensagemStatus } from "@/lib/format";
import { calcTotals, isMultiploCombo } from "@/lib/totals";
import { validarCupom } from "@/lib/cupons";
import { pontosGanhos as calcPontos } from "@/lib/fidelidade";
import { useCrmSettings } from "@/lib/crm";
import { registrarEventoCarrinho } from "@/lib/inteligencia";
import { precoFinal } from "@/lib/catalog";
import { geocodificarEndereco } from "@/components/map-view";

export const PIX_CHAVE = "neiasalgados@pix.com.br";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar pedido — Néia Salgados" },
      { name: "description", content: "Informe endereço e forma de pagamento para concluir seu pedido." },
    ],
  }),
  component: Checkout,
});

const schema = z.object({
  cliente_nome: z.string().trim().min(2, "Informe seu nome").max(100),
  telefone: z.string().trim().min(10, "WhatsApp inválido").max(20),
  endereco: z.string().trim().min(6, "Informe rua e número").max(200),
  bairro: z.string().trim().min(2, "Informe o bairro").max(100),
  cidade: z.string().trim().min(2, "Informe a cidade").max(100),
  complemento: z.string().trim().max(100).optional().default(""),
  referencia: z.string().trim().max(150).optional().default(""),
  observacoes: z.string().trim().max(300).optional().default(""),
  troco: z.string().trim().max(20).optional().default(""),
});

function Checkout() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { staffOnly, painel } = useStaffOnly();
  const { data: perfil } = usePerfil(user?.id);
  const { items, subtotal, clear } = useCart();
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupom, setCupom] = useState<{ codigo: string; desconto: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enderecoId, setEnderecoId] = useState<string>("");
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const { data: settings } = useCrmSettings();
  const funilRef = useRef(false);

  useEffect(() => {
    if (funilRef.current || loading || !user || items.length === 0) return;
    if (settings && !settings.carrinho_recuperacao_ativa) return;
    funilRef.current = true;
    void registrarEventoCarrinho({
      userId: user.id,
      telefone: (perfil as any)?.telefone ?? "",
      etapa: "checkout-iniciado",
      itens: items.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
      subtotal,
    });
  }, [loading, user, items, subtotal, settings, perfil]);

  const { data: enderecos } = useQuery({
    queryKey: ["enderecos-checkout", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("enderecos").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/checkout" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && items.length === 0) navigate({ to: "/carrinho", replace: true });
  }, [loading, user, items.length, navigate]);

  const desconto = cupom?.desconto ?? 0;
  const { taxaEntrega, total } = calcTotals({ subtotal, taxaEntrega: TAXA_ENTREGA, desconto });
  const pontosGanhos = calcPontos(total, {
    ativo: settings?.fid_ativo ?? true,
    reaisPorPonto: settings?.fid_reais_por_ponto ?? 5,
    metaPontos: settings?.fid_meta_pontos ?? 200,
    recompensaValor: settings?.fid_recompensa_valor ?? 20,
  });
  const pixPayload = `NEIA-SALGADOS|CHAVE:${PIX_CHAVE}|VALOR:${total.toFixed(2)}`;
  const pixQR = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}`;

  if (staffOnly) {
    return <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>;
  }

  function preencherEndereco(id: string) {
    setEnderecoId(id);
    const e = (enderecos ?? []).find((x: any) => x.id === id);
    if (!e) return;
    (document.getElementById("endereco") as HTMLInputElement).value = `${e.rua}, ${e.numero}`;
    (document.getElementById("bairro") as HTMLInputElement).value = e.bairro;
    (document.getElementById("complemento") as HTMLInputElement).value = e.complemento ?? "";
    (document.getElementById("referencia") as HTMLInputElement).value = e.referencia ?? "";
  }

  async function aplicarCupom() {
    const codigo = cupomTexto.trim().toUpperCase();
    if (!codigo) return;
    const { data, error } = await supabase.from("cupons").select("*").eq("codigo", codigo).eq("ativo", true).maybeSingle();
    if (error || !data) {
      toast.error("Cupom inválido.");
      return;
    }
    const telNorm = ((document.getElementById("telefone") as HTMLInputElement | null)?.value ?? "").replace(/\D/g, "");
    let usos = 0;
    if (Number((data as any).max_usos ?? 0) > 0) {
      const r = await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("cupom", codigo).neq("status", "cancelado");
      usos = r.count ?? 0;
    }
    const res = validarCupom(data as any, {
      subtotal,
      telefoneDigitado: telNorm,
      usosRegistrados: usos,
      produtoIdsNoCarrinho: items.map((i) => i.produtoId),
    });
    if (!res.ok) {
      toast.error(res.motivo);
      return;
    }
    setCupom({ codigo, desconto: res.desconto });
    toast.success(`Cupom ${codigo} aplicado!`);
  }

  async function finalizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      cliente_nome: form.get("cliente_nome"),
      telefone: form.get("telefone"),
      endereco: form.get("endereco"),
      bairro: form.get("bairro"),
      cidade: form.get("cidade"),
      complemento: form.get("complemento") ?? "",
      referencia: form.get("referencia") ?? "",
      observacoes: form.get("observacoes") ?? "",
      troco: form.get("troco") ?? "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Confira os dados.");
      return;
    }
    const digitosTel = String(parsed.data.telefone).replace(/\D/g, "");
    if (digitosTel.length < 10 || digitosTel.length > 13) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    let agendadoPara: string | null = null;
    let agendamentoObs = "";
    let origemCampanha = "";
    try {
      origemCampanha = (localStorage.getItem("neia-campanha") ?? "").slice(0, 60);
    } catch {
      origemCampanha = "";
    }
    let tipoEvento = String(form.get("tipo_evento") ?? "");
    if (quando === "agendar") {
      const dtRaw = String(form.get("agendamento_para") ?? "");
      const dt = new Date(dtRaw);
      if (!dtRaw || Number.isNaN(+dt)) {
        toast.error("Escolha data e horário para agendar.");
        return;
      }
      if (+dt <= Date.now() + 30 * 60000) {
        toast.error("Agende com pelo menos 30 minutos de antecedência.");
        return;
      }
      agendadoPara = dt.toISOString();
      agendamentoObs = String(form.get("agendamento_obs") ?? "").slice(0, 200);
    }
    setEnviando(true);
    try {
      // Revalida preços no backend: busca produtos vinculados e ignora preço do navegador.
      const ids = [...new Set(items.map((i) => i.produtoId).filter((v): v is string => !!v))];
      let mapaPrecos = new Map<string, number>();
      if (ids.length > 0) {
        const { data: prods, error: errProds } = await supabase.from("produtos").select("id, preco, preco_promocional").in("id", ids);
        if (errProds) throw errProds;
        mapaPrecos = new Map((prods ?? []).map((p: any) => [p.id, Number(precoFinal(p as any))]));
      }
      let subtotalValidado = 0;
      const itensValidados = items.map((i) => {
        const precoReal = i.produtoId ? (mapaPrecos.get(i.produtoId) ?? null) : i.preco;
        if (precoReal == null || Number.isNaN(precoReal)) throw new Error(`Produto ${i.nome} indisponível no momento.`);
        if (isComboItem(i) && !isMultiploCombo(i.quantidade)) {
          throw new Error(`"${i.nome}": combos são vendidos em múltiplos de 50 unidades. Ajuste no carrinho.`);
        }
        subtotalValidado += precoReal * i.quantidade;
        return { ...i, preco: precoReal };
      });
      const calc = calcTotals({ subtotal: subtotalValidado, taxaEntrega: TAXA_ENTREGA, desconto });
      const obsFinal = pagamento === "dinheiro" && parsed.data.troco
        ? `${parsed.data.observacoes} [Troco para ${parsed.data.troco}]`.trim()
        : parsed.data.observacoes;

      const coords = await geocodificarEndereco(`${parsed.data.endereco}, ${parsed.data.bairro}, ${parsed.data.cidade}`).catch(() => null);

      const insertBody: Record<string, any> = {
        user_id: user.id,
        cliente_nome: parsed.data.cliente_nome,
        telefone: parsed.data.telefone,
        endereco: `${parsed.data.endereco} — ${parsed.data.cidade}`,
        bairro: parsed.data.bairro,
        complemento: parsed.data.complemento ?? "",
        referencia: parsed.data.referencia ?? "",
        observacoes: obsFinal ?? "",
        forma_pagamento: pagamento,
        subtotal: subtotalValidado,
        taxa_entrega: calc.taxaEntrega,
        desconto: calc.desconto,
        total: calc.total,
        cupom: cupom?.codigo ?? null,
        destino_lat: coords?.lat ?? null,
        destino_lng: coords?.lng ?? null,
        agendado_para: agendadoPara,
        agendamento_obs: agendamentoObs,
        tipo_evento: tipoEvento,
        campanha_origem: origemCampanha,
      };

      let pedido: { id: string; numero: number; cliente_nome: string; telefone: string } | null = null;
      {
        const res = await supabase.from("pedidos").insert(insertBody).select("id, numero, cliente_nome, telefone").single();
        if (res.error && String(res.error.message ?? "").includes("column")) {
          // Banco sem migrações 0003/0004/0006 — reenvia sem campos novos
          const { agendado_para: _a, agendamento_obs: _ao, tipo_evento: _te, campanha_origem: _co, ...legacy } = insertBody;
          const retry = await supabase.from("pedidos").insert(legacy).select("id, numero, cliente_nome, telefone").single();
          if (retry.error || !retry.data) throw retry.error ?? new Error("insert falhou");
          pedido = retry.data;
          if (quando === "agendar") toast.warning("Agendamento registrado só no WhatsApp — rode as migrações no Supabase.");
        } else {
          if (res.error || !res.data) throw res.error ?? new Error("insert falhou");
          pedido = res.data;
        }
      }

      const { error: erroItens } = await supabase.from("pedido_itens").insert(
        itensValidados.map((i) => ({
          pedido_id: (pedido as any).id,
          produto_id: i.produtoId === undefined ? i.id : i.produtoId,
          nome: i.observacao ? `${i.nome} (obs: ${i.observacao})` : i.nome,
          preco_unitario: i.preco,
          quantidade: i.quantidade,
        })),
      );
      if (erroItens) console.error(erroItens);

      // Fidelidade configurável (1 ponto a cada X reais)
      const pts = calcPontos(calc.total, {
        ativo: settings?.fid_ativo ?? true,
        reaisPorPonto: settings?.fid_reais_por_ponto ?? 5,
        metaPontos: settings?.fid_meta_pontos ?? 200,
        recompensaValor: settings?.fid_recompensa_valor ?? 20,
      });
      if (pts > 0) {
        await supabase.from("profiles").update({ pontos: (perfil?.pontos ?? 0) + pts }).eq("id", user.id);
      }

      clear();
      toast.success(`Pedido nº ${(pedido as any).numero} recebido! +${pts} pts fidelidade`);
      const linhas = itensValidados.map((i) => `* ${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`).join("\n");
      const quandoTxt = quando === "agendar" && agendadoPara
        ? `\n\nReceber em: ${new Date(agendadoPara).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${agendamentoObs ? ` (${agendamentoObs})` : ""}`
        : "\n\nReceber: o mais rápido possível";
      const eventoTxt = tipoEvento ? `\nTipo de evento: ${tipoEvento}` : "";
      const msgWhats = `Novo pedido #${(pedido as any).numero}\n\nCliente: ${parsed.data.cliente_nome}\nTelefone: ${parsed.data.telefone}\n\nProdutos:\n${linhas}\n\nProdutos: ${brl(calc.subtotal)}\nEntrega: ${brl(calc.taxaEntrega)}\nTotal: ${brl(calc.total)}\n\nPagamento: ${PAGAMENTO_LABEL[pagamento]}${quandoTxt}${eventoTxt}\n\nEndereço:\n${parsed.data.endereco}\n${parsed.data.bairro} — ${parsed.data.cidade}\nComp.: ${parsed.data.complemento || "-"}\nRef.: ${parsed.data.referencia || "-"}\n\nObservações:\n${obsFinal || "-"}\n\n${mensagemStatus("recebido", parsed.data.cliente_nome, (pedido as any).numero)}`;
      window.open(whatsappLink((pedido as any).telefone, msgWhats), "_blank", "noopener");
      navigate({ to: "/pedido/$id", params: { id: (pedido as any).id } });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar o pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">Finalizar pedido</h1>
      {(enderecos ?? []).length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
          <Label>Usar endereço salvo</Label>
          <div className="mt-1 flex gap-2">
            <select value={enderecoId} onChange={(e) => preencherEndereco(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Digite um novo endereço…</option>
              {(enderecos ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>{e.rua}, {e.numero} — {e.bairro}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <form onSubmit={finalizar} className="mt-4 space-y-6">
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Entrega</h2>
          <p className="text-xs text-muted-foreground">Carrinho → Dados → Endereço → Entrega → Pagamento → Confirmar pedido</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="cliente_nome">Nome *</Label><Input id="cliente_nome" name="cliente_nome" defaultValue={perfil?.nome ?? ""} required autoComplete="name" /></div>
            <div className="space-y-1.5"><Label htmlFor="telefone">WhatsApp *</Label><Input id="telefone" name="telefone" defaultValue={perfil?.telefone ?? ""} required autoComplete="tel" placeholder="(11) 90000-0000" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="endereco">Endereço e número *</Label><Input id="endereco" name="endereco" placeholder="Rua das Flores, 123" required autoComplete="street-address" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="bairro">Bairro *</Label><Input id="bairro" name="bairro" required /></div>
            <div className="space-y-1.5"><Label htmlFor="cidade">Cidade *</Label><Input id="cidade" name="cidade" placeholder="Sua cidade" required autoComplete="address-level2" /></div>
            <div className="space-y-1.5"><Label htmlFor="complemento">Complemento</Label><Input id="complemento" name="complemento" placeholder="Apto, bloco..." /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="referencia">Ponto de referência</Label><Input id="referencia" name="referencia" placeholder="Próximo à praça" /></div>
          <div className="space-y-1.5"><Label htmlFor="observacoes">Observações</Label><Textarea id="observacoes" name="observacoes" placeholder="Ex: troco, ponto de entrega..." /></div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Quando deseja receber?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <input type="radio" name="quando" checked={quando === "agora"} onChange={() => setQuando("agora")} />⚡ O mais rápido possível
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <input type="radio" name="quando" checked={quando === "agendar"} onChange={() => setQuando("agendar")} />📅 Agendar data e horário
            </label>
          </div>
          {quando === "agendar" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="agendamento_para">Data e horário *</Label><Input id="agendamento_para" name="agendamento_para" type="datetime-local" required={quando === "agendar"} /></div>
              <div className="space-y-1.5"><Label htmlFor="agendamento_obs">Observação do agendamento</Label><Input id="agendamento_obs" name="agendamento_obs" placeholder="Ex: festa às 15h" maxLength={200} /></div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="tipo_evento">Tipo de evento (opcional)</Label>
            <select id="tipo_evento" name="tipo_evento" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="">
              <option value="">Não é para evento</option>
              <option value="aniversario">Aniversário</option>
              <option value="casamento">Casamento</option>
              <option value="empresa">Empresa</option>
              <option value="festa">Festa</option>
              <option value="confraternizacao">Confraternização</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Pagamento</h2>
          <RadioGroup value={pagamento} onValueChange={(v) => setPagamento(v as typeof pagamento)}>
            {(["pix", "dinheiro", "credito", "debito"] as const).map((op) => (
              <label key={op} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <RadioGroupItem value={op} id={op} />{PAGAMENTO_LABEL[op]}
              </label>
            ))}
          </RadioGroup>
          {pagamento === "dinheiro" && (
            <div className="space-y-1.5"><Label htmlFor="troco">Troco para quanto? (opcional)</Label><Input id="troco" name="troco" placeholder="Ex: R$ 100" /></div>
          )}
          {pagamento === "pix" && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="flex items-center gap-1.5 font-semibold"><QrCode className="size-4" /> Pague com PIX QR Code</p>
              <div className="mt-2 flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pixQR} alt={`QR Code PIX ${brl(total)}`} width={200} height={200} className="rounded-lg border border-border bg-white p-2" loading="lazy" />
                <p className="text-xs text-muted-foreground">Escaneie com o app do banco • {brl(total)}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate text-xs">{PIX_CHAVE}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(PIX_CHAVE); toast.success("Chave PIX copiada"); }}>
                  <Copy className="mr-1 size-3.5" /> Copiar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Envie o comprovante pelo WhatsApp após finalizar.</p>
            </div>
          )}
          <p className="flex items-center gap-1.5 rounded-lg bg-secondary/30 p-2.5 text-xs"><Trophy className="size-4 text-primary" /> Este pedido rende <strong>{pontosGanhos} pontos</strong> no programa fidelidade.</p>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-label="Resumo antes de finalizar">
          <h2 className="font-display text-xl">Resumo — confira antes de confirmar</h2>
          <p className="text-xs text-muted-foreground">Pagamento escolhido: <strong>{PAGAMENTO_LABEL[pagamento]}</strong></p>
          <div className="flex gap-2">
            <Input value={cupomTexto} onChange={(e) => setCupomTexto(e.target.value)} placeholder="Cupom (ex: NEIA10)" maxLength={20} />
            <Button type="button" variant="outline" onClick={aplicarCupom}>Aplicar</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2"><span className="text-muted-foreground">{i.quantidade}x {i.nome}{i.observacao ? ` (${i.observacao})` : ""}</span><span className="shrink-0">{brl(i.preco * i.quantidade)}</span></li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Produtos</span><span>{brl(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega (1x)</span><span>{brl(taxaEntrega)}</span></div>
            {desconto > 0 && <div className="flex justify-between text-success"><span>Desconto ({cupom?.codigo})</span><span>-{brl(desconto)}</span></div>}
            <div className="flex justify-between font-display text-lg"><span>Total</span><span className="text-primary">{brl(total)}</span></div>
          </div>
        </section>

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Confirmar pedido • {brl(total)}
        </Button>
      </form>
    </div>
  );
}
