-- ============================================================================
-- 0103 — ENTREGA POR KM (taxa configurável + endereço preciso)
-- ============================================================================
-- Aditivo, não destrutivo. Cria:
--   * config_entrega   (config comercial única, 1 linha, id = true)
--   * colunas novas em pedidos (snapshot da tarifa no pedido)
--   * colunas novas em enderecos (cidade/uf/cep/lat/lng/place_id/precisao)
--   * distancia_linha_reta_km (haversine, validação server-side)
--   * calcular_taxa_entrega (pré-cálculo para o checkout)
--   * criar_pedido_com_reserva (CREATE OR REPLACE): passa a calcular a taxa
--     no SERVIDOR a partir de config_entrega (valor por km, mínima, máxima,
--     grátis acima de X, aceitar entregas), valida a distância enviada
--     contra a linha reta origem->destino, grava snapshot no pedido e
--     permite ajuste manual AUDITADO somente para staff autorizado.
-- O cliente NUNCA define a taxa: o servidor recalcula/valida tudo.
-- Sem origem configurada (lat/lng nulos), cai no regime legado
-- (loja_config.taxa_entrega ou R$ 6) — nunca inventa coordenadas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELA DE CONFIGURAÇÃO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config_entrega (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  aceitar_entregas boolean NOT NULL DEFAULT true,
  valor_por_km numeric(6,2) NOT NULL DEFAULT 1.50,
  taxa_minima_ativa boolean NOT NULL DEFAULT false,
  taxa_minima numeric(6,2) NOT NULL DEFAULT 0,
  distancia_max_ativa boolean NOT NULL DEFAULT false,
  distancia_max_km numeric(6,2) NOT NULL DEFAULT 0,
  gratis_ativa boolean NOT NULL DEFAULT false,
  gratis_acima numeric(8,2) NOT NULL DEFAULT 0,
  ajuste_manual boolean NOT NULL DEFAULT true,
  origem_nome text NOT NULL DEFAULT '',
  origem_logradouro text NOT NULL DEFAULT '',
  origem_numero text NOT NULL DEFAULT '',
  origem_complemento text NOT NULL DEFAULT '',
  origem_bairro text NOT NULL DEFAULT '',
  origem_cidade text NOT NULL DEFAULT '',
  origem_uf text NOT NULL DEFAULT '',
  origem_cep text NOT NULL DEFAULT '',
  origem_lat double precision,
  origem_lng double precision,
  origem_place_id text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

ALTER TABLE public.config_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_entrega select publico" ON public.config_entrega;
CREATE POLICY "config_entrega select publico" ON public.config_entrega
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "config_entrega admin write" ON public.config_entrega;
CREATE POLICY "config_entrega admin write" ON public.config_entrega
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- linha única (idempotente)
INSERT INTO public.config_entrega (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ACL mínima (padrão 0098): leitura pública (checkout), escrita admin via RLS.
GRANT SELECT ON public.config_entrega TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.config_entrega TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. COLUNAS NOVAS EM PEDIDOS (snapshot da entrega no pedido confirmado)
-- ----------------------------------------------------------------------------
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS distancia_km numeric(8,2);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS valor_por_km_aplicado numeric(6,2);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_snapshot jsonb;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_ajuste jsonb;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS endereco_estado text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS endereco_place_id text;

-- ----------------------------------------------------------------------------
-- 3. COLUNAS NOVAS EM ENDEREÇOS SALVOS (cliente; RLS own já existente)
-- ----------------------------------------------------------------------------
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS place_id text;
ALTER TABLE public.enderecos ADD COLUMN IF NOT EXISTS precisao text;

-- ----------------------------------------------------------------------------
-- 4. DISTÂNCIA EM LINHA RETA (validação server-side; nunca inventa)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distancia_linha_reta_km(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
)
RETURNS numeric(8,2)
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT round(
    (6371.0088 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )))::numeric, 2)
$$;

