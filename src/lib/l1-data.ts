/**
 * L1 — dados 100% fictícios dos previews de tema claro.
 * Nenhuma leitura de banco, nenhuma regra operacional.
 */

export type L1Item = { sabor: string; qtd: number };
export type L1Pedido = {
  numero: number;
  cliente: string;
  telefone: string;
  tipo: "entrega" | "retirada";
  endereco?: string;
  dist?: string;
  prometido: string;
  itens: L1Item[];
  total: number;
  valor: string;
  pagto: string;
  obs?: string;
  estado: string;
  corEstado: "gold" | "green" | "yellow" | "red" | "blue" | "purple" | "gray";
  extra?: string;
};

export const L1_PEDIDOS_NOVOS: L1Pedido[] = [
  { numero: 1263, cliente: "Fernanda Lima", telefone: "(11) 95555-6666", tipo: "entrega", endereco: "Rua das Acácias, 456 - Centro", dist: "2,8 km", prometido: "19:40", itens: [{ sabor: "Coxinha de Frango", qtd: 25 }, { sabor: "Kibe", qtd: 20 }], total: 65, valor: "R$ 65,00", pagto: "Pix confirmado", estado: "Novo agora", corEstado: "red" },
  { numero: 1264, cliente: "Juliana Pereira", telefone: "(11) 94444-5555", tipo: "retirada", prometido: "19:55", itens: [{ sabor: "Coxinha de Frango", qtd: 20 }, { sabor: "Risole de Queijo", qtd: 20 }], total: 40, valor: "R$ 40,00", pagto: "Cartão confirmado", estado: "Novo agora", corEstado: "red" },
  { numero: 1265, cliente: "Marcos Souza", telefone: "(11) 93333-4444", tipo: "entrega", endereco: "Rua das Flores, 123 - Centro", dist: "3,5 km", prometido: "20:10", itens: [{ sabor: "Coxinha de Frango", qtd: 50 }, { sabor: "Kibe", qtd: 15 }], total: 65, valor: "R$ 65,00", pagto: "Dinheiro", estado: "Novo agora", corEstado: "red", obs: "Troco para R$ 100." },
];

export const L1_PEDIDOS_ACEITOS: L1Pedido[] = [
  { numero: 1261, cliente: "Ana Costa", telefone: "(11) 98876-5432", tipo: "entrega", endereco: "Rua do Sol, 456 - Vila Nova", dist: "2,1 km", prometido: "19:05", itens: [{ sabor: "Coxinha de Frango", qtd: 30 }, { sabor: "Kibe", qtd: 20 }], total: 50, valor: "R$ 50,00", pagto: "Pix confirmado", estado: "Aguardando produção", corEstado: "gold", extra: "Envio à cozinha 19:05 (em 12 min)" },
  { numero: 1262, cliente: "Ricardo Santos", telefone: "(11) 97777-1111", tipo: "retirada", prometido: "19:10", itens: [{ sabor: "Coxinha de Frango", qtd: 30 }, { sabor: "Bolinha de Queijo", qtd: 20 }], total: 50, valor: "R$ 50,00", pagto: "Cartão confirmado", estado: "Aguardando produção", corEstado: "gold", extra: "Envio à cozinha 19:10 (em 17 min)" },
];

export const L1_PRODUCAO = [
  { numero: 1258, cliente: "Carlos Souza", tipo: "entrega", prometido: "18:45", itens: [{ sabor: "Coxinha de Frango", qtd: 50 }, { sabor: "Risole de Queijo", qtd: 20 }], total: 70, progresso: 65, detalhe: "Em preparo há 8 min" },
  { numero: 1260, cliente: "Patrícia Mendes", tipo: "retirada", prometido: "19:00", itens: [{ sabor: "Coxinha de Frango", qtd: 25 }, { sabor: "Kibe", qtd: 25 }], total: 50, progresso: 40, detalhe: "Em preparo há 6 min" },
  { numero: 1249, cliente: "Roberto Lima", tipo: "entrega", prometido: "18:43", itens: [{ sabor: "Coxinha de Frango", qtd: 20 }], total: 20, progresso: 100, detalhe: "Pronto há 5 min" },
];

