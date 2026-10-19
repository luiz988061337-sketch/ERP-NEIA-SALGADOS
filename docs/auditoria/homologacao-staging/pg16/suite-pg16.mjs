import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const db = new Client({ host: '127.0.0.1', port: 55435, user: 'postgres', database: process.env.PGDATABASE || 'homolog_p0' });
await db.connect();

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

let seq = 0;
const nid = () => `f0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const results = [];
let pass = 0;
let fail = 0;

function section(name) {
  results.push({ section: name });
  console.log(`\n### ${name}`);
}
function ok(name, cond, details = '') {
  const p = !!cond;
  results.push({ name, pass: p, details: String(details).slice(0, 600) });
  if (p) pass++;
  else fail++;
  console.log(`${p ? 'PASS' : 'FAIL'} ${name}${details ? ' :: ' + String(details).slice(0, 240) : ''}`);
}
async function q(sql, params = []) { return db.query(sql, params); }
async function qr(sql, params = []) { return (await db.query(sql, params)).rows; }
async function one(sql, params = []) { const r = await q(sql, params); return r.rows[0]; }
async function val(sql, params = []) { const r = await one(sql, params); return r ? Object.values(r)[0] : null; }
async function exec(sql) { return db.query(sql); }

async function begin(uid = U.cliente, role = 'authenticated', claims = null) {
  await exec('begin');
  if (role) await exec(`set local role ${role}`);
  if (uid) {
    await q(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims ?? { role: 'authenticated', sub: uid })]);
  } else if (claims) {
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims)]);
  }
}
async function end(commit = false) { await exec(commit ? 'commit' : 'rollback'); }
async function superUser() {
  await exec('reset role');
  await q("select set_config('request.jwt.claim.sub','',true)");
  await q("select set_config('request.jwt.claims','',true)");
}
async function actAs(uid, role = 'authenticated', claims = null) {
  await exec(`set local role ${role}`);
  if (uid) {
    await q(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims ?? { role: 'authenticated', sub: uid })]);
  } else {
    await q("select set_config('request.jwt.claim.sub','',true)");
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims ?? { role })]);
  }
}
async function test(label, fn, opts = {}) {
  await begin(opts.uid === undefined ? U.cliente : opts.uid, opts.role ?? 'authenticated', opts.claims);
  try { await fn(); }
  catch (e) { ok(label + ' [excecao inesperada]', false, `${e.code || ''} ${e.message}`); }
  finally { try { await end(false); } catch {} }
}

const dadosBase = (over = {}) => ({
  cliente_nome: 'Cliente Homolog', telefone: '11999998888',
  tipo_entrega: 'retirada', forma_pagamento: 'pix', ...over,
});
const dadosEntrega = (over = {}) => dadosBase({
  tipo_entrega: 'entrega', endereco: 'Rua Teste, 100', bairro: 'Centro',
  cidade: 'Sao Paulo', cep: '01001000', ...over,
});
async function rpc(id, canal, dados, itens) {
  const r = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [id, canal, JSON.stringify(dados), JSON.stringify(itens)]);
  return r.rows[0].res;
}
async function counts(id) {
  return one(`select
    (select count(*)::int from public.pedidos where id=$1) pedidos,
    (select count(*)::int from public.pedido_itens where pedido_id=$1) itens,
    (select count(*)::int from public.reservas_estoque where pedido_id=$1) reservas,
    (select count(*)::int from public.reserva_proveniencia where pedido_id=$1) prov,
    (select count(*)::int from public.pedido_status_historico where pedido_id=$1) hist,
    (select count(*)::int from public.estoque_movimentacoes m
      where m.referencia_id in (select id from public.reservas_estoque where pedido_id=$1)) movs`, [id]);
}
async function stock(pid) { return val('select estoque from public.produtos where id=$1', [pid]); }
async function resId(pedidoId) { return val('select id from public.reservas_estoque where pedido_id=$1 order by created_at,id limit 1', [pedidoId]); }
async function provFor(pedidoId) { return qr('select * from public.reserva_proveniencia where pedido_id=$1 order by reserva_id', [pedidoId]); }
async function ledgerFor(rid) { return qr('select * from public.estoque_movimentacoes where referencia_id=$1 order by created_at,id', [rid]); }
async function cobertura(id, uid = U.admin) {
  await actAs(uid);
  const r = await one('select public.pedido_cobertura_reserva($1) as c', [id]);
  await superUser();
  return r.c;
}
async function expectThrow(label, fn) {
  const sp = 'sp_' + (++seq);
  await exec('savepoint ' + sp);
  let threw = false; let err = null;
  try { await fn(); } catch (e) { threw = true; err = e; }
  ok(label, threw, threw ? `${err.code || ''}: ${err.message}` : 'nao lancou');
  try { await exec('rollback to savepoint ' + sp); } catch {}
}

// manual fixtures
async function mkPedido(id, o = {}) {
  const user = o.user ?? U.cliente, status = o.status ?? 'recebido', pag = o.pag ?? 'pendente';
  const tipo = o.tipo ?? 'retirada', total = o.total ?? 100;
  await exec(`insert into public.pedidos
    (id,user_id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,forma_pagamento,subtotal,total,cupom,status,pagamento_status)
    values ('${id}','${user}','Fixture','11999998888','Rua Fixture, 1','Centro','Sao Paulo','${tipo}','pix',${total},${total},${o.cupom ? `'${o.cupom}'` : 'null'},'${status}','${pag}')`);
}
async function mkItem(pedidoId, prodId, qty, nome = 'Item Fixture', preco = 10) {
  await exec(`insert into public.pedido_itens (pedido_id,produto_id,nome,preco_unitario,quantidade)
    values ('${pedidoId}',${prodId ? `'${prodId}'` : 'null'},'${nome}',${preco},${qty})`);
}
async function mkReserva(pedidoId, prodId, qty, status = 'ativa', rid = null) {
  const id = rid || nid();
  await exec(`insert into public.reservas_estoque (id,pedido_id,produto_id,quantidade,status)
    values ('${id}','${pedidoId}',${prodId ? `'${prodId}'` : 'null'},${qty},'${status}')`);
  return id;
}
async function mkLedger(rid, prodId, qty, kind = 'reserva', saldoAnt = 100) {
  const signed = kind === 'reserva' ? -qty : qty;
  const saldoPost = saldoAnt + signed;
  const r = await one(`insert into public.estoque_movimentacoes
    (produto_id,tipo,quantidade,saldo_anterior,saldo_posterior,referencia_id,referencia_tipo,observacao)
    values ('${prodId}','${kind}',${signed},${saldoAnt},${saldoPost},'${rid}','reserva_estoque','fixture')
    returning id`);
  return r.id;
}
async function mkProv(pedidoId, rid, prodId, qty, movId, origem = '0089') {
  await exec(`insert into public.reserva_proveniencia
    (reserva_id,pedido_id,produto_id,quantidade,origem,estoque_movimentacao_id)
    values ('${rid}','${pedidoId}','${prodId}',${qty},'${origem}','${movId}')`);
}
async function mkConsumo(pedidoId, rid, prodId, qty) {
  await exec(`insert into public.reserva_consumos (reserva_id,pedido_id,produto_id,quantidade,funcionario_id,idem_key)
    values ('${rid}','${pedidoId}','${prodId}',${qty},'${U.producao}','${nid()}')`);
}

