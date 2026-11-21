/**
 * Modo DEMONSTRAÇÃO exclusivo de Preview.
 *
 * Quando VITE_DEMO_PREVIEW=1, o cliente Supabase é substituído por este
 * objeto em memória. Nenhuma URL, chave, RPC, Storage ou Realtime do
 * Supabase real é utilizada: não há fetch para backend algum.
 *
 * Os dados abaixo são 100% fictícios. As mutações alteram apenas o estado
 * desta memória; pedidos criados no Checkout são espelhados no localStorage
 * do próprio navegador para sobreviver a F5 sem tocar em qualquer servidor.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  aceitarPedidoEmMemoria,
  type PedidoAceiteMemoria,
} from "@/lib/aceite-atendente-memoria";
import { MEUS_PEDIDOS_CLIENTE_DEMO } from "@/lib/pedidos-demo-cliente";
import fritos from "@/assets/cat-fritos.jpg";
import assados from "@/assets/cat-assados.jpg";

type Linha = Record<string, any>;
type Resposta = { data: any; error: any; count?: number | undefined; status?: number };

const CHAVE = "VITE_DEMO_PREVIEW";

function ligado(valor: unknown): boolean {
  return typeof valor === "string" && (valor === "1" || valor.toLowerCase() === "true");
}

/** Flag de build (Vite) ou de runtime (SSR/Vercel). */
export function ehModoDemo(): boolean {
  if (ligado(import.meta.env.VITE_DEMO_PREVIEW)) return true;
  try {
    const proc = (globalThis as { process?: { env?: Record<string, unknown> } }).process;
    return ligado(proc?.env?.[CHAVE]);
  } catch {
    return false;
  }
}

export const USUARIO_DEMO = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "demonstracao@neiasalgados.local",
  app_metadata: { provider: "demo" },
  user_metadata: { nome: "Demonstração", papel: "admin" },
  created_at: "2026-01-01T00:00:00.000Z",
};

const SESSAO_DEMO = {
  access_token: "demo-sem-acesso-real",
  refresh_token: "demo-sem-acesso-real",
  expires_in: 3600,
  expires_at: 9999999999,
  token_type: "bearer",
  user: USUARIO_DEMO,
};

const AGORA = "2026-11-18T12:00:00.000Z";

function linha(tabela: string, base: Linha): Linha {
  const comum: Linha = {
    id: base["id"] ?? "00000000-0000-4000-8000-000000000001",
    created_at: AGORA,
    updated_at: AGORA,
    ...base,
  };
  void tabela;
  return comum;
}

/** Pedidos da lista pública viram registros reais do cliente demo: o detalhe
 * moderno (/pedido/$id) carrega exatamente o ID clicado, sem dados fixos. */
const PEDIDOS_CLIENTE_SEMENTE = MEUS_PEDIDOS_CLIENTE_DEMO.map((p) =>
  linha("pedidos", {
    id: p.id,
    numero: Number(p.numero),
    codigo: `DEMO-${p.numero}`,
    cliente_nome: "Cliente demonstrativo",
    created_at: `${p.data}:00`,
    status: p.status,
    tipo_entrega: p.modalidade,
    total: p.valor,
    subtotal: p.valor,
    taxa_entrega: 0,
    desconto: 0,
    forma_pagamento: "pix",
    pagamento_status: p.pagamento,
    endereco:
      p.modalidade === "retirada"
        ? "Retirada na loja — endereço não configurado nesta demonstração"
        : "Rua das Flores, 249 — Jardim Primavera — Cidade demonstrativa",
    bairro: "Jardim Primavera",
    cidade: "Cidade demonstrativa",
    telefone: "(00) 90000-0000 — demonstração",
    user_id: USUARIO_DEMO.id,
  }),
);

