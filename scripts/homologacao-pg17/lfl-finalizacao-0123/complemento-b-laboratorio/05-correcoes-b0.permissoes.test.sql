-- ============================================================================
-- MATRIZ DE PERMISSOES DAS 7 TABELAS DO ITEM 6 - SOMENTE BANCO LOCAL
-- ============================================================================
-- Executar DEPOIS de 05-correcoes-b0-seguranca.sql, com --single-transaction.
-- Prova comportamental (RLS avaliada de verdade, com JWT sintetico local):
--   admin, financeiro -> leem e escrevem (INSERT/UPDATE/DELETE)
--   producao          -> le, NAO escreve
--   atendente, motoboy, sem papel -> nao leem e nao escrevem
-- Fixtures tem uuid fixo e sao removidas pelo ROLLBACK no fim.
-- Ordem de dependencia: insercao pais->filho, remocao filho->pai.
-- ============================================================================
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN
  RAISE EXCEPTION 'Matriz exclusivamente local';
 END IF;
END $local$;

-- ---------------------------------------------------------------------------
-- 0. Atores sinteticos (nao sao usuarios reais; banco descartavel)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('20000000-0000-0000-0000-0000000000b1','b0-admin@example.invalid'),
  ('20000000-0000-0000-0000-0000000000b2','b0-financeiro@example.invalid'),
  ('20000000-0000-0000-0000-0000000000b3','b0-producao@example.invalid'),
  ('20000000-0000-0000-0000-0000000000b4','b0-atendente@example.invalid'),
  ('20000000-0000-0000-0000-0000000000b5','b0-motoboy@example.invalid'),
  ('20000000-0000-0000-0000-0000000000b6','b0-sem-papel@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-0000000000b1','admin'),
  ('20000000-0000-0000-0000-0000000000b2','financeiro'),
  ('20000000-0000-0000-0000-0000000000b3','producao'),
  ('20000000-0000-0000-0000-0000000000b4','atendente'),
  ('20000000-0000-0000-0000-0000000000b5','motoboy')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Fixtures (como postgres, que ignora RLS)
-- ---------------------------------------------------------------------------
INSERT INTO public.categorias (id, nome, slug)
  VALUES ('30000000-0000-0000-0000-0000000000a1','B0 fixture','b0-fixture');
INSERT INTO public.produtos (id, categoria_id, nome, preco)
  VALUES ('30000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000a1','B0 produto', 1.00);

CREATE SCHEMA b0_teste;
GRANT USAGE ON SCHEMA b0_teste TO authenticated;
CREATE TABLE b0_teste.fixtures (ordem int PRIMARY KEY, tab text NOT NULL, ins text NOT NULL);
GRANT SELECT ON b0_teste.fixtures TO authenticated;

INSERT INTO b0_teste.fixtures (ordem, tab, ins) VALUES
 (1,'fornecedores',
  $q$INSERT INTO public.fornecedores (id, nome) VALUES ('30000000-0000-0000-0000-0000000000a4','B0 fornecedor')$q$),
 (2,'insumos',
  $q$INSERT INTO public.insumos (id, nome) VALUES ('30000000-0000-0000-0000-0000000000a3','B0 insumo')$q$),
 (3,'compras',
  $q$INSERT INTO public.compras (id) VALUES ('30000000-0000-0000-0000-0000000000a5')$q$),
 (4,'fichas_tecnicas',
  $q$INSERT INTO public.fichas_tecnicas (id, produto_id) VALUES ('30000000-0000-0000-0000-0000000000a8','30000000-0000-0000-0000-0000000000a2')$q$),
 (5,'insumo_lotes',
  $q$INSERT INTO public.insumo_lotes (id, insumo_id, quantidade, restante) VALUES ('30000000-0000-0000-0000-0000000000a6','30000000-0000-0000-0000-0000000000a3',1,1)$q$),
 (6,'compra_itens',
  $q$INSERT INTO public.compra_itens (id, compra_id, insumo_id, quantidade) VALUES ('30000000-0000-0000-0000-0000000000a7','30000000-0000-0000-0000-0000000000a5','30000000-0000-0000-0000-0000000000a3',1)$q$),
 (7,'ficha_itens',
  $q$INSERT INTO public.ficha_itens (id, ficha_id, insumo_id, quantidade) VALUES ('30000000-0000-0000-0000-0000000000a9','30000000-0000-0000-0000-0000000000a8','30000000-0000-0000-0000-0000000000a3',1)$q$);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE r.ins;
  END LOOP;
  RAISE NOTICE 'B1: fixtures criadas nas 7 tabelas';
END $$;