// ============================================================================
section('1. ESTRUTURA E PRIVILEGIOS');
// ============================================================================
ok('PostgreSQL 16.x multi-sessao', (await val('select version()')).includes('PostgreSQL 16'), await val('select version()'));

const fnNames = ['criar_pedido_com_reserva','reservar_pedido_atomico','liberar_pedido_atomico',
  'registrar_consumo_reserva','cancelar_pedido_atomico','pedido_cobertura_reserva',
  'exigir_reserva_producao','exigir_consumo_producao'];
const fns = await q(`select p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) owner,
    has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
    has_function_privilege('service_role',p.oid,'EXECUTE') svc_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname = any($1) order by p.proname`, [fnNames]);
const fnMap = Object.fromEntries(fns.rows.map((r) => [r.proname, r]));
for (const f of fnNames) ok(`funcao ${f} existe`, !!fnMap[f], f);
ok('0095 SECURITY DEFINER + search_path=public', fnMap.criar_pedido_com_reserva?.prosecdef === true && String(fnMap.criar_pedido_com_reserva?.proconfig).includes('search_path=public'));
ok('0090 SECURITY DEFINER + owner postgres', fnMap.liberar_pedido_atomico?.prosecdef === true && fnMap.liberar_pedido_atomico?.owner === 'postgres');
ok('0091 SECURITY DEFINER', fnMap.registrar_consumo_reserva?.prosecdef === true);
ok('0093 SECURITY DEFINER', fnMap.cancelar_pedido_atomico?.prosecdef === true);
ok('0095 EXECUTE authenticated=true', fnMap.criar_pedido_com_reserva?.auth_exec === true);
ok('0095 EXECUTE anon=false', fnMap.criar_pedido_com_reserva?.anon_exec === false);
ok('0090 EXECUTE authenticated=false', fnMap.liberar_pedido_atomico?.auth_exec === false);
ok('0090 EXECUTE anon=false', fnMap.liberar_pedido_atomico?.anon_exec === false);
ok('0093 EXECUTE authenticated=true', fnMap.cancelar_pedido_atomico?.auth_exec === true);
ok('0091 EXECUTE authenticated=true', fnMap.registrar_consumo_reserva?.auth_exec === true);
ok('pedido_cobertura_reserva EXECUTE authenticated=true', fnMap.pedido_cobertura_reserva?.auth_exec === true);

const tables = await q(`select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) owner
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in
  ('reservas_estoque','reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','estoque_movimentacoes')`);
const tMap = Object.fromEntries(tables.rows.map((r) => [r.relname, r]));
for (const t of ['reservas_estoque','reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','estoque_movimentacoes'])
  ok(`tabela ${t} existe + owner postgres`, !!tMap[t] && tMap[t].owner === 'postgres', JSON.stringify(tMap[t] || {}));
ok('RLS ligada em reservas_estoque/reserva_consumos/reserva_proveniencia',
  tMap.reservas_estoque?.relrowsecurity === true && tMap.reserva_consumos?.relrowsecurity === true && tMap.reserva_proveniencia?.relrowsecurity === true);
ok('nenhuma tabela critica com FORCE RLS',
  ['reservas_estoque','reserva_consumos','reserva_proveniencia','estoque_movimentacoes'].every((t) => tMap[t]?.relforcerowsecurity === false));

const trigs = await q(`select c.relname, t.tgname, t.tgenabled from pg_trigger t
  join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal and
  (t.tgname ilike '%reserva_producao%' or t.tgname ilike '%consumo_producao%'
   or t.tgname='trigger_proteger_consistencia_financeira' or t.tgname ilike '%cupom%')`);
const trigNames = trigs.rows.map((r) => r.tgname);
ok('0094 trigger financeiro instalado', trigNames.includes('trigger_proteger_consistencia_financeira'), JSON.stringify(trigNames));
ok('trigger de cupom instalado', trigNames.includes('trigger_gerar_cupom_apos_itens'));
ok('gates de producao NAO instalados', !trigNames.some((n) => n.includes('exigir_reserva_producao') || n.includes('exigir_consumo_producao')), JSON.stringify(trigNames));
ok('config controlado existe e inicia false', (await val('select controlado from public.reserva_proveniencia_config where id=true')) === false);

// ============================================================================
section('2. CRIACAO ATOMICA 0095');
// ============================================================================
await test('T1', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  const o = await one('select * from public.pedidos where id=$1', [id]);
  const it = await qr('select * from public.pedido_itens where pedido_id=$1', [id]);
  const rs = await qr('select * from public.reservas_estoque where pedido_id=$1', [id]);
  const led = await ledgerFor(rs[0]?.id);
  const prov = await provFor(id);
  const hist = await qr('select * from public.pedido_status_historico where pedido_id=$1', [id]);
  const c = await counts(id);
  const cb = await cobertura(id);
  ok('T1 status criado', res.status === 'criado', JSON.stringify(res));
  ok('T1 subtotal/taxa/total retirada', Number(o.subtotal) === 20 && Number(o.taxa_entrega) === 0 && Number(o.total) === 20, JSON.stringify({ s: o.subtotal, t: o.taxa_entrega, tot: o.total }));
  ok('T1 user_id = auth.uid', o.user_id === U.cliente, o.user_id);
  ok('T1 status/pagamento iniciais', o.status === 'recebido' && o.pagamento_status === 'pendente' && o.pagamento_modalidade === 'online', JSON.stringify({ s: o.status, p: o.pagamento_status, m: o.pagamento_modalidade }));
  ok('T1 item unico qtd 2 preco 10', it.length === 1 && it[0].quantidade === 2 && Number(it[0].preco_unitario) === 10, JSON.stringify(it));
  ok('T1 reserva ativa qtd 2', rs.length === 1 && rs[0].status === 'ativa' && rs[0].quantidade === 2, JSON.stringify(rs));
  ok('T1 ledger -2 100->98', led.length === 1 && led[0].tipo === 'reserva' && led[0].quantidade === -2 && led[0].saldo_anterior === 100 && led[0].saldo_posterior === 98, JSON.stringify(led));
  ok('T1 sem proveniencia (controlado=false)', prov.length === 0, JSON.stringify(prov));
  ok('T1 historico de criacao', hist.length === 1 && hist[0].para_status === 'recebido' && hist[0].motivo === 'criacao_atomica:checkout', JSON.stringify(hist));
  ok('T1 estoque 100->98', (await stock(P.unit)) === 98, await stock(P.unit));
  ok('T1 cobertura coberto', cb.status === 'coberto' && cb.cobertas === 2, JSON.stringify(cb));
  ok('T1 contagens atomicas 1/1/1/1/1', c.pedidos === 1 && c.itens === 1 && c.reservas === 1 && c.movs === 1 && c.hist === 1, JSON.stringify(c));
});

await test('T1b', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosEntrega({ tipo_imovel: 'apartamento', apartamento: '' }), [{ produto_id: P.unit, quantidade: 2 }]);
  const c = await counts(id);
  ok('T1b apartamento sem numero => dados_invalidos/apartamento', res.status === 'dados_invalidos' && res.campo === 'apartamento', JSON.stringify(res));
  ok('T1b apartamento sem numero nao grava pedido/reserva', c.pedidos === 0 && c.itens === 0 && c.reservas === 0 && c.movs === 0, JSON.stringify(c));
});

