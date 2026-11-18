-- ============================================================================
-- 05 - CORRECOES DE SEGURANCA DA B0 (itens 1 a 6)
-- ============================================================================
-- LABORATORIO SEM DADOS REAIS. Nao aplicar em projeto remoto.
-- Roda DEPOIS de 04-complemento-hardening.sql.
--
-- Autoridade de cada regra (nenhuma regra nova foi inventada):
--   item 1  -> policies-alvo transcritas do esquema-alvo; view parceiros_publicos
--   item 2  -> convencao ja usada em 01-funcoes-essenciais.sql:2447
--              (SET search_path TO 'public', 'pg_temp')
--   item 3  -> drizzle/migrations/0098_acl_menor_privilegio.sql (matriz de menor
--              privilegio) + chamadores provados em src/ + corpo das funcoes
--   item 5  -> 00-permissoes-novas.sql:232-260 (mesma tecnica, aplicada a todas
--              as tabelas de public)
--   item 6  -> policies-alvo de 0096, transcritas do esquema-alvo
--
-- FORA DESTA RODADA, POR DECISAO REGISTRADA:
--   - item 4 (conceder EXECUTE em reservar_estoque_atomica / liberar_reserva_atomica):
--     apenas analisado. Ver bloco 3.5 e o relatorio.
--   - itens 7 a 11 da B0: enum 'contador', policies operacionais, 35 colunas,
--     indice rotas_preparando_motoboy_uniq e schema neia_operacao.
-- ============================================================================
BEGIN;
SET LOCAL search_path = pg_catalog, public;
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
 OR current_user !~ '^restore_[a-f0-9]{12}$'
 OR current_setting('neia_homologacao.ensaio',true) IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
  RAISE EXCEPTION 'Lote 05 restrito ao laboratorio local isolado.';
 END IF;
END $local$;

-- ============================================================================
-- 0. PRECONDICOES
-- ============================================================================
-- 0.1 O caminho publico legitimo de leitura precisa existir antes de fechar a
--     tabela: a pagina /parceiros le public.parceiros_publicos (VIEW).
DO $$ BEGIN
 IF to_regclass('public.parceiros_publicos') IS NULL THEN
  RAISE EXCEPTION '05: view parceiros_publicos ausente; leitura publica de parceiros nao pode ser removida';
 END IF;
END $$;

-- 0.2 A candidatura publica e a unica escrita anonima legitima em parceiros.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parceiros'
                 AND policyname='parceiros candidatura' AND cmd='INSERT') THEN
  RAISE EXCEPTION '05: policy parceiros candidatura ausente; formulario publico quebraria';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parceiros'
                 AND policyname='parceiros admin read' AND cmd='SELECT') THEN
  RAISE EXCEPTION '05: policy parceiros admin read ausente; admin perderia leitura';
 END IF;
END $$;

-- ============================================================================
-- 1. ITEM 1 - POLICIES EXCESSIVAMENTE PERMISSIVAS DE public.parceiros
-- ============================================================================
-- "parceiros write": INSERT para PUBLIC com WITH CHECK (true)  -> qualquer
--   portador da chave anonima gravava linha sem validacao (inclusive status
--   'aprovada', auto-aprovando-se).
-- "parceiros read": SELECT para PUBLIC com USING (true) -> expunha a tabela
--   inteira, incluindo email/whatsapp/cnpj/proposta de candidaturas nao
--   publicadas. A lista publica usa a VIEW.
-- Convergencia com o alvo: admin mantem leitura (policy ja existente) e recebe
-- a escrita administrativa; o publico continua servido pela view e pela
-- policy de candidatura.
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros read"  ON public.parceiros;
DROP POLICY IF EXISTS "parceiros admin write" ON public.parceiros;
CREATE POLICY "parceiros admin write" ON public.parceiros TO authenticated
 USING (public.has_role(auth.uid(), 'admin'::public.app_role))
 WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================================
-- 2. ITEM 2 - search_path das tres funcoes SECURITY DEFINER sem configuracao
-- ============================================================================
-- Corpo auditado nas tres (nenhum nome nao qualificado fora de public/pg_catalog):
--   processar_lembretes        -> pedidos, pedido_lembretes, now(), interval
--   reservar_estoque_atomica   -> public.produtos, public.reservas_estoque, public.estoque_mov
--   liberar_reserva_atomica    -> idem
-- Por isso 'public', 'pg_temp' preserva a resolucao atual e apenas desloca o
-- schema temporario para o FIM (sem pg_temp explicito ele e' pesquisado antes).
-- Mesmo formato ja usado em 01-funcoes-essenciais.sql:2447.
-- ALTER FUNCTION nao altera o corpo: so a configuracao da funcao.
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('public.processar_lembretes()'),
   ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
   ('public.liberar_reserva_atomica(uuid)')
 ) t(sig) LOOP
   IF to_regprocedure(r.sig) IS NOT NULL THEN
     EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
   END IF;
 END LOOP;
END $$;

