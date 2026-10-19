-- ============================================================================
-- PASSO 2 (parte 3/3) — MIGRATIONS 0095..0098
-- Cole esta parte DEPOIS da parte anterior e ANTES da próxima.
-- Conteudo verbatim das migrations homologadas (sem os comentarios de
-- documentacao; a versao anotada esta em 02_MIGRATIONS-CUTOVER.sql).
-- NAO APLIQUE A 0088. A 0094 e 0096 sao ATIVAS.
-- ============================================================================

DROP POLICY IF EXISTS "reserva_consumos leitura staff" ON public.reserva_consumos;
CREATE POLICY "reserva_consumos leitura staff" ON public.reserva_consumos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
  );

REVOKE ALL ON public.reserva_consumos FROM anon, authenticated;
GRANT SELECT ON public.reserva_consumos TO authenticated;
GRANT ALL ON public.reserva_consumos TO service_role;

COMMENT ON TABLE public.reserva_consumos IS
  '0087: ledger append-only de retiradas parciais do freezer (Modelo 2). '
  'NÃO altera produtos.estoque; a baixa ocorre na reserva. Escrita somente '
  'por função SECURITY DEFINER autorizada.';
COMMENT ON COLUMN public.reserva_consumos.idem_key IS
  '0087: chave idempotente única; reenvio com a mesma chave = replay sem duplicar.';
COMMENT ON COLUMN public.reserva_consumos.funcionario_id IS
  '0087: identidade confiável, sempre auth.uid() da função DEFINER (nunca do cliente). '
  'NOT NULL + ON DELETE RESTRICT preservam a rastreabilidade histórica.';
COMMENT ON COLUMN public.reserva_consumos.quantidade IS
  '0087: quantidade retirada (> 0); restante = reservas_estoque.quantidade − Σ consumos.';