await test('T2', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosEntrega(), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  const o = await one('select * from public.pedidos where id=$1', [id]);
  ok('T2 entrega taxa default 6 e total 26', res.status === 'criado' && Number(o.taxa_entrega) === 6 && Number(o.total) === 26, JSON.stringify({ res, taxa: o.taxa_entrega, total: o.total }));
  ok('T2 endereco/cep persistidos', o.endereco === 'Rua Teste, 100' && o.cep === '01001000' && o.bairro === 'Centro', JSON.stringify({ e: o.endereco, c: o.cep, b: o.bairro }));
});

await test('T3', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.promo, quantidade: 1 }]);
  await superUser();
  const it = await one('select * from public.pedido_itens where pedido_id=$1', [id]);
  ok('T3 preco promocional 7.50', res.status === 'criado' && Number(it.preco_unitario) === 7.5 && Number(res.subtotal) === 7.5, JSON.stringify({ it, res }));
});

await test('T4', async () => {
  const id = nid();
  const ok50 = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.combo, quantidade: 50 }]);
  await superUser();
  const rs50 = await qr('select quantidade from public.reservas_estoque where pedido_id=$1', [id]);
  ok('T4 combo 50 aceito e reserva 50', ok50.status === 'criado' && rs50.length === 1 && rs50[0].quantidade === 50, JSON.stringify({ ok50, rs50 }));
  await actAs(U.cliente);
  const id2 = nid();
  const bad49 = await rpc(id2, 'checkout', dadosBase(), [{ produto_id: P.combo, quantidade: 49 }]);
  const bad51 = await rpc(nid(), 'checkout', dadosBase(), [{ produto_id: P.combo, quantidade: 51 }]);
  ok('T4 combo 49/51 rejeitado regra_combo', bad49.status === 'regra_combo' && bad51.status === 'regra_combo', JSON.stringify({ bad49, bad51 }));
  const id3 = nid();
  const ok100 = await rpc(id3, 'checkout', dadosBase(), [{ produto_id: P.combo, quantidade: 100 }]);
  ok('T4 combo 100 aceito', ok100.status === 'criado' && ok100.reserva?.itens === 1, JSON.stringify(ok100));
});

await test('T5', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase(), [{ produto_id: null, nome: 'Combo Montado', quantidade: 1, preco_unitario: 10 }]);
  await superUser();
  const c = await counts(id);
  ok('T5 montagem sem modelagem rejeitada', res.status === 'montagem_sem_modelagem', JSON.stringify(res));
  ok('T5 montagem sem residuos', c.pedidos === 0 && c.itens === 0 && c.reservas === 0 && c.movs === 0 && c.hist === 0, JSON.stringify(c));
  ok('T5 estoque intacto', (await stock(P.unit)) === 100, await stock(P.unit));
});

await test('T6', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase(), [{ produto_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantidade: 1 }]);
  await superUser();
  const c = await counts(id);
  ok('T6 produto inexistente', res.status === 'produto_inexistente', JSON.stringify(res));
  ok('T6 sem residuos', c.pedidos === 0 && c.itens === 0 && c.reservas === 0, JSON.stringify(c));
});

await test('T7', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase(), [{ produto_id: P.indisponivel, quantidade: 1 }]);
  ok('T7 produto indisponivel', res.status === 'produto_indisponivel', JSON.stringify(res));
});

await test('T8', async () => {
  const statuses = [];
  for (const qty of [0, -1, 1.5, 'abc']) {
    const res = await rpc(nid(), 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: qty }]);
    statuses.push(res.status);
  }
  ok('T8 quantidades invalidas 0/-1/1.5/abc', statuses.every((s) => s === 'itens_invalidos' || s === 'quantidade_invalida'), JSON.stringify(statuses));
});

await test('T9', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.stock1, quantidade: 2 }]);
  await superUser();
  const c = await counts(id);
  ok('T9 estoque insuficiente', res.status === 'estoque_insuficiente', JSON.stringify(res));
  ok('T9 sem residuos e estoque intacto', c.pedidos === 0 && c.itens === 0 && c.reservas === 0 && c.movs === 0 && (await stock(P.stock1)) === 1, JSON.stringify({ c, s: await stock(P.stock1) }));
});

await test('T10', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTE10' }), [{ produto_id: P.unit, quantidade: 10 }]);
  ok('T10 cupom percentual 10%', res.status === 'criado' && res.desconto === 10 && res.total === 90, JSON.stringify(res));
});

await test('T11', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTEVALOR' }), [{ produto_id: P.unit, quantidade: 10 }]);
  ok('T11 cupom valor fixo 5', res.status === 'criado' && res.desconto === 5 && res.total === 95, JSON.stringify(res));
});

await test('T12', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'NAOEXISTE' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T12 cupom inexistente', res.status === 'cupom_invalido' && res.motivo === 'nao_encontrado', JSON.stringify(res));
});

await test('T13', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTEESGOTADO' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T13 cupom esgotado', res.status === 'cupom_esgotado', JSON.stringify(res));
});

await test('T14', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTEINATIVO' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T14 cupom inativo', res.status === 'cupom_invalido' && res.motivo === 'inativo', JSON.stringify(res));
});

await test('T15', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTEMIN' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T15 cupom abaixo do minimo', res.status === 'cupom_invalido' && res.motivo === 'minimo', JSON.stringify(res));
});

await test('T16', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTEPRODUTO' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T16 cupom restrito a outro produto', res.status === 'cupom_invalido' && res.motivo === 'produtos', JSON.stringify(res));
});

await test('T17', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cupom: 'TESTECLIENTE', telefone: '11888887777' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T17 cupom de outro cliente', res.status === 'cupom_invalido' && res.motivo === 'cliente', JSON.stringify(res));
});

await test('T18', async () => {
  await superUser();
  await exec('alter table public.loja_config add column taxa_entrega numeric');
  await exec('update public.loja_config set taxa_entrega=9.90 where id=true');
  await actAs(U.cliente);
  const res = await rpc(nid(), 'checkout', dadosEntrega(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T18 taxa configuravel 9.90', res.status === 'criado' && Number(res.taxa_entrega) === 9.9, JSON.stringify(res));
});

await test('T19', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase({ desconto_manual: 5 }), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T19 admin pdv desconto manual 5', res.status === 'criado' && res.desconto === 5 && res.total === 15, JSON.stringify(res));
}, { uid: U.admin });

await test('T20', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ desconto_manual: 5 }), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T20 checkout ignora desconto manual', res.status === 'criado' && res.desconto === 0 && res.total === 20, JSON.stringify(res));
});

await test('T21', async () => {
  const res = await rpc(nid(), 'atendente', dadosBase({ desconto_manual: 5 }), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T21 atendente desconto manual 5', res.status === 'criado' && res.desconto === 5 && res.total === 15, JSON.stringify(res));
}, { uid: U.atendente });

await test('T22', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase({ desconto_manual: 999 }), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T22 desconto limitado ao subtotal', res.status === 'criado' && res.desconto === 20 && res.total === 0, JSON.stringify(res));
}, { uid: U.admin });

await test('T23', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase({ desconto_manual: -5 }), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T23 desconto negativo ignorado', res.status === 'criado' && res.desconto === 0 && res.total === 20, JSON.stringify(res));
}, { uid: U.admin });

await test('T24', async () => {
  const res = await rpc(nid(), 'pdv', dadosEntrega({ forma_pagamento: 'dinheiro', pagamento_imediato: true }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T24 pdv dinheiro imediato pago/na_entrega', res.status === 'criado' && res.pagamento_status === 'pago' && res.pagamento_modalidade === 'na_entrega', JSON.stringify(res));
}, { uid: U.admin });

await test('T25', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase({ forma_pagamento: 'pix', pagamento_imediato: true }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T25 pix nunca nasce pago', res.status === 'criado' && res.pagamento_status === 'pendente' && res.pagamento_modalidade === 'online', JSON.stringify(res));
}, { uid: U.admin });

await test('T26', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ forma_pagamento: 'dinheiro', pagamento_imediato: true }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T26 checkout dinheiro imediato nao paga', res.status === 'criado' && res.pagamento_status === 'pendente', JSON.stringify(res));
});

await test('T27', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase({ forma_pagamento: 'credito', pagamento_imediato: true }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T27 pdv credito imediato pago/online', res.status === 'criado' && res.pagamento_status === 'pago' && res.pagamento_modalidade === 'online', JSON.stringify(res));
}, { uid: U.admin });

await test('T28', async () => {
  const id = nid();
  const itens = [{ produto_id: P.unit, quantidade: 2 }];
  const r1 = await rpc(id, 'checkout', dadosBase(), itens);
  const r2 = await rpc(id, 'checkout', dadosBase(), itens);
  await superUser();
  const c = await counts(id);
  ok('T28 idempotencia mesma carga -> ja_criado', r1.status === 'criado' && r2.status === 'ja_criado', JSON.stringify({ r1, r2 }));
  ok('T28 sem duplicacao e estoque unico', c.pedidos === 1 && c.itens === 1 && c.reservas === 1 && c.movs === 1 && (await stock(P.unit)) === 98, JSON.stringify({ c, s: await stock(P.unit) }));
});

await test('T29', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  const r2 = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 3 }]);
  await superUser();
  const c = await counts(id);
  ok('T29 idempotencia divergente itens', r2.status === 'idempotencia_divergente' && r2.motivo === 'itens', JSON.stringify(r2));
  ok('T29 divergencia nao altera dados', c.itens === 1 && (await stock(P.unit)) === 98, JSON.stringify({ c, s: await stock(P.unit) }));
});

await test('T30', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  const r2 = await rpc(id, 'checkout', dadosBase({ cliente_nome: 'Outro Nome' }), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T30 idempotencia divergente dados', r2.status === 'idempotencia_divergente' && r2.motivo === 'dados', JSON.stringify(r2));
});

await test('T31', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  await actAs(U.outsider);
  const r2 = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  ok('T31 idempotencia de outro usuario', r2.status === 'pedido_de_outro_usuario', JSON.stringify(r2));
});

await test('T32', async () => {
  const id = nid();
  const r1 = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.stock1, quantidade: 2 }]);
  await superUser();
  await exec(`update public.produtos set estoque=10 where id='${P.stock1}'`);
  await actAs(U.cliente);
  const r2 = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.stock1, quantidade: 2 }]);
  await superUser();
  const c = await counts(id);
  ok('T32 retry apos falha de estoque cria', r1.status === 'estoque_insuficiente' && r2.status === 'criado', JSON.stringify({ r1, r2 }));
  ok('T32 sem residuo da tentativa falha', c.pedidos === 1 && c.itens === 1 && c.reservas === 1 && (await stock(P.stock1)) === 8, JSON.stringify({ c, s: await stock(P.stock1) }));
});

await test('T33', async () => {
  const id = nid();
  await superUser();
  await exec('alter function public.reservar_pedido_atomico(uuid) rename to reservar_pedido_atomico_tmp');
  await actAs(U.cliente);
  const res = await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await exec('alter function public.reservar_pedido_atomico_tmp(uuid) rename to reservar_pedido_atomico');
  ok('T33 dependencia ausente detectada', res.status === 'dependencia_ausente', JSON.stringify(res));
});

await test('T34', async () => {
  const res = await rpc(nid(), 'invalido', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T34 canal invalido', res.status === 'canal_invalido', JSON.stringify(res));
});

await test('T35', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T35 sem sessao -> permissao_negada', res.status === 'permissao_negada', JSON.stringify(res));
}, { uid: null, role: 'authenticated', claims: { role: 'authenticated' } });

await test('T36', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T36 cliente nao usa pdv', res.status === 'permissao_negada', JSON.stringify(res));
});

await test('T37', async () => {
  const res = await rpc(nid(), 'atendente', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T37 cliente nao usa atendente', res.status === 'permissao_negada', JSON.stringify(res));
});

await test('T38', async () => {
  const res = await rpc(nid(), 'pdv', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T38 admin usa pdv', res.status === 'criado', JSON.stringify(res));
}, { uid: U.admin });

await test('T39', async () => {
  const res = await rpc(nid(), 'atendente', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T39 atendente usa atendente', res.status === 'criado', JSON.stringify(res));
}, { uid: U.atendente });

await test('T40', async () => {
  const badDados = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [nid(), 'checkout', '[]', JSON.stringify([{ produto_id: P.unit, quantidade: 1 }])]);
  const badItens = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [nid(), 'checkout', JSON.stringify(dadosBase()), '{}']);
  const empty = await rpc(nid(), 'checkout', dadosBase(), []);
  ok('T40 p_dados/p_itens tipo invalido', badDados.rows[0].res.status === 'entrada_invalida' && badItens.rows[0].res.status === 'entrada_invalida', JSON.stringify({ d: badDados.rows[0].res, i: badItens.rows[0].res }));
  ok('T40 itens vazios', empty.status === 'itens_invalidos' && empty.motivo === 'vazio', JSON.stringify(empty));
});

await test('T41', async () => {
  const r = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [null, 'checkout', JSON.stringify(dadosBase()), JSON.stringify([{ produto_id: P.unit, quantidade: 1 }])]);
  ok('T41 p_id nulo', r.rows[0].res.status === 'entrada_invalida' && r.rows[0].res.motivo === 'p_id', JSON.stringify(r.rows[0].res));
});

await test('T42', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cep: '123' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T42 cep invalido', res.status === 'dados_invalidos' && res.campo === 'cep', JSON.stringify(res));
});

await test('T43', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ cpf_cnpj: '123' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T43 cpf/cnpj invalido', res.status === 'dados_invalidos' && res.campo === 'cpf_cnpj', JSON.stringify(res));
});

await test('T44', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ agendado_para: '2020-01-01T10:00:00Z' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T44 agendamento passado', res.status === 'dados_invalidos' && res.campo === 'agendado_para', JSON.stringify(res));
});

await test('T45', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase({ destino_lat: 999 }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T45 latitude fora de faixa', res.status === 'dados_invalidos' && res.campo === 'destino_lat', JSON.stringify(res));
});

