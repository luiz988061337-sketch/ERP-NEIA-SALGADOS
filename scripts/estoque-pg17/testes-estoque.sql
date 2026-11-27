-- Ensaios transacionais locais do Estoque de Salgados. Cluster descartável.
-- Executar com psql -v ON_ERROR_STOP=1, sem --single-transaction (há transactions
-- internas e uma reversão simulada). Nenhuma conexão remota é aberta.
CREATE OR REPLACE FUNCTION public.assert_teste(p_cond boolean, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'ASSERT: %', p_msg;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.assert_teste(boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. ACL da 0133: reconciliação mínima, sem grants amplos
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  s1 text := 'public.reservar_estoque_atomica(uuid,uuid,integer)';
  s2 text := 'public.reservar_pedido_atomico(uuid)';
  r  text;
BEGIN
  FOREACH r IN ARRAY ARRAY[s1, s2] LOOP
    IF NOT pg_catalog.has_function_privilege('authenticated', r, 'EXECUTE') THEN
      RAISE EXCEPTION '0133 não concedeu EXECUTE a authenticated: %', r;
    END IF;
    IF pg_catalog.has_function_privilege('anon', r, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', r, 'EXECUTE') THEN
      RAISE EXCEPTION '0133 deixou grant amplo em %', r;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid = pg_catalog.to_regprocedure(r)::oid
        AND EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        )
    ) THEN
      RAISE EXCEPTION 'PUBLIC conserva EXECUTE em %', r;
    END IF;
  END LOOP;
  RAISE NOTICE 'ACL 0133 OK';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Configuração inicial e modo padrão sem remover proteções
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);

SELECT public.assert_teste(
  (public.configurar_salgado_estoque('coxinha-frango', 100, 0, true, NULL)->>'status') = 'ok',
  'configurar coxinha');
SELECT public.assert_teste(
  (public.configurar_salgado_estoque('pizza-queijo', 100, 0, true, NULL)->>'status') = 'ok',
  'configurar pizza');
SELECT public.assert_teste(
  (public.configurar_salgado_estoque('esfirra-carne', 100, 0, true, NULL)->>'status') = 'ok',
  'configurar esfirra');
SELECT public.assert_teste(
  (public.configurar_modo_salgados('monitoramento', false)->>'status') = 'ok',
  'configurar modo');
SELECT public.assert_teste(
  (SELECT protecoes_essenciais FROM public.salgados_operacao_config WHERE id),
  'proteções essenciais foram removidas');

SELECT public.assert_teste(
  public.movimentar_lote_salgado(
    'coxinha-frango', NULL, 'entrada', 80,
    md5('teste:coxinha:lote1')::uuid, NULL, 'FEFO-1',
    DATE '2026-11-20', DATE '2027-01-31', 'Ensaio local') = 'registrado',
  'entrada FEFO-1');
SELECT public.assert_teste(
  public.movimentar_lote_salgado(
    'coxinha-frango', NULL, 'entrada', 70,
    md5('teste:coxinha:lote2')::uuid, NULL, 'FEFO-2',
    DATE '2026-11-20', DATE '2027-02-28', 'Ensaio local') = 'registrado',
  'entrada FEFO-2');

SELECT public.assert_teste(
  (public.avaliar_venda_salgado('coxinha-frango', 40, NULL, NULL)->>'status') = 'disponivel',
  'venda imediata sem compromisso');

-- A margem protege unidades já comprometidas na data consultada: sem
-- compromisso, fisico - reservado - margem não pode gerar margem_atingida.
SELECT public.assert_teste(
  (public.registrar_compromisso_salgado(
    'coxinha-frango', 100, current_date,
    md5('pedido-estoque:coxinha')::uuid,
    md5('teste:compromisso:margem-coxinha')::uuid)->>'status') = 'ok',
  'compromisso para exercitar a margem');
SELECT public.assert_teste(
  (public.avaliar_venda_salgado('coxinha-frango', 60, NULL, NULL)->>'status') = 'margem_atingida',
  'margem atingida não é indisponibilidade');
SELECT public.assert_teste(
  (public.avaliar_venda_salgado('coxinha-frango', 200, NULL, NULL)->>'status') = 'indisponivel',
  'indisponibilidade real');
SELECT public.assert_teste(
  (SELECT fisico = 150 AND reservado = 0 AND margem_seguranca = 100
   FROM public.vw_saldos_sabores_estoque WHERE chave = 'coxinha-frango'),
  'saldo canônico da coxinha');

