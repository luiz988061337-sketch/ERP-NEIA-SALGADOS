/**
 * C1 — Painel Comercial e Clientes/Segmentação (demonstração).
 *
 * Sem banco: os dados são fictícios e determinísticos (mesma lista no servidor
 * e no navegador, sem aleatoriedade). As REGRAS de classificação NÃO são
 * reimplementadas aqui — vêm de `@/lib/crm` (classificar/SEGMENTO_LABEL).
 */
import { classificar, DEFAULT_CRM_SETTINGS, SEGMENTO_LABEL, type Segmento } from "@/lib/crm";

/** Data de referência da demonstração (igual à das demais prévias). */
export const DATA_COMERCIAL = "2026-11-14";

export const STATUS_REATIVACAO = [
  "Recuperado",
  "Em contato",
  "Aguardando retorno",
  "Campanha enviada",
  "Não respondeu",
] as const;
export type StatusReativacao = (typeof STATUS_REATIVACAO)[number];

/** Faixas EXCLUSIVAS de inatividade (um cliente pertence a exatamente uma). */
export type Faixa = "30-59" | "60-89" | "90+";
export const FAIXA_LABEL: Record<Faixa, string> = {
  "30-59": "30 a 59 dias",
  "60-89": "60 a 89 dias",
  "90+": "90 dias ou mais",
};
/** Rótulo curto para as colunas da tabela. */
export const FAIXA_CURTA: Record<Faixa, string> = {
  "30-59": "30–59d",
  "60-89": "60–89d",
  "90+": "90d+",
};

export const SEGMENTO_PLAIN: Record<Segmento, string> = {
  ativo: "Ativo",
  risco: "Em risco",
  inativo: "Inativo",
  muito_inativo: "Muito inativo",
  novo: "Novo",
};

export type ClienteDemo = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  diasSemComprar: number;
  segmento: Segmento;
  origem: string;
  atendente: string;
  favoritos: string[];
  status: StatusReativacao;
  totalPedidos: number;
  totalGasto: number;
  historico: { data: string; tipo: string; texto: string }[];
};

export type CampanhaDemo = {
  id: string;
  nome: string;
  publico: string;
  quantidade: number;
  status: "Rascunho" | "Aguardando aprovação" | "Aprovada";
};

/* ------------------------------------------------------------------ */
/* Regras puras de faixas e contagens                                   */
/* ------------------------------------------------------------------ */

/** Faixa EXCLUSIVA de inatividade. Null = ainda não é inativo (< 30 dias). */
export function faixaInatividade(diasSemComprar: number): Faixa | null {
  if (diasSemComprar >= 90) return "90+";
  if (diasSemComprar >= 60) return "60-89";
  if (diasSemComprar >= 30) return "30-59";
  return null;
}

/**
 * Contagens SEM duplicidade: cada faixa é exclusiva e, separadamente, o
 * acumulado (>= 30 dias). Assim "30", "60" e "90+" nunca somam o mesmo
 * cliente duas vezes, e o total de inativos continua correto.
 */
export function contarInatividade(clientes: ClienteDemo[]) {
  const faixas: Record<Faixa, number> = { "30-59": 0, "60-89": 0, "90+": 0 };
  let ativos = 0;
  for (const c of clientes) {
    const faixa = faixaInatividade(c.diasSemComprar);
    if (faixa) faixas[faixa] += 1;
    else ativos += 1;
  }
  return {
    faixas,
    /** Acumulado: inativos com 30 dias ou mais. */
    acumulado30: faixas["30-59"] + faixas["60-89"] + faixas["90+"],
    ativos,
    total: clientes.length,
  };
}

/* ------------------------------------------------------------------ */
/* Filtros e paginação                                                 */
/* ------------------------------------------------------------------ */

export type FiltrosClientes = {
  busca: string;
  /** "Comprou nos últimos N dias". 0 = qualquer período. */
  periodo: number;
  segmento: "todos" | Segmento;
  origem: "todas" | string;
  atendente: "todos" | string;
};

export const FILTROS_VAZIOS: FiltrosClientes = {
  busca: "",
  periodo: 0,
  segmento: "todos",
  origem: "todas",
  atendente: "todos",
};

export const PERIODOS = [
  { valor: 180, rotulo: "Últimos 180 dias" },
  { valor: 90, rotulo: "Últimos 90 dias" },
  { valor: 30, rotulo: "Últimos 30 dias" },
  { valor: 0, rotulo: "Qualquer período" },
];

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Só dígitos — permite buscar telefone com ou sem máscara. */
const soDigitos = (texto: string) => texto.replace(/\D/g, "");

