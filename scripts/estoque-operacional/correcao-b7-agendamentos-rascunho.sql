-- RASCUNHO LOCAL — NÃO APLICAR EM HOMOLOGAÇÃO OU PRODUÇÃO.
-- Correção operacional B7: pedidos imediatos reservam normalmente; agendamento
-- com cobertura física protege a quantidade; agendamento sem cobertura vira
-- análise/solicitação (sem pedido, sem cobrança e sem reserva); após análise
-- aprovada, registra compromisso futuro real, sem lote ou estoque fictício.
--
-- A numeração definitiva será coordenada com o Codex (0134 pertence ao Codex).
-- Este arquivo não altera 0095, 0103, 0089, 0129 ou 0133. A função vigente é
-- renomeada para `criar_pedido_com_reserva_base` e continua sendo chamada pelo
-- wrapper abaixo; nenhum corpo de validação financeira é duplicado.
--
-- Reversão não destrutiva: scripts/reverter-correcao-b7-agendamentos.sql
-- Habilitação padrão: DESLIGADA. Nenhum comportamento muda até autorização.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Configuração e registro de agendamentos (somente o definer escreve)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salgados_b7_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  habilitado boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.salgados_b7_config (id, habilitado)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.salgados_b7_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.salgados_b7_config FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.salgados_agendamentos_b7 (
  pedido_id uuid PRIMARY KEY,
  canal text NOT NULL,
  dados jsonb NOT NULL,
  itens jsonb NOT NULL,
  dados_hash text NOT NULL,
  data_solicitada date NOT NULL,
  situacao text NOT NULL DEFAULT 'analise_pendente'
    CHECK (situacao IN (
      'analise_pendente', 'reserva_fisica_protegida',
      'compromisso_aprovado', 'recusado', 'pedido_vinculado',
      'reserva_convertida', 'cancelado'
    )),
  solicitacoes uuid[] NOT NULL DEFAULT '{}',
  compromissos uuid[] NOT NULL DEFAULT '{}',
  pedido_definitivo_id uuid,
  reservas uuid[] NOT NULL DEFAULT '{}',
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salgados_agendamentos_b7_data_idx
  ON public.salgados_agendamentos_b7 (data_solicitada);

ALTER TABLE public.salgados_agendamentos_b7 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.salgados_agendamentos_b7 FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.salgados_agendamentos_b7 IS
  $$Registro de decisão do B7 por id de checkout/PDV. Não é pedido, não é lote e não é saldo.$$;

-- -----------------------------------------------------------------------------
-- 2. Preserva a RPC vigente e instala o wrapper de decisão
-- -----------------------------------------------------------------------------
DO $mig$
BEGIN
  IF to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'B7: RPC base public.criar_pedido_com_reserva ausente';
  END IF;
  IF to_regprocedure('public.criar_pedido_com_reserva_base(uuid,text,jsonb,jsonb)') IS NULL THEN
    ALTER FUNCTION public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)
      RENAME TO criar_pedido_com_reserva_base;
  END IF;
END
$mig$;

