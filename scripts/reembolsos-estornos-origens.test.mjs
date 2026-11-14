// Testes R2-A — Origens das solicitações de reembolso.
// Uso: node scripts/reembolsos-estornos-origens.test.mjs
// Reutiliza 100% das regras da R1 (dados.ts): validarNovaOperacao, criarOperacao,
// aplicarAcao, filtrarOperacoes. Nenhuma regra financeira nova é criada aqui.
import assert from 'node:assert/strict';
import {
  LABEL_STATUS,
  OPERACOES_INICIAIS,
  RESPONSAVEL_AUTORIZADO,
  aplicarAcao,
  criarOperacao,
  ehTerminal,
  filtrarOperacoes,
  validarNovaOperacao,
} from '../src/components/reembolsos-estornos/dados.ts';
import {
  CLIENTE_DEMO,
  FORNECEDORES_DEMO,
  FUNCIONARIOS_DEMO,
  MOTOBYS_DEMO,
  ORIGEM_ATENDENTE,
  ORIGEM_CLIENTE,
  ORIGEM_COMPRAS,
  ORIGEM_FUNCIONARIO,
  ORIGEM_MOTOBOY,
  ORIGENS_R2,
  PEDIDOS_AUTORIZADOS_CLIENTE,
  dadosAtendente,
  dadosCliente,
  dadosFornecedor,
  dadosFuncionario,
  dadosMotoboy,
  pedidoAutorizadoCliente,
} from '../src/components/reembolsos-estornos/origens-dados.ts';

let passos = 0;
function ok(msg) { passos++; console.log('  ✓ ' + msg); }

// Lista viva da Central: fixtures da R1 + solicitações criadas pelas origens.
const OPS = () => OPERACOES_INICIAIS.map((o) => ({ ...o }));

// ---------------------------------------------------------------------------
// 1. Catálogo das origens — cinco setores, cada um com seu rótulo
// ---------------------------------------------------------------------------
assert.equal(ORIGENS_R2.length, 5);
assert.deepEqual(
  [...new Set(ORIGENS_R2)].sort(),
  [ORIGEM_ATENDENTE, ORIGEM_CLIENTE, ORIGEM_COMPRAS, ORIGEM_FUNCIONARIO, ORIGEM_MOTOBOY].sort(),
);
ok('cinco origens cadastradas (Cliente, Atendente, Motoboy, Funcionários, Compras) sem duplicidade');

// ---------------------------------------------------------------------------
// 2. Cliente só solicita em pedido autorizado (contexto de pedido)
// ---------------------------------------------------------------------------
assert.ok(pedidoAutorizadoCliente('#4605'), 'pedido #4605 autorizado');
assert.equal(pedidoAutorizadoCliente('#4605').valorOriginal, 95);
assert.equal(pedidoAutorizadoCliente('#9999'), null, 'pedido fora da lista não é autorizado');
assert.equal(pedidoAutorizadoCliente(''), null);
ok('contexto de pedido autorizado: #4605 permitido, #9999/"" bloqueados antes da criação');

// ---------------------------------------------------------------------------
// 3. Cliente — Meus Pedidos: criação com motivo, valor e vínculo
// ---------------------------------------------------------------------------
const pedidoDemo = pedidoAutorizadoCliente('#4605');
const dadosC = dadosCliente({
  pedido: pedidoDemo,
  problema: 'entrega',
  valor: 30,
  motivo: 'Entrega chegou com um item a menos',
});
assert.equal(dadosC.tipo, 'estorno_cliente');
assert.equal(dadosC.origem, ORIGEM_CLIENTE);
assert.equal(dadosC.pessoa, CLIENTE_DEMO);
assert.equal(dadosC.referenciaTipo, 'Pedido');
assert.equal(dadosC.referencia, '#4605');
assert.equal(dadosC.valorOriginal, 95);
assert.match(dadosC.motivo, /Problema com entrega: Entrega chegou com um item a menos/);
assert.equal(validarNovaOperacao(OPS(), dadosC), null, 'estorno parcial de cliente válido');
const r3 = criarOperacao(OPS(), dadosC);
assert.ok(r3.ok);
assert.equal(r3.operacao.id, 'RE-0011');
assert.equal(r3.operacao.status, 'solicitado');
assert.equal(r3.operacao.alcance, 'parcial');
assert.equal(r3.operacao.formaPagamentoOriginal, 'Cartão de crédito');
ok('Cliente solicita em pedido autorizado: RE-0011 criada com origem, vínculo #4605 e motivo do problema');

