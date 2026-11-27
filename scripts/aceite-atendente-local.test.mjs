// FUNC-01-B2 — aceite obrigatório da atendente em ambiente local isolado.
// Somente dados fictícios, cliente em memória e nenhum acesso à rede real.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

Object.assign(process.env, {
  VITE_DEMO_PREVIEW: "1",
  VITE_NEIA_AMBIENTE: "teste",
  NEIA_AMBIENTE: "teste",
  VITE_SUPABASE_URL: "https://visual-demo.invalid",
  SUPABASE_URL: "https://visual-demo.invalid",
  VITE_NEIA_PREVIEW_URL: "https://visual-demo.invalid",
  NEIA_STAGING_URL: "https://visual-demo.invalid",
  VITE_SUPABASE_PROJECT_ID: "visual-demo",
  SUPABASE_PROJECT_ID: "visual-demo",
  VITE_SUPABASE_PUBLISHABLE_KEY: "demo-nao-e-credencial",
  SUPABASE_PUBLISHABLE_KEY: "demo-nao-e-credencial",
  VERCEL: "0",
  VERCEL_ENV: "development",
});
for (const chave of ["SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_SERVICE_ROLE_KEY"]) {
  delete process.env[chave];
}

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

const A = await import("@/lib/atendente-aceite.ts");
const M = await import("@/lib/aceite-atendente-memoria.ts");
const D = await import("@/lib/demo-preview.ts");
const I = await import("@/lib/isolamento-local.ts");
const C = await import("@/lib/central-pedidos.ts");
const F = await import("@/lib/producao-demo-fixtures.ts");