await test('T46', async () => {
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase({
    id: 'deadbeef-dead-4ead-8ead-deadbeefdead', user_id: U.outsider, status: 'entregue',
    total: 1, subtotal: 1, taxa_entrega: 999, desconto: 999, pagamento_status: 'pago', numero: 1,
  }), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  const o = await one('select * from public.pedidos where id=$1', [id]);
  ok('T46 campos forjados ignorados', res.status === 'criado' && o.id === id && o.user_id === U.cliente && o.status === 'recebido' && o.pagamento_status === 'pendente' && Number(o.total) === 20 && Number(o.taxa_entrega) === 0 && Number(o.desconto) === 0 && o.numero !== 1, JSON.stringify({ id: o.id, u: o.user_id, s: o.status, p: o.pagamento_status, t: o.total, x: o.taxa_entrega, d: o.desconto, n: o.numero }));
});

await test('T47', async () => {
  const res = await rpc(nid(), 'checkout', dadosBase(), [{ produto_id: 'not-a-uuid', quantidade: 1 }]);
  ok('T47 produto_id malformado', res.status === 'itens_invalidos' && res.motivo === 'produto_id', JSON.stringify(res));
});

await test('T48', async () => {
  const res = await rpc(nid(), 'checkout', dadosEntrega({ endereco: '' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T48 entrega sem endereco', res.status === 'dados_invalidos' && res.campo === 'endereco', JSON.stringify(res));
});

await test('T49', async () => {
  const res = await rpc(nid(), 'checkout', dadosEntrega({ tipo_imovel: 'apartamento', apartamento: '' }), [{ produto_id: P.unit, quantidade: 1 }]);
  ok('T49 apartamento sem numero (classificacao atual)', (res.status === 'dados_invalidos' && res.campo === 'apartamento') || res.status === 'erro_interno', JSON.stringify(res));
});

// ============================================================================
section('3. COBERTURA / PROVENIENCIA');
// ============================================================================
await test('CB1', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  const cb = await cobertura(id);
  ok('CB1 pedido valido coberto', cb.status === 'coberto' && cb.cobertas === 2, JSON.stringify(cb));
});

await test('CB2', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  const cb = await cobertura(id);
  ok('CB2 sem reserva -> sem_reserva faltante 10', cb.status === 'sem_reserva' && cb.faltante === 10, JSON.stringify(cb));
});

await test('CB3', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, null, 2, 'Montagem');
  const cb = await cobertura(id);
  ok('CB3 montagem pura -> montagem', cb.status === 'montagem' && cb.montagem === 2, JSON.stringify(cb));
});

await test('CB4', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  await mkReserva(id, P.unit, 10, 'ativa');
  const cb = await cobertura(id);
  ok('CB4 reserva sem ledger -> debito_nao_comprovado', cb.status === 'reconciliacao_pendente' && cb.motivo === 'debito_nao_comprovado', JSON.stringify(cb));
});

await test('CB5', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 20, 'ativa');
  await mkLedger(rid, P.unit, 20);
  const cb = await cobertura(id);
  ok('CB5 cobertura excedente', cb.status === 'reconciliacao_pendente' && cb.motivo === 'cobertura_excedente', JSON.stringify(cb));
});

await test('CB6', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 1);
  await superUser(); await actAs(U.outsider);
  const cb = await cobertura(id, U.outsider);
  ok('CB6 cobertura de outro usuario', cb.status === 'pedido_de_outro_usuario', JSON.stringify(cb));
});

await test('CB7', async () => {
  const cb = await cobertura(nid());
  ok('CB7 pedido inexistente', cb.status === 'pedido_invalido' && cb.motivo === 'nao_encontrado', JSON.stringify(cb));
});

await test('CB8', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 1);
  const cb = await cobertura(id);
  ok('CB8 pedido cancelado', cb.status === 'cancelado', JSON.stringify(cb));
});

await test('CB9', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'ativa');
  await mkLedger(rid, P.unit, 10);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const cb = await cobertura(id);
  ok('CB9 controlado sem proveniencia', cb.status === 'reconciliacao_pendente' && cb.motivo === 'proveniencia_ausente', JSON.stringify(cb));
});

await test('R1', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  await actAs(U.cliente);
  const res = await q('select public.reservar_pedido_atomico($1) as r', [id]);
  await superUser();
  const prov = await provFor(id);
  const c = await counts(id);
  ok('R1 controlado=true cria 1 marcador', prov.length === 1 && prov[0].origem === '0089' && prov[0].quantidade === 2, JSON.stringify(prov));
  ok('R1 idempotente ja_reservado', res.rows[0].r.status === 'ja_reservado' && c.reservas === 1 && c.movs === 1, JSON.stringify({ r: res.rows[0].r, c }));
});

await test('R2', async () => {
  const id = nid();
  const rid = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  await mkReserva(id, P.unit, 10, 'ativa', rid);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const r = await q('select public.reservar_pedido_atomico($1) as r', [id]);
  ok('R2 0089 bloqueia reserva sem debito', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('R3', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  const res = await rpc(id, 'checkout', dadosBase(), [
    { produto_id: P.unit, quantidade: 2 },
    { produto_id: P.outro, quantidade: 1 },
  ]);
  await superUser();
  const prov = await provFor(id);
  const rs = await qr('select * from public.reservas_estoque where pedido_id=$1 order by produto_id', [id]);
  const movs = await qr(`select m.* from public.estoque_movimentacoes m
    where m.referencia_id in (select id from public.reservas_estoque where pedido_id=$1)
    order by m.produto_id`, [id]);
  const cb = await cobertura(id);
  ok('R3 duas reservas -> dois marcadores 0089', res.status === 'criado' && prov.length === 2 && rs.length === 2 && prov.every((p) => p.origem === '0089'), JSON.stringify({ prov, rs }));
  ok('R3 cada marcador aponta para o debito correto', prov.length === 2 && prov.every((p) => movs.some((m) => m.id === p.estoque_movimentacao_id && m.produto_id === p.produto_id && m.quantidade === -p.quantidade)), JSON.stringify(movs));
  ok('R3 cobertura integral', cb.status === 'coberto' && cb.cobertas === 3, JSON.stringify(cb));
});

// ============================================================================
section('4. CONSUMO 0091');
// ============================================================================
await test('K1', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 10 }]);
  await superUser();
  const rid = await resId(id);
  const k1 = nid(), k2 = nid(), k3 = nid(), k4 = nid(), k5 = nid();
  await actAs(U.producao);
  const r1 = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 3, k1, null, 'primeira retirada']);
  const r2 = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 2, k2, null, 'segunda retirada']);
  await superUser();
  const rs = await one('select * from public.reservas_estoque where id=$1', [rid]);
  const cons = await qr('select * from public.reserva_consumos where reserva_id=$1 order by created_at', [rid]);
  ok('K1 consumo parcial 3+2', r1.rows[0].r.status === 'consumido' && r1.rows[0].r.restante === 7 && r2.rows[0].r.status === 'consumido' && r2.rows[0].r.restante === 5, JSON.stringify({ r1: r1.rows[0].r, r2: r2.rows[0].r }));
  ok('K1 reservations ativa + 2 consumos', rs.status === 'ativa' && cons.length === 2 && cons[0].quantidade === 3 && cons[1].quantidade === 2, JSON.stringify({ rs, cons }));
  ok('K1 estoque nao muda no consumo', (await stock(P.unit)) === 90, await stock(P.unit));
  await actAs(U.producao);
  const replay = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 3, k1, null, 'primeira retirada']);
  const conflito = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 4, k1, null, 'primeira retirada']);
  ok('K1 replay ja_registrado', replay.rows[0].r.status === 'ja_registrado', JSON.stringify(replay.rows[0].r));
  ok('K1 mesma chave com quantidade diferente -> chave_conflito', conflito.rows[0].r.status === 'chave_conflito', JSON.stringify(conflito.rows[0].r));
  const div = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 1, k3, P.outro, 'produto errado']);
  ok('K1 produto divergente', div.rows[0].r.status === 'produto_divergente', JSON.stringify(div.rows[0].r));
  const full = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 5, k4, null, 'fecha']);
  await superUser();
  const rs2 = await one('select status from public.reservas_estoque where id=$1', [rid]);
  ok('K1 consumo total -> consumida/restante 0', full.rows[0].r.status === 'consumido' && full.rows[0].r.restante === 0 && rs2.status === 'consumida', JSON.stringify({ r: full.rows[0].r, rs2 }));
  await actAs(U.producao);
  const after = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 1, k5, null, 'depois']);
  ok('K1 reserva encerrada', after.rows[0].r.status === 'reserva_encerrada', JSON.stringify(after.rows[0].r));
});

