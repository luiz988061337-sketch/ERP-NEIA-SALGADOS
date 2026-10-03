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
import { gerarPix, urlQrPix } from "@/lib/pix";
import { precoFinal } from "@/lib/catalog";
import { geocodificarEndereco } from "@/components/map-view";
import { enderecoLoja, DEFAULT_LOJA_CONFIG, useLojaConfig } from "@/lib/loja";

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
  endereco: z.string().trim().max(200).optional().default(""),
  bairro: z.string().trim().max(100).optional().default(""),
  cidade: z.string().trim().max(100).optional().default(""),
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
  const [tipoEntrega, setTipoEntrega] = useState<"entrega" | "retirada">("entrega");
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const { data: settings } = useCrmSettings();
  const { data: lojaConfig } = useLojaConfig();
  const loja = lojaConfig ?? DEFAULT_LOJA_CONFIG;
  const enderecoLojaTexto = enderecoLoja(loja);
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
  const taxaEntregaFinalUI = tipoEntrega === "retirada" ? 0 : taxaEntrega;
  const totalFinalUI = Math.max(0, subtotal - desconto) + taxaEntregaFinalUI;
  const pontosGanhos = calcPontos(totalFinalUI, {
    ativo: settings?.fid_ativo ?? true,
    reaisPorPonto: settings?.fid_reais_por_ponto ?? 5,
    metaPontos: settings?.fid_meta_pontos ?? 200,
    recompensaValor: settings?.fid_recompensa_valor ?? 20,
  });
  const pix = gerarPix({
    chave: PIX_CHAVE,
    valor: totalFinalUI,
    descricao: "Pedido Néia Salgados",
  });
  const pixQR = pix ? urlQrPix(pix.copiaECola) : "";

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
    if (tipoEntrega === "entrega") {
      if ((parsed.data.endereco ?? "").length < 6) { toast.error("Informe rua e número."); return; }
      if ((parsed.data.bairro ?? "").length < 2) { toast.error("Informe o bairro."); return; }
      if ((parsed.data.cidade ?? "").length < 2) { toast.error("Informe a cidade."); return; }
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
      const isRetirada = tipoEntrega === "retirada";
      const taxaEntregaFinal = isRetirada ? 0 : calc.taxaEntrega;
      const totalFinal = Math.max(0, subtotalValidado - calc.desconto) + taxaEntregaFinal;
      const obsFinal = pagamento === "dinheiro" && parsed.data.troco
        ? `${parsed.data.observacoes} [Troco para ${parsed.data.troco}]`.trim()
        : parsed.data.observacoes;

      const coords = isRetirada
        ? null
        : await geocodificarEndereco(`${parsed.data.endereco}, ${parsed.data.bairro}, ${parsed.data.cidade}`).catch(() => null);

      const insertBody: Record<string, any> = {
        user_id: user.id,
        cliente_nome: parsed.data.cliente_nome,
        telefone: parsed.data.telefone,
        endereco: isRetirada ? (enderecoLojaTexto || "Retirada na loja") : `${parsed.data.endereco} — ${parsed.data.cidade}`,
        bairro: isRetirada ? "-" : parsed.data.bairro,
        cidade: isRetirada ? "-" : parsed.data.cidade,
        complemento: isRetirada ? "" : (parsed.data.complemento ?? ""),
        referencia: isRetirada ? "" : (parsed.data.referencia ?? ""),
        tipo_entrega: tipoEntrega,
        observacoes: obsFinal ?? "",
        forma_pagamento: pagamento,
        // Pagamento começa SEMPRE pendente. Nunca marcar como pago aqui:
        // a loja confirma. Status do pedido e status do pagamento são separados.
        pagamento_status: "pendente",
        subtotal: subtotalValidado,
        taxa_entrega: taxaEntregaFinal,
        desconto: calc.desconto,
        total: totalFinal,
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
          // Banco sem migrações 0003/0004/0006/0018/0022 — reenvia sem campos novos
          const {
            agendado_para: _a,
            agendamento_obs: _ao,
            tipo_evento: _te,
            campanha_origem: _co,
            tipo_entrega: _te2,
            pagamento_status: _ps,
            ...legacy
          } = insertBody;
          const retry = await supabase.from("pedidos").insert(legacy).select("id, numero, cliente_nome, telefone").single();
          if (retry.error || !retry.data) throw retry.error ?? new Error("insert falhou");
          pedido = retry.data;
          if (quando === "agendar") toast.warning("Agendamento registrado só no WhatsApp — rode as migrações no Supabase.");
          if (tipoEntrega === "retirada") toast.warning("Tipo de entrega não salvo — rode a migration 0018 no Supabase.");
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
      const pts = calcPontos(totalFinal, {
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
      const msgWhats = `Novo pedido #${(pedido as any).numero}\n\nCliente: ${parsed.data.cliente_nome}\nTelefone: ${parsed.data.telefone}\n\nProdutos:\n${linhas}\n\nProdutos: ${brl(calc.subtotal)}\n${isRetirada ? "Retirada na loja" : "Entrega"}: ${brl(taxaEntregaFinal)}\nTotal: ${brl(totalFinal)}\n\nPagamento: ${PAGAMENTO_LABEL[pagamento]}${quandoTxt}${eventoTxt}\n\n${isRetirada ? "🏪 Retirada na loja" : `Endereço:\n${parsed.data.endereco}\n${parsed.data.bairro} — ${parsed.data.cidade}\nComp.: ${parsed.data.complemento || "-"}\nRef.: ${parsed.data.referencia || "-"}`}\n\nObservações:\n${obsFinal || "-"}\n\n${mensagemStatus("recebido", parsed.data.cliente_nome, (pedido as any).numero)}`;
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
          <div className="space-y-2">
            <Label>Como deseja receber? *</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input type="radio" name="tipoEntrega" checked={tipoEntrega === "entrega"} onChange={() => setTipoEntrega("entrega")} />
                <div>
                  <div className="font-semibold">Entrega</div>
                  <div className="text-xs text-muted-foreground">No seu endereço (taxa {brl(TAXA_ENTREGA)})</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input type="radio" name="tipoEntrega" checked={tipoEntrega === "retirada"} onChange={() => setTipoEntrega("retirada")} />
                <div>
                  <div className="font-semibold">Retirada na loja</div>
                  <div className="text-xs text-muted-foreground">Sem taxa de entrega</div>
                </div>
              </label>
            </div>
          </div>
          {tipoEntrega === "entrega" ? (
            <>
              <div className="space-y-1.5"><Label htmlFor="endereco">Endereço e número *</Label><Input id="endereco" name="endereco" placeholder="Rua das Flores, 123" required autoComplete="street-address" /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="bairro">Bairro *</Label><Input id="bairro" name="bairro" required /></div>
                <div className="space-y-1.5"><Label htmlFor="cidade">Cidade *</Label><Input id="cidade" name="cidade" placeholder="Sua cidade" required autoComplete="address-level2" /></div>
                <div className="space-y-1.5"><Label htmlFor="complemento">Complemento</Label><Input id="complemento" name="complemento" placeholder="Apto, bloco..." /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="referencia">Ponto de referência</Label><Input id="referencia" name="referencia" placeholder="Próximo à praça" /></div>
            </>
          ) : (
            <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">Você retira o pedido na loja. Sem taxa de entrega.</p>
              {enderecoLojaTexto ? (
                <>
                  <p className="mt-1 text-muted-foreground">{enderecoLojaTexto}</p>
                  {loja.referencia ? <p className="text-muted-foreground">Referência: {loja.referencia}</p> : null}
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  O endereço da loja é informado no WhatsApp assim que o pedido é confirmado.
                </p>
              )}
              {loja.instrucoes_retirada ? (
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{loja.instrucoes_retirada}</p>
              ) : null}
            </div>
          )}
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
              <p className="flex items-center gap-1.5 font-semibold"><QrCode className="size-4" /> Pague com PIX</p>
              {pix ? (
                <>
                  <div className="mt-2 flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pixQR} alt={`QR Code PIX de ${brl(totalFinalUI)}`} width={220} height={220} className="rounded-lg border border-border bg-white p-2" loading="lazy" />
                    <p className="text-xs font-semibold">{brl(totalFinalUI)}</p>
                    <p className="text-center text-xs text-muted-foreground">
                      Abra o app do banco, escolha Pix &gt; Ler QR Code e aponte a câmera.
                    </p>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="pix-copia">Pix Copia e Cola</Label>
                    <Textarea id="pix-copia" readOnly rows={3} value={pix.copiaECola} className="break-all font-mono text-[11px]" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pix.copiaECola);
                          toast.success("Pix Copia e Cola copiado — cole em Pix &gt; Pagar com código.");
                        } catch {
                          toast.error("Não consegui copiar. Selecione o texto acima e copie na mão.");
                        }
                      }}
                    >
                      <Copy className="mr-1 size-3.5" /> Copiar Pix Copia e Cola
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Chave:</span>
                    <code className="min-w-0 flex-1 truncate text-xs">{PIX_CHAVE}</code>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    O pagamento é conferido pela loja. Envie o comprovante pelo WhatsApp depois de finalizar.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  O Pix ainda não está configurado. Escolha outra forma de pagamento ou fale com a loja.
                </p>
              )}
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
            <div className="flex justify-between"><span className="text-muted-foreground">{tipoEntrega === "retirada" ? "Retirada na loja" : "Entrega (1x)"}</span><span>{brl(taxaEntregaFinalUI)}</span></div>
            {desconto > 0 && <div className="flex justify-between text-success"><span>Desconto ({cupom?.codigo})</span><span>-{brl(desconto)}</span></div>}
            <div className="flex justify-between font-display text-lg"><span>Total</span><span className="text-primary">{brl(totalFinalUI)}</span></div>
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
