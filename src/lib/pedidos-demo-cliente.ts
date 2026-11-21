/**
 * Pedidos fictícios da tela R2-B “Meus Pedidos” (somente demonstração).
 * Fonte única para a lista e o detalhe: status, modalidade e pagamento não
 * podem divergir entre as duas telas.
 */
export type PedidoClienteDemo = {
  id: string;
  numero: string;
  data: string;
  itens: number;
  modalidade: "entrega" | "retirada";
  status: string;
  pagamento: string;
  valor: number;
  podeRepetir: boolean;
};

export const MEUS_PEDIDOS_CLIENTE_DEMO: PedidoClienteDemo[] = [
  { id: "1053", numero: "1053", data: "2026-11-14T09:54", itens: 1, modalidade: "entrega", status: "em_rota", pagamento: "pago", valor: 1745.0, podeRepetir: true },
  { id: "1052", numero: "1052", data: "2026-11-12T07:24", itens: 1, modalidade: "entrega", status: "entregue", pagamento: "pago", valor: 89.9, podeRepetir: true },
  { id: "1048", numero: "1048", data: "2026-11-11T17:38", itens: 1, modalidade: "retirada", status: "entregue", pagamento: "pago", valor: 80.0, podeRepetir: true },
  { id: "1045", numero: "1045", data: "2026-11-10T14:20", itens: 1, modalidade: "entrega", status: "cancelado", pagamento: "reembolsado", valor: 210.0, podeRepetir: false },
  { id: "1041", numero: "1041", data: "2026-11-08T10:16", itens: 1, modalidade: "entrega", status: "entregue", pagamento: "pago", valor: 95.0, podeRepetir: true },
  { id: "1038", numero: "1038", data: "2026-11-05T18:30", itens: 1, modalidade: "entrega", status: "entregue", pagamento: "pago", valor: 180.0, podeRepetir: true },
];
