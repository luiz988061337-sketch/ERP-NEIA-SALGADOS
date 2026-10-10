import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ChefHat, Bike, Package, MapPin, Phone, Star, User, MessageCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/pedido/$id")({
  head: () => ({
    meta: [
      { title: "Acompanhar Pedido — Néia Salgados Preview" },
      { name: "description", content: "Acompanhe seu pedido Néia Salgados" },
    ],
  }),
  component: PreviewAcompanhamento,
});

const STEPS = [
  { id: "recebido", label: "Pedido Recebido", icon: CheckCircle2, descricao: "Confirmamos seu pedido" },
  { id: "preparacao", label: "Em Preparação", icon: ChefHat, descricao: "Estamos preparando seus salgados" },
  { id: "pronto", label: "Pronto para Entrega", icon: Package, descricao: "Seu pedido está pronto" },
  { id: "rota", label: "Saiu para Entrega", icon: Bike, descricao: "Motoboy a caminho" },
  { id: "entregue", label: "Entregue", icon: CheckCircle2, descricao: "Pedido entregue com sucesso" },
];

const MOCK_PEDIDO = {
  id: "123",
  numero: 123,
  status: "rota",
  cliente_nome: "João Silva",
  telefone: "(11) 99999-9999",
  endereco: "Rua das Flores, 123 • Centro • São Paulo/SP",
  criado_em: "15/10/2026 14:30",
  estimativa: "15–20 min",
  motoboy: { nome: "Carlos Alberto", telefone: "(11) 98765-4321" },
  itens: [
    { nome: "Coxinha de Frango c/ Catupiry", qtd: 3, preco: 7.50 },
    { nome: "Bolinho de Queijo", qtd: 2, preco: 6.50 },
    { nome: "Risol de Presunto e Queijo", qtd: 1, preco: 7.00 },
  ],
  subtotal: 40.50,
  entrega: 6.00,
  total: 46.50,
  pagamento: "PIX",
  pagamentos_status: "pago",
};

function PreviewAcompanhamento() {
  const [currentStep] = useState("rota");
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  const statusMessage: Record<string, string> = {
    recebido: "Recebido às 14:30",
    preparacao: "Em preparo desde 14:35",
    pronto: "Pronto às 14:50",
    rota: "Saiu para entrega às 14:55 • Chegada prevista em 15–20 min",
    entregue: "Entregue às 15:15",
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-3xl px-4 py-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/preview"><ArrowLeft className="size-5" /></Link>
              </Button>
              <div>
                <h1 className="font-display text-xl">Acompanhar Pedido #{MOCK_PEDIDO.numero}</h1>
                <p className="text-sm text-muted-foreground">Feito em {MOCK_PEDIDO.criado_em}</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1"><Phone className="size-3.5" /> Ligar</Button>
              <Button variant="outline" size="sm" className="gap-1"><MessageCircle className="size-3.5" /> WhatsApp</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 lg:px-8 space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg">Status do Pedido</h2>
            <span className="text-sm text-primary font-medium">{statusMessage[currentStep]}</span>
          </div>
          <div className="relative">
            <div className="absolute left-5 top-0 h-full w-px bg-border" aria-hidden="true" />
            <ol className="space-y-8">
              {STEPS.map((step, idx) => {
                const isCompleted = idx < currentIndex;
                const isCurrent = idx === currentIndex;
                const Icon = step.icon;
                return (
                  <li key={step.id} className="relative flex items-start gap-4 animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-full border z-10",
                      isCurrent && "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]",
                      isCompleted && "border-primary bg-primary/10 text-primary",
                      !isCurrent && !isCompleted && "border-border bg-muted text-muted-foreground"
                    )}>
                      <Icon className="size-5" />
                    </div>
                    <div className="pt-1">
                      <h3 className={cn("font-medium", isCurrent ? "text-primary" : "text-foreground", isCompleted ? "text-foreground" : "text-muted-foreground")}>{step.label}</h3>
                      <p className="text-sm text-muted-foreground">{step.descricao}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {currentStep === "rota" && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
            <h2 className="font-display text-lg flex items-center gap-2">
              <Bike className="size-5 text-primary" />
              Entrega a Caminho
            </h2>
            <div className="mt-4 rounded-xl border border-border bg-muted/50 h-64 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="mx-auto size-8 text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">Mapa de entrega (visualização)</p>
                <p className="text-xs text-muted-foreground mt-1">Destino: {MOCK_PEDIDO.endereco}</p>
                <p className="text-xs text-muted-foreground">Motoboy: {MOCK_PEDIDO.motoboy.nome} • {MOCK_PEDIDO.estimativa}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{MOCK_PEDIDO.motoboy.nome}</p>
                  <p className="text-sm text-muted-foreground">Entregador</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-2"><Phone className="size-4" /> Ligar para o motoboy</Button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <h2 className="font-display text-lg">Resumo do Pedido</h2>
          <ul className="mt-4 space-y-3">
            {MOCK_PEDIDO.itens.map((i, idx) => (
              <li key={idx} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{i.qtd}x {i.nome}</span>
                <span>{(i.qtd * i.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Produtos</span><span>{MOCK_PEDIDO.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>{MOCK_PEDIDO.entrega.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
            <div className="flex justify-between font-display text-lg border-t border-border pt-3 mt-3">
              <span>Total</span><span className="text-primary">{MOCK_PEDIDO.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pagamento</span><span>{MOCK_PEDIDO.pagamento} • {MOCK_PEDIDO.pagamentos_status}</span></div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <h2 className="font-display text-lg flex items-center gap-2"><MapPin className="size-5 text-primary" /> Endereço de Entrega</h2>
          <p className="mt-2 text-muted-foreground">{MOCK_PEDIDO.endereco}</p>
          <p className="mt-1 text-sm text-muted-foreground">Cliente: {MOCK_PEDIDO.cliente_nome}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <h2 className="font-display text-lg">Avalie sua Experiência</h2>
          <p className="mt-2 text-muted-foreground">Gostou do pedido? Deixe sua avaliação e ajude outros clientes.</p>
          <div className="mt-4 flex items-center gap-1">
            {[1,2,3,4,5].map((i) => (
              <Star key={i} className="size-6 text-muted-foreground hover:text-primary cursor-pointer transition-colors" />
            ))}
          </div>
          <Button variant="outline" className="mt-4">Enviar Avaliação</Button>
        </section>
      </div>
    </div>
  );
}