import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Clock,
  Home,
  Package,
  ShieldAlert,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/format";
import React from "react";
import { dadosCliente, PEDIDOS_AUTORIZADOS_CLIENTE, type ProblemaCliente } from "@/components/reembolsos-estornos/origens-dados";
import { SolicitacoesCliente, useClientePreview } from "@/components/reembolsos-estornos/cliente-sessao";

/**
 * PRÉVIA R2-B — Novo reembolso / estorno (cliente).
 * Formulário público para o cliente informar problema e solicitar reembolso.
 * Reusa regras R1/R2-A para validação (limite, duplicidade, parcial/total).
 * Dados locais; nada é gravado.
 */
export const Route = createFileRoute("/preview/reembolsos-estornos-cliente/novo")({
  head: () => ({
    meta: [{ title: "Solicitar reembolso — Néia Salgados" }],
  }),
  component: NovoReembolso,
});

const CATEGORIAS = [
  { valor: "produto_faltante", label: "Produto faltante" },
  { valor: "produto_incorreto", label: "Produto incorreto" },
  { valor: "qualidade", label: "Qualidade" },
  { valor: "entrega", label: "Entrega" },
  { valor: "pagamento", label: "Pagamento/cobrança" },
  { valor: "outro", label: "Outro" },
];

const MEUS_PEDIDOS = [
  { referencia: "#1053", valorOriginal: 1745, formaPagamento: "Pix", situacao: "Em Rota de Entrega (demonstrativo)" },
  ...PEDIDOS_AUTORIZADOS_CLIENTE,
];

function NovoReembolso() {
  const [categoria, setCategoria] = React.useState<string>("");
  const [pedidoRef, setPedidoRef] = React.useState<string>("#1053");
  const [valorSolicitado, setValorSolicitado] = React.useState<string>("");
  const [descricao, setDescricao] = React.useState<string>("");
  const [enviado, setEnviado] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const { solicitar } = useClientePreview();

  const pedido = MEUS_PEDIDOS.find((p) => p.referencia === pedidoRef);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pedido || !categoria || !descricao.trim()) return;
    const problema: ProblemaCliente = categoria === "entrega" ? "entrega" : categoria === "pagamento" ? "cobranca" : "produto";
    const resultado = solicitar(dadosCliente({ pedido, problema, valor: Number(valorSolicitado), motivo: descricao }));
    if (!resultado.ok) { setErro(resultado.erro); return; }
    setErro("");
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="r2b-refund min-h-screen bg-[#FAF9F6]">
        <section className="mx-auto max-w-[600px] px-4 py-12">
          <div className="rounded-2xl border border-[#D4A94A]/40 bg-gradient-to-r from-[#F57C00] to-[#F2CE6B] p-8 text-[#2D1B00] text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF8E1]/60 border border-[#D4A94A]/30 mx-auto mb-4">
              <ShieldAlert className="size-8 text-[#F57C00]" />
            </div>
            <h2 className="text-xl font-bold text-[#2D1B00] mb-2">Solicitação demonstrativa registrada!</h2>
            <p className="text-xs text-[#5D4037] mb-6">
              Sua solicitação foi registrada apenas nesta prévia. Nenhuma mensagem, pagamento ou estorno real foi realizado.
            </p>
            <Button asChild className="w-full bg-[#F2CE6B] text-[#2D1B00] hover:bg-[#F5A623] border-none shadow-none py-3">
              <Link to="/preview/reembolsos-estornos-cliente">Voltar aos meus pedidos</Link>
            </Button>
          </div>
          <SolicitacoesCliente />
        </section>
      </div>
    );
  }

  return (
    <div className="r2b-refund min-h-screen bg-[#FAF9F6]">
      <section className="mx-auto max-w-[600px] px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00]"
          >
            <Link to="/preview/reembolsos-estornos-cliente">
              <Package className="size-4" /> Meus pedidos
            </Link>
          </Button>
        </div>
        <h1 className="text-2xl font-bold text-[#2D1B00] mb-2">
          Solicitar reembolso ou estorno
        </h1>
        <p className="text-sm text-[#5D4037] mb-6">
          Informe o ocorrido e solicite um reembolso (total ou parcial), se aplicável.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="r2b-pedido-ref" className="text-xs font-bold text-[#5D4037] uppercase tracking-wider">
              Pedido
            </label>
            <select
              id="r2b-pedido-ref"
              value={pedidoRef}
              onChange={(e) => setPedidoRef(e.target.value)}
              className="w-full rounded-lg border border-[#D4A94A]/40 bg-white px-3 py-2 text-sm focus:border-[#F57C00] outline-none"
            >
              {MEUS_PEDIDOS.map((p) => (
                <option key={p.referencia} value={p.referencia}>
                  Pedido {p.referencia} — {p.situacao}
                </option>
              ))}
            </select>
            {pedido && (
              <p className="text-[10px] text-[#5D4037]">
                Valor original: <strong className="text-[#2D1B00]">{brl(pedido.valorOriginal)}</strong>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-[#5D4037] uppercase tracking-wider">
              Categoria do problema
            </span>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCategoria(c.valor)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm text-center transition-all",
                    categoria === c.valor
                      ? "bg-[#FFF8E1]/60 border-[#F57C00] text-[#F57C00]"
                      : "border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00]",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="r2b-valor" className="text-xs font-bold text-[#5D4037] uppercase tracking-wider">
              Valor solicitado (R$)
            </label>
            <input
              id="r2b-valor"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={valorSolicitado}
              onChange={(e) => setValorSolicitado(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-[#D4A94A]/40 bg-white px-3 py-2 text-sm focus:border-[#F57C00] outline-none"
            />
            <p className="text-[10px] text-[#5D4037]">
              Valor não pode exceder o do pedido autorizado; duplicidade bloqueada pela R1.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="r2b-descricao" className="text-xs font-bold text-[#5D4037] uppercase tracking-wider">
              Descrição do problema
            </label>
            <textarea
              id="r2b-descricao"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: item chegou faltando, produto avariado, cobrança indevida..."
              rows={3}
              className="w-full rounded-lg border border-[#D4A94A]/40 bg-white px-3 py-2 text-sm focus:border-[#F57C00] outline-none"
            />
          </div>

          {erro && <p role="alert" className="r2b-notice">{erro}</p>}
          <div className="pt-4 flex flex-col gap-2">
            <Button
              type="submit"
              disabled={!categoria || !valorSolicitado || !descricao}
              className="w-full bg-[#F57C00] text-white border-[#F57C00] hover:bg-orange-600 shadow-none py-3"
            >
              Enviar solicitação
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full border-[#D4A94A]/40 text-[#5D4037] hover:border-[#F57C00] py-3"
            >
              <Link to="/preview/reembolsos-estornos-cliente">Cancelar</Link>
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