export function filtrarClientes(
  clientes: ClienteDemo[],
  filtros: FiltrosClientes,
  somenteInativos = false,
): ClienteDemo[] {
  const termo = normalizar(filtros.busca);
  return clientes.filter((c) => {
    if (somenteInativos && !faixaInatividade(c.diasSemComprar)) return false;
    if (filtros.periodo > 0 && c.diasSemComprar > filtros.periodo) return false;
    if (filtros.segmento !== "todos" && c.segmento !== filtros.segmento) return false;
    if (filtros.origem !== "todas" && c.origem !== filtros.origem) return false;
    if (filtros.atendente !== "todos" && c.atendente !== filtros.atendente) return false;
    if (termo) {
      const alvo = normalizar(`${c.nome} ${c.email}`);
      const digitosBusca = soDigitos(termo);
      const digitosCliente = soDigitos(c.telefone);
      const bateNome = alvo.includes(termo);
      const bateTelefone =
        digitosBusca.length >= 2 && digitosCliente.includes(digitosBusca);
      if (!bateNome && !bateTelefone) return false;
    }
    return true;
  });
}

export function paginar<T>(itens: T[], pagina: number, porPagina: number) {
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const inicio = (atual - 1) * porPagina;
  return {
    pagina: atual,
    paginas,
    total,
    /** Índice do primeiro item exibido (base 1). */
    primeiro: total === 0 ? 0 : inicio + 1,
    /** Índice do último item exibido (base 1). */
    ultimo: Math.min(total, inicio + porPagina),
    itens: itens.slice(inicio, inicio + porPagina),
  };
}