// ---------------------------------------------------------------------------
// 4. Cliente — valores inválidos e acima do limite do pedido
// ---------------------------------------------------------------------------
assert.match(
  validarNovaOperacao(OPS(), { ...dadosC, valor: 0 }) ?? '',
  /Informe um valor maior que zero/,
);
assert.match(
  validarNovaOperacao(OPS(), { ...dadosC, valor: -5 }) ?? '',
  /Informe um valor maior que zero/,
);
assert.match(
  validarNovaOperacao(OPS(), { ...dadosC, valor: 120 }) ?? '',
  /maior que o valor original do pedido/,
);
ok('valores inválidos rejeitados: zero, negativo e acima do valor original (R$ 120 > R$ 95)');

// ---------------------------------------------------------------------------
// 5. Cliente — consulta do andamento pela origem
// ---------------------------------------------------------------------------
const ops5 = OPS();
const r5 = criarOperacao(ops5, dadosC);
assert.ok(r5.ok);
ops5.push(r5.operacao);
const minhas = filtrarOperacoes(ops5, {
  periodo: 'todos', tipo: 'estorno_cliente', status: 'todos', responsavel: 'todos',
  origem: 'todos', busca: CLIENTE_DEMO,
});
assert.equal(minhas.length, 1);
assert.equal(minhas[0].id, 'RE-0011');
assert.equal(LABEL_STATUS[minhas[0].status], 'Solicitado');
ok('consulta do andamento: busca pela identidade fictícia encontra a solicitação e o status');

// ---------------------------------------------------------------------------
// 6. Central da Atendente: registra motivo do cliente e encaminha ao responsável
// ---------------------------------------------------------------------------
const pedidoAt = pedidoAutorizadoCliente('#4608');
const dadosA = dadosAtendente({
  pedido: pedidoAt,
  motivoCliente: 'Cobrança em duplicidade no cartão',
  valor: 210,
});
assert.equal(dadosA.origem, ORIGEM_ATENDENTE);
assert.equal(dadosA.solicitante, 'Central da Atendente');
const ops6 = OPS();
const r6 = criarOperacao(ops6, dadosA);
assert.ok(r6.ok);
const encaminhada = aplicarAcao(r6.operacao, { tipo: 'enviar_aprovacao', usuario: 'Central da Atendente' });
assert.ok(encaminhada.ok);
assert.equal(encaminhada.operacao.status, 'aguardando_aprovacao');
assert.equal(encaminhada.operacao.autorizadoPor, RESPONSAVEL_AUTORIZADO);
assert.ok(encaminhada.operacao.historico.some((e) => e.acao === 'Envio para aprovação'));
assert.ok(encaminhada.operacao.historico.some((e) => e.detalhe?.includes(RESPONSAVEL_AUTORIZADO)));
ok('Atendente: solicitação RE criada como “Solicitado” e encaminhada para aprovação do responsável autorizado');

// ---------------------------------------------------------------------------
// 7. Duplicidade de estorno total — segunda solicitação do mesmo pedido bloqueada
// ---------------------------------------------------------------------------
const ops7 = OPS();
const r7 = criarOperacao(ops7, dadosA);
assert.ok(r7.ok);
ops7.push(r7.operacao);
const segundoTotal = validarNovaOperacao(
  ops7,
  dadosCliente({ pedido: pedidoAt, problema: 'cobranca', valor: 210, motivo: 'Segunda tentativa' }),
);
assert.match(segundoTotal ?? '', /segundo estorno total bloqueado/);
ok('duplicidade (estorno total): segundo estorno total do pedido #4608 bloqueado pela regra da R1');