-- ---------------------------------------------------------------------------
-- 3. Reserva FEFO, idempotência e liberação
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_res      jsonb;
  v_id       uuid;
  v_codigo   text;
  v_key      uuid := md5('teste:reserva:fefo')::uuid;
  v_lib_key  uuid := md5('teste:liberacao:fefo')::uuid;
BEGIN
  v_res := public.reservar_sabor_estoque(
    'coxinha-frango', 30, md5('pedido-estoque:coxinha')::uuid, v_key, NULL);
  IF v_res->>'status' <> 'ok' THEN
    RAISE EXCEPTION 'reserva FEFO falhou: %', v_res;
  END IF;
  v_id := (v_res->>'reserva_id')::uuid;
  SELECT l.codigo INTO v_codigo
  FROM public.reservas_estoque r JOIN public.lotes l ON l.id = r.lote_id
  WHERE r.id = v_id;
  IF v_codigo <> 'FEFO-1' THEN
    RAISE EXCEPTION 'FEFO escolheu % em vez do lote mais antigo', v_codigo;
  END IF;

  v_res := public.reservar_sabor_estoque(
    'coxinha-frango', 30, md5('pedido-estoque:coxinha')::uuid, v_key, NULL);
  IF v_res->>'status' <> 'ja_registrado' OR (v_res->>'reserva_id')::uuid <> v_id THEN
    RAISE EXCEPTION 'idempotência da reserva falhou: %', v_res;
  END IF;
  IF (SELECT count(*) FROM public.reservas_estoque WHERE chave_idempotencia = v_key) <> 1 THEN
    RAISE EXCEPTION 'reserva duplicada';
  END IF;

  v_res := public.liberar_reserva_sabor(v_id, 'Liberação de ensaio local', v_lib_key);
  IF v_res->>'status' <> 'ok' THEN
    RAISE EXCEPTION 'liberação falhou: %', v_res;
  END IF;
  v_res := public.liberar_reserva_sabor(v_id, 'Liberação repetida', v_lib_key);
  IF v_res->>'status' <> 'ja_liberada' THEN
    RAISE EXCEPTION 'liberação não é idempotente: %', v_res;
  END IF;
  IF (SELECT reservado FROM public.vw_saldos_sabores_estoque WHERE chave = 'coxinha-frango') <> 0 THEN
    RAISE EXCEPTION 'reservado não voltou a zero após liberação';
  END IF;
  RAISE NOTICE 'Reserva FEFO, idempotência e liberação OK';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Consumo parcial de reserva e baixa única
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_res   jsonb;
  v_id    uuid;
BEGIN
  v_res := public.reservar_sabor_estoque(
    'coxinha-frango', 30, md5('pedido-estoque:coxinha')::uuid,
    md5('teste:reserva:consumo')::uuid, NULL);
  IF v_res->>'status' <> 'ok' THEN RAISE EXCEPTION 'reserva para consumo falhou: %', v_res; END IF;
  v_id := (v_res->>'reserva_id')::uuid;

  IF public.movimentar_lote_salgado(
       p_sabor => 'coxinha-frango', p_produto => NULL, p_tipo => 'retirada',
       p_quantidade => 10, p_chave => md5('teste:consumo:parcial1')::uuid,
       p_reserva => v_id) <> 'registrado' THEN
    RAISE EXCEPTION 'primeiro consumo parcial falhou';
  END IF;
  IF (SELECT coalesce(sum(quantidade), 0) FROM public.reserva_consumos WHERE reserva_id = v_id) <> 10
     OR (SELECT reservado FROM public.vw_saldos_sabores_estoque WHERE chave = 'coxinha-frango') <> 20 THEN
    RAISE EXCEPTION 'consumo parcial não preservou o restante da reserva';
  END IF;

  IF public.movimentar_lote_salgado(
       p_sabor => 'coxinha-frango', p_produto => NULL, p_tipo => 'retirada',
       p_quantidade => 20, p_chave => md5('teste:consumo:parcial2')::uuid,
       p_reserva => v_id) <> 'registrado' THEN
    RAISE EXCEPTION 'segundo consumo parcial falhou';
  END IF;
  IF (SELECT coalesce(sum(quantidade), 0) FROM public.reserva_consumos WHERE reserva_id = v_id) <> 30
     OR (SELECT reservado FROM public.vw_saldos_sabores_estoque WHERE chave = 'coxinha-frango') <> 0 THEN
    RAISE EXCEPTION 'consumo total não zerou a reserva';
  END IF;
  RAISE NOTICE 'Consumo parcial e baixa FEFO OK';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Rollback: falha depois da escrita não persiste lote nem operação
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_key uuid := md5('teste:rollback')::uuid;
BEGIN
  BEGIN
    PERFORM public.movimentar_lote_salgado(
      'hamburguinho', NULL, 'entrada', 50, v_key, NULL, 'ROLLBACK-TESTE',
      DATE '2026-11-20', DATE '2027-01-31', 'Falha simulada após escrita');
    RAISE EXCEPTION 'falha simulada depois da escrita';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.estoque_mov_operacoes WHERE chave_idempotencia = v_key)
     OR EXISTS (SELECT 1 FROM public.lotes WHERE codigo = 'ROLLBACK-TESTE') THEN
    RAISE EXCEPTION 'rollback não desfez a movimentação';
  END IF;
  RAISE NOTICE 'Rollback transacional OK';
