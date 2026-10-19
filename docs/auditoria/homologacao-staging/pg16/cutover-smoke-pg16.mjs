// ENSAIO DE CUTOVER - SMOKE TEST NO CLONE ISOLADO (PG16)
// Nao toca producao. Roda contra PGDATABASE (default homolog_cutover).
// Cobre: checkout retirada/entrega, pix pendente, PDV, atendimento, combo 50,
// combo misto, retirada parcial, cancelamento sem/com consumo, pedido pago,
// bloqueio de cancelamento pago, producao, entrega, fila de impressao.
// Confere estoque antes/depois.
import pg from 'pg';
const { Client } = pg;

const db = new Client({
  host: '127.0.0.1', port: 55435, user: 'postgres',
  database: process.env.PGDATABASE || 'homolog_cutover',
});
await db.connect();

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  atendente: '22222222-2222-2222-2222-222222222222',
  producao: '33333333-3333-3333-3333-333333333333',
  cliente: '44444444-4444-4444-4444-444444444444',
  motoboy: '66666666-6666-6666-6666-666666666666',
};
const P = {
  unit: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  combo: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  promo: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  outro: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
};
const CAT = '99999999-9999-4999-8999-999999999999';

let seq = 0;
const nid = () => `c0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
let pass = 0, fail = 0;
function ok(n, c, d = '') { const p = !!c; if (p) pass++; else fail++; console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + String(d).slice(0, 400) : ''}`); }
async function q(s, p = []) { return db.query(s, p); }
async function one(s, p = []) { return (await q(s, p)).rows[0]; }
async function val(s, p = []) { const r = await one(s, p); return r ? Object.values(r)[0] : null; }
async function root() {
  await q('reset role');
  await q("select set_config('request.jwt.claim.sub','',true)");
  await q("select set_config('request.jwt.claims','',true)");
}
async function actAs(uid, role = 'authenticated') {
  await q('reset role');
  await q(`set local role ${role}`);
  await q(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
  await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ role, sub: uid })]);
}
async function tx(uid, fn, role = 'authenticated') {
  await q('begin');
  try { await actAs(uid, role); await fn(); }
  catch (e) { ok('EXCECAO INESPERADA', false, `${e.code || ''} ${e.message}`); }
  finally { try { await q('rollback'); } catch {} }
}
async function stock(pid) { await root(); return Number(await val('select estoque from public.produtos where id=$1', [pid])); }
async function reservas(id) { await root(); return (await q('select * from public.reservas_estoque where pedido_id=$1 order by produto_id', [id])).rows; }
async function pagamento(id) { await root(); return await val('select pagamento_status from public.pedidos where id=$1', [id]); }
async function statusPedido(id) { await root(); return await val('select status from public.pedidos where id=$1', [id]); }

const base = { cliente_nome: 'Cliente Cutover', telefone: '11999998888', tipo_entrega: 'retirada', forma_pagamento: 'pix' };
const entrega = { ...base, tipo_entrega: 'entrega', endereco: 'Rua Teste, 100', bairro: 'Centro', cidade: 'Sao Paulo', cep: '01001000' };

async function criar(id, canal, dados, itens, uid = U.cliente, role = 'authenticated') {
  await actAs(uid, role);
  const r = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [id, canal, JSON.stringify(dados), JSON.stringify(itens)]);
  return r.rows[0].res;
}

console.log('### ENSAIO DE CUTOVER - SMOKE TEST (clone isolado)');
await root();
await q("update public.reserva_proveniencia_config set controlado=true where id=true");
await q("update public.categorias set combo_preco_unit=1.60 where id=$1", [CAT]);
await q('update public.produtos set estoque=300, disponivel=true where id = any($1::uuid[])', [[P.unit, P.combo, P.promo, P.outro]]);

// ---------------------------------------------------------------- S1..S5
await tx(U.cliente, async () => {
  const id = nid();
  const r = await criar(id, 'checkout', base, [{ produto_id: P.unit, quantidade: 10 }]);
  ok('S1 checkout retirada criado', r.status === 'criado', JSON.stringify(r));
  ok('S1 estoque unit 290', (await stock(P.unit)) === 290, String(await stock(P.unit)));
  ok('S1 reserva ativa 10', (await reservas(id)).some((x) => x.quantidade === 10 && x.status === 'ativa'), JSON.stringify((await reservas(id)).map((x) => [x.quantidade, x.status])));
  ok('S1 pix pendente', (await pagamento(id)) === 'pendente', String(await pagamento(id)));
});

