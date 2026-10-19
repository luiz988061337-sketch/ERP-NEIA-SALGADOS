import pg from 'pg';
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
  financeiro: '77777777-7777-7777-7777-777777777777',
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
let pass = 0;
let fail = 0;
function ok(name, cond, details = '') {
  const p = !!cond;
  if (p) pass++; else fail++;
  console.log(`${p ? 'PASS' : 'FAIL'} ${name}${details ? ' :: ' + String(details).slice(0, 500) : ''}`);
}
async function q(sql, params = []) { return db.query(sql, params); }
async function one(sql, params = []) { const r = await q(sql, params); return r.rows[0]; }
async function val(sql, params = []) { const r = await one(sql, params); return r ? Object.values(r)[0] : null; }
async function begin(uid = U.cliente, role = 'authenticated') {
  await q('begin');
  if (role) await q(`set local role ${role}`);
  if (uid) {
    await q(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ role: 'authenticated', sub: uid })]);
  }
}
async function actAs(uid, role = 'authenticated') {
  await q('reset role');
  await q(`set local role ${role}`);
  await q(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
  await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ role: 'authenticated', sub: uid })]);
}
async function root() {
  await q('reset role');
  await q("select set_config('request.jwt.claim.sub','',true)");
  await q("select set_config('request.jwt.claims','',true)");
}
async function rollback() { try { await q('rollback'); } catch {} }

const dados = {
  cliente_nome: 'Cliente Combo', telefone: '11999998888',
  tipo_entrega: 'retirada', forma_pagamento: 'pix',
};
async function rpc(id, itens) {
  const r = await q('select public.criar_pedido_com_reserva($1,$2,$3::jsonb,$4::jsonb) as res',
    [id, 'checkout', JSON.stringify(dados), JSON.stringify(itens)]);
  return r.rows[0].res;
}
async function stock(pid) { return Number(await val('select estoque from public.produtos where id=$1', [pid])); }
async function item(id) {
  return one(`select i.*, (select jsonb_agg(jsonb_build_object('produto_id',c.produto_id,'quantidade',c.quantidade) order by c.produto_id)
    from public.pedido_item_componentes c where c.pedido_item_id=i.id) componentes
    from public.pedido_itens i where i.pedido_id=$1 order by i.nome limit 1`, [id]);
}
async function reservas(id) {
  return (await q('select * from public.reservas_estoque where pedido_id=$1 order by produto_id', [id])).rows;
}
async function consumos(id) {
  return (await q('select c.* from public.reserva_consumos c join public.reservas_estoque r on r.id=c.reserva_id where r.pedido_id=$1 order by c.created_at,c.id', [id])).rows;
}
async function countFor(id, table) {
  return Number(await val(`select count(*) from public.${table} where pedido_id=$1`, [id]));
}

async function withTx(uid, fn) {
  await begin(uid);
  try { await fn(); } catch (e) { ok('EXCECAO INESPERADA', false, `${e.code || ''} ${e.message}`); }
  finally { await rollback(); }
}

console.log('### COMBO ESTRUTURADO — PG16');
await q("update public.reserva_proveniencia_config set controlado=true where id=true");
await q("update public.categorias set combo_preco_unit=1.60 where id=$1", [CAT]);
await q('update public.produtos set estoque=100, disponivel=true where id = any($1::uuid[])', [[P.unit, P.outro]]);

// Descobre um produto de OUTRA categoria para o teste de divergencia.
const outroCat = await one(`select p.id from public.produtos p
  where p.categoria_id <> $1 and p.disponivel and p.estoque > 5
  order by p.id limit 1`, [CAT]);