const ITENS_PEDIDOS_CLIENTE_SEMENTE = MEUS_PEDIDOS_CLIENTE_DEMO.map((p, i) =>
  linha("pedido_itens", {
    id: `demo-item-cliente-${p.id}`,
    pedido_id: p.id,
    nome: p.modalidade === "retirada" ? "Item para retirada (demonstração)" : "Item para entrega (demonstração)",
    quantidade: p.itens,
    preco_unitario: p.valor / Math.max(1, p.itens),
    subtotal: p.valor,
    ordem: i,
  }),
);

const SEMENTES: Record<string, Linha[]> = {
  // Papéis fictícios apenas para permitir a navegação de todas as telas.
  // Nenhum deles existe no backend: o cliente demo não acessa o Supabase.
  user_roles: [
    { user_id: USUARIO_DEMO.id, role: "admin" },
    { user_id: USUARIO_DEMO.id, role: "atendente" },
    { user_id: USUARIO_DEMO.id, role: "producao" },
    { user_id: USUARIO_DEMO.id, role: "financeiro" },
    { user_id: USUARIO_DEMO.id, role: "motoboy" },
    { user_id: USUARIO_DEMO.id, role: "contador" },
  ],
  profiles: [
    linha("profiles", {
      id: USUARIO_DEMO.id,
      nome: "Demonstração",
      email: USUARIO_DEMO.email,
      avatar_url: "",
    }),
  ],
  funcionarios: [
    linha("funcionarios", {
      id: "00000000-0000-4000-8000-000000000111",
      nome: "Ana (demo)",
      papel: "atendente",
      ativo: true,
    }),
    linha("funcionarios", {
      id: "00000000-0000-4000-8000-000000000112",
      nome: "Carlos (demo)",
      papel: "producao",
      ativo: true,
    }),
    linha("funcionarios", {
      id: "00000000-0000-4000-8000-000000000113",
      nome: "Bia (demo)",
      papel: "motoboy",
      ativo: true,
    }),
  ],
  motoboys: [
    linha("motoboys", {
      id: "00000000-0000-4000-8000-000000000101",
      nome: "Bia (demo)",
      usuario: USUARIO_DEMO.id,
      ativo: true,
      telefone: "(11) 90000-0000",
      placa: "DEMO-001",
    }),
  ],
  categorias: [
    linha("categorias", { id: "00000000-0000-4000-8000-000000000121", nome: "Fritos", slug: "fritos", ativo: true, ordem: 1 }),
    linha("categorias", { id: "00000000-0000-4000-8000-000000000122", nome: "Assados", slug: "assados", ativo: true, ordem: 2 }),
    linha("categorias", { id: "00000000-0000-4000-8000-000000000123", nome: "Doces", slug: "doces", ativo: true, ordem: 3 }),
  ],
  produtos: [
    linha("produtos", { id: "00000000-0000-4000-8000-000000000001", nome: "Coxinha de frango (demo)", categoria: "Fritos", preco: 7.9, ativo: true, descricao: "Produto fictício", imagem_url: fritos, estoque: 120, embalagem_custo: 0.35, tempo_fritura_s: 210, tempo_mao_obra_min: 0.8 }),
    linha("produtos", { id: "00000000-0000-4000-8000-000000000002", nome: "Bolinho de queijo (demo)", categoria: "Fritos", preco: 6.5, ativo: true, descricao: "Produto fictício", imagem_url: fritos, estoque: 90, embalagem_custo: 0.25, tempo_fritura_s: 180, tempo_mao_obra_min: 0.6 }),
    linha("produtos", { id: "00000000-0000-4000-8000-000000000003", nome: "Pão de queijo (demo)", categoria: "Assados", preco: 5.5, ativo: true, descricao: "Produto fictício", imagem_url: assados, estoque: 60, embalagem_custo: 0.2, tempo_fritura_s: 0, tempo_mao_obra_min: 0.4 }),
  ],
  // HOMO-CLIENTE-14: fixtures do carrossel da home. Nomes e fotos vêm do
  // próprio catálogo demonstrativo; nenhum produto ou imagem é inventado e
  // nenhum bucket/Storage real é consultado.
  hero_carousel: [
    // Cada legenda/imagem reproduz EXATAMENTE o produto do catálogo demo
    // (mesmo nome e mesma URL). Nenhuma foto genérica é reaproveitada para
    // sabores diferentes — por isso o bolinho não entra como slide.
    linha("hero_carousel", {
      id: "00000000-0000-4000-8000-000000000901",
      imagem_url: fritos,
      legenda: "Coxinha de frango (demo)",
      ordem: 1,
      ativo: true,
    }),
    linha("hero_carousel", {
      id: "00000000-0000-4000-8000-000000000902",
      imagem_url: assados,
      legenda: "Pão de queijo (demo)",
      ordem: 2,
      ativo: true,
    }),
  ],
  // Equivalente demo da migration 0076 (linha única + histórico de preços).
  precificacao_config: [
    linha("precificacao_config", {
      id: true,
      margem_desejada_pct: 40,
      margem_baixa_pct: 15,
      mao_obra_hora: 25,
      gas_hora: 8,
      custos_fixos_mensais: 6000,
      volume_mensal_estimado: 10000,
      taxa_credito_pct: 5,
      taxa_debito_pct: 2,
      taxa_pix_pct: 0,
      taxa_ifood_pct: 27,
    }),
  ],
  preco_historico: [
    linha("preco_historico", {
      id: "00000000-0000-4000-8000-000000000501",
      produto_id: "00000000-0000-4000-8000-000000000001",
      preco_antigo: 7.5,
      preco_novo: 7.9,
      usuario: USUARIO_DEMO.id,
      motivo: "reajuste demonstrativo",
    }),
  ],
  // Ficha fictícia apenas para demonstrar custos completos no H12.
  insumos: [
    linha("insumos", { id: "00000000-0000-4000-8000-000000000601", nome: "Farinha de trigo (demo)", custo_medio: 3.2, unidade_base: "kg", ativo: true }),
    linha("insumos", { id: "00000000-0000-4000-8000-000000000602", nome: "Frango (demo)", custo_medio: 11.5, unidade_base: "kg", ativo: true }),
    linha("insumos", { id: "00000000-0000-4000-8000-000000000603", nome: "Óleo (demo)", custo_medio: 6.8, unidade_base: "l", ativo: true }),
  ],
  fichas_tecnicas: [
    linha("fichas_tecnicas", {
      id: "00000000-0000-4000-8000-000000000701",
      produto_id: "00000000-0000-4000-8000-000000000001",
      rendimento: 20,
      perda_pct: 5,
      por_cento: false,
      ficha_itens: [
        linha("ficha_itens", { id: "00000000-0000-4000-8000-000000000801", ficha_id: "00000000-0000-4000-8000-000000000701", insumo_id: "00000000-0000-4000-8000-000000000601", quantidade: 0.05, unidade: "kg", insumos: { nome: "Farinha de trigo (demo)", custo_medio: 3.2, unidade_base: "kg" } }),
        linha("ficha_itens", { id: "00000000-0000-4000-8000-000000000802", ficha_id: "00000000-0000-4000-8000-000000000701", insumo_id: "00000000-0000-4000-8000-000000000602", quantidade: 0.04, unidade: "kg", insumos: { nome: "Frango (demo)", custo_medio: 11.5, unidade_base: "kg" } }),
        linha("ficha_itens", { id: "00000000-0000-4000-8000-000000000803", ficha_id: "00000000-0000-4000-8000-000000000701", insumo_id: "00000000-0000-4000-8000-000000000603", quantidade: 0.01, unidade: "l", insumos: { nome: "Óleo (demo)", custo_medio: 6.8, unidade_base: "l" } }),
      ],
    }),
  ],
  pedidos: [
    linha("pedidos", {
      id: "00000000-0000-4000-8000-000000000201",
      numero: 4598,
      codigo: "DEMO-001",
      cliente_nome: "Cliente fictício",
      status: "recebido",
      tipo_entrega: "entrega",
      aceito_em_atendente: null,
      aceito_por: null,
      producao_status: "pendente",
      total: 48.5,
      taxa_entrega: 5,
      forma_pagamento: "pix",
      pagamento_status: "pendente",
      endereco: "Rua Demonstração, 100",
      cidade: "São Paulo",
      telefone: "(11) 90000-0000",
      user_id: USUARIO_DEMO.id,
      motoboy_id: null,
      pedido_itens: [
        { nome: "Coxinha de frango (demo)", quantidade: 5, preco_unitario: 7.9 },
      ],
    }),
    linha("pedidos", {
      id: "00000000-0000-4000-8000-000000000202",
      codigo: "DEMO-002",
      cliente_nome: "Outro cliente fictício",
      status: "em_preparo",
      total: 92,
      taxa_entrega: 0,
      forma_pagamento: "dinheiro",
      pagamento_status: "pago",
      endereco: "Av. Fictícia, 200",
      cidade: "São Paulo",
      telefone: "(11) 90000-0001",
      user_id: USUARIO_DEMO.id,
      motoboy_id: null,
    }),
    ...PEDIDOS_CLIENTE_SEMENTE,
  ],
  pedido_itens: [
    linha("pedido_itens", { pedido_id: "00000000-0000-4000-8000-000000000201", produto_id: "00000000-0000-4000-8000-000000000001", nome: "Coxinha de frango (demo)", quantidade: 5, preco_unitario: 7.9, subtotal: 39.5 }),
    ...ITENS_PEDIDOS_CLIENTE_SEMENTE,
  ],
  estoque_movimentacoes: [],
  reservas_estoque: [],
  fila_impressao: [],
  fila_fritura: [],
  pedido_status_historico: [],
  caixa_sessoes: [
    linha("caixa_sessoes", { status: "aberto", valor_inicial: 100, usuario_id: USUARIO_DEMO.id }),
  ],
  contas: [],
  contas_bancarias: [],
  despesas: [],
  extratos: [],
  cupons: [
    linha("cupons", {
      id: "00000000-0000-4000-8000-000000000901",
      codigo: "DEMO10", descricao: "Cupom fictício · reativação",
      tipo: "percentual", valor: 10, percentual: 10, minimo: 40, max_desconto: 12,
      ativo: true, usos: 18, max_usos: 50, desconto_total: 612.5, vendas_total: 2450,
      validade_ini: "2026-11-01T00:00:00", validade_fim: "2026-11-30T23:59:59",
    }),
    linha("cupons", {
      id: "00000000-0000-4000-8000-000000000902",
      codigo: "FESTA5", descricao: "Cupom fictício · valor fixo",
      tipo: "valor", valor: 5, minimo: 80, max_desconto: 5,
      ativo: true, usos: 7, max_usos: 30, desconto_total: 35, vendas_total: 980,
      validade_ini: "2026-11-10T00:00:00", validade_fim: "2026-12-15T23:59:59",
      produtos_ids: ["00000000-0000-4000-8000-000000000001"],
    }),
    linha("cupons", {
      id: "00000000-0000-4000-8000-000000000903",
      codigo: "VOLTA15", descricao: "Cupom fictício · aguardando ativação",
      tipo: "percentual", valor: 15, percentual: 15, minimo: 60, max_desconto: 20,
      ativo: false, usos: 0, max_usos: 20, desconto_total: 0, vendas_total: 0,
      validade_ini: "2026-11-20T00:00:00", validade_fim: "2026-12-20T23:59:59",
    }),
  ],
  avaliacoes: [],
  clientes: [],
  campanhas: [],
  configuracoes: [],
  loja_config: [
    // id booleano para casar com .eq("id", true) de useLojaConfig/admin.
    // Endereço fictício de demonstração — nenhum dado real de loja é inventado.
    linha("loja_config", { id: true, nome: "Néia Salgados — DEMONSTRAÇÃO", chave_pix: "", whatsapp: "", endereco: "Rua Demonstração, 100" }),
  ],
  // Origem apenas para exercitar o cálculo de frete no preview isolado.
  // Está marcada como simulação e NUNCA é exibida como endereço oficial.
  config_entrega: [
    linha("config_entrega", {
      id: true,
      aceitar_entregas: true,
      valor_por_km: 1.5,
      taxa_minima_ativa: true,
      taxa_minima: 6,
      distancia_max_ativa: false,
      distancia_max_km: 0,
      gratis_ativa: false,
      gratis_acima: 0,
      ajuste_manual: false,
      origem_nome: "Origem demonstrativa (simulação)",
      origem_logradouro: "Rua Demonstrativa (simulação)",
      origem_numero: "0",
      origem_complemento: "",
      origem_bairro: "Centro demonstrativo",
      origem_cidade: "Cidade demonstrativa",
      origem_uf: "SP",
      origem_cep: "00000000",
      origem_lat: -23.55,
      origem_lng: -46.63,
      origem_place_id: "",
      atualizado_em: AGORA,
    }),
  ],
};