-- ----------------------------------------------------------------------------
-- 5. PRÉ-CÁLCULO DA TAXA (usado pelo checkout antes de confirmar)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_taxa_entrega(
  p_destino_lat double precision,
  p_destino_lng double precision,
  p_distancia_km numeric DEFAULT NULL,
  p_subtotal numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg    public.config_entrega%ROWTYPE;
  v_linha  numeric(8,2);
  v_km     numeric(8,2);
  v_taxa   numeric(10,2);
  v_fonte  text;
  v_gratis boolean := false;
  v_sub    numeric(10,2);
BEGIN
  SELECT * INTO v_cfg FROM public.config_entrega WHERE id = true;

  -- Sem config/origem: regime legado (frontend exibe taxa fixa atual).
  IF v_cfg.id IS NULL
     OR v_cfg.origem_lat IS NULL OR v_cfg.origem_lng IS NULL THEN
    RETURN jsonb_build_object('modo', 'legado', 'motivo', 'origem_nao_configurada');
  END IF;

  IF NOT v_cfg.aceitar_entregas THEN
    RETURN jsonb_build_object('modo', 'config', 'aceitar_entregas', false);
  END IF;

  IF p_destino_lat IS NULL OR p_destino_lng IS NULL THEN
    RETURN jsonb_build_object('modo', 'config', 'erro', 'destino_ausente');
  END IF;
  IF p_destino_lat NOT BETWEEN -90 AND 90 OR p_destino_lng NOT BETWEEN -180 AND 180 THEN
    RETURN jsonb_build_object('modo', 'config', 'erro', 'destino_invalido');
  END IF;

  v_linha := round(public.distancia_linha_reta_km(
    v_cfg.origem_lat, v_cfg.origem_lng, p_destino_lat, p_destino_lng), 2);

  v_km := NULL;
  IF p_distancia_km IS NOT NULL AND p_distancia_km > 0 AND p_distancia_km <= 500 THEN
    v_km := round(p_distancia_km, 2);
  END IF;
  -- Validação anti-fraude: a rota não pode ser menor que a linha reta
  -- (tolerância 10%) nem absurdamente maior (3x).
  IF v_km IS NULL OR v_km < v_linha * 0.9 OR v_km > v_linha * 3 THEN
    v_km := v_linha;
    v_fonte := 'linha_reta';
  ELSE
    v_fonte := 'rota';
  END IF;

  IF v_cfg.distancia_max_ativa AND v_cfg.distancia_max_km > 0
     AND v_km > v_cfg.distancia_max_km THEN
    RETURN jsonb_build_object('modo', 'config', 'fora_da_area', true,
      'distancia_km', v_km, 'maximo_km', v_cfg.distancia_max_km);
  END IF;

  v_sub := NULL;
  IF p_subtotal IS NOT NULL AND p_subtotal >= 0 THEN
    v_sub := round(p_subtotal, 2);
  END IF;

  v_taxa := round(v_km * v_cfg.valor_por_km, 2);
  IF v_cfg.taxa_minima_ativa AND v_cfg.taxa_minima > 0 THEN
    v_taxa := GREATEST(v_taxa, round(v_cfg.taxa_minima, 2));
  END IF;
  IF v_cfg.gratis_ativa AND v_cfg.gratis_acima > 0 AND v_taxa > 0
     AND v_sub IS NOT NULL AND v_sub >= round(v_cfg.gratis_acima, 2) THEN
    v_gratis := true;
    v_taxa := 0;
  END IF;

  RETURN jsonb_build_object(
    'modo', 'config',
    'aceitar_entregas', true,
    'taxa', v_taxa,
    'distancia_km', v_km,
    'valor_por_km', round(v_cfg.valor_por_km, 2),
    'fonte', v_fonte,
    'entrega_gratis', v_gratis
  );
END; $$;

REVOKE ALL ON FUNCTION public.calcular_taxa_entrega(double precision, double precision, numeric, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_taxa_entrega(double precision, double precision, numeric, numeric)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. CRIAÇÃO ATÔMICA (0095) — estendida com taxa por km e snapshot
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_pedido_com_reserva(p_id uuid, p_canal text, p_dados jsonb, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
$function$;