CREATE OR REPLACE FUNCTION public.criar_pedido_com_reserva(
  p_id uuid,
  p_canal text,
  p_dados jsonb,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_dados        jsonb := coalesce(p_dados, '{}'::jsonb);
  v_itens        jsonb := coalesce(p_itens, '[]'::jsonb);
  v_agendado     timestamptz;
  v_data         date;
  v_ativo        boolean;
  v_tem_salgado  boolean := false;
  v_sem_cobertura boolean := false;
  v_linha        record;
  v_hash         text;
  v_exist        public.salgados_agendamentos_b7%ROWTYPE;
  v_res          jsonb;
  v_sol_id       uuid;
  v_sols         uuid[] := '{}';
  v_chave_key    uuid;
BEGIN
  -- Sem identidade, sem data futura válida ou feature flag desligada: a base
  -- continua sendo a única autoridade (inclusive para mensagens de erro).
  IF v_uid IS NULL
     OR jsonb_typeof(v_dados->'agendado_para') IS DISTINCT FROM 'string'
     OR btrim(coalesce(v_dados->>'agendado_para', '')) = '' THEN
    RETURN public.criar_pedido_com_reserva_base(p_id, p_canal, v_dados, v_itens);
  END IF;

  BEGIN
    v_agendado := (v_dados->>'agendado_para')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN public.criar_pedido_com_reserva_base(p_id, p_canal, v_dados, v_itens);
  END;

  IF v_agendado <= now() THEN
    RETURN public.criar_pedido_com_reserva_base(p_id, p_canal, v_dados, v_itens);
  END IF;

  SELECT habilitado INTO v_ativo FROM public.salgados_b7_config WHERE id;
  IF NOT coalesce(v_ativo, false) THEN
    RETURN public.criar_pedido_com_reserva_base(p_id, p_canal, v_dados, v_itens);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('criar_pedido_com_reserva:' || p_id::text));
  v_data := (v_agendado AT TIME ZONE 'America/Sao_Paulo')::date;
  v_hash := md5(coalesce(p_canal, '') || '|' || v_dados::text || '|' || v_itens::text);

  -- Cobertura física: lotes não vencidos menos reservas ativas não consumidas,
  -- menos margem individual, mais liberação pontual vigente. Itens sem sabor
  -- canônico (bebidas, por exemplo) não entram nesta avaliação.
  FOR v_linha IN
    WITH req AS (
      SELECT chave, sum(qtd)::integer AS qtd
      FROM (
        SELECT s.chave, (e.valor->>'quantidade')::integer AS qtd
        FROM jsonb_array_elements(v_itens) AS e(valor)
        JOIN public.sabores_estoque s
          ON s.produto_id = NULLIF(e.valor->>'produto_id', '')::uuid
        WHERE jsonb_typeof(e.valor->'produto_id') = 'string'
          AND (e.valor->>'produto_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND jsonb_typeof(e.valor->'quantidade') = 'number'
          AND (e.valor->>'quantidade') ~ '^-?[0-9]+$'
        UNION ALL
        SELECT s.chave, (c.valor->>'quantidade')::integer AS qtd
        FROM jsonb_array_elements(v_itens) AS e(valor)
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.valor->'componentes', '[]'::jsonb)) AS c(valor)
        JOIN public.sabores_estoque s
          ON s.produto_id = NULLIF(c.valor->>'produto_id', '')::uuid
        WHERE jsonb_typeof(c.valor->'produto_id') = 'string'
          AND (c.valor->>'produto_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND jsonb_typeof(c.valor->'quantidade') = 'number'
          AND (c.valor->>'quantidade') ~ '^-?[0-9]+$'
      ) AS itens_sabor
      GROUP BY chave
    ), classificacao AS (
      SELECT r.chave, r.qtd,
             coalesce(cfg.inventariado, false)
             AND NOT EXISTS (
               SELECT 1 FROM public.salgados_bloqueios b
               WHERE b.chave = r.chave AND b.ativo
                 AND v_data BETWEEN b.inicio AND b.fim
             )
             AND (
               coalesce(f.total, 0) - coalesce(res.total, 0)
                 - coalesce(cfg.margem_seguranca, 100) + coalesce(a.total, 0)
             ) >= r.qtd AS coberto
      FROM req r
      JOIN public.sabores_estoque s ON s.chave = r.chave
      LEFT JOIN public.sabores_estoque_config cfg ON cfg.chave = r.chave
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(l.restante), 0)::integer AS total
        FROM public.lotes l
        WHERE l.sabor_chave = r.chave AND l.status = 'ativo'
          AND (l.validade IS NULL OR l.validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
      ) f ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(greatest(rv.quantidade - coalesce(cc.consumido, 0), 0)), 0)::integer AS total
        FROM public.reservas_estoque rv
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(quantidade), 0) AS consumido
          FROM public.reserva_consumos WHERE reserva_id = rv.id
        ) cc ON true
        WHERE rv.sabor_chave = r.chave AND rv.status = 'ativa'
      ) res ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(quantidade_liberada), 0)::integer AS total
        FROM public.salgados_autorizacoes a0
        WHERE a0.chave = r.chave AND a0.usada_em IS NULL AND a0.expira_em > now()
      ) a ON true
    )
    SELECT chave, qtd, coberto FROM classificacao
  LOOP
    v_tem_salgado := true;
    IF NOT coalesce(v_linha.coberto, false) THEN
      v_sem_cobertura := true;
    END IF;
  END LOOP;

  -- Produtos de fora do cardápio canônico preservam o fluxo existente.
  IF NOT v_tem_salgado THEN
    RETURN public.criar_pedido_com_reserva_base(p_id, p_canal, v_dados, v_itens);
  END IF;

  IF v_sem_cobertura THEN
    SELECT * INTO v_exist FROM public.salgados_agendamentos_b7 WHERE pedido_id = p_id;
    IF FOUND THEN
      IF v_exist.dados_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object('status', 'idempotencia_divergente', 'pedido_id', p_id);
      END IF;
      RETURN jsonb_build_object(
        'status', 'analise_necessaria', 'pedido_id', p_id,
        'situacao', v_exist.situacao,
        'solicitacoes', to_jsonb(v_exist.solicitacoes),
        'mensagem', 'Agendamento sem cobertura confirmada: aguardando decisão do responsável.'
      );
    END IF;

    INSERT INTO public.salgados_agendamentos_b7 (
      pedido_id, canal, dados, itens, dados_hash, data_solicitada, situacao, criado_por
    ) VALUES (
      p_id, coalesce(p_canal, ''), v_dados, v_itens, v_hash, v_data,
      'analise_pendente', v_uid
    ) RETURNING * INTO v_exist;

    FOR v_linha IN
      WITH req AS (
        SELECT chave, sum(qtd)::integer AS qtd
        FROM (
          SELECT s.chave, (e.valor->>'quantidade')::integer AS qtd
          FROM jsonb_array_elements(v_itens) AS e(valor)
          JOIN public.sabores_estoque s
            ON s.produto_id = NULLIF(e.valor->>'produto_id', '')::uuid
          WHERE jsonb_typeof(e.valor->'produto_id') = 'string'
            AND (e.valor->>'produto_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            AND jsonb_typeof(e.valor->'quantidade') = 'number'
            AND (e.valor->>'quantidade') ~ '^-?[0-9]+$'
          UNION ALL
          SELECT s.chave, (c.valor->>'quantidade')::integer AS qtd
          FROM jsonb_array_elements(v_itens) AS e(valor)
          CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.valor->'componentes', '[]'::jsonb)) AS c(valor)
          JOIN public.sabores_estoque s
            ON s.produto_id = NULLIF(c.valor->>'produto_id', '')::uuid
          WHERE jsonb_typeof(c.valor->'produto_id') = 'string'
            AND (c.valor->>'produto_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            AND jsonb_typeof(c.valor->'quantidade') = 'number'
            AND (c.valor->>'quantidade') ~ '^-?[0-9]+$'
        ) AS itens_sabor
        GROUP BY chave
      ), classificacao AS (
        SELECT r.chave, r.qtd,
               coalesce(cfg.inventariado, false)
               AND NOT EXISTS (
                 SELECT 1 FROM public.salgados_bloqueios b
                 WHERE b.chave = r.chave AND b.ativo
                   AND v_data BETWEEN b.inicio AND b.fim
               )
               AND (
                 coalesce(f.total, 0) - coalesce(res.total, 0)
                   - coalesce(cfg.margem_seguranca, 100) + coalesce(a.total, 0)
               ) >= r.qtd AS coberto
        FROM req r
        JOIN public.sabores_estoque s ON s.chave = r.chave
        LEFT JOIN public.sabores_estoque_config cfg ON cfg.chave = r.chave
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(l.restante), 0)::integer AS total
          FROM public.lotes l
          WHERE l.sabor_chave = r.chave AND l.status = 'ativo'
            AND (l.validade IS NULL OR l.validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
        ) f ON true
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(greatest(rv.quantidade - coalesce(cc.consumido, 0), 0)), 0)::integer AS total
          FROM public.reservas_estoque rv
          LEFT JOIN LATERAL (
            SELECT coalesce(sum(quantidade), 0) AS consumido
            FROM public.reserva_consumos WHERE reserva_id = rv.id
          ) cc ON true
          WHERE rv.sabor_chave = r.chave AND rv.status = 'ativa'
        ) res ON true
        LEFT JOIN LATERAL (
          SELECT coalesce(sum(quantidade_liberada), 0)::integer AS total
          FROM public.salgados_autorizacoes a0
          WHERE a0.chave = r.chave AND a0.usada_em IS NULL AND a0.expira_em > now()
        ) a ON true
      )
      SELECT chave, qtd FROM classificacao WHERE NOT coberto
    LOOP
      v_chave_key := md5('b7:solicitacao:' || p_id::text || ':' || v_linha.chave)::uuid;
      SELECT id INTO v_sol_id
      FROM public.salgados_solicitacoes WHERE chave_idempotencia = v_chave_key;
      IF v_sol_id IS NULL THEN
        INSERT INTO public.salgados_solicitacoes (
          tipo, chave, quantidade_solicitada, data_pedido, solicitado_por,
          justificativa, status, chave_idempotencia
        ) VALUES (
          'agendamento_analise', v_linha.chave, v_linha.qtd, v_data, v_uid,
          'Agendamento sem cobertura física confirmada; avaliar fabricação e bloqueios.',
          'pendente', v_chave_key
        ) RETURNING id INTO v_sol_id;
      END IF;
      v_sols := v_sols || v_sol_id;
    END LOOP;

    UPDATE public.salgados_agendamentos_b7
       SET solicitacoes = v_sols, atualizado_em = now()
     WHERE pedido_id = p_id;

    INSERT INTO public.admin_logs (actor, acao, detalhe)
    VALUES (v_uid, 'b7_agendamento_em_analise', jsonb_build_object(
      'pedido_id', p_id, 'data', v_data, 'canal', p_canal,
      'solicitacoes', to_jsonb(v_sols)
    )::text);

    RETURN jsonb_build_object(
      'status', 'analise_necessaria', 'pedido_id', p_id,
      'situacao', 'analise_pendente', 'solicitacoes', to_jsonb(v_sols),
      'mensagem', 'Nenhum pedido, reserva ou cobrança foi criado. Aguardando aprovação.'
    );
  END IF;

  -- Cobertura confirmada: a base cria o pedido e a ÚNICA reserva física.
  -- `agendado_para` vai no INSERT da própria base (0103:996), portanto não há
  -- UPDATE posterior nem qualquer bypass de `pedidos_guard_update`.
  v_res := public.criar_pedido_com_reserva_base(
    p_id, p_canal, v_dados, v_itens
  );

  IF coalesce(v_res->>'status', '') IN ('criado', 'ja_criado') THEN
    INSERT INTO public.salgados_agendamentos_b7 (
      pedido_id, canal, dados, itens, dados_hash, data_solicitada,
      situacao, criado_por
    ) VALUES (
      p_id, coalesce(p_canal, ''), v_dados, v_itens, v_hash, v_data,
      'reserva_fisica_protegida', v_uid
    )
    ON CONFLICT (pedido_id) DO UPDATE SET
      situacao = excluded.situacao,
      atualizado_em = now();

    INSERT INTO public.admin_logs (actor, acao, detalhe)
    VALUES (v_uid, 'b7_agendamento_protegido', jsonb_build_object(
      'pedido_id', p_id, 'data', v_data, 'situacao', 'reserva_fisica_protegida'
    )::text);

    RETURN v_res || jsonb_build_object('agendamento', jsonb_build_object(
      'situacao', 'reserva_fisica_protegida',
      'data', v_data,
      'reserva_protegida', true
    ));
  END IF;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) IS
  $$Wrapper do B7. Feature flag desligada por padrão: delega à base 0095/0103.$$;

REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb)
  TO authenticated;

-- O rename preserva o OID (e o EXECUTE que a 0133 deu a authenticated). A base
-- deve ficar acessível somente ao wrapper SECURITY DEFINER: sem isto o cliente
-- poderia chamar o nome `_base` e driblar a decisão do B7.
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva_base(uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Ativação administrativa (sem grant amplo; papel verificado dentro)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configurar_b7_salgados(p_habilitado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  vvalor boolean := coalesce(p_habilitado, false);
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  UPDATE public.salgados_b7_config
     SET habilitado = vvalor, atualizado_em = now(), atualizado_por = v_ator
   WHERE id;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'b7_config_alterada', jsonb_build_object('habilitado', vvalor)::text);
  RETURN jsonb_build_object('status', 'ok', 'habilitado', vvalor);
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_b7_salgados(boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.configurar_b7_salgados(boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Análise aprovada => compromisso futuro (nunca estoque ou lote fictício)
-- -----------------------------------------------------------------------------
-- A 0129 exige pedido_id não nulo em registrar_compromisso_salgado. No B7 não
-- existe pedido antes da aprovação, então este auxiliar usa a mesma lógica de
-- responsável, bloqueio e idempotência, mas grava pedido_id = NULL. A coluna já
-- é nullable na 0129; nenhuma migration aplicada é alterada.
CREATE OR REPLACE FUNCTION public.registrar_compromisso_futuro_b7(
  p_chave text,
  p_quantidade integer,
  p_data date,
  p_chave_idempotencia uuid,
  p_referencia text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_id uuid;
  v_bloqueado boolean;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_quantidade IS NULL OR p_quantidade < 1
     OR p_data IS NULL OR p_chave_idempotencia IS NULL
     OR NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:compromisso:' || p_chave, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));

  SELECT id INTO v_id FROM public.salgados_compromissos
  WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'compromisso_id', v_id);
  END IF;

  SELECT bool_or(true) INTO v_bloqueado FROM public.salgados_bloqueios
  WHERE chave = p_chave AND ativo AND p_data BETWEEN inicio AND fim;
  IF coalesce(v_bloqueado, false) THEN
    RETURN jsonb_build_object('status', 'bloqueado');
  END IF;

  INSERT INTO public.salgados_compromissos
    (chave, pedido_id, quantidade, data_compromisso, status, chave_idempotencia, criado_por)
  VALUES (p_chave, NULL, p_quantidade, p_data, 'pendente', p_chave_idempotencia, v_ator)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_compromisso_futuro_b7', jsonb_build_object(
    'compromisso_id', v_id, 'chave', p_chave, 'quantidade', p_quantidade,
    'data', p_data, 'referencia', p_referencia
  )::text);

  RETURN jsonb_build_object('status', 'ok', 'compromisso_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_compromisso_futuro_b7(text, integer, date, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_compromisso_aprovado_b7(
  p_pedido_id uuid,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator     uuid := auth.uid();
  v_reg      public.salgados_agendamentos_b7%ROWTYPE;
  v_sol      public.salgados_solicitacoes%ROWTYPE;
  v_res      jsonb;
  v_idem     uuid;
  v_comp_id  uuid;
  v_comps    uuid[] := '{}';
  v_qtd      integer;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_pedido_id IS NULL OR p_chave_idempotencia IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b7:compromisso:' || p_pedido_id::text, 0));
  SELECT * INTO v_reg
  FROM public.salgados_agendamentos_b7 WHERE pedido_id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'registro_inexistente');
  END IF;
  IF v_reg.situacao = 'compromisso_aprovado' THEN
    RETURN jsonb_build_object(
      'status', 'ja_registrado', 'compromissos', to_jsonb(v_reg.compromissos)
    );
  END IF;
  IF v_reg.situacao <> 'analise_pendente' THEN
    RETURN jsonb_build_object('status', 'situacao_invalida', 'situacao', v_reg.situacao);
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_reg.solicitacoes) AS s(id)
    JOIN public.salgados_solicitacoes sol ON sol.id = s.id
    WHERE sol.status = 'pendente'
  ) THEN
    RETURN jsonb_build_object('status', 'analise_ainda_pendente');
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_reg.solicitacoes) AS s(id)
    JOIN public.salgados_solicitacoes sol ON sol.id = s.id
    WHERE sol.status IN ('recusada', 'cancelada')
  ) THEN
    UPDATE public.salgados_agendamentos_b7
       SET situacao = 'recusado', atualizado_em = now()
     WHERE pedido_id = p_pedido_id;
    RETURN jsonb_build_object('status', 'recusado');
  END IF;

  FOR v_sol IN
    SELECT sol.* FROM unnest(v_reg.solicitacoes) AS s(id)
    JOIN public.salgados_solicitacoes sol ON sol.id = s.id
    WHERE sol.status IN ('aprovada', 'parcial')
    ORDER BY sol.chave, sol.id
  LOOP
    v_qtd := coalesce(v_sol.quantidade_conferida, v_sol.quantidade_solicitada);
    IF v_qtd IS NULL OR v_qtd < 1 THEN
      CONTINUE;
    END IF;
    v_idem := md5(
      'b7:compromisso:' || p_pedido_id::text || ':' || v_sol.chave
    )::uuid;
    v_res := public.registrar_compromisso_futuro_b7(
      v_sol.chave, v_qtd, v_reg.data_solicitada, v_idem, p_pedido_id::text
    );
    IF coalesce(v_res->>'status', '') NOT IN ('ok', 'ja_registrado') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'compromisso_nao_registrado',
        DETAIL = COALESCE(v_res::text, '{"status":"compromisso_nulo"}');
    END IF;
    SELECT id INTO v_comp_id
    FROM public.salgados_compromissos WHERE chave_idempotencia = v_idem;
    IF v_comp_id IS NOT NULL THEN
      v_comps := v_comps || v_comp_id;
    END IF;
  END LOOP;

  UPDATE public.salgados_agendamentos_b7
     SET situacao = 'compromisso_aprovado',
         compromissos = v_comps,
         atualizado_em = now()
   WHERE pedido_id = p_pedido_id;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'b7_compromisso_aprovado', jsonb_build_object(
    'pedido_id', p_pedido_id, 'compromissos', to_jsonb(v_comps),
    'idempotencia', p_chave_idempotencia
  )::text);

  RETURN jsonb_build_object(
    'status', 'ok', 'compromissos', to_jsonb(v_comps)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_compromisso_aprovado_b7(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_compromisso_aprovado_b7(uuid, uuid)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Ciclo completo: pedido definitivo -> reserva física -> cancelamento
-- -----------------------------------------------------------------------------
-- A aprovação não cria pedido nem cobrança. O pedido definitivo é criado depois,
-- pelo fluxo autorizado de checkout/PDV/atendente, e apenas vincula os
-- compromissos já aprovados. Nenhum UPDATE de valor/status é feito aqui.
CREATE OR REPLACE FUNCTION public.vincular_pedido_compromisso_b7(
  p_checkout_id uuid,
  p_pedido_id uuid,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_reg public.salgados_agendamentos_b7%ROWTYPE;
  v_comp uuid;
  v_vinculados uuid[] := '{}';
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_checkout_id IS NULL OR p_pedido_id IS NULL OR p_chave_idempotencia IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF NOT EXISTS (SELECT FROM public.pedidos WHERE id = p_pedido_id) THEN
    RETURN jsonb_build_object('status', 'pedido_inexistente');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b7:vincular:' || p_checkout_id::text, 0));
  SELECT * INTO v_reg
  FROM public.salgados_agendamentos_b7 WHERE pedido_id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'registro_inexistente');
  END IF;
  IF v_reg.situacao IN ('pedido_vinculado', 'reserva_convertida') THEN
    RETURN jsonb_build_object(
      'status', 'ja_vinculado', 'pedido_id', v_reg.pedido_definitivo_id,
      'situacao', v_reg.situacao
    );
  END IF;
  IF v_reg.situacao IN ('cancelado', 'recusado') THEN
    RETURN jsonb_build_object('status', 'situacao_invalida', 'situacao', v_reg.situacao);
  END IF;
  IF v_reg.situacao <> 'compromisso_aprovado' THEN
    RETURN jsonb_build_object('status', 'analise_ainda_pendente');
  END IF;

  FOREACH v_comp IN ARRAY v_reg.compromissos LOOP
    UPDATE public.salgados_compromissos
       SET pedido_id = p_pedido_id
     WHERE id = v_comp AND pedido_id IS NULL
       AND status IN ('pendente', 'coberto');
    IF FOUND THEN
      v_vinculados := v_vinculados || v_comp;
    END IF;
  END LOOP;

  UPDATE public.salgados_agendamentos_b7
     SET situacao = 'pedido_vinculado', pedido_definitivo_id = p_pedido_id,
         atualizado_em = now()
   WHERE pedido_id = p_checkout_id;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'b7_pedido_vinculado', jsonb_build_object(
    'checkout_id', p_checkout_id, 'pedido_id', p_pedido_id,
    'compromissos', to_jsonb(v_vinculados),
    'idempotencia', p_chave_idempotencia
  )::text);

  RETURN jsonb_build_object(
    'status', 'ok', 'pedido_id', p_pedido_id,
    'compromissos', to_jsonb(v_vinculados)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_pedido_compromisso_b7(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vincular_pedido_compromisso_b7(uuid, uuid, uuid)
  TO authenticated;

-- A entrada física real chama `cobrir_compromissos_salgados` (0129). Quando o
-- compromisso fica coberto, ele sai de `compromissos_futuros`; a conversão para
-- reserva física usa a RPC canônica FEFO e a chave de idempotência impede
-- reserva duplicada. O saldo não é contado duas vezes.
CREATE OR REPLACE FUNCTION public.converter_compromisso_reserva_b7(
  p_compromisso_id uuid,
  p_pedido_id uuid,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_comp public.salgados_compromissos%ROWTYPE;
  v_res jsonb;
  v_reserva_id uuid;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_compromisso_id IS NULL OR p_pedido_id IS NULL OR p_chave_idempotencia IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b7:converter:' || p_compromisso_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));

  SELECT * INTO v_comp
  FROM public.salgados_compromissos WHERE id = p_compromisso_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'compromisso_inexistente');
  END IF;
  IF v_comp.pedido_id IS DISTINCT FROM p_pedido_id THEN
    RETURN jsonb_build_object('status', 'pedido_divergente');
  END IF;
  IF v_comp.status <> 'coberto' THEN
    RETURN jsonb_build_object('status', 'cobertura_pendente', 'situacao', v_comp.status);
  END IF;

  SELECT id INTO v_reserva_id FROM public.reservas_estoque
  WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'ja_registrado', 'reserva_id', v_reserva_id
    );
  END IF;

  v_res := public.reservar_sabor_estoque(
    v_comp.chave, v_comp.quantidade, p_pedido_id, p_chave_idempotencia,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date
  );
  IF coalesce(v_res->>'status', '') NOT IN ('ok', 'ja_registrado') THEN
    RETURN jsonb_build_object(
      'status', coalesce(v_res->>'status', 'erro'), 'avaliacao', v_res,
      'mensagem', 'Nenhuma reserva física foi criada; disponibilidade revalidada.'
    );
  END IF;

  SELECT id INTO v_reserva_id FROM public.reservas_estoque
  WHERE chave_idempotencia = p_chave_idempotencia;
  UPDATE public.salgados_agendamentos_b7
     SET situacao = 'reserva_convertida',
         reservas = reservas || v_reserva_id,
         atualizado_em = now()
   WHERE pedido_definitivo_id = p_pedido_id;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'b7_compromisso_convertido', jsonb_build_object(
    'compromisso_id', p_compromisso_id, 'reserva_id', v_reserva_id,
    'pedido_id', p_pedido_id, 'idempotencia', p_chave_idempotencia
  )::text);

  RETURN jsonb_build_object(
    'status', 'ok', 'compromisso_id', p_compromisso_id,
    'reserva_id', v_reserva_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.converter_compromisso_reserva_b7(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.converter_compromisso_reserva_b7(uuid, uuid, uuid)
  TO authenticated;

-- Cancelamento do agendamento aprovado: cancela compromissos ainda pendentes,
-- libera reservas já convertidas e preserva todo o histórico de cobertura.
CREATE OR REPLACE FUNCTION public.cancelar_compromisso_b7(
  p_checkout_id uuid,
  p_motivo text,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_reg public.salgados_agendamentos_b7%ROWTYPE;
  v_comp uuid;
  v_reserva_id uuid;
  v_liberados uuid[] := '{}';
  v_res jsonb;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_checkout_id IS NULL OR p_chave_idempotencia IS NULL
     OR length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('b7:cancelar:' || p_checkout_id::text, 0));
  SELECT * INTO v_reg
  FROM public.salgados_agendamentos_b7 WHERE pedido_id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'registro_inexistente');
  END IF;
  IF v_reg.situacao = 'cancelado' THEN
    RETURN jsonb_build_object('status', 'ja_cancelado', 'reservas', to_jsonb(v_reg.reservas));
  END IF;
  IF v_reg.situacao NOT IN ('compromisso_aprovado', 'pedido_vinculado', 'reserva_convertida') THEN
    RETURN jsonb_build_object('status', 'situacao_invalida', 'situacao', v_reg.situacao);
  END IF;

  FOREACH v_reserva_id IN ARRAY v_reg.reservas LOOP
    v_res := public.liberar_reserva_sabor(
      v_reserva_id, p_motivo,
      md5('b7:liberacao:' || v_reserva_id::text)::uuid
    );
    IF coalesce(v_res->>'status', '') = 'ok' THEN
      v_liberados := v_liberados || v_reserva_id;
    END IF;
  END LOOP;

  FOREACH v_comp IN ARRAY v_reg.compromissos LOOP
    UPDATE public.salgados_compromissos
       SET status = 'cancelado', cancelado_em = now()
     WHERE id = v_comp AND status IN ('pendente', 'coberto');
  END LOOP;

  UPDATE public.salgados_agendamentos_b7
     SET situacao = 'cancelado', atualizado_em = now()
   WHERE pedido_id = p_checkout_id;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'b7_agendamento_cancelado', jsonb_build_object(
    'checkout_id', p_checkout_id, 'motivo', left(p_motivo, 200),
    'reservas_liberadas', to_jsonb(v_liberados),
    'idempotencia', p_chave_idempotencia
  )::text);

  RETURN jsonb_build_object(
    'status', 'ok', 'reservas_liberadas', to_jsonb(v_liberados)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_compromisso_b7(uuid, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_compromisso_b7(uuid, text, uuid)
  TO authenticated;

COMMIT;
