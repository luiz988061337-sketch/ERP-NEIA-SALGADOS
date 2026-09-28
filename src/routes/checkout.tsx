import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { usePerfil, useSession } from "@/lib/session";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA, whatsappLink, mensagemStatus } from "@/lib/format";
import { geocodificarEndereco } from "@/components/map-view";

export const PIX_CHAVE = "neiasalgados@pix.com.br";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar pedido — Néia Salgados" },
      { name: "description", content: "Informe endereço e forma de pagamento para concluir seu pedido." },
      { property: "og:title", content: "Finalizar pedido — Néia Salgados" },
      { property: "og:description", content: "Informe endereço e forma de pagamento para concluir seu pedido." },
    ],
  }),
  component: Checkout,
});

const schema = z.object({
  cliente_nome: z.string().trim().min(2, "Informe seu nome").max(100),
  telefone: z.string().trim().min(10, "WhatsApp inválido").max(20),
  endereco: z.string().trim().min(6, "Informe rua e número").max(200),
  bairro: z.string().trim().min(2, "Informe o bairro").max(100),
  complemento: z.string().trim().max(100),
  referencia: z.string().trim().max(150),
  observacoes: z.string().trim().max(300),
});

function Checkout() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: perfil } = usePerfil(user?.id);
  const { items, subtotal, clear } = useCart();
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupom, setCupom] = useState<{ codigo: string; desconto: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/checkout" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && items.length === 0) navigate({ to: "/carrinho", replace: true });
  }, [loading, user, items.length, navigate]);

  const desconto = cupom?.desconto ?? 0;
  const total = Math.max(0, subtotal + TAXA_ENTREGA - desconto);

  async function aplicarCupom() {
    const codigo = cupomTexto.trim().toUpperCase();
    if (!codigo) return;
    const { data, error } = await supabase
      .from("cupons")
      .select("*")
      .eq("codigo", codigo)
      .eq("ativo", true)
      .maybeSingle();
    if (error || !data) {
      toast.error("Cupom inválido.");
      return;
    }
    const minimo = Number(data.valor_minimo ?? 0);
    if (subtotal < minimo) {
      toast.error(`Cupom válido em pedidos acima de ${brl(minimo)}.`);
      return;
    }
    const valor =
      data.tipo === "percentual" ? (subtotal * Number(data.valor)) / 100 : Number(data.valor);
    setCupom({ codigo, desconto: Math.min(valor, subtotal) });
    toast.success(`Cupom ${codigo} aplicado!`);
  }

  async function finalizar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(form) as Record<string, string>);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Confira os dados do endereço.");
      return;
    }
    setEnviando(true);

    const enderecoCompleto = `${parsed.data.endereco}, ${parsed.data.bairro}`;
    const coords = await geocodificarEndereco(enderecoCompleto).catch(() => null);

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .insert({
        user_id: user.id,
        ...parsed.data,
        forma_pagamento: pagamento,
        subtotal,
        taxa_entrega: TAXA_ENTREGA,
        desconto,
        total,
        cupom: cupom?.codigo ?? null,
        destino_lat: coords?.lat ?? null,
        destino_lng: coords?.lng ?? null,
      })
      .select("id, numero, cliente_nome, telefone")
      .single();

    if (error || !pedido) {
      setEnviando(false);
      console.error(error);
      toast.error("Não foi possível registrar o pedido. Tente novamente.");
      return;
    }

    const { error: erroItens } = await supabase.from("pedido_itens").insert(
      items.map((i) => ({
        pedido_id: pedido.id,
        produto_id: i.id,
        nome: i.nome,
        preco_unitario: i.preco,
        quantidade: i.quantidade,
      })),
    );
    if (erroItens) console.error(erroItens);

    clear();
    setEnviando(false);
    window.open(
      whatsappLink(pedido.telefone, mensagemStatus("recebido", pedido.cliente_nome, pedido.numero)),
      "_blank",
      "noopener",
    );
    navigate({ to: "/pedido/$id", params: { id: pedido.id } });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">Finalizar pedido</h1>

      <form onSubmit={finalizar} className="mt-6 space-y-6">
        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Entrega</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cliente_nome">Nome</Label>
              <Input id="cliente_nome" name="cliente_nome" defaultValue={perfil?.nome ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">WhatsApp</Label>
              <Input id="telefone" name="telefone" defaultValue={perfil?.telefone ?? ""} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endereco">Endereço e número</Label>
            <Input id="endereco" name="endereco" placeholder="Rua das Flores, 123" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" name="bairro" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complemento">Complemento</Label>
              <Input id="complemento" name="complemento" defaultValue="" placeholder="Apto, bloco..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referencia">Ponto de referência</Label>
            <Input id="referencia" name="referencia" defaultValue="" placeholder="Próximo à praça" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações do pedido</Label>
            <Textarea id="observacoes" name="observacoes" defaultValue="" placeholder="Sem cebola, troco para R$ 100..." />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Pagamento</h2>
          <RadioGroup value={pagamento} onValueChange={(v) => setPagamento(v as typeof pagamento)}>
            {(["pix", "dinheiro", "credito", "debito"] as const).map((op) => (
              <label
                key={op}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <RadioGroupItem value={op} id={op} />
                {PAGAMENTO_LABEL[op]}
              </label>
            ))}
          </RadioGroup>
          {pagamento === "pix" ? (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">Chave PIX</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate">{PIX_CHAVE}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(PIX_CHAVE);
                    toast.success("Chave PIX copiada");
                  }}
                >
                  <Copy className="mr-1 size-3.5" /> Copiar
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Envie o comprovante pelo WhatsApp após finalizar o pedido.
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Resumo</h2>
          <div className="flex gap-2">
            <Input
              value={cupomTexto}
              onChange={(e) => setCupomTexto(e.target.value)}
              placeholder="Cupom de desconto"
              maxLength={20}
            />
            <Button type="button" variant="outline" onClick={aplicarCupom}>
              Aplicar
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span className="text-muted-foreground">
                  {i.quantidade}x {i.nome}
                </span>
                <span>{brl(i.preco * i.quantidade)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entrega</span>
              <span>{brl(TAXA_ENTREGA)}</span>
            </div>
            {desconto > 0 ? (
              <div className="flex justify-between text-success">
                <span>Desconto ({cupom?.codigo})</span>
                <span>-{brl(desconto)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-display text-lg">
              <span>Total</span>
              <span className="text-primary">{brl(total)}</span>
            </div>
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
