import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bike,
  Clock,
  Home,
  MapPin,
  Phone,
  Wallet,
  X,
  ArrowLeft,
  BellRing,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { brl, dataHora } from "@/lib/format";
import { AjudaCliente, FidelidadeCliente } from "@/components/reembolsos-estornos/cliente-publico";
import { MapaDemonstrativoCliente } from "@/components/reembolsos-estornos/cliente-mapa";
import React from "react";

export const Route = createFileRoute("/preview/reembolsos-estornos-cliente/$id")({
  validateSearch: (search: Record<string, unknown>): { repetir?: boolean } => ({ repetir: search["repetir"] === true || search["repetir"] === "true" || search["repetir"] === "1" }),
  head: () => ({
    meta: [{ title: "Acompanhar pedido — Néia Salgados" }],
  }),
  component: AcompanharPedido,
});

const PEDIDO_DETALHE_DATA = {
  id: "1053",
  numero: "1053",
  data: "2026-11-14T09:54",
  cliente: "Ana Souza",
  modalidade: "entrega",
  status: "em_rota",
  pagamento: "pago",
  valorTotal: 1745.0,
  taxaEntrega: 0,
  itens: [
    { nome: "50x Mini Bolinha de Queijo 25un", quantidade: 50, precoUnitario: 34.9 },
  ],
  formaPagamento: "Pix",
  pagamentoEm: "2026-11-14T09:55",
  endereco: "Rua das Flores, 249 — Jardim Primavera — Cidade demonstrativa",
  referencia: "Sobrado verde, próximo à praça (endereço fictício)",
  telefone: "(00) 90000-0000",
  horarioLoja: "Segunda a sexta das 8:00 às 22:00",
  emRota: true,
  previsaoChegada: "entre 10:50 e 11:10",
  ultimaAtualizacao: "14/11 às 10:43",
  progresso: 70,
};

const STATUS_LABEL: Record<string, string> = {
  recebido: "Pedido Recebido",
  em_producao: "Em Produção",
  pronto: "Pronto para Entrega",
  aguardando_motoboy: "Aguardando Motoboy",
  em_rota: "Em Rota de Entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  recebido: "bg-amber-100 text-amber-800 border-amber-200",
  em_producao: "bg-blue-100 text-blue-800 border-blue-200",
  pronto: "bg-green-100 text-green-800 border-green-200",
  aguardando_motoboy: "bg-orange-100 text-orange-800 border-orange-200",
  em_rota: "bg-[#F57C00] text-white border-[#F57C00]",
  entregue: "bg-green-100 text-green-800 border-green-200",
  cancelado: "bg-red-100 text-red-800 border-red-200",
};

const PAGAMENTO_LABEL_EXT: Record<string, string> = {
  pago: "Pago e confirmado",
  pendente: "Aguardando pagamento",
  falhou: "Pagamento não aprovado",
  reembolsado: "Pagamento estornado",
};

type FluxoItem = {
  chave: string;
  label: string;
  hora: string;
  feito: boolean;
  atual?: boolean;
};

const fluxoEntrega: FluxoItem[] = [
  { chave: "recebido", label: "Pedido Recebido", hora: "14/11 às 09:54", feito: true },
  { chave: "em_producao", label: "Em Produção", hora: "14/11 às 10:05", feito: true },
  { chave: "em_rota", label: "Em Rota de Entrega", hora: "Saiu para entrega 14/11 às 10:42", feito: true, atual: true },
  { chave: "entregue", label: "Entregue", hora: "Aguardando confirmação", feito: false },
];

const fluxoRetirada: FluxoItem[] = [
  { chave: "recebido", label: "Pedido Recebido", hora: "14/11 às 09:54", feito: true },
  { chave: "em_producao", label: "Em Produção", hora: "14/11 às 10:05", feito: true },
  { chave: "pronto", label: "Pronto para Retirada", hora: "—", feito: false },
  { chave: "entregue", label: "Retirado na Loja", hora: "Aguardando confirmação", feito: false },
];