/** Pedidos criados no Checkout demo precisam sobreviver a F5. Nada sai do
 * navegador: é somente um espelho local das mutações em memória. */
export const CHAVE_PERSISTENCIA_PEDIDOS_DEMO = "neia-demo-pedidos-cliente-v1";
const TABELAS_PERSISTIDAS = new Set(["pedidos", "pedido_itens"]);

function lerPersistencia(): Record<string, Linha[]> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(CHAVE_PERSISTENCIA_PEDIDOS_DEMO);
    if (!bruto) return {};
    const objeto = JSON.parse(bruto) as Record<string, unknown>;
    const saida: Record<string, Linha[]> = {};
    for (const nome of TABELAS_PERSISTIDAS) {
      if (Array.isArray(objeto[nome])) saida[nome] = objeto[nome] as Linha[];
    }
    return saida;
  } catch {
    return {};
  }
}

function gravarPersistencia(): void {
  if (typeof window === "undefined") return;
  try {
    const sementes = new Set((SEMENTES["pedidos"] ?? []).map((r) => String(r["id"])));
    const pedidos = (banco.get("pedidos") ?? [])
      .filter((r) => !sementes.has(String(r["id"])))
      .slice(-30);
    const ids = new Set(pedidos.map((r) => String(r["id"])));
    const itens = (banco.get("pedido_itens") ?? []).filter((r) => ids.has(String(r["pedido_id"])));
    window.localStorage.setItem(
      CHAVE_PERSISTENCIA_PEDIDOS_DEMO,
      JSON.stringify({ pedidos, pedido_itens: itens }),
    );
  } catch {
    /* storage cheio/bloqueado: o pedido segue vivo apenas nesta aba */
  }
}