-- ============================================================================
-- 3. ITEM 3 - EXECUTE das funcoes de public
-- ============================================================================
-- Regra: quem nao tem chamador provado nao recebe EXECUTE. Dono sempre executa,
-- entao cron (postgres) e chamadas internas de funcoes SECURITY DEFINER seguem
-- funcionando sem grant. Trigger nao verifica EXECUTE do chamador (convencao 0098).
--
-- 3.1 SOMENTE O DONO: sem chamador no app; chamadas internas sao de funcoes
--     SECURITY DEFINER (verificado corpo a corpo no dump do hospedado).
DO $$
DECLARE r record; v_role text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   -- funcoes de trigger / guarda
   ('public.consumir_insumos_pedido_trigger()'),
   ('public.handle_new_user()'),
   ('public.pedidos_guard_update()'),
   ('public.profiles_guard_pontos()'),
   ('public.profiles_guard_pontos_insert()'),
   ('public.trg_gerar_cupom_apos_itens()'),
   ('public.trg_pagamento_confirmado()'),
   ('public.trigger_criar_fritura_fila()'),
   ('public.trigger_entrega_motoboy()'),
   ('public.trigger_reservar_estoque()'),
   ('public.trigger_saida_motoboy()'),
   ('public.validar_dados_fiscais_emissao()'),
   ('public.validar_endereco_entrega()'),
   ('public.validar_transicao_status()'),
   -- rotinas internas / sem chamador
   ('public.processar_lembretes()'),
   ('public.calcular_tempo_fritura(uuid,integer)'),
   ('public.gerar_msg_apartamento(uuid)'),
   ('public.liberar_reserva_pedido(uuid)'),
   ('public.reservar_estoque_pedido(uuid)'),
   ('public.registrar_mov_estoque(uuid,public.tipo_mov_estoque,integer,uuid,uuid,text,uuid,text)'),
   ('public.registrar_mov_estoque(uuid,public.tipo_mov_estoque,integer,uuid,uuid,text,uuid,text,boolean)')
 ) t(sig) LOOP
   IF to_regprocedure(r.sig) IS NULL THEN CONTINUE; END IF;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
   FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
     IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
       EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, v_role);
     END IF;
   END LOOP;
 END LOOP;
END $$;

-- 3.2 SOMENTE authenticated: RPCs com chamador provado no frontend.
--     receber_compra_item -> src/components/admin/estoque/compras-admin.tsx:148
--     As demais sao utilitarias DEFINER sem chamador direto; recebem
--     authenticated por paridade com o esquema-alvo, sem alcance anonimo.
DO $$
DECLARE r record; v_role text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('public.receber_compra_item(uuid,numeric,text,date)'),
   ('public.gerar_cupons_pedidos_pagos()'),
   ('public.consumir_insumos_pedido(uuid)'),
   ('public.converter_unidade(numeric,text,text)')
 ) t(sig) LOOP
   IF to_regprocedure(r.sig) IS NULL THEN CONTINUE; END IF;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
   FOREACH v_role IN ARRAY ARRAY['anon','service_role'] LOOP
     IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
       EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, v_role);
     END IF;
   END LOOP;
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
   END IF;
 END LOOP;
END $$;

-- 3.3 enfileirar_cupom: authenticated + service_role, sem anon. O agente de
--     impressao usa service_role (esquema-alvo); o app nao chama no navegador
--     (checkout.tsx cita a funcao apenas em comentario).
DO $$
DECLARE v_sig text := 'public.enfileirar_cupom(uuid)'; v_role text;
BEGIN
 IF to_regprocedure(v_sig) IS NULL THEN RETURN; END IF;
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
 END IF;
 FOREACH v_role IN ARRAY ARRAY['authenticated','service_role'] LOOP
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_sig, v_role);
   END IF;
 END LOOP;
END $$;

-- 3.4 public.has_role NAO e' tocada: as proprias policies a invocam, portanto
--     anon e authenticated precisam de EXECUTE nela. Funcao de leitura pura,
--     sem efeito colateral. Registrada como excecao consciente.
DO $$ BEGIN
 IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NOT NULL THEN
  IF NOT has_function_privilege('anon','public.has_role(uuid,public.app_role)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.has_role(uuid,public.app_role)','EXECUTE') THEN
   RAISE EXCEPTION '05: has_role perdeu EXECUTE; policies deixariam de avaliar';
  END IF;
 END IF;
END $$;

-- 3.5 ITEM 4 - APENAS ANALISE, SEM CONCESSAO.
--     No hospedado, reservar_estoque_atomica e liberar_reserva_atomica sao a
--     versao legada da 0030: recebem p_pedido_id do chamador e mexem no estoque
--     sem comparar com auth.uid(). A versao com guarda de dono (0088) e as
--     concessoes da 0098 nunca chegaram ao projeto. Conceder authenticated aqui
--     permitiria a qualquer usuario autenticado reservar/liberar estoque de
--     pedidos alheios. Por isso o lote apenas garante que nada foi concedido.

-- ============================================================================
-- 4. ITEM 5 - TRUNCATE, REFERENCES, TRIGGER e MAINTAIN
-- ============================================================================
-- Nenhum desses privilegios e' usado pelo PostgREST nem pelo app. TRUNCATE nao
-- e' filtrado por RLS e apaga a tabela inteira em conexao direta ao pooler.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- MAINTAIN existe a partir do PG17.
DO $$ BEGIN
 IF current_setting('server_version_num')::int >= 170000 THEN
  EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
 END IF;