export const L1_ENTREGAS = [
  { numero: 1254, cliente: "Juliana Pereira", endereco: "Rua Bela Vista, 321 - Jardim", prometido: "15:00", itens: "20 Coxinha + 20 Kibe", total: 40, estado: "Aguardando Motoboy", cor: "gold" as const },
  { numero: 1253, cliente: "Marcos Souza", endereco: "Rua das Flores, 123 - Centro", prometido: "15:30", itens: "50 Coxinha", total: 50, estado: "Aguardando Motoboy", cor: "gold" as const },
  { numero: 1248, cliente: "Patrícia Mendes", endereco: "Rua da Paz, 100 - Jardim", prometido: "16:32", itens: "25 Coxinha + 25 Kibe", total: 50, estado: "Em Rota • Ana", cor: "purple" as const },
];

export const L1_MOTOBOYS = [
  { nome: "Carlos", estado: "Disponível • Na base (1,2 km)", extra: "2 pedidos hoje", acao: "Atribuir" },
  { nome: "Ana", estado: "Disponível • Na base (2,1 km)", extra: "3 pedidos hoje", acao: "Atribuir" },
  { nome: "Marcos", estado: "Em rota • 2 entregas", extra: "2,8 km • 22 min", acao: "Ver rota" },
  { nome: "Patrícia", estado: "Em rota • 1 entrega", extra: "1,9 km • 12 min", acao: "Ver rota" },
  { nome: "Ricardo", estado: "Retornando à base", extra: "4,2 km • 25 min", acao: "Indisponível" },
];

export const L1_ROTAS = [
  { moto: "Carlos", resumo: "2 entregas • 5,6 km • ~35 min", paradas: [["#1249 José Carlos", "16:32"], ["#1247 Roberto Lima", "16:50"]], total: "5,6 km • ~35 min • 90 un." },
  { moto: "Ana", resumo: "3 entregas • 7,4 km • ~50 min", paradas: [["#1253 Marcos Souza", "17:05"], ["#1260 Ana Costa", "17:25"], ["#1248 Patrícia Mendes", "17:40"]], total: "7,4 km • ~50 min • 120 un." },
  { moto: "Marcos", resumo: "2 entregas • 6,2 km • ~40 min", paradas: [["#1245 Ricardo Santos", "16:55"], ["#1246 Fernanda Alves", "17:15"]], total: "6,2 km • ~40 min • 80 un." },
];

export const L1_TABELA = [
  { n: 1261, hora: "19:05", cliente: "Ana Costa", tipo: "Entrega", itens: "30 Coxinha, 20 Kibe", qtd: "50 un.", valor: "R$ 50,00", sit: "Aguardando produção", envio: "em 12 min" },
  { n: 1262, hora: "19:10", cliente: "Ricardo Santos", tipo: "Retirada", itens: "30 Coxinha, 20 Bolinha", qtd: "50 un.", valor: "R$ 50,00", sit: "Aguardando produção", envio: "em 17 min" },
  { n: 1258, hora: "18:45", cliente: "Carlos Souza", tipo: "Entrega", itens: "50 Coxinha, 20 Risole", qtd: "70 un.", valor: "R$ 70,00", sit: "Em produção", envio: "na cozinha" },
  { n: 1260, hora: "19:00", cliente: "Patrícia Mendes", tipo: "Retirada", itens: "25 Coxinha, 25 Kibe", qtd: "50 un.", valor: "R$ 50,00", sit: "Em produção", envio: "na cozinha" },
  { n: 1249, hora: "18:43", cliente: "Roberto Lima", tipo: "Entrega", itens: "20 Coxinha", qtd: "20 un.", valor: "R$ 20,00", sit: "Pronto", envio: "—" },
];