await test('K2', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 10 }]);
  await superUser();
  const rid = await resId(id);
  await actAs(U.cliente);
  const r = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 1, nid(), null, null]);
  ok('K2 cliente nao consome', r.rows[0].r.status === 'permissao_negada', JSON.stringify(r.rows[0].r));
});

await test('K3', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 10 }]);
  await superUser();
  const rid = await resId(id);
  await actAs(U.admin);
  await exec(`update public.pedidos set status='cancelado' where id='${id}'`);
  await actAs(U.producao);
  const r = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 1, nid(), null, null]);
  ok('K3 consumo em pedido cancelado -> status_invalido', r.rows[0].r.status === 'status_invalido', JSON.stringify(r.rows[0].r));
});

await test('K4', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'ativa');
  await actAs(U.producao);
  const r = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 1, nid(), null, null]);
  ok('K4 consumo sem ledger -> reconciliacao_pendente', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

// ============================================================================
section('5. CANCELAMENTO 0093 / LIBERACAO 0090');
// ============================================================================
await test('C1', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 10 }]);
  await superUser();
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'cliente cancelou']);
  await superUser();
  const o = await one('select status from public.pedidos where id=$1', [id]);
  const rid = await resId(id);
  const rs = await one('select * from public.reservas_estoque where id=$1', [rid]);
  const led = await ledgerFor(rid);
  const hist = await qr('select * from public.pedido_status_historico where pedido_id=$1', [id]);
  ok('C1 cancelamento ativo libera tudo', r.rows[0].r.status === 'cancelado' && r.rows[0].r.liberacao.status === 'liberado' && Number(r.rows[0].r.liberacao.unidades) === 10, JSON.stringify(r.rows[0].r));
  ok('C1 status cancelado + reserva liberada', o.status === 'cancelado' && rs.status === 'liberada', JSON.stringify({ o, rs }));
  ok('C1 estoque devolvido 90->100', (await stock(P.unit)) === 100, await stock(P.unit));
  ok('C1 ledger liberacao +10 + historico', led.some((x) => x.tipo === 'liberacao' && x.quantidade === 10) && hist.some((x) => x.para_status === 'cancelado'), JSON.stringify({ led, hist }));
  await actAs(U.cliente);
  const retry = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'retry']);
  await superUser();
  const lib = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C1 retry cancelamento ja_cancelado', retry.rows[0].r.status === 'ja_cancelado', JSON.stringify(retry.rows[0].r));
  ok('C1 retry 0090 ja_liberado sem credito', lib.rows[0].r.status === 'ja_liberado' && (await stock(P.unit)) === 100, JSON.stringify({ r: lib.rows[0].r, s: await stock(P.unit) }));
});

await test('C2', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 10 }]);
  await superUser();
  const rid = await resId(id);
  await actAs(U.producao);
  await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 4, nid(), null, null]);
  await superUser();
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  await superUser();
  const led = await ledgerFor(rid);
  ok('C2 cancelamento parcial devolve apenas restante 6', r.rows[0].r.status === 'cancelado' && Number(r.rows[0].r.liberacao.unidades) === 6 && (await stock(P.unit)) === 96, JSON.stringify({ r: r.rows[0].r, s: await stock(P.unit) }));
  ok('C2 ledger liberacao +6', led.some((x) => x.tipo === 'liberacao' && x.quantidade === 6), JSON.stringify(led));
});

await test('C3', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 10 }]);
  await superUser();
  const rid = await resId(id);
  await actAs(U.producao);
  await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 10, nid(), null, null]);
  await superUser();
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  await superUser();
  const led = await ledgerFor(rid);
  ok('C3 retirada total nao devolve saldo', r.rows[0].r.status === 'cancelado' && Number(r.rows[0].r.liberacao.unidades) === 0 && (await stock(P.unit)) === 90, JSON.stringify({ r: r.rows[0].r, s: await stock(P.unit) }));
  ok('C3 sem ledger liberacao', !led.some((x) => x.tipo === 'liberacao'), JSON.stringify(led));
});

await test('C4', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'cancelada');
  await mkLedger(rid, P.unit, 10);
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C4 reserva cancelada bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C5', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'liberada');
  await mkLedger(rid, P.unit, 10);
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C5 liberada sem credito bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C6', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'ativa');
  await mkLedger(rid, P.unit, 10);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C6 ativa sem proveniencia bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C7', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 5, 'ativa');
  const mid = await mkLedger(rid, P.unit, 5);
  await mkProv(id, rid, P.unit, 5, mid);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C7 reserva inferior ao item bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C8', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 20, 'ativa');
  const mid = await mkLedger(rid, P.unit, 20);
  await mkProv(id, rid, P.unit, 20, mid);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C8 reserva superior ao item bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C9', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' }); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.outro, 10, 'ativa');
  const mid = await mkLedger(rid, P.outro, 10);
  await mkProv(id, rid, P.outro, 10, mid);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C9 reserva de produto estranho bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C10', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' });
  await mkItem(id, P.unit, 10); await mkItem(id, P.outro, 5);
  const rA = await mkReserva(id, P.unit, 10, 'ativa');
  const mA = await mkLedger(rA, P.unit, 10, 'reserva', 100);
  await mkProv(id, rA, P.unit, 10, mA);
  const rB = await mkReserva(id, P.outro, 5, 'consumida');
  await mkLedger(rB, P.outro, 5, 'reserva', 100);
  await mkConsumo(id, rB, P.outro, 5);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await exec(`update public.produtos set estoque=100 where id in ('${P.unit}','${P.outro}')`);
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C10 mistura ativa+consumida coerente', r.rows[0].r.status === 'liberado' && Number(r.rows[0].r.unidades) === 10, JSON.stringify(r.rows[0].r));
  ok('C10 credita so a ativa', (await stock(P.unit)) === 110 && (await stock(P.outro)) === 100, JSON.stringify({ a: await stock(P.unit), b: await stock(P.outro) }));
});