END $$;

-- ---------------------------------------------------------------------------
-- 6. Bloqueio por sabor/data não bloqueia o restante do cardápio
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
  v_res jsonb;
BEGIN
  v_res := public.bloquear_sabor_salgados(
    'pastel-carne', current_date, current_date + 1, 'Bloqueio de ensaio local');
  IF v_res->>'status' <> 'ok' THEN RAISE EXCEPTION 'bloqueio falhou: %', v_res; END IF;
  v_id := (v_res->>'bloqueio_id')::uuid;

  IF (public.avaliar_venda_salgado('pastel-carne', 1, current_date, NULL)->>'status') <> 'bloqueado' THEN
    RAISE EXCEPTION 'bloqueio não foi aplicado na avaliação';
  END IF;
  IF (public.avaliar_venda_salgado('coxinha-frango', 1, current_date, NULL)->>'status') = 'bloqueado' THEN
    RAISE EXCEPTION 'bloqueio de um sabor bloqueou outro sabor';
  END IF;
  IF (public.desbloquear_sabor_salgados(v_id, 'Desbloqueio de ensaio')->>'status') <> 'ok' THEN
    RAISE EXCEPTION 'desbloqueio falhou';
  END IF;
  RAISE NOTICE 'Bloqueio por sabor/data OK';
END $$;

-- ---------------------------------------------------------------------------
-- 7. Agendamentos: compromisso não cria estoque fictício; cobertura é real
-- ---------------------------------------------------------------------------
SELECT public.assert_teste(
  public.movimentar_lote_salgado(
    'pizza-queijo', NULL, 'entrada', 300,
    md5('teste:pizza:lote1')::uuid, NULL, 'COMPROMISSO-1',
    DATE '2026-11-20', DATE '2027-03-31', 'Ensaio local') = 'registrado',
  'entrada da pizza');

DO $$
DECLARE
  v_key     uuid := md5('teste:compromisso')::uuid;
  v_res     jsonb;
  v_comp    uuid;
  v_antes   integer;
  v_depois  integer;
BEGIN
  v_res := public.registrar_compromisso_salgado(
    'pizza-queijo', 150, current_date + 3,
    md5('pedido-estoque:pizza')::uuid, v_key);
  IF v_res->>'status' <> 'ok' THEN RAISE EXCEPTION 'compromisso falhou: %', v_res; END IF;
  v_comp := (v_res->>'compromisso_id')::uuid;

  IF (public.registrar_compromisso_salgado(
        'pizza-queijo', 150, current_date + 3,
        md5('pedido-estoque:pizza')::uuid, v_key)->>'status') <> 'ja_registrado' THEN
    RAISE EXCEPTION 'compromisso não é idempotente';
  END IF;
  IF (SELECT status FROM public.salgados_compromissos WHERE id = v_comp) <> 'pendente' THEN
    RAISE EXCEPTION 'compromisso não ficou pendente';
  END IF;
  IF (SELECT count(*) FROM public.lotes WHERE sabor_chave = 'pizza-queijo') <> 1 THEN
    RAISE EXCEPTION 'compromisso criou lote fictício';
  END IF;
  -- Data futura com quantidade acima da margem disponível vai para análise:
  -- nunca cria reserva física nem estoque fictício.
  IF (public.avaliar_venda_salgado(
        'pizza-queijo', 160, current_date + 3, NULL)->>'status') <> 'analise_necessaria' THEN
    RAISE EXCEPTION 'compromisso futuro não reduziu a disponibilidade';
  END IF;

  SELECT count(*) INTO v_antes FROM public.reservas_estoque
  WHERE pedido_id = md5('pedido-estoque:pizza')::uuid;
  v_res := public.reservar_sabor_estoque(
    'pizza-queijo', 10, md5('pedido-estoque:pizza')::uuid,
    md5('teste:reserva:futura')::uuid, current_date + 3);
  IF v_res->>'status' <> 'analise_necessaria' THEN
    RAISE EXCEPTION 'reserva física em data futura deveria ir para análise: %', v_res;
  END IF;
  SELECT count(*) INTO v_depois FROM public.reservas_estoque
  WHERE pedido_id = md5('pedido-estoque:pizza')::uuid;
  IF v_antes <> v_depois THEN
    RAISE EXCEPTION 'recusa em data futura alterou reservas do pedido';
  END IF;
  RAISE NOTICE 'Compromisso futuro sem estoque fictício OK';
