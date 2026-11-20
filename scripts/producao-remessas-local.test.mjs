// FUNC-01-B3 — Produção local simulada: aceite → remessas → conferência → liberação.
// Somente dados fictícios, adaptador em memória e nenhum acesso à rede real.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

const ACE = await import("@/lib/aceite-atendente-memoria.ts");
const R = await import("@/lib/producao-remessas-memoria.ts");
const D = await import("@/lib/demo-preview.ts");
const M = await import("@/lib/motor-producao.ts");
const L = await import("@/lib/producao-liberacao.ts");
const I = await import("@/lib/isolamento-local.ts");

let falhas = 0;
function ok(condicao, nome, detalhe = "") {
  console.log(`${condicao ? "ok  " : "FAIL"} - ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas += 1;
}

const AGORA_TXT = "2026-11-20T12:00:00.000Z";
const AGORA = new Date(AGORA_TXT);
const UID = D.USUARIO_DEMO.id;
const AUTOR = { id: UID, papeis: ["producao", "admin"], nome: "Cozinha (demo)" };
const clone = (valor) => JSON.parse(JSON.stringify(valor));

function pedido(sobre = {}) {
  return {
    id: "b3-pedido",
    numero: 4600,
    status: "recebido",
    tipo_entrega: "entrega",
    cliente_nome: "Cliente fictício",
    observacoes: "Sem cebola. Separar em duas bandejas de 50 unidades.",
    aceito_em_atendente: AGORA_TXT,
    aceito_por: UID,
    pedido_itens: [
      {
        id: "b3-item-1",
        nome: "Coxinha de Frango",
        quantidade: 100,
        produto_id: "b3-prod-1",
        produtos: { slug: "fritos" },
      },
    ],
    ...sobre,
  };
}

function reiniciar(pedidos) {
  R.limparProducaoMemoria();
  return R.inicializarProducaoMemoria(pedidos, AGORA_TXT);
}

function concluirRemessas(pedidoId) {
  let r = R.iniciarProducaoMemoria({ pedidoId, autor: AUTOR, agora: AGORA_TXT });
  if (!r.ok) return r;
  for (let i = 0; i < 10; i += 1) {
    const pendente = R.proximaRemessaMemoria(pedidoId);
    if (!pendente) break;
    r = R.finalizarRemessaMemoria({
      pedidoId,
      remessaId: pendente.id,
      quantidade: pendente.quantidade,
      autor: AUTOR,
      idemKey: `b3-concluir-${pedidoId}-${i}`,
      agora: AGORA_TXT,
    });
    if (!r.ok) return r;
  }
  return { ok: true };
}

function prontoParaDespacho(pedidoBase) {
  reiniciar([pedidoBase]);
  const id = pedidoBase.id;
  const andamento = concluirRemessas(id);
  if (!andamento.ok) return andamento;
  const estado = R.estadoProducaoMemoria(id);
  const conferencia = R.construirConferencia(estado.pedido, AUTOR);
  const conferida = R.conferirPedidoMemoria({ pedidoId: id, conferencia, autor: AUTOR, agora: AGORA_TXT });
  if (!conferida.ok) return conferida;
  return R.finalizarPedidoMemoria({ pedidoId: id, autor: AUTOR, agora: AGORA_TXT });
}

// ---------------------------------------------------------------------------
// 1. Aceite obrigatório: sem aceite não aparece nem inicia; com aceite, entra.
// ---------------------------------------------------------------------------
{
  ACE.limparAceitesMemoria();
  const semAceite = pedido({ id: "b3-01-sem", aceito_em_atendente: null });
  ok(
    R.pedidosVisiveisProducao([clone(semAceite)]).length === 0,
    "pedido recebido sem aceite não aparece na fila da cozinha",
  );
  reiniciar([clone(semAceite)]);
  const bloqueado = R.iniciarProducaoMemoria({ pedidoId: semAceite.id, autor: AUTOR, agora: AGORA_TXT });
  ok(
    !bloqueado.ok && bloqueado.codigo === "aceite-ausente",
    "iniciar sem aceite é bloqueado",
    bloqueado.detalhe,
  );

  const aceite = ACE.aceitarPedidoEmMemoria(
    [semAceite],
    ["atendente"],
    UID,
    semAceite.id,
    AGORA_TXT,
  );
  const fila = ACE.pedidosComAceiteMemoria([semAceite]);
  ok(aceite.resultado === "ok", "aceite da Central é registrado no adaptador B2");
  ok(
    R.pedidosVisiveisProducao(fila).some((p) => p.id === semAceite.id),
    "pedido aceito aparece na fila simulada sem mudar de status",
  );
  reiniciar(fila);
  const iniciado = R.iniciarProducaoMemoria({
    pedidoId: semAceite.id,
    autor: AUTOR,
    agora: AGORA_TXT,
  });
  ok(iniciado.ok, "pedido aceito pode iniciar preparo", iniciado.detalhe ?? "");
  ok(R.estadoProducaoMemoria(semAceite.id).pedido.status === "em_producao", "status passa a em_producao");
}

// ---------------------------------------------------------------------------
// 2. Agendados respeitam a janela operacional; "assim que possível" não some.
// ---------------------------------------------------------------------------
{
  const fora = pedido({
    id: "b3-02-fora",
    agendado_para: new Date(AGORA.getTime() + 180 * 60000).toISOString(),
  });
  reiniciar([fora]);
  const bloqueado = R.iniciarProducaoMemoria({ pedidoId: fora.id, autor: AUTOR, agora: AGORA_TXT });
  ok(!bloqueado.ok && bloqueado.codigo === "fora-da-janela", "agendado fora da janela não inicia", bloqueado.detalhe);

  const dentro = pedido({
    id: "b3-02-dentro",
    agendado_para: new Date(AGORA.getTime() + 60 * 60000).toISOString(),
  });
  reiniciar([dentro]);
  const iniciado = R.iniciarProducaoMemoria({ pedidoId: dentro.id, autor: AUTOR, agora: AGORA_TXT });
  ok(iniciado.ok, "agendado dentro da janela inicia", iniciado.detalhe ?? "");
  ok(
    R.pedidosVisiveisProducao([clone(dentro)]).length === 1,
    "pedido imediato/na janela continua visível",
  );
}

// ---------------------------------------------------------------------------
// 3. Prioridades aprovadas são preservadas pelo filtro de aceite.
// ---------------------------------------------------------------------------
{
  const atrasado = {
    id: "b3-03-atrasado",
    status: "recebido",
    created_at: new Date(AGORA.getTime() - 70 * 60000).toISOString(),
    tecnicoMin: 20,
    aceito_em_atendente: AGORA_TXT,
  };
  const normal = {
    id: "b3-03-normal",
    status: "recebido",
    created_at: new Date(AGORA.getTime() - 5 * 60000).toISOString(),
    tecnicoMin: 20,
    aceito_em_atendente: AGORA_TXT,
  };
  const visiveis = R.pedidosVisiveisProducao([normal, atrasado, { id: "b3-03-nao-aceite", status: "recebido" }]);
  ok(visiveis.length === 2, "filtro remove apenas não aceitos, sem reordenar a fila");
  const ordenada = M.ordenarFilaProducao(visiveis, AGORA);
  ok(
    ordenada[0]?.id === atrasado.id,
    "atrasado continua na frente do pedido normal (motor existente)",
    ordenada.map((p) => p.id).join(" > "),
  );
}

// ---------------------------------------------------------------------------
// 4. Remessas de até 50, sem misturar pedidos; sabores diferentes juntos ok.
// ---------------------------------------------------------------------------
{
  const p = pedido({
    id: "b3-04",
    pedido_itens: [
      { id: "i1", nome: "Coxinha de Frango", quantidade: 100, produto_id: "p1", produtos: { slug: "fritos" } },
      { id: "i2", nome: "Pastel de Queijo", quantidade: 50, produto_id: "p2", produtos: { slug: "pasteis" } },
    ],
  });
  const plano = R.planoRemessas(p);
  ok(plano.length === 3, "150 unidades geram 3 remessas", `${plano.length} remessas`);
  ok(plano.every((r) => r.quantidade === 50), "nenhuma remessa passa de 50 unidades");
  ok(plano.every((r) => r.pedidoId === p.id), "remessas não misturam pedidos");
  ok(R.validarPlanoRemessas(p, plano).valida, "plano conserva quantidades e sabores do pedido");

  const invalido = clone(plano);
  invalido[0].quantidade = 51;
  ok(!R.validarPlanoRemessas(p, invalido).valida, "plano com remessa acima de 50 é recusado");

  const misto = pedido({
    id: "b3-04-misto",
    pedido_itens: [
      { id: "i3", nome: "Coxinha de Frango", quantidade: 30, produto_id: "p3", produtos: { slug: "fritos" } },
      { id: "i4", nome: "Empada de Frango", quantidade: 20, produto_id: "p4", produtos: { slug: "assados" } },
    ],
  });
  const planoMisto = R.planoRemessas(misto);
  ok(
    planoMisto.length === 1 && planoMisto[0].itens.length === 2,
    "sabores/processos diferentes do MESMO pedido cabem na mesma remessa",
  );
  ok(
    planoMisto[0].itens.some((i) => i.processo === "frito") &&
      planoMisto[0].itens.some((i) => i.processo === "assado"),
    "fritos e assados são identificados na remessa",
  );
}

// ---------------------------------------------------------------------------
// 5. "Finalizar combo" registra UMA remessa; duplicada é bloqueada.
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-05" });
  reiniciar([p]);
  ok(R.iniciarProducaoMemoria({ pedidoId: p.id, autor: AUTOR, agora: AGORA_TXT }).ok, "preparo iniciado");
  const primeira = R.proximaRemessaMemoria(p.id);
  const r1 = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: primeira.id,
    quantidade: primeira.quantidade,
    autor: AUTOR,
    idemKey: "b3-05-1",
    agora: AGORA_TXT,
  });
  ok(r1.ok && r1.progresso.concluidas === 1 && r1.progresso.total === 2, "1ª remessa registrada (1/2)");
  ok(!r1.pedidoConcluido, "uma remessa NÃO conclui o pedido inteiro");
  ok(R.estadoProducaoMemoria(p.id).pedido.status === "em_producao", "pedido permanece em preparo");

  const duplicada = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: primeira.id,
    quantidade: primeira.quantidade,
    autor: AUTOR,
    idemKey: "b3-05-duplicada",
    agora: AGORA_TXT,
  });
  ok(!duplicada.ok && duplicada.codigo === "remessa-duplicada", "finalização duplicada é bloqueada", duplicada.detalhe);

  const segunda = R.proximaRemessaMemoria(p.id);
  const r2 = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: segunda.id,
    quantidade: segunda.quantidade,
    autor: AUTOR,
    idemKey: "b3-05-2",
    agora: AGORA_TXT,
  });
  ok(
    r2.ok && r2.pedidoConcluido && R.estadoProducaoMemoria(p.id).pedido.status === "em_producao",
    "última remessa conclui o planejamento, mas ainda não libera o pedido",
  );
}

// ---------------------------------------------------------------------------
// 6. Soma acima da quantidade do pedido/remessa é bloqueada.
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-06", pedido_itens: [{ id: "i1", nome: "Kibe de Carne", quantidade: 50, produto_id: "p1", produtos: { slug: "fritos" } }] });
  reiniciar([p]);
  R.iniciarProducaoMemoria({ pedidoId: p.id, autor: AUTOR, agora: AGORA_TXT });
  const remessa = R.proximaRemessaMemoria(p.id);
  const excesso = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: remessa.id,
    quantidade: remessa.quantidade + 1,
    autor: AUTOR,
    idemKey: "b3-06-excesso",
    agora: AGORA_TXT,
  });
  ok(!excesso.ok && excesso.codigo === "quantidade-invalida", "quantidade acima da remessa é recusada", excesso.detalhe);
  ok(R.progressoRemessas(p.id).unidadesConcluidas === 0, "tentativa inválida não consome unidades");
  const inexistente = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: "remessa-de-outro-pedido",
    quantidade: 50,
    autor: AUTOR,
    idemKey: "b3-06-inexistente",
    agora: AGORA_TXT,
  });
  ok(!inexistente.ok && inexistente.codigo === "inexistente", "remessa de outro pedido é recusada");
}

// ---------------------------------------------------------------------------
// 7. Conferência completa: todos os campos obrigatórios presentes e corretos.
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-07", tipo_entrega: "entrega" });
  reiniciar([p]);
  ok(concluirRemessas(p.id).ok, "remessas concluídas para conferência");
  const estado = R.estadoProducaoMemoria(p.id);
  const c = R.construirConferencia(estado.pedido, AUTOR);
  const valida = R.validarConferencia(c, estado.pedido);
  ok(valida.valida, "conferência completa é válida", valida.motivos.join("; "));
  ok(c.quantidadeTotal === 100 && Object.keys(c.porSabor).length === 1, "quantidade total e por sabor presentes");
  ok(c.fritos === 100 && c.assados === 0, "fritos/assados presentes");
  ok(c.embalagens.c100 === 1 && c.embalagens.c50 === 0, "embalagens calculadas");
  ok(c.observacoes === p.observacoes && c.modalidade === "entrega" && Boolean(c.responsavelId), "observações, modalidade e responsável presentes");

  const conferida = R.conferirPedidoMemoria({ pedidoId: p.id, conferencia: c, autor: AUTOR, agora: AGORA_TXT });
  ok(conferida.ok, "conferência é registrada", conferida.detalhe ?? "");
  const pronta = R.finalizarPedidoMemoria({ pedidoId: p.id, autor: AUTOR, agora: AGORA_TXT });
  ok(pronta.ok && pronta.canal === "caixa", "pedido de entrega fica pronto para o caixa", pronta.detalhe ?? "");
  ok(R.estadoProducaoMemoria(p.id).pedido.status === "pronto", "status final é pronto");
  ok(Boolean(R.estadoProducaoMemoria(p.id).pronto_em), "pronto_em registrado");
}

// ---------------------------------------------------------------------------
// 8. Conferência incompleta bloqueia com mensagem clara (campo por campo).
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-08", tipo_entrega: "retirada" });
  reiniciar([p]);
  concluirRemessas(p.id);
  const estado = R.estadoProducaoMemoria(p.id);
  const base = R.construirConferencia(estado.pedido, AUTOR);
  const casos = [
    [null, "conferência ausente"],
    [{ ...base, quantidadeTotal: 99 }, "quantidade total"],
    [{ ...base, porSabor: {} }, "sabor"],
    [{ ...base, fritos: 0 }, "fritos"],
    [{ ...base, assados: 20 }, "assados"],
    [{ ...base, embalagens: { c100: 0, c50: 0, avulsas: 0 } }, "embalagens"],
    [{ ...base, observacoes: "observação diferente" }, "observações"],
    [{ ...base, modalidade: "entrega" }, "modalidade"],
    [{ ...base, responsavelId: "" }, "responsável"],
  ];
  for (const [conferencia, termo] of casos) {
    const r = R.conferirPedidoMemoria({ pedidoId: p.id, conferencia, autor: AUTOR, agora: AGORA_TXT });
    ok(
      !r.ok &&
        r.codigo === "conferencia-incompleta" &&
        r.detalhe.startsWith("conferência obrigatória incompleta") &&
        r.detalhe.includes(termo),
      `conferência sem ${termo} é bloqueada com mensagem clara`,
      r.detalhe,
    );
  }
  const semConferencia = R.finalizarPedidoMemoria({ pedidoId: p.id, autor: AUTOR, agora: AGORA_TXT });
  ok(!semConferencia.ok && semConferencia.codigo === "conferencia-incompleta", "pedido não avança sem conferência");
}

// ---------------------------------------------------------------------------
// 9. Entrega: avisar caixa exige remessas + conferência; não toca motoboy/rota.
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-09", tipo_entrega: "entrega", motoboy_id: null });
  const pronta = prontoParaDespacho(p);
  ok(pronta.ok, "entrega pronta para despacho", pronta.detalhe ?? "");
  const r = R.despacharPedidoMemoria({ pedidoId: p.id, canal: "caixa", autor: AUTOR, agora: AGORA_TXT });
  const estado = R.estadoProducaoMemoria(p.id);
  ok(r.ok && !r.jaAvisado && r.tipo === L.TIPO_AVISO_CAIXA, "aviso ao caixa registrado uma vez");
  ok(estado.pedido.status === "pronto", "entrega permanece pronta (disponível na Central)");
  ok(!estado.pedido.motoboy_id, "nenhum motoboy é atribuído");
  ok(!["aguardando_motoboy", "em_rota", "entregue"].includes(estado.pedido.status), "não inicia rota nem marca entregue");
  ok(estado.avisos.length === 1 && estado.avisos[0].canal === "caixa", "aviso é do canal caixa");
  const repetido = R.despacharPedidoMemoria({ pedidoId: p.id, canal: "caixa", autor: AUTOR, agora: AGORA_TXT });
  ok(repetido.ok && repetido.jaAvisado && estado.avisos.length === 1, "aviso repetido não duplica");
  const errado = R.despacharPedidoMemoria({ pedidoId: p.id, canal: "retirada", autor: AUTOR, agora: AGORA_TXT });
  ok(!errado.ok && errado.codigo === "modalidade-invalida", "entrega não usa liberação de retirada");
}

// ---------------------------------------------------------------------------
// 10. Retirada: libera somente retirada; não confirma entrega nem usa motoboy.
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-10", tipo_entrega: "retirada", motoboy_id: null });
  const pronta = prontoParaDespacho(p);
  ok(pronta.ok && pronta.canal === "retirada", "retirada pronta para liberação", pronta.detalhe ?? "");
  const r = R.despacharPedidoMemoria({ pedidoId: p.id, canal: "retirada", autor: AUTOR, agora: AGORA_TXT });
  const estado = R.estadoProducaoMemoria(p.id);
  ok(r.ok && !r.jaAvisado && r.tipo === L.TIPO_AVISO_RETIRADA, "liberação de retirada registrada uma vez");
  ok(estado.pedido.status === "pronto", "status continua 'Pronto para retirada'");
  ok(!estado.pedido.retirado_em, "retirada não é confirmada automaticamente");
  ok(!estado.pedido.motoboy_id && estado.avisos.every((a) => a.canal === "retirada"), "sem motoboy e sem aviso de caixa");
  const repetido = R.despacharPedidoMemoria({ pedidoId: p.id, canal: "retirada", autor: AUTOR, agora: AGORA_TXT });
  ok(repetido.ok && repetido.jaAvisado && estado.avisos.length === 1, "liberação repetida não duplica");
  const errado = R.despacharPedidoMemoria({ pedidoId: p.id, canal: "caixa", autor: AUTOR, agora: AGORA_TXT });
  ok(!errado.ok && errado.codigo === "modalidade-invalida", "retirada não usa aviso de caixa");
}

// ---------------------------------------------------------------------------
// 11. Reserva/consumo: rastreio por pedido+remessa, idempotência, excesso,
//     cancelamento e inconsistências — tudo em memória, sem estoque real.
// ---------------------------------------------------------------------------
{
  const p = pedido({ id: "b3-11" });
  reiniciar([p]);
  R.iniciarProducaoMemoria({ pedidoId: p.id, autor: AUTOR, agora: AGORA_TXT });
  const remessa = R.proximaRemessaMemoria(p.id);
  const r = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: remessa.id,
    quantidade: remessa.quantidade,
    autor: AUTOR,
    idemKey: "b3-11-1",
    agora: AGORA_TXT,
  });
  ok(r.ok, "consumo da 1ª remessa registrado");
  let estado = R.estadoProducaoMemoria(p.id);
  ok(
    estado.reservas.length === 1 &&
      estado.reservas[0].consumido === 50 &&
      estado.reservas[0].status === "ativa",
    "reserva parcialmente consumida permanece ativa",
  );
  ok(
    estado.consumos.length === 1 &&
      estado.consumos[0].pedidoId === p.id &&
      estado.consumos[0].remessaId === remessa.id &&
      estado.consumos[0].idemKey === "b3-11-1",
    "consumo rastreia pedido, remessa e chave de idempotência",
  );

  const segunda = R.proximaRemessaMemoria(p.id);
  const duplicado = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: segunda.id,
    quantidade: segunda.quantidade,
    autor: AUTOR,
    idemKey: "b3-11-1",
    agora: AGORA_TXT,
  });
  ok(!duplicado.ok && duplicado.codigo === "consumo-duplicado", "mesma chave não consome duas vezes", duplicado.detalhe);
  ok(R.inconsistenciasProducaoMemoria().length === 0, "sem inconsistências após bloqueios");

  estado = R.estadoProducaoMemoria(p.id);
  estado.reservas[0].quantidade = 40;
  const excesso = R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: segunda.id,
    quantidade: segunda.quantidade,
    autor: AUTOR,
    idemKey: "b3-11-excesso",
    agora: AGORA_TXT,
  });
  ok(!excesso.ok && excesso.codigo === "acima-da-reserva", "consumo acima do reservado é bloqueado", excesso.detalhe);

  const cancelado = pedido({ id: "b3-11-cancelado" });
  reiniciar([cancelado]);
  R.cancelarPedidoMemoria({ pedidoId: cancelado.id, autor: AUTOR, motivo: "demo", agora: AGORA_TXT });
  const c = R.estadoProducaoMemoria(cancelado.id);
  ok(c.reservas.every((res) => res.status === "liberada"), "cancelamento libera reservas não consumidas");
  const aposCancelar = R.iniciarProducaoMemoria({ pedidoId: cancelado.id, autor: AUTOR, agora: AGORA_TXT });
  ok(!aposCancelar.ok && aposCancelar.codigo === "cancelado", "pedido cancelado não avança");

  c.reservas[0].consumido = c.reservas[0].quantidade + 1;
  ok(R.inconsistenciasProducaoMemoria().some((m) => m.includes("acima da reserva")), "inconsistência é detectada na auditoria local");
}

// ---------------------------------------------------------------------------
// 12. Isolamento B1 e preservação do layout/funcionalidades aprovadas.
// ---------------------------------------------------------------------------
{
  I.ativarBarreiraLocal();
  I.limparTentativas();
  ACE.limparAceitesMemoria();
  const p = pedido({ id: "b3-12" });
  reiniciar([p]);
  ok(R.iniciarProducaoMemoria({ pedidoId: p.id, autor: AUTOR, agora: AGORA_TXT }).ok, "fluxo completo roda sem rede");
  const pendente = R.proximaRemessaMemoria(p.id);
  R.finalizarRemessaMemoria({
    pedidoId: p.id,
    remessaId: pendente.id,
    quantidade: pendente.quantidade,
    autor: AUTOR,
    idemKey: "b3-12-1",
    agora: AGORA_TXT,
  });
  ok(I.tentativasIsolamento().length === 0, "nenhuma tentativa de rede/geolocalização/push foi bloqueada", JSON.stringify(I.tentativasIsolamento()));
  I.desativarIsolamentoLocal();

  const fonte = (arquivo) => readFileSync(path.resolve(arquivo), "utf8");
  const rota = fonte("src/routes/producao.tsx");
  const previa = fonte("src/routes/preview-l2-producao.tsx");
  const pkg = fonte("package.json");
  const exigidos = [
    "pedidosComAceiteMemoria(",
    "modoSimuladoLocal",
    "preview && !ehModoDemo()",
    "iniciarProducaoMemoria(",
    "finalizarRemessaMemoria(",
    "conferirPedidoMemoria(",
    "finalizarPedidoMemoria(",
    "despacharPedidoMemoria(",
    "▶ Iniciar preparo",
    "Finalizar combo",
    "🔔 Avisar caixa",
    "🏪 Liberar retirada",
    "Kanban de produção",
    "ERP_COLORS",
    "lg:grid-cols-3",
  ];
  for (const trecho of exigidos) ok(rota.includes(trecho), `rota preserva/integra: ${trecho}`);
  ok(
    !rota.includes("Remessa {Number(p.progresso_remessas"),
    "nenhuma linha de progresso visual foi adicionada ao cartão aprovado",
  );
  ok(
    previa.includes("nenhum status é gravado") && !previa.includes("nenhum status é alterado"),
    "banner demonstrativo continua tecnicamente correto na mesma posição/aparência",
  );
  ok(pkg.includes('"teste:producao-remessas"'), "suíte B3 registrada no package.json");
  ok(
    !/mudarStatus\([^)]*aguardando_motoboy/.test(rota) &&
      !/status:\s*["']entregue["']/.test(rota) &&
      !/motoboy_id\s*:/.test(rota),
    "cozinha não atribui motoboy nem marca entrega",
  );
}

if (falhas > 0) {
  console.error(`PRODUÇÃO LOCAL: ${falhas} verificação(ões) falhando.`);
  process.exit(1);
}
console.log("PRODUÇÃO LOCAL: 12 cenários e verificações estáticas passaram. Sem homologação operacional.");
