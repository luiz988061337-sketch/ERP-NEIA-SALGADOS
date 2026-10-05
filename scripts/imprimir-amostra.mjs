// Gera comanda modelo da casa em arquivo p/ teste físico.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { textoCupom } = await import("@/lib/impressao.ts");
const txt = textoCupom({
  numero: 293, dataHora: "04/10/2026 19:24",
  cliente: "Paulinho", telefone: "(15) 99692-6064",
  itens: [
    { qtd: 50, nome: "Mini Esfiha De Carne", precoUnit: 1 },
    { qtd: 50, nome: "Mini Coxinhas De Frango", precoUnit: 0.85 },
    { qtd: 50, nome: "Mini Bolinho De Queijo", precoUnit: 0.85 },
  ],
  totalUnidades: 150, entregaRetirada: "ENTREGA", horario: "20:24 - 20:54",
  endereco: "Rua Julio Cirino Silva, N 235",
  pagamento: "Cartao (Visa Credito)", observacoes: "", status: "PENDENTE_PGTO",
  bairro: "Jardim Wanel Ville V", cidade: "Sorocaba", cep: "18057057",
  subtotal: 177.5, taxaEntrega: 18, total: 195.5, pedidosCliente: 5,
  prevista: "20:24 - 20:54",
});
const arq = path.join(os.tmpdir(), "neia-comanda-modelo.txt");
fs.writeFileSync(arq, txt, "utf8");
console.log("AMOSTRA:\n" + txt);
console.log("arquivo=" + arq);