END $$;

SELECT public.assert_teste(
  public.movimentar_lote_salgado(
    'pizza-queijo', NULL, 'entrada', 150,
    md5('teste:pizza:cobertura')::uuid, NULL, 'COMPROMISSO-2',
    DATE '2026-11-20', DATE '2027-03-31', 'Cobertura real do compromisso') = 'registrado',
  'entrada de cobertura do compromisso');

-- `cobrir_compromissos_salgados` é helper interno sem EXECUTE para authenticated.
-- A primeira cobertura já foi feita pela própria entrada real. Aqui o chamador é
-- o owner do cluster, apenas para confirmar que repetir a ação não duplica vínculo.
RESET ROLE;
DO $$
DECLARE
  v_comp uuid;
  v_lote uuid;
BEGIN
  SELECT id INTO v_comp FROM public.salgados_compromissos
  WHERE chave_idempotencia = md5('teste:compromisso')::uuid;
  SELECT id INTO v_lote FROM public.lotes WHERE codigo = 'COMPROMISSO-2';

  IF (SELECT status FROM public.salgados_compromissos WHERE id = v_comp) <> 'coberto' THEN
    RAISE EXCEPTION 'entrada real não cobriu o compromisso';
  END IF;
  IF (SELECT count(*) FROM public.salgados_compromisso_coberturas WHERE compromisso_id = v_comp) <> 1
     OR (SELECT coalesce(sum(quantidade), 0)
         FROM public.salgados_compromisso_coberturas WHERE compromisso_id = v_comp) <> 150 THEN
    RAISE EXCEPTION 'cobertura duplicada ou incompleta';
  END IF;

  PERFORM public.cobrir_compromissos_salgados(v_lote, md5('teste:pizza:cobertura')::uuid);
  PERFORM public.cobrir_compromissos_salgados(v_lote, md5('teste:pizza:cobertura')::uuid);
  IF (SELECT count(*) FROM public.salgados_compromisso_coberturas WHERE compromisso_id = v_comp) <> 1 THEN
    RAISE EXCEPTION 'reexecução da cobertura duplicou vínculo';
  END IF;
  RAISE NOTICE 'Cobertura real de compromisso OK';
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
SELECT public.assert_teste(
  (public.avaliar_venda_salgado(
    'pizza-queijo', 160, current_date + 3, NULL)->>'status') = 'disponivel',
  'cobertura real não liberou a disponibilidade futura');

-- ---------------------------------------------------------------------------
-- 8. Solicitação, resposta parcial, notificação, reconhecimento e uso único
-- ---------------------------------------------------------------------------
SELECT public.assert_teste(
  public.movimentar_lote_salgado(
    'esfirra-carne', NULL, 'entrada', 200,
    md5('teste:esfirra:lote1')::uuid, NULL, 'SOLIC-1',
    DATE '2026-11-20', DATE '2027-01-31', 'Ensaio local') = 'registrado',
  'entrada da esfirra');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'atendente@estoque.teste'), false);
DO $$
DECLARE
  v_res jsonb := public.solicitar_salgado(
    'liberacao_excepcional', 'esfirra-carne', 150, 'Teste de liberação parcial',
    md5('teste:solicitacao:liberacao')::uuid, current_date,
    md5('pedido-estoque:esfirra')::uuid);
BEGIN
  IF v_res->>'status' <> 'ok' THEN RAISE EXCEPTION 'solicitação falhou: %', v_res; END IF;
END $$;

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
DO $$
DECLARE
  v_sol uuid;
  v_res jsonb;
BEGIN
  SELECT id INTO v_sol FROM public.salgados_solicitacoes
  WHERE chave_idempotencia = md5('teste:solicitacao:liberacao')::uuid;

  v_res := public.responder_solicitacao_salgado(
    v_sol, 'parcial', 120, 80, 'Liberação parcial de ensaio', NULL,
    md5('teste:resposta:liberacao')::uuid);
  IF v_res->>'status' <> 'ok' OR v_res->>'autorizacao_id' IS NULL THEN
    RAISE EXCEPTION 'resposta parcial falhou: %', v_res;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notificacoes
    WHERE tipo = 'salgados_resposta' AND link = '/atendente'
      AND detalhe NOT ILIKE '%esfirra%' AND detalhe NOT ILIKE '%80%'
  ) THEN
    RAISE EXCEPTION 'notificação genérica ausente ou com dado sensível';
  END IF;
  RAISE NOTICE 'Resposta parcial e notificação OK';