CREATE OR REPLACE FUNCTION public.criar_pedido_com_reserva(
  p_id    uuid,
  p_canal text,
  p_dados jsonb,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
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

  PERFORM pg_advisory_xact_lock(hashtext('criar_pedido_com_reserva:' || p_id::text));

  SELECT * INTO v_ped FROM public.pedidos WHERE id = p_id;
  IF FOUND THEN
    IF v_ped.user_id IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object('status', 'pedido_de_outro_usuario');
    END IF;

    SELECT motivo INTO v_motivo_hist
      FROM public.pedido_status_historico
     WHERE pedido_id = p_id AND de_status IS NULL AND para_status = 'recebido'
     ORDER BY created_at ASC, id ASC
     LIMIT 1;
    IF v_motivo_hist IS DISTINCT FROM ('criacao_atomica:' || v_canal) THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'canal');
    END IF;

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

  IF to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'dependencia_ausente',
      'dependencia', 'public.reservar_pedido_atomico(uuid)'
    );
  END IF;

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
    IF v_tipo_imovel = 'apartamento' AND v_apartamento IS NULL THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'apartamento');
    END IF;

    v_taxa := CASE
                WHEN v_taxa_txt IS NOT NULL
                     AND btrim(v_taxa_txt) <> ''
                     AND btrim(v_taxa_txt) ~ '^[0-9]+(\.[0-9]{1,2})?$'
                  THEN round(btrim(v_taxa_txt)::numeric, 2)
                ELSE 6
              END;
  ELSE
    v_endereco := btrim(COALESCE(v_dados->>'endereco', ''));
    IF v_endereco = '' THEN
      v_endereco := COALESCE(v_loja_end, 'Retirada na loja');
    END IF;
    v_bairro := COALESCE(NULLIF(btrim(COALESCE(v_dados->>'bairro', '')), ''), v_loja_bai, '');
    v_cidade := COALESCE(NULLIF(btrim(COALESCE(v_dados->>'cidade', '')), ''), v_loja_cid, '');
    v_taxa := 0;
  END IF;

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
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componentes_em_produto');
    END IF;
  END LOOP;

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

  FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
    v_qtd := (v_elem->>'quantidade')::int;
    v_pid := NULLIF(btrim(v_elem->>'produto_id'), '')::uuid;
    IF v_pid IS NULL THEN
      IF jsonb_typeof(v_elem->'componentes') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_elem->'componentes') = 0 THEN
        RETURN jsonb_build_object(
          'status', 'montagem_sem_modelagem',
          'item', COALESCE(NULLIF(btrim(v_elem->>'nome'), ''), '(sem nome)')
        );
      END IF;
      IF v_qtd < 50 OR v_qtd % 50 <> 0 THEN
        RETURN jsonb_build_object(
          'status', 'regra_combo',
          'quantidade', v_qtd,
          'minimo', 50,
          'passo', 50
        );
      END IF;

      v_comp_soma := 0;
      v_comp_n    := 0;
      v_comp_cat  := NULL;
      v_comp_ids  := '{}';
      FOR v_comp IN SELECT c.valor FROM jsonb_array_elements(v_elem->'componentes') AS c(valor) LOOP
        v_comp_pid := (v_comp->>'produto_id')::uuid;
        v_comp_qtd := (v_comp->>'quantidade')::int;

        IF v_comp_pid = ANY(v_comp_ids) THEN
          RETURN jsonb_build_object(
            'status', 'montagem_componente_duplicado',
            'produto_id', v_comp_pid
          );
        END IF;
        v_comp_ids := array_append(v_comp_ids, v_comp_pid);

        SELECT p.nome, p.disponivel, p.categoria_id
          INTO v_prod
          FROM public.produtos p
         WHERE p.id = v_comp_pid;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('status', 'produto_inexistente', 'produto_id', v_comp_pid);
        END IF;
        IF NOT v_prod.disponivel THEN
          RETURN jsonb_build_object('status', 'produto_indisponivel', 'produto_id', v_comp_pid);
        END IF;
        IF v_comp_cat IS NULL THEN
          v_comp_cat := v_prod.categoria_id;
        ELSIF v_comp_cat IS DISTINCT FROM v_prod.categoria_id THEN
          RETURN jsonb_build_object(
            'status', 'montagem_categoria_divergente',
            'produto_id', v_comp_pid
          );
        END IF;

        v_comp_soma := v_comp_soma + v_comp_qtd;
        v_comp_n    := v_comp_n + 1;
      END LOOP;

      IF v_comp_n = 0 OR v_comp_soma <> v_qtd THEN
        RETURN jsonb_build_object(
          'status', 'montagem_soma_divergente',
          'quantidade', v_qtd,
          'componentes', v_comp_soma
        );
      END IF;

      SELECT c.nome, c.combo_preco_unit
        INTO v_cat
        FROM public.categorias c
       WHERE c.id = v_comp_cat;
      IF NOT FOUND OR v_cat.combo_preco_unit IS NULL THEN
        RETURN jsonb_build_object(
          'status', 'montagem_preco_ausente',
          'categoria_id', v_comp_cat
        );
      END IF;

      v_preco := v_cat.combo_preco_unit;
      v_subtotal := v_subtotal + (v_preco * v_qtd);
      v_linhas := v_linhas + 1;
      CONTINUE;
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

  IF v_canal IN ('pdv', 'atendente')
     AND (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'atendente'::public.app_role))
     AND jsonb_typeof(v_dados->'desconto_manual') = 'number'
     AND (v_dados->>'desconto_manual')::numeric >= 0 THEN
    v_desc_manual := round((v_dados->>'desconto_manual')::numeric, 2);
  END IF;
  v_desc := round(GREATEST(0, LEAST(v_desc + v_desc_manual, v_subtotal)), 2);

  v_modalidade := CASE
                    WHEN v_tipo_entrega = 'entrega' AND v_forma = 'dinheiro'
                      THEN 'na_entrega'
                    ELSE 'online'
                  END;

  IF v_canal = 'pdv' AND v_forma <> 'pix'
     AND jsonb_typeof(v_dados->'pagamento_imediato') = 'boolean' THEN
    IF (v_dados->>'pagamento_imediato')::boolean THEN
      v_pag_status := 'pago';
      v_pag_em := now();
    END IF;
  END IF;

  v_total := round(GREATEST(v_subtotal + v_taxa - v_desc, 0), 2);

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
      tipo_evento, campanha_origem
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
      v_tipo_evento, v_campanha
    )
    RETURNING numero INTO v_numero;

    FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
      v_qtd := (v_elem->>'quantidade')::int;
      v_pid := NULLIF(btrim(v_elem->>'produto_id'), '')::uuid;

      IF v_pid IS NULL THEN
        SELECT c.nome, c.combo_preco_unit
          INTO v_cat
          FROM public.categorias c
         WHERE c.id = (
           SELECT p.categoria_id
             FROM public.produtos p
            WHERE p.id = ((v_elem->'componentes'->0)->>'produto_id')::uuid
         );
        IF NOT FOUND OR v_cat.combo_preco_unit IS NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0095',
            MESSAGE = 'montagem_preco_ausente',
            DETAIL  = '{"status":"montagem_preco_ausente"}';
        END IF;

        v_preco := v_cat.combo_preco_unit;
        v_obs_item := btrim(COALESCE(v_elem->>'observacao', ''));
        v_nome_item := COALESCE(
          NULLIF(btrim(v_elem->>'nome'), ''),
          'Combo ' || v_cat.nome || ' ' || v_qtd::text || 'un'
        );
        IF v_obs_item <> '' THEN
          v_nome_item := v_nome_item || ' (obs: ' || v_obs_item || ')';
        END IF;
        v_nome_item := left(v_nome_item, 200);

        INSERT INTO public.pedido_itens (
          pedido_id, produto_id, nome, preco_unitario, quantidade
        ) VALUES (
          p_id, NULL, v_nome_item, v_preco, v_qtd
        )
        RETURNING id INTO v_item_id;

        FOR v_comp IN SELECT c.valor FROM jsonb_array_elements(v_elem->'componentes') AS c(valor) LOOP
          INSERT INTO public.pedido_item_componentes (
            pedido_item_id, produto_id, quantidade
          ) VALUES (
            v_item_id,
            (v_comp->>'produto_id')::uuid,
            (v_comp->>'quantidade')::int
          );
        END LOOP;
        CONTINUE;
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

    v_res := public.reservar_pedido_atomico(p_id);
    IF v_res IS NULL
       OR COALESCE(v_res->>'status', '') NOT IN ('reservado', 'ja_reservado') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0095',
        MESSAGE = 'reserva_nao_confirmada',
        DETAIL  = COALESCE(v_res::text, '{"status":"reserva_nula"}');
    END IF;

    INSERT INTO public.pedido_status_historico (
      pedido_id, de_status, para_status, actor, motivo
    ) VALUES (
      p_id, NULL, 'recebido', v_uid, 'criacao_atomica:' || v_canal
    );

  EXCEPTION
    WHEN SQLSTATE 'P0095' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
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
    'reserva', v_res
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'erro_interno', 'sqlstate', SQLSTATE);
END;
$$;

