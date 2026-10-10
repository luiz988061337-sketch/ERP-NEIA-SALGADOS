import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Filter, Search, MapPin, Bike, Clock, CheckCircle2, User, Phone, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { criarFilaVoz, type FilaVoz, type VozInfo } from "@/routes/preview/producao-nova";

export const Route = createFileRoute("/preview/admin/entregas")({
  head: () => ({
    meta: [
      { title: "Central de Entregas — Preview" },
      { name: "description", content: "Central de entregas Néia Salgados" },
    ],
  }),
  component: PreviewEntregas,
});

const CATEGORIAS = [
  { key: "aguardando", label: "Aguardando", count: 5, color: "bg-primary/10 text-primary border-primary/20" },
  { key: "atribuidos", label: "Atribuídos", count: 3, color: "bg-primary/10 text-primary border-primary/20" },
  { key: "em_rota", label: "Em Rota", count: 8, color: "bg-primary/10 text-primary border-primary/20" },
  { key: "entregues", label: "Entregues", count: 12, color: "bg-success/10 text-success border-success/20" },
];

/**
 * PRÉVIA (dados 100% fictícios) — Central de Entregas com prazos.
 * Campos de prazo por pedido (prévia visual; integração real pendente de autorização):
 * limitePronto = horário limite p/ estar pronto p/ sair; prazoMax = promessa ao
 * cliente; eta = previsão de chegada (estimativa, só quando confiável);
 * saidaEfetiva = hora em que realmente saiu; situacao diferencia PRONTO P/ SAIR × SAIU.
 */
const PEDIDOS = {
  aguardando: [
    { id: 129, cliente: "Ana Paula", endereco: "Rua das Flores, 123 • Centro", bairro: "Centro", valor: 46.50, taxa: 6.00, total: 52.50, pagamento: "PIX", horario: "14:50", obs: "Apartamento 42, bloco B", limitePronto: "15:20", prazoMax: "16:00", eta: null, saidaEfetiva: null, situacao: "PRONTO P/ SAIR" },
    { id: 130, cliente: "Pedro Lima", endereco: "Av. Paulista, 1000 • Bela Vista", bairro: "Bela Vista", valor: 58.00, taxa: 6.00, total: 64.00, pagamento: "Dinheiro", horario: "14:52", obs: "", limitePronto: "15:35", prazoMax: "16:10", eta: null, saidaEfetiva: null, situacao: "PRONTO P/ SAIR" },
  ],
  atribuidos: [
    { id: 131, cliente: "Maria Santos", endereco: "Rua Augusta, 456 • Consolação", bairro: "Consolação", valor: 38.00, taxa: 6.00, total: 44.00, pagamento: "PIX", horario: "14:48", motoboy: "Carlos Alberto", obs: "", limitePronto: "15:15", prazoMax: "15:55", eta: null, saidaEfetiva: null, situacao: "PRONTO P/ SAIR", rota: "Rota Centro • 3 paradas" },
  ],
  em_rota: [
    { id: 126, cliente: "João Silva", endereco: "Rua das Palmeiras, 789 • Pinheiros", bairro: "Pinheiros", valor: 46.50, taxa: 6.00, total: 52.50, pagamento: "PIX", horario: "14:45", motoboy: "Carlos Alberto", obs: "Interfone 1234", limitePronto: "15:00", prazoMax: "15:40", eta: "15:47", saidaEfetiva: "15:22", situacao: "SAIU", rota: "Rota Pinheiros • 2 paradas" },
  ],
  entregues: [
    { id: 120, cliente: "Roberto Alves", endereco: "Rua do Comércio, 200 • Centro", bairro: "Centro", valor: 42.00, taxa: 6.00, total: 48.00, pagamento: "PIX", horario: "14:10", motoboy: "Carlos Alberto", obs: "", limitePronto: "14:30", prazoMax: "15:10", eta: "14:52", saidaEfetiva: "14:35", situacao: "ENTREGUE" },
  ],
};

/** Ocorrência operacional fictícia (prévia) para demonstrar voz da Central. */
const OCORRENCIA_MOCK = "Ocorrência: motoboy Carlos com pneu furado. Rota Pinheiros redistribuída.";

