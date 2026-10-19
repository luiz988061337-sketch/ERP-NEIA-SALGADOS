import pg from 'pg';
import fs from 'fs';

const { Client } = pg;
const PORT = 55435;
const DB = 'homolog_p0';
const OUT = 'C:/Users/User/pgtest/concurrency-results.json';

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  atendente: '22222222-2222-2222-2222-222222222222',
  producao: '33333333-3333-3333-3333-333333333333',
  cliente: '44444444-4444-4444-4444-444444444444',
  outsider: '55555555-5555-5555-5555-555555555555',
  motoboy: '66666666-6666-6666-6666-666666666666',
};
const P = {
  unit: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  combo: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  zero: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  indisponivel: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  promo: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  stock1: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006',
  stock5: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007',
  outro: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
};

const opts = (app) => ({ host: '127.0.0.1', port: PORT, user: 'postgres', database: DB, application_name: app });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nid = () => crypto.randomUUID();
const base = (over = {}) => ({ cliente_nome: 'Cliente Homolog', telefone: '11999998888', tipo_entrega: 'retirada', forma_pagamento: 'pix', ...over });
const item = (produto_id, quantidade) => ({ produto_id, quantidade });

const admin = new Client(opts('p0_admin'));
await admin.connect();

async function resetState() {
  await admin.query(`update public.reserva_proveniencia_config set controlado=true where id=true`);
  await admin.query(`delete from public.cupons where codigo like 'TESTECONC%'`);
  await admin.query(`truncate table
    public.reserva_consumos,
    public.reserva_proveniencia,
    public.estoque_movimentacoes,
    public.reservas_estoque,
    public.pedido_status_historico,
    public.pedido_itens,
    public.fila_impressao,
    public.fritura_fila,
    public.pedidos,
    public.estoque_mov
    cascade`);
  await admin.query(`update public.produtos set estoque=100, disponivel=true where id in ('${P.unit}','${P.outro}')`);
  await admin.query(`update public.produtos set estoque=200, disponivel=true where id='${P.combo}'`);
  await admin.query(`update public.produtos set estoque=0, disponivel=true where id='${P.zero}'`);
  await admin.query(`update public.produtos set estoque=10, disponivel=false where id='${P.indisponivel}'`);
  await admin.query(`update public.produtos set estoque=50, disponivel=true where id='${P.promo}'`);
  await admin.query(`update public.produtos set estoque=1, disponivel=true where id='${P.stock1}'`);
  await admin.query(`update public.produtos set estoque=5, disponivel=true where id='${P.stock5}'`);
}

async function beginAs(uid, app) {
  const c = new Client(opts(app));
  await c.connect();
  await c.query('begin');
  await c.query(`set local role authenticated`);
  await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
  await c.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ role: 'authenticated', sub: uid })]);
  await c.query(`set local lock_timeout='8s'`);
  await c.query(`set local statement_timeout='15s'`);
  const p = (await c.query('select pg_backend_pid() pid')).rows[0].pid;
  return { c, pid: p };
}

