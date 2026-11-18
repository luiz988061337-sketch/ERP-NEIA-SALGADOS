-- Delta seletivo ate 0123. Nao reexecuta migrations historicas.
-- Nenhuma flag e ativada; nenhum dado historico e preenchido.
\set ON_ERROR_STOP on
BEGIN;
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
 OR current_user !~ '^restore_[a-f0-9]{12}$'
 OR current_setting('neia_homologacao.ensaio',true) IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
  RAISE EXCEPTION 'Rascunho restrito ao laboratorio local. Online exige revisao e autorizacao separadas.';
 END IF;
END $local$;

SET LOCAL check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.distancia_linha_reta_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT round(
    (6371.0088 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )))::numeric, 2)
$function$
;
REVOKE ALL ON FUNCTION public.distancia_linha_reta_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.distancia_linha_reta_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) TO authenticated;
CREATE OR REPLACE FUNCTION public.pedido_cobertura_reserva(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_itens      bigint := 0;
  v_unidades   integer := 0;
  v_montagem   integer := 0;
  v_cobertas   integer := 0;
  v_faltante   integer := 0;
  v_linha      record;
  v_cob        integer;
  v_controlado boolean := false;
  v_tem_prov   boolean := false;
BEGIN
  SELECT p.status, p.user_id INTO v_status, v_dono
    FROM public.pedidos p
   WHERE p.id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido', 'motivo', 'nao_encontrado');
  END IF;

  -- Protecao de leitura: dono ou staff. auth.uid() NULL = contexto interno.
  IF v_uid IS NOT NULL
     AND v_dono IS DISTINCT FROM v_uid
     AND NOT (public.has_role(v_uid, 'admin'::public.app_role)
              OR public.has_role(v_uid, 'atendente'::public.app_role)
              OR public.has_role(v_uid, 'producao'::public.app_role)) THEN
    RETURN jsonb_build_object('status', 'pedido_de_outro_usuario');
  END IF;

  IF v_status = 'cancelado' THEN
    RETURN jsonb_build_object('status', 'cancelado');
  END IF;

  SELECT count(*), COALESCE(SUM(i.quantidade), 0)
    INTO v_itens, v_unidades
    FROM public.pedido_itens i
   WHERE i.pedido_id = p_pedido_id;
  IF v_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido', 'motivo', 'sem_itens');
  END IF;

  SELECT COALESCE(SUM(i.quantidade), 0)
    INTO v_montagem
    FROM public.pedido_itens i
   WHERE i.pedido_id = p_pedido_id
     AND i.produto_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pedido_item_componentes c
        WHERE c.pedido_item_id = i.id
     );

  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'montagem',
      'itens', v_itens,
      'unidades', v_unidades,
      'montagem', v_montagem
    );
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT c.controlado INTO v_controlado
      FROM public.reserva_proveniencia_config c
     WHERE c.id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;
  v_tem_prov := to_regclass('public.reserva_proveniencia') IS NOT NULL;
  IF v_controlado AND NOT v_tem_prov THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'motivo', 'proveniencia_indisponivel'
    );
  END IF;

  -- Reserva liberada/cancelada em pedido ativo e inconsistencia: bloqueia.
  IF EXISTS (
    SELECT 1 FROM public.reservas_estoque r
     WHERE r.pedido_id = p_pedido_id AND r.status IN ('liberada', 'cancelada')
  ) THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'motivo', 'reserva_liberada_ou_cancelada',
      'unidades', v_unidades,
      'montagem', v_montagem
    );
  END IF;

  FOR v_linha IN
    SELECT pid AS produto_id, SUM(qtd)::int AS solicitado
      FROM (
        SELECT i.produto_id AS pid, i.quantidade AS qtd
          FROM public.pedido_itens i
         WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
        UNION ALL
        SELECT c.produto_id AS pid, c.quantidade AS qtd
          FROM public.pedido_itens i
          JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
         WHERE i.pedido_id = p_pedido_id
      ) s
     GROUP BY pid
     ORDER BY pid
  LOOP
    SELECT COALESCE(SUM(r.quantidade), 0)::int
      INTO v_cob
      FROM public.reservas_estoque r
     WHERE r.pedido_id = p_pedido_id
       AND r.produto_id = v_linha.produto_id
       AND r.status IN ('ativa', 'consumida');

    IF v_cob > v_linha.solicitado THEN
      RETURN jsonb_build_object(
        'status', 'reconciliacao_pendente',
        'motivo', 'cobertura_excedente',
        'produto_id', v_linha.produto_id,
        'solicitado', v_linha.solicitado,
        'coberto', v_cob
      );
    END IF;
    IF v_cob < v_linha.solicitado THEN
      v_faltante := v_faltante + (v_linha.solicitado - v_cob);
    END IF;
    v_cobertas := v_cobertas + v_cob;

    -- Cada reserva ativa/consumida precisa do debito correspondente no ledger.
    IF EXISTS (
      SELECT 1
        FROM public.reservas_estoque r
       WHERE r.pedido_id = p_pedido_id
         AND r.produto_id = v_linha.produto_id
         AND r.status IN ('ativa', 'consumida')
         AND COALESCE((
           SELECT SUM(-m.quantidade)
             FROM public.estoque_movimentacoes m
            WHERE m.referencia_tipo = 'reserva_estoque'
              AND m.referencia_id = r.id
              AND m.tipo = 'reserva'
              AND m.quantidade < 0
         ), 0) <> r.quantidade
    ) THEN
      RETURN jsonb_build_object(
        'status', 'reconciliacao_pendente',
        'motivo', 'debito_nao_comprovado',
        'produto_id', v_linha.produto_id
      );
    END IF;

    -- Proveniencia exigida somente quando o regime controlado esta ligado.
    IF v_controlado THEN
      IF EXISTS (
        SELECT 1
          FROM public.reservas_estoque r
         WHERE r.pedido_id = p_pedido_id
           AND r.produto_id = v_linha.produto_id
           AND r.status = 'ativa'
           AND NOT EXISTS (
             SELECT 1 FROM public.reserva_proveniencia rp WHERE rp.reserva_id = r.id
           )
      ) THEN
        RETURN jsonb_build_object(
          'status', 'reconciliacao_pendente',
          'motivo', 'proveniencia_ausente',
          'produto_id', v_linha.produto_id
        );
      END IF;
    END IF;
  END LOOP;

  IF v_faltante > 0 THEN
    RETURN jsonb_build_object(
      'status', 'sem_reserva',
      'faltante', v_faltante,
      'unidades', v_unidades,
      'cobertas', v_cobertas,
      'montagem', v_montagem
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'coberto',
    'unidades', v_unidades,
    'cobertas', v_cobertas,
    'montagem', v_montagem
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(p_pedido_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pedido_cobertura_reserva(p_pedido_id uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reservar_pedido_atomico(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_eh_staff   boolean;
  v_ids        uuid[];
  v_missing    uuid[];
  v_n_itens    integer;
  v_orfa       integer;
  v_montagem   integer;
  v_prod       record;
  v_solicitado bigint;
  v_ja         bigint;
  v_falta      bigint;
  v_faltas     jsonb := '[]'::jsonb;
  -- Plano congelado no PASSO 1 (aplicado sem re-leitura no PASSO 2):
  v_plan_ids   uuid[]    := '{}';
  v_plan_falta bigint[]  := '{}';
  v_plan_saldo integer[] := '{}';
  v_plan_n     integer;
  v_reserva_id uuid;
  v_mov_id     uuid;
  v_controlado boolean := false;
  i            integer;
BEGIN
  -- 1. Autenticação (auth.uid() é a única fonte de identidade).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 1b. Proveniência (0092): ler o controle de forma SEGURA (to_regclass). Se a
  --     0092 não estiver instalada, o regime fica desligado e nada quebra.
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT controlado
      INTO v_controlado
    FROM public.reserva_proveniencia_config
    WHERE id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;

  -- 2. L1: bloquear o pedido (serializa retries/consultas do mesmo pedido).
  SELECT user_id, status
    INTO v_dono, v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 3. Autorização: dono do pedido OU staff operacional (paridade 0068/0088).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN jsonb_build_object('status', 'permissao_negada');
    END IF;
  ELSIF v_dono IS DISTINCT FROM v_uid AND NOT v_eh_staff THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 4. Status elegível.
  IF v_status NOT IN ('recebido', 'em_producao') THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  -- 5. Pedido precisa ter itens (impede pedido incompleto/vazio).
  SELECT COUNT(*) INTO v_n_itens
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 6. Quantidade inválida (<=0) em qualquer item => recusa (não reserva lixo).
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
      AND (quantidade IS NULL OR quantidade <= 0)
  ) THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;

  -- 6b. Composição do combo: quantidade positiva e soma EXATA do item pai.
  IF EXISTS (
    SELECT 1
      FROM public.pedido_item_componentes c
      JOIN public.pedido_itens i ON i.id = c.pedido_item_id
     WHERE i.pedido_id = p_pedido_id
       AND (c.quantidade IS NULL OR c.quantidade <= 0)
  ) THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id
       AND i.produto_id IS NULL
       AND EXISTS (SELECT 1 FROM public.pedido_item_componentes c WHERE c.pedido_item_id = i.id)
       AND COALESCE((
         SELECT SUM(c.quantidade) FROM public.pedido_item_componentes c
          WHERE c.pedido_item_id = i.id
       ), 0) <> i.quantidade
  ) THEN
    RETURN jsonb_build_object('status', 'montagem_soma_divergente');
  END IF;

  -- 7. Itens de MONTAGEM sem composição (combo legado, produto_id NULL):
  --    NÃO entram no controle de estoque. Itens com `pedido_item_componentes`
  --    são reserváveis pelos componentes (abaixo) e NÃO contam como montagem.
  SELECT COUNT(*) INTO v_montagem
  FROM public.pedido_itens i
  WHERE i.pedido_id = p_pedido_id
    AND i.produto_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pedido_item_componentes c
       WHERE c.pedido_item_id = i.id
    );

  -- 8. Reservas ativas SEM prova confiável => reconciliação pendente.
  --    (Não debita, não credita, não altera status; apenas classifica.)
  --    Sem origem no ledger: indeterminada. Sempre executado; NÃO referencia
  --    reserva_proveniencia aqui (a 0092 pode não estar instalada).
  SELECT COUNT(*) INTO v_orfa
  FROM public.reservas_estoque r
  WHERE r.pedido_id = p_pedido_id
    AND r.status = 'ativa'
    AND NOT EXISTS (
      SELECT 1
      FROM public.estoque_movimentacoes em
      WHERE em.referencia_tipo = 'reserva_estoque'
        AND em.referencia_id = r.id
        AND em.tipo = 'reserva'
    );

  -- 8b. Sob regime controlado (0092), conta também as ativas SEM MARCADOR de
  --     proveniência (indeterminadas). Só aqui se referencia a tabela do marcador
  --     (dentro do IF), de modo que a função não quebra se a 0092 não existir.
  --     Marcador implica origem => este conjunto cobre o anterior (superset).
  IF v_controlado THEN
    SELECT COUNT(*) INTO v_orfa
    FROM public.reservas_estoque r
    WHERE r.pedido_id = p_pedido_id
      AND r.status = 'ativa'
      AND NOT EXISTS (
        SELECT 1 FROM public.reserva_proveniencia rp
        WHERE rp.reserva_id = r.id
      );
  END IF;

  IF v_orfa > 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'reservas', v_orfa);
  END IF;

  -- 9. Produtos reserváveis do pedido (itens com produto + componentes de
  --    combo), ordem determinística. `UNION` deduplica produto repetido.
  SELECT COALESCE(array_agg(DISTINCT pid ORDER BY pid), '{}'::uuid[])
    INTO v_ids
  FROM (
    SELECT i.produto_id AS pid
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id
       AND i.produto_id IS NOT NULL
    UNION
    SELECT c.produto_id AS pid
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    -- Só itens de montagem sem composição: nada a reservar.
    -- 'montagem' quantifica as linhas fora do controle de estoque.
    RETURN jsonb_build_object('status', 'ja_reservado', 'itens', 0, 'montagem', v_montagem);
  END IF;

  -- 10. TODO produto exigido precisa existir (não ignorar produto ausente).
  SELECT array_agg(u.pid) INTO v_missing
  FROM unnest(v_ids) AS u(pid)
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = u.pid);
  IF v_missing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'produto_inexistente', 'produtos', to_jsonb(v_missing));
  END IF;

  -- 11. PASSO 1 — LEITURA (lock ordenado por id): validar TODOS e congelar plano.
  --     Nenhuma escrita acontece antes de confirmar disponibilidade total.
  FOR v_prod IN
    SELECT id, estoque
    FROM public.produtos
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    SELECT COALESCE(SUM(qtd), 0) INTO v_solicitado
    FROM (
      SELECT i.quantidade AS qtd
        FROM public.pedido_itens i
       WHERE i.pedido_id = p_pedido_id AND i.produto_id = v_prod.id
      UNION ALL
      SELECT c.quantidade AS qtd
        FROM public.pedido_itens i
        JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
       WHERE i.pedido_id = p_pedido_id AND c.produto_id = v_prod.id
    ) s;

    -- Reivindicado = ativa (ainda no freezer) + consumida (já retirada).
    SELECT COALESCE(SUM(quantidade), 0) INTO v_ja
    FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id AND produto_id = v_prod.id
      AND status IN ('ativa', 'consumida');

    v_falta := v_solicitado - v_ja;
    IF v_falta > 0 THEN
      IF v_prod.estoque < v_falta THEN
        v_faltas := v_faltas || jsonb_build_object(
          'produto_id', v_prod.id,
          'faltante', v_falta - v_prod.estoque
        );
      ELSE
        v_plan_ids   := v_plan_ids   || v_prod.id;
        v_plan_falta := v_plan_falta || v_falta;
        v_plan_saldo := v_plan_saldo || v_prod.estoque;
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltas) > 0 THEN
    -- Sem débito parcial: aborta antes de qualquer escrita.
    RETURN jsonb_build_object('status', 'estoque_insuficiente', 'itens', v_faltas);
  END IF;

  v_plan_n := COALESCE(array_length(v_plan_ids, 1), 0);
  IF v_plan_n = 0 THEN
    -- Nada a debitar (tudo já reservado): idempotente — sem erro e sem baixa.
    RETURN jsonb_build_object('status', 'ja_reservado', 'itens', 0, 'montagem', v_montagem);
  END IF;

  -- 12. PASSO 2 — ESCRITA (mesma transação): aplica o plano congelado.
  --     Sem RETURNS controlados no meio: qualquer erro aqui => rollback total.
  FOR i IN 1 .. v_plan_n LOOP
    v_reserva_id := gen_random_uuid();

    UPDATE public.produtos
       SET estoque = v_plan_saldo[i] - v_plan_falta[i]
     WHERE id = v_plan_ids[i];

    INSERT INTO public.reservas_estoque (id, pedido_id, produto_id, quantidade, status)
    VALUES (v_reserva_id, p_pedido_id, v_plan_ids[i], v_plan_falta[i], 'ativa');

    INSERT INTO public.estoque_movimentacoes (
      produto_id, lote_id, tipo, quantidade,
      saldo_anterior, saldo_posterior,
      referencia_id, referencia_tipo, usuario_id, observacao
    ) VALUES (
      v_plan_ids[i],
      NULL,
      'reserva',
      -v_plan_falta[i],
      v_plan_saldo[i],
      v_plan_saldo[i] - v_plan_falta[i],
      v_reserva_id,
      'reserva_estoque',
      v_uid,
      'Reserva de estoque (Modelo 2) pedido ' || p_pedido_id::text
    )
    RETURNING id INTO v_mov_id;

    -- 13. Marcador de proveniência (0092) para ESTA reserva, na MESMA transação
    --     do débito legítimo. Só sob regime controlado. O marcador é criado junto
    --     do débito (nunca separado) e usa o id exato da movimentação; qualquer
    --     falha aborta a transação inteira (rollback total, sem baixa parcial).
    --     Não marca reservas antigas (só as criadas aqui, neste pedido).
    IF v_controlado THEN
      INSERT INTO public.reserva_proveniencia (
        reserva_id, pedido_id, produto_id, quantidade,
        origem, estoque_movimentacao_id, criado_por
      ) VALUES (
        v_reserva_id, p_pedido_id, v_plan_ids[i], v_plan_falta[i],
        '0089', v_mov_id, v_uid
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'reservado', 'itens', v_plan_n, 'montagem', v_montagem);
END;
$function$
;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(p_pedido_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_atomico(p_pedido_id uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.liberar_pedido_atomico(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_status      public.order_status;
  v_has_prov    boolean;
  v_item_prods  uuid[];                 -- produtos exigidos pelo pedido (itens reserváveis)
  v_prod_ids    uuid[];                 -- produtos de TODAS as reservas (qualquer status)
  v_locked_prod uuid[]    := '{}';
  v_n_indet     integer   := 0;
  v_n_montagem  integer   := 0;
  v_res         record;
  v_prod        record;
  v_mov_n       integer;
  v_mov_bad     integer;
  v_mov_id      uuid;
  v_debitado    bigint;
  v_cons_bad    integer;
  v_consumido   bigint;
  v_restante    bigint;
  v_lib_n       integer;
  v_lib_bad     integer;
  v_lib_qtd     bigint;
  v_marker_n    integer;
  v_marker_mov  uuid;
  v_demanda     bigint;
  v_coberto     bigint;
  v_tem_ativa   boolean;
  v_tem_liberada boolean;
  -- Plano congelado no passo 1 (aplicado no passo 2, sem re-leitura):
  v_plan_res    uuid[]    := '{}';
  v_plan_prod   uuid[]    := '{}';
  v_plan_qtd    integer[] := '{}';
  v_plan_n      integer;
  v_saldo_ant   integer;
  v_saldo_pos   integer;
  i             integer;
BEGIN
  -- L1: bloquear o pedido (serializa cancelamentos/retries do mesmo pedido).
  SELECT status
    INTO v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- GUARDA: só libera pedido CANCELADO. Nunca credita pedido ativo/entregue.
  -- (As reservas antigas de pedidos 'entregue' caem aqui.)
  IF v_status <> 'cancelado' THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  -- PROVENIÊNCIA (0092): exigida para reservas 'ativa'. Fail-closed — se a
  -- tabela NÃO existir (sem mecanismo de prova), nenhuma ativa é determinada.
  v_has_prov := (to_regclass('public.reserva_proveniencia') IS NOT NULL);

  -- Itens de MONTAGEM sem composição (combo legado): contados, não conferidos.
  SELECT COUNT(*)
    INTO v_n_montagem
  FROM public.pedido_itens i
  WHERE i.pedido_id = p_pedido_id
    AND i.produto_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pedido_item_componentes c
       WHERE c.pedido_item_id = i.id
    );

  -- Produtos exigidos pelos itens reserváveis (produto direto + componentes).
  SELECT COALESCE(array_agg(DISTINCT pid ORDER BY pid), '{}'::uuid[])
    INTO v_item_prods
  FROM (
    SELECT i.produto_id AS pid
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
    UNION
    SELECT c.produto_id AS pid
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  -- Item reservável com quantidade inválida => indeterminado (não mascarar).
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
      AND produto_id IS NOT NULL
      AND (quantidade IS NULL OR quantidade <= 0)
  ) OR EXISTS (
    SELECT 1
      FROM public.pedido_item_componentes c
      JOIN public.pedido_itens i ON i.id = c.pedido_item_id
     WHERE i.pedido_id = p_pedido_id
       AND (c.quantidade IS NULL OR c.quantidade <= 0)
  ) OR EXISTS (
    SELECT 1
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id
       AND i.produto_id IS NULL
       AND EXISTS (SELECT 1 FROM public.pedido_item_componentes c WHERE c.pedido_item_id = i.id)
       AND COALESCE((
         SELECT SUM(c.quantidade) FROM public.pedido_item_componentes c
          WHERE c.pedido_item_id = i.id
       ), 0) <> i.quantidade
  ) THEN
    v_n_indet := v_n_indet + 1;
  END IF;

  -- L2: travar TODOS os produtos referenciados por QUALQUER reserva do pedido
  -- (não só as ativas): a função passa a ler/validar todos os status.
  SELECT COALESCE(array_agg(DISTINCT produto_id ORDER BY produto_id), '{}'::uuid[])
    INTO v_prod_ids
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND produto_id IS NOT NULL;

  FOR v_prod IN
    SELECT id
    FROM public.produtos
    WHERE id = ANY(v_prod_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_locked_prod := v_locked_prod || v_prod.id;
  END LOOP;

  -- L3 + PASSO 1 (LEITURA): travar TODAS as reservas do pedido (id ASC) e
  -- classificar. Nenhuma escrita ocorre antes de confirmar que TODAS são
  -- determinadas/consistentes.
  FOR v_res IN
    SELECT id, pedido_id, produto_id, quantidade, status
    FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id
    ORDER BY id
    FOR UPDATE
  LOOP
    -- 0) Produto ausente, de produto inexistente (não travado) ou FORA dos itens
    --    do pedido => indeterminada (1.47/C.3).
    IF v_res.produto_id IS NULL
       OR NOT (v_res.produto_id = ANY(v_locked_prod))
       OR NOT (v_res.produto_id = ANY(v_item_prods)) THEN
      v_n_indet := v_n_indet + 1;
      CONTINUE;
    END IF;

    -- a) Origem (débito) EXATA: 1 movimento 'reserva' coerente, débito = reserva.
    SELECT COUNT(*),
           COALESCE(SUM(-em.quantidade), 0),
           (array_agg(em.id))[1],
           COUNT(*) FILTER (
             WHERE em.quantidade IS NULL
                OR em.quantidade >= 0
                OR em.produto_id IS NULL
                OR em.produto_id IS DISTINCT FROM v_res.produto_id
                OR em.saldo_anterior IS NULL
                OR em.saldo_posterior IS NULL
                OR em.saldo_posterior <> em.saldo_anterior + em.quantidade
           )
      INTO v_mov_n, v_debitado, v_mov_id, v_mov_bad
    FROM public.estoque_movimentacoes em
    WHERE em.referencia_tipo = 'reserva_estoque'
      AND em.referencia_id = v_res.id
      AND em.tipo = 'reserva';

    -- b) Consumo (0087) coerente: mesmo pedido/produto, quantidade > 0.
    SELECT COALESCE(SUM(rc.quantidade), 0),
           COUNT(*) FILTER (
             WHERE rc.pedido_id IS DISTINCT FROM v_res.pedido_id
                OR rc.produto_id IS DISTINCT FROM v_res.produto_id
                OR rc.quantidade IS NULL
                OR rc.quantidade <= 0
           )
      INTO v_consumido, v_cons_bad
    FROM public.reserva_consumos rc
    WHERE rc.reserva_id = v_res.id;

    v_restante := v_res.quantidade::bigint - v_consumido;

    -- c) Liberações anteriores: quantidade, produto e saldos coerentes.
    SELECT COUNT(*),
           COALESCE(SUM(l.quantidade), 0),
           COUNT(*) FILTER (
             WHERE l.quantidade IS NULL
                OR l.quantidade <= 0
                OR l.produto_id IS NULL
                OR l.produto_id IS DISTINCT FROM v_res.produto_id
                OR l.saldo_anterior IS NULL
                OR l.saldo_posterior IS NULL
                OR l.saldo_posterior <> l.saldo_anterior + l.quantidade
           )
      INTO v_lib_n, v_lib_qtd, v_lib_bad
    FROM public.estoque_movimentacoes l
    WHERE l.referencia_tipo = 'reserva_estoque'
      AND l.referencia_id = v_res.id
      AND l.tipo = 'liberacao';

    IF v_res.status = 'ativa' THEN
      -- Marcador de proveniência (0092): exatamente 1, apontando para o débito.
      IF v_has_prov THEN
        SELECT COUNT(*), (array_agg(rp.estoque_movimentacao_id))[1]
          INTO v_marker_n, v_marker_mov
        FROM public.reserva_proveniencia rp
        WHERE rp.reserva_id = v_res.id;
      ELSE
        v_marker_n   := 0;
        v_marker_mov := NULL;
      END IF;

      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_restante < 0
         OR v_lib_n <> 0
         OR NOT v_has_prov
         OR v_marker_n <> 1
         OR v_marker_mov IS DISTINCT FROM v_mov_id THEN
        -- INDETERMINADA: não credita (débito não comprovado, consumo incoerente,
        -- restante negativo, liberação anterior ou proveniência ausente/incompatível).
        v_n_indet := v_n_indet + 1;
      ELSE
        -- Determinada: entra no plano (restante pode ser 0 => vira 'consumida').
        v_plan_res  := v_plan_res  || v_res.id;
        v_plan_prod := v_plan_prod || v_res.produto_id;
        v_plan_qtd  := v_plan_qtd  || v_restante::integer;
      END IF;

    ELSIF v_res.status = 'consumida' THEN
      -- Já retirada por inteiro: origem exata + consumo = reserva + sem liberação.
      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_restante <> 0
         OR v_lib_n <> 0 THEN
        v_n_indet := v_n_indet + 1;
      END IF;

    ELSIF v_res.status = 'liberada' THEN
      -- Exige PROVA DE CRÉDITO: 1 liberação coerente igual ao restante (1.47/D).
      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_lib_n <> 1
         OR v_lib_bad <> 0
         OR v_restante <= 0
         OR v_lib_qtd <> v_restante THEN
        v_n_indet := v_n_indet + 1;
      END IF;

    ELSE
      -- 'cancelada' (ou valor inesperado): sem prova definida => bloqueia.
      v_n_indet := v_n_indet + 1;
    END IF;
  END LOOP;

  -- PASSO 1b: conferência ITEM × RESERVA por produto (1.47/C, corrigida na 1.48).
  --   coberto(p) = Σ reservas que CONTAM cobertura (ativa + consumida + liberada)
  --   do produto p. Exige coberto(p) = demanda(p) para TODO produto do pedido.
  FOR v_prod IN
    SELECT pid, COALESCE(SUM(qtd), 0) AS demanda
      FROM (
        SELECT i.produto_id AS pid, i.quantidade AS qtd
          FROM public.pedido_itens i
         WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
        UNION ALL
        SELECT c.produto_id AS pid, c.quantidade AS qtd
          FROM public.pedido_itens i
          JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
         WHERE i.pedido_id = p_pedido_id
      ) s
     GROUP BY pid
  LOOP
    SELECT COALESCE(SUM(r.quantidade), 0)
      INTO v_coberto
    FROM public.reservas_estoque r
    WHERE r.pedido_id = p_pedido_id
      AND r.produto_id = v_prod.pid
      AND r.status IN ('ativa', 'consumida', 'liberada');

    IF v_coberto <> v_prod.demanda THEN
      v_n_indet := v_n_indet + 1;   -- falta/sobra de cobertura p/ este produto
    END IF;
  END LOOP;

  -- PASSO 1c (1.48/D.6): coexistência de 'ativa' (segura estoque) com 'liberada'
  -- (já devolveu) no MESMO pedido => estado incompatível com o fluxo controlado
  -- (liberação só ocorre no cancelamento; depois dele não há re-reserva). Bloqueia
  -- mesmo que a soma de cobertura feche. NÃO afeta o retry/idempotência legítimo,
  -- onde o pedido já liberado NÃO tem nenhuma reserva 'ativa'.
  SELECT bool_or(status = 'ativa'), bool_or(status = 'liberada')
    INTO v_tem_ativa, v_tem_liberada
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id;

  IF COALESCE(v_tem_ativa, false) AND COALESCE(v_tem_liberada, false) THEN
    v_n_indet := v_n_indet + 1;
  END IF;

  -- Bloqueio de segurança: qualquer reserva/produto indeterminado => nada.
  IF v_n_indet > 0 THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'reservas', v_n_indet,
      'montagem', v_n_montagem
    );
  END IF;

  v_plan_n := COALESCE(array_length(v_plan_res, 1), 0);
  IF v_plan_n = 0 THEN
    -- Tudo comprovado e nada 'ativa' a devolver: idempotente, sem crédito.
    RETURN jsonb_build_object(
      'status', 'ja_liberado', 'reservas', 0, 'unidades', 0,
      'montagem', v_n_montagem
    );
  END IF;

  -- PASSO 2 (ESCRITA, mesma transação): aplica o plano congelado.
  FOR i IN 1 .. v_plan_n LOOP
    IF v_plan_qtd[i] > 0 THEN
      SELECT estoque INTO v_saldo_ant
      FROM public.produtos
      WHERE id = v_plan_prod[i];

      v_saldo_pos := v_saldo_ant + v_plan_qtd[i];

      UPDATE public.produtos
         SET estoque = v_saldo_pos
       WHERE id = v_plan_prod[i];

      INSERT INTO public.estoque_movimentacoes (
        produto_id, lote_id, tipo, quantidade,
        saldo_anterior, saldo_posterior,
        referencia_id, referencia_tipo, usuario_id, observacao
      ) VALUES (
        v_plan_prod[i],
        NULL,
        'liberacao',
        v_plan_qtd[i],
        v_saldo_ant,
        v_saldo_pos,
        v_plan_res[i],
        'reserva_estoque',
        v_uid,
        'Liberação de reserva por cancelamento (Modelo 2) pedido ' || p_pedido_id::text
      );

      UPDATE public.reservas_estoque
         SET status = 'liberada'
       WHERE id = v_plan_res[i];
    ELSE
      -- Restante 0: já totalmente retirado (regra 0087) — sem crédito/ledger.
      UPDATE public.reservas_estoque
         SET status = 'consumida'
       WHERE id = v_plan_res[i];
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status',   'liberado',
    'reservas', v_plan_n,
    'unidades', (SELECT COALESCE(SUM(x), 0) FROM unnest(v_plan_qtd) AS x),
    'montagem', v_n_montagem
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(p_pedido_id uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.registrar_consumo_reserva(p_reserva_id uuid, p_quantidade integer, p_idem_key uuid, p_produto_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_pedido_id      uuid;
  v_reserva_prod   uuid;   -- produto EFETIVO da reserva (lido no passo 2)
  v_pedido_status  public.order_status;
  v_eh_staff       boolean;
  v_produto_lock   uuid;   -- produto travado em L2 (lido antes do L3)
  v_produto_id     uuid;   -- produto relido SOB L3 (deve coincidir com o travado)
  v_reserva_qtd    integer;
  v_reserva_status text;
  v_prev           public.reserva_consumos;
  v_prod_n         integer;
  v_pertence       integer;
  v_mov_n          integer;
  v_mov_bad        integer;
  v_lib_ant        integer;
  v_debitado       bigint;
  v_consumido      bigint;
  v_restante       bigint;
  v_novo_total     bigint;
  v_new_id         uuid;
  v_lote record; v_fisico bigint; v_retirar integer; v_tirar integer;
BEGIN
  -- 0. Identidade (auth.uid() é a única fonte; PIN não é identidade no banco).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 1. Entradas obrigatórias.
  IF p_reserva_id IS NULL OR p_idem_key IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida');
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;

  -- 2. Leitura preliminar da reserva (sem lock) para descobrir o pedido e o
  --    produto EFETIVO (usado na idempotência — corrige o replay sem p_produto_id).
  SELECT pedido_id, produto_id
    INTO v_pedido_id, v_reserva_prod
  FROM public.reservas_estoque
  WHERE id = p_reserva_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  -- 3. L1: travar o pedido (ORDEM CANÔNICA: pedidos -> produtos -> reservas).
  SELECT status
    INTO v_pedido_status
  FROM public.pedidos
  WHERE id = v_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 4. Autorização: SOMENTE staff operacional (retirada é operação interna).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');
  IF NOT v_eh_staff THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 5. (1.37/B.1) SEM delegação. O executor é SEMPRE auth.uid(). Não há
  --    parâmetro de funcionário; nenhum caminho grava em nome de terceiros.

  -- 5b. (1.39/E) Correspondência com o produto EFETIVO da reserva. Se o cliente
  --     informar p_produto_id, ele DEVE coincidir com o produto da reserva. Vale
  --     também para replay (antes da idempotência) => uma operação divergente não
  --     é aceita como "mesma operação".
  IF p_produto_id IS NOT NULL AND p_produto_id IS DISTINCT FROM v_reserva_prod THEN
    RETURN jsonb_build_object('status', 'produto_divergente');
  END IF;

  -- 6. Idempotência (pré-checagem sob L1) — executada ANTES da guarda de pedido
  --    fechado (1.39/E): um REPLAY (mesma chave + mesma operação) é SEMPRE
  --    'ja_registrado' e um conflito de chave é SEMPRE 'chave_conflito', mesmo
  --    que o pedido já tenha evoluído para 'entregue'/'cancelado' — replay NÃO
  --    cria histórico novo (nada é escrito antes do passo 13). Isto também cobre
  --    o replay APÓS retirada completa, sem duplicar consumo.
  --    Comparação NULL-safe inclui reserva, produto EFETIVO da reserva,
  --    quantidade, funcionário (=auth.uid()) e OBSERVAÇÃO. Comparar com
  --    v_reserva_prod (e não com o parâmetro opcional) corrige o replay legítimo
  --    que OMITE p_produto_id — que antes devolvia 'chave_conflito'.
  SELECT *
    INTO v_prev
  FROM public.reserva_consumos
  WHERE idem_key = p_idem_key;
  IF FOUND THEN
    IF v_prev.reserva_id = p_reserva_id
       AND v_prev.funcionario_id = v_uid
       AND v_prev.quantidade = p_quantidade
       AND v_prev.produto_id IS NOT DISTINCT FROM v_reserva_prod
       AND v_prev.observacao IS NOT DISTINCT FROM p_observacao THEN
      RETURN jsonb_build_object('status', 'ja_registrado', 'reserva_id', p_reserva_id);
    ELSE
      RETURN jsonb_build_object('status', 'chave_conflito');
    END IF;
  END IF;

  -- 7. Guarda de pedido fechado: não cria histórico NOVO em entregue/cancelado.
  --    (Um replay já retornou acima; só chega aqui uma operação inédita.)
  IF v_pedido_status IN ('entregue', 'cancelado') THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  -- 8. Produto da reserva + L2: travar o produto (ANTES da reserva).
  SELECT produto_id
    INTO v_produto_lock
  FROM public.reservas_estoque
  WHERE id = p_reserva_id;
  IF v_produto_lock IS NULL THEN
    -- produto ausente (FK ON DELETE SET NULL): não há o que consumir.
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  SELECT COUNT(*)
    INTO v_prod_n
  FROM public.produtos
  WHERE id = v_produto_lock;
  IF v_prod_n = 0 THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  PERFORM 1
  FROM public.produtos
  WHERE id = v_produto_lock
  FOR UPDATE;

  -- 9. L3: travar a reserva e revalidar sob lock.
  SELECT produto_id, quantidade, status
    INTO v_produto_id, v_reserva_qtd, v_reserva_status
  FROM public.reservas_estoque
  WHERE id = p_reserva_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;
  -- 9a. Consistência entre leituras (1.37/B.4): se o produto da reserva mudou
  --     entre a leitura de L2 e o lock de L3, ABORTA sem escrever (a trava seria
  --     do produto errado). Não se "corrige" movendo o lock; aborta-se.
  IF v_produto_id IS NULL OR v_produto_id IS DISTINCT FROM v_produto_lock THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;
  IF v_reserva_status <> 'ativa' THEN
    RETURN jsonb_build_object('status', 'reserva_encerrada');
  END IF;
  IF p_produto_id IS NOT NULL AND p_produto_id IS DISTINCT FROM v_produto_id THEN
    RETURN jsonb_build_object('status', 'produto_divergente');
  END IF;

  -- 10. Coerência: o produto da reserva pertence ao pedido da reserva
  --     (item direto OU componente de combo modelado).
  SELECT COUNT(*)
    INTO v_pertence
  FROM public.pedido_itens i
  WHERE i.pedido_id = v_pedido_id
    AND (
      i.produto_id = v_produto_id
      OR EXISTS (
        SELECT 1 FROM public.pedido_item_componentes c
         WHERE c.pedido_item_id = i.id AND c.produto_id = v_produto_id
      )
    );
  IF v_pertence = 0 THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  -- 11. Origem comprovada no ledger (mesma regra da 0090). Bloqueia reservas
  --     antigas sem origem e impediria consumo de reserva nunca debitada.
  SELECT COUNT(*),
         COALESCE(SUM(-em.quantidade), 0),
         COUNT(*) FILTER (
           WHERE em.quantidade IS NULL
              OR em.quantidade >= 0
              OR em.produto_id IS NULL
              OR em.produto_id IS DISTINCT FROM v_produto_id
              OR em.saldo_anterior IS NULL
              OR em.saldo_posterior IS NULL
              OR em.saldo_posterior <> em.saldo_anterior + em.quantidade
         )
    INTO v_mov_n, v_debitado, v_mov_bad
  FROM public.estoque_movimentacoes em
  WHERE em.referencia_tipo = 'reserva_estoque'
    AND em.referencia_id = p_reserva_id
    AND em.tipo = 'reserva';

  SELECT COUNT(*)
    INTO v_lib_ant
  FROM public.estoque_movimentacoes
  WHERE referencia_tipo = 'reserva_estoque'
    AND referencia_id = p_reserva_id
    AND tipo = 'liberacao';

  IF v_mov_n <> 1
     OR v_mov_bad <> 0
     OR v_debitado <> v_reserva_qtd::bigint
     OR v_lib_ant <> 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'reserva_id', p_reserva_id);
  END IF;

  -- 12. Restante físico ainda no freezer (calculado sob L3).
  SELECT COALESCE(SUM(quantidade), 0)
    INTO v_consumido
  FROM public.reserva_consumos
  WHERE reserva_id = p_reserva_id;

  v_restante := v_reserva_qtd::bigint - v_consumido;
  IF v_restante <= 0 THEN
    RETURN jsonb_build_object('status', 'reserva_encerrada');
  END IF;
  IF p_quantidade::bigint > v_restante THEN
    RETURN jsonb_build_object('status', 'acima_do_restante', 'restante', v_restante);
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.reserva_proveniencia_config WHERE id AND controlado) THEN
    RETURN jsonb_build_object('status','reconciliacao_pendente','motivo','regime_controlado_inativo');
  END IF;
  -- Lotes sao travados depois de pedido/produto/reserva. Nenhum debito logico adicional.
  PERFORM id FROM public.lotes WHERE produto_id=v_produto_id AND status='ativo'
    AND restante>0 AND (validade IS NULL OR validade >= CURRENT_DATE) ORDER BY validade NULLS LAST,created_at,id FOR UPDATE;
  SELECT coalesce(sum(restante),0) INTO v_fisico FROM public.lotes WHERE produto_id=v_produto_id
    AND status='ativo' AND restante>0 AND (validade IS NULL OR validade>=CURRENT_DATE);
  IF v_fisico<p_quantidade THEN RETURN jsonb_build_object('status','lotes_insuficientes'); END IF;
  -- 13. Registro append-only (NÃO debita produtos.estoque de novo).
  --     funcionario_id = auth.uid() (sem delegação).
  INSERT INTO public.reserva_consumos (
    reserva_id, pedido_id, produto_id, quantidade, funcionario_id, idem_key, observacao
  ) VALUES (
    p_reserva_id, v_pedido_id, v_produto_id, p_quantidade, v_uid, p_idem_key, p_observacao
  )
  ON CONFLICT (idem_key) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    -- Corrida: a mesma chave apareceu concorrentemente. Reavaliar replay/conflito
    -- com a MESMA comparação NULL-safe (produto EFETIVO + observação).
    SELECT *
      INTO v_prev
    FROM public.reserva_consumos
    WHERE idem_key = p_idem_key;
    IF v_prev.reserva_id = p_reserva_id
       AND v_prev.funcionario_id = v_uid
       AND v_prev.quantidade = p_quantidade
       AND v_prev.produto_id IS NOT DISTINCT FROM v_reserva_prod
       AND v_prev.observacao IS NOT DISTINCT FROM p_observacao THEN
      RETURN jsonb_build_object('status', 'ja_registrado', 'reserva_id', p_reserva_id);
    ELSE
      RETURN jsonb_build_object('status', 'chave_conflito');
    END IF;
  END IF;

  v_retirar:=p_quantidade;
  FOR v_lote IN SELECT id,restante FROM public.lotes WHERE produto_id=v_produto_id
   AND status='ativo' AND restante>0 AND (validade IS NULL OR validade>=CURRENT_DATE)
   ORDER BY validade NULLS LAST,created_at,id FOR UPDATE LOOP
    EXIT WHEN v_retirar=0;
    v_tirar:=least(v_retirar,v_lote.restante);
    UPDATE public.lotes SET restante=restante-v_tirar WHERE id=v_lote.id;
    PERFORM public.registrar_mov_estoque(v_produto_id,'venda'::public.tipo_mov_estoque,
     -v_tirar,v_lote.id,v_new_id,'reserva_consumo'::text,v_uid,coalesce(p_observacao,''),false);
    v_retirar:=v_retirar-v_tirar;
  END LOOP;
  -- 14. Restante zero => reserva 'consumida' (o saldo já foi debitado na reserva).
  v_novo_total := v_consumido + p_quantidade;
  IF v_novo_total >= v_reserva_qtd::bigint THEN
    UPDATE public.reservas_estoque
       SET status = 'consumida'
     WHERE id = p_reserva_id;
  END IF;

  RETURN jsonb_build_object(
    'status',           'consumido',
    'reserva_id',       p_reserva_id,
    'quantidade',       p_quantidade,
    'consumido_total',  v_novo_total,
    'restante',         GREATEST(v_reserva_qtd::bigint - v_novo_total, 0)
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(p_reserva_id uuid, p_quantidade integer, p_idem_key uuid, p_produto_id uuid, p_observacao text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_reserva(p_reserva_id uuid, p_quantidade integer, p_idem_key uuid, p_produto_id uuid, p_observacao text) TO authenticated;
CREATE OR REPLACE FUNCTION public.exigir_reserva_producao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_controlado boolean := false;
  v_cob        jsonb;
BEGIN
  -- So age quando o pedido SAI de 'recebido' para algo operacional.
  IF OLD.status <> 'recebido' OR NEW.status IN ('recebido', 'cancelado') THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT c.controlado INTO v_controlado
      FROM public.reserva_proveniencia_config c
     WHERE c.id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;
  IF NOT v_controlado THEN
    RETURN NEW;
  END IF;

  v_cob := public.pedido_cobertura_reserva(NEW.id);
  -- SOMENTE cobertura integral libera a producao. 'montagem' NAO e cobertura:
  -- itens de montagem nao possuem reserva/composicao comprovada no banco.
  IF COALESCE(v_cob->>'status', '') = 'coberto' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Pedido % sem cobertura de reserva para producao (status=%, motivo=%)',
    NEW.id,
    COALESCE(v_cob->>'status', 'desconhecido'),
    COALESCE(v_cob->>'motivo', '')
    USING ERRCODE = 'P0001';
END;
$function$
;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.exigir_consumo_producao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_controlado boolean := false;
BEGIN
  IF OLD.status <> 'recebido' OR NEW.status IN ('recebido', 'cancelado') THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT c.controlado INTO v_controlado
      FROM public.reserva_proveniencia_config c
     WHERE c.id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;
  IF NOT v_controlado THEN
    RETURN NEW;
  END IF;
  IF to_regclass('public.reserva_consumos') IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.reservas_estoque r
     WHERE r.pedido_id = NEW.id
       AND r.status IN ('ativa','consumida')
       AND coalesce((SELECT sum(rc.quantidade) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id),0) <> r.quantidade
  ) THEN
    RAISE EXCEPTION
      'Pedido % possui reserva sem retirada fisica registrada', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.proteger_consistencia_financeira_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mudou_status    boolean := (NEW.status           IS DISTINCT FROM OLD.status);
  v_mudou_pagamento boolean := (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status);
  v_confirmou       boolean := (NEW.pagamento_status = 'pago'
                                AND OLD.pagamento_status IS DISTINCT FROM 'pago');
BEGIN
  -- Nada financeiramente relevante mudou → não interferir (protege updates que
  -- apenas repetem os mesmos valores ou mexem em outras colunas).
  IF NOT v_mudou_status AND NOT v_mudou_pagamento THEN
    RETURN NEW;
  END IF;

  -- (I) Estado final inconsistente: cancelado + pago ao mesmo tempo.
  IF NEW.status = 'cancelado' AND NEW.pagamento_status = 'pago' THEN
    RAISE EXCEPTION
      'inconsistencia_financeira: pedido % ficaria cancelado e pago; use o fluxo de cancelamento (0093) ou registre reembolso antes de cancelar.',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  -- (II) Confirmação de pagamento sobre pedido que estava cancelado.
  IF v_confirmou AND OLD.status = 'cancelado' THEN
    RAISE EXCEPTION
      'inconsistencia_financeira: pedido % estava cancelado; pagamento recebido deve ir para conciliacao financeira (nao confirmar no pedido).',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  -- (III) Reabertura DIRETA de pedido cancelado (1.45/C). A matriz 0041 não
  --       prevê NENHUMA transição a partir de 'cancelado', e NÃO existe fluxo
  --       transacional autorizado que reabra tratando estoque/histórico. O
  --       admin hoje contorna a matriz via `validar_transicao_status`
  --       (eh_admin => RETURN NEW); aqui barramos a reabertura direta p/ todos.
  IF OLD.status = 'cancelado' AND NEW.status IS DISTINCT FROM 'cancelado' THEN
    RAISE EXCEPTION
      'reabertura_nao_permitida: pedido % cancelado nao pode ser reaberto por UPDATE direto; exige fluxo autorizado (inexistente hoje).',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  -- (IV) Ocultação de pagamento JÁ confirmado (1.46 — fecha o gap G1). Impede
  --      rebaixar `pago` para `pendente`/`falhou`: com o pagamento rebaixado, o
  --      pedido poderia ser cancelado depois (0093 ou UPDATE direto) sem deixar
  --      rastro de que houve recebimento. `pago`→`reembolsado` é a ÚNICA saída
  --      sancionada (dinheiro efetivamente devolvido) e NÃO cai aqui. Sem
  --      exceção para admin, financeiro nem service_role. Observe OLD×NEW da
  --      MESMA instrução: cobre também `SET status='cancelado',
  --      pagamento_status='pendente'` numa única linha.
  IF OLD.pagamento_status = 'pago'
     AND NEW.pagamento_status IN ('pendente', 'falhou') THEN
    RAISE EXCEPTION
      'pagamento_confirmado_nao_rebaixavel: pedido % tinha pagamento confirmado e nao pode voltar para ''%''; registre reembolso (reembolsado) ou use fluxo de correcao auditado (inexistente hoje).',
      NEW.id, NEW.pagamento_status USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cancelar_pedido_atomico(p_pedido_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_dono        uuid;   -- pedidos.user_id
  v_status      public.order_status;
  v_pag         text;   -- pedidos.pagamento_status
  v_eh_staff    boolean;
  v_n_itens     integer;
  v_reserv_total integer;
  v_reserv_retem integer;
  v_reservaveis integer;
  v_lib         jsonb;
  v_lib_status  text;
  v_de          text;
BEGIN
  -- 0. Entrada mínima.
  IF p_pedido_id IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida');
  END IF;

  -- 1. Identidade (auth.uid() é a única fonte; nunca parâmetro).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 2. L1: travar o pedido (serializa cancelamentos/retries do MESMO pedido).
  SELECT user_id, status, pagamento_status
    INTO v_dono, v_status, v_pag
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 3. Autorização: dono OU staff operacional (admin/producao/atendente).
  --    Avaliada ANTES de classificar status (não vaza estado a terceiros).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF NOT v_eh_staff AND (v_dono IS NULL OR v_dono IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 4. Elegibilidade de status (SEM escrita; nada foi alterado ainda).
  IF v_status = 'entregue' THEN
    RETURN jsonb_build_object('status', 'status_invalido', 'atual', v_status);
  END IF;
  IF v_status = 'cancelado' THEN
    -- Idempotência: não reexecuta a liberação nem grava histórico novo.
    -- (Reservas legadas/antigas NÃO são creditadas por aqui — reconciliação é
    --  etapa própria; ver "NÃO FAZER".)
    RETURN jsonb_build_object('status', 'ja_cancelado');
  END IF;
  IF v_status <> 'recebido' THEN
    -- 'em_producao'/'pronto'/'aguardando_motoboy'/'em_rota': decisão humana.
    RETURN jsonb_build_object('status', 'requer_analise', 'atual', v_status);
  END IF;

  -- 5. Pagamento: 1ª versão aceita SOMENTE 'pendente'.
  --    'pago' (confirmado/capturado), 'falhou' e 'reembolsado' (situação não
  --    verificável de forma segura) => bloqueio. Cancelamento NÃO é estorno.
  IF v_pag IS DISTINCT FROM 'pendente' THEN
    RETURN jsonb_build_object('status', 'pagamento_nao_elegivel', 'pagamento_status', v_pag);
  END IF;

  -- 6. Integridade de itens/reserva (SEM escrita).
  SELECT COUNT(*) INTO v_n_itens
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  --    Itens RESERVÁVEIS (produto direto ou componente de combo) exigem ao
  --    menos uma reserva no pedido. Sem reserva => composição não comprovada =>
  --    bloqueio. Itens de MONTAGEM sem composição (produto_id NULL) não exigem.
  SELECT COUNT(*) INTO v_reservaveis
  FROM (
    SELECT i.id
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
    UNION
    SELECT i.id
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  SELECT COUNT(*) INTO v_reserv_total
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id;

  IF v_reservaveis > 0 AND v_reserv_total = 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'motivo', 'sem_reserva');
  END IF;

  --     (1.47/1.48) Além de EXISTIR reserva, ela precisa RETER estoque
  --     (ativa/consumida). Um pedido AINDA ATIVO cujas reservas estão todas
  --     'liberada'/'cancelada' representa "liberação anterior segurando estoque"
  --     (D.6) => incompatível => reconciliacao_pendente, ANTES de qualquer escrita.
  --     Esta é a ÚNICA guarda que distingue o caso ATIVO do caso JÁ CANCELADO: a
  --     0090 (na 1.48) ACEITA reservas 'liberada' comprovadas como cobertura, o
  --     que é correto no pedido cancelado (idempotência) mas NÃO no pedido ativo.
  --     Devolver o motivo classificado aqui evita a escrita seguida de rollback.
  SELECT COUNT(*) INTO v_reserv_retem
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND status IN ('ativa', 'consumida');
  IF v_reservaveis > 0 AND v_reserv_retem = 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'motivo', 'sem_reserva_ativa');
  END IF;

  -- 7. ESCRITA (mesma transação): cancela o pedido. Guardas 0041/0070/0084
  --    avaliam a identidade do CHAMADOR (auth.uid()) e só veem 'status' mudar.
  --    Condição de status reforçada => se algo mudou sob o lock, 0 linhas.
  v_de := v_status::text;
  UPDATE public.pedidos
     SET status = 'cancelado'
   WHERE id = p_pedido_id
     AND status = 'recebido';
  IF NOT FOUND THEN
    -- Corrida impossível sob L1, mas nunca seguir com escrita parcial: aborta.
    RAISE EXCEPTION
      'cancelar_pedido_atomico: status do pedido % mudou durante o cancelamento', p_pedido_id;
  END IF;

  -- 8. Liberação SEGURA do restante das reservas (0090), na MESMA transação.
  --    Agora o pedido está 'cancelado' (visto dentro da própria transação).
  v_lib := public.liberar_pedido_atomico(p_pedido_id);

  -- 9. VALIDAÇÃO ESTRITA do retorno da 0090 (Etapa 1.41/B). Só aceita sucesso
  --    COMPROVADO; qualquer outra coisa é EXCEPTION => rollback do passo 7
  --    (um RETURN da 0090 NÃO reverte escritas da MESMA transação).
  --    9a. Retorno SQL NULL ou JSON null/qualquer não-objeto => rejeita.
  IF v_lib IS NULL OR jsonb_typeof(v_lib) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: retorno invalido da liberacao (pedido %) — rollback',
      p_pedido_id;
  END IF;

  --    9b. Campo 'status' ausente OU não textual => rejeita (impede tratar
  --        null, número, booleano, array/objeto como se fosse status válido).
  IF NOT (v_lib ? 'status')
     OR jsonb_typeof(v_lib -> 'status') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: retorno sem status textual da liberacao (pedido %) — rollback',
      p_pedido_id;
  END IF;

  v_lib_status := v_lib ->> 'status';

  --    9c. Só 'liberado'/'ja_liberado' são sucesso. Rejeita explicitamente
  --        'reconciliacao_pendente', 'status_invalido', 'pedido_invalido' e
  --        QUALQUER valor inesperado (inclusive o literal 'NULL' e SQL NULL).
  IF v_lib_status IS NULL OR v_lib_status NOT IN ('liberado', 'ja_liberado') THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: liberacao nao concluida (%, pedido %) — rollback',
      COALESCE(v_lib_status, 'null'), p_pedido_id;
  END IF;

  --    9d. 'ja_liberado' = NENHUMA reserva ATIVA. Isso também acontece quando o
  --        pedido NUNCA teve reserva => NÃO pode ser lido como "liberação
  --        concluída". Exige comprovação: se há itens reserváveis, precisa
  --        existir ao menos uma reserva para o pedido (v_reserv_total > 0 —
  --        garantido pela pré-checagem, reforçado aqui em defesa em profundidade).
  --        Pedido só de montagem (sem item reservável) pode ser 'ja_liberado'
  --        legitimamente: não há o que liberar.
  IF v_lib_status = 'ja_liberado'
     AND v_reservaveis > 0
     AND v_reserv_total = 0 THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: ja_liberado sem reserva comprovada (pedido %) — rollback',
      p_pedido_id;
  END IF;

  -- 10. Histórico (estrutura real 0023). actor = auth.uid().
  INSERT INTO public.pedido_status_historico (pedido_id, de_status, para_status, actor, motivo)
  VALUES (
    p_pedido_id,
    v_de,
    'cancelado',
    v_uid,
    COALESCE(NULLIF(btrim(p_motivo), ''), 'cancelamento transacional (Modelo 2)')
  );

  -- 11. Sucesso: só aqui a transação é considerada concluída.
  RETURN jsonb_build_object(
    'status',    'cancelado',
    'pedido_id', p_pedido_id,
    'liberacao', v_lib
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(p_pedido_id uuid, p_motivo text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atomico(p_pedido_id uuid, p_motivo text) TO authenticated;
CREATE OR REPLACE FUNCTION public.criar_pedido_com_reserva(p_id uuid, p_canal text, p_dados jsonb, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_dados          jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_itens          jsonb := COALESCE(p_itens, '[]'::jsonb);
  v_canal          text;
  v_elem           jsonb;
  v_ped            record;
  v_prod           record;
  v_cupom          record;
  v_lock_id        uuid;
  v_pid            uuid;
  v_qtd            integer;
  v_linhas         integer := 0;
  v_preco          numeric(10,2);
  v_subtotal       numeric(10,2) := 0;
  v_desc           numeric(10,2) := 0;
  v_taxa           numeric(10,2) := 0;
  v_total          numeric(10,2) := 0;
  v_numero         integer;
  v_n              bigint;
  v_cliente        text;
  v_telefone       text;
  v_endereco       text;
  v_bairro         text;
  v_cidade         text;
  v_cep            text;
  v_complemento    text;
  v_referencia     text;
  v_obs            text;
  v_tipo_imovel    text;
  v_apartamento    text;
  v_bloco          text;
  v_torre          text;
  v_andar          text;
  v_interfone      text;
  v_pode_subir     boolean := false;
  v_cpf            text;
  v_nome_fiscal    text;
  v_origem_cliente text;
  v_tipo_entrega   text;
  v_forma          text;
  v_modalidade     text;
  v_pag_status     text := 'pendente';
  v_pag_em         timestamptz := NULL;
  v_agendado       timestamptz := NULL;
  v_ag_obs         text := '';
  v_tipo_evento    text := '';
  v_campanha       text := '';
  v_lat            double precision := NULL;
  v_lng            double precision := NULL;
  v_cupom_cod      text;
  v_desc_manual    numeric(10,2) := 0;
  v_loja_end       text;
  v_loja_bai       text;
  v_loja_cid       text;
  v_taxa_txt       text;
  v_nome_item      text;
  v_obs_item       text;
  v_comp           jsonb;
  v_comp_pid       uuid;
  v_comp_qtd       integer;
  v_comp_soma      integer;
  v_comp_n         integer;
  v_comp_cat       uuid;
  v_comp_ids       uuid[];
  v_cat            record;
  v_item_id        uuid;
  v_res            jsonb;
  v_detail         text;
  v_req_fp         text[];
  v_db_fp          text[];
  v_motivo_hist    text;
  v_cob            jsonb;
  -- 0103: entrega por km
  v_dist_km        numeric(8,2);
  v_linha_km       numeric(8,2);
  v_vpk            numeric(6,2);
  v_fonte          text;
  v_entrega_gratis boolean := false;
  v_uf             text;
  v_place_id       text;
  v_ajuste         jsonb;
  v_aj_taxa        numeric(10,2);
  v_aj_motivo      text;
  v_snapshot       jsonb;
  v_cfg_ent        public.config_entrega%ROWTYPE;
BEGIN
  --------------------------------------------------------------------------
  -- 1.1 Autenticacao, canal e autorizacao (sempre no banco)
  --------------------------------------------------------------------------
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida', 'motivo', 'p_id');
  END IF;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada', 'motivo', 'sem_sessao');
  END IF;

  v_canal := lower(btrim(COALESCE(p_canal, '')));
  IF v_canal NOT IN ('checkout', 'pdv', 'atendente') THEN
    RETURN jsonb_build_object('status', 'canal_invalido');
  END IF;

  -- O parametro de canal NUNCA concede privilegio: ele apenas EXIGE papel.
  -- Um cliente comum so pode usar 'checkout'. Staff pode usar qualquer canal.
  IF v_canal IN ('pdv', 'atendente')
     AND NOT (public.has_role(v_uid, 'admin'::public.app_role)
              OR public.has_role(v_uid, 'atendente'::public.app_role)) THEN
    RETURN jsonb_build_object('status', 'permissao_negada', 'motivo', 'canal_staff');
  END IF;

  IF jsonb_typeof(v_dados) <> 'object' THEN
    RETURN jsonb_build_object('status', 'entrada_invalida', 'motivo', 'p_dados');
  END IF;
  IF jsonb_typeof(v_itens) <> 'array' THEN
    RETURN jsonb_build_object('status', 'entrada_invalida', 'motivo', 'p_itens');
  END IF;
  IF jsonb_array_length(v_itens) = 0 THEN
    RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'vazio');
  END IF;

  --------------------------------------------------------------------------
  -- 1.2 Serializacao por id (mesma chave) e verificacao de idempotencia
  --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('criar_pedido_com_reserva:' || p_id::text));

  SELECT * INTO v_ped FROM public.pedidos WHERE id = p_id;
  IF FOUND THEN
    -- Autorizacao: somente o dono (cliente ou operador que criou) pode repetir.
    IF v_ped.user_id IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object('status', 'pedido_de_outro_usuario');
    END IF;

    -- Canal original registrado no historico de criacao.
    SELECT motivo INTO v_motivo_hist
      FROM public.pedido_status_historico
     WHERE pedido_id = p_id AND de_status IS NULL AND para_status = 'recebido'
     ORDER BY created_at ASC, id ASC
     LIMIT 1;
    IF v_motivo_hist IS DISTINCT FROM ('criacao_atomica:' || v_canal) THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'canal');
    END IF;

    -- Correspondencia dos itens (produto + quantidade; combo pela composicao
    -- estruturada, com fallback para montagem textual legada).
    SELECT array_agg(x ORDER BY x) INTO v_req_fp
      FROM (
        SELECT CASE
                 WHEN NULLIF(btrim(e.valor->>'produto_id'), '') IS NULL
                   THEN CASE
                          WHEN jsonb_typeof(e.valor->'componentes') = 'array'
                           AND jsonb_array_length(e.valor->'componentes') > 0
                            THEN 'C:' || COALESCE((
                              SELECT string_agg(
                                       lower(btrim(c.valor->>'produto_id')) || ':' ||
                                       COALESCE(NULLIF(regexp_replace(c.valor->>'quantidade', '[^0-9]', '', 'g'), ''), '0'),
                                       ',' ORDER BY lower(btrim(c.valor->>'produto_id'))
                                     )
                                FROM jsonb_array_elements(e.valor->'componentes') AS c(valor)
                            ), '') || ':' ||
                            (CASE WHEN (e.valor->>'quantidade') ~ '^[0-9]{1,9}$'
                                  THEN (e.valor->>'quantidade')::int ELSE 0 END)::text
                          ELSE 'M:' || COALESCE(btrim(e.valor->>'nome'), '') || ':' ||
                               (CASE WHEN (e.valor->>'quantidade') ~ '^[0-9]{1,9}$'
                                     THEN (e.valor->>'quantidade')::int ELSE 0 END)::text
                        END
                 ELSE 'P:' || lower(btrim(e.valor->>'produto_id')) || ':' ||
                        (CASE WHEN (e.valor->>'quantidade') ~ '^[0-9]{1,9}$'
                              THEN (e.valor->>'quantidade')::int ELSE 0 END)::text
               END AS x
          FROM jsonb_array_elements(v_itens) AS e(valor)
      ) s;

    SELECT array_agg(x ORDER BY x) INTO v_db_fp
      FROM (
        SELECT CASE
                 WHEN i.produto_id IS NULL
                   THEN CASE
                          WHEN EXISTS (
                            SELECT 1 FROM public.pedido_item_componentes c
                             WHERE c.pedido_item_id = i.id
                          )
                            THEN 'C:' || COALESCE((
                              SELECT string_agg(
                                       lower(c.produto_id::text) || ':' || c.quantidade::text,
                                       ',' ORDER BY lower(c.produto_id::text)
                                     )
                                FROM public.pedido_item_componentes c
                               WHERE c.pedido_item_id = i.id
                            ), '') || ':' || i.quantidade::text
                          ELSE 'M:' || i.nome || ':' || i.quantidade::text
                        END
                 ELSE 'P:' || lower(i.produto_id::text) || ':' || i.quantidade::text
               END AS x
          FROM public.pedido_itens i
         WHERE i.pedido_id = p_id
      ) s;

    IF v_req_fp IS DISTINCT FROM v_db_fp THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'itens');
    END IF;

    -- Correspondencia dos dados principais da solicitacao original.
    IF v_ped.cliente_nome IS DISTINCT FROM btrim(v_dados->>'cliente_nome')
       OR v_ped.telefone IS DISTINCT FROM btrim(v_dados->>'telefone')
       OR v_ped.tipo_entrega IS DISTINCT FROM lower(btrim(COALESCE(v_dados->>'tipo_entrega', '')))
       OR v_ped.forma_pagamento::text IS DISTINCT FROM lower(btrim(COALESCE(v_dados->>'forma_pagamento', '')))
       OR v_ped.cupom IS DISTINCT FROM NULLIF(upper(btrim(COALESCE(v_dados->>'cupom', ''))), '')
       OR v_ped.agendado_para IS DISTINCT FROM
            (CASE WHEN jsonb_typeof(v_dados->'agendado_para') = 'string'
                   AND btrim(COALESCE(v_dados->>'agendado_para', '')) <> ''
                  THEN (v_dados->>'agendado_para')::timestamptz
                  ELSE NULL END)
    THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'dados');
    END IF;

    -- Reservas obrigatorias: leitura pura (nao reserva nem baixa de novo).
    v_cob := public.pedido_cobertura_reserva(p_id);
    IF COALESCE(v_cob->>'status', '') = 'coberto' THEN
      SELECT COALESCE(SUM(i.preco_unitario * i.quantidade), 0), count(*)
        INTO v_subtotal, v_n
        FROM public.pedido_itens i
       WHERE i.pedido_id = p_id;
      IF v_n = 0
         OR abs(v_subtotal - v_ped.subtotal) > 0.005
         OR v_ped.desconto < 0
         OR v_ped.desconto > v_ped.subtotal
         OR abs(v_ped.total - GREATEST(v_ped.subtotal + v_ped.taxa_entrega - v_ped.desconto, 0)) > 0.005
      THEN
        RETURN jsonb_build_object('status', 'inconsistencia_financeira');
      END IF;
      RETURN jsonb_build_object(
        'status', 'ja_criado',
        'pedido_id', p_id,
        'numero', v_ped.numero,
        'total', v_ped.total,
        'cobertura', v_cob
      );
    END IF;
    IF COALESCE(v_cob->>'status', '') = 'sem_reserva' THEN
      RETURN jsonb_build_object(
        'status', 'reservas_ausentes',
        'pedido_id', p_id,
        'numero', v_ped.numero,
        'cobertura', v_cob
      );
    END IF;
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'pedido_id', p_id,
      'numero', v_ped.numero,
      'cobertura', v_cob
    );
  END IF;

  --------------------------------------------------------------------------
  -- 1.3 Dependencia da reserva atomica (checada ANTES de qualquer escrita)
  --------------------------------------------------------------------------
  IF to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'dependencia_ausente',
      'dependencia', 'public.reservar_pedido_atomico(uuid)'
    );
  END IF;

  --------------------------------------------------------------------------
  -- 1.4 Validacao dos dados nao financeiros
  --------------------------------------------------------------------------
  v_cliente := btrim(COALESCE(v_dados->>'cliente_nome', ''));
  IF length(v_cliente) NOT BETWEEN 2 AND 120 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cliente_nome');
  END IF;

  v_telefone := btrim(COALESCE(v_dados->>'telefone', ''));
  IF length(regexp_replace(v_telefone, '\D', '', 'g')) NOT BETWEEN 10 AND 13 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'telefone');
  END IF;

  v_tipo_entrega := lower(btrim(COALESCE(v_dados->>'tipo_entrega', '')));
  IF v_tipo_entrega NOT IN ('entrega', 'retirada') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'tipo_entrega');
  END IF;

  v_forma := lower(btrim(COALESCE(v_dados->>'forma_pagamento', '')));
  IF v_forma NOT IN ('pix', 'dinheiro', 'credito', 'debito') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'forma_pagamento');
  END IF;

  v_cep := regexp_replace(COALESCE(v_dados->>'cep', ''), '\D', '', 'g');
  IF v_cep = '' THEN
    v_cep := NULL;
  ELSIF length(v_cep) <> 8 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cep');
  END IF;

  v_cpf := regexp_replace(COALESCE(v_dados->>'cpf_cnpj', ''), '\D', '', 'g');
  IF v_cpf = '' THEN
    v_cpf := NULL;
  ELSIF length(v_cpf) NOT IN (11, 14) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cpf_cnpj');
  END IF;

  v_complemento := btrim(COALESCE(v_dados->>'complemento', ''));
  v_referencia  := btrim(COALESCE(v_dados->>'referencia', ''));
  v_obs         := btrim(COALESCE(v_dados->>'observacoes', ''));
  IF length(v_complemento) > 200 OR length(v_referencia) > 200 OR length(v_obs) > 1000 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'texto_longo');
  END IF;

  v_tipo_imovel := NULLIF(lower(btrim(COALESCE(v_dados->>'tipo_imovel', ''))), '');
  IF v_tipo_imovel IS NOT NULL AND v_tipo_imovel NOT IN ('casa', 'apartamento') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'tipo_imovel');
  END IF;

  v_apartamento := NULLIF(btrim(COALESCE(v_dados->>'apartamento', '')), '');
  v_bloco       := NULLIF(btrim(COALESCE(v_dados->>'bloco', '')), '');
  v_torre       := NULLIF(btrim(COALESCE(v_dados->>'torre', '')), '');
  v_andar       := NULLIF(btrim(COALESCE(v_dados->>'andar', '')), '');
  v_interfone   := NULLIF(btrim(COALESCE(v_dados->>'interfone', '')), '');
  IF COALESCE(length(v_apartamento), 0) > 50
     OR COALESCE(length(v_bloco), 0) > 50
     OR COALESCE(length(v_torre), 0) > 50
     OR COALESCE(length(v_andar), 0) > 50
     OR COALESCE(length(v_interfone), 0) > 50 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'endereco_estruturado');
  END IF;

  IF jsonb_typeof(v_dados->'pode_subir') = 'boolean' THEN
    v_pode_subir := (v_dados->>'pode_subir')::boolean;
  END IF;

  v_nome_fiscal    := NULLIF(btrim(COALESCE(v_dados->>'nome_fiscal', '')), '');
  v_origem_cliente := NULLIF(btrim(COALESCE(v_dados->>'origem_cliente', '')), '');
  IF COALESCE(length(v_nome_fiscal), 0) > 120 OR COALESCE(length(v_origem_cliente), 0) > 120 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'texto_longo');
  END IF;

  v_tipo_evento := btrim(COALESCE(v_dados->>'tipo_evento', ''));
  v_campanha    := btrim(COALESCE(v_dados->>'campanha_origem', ''));
  IF length(v_tipo_evento) > 80 OR length(v_campanha) > 80 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'texto_longo');
  END IF;

  v_ag_obs := btrim(COALESCE(v_dados->>'agendamento_obs', ''));
  IF length(v_ag_obs) > 200 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'agendamento_obs');
  END IF;

  IF jsonb_typeof(v_dados->'agendado_para') = 'string'
     AND btrim(COALESCE(v_dados->>'agendado_para', '')) <> '' THEN
    BEGIN
      v_agendado := (v_dados->>'agendado_para')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'agendado_para');
    END;
    IF v_agendado <= now() THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'agendado_para');
    END IF;
  END IF;

  IF jsonb_typeof(v_dados->'destino_lat') = 'number' THEN
    v_lat := (v_dados->>'destino_lat')::double precision;
    IF v_lat NOT BETWEEN -90 AND 90 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'destino_lat');
    END IF;
  END IF;
  IF jsonb_typeof(v_dados->'destino_lng') = 'number' THEN
    v_lng := (v_dados->>'destino_lng')::double precision;
    IF v_lng NOT BETWEEN -180 AND 180 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'destino_lng');
    END IF;
  END IF;

  -- 0103: estado e place_id do endereco (precisao do geocoding)
  v_uf := NULLIF(btrim(COALESCE(v_dados->>'endereco_estado', '')), '');
  IF COALESCE(length(v_uf), 0) > 40 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'endereco_estado');
  END IF;
  v_place_id := NULLIF(btrim(COALESCE(v_dados->>'endereco_place_id', '')), '');
  IF COALESCE(length(v_place_id), 0) > 200 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'endereco_place_id');
  END IF;

  --------------------------------------------------------------------------
  -- 1.5 Endereco e taxa de entrega (fonte confiavel: o SERVIDOR calcula)
  --------------------------------------------------------------------------
  -- Regime 0103: quando existe config_entrega com origem georreferenciada,
  -- a taxa e DISTANCIA x VALOR_POR_KM (com regras de minima/fora da area),
  -- calculada AQUI. A distancia de rota enviada pelo cliente e aceita apenas
  -- se for coerente com a linha reta origem->destino (0.9x..3x); caso
  -- contrario o servidor usa a linha reta (nunca a taxa anterior, nunca a
  -- taxa do navegador). Sem origem configurada: comportamento legado
  -- (loja_config.taxa_entrega ou R$ 6). RETIRADA usa taxa 0.
  SELECT NULLIF(btrim(lc.endereco), ''),
         NULLIF(btrim(lc.bairro), ''),
         NULLIF(btrim(lc.cidade), ''),
         (to_jsonb(lc)->>'taxa_entrega')
    INTO v_loja_end, v_loja_bai, v_loja_cid, v_taxa_txt
    FROM public.loja_config lc
   WHERE lc.id = true;

  IF v_tipo_entrega = 'entrega' THEN
    v_endereco := btrim(COALESCE(v_dados->>'endereco', ''));
    v_bairro   := btrim(COALESCE(v_dados->>'bairro', ''));
    v_cidade   := btrim(COALESCE(v_dados->>'cidade', ''));
    IF length(v_endereco) NOT BETWEEN 5 AND 300 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'endereco');
    END IF;
    IF length(v_bairro) NOT BETWEEN 2 AND 100 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'bairro');
    END IF;
    IF length(v_cidade) NOT BETWEEN 2 AND 100 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cidade');
    END IF;
    -- Mesma regra do trigger 0045/0047. Validar aqui evita que o trigger
    -- transforme um erro de preenchimento em 'erro_interno' (P0001) e
    -- devolve o campo culpado sem escrever pedido/reserva.
    IF v_tipo_imovel = 'apartamento' AND v_apartamento IS NULL THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'apartamento');
    END IF;

    SELECT * INTO v_cfg_ent FROM public.config_entrega WHERE id = true;

    IF v_cfg_ent.id IS NOT NULL AND NOT v_cfg_ent.aceitar_entregas THEN
      RETURN jsonb_build_object('status', 'entregas_desativadas');
    END IF;

    -- Distancia de rota enviada pelo cliente (opcional; validada abaixo).
    v_dist_km := NULL;
    IF jsonb_typeof(v_dados->'distancia_km') = 'number' THEN
      BEGIN
        v_dist_km := round((v_dados->>'distancia_km')::numeric, 2);
      EXCEPTION WHEN OTHERS THEN
        v_dist_km := NULL;
      END;
      IF v_dist_km <= 0 OR v_dist_km > 500 THEN
        v_dist_km := NULL;
      END IF;
    END IF;

    -- Linha reta origem->destino (so quando a origem esta configurada).
    v_linha_km := NULL;
    IF v_cfg_ent.id IS NOT NULL
       AND v_cfg_ent.origem_lat IS NOT NULL AND v_cfg_ent.origem_lng IS NOT NULL
       AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
      v_linha_km := round(public.distancia_linha_reta_km(
        v_cfg_ent.origem_lat, v_cfg_ent.origem_lng, v_lat, v_lng), 2);
    END IF;

    IF v_cfg_ent.id IS NOT NULL AND v_cfg_ent.origem_lat IS NOT NULL
       AND v_cfg_ent.origem_lng IS NOT NULL THEN
      -- Regime por km ativo: coordenada final do destino e OBRIGATORIA.
      IF v_lat IS NULL OR v_lng IS NULL THEN
        RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'destino_lat',
          'motivo', 'entrega_sem_coordenada');
      END IF;
      IF v_dist_km IS NULL OR v_dist_km < v_linha_km * 0.9 OR v_dist_km > v_linha_km * 3 THEN
        v_dist_km := v_linha_km;
        v_fonte := 'linha_reta';
      ELSE
        v_fonte := 'rota';
      END IF;
      IF v_cfg_ent.distancia_max_ativa AND v_cfg_ent.distancia_max_km > 0
         AND v_dist_km > v_cfg_ent.distancia_max_km THEN
        RETURN jsonb_build_object('status', 'fora_da_area',
          'distancia_km', v_dist_km, 'maximo_km', v_cfg_ent.distancia_max_km);
      END IF;
      v_vpk := round(v_cfg_ent.valor_por_km, 2);
      v_taxa := round(v_dist_km * v_cfg_ent.valor_por_km, 2);
      IF v_cfg_ent.taxa_minima_ativa AND v_cfg_ent.taxa_minima > 0 THEN
        v_taxa := GREATEST(v_taxa, round(v_cfg_ent.taxa_minima, 2));
      END IF;
    ELSE
      -- Legado: config server-side; default preserva o comportamento atual (R$ 6).
      v_taxa := CASE
                  WHEN v_taxa_txt IS NOT NULL
                       AND btrim(v_taxa_txt) <> ''
                       AND btrim(v_taxa_txt) ~ '^[0-9]+(\.[0-9]{1,2})?$'
                    THEN round(btrim(v_taxa_txt)::numeric, 2)
                  ELSE 6
                END;
    END IF;
  ELSE
    v_endereco := btrim(COALESCE(v_dados->>'endereco', ''));
    IF v_endereco = '' THEN
      v_endereco := COALESCE(v_loja_end, 'Retirada na loja');
    END IF;
    v_bairro := COALESCE(NULLIF(btrim(COALESCE(v_dados->>'bairro', '')), ''), v_loja_bai, '');
    v_cidade := COALESCE(NULLIF(btrim(COALESCE(v_dados->>'cidade', '')), ''), v_loja_cid, '');
    v_taxa := 0;
  END IF;

  --------------------------------------------------------------------------
  -- 1.6 Itens: validacao de UUID/quantidade, bloqueio de produtos e precos
  --------------------------------------------------------------------------
  -- 1.6.1 Formato dos identificadores (evita cast invalido mais adiante).
  FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
    IF NULLIF(btrim(v_elem->>'produto_id'), '') IS NOT NULL
       AND btrim(v_elem->>'produto_id') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'produto_id');
    END IF;
    IF (v_elem->>'quantidade') IS NULL
       OR (v_elem->>'quantidade') !~ '^[0-9]{1,9}$' THEN
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'quantidade');
    END IF;

    -- Combo/montagem: a composicao e uma lista de produto + quantidade.
    IF NULLIF(btrim(v_elem->>'produto_id'), '') IS NULL THEN
      IF v_elem ? 'componentes'
         AND jsonb_typeof(v_elem->'componentes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componentes');
      END IF;
      IF jsonb_typeof(v_elem->'componentes') = 'array' THEN
        FOR v_comp IN SELECT c.valor FROM jsonb_array_elements(v_elem->'componentes') AS c(valor) LOOP
          IF NULLIF(btrim(v_comp->>'produto_id'), '') IS NULL
             OR btrim(v_comp->>'produto_id') !~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componente_produto_id');
          END IF;
          IF (v_comp->>'quantidade') IS NULL
             OR (v_comp->>'quantidade') !~ '^[0-9]{1,9}$'
             OR (v_comp->>'quantidade')::int <= 0 THEN
            RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componente_quantidade');
          END IF;
        END LOOP;
      END IF;
    ELSIF jsonb_typeof(v_elem->'componentes') = 'array'
          AND jsonb_array_length(v_elem->'componentes') > 0 THEN
      -- Item de catalogo normal nao aceita composicao (evita debito duplo).
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componentes_em_produto');
    END IF;
  END LOOP;

  -- 1.6.2 Bloqueio deterministico dos produtos (L2 antes de criar o pedido;
  -- o pedido novo ainda nao e visivel a outras transacoes, entao nao ha
  -- inversao perigosa em relacao a L1). Inclui os componentes do combo.
  FOR v_pid IN
    SELECT DISTINCT pid
      FROM (
        SELECT (e.valor->>'produto_id')::uuid AS pid
          FROM jsonb_array_elements(v_itens) AS e(valor)
         WHERE NULLIF(btrim(e.valor->>'produto_id'), '') IS NOT NULL
        UNION
        SELECT (c.valor->>'produto_id')::uuid AS pid
          FROM jsonb_array_elements(v_itens) AS e(valor)
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(e.valor->'componentes') = 'array'
                 THEN e.valor->'componentes'
                 ELSE '[]'::jsonb END
          ) AS c(valor)
         WHERE NULLIF(btrim(e.valor->>'produto_id'), '') IS NULL
      ) s
     ORDER BY pid
  LOOP
    SELECT p.id INTO v_lock_id FROM public.produtos p WHERE p.id = v_pid FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'produto_inexistente', 'produto_id', v_pid);
    END IF;
  END LOOP;

  -- 1.6.3 Subtotal e regras comerciais. Combo (produto_id NULL) e aceito
  -- SOMENTE com composicao estruturada e preco de categoria configurado no
  -- banco. A soma dos componentes deve ser exatamente a quantidade do combo.
  FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
    v_qtd := (v_elem->>'quantidade')::int;
    v_pid := NULLIF(btrim(v_elem->>'produto_id'), '')::uuid;
    IF v_pid IS NULL THEN
      -- ADAPTACAO CUTOVER 0102: montagem (item sem produto_id) falha fechado.
      -- Motivo: categorias.combo_preco_unit NAO existe neste banco
      -- (ruioyioynwwwiqbjznoa) e nao ha produtos de montagem modelados
      -- (pedido_itens.produto_id IS NULL = 0 linhas; pedido_item_componentes
      -- vazia). Nesta versao NENHUM item sem produto e aceito: nada e criado,
      -- a transacao termina limpa e sem debito. A UI (checkout de corte) nunca
      -- envia item sem produto_id. Modelo de montagem deve ser revalidado e
      -- schema migrado antes de reabrir este caminho.
      RETURN jsonb_build_object(
        'status', 'montagem_sem_modelagem',
        'item', COALESCE(NULLIF(btrim(v_elem->>'nome'), ''), '(sem nome)')
      );
    END IF;

    SELECT p.nome, p.preco, p.preco_promocional, p.disponivel, p.estoque,
           p.tipo_venda::text
      INTO v_prod
      FROM public.produtos p
     WHERE p.id = v_pid;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'produto_inexistente', 'produto_id', v_pid);
    END IF;
    IF NOT v_prod.disponivel THEN
      RETURN jsonb_build_object('status', 'produto_indisponivel', 'produto_id', v_pid);
    END IF;
    IF COALESCE(v_prod.tipo_venda, 'combo_50') = 'combo_50'
       AND (v_qtd < 50 OR v_qtd % 50 <> 0) THEN
      RETURN jsonb_build_object(
        'status', 'regra_combo',
        'produto_id', v_pid,
        'quantidade', v_qtd,
        'minimo', 50,
        'passo', 50
      );
    END IF;

    v_preco := COALESCE(v_prod.preco_promocional, v_prod.preco);
    v_subtotal := v_subtotal + (v_preco * v_qtd);
    v_linhas := v_linhas + 1;
  END LOOP;

  IF v_linhas = 0 THEN
    RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'sem_itens');
  END IF;
  v_subtotal := round(v_subtotal, 2);

  -- 0103: entrega gratis acima de X (regra da config, avaliada com o
  -- subtotal REAL calculado no servidor; nunca no navegador).
  IF v_cfg_ent.id IS NOT NULL AND v_cfg_ent.gratis_ativa AND v_cfg_ent.gratis_acima > 0
     AND v_taxa > 0 AND v_subtotal >= round(v_cfg_ent.gratis_acima, 2) THEN
    v_entrega_gratis := true;
    v_taxa := 0;
  END IF;

  --------------------------------------------------------------------------
  -- 1.7 Cupom (revalidado no servidor; lock seraliza usos concorrentes)
  --------------------------------------------------------------------------
  v_cupom_cod := NULLIF(upper(btrim(COALESCE(v_dados->>'cupom', ''))), '');
  IF v_cupom_cod IS NOT NULL THEN
    SELECT * INTO v_cupom
      FROM public.cupons
     WHERE codigo = v_cupom_cod
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'nao_encontrado');
    END IF;
    IF NOT v_cupom.ativo THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'inativo');
    END IF;
    IF v_cupom.validade_ini IS NOT NULL AND v_cupom.validade_ini > now() THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'validade');
    END IF;
    IF v_cupom.validade_fim IS NOT NULL AND v_cupom.validade_fim < now() THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'validade');
    END IF;
    IF btrim(COALESCE(v_cupom.cliente_telefone, '')) <> ''
       AND regexp_replace(v_cupom.cliente_telefone, '\D', '', 'g')
           <> regexp_replace(v_telefone, '\D', '', 'g') THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'cliente');
    END IF;
    IF v_cupom.minimo > 0 AND v_subtotal < v_cupom.minimo THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'minimo');
    END IF;
    IF v_cupom.produtos_ids IS NOT NULL
       AND jsonb_typeof(v_cupom.produtos_ids) = 'array' THEN
      IF jsonb_array_length(v_cupom.produtos_ids) > 0 THEN
        IF NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements(v_itens) AS e(valor)
           WHERE NULLIF(btrim(e.valor->>'produto_id'), '') IS NOT NULL
             AND btrim(e.valor->>'produto_id') IN (
               SELECT jsonb_array_elements_text(v_cupom.produtos_ids)
             )
        ) THEN
          RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'produtos');
        END IF;
      END IF;
    END IF;
    IF v_cupom.max_usos > 0 THEN
      SELECT count(*) INTO v_n
        FROM public.pedidos p
       WHERE p.cupom = v_cupom_cod AND p.status <> 'cancelado';
      IF v_n >= v_cupom.max_usos THEN
        RETURN jsonb_build_object('status', 'cupom_esgotado', 'max_usos', v_cupom.max_usos);
      END IF;
    END IF;

    IF v_cupom.tipo = 'percentual' THEN
      v_desc := v_subtotal * v_cupom.valor / 100;
    ELSE
      v_desc := v_cupom.valor;
    END IF;
    v_desc := round(GREATEST(0, LEAST(v_desc, v_subtotal)), 2);
  END IF;

  --------------------------------------------------------------------------
  -- 1.7b Desconto manual e ajuste manual da taxa (so staff autorizado)
  --------------------------------------------------------------------------
  -- NUNCA confiar cegamente no navegador: o desconto manual so e aceito quando
  -- o canal e staff (pdv/atendente) E o papel e admin|atendente. O valor vem de
  -- p_dados.desconto_manual (numerico >= 0); e somado ao desconto de cupom e
  -- limitado ao subtotal (total nunca negativo). Nao ha limite percentual
  -- inventado — o limite e o proprio subtotal.
  IF v_canal IN ('pdv', 'atendente')
     AND (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'atendente'::public.app_role))
     AND jsonb_typeof(v_dados->'desconto_manual') = 'number'
     AND (v_dados->>'desconto_manual')::numeric >= 0 THEN
    v_desc_manual := round((v_dados->>'desconto_manual')::numeric, 2);
  END IF;
  v_desc := round(GREATEST(0, LEAST(v_desc + v_desc_manual, v_subtotal)), 2);

  -- 0103: ajuste manual da TAXA DE ENTREGA — somente canal staff, papel
  -- autorizado e config.ajuste_manual = true. Sempre grata auditoria:
  -- taxa calculada, taxa final, usuario e momento. Taxa zerada exige motivo.
  IF v_canal IN ('pdv', 'atendente')
     AND (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'atendente'::public.app_role))
     AND v_cfg_ent.id IS NOT NULL AND v_cfg_ent.ajuste_manual
     AND jsonb_typeof(v_dados->'entrega_ajuste') = 'object' THEN
    v_aj_taxa := NULL;
    v_aj_motivo := NULL;
    IF jsonb_typeof(v_dados->'entrega_ajuste'->'taxa_final') = 'number' THEN
      BEGIN
        v_aj_taxa := round((v_dados->'entrega_ajuste'->>'taxa_final')::numeric, 2);
      EXCEPTION WHEN OTHERS THEN
        v_aj_taxa := NULL;
      END;
    END IF;
    v_aj_motivo := NULLIF(btrim(COALESCE(v_dados->'entrega_ajuste'->>'motivo', '')), '');
    IF v_aj_taxa IS NOT NULL AND v_aj_taxa >= 0 AND v_aj_taxa <> v_taxa THEN
      IF v_aj_taxa = 0 AND v_aj_motivo IS NULL THEN
        RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'entrega_ajuste',
          'motivo', 'taxa_zero_sem_motivo');
      END IF;
      v_ajuste := jsonb_build_object(
        'taxa_calculada', v_taxa,
        'taxa_final', v_aj_taxa,
        'motivo', v_aj_motivo,
        'usuario_id', v_uid,
        'em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
      v_taxa := v_aj_taxa;
    END IF;
  END IF;

  -- 0103: snapshot da tarifa no pedido (pedido antigo nao muda quando a
  -- config mudar amanha).
  IF v_cfg_ent.id IS NOT NULL AND v_fonte IS NOT NULL THEN
    v_snapshot := jsonb_build_object(
      'modo', 'por_km',
      'distancia_km', v_dist_km,
      'valor_por_km', v_vpk,
      'fonte', v_fonte,
      'taxa_minima_ativa', v_cfg_ent.taxa_minima_ativa,
      'distancia_max_ativa', v_cfg_ent.distancia_max_ativa,
      'entrega_gratis', v_entrega_gratis,
      'config_em', v_cfg_ent.atualizado_em
    );
  ELSIF v_cfg_ent.id IS NOT NULL THEN
    v_snapshot := jsonb_build_object('modo', 'legado', 'config_em', v_cfg_ent.atualizado_em);
  ELSE
    v_snapshot := jsonb_build_object('modo', 'legado');
  END IF;

  --------------------------------------------------------------------------
  -- 1.8 Pagamento (derivado no servidor; nunca lido do navegador)
  --------------------------------------------------------------------------
  -- Regra 0063: na_entrega somente para entrega + dinheiro.
  v_modalidade := CASE
                    WHEN v_tipo_entrega = 'entrega' AND v_forma = 'dinheiro'
                      THEN 'na_entrega'
                    ELSE 'online'
                  END;

  -- PDV com pagamento imediato fora do Pix pode nascer pago. Pix permanece
  -- pendente ate o webhook. Checkout/atendimento sempre nascem pendentes.
  IF v_canal = 'pdv' AND v_forma <> 'pix'
     AND jsonb_typeof(v_dados->'pagamento_imediato') = 'boolean' THEN
    IF (v_dados->>'pagamento_imediato')::boolean THEN
      v_pag_status := 'pago';
      v_pag_em := now();
    END IF;
  END IF;

  v_total := round(GREATEST(v_subtotal + v_taxa - v_desc, 0), 2);

  --------------------------------------------------------------------------
  -- 1.9 Escrita + reserva + historico no MESMO bloco interno
  --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.pedidos (
      id, user_id, cliente_nome, telefone, endereco, bairro, cidade, cep,
      complemento, referencia, observacoes,
      tipo_imovel, apartamento, bloco, torre, andar, interfone, pode_subir,
      cpf_cnpj, nome_fiscal, origem_cliente,
      tipo_entrega, forma_pagamento, pagamento_modalidade,
      pagamento_status, pagamento_em,
      subtotal, taxa_entrega, desconto, total, cupom,
      destino_lat, destino_lng, agendado_para, agendamento_obs,
      tipo_evento, campanha_origem,
      distancia_km, valor_por_km_aplicado, entrega_snapshot, entrega_ajuste,
      endereco_estado, endereco_place_id
    ) VALUES (
      p_id, v_uid, v_cliente, v_telefone, v_endereco, v_bairro, v_cidade, v_cep,
      v_complemento, v_referencia, v_obs,
      v_tipo_imovel, v_apartamento, v_bloco, v_torre, v_andar, v_interfone,
      v_pode_subir,
      v_cpf, v_nome_fiscal, v_origem_cliente,
      v_tipo_entrega, v_forma::public.pagamento, v_modalidade,
      v_pag_status, v_pag_em,
      v_subtotal, v_taxa, v_desc, v_total, v_cupom_cod,
      v_lat, v_lng, v_agendado, v_ag_obs,
      v_tipo_evento, v_campanha,
      v_dist_km, v_vpk, v_snapshot, v_ajuste,
      v_uf, v_place_id
    )
    RETURNING numero INTO v_numero;

    -- Nome vem do catalogo (fonte confiavel); observacao do item e opcional.
    FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
      v_qtd := (v_elem->>'quantidade')::int;
      v_pid := NULLIF(btrim(v_elem->>'produto_id'), '')::uuid;

      IF v_pid IS NULL THEN
        -- ADAPTACAO CUTOVER 0102: caminho morto (inacessivel) — a validacao
        -- acima REJEITA todo item sem produto_id (montagem_sem_modelagem).
        -- Mantido apenas como cinto de seguranca: nunca deve executar.
        RAISE EXCEPTION USING
          ERRCODE = 'P0095',
          MESSAGE = 'montagem_sem_modelagem',
          DETAIL  = '{"status":"montagem_sem_modelagem"}';
      END IF;

      SELECT p.nome, p.preco, p.preco_promocional
        INTO v_prod
        FROM public.produtos p
       WHERE p.id = v_pid;

      v_preco := COALESCE(v_prod.preco_promocional, v_prod.preco);
      v_obs_item := btrim(COALESCE(v_elem->>'observacao', ''));
      v_nome_item := v_prod.nome ||
                     CASE WHEN v_obs_item <> ''
                          THEN ' (obs: ' || v_obs_item || ')'
                          ELSE '' END;

      INSERT INTO public.pedido_itens (
        pedido_id, produto_id, nome, preco_unitario, quantidade
      ) VALUES (
        p_id, v_pid, v_nome_item, v_preco, v_qtd
      );
    END LOOP;

    -- Reserva atomica: debita estoque, grava reservas + comprovante no ledger.
    v_res := public.reservar_pedido_atomico(p_id);
    IF v_res IS NULL
       OR COALESCE(v_res->>'status', '') NOT IN ('reservado', 'ja_reservado') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0095',
        MESSAGE = 'reserva_nao_confirmada',
        DETAIL  = COALESCE(v_res::text, '{"status":"reserva_nula"}');
    END IF;

    -- Historico obrigatorio DENTRO do bloco: falha aqui desfaz tudo.
    INSERT INTO public.pedido_status_historico (
      pedido_id, de_status, para_status, actor, motivo
    ) VALUES (
      p_id, NULL, 'recebido', v_uid, 'criacao_atomica:' || v_canal
    );

  EXCEPTION
    WHEN SQLSTATE 'P0095' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      -- O bloco interno ja foi revertido (pedido/itens/reserva/historico).
      RETURN COALESCE(NULLIF(v_detail, ''), '{"status":"reserva_nao_confirmada"}')::jsonb;
  END;

  RETURN jsonb_build_object(
    'status', 'criado',
    'pedido_id', p_id,
    'numero', v_numero,
    'canal', v_canal,
    'subtotal', v_subtotal,
    'taxa_entrega', v_taxa,
    'desconto', v_desc,
    'total', v_total,
    'pagamento_status', v_pag_status,
    'pagamento_modalidade', v_modalidade,
    'distancia_km', v_dist_km,
    'valor_por_km', v_vpk,
    'entrega_gratis', v_entrega_gratis,
    'reserva', v_res
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Nao expor SQLERRM (pode conter valores de dados). Nao ha escrita parcial:
    -- o bloco que escreveu ja foi revertido antes de chegar aqui.
    RETURN jsonb_build_object('status', 'erro_interno', 'sqlstate', SQLSTATE);
END;
$function$
;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(p_id uuid, p_canal text, p_dados jsonb, p_itens jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(p_id uuid, p_canal text, p_dados jsonb, p_itens jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
  v_ja_0030 boolean;
BEGIN
  IF EXISTS(SELECT 1 FROM public.reserva_proveniencia_config WHERE id AND controlado) THEN RETURN; END IF;
  -- Valida se pedido existe e está em status confirmado
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos
    WHERE id = p_pedido_id AND status = 'em_producao'
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está em status "em_producao": %', p_pedido_id;
  END IF;

  -- Só itens COM produto (combo montado = montagem, sem baixa de lote)
  FOR v_item IN
    SELECT pi.produto_id, pi.quantidade
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = p_pedido_id
      AND pi.produto_id IS NOT NULL
  LOOP
    -- 0030 já baixou produtos.estoque no checkout? Então aqui só movemos lotes.
    v_ja_0030 := false;
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM public.reservas_estoque
        WHERE pedido_id = p_pedido_id
          AND produto_id = v_item.produto_id
          AND status = 'ativa'
      ) INTO v_ja_0030;
    EXCEPTION WHEN undefined_table THEN
      v_ja_0030 := false;
    END;

    v_qtd_restante := v_item.quantidade;

    -- Busca lotes FEFO (First Expire, First Out) com saldo disponível
    FOR v_lote IN
      SELECT id, restante
      FROM public.lotes
      WHERE produto_id = v_item.produto_id
        AND status = 'ativo'
        AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE)
      ORDER BY validade ASC NULLS LAST, created_at ASC
    LOOP
      IF v_qtd_restante <= 0 THEN
        EXIT;
      END IF;

      DECLARE
        v_qtd_lote integer := LEAST(v_lote.restante, v_qtd_restante);
      BEGIN
        -- Atualiza lote
        UPDATE public.lotes
        SET restante = restante - v_qtd_lote
        WHERE id = v_lote.id;

        -- Registra movimentação de reserva (sem rebaixar produtos.estoque se 0030 já o fez)
        PERFORM public.registrar_mov_estoque(
          v_item.produto_id,
          'reserva',
          -v_qtd_lote,
          v_lote.id,
          p_pedido_id,
          'pedido',
          NULL,
          'Reserva FEFO para pedido #' || (
            SELECT numero::text FROM public.pedidos WHERE id = p_pedido_id
          ),
          NOT v_ja_0030
        );

        v_qtd_restante := v_qtd_restante - v_qtd_lote;
      END;
    END LOOP;

    IF v_qtd_restante > 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente para produto % (faltam % unidades). Lotes disponíveis: %',
        v_item.produto_id, v_qtd_restante, (
          SELECT COALESCE(SUM(restante), 0)
          FROM public.lotes
          WHERE produto_id = v_item.produto_id
            AND status = 'ativo'
            AND restante > 0
        );
    END IF;
  END LOOP;
END;
$function$
;
DROP TRIGGER IF EXISTS trigger_proteger_consistencia_financeira ON public.pedidos;
CREATE TRIGGER trigger_proteger_consistencia_financeira BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.proteger_consistencia_financeira_pedido();
DROP TRIGGER IF EXISTS neia_exigir_reserva_producao ON public.pedidos;
CREATE TRIGGER neia_exigir_reserva_producao BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.exigir_reserva_producao();
DROP TRIGGER IF EXISTS neia_exigir_consumo_producao ON public.pedidos;
CREATE TRIGGER neia_exigir_consumo_producao BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.exigir_consumo_producao();
COMMIT;