END $$;

-- Detalhes da resposta: somente solicitante e responsável autorizado.
SELECT public.assert_teste(
  (SELECT count(*) FROM public.vw_salgados_notificacoes_atendente
   WHERE chave = 'esfirra-carne') = 1,
  'responsável não vê detalhe da resposta');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'atendente@estoque.teste'), false);
SELECT public.assert_teste(
  (SELECT count(*) FROM public.vw_salgados_notificacoes_atendente
   WHERE chave = 'esfirra-carne') = 1,
  'solicitante não vê detalhe da resposta');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'atendente2@estoque.teste'), false);
SELECT public.assert_teste(
  (SELECT count(*) FROM public.vw_salgados_notificacoes_atendente
   WHERE chave = 'esfirra-carne') = 0,
  'atendente alheio viu detalhe da resposta');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'motoboy@estoque.teste'), false);
SELECT public.assert_teste(
  (SELECT count(*) FROM public.vw_saldos_sabores_estoque) = 0,
  'motoboy leu saldo de estoque');
SELECT public.assert_teste(
  (SELECT count(*) FROM public.vw_salgados_notificacoes_atendente) = 0,
  'motoboy leu detalhe de solicitação');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'atendente@estoque.teste'), false);
SELECT public.assert_teste(
  (public.reconhecer_resposta_salgado(
    (SELECT id FROM public.salgados_solicitacoes
     WHERE chave_idempotencia = md5('teste:solicitacao:liberacao')::uuid))->>'status') = 'ok',
  'reconhecimento falhou');
SELECT public.assert_teste(
  (public.reconhecer_resposta_salgado(
    (SELECT id FROM public.salgados_solicitacoes
     WHERE chave_idempotencia = md5('teste:solicitacao:liberacao')::uuid))->>'status') = 'ja_reconhecida',
  'reconhecimento duplicado');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
DO $$
DECLARE
  v_aut uuid;
  v_res jsonb;
BEGIN
  SELECT id INTO v_aut FROM public.salgados_autorizacoes
  WHERE solicitacao_id = (SELECT id FROM public.salgados_solicitacoes
    WHERE chave_idempotencia = md5('teste:solicitacao:liberacao')::uuid);

  v_res := public.usar_autorizacao_salgado(
    v_aut, md5('pedido-estoque:esfirra')::uuid, 80);
  IF v_res->>'status' <> 'ok' THEN RAISE EXCEPTION 'uso da autorização falhou: %', v_res; END IF;
  IF (public.usar_autorizacao_salgado(
        v_aut, md5('pedido-estoque:esfirra')::uuid, 80)->>'status') <> 'ja_utilizada' THEN
    RAISE EXCEPTION 'autorização foi reutilizada';
  END IF;
  RAISE NOTICE 'Autorização de uso único OK';
END $$;

-- Liberação sem cobertura física não pode ser aprovada.
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'atendente@estoque.teste'), false);
SELECT public.assert_teste(
  (public.solicitar_salgado(
    'liberacao_excepcional', 'esfirra-carne', 500, 'Sem cobertura física',
    md5('teste:solicitacao:sem-cobertura')::uuid, current_date,
    md5('pedido-estoque:esfirra')::uuid)->>'status') = 'ok',
  'solicitação sem cobertura');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
DO $$
DECLARE
  v_sol uuid;
  v_status text;
BEGIN
  SELECT id INTO v_sol FROM public.salgados_solicitacoes
  WHERE chave_idempotencia = md5('teste:solicitacao:sem-cobertura')::uuid;
  SELECT public.responder_solicitacao_salgado(
    v_sol, 'aprovada', NULL, 500, 'Tentativa sem cobertura', NULL,
    md5('teste:resposta:sem-cobertura')::uuid)->>'status' INTO v_status;
  IF v_status NOT IN ('liberacao_nao_permitida', 'liberacao_sem_cobertura_fisica') THEN
    RAISE EXCEPTION 'liberação sem cobertura foi aceita: %', v_status;
  END IF;
  RAISE NOTICE 'Recusa de liberação sem cobertura física OK';
END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'Ensaios transacionais locais concluídos com sucesso'; END $$;