const banco = new Map<string, Linha[]>();
function tabela(nome: string): Linha[] {
  if (!banco.has(nome)) {
    const persistidos = lerPersistencia()[nome] ?? [];
    banco.set(nome, [...(SEMENTES[nome] ?? []), ...persistidos].map((r) => ({ ...r })));
  }
  return banco.get(nome) as Linha[];
}

function erro(message: string, code = "DEMO"): any {
  return { message, code, details: null, hint: null };
}

function ok(data: any, count?: number): Resposta {
  return { data, error: null, count, status: 200 };
}

class ConsultaDemo implements PromiseLike<Resposta> {
  private filtros: Array<{ coluna: string; operador: string; valor: any }> = [];
  private ordem: { coluna: string; crescente: boolean } | null = null;
  private limite: number | null = null;
  private inicio = 0;
  private modo: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Linha | Linha[] = {};
  private colunas = "*";

  constructor(private readonly nome: string) {}

  private where(coluna: string, operador: string, valor: any): this {
    this.filtros.push({ coluna, operador, valor });
    return this;
  }

  eq(coluna: string, valor: any) { return this.where(coluna, "eq", valor); }
  neq(coluna: string, valor: any) { return this.where(coluna, "neq", valor); }
  gt(coluna: string, valor: any) { return this.where(coluna, "gt", valor); }
  gte(coluna: string, valor: any) { return this.where(coluna, "gte", valor); }
  lt(coluna: string, valor: any) { return this.where(coluna, "lt", valor); }
  lte(coluna: string, valor: any) { return this.where(coluna, "lte", valor); }
  like(coluna: string, valor: any) { return this.where(coluna, "like", valor); }
  ilike(coluna: string, valor: any) { return this.where(coluna, "ilike", valor); }
  is(coluna: string, valor: any) { return this.where(coluna, "is", valor); }
  in(coluna: string, valores: any[]) { return this.where(coluna, "in", valores); }
  contains(coluna: string, valor: any) { return this.where(coluna, "contains", valor); }
  textSearch(coluna: string, valor: any) { return this.where(coluna, "like", valor); }
  or() { return this; }
  not() { return this; }

