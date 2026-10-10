import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, QrCode, Copy, CreditCard, Receipt, MapPin, Clock, User, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/checkout")({
  head: () => ({
    meta: [
      { title: "Finalizar Pedido — Néia Salgados Preview" },
      { name: "description", content: "Finalizar seu pedido Néia Salgados" },
    ],
  }),
  component: PreviewCheckout,
});

const MOCK_ITEMS = [
  { id: "1", nome: "Coxinha de Frango c/ Catupiry", preco: 7.50, quantidade: 3 },
  { id: "2", nome: "Bolinho de Queijo", preco: 6.50, quantidade: 2 },
  { id: "3", nome: "Risol de Presunto e Queijo", preco: 7.00, quantidade: 1 },
];

function PreviewCheckout() {
  const [tipoEntrega, setTipoEntrega] = useState<"entrega" | "retirada">("entrega");
  const [tipoImovel, setTipoImovel] = useState("casa");
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [etapa, setEtapa] = useState(1);
  const [cep, setCep] = useState("01000-000");

  const subtotal = MOCK_ITEMS.reduce((acc, i) => acc + i.preco * i.quantidade, 0);
  const taxaEntrega = tipoEntrega === "entrega" ? 6 : 0;
  const total = subtotal + taxaEntrega;

  const etapas = [
    { id: 1, nome: "Dados" },
    { id: 2, nome: "Endereço" },
    { id: 3, nome: "Entrega" },
    { id: 4, nome: "Pagamento" },
    { id: 5, nome: "Revisão" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/preview/carrinho"><ArrowLeft className="size-5" /></Link>
              </Button>
              <h1 className="font-display text-2xl">Finalizar Pedido</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
        <nav aria-label="Etapas" className="mb-8 hidden md:block">
          <ol className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {etapas.map((e, idx) => {
              const ativo = e.id <= etapa;
              const atual = e.id === etapa;
              return (
                <li key={e.id} className="flex flex-1 items-center gap-3">
                  <div className={cn("flex items-center gap-3", idx === etapas.length - 1 ? "pr-0" : "flex-1")}>
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border font-medium transition-all",
                      atual && "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]",
                      ativo && !atual && "border-primary bg-primary/10 text-primary",
                      !ativo && "border-border bg-muted text-muted-foreground"
                    )}>
                      {ativo && !atual ? <CheckCircle2 className="size-5" /> : e.id}
                    </div>
                    <span className={cn("font-medium", atual ? "text-foreground" : ativo ? "text-primary" : "text-muted-foreground")}>
                      {e.nome}
                    </span>
                    {idx < etapas.length - 1 && (
                      <div className={cn("mx-2 h-px flex-1 transition-colors", ativo ? "bg-primary/50" : "bg-border")} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {etapa === 1 && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
                <h2 className="font-display text-xl flex items-center gap-2">
                  <User className="size-5 text-primary" />
                  Dados do Cliente
                </h2>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome Completo *</Label>
                    <Input id="nome" placeholder="Digite seu nome" defaultValue="João Silva" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tel">WhatsApp *</Label>
                    <Input id="tel" placeholder="(11) 99999-9999" defaultValue="(11) 99999-9999" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" asChild><Link to="/preview/carrinho">Voltar ao Carrinho</Link></Button>
                  <Button onClick={() => setEtapa(2)} className="brand-gradient gap-2 text-black">Próximo: Endereço <ChevronRight className="size-4" /></Button>
                </div>
              </section>
            )}

            {etapa === 2 && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
                <h2 className="font-display text-xl flex items-center gap-2">
                  <MapPin className="size-5 text-primary" />
                  Endereço de Entrega
                </h2>
                <div className="mt-4">
                  <div className="flex gap-2 sm:grid-cols-2">
                    <Button variant={tipoEntrega === "entrega" ? "default" : "outline"} onClick={() => setTipoEntrega("entrega")}>Entrega</Button>
                    <Button variant={tipoEntrega === "retirada" ? "default" : "outline"} onClick={() => setTipoEntrega("retirada")}>Retirada na Loja</Button>
                  </div>
                </div>
                {tipoEntrega === "entrega" ? (
                  <div className="mt-6 space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="endereco">Endereço e Número *</Label>
                        <Input id="endereco" defaultValue="Rua das Flores, 123" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bairro">Bairro *</Label>
                        <Input id="bairro" defaultValue="Centro" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cidade">Cidade *</Label>
                        <Input id="cidade" defaultValue="São Paulo" />
                      </div>
<div className="space-y-2">
  <Label htmlFor="cep">CEP *</Label>
  <Input
    id="cep"
    value={cep}
    onChange={(e) => setCep(e.target.value)}
    placeholder="Ex: 01000-000"
    maxLength={8}
    className="pl-9"
  />
  {cep && (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-muted-foreground">CEP {"válido"} </span>
      <Button variant="outline" size="sm" className="gap-1">
        <RefreshCw className="size-3.5" /> Validar
      </Button>
    </div>
  )}
</div>
                      <div className="space-y-2">
                        <Label htmlFor="comp">Complemento</Label>
                        <Input id="comp" placeholder="Casa, fundos..." />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="ref">Ponto de Referência</Label>
                        <Input id="ref" placeholder="Próximo à praça" />
                      </div>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tipo de Imóvel</Label>
                        <div className="flex gap-2">
                          <Button variant={tipoImovel === "casa" ? "default" : "outline"} size="sm" onClick={() => setTipoImovel("casa")}>Casa</Button>
                          <Button variant={tipoImovel === "apartamento" ? "default" : "outline"} size="sm" onClick={() => setTipoImovel("apartamento")}>Apartamento</Button>
                        </div>
                      </div>
                      {tipoImovel === "apartamento" && (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2"><Label>Apto</Label><Input placeholder="42" /></div>
                          <div className="space-y-2"><Label>Bloco</Label><Input placeholder="B" /></div>
                          <div className="space-y-2"><Label>Andar</Label><Input placeholder="4" /></div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-lg border border-border bg-muted/50 p-5">
                    <p className="font-medium">Você retira o pedido na loja.</p>
                    <p className="mt-2 text-sm text-muted-foreground">Sem taxa de entrega. O endereço e instruções para retirada serão informados no WhatsApp.</p>
                  </div>
                )}
                <div className="mt-6 flex justify-between gap-3">
                  <Button variant="outline" onClick={() => setEtapa(1)}>Voltar</Button>
                  <Button onClick={() => setEtapa(3)} className="brand-gradient text-primary-foreground gap-2">Próximo: Entrega <ChevronRight className="size-4" /></Button>
                </div>
              </section>
            )}

            {etapa === 3 && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
                <h2 className="font-display text-xl flex items-center gap-2">
                  <Clock className="size-5 text-primary" />
                  Quando Deseja Receber?
                </h2>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button variant={quando === "agora" ? "default" : "outline"} onClick={() => setQuando("agora")} className="flex-1">O mais rápido possível</Button>
                  <Button variant={quando === "agendar" ? "default" : "outline"} onClick={() => setQuando("agendar")} className="flex-1">Agendar data e horário</Button>
                </div>
                {quando === "agendar" && (
                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Data e Horário *</Label><Input type="datetime-local" /></div>
                    <div className="space-y-2"><Label>Observação</Label><Input placeholder="Ex: festa às 15h" /></div>
                  </div>
                )}
                <div className="mt-6 space-y-2">
                  <Label>Tipo de Evento (opcional)</Label>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {["Aniversário", "Casamento", "Empresa", "Festa", "Confraternização", "Outro"].map((v) => (
                      <Button key={v} variant="outline" size="sm">{v}</Button>
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex justify-between gap-3">
                  <Button variant="outline" onClick={() => setEtapa(2)}>Voltar</Button>
                  <Button onClick={() => setEtapa(4)} className="brand-gradient text-primary-foreground gap-2">Próximo: Pagamento <ChevronRight className="size-4" /></Button>
                </div>
              </section>
            )}

            {etapa === 4 && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
                <h2 className="font-display text-xl flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" />
                  Forma de Pagamento
                </h2>
                <div className="mt-6">
                  <RadioGroup value={pagamento} onValueChange={(v) => setPagamento(v as any)}>
                    {[
                      { value: "pix", label: "PIX", desc: "Pagamento instantâneo" },
                      { value: "dinheiro", label: "Dinheiro", desc: "Pagamento na entrega" },
                      { value: "credito", label: "Cartão de Crédito", desc: "Pagamento na entrega" },
                      { value: "debito", label: "Cartão de Débito", desc: "Pagamento na entrega" },
                    ].map((p) => (
                      <label key={p.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                        <RadioGroupItem value={p.value} />
                        <div className="flex-1">
                          <div className="font-medium">{p.label}</div>
                          <div className="text-sm text-muted-foreground">{p.desc}</div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                {pagamento === "pix" && (
                  <div className="mt-6 rounded-xl border border-border bg-muted/50 p-6 text-center">
                    <QrCode className="mx-auto size-10 text-primary" />
                    <h3 className="mt-3 font-display text-lg">Pague com PIX</h3>
                    <div className="mt-4 mx-auto flex h-48 w-48 items-center justify-center rounded-lg border border-border bg-white">
                      <div className="text-muted-foreground text-sm">QR Code Preview</div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label>PIX Copia e Cola</Label>
                      <Textarea readOnly rows={3} className="font-mono text-xs break-all" defaultValue="00020126580014br.gov.bcb.pix0136123456789000620000000050000000000000000000000000000BR5913NÉIA SALGADOS6009SAO PAULO62070503***6304" />
                      <Button variant="outline" size="sm" className="gap-2"><Copy className="size-3.5" /> Copiar</Button>
                    </div>
                  </div>
                )}
                {pagamento === "dinheiro" && (
                  <div className="mt-6 space-y-2">
                    <Label>Troco para quanto? (opcional)</Label>
                    <Input placeholder="Ex: R$ 100,00" />
                  </div>
                )}
                <div className="mt-6 flex justify-between gap-3">
                  <Button variant="outline" onClick={() => setEtapa(3)}>Voltar</Button>
                  <Button onClick={() => setEtapa(5)} className="brand-gradient text-primary-foreground gap-2">Próximo: Revisão <ChevronRight className="size-4" /></Button>
                </div>
              </section>
            )}

            {etapa === 5 && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
                <h2 className="font-display text-xl flex items-center gap-2">
                  <Receipt className="size-5 text-primary" />
                  Revisar Pedido
                </h2>
                <div className="mt-6 space-y-5">
                  <div className="rounded-lg border border-border p-4">
                    <h3 className="font-medium flex items-center gap-2"><User className="size-4" /> Dados Pessoais</h3>
                    <p className="mt-2 text-sm text-muted-foreground">João Silva • (11) 99999-9999</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <h3 className="font-medium flex items-center gap-2"><MapPin className="size-4" /> Endereço</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Rua das Flores, 123 • Centro • São Paulo/SP</p>
                    <p className="text-sm text-muted-foreground">Tipo: Casa</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <h3 className="font-medium flex items-center gap-2"><Clock className="size-4" /> Entrega</h3>
                    <p className="mt-2 text-sm text-muted-foreground">O mais rápido possível</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <h3 className="font-medium flex items-center gap-2"><CreditCard className="size-4" /> Pagamento</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{pagamento === "pix" ? "PIX" : pagamento === "dinheiro" ? "Dinheiro" : `Cartão de ${pagamento === "credito" ? "Crédito" : "Débito"}`}</p>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-3 rounded-lg bg-primary/10 border border-primary/30 p-4">
                  <CheckCircle2 className="size-5 text-primary" />
                  <p className="text-sm text-primary">Verifique todos os dados antes de confirmar seu pedido.</p>
                </div>
                <div className="mt-6 flex justify-between gap-3">
                  <Button variant="outline" onClick={() => setEtapa(4)}>Voltar</Button>
                  <Button className="brand-gradient text-primary-foreground gap-2">Confirmar Pedido</Button>
                </div>
              </section>
            )}
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <h2 className="font-display text-lg">Resumo do Pedido</h2>
              <ul className="mt-4 space-y-3">
                {MOCK_ITEMS.map((i) => (
                  <li key={i.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate pr-2">{i.quantidade}x {i.nome}</span>
                    <span>{(i.preco * i.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Produtos</span><span>{subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>{taxaEntrega === 0 ? "Grátis" : taxaEntrega.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
                <div className="flex justify-between font-display text-lg border-t border-border pt-3 mt-3">
                  <span>Total</span><span className="text-primary">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}