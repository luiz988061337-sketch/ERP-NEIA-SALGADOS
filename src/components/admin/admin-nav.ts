import {
  Bike,
  BarChart3,
  Briefcase,
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
  Lightbulb,
  Megaphone,
  MessageSquareWarning,
  Package,
  Percent,
  Printer,
  ReceiptText,
  ScrollText,
  ShoppingCart,
  Snowflake,
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
  /** Rota fora das abas (ex.: /pdv). */
  href?: string;
  /** Âncora interna da tela de destino (ex.: #caixa no Financeiro Premium). */
  hash?: string;
  /**
   * Linhas explícitas para rótulos longos. Usado pelo grupo Comercial do
   * Preview; quando ausente, o item mantém o layout aprovado.
   */
  linhas?: string[];
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

/**
 * FONTE ÚNICA da navegação administrativa.
 *
 * Grupos, rótulos e ícones compartilhados pelo ERP e pelas referências visuais.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Principal",
    items: [
      { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin", hash: "dashboard" },
      {
        value: "pedidos",
        label: "Pedidos",
        icon: ClipboardList,
        href: "/admin",
        hash: "pedidos",
      },
      { value: "central-atendente", label: "Central da Atendente", icon: ClipboardList, href: "/admin", hash: "central-atendente" },
      { value: "producao", label: "Produção", icon: CookingPot, href: "/producao" },
      { value: "central", label: "Central de Entregas", icon: Truck, href: "/central-entregas" },
      { value: "pdv", label: "PDV / Balcão", icon: ReceiptText, href: "/pdv" },
      { value: "clientes", label: "Clientes", icon: Users, href: "/clientes" },
      { value: "financeiro", label: "Financeiro Premium", icon: Wallet, href: "/financeiro" },
      { value: "loja", label: "Configurações", icon: Store, href: "/admin", hash: "loja" },
    ],
  },
  {
    label: "Catálogo",
    items: [
      {
        value: "produtos",
        label: "Cadastro de Produtos",
        icon: ClipboardList,
        href: "/preview/cadastro-produtos",
      },
      { value: "combos", label: "Combos", icon: Layers, href: "/preview/combos" },
      {
        value: "embalagens",
        label: "Embalagens",
        icon: Package,
        href: "/preview/estoque-embalagens",
      },
      { value: "precificacao", label: "Precificação", icon: Percent, href: "/admin", hash: "precificacao" },
      { value: "fichas", label: "Fichas Técnicas", icon: ChefHat, href: "/admin", hash: "fichas" },
      { value: "cupons", label: "Cupons", icon: Tag, href: "/admin", hash: "cupons" },
      { value: "calculadora", label: "Calculadora", icon: Calculator, href: "/admin", hash: "calculadora" },
      { value: "hero", label: "Hero / Vitrine", icon: ImageIcon, href: "/admin", hash: "hero" },
      { value: "avaliacoes", label: "Avaliações", icon: Star, href: "/admin", hash: "avaliacoes" },
    ],
  },
  {
    label: "Estoque & Compras",
    items: [
      {
        value: "insumos",
        label: "Estoque de Salgados",
        icon: Snowflake,
        href: "/preview/estoque-salgados",
      },
      {
        value: "insumos-demo",
        label: "Estoque de Insumos",
        icon: Wheat,
        href: "/preview/estoque-insumos",
      },
      { value: "fornecedores", label: "Fornecedores", icon: Factory, href: "/admin", hash: "fornecedores" },
      { value: "compras", label: "Compras", icon: ShoppingCart, href: "/admin", hash: "compras" },
    ],
  },
  {
    label: "Comercial",
    items: [
      {
        value: "painel-comercial",
        label: "Painel / Marketing e Reativação",
        linhas: ["Painel / Marketing", "e Reativação"],
        icon: Megaphone,
        href: "/preview/comercial/painel",
      },
      {
        value: "clientes-crm",
        label: "Clientes / CRM",
        icon: Users,
        href: "/preview/comercial/clientes",
      },
      {
        value: "campanhas-comercial",
        label: "Campanhas",
        icon: Megaphone,
        href: "/preview/comercial/campanhas",
      },
      {
        value: "pesquisas-reclamacoes",
        label: "Pesquisas e Reclamações",
        linhas: ["Pesquisas e", "Reclamações"],
        icon: MessageSquareWarning,
        href: "/preview/comercial/pesquisas-reclamacoes",
      },
      {
        value: "sugestoes-promocao",
        label: "Sugestões de Promoção",
        linhas: ["Sugestões de", "Promoção"],
        icon: Lightbulb,
        href: "/preview/comercial/sugestoes",
      },
      {
        value: "resultados",
        label: "Resultados",
        icon: BarChart3,
        href: "/preview/comercial/resultados",
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      { value: "dono", label: "Relatório do Dono", icon: BarChart3, href: "/admin", hash: "dono" },
      { value: "metas", label: "Metas", icon: Target, href: "/admin", hash: "metas" },
      {
        value: "comercial",
        label: "Comercial C1–C5",
        icon: Crown,
        href: "/preview/comercial/painel",
      },
      {
        value: "campanhas",
        label: "Campanhas C3",
        icon: Megaphone,
        href: "/preview/comercial/campanhas",
      },
      { value: "caixa", label: "Caixa", icon: ReceiptText, href: "/financeiro", hash: "caixa" },
      { value: "relatorios", label: "Relatórios", icon: BarChart3, href: "/financeiro", hash: "relatorios" },
      { value: "equipe", label: "RH / Funcionários", icon: Briefcase, href: "/equipe" },
      { value: "contador", label: "Contador", icon: Users, href: "/contador" },
      { value: "motoboys", label: "Motoboys", icon: Bike, href: "/motoboy" },
      {
        value: "reembolsos",
        label: "Reembolsos e Estornos",
        icon: ReceiptText,
        href: "/preview/reembolsos-estornos",
      },
      { value: "fiscal", label: "Fiscal", icon: ScrollText, href: "/fiscal" },
      { value: "impressao", label: "Impressão", icon: Printer, href: "/impressao" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { value: "usuarios", label: "Usuários", icon: KeyRound, href: "/admin", hash: "usuarios" },
      { value: "logs", label: "Logs", icon: ScrollText, href: "/admin", hash: "logs" },
    ],
  },
];

/**
 * A navegação de conferência mantém o catálogo de prévias. Na operação,
 * os mesmos grupos apontam para as telas com persistência disponível.
 */
const DESTINOS_OPERACIONAIS: Record<string, Pick<AdminNavItem, "href" | "hash">> = {
  produtos: { href: "/admin", hash: "produtos" },
  "insumos-demo": { href: "/admin", hash: "insumos" },
  "campanhas-comercial": { href: "/campanhas" },
  comercial: { href: "/admin", hash: "comercial" },
};

export function menuAdmin(demonstrativo: boolean, pedidosAtendente = false): AdminNavGroup[] {
  if (demonstrativo) return ADMIN_NAV;
  return ADMIN_NAV.map((grupo) => ({
    ...grupo,
    items: grupo.items.flatMap<AdminNavItem>((item) => {
      const destino = DESTINOS_OPERACIONAIS[item.value];
      if (item.value === "clientes-crm" || item.value === "insumos") return [];
      if (item.value === "clientes") return [{ ...item, value: "clientes-crm" }];
      if (item.value === "pedidos" && pedidosAtendente) return [];
      if (item.value === "central-atendente" && pedidosAtendente) {
        const { hash: _hash, ...itemAtendente } = item;
        return [{ ...itemAtendente, href: "/atendente" }];
      }
      if (destino) return [{ ...item, ...destino }];
      if (item.href?.startsWith("/preview/")) return [];
      return [item];
    }),
  })).filter((grupo) => grupo.items.length > 0);
}

/** Título e descrição de cada aba, exibidos no cabeçalho da página. */
export const ADMIN_ABA_TITULO: Record<string, string> = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  "central-atendente": "Central da Atendente",
  producao: "Produção",
  central: "Central de Entregas",
  pdv: "PDV / Balcão",
  dono: "Relatório do Dono",
  metas: "Metas",
  comercial: "Comercial C1–C5",
  campanhas: "Campanhas C3",
  caixa: "Caixa",
  relatorios: "Relatórios",
  financeiro: "Financeiro Premium",
  equipe: "RH / Funcionários",
  contador: "Contador",
  motoboys: "Motoboys",
  reembolsos: "Reembolsos e Estornos",
  fiscal: "Fiscal",
  impressao: "Impressão",
  usuarios: "Usuários",
  logs: "Logs",
  produtos: "Cadastro de Produtos",
  combos: "Combos",
  embalagens: "Embalagens",
  precificacao: "Precificação",
  fichas: "Fichas Técnicas",
  cupons: "Cupons",
  calculadora: "Calculadora",
  hero: "Hero / Vitrine",
  avaliacoes: "Avaliações",
  insumos: "Estoque de Salgados",
  "insumos-demo": "Estoque de Insumos",
  fornecedores: "Fornecedores",
  compras: "Compras",
  loja: "Configurações",
  "painel-comercial": "Painel / Marketing e Reativação",
  "clientes-crm": "Clientes / CRM",
  "campanhas-comercial": "Campanhas",
  "pesquisas-reclamacoes": "Pesquisas e Reclamações",
  "sugestoes-promocao": "Sugestões de Promoção",
  resultados: "Resultados",
};