  select(colunas = "*"): this { this.colunas = colunas; if (this.modo === "select") return this; return this; }
  order(coluna: string, opcoes?: { ascending?: boolean }) {
    this.ordem = { coluna, crescente: opcoes?.ascending !== false };
    return this;
  }
  limit(n: number) { this.limite = n; return this; }
  range(inicio: number, fim: number) { this.inicio = inicio; this.limite = fim - inicio + 1; return this; }

  insert(payload: Linha | Linha[]): this { this.modo = "insert"; this.payload = payload; return this; }
  upsert(payload: Linha | Linha[]): this { this.modo = "upsert"; this.payload = payload; return this; }
  update(payload: Linha): this { this.modo = "update"; this.payload = payload; return this; }
  delete(): this { this.modo = "delete"; return this; }

  private aplicar(linhas: Linha[]): Linha[] {
    let resultado = linhas.filter((r) =>
      this.filtros.every(({ coluna, operador, valor }) => {
        const v = r[coluna];
        switch (operador) {
          case "eq": return v === valor;
          case "neq": return v !== valor;
          case "gt": return v > valor;
          case "gte": return v >= valor;
          case "lt": return v < valor;
          case "lte": return v <= valor;
          case "is": return v === valor;
          case "in": return Array.isArray(valor) && valor.includes(v);
          case "like":
          case "ilike": return String(v ?? "").toLowerCase().includes(String(valor ?? "").replace(/%/g, "").toLowerCase());
          default: return true;
        }
      }),
    );
    if (this.ordem) {
      const { coluna, crescente } = this.ordem;
      resultado = [...resultado].sort((a, b) => {
        const av = a[coluna];
        const bv = b[coluna];
        if (av === bv) return 0;
        const cmp = av == null ? -1 : bv == null ? 1 : av < bv ? -1 : 1;
        return crescente ? cmp : -cmp;
      });
    }
    if (this.inicio > 0) resultado = resultado.slice(this.inicio);
    if (this.limite != null) resultado = resultado.slice(0, this.limite);
    return resultado;
  }