COMMENT ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) IS
$$Criacao atomica de pedido + itens + reserva (checkout/pdv/atendente).
- Autorizacao no banco: auth.uid(); pdv/atendente exigem admin|atendente.
- user_id = auth.uid() (no PDV/atendimento e o operador, nao o cliente final;
  o cliente real fica em cliente_nome/telefone e o operador no historico.actor).
- Valores financeiros recalculados no servidor: preco do catalogo
  (COALESCE(preco_promocional, preco)), cupom revalidado, taxa de entrega lida de
  loja_config.taxa_entrega (via to_jsonb; ausente => default server-side R$ 6),
  desconto manual (somente pdv/atendente com papel admin|atendente).
- Atomicidade: pedido+itens+reservar_pedido_atomico+historico no mesmo bloco;
  falha da reserva => RAISE P0095 => rollback integral do bloco.
- Idempotencia: advisory lock por id + historico 'criacao_atomica:<canal>' +
  conferencia de autorizacao, itens, dados e cobertura (leitura pura).
- Montagem (produto_id NULL) falha fechado (montagem_sem_modelagem): nao ha
  composicao/preco confiavel no banco.
- Nao escreve direto em reservas_estoque e nao usa DELETE como compensacao.$$;

REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pedido_cobertura_reserva(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.pedido_cobertura_reserva(uuid) IS
$$Leitura pura da cobertura de reserva de um pedido.
- Confere quantidade por produto (ativa+consumida) x itens reservaveis.
- Exige debito comprovado em estoque_movimentacoes por reserva.
- Bloqueia se houver reserva liberada/cancelada em pedido ativo, excesso,
  debito ausente ou proveniencia ausente (quando controlado=true).
- Montagem pura retorna 'montagem' (nao reservavel; nao declara cobertura).
- Autorizacao: dono ou staff (admin/atendente/producao); auth.uid() NULL =
  contexto interno (trigger/migration).$$;

REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pedido_cobertura_reserva(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.exigir_reserva_producao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_controlado boolean := false;
  v_cob        jsonb;
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

  v_cob := public.pedido_cobertura_reserva(NEW.id);
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
$$;

COMMENT ON FUNCTION public.exigir_reserva_producao() IS
$$Trigger (NAO INSTALADO) que bloqueia a saida de 'recebido' para status
operacionais quando controlado=true e pedido_cobertura_reserva nao retorna
'exatamente coberto'. 'montagem' NAO libera: item sem produto/composicao nao
tem cobertura integral comprovada. Cobre transicoes alternativas (ex.: admin indo direto
para 'pronto') porque olha qualquer saida de 'recebido', exceto 'cancelado'.
Nao instalar antes da reconciliacao dos pedidos historicos em 'recebido'.$$;

REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.exigir_consumo_producao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
       AND r.status = 'ativa'
       AND NOT EXISTS (SELECT 1 FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id)
  ) THEN
    RAISE EXCEPTION
      'Pedido % possui reserva sem retirada fisica registrada', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.exigir_consumo_producao() IS
$$Trigger (NAO INSTALADO) que bloqueia a saida de 'recebido' para producao quando
controlado=true e alguma reserva ativa nao tem retirada fisica registrada em
reserva_consumos (0087). NAO instalar antes do cutover coordenado.$$;

REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC;

DROP POLICY IF EXISTS "parceiros read" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;

DROP POLICY IF EXISTS "parceiros admin read" ON public.parceiros;
CREATE POLICY "parceiros admin read" ON public.parceiros
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "parceiros candidatura" ON public.parceiros;
CREATE POLICY "parceiros candidatura" ON public.parceiros
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'nova'
    AND length(nome) BETWEEN 1 AND 200
    AND coalesce(length(proposta), 0) <= 2000
    AND coalesce(length(descricao), 0) <= 2000
  );

DROP POLICY IF EXISTS "parceiros admin write" ON public.parceiros;
CREATE POLICY "parceiros admin write" ON public.parceiros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.parceiros FROM anon;
GRANT INSERT ON public.parceiros TO anon, authenticated;
GRANT SELECT ON public.parceiros_publicos TO anon, authenticated;

COMMENT ON POLICY "parceiros admin read" ON public.parceiros IS
  '0096: leitura direta somente admin; publico usa a view parceiros_publicos.';
COMMENT ON POLICY "parceiros candidatura" ON public.parceiros IS
  '0096: candidatura publica somente status=nova e textos limitados.';
COMMENT ON POLICY "parceiros admin write" ON public.parceiros IS
  '0096: update/delete/insert administrativo somente admin.';

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS combo_preco_unit numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'categorias_combo_preco_unit_check'
       AND conrelid = 'public.categorias'::regclass
  ) THEN
    ALTER TABLE public.categorias
      ADD CONSTRAINT categorias_combo_preco_unit_check
      CHECK (combo_preco_unit IS NULL OR combo_preco_unit >= 0);
  END IF;
END;
$$;

UPDATE public.categorias
   SET combo_preco_unit = CASE slug
         WHEN 'mini-fritos'      THEN 1.60
         WHEN 'mini-assados'     THEN 2.30
         WHEN 'mini-pasteis'     THEN 2.30
         WHEN 'mini-pizzas'      THEN 3.70
         WHEN 'mini-empadinhas'  THEN 2.40
       END
 WHERE slug IN ('mini-fritos', 'mini-assados', 'mini-pasteis', 'mini-pizzas', 'mini-empadinhas')
   AND combo_preco_unit IS NULL;

