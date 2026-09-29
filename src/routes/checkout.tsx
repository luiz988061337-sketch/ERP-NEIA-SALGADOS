import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, Loader2, QrCode, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { usePerfil, useSession, useStaffOnly } from "@/lib/session";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA, whatsappLink, mensagemStatus } from "@/lib/format";
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
  const total = Math.max(0, subtotal + TAXA_ENTREGA - desconto);
  const pontosGanhos = Math.floor(total / 5);
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
    const minimo = Number((data as any).valor_minimo ?? (data as any).minimo ?? 0);
    if (subtotal < minimo) {
      toast.error(`Cupom válido em pedidos acima de ${brl(minimo)}.`);
      return;
    }
    const valor = (data as any).tipo === "percentual" ? (subtotal * Number((data as any).valor)) / 100 : Number((data as any).valor);
    setCupom({ codigo, desconto: Math.min(valor, subtotal) });
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
      complemento: form.get("complemento") ?? "",
      referencia: form.get("referencia") ?? "",
      observacoes: form.get("observacoes") ?? "",
      troco: form.get("troco") ?? "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Confira os dados.");
      return;
    }
    setEnviando(true);
    const obsFinal = pagamento === "dinheiro" && parsed.data.troco
      ? `${parsed.data.observacoes} [Troco para ${parsed.data.troco}]`.trim()
      : parsed.data.observacoes;

    const coords = await geocodificarEndereco(`${parsed.data.endereco}, ${parsed.data.bairro}`).catch(() => null);

    const { data: pedido, error } = await supabase.from("pedidos").insert({
      user_id: user.id,
      cliente_nome: parsed.data.cliente_nome,
      telefone: parsed.data.telefone,
      endereco: parsed.data.endereco,
      bairro: parsed.data.bairro,
      complemento: parsed.data.complemento ?? "",
      referencia: parsed.data.referencia ?? "",
      observacoes: obsFinal ?? "",
      forma_pagamento: pagamento,
      subtotal,
      taxa_entrega: TAXA_ENTREGA,
      desconto,
      total,
      cupom: cupom?.codigo ?? null,
      destino_lat: coords?.lat ?? null,
      destino_lng: coords?.lng ?? null,
    }).select("id, numero, cliente_nome, telefone").single();

    if (error || !pedido) {
      setEnviando(false);
      console.error(error);
      toast.error("Não foi possível registrar o pedido.");
      return;
    }

    const { error: erroItens } = await supabase.from("pedido_itens").insert(
      items.map((i) => ({
        pedido_id: (pedido as any).id,
        produto_id: i.produtoId === undefined ? i.id : i.produtoId,
        nome: i.nome,
        preco_unitario: i.preco,
        quantidade: i.quantidade,
      })),
    );
    if (erroItens) console.error(erroItens);

    // Fidelidade: 1 ponto a cada R$ 5
    const pts = Math.floor(total / 5);
    if (pts > 0) {
      await supabase.from("profiles").update({ pontos: (perfil?.pontos ?? 0) + pts }).eq("id", user.id);
    }

    clear();
    setEnviando(false);
    toast.success(`Pedido nº ${(pedido as any).numero} recebido! +${pts} pts fidelidade`);
    window.open(whatsappLink((pedido as any).telefone, mensagemStatus("recebido", (pedido as any).cliente_nome, (pedido as any).numero)), "_blank", "noopener");
    navigate({ to: "/pedido/$id", params: { id: (pedido as any).id } });
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="cliente_nome">Nome</Label><Input id="cliente_nome" name="cliente_nome" defaultValue={perfil?.nome ?? ""} required /></div>
            <div className="space-y-1.5"><Label htmlFor="telefone">WhatsApp</Label><Input id="telefone" name="telefone" defaultValue={perfil?.telefone ?? ""} required /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="endereco">Endereço e número</Label><Input id="endereco" name="endereco" placeholder="Rua das Flores, 123" required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="bairro">Bairro</Label><Input id="bairro" name="bairro" required /></div>
            <div className="space-y-1.5"><Label htmlFor="complemento">Complemento</Label><Input id="complemento" name="complemento" placeholder="Apto, bloco..." /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="referencia">Ponto de referência</Label><Input id="referencia" name="referencia" placeholder="Próximo à praça" /></div>
          <div className="space-y-1.5"><Label htmlFor="observacoes">Observações</Label><Textarea id="observacoes" name="observacoes" placeholder="Sem cebola, troco para R$ 100..." /></div>
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

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Resumo</h2>
          <div className="flex gap-2">
            <Input value={cupomTexto} onChange={(e) => setCupomTexto(e.target.value)} placeholder="Cupom (ex: NEIA10)" maxLength={20} />
            <Button type="button" variant="outline" onClick={aplicarCupom}>Aplicar</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between"><span className="text-muted-foreground">{i.quantidade}x {i.nome}</span><span>{brl(i.preco * i.quantidade)}</span></li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>{brl(TAXA_ENTREGA)}</span></div>
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