  private persistir(): void {
    if (TABELAS_PERSISTIDAS.has(this.nome)) gravarPersistencia();
  }

  private executar(): Resposta {
    const dados = tabela(this.nome);
    if (this.modo === "insert" || this.modo === "upsert") {
      const entradas = Array.isArray(this.payload) ? this.payload : [this.payload];
      const gravadas = entradas.map((e) => {
        const nova: Linha = { id: e["id"] ?? crypto.randomUUID(), ...e };
        // Pedido sem número visível quebrava o toast e o acompanhamento no demo.
        if (this.nome === "pedidos" && nova["numero"] == null) {
          nova["numero"] = 4000 + dados.length + 1;
        }
        return linha(this.nome, nova);
      });
      dados.push(...gravadas);
      this.persistir();
      return ok(Array.isArray(this.payload) ? gravadas : gravadas[0]);
    }
    if (this.modo === "update") {
      const alvo = this.aplicar(dados);
      alvo.forEach((r) => Object.assign(r, this.payload, { updated_at: AGORA }));
      this.persistir();
      return ok(alvo);
    }
    if (this.modo === "delete") {
      const alvo = this.aplicar(dados);
      const ids = new Set(alvo.map((r) => r["id"]));
      const restante = dados.filter((r) => !ids.has(r["id"]));
      banco.set(this.nome, restante);
      this.persistir();
      return ok(alvo);
    }
    const encontrados = this.aplicar(dados).map((r) => ({ ...r }));
    return ok(encontrados, encontrados.length);
  }