function PreviewEntregas() {
  const [activeTab, setActiveTab] = useState<keyof typeof PEDIDOS>("aguardando");
  const [filtro, setFiltro] = useState("todos");
  // Voz da Central: fila INDEPENDENTE da cozinha (só assuntos de entrega).
  const voz = useRef<FilaVoz | null>(null);
  const [vozLigada, setVozLigada] = useState(false);
  const [vozInfo, setVozInfo] = useState<VozInfo>({ fila: 0, falando: false, status: "desativada" });
  if (!voz.current) voz.current = criarFilaVoz((info) => setVozInfo(info));

  function alternarVozCentral(): void {
    const f = voz.current;
    if (!f) return;
    const ligar = !vozLigada;
    setVozLigada(ligar);
    f.setAtivada(ligar);
    if (ligar) {
      f.anunciar({ id: "central:pronto-131", texto: "Pedido 131 pronto aguardando motoboy.", prioridade: 2 });
      f.anunciar({ id: "central:risco-126", texto: "Alerta: entrega 126 em risco de atraso.", prioridade: 4 });
      f.anunciar({ id: "central:ocorrencia-1", texto: OCORRENCIA_MOCK, prioridade: 4 });
    }
  }

  useEffect(() => {
    try {
      const onVis = () => {
        try {
          window.speechSynthesis.resume();
        } catch {
          /* visual cobre */
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    } catch {
      return;
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl">Central de Entregas</h1>
              <p className="text-sm text-muted-foreground">Gestão de entregas em tempo real • PRÉVIA com dados fictícios — pronto p/ sair ≠ saiu</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">Mapa Geral</Button>
              <Button size="sm" className="brand-gradient text-black">Atualizar</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8 space-y-6">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4 text-xs" aria-label="Voz da Central (prévia)">
          <button type="button" onClick={alternarVozCentral} className={`rounded-lg px-3 py-1.5 font-bold text-white ${vozLigada ? "bg-emerald-600 hover:bg-emerald-500" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            🎙️ Voz da Central: {vozLigada ? "ligada" : "desligada"}
          </button>
          <button type="button" onClick={() => voz.current?.testar()} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-white hover:bg-zinc-700">
            Testar áudio
          </button>
          <button type="button" onClick={() => voz.current?.silenciar(10)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-white hover:bg-zinc-700">
            Silenciar 10 min
          </button>
          <span className="ml-auto text-muted-foreground">
            {vozInfo.status === "ativa" ? "🟢 voz ativa" : null}
            {vozInfo.status === "silenciada" ? "🟡 silenciada (visual segue)" : null}
            {vozInfo.status === "desativada" ? "⚪ desligada" : null}
            {vozInfo.status === "indisponivel" ? "🔴 indisponível (visual cobre)" : null}
            {vozInfo.falando ? " • falando…" : null}
            {vozInfo.fila > 0 ? ` • fila: ${vozInfo.fila}` : null}
          </span>
          <p className="w-full text-muted-foreground">Fila independente da cozinha: só entrega (pronto aguardando, limite, risco, ocorrência). Sem duplicar avisos entre painéis.</p>
        </div>
        <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm" aria-label="Ocorrência operacional (prévia)">
          <p className="font-bold">⚠️ {OCORRENCIA_MOCK}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {CATEGORIAS.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key as keyof typeof PEDIDOS)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                activeTab === cat.key
                  ? "border-primary bg-primary/10 shadow-[var(--shadow-card)]"
                  : "border-border bg-card hover:border-primary/30 hover:shadow-[var(--shadow-card)]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("rounded-full px-2 py-1 text-xs border", cat.color)}>{cat.label}</span>
                <span className="text-2xl font-display">{cat.count}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por pedido, cliente ou endereço..." className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant={filtro === "todos" ? "default" : "outline"} size="sm" onClick={() => setFiltro("todos")}>Todos</Button>
              <Button variant={filtro === "hoje" ? "default" : "outline"} size="sm" onClick={() => setFiltro("hoje")}>Hoje</Button>
              <Button variant={filtro === "em_rota" ? "default" : "outline"} size="sm" onClick={() => setFiltro("em_rota")}>Em Rota</Button>
            </div>
          </div>
          <div className="space-y-3">
            {PEDIDOS[activeTab].map((p: any) => (
              <div key={p.id} className="rounded-xl border border-border p-4 hover:border-primary/30 transition-all hover:shadow-[var(--shadow-card)] animate-slide-up">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">#{p.id}</span>
                      <span className="text-sm font-medium">{p.cliente}</span>
                      <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{p.pagamento}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="size-4 mt-0.5 shrink-0" />
                      <span>{p.endereco} • {p.bairro}</span>
                    </div>
                    {p.obs && <p className="text-xs text-muted-foreground">Obs: {p.obs}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${p.situacao === "SAIU" ? "border-orange-500/40 bg-orange-500/10 text-orange-600" : p.situacao === "ENTREGUE" ? "border-green-500/40 bg-green-500/10 text-green-600" : "border-sky-500/40 bg-sky-500/10 text-sky-600"}`}>{p.situacao}</span>
                      {p.limitePronto && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">⏰ Limite pronto {p.limitePronto}</span>}
                      {p.prazoMax && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">👤 Prazo máx {p.prazoMax}</span>}
                      {p.eta && <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">📍 ETA {p.eta}</span>}
                      {p.eta && p.prazoMax && p.eta > p.prazoMax && p.situacao !== "ENTREGUE" && <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-600">🚨 RISCO DE ATRASO</span>}
                    </div>
                    {p.rota && <p className="text-xs text-muted-foreground">🗺️ {p.rota}</p>}
                    {p.saidaEfetiva && <p className="text-xs text-muted-foreground">🛵 Saiu às {p.saidaEfetiva}{p.motoboy ? ` • ${p.motoboy}` : ""}</p>}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="text-right">
                      <p className="font-medium">{p.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                      <p className="text-xs text-muted-foreground">Prod: {p.valor} + Taxa: {p.taxa}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Clock className="size-3" /> {p.horario}</p>
                    </div>
                    {p.motoboy && <div className="text-right"><p className="text-sm font-medium flex items-center gap-1 justify-end"><Bike className="size-4" /> {p.motoboy}</p></div>}
                    <div className="flex flex-wrap gap-2">
                      {activeTab === "aguardando" && (
                        <>
                          <Button size="sm" variant="outline">Atribuir Motoboy</Button>
                          <Button size="sm" variant="outline">Criar Rota</Button>
                          <Button size="sm" variant="outline" className="gap-1"><Navigation className="size-3" /> Maps</Button>
                        </>
                      )}
                      {activeTab === "atribuidos" && (
                        <>
                          <Button size="sm" variant="outline">Criar Rota</Button>
                          <Button size="sm" variant="outline" className="gap-1"><Navigation className="size-3" /> Maps</Button>
                        </>
                      )}
                      {activeTab === "em_rota" && (
                        <>
                          <Button size="sm" variant="outline">Acompanhar</Button>
                          <Button size="sm" variant="outline" className="gap-1"><Navigation className="size-3" /> Maps</Button>
                          <Button size="sm" className="bg-success text-success-foreground">Marcar Entregue</Button>
                        </>
                      )}
                      {activeTab === "entregues" && (
                        <Button size="sm" variant="outline">Ver Detalhes</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}