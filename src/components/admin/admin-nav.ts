import {
  Bike,
  Briefcase,
  BarChart3,
  Calculator,
  ChefHat,
  ClipboardList,
  CookingPot,
  Crown,
  Factory,
  ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  Megaphone,
  Package,
  Percent,
  Printer,
  ReceiptText,
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
import { ehModoDemo } from "@/lib/demo-preview";

export type AdminNavItem = {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Rota fora das abas (ex.: /pdv). Sem href, troca a aba do admin. */
  href?: string;
  /** Âncora interna da tela de destino (ex.: #caixa no Financeiro Premium). */
  hash?: string;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

/**
 * Organização do menu lateral do Admin (visual Projeto A1).
 * Todos os módulos existentes permanecem no menu. No Preview, cada área
 * aponta para a tela já desenvolvida — nenhuma fica apenas "preservada".
 */
const demo = ehModoDemo();

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Principal",
    items: [
      { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { value: "pedidos", label: "Pedidos", icon: ClipboardList },
      { value: "producao", label: "Produção", icon: CookingPot, href: "/producao" },
      { value: "central", label: "Central de Entregas", icon: Truck, href: "/central-entregas" },
      { value: "pdv", label: "PDV / Balcão", icon: ReceiptText, href: "/pdv" },
      {
        value: "clientes",
        label: "Clientes",
        icon: Users,
        ...(demo ? { href: "/clientes", hash: "clientes" } : {}),
      },
      {
        value: "financeiro",
        label: demo ? "Financeiro Premium" : "Financeiro",
        icon: Wallet,
        ...(demo ? { href: "/financeiro", hash: "lancamentos" } : {}),
      },
      { value: "loja", label: "Configurações", icon: Store },
    ],
  },
  {
    label: "Catálogo",
    items: [
      {
        value: "produtos",
        label: "Produtos",
        icon: Package,
        ...(demo ? { href: "/preview/cadastro-produtos" } : {}),
      },
      ...(demo
        ? ([
            { value: "combos", label: "Combos", icon: Layers, href: "/preview/combos" },
            {
              value: "embalagens",
              label: "Embalagens",
              icon: Package,
              href: "/preview/estoque-embalagens",
            },
          ] as AdminNavItem[])
        : []),
      { value: "precificacao", label: "Precificação", icon: Percent },
      { value: "cupons", label: "Cupons", icon: Tag },
      { value: "calculadora", label: "Calculadora", icon: Calculator },
      { value: "hero", label: "Hero", icon: ImageIcon },
      { value: "avaliacoes", label: "Avaliações", icon: Star },
    ],
  },
  {
    label: "Estoque & Compras",
    items: [
      {
        value: "insumos",
        label: "Estoque",
        icon: Wheat,
        ...(demo ? { href: "/preview/estoque-salgados" } : {}),
      },
      ...(demo
        ? ([
            {
              value: "insumos-demo",
              label: "Insumos",
              icon: Wheat,
              href: "/preview/estoque-insumos",
            },
          ] as AdminNavItem[])
        : []),
      { value: "fichas", label: "Fichas técnicas", icon: ChefHat },
      { value: "fornecedores", label: "Fornecedores", icon: Factory },
      { value: "compras", label: "Compras", icon: ShoppingCart },
    ],
  },
  {
    label: "Gestão",
    items: [
      { value: "dono", label: "Relatório do dono", icon: BarChart3 },
      { value: "metas", label: "Metas", icon: Target },
      {
        value: "comercial",
        label: demo ? "Comercial C1–C5" : "Comercial",
        icon: Crown,
        ...(demo ? { href: "/clientes", hash: "painel" } : {}),
      },
      ...(demo
        ? ([
            {
              value: "campanhas",
              label: "Campanhas (C3)",
              icon: Megaphone,
              href: "/campanhas",
              hash: "campanhas",
            },
            { value: "caixa", label: "Caixa", icon: ReceiptText, href: "/financeiro", hash: "caixa" },
            {
              value: "relatorios",
              label: "Relatórios",
              icon: BarChart3,
              href: "/financeiro",
              hash: "relatorios",
            },
          ] as AdminNavItem[])
        : []),
      { value: "equipe", label: "RH", icon: Briefcase, href: "/equipe" },
      { value: "contador", label: "Contador", icon: Users, href: "/contador" },
      {
        value: "motoboys",
        label: "Motoboys",
        icon: Bike,
        ...(demo ? { href: "/motoboy" } : {}),
      },
      ...(demo
        ? ([
            {
              value: "reembolsos",
              label: "Reembolsos e estornos",
              icon: ReceiptText,
              href: "/preview/reembolsos-estornos",
            },
            { value: "fiscal", label: "Fiscal", icon: ScrollText, href: "/fiscal" },
          ] as AdminNavItem[])
        : []),
      { value: "impressao", label: "Impressão", icon: Printer, href: "/impressao" },
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
  dono: "Relatório do dono",
  pedidos: "Pedidos",
  produtos: "Produtos",
  clientes: "Clientes",
  motoboys: "Motoboys",
  cupons: "Cupons",
  combos: "Combos",
  embalagens: "Embalagens",
  "insumos-demo": "Insumos",
  reembolsos: "Reembolsos e estornos",
  fiscal: "Fiscal",
  metas: "Metas",
  financeiro: "Financeiro Premium",
  caixa: "Caixa",
  relatorios: "Relatórios",
  campanhas: "Campanhas",
  impressao: "Impressão",
  comercial: "Comercial C1–C5",
  precificacao: "Precificação",
  insumos: "Estoque",
  fichas: "Fichas técnicas",
  fornecedores: "Fornecedores",
  compras: "Compras",
  usuarios: "Usuários",
  logs: "Logs",
  hero: "Hero",
  calculadora: "Calculadora",
  loja: "Configurações",
  avaliacoes: "Avaliações",
};

export const ADMIN_ABA_DESCRICAO: Record<string, string> = {
  dashboard: "Resumo da operação em tempo real.",
  dono: "Faturamento, DRE, margem por produto, bairros e alertas do mês.",
  pedidos: "Acompanhe, imprima e mova cada pedido pelo fluxo.",
  produtos: "Catálogo, preços, categorias e estoque.",
  clientes: "Base de clientes, histórico e contatos.",
  motoboys: "Cadastro e roteirização das entregas.",
  cupons: "Promoções e descontos ativos.",
  combos: "Combos e composição de sabores (múltiplos de 50).",
  embalagens: "Embalagens com unidades, pacotes e fardos.",
  "insumos-demo": "Insumos com consumo, custos e reposição.",
  reembolsos: "Solicitações, origens e estornos demonstrativos.",
  fiscal: "Documentação e obrigações fiscais do MEI.",
  metas: "Acompanhamento de faturamento e produtos.",
  financeiro: "Receitas, custos e ticket médio.",
  caixa: "Abertura, conferência e fechamento de caixa.",
  relatorios: "Relatórios e exportações demonstrativas.",
  campanhas: "Campanhas de marketing e reativação C3.",
  impressao: "Fila da Tanca TP-550 e histórico de trabalhos.",
  comercial: "Funil de vendas, recompra e perfil de clientes.",
  precificacao: "Custo real, margem e preço sugerido por produto.",
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