async function rpc(c, id, canal, dados, itens) {
  const r = await c.query('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res', [id, canal, JSON.stringify(dados), JSON.stringify(itens)]);
  return r.rows[0].res;
}
async function consumo(c, rid, qty, idem, obs = null) {
  const r = await c.query('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, qty, idem, null, obs]);
  return r.rows[0].r;
}
async function cancelar(c, id, motivo = null) {
  const r = await c.query('select public.cancelar_pedido_atomico($1,$2) as r', [id, motivo]);
  return r.rows[0].r;
}
async function updatePago(c, id) {
  return c.query(`update public.pedidos set pagamento_status='pago' where id=$1`, [id]);
}

async function seedOrder(qty = 10, over = {}) {
  const id = nid();
  const s = await beginAs(U.cliente, 'p0_seed');
  let res;
  try {
    res = await rpc(s.c, id, 'checkout', base(over), [item(P.unit, qty)]);
    if (res.status !== 'criado') throw new Error('seed falhou: ' + JSON.stringify(res));
    await s.c.query('commit');
  } catch (e) {
    try { await s.c.query('rollback'); } catch {}
    throw e;
  } finally { await s.c.end(); }
  const r = await admin.query('select id from public.reservas_estoque where pedido_id=$1 order by created_at limit 1', [id]);
  return { id, rid: r.rows[0].id };
}

async function counts(id) {
  const r = await admin.query(`select
    (select count(*)::int from public.pedidos where id=$1) pedidos,
    (select count(*)::int from public.pedido_itens where pedido_id=$1) itens,
    (select count(*)::int from public.reservas_estoque where pedido_id=$1) reservas,
    (select coalesce(sum(quantidade),0)::int from public.estoque_movimentacoes where referencia_id in (select id from public.reservas_estoque where pedido_id=$1) and tipo='reserva') debitado,
    (select coalesce(sum(quantidade),0)::int from public.estoque_movimentacoes where referencia_id in (select id from public.reservas_estoque where pedido_id=$1) and tipo='liberacao') liberado`, [id]);
  return r.rows[0];
}
async function stock(pid) {
  const r = await admin.query('select estoque from public.produtos where id=$1', [pid]);
  return r.rows[0].estoque;
}
async function orderState(id) {
  const r = await admin.query(`select p.status, p.pagamento_status, p.subtotal, p.total, p.cupom,
    (select count(*)::int from public.pedidos where cupom=p.cupom) usos_cupom
    from public.pedidos p where p.id=$1`, [id]);
  return r.rows[0];
}
async function reservations(id) {
  const r = await admin.query(`select r.id, r.produto_id, r.quantidade, r.status,
    coalesce((select sum(c.quantidade)::int from public.reserva_consumos c where c.reserva_id=r.id),0) consumido
    from public.reservas_estoque r where r.pedido_id=$1 order by r.created_at`, [id]);
  return r.rows;
}

async function watchWait(aPid, bPid, timeoutMs = 4000) {
  const monitor = new Client(opts('p0_monitor'));
  await monitor.connect();
  const until = Date.now() + timeoutMs;
  const samples = [];
  let first = null;
  try {
    while (Date.now() < until) {
      const st = await monitor.query(`select pid, application_name, state, wait_event_type, wait_event,
        pg_blocking_pids(pid) blockers, left(query,180) query
        from pg_stat_activity where datname=$1 and pid in ($2,$3) order by pid`, [DB, aPid, bPid]);
      const waiting = st.rows.some((x) => x.wait_event_type === 'Lock' || (x.blockers && x.blockers.length > 0));
      if (waiting) {
        const lk = await monitor.query(`select l.pid, a.application_name, l.locktype, l.mode, l.granted,
          l.relation::regclass::text relation, l.transactionid::text transactionid,
          l.classid::text classid, l.objid::text objid, l.objsubid
          from pg_locks l join pg_stat_activity a on a.pid=l.pid
          where a.pid in ($1,$2)
          order by l.pid, l.granted desc, l.locktype`, [aPid, bPid]);
        first = { at: new Date().toISOString(), activity: st.rows, locks: lk.rows };
        samples.push(first);
        break;
      }
      await sleep(40);
    }
  } finally { await monitor.end(); }
  return { wait_observed: !!first, samples };
}

async function callAndHold(a, fn) {
  const res = await fn(a.c);
  return res;
}

async function finish(b, commit) {
  try {
    if (commit) await b.c.query('commit');
    else await b.c.query('rollback');
  } catch (e) {
    try { await b.c.query('rollback'); } catch {}
  } finally {
    try { await b.c.end(); } catch {}
  }
}

const results = [];
async function test(name, fn) {
  await resetState();
  const rec = { name, started: new Date().toISOString() };
  try {
    await fn(rec);
    rec.ok = true;
  } catch (e) {
    rec.ok = false;
    rec.error = { message: e.message, code: e.code, stack: e.stack };
  } finally {
    rec.finished = new Date().toISOString();
    results.push(rec);
    console.log(`${rec.ok ? 'PASS' : 'FAIL'} ${name}${rec.error ? ' :: ' + rec.error.message : ''}`);
  }
}

// C1: two identical 0095 creations (same p_id) -> advisory lock, one order.
await test('C-0095-duplicate-id', async (rec) => {
  const id = nid();
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => rpc(c, id, 'checkout', base(), [item(P.unit, 2)]));
    rec.a_result = ra;
    const bp = rpc(b.c, id, 'checkout', base(), [item(P.unit, 2)]).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, rb.ok);
    rec.counts = await counts(id);
    rec.stock = await stock(P.unit);
    rec.state = await orderState(id);
    rec.assert = {
      a_criado: ra.status === 'criado',
      b_ja_criado: rb.ok && rb.x.status === 'ja_criado',
      one_order: rec.counts.pedidos === 1,
      one_reservation: rec.counts.reservas === 1,
      debit_once: rec.counts.debitado === -2,
      stock_98: rec.stock === 98,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C2: two different orders compete for stock=1.
await test('C-0095-same-stock', async (rec) => {
  const idA = nid(), idB = nid();
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => rpc(c, idA, 'checkout', base(), [item(P.stock1, 1)]));
    rec.a_result = ra;
    const bp = rpc(b.c, idB, 'checkout', base(), [item(P.stock1, 1)]).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, false);
    rec.stock = await stock(P.stock1);
    rec.a_counts = await counts(idA);
    rec.b_counts = await counts(idB);
    rec.assert = {
      a_criado: ra.status === 'criado',
      b_estoque_insuficiente: rb.ok && rb.x.status === 'estoque_insuficiente',
      stock_zero: rec.stock === 0,
      a_one_reservation: rec.a_counts.reservas === 1,
      b_no_order: rec.b_counts.pedidos === 0,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C3: coupon max_usos=1, different products -> coupon row serializes.
await test('C-0095-coupon-max-usos', async (rec) => {
  await admin.query(`insert into public.cupons (codigo,tipo,valor,minimo,ativo,cliente_telefone,max_usos,produtos_ids)
    values ('TESTECONC','percentual',10,0,true,'',1,'[]'::jsonb)`);
  const idA = nid(), idB = nid();
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => rpc(c, idA, 'checkout', base({ cupom: 'TESTECONC' }), [item(P.unit, 1)]));
    rec.a_result = ra;
    const bp = rpc(b.c, idB, 'checkout', base({ cupom: 'TESTECONC' }), [item(P.outro, 1)]).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, false);
    rec.stateA = await orderState(idA);
    rec.stateB = await orderState(idB);
    rec.stockUnit = await stock(P.unit);
    rec.stockOutro = await stock(P.outro);
    const usos = await admin.query(`select count(*)::int n from public.pedidos where cupom='TESTECONC' and status<>'cancelado'`);
    rec.usos = usos.rows[0].n;
    rec.assert = {
      a_criado: ra.status === 'criado',
      b_cupom_esgotado: rb.ok && rb.x.status === 'cupom_esgotado',
      one_use: rec.usos === 1,
      unit_debited_once: rec.stockUnit === 99,
      outro_untouched: rec.stockOutro === 100,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C4: two simultaneous cancellations -> one cancel, one ja_cancelado, one credit.
await test('C-0093-two-cancellations', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => cancelar(c, id, 'A'));
    rec.a_result = ra;
    const bp = cancelar(b.c, id, 'B').then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, rb.ok);
    rec.stock = await stock(P.unit);
    rec.state = await orderState(id);
    rec.reservations = await reservations(id);
    rec.counts = await counts(id);
    rec.assert = {
      a_cancelado: ra.status === 'cancelado',
      b_ja_cancelado: rb.ok && rb.x.status === 'ja_cancelado',
      stock_100: rec.stock === 100,
      status_cancelado: rec.state.status === 'cancelado',
      one_liberacao: rec.counts.liberado === 10,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C5: partial consumption holds pedido lock; cancellation waits and releases only 6.
await test('C-0091-consume-vs-0093-cancel', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const a = await beginAs(U.producao, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => consumo(c, rid, 4, nid(), 'parcial A'));
    rec.a_result = ra;
    const bp = cancelar(b.c, id, 'B').then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, rb.ok);
    rec.stock = await stock(P.unit);
    rec.state = await orderState(id);
    rec.reservations = await reservations(id);
    rec.counts = await counts(id);
    rec.assert = {
      a_consumido: ra.status === 'consumido' && ra.restante === 6,
      b_cancelado: rb.ok && rb.x.status === 'cancelado',
      stock_96: rec.stock === 96,
      status_cancelado: rec.state.status === 'cancelado',
      consumption_4: rec.reservations[0].consumido === 4,
      liberation_6: rec.counts.liberado === 6,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C6: cancellation holds pedido lock; consumption waits and is rejected.
await test('C-0093-cancel-vs-0091-consume', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.producao, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => cancelar(c, id, 'A'));
    rec.a_result = ra;
    const bp = consumo(b.c, rid, 4, nid(), 'apos cancelar').then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, false);
    rec.stock = await stock(P.unit);
    rec.state = await orderState(id);
    rec.reservations = await reservations(id);
    rec.counts = await counts(id);
    rec.consumos = (await admin.query('select count(*)::int n from public.reserva_consumos where reserva_id=$1', [rid])).rows[0].n;
    rec.assert = {
      a_cancelado: ra.status === 'cancelado',
      b_status_invalido: rb.ok && rb.x.status === 'status_invalido',
      stock_100: rec.stock === 100,
      no_consumption: rec.consumos === 0,
      liberation_10: rec.counts.liberado === 10,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C7: two consumption requests 6+6 on a 10-unit reservation -> second rejects.
await test('C-0091-two-consumptions-over-restante', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const a = await beginAs(U.producao, 'p0_a');
  const b = await beginAs(U.producao, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => consumo(c, rid, 6, nid(), 'A'));
    rec.a_result = ra;
    const bp = consumo(b.c, rid, 6, nid(), 'B').then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, rb.ok);
    rec.reservations = await reservations(id);
    rec.consumos = (await admin.query('select count(*)::int n from public.reserva_consumos where reserva_id=$1', [rid])).rows[0].n;
    rec.assert = {
      a_consumido_6: ra.status === 'consumido' && ra.restante === 4,
      b_acima_do_restante: rb.ok && rb.x.status === 'acima_do_restante',
      one_consumption_row: rec.consumos === 1,
      consumed_6: rec.reservations[0].consumido === 6,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C8: identical idempotency key concurrently -> one row, one ja_registrado.
await test('C-0091-same-idem-key', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const key = nid();
  const a = await beginAs(U.producao, 'p0_a');
  const b = await beginAs(U.producao, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => consumo(c, rid, 4, key, 'A'));
    rec.a_result = ra;
    const bp = consumo(b.c, rid, 4, key, 'A').then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, rb.ok);
    rec.reservations = await reservations(id);
    rec.consumos = (await admin.query('select count(*)::int n from public.reserva_consumos where reserva_id=$1', [rid])).rows[0].n;
    rec.assert = {
      a_consumido: ra.status === 'consumido',
      b_ja_registrado: rb.ok && rb.x.status === 'ja_registrado',
      one_consumption_row: rec.consumos === 1,
      consumed_4: rec.reservations[0].consumido === 4,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C9: two multi-product orders, different item order -> product locks sorted, no deadlock.
await test('C-0095-multiproduct-lock-order', async (rec) => {
  const idA = nid(), idB = nid();
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => rpc(c, idA, 'checkout', base(), [item(P.unit, 2), item(P.outro, 2)]));
    rec.a_result = ra;
    const bp = rpc(b.c, idB, 'checkout', base(), [item(P.outro, 2), item(P.unit, 2)]).then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, rb.ok);
    rec.stockUnit = await stock(P.unit);
    rec.stockOutro = await stock(P.outro);
    rec.a_counts = await counts(idA);
    rec.b_counts = await counts(idB);
    rec.assert = {
      a_criado: ra.status === 'criado',
      b_criado: rb.ok && rb.x.status === 'criado',
      unit_96: rec.stockUnit === 96,
      outro_96: rec.stockOutro === 96,
      both_reserved: rec.a_counts.reservas === 2 && rec.b_counts.reservas === 2,
      wait_observed: rec.waits.wait_observed,
      no_deadlock: !rb.e || rb.e.code !== '40P01',
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C10: payment update holds pedido row; cancellation waits then must not cancel a paid order.
await test('C-0094-payment-vs-0093-cancel', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const a = await beginAs(U.admin, 'p0_a');
  const b = await beginAs(U.cliente, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    await updatePago(a.c, id);
    rec.a_result = 'pago';
    const bp = cancelar(b.c, id, 'B').then((x) => ({ ok: true, x }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? rb.x : rb.e;
    await finish(b, false);
    rec.stock = await stock(P.unit);
    rec.state = await orderState(id);
    rec.reservations = await reservations(id);
    rec.assert = {
      b_pagamento_nao_elegivel: rb.ok && rb.x.status === 'pagamento_nao_elegivel',
      order_recebido_pago: rec.state.status === 'recebido' && rec.state.pagamento_status === 'pago',
      stock_90: rec.stock === 90,
      reservation_ativa: rec.reservations[0].status === 'ativa',
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C11: cancellation holds pedido row; payment waits then 0094 blocks paid-on-cancelled.
await test('C-0093-cancel-vs-0094-payment', async (rec) => {
  const { id, rid } = await seedOrder(10);
  rec.order = { id, rid };
  const a = await beginAs(U.cliente, 'p0_a');
  const b = await beginAs(U.admin, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    const ra = await callAndHold(a, (c) => cancelar(c, id, 'A'));
    rec.a_result = ra;
    const bp = updatePago(b.c, id).then(() => ({ ok: true }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    await sleep(250);
    rec.waits = await watchWait(a.pid, b.pid);
    await a.c.query('commit');
    const rb = await bp;
    rec.b_result = rb.ok ? 'pago' : rb.e;
    await finish(b, false);
    rec.stock = await stock(P.unit);
    rec.state = await orderState(id);
    rec.assert = {
      a_cancelado: ra.status === 'cancelado',
      b_blocked: rb.ok === false && (rb.e.code === 'P0001' || /inconsistencia_financeira|cancelado/.test(rb.e.message)),
      order_cancelado_pendente: rec.state.status === 'cancelado' && rec.state.pagamento_status === 'pendente',
      stock_100: rec.stock === 100,
      wait_observed: rec.waits.wait_observed,
    };
    if (Object.values(rec.assert).some((v) => v !== true)) throw new Error('assert failed: ' + JSON.stringify(rec.assert));
  } finally { try { await a.c.end(); } catch {} }
});

// C12: deadlock detector sanity, using raw row locks on two products.
await test('C-PG-deadlock-sanity', async (rec) => {
  const a = await beginAs(U.admin, 'p0_a');
  const b = await beginAs(U.admin, 'p0_b');
  rec.pids = { a: a.pid, b: b.pid };
  try {
    await a.c.query('select id from public.produtos where id=$1 for update', [P.unit]);
    await b.c.query('select id from public.produtos where id=$1 for update', [P.outro]);
    const pa = a.c.query('select id from public.produtos where id=$1 for update', [P.outro]).then(() => ({ ok: true }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    const pb = b.c.query('select id from public.produtos where id=$1 for update', [P.unit]).then(() => ({ ok: true }), (e) => ({ ok: false, e: { code: e.code, message: e.message } }));
    const [ra, rb] = await Promise.all([pa, pb]);
    rec.a_result = ra; rec.b_result = rb;
    rec.deadlock_detected = [ra, rb].some((x) => !x.ok && x.e.code === '40P01');
    rec.assert = { deadlock_detected: rec.deadlock_detected };
    if (!rec.deadlock_detected) throw new Error('deadlock was not detected: ' + JSON.stringify(rec));
  } finally {
    try { await a.c.query('rollback'); } catch {}
    try { await b.c.query('rollback'); } catch {}
    try { await a.c.end(); } catch {}
    try { await b.c.end(); } catch {}
  }
});

console.log('\n===== RESUMO CONCORRENCIA =====');
console.log(JSON.stringify(results.map((r) => ({ name: r.name, ok: r.ok, wait: r.waits?.wait_observed, assert: r.assert, error: r.error?.message })), null, 2));
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
await admin.end();
process.exit(results.every((r) => r.ok) ? 0 : 1);