END $$;

-- Default privileges: sem isso, a proxima tabela nasce com os mesmos privilegios.
-- Aplicado a cada papel que cria objetos em public (o dono do schema e, quando
-- existirem, os papeis de provisionamento do Supabase). Best-effort explicito:
-- sem permissao, registra aviso em vez de abortar.
DO $$
DECLARE r text; v_pg17 boolean := current_setting('server_version_num')::int >= 170000;
BEGIN
 FOR r IN
   SELECT DISTINCT x FROM (
     SELECT pg_get_userbyid(nspowner) AS x FROM pg_namespace WHERE nspname='public'
     -- papeis que de fato criam tabelas em public neste banco (dono = quem cria)
     UNION ALL SELECT pg_get_userbyid(relowner) FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p')
     UNION ALL SELECT 'postgres'      WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres')
     UNION ALL SELECT 'supabase_admin' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin')
   ) s WHERE x IS NOT NULL
 LOOP
   BEGIN
     EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated', r);
     IF v_pg17 THEN
       EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM anon, authenticated', r);
     END IF;
   EXCEPTION WHEN insufficient_privilege THEN
     RAISE NOTICE '05: sem privilegio para ajustar default privileges de %', r;
   END;
 END LOOP;
END $$;

-- ============================================================================
-- 5. ITEM 6 - staff ALL -> leitura e escrita minimas
-- ============================================================================
-- Sete tabelas tinham UMA policy ALL com a expressao de staff, o que dava a
-- producao poder de escrita. O alvo separa:
--   read  -> admin, financeiro, producao   (SELECT)
--   write -> admin, financeiro             (ALL; inclui DELETE, como no alvo)
-- A policy de escrita NAO remove DELETE: preserva o regime do esquema-alvo.
-- insumos recebe as quatro operacoes separadas, com a mesma expressao do alvo.

DROP POLICY IF EXISTS "compra_itens staff" ON public.compra_itens;
DROP POLICY IF EXISTS "compra_itens read" ON public.compra_itens;
DROP POLICY IF EXISTS "compra_itens write" ON public.compra_itens;
CREATE POLICY "compra_itens read" ON public.compra_itens FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "compra_itens write" ON public.compra_itens TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

DROP POLICY IF EXISTS "compras staff" ON public.compras;
DROP POLICY IF EXISTS "compras read" ON public.compras;
DROP POLICY IF EXISTS "compras write" ON public.compras;
CREATE POLICY "compras read" ON public.compras FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "compras write" ON public.compras TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

DROP POLICY IF EXISTS "ficha_itens staff" ON public.ficha_itens;
DROP POLICY IF EXISTS "ficha_itens read" ON public.ficha_itens;
DROP POLICY IF EXISTS "ficha_itens write" ON public.ficha_itens;
CREATE POLICY "ficha_itens read" ON public.ficha_itens FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "ficha_itens write" ON public.ficha_itens TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

-- ATENCAO: a policy ALL do hospedado nesta tabela chama-se "fichas staff".
DROP POLICY IF EXISTS "fichas_tecnicas staff" ON public.fichas_tecnicas;
DROP POLICY IF EXISTS "fichas staff" ON public.fichas_tecnicas;
DROP POLICY IF EXISTS "fichas read" ON public.fichas_tecnicas;
DROP POLICY IF EXISTS "fichas write" ON public.fichas_tecnicas;
CREATE POLICY "fichas read" ON public.fichas_tecnicas FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "fichas write" ON public.fichas_tecnicas TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

DROP POLICY IF EXISTS "fornecedores staff" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores read" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores write" ON public.fornecedores;
CREATE POLICY "fornecedores read" ON public.fornecedores FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "fornecedores write" ON public.fornecedores TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

DROP POLICY IF EXISTS "insumo_lotes staff" ON public.insumo_lotes;
DROP POLICY IF EXISTS "insumo_lotes read" ON public.insumo_lotes;
DROP POLICY IF EXISTS "insumo_lotes write" ON public.insumo_lotes;
CREATE POLICY "insumo_lotes read" ON public.insumo_lotes FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "insumo_lotes write" ON public.insumo_lotes TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

DROP POLICY IF EXISTS "insumos staff" ON public.insumos;
DROP POLICY IF EXISTS "insumos read" ON public.insumos;
DROP POLICY IF EXISTS "insumos write" ON public.insumos;
DROP POLICY IF EXISTS "insumos update" ON public.insumos;
DROP POLICY IF EXISTS "insumos delete" ON public.insumos;
CREATE POLICY "insumos read" ON public.insumos FOR SELECT TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)));
CREATE POLICY "insumos write" ON public.insumos FOR INSERT TO authenticated
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));
CREATE POLICY "insumos update" ON public.insumos FOR UPDATE TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)))
 WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));
CREATE POLICY "insumos delete" ON public.insumos FOR DELETE TO authenticated
 USING ((public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));

COMMIT;
