import assert from 'node:assert/strict';
import {
  OPERACOES_INICIAIS,
  TRANSICOES,
  STATUS_FLUXO,
  aplicarAcao,
  brl,
  calcularIndicadores,
  criarOperacao,
  devolvidoDoPedido,
  ehTerminal,
  filtrarOperacoes,
  formatarDataHora,
  podeTransicionar,
  statusFinanceiroDoPagamento,
  validarNovaOperacao,
} from '../src/components/reembolsos-estornos/dados.ts';

const RE = RESPONSAVEL();

function RESPONSAVEL() {
  // Responsável autorizado demonstrativo (mesma string usada em dados.ts).
  return 'Neia (dono)';
}

let passos = 0;
function ok(msg) { passos++; console.log('  ✓ ' + msg); }

// ---------------------------------------------------------------------------
// 1. Fluxo de 11 estados — sem saltos incoerentes
// ---------------------------------------------------------------------------
assert.equal(STATUS_FLUXO.length, 11);
for (const s of STATUS_FLUXO) assert.ok(Array.isArray(TRANSICOES[s]), `transições de ${s}`);
ok('11 estados com mapa de transições completo');

// Saltos incoerentes bloqueados: rascunho NÃO vai direto a aprovado/pago/concluido.
assert.equal(podeTransicionar('rascunho', 'aprovado'), false);
assert.equal(podeTransicionar('rascunho', 'pago_devolvido'), false);
assert.equal(podeTransicionar('solicitado', 'pago_devolvido'), false);
assert.equal(podeTransicionar('em_analise', 'aprovado'), false); // precisa passar por aguardando_aprovacao
assert.equal(podeTransicionar('aprovado', 'concluido'), false);  // precisa de pagamento
assert.equal(podeTransicionar('aguardando_pagamento', 'concluido'), false); // precisa pagar antes
assert.equal(podeTransicionar('recusado', 'aprovado'), false);   // terminal não reaproveita
ok('saltos incoerentes bloqueados (rascunho→aprovado, análise→aprovado, aprovado→concluído, recusado→aprovado)');

// Terminais não têm saída.
for (const t of ['concluido', 'recusado', 'cancelado']) {
  assert.ok(ehTerminal(t));
  assert.equal(TRANSICOES[t].length, 0);
}
ok('estados terminais (concluído, recusado, cancelado) sem transições');

// ---------------------------------------------------------------------------
// 2. Estorno total e parcial — criação + validação
// ---------------------------------------------------------------------------
const pedido = '#4500';
const base = {
  tipo: 'estorno_cliente',
  pessoa: 'Cliente Teste',
  referenciaTipo: 'Pedido',
  referencia: pedido,
  valorOriginal: 200,
  motivo: 'Teste automatizado',
  formaPagamentoOriginal: 'Pix',
  origem: 'Atendimento',
  solicitante: 'Teste',
};

// Estorno total permitido.
const r1 = validarNovaOperacao(OPERACOES_INICIAIS, { ...base, valor: 200 });
assert.equal(r1, null);
ok('estorno total de R$ 200 sobre pedido de R$ 200 permitido');

// Estorno parcial permitido.
assert.equal(validarNovaOperacao(OPERACOES_INICIAIS, { ...base, valor: 50 }), null);
ok('estorno parcial permitido');

// Ultrapassar o valor original.
assert.match(
  validarNovaOperacao(OPERACOES_INICIAIS, { ...base, valor: 250 }) ?? '',
  /maior que o valor original/,
);
ok('estorno acima do valor original recusado com mensagem clara');

// ---------------------------------------------------------------------------
// 3. Duplicidade — segundo estorno total, soma de parciais, valor disponível
// ---------------------------------------------------------------------------
const estornoTotalPago = {
  ...criarOperacao([], { ...base, valor: 200 }).operacao,
  financeiro: 'devolvido',
};

// Segundo estorno TOTAL do mesmo pedido: bloqueado.
assert.match(
  validarNovaOperacao([estornoTotalPago], { ...base, valor: 1 }) ?? '',
  /segundo estorno total bloqueado/,
);
ok('segundo estorno total do mesmo pedido bloqueado');

// Parciais não podem somar acima do permitido (100 já devolvido de 200).
const parcialPago = {
  ...criarOperacao([], { ...base, valor: 100 }).operacao,
  status: 'pago_devolvido',
  financeiro: 'devolvido',
};
assert.equal(devolvidoDoPedido([parcialPago], pedido), 100);
assert.match(
  validarNovaOperacao([parcialPago], { ...base, valor: 101 }) ?? '',
  /ultrapassa o valor disponível/,
);
ok('parcial acima do restante disponível (200 - 100 devolvidos) bloqueado');

