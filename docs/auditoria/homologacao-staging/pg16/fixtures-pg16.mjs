import pg from 'pg';

const { Client } = pg;
const db = new Client({ host: '127.0.0.1', port: 55435, user: 'postgres', database: process.env.PGDATABASE || 'homolog_p0' });
await db.connect();

export const USERS = {
  admin: '11111111-1111-1111-1111-111111111111',
  atendente: '22222222-2222-2222-2222-222222222222',
  producao: '33333333-3333-3333-3333-333333333333',
  cliente: '44444444-4444-4444-4444-444444444444',
  outsider: '55555555-5555-5555-5555-555555555555',
  motoboy: '66666666-6666-6666-6666-666666666666',
};
export const PROD = {
  unit: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  combo: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  zero: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  indisponivel: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  promo: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  stock1: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006',
  stock5: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007',
  outro: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
};
const CAT = '99999999-9999-4999-8999-999999999999';

await db.query(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${USERS.admin}', 'admin@homolog.local', '{"nome":"Admin Homolog"}'::jsonb),
    ('${USERS.atendente}', 'atendente@homolog.local', '{"nome":"Atendente Homolog"}'::jsonb),
    ('${USERS.producao}', 'producao@homolog.local', '{"nome":"Producao Homolog"}'::jsonb),
    ('${USERS.cliente}', 'cliente@homolog.local', '{"nome":"Cliente Homolog"}'::jsonb),
    ('${USERS.outsider}', 'outsider@homolog.local', '{"nome":"Outsider Homolog"}'::jsonb),
    ('${USERS.motoboy}', 'motoboy@homolog.local', '{"nome":"Motoboy Homolog"}'::jsonb)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role) values
    ('${USERS.admin}', 'admin'),
    ('${USERS.atendente}', 'atendente'),
    ('${USERS.producao}', 'producao'),
    ('${USERS.motoboy}', 'motoboy')
  on conflict do nothing;

  insert into public.categorias (id, nome, slug, ordem, ativo)
  values ('${CAT}', 'Testes Homologacao', 'testes-homologacao', 99, true)
  on conflict (id) do nothing;

  insert into public.produtos (id, categoria_id, nome, preco, preco_promocional, estoque, disponivel, tipo_venda)
  values
    ('${PROD.unit}',        '${CAT}', 'Produto Teste Unidade',      10.00, null, 100, true,  'unidade'),
    ('${PROD.combo}',       '${CAT}', 'Produto Teste Combo 50',     20.00, null, 200, true,  'combo_50'),
    ('${PROD.zero}',        '${CAT}', 'Produto Teste Sem Estoque',  10.00, null,   0, true,  'unidade'),
    ('${PROD.indisponivel}','${CAT}', 'Produto Teste Indisponivel', 10.00, null,  10, false, 'unidade'),
    ('${PROD.promo}',       '${CAT}', 'Produto Teste Promocional',  10.00, 7.50,  50, true,  'unidade'),
    ('${PROD.stock1}',      '${CAT}', 'Produto Teste Estoque 1',    10.00, null,   1, true,  'unidade'),
    ('${PROD.stock5}',      '${CAT}', 'Produto Teste Estoque 5',    10.00, null,   5, true,  'unidade'),
    ('${PROD.outro}',       '${CAT}', 'Produto Teste Outro',        10.00, null, 100, true,  'unidade')
  on conflict (id) do update set
    preco = excluded.preco, preco_promocional = excluded.preco_promocional,
    estoque = excluded.estoque, disponivel = excluded.disponivel, tipo_venda = excluded.tipo_venda;

  insert into public.cupons (codigo, tipo, valor, minimo, ativo, cliente_telefone, max_usos, produtos_ids)
  values
    ('TESTE10',       'percentual', 10,    0,    true,  '',              0, '[]'::jsonb),
    ('TESTEVALOR',    'valor',       5,    0,    true,  '',              0, '[]'::jsonb),
    ('TESTEESGOTADO', 'percentual', 10,    0,    true,  '',              1, '[]'::jsonb),
    ('TESTEINATIVO',  'percentual', 10,    0,    false, '',              0, '[]'::jsonb),
    ('TESTEMIN',      'percentual', 10, 1000,    true,  '',              0, '[]'::jsonb),
    ('TESTEPRODUTO',  'percentual', 10,    0,    true,  '',              0, '["${PROD.outro}"]'::jsonb),
    ('TESTECLIENTE',  'percentual', 10,    0,    true,  '11999998888',   0, '[]'::jsonb)
  on conflict (codigo) do update set
    tipo=excluded.tipo, valor=excluded.valor, minimo=excluded.minimo, ativo=excluded.ativo,
    cliente_telefone=excluded.cliente_telefone, max_usos=excluded.max_usos, produtos_ids=excluded.produtos_ids;

  update public.loja_config set endereco='Rua da Loja, 100', bairro='Centro', cidade='Sao Paulo' where id=true;

  update public.reserva_proveniencia_config set controlado=false where id=true;
`);

await db.query(`
  truncate table
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
  cascade;
`);

await db.query(`
  insert into public.pedidos (id, user_id, cliente_nome, telefone, endereco, bairro, cidade,
    tipo_entrega, forma_pagamento, subtotal, total, cupom, status, pagamento_status)
  values ('eeeeeeee-eeee-4eee-8eee-000000000001', '${USERS.cliente}', 'Consumo Cupom', '11999998888',
    'Retirada', 'Centro', 'Sao Paulo', 'retirada', 'pix', 100, 100, 'TESTEESGOTADO',
    'recebido', 'pendente');
`);

await db.query(`
  update public.produtos set estoque=100, disponivel=true where id in ('${PROD.unit}','${PROD.outro}');
  update public.produtos set estoque=200, disponivel=true where id='${PROD.combo}';
  update public.produtos set estoque=0, disponivel=true where id='${PROD.zero}';
  update public.produtos set estoque=10, disponivel=false where id='${PROD.indisponivel}';
  update public.produtos set estoque=50, disponivel=true where id='${PROD.promo}';
  update public.produtos set estoque=1, disponivel=true where id='${PROD.stock1}';
  update public.produtos set estoque=5, disponivel=true where id='${PROD.stock5}';
`);

const check = await db.query(`
  select (select count(*) from auth.users) as users,
         (select count(*) from public.user_roles) as roles,
         (select count(*) from public.produtos where categoria_id=$1) as prods,
         (select count(*) from public.cupons) as cupons,
         (select controlado from public.reserva_proveniencia_config where id=true) as controlado
`, [CAT]);
console.log('fixtures pg16 ok:', check.rows[0]);
await db.end();
