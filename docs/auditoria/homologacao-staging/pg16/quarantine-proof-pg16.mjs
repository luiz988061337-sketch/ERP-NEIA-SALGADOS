import pg from 'pg';
const { Client } = pg;

const db = new Client({ host: '127.0.0.1', port: 55435, user: 'postgres', database: process.env.PGDATABASE || 'homolog_p0' });
await db.connect();

const U = { cliente: '44444444-4444-4444-4444-444444444444' };
const P = {
  unit: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  outro: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
};
const CAT = '99999999-9999-4999-8999-999999999999';
let pass = 0, fail = 0;
function ok(n, c, d = '') { const p = !!c; if (p) pass++; else fail++; console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + String(d).slice(0, 500) : ''}`); }
async function q(s, p = []) { return db.query(s, p); }
async function one(s, p = []) { return (await q(s, p)).rows[0]; }
async function val(s, p = []) { const r = await one(s, p); return r ? Object.values(r)[0] : null; }
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
const dados = { cliente_nome: 'Cliente Quarentena', telefone: '11999998888', tipo_entrega: 'retirada', forma_pagamento: 'pix' };
async function rpc(id, itens) {
  const r = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [id, 'checkout', JSON.stringify(dados), JSON.stringify(itens)]);
  return r.rows[0].res;
}

console.log('### QUARENTENA 19 RESERVAS — PROVA DE ISOLAMENTO');
await q("update public.reserva_proveniencia_config set controlado=true where id=true");
await q("update public.categorias set combo_preco_unit=1.60 where id=$1", [CAT]);
await q('update public.produtos set estoque=100, disponivel=true where id = any($1::uuid[])', [[P.unit, P.outro]]);

await q('begin');
try {
  await root();
  // 19 pedidos legados: pedido + item + reserva ativa, SEM ledger e SEM proveniencia.
  const legado = [];
  for (let i = 1; i <= 19; i++) {
    const pid = `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    legado.push(pid);
    await q(`insert into public.pedidos
      (id,user_id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,forma_pagamento,subtotal,total,status,pagamento_status)
      values ($1,$2,'Legado Quarentena','11999998888','Rua Legado, 1','Centro','Sao Paulo','retirada','pix',50,50,'recebido','pendente')`, [pid, U.cliente]);
    await q(`insert into public.pedido_itens (pedido_id,produto_id,nome,preco_unitario,quantidade)
      values ($1,$2,'Item Legado',10,5)`, [pid, P.unit]);
    await q(`insert into public.reservas_estoque (pedido_id,produto_id,quantidade,status)
      values ($1,$2,5,'ativa')`, [pid, P.unit]);
  }

  const qtdLegado = Number(await val(`select count(*) from public.reservas_estoque where pedido_id = any($1::uuid[]) and status='ativa'`, [legado]));
  const unidadesLegado = Number(await val(`select coalesce(sum(quantidade),0) from public.reservas_estoque where pedido_id = any($1::uuid[]) and status='ativa'`, [legado]));
  const semProv = Number(await val(`select count(*) from public.reservas_estoque r
    where r.pedido_id = any($1::uuid[]) and r.status='ativa'
      and not exists (select 1 from public.reserva_proveniencia p where p.reserva_id=r.id)`, [legado]));
  ok('Q1 19 reservas legadas ativas', qtdLegado === 19, String(qtdLegado));
  ok('Q1 95 unidades legadas', unidadesLegado === 95, String(unidadesLegado));
  ok('Q1 19 sem proveniencia (classe legado_sem_evidencia)', semProv === 19, String(semProv));
  ok('Q1 estoque NAO foi creditado pelas 19', (await val('select estoque from public.produtos where id=$1', [P.unit])) === 100, String(await val('select estoque from public.produtos where id=$1', [P.unit])));

  // Novo pedido combo, com as 19 legadas presentes no banco.
  await actAs(U.cliente);
  const novo = 'e1000000-0000-4000-8000-000000000001';
  const res = await rpc(novo, [{
    nome: 'Combo Quarentena 50un', quantidade: 50,
    componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
  }]);
  ok('Q2 novo pedido combo criado com 19 legadas', res.status === 'criado', JSON.stringify(res));

  await root();
  ok('Q2 estoque novo debitado 70/80 (legado nao interferiu)',
    (await val('select estoque from public.produtos where id=$1', [P.unit])) === 70 &&
    (await val('select estoque from public.produtos where id=$1', [P.outro])) === 80,
    JSON.stringify({ unit: await val('select estoque from public.produtos where id=$1', [P.unit]), outro: await val('select estoque from public.produtos where id=$1', [P.outro]) }));
  const cob = await one('select public.pedido_cobertura_reserva($1) as c', [novo]);
  ok('Q2 cobertura do novo pedido = coberto', cob.c?.status === 'coberto', JSON.stringify(cob.c));
  ok('Q2 novo pedido tem 2 reservas/prov/ledger', Number(await val(`select count(*) from public.reservas_estoque where pedido_id=$1`, [novo])) === 2 &&
    Number(await val(`select count(*) from public.reserva_proveniencia where pedido_id=$1`, [novo])) === 2 &&
    Number(await val(`select count(*) from public.estoque_movimentacoes m where m.referencia_id in (select id from public.reservas_estoque where pedido_id=$1)`, [novo])) === 2, '');
  ok('Q2 as 19 legadas continuam intactas', Number(await val(`select count(*) from public.reservas_estoque where pedido_id = any($1::uuid[]) and status='ativa'`, [legado])) === 19, '');

  // Cancelar o novo pedido NAO toca nas legadas.
  await actAs(U.cliente);
  const canc = await q('select public.cancelar_pedido_atomico($1,$2) as r', [novo, 'fim do teste']);
  ok('Q3 novo pedido cancelado', canc.rows[0].r?.status === 'cancelado', JSON.stringify(canc.rows[0].r));
  await root();
  ok('Q3 estoque do novo devolvido 100/100', (await val('select estoque from public.produtos where id=$1', [P.unit])) === 100 && (await val('select estoque from public.produtos where id=$1', [P.outro])) === 100, '');
  ok('Q3 19 legadas seguem ativas e sem credito', Number(await val(`select count(*) from public.reservas_estoque where pedido_id = any($1::uuid[]) and status='ativa'`, [legado])) === 19 && (await val('select estoque from public.produtos where id=$1', [P.unit])) === 100, '');

  // Cancelamento de pedido legado: deve falhar fechado (sem ledger/proveniencia) e nao creditar.
  const legadoId = legado[0];
  await actAs(U.cliente);
  await q('savepoint q4');
  let erroLegado = null;
  try {
    await q('select public.cancelar_pedido_atomico($1,$2) as r', [legadoId, 'tentativa legado']);
  } catch (e) {
    erroLegado = e;
    await q('rollback to savepoint q4');
  }
  await root();
  const statusLegado = await val('select status from public.pedidos where id=$1', [legadoId]);
  const reservaLegado = await val(`select status from public.reservas_estoque where pedido_id=$1`, [legadoId]);
  ok('Q4 cancelamento legado NAO e automatico',
    !!erroLegado && /reconciliacao_pendente/.test(String(erroLegado.message)) && statusLegado !== 'cancelado' && reservaLegado === 'ativa',
    JSON.stringify({ erro: erroLegado?.message, statusLegado, reservaLegado }));
  ok('Q4 tentativa de cancelamento legado nao credita estoque', (await val('select estoque from public.produtos where id=$1', [P.unit])) === 100, String(await val('select estoque from public.produtos where id=$1', [P.unit])));

  // Indicadores de quarentena: 19 ativas, 95 unidades, 0 consumo.
  ok('Q5 indicador reservas ativas legadas = 19', Number(await val(`select count(*) from public.reservas_estoque where pedido_id = any($1::uuid[]) and status='ativa'`, [legado])) === 19, '');
  ok('Q5 indicador unidades legadas = 95', Number(await val(`select coalesce(sum(quantidade),0) from public.reservas_estoque where pedido_id = any($1::uuid[]) and status='ativa'`, [legado])) === 95, '');
  ok('Q5 indicador consumo legado = 0', Number(await val(`select coalesce(sum(c.quantidade),0) from public.reserva_consumos c join public.reservas_estoque r on r.id=c.reserva_id where r.pedido_id = any($1::uuid[])`, [legado])) === 0, '');
} finally {
  await q('rollback');
  await root();
  await q("update public.reserva_proveniencia_config set controlado=false where id=true");
}

console.log(`\n===== RESUMO QUARENTENA ===== pass=${pass} fail=${fail} total=${pass + fail}`);
await db.end();
process.exit(fail ? 1 : 0);
