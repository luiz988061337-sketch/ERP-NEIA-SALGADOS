import { Link } from "@tanstack/react-router";
import { Bike, Route } from "lucide-react";
import { aguardandoAtribuicaoCentral } from "@/lib/central-atribuicao";

export function AtalhosEntrega({ pedido, className }: {
  pedido: { id: string; status: string; tipo_entrega: string; motoboy_id?: string | null; rota_id?: string | null };
  className: string;
}) {
  if (!aguardandoAtribuicaoCentral(pedido)) return null;
  return <>
    <Link to="/central-entregas" search={{ pedido: pedido.id, acao: "atribuir" }} className={className}>
      <Bike size={16} aria-hidden /> Atribuir motoboy
    </Link>
    {pedido.status === "pronto" && <Link to="/central-entregas" search={{ pedido: pedido.id, acao: "rota" }} className={className}>
      <Route size={16} aria-hidden /> Montar rota
    </Link>}
  </>;
}
