import { Check } from "lucide-react";
import { STATUS_FLOW, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const cores: Record<string, string> = {
    recebido: "bg-muted text-foreground",
    em_producao: "bg-secondary text-secondary-foreground",
    pronto: "bg-secondary text-secondary-foreground",
    aguardando_motoboy: "bg-secondary text-secondary-foreground",
    em_rota: "bg-primary text-primary-foreground",
    entregue: "bg-success text-success-foreground",
    cancelado: "bg-destructive text-destructive-foreground",
  };
  return <Badge className={cn("border-0", cores[status] ?? "bg-muted")}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function StatusSteps({ status }: { status: string }) {
  if (status === "cancelado") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Este pedido foi cancelado.
      </div>
    );
  }
  const atual = STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]);

  return (
    <ol className="space-y-3">
      {STATUS_FLOW.map((s, i) => {
        const feito = i <= atual;
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
              {STATUS_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
