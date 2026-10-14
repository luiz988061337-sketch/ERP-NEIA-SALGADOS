import {
  Bike,
  Calculator,
  ChefHat,
  ClipboardList,
  Crown,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  Package,
  Printer,
  ScrollText,
  ShoppingCart,
  Star,
  Store,
  Tag,
  Target,
  Truck,
  Users,
  Wallet,
  Wheat,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  value: string;
  label: string;
  icon: LucideIcon;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

/**
 * Organizacao do menu lateral do Admin.
 * As 16 abas existentes, apenas agrupadas por categoria.
 * A ordem dentro de cada grupo segue a ordem original das TabsList.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Visão geral",
    items: [{ value: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operação",
    items: [
      { value: "pedidos", label: "Pedidos", icon: ClipboardList },
      { value: "clientes", label: "Clientes", icon: Users },
      { value: "motoboys", label: "Motoboys", icon: Bike },
      { value: "impressao", label: "Impressão", icon: Printer },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { value: "produtos", label: "Produtos", icon: Package },
      { value: "cupons", label: "Cupons", icon: Tag },
      { value: "calculadora", label: "Calculadora", icon: Calculator },
    ],
  },
  {
    label: "Loja & Marca",
    items: [
      { value: "loja", label: "Loja", icon: Store },
      { value: "hero", label: "Hero", icon: ImageIcon },
      { value: "avaliacoes", label: "Avaliações", icon: Star },
    ],
  },
  {
    label: "Estoque",
    items: [
      { value: "insumos", label: "Insumos", icon: Wheat },
      { value: "fichas", label: "Fichas técnicas", icon: ChefHat },
      { value: "fornecedores", label: "Fornecedores", icon: Truck },
      { value: "compras", label: "Compras", icon: ShoppingCart },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { value: "financeiro", label: "Financeiro", icon: Wallet },
      { value: "metas", label: "Metas", icon: Target },
      { value: "comercial", label: "Comercial", icon: Crown },
    ],
  },
  {
    label: "Sistema",
    items: [
      { value: "usuarios", label: "Usuários", icon: KeyRound },
      { value: "logs", label: "Logs", icon: ScrollText },
    ],
  },
];

/** Titulo e descricao de cada aba, exibidos no cabecalho da pagina. */
export const ADMIN_ABA_TITULO: Record<string, string> = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  produtos: "Produtos",
  clientes: "Clientes",
  motoboys: "Motoboys",
  cupons: "Cupons",
  metas: "Metas",
  financeiro: "Financeiro",
  impressao: "Impressão",
  comercial: "Comercial",
  insumos: "Insumos",
  fichas: "Fichas técnicas",
  fornecedores: "Fornecedores",
  compras: "Compras",
  usuarios: "Usuários",
  logs: "Logs",
  hero: "Hero",
  calculadora: "Calculadora",
  loja: "Loja",
  avaliacoes: "Avaliações",
};

export const ADMIN_ABA_DESCRICAO: Record<string, string> = {
  dashboard: "Resumo da operação em tempo real.",
  pedidos: "Acompanhe, imprima e mova cada pedido pelo fluxo.",
  produtos: "Catálogo, preços, categorias e estoque.",
  clientes: "Base de clientes, histórico e contatos.",
  motoboys: "Cadastro e roteirização das entregas.",
  cupons: "Promoções e descontos ativos.",
  metas: "Acompanhamento de faturamento e produtos.",
  financeiro: "Receitas, custos e ticket médio.",
  impressao: "Fila da Tanca TP-550 e histórico de trabalhos.",
  comercial: "Funil de vendas, recompra e perfil de clientes.",
  insumos: "Matéria-prima: estoque, lotes FEFO, perdas e inventário.",
  fichas: "Receita de cada produto: insumos por unidade ou cento.",
  fornecedores: "Cadastro de fornecedores e prazos de entrega.",
  compras: "Pedidos de compra e recebimentos com custo médio.",
  usuarios: "Acessos e níveis de permissão.",
  logs: "Auditoria das ações administrativas.",
  hero: "Banner e destaques da vitrine.",
  calculadora: "Regras de porção, mínimo e personalize.",
  loja: "Endereço, contato e ponto no mapa da loja.",
  avaliacoes: "Notas de produto, prazo e atendimento.",
};