// ---------------------------------------------------------------------------
// 8. App Motoboy: turno, dinheiro próprio/despesa autorizada, motivo e valor
// ---------------------------------------------------------------------------
const dadosM = dadosMotoboy({
  motoboy: MOTOBYS_DEMO[0],
  vinculoTipo: 'Turno',
  vinculo: 'Turno Noite (12/04)',
  gasto: 'Troco pago com dinheiro próprio',
  valor: 25.5,
  motivo: 'Troco da entrega da Rua das Flores',
});
assert.equal(dadosM.tipo, 'reembolso_motoboy');
assert.equal(dadosM.origem, ORIGEM_MOTOBOY);
assert.equal(dadosM.turno, 'Turno Noite (12/04)');
assert.equal(dadosM.referenciaTipo, 'Turno');
assert.match(dadosM.motivo, /^Troco pago com dinheiro próprio:/);
const ops8 = OPS();
const r8 = criarOperacao(ops8, dadosM);
assert.ok(r8.ok);
assert.equal(r8.operacao.valorSolicitado, 25.5);
assert.equal(r8.operacao.solicitante, MOTOBYS_DEMO[0]);
ok('Motoboy solicita reembolso de troco do turno com origem, vínculo e motivo registrados');

// ---------------------------------------------------------------------------
// 9. Duplicidade motoboy: mesma pessoa + referência + valor em aberto bloqueada
// ---------------------------------------------------------------------------
const duplicadoM = validarNovaOperacao([...ops8, r8.operacao], {
  ...dadosM,
  vinculoTipo: 'Rota/Entrega',
  vinculo: 'Turno Noite (12/04)',
});
assert.match(duplicadoM ?? '', /possível pagamento duplicado bloqueado/);
ok('duplicidade (motoboy): mesma pessoa/referência/valor em aberto bloqueada pela R1');

// ---------------------------------------------------------------------------
// 10. Funcionários: compra/despesa, valor adiantado e justificativa
// ---------------------------------------------------------------------------
const dadosF = dadosFuncionario({
  funcionario: FUNCIONARIOS_DEMO[0],
  referenciaTipo: 'Compra',
  referencia: 'Compra emergencial #1052',
  tipoGasto: 'Insumos',
  valor: 42.9,
  justificativa: 'Fermento comprado fora do horário do fornecedor',
});
assert.equal(dadosF.tipo, 'reembolso_funcionario');
assert.equal(dadosF.origem, ORIGEM_FUNCIONARIO);
assert.match(dadosF.motivo, /^Insumos:/);
const ops10 = OPS();
const r10 = criarOperacao(ops10, dadosF);
assert.ok(r10.ok);
const duplicadoF = validarNovaOperacao([...ops10, r10.operacao], dadosF);
assert.match(duplicadoF ?? '', /possível pagamento duplicado bloqueado/);
ok('Funcionário solicita reembolso de compra adiantada; duplicidade igual bloqueada pela R1');

// ---------------------------------------------------------------------------
// 11. Compras/Fornecedores: devolução/crédito com resolução correta
// ---------------------------------------------------------------------------
const dadosFo = dadosFornecedor({
  fornecedor: FORNECEDORES_DEMO[1],
  compra: 'Compra #1050',
  resolucao: 'credito_futuro',
  valor: 60,
  motivo: 'Embalagens em formato errado',
});
assert.equal(dadosFo.tipo, 'credito_fornecedor');
assert.equal(dadosFo.origem, ORIGEM_COMPRAS);
assert.equal(dadosFo.resolucao, 'credito_futuro');
const r11a = criarOperacao(OPS(), dadosFo);
assert.ok(r11a.ok);
assert.equal(r11a.operacao.fiscal, 'nao_aplicavel', 'crédito futuro: sem exigência de documento');
const r11b = criarOperacao(OPS(), { ...dadosFo, resolucao: 'dinheiro', compra: 'Compra #1051' });
assert.ok(r11b.ok);
assert.equal(r11b.operacao.fiscal, 'aguardando_documento', 'devolução em dinheiro exige documento');
ok('Compras/Fornecedores: crédito futuro marca fiscal “não aplicável”; devolução em dinheiro exige documento');