function AcompanharPedido() {
  const { id } = Route.useParams();
  const pedido = { ...PEDIDO_DETALHE_DATA, id, numero: id };
  const isRetirada = pedido.modalidade === "retirada";

  const fluxo = isRetirada ? fluxoRetirada : fluxoEntrega;
  const { repetir } = Route.useSearch();
  const [modal, setModal] = React.useState<"endereco" | "localizacao" | null>(null);
  const [endereco, setEndereco] = React.useState(pedido.endereco);
  const [mensagem, setMensagem] = React.useState("");

  return (
    <div className="r2b-content r2b-detail" data-testid="r2b-detalhe">
      <section className="r2b-intro">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00]"
              >
                <Link to="/preview/reembolsos-estornos-cliente">
                  <ArrowLeft className="size-4" /> Voltar para Meus Pedidos
                </Link>
              </Button>
            </div>
            <p className="r2b-order-number">Pedido nº {pedido.numero}</p>
            <h1>Acompanhe seu pedido</h1>
            <p className="mt-0.5 text-sm text-[#5D4037]">
              Feito em 14/11/2026 às 09:54
            </p>
          </div>
          <FidelidadeCliente />
      </section>

      {repetir && <p className="r2b-notice" role="status">Repetir pedido — demonstração. Os itens deste pedido foram selecionados para revisão; nenhuma compra ou cobrança foi realizada.</p>}
      <section className="r2b-detail-blocks">
        <section className="r2b-panel r2b-cycle" data-testid="r2b-ciclo">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/50 text-[#D4A94A]">
              <Clock className="size-4" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">
              Ciclo do pedido
            </h2>
          </div>
          <div className="r2b-cycle-track">
            <div className="r2b-cycle-line"><span /></div>
            <div className="r2b-cycle-steps">
              {fluxo.map((etapa, i) => {
                const feito = etapa.feito;
                return (
                  <div key={etapa.chave} className={cn("r2b-cycle-step", etapa.atual ? "is-current" : feito ? "is-done" : "is-future")} aria-current={etapa.atual ? "step" : undefined}>
                    <div className="relative flex items-center justify-center">
                      <div
                        className={cn(
                          "r2b-cycle-dot",
                          etapa.atual
                            ? "border-[#F57C00] bg-[#F57C00] text-white"
                            : feito
                            ? "border-[#35C97C] bg-[#35C97C] text-white"
                            : "border-[#D4A94A]/30 bg-[#FAF9F6] text-[#5D4037]",
                        )}
                      >
                        {etapa.atual ? (
                          <Bike size={24} />
                        ) : feito ? (
                          <Check size={24} />
                        ) : (
                          String(i + 1)
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] font-bold tracking-wider ${feito ? "text-[#2D1B00]" : "text-[#5D4037]"}`}>
                        {etapa.label}
                      </p>
                      <p className="text-[10px] text-[#5D4037]">{etapa.hora}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border",
                  STATUS_COLORS[pedido.status] ?? "bg-muted",
                )}
              >
                Status atual: {STATUS_LABEL[pedido.status] ?? pedido.status}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-[#5D4037]">Previsão de entrega:</p>
              <p className="text-sm font-bold text-[#2D1B00]">{pedido.previsaoChegada}</p>
            </div>
          </div>
        </section>

        <div className="r2b-detail-grid">
          <div className="r2b-detail-group">
            <section className="r2b-notifications r2b-gradient" data-testid="r2b-notificacoes">
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF8E1]/60 border border-[#D4A94A]/30">
                  <BellRing size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#2D1B00]">Notificações do pedido</h3>
                  <p className="text-[10px] text-[#5D4037]">
                    Você receberá atualizações de cada etapa pelo WhatsApp.
                  </p>
                </div>
              </div>
              <a className="r2b-button r2b-button-light" href="#r2b-rastreamento"><MapPin size={16} />Acompanhar entrega em tempo real</a>
            </section>

            <section className="r2b-panel r2b-summary" data-testid="r2b-resumo">
              <div className="r2b-panel-heading r2b-gradient">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/50 text-[#D4A94A]">
                  <Wallet className="size-4" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">Resumo do pedido</h2>
              </div>
              <ul className="r2b-panel-body r2b-summary-lines">
                {pedido.itens.map((item, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-[#5D4037]">{item.nome}</span>
                    <span className="text-[#2D1B00]">{brl(item.precoUnitario * item.quantidade)}</span>
                  </li>
                ))}
                <li className="flex justify-between text-sm mt-2 pt-2 border-t border-[#D4A94A]/20">
                  <span className="text-[#5D4037]">{isRetirada ? "Retirada na loja" : "Entrega"}</span>
                  <span className="text-[#2D1B00]">{isRetirada ? "Grátis" : brl(pedido.taxaEntrega)}</span>
                </li>
                <li className="flex justify-between text-sm font-bold text-[#2D1B00]">
                  <span>Total</span>
                  <span>{brl(pedido.valorTotal)}</span>
                </li>
                <li className="flex justify-between text-xs text-[#5D4037]">
                  <span>Pagamento: Pix</span>
                </li>
                <li className="flex items-center gap-1.5 text-xs mt-1">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-bold text-green-700">{PAGAMENTO_LABEL_EXT[pedido.pagamento]}</span>
                  </span>
                </li>
                {pedido.pagamentoEm && (
                  <li className="flex justify-between text-xs text-[#5D4037] mt-1">
                    <span>Pago em</span>
                    <span>{dataHora(pedido.pagamentoEm)}</span>
                  </li>
                )}
              </ul>
            </section>

            <section className="r2b-panel r2b-delivery" data-testid="r2b-entrega">
              <div className="r2b-panel-heading r2b-gradient">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/50 text-[#D4A94A]">
                  <Phone className="size-4" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">{isRetirada ? "Retirada" : "Entrega"}</h2>
              </div>
              <div className="r2b-panel-body">
                <p className="text-sm text-[#5D4037]"><MapPin size={16} className="inline" /> {endereco}</p>
                <p className="text-sm text-[#5D4037]">Referência: {pedido.referencia}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[#5D4037]">
                  <Phone className="size-3.5" /> {pedido.telefone}
                </p>
                <p className="mt-1 text-xs text-[#5D4037]">{pedido.horarioLoja}</p>
                <div className="r2b-address-actions">
                  <Button
                    onClick={() => setModal("endereco")}
                    variant="outline"
                    className="flex-1 border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00] py-2"
                  >
                      Alterar endereço de entrega
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00] py-2"
                    onClick={() => setModal("localizacao")}
                  >
                    <MapPin className="size-3.5 mr-1" />
                    Permitir minha localização
                  </Button>
                </div>
              <div className="r2b-location-note">
                <p className="text-xs text-[#5D4037]">
                  <span className="font-bold">Sobre a localização:</span>
                   Nesta prévia o consentimento é apenas demonstrativo. Não acessamos seu GPS nem compartilhamos sua localização real.
                </p>
              </div>
              {mensagem && <p className="r2b-notice" role="status">{mensagem}</p>}
              </div>
            </section>
          </div>

          <div className="r2b-detail-group">
            <section className="r2b-panel r2b-tracking" id="r2b-rastreamento" data-testid="r2b-rastreamento">
              <div className="r2b-panel-heading r2b-gradient">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">
                  Acompanhar entrega em tempo real
                </h2>
              </div>
              {pedido.emRota ? (
                <>
                   <div className="r2b-tracking-info">
                    <div className="rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/40 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5D4037]">
                        Status da entrega
                      </p>
                      <p className="text-xs font-bold text-[#2D1B00]">Em rota de entrega</p>
                    </div>
                    <div className="rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/40 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5D4037]">
                        Previsão de chegada
                      </p>
                      <p className="text-xs font-bold text-[#2D1B00]">{pedido.previsaoChegada}</p>
                    </div>
                    <div className="rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/40 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5D4037]">
                        Última atualização
                      </p>
                      <p className="text-xs font-bold text-[#2D1B00]">{pedido.ultimaAtualizacao}</p>
                    </div>
                   <div className="r2b-delivery-progress">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#5D4037]">
                        Progresso da entrega
                      </span>
                      <span className="text-xs font-bold text-[#2D1B00]">≈ {pedido.progresso}%</span>
                    </div>
                    <div className="h-2 bg-[#FFF8E1]/60 rounded-full overflow-hidden">
                      <div className={`h-full bg-[#F2CE6B] rounded-full transition-all duration-700`} style={{ width: `${pedido.progresso}%` }} />
                    </div>
                   </div>
                   </div>
                   <MapaDemonstrativoCliente />
                </>
              ) : (
                <div className="h-64 rounded-xl border border-[#D4A94A]/30 bg-[#FAF9F6] flex items-center justify-center">
                  <p className="text-xs text-[#5D4037] text-center">
                    A localização ficará disponível quando seu pedido sair para entrega.
                  </p>
                </div>
              )}
            </section>

            <AjudaCliente detalhe />
          </div>
        </div>

        <section className="r2b-bottom-actions">
            <Button asChild variant="outline" className="flex-1 border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00] py-3">
              <a href="/preview/cardapio">
                <Home className="size-4 mr-2" /> Voltar ao cardápio
              </a>
            </Button>
              <Button variant="outline" disabled={pedido.status !== "recebido"} title="Cancelamento disponível apenas antes de iniciar a produção." className="r2b-cancel">
                Cancelar pedido
              </Button>
          {pedido.status !== "recebido" && <small>O pedido já saiu para entrega. Para solicitar ajuda, fale com a atendente.</small>}
        </section>
      </section>
      {modal && <div className="r2b-modal-backdrop"><section className="r2b-modal" role="dialog" aria-modal="true" aria-labelledby="r2b-modal-title">
        <button className="r2b-modal-close" aria-label="Fechar" onClick={() => setModal(null)} autoFocus><X size={20} /></button>
        <h2 id="r2b-modal-title">{modal === "endereco" ? "Alterar endereço de entrega" : "Permitir minha localização"}</h2>
        {modal === "endereco" ? <form onSubmit={(e) => { e.preventDefault(); const valor = String(new FormData(e.currentTarget).get("endereco") ?? "").trim(); if (!valor) return; setEndereco(valor); setMensagem("Endereço alterado somente nesta demonstração. A entrega real não foi modificada."); setModal(null); }}>
          <label htmlFor="r2b-endereco">Endereço fictício</label><input id="r2b-endereco" name="endereco" defaultValue={endereco} required />
          <p>Nenhuma alteração será enviada ao entregador ou à loja.</p><button className="r2b-button r2b-button-primary">Salvar endereço demonstrativo</button>
        </form> : <><p>Você permite simular o compartilhamento de localização? Usaremos somente o ponto fictício do mapa. Nenhum GPS será acessado e nenhum dado real será coletado.</p>
          <div className="r2b-modal-actions"><button className="r2b-button r2b-button-outline" onClick={() => setModal(null)}>Agora não</button><button className="r2b-button r2b-button-primary" onClick={() => { setMensagem("Consentimento demonstrativo registrado. Apenas a localização fictícia do mapa é exibida; GPS real não acessado."); setModal(null); }}>Permitir na demonstração</button></div></>}
      </section></div>}
    </div>
  );
}
