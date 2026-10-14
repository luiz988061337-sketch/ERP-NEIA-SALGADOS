import { Check } from "lucide-react";
import {
  PAGAMENTO_STATUS_LABEL,
  STATUS_LABEL,
  statusFlow,
  statusLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  // Cores distintas por estágio (padrão A1 §2): amarelo=novo, azul=produção,
  // verde=pronto, laranja=aguardando motoboy, roxo=em rota, verde escuro=entregue.
  const cores: Record<string, string> = {
    recebido: "bg-yellow-100 text-yellow-800",
    em_producao: "bg-blue-100 text-blue-800",
    pronto: "bg-green-100 text-green-800",
    aguardando_motoboy: "bg-orange-100 text-orange-800",
    em_rota: "bg-purple-100 text-purple-800",
    entregue: "bg-green-600 text-white",
    cancelado: "bg-destructive text-destructive-foreground",
  };
  return <Badge className={cn("border-0", cores[status] ?? "bg-muted")}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function StatusSteps({ status, tipoEntrega }: { status: string; tipoEntrega?: string | null }) {
  if (status === "cancelado") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Este pedido foi cancelado.
      </div>
    );
  }
  const fluxo = statusFlow(tipoEntrega);
  const atual = fluxo.indexOf(status);

  return (
    <ol className="space-y-3">
      {fluxo.map((s, i) => {
        const feito = atual >= 0 && i <= atual;
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                feito
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {feito ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-sm", feito ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {statusLabel(s, tipoEntrega)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Pagamento é separado do pedido: "Pedido em produção" + "Pagamento: pago".
 * Nunca deixar o status do pedido dizer que o pagamento foi aprovado.
 */
export function PagamentoStatusBadge({ status }: { status?: string | null }) {
  const s = status || "pendente";
  const cores: Record<string, string> = {
    pendente: "bg-secondary text-secondary-foreground",
    pago: "bg-success text-success-foreground",
    falhou: "bg-destructive text-destructive-foreground",
    reembolsado: "bg-muted text-foreground",
  };
  return (
    <Badge className={cn("border-0", cores[s] ?? "bg-muted")}>
      {PAGAMENTO_STATUS_LABEL[s] ?? s}
    </Badge>
  );
}