await test('C11', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'cancelado' });
  await mkItem(id, P.unit, 10); await mkItem(id, P.outro, 5);
  const rA = await mkReserva(id, P.unit, 10, 'ativa');
  const mA = await mkLedger(rA, P.unit, 10, 'reserva', 100);
  await mkProv(id, rA, P.unit, 10, mA);
  const rB = await mkReserva(id, P.outro, 5, 'liberada');
  await mkLedger(rB, P.outro, 5, 'reserva', 100);
  await mkLedger(rB, P.outro, 5, 'liberacao', 95);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const r = await q('select public.liberar_pedido_atomico($1) as r', [id]);
  ok('C11 ativa+liberada bloqueia', r.rows[0].r.status === 'reconciliacao_pendente', JSON.stringify(r.rows[0].r));
});

await test('C12', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, null, 2, 'Montagem');
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  await superUser();
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('C12 pedido so montagem cancela sem reserva', r.rows[0].r.status === 'cancelado' && o.status === 'cancelado', JSON.stringify({ r: r.rows[0].r, o }));
});

await test('C13', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  await superUser();
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('C13 sem reserva bloqueia antes da escrita', r.rows[0].r.status === 'reconciliacao_pendente' && r.rows[0].r.motivo === 'sem_reserva' && o.status === 'recebido', JSON.stringify({ r: r.rows[0].r, o }));
});

await test('C14', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'liberada');
  await mkLedger(rid, P.unit, 10);
  await mkLedger(rid, P.unit, 10, 'liberacao', 90);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  ok('C14 ativo com todas liberadas bloqueia', r.rows[0].r.status === 'reconciliacao_pendente' && r.rows[0].r.motivo === 'sem_reserva_ativa', JSON.stringify(r.rows[0].r));
});

await test('C15', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.outsider);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  ok('C15 terceiro nao cancela', r.rows[0].r.status === 'permissao_negada', JSON.stringify(r.rows[0].r));
});

await test('C16', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'admin cancelou']);
  ok('C16 admin cancela pedido de cliente', r.rows[0].r.status === 'cancelado', JSON.stringify(r.rows[0].r));
});

await test('C17', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'em_producao' }); await mkItem(id, P.unit, 1);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  ok('C17 em producao requer analise', r.rows[0].r.status === 'requer_analise', JSON.stringify(r.rows[0].r));
});

await test('C18', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { status: 'entregue' }); await mkItem(id, P.unit, 1);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  ok('C18 entregue nao cancela', r.rows[0].r.status === 'status_invalido', JSON.stringify(r.rows[0].r));
});

await test('C19', async () => {
  const id = nid();
  await superUser(); await mkPedido(id, { pag: 'pago' }); await mkItem(id, P.unit, 1);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  ok('C19 pago nao cancela', r.rows[0].r.status === 'pagamento_nao_elegivel', JSON.stringify(r.rows[0].r));
});

await test('C20', async () => {
  const id = nid();
  await superUser(); await mkPedido(id);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  ok('C20 sem itens pedido_invalido', r.rows[0].r.status === 'pedido_invalido', JSON.stringify(r.rows[0].r));
});

// C21 proper: expect exception when controlado=false and active reservation has no marker
await test('C22', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.cliente);
  await expectThrow('C22 controlado=false -> 0090 bloqueia e 0093 rollback', async () => {
    await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  });
  await superUser();
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('C22 rollback preserva recebido e reserva ativa', o.status === 'recebido' && (await stock(P.unit)) === 99, JSON.stringify({ o, s: await stock(P.unit) }));
});

// ============================================================================
section('6. PAGAMENTO 0094');
// ============================================================================
await test('PG1', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  await exec(`update public.pedidos set pagamento_status='pago' where id='${id}'`);
  const o = await one('select pagamento_status from public.pedidos where id=$1', [id]);
  ok('PG1 pendente -> pago permitido', o.pagamento_status === 'pago', JSON.stringify(o));
  await expectThrow('PG1 pago -> pendente bloqueado', async () => {
    await exec(`update public.pedidos set pagamento_status='pendente' where id='${id}'`);
  });
  await expectThrow('PG1 pago -> falhou bloqueado', async () => {
    await exec(`update public.pedidos set pagamento_status='falhou' where id='${id}'`);
  });
  await exec(`update public.pedidos set pagamento_status='reembolsado' where id='${id}'`);
  const o2 = await one('select pagamento_status from public.pedidos where id=$1', [id]);
  ok('PG1 pago -> reembolsado permitido', o2.pagamento_status === 'reembolsado', JSON.stringify(o2));
});

await test('PG2', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  await expectThrow('PG2 cancelar+confirmar no mesmo UPDATE bloqueado', async () => {
    await exec(`update public.pedidos set status='cancelado', pagamento_status='pago' where id='${id}'`);
  });
});

await test('PG3', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  await exec(`update public.pedidos set pagamento_status='pago' where id='${id}'`);
  await expectThrow('PG3 cancelar pedido pago bloqueado', async () => {
    await exec(`update public.pedidos set status='cancelado' where id='${id}'`);
  });
});

await test('PG4', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  await exec(`update public.pedidos set status='cancelado' where id='${id}'`);
  await superUser();
  await exec('alter table public.pedidos disable trigger trigger_validar_transicao');
  await actAs(U.admin);
  await expectThrow('PG4 reabrir cancelado -> recebido bloqueado', async () => {
    await exec(`update public.pedidos set status='recebido' where id='${id}'`);
  });
  await superUser();
  await exec('alter table public.pedidos enable trigger trigger_validar_transicao');
});

await test('PG5', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  await exec(`update public.pedidos set pagamento_status='pago' where id='${id}'`);
  await superUser();
  await exec('alter table public.pedidos disable trigger trigger_validar_transicao');
  await actAs(null, 'service_role', { role: 'service_role' });
  await expectThrow('PG5 service_role nao burla 0094', async () => {
    await exec(`update public.pedidos set pagamento_status='pendente' where id='${id}'`);
  });
  await superUser();
  await exec('alter table public.pedidos enable trigger trigger_validar_transicao');
});

// ============================================================================
section('7. IMPRESSAO');
// ============================================================================
await test('I1', async () => {
  const id = nid();
  await rpc(id, 'pdv', dadosBase({ forma_pagamento: 'dinheiro', pagamento_imediato: true }), [{ produto_id: P.unit, quantidade: 2 }]);
  await superUser();
  const jobs = await qr('select * from public.fila_impressao where pedido_id=$1', [id]);
  ok('I1 pedido pago gera 1 job', jobs.length === 1 && jobs[0].trabalho_uuid === `${id}:pedido`, JSON.stringify(jobs.map((j) => ({ id: j.id, t: j.trabalho_uuid, s: j.status }))));
  const payload = jobs[0]?.payload || '';
  ok('I1 payload com cupom, item e total', payload.includes('CUPOM FISCAL') && payload.includes('(2)') && payload.includes('Total: R$'), String(payload).slice(0, 300));
  await q('select public.enfileirar_cupom($1)', [id]);
  const jobs2 = await qr('select count(*)::int n from public.fila_impressao where pedido_id=$1', [id]);
  ok('I1 reenfileirar nao duplica', jobs2[0].n === 1, JSON.stringify(jobs2));
  await actAs(U.admin);
  await q('select public.gerar_cupons_pedidos_pagos()');
  await superUser();
  const jobs3 = await qr('select count(*)::int n from public.fila_impressao where pedido_id=$1', [id]);
  ok('I1 backfill nao duplica', jobs3[0].n === 1, JSON.stringify(jobs3));
}, { uid: U.admin });