await tx(U.cliente, async () => {
  const id = nid();
  const r = await criar(id, 'checkout', entrega, [{ produto_id: P.outro, quantidade: 5 }]);
  ok('S2 checkout entrega criado', r.status === 'criado', JSON.stringify(r));
  ok('S2 tipo_entrega entrega', (await root(), await val('select tipo_entrega from public.pedidos where id=$1', [id])) === 'entrega', '');
});

await tx(U.atendente, async () => {
  const id = nid();
  const r = await criar(id, 'pdv', { ...base, forma_pagamento: 'dinheiro', pagamento_imediato: true }, [{ produto_id: P.promo, quantidade: 8 }], U.atendente);
  ok('S4 PDV criado', r.status === 'criado', JSON.stringify(r));
  ok('S4 PDV pago na hora', (await pagamento(id)) === 'pago', String(await pagamento(id)));
});

await tx(U.atendente, async () => {
  const id = nid();
  const r = await criar(id, 'atendente', base, [{ produto_id: P.unit, quantidade: 3 }], U.atendente);
  ok('S5 atendimento criado', r.status === 'criado', JSON.stringify(r));
});

// cliente nao pode usar canal staff
await tx(U.cliente, async () => {
  const id = nid();
  const r = await criar(id, 'pdv', base, [{ produto_id: P.unit, quantidade: 1 }], U.cliente);
  ok('S5b cliente bloqueado no canal pdv', r.status === 'permissao_negada', JSON.stringify(r));
});

// ---------------------------------------------------------------- S6..S7 combo
await tx(U.cliente, async () => {
  const id = nid();
  const r = await criar(id, 'checkout', base, [{
    nome: 'Combo 50', quantidade: 50,
    componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
  }]);
  ok('S6 combo 50 criado', r.status === 'criado' && Number(r.subtotal) === 80, JSON.stringify(r));
  const rs = await reservas(id);
  ok('S6 combo 50 gera 2 reservas 30/20', rs.length === 2 && rs.some((x) => x.quantidade === 30) && rs.some((x) => x.quantidade === 20), JSON.stringify(rs.map((x) => x.quantidade)));
  await root();
  ok('S6 componentes persistidos', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 2, '');
});

await tx(U.cliente, async () => {
  const id = nid();
  const r = await criar(id, 'checkout', base, [{
    nome: 'Combo misto 100', quantidade: 100,
    componentes: [{ produto_id: P.unit, quantidade: 50 }, { produto_id: P.promo, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
  }]);
  ok('S7 combo misto 100 criado', r.status === 'criado' && Number(r.subtotal) === 160, JSON.stringify(r));
});

// ---------------------------------------------------------------- S8..S10 parcial/cancelamento
await tx(U.cliente, async () => {
  const id = nid();
  const r = await criar(id, 'checkout', base, [{ produto_id: P.unit, quantidade: 50 }]);
  ok('S8 pedido 50 criado', r.status === 'criado', JSON.stringify(r));
  const antes = await stock(P.unit);
  const res = (await reservas(id))[0];
  const chave = nid();
  await actAs(U.producao);
  const c = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
    [res.id, 20, chave, P.unit, 'retirada parcial 20 de 50']);
  ok('S8 retirada parcial 20 registrada', c.rows[0].r?.status === 'consumido', JSON.stringify(c.rows[0].r));
  ok('S8 restante 30', Number(c.rows[0].r?.restante) === 30, JSON.stringify(c.rows[0].r));
  ok('S8 estoque nao muda na retirada (ja debitado)', (await stock(P.unit)) === antes, `${antes}->${await stock(P.unit)}`);
  await actAs(U.producao);
  const c2 = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
    [res.id, 20, chave, P.unit, 'retirada parcial 20 de 50']);
  ok('S8 replay de retirada', c2.rows[0].r?.status === 'ja_registrado', JSON.stringify(c2.rows[0].r));
  const c3 = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
    [res.id, 999, nid(), P.unit, 'excesso']);
  ok('S8 acima do restante bloqueado', c3.rows[0].r?.status === 'acima_do_restante', JSON.stringify(c3.rows[0].r));
});