  then<T1 = Resposta, T2 = never>(
    onfulfilled?: ((value: Resposta) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return Promise.resolve().then(() => this.executar()).then(onfulfilled, onrejected);
  }

  private primeiraLinha(): Linha | null {
    const resposta = this.executar();
    const linhas = Array.isArray(resposta.data)
      ? resposta.data
      : resposta.data
        ? [resposta.data]
        : [];
    return linhas[0] ? { ...linhas[0] } : null;
  }

  single(): PromiseLike<Resposta> {
    return Promise.resolve().then(() => {
      const primeira = this.primeiraLinha();
      if (primeira) return ok(primeira);
      return { data: null, error: erro("Nenhuma linha (demonstração)", "PGRST116") };
    });
  }

  maybeSingle(): PromiseLike<Resposta> {
    return Promise.resolve().then(() => ok(this.primeiraLinha()));
  }
}

function canalDemo(): any {
  const canal: any = {
    on() { return canal; },
    subscribe() { return canal; },
    unsubscribe() { return canal; },
    send() { return Promise.resolve("ok"); },
    track() { return Promise.resolve("ok"); },
  };
  return canal;
}

const OK = { status: "ok", ok: true };

const RPC_DEMO: Record<string, unknown> = {
  calcular_taxa_entrega: { taxa: 5, taxa_entrega: 5 },
  consultar_localizacao_entrega: { latitude: -23.55, longitude: -46.63, capturado_em: AGORA },
  consultar_localizacoes_entregas: [],
  consultar_localizacao_entregas: [],
  identificar_motoboys_acerto: [],
  motoboy_listar_rotas_atribuidas: [{
    id: "00000000-0000-4000-8000-000000000401",
    status: "preparando",
    liberada_central_em: AGORA,
    pedidos: [{
      id: "00000000-0000-4000-8000-000000000201",
      numero: 1053,
      status: "aguardando_motoboy",
      cliente_nome: "Cliente fictício",
      endereco: "Rua Demonstração, 100",
      bairro: "Centro",
      complemento: "Apto 1 (demo)",
    }],
  }],
  iniciar_rota: OK,
  confirmar_retirada: OK,
  confirmar_entrega: OK,
  registrar_atraso_entrega: OK,
  informar_retorno_loja: OK,
  confirmar_chegada_loja: OK,
  registrar_localizacao_rota: { status: "registrado", ok: true },
  enfileirar_evento_cozinha: OK,
  solicitar_reimpressao: OK,
  reservar_estoque_atomica: [],
  liberar_reserva_atomica: OK,
  creditar_pontos_pedido: 10,
  resgatar_fidelidade: "DEMO10",
  criar_rota_entrega_atomica: { status: "criada", quantidade: 1 },
  liberar_rota_entrega: OK,
  encerrar_rota_pela_central: OK,
  aceitar_entrega_motoboy: OK,
  retirar_pedido_cliente: OK,
  liberar_pedido_cozinha: OK,
  conferir_pedido_cozinha: OK,
  atribuir_pedido_motoboy: OK,
  movimentar_estoque_manual_atomico: { id: "00000000-0000-4000-8000-000000000301" },
  receber_compra_item: OK,
  conciliar_extrato_atomico: OK,
  registrar_pagamento_conta: OK,
  cancelar_conta_financeira: OK,
  registrar_movimento_caixa: OK,
};

function clienteDemo(usuarioId = USUARIO_DEMO.id): any {
  const usuario = { ...USUARIO_DEMO, id: usuarioId };
  const sessao = { ...SESSAO_DEMO, user: usuario };
  const auth = {
    async getUser() { return { data: { user: usuario }, error: null }; },
    async getSession() { return { data: { session: sessao }, error: null }; },
    async setSession() { return { data: { session: sessao, user: usuario }, error: null }; },
    async signInWithPassword() { return { data: { user: usuario, session: sessao }, error: null }; },
    async signInAnonymously() { return { data: { user: usuario, session: sessao }, error: null }; },
    async signOut() { return { error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser() { return { data: { user: usuario }, error: null }; },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() { /* sem listener real */ } } } };
    },
  };

  return {
    from: (nome: string) => new ConsultaDemo(nome),
    rpc: async (nome: string, args?: unknown) => {
      // RPC demonstrativa do aceite: mesma validação da migration 0084,
      // porém aplicada somente ao banco em memória deste cliente.
      if (nome === "aceitar_pedido_atendente") {
        const papeis = tabela("user_roles")
          .filter((r) => r["user_id"] === usuarioId)
          .map((r) => String(r["role"] ?? ""));
        const parametros = (args ?? {}) as Record<string, unknown>;
        const r = aceitarPedidoEmMemoria(
          tabela("pedidos") as unknown as PedidoAceiteMemoria[],
          papeis,
          usuarioId,
          parametros["p_pedido_id"],
        );
        return ok([{ resultado: r.resultado, detalhe: r.detalhe }]);
      }
      // Reserva demonstrativa com a MESMA regra do servidor: só confirma quando
      // há estoque disponível. Assim o bloqueio por falta de estoque continua
      // ativo no preview, mas um pedido válido consegue chegar ao acompanhamento.
      if (nome === "reservar_estoque_atomica") {
        const p = (args ?? {}) as Record<string, unknown>;
        const produtoId = String(p["p_produto_id"] ?? "");
        const qtd = Math.max(0, Math.floor(Number(p["p_qtd"] ?? 0)));
        const produto = tabela("produtos").find(
          (r) => r["id"] === produtoId && r["ativo"] !== false,
        );
        const estoque = Number(produto?.["estoque"] ?? 0);
        const jaReservado = tabela("reservas_estoque")
          .filter((r) => r["produto_id"] === produtoId && r["status"] === "ativa")
          .reduce((soma, r) => soma + Number(r["quantidade"] ?? 0), 0);
        if (!produto || estoque - jaReservado < qtd) return ok(false);
        tabela("reservas_estoque").push(
          linha("reservas_estoque", {
            pedido_id: p["p_pedido_id"],
            produto_id: produtoId,
            quantidade: qtd,
            status: "ativa",
          }),
        );
        return ok(true);
      }
      const dados = RPC_DEMO[nome];
      return ok(dados === undefined ? {} : dados);
    },
    auth,
    channel: () => canalDemo(),
    removeChannel: () => "ok",
    getChannels: () => [],
    storage: {
      from: () => ({
        async upload() { return { data: { path: "demo/ficticio" }, error: null }; },
        async download() { return { data: new Blob(), error: null }; },
        async list() { return { data: [], error: null }; },
        async remove() { return { data: [], error: null }; },
        getPublicUrl: () => ({ data: { publicUrl: "/demo-imagem.svg" } }),
      }),
    },
    functions: {
      async invoke() { return { data: { ok: true, demonstracao: true }, error: null }; },
    },
    rest: {},
  };
}

/** Mesma superfície do cliente real, porém sem qualquer acesso à rede. */
export function criarClienteDemo(opcoes: { usuarioId?: string } = {}): SupabaseClient<Database> {
  return clienteDemo(opcoes.usuarioId ?? USUARIO_DEMO.id) as SupabaseClient<Database>;
}
