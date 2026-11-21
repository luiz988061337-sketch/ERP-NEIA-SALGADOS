import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  BellRing,
  Check,
  Clock,
  Home,
  MapPin,
  Phone,
  Store,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { brl, dataHora, PAGAMENTO_STATUS_LABEL, statusFlow, statusLabel } from "@/lib/format";
import { AjudaCliente, FidelidadeCliente } from "@/components/reembolsos-estornos/cliente-publico";
import { MEUS_PEDIDOS_CLIENTE_DEMO } from "@/lib/pedidos-demo-cliente";
import React from "react";

export const Route = createFileRoute("/preview/reembolsos-estornos-cliente/$id")({
  validateSearch: (search: Record<string, unknown>): { repetir?: boolean } => ({ repetir: search["repetir"] === true || search["repetir"] === "true" || search["repetir"] === "1" }),
  // Compatibilidade: links antigos continuam funcionando, mas sempre caem na
  // tela moderna. O componente legado permanece no arquivo apenas como
  // referência histórica até a remoção ser autorizada — nunca é renderizado.
  beforeLoad: ({ params, search }) => {
    const repetir = (search as { repetir?: boolean }).repetir;
    throw redirect({
      to: "/pedido/$id",
      params: { id: params.id },
      search: repetir ? { repetir: true } : {},
      replace: true,
    });
  },
  head: () => ({
    meta: [{ title: "Acompanhar pedido — Néia Salgados" }],
  }),
  component: AcompanharPedido,
});

// Detalhes demonstrativos acrescentados à fonte única de pedidos (lista/detalhe).
const DETALHES_DEMO: Record<string, {
  cliente: string;
  itens: { nome: string; quantidade: number; precoUnitario: number }[];
  formaPagamento: string;
  pagamentoEm?: string;
  endereco: string;
  referencia: string;
  telefone: string;
  horarioLoja: string;
}> = {
  "1053": {
    cliente: "Ana Souza",
    itens: [{ nome: "50x Mini Bolinha de Queijo 25un", quantidade: 50, precoUnitario: 34.9 }],
    formaPagamento: "Pix",
    pagamentoEm: "2026-11-14T09:55",
    endereco: "Rua das Flores, 249 — Jardim Primavera — Cidade demonstrativa",
    referencia: "Sobrado verde, próximo à praça (endereço fictício)",
    telefone: "(00) 90000-0000 — demonstração",
    horarioLoja: "Segunda a sexta das 8:00 às 22:00",
  },
};

function detalhesPadrao(id: string) {
  return {
    cliente: "Cliente demonstrativo",
    itens: [{ nome: "Itens do pedido", quantidade: 1, precoUnitario: 0 }],
    formaPagamento: "Não informado",
    pagamentoEm: undefined,
    endereco: "Endereço demonstrativo — não é endereço real",
    referencia: "Informações fictícias, somente nesta demonstração",
    telefone: "(00) 90000-0000 — demonstração",
    horarioLoja: "Horário demonstrativo",
  };
}

function AcompanharPedido() {
  const { id } = Route.useParams();
  const pedidoBase = MEUS_PEDIDOS_CLIENTE_DEMO.find((p) => p.id === id);
  // Pedido desconhecido: nunca inventar dados, status ou valores.
  if (!pedidoBase) {
    return (
      <div className="r2b-content r2b-detail" data-testid="r2b-detalhe">
        <section className="r2b-panel">
          <h1>Pedido não encontrado</h1>
          <p>Este pedido demonstrativo não existe. Volte para Meus pedidos.</p>
          <Button asChild variant="outline"><Link to="/preview/reembolsos-estornos-cliente">Voltar para Meus pedidos</Link></Button>
        </section>
      </div>
    );
  }
  return <Detalhe pedido={pedidoBase} />;
}