export const ADMIN_ABA_DESCRICAO: Record<string, string> = {
  dashboard: "Resumo da operação em tempo real.",
  pedidos: "Central da Atendente com três colunas aprovada.",
  producao: "Fila de produção e prioridades da cozinha.",
  central: "Rotas, entregas e acompanhamento em tempo real.",
  pdv: "Balcão com seleção de produtos, combos e pagamento.",
  dono: "Faturamento, DRE, margem por produto, bairros e alertas do mês.",
  metas: "Acompanhamento de faturamento e produtos.",
  comercial: "Funil de vendas, recompra e perfil de clientes.",
  campanhas: "Campanhas de marketing e reativação C3.",
  caixa: "Abertura, conferência e fechamento de caixa.",
  relatorios: "Relatórios e exportações demonstrativas.",
  financeiro: "Receitas, custos e ticket médio.",
  equipe: "Equipe, escalas e permissões operacionais.",
  contador: "Informações e documentos para contabilidade.",
  motoboys: "Cadastro e roteirização das entregas.",
  reembolsos: "Solicitações, origens e estornos demonstrativos.",
  fiscal: "Documentação e obrigações fiscais do MEI.",
  impressao: "Fila da impressora e histórico de trabalhos.",
  usuarios: "Acessos e níveis de permissão.",
  logs: "Auditoria das ações administrativas.",
  produtos: "Catálogo, preços, categorias e estoque.",
  combos: "Combos e composição de sabores.",
  embalagens: "Embalagens com unidades, pacotes e fardos.",
  precificacao: "Custo real, margem e preço sugerido por produto.",
  fichas: "Receita de cada produto: insumos por unidade ou cento.",
  cupons: "Promoções e descontos ativos.",
  calculadora: "Regras de porção, mínimo e personalize.",
  hero: "Banner e destaques da vitrine.",
  avaliacoes: "Notas de produto, prazo e atendimento.",
  insumos: "Salgados prontos: lotes, validade e saldos.",
  "insumos-demo": "Matéria-prima: estoque, lotes FEFO, perdas e inventário.",
  fornecedores: "Cadastro de fornecedores e prazos de entrega.",
  compras: "Pedidos de compra e recebimentos com custo médio.",
  loja: "Endereço, contato e ponto no mapa da loja.",
  "painel-comercial": "Marketing e reativação com dados demonstrativos.",
  "clientes-crm": "Base de clientes, segmentação e histórico.",
  "campanhas-comercial": "Campanhas e ações de reativação.",
  "pesquisas-reclamacoes": "Pesquisas, reclamações e satisfação.",
  "sugestoes-promocao": "Sugestões e ideias de promoção.",
  resultados: "Resultados e indicadores das ações comerciais.",
};