// ---------------------------------------------------------------------------
// 12. Restrição de aprovação: solicitante NUNCA aprova
// ---------------------------------------------------------------------------
const ops12 = OPS();
const r12 = criarOperacao(ops12, dadosM);
assert.ok(r12.ok);
const enviada = aplicarAcao(r12.operacao, { tipo: 'enviar_aprovacao', usuario: 'Supervisão' });
assert.ok(enviada.ok);
const tentativaMotoboy = aplicarAcao(enviada.operacao, {
  tipo: 'aprovar', usuario: `${MOTOBYS_DEMO[1]} (motoboy)`, autorizado: false,
});
assert.equal(tentativaMotoboy.ok, false);
assert.match(tentativaMotoboy.erro ?? '', /Somente um responsável autorizado pode aprovar/);
const tentativaFuncionario = aplicarAcao(enviada.operacao, {
  tipo: 'recusar', usuario: FUNCIONARIOS_DEMO[1], autorizado: false, motivo: 'Quero aprovar eu mesmo',
});
assert.equal(tentativaFuncionario.ok, false);
assert.match(tentativaFuncionario.erro ?? '', /Somente um responsável autorizado pode recusar/);
ok('restrição de aprovação: motoboy e funcionário não aprovam/recusam — só o responsável autorizado');

// ---------------------------------------------------------------------------
// 13. Fluxo completo de uma origem até a conclusão (regra da R1, sem saltos)
// ---------------------------------------------------------------------------
let op = r12.operacao;
op = aplicarAcao(op, { tipo: 'enviar_aprovacao', usuario: 'Supervisão' }).operacao;
const aprovada = aplicarAcao(op, { tipo: 'aprovar', usuario: RESPONSAVEL_AUTORIZADO, autorizado: true });
assert.ok(aprovada.ok);
op = aprovada.operacao;
assert.equal(op.status, 'aprovado');
assert.equal(op.aprovador, RESPONSAVEL_AUTORIZADO);
op = aplicarAcao(op, { tipo: 'enviar_pagamento', usuario: RESPONSAVEL_AUTORIZADO }).operacao;
assert.equal(op.status, 'aguardando_pagamento');
const paga = aplicarAcao(op, { tipo: 'registrar_pagamento', usuario: RESPONSAVEL_AUTORIZADO, referencia: 'PIX-DEMO-ORIGEM' });
assert.ok(paga.ok);
op = paga.operacao;
assert.equal(op.financeiro, 'pago');
assert.equal(op.status, 'pago_devolvido');
const segundaBaixa = aplicarAcao(op, { tipo: 'registrar_pagamento', usuario: RESPONSAVEL_AUTORIZADO, referencia: 'PIX-OUTRA' });
assert.equal(segundaBaixa.ok, false);
assert.match(segundaBaixa.erro ?? '', /pagamento duplicado bloqueado/);
op = aplicarAcao(op, { tipo: 'concluir', usuario: 'Contador (demo)' }).operacao;
assert.equal(op.status, 'concluido');
assert.ok(ehTerminal(op.status));
ok('fluxo completo da origem: solicitado → aprovado → pagamento único → concluído (regras da R1, sem operação real)');

// ---------------------------------------------------------------------------
// 14. Solicitações das cinco origens visíveis na Central (mesma sessão)
// ---------------------------------------------------------------------------
const ops14 = OPS();
const criadas = [];
for (const dados of [dadosC, dadosA, dadosM, dadosF, dadosFo]) {
  const r = criarOperacao(ops14, dados);
  assert.ok(r.ok, 'criação por origem');
  ops14.push(r.operacao);
  criadas.push(r);
}
const origensCriadas = criadas.map((r) => r.operacao.origem);
assert.deepEqual(new Set(origensCriadas), new Set(ORIGENS_R2));
for (const origem of ORIGENS_R2) {
  const visiveis = filtrarOperacoes(ops14, {
    periodo: 'todos', tipo: 'todos', status: 'todos', responsavel: 'todos', origem, busca: '',
  });
  assert.equal(visiveis.length, 1, `uma solicitação visível na Central para ${origem}`);
}
const ids = criadas.map((r) => r.operacao.id);
assert.ok(ids.every((id) => /^RE-\d{4}$/.test(id)), `IDs sequenciais ${ids.join(', ')}`);
assert.equal(new Set(ids).size, ids.length, 'IDs únicos');
ok('solicitações das cinco origens aparecem na Central R1 da mesma sessão, com origem e ID próprios');

console.log(`\nR2-A origens: ${passos} verificações OK`);