await tx(U.cliente, async () => {
  const id = nid();
  await criar(id, 'checkout', base, [{ produto_id: P.outro, quantidade: 10 }]);
  const antes = await stock(P.outro);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'cancelamento sem consumo']);
  ok('S9 cancelamento sem consumo', r.rows[0].r?.status === 'cancelado', JSON.stringify(r.rows[0].r));
  ok('S9 estoque devolvido', (await stock(P.outro)) === antes + 10, `${antes}->${await stock(P.outro)}`);
  await actAs(U.cliente);
  const r2 = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'replay']);
  ok('S9 cancelamento replay idempotente', r2.rows[0].r?.status === 'ja_cancelado', JSON.stringify(r2.rows[0].r));
});

await tx(U.cliente, async () => {
  const id = nid();
  await criar(id, 'checkout', base, [{ produto_id: P.unit, quantidade: 50 }]);
  const antes = await stock(P.unit);
  const res = (await reservas(id))[0];
  await actAs(U.producao);
  await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5)',
    [res.id, 30, nid(), P.unit, 'consumo 30 de 50']);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'cancelamento com consumo']);
  ok('S10 cancelamento com consumo', r.rows[0].r?.status === 'cancelado', JSON.stringify(r.rows[0].r));
  ok('S10 devolve so 20 (nao credita os 30 consumidos)', (await stock(P.unit)) === antes + 20, `${antes}->${await stock(P.unit)}`);
});

// ---------------------------------------------------------------- S11..S12 pago
await tx(U.atendente, async () => {
  const id = nid();
  const r = await criar(id, 'pdv', { ...base, forma_pagamento: 'dinheiro', pagamento_imediato: true }, [{ produto_id: P.unit, quantidade: 2 }], U.atendente);
  ok('S11 pedido pago criado', r.status === 'criado', JSON.stringify(r));
  const c = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'tentativa cancelar pago']);
  ok('S12 cancelamento de pedido pago bloqueado', c.rows[0].r?.status === 'pagamento_nao_elegivel', JSON.stringify(c.rows[0].r));
  ok('S12 pedido pago continua ativo', (await statusPedido(id)) !== 'cancelado', String(await statusPedido(id)));
});

// ---------------------------------------------------------------- S13..S14 producao/entrega
await tx(U.cliente, async () => {
  const id = nid();
  await criar(id, 'checkout', base, [{ produto_id: P.promo, quantidade: 4 }]);
  await actAs(U.producao);
  await q("update public.pedidos set status='em_producao' where id=$1", [id]);
  ok('S13 producao: recebido -> em_producao', (await statusPedido(id)) === 'em_producao', String(await statusPedido(id)));
  await actAs(U.admin);
  await q("update public.pedidos set status='em_rota' where id=$1", [id]);
  ok('S14 entrega: -> em_rota', (await statusPedido(id)) === 'em_rota', String(await statusPedido(id)));
});

// ---------------------------------------------------------------- S15 impressao (fila, sem hardware)
await tx(U.cliente, async () => {
  const id = nid();
  await criar(id, 'checkout', base, [{ produto_id: P.unit, quantidade: 1 }]);
  const ins = await q(`insert into public.fila_impressao (trabalho_uuid, pedido_id, tipo, payload, impressora, status)
    values ($1,$2,'pedido','CUPOM TESTE','Tanca TP-550','pendente')`, [`${id}:confirmado`, id]);
  ok('S15 cupom entra na fila (sem hardware)', ins.rowCount === 1, '');
  await root();
  ok('S15 job pendente para o agente', Number(await val("select count(*) from public.fila_impressao where pedido_id=$1 and status='pendente'", [id])) === 1, '');
});

console.log(`\n===== RESUMO SMOKE CUTOVER ===== pass=${pass} fail=${fail} total=${pass + fail}`);
await db.end();
process.exit(fail ? 1 : 0);