CREATE TABLE IF NOT EXISTS public.pedido_item_componentes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id uuid NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  produto_id     uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade     integer NOT NULL CHECK (quantidade > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_item_componentes_item_produto_key UNIQUE (pedido_item_id, produto_id)
);

CREATE INDEX IF NOT EXISTS pedido_item_componentes_item_idx
  ON public.pedido_item_componentes (pedido_item_id);

CREATE INDEX IF NOT EXISTS pedido_item_componentes_produto_idx
  ON public.pedido_item_componentes (produto_id);

ALTER TABLE public.pedido_item_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_item_componentes_select ON public.pedido_item_componentes;
CREATE POLICY pedido_item_componentes_select
  ON public.pedido_item_componentes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.pedido_itens i
        JOIN public.pedidos p ON p.id = i.pedido_id
       WHERE i.id = pedido_item_id
         AND (
           p.user_id = auth.uid()
           OR p.motoboy_id = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'atendente'::public.app_role)
           OR public.has_role(auth.uid(), 'producao'::public.app_role)
         )
    )
  );

REVOKE ALL ON TABLE public.pedido_item_componentes FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM anon;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM authenticated;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM service_role;
GRANT SELECT ON TABLE public.pedido_item_componentes TO authenticated;

COMMENT ON TABLE public.pedido_item_componentes IS
$$Composicao estruturada de um item de combo (montagem). Cada linha e um
produto/quantidade escolhido; a soma deve ser igual a pedido_itens.quantidade.
Escrita apenas pelas funcoes atomicas SECURITY DEFINER (0095).$$;

COMMENT ON COLUMN public.categorias.combo_preco_unit IS
$$Preco unitario autoritativo do combo para esta categoria. A 0095 recalcula o
subtotal do combo com este valor e falha fechada se estiver NULL.$$;

REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_atomico(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM service_role;

REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atomico(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pedido_cobertura_reserva(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM anon;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM authenticated;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM service_role;

REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM anon;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM authenticated;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM service_role;

REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM anon;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM authenticated;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM service_role;

REVOKE ALL ON TABLE public.reserva_consumos FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_consumos FROM anon;
REVOKE ALL ON TABLE public.reserva_consumos FROM authenticated;
REVOKE ALL ON TABLE public.reserva_consumos FROM service_role;
GRANT SELECT ON TABLE public.reserva_consumos TO authenticated;

REVOKE ALL ON TABLE public.reserva_proveniencia FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM anon;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM authenticated;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM service_role;
GRANT SELECT ON TABLE public.reserva_proveniencia TO authenticated;

REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM anon;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM authenticated;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM service_role;
GRANT SELECT ON TABLE public.reserva_proveniencia_config TO authenticated;

REVOKE ALL ON TABLE public.pedido_item_componentes FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM anon;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM service_role;
GRANT SELECT ON TABLE public.pedido_item_componentes TO authenticated;

REVOKE ALL ON TABLE public.reservas_estoque FROM PUBLIC;
REVOKE ALL ON TABLE public.reservas_estoque FROM anon;
REVOKE ALL ON TABLE public.reservas_estoque FROM service_role;

REVOKE ALL ON TABLE public.estoque_movimentacoes FROM PUBLIC;
REVOKE ALL ON TABLE public.estoque_movimentacoes FROM anon;
REVOKE ALL ON TABLE public.estoque_movimentacoes FROM service_role;