// Parciais exatamente até o limite somam ok: 100 devolvidos + 100 novo = 200.
assert.equal(validarNovaOperacao([parcialPago], { ...base, valor: 100 }), null);
ok('soma de parciais até o limite (100+100=200) permitida');

// Parciais em andamento também ocupam o limite.
const parcialAndamento = criarOperacao([], { ...base, valor: 100 }).operacao;
assert.match(
  validarNovaOperacao([parcialAndamento], { ...base, valor: 150 }) ?? '',
  /ultrapassa o valor permitido/,
);
ok('parciais em andamento entram na conta do limite (100+150>200)');

// ---------------------------------------------------------------------------
// 4. Duplicidade — pagamento duplicado e segundo registro financeiro
// ---------------------------------------------------------------------------
const opAprovada = (() => {
  const criada = criarOperacao(OPERACOES_INICIAIS, { ...base, valor: 80, referencia: '#4501' });
  assert.ok(criada.ok);
  let op = criada.operacao;
  op = aplicarAcao(op, { tipo: 'enviar_aprovacao', usuario: 'Supervisão' }).operacao;
  op = aplicarAcao(op, { tipo: 'aprovar', usuario: RE, autorizado: true }).operacao;
  op = aplicarAcao(op, { tipo: 'enviar_pagamento', usuario: RE }).operacao;
  const pago = aplicarAcao(op, { tipo: 'registrar_pagamento', usuario: RE, referencia: 'PIX-1' });
  assert.ok(pago.ok);
  return pago.operacao;
})();
assert.equal(opAprovada.status, 'pago_devolvido');
assert.equal(opAprovada.financeiro, 'devolvido');
ok('fluxo completo aprovado → aguardando pagamento → devolvido em uma operação');

const pagDuplicado = aplicarAcao(opAprovada, { tipo: 'registrar_pagamento', usuario: RE, referencia: 'PIX-2' });
assert.equal(pagDuplicado.ok, false);
assert.match(pagDuplicado.erro, /pagamento duplicado bloqueado/);
ok('segundo pagamento da mesma solicitação bloqueado ("pagamento duplicado bloqueado")');

// Concluir exige pagamento registrado — sem ele, nada é gravado duas vezes.
const opNaoPaga = {
  ...criarOperacao([], { ...base, valor: 30, referencia: '#4503' }).operacao,
  status: 'aguardando_comprovacao',
  financeiro: 'pendente',
};
const fim1 = aplicarAcao(opNaoPaga, { tipo: 'concluir', usuario: RE });
assert.equal(fim1.ok, false);
assert.match(fim1.erro, /exige pagamento/);
const fim2 = aplicarAcao(opAprovada, { tipo: 'concluir', usuario: RE });
assert.ok(fim2.ok);
assert.equal(fim2.operacao.status, 'concluido');
assert.equal(fim2.operacao.financeiro, 'devolvido'); // um único registro financeiro
ok('conclusão exige pagamento previamente registrado (sem segundo registro financeiro)');

// Pagamento define financeiro conforme o tipo: motoboy/funcionário = pago; cliente/fornecedor = devolvido.
assert.equal(statusFinanceiroDoPagamento('reembolso_motoboy'), 'pago');
assert.equal(statusFinanceiroDoPagamento('reembolso_funcionario'), 'pago');
assert.equal(statusFinanceiroDoPagamento('estorno_cliente'), 'devolvido');
assert.equal(statusFinanceiroDoPagamento('credito_fornecedor'), 'devolvido');
ok('statusFinanceiroDoPagamento: reembolso=pago, estorno/devolução=devolvido');

// ---------------------------------------------------------------------------
// 5. Aprovação — somente responsável autorizado
// ---------------------------------------------------------------------------
const aguardando = {
  ...criarOperacao([], { ...base, valor: 60, referencia: '#4504' }).operacao,
  status: 'aguardando_aprovacao',
};
const negada = aplicarAcao(aguardando, { tipo: 'aprovar', usuario: 'Estagiário', autorizado: false });
assert.equal(negada.ok, false);
assert.match(negada.erro, /responsável autorizado/);
ok('aprovação por não autorizado bloqueada');