-- ---------------------------------------------------------------------------
-- 2. admin: le e escreve
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-0000000000b1';
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'admin: SELECT em % devolveu % (esperado 1)', r.tab, n; END IF;
  END LOOP;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem DESC LOOP
    EXECUTE format('DELETE FROM public.%I', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'admin: DELETE em % afetou % (esperado 1)', r.tab, n; END IF;
  END LOOP;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE r.ins;
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'admin: INSERT em % nao restaurou a linha', r.tab; END IF;
  END LOOP;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'admin: UPDATE em % afetou % (esperado 1)', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: admin le, apaga, insere e atualiza nas 7 tabelas';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. financeiro: le e escreve
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-0000000000b2';
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'financeiro: SELECT em % devolveu % (esperado 1)', r.tab, n; END IF;
  END LOOP;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem DESC LOOP
    EXECUTE format('DELETE FROM public.%I', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'financeiro: DELETE em % afetou % (esperado 1)', r.tab, n; END IF;
  END LOOP;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE r.ins;
  END LOOP;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'financeiro: UPDATE em % afetou % (esperado 1)', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: financeiro le, apaga, insere e atualiza nas 7 tabelas';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. producao: le, NAO escreve (o ponto exato do item 6)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-0000000000b3';
DO $$
DECLARE r record; n int; v_aceitou int := 0;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'producao: SELECT em % devolveu % (esperado 1: producao le)', r.tab, n; END IF;
  END LOOP;

  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem DESC LOOP
    EXECUTE format('DELETE FROM public.%I', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'producao: DELETE em % afetou % linha(s)', r.tab, n; END IF;
  END LOOP;

  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    BEGIN
      EXECUTE r.ins;
      v_aceitou := v_aceitou + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;  -- esperado: WITH CHECK da policy write nao inclui producao
    END;
  END LOOP;
  IF v_aceitou <> 0 THEN
    RAISE EXCEPTION 'producao: % INSERT(s) aceitos (esperado 0)', v_aceitou;
  END IF;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'producao: UPDATE em % afetou % linha(s)', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: producao le mas nao apaga, nao insere e nao atualiza nas 7 tabelas';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5-7. atendente, motoboy e usuario sem papel: sem acesso
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-0000000000b4';
DO $$
DECLARE r record; n int; v_leu int := 0; v_aceitou int := 0;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'atendente: SELECT em % devolveu % (esperado 0)', r.tab, n; END IF;
    EXECUTE format('DELETE FROM public.%I', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'atendente: DELETE em % afetou %', r.tab, n; END IF;
    BEGIN
      EXECUTE r.ins;
      v_aceitou := v_aceitou + 1;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF v_aceitou <> 0 THEN RAISE EXCEPTION 'atendente: % INSERT(s) aceitos', v_aceitou; END IF;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'atendente: UPDATE em % afetou %', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: atendente sem acesso as 7 tabelas';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-0000000000b5';
DO $$
DECLARE r record; n int; v_aceitou int := 0;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'motoboy: SELECT em % devolveu % (esperado 0)', r.tab, n; END IF;
    EXECUTE format('DELETE FROM public.%I', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'motoboy: DELETE em % afetou %', r.tab, n; END IF;
    BEGIN
      EXECUTE r.ins;
      v_aceitou := v_aceitou + 1;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF v_aceitou <> 0 THEN RAISE EXCEPTION 'motoboy: % INSERT(s) aceitos', v_aceitou; END IF;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'motoboy: UPDATE em % afetou %', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: motoboy sem acesso as 7 tabelas';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '20000000-0000-0000-0000-0000000000b6';
DO $$
DECLARE r record; n int; v_aceitou int := 0;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'sem papel: SELECT em % devolveu % (esperado 0)', r.tab, n; END IF;
    EXECUTE format('DELETE FROM public.%I', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'sem papel: DELETE em % afetou %', r.tab, n; END IF;
    BEGIN
      EXECUTE r.ins;
      v_aceitou := v_aceitou + 1;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  IF v_aceitou <> 0 THEN RAISE EXCEPTION 'sem papel: % INSERT(s) aceitos', v_aceitou; END IF;
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.tab);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'sem papel: UPDATE em % afetou %', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: usuario autenticado sem papel nao acessa as 7 tabelas';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 8. As fixtures sobreviveram intactas as tentativas negadas
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM b0_teste.fixtures ORDER BY ordem LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tab) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'B1: fixture de % terminou com % linha(s)', r.tab, n; END IF;
  END LOOP;
  RAISE NOTICE 'B1: fixtures intactas apos todas as tentativas negadas';
END $$;

\echo 'MATRIZ 05: matriz de permissoes das 7 tabelas aprovada'