function Detalhe({ pedido }: { pedido: (typeof MEUS_PEDIDOS_CLIENTE_DEMO)[number] }) {
  const detalhes = DETALHES_DEMO[pedido.id] ?? detalhesPadrao(pedido.id);
  const isRetirada = pedido.modalidade === "retirada";
  const { repetir } = Route.useSearch();
  const [endereco, setEndereco] = React.useState(detalhes.endereco);
  const [mensagem, setMensagem] = React.useState("");

  // Etapas derivadas do status real — nunca flags soltas.
  const fluxoChaves = statusFlow(pedido.modalidade);
  const atual = fluxoChaves.indexOf(pedido.status);
  const fluxo = fluxoChaves.map((chave, i) => ({
    chave,
    label: statusLabel(chave, pedido.modalidade),
    feito: atual >= 0 && i <= atual,
    atual: i === atual,
    hora: i === 0 ? dataHora(pedido.data) : "—",
  }));
  const statusInfo = statusLabel(pedido.status, pedido.modalidade);
  const pagamentoInfo = PAGAMENTO_STATUS_LABEL[pedido.pagamento] ?? pedido.pagamento;
  const taxa = isRetirada ? 0 : Math.max(0, pedido.valor - detalhes.itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0));

  return (
    <div className="r2b-content r2b-detail" data-testid="r2b-detalhe">
      <section className="r2b-intro">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Button asChild variant="outline" size="sm" className="border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00]">
              <Link to="/preview/reembolsos-estornos-cliente">
                <ArrowLeft className="size-4" /> Voltar para Meus pedidos
              </Link>
            </Button>
          </div>
          <p className="r2b-order-number">Pedido nº {pedido.numero}</p>
          <h1>Acompanhe seu pedido</h1>
          <p className="mt-0.5 text-sm text-[#5D4037]">Feito em {dataHora(pedido.data)}</p>
        </div>
        <FidelidadeCliente />
      </section>

      {repetir && <p className="r2b-notice" role="status">Repetir pedido — demonstração. Os itens deste pedido foram selecionados para revisão; nenhuma compra ou cobrança foi realizada.</p>}
      <p className="r2b-notice" role="note">Demonstração: dados fictícios, nenhuma operação real. Previsões e rastreamento indisponíveis nesta prévia.</p>

      <section className="r2b-detail-blocks">
        <section id="r2b-ciclo" className="r2b-panel r2b-cycle" data-testid="r2b-ciclo">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/50 text-[#D4A94A]">
              <Clock className="size-4" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">Ciclo do pedido</h2>
          </div>
          <div className="r2b-cycle-track">
            <div className="r2b-cycle-line"><span /></div>
            <div className="r2b-cycle-steps">
              {fluxo.map((etapa, i) => (
                <div key={etapa.chave} className={cn("r2b-cycle-step", etapa.atual ? "is-current" : etapa.feito ? "is-done" : "is-future")} aria-current={etapa.atual ? "step" : undefined}>
                  <div className="relative flex items-center justify-center">
                    <div className={cn(
                      "r2b-cycle-dot",
                      etapa.atual
                        ? "border-[#F57C00] bg-[#F57C00] text-white"
                        : etapa.feito
                          ? "border-[#35C97C] bg-[#35C97C] text-white"
                          : "border-[#D4A94A]/30 bg-[#FAF9F6] text-[#5D4037]",
                    )}>
                      {etapa.atual ? (isRetirada ? <Store size={24} /> : <Truck size={24} />) : etapa.feito ? <Check size={24} /> : String(i + 1)}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold tracking-wider text-[#2D1B00]">{etapa.label}</p>
                    <p className="text-xs text-[#5D4037]">{etapa.hora}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="rounded border border-[#D4A94A]/40 bg-[#FFF8E1] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#2D1B00]">
              Status atual: {statusInfo}
            </span>
            <div className="text-right">
              <p className="text-xs font-bold text-[#5D4037]">Previsão:</p>
              <p className="text-sm font-bold text-[#2D1B00]">Indisponível nesta demonstração</p>
            </div>
          </div>
        </section>

        <div className="r2b-detail-grid">
          <div className="r2b-detail-group">
            <section className="r2b-notifications r2b-gradient" data-testid="r2b-notificacoes">
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/60">
                  <BellRing size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#2D1B00]">Notificações do pedido</h3>
                  <p className="text-xs text-[#5D4037]">Nesta demonstração nenhuma mensagem é enviada; acompanhe as etapas por aqui.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="r2b-button r2b-button-light" href="#r2b-ciclo">
                  <Clock size={16} /> Ver etapas do pedido
                </a>
                {!isRetirada && (
                  <a className="r2b-button r2b-button-glass" href="#r2b-rastreamento">
                    <MapPin size={16} /> Acompanhar entrega
                  </a>
                )}
              </div>
            </section>

            <section className="r2b-panel r2b-summary" data-testid="r2b-resumo">
              <div className="r2b-panel-heading r2b-gradient">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/50 text-[#D4A94A]"><Wallet className="size-4" /></div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">Resumo do pedido</h2>
              </div>
              <ul className="r2b-panel-body r2b-summary-lines">
                {detalhes.itens.map((item, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-[#5D4037]">{item.nome}</span>
                    <span className="text-[#2D1B00]">{brl(item.precoUnitario * item.quantidade)}</span>
                  </li>
                ))}
                <li className="mt-2 flex justify-between border-t border-[#D4A94A]/20 pt-2 text-sm">
                  <span className="text-[#5D4037]">{isRetirada ? "Retirada na loja" : "Entrega"}</span>
                  <span className="text-[#2D1B00]">{isRetirada ? "Retirada grátis" : taxa > 0 ? brl(taxa) : "A calcular"}</span>
                </li>
                <li className="flex justify-between text-sm font-bold text-[#2D1B00]"><span>Total</span><span>{brl(pedido.valor)}</span></li>
                <li className="text-xs text-[#5D4037]">Forma de pagamento: {detalhes.formaPagamento}</li>
                <li className="mt-1 flex items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /><span className="font-bold text-green-700">{pagamentoInfo}</span></span>
                </li>
                {detalhes.pagamentoEm && (
                  <li className="mt-1 flex justify-between text-xs text-[#5D4037]"><span>Pago em</span><span>{dataHora(detalhes.pagamentoEm)}</span></li>
                )}
              </ul>
            </section>

            <section className="r2b-panel r2b-delivery" data-testid="r2b-entrega">
              <div className="r2b-panel-heading r2b-gradient">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#D4A94A]/30 bg-[#FFF8E1]/50 text-[#D4A94A]">{isRetirada ? <Store className="size-4" /> : <Phone className="size-4" />}</div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">{isRetirada ? "Retirada" : "Entrega"}</h2>
              </div>
              <div className="r2b-panel-body">
                <p className="text-sm text-[#5D4037]"><MapPin size={16} className="inline" /> {endereco}</p>
                <p className="text-sm text-[#5D4037]">Referência: {detalhes.referencia}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[#5D4037]"><Phone className="size-3.5" /> {detalhes.telefone}</p>
                <p className="mt-1 text-xs text-[#5D4037]">{detalhes.horarioLoja}</p>
                {!isRetirada && (
                  <div className="r2b-address-actions">
                    <Button onClick={() => {
                      const valor = window.prompt("Endereço demonstrativo", endereco);
                      if (valor?.trim()) { setEndereco(valor.trim()); setMensagem("Endereço alterado somente nesta demonstração. A entrega real não foi modificada."); }
                    }} variant="outline" className="flex-1 border-[#D4A94A]/40 py-2 text-[#5D4037] hover:border-[#F57C00]">Alterar endereço de entrega</Button>
                  </div>
                )}
                <div className="r2b-location-note">
                  <p className="text-xs text-[#5D4037]"><span className="font-bold">Sobre a localização:</span> Nesta demonstração não acessamos GPS nem usamos endereço ou coordenadas reais.</p>
                </div>
                {mensagem && <p className="r2b-notice" role="status">{mensagem}</p>}
              </div>
            </section>
          </div>

          <div className="r2b-detail-group">
            <section className="r2b-panel r2b-tracking" id="r2b-rastreamento" data-testid="r2b-rastreamento">
              <div className="r2b-panel-heading r2b-gradient">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2D1B00]">{isRetirada ? "Retirada na loja" : "Acompanhar entrega"}</h2>
              </div>
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-[#D4A94A]/30 bg-[#FAF9F6] p-6 text-center">
                {isRetirada ? <Store className="size-8 text-[#D4A94A]" /> : <Truck className="size-8 text-[#D4A94A]" />}
                <p className="text-sm font-bold text-[#2D1B00]">{isRetirada ? "SEM RASTREAMENTO DE MOTOBOY" : "RASTREAMENTO INDISPONÍVEL"}</p>
                <p className="text-xs text-[#5D4037]">
                  {isRetirada
                    ? "Pedido retirado diretamente na loja. Acompanhe as etapas acima."
                    : "Nesta demonstração não há GPS autorizado nem posição real do entregador."}
                </p>
              </div>
            </section>
            <AjudaCliente detalhe />
          </div>
        </div>

        <section className="r2b-bottom-actions">
          <Button asChild variant="outline" className="flex-1 border-[#D4A94A]/40 py-3 text-[#5D4037] hover:border-[#F57C00]">
            <Link to="/preview/cardapio"><Home className="mr-2 size-4" /> Voltar ao cardápio</Link>
          </Button>
        </section>
      </section>
    </div>
  );
}
