/**
 * Modo DEMONSTRAÇÃO exclusivo de Preview.
 *
 * Quando VITE_DEMO_PREVIEW=1, o cliente Supabase é substituído por este
 * objeto em memória. Nenhuma URL, chave, RPC, Storage ou Realtime do
 * Supabase real é utilizada: não há fetch para backend algum.
 *
 * Os dados abaixo são 100% fictícios. As mutações alteram apenas o estado
 * desta memória, descartado a cada recarregamento da página.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
    linha("funcionarios", { nome: "Ana (demo)", papel: "atendente", ativo: true }),
    linha("funcionarios", { nome: "Carlos (demo)", papel: "producao", ativo: true }),
    linha("funcionarios", { nome: "Bia (demo)", papel: "motoboy", ativo: true }),
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
    linha("categorias", { nome: "Fritos", slug: "fritos", ativo: true, ordem: 1 }),
    linha("categorias", { nome: "Assados", slug: "assados", ativo: true, ordem: 2 }),
    linha("categorias", { nome: "Doces", slug: "doces", ativo: true, ordem: 3 }),
  ],
  produtos: [
    linha("produtos", { nome: "Coxinha de frango (demo)", categoria: "Fritos", preco: 7.9, ativo: true, descricao: "Produto fictício", estoque: 120 }),
    linha("produtos", { nome: "Bolinho de queijo (demo)", categoria: "Fritos", preco: 6.5, ativo: true, descricao: "Produto fictício", estoque: 90 }),
    linha("produtos", { nome: "Pão de queijo (demo)", categoria: "Assados", preco: 5.5, ativo: true, descricao: "Produto fictício", estoque: 60 }),
  ],
  pedidos: [
    linha("pedidos", {
      id: "00000000-0000-4000-8000-000000000201",
      codigo: "DEMO-001",
      cliente_nome: "Cliente fictício",
      status: "recebido",
      total: 48.5,
      taxa_entrega: 5,
      forma_pagamento: "pix",
      pagamento_status: "pendente",
      endereco: "Rua Demonstração, 100",
      cidade: "São Paulo",
      telefone: "(11) 90000-0000",
      user_id: USUARIO_DEMO.id,
      motoboy_id: null,
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
  ],
  pedido_itens: [
    linha("pedido_itens", { pedido_id: "00000000-0000-4000-8000-000000000201", produto_id: "00000000-0000-4000-8000-000000000001", nome: "Coxinha de frango (demo)", quantidade: 5, preco_unitario: 7.9, subtotal: 39.5 }),
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
    linha("cupons", { codigo: "DEMO10", descricao: "Cupom fictício", percentual: 10, ativo: true }),
  ],
  avaliacoes: [],
  clientes: [],
  campanhas: [],
  configuracoes: [],
  loja_config: [
    linha("loja_config", { nome: "Néia Salgados — DEMONSTRAÇÃO", chave_pix: "", whatsapp: "", endereco: "Rua Demonstração, 100" }),
  ],
};

const banco = new Map<string, Linha[]>();
function tabela(nome: string): Linha[] {
  if (!banco.has(nome)) banco.set(nome, (SEMENTES[nome] ?? []).map((r) => ({ ...r })));
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

  private executar(): Resposta {
    const dados = tabela(this.nome);
    if (this.modo === "insert" || this.modo === "upsert") {
      const entradas = Array.isArray(this.payload) ? this.payload : [this.payload];
      const gravadas = entradas.map((e) => linha(this.nome, { id: e["id"] ?? crypto.randomUUID(), ...e }));
      dados.push(...gravadas);
      return ok(Array.isArray(this.payload) ? gravadas : gravadas[0]);
    }
    if (this.modo === "update") {
      const alvo = this.aplicar(dados);
      alvo.forEach((r) => Object.assign(r, this.payload, { updated_at: AGORA }));
      return ok(alvo);
    }
    if (this.modo === "delete") {
      const alvo = this.aplicar(dados);
      const ids = new Set(alvo.map((r) => r["id"]));
      const restante = dados.filter((r) => !ids.has(r["id"]));
      banco.set(this.nome, restante);
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
  creditar_pontos_pedido: { pontos: 10 },
  resgatar_fidelidade: "DEMO10",
  criar_rota_entrega_atomica: { status: "criada", quantidade: 1 },
  liberar_rota_entrega: OK,
  encerrar_rota_pela_central: OK,
  aceitar_entrega_motoboy: OK,
  retirar_pedido_cliente: OK,
  aceitar_pedido_atendente: OK,
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

function clienteDemo(): any {
  const auth = {
    async getUser() { return { data: { user: USUARIO_DEMO }, error: null }; },
    async getSession() { return { data: { session: SESSAO_DEMO }, error: null }; },
    async setSession() { return { data: { session: SESSAO_DEMO, user: USUARIO_DEMO }, error: null }; },
    async signInWithPassword() { return { data: { user: USUARIO_DEMO, session: SESSAO_DEMO }, error: null }; },
    async signInAnonymously() { return { data: { user: USUARIO_DEMO, session: SESSAO_DEMO }, error: null }; },
    async signOut() { return { error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser() { return { data: { user: USUARIO_DEMO }, error: null }; },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() { /* sem listener real */ } } } };
    },
  };

  return {
    from: (nome: string) => new ConsultaDemo(nome),
    rpc: async (nome: string, _args?: unknown) => {
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
export function criarClienteDemo(): SupabaseClient<Database> {
  return clienteDemo() as SupabaseClient<Database>;
}