let falhas = 0;
function ok(condicao, nome, detalhe = "") {
  console.log(`${condicao ? "ok  " : "FAIL"} - ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas += 1;
}

const ID = "00000000-0000-4000-8000-000000000201";
const UID = D.USUARIO_DEMO.id;
const autorOk = { id: UID, papeis: ["atendente"] };

const pedidoBase = () => ({
  id: ID,
  numero: 4598,
  cliente_nome: "Cliente fictício",
  status: "recebido",
  tipo_entrega: "entrega",
  total: 48.5,
  created_at: "2026-11-20T12:00:00.000Z",
  aceito_em_atendente: null,
  pagamento_status: "pendente",
});

async function reiniciar() {
  M.limparAceitesMemoria();
  const cliente = D.criarClienteDemo();
  await cliente
    .from("pedidos")
    .update({
      status: "recebido",
      aceito_em_atendente: null,
      aceito_por: null,
      updated_at: null,
    })
    .eq("id", ID);
  return cliente;
}

async function linhaPedido(cliente) {
  const r = await cliente.from("pedidos").select("*").eq("id", ID).single();
  return r.data;
}

// ---------------------------------------------------------------------------
// 1. Pedido novo aceito com sucesso
// ---------------------------------------------------------------------------
let cliente = await reiniciar();
const aceite = await A.executarAceiteAtendente({
  cliente,
  pedido: pedidoBase(),
  autor: autorOk,
});
ok(aceite.ok && aceite.codigo === "ok", "pedido novo é aceito", aceite.detalhe);
const aposAceite = await linhaPedido(cliente);
ok(aposAceite.status === "recebido", "status permanece recebido (RPC não muda status)");
ok(
  Boolean(aposAceite.aceito_em_atendente) && aposAceite.aceito_por === UID,
  "aceito_em_atendente e aceito_por são gravados",
);
ok(aposAceite.pagamento_status === "pendente", "pagamento não é alterado");

// ---------------------------------------------------------------------------
// 2. Pedido já aceito não é aceito novamente
// ---------------------------------------------------------------------------
const duplicado = await A.executarAceiteAtendente({
  cliente,
  pedido: pedidoBase(), // estado antigo, como em dois cliques rápidos
  autor: autorOk,
});
ok(!duplicado.ok && duplicado.codigo === "conflito", "aceite duplicado é recusado", duplicado.detalhe);

// ---------------------------------------------------------------------------
// 3. Usuário sem permissão recebe bloqueio (cliente e servidor simulado)
// ---------------------------------------------------------------------------
cliente = await reiniciar();
const semPermissao = D.criarClienteDemo({ usuarioId: "00000000-0000-4000-8000-000000000999" });
const negadoCliente = await A.executarAceiteAtendente({
  cliente: semPermissao,
  pedido: pedidoBase(),
  autor: { id: "00000000-0000-4000-8000-000000000999", papeis: ["cliente"] },
});
ok(!negadoCliente.ok && negadoCliente.codigo === "negado", "perfil sem papel é bloqueado na ação");
const negadoServidor = M.aceitarPedidoEmMemoria(
  [pedidoBase()],
  ["cliente"],
  UID,
  ID,
);
ok(negadoServidor.resultado === "negado", "perfil sem papel também é bloqueado no adaptador (RPC)");
const aposNegado = await linhaPedido(cliente);
ok(!aposNegado.aceito_em_atendente, "bloqueio não grava aceite");

// ---------------------------------------------------------------------------
// 4. Falha da RPC não modifica o status
// ---------------------------------------------------------------------------
cliente = await reiniciar();
const falhaRpc = await A.executarAceiteAtendente({
  cliente: {
    rpc: async () => {
      throw new Error("falha simulada de RPC");
    },
  },
  pedido: pedidoBase(),
  autor: autorOk,
});
ok(!falhaRpc.ok && falhaRpc.codigo === "erro-rede", "falha da RPC é reportada", falhaRpc.detalhe);
const aposFalha = await linhaPedido(cliente);
ok(
  aposFalha.status === "recebido" && !aposFalha.aceito_em_atendente,
  "estado anterior é preservado após falha",
);

// ---------------------------------------------------------------------------
// 5. Dois cliques simultâneos não geram duplicidade
// ---------------------------------------------------------------------------
cliente = await reiniciar();
const [c1, c2] = await Promise.all([
  A.executarAceiteAtendente({ cliente, pedido: pedidoBase(), autor: autorOk }),
  A.executarAceiteAtendente({ cliente, pedido: pedidoBase(), autor: autorOk }),
]);
const sucessos = [c1, c2].filter((r) => r.ok).length;
const conflitos = [c1, c2].filter((r) => r.codigo === "conflito").length;
ok(sucessos === 1 && conflitos === 1, "duas tentativas simultâneas produzem 1 aceite e 1 conflito");
const { data: linhas } = await cliente.from("pedidos").select("*").eq("id", ID);
ok(linhas.length === 1, "nenhuma linha duplicada é criada");

// ---------------------------------------------------------------------------
// 6. Pedido aceito aparece na fila da Produção simulada
// ---------------------------------------------------------------------------
const filaProducao = M.pedidosComAceiteMemoria([...F.PEDIDOS_DEMO_PRODUCAO]);
const naFila = filaProducao.find((p) => String(p.id) === ID);
ok(Boolean(naFila), "pedido aceito é incluído na fila simulada da Produção");
ok(
  Boolean(naFila) && naFila.status === "recebido" && Boolean(naFila.aceito_em_atendente),
  "fila da Produção mostra aceite sem alterar status",
);
const colunas = C.colunasCentral(filaProducao);
ok(colunas.producao.some((p) => String(p.id) === ID), "card aparece na coluna Em produção");
ok(!colunas.analise.some((p) => String(p.id) === ID), "card sai da coluna Em análise");

// ---------------------------------------------------------------------------
// 7. Nenhum efeito externo é disparado
// ---------------------------------------------------------------------------
I.ativarBarreiraLocal();
I.limparTentativas();
cliente = await reiniciar();
await A.executarAceiteAtendente({ cliente, pedido: pedidoBase(), autor: autorOk });
const tentativas = I.tentativasIsolamento();
ok(tentativas.length === 0, "nenhuma tentativa externa foi bloqueada durante o aceite", JSON.stringify(tentativas));
I.desativarIsolamentoLocal();

// ---------------------------------------------------------------------------
// Ligações estáticas: botão → ação → RPC/fila simulada
// ---------------------------------------------------------------------------
const fonte = (p) => readFileSync(path.resolve(p), "utf8");
const rota = fonte("src/routes/atendente.tsx");
const central = fonte("src/components/central-pedidos.tsx");
const preview = fonte("src/components/admin/central-atendente-l2.tsx");
const producao = fonte("src/routes/producao.tsx");
const pdv = fonte("src/routes/pdv.tsx");
ok(rota.includes("<CentralPedidos usuarioId={user?.id} papeis={roles} />"), "rota envia usuário e papéis à Central");
ok(rota.includes("if (!user || !permitido) return;"), "atendente não finaliza sem papel");
ok(central.includes("executarAceiteAtendente({"), "Central chama a ação de aceite");
ok(central.includes("aceitandoRef.current") && central.includes("bloqueado={!podeOperar || aceitandoId !== null}") && central.includes("disabled={bloqueado || !aceite.elegivel}"), "cliques repetidos são travados");
ok(preview.includes("aceitarPedidoEmMemoria(") && !preview.includes('status: "em_producao"'), "prévia usa o adaptador único, sem transição paralela");
ok(producao.includes("pedidosComAceiteMemoria("), "Produção simulada consome aceites confirmados");
ok(pdv.includes('enabled: !preview && !!permitido && (painel === "vendas" || painel === "pedidos")'), "PDV em prévia não consulta pedidos reais");
ok(central.includes("if (!preview) gravarReconhecidos(") && central.includes("if (!preview && novos.length > 0) gravarConhecidos(") && central.includes("onAvisoReconhecido?.(aviso.id)"), "prévia da Central não grava alertas compartilhados e propaga reconhecimento pelo ID do aviso");

if (falhas > 0) {
  console.error(`ACEITE LOCAL: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("ACEITE LOCAL: 7 cenários e verificações estáticas passaram.");
