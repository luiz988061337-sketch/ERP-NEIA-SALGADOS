import { MINIMO_COMBO, PASSO_COMBO } from "./totals";

export { MINIMO_COMBO, PASSO_COMBO };

export type ComboCategoria = {
  slug: string;
  nome: string;
  descricao: string;
  precoUnit: number;
};

export const COMBO_CATEGORIAS: ComboCategoria[] = [
  { slug: "mini-fritos", nome: "Mini Fritos", descricao: "Coxinha, bolinha de queijo, risole, kibe e croquete", precoUnit: 1.6 },
  { slug: "mini-assados", nome: "Mini Assados", descricao: "Esfiha, enroladinho, quibe assado e trouxinha", precoUnit: 2.3 },
  { slug: "mini-pasteis", nome: "Mini Pastéis", descricao: "Carne, queijo, frango e pizza", precoUnit: 2.3 },
  { slug: "mini-pizzas", nome: "Mini Pizzas", descricao: "Calabresa, mussarela, frango e portuguesa", precoUnit: 3.7 },
  { slug: "mini-empadinhas", nome: "Mini Empadinhas", descricao: "Frango, queijo, palmito e carne", precoUnit: 2.4 },
  // Congelados, kits e bebidas vendem por unidade — fora do combo (tipo_venda=unidade).
];

/** Nome curto do sabor para o resumo do combo (tira o "25un" do fim). */
export function saborCurto(nome: string): string {
  return nome.replace(/\s+\d+un$/, "").replace(/^Mini\s+/i, "");
}
