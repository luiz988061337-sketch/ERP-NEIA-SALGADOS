// ENSAIO DE CUTOVER - PROVA DE BLOQUEIO DOS CAMINHOS LEGADOS (PG16)
// Aplica o lockdown (ja aplicado no banco) e prova:
//   (a) o cliente autenticado NAO consegue mais usar os caminhos legados;
//   (b) o fluxo atomico novo continua funcionando sob lockdown.
import pg from 'pg';
const { Client } = pg;

const db = new Client({
  host: '127.0.0.1', port: 55435, user: 'postgres',
  database: process.env.PGDATABASE || 'homolog_cutover_lock',
});
await db.connect();

const U = {
  atendente: '22222222-2222-2222-2222-222222222222',
  producao: '33333333-3333-3333-3333-333333333333',
  cliente: '44444444-4444-4444-4444-444444444444',
};
const P = { unit: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', outro: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008' };
let seq = 0;
const nid = () => `d0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
let pass = 0, fail = 0;
function ok(n, c, d = '') { const p = !!c; if (p) pass++; else fail++; console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + String(d).slice(0, 400) : ''}`); }
async function q(s, p = []) { return db.query(s, p); }
async function val(s, p = []) { const r = await q(s, p); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
async function root() {
  await q('reset role');
  await q("select set_config('request.jwt.claim.sub','',true)");
  await q("select set_config('request.jwt.claims','',true)");
}
async function actAs(uid) {
  await q('reset role');
  await q('set local role authenticated');
  await q(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
  await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ role: 'authenticated', sub: uid })]);
}
// executa como authenticated e devolve o codigo de erro (ou 'ok')
async function denied(uid, sql, params = []) {
  await q('begin');
  try { await actAs(uid); await q(sql, params); await q('rollback'); return 'ok'; }
  catch (e) { try { await q('rollback'); } catch {} return e.code || e.message; }
}

console.log('### CUTOVER LOCKDOWN - CAMINHOS LEGADOS INACESSIVEIS');
await root();
await q("update public.reserva_proveniencia_config set controlado=true where id=true");
await q('update public.produtos set estoque=300, disponivel=true where id = any($1::uuid[])', [[P.unit, P.outro]]);

const fakePedido = nid();

// (a) caminhos legados
ok('L1 INSERT direto reservas_estoque negado',
  (await denied(U.cliente, `insert into public.reservas_estoque (pedido_id, produto_id, quantidade, status) values ($1,$2,5,'ativa')`, [fakePedido, P.unit])) === '42501',
  await denied(U.cliente, `insert into public.reservas_estoque (pedido_id, produto_id, quantidade, status) values ($1,$2,5,'ativa')`, [fakePedido, P.unit]));
ok('L2 UPDATE direto reservas_estoque negado',
  (await denied(U.cliente, `update public.reservas_estoque set status='cancelada' where pedido_id=$1`, [fakePedido])) === '42501');
ok('L3 RPC reservar_estoque_atomica negada',
  (await denied(U.cliente, `select public.reservar_estoque_atomica($1,$2,$3)`, [fakePedido, P.unit, 5])) === '42501');
ok('L4 RPC liberar_reserva_atomica negada',
  (await denied(U.cliente, `select public.liberar_reserva_atomica($1)`, [fakePedido])) === '42501');
ok('L5 INSERT direto estoque_movimentacoes negado',
  (await denied(U.cliente, `insert into public.estoque_movimentacoes (produto_id, quantidade, tipo) values ($1,-5,'reserva')`, [P.unit])) === '42501');

// (b) fluxo novo continua funcionando
await q('begin');
try {
  await actAs(U.cliente);
  const id = nid();
  const dados = { cliente_nome: 'Lockdown', telefone: '11999998888', tipo_entrega: 'retirada', forma_pagamento: 'pix' };
  const r = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [id, 'checkout', JSON.stringify(dados), JSON.stringify([{ produto_id: P.unit, quantidade: 10 }])]);
  ok('L6 criacao atomica funciona sob lockdown', r.rows[0].res?.status === 'criado', JSON.stringify(r.rows[0].res));
  await root();
  const res = (await q('select * from public.reservas_estoque where pedido_id=$1', [id])).rows[0];
  await actAs(U.producao);
  const c = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
    [res.id, 10, nid(), P.unit, 'retirada total sob lockdown']);
  ok('L7 retirada parcial/total funciona sob lockdown', c.rows[0].r?.status === 'consumido', JSON.stringify(c.rows[0].r));
  await actAs(U.cliente);
  const c2 = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'cancelar sob lockdown']);
  ok('L8 cancelamento atomico funciona sob lockdown', ['cancelado', 'ja_cancelado'].includes(c2.rows[0].r?.status), JSON.stringify(c2.rows[0].r));
  await root();
  ok('L9 estoque consistente apos fluxo sob lockdown (300 - 10 consumidos = 290)',
    Number(await val('select estoque from public.produtos where id=$1', [P.unit])) === 290,
    String(await val('select estoque from public.produtos where id=$1', [P.unit])));
} finally { try { await q('rollback'); } catch {} }

// (c) DELETE de pedido (compensacao legada) negado
ok('L10 DELETE direto de pedido negado',
  (await denied(U.cliente, `delete from public.pedidos where id=$1`, [fakePedido])) === '42501');

// (d) residual: INSERT direto de pedido ainda permitido? (documentar)
const residual = await denied(U.cliente,
  `insert into public.pedidos (id,user_id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,forma_pagamento,subtotal,total)
   values ($1,$2,'Legado','11999998888','R','C','SP','retirada','pix',1,1)`, [nid(), U.cliente]);
console.log(`INFO L11 INSERT direto de pedido sem reserva = ${residual} (residual ate remover fallback/instalar gate)`);

console.log(`\n===== RESUMO LOCKDOWN ===== pass=${pass} fail=${fail} total=${pass + fail}`);
await db.end();
process.exit(fail ? 1 : 0);