await test('I2', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.admin);
  await exec(`update public.pedidos set pagamento_status='pago' where id='${id}'`);
  await superUser();
  const jobs = await qr('select count(*)::int n from public.fila_impressao where pedido_id=$1', [id]);
  ok('I2 pagamento posterior gera cupom', jobs[0].n === 1, JSON.stringify(jobs));
}, { uid: U.cliente });

await test('I3', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, null, 1, 'Montagem');
  await exec(`insert into public.fila_impressao (pedido_id, trabalho_uuid, payload) values ('${id}','${id}:pedido','{}')`);
  await actAs(U.cliente);
  const r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, null]);
  await superUser();
  await q('select public.enfileirar_cupom($1)', [id]);
  const jobs = await qr('select count(*)::int n from public.fila_impressao where pedido_id=$1', [id]);
  ok('I3 cancelado nao gera novo job e preserva antigo', r.rows[0].r.status === 'cancelado' && jobs[0].n === 1, JSON.stringify({ r: r.rows[0].r, jobs }));
});

// ============================================================================
section('8. GATES DE PRODUCAO');
// ============================================================================
await test('G1', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.producao);
  await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('G1 sem trigger instalado transicao passa', o.status === 'em_producao', JSON.stringify(o));
});

await test('G2', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 1);
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await exec(`create trigger trigger_exigir_reserva_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_reserva_producao()`);
  await actAs(U.producao);
  await expectThrow('G2 gate bloqueia pedido sem reserva', async () => {
    await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  });
});

await test('G3', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 5 }]);
  await superUser();
  await exec(`create trigger trigger_exigir_reserva_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_reserva_producao()`);
  await exec(`create trigger trigger_exigir_consumo_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_consumo_producao()`);
  await actAs(U.producao);
  await expectThrow('G3 gate bloqueia reserva ativa sem retirada', async () => {
    await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  });
  const rid = await resId(id);
  await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 5, nid(), null, null]);
  await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('G3 apos consumo total transicao passa', o.status === 'em_producao', JSON.stringify(o));
});

await test('G4', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, null, 1, 'Montagem');
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await exec(`create trigger trigger_exigir_reserva_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_reserva_producao()`);
  await actAs(U.producao);
  await expectThrow('G4 gate bloqueia montagem pura', async () => {
    await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  });
});

await test('G5', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 1);
  await exec('update public.reserva_proveniencia_config set controlado=false where id=true');
  await exec(`create trigger trigger_exigir_reserva_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_reserva_producao()`);
  await actAs(U.producao);
  await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('G5 controlado=false gate inerte', o.status === 'em_producao', JSON.stringify(o));
});

await test('G6', async () => {
  const id = nid();
  await superUser(); await mkPedido(id); await mkItem(id, P.unit, 10);
  const rid = await mkReserva(id, P.unit, 10, 'ativa');
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  const cb = await cobertura(id);
  await exec(`create trigger trigger_exigir_reserva_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_reserva_producao()`);
  await actAs(U.producao);
  await expectThrow('G6 legado sem ledger bloqueia', async () => {
    await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  });
  ok('G6 cobertura legado reconciliacao_pendente', cb.status === 'reconciliacao_pendente' && cb.motivo === 'debito_nao_comprovado', JSON.stringify(cb));
});

await test('G7', async () => {
  await superUser();
  await exec('update public.reserva_proveniencia_config set controlado=true where id=true');
  await actAs(U.cliente);
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 5 }]);
  await superUser();
  await exec(`create trigger trigger_exigir_reserva_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_reserva_producao()`);
  await exec(`create trigger trigger_exigir_consumo_producao before update of status on public.pedidos
    for each row when (old.status='recebido' and new.status not in ('recebido','cancelado'))
    execute function public.exigir_consumo_producao()`);
  const rid = await resId(id);
  await actAs(U.producao);
  await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r', [rid, 2, nid(), null, null]);
  await exec(`update public.pedidos set status='em_producao' where id='${id}'`);
  await superUser();
  const o = await one('select status from public.pedidos where id=$1', [id]);
  ok('G7 gate aceita retirada PARCIAL (2 de 5) como consumo registrado', o.status === 'em_producao', JSON.stringify(o));
});

// ============================================================================
section('9. RLS / PERMISSOES DIRETAS');
// ============================================================================
await test('RLS1', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.cliente);
  const dono = await qr('select * from public.reservas_estoque where pedido_id=$1', [id]);
  await actAs(U.outsider);
  const outro = await qr('select * from public.reservas_estoque where pedido_id=$1', [id]);
  await actAs(U.admin);
  const admin = await qr('select * from public.reservas_estoque where pedido_id=$1', [id]);
  await actAs(U.producao);
  const prod = await qr('select * from public.reservas_estoque where pedido_id=$1', [id]);
  ok('RLS1 cliente e terceiro NAO veem reservas', dono.length === 0 && outro.length === 0, JSON.stringify({ dono: dono.length, outro: outro.length }));
  ok('RLS1 admin e producao veem reservas', admin.length === 1 && prod.length === 1, JSON.stringify({ admin: admin.length, prod: prod.length }));
});

await test('RLS2', async () => {
  const id = nid();
  await rpc(id, 'checkout', dadosBase(), [{ produto_id: P.unit, quantidade: 1 }]);
  await superUser();
  await actAs(U.cliente);
  await expectThrow('RLS2 cliente nao insere reserva direto', async () => {
    await exec(`insert into public.reservas_estoque (pedido_id,produto_id,quantidade,status) values ('${id}','${P.unit}',1,'ativa')`);
  });
  const cons = await qr('select * from public.reserva_consumos limit 1');
  ok('RLS2 cliente nao le consumos', cons.length === 0, JSON.stringify(cons));
});

await test('RLS3', async () => {
  const id = nid();
  await actAs(null, 'anon', { role: 'anon' });
  await expectThrow('RLS3 anon nao executa a RPC 0095', async () => {
    await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb)', [id, 'checkout', JSON.stringify(dadosBase()), JSON.stringify([{ produto_id: P.unit, quantidade: 1 }])]);
  });
  await expectThrow('RLS3 anon nao le pedidos', async () => {
    await q('select * from public.pedidos limit 1');
  });
}, { uid: null, role: 'anon', claims: { role: 'anon' } });

// ============================================================================
const summary = { date: new Date().toISOString(), pass, fail, total: pass + fail, results };
fs.writeFileSync('C:/Users/User/AppData/Local/Temp/opencode/pg-homolog/suite-results.json', JSON.stringify(summary, null, 2));
console.log(`\n===== RESUMO ===== pass=${pass} fail=${fail} total=${pass + fail}`);
await db.end();
