export const COLUNAS_GESTAO = [
  { id: "novos", titulo: "Novos Pedidos", descricao: "Aguardando aceite ou início do preparo", cor: "border-t-amber-400", ponto: "bg-amber-400" },
  { id: "preparo", titulo: "Em Preparo", descricao: "Em produção na cozinha", cor: "border-t-blue-400", ponto: "bg-blue-400" },
  { id: "prontos", titulo: "Prontos", descricao: "Prontos para retirada ou despacho", cor: "border-t-emerald-400", ponto: "bg-emerald-400" },
  { id: "despachados", titulo: "Despachados / Em Entrega", descricao: "Pedido a caminho do cliente", cor: "border-t-violet-400", ponto: "bg-violet-400" },
] as const;

type ColunaGestao = (typeof COLUNAS_GESTAO)[number]["id"];

export function colunaPedido(status: string): ColunaGestao | "historico" {
  switch (status) {
    case "recebido":
    case "aceito":
      return "novos";
    case "em_producao":
      return "preparo";
    case "pronto":
    case "aguardando_motoboy":
      return "prontos";
    case "em_rota":
      return "despachados";
    default:
      return "historico";
  }
}