try {
  // 1. Criacao 50 com composicao 30+20.
  await withTx(U.cliente, async () => {
    const id = nid();
    const res = await rpc(id, [{
      nome: 'Combo Teste 50un (30 unit, 20 outro)',
      quantidade: 50,
      componentes: [
        { produto_id: P.unit, quantidade: 30 },
        { produto_id: P.outro, quantidade: 20 },
      ],
    }]);
    // Reservas/proveniencia/ledger são ocultos do cliente por RLS (por design).
    // A leitura de verificação é feita como owner; a criação/replay continua
    // sendo exercitada como o próprio cliente.
    await root();
    const it = await item(id);
    const rs = await reservas(id);
    const l = (await q(`select * from public.estoque_movimentacoes m
      where m.referencia_id in (select id from public.reservas_estoque where pedido_id=$1) order by m.quantidade`, [id])).rows;
    ok('C1 criado', res.status === 'criado', JSON.stringify(res));
    ok('C1 item pai produto_id NULL', it?.produto_id === null, JSON.stringify(it));
    ok('C1 preco de categoria 1.60', Number(it?.preco_unitario) === 1.6, JSON.stringify(it));
    ok('C1 quantidade 50', Number(it?.quantidade) === 50, JSON.stringify(it));
    ok('C1 duas linhas de componente', (it?.componentes ?? []).length === 2, JSON.stringify(it?.componentes));
    ok('C1 composicao 30/20 preservada',
      (it?.componentes ?? []).some((c) => c.produto_id === P.unit && Number(c.quantidade) === 30) &&
      (it?.componentes ?? []).some((c) => c.produto_id === P.outro && Number(c.quantidade) === 20),
      JSON.stringify(it?.componentes));
    ok('C1 duas reservas', rs.length === 2, JSON.stringify(rs));
    ok('C1 reserva 30/20',
      rs.some((r) => r.produto_id === P.unit && Number(r.quantidade) === 30) &&
      rs.some((r) => r.produto_id === P.outro && Number(r.quantidade) === 20), JSON.stringify(rs));
    ok('C1 estoque debitado 70/80', (await stock(P.unit)) === 70 && (await stock(P.outro)) === 80,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    ok('C1 duas provas de ledger -30/-20',
      l.length === 2 && l.some((x) => Number(x.quantidade) === -30) && l.some((x) => Number(x.quantidade) === -20),
      JSON.stringify(l));
    ok('C1 proveniencia 2', (await countFor(id, 'reserva_proveniencia')) === 2, String(await countFor(id, 'reserva_proveniencia')));
    const cob = await q('select public.pedido_cobertura_reserva($1) as c', [id]);
    ok('C1 cobertura exata', cob.rows[0].c?.status === 'coberto', JSON.stringify(cob.rows[0].c));

    // Replay integral: mesmo p_id, mesmos dados/itens => ja_criado, sem debito.
    await actAs(U.cliente);
    const replay = await rpc(id, [{
      nome: 'Combo Teste 50un (30 unit, 20 outro)',
      quantidade: 50,
      componentes: [
        { produto_id: P.unit, quantidade: 30 },
        { produto_id: P.outro, quantidade: 20 },
      ],
    }]);
    ok('C1 replay ja_criado', replay.status === 'ja_criado', JSON.stringify(replay));
    await root();
    const rsReplay = await reservas(id);
    ok('C1 replay nao duplica reserva', rsReplay.length === 2, String(rsReplay.length));
    ok('C1 replay nao duplica estoque', (await stock(P.unit)) === 70 && (await stock(P.outro)) === 80,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
  });

  // 2. Consumo parcial 20, depois 10; replay idempotente; excesso.
  await withTx(U.producao, async () => {
    const id = nid();
    await rpc(id, [{
      nome: 'Combo Consumo 50un', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
    }]);
    const rUnit = (await reservas(id)).find((r) => r.produto_id === P.unit);
    const key1 = 'd0000000-0000-4000-8000-000000000001';
    const c1 = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
      [rUnit.id, 20, key1, P.unit, 'retirada parcial']);
    ok('C2 primeira retirada 20', c1.rows[0].r?.status === 'consumido' && Number(c1.rows[0].r?.restante) === 10, JSON.stringify(c1.rows[0].r));
    const over = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
      [rUnit.id, 11, 'd0000000-0000-4000-8000-000000000003', P.unit, 'acima do restante']);
    ok('C2 acima do restante bloqueado', over.rows[0].r?.status === 'acima_do_restante' && Number(over.rows[0].r?.restante) === 10, JSON.stringify(over.rows[0].r));
    const replay = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
      [rUnit.id, 20, key1, P.unit, 'retirada parcial']);
    ok('C2 replay mesmo idem_key = ja_registrado', replay.rows[0].r?.status === 'ja_registrado', JSON.stringify(replay.rows[0].r));
    ok('C2 consumo nao credita estoque', (await stock(P.unit)) === 70, String(await stock(P.unit)));
    ok('C2 reserva ainda ativa com 10', (await val('select status from public.reservas_estoque where id=$1', [rUnit.id])) === 'ativa', '');
    const c2 = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
      [rUnit.id, 10, 'd0000000-0000-4000-8000-000000000002', P.unit, 'retirada final']);
    ok('C2 segunda retirada 10', c2.rows[0].r?.status === 'consumido' && Number(c2.rows[0].r?.restante) === 0, JSON.stringify(c2.rows[0].r));
    ok('C2 reserva fica consumida', (await val('select status from public.reservas_estoque where id=$1', [rUnit.id])) === 'consumida', '');
    const ex = await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5) as r',
      [rUnit.id, 1, 'd0000000-0000-4000-8000-000000000004', P.unit, 'reserva encerrada']);
    ok('C2 excesso em reserva encerrada', ex.rows[0].r?.status === 'reserva_encerrada', JSON.stringify(ex.rows[0].r));
    const total = await val(`select coalesce(sum(quantidade),0) from public.reserva_consumos where reserva_id=$1`, [rUnit.id]);
    ok('C2 consumo total exato 30', Number(total) === 30, String(total));
  });

  // 3. Cancelamento sem retirada: devolve tudo.
  await withTx(U.cliente, async () => {
    const id = nid();
    await rpc(id, [{
      nome: 'Combo Cancelar 50un', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
    }]);
    ok('C3 estoque reservado 70/80', (await stock(P.unit)) === 70 && (await stock(P.outro)) === 80,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    const c = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'teste combo']);
    ok('C3 cancelado', c.rows[0].r?.status === 'cancelado', JSON.stringify(c.rows[0].r));
    ok('C3 estoque devolvido 100/100', (await stock(P.unit)) === 100 && (await stock(P.outro)) === 100,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    await root();
    const rsC3 = await reservas(id);
    ok('C3 reservas liberadas', rsC3.length === 2 && rsC3.every((r) => r.status === 'liberada'), JSON.stringify(rsC3));
    await actAs(U.cliente);
    const c2 = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'replay']);
    ok('C3 replay ja_cancelado', c2.rows[0].r?.status === 'ja_cancelado', JSON.stringify(c2.rows[0].r));
  });

  // 4. Cancelamento apos consumo parcial: devolve SO o restante.
  await withTx(U.producao, async () => {
    const id = nid();
    await rpc(id, [{
      nome: 'Combo Parcial 50un', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
    }]);
    const rUnit = (await reservas(id)).find((r) => r.produto_id === P.unit);
    await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5)',
      [rUnit.id, 20, 'd0000000-0000-4000-8000-000000000010', P.unit, 'parcial']);
    const c = await q('select public.cancelar_pedido_atomico($1,$2) as r', [id, 'cancelar parcial']);
    ok('C4 cancelado com reserva consumida parcial', c.rows[0].r?.status === 'cancelado', JSON.stringify(c.rows[0].r));
    ok('C4 devolve somente restante 10 (unit=80)', (await stock(P.unit)) === 80, String(await stock(P.unit)));
    ok('C4 outro devolve 20 (outro=100)', (await stock(P.outro)) === 100, String(await stock(P.outro)));
    ok('C4 consumo preservado 20', Number(await val('select coalesce(sum(quantidade),0) from public.reserva_consumos where reserva_id=$1', [rUnit.id])) === 20, '');
  });

  // 4b. 50 de 200, outro 50, saldo restante, cancelamento e replay.
  await withTx(U.cliente, async () => {
    await root();
    await q('update public.produtos set estoque=200 where id = any($1::uuid[])', [[P.unit, P.outro]]);
    await actAs(U.cliente);
    const a = nid();
    const b = nid();
    const composicao = [
      { produto_id: P.unit, quantidade: 30 },
      { produto_id: P.outro, quantidade: 20 },
    ];
    const r1 = await rpc(a, [{ nome: 'Combo 50 de 200 (A)', quantidade: 50, componentes: composicao }]);
    ok('C8 primeiro 50 de 200 criado', r1.status === 'criado', JSON.stringify(r1));
    ok('C8 saldo apos primeiro 50 = 170/180', (await stock(P.unit)) === 170 && (await stock(P.outro)) === 180,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    const r2 = await rpc(b, [{ nome: 'Combo 50 de 200 (B)', quantidade: 50, componentes: composicao }]);
    ok('C8 outro 50 criado', r2.status === 'criado', JSON.stringify(r2));
    ok('C8 saldo apos outro 50 = 140/160', (await stock(P.unit)) === 140 && (await stock(P.outro)) === 160,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    await root();
    ok('C8 duas reservas por pedido',
      (await reservas(a)).length === 2 && (await reservas(b)).length === 2, '');
    await actAs(U.cliente);
    const cA = await q('select public.cancelar_pedido_atomico($1,$2) as r', [a, 'saldo A']);
    ok('C8 cancelamento A', cA.rows[0].r?.status === 'cancelado', JSON.stringify(cA.rows[0].r));
    ok('C8 saldo apos cancelar A = 170/180', (await stock(P.unit)) === 170 && (await stock(P.outro)) === 180,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    const cB = await q('select public.cancelar_pedido_atomico($1,$2) as r', [b, 'saldo B']);
    ok('C8 cancelamento B', cB.rows[0].r?.status === 'cancelado', JSON.stringify(cB.rows[0].r));
    ok('C8 saldo devolvido 200/200', (await stock(P.unit)) === 200 && (await stock(P.outro)) === 200,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
    const replayA = await rpc(a, [{ nome: 'Combo 50 de 200 (A)', quantidade: 50, componentes: composicao }]);
    // Replay apos cancelamento: NAO recria (fail-closed) e NAO re-debita.
    // Retry real de criacao (pedido ainda ativo) e testado em C1 = 'ja_criado'.
    ok('C8 replay de pedido cancelado nao recria', replayA.status !== 'criado', JSON.stringify(replayA));
    ok('C8 replay nao re-debita (200/200)', (await stock(P.unit)) === 200 && (await stock(P.outro)) === 200,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
  });

  // 4c. Configuracao de combos: 50/100/150, 3 sabores, preco, parcial, cancelamento.
  await withTx(U.cliente, async () => {
    await root();
    await q('update public.produtos set estoque=300 where id = any($1::uuid[])', [[P.unit, P.promo, P.outro]]);
    await actAs(U.cliente);
    const c50 = nid(), c100 = nid(), c150 = nid();
    const r50 = await rpc(c50, [{ nome: 'Combo 50 tres sabores', quantidade: 50, componentes: [
      { produto_id: P.unit, quantidade: 20 }, { produto_id: P.promo, quantidade: 20 }, { produto_id: P.outro, quantidade: 10 },
    ] }]);
    const r100 = await rpc(c100, [{ nome: 'Combo 100 tres sabores', quantidade: 100, componentes: [
      { produto_id: P.unit, quantidade: 40 }, { produto_id: P.promo, quantidade: 30 }, { produto_id: P.outro, quantidade: 30 },
    ] }]);
    const r150 = await rpc(c150, [{ nome: 'Combo 150 tres sabores', quantidade: 150, componentes: [
      { produto_id: P.unit, quantidade: 50 }, { produto_id: P.promo, quantidade: 50 }, { produto_id: P.outro, quantidade: 50 },
    ] }]);
    ok('C9 combo 50 criado', r50.status === 'criado' && Number(r50.subtotal) === 80, JSON.stringify(r50));
    ok('C9 combo 100 criado', r100.status === 'criado' && Number(r100.subtotal) === 160, JSON.stringify(r100));
    ok('C9 combo 150 criado', r150.status === 'criado' && Number(r150.subtotal) === 240, JSON.stringify(r150));
    ok('C9 preco de categoria 1.60 nos tres', Number(r50.subtotal) === 80 && Number(r100.subtotal) === 160 && Number(r150.subtotal) === 240, '');
    ok('C9 saldo apos 50+100+150 = 190/200/210',
      (await stock(P.unit)) === 190 && (await stock(P.promo)) === 200 && (await stock(P.outro)) === 210,
      JSON.stringify({ unit: await stock(P.unit), promo: await stock(P.promo), outro: await stock(P.outro) }));
    const invalido = await rpc(nid(), [{ nome: 'Combo 125 invalido', quantidade: 125, componentes: [
      { produto_id: P.unit, quantidade: 125 },
    ] }]);
    ok('C9 125 nao multiplo de 50 bloqueado', invalido.status === 'regra_combo', JSON.stringify(invalido));

    await root();
    const rUnit150 = (await reservas(c150)).find((r) => r.produto_id === P.unit);
    ok('C9 150 tem 3 reservas', (await reservas(c150)).length === 3, '');
    await actAs(U.producao);
    await q('select public.registrar_consumo_reserva($1,$2,$3,$4,$5)',
      [rUnit150.id, 50, 'd0000000-0000-4000-8000-000000000020', P.unit, 'parcial 150']);
    await actAs(U.cliente);
    const c150r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [c150, 'fim 150']);
    ok('C9 cancelamento 150 com consumo parcial', c150r.rows[0].r?.status === 'cancelado', JSON.stringify(c150r.rows[0].r));
    ok('C9 devolve so os nao consumidos = 190/250/260',
      (await stock(P.unit)) === 190 && (await stock(P.promo)) === 250 && (await stock(P.outro)) === 260,
      JSON.stringify({ unit: await stock(P.unit), promo: await stock(P.promo), outro: await stock(P.outro) }));
    const c100r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [c100, 'fim 100']);
    const c50r = await q('select public.cancelar_pedido_atomico($1,$2) as r', [c50, 'fim 50']);
    ok('C9 cancelamentos 100/50', c100r.rows[0].r?.status === 'cancelado' && c50r.rows[0].r?.status === 'cancelado', '');
    // O consumo de 50 do unit e fisico e NAO volta; os demais retornam.
    ok('C9 saldo final 250/300/300',
      (await stock(P.unit)) === 250 && (await stock(P.promo)) === 300 && (await stock(P.outro)) === 300,
      JSON.stringify({ unit: await stock(P.unit), promo: await stock(P.promo), outro: await stock(P.outro) }));
  });

  // 5. Regras de composicao / preco / estoque / idempotencia divergente.
  await withTx(U.cliente, async () => {
    const badSum = await rpc(nid(), [{
      nome: 'Combo Soma Errada', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 19 }],
    }]);
    ok('C5 soma divergente', badSum.status === 'montagem_soma_divergente', JSON.stringify(badSum));

    const dup = await rpc(nid(), [{
      nome: 'Combo Duplicado', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 25 }, { produto_id: P.unit, quantidade: 25 }],
    }]);
    ok('C5 componente duplicado', dup.status === 'montagem_componente_duplicado', JSON.stringify(dup));

    const not50 = await rpc(nid(), [{
      nome: 'Combo 49', quantidade: 49,
      componentes: [{ produto_id: P.unit, quantidade: 49 }],
    }]);
    ok('C5 total nao multiplo de 50', not50.status === 'regra_combo', JSON.stringify(not50));

    const normalWithComp = await rpc(nid(), [{
      produto_id: P.unit, nome: 'Produto normal', quantidade: 1,
      componentes: [{ produto_id: P.outro, quantidade: 1 }],
    }]);
    ok('C5 produto normal nao aceita composicao', normalWithComp.status === 'itens_invalidos' && normalWithComp.motivo === 'componentes_em_produto', JSON.stringify(normalWithComp));

    if (outroCat) {
      const cross = await rpc(nid(), [{
        nome: 'Combo Categoria Misturada', quantidade: 50,
        componentes: [{ produto_id: P.unit, quantidade: 25 }, { produto_id: outroCat.id, quantidade: 25 }],
      }]);
      ok('C5 categoria divergente', cross.status === 'montagem_categoria_divergente', JSON.stringify(cross));
    }

    // Preco ausente: falha fechada e nenhum residuo.
    await root();
    await q('update public.categorias set combo_preco_unit=null where id=$1', [CAT]);
    await actAs(U.cliente);
    const semPreco = await rpc(nid(), [{
      nome: 'Combo Sem Preco', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 50 }],
    }]);
    ok('C5 preco de categoria ausente', semPreco.status === 'montagem_preco_ausente', JSON.stringify(semPreco));
    const nPedidos = await val(`select count(*) from public.pedidos p
      where p.cliente_nome=$1
        and exists (select 1 from public.pedido_itens i where i.pedido_id=p.id and i.nome like 'Combo Sem Preco%')`,
      ['Cliente Combo']);
    ok('C5 falha nao deixa pedido/reserva', Number(nPedidos) === 0, String(nPedidos));
    await root();
    await q('update public.categorias set combo_preco_unit=1.60 where id=$1', [CAT]);
    await actAs(U.cliente);
  });

  // 6. Idempotencia divergente: mesmo id, composicao diferente.
  await withTx(U.cliente, async () => {
    const id = nid();
    await rpc(id, [{
      nome: 'Combo Idem', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 30 }, { produto_id: P.outro, quantidade: 20 }],
    }]);
    const div = await rpc(id, [{
      nome: 'Combo Idem', quantidade: 50,
      componentes: [{ produto_id: P.unit, quantidade: 20 }, { produto_id: P.outro, quantidade: 30 }],
    }]);
    ok('C6 replay divergente bloqueado', div.status === 'idempotencia_divergente', JSON.stringify(div));
    ok('C6 divergencia nao debita de novo', (await stock(P.unit)) === 70 && (await stock(P.outro)) === 80,
      JSON.stringify({ unit: await stock(P.unit), outro: await stock(P.outro) }));
  });

  // 7. RLS de leitura dos componentes e ACL.
  await root();
  const acl = await one(`select
    has_function_privilege('anon', 'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)', 'EXECUTE') anon_0095,
    has_function_privilege('authenticated', 'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)', 'EXECUTE') auth_0095,
    has_function_privilege('service_role', 'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)', 'EXECUTE') svc_0095,
    has_function_privilege('anon', 'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)', 'EXECUTE') anon_0091,
    has_function_privilege('service_role', 'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)', 'EXECUTE') svc_0091,
    has_function_privilege('anon', 'public.liberar_reserva_atomica(uuid)', 'EXECUTE') anon_0088,
    has_table_privilege('service_role', 'public.pedido_item_componentes', 'SELECT') svc_comp,
    has_table_privilege('anon', 'public.pedido_item_componentes', 'SELECT') anon_comp`);
  ok('C7 ACL 0095 anon=false', acl.anon_0095 === false, JSON.stringify(acl));
  ok('C7 ACL 0095 auth=true', acl.auth_0095 === true, JSON.stringify(acl));
  ok('C7 ACL 0095 service_role=false', acl.svc_0095 === false, JSON.stringify(acl));
  ok('C7 ACL 0091 anon=false', acl.anon_0091 === false, JSON.stringify(acl));
  ok('C7 ACL 0091 service_role=false', acl.svc_0091 === false, JSON.stringify(acl));
  ok('C7 ACL 0088 anon=false', acl.anon_0088 === false, JSON.stringify(acl));
  ok('C7 componente service_role sem SELECT', acl.svc_comp === false, JSON.stringify(acl));
  ok('C7 componente anon sem SELECT', acl.anon_comp === false, JSON.stringify(acl));

  await withTx(U.cliente, async () => {
    const id = nid();
    await rpc(id, [{ nome: 'Combo RLS 50un', quantidade: 50, componentes: [{ produto_id: P.unit, quantidade: 50 }] }]);
    ok('C7 dono le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 1, '');
    await actAs(U.outsider);
    ok('C7 terceiro nao le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 0, '');
    await actAs(U.producao);
    ok('C7 producao le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 1, '');
    await actAs(U.admin);
    ok('C7 admin le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 1, '');
    await actAs(U.atendente);
    ok('C7 atendente le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 1, '');
    // financeiro nao esta na policy de componentes.
    await root();
    await q("insert into auth.users (id,email,raw_user_meta_data) values ($1,'financeiro@homolog.local','{}'::jsonb) on conflict (id) do nothing", [U.financeiro]);
    await q("insert into public.user_roles (user_id,role) values ($1,'financeiro') on conflict do nothing", [U.financeiro]);
    await actAs(U.financeiro);
    ok('C7 financeiro NAO le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 0, '');
    // motoboy atribuido ao pedido le (atribuicao feita por admin).
    await actAs(U.admin);
    await q('update public.pedidos set motoboy_id=$1 where id=$2', [U.motoboy, id]);
    await actAs(U.motoboy);
    ok('C7 motoboy atribuido le componentes', Number(await val('select count(*) from public.pedido_item_componentes c join public.pedido_itens i on i.id=c.pedido_item_id where i.pedido_id=$1', [id])) === 1, '');
  });
} finally {
  await root();
  await q("update public.reserva_proveniencia_config set controlado=false where id=true");
  await q("update public.categorias set combo_preco_unit=1.60 where id=$1", [CAT]);
}

console.log(`\n===== RESUMO COMBO ===== pass=${pass} fail=${fail} total=${pass + fail}`);
await db.end();
process.exit(fail ? 1 : 0);
