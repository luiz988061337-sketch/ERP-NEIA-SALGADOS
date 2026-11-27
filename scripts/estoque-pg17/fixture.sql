-- Fixture sintética do ensaio local descartável. Nunca aplicar em homologação.
-- Todas as identidades são derivadas de md5 fixo apenas para este cluster.
BEGIN;

INSERT INTO auth.users (id, email)
SELECT md5('estoque:' || u.email)::uuid, u.email
FROM (VALUES
  ('admin@estoque.teste'),
  ('admin2@estoque.teste'),
  ('atendente@estoque.teste'),
  ('atendente2@estoque.teste'),
  ('motoboy@estoque.teste'),
  ('cliente@estoque.teste')
) u(email)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT md5('estoque:' || v.email)::uuid, v.role::public.app_role
FROM (VALUES
  ('admin@estoque.teste', 'admin'),
  ('admin2@estoque.teste', 'admin'),
  ('atendente@estoque.teste', 'atendente'),
  ('atendente2@estoque.teste', 'atendente'),
  ('motoboy@estoque.teste', 'motoboy'),
  ('cliente@estoque.teste', 'cliente')
) v(email, role)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.categorias (nome, slug, ordem)
VALUES ('Categoria de teste', 'categoria-teste-estoque', 999)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.pedidos
  (id, user_id, cliente_nome, telefone, endereco, bairro, cidade, status, total)
SELECT
  md5('pedido-estoque:' || v.chave)::uuid,
  md5('estoque:cliente@estoque.teste')::uuid,
  'Cliente de teste ' || v.chave,
  '11999999999',
  'Rua de teste, 1',
  'Centro',
  'São Paulo',
  'recebido'::public.order_status,
  0
FROM (VALUES
  ('coxinha'),
  ('pizza'),
  ('esfirra'),
  ('concorrencia')
) v(chave)
ON CONFLICT (id) DO NOTHING;

COMMIT;
