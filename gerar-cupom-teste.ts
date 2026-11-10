// Gerador de cupom de teste (payload real do ERP) -> arquivo de texto.
import { writeFileSync } from "node:fs";
import { textoCupom, textoTeste } from "./src/lib/impressao";

const cupom = textoCupom({
  numero: 1042,
  dataHora: new Date().toLocaleString("pt-BR"),
  cliente: "Maria Silva Santos",
  telefone: "(11) 98888-1234",
  itens: [
    { qtd: 2, nome: "Coxinha Frango com Catupiry", precoUnit: 6.5 },
    { qtd: 1, nome: "Esfiha Carne", precoUnit: 7 },
    { qtd: 3, nome: "Pao de Queijo", precoUnit: 4.5 },
  ],
  totalUnidades: 6,
  entregaRetirada: "ENTREGA",
  horario: "40-60min",
  prevista: "40-60min",
  endereco: "Rua das Flores, 123 - apto 51",
  bairro: "Centro",
  cidade: "Sao Paulo",
  cep: "01010-000",
  complemento: "Portao 2",
  referencia: "Ao lado da padaria",
  pagamento: "PIX",
  observacoes: "Sem cebola no coxinha",
  status: "CONFIRMADO",
  subtotal: 33.5,
  taxaEntrega: 6,
  total: 39.5,
  pedidosCliente: 3,
  motoboy: "Carlos",
});

const destino = process.argv[2] ?? "cupom-teste.txt";
writeFileSync(destino, cupom, "utf8");
writeFileSync(destino.replace(/\.txt$/, "-teste.txt"), textoTeste(), "utf8");
console.log("OK ->", destino);
