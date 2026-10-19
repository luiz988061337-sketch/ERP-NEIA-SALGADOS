-- ============================================================================
-- PASSO 2 (parte 1/3) — MIGRATIONS 0087..0091
-- Cole esta parte DEPOIS da parte anterior e ANTES da próxima.
-- Conteudo verbatim das migrations homologadas (sem os comentarios de
-- documentacao; a versao anotada esta em 02_MIGRATIONS-CUTOVER.sql).
-- NAO APLIQUE A 0088. A 0094 e 0096 sao ATIVAS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reserva_consumos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      uuid NOT NULL REFERENCES public.reservas_estoque(id) ON DELETE RESTRICT,
  pedido_id       uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  produto_id      uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade      integer NOT NULL CHECK (quantidade > 0),
  funcionario_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idem_key        uuid NOT NULL UNIQUE,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reserva_consumos_reserva_idx
  ON public.reserva_consumos (reserva_id);
CREATE INDEX IF NOT EXISTS reserva_consumos_pedido_idx
  ON public.reserva_consumos (pedido_id);
CREATE INDEX IF NOT EXISTS reserva_consumos_produto_idx
  ON public.reserva_consumos (produto_id);

ALTER TABLE public.reserva_consumos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reservar_pedido_atomico(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_plan_ids   uuid[]    := '{}';
  v_plan_falta bigint[]  := '{}';
  v_plan_saldo integer[] := '{}';
  v_plan_n     integer;
  v_reserva_id uuid;
  v_mov_id     uuid;
  v_controlado boolean := false;
  i            integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT controlado
      INTO v_controlado
    FROM public.reserva_proveniencia_config
    WHERE id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;

  SELECT user_id, status
    INTO v_dono, v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

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

  IF v_status NOT IN ('recebido', 'em_producao') THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  SELECT COUNT(*) INTO v_n_itens
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
      AND (quantidade IS NULL OR quantidade <= 0)
  ) THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;

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

  SELECT COUNT(*) INTO v_montagem
  FROM public.pedido_itens i
  WHERE i.pedido_id = p_pedido_id
    AND i.produto_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pedido_item_componentes c
       WHERE c.pedido_item_id = i.id
    );

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
    RETURN jsonb_build_object('status', 'ja_reservado', 'itens', 0, 'montagem', v_montagem);
  END IF;

  SELECT array_agg(u.pid) INTO v_missing
  FROM unnest(v_ids) AS u(pid)
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = u.pid);
  IF v_missing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'produto_inexistente', 'produtos', to_jsonb(v_missing));
  END IF;

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
    RETURN jsonb_build_object('status', 'estoque_insuficiente', 'itens', v_faltas);
  END IF;

  v_plan_n := COALESCE(array_length(v_plan_ids, 1), 0);
  IF v_plan_n = 0 THEN
    RETURN jsonb_build_object('status', 'ja_reservado', 'itens', 0, 'montagem', v_montagem);
  END IF;

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
$$;

COMMENT ON FUNCTION public.reservar_pedido_atomico(uuid) IS
  '0089: reserva transacional de TODO o pedido (Modelo 2). Exige produto '
  'existente para cada item (produto_inexistente), quantidade > 0 '
  '(quantidade_invalida); valida disponibilidade de todos ANTES de debitar '
  '(sem baixa parcial) e aplica um PLANO CONGELADO (sem re-leitura de itens => '
  'sem débito acima do validado). Trava produtos em ordem determinística '
  '(ORDER BY id); cria reserva com id próprio e registra no ledger '
  'estoque_movimentacoes (referencia_tipo=reserva_estoque, tipo=reserva, saldos '
  'reais). Idempotente (plano vazio => ja_reservado sem baixa). Campo montagem '
  'quantifica itens sem produto_id (combo montado) fora do controle de estoque. '
  'Reservas ativas sem origem (ou, sob regime controlado, sem marcador de '
  'proveniência) => reconciliacao_pendente. Proveniência (0092): sob regime '
  'controlado cria o marcador na mesma transação do débito. '
  'Retorno jsonb classificado, sem dados pessoais. NÃO grava em estoque_mov.';

REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_atomico(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.liberar_pedido_atomico(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_plan_res    uuid[]    := '{}';
  v_plan_prod   uuid[]    := '{}';
  v_plan_qtd    integer[] := '{}';
  v_plan_n      integer;
  v_saldo_ant   integer;
  v_saldo_pos   integer;
  i             integer;
BEGIN
  SELECT status
    INTO v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  IF v_status <> 'cancelado' THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  v_has_prov := (to_regclass('public.reserva_proveniencia') IS NOT NULL);

  SELECT COUNT(*)
    INTO v_n_montagem
  FROM public.pedido_itens i
  WHERE i.pedido_id = p_pedido_id
    AND i.produto_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pedido_item_componentes c
       WHERE c.pedido_item_id = i.id
    );

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

  FOR v_res IN
    SELECT id, pedido_id, produto_id, quantidade, status
    FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_res.produto_id IS NULL
       OR NOT (v_res.produto_id = ANY(v_locked_prod))
       OR NOT (v_res.produto_id = ANY(v_item_prods)) THEN
      v_n_indet := v_n_indet + 1;
      CONTINUE;
    END IF;

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
        v_n_indet := v_n_indet + 1;
      ELSE
        v_plan_res  := v_plan_res  || v_res.id;
        v_plan_prod := v_plan_prod || v_res.produto_id;
        v_plan_qtd  := v_plan_qtd  || v_restante::integer;
      END IF;

    ELSIF v_res.status = 'consumida' THEN
      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_restante <> 0
         OR v_lib_n <> 0 THEN
        v_n_indet := v_n_indet + 1;
      END IF;

    ELSIF v_res.status = 'liberada' THEN
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
      v_n_indet := v_n_indet + 1;
    END IF;
  END LOOP;

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

  SELECT bool_or(status = 'ativa'), bool_or(status = 'liberada')
    INTO v_tem_ativa, v_tem_liberada
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id;

  IF COALESCE(v_tem_ativa, false) AND COALESCE(v_tem_liberada, false) THEN
    v_n_indet := v_n_indet + 1;
  END IF;

  IF v_n_indet > 0 THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'reservas', v_n_indet,
      'montagem', v_n_montagem
    );
  END IF;

  v_plan_n := COALESCE(array_length(v_plan_res, 1), 0);
  IF v_plan_n = 0 THEN
    RETURN jsonb_build_object(
      'status', 'ja_liberado', 'reservas', 0, 'unidades', 0,
      'montagem', v_n_montagem
    );
  END IF;

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
$$;

COMMENT ON FUNCTION public.liberar_pedido_atomico(uuid) IS
  '0090 (INTERNA, sem EXECUTE para anon/authenticated; rev. 1.48): libera o '
  'RESTANTE (quantidade - SUM(reserva_consumos)) das reservas ATIVAS de um pedido '
  'JÁ CANCELADO, APÓS validar TODAS as reservas (qualquer status) e a '
  'correspondência item×reserva por produto. Credita estoque_movimentacoes '
  '(tipo=liberacao, referencia_tipo=reserva_estoque, referencia_id=reserva.id, '
  'saldos reais) e mantém a quantidade original intacta. Idempotente. '
  'Consistência exigida por status: ativa = 1 débito coerente + marcador de '
  'proveniência + sem liberação prévia; consumida = débito + consumo total + sem '
  'liberação; liberada = débito + EXATAMENTE 1 liberacao coerente igual ao '
  'restante (prova de crédito); cancelada = sem prova => bloqueia. A soma das '
  'reservas ativa+consumida+LIBERADA por produto (cada uma UMA vez, com prova) '
  'deve IGUALAR a quantidade dos itens; além disso, bloqueia-se a coexistência de '
  'ativa com liberada no mesmo pedido (liberação anterior segurando estoque). '
  'Qualquer dúvida => reconciliacao_pendente SEM crédito. ja_liberado só quando '
  'nada ativo E tudo comprovado (nunca presumido) — inclusive após liberação '
  'integral (retry idempotente). Sem a tabela de proveniência '
  '(0092) ou com controlado=false => reservas ativas ficam fail-closed (nada '
  'liberado). Itens de montagem (produto_id NULL) ficam fora do estoque e são '
  'contados em montagem. Locks: pedidos -> produtos(id) -> reservas_estoque(id). '
  'Deve ser chamada por uma futura operação transacional de cancelamento (que '
  'DEVE converter reconciliacao_pendente em exceção para rollback); NÃO autoriza '
  'cancelamento por si só.';

REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_consumo_reserva(
  p_reserva_id     uuid,
  p_quantidade     integer,
  p_idem_key       uuid,
  p_produto_id     uuid DEFAULT NULL,
  p_observacao     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  IF p_reserva_id IS NULL OR p_idem_key IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida');
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;

  SELECT pedido_id, produto_id
    INTO v_pedido_id, v_reserva_prod
  FROM public.reservas_estoque
  WHERE id = p_reserva_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  SELECT status
    INTO v_pedido_status
  FROM public.pedidos
  WHERE id = v_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');
  IF NOT v_eh_staff THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  IF p_produto_id IS NOT NULL AND p_produto_id IS DISTINCT FROM v_reserva_prod THEN
    RETURN jsonb_build_object('status', 'produto_divergente');
  END IF;

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

  IF v_pedido_status IN ('entregue', 'cancelado') THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  SELECT produto_id
    INTO v_produto_lock
  FROM public.reservas_estoque
  WHERE id = p_reserva_id;
  IF v_produto_lock IS NULL THEN
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

  SELECT produto_id, quantidade, status
    INTO v_produto_id, v_reserva_qtd, v_reserva_status
  FROM public.reservas_estoque
  WHERE id = p_reserva_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;
  IF v_produto_id IS NULL OR v_produto_id IS DISTINCT FROM v_produto_lock THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;
  IF v_reserva_status <> 'ativa' THEN
    RETURN jsonb_build_object('status', 'reserva_encerrada');
  END IF;
  IF p_produto_id IS NOT NULL AND p_produto_id IS DISTINCT FROM v_produto_id THEN
    RETURN jsonb_build_object('status', 'produto_divergente');
  END IF;

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

  INSERT INTO public.reserva_consumos (
    reserva_id, pedido_id, produto_id, quantidade, funcionario_id, idem_key, observacao
  ) VALUES (
    p_reserva_id, v_pedido_id, v_produto_id, p_quantidade, v_uid, p_idem_key, p_observacao
  )
  ON CONFLICT (idem_key) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
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
$$;

COMMENT ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) IS
  '0091 (Modelo 2, rev. 1.39): registra retirada física parcial/total de uma '
  'reserva em reserva_consumos (append-only, idempotente por idem_key). Replay '
  'exige mesmos reserva/quantidade/funcionário/observação e compara o produto '
  'EFETIVO da reserva (não o parâmetro opcional), de modo que replay que OMITE '
  'p_produto_id devolve ja_registrado; p_produto_id informado é validado '
  '(divergência => produto_divergente); replay após retirada completa => '
  'ja_registrado sem duplicar consumo. NÃO debita '
  'produtos.estoque de novo. Executor = SEMPRE auth.uid() (sem delegação). Só '
  'aceita reserva ATIVA com origem EXATA no ledger (1 movimento reserva coerente, '
  'débito = quantidade, sem liberacao prévia) e pedido não fechado '
  '(entregue/cancelado => status_invalido): bloqueia histórico fictício e as 19 '
  'reservas antigas (reconciliacao_pendente). Só staff operacional '
  '(admin/producao/atendente). Locks L1 pedidos -> L2 produtos(id) -> L3 '
  'reservas_estoque(id), com ABORTO se a reserva mudar entre leituras, compatível '
  'com 0089/0090. Restante zero => reserva consumida. Retorno jsonb classificado, '
  'sem dados pessoais.';

REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text)
  TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_estoque_prov_uk'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque
      ADD CONSTRAINT reservas_estoque_prov_uk
      UNIQUE (id, pedido_id, produto_id, quantidade);
  END IF;
END $$;