const aprovada = aplicarAcao(aguardando, { tipo: 'aprovar', usuario: RE, autorizado: true });
assert.ok(aprovada.ok);
assert.equal(aprovada.operacao.status, 'aprovado');
assert.equal(aprovada.operacao.aprovador, RE);
assert.equal(aprovada.operacao.valorAprovado, 60);
ok('aprovação pelo responsável autorizado registrada (quem, quando, valor)');

// Recusa somente pelo autorizado, com motivo no histórico.
const recusada = aplicarAcao(aguardando, { tipo: 'recusar', usuario: 'Estagiário', autorizado: false, motivo: '' });
assert.equal(recusada.ok, false);
const recusadaOk = aplicarAcao(aguardando, { tipo: 'recusar', usuario: RE, autorizado: true, motivo: 'Sem comprovante' });
assert.ok(recusadaOk.ok);
assert.equal(recusadaOk.operacao.status, 'recusado');
const evRecusa = recusadaOk.operacao.historico.at(-1);
assert.match(evRecusa.acao, /Recusa/);
assert.match(evRecusa.detalhe, /Sem comprovante/);
ok('recusa somente pelo autorizado e com motivo no histórico');

// ---------------------------------------------------------------------------
// 6. Alteração de valor após aprovação → nova aprovação exigida
// ---------------------------------------------------------------------------
const aprovadaOp = aprovada.operacao;
const mudada = aplicarAcao(aprovadaOp, { tipo: 'alterar_valor', usuario: 'Teste', valor: 45 });
assert.ok(mudada.ok);
assert.equal(mudada.operacao.valorSolicitado, 45);
assert.equal(mudada.operacao.requerNovaAprovacao, true);
assert.equal(mudada.operacao.status, 'aguardando_aprovacao');
const evAlt = mudada.operacao.historico.at(-1);
assert.equal(evAlt.valorAnterior, 60);
assert.equal(evAlt.valorNovo, 45);
ok('alteração relevante pós-aprovação exige nova aprovação e registra valor anterior→novo');

// Acima do disponível não passa nem com aprovação pendente.
const alta = aplicarAcao(mudada.operacao, { tipo: 'alterar_valor', usuario: 'Teste', valor: 999 });
assert.equal(alta.ok, false);
assert.match(alta.erro, /ultrapassa o limite/);
ok('alteração acima do valor disponível bloqueada');

// Após pagamento, valor congelado.
const pagaFechada = {
  ...mudada.operacao,
  status: 'pago_devolvido',
  financeiro: 'pago',
};
const gelada = aplicarAcao(pagaFechada, { tipo: 'alterar_valor', usuario: 'Teste', valor: 10 });
assert.equal(gelada.ok, false);
assert.match(gelada.erro, /após pagamento/);
ok('valor não muda depois do pagamento/devolução');

// ---------------------------------------------------------------------------
// 7. Pendência documental — financeiro concluído ≠ fiscal regular
// ---------------------------------------------------------------------------
const comPendencia = {
  ...criarOperacao([], { ...base, valor: 25, referencia: '#4505' }).operacao,
  status: 'pago_devolvido',
  financeiro: 'pago',
  fiscal: 'aguardando_documento',
};
const fimPend = aplicarAcao(comPendencia, { tipo: 'concluir', usuario: RE });
assert.ok(fimPend.ok);
assert.equal(fimPend.operacao.financeiro, 'pago');          // financeiro fechado
assert.equal(fimPend.operacao.fiscal, 'aguardando_documento'); // fiscal permanece em aberto
assert.match(fimPend.mensagem, /Pendência documental permanece registrada/);
assert.match(fimPend.mensagem ?? '', /nada é declarado como regularidade fiscal/);
ok('operação concluída financeiramente mantém pendência documental — nada declara "fiscalmente regular"');

// Separar conceitos: fiscal evolui independentemente do financeiro.
const separada = {
  ...criarOperacao([], { ...base, valor: 20, referencia: '#4506' }).operacao,
  status: 'concluido',
  financeiro: 'devolvido',
  fiscal: 'em_conferencia',
};
const fiscalFechado = aplicarAcao(separada, { tipo: 'atualizar_fiscal', usuario: 'Contador', status: 'conferido' });
assert.ok(fiscalFechado.ok);
assert.equal(fiscalFechado.operacao.financeiro, 'devolvido');
assert.equal(fiscalFechado.operacao.fiscal, 'conferido');
ok('status fiscal atualizável sem tocar o status financeiro (conceitos separados)');