export function dataUltimoPedido(diasSemComprar: number): string {
  const base = new Date(`${DATA_COMERCIAL}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - diasSemComprar);
  return base.toISOString().slice(0, 10);
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/* ------------------------------------------------------------------ */
/* Fixtures demonstrativos (determinísticos)                             */
/* ------------------------------------------------------------------ */

const NOMES = [
  "Maria G. Almeida",
  "Ricardo S. Moura",
  "Cláudia Lima",
  "André P. Silva",
  "Juliana F. Costa",
  "Patrícia Menezes",
  "Fábio R. Carvalho",
  "Luciana S. Brito",
  "Eduardo N. Ramos",
  "Beatriz A. Moreira",
  "Rodrigo T. Freitas",
  "Camila S. Duarte",
  "Marcelo V. Cunha",
  "Renata P. Lopes",
  "Diego A. Teixeira",
  "Vanessa L. Cardoso",
  "Tiago H. Martins",
  "Aline B. Rocha",
  "Gustavo F. Dias",
  "Priscila M. Correia",
  "Felipe O. Azevedo",
  "Sabrina C. Nunes",
  "Leandro J. Barros",
  "Tatiane R. Pires",
  "Otávio B. Ferraz",
  "Michele S. Galvão",
  "Wagner L. Braga",
  "Isabela M. Rezende",
  "Alexandre T. Fontes",
  "Karina P. Toledo",
  "Bruno A. Medrado",
  "Sofia R. Bittencourt",
  "Emerson C. Seixas",
  "Débora L. Antunes",
  "Caio V. Portuguese",
  "Helena M. Sampaio",
  "Vinícius F. Arantes",
  "Rafaela G. Longo",
  "Sérgio P. Quinze",
  "Natália B. Imperial",
  "Ivan O. Standard",
  "Márcia R. Alencar",
  "Douglas T. Peixoto",
  "Adriana S. Klippel",
  "Renan V. Meireles",
  "Larissa M. Fontes",
  "Otávio B. Rezende",
  "Cristiane P. Iglesias",
  "Fernando A. Toledo",
  "Sabrina L. Moreira",
  "Marcos V. Quintela",
  "Jéssica A. Barbosa",
  "Anderson T. Camões",
  "Rosana F. Vilela",
  "Everton M. Sarmento",
  "Tatiane R. Cordeiro",
  "Gisele A. Bertoldi",
  "Nilton P. Sacramento",
  "Vera L. Montenegro",
];

/**
 * Distribuição de inatividade da demonstração (mesma ordem de grandeza da
 * referência): a maior concentração está na faixa de 30–59 dias, seguida de
 * 60–89 e, por fim, 90 dias ou mais. Cada valor pertence a UMA faixa.
 *
 * Faixas EXCLUSIVAS — um cliente nunca é contado duas vezes:
 *   30–59 dias .... 152 clientes
 *   60–89 dias ....  97 clientes
 *   90 dias ou mais  68 clientes
 *   total inativos .. 317 clientes (30 dias ou mais)
 */
const FAIXA_30_59 = 152;
const FAIXA_60_89 = 97;
const FAIXA_90 = 68;
const ATIVOS = 120;

/** Dias por faixa: deterministicamente distribuídos dentro de cada faixa. */
function diasDaFaixa(base: number, faixa: "30-59" | "60-89" | "90+", indice: number) {
  if (faixa === "30-59") return 30 + ((indice * 7 + base) % 30);
  if (faixa === "60-89") return 60 + ((indice * 5 + base) % 30);
  return 90 + ((indice * 11 + base) % 120);
}

/** Nomes escritos à mão (aparecem primeiro na tabela) + pools para o restante. */
const PRIMEIROS = [
  "Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Henrique", "Isabela",
  "João", "Karina", "Lucas", "Mariana", "Nelson", "Olívia", "Paulo", "Queila", "Rafael",
  "Sabrina", "Tiago", "Ursula", "Vinícius", "Wagner", "Yasmin", "Zilda",
];
const SOBRENOMES = [
  "Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Ferreira", "Gonçalves", "Henriques",
  "Iglesias", "Jardim", "Klein", "Lacerda", "Machado", "Nogueira", "Oliveira", "Pacheco",
  "Queiroz", "Rezende", "Santos", "Teixeira", "Uchoa", "Vasconcelos", "Werneck", "Xavier",
  "Zanetti",
];

function nomeGerado(indice: number): string {
  const p = PRIMEIROS[indice % PRIMEIROS.length]!;
  const s = SOBRENOMES[Math.floor(indice / PRIMEIROS.length) % SOBRENOMES.length]!;
  return `${p} ${s}`;
}

export const ORIGEM = [
  "Instagram",
  "Google",
  "Indicação",
  "WhatsApp",
  "Recorrente",
  "Reclamação",
  "Outro",
];

export const ATENDENTES = [
  "Ana Souza",
  "Bruno Lima",
  "Carla Reis",
  "Diego Alves",
  "Elisa Prado",
  "Fábio Nunes",
  "Gabriela Menezes",
];

const PRODUTOS = [
  "Coxinha",
  "Risole",
  "Quibe",
  "Bolinha de Queijo",
  "Enroladinho",
  "Esfiha",
  "Pastel",
  "Empada",
  "Croquete",
  "Empadinha",
  "Quibe de Queijo",
  "Pão de queijo",
];

const STATUS_PESO: StatusReativacao[] = [
  "Não respondeu",
  "Em contato",
  "Aguardando retorno",
  "Campanha enviada",
  "Recuperado",
  "Não respondeu",
  "Em contato",
  "Campanha enviada",
];

function digitos(base: string, n: number): string {
  const numero = String(n).padStart(9, "0");
  return `${base} ${numero.slice(0, 5)}-${numero.slice(5)}`;
}

function historicoDe(c: {
  diasSemComprar: number;
  status: StatusReativacao;
  totalPedidos: number;
}): ClienteDemo["historico"] {
  const linhas: ClienteDemo["historico"] = [];
  const ultimo = dataUltimoPedido(c.diasSemComprar);
  linhas.push({
    data: ultimo,
    tipo: "Pedido",
    texto: `Último pedido do cliente (${c.totalPedidos} pedido(s) no total).`,
  });
  if (c.status === "Campanha enviada" || c.status === "Aguardando retorno" || c.status === "Recuperado") {
    linhas.push({
      data: ultimo,
      tipo: "Campanha",
      texto: "Recebeu a campanha de reativação demonstrativa.",
    });
  }
  if (c.status === "Em contato" || c.status === "Campanha enviada" || c.status === "Aguardando retorno") {
    linhas.push({
      data: dataUltimoPedido(Math.max(0, c.diasSemComprar - 6)),
      tipo: "Contato",
      texto: "Contato registrado pelo atendimento (mensagem demonstrativa).",
    });
  }
  if (c.status === "Recuperado") {
    linhas.push({
      data: dataUltimoPedido(Math.max(0, c.diasSemComprar - 12)),
      tipo: "Retorno",
      texto: "Cliente voltou a comprar após a campanha.",
    });
  }
  if (c.status === "Não respondeu") {
    linhas.push({
      data: dataUltimoPedido(Math.max(0, c.diasSemComprar - 8)),
      tipo: "Sem retorno",
      texto: "Contato sem resposta — permanece inativo.",
    });
  }
  return linhas;
}

function criarClientes(): ClienteDemo[] {
  const lista: ClienteDemo[] = [];
  const montar = (nome: string, i: number, diasSemComprar: number) => {
    const segmento = classificar(diasSemComprar, DEFAULT_CRM_SETTINGS);
    const favoritos = [PRODUTOS[i % PRODUTOS.length]!, PRODUTOS[(i + 3) % PRODUTOS.length]!];
    if (i % 3 === 0) favoritos.push(PRODUTOS[(i + 6) % PRODUTOS.length]!);
    const totalPedidos = 1 + (i % 7);
    const totalGasto = totalPedidos * (18 + ((i * 7) % 60));
    const status = STATUS_PESO[i % STATUS_PESO.length]!;
    return {
      id: `cli-demo-${i + 1}`,
      nome,
      telefone: digitos("(62)", 900000000 + i * 37),
      email: `${normalizar(nome).replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@exemplo.com`,
      diasSemComprar,
      segmento,
      origem: ORIGEM[i % ORIGEM.length]!,
      atendente: ATENDENTES[i % ATENDENTES.length]!,
      favoritos,
      status,
      totalPedidos,
      totalGasto,
      historico: historicoDe({ diasSemComprar, status, totalPedidos }),
    };
  };

  // 1) Nomes escritos à mão, preservados na ordem original da referência.
  NOMES.forEach((nome, i) => {
    const faixa =
      i < FAIXA_30_59 ? "30-59" : i < FAIXA_30_59 + FAIXA_60_89 ? "60-89" : "90+";
    const dias =
      i < FAIXA_30_59 + FAIXA_60_89 + FAIXA_90
        ? diasDaFaixa(i, faixa, i)
        : 4 + ((i * 3) % 25);
    lista.push(montar(nome, i, dias));
  });

  // 2) Complemento determinístico até a ordem de grandeza da referência.
  let i = NOMES.length;
  while (lista.length < FAIXA_30_59 + FAIXA_60_89 + FAIXA_90 + ATIVOS) {
    const alvoInativo = lista.length < FAIXA_30_59 + FAIXA_60_89 + FAIXA_90;
    const faixa: "30-59" | "60-89" | "90+" =
      lista.length < FAIXA_30_59
        ? "30-59"
        : lista.length < FAIXA_30_59 + FAIXA_60_89
          ? "60-89"
          : "90+";
    const dias = alvoInativo
      ? diasDaFaixa(i, faixa, i)
      : 1 + ((i * 7) % 29);
    lista.push(montar(nomeGerado(i - NOMES.length), i, dias));
    i += 1;
  }
  return lista;
}

export const CLIENTES_DEMO: ClienteDemo[] = criarClientes();

export const CAMPANHAS_DEMO: CampanhaDemo[] = [
  {
    id: "camp-demo-1",
    nome: "Clientes 60 dias sem comprar",
    publico: "Clientes inativos há 60–89 dias",
    quantidade: 97,
    status: "Rascunho",
  },
  {
    id: "camp-demo-2",
    nome: "Clientes VIP inativos",
    publico: "Inativos com ticket médio acima de R$ 150",
    quantidade: 22,
    status: "Aguardando aprovação",
  },
  {
    id: "camp-demo-3",
    nome: "Recuperação pós-reclamação",
    publico: "Clientes com atendimento concluído sem retorno",
    quantidade: 18,
    status: "Aprovada",
  },
];

/** Motivos ilustrativos (C4 — pesquisa de satisfação ainda não implementada). */
export const MOTIVOS_ILUSTRATIVOS: {
  motivo: string;
  percentual: number;
  cor: "ouro" | "verde" | "vermelho" | "cinza";
}[] = [
  { motivo: "Entrega", percentual: 34, cor: "ouro" },
  { motivo: "Preço", percentual: 26, cor: "verde" },
  { motivo: "Qualidade", percentual: 18, cor: "ouro" },
  { motivo: "Atendimento", percentual: 14, cor: "vermelho" },
  { motivo: "Outros", percentual: 8, cor: "cinza" },
];

export const PERGUNTAS_ILUSTRATIVAS = [
  "O que fez você parar de comprar conosco?",
  "Teve alguma decepção?",
  "Foi preço, entrega, qualidade ou atendimento?",
  "Gostaria que nossa equipe entrasse em contato?",
];

export const MOTIVOS_PRINCIPAL = [
  "Preço",
  "Entrega",
  "Qualidade",
  "Atendimento",
  "Mudança de hábito",
  "Outro",
];

/** Etapas futuras: aparecem como seções ilustrativas, sem ações reais. */
export const ETAPAS_FUTURAS = [
  { rotulo: "Pesquisas e Reclamações", etapa: "C4" },
  { rotulo: "Sugestões de Promoção", etapa: "C3" },
  { rotulo: "Campanhas", etapa: "C2" },
  { rotulo: "Resultados", etapa: "C5" },
];

export { SEGMENTO_LABEL };