// Reabrir conferência de comprovante rebaixa o fiscal, sem mexer no financeiro.
const comComprovantes = {
  ...fiscalFechado.operacao,
  comprovantes: [
    { id: 'cp-1', nome: 'Comprovante demo', tipo: 'pix', conferido: true },
    { id: 'cp-2', nome: 'Recibo demo', tipo: 'recibo', conferido: true },
  ],
};
const reaberto = aplicarAcao(comComprovantes, { tipo: 'conferir_comprovante', usuario: 'Contador', id: 'cp-1', conferido: false });
assert.ok(reaberto.ok);
assert.equal(reaberto.operacao.fiscal, 'em_conferencia');
assert.equal(reaberto.operacao.financeiro, 'devolvido');
ok('reabrir conferência de comprovante move fiscal sem tocar financeiro');

// ---------------------------------------------------------------------------
// 8. Auditoria — histórico apenas acrescentado, com dados de quem/quando
// ---------------------------------------------------------------------------
const auditada = criarOperacao([], { ...base, valor: 55, referencia: '#4507' }).operacao;
const antes = auditada.historico.length;
const d1 = aplicarAcao({ ...auditada, status: 'aguardando_aprovacao' }, { tipo: 'aprovar', usuario: RE, autorizado: true });
const d1b = aplicarAcao(d1.operacao, { tipo: 'enviar_pagamento', usuario: RE });
const d2 = aplicarAcao(d1b.operacao, { tipo: 'registrar_pagamento', usuario: RE, referencia: 'PIX-A1' });
const hist = d2.operacao.historico;
assert.ok(hist.length > antes);
// Nada é editado ou removido: primeiros eventos preservados idênticos.
for (let i = 0; i < antes; i++) assert.deepEqual(hist[i], auditada.historico[i]);
// Cada evento tem data/hora e usuário.
for (const e of hist) {
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.dataHora));
  assert.ok(e.usuario);
  assert.ok(e.acao);
}
assert.match(brl(55), /55,00/);
assert.equal(formatarDataHora('2025-04-13T12:00'), '13/04/2025 12:00');
ok('histórico imutável (só acrescenta), com data/hora, usuário e ação; brl e data pt-BR ok');

// Cancelamento não permitido após pagamento.
const naoCancela = aplicarAcao(d2.operacao, { tipo: 'cancelar', usuario: RE, motivo: 'x' });
assert.equal(naoCancela.ok, false);
ok('operação paga não pode ser cancelada');

// ---------------------------------------------------------------------------
// 9. Indicadores e filtros
// ---------------------------------------------------------------------------
const indicadores = calcularIndicadores(OPERACOES_INICIAIS, '2025-04');
assert.equal(indicadores.aguardandoAprovacao, OPERACOES_INICIAIS.filter((o) => o.status === 'aguardando_aprovacao').length);
assert.equal(indicadores.aguardandoPagamento, OPERACOES_INICIAIS.filter((o) => o.status === 'aguardando_pagamento').length);
assert.ok(indicadores.concluidasPeriodo >= 2); // RE-0003 e RE-0008 (concluída em 02/04)
assert.ok(indicadores.totalReembolsado > 0);   // pagos/devolvidos em Abril
ok('indicadores calculados sobre o período (abertas, aprovação, pagamento, comprovação, concluídos, total)');

const porTipo = filtrarOperacoes(OPERACOES_INICIAIS, {
  periodo: 'todos', tipo: 'estorno_cliente', status: 'todos', responsavel: 'todos', origem: 'todos', busca: '',
});
assert.ok(porTipo.length > 0 && porTipo.every((o) => o.tipo === 'estorno_cliente'));
const porBusca = filtrarOperacoes(OPERACOES_INICIAIS, {
  periodo: 'todos', tipo: 'todos', status: 'todos', responsavel: 'todos', origem: 'todos', busca: 'Ana Souza',
});
assert.deepEqual(porBusca.map((o) => o.id), ['RE-0001']);
const porResponsavel = filtrarOperacoes(OPERACOES_INICIAIS, {
  periodo: 'todos', tipo: 'todos', status: 'todos', responsavel: 'Jonas Prado', origem: 'todos', busca: '',
});
assert.ok(porResponsavel.every((o) => o.solicitante === 'Jonas Prado' || o.aprovador === 'Jonas Prado'));
ok('filtros por tipo, responsável e busca textual funcionando');

console.log(`\nReembolsos e Estornos R1: ${passos} verificações de regras — todas OK.`);
