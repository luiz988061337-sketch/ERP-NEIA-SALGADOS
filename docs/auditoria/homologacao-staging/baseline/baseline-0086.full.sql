--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4
-- Dumped by pg_dump version 16.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'producao',
    'motoboy',
    'cliente',
    'atendente',
    'financeiro',
    'contador'
);


--
-- Name: atraso_motivo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.atraso_motivo AS ENUM (
    'transito',
    'chuva',
    'veiculo',
    'endereco',
    'cliente_ausente',
    'espera',
    'acidente_bloqueio',
    'outro'
);


--
-- Name: TYPE atraso_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.atraso_motivo IS 'Motivos padronizados de atraso de entrega';


--
-- Name: motoboy_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.motoboy_status AS ENUM (
    'disponivel_base',
    'preparando_saida',
    'em_rota',
    'retornando_base',
    'aguardando_nova_rota',
    'offline'
);


--
-- Name: TYPE motoboy_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.motoboy_status IS 'disponivel_base, preparando_saida, em_rota, retornando_base, aguardando_nova_rota, offline';


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'recebido',
    'em_producao',
    'pronto',
    'aguardando_motoboy',
    'em_rota',
    'entregue',
    'cancelado'
);


--
-- Name: pagamento; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pagamento AS ENUM (
    'pix',
    'dinheiro',
    'credito',
    'debito'
);


--
-- Name: prod_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.prod_status AS ENUM (
    'aguardando',
    'produzindo',
    'finalizado'
);


--
-- Name: tipo_mov_estoque; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_mov_estoque AS ENUM (
    'entrada_producao',
    'entrada_manual',
    'venda',
    'reserva',
    'liberacao',
    'cancelamento',
    'perda',
    'vencimento',
    'ajuste',
    'devolucao',
    'degustacao'
);


--
-- Name: tipo_venda; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tipo_venda AS ENUM (
    'combo_50',
    'unidade'
);


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;


--
-- Name: aceitar_entrega_motoboy(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.order_status;
  v_dono uuid;
  v_aceite timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'motoboy') OR public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel de motoboy'::text; RETURN;
  END IF;
  SELECT p.status, p.motoboy_id, p.aceito_motoboy_em INTO v_status, v_dono, v_aceite
    FROM public.pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  IF v_status <> 'aguardando_motoboy' THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'fora de Aguardando Motoboy'::text; RETURN;
  END IF;
  -- Só o próprio motoboy atribuído (admin só opera via atribuição E4).
  IF v_dono IS NULL OR (v_dono <> v_uid AND NOT public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'pedido de outro motoboy'::text; RETURN;
  END IF;
  IF v_aceite IS NOT NULL THEN
    RETURN QUERY SELECT 'conflito'::text, 'aceite duplicado'::text; RETURN;
  END IF;
  UPDATE public.pedidos SET aceito_motoboy_em = now(), aceito_motoboy_por = v_uid
    WHERE id = p_pedido_id AND aceito_motoboy_em IS NULL AND status = 'aguardando_motoboy';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'condicao de corrida'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, 'aceite do motoboy registrado'::text;
END $$;


--
-- Name: FUNCTION aceitar_entrega_motoboy(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid) IS 'E5: aceite explícito do motoboy. Não altera status/pagamento; não é saída nem entrega.';


--
-- Name: aceitar_pedido_atendente(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.order_status;
  v_aceito timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'atendente') OR public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel de atendente'::text; RETURN;
  END IF;
  -- Trava a linha: serializa dois aceites concorrentes do mesmo pedido.
  SELECT p.status, p.aceito_em_atendente INTO v_status, v_aceito
    FROM public.pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  IF v_status <> 'recebido' THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'fora de Novos'::text; RETURN;
  END IF;
  IF v_aceito IS NOT NULL THEN
    RETURN QUERY SELECT 'conflito'::text, 'aceite duplicado'::text; RETURN;
  END IF;
  -- Congelado por construção: só estas 2 colunas; status, pagamento_status,
  -- prometido/agendado, valores e motoboy_id jamais são tocados aqui.
  UPDATE public.pedidos
    SET aceito_em_atendente = now(), aceito_por = v_uid
    WHERE id = p_pedido_id AND aceito_em_atendente IS NULL AND status = 'recebido';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'condicao de corrida'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, 'aceite registrado'::text;
END $$;


--
-- Name: FUNCTION aceitar_pedido_atendente(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid) IS 'E2: aceite atômico da atendente. Não altera status, pagamento_status, prometido, valores ou motoboy_id. Não libera agendados.';


--
-- Name: adiar_cupom_agendado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adiar_cupom_agendado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_agendado timestamptz;
BEGIN
  IF NEW.tipo <> 'pedido' OR NEW.pedido_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT p.agendado_para INTO v_agendado FROM public.pedidos p WHERE p.id = NEW.pedido_id;
  IF v_agendado IS NOT NULL AND v_agendado > now() AND NEW.imprimir_apos IS NULL THEN
    NEW.imprimir_apos := v_agendado - interval '30 minutes';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: FUNCTION adiar_cupom_agendado(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.adiar_cupom_agendado() IS 'E7: adia cupom de agendado via imprimir_apos. Sem bloqueio, sem duplicata.';


--
-- Name: atribuir_pedido_motoboy(uuid, uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean DEFAULT false, p_exigir_conferencia boolean DEFAULT false) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.order_status;
  v_tipo text;
  v_dono uuid;
  v_conferido timestamptz;
  v_muser uuid;
  v_mstatus text;
  v_rota uuid;
  v_nrotas integer;
  v_nparadas integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'producao')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel operacional'::text; RETURN;
  END IF;
  -- Trava o pedido primeiro (ordem fixa pedido→motoboy→rota: sem deadlock).
  SELECT p.status, p.tipo_entrega, p.motoboy_id, p.conferido_em
    INTO v_status, v_tipo, v_dono, v_conferido
    FROM public.pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  IF v_tipo <> 'entrega' THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'retirada sem motoboy'::text; RETURN;
  END IF;
  IF v_status <> 'pronto' THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'fora de Prontos'::text; RETURN;
  END IF;
  IF p_exigir_conferencia AND v_conferido IS NULL THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'conferencia ausente'::text; RETURN;
  END IF;
  IF v_dono IS NOT NULL THEN
    RETURN QUERY SELECT 'conflito'::text, 'atribuicao duplicada'::text; RETURN;
  END IF;
  -- Motoboy pelo id canônico de rota; vínculo obrigatório.
  SELECT m.user_id, m.status::text INTO v_muser, v_mstatus
    FROM public.motoboys m WHERE m.id = p_motoboy_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'motoboy nao encontrado'::text; RETURN;
  END IF;
  IF v_muser IS NULL THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'motoboy sem vinculo'::text; RETURN;
  END IF;
  IF v_mstatus <> 'disponivel_base' THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'motoboy indisponivel'::text; RETURN;
  END IF;
  -- Pedido já em rota ativa? (qualquer rota não concluída/cancelada).
  IF EXISTS (
    SELECT 1 FROM public.rota_pedidos rp
    JOIN public.rotas_entrega r ON r.id = rp.rota_id
    WHERE rp.pedido_id = p_pedido_id AND r.status IN ('preparando', 'em_rota')
  ) THEN
    RETURN QUERY SELECT 'conflito'::text, 'pedido em rota ativa'::text; RETURN;
  END IF;
  -- Rota aberta do motoboy ou nova; limite com exceção auditada.
  -- E10.0.1: duplicatas legadas não são escolhidas no escuro — contam e
  -- conflitam explicitamente (sanear antes de aplicar, queries §13).
  SELECT count(*) INTO v_nrotas FROM public.rotas_entrega r
    WHERE r.motoboy_id = p_motoboy_id AND r.status = 'preparando';
  IF v_nrotas > 1 THEN
    RETURN QUERY SELECT 'conflito'::text, 'rotas duplicadas — sanear'::text; RETURN;
  END IF;
  SELECT r.id INTO v_rota FROM public.rotas_entrega r
    WHERE r.motoboy_id = p_motoboy_id AND r.status = 'preparando'
    ORDER BY r.created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.rotas_entrega (motoboy_id, status)
      VALUES (p_motoboy_id, 'preparando') RETURNING id INTO v_rota;
  END IF;
  SELECT count(*) INTO v_nparadas FROM public.rota_pedidos WHERE rota_id = v_rota;
  IF v_nparadas >= 3 AND NOT COALESCE(p_autorizar_extra, false) THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'rota acima do limite'::text; RETURN;
  END IF;
  INSERT INTO public.rota_pedidos (rota_id, pedido_id, ordem)
    VALUES (v_rota, p_pedido_id, v_nparadas + 1)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'parada duplicada'::text; RETURN;
  END IF;
  -- Compatível com o fluxo atual: mesmos 4 campos da central/motoboy.
  UPDATE public.pedidos
    SET motoboy_id = v_muser, aceito_em = now(), status = 'aguardando_motoboy',
        reserva_motoboy_em = now()
    WHERE id = p_pedido_id AND motoboy_id IS NULL AND status = 'pronto';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'condicao de corrida'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, 'atribuicao registrada'::text;
END $$;


--
-- Name: FUNCTION atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean) IS 'E4: reserva/atribuição/rota em transação única. Sem auto-atribuição; promessa preservada. E5: aceito_em aqui é compat legada; aceite explícito vive em aceitar_entrega_motoboy.';


--
-- Name: calcular_tempo_fritura(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base_seg integer;
  v_base_qtd integer;
BEGIN
  SELECT COALESCE(tempo_fritura_s, tempo_fritura_base_segundos, 210),
         COALESCE(unidade_base_tempo_fritura, 50)
  INTO v_base_seg, v_base_qtd
  FROM public.produtos
  WHERE id = p_produto_id;

  IF NOT FOUND OR v_base_seg IS NULL OR v_base_seg <= 0
     OR v_base_qtd IS NULL OR v_base_qtd <= 0 THEN
    RETURN 210; -- default 3:30 (igual a SEGUNDOS_POR_50_PADRAO)
  END IF;

  -- Blocos: 1un..50un = 1 lote; 51un..100un = 2 lotes (igual a tempoFritura()).
  RETURN GREATEST(1, CEIL(GREATEST(0, p_quantidade)::numeric / v_base_qtd)) * v_base_seg;
END;
$$;


--
-- Name: FUNCTION calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer) IS '0052: blocos (teto), espelha src/lib/cozinha.ts tempoFritura().';


--
-- Name: conferir_pedido_cozinha(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean DEFAULT false, p_obs text DEFAULT NULL::text) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.order_status;
  v_conferido timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'producao') OR public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel de cozinha'::text; RETURN;
  END IF;
  IF NOT COALESCE(p_confirmado, false) THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'confirmacao explicita ausente'::text; RETURN;
  END IF;
  SELECT p.status, p.conferido_em INTO v_status, v_conferido
    FROM public.pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  IF v_status <> 'em_producao' THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'fora de Em preparo'::text; RETURN;
  END IF;
  IF v_conferido IS NOT NULL THEN
    RETURN QUERY SELECT 'conflito'::text, 'conferencia duplicada'::text; RETURN;
  END IF;
  UPDATE public.pedidos
    SET conferido_em = now(), conferido_por = v_uid, conferencia_obs = NULLIF(p_obs, '')
    WHERE id = p_pedido_id AND conferido_em IS NULL AND status = 'em_producao';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'condicao de corrida'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, 'conferencia registrada'::text;
END $$;


--
-- Name: FUNCTION conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text) IS 'E3: conferência final. Não muda status, não entrega, não substitui produtos.';


--
-- Name: congelar_colunas_protegidas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.congelar_colunas_protegidas() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Servidor (API Pix, jobs): trusted, como no guard 0074. Sem isso o
  -- auto-confirm via service_role seria bloqueado ao pagar o pedido.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'financeiro') THEN
    RETURN NEW;
  END IF;
  IF (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status
    OR NEW.pagamento_modalidade IS DISTINCT FROM OLD.pagamento_modalidade
    OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
    OR NEW.desconto IS DISTINCT FROM OLD.desconto
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.cupom IS DISTINCT FROM OLD.cupom
    OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
    OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em
    OR NEW.agendado_para IS DISTINCT FROM OLD.agendado_para
    OR NEW.agendamento_obs IS DISTINCT FROM OLD.agendamento_obs
    OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
    OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: FUNCTION congelar_colunas_protegidas(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.congelar_colunas_protegidas() IS 'E9.1: congela financeiro/promessa/identidade p/ não-admin+financeiro. RPCs isentas via GUC.';


--
-- Name: consumir_insumos_pedido(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consumir_insumos_pedido(p_pedido_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item record;
  v_ficha record;
  v_fi record;
  v_qtd numeric;
  v_saldo numeric;
  v_falta numeric;
  v_lote record;
  v_pega numeric;
  v_n integer := 0;
BEGIN
  -- Autorização interna: RLS das tabelas não basta dentro de DEFINER.
  IF NOT ((auth.jwt() ->> 'role') = 'service_role'
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao')) THEN
    RAISE EXCEPTION 'sem_permissao_consumo';
  END IF;

  IF EXISTS (SELECT 1 FROM public.insumo_movimentacoes
             WHERE tipo = 'consumo' AND referencia = p_pedido_id::text) THEN
    RETURN 'ja consumido';
  END IF;

  FOR v_item IN
    SELECT produto_id, quantidade FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id AND produto_id IS NOT NULL
  LOOP
    SELECT * INTO v_ficha FROM public.fichas_tecnicas WHERE produto_id = v_item.produto_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    FOR v_fi IN
      SELECT fi.quantidade, fi.unidade, fi.insumo_id, i.unidade_base
      FROM public.ficha_itens fi JOIN public.insumos i ON i.id = fi.insumo_id
      WHERE fi.ficha_id = v_ficha.id
    LOOP
      IF COALESCE(v_ficha.por_cento, false) THEN
        v_qtd := v_item.quantidade / 100.0 * v_fi.quantidade;
      ELSE
        v_qtd := v_item.quantidade * v_fi.quantidade;
      END IF;
      v_qtd := public.converter_unidade(v_qtd, v_fi.unidade, v_fi.unidade_base);
      IF v_qtd IS NULL OR v_qtd <= 0 THEN
        CONTINUE;
      END IF;
      v_qtd := v_qtd * (1 + COALESCE(v_ficha.perda_pct, 0) / 100.0);

      -- Soma só lotes válidos (vencidos não entram; vão p/ perda manual).
      SELECT COALESCE(SUM(restante), 0) INTO v_saldo FROM public.insumo_lotes
      WHERE insumo_id = v_fi.insumo_id AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE);
      IF v_saldo < v_qtd THEN
        RAISE EXCEPTION 'estoque_insumo_insuficiente:%', v_fi.insumo_id;
      END IF;

      v_falta := v_qtd;
      FOR v_lote IN
        SELECT id, restante FROM public.insumo_lotes
        WHERE insumo_id = v_fi.insumo_id AND restante > 0
          AND (validade IS NULL OR validade >= CURRENT_DATE)
        ORDER BY validade NULLS LAST, created_at
        FOR UPDATE
      LOOP
        EXIT WHEN v_falta <= 0;
        v_pega := LEAST(v_lote.restante, v_falta);
        UPDATE public.insumo_lotes SET restante = restante - v_pega WHERE id = v_lote.id;
        v_falta := v_falta - v_pega;
      END LOOP;

      SELECT estoque_atual INTO v_saldo FROM public.insumos WHERE id = v_fi.insumo_id FOR UPDATE;
      UPDATE public.insumos
      SET estoque_atual = estoque_atual - v_qtd, updated_at = now()
      WHERE id = v_fi.insumo_id;

      INSERT INTO public.insumo_movimentacoes
        (insumo_id, tipo, quantidade, saldo_antes, saldo_depois, referencia, usuario)
      VALUES
        (v_fi.insumo_id, 'consumo', v_qtd, v_saldo, v_saldo - v_qtd, p_pedido_id::text, auth.uid());

      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (auth.uid(), 'insumos_consumo',
          'pedido ' || p_pedido_id::text || ': ' || v_n::text || ' baixa(s) FEFO');

  RETURN 'consumidos ' || v_n::text || ' itens de insumo';
END;
$$;


--
-- Name: FUNCTION consumir_insumos_pedido(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consumir_insumos_pedido(p_pedido_id uuid) IS 'K: baixa FEFO de insumos ao produzir. Idempotente por pedido; sem ficha não bloqueia; insuficiente aborta.';


--
-- Name: consumir_insumos_pedido_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consumir_insumos_pedido_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.consumir_insumos_pedido(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: contas_fechamento_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contas_fechamento_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_comp text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_comp := COALESCE(to_char(OLD.vencimento, 'YYYY-MM'), to_char(OLD.created_at, 'YYYY-MM'));
  ELSE
    v_comp := COALESCE(to_char(NEW.vencimento, 'YYYY-MM'), to_char(NEW.created_at, 'YYYY-MM'));
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos_mensais WHERE competencia = v_comp AND status = 'fechado') THEN
    RAISE EXCEPTION 'mes_fechado:%', v_comp;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


--
-- Name: converter_unidade(numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.converter_unidade(p_qtd numeric, p_de text, p_para text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_de = p_para THEN
    RETURN p_qtd;
  END IF;
  IF p_de IN ('g','kg') AND p_para IN ('g','kg') THEN
    RETURN p_qtd * CASE p_de WHEN 'kg' THEN 1000 ELSE 1 END
                  / CASE p_para WHEN 'kg' THEN 1000 ELSE 1 END;
  END IF;
  IF p_de IN ('ml','l') AND p_para IN ('ml','l') THEN
    RETURN p_qtd * CASE p_de WHEN 'l' THEN 1000 ELSE 1 END
                  / CASE p_para WHEN 'l' THEN 1000 ELSE 1 END;
  END IF;
  RETURN NULL; -- massa/volume/un não se misturam
END;
$$;


--
-- Name: creditar_pontos_pedido(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.creditar_pontos_pedido(p_pedido_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_ped record; v_cfg record; v_pts integer;
BEGIN
  SELECT id, user_id, total, status INTO v_ped FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND OR v_ped.user_id IS DISTINCT FROM auth.uid() OR v_ped.status = 'cancelado' THEN RETURN 0; END IF;
  SELECT fid_ativo, fid_reais_por_ponto INTO v_cfg FROM public.crm_settings WHERE id = true;
  IF FOUND AND NOT coalesce(v_cfg.fid_ativo, true) THEN RETURN 0; END IF;
  v_pts := floor(coalesce(v_ped.total,0) / greatest(coalesce(v_cfg.fid_reais_por_ponto, 1), 0.01));
  IF v_pts <= 0 THEN RETURN 0; END IF;
  INSERT INTO public.pontos_creditos (pedido_id, user_id, pontos) VALUES (p_pedido_id, v_ped.user_id, v_pts)
  ON CONFLICT (pedido_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM set_config('app.pontos_ok','1', true);
  UPDATE public.profiles SET pontos = pontos + v_pts WHERE id = v_ped.user_id;
  PERFORM set_config('app.pontos_ok','', true);
  RETURN v_pts;
END; $$;


--
-- Name: enfileirar_cupom(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enfileirar_cupom(p_pedido_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_p public.pedidos%ROWTYPE;
  v_modalidade text;
  v_n_itens integer := 0;
  v_total_un integer := 0;
  v_payload text;
  r record;
BEGIN
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- (1.43/D) Pedido CANCELADO não recebe NOVO cupom automático — nem por
  -- confirmação de pagamento (trg_pagamento_confirmado), nem por inserção de
  -- itens (trg_gerar_cupom_apos_itens), nem pelo backfill
  -- gerar_cupons_pedidos_pagos(). Jobs JÁ enfileirados NÃO são removidos aqui
  -- (risco registrado no §6; nunca apagar histórico automaticamente).
  IF v_p.status = 'cancelado' THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = p_pedido_id::text || ':pedido') THEN
    RETURN;
  END IF;

  v_modalidade := COALESCE(v_p.pagamento_modalidade, 'online');

  IF v_modalidade = 'online' AND COALESCE(v_p.pagamento_status, 'pendente') <> 'pago' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_n_itens FROM public.pedido_itens WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN;
  END IF;

  v_total_un := 0;
  v_payload := '--- CUPOM FISCAL ---' || chr(10);
  v_payload := v_payload || 'Pedido #:' || COALESCE(v_p.numero::text, '?') || chr(10);
  v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
  v_payload := v_payload || 'Cliente: ' || COALESCE(v_p.cliente_nome, '-') || chr(10);
  v_payload := v_payload || 'Telefone: ' || COALESCE(v_p.telefone, '-') || chr(10);
  v_payload := v_payload || '----------------------------------------' || chr(10);

  FOR r IN
    SELECT nome, preco_unitario, quantidade
    FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
    ORDER BY nome
  LOOP
    v_total_un := v_total_un + COALESCE(r.quantidade, 0);
    v_payload := v_payload || '(' || COALESCE(r.quantidade, 0)::text || ') ' || COALESCE(r.nome, 'item') || chr(10);
    v_payload := v_payload || 'Preco: R$ ' || to_char(COALESCE(r.preco_unitario, 0), '999G999G990D00') || chr(10);
  END LOOP;

  v_payload := v_payload || '----------------------------------------' || chr(10);
  v_payload := v_payload || 'Total Unidades: ' || v_total_un::text || chr(10);
  v_payload := v_payload || 'Subtotal: R$ ' || to_char(COALESCE(v_p.subtotal, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Taxa de Entrega: R$ ' || to_char(COALESCE(v_p.taxa_entrega, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Total: R$ ' || to_char(COALESCE(v_p.total, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Forma Pagamento: ' || COALESCE(v_p.forma_pagamento::text, '-') || chr(10);

  IF COALESCE(v_p.tipo_entrega, 'entrega') = 'entrega' THEN
    v_payload := v_payload || 'Tipo Entrega: ENTREGA' || chr(10);
    v_payload := v_payload || 'Endereco: ' || COALESCE(v_p.endereco, '') || chr(10);
    v_payload := v_payload || 'Bairro: ' || COALESCE(v_p.bairro, '') || chr(10);
    v_payload := v_payload || 'Cidade: ' || COALESCE(v_p.cidade, '') || chr(10);
    v_payload := v_payload || 'CEP: ' || COALESCE(v_p.cep, '') || chr(10);
  ELSE
    v_payload := v_payload || 'Tipo Entrega: RETIRADA NA LOJA' || chr(10);
  END IF;

  v_payload := v_payload || 'Modalidade: ' || v_modalidade || chr(10);
  v_payload := v_payload || 'Status Pagamento: ' || COALESCE(v_p.pagamento_status, 'pendente') || chr(10);
  v_payload := v_payload || 'Observacoes: ' || COALESCE(v_p.observacoes, '') || chr(10);
  v_payload := v_payload || '--- FIM CUPOM ---';

  INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
  VALUES (p_pedido_id, 'pedido', v_payload, 'Tanca TP-550', p_pedido_id::text || ':pedido', 'pendente', now(), now())
  ON CONFLICT (trabalho_uuid) DO NOTHING;
END;
$_$;


--
-- Name: FUNCTION enfileirar_cupom(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enfileirar_cupom(p_pedido_id uuid) IS 'Fila cupom (0077). 1.43/D: pedido cancelado NÃO gera novo cupom (guard no início). Idempotente por trabalho_uuid. Não remove jobs já enfileirados.';


--
-- Name: enfileirar_evento_cozinha(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tipo text;
  v_num integer;
  v_obs text;
  v_agendado timestamptz;
  v_total integer := 0;
  v_itens text := '';
  r record;
  v_uuid text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'producao') OR public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel de cozinha'::text; RETURN;
  END IF;
  IF p_evento NOT IN ('aceito', 'liberado', 'conferido', 'retirada', 'despacho') THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'evento desconhecido'::text; RETURN;
  END IF;
  IF p_evento <> 'liberado' THEN
    RETURN QUERY SELECT 'ignorado'::text, 'sem impressao automatica'::text; RETURN;
  END IF;
  SELECT p.numero, p.tipo_entrega, p.observacoes, p.agendado_para
    INTO v_num, v_tipo, v_obs, v_agendado
    FROM public.pedidos p WHERE p.id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  FOR r IN SELECT nome, quantidade FROM public.pedido_itens WHERE pedido_id = p_pedido_id ORDER BY nome LOOP
    v_total := v_total + COALESCE(r.quantidade, 0);
    v_itens := v_itens || '(' || COALESCE(r.quantidade, 0)::text || ') ' || COALESCE(r.nome, 'item') || chr(10);
  END LOOP;
  IF v_total = 0 THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'sem itens'::text; RETURN;
  END IF;
  v_uuid := p_pedido_id::text || ':ficha:liberado';
  INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
    VALUES (p_pedido_id, 'ficha_cozinha',
      '--- FICHA COZINHA ---' || chr(10)
      || 'Pedido #:' || COALESCE(v_num::text, '?') || chr(10)
      || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10)
      || 'Tipo: ' || COALESCE(v_tipo, '-') || chr(10)
      || 'Agendado: ' || COALESCE(to_char(v_agendado, 'DD/MM HH24:MI'), '-') || chr(10)
      || '----------------------------------------' || chr(10)
      || v_itens
      || '----------------------------------------' || chr(10)
      || 'Total Unidades: ' || v_total::text || chr(10)
      || 'Obs: ' || COALESCE(v_obs, '') || chr(10)
      || '--- FIM FICHA ---',
      'Tanca TP-550', v_uuid, 'pendente', now(), now())
    ON CONFLICT (trabalho_uuid) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'ficha ja enfileirada'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, 'ficha enfileirada'::text;
END $$;


--
-- Name: FUNCTION enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text) IS 'E6: ficha automática só no liberado. Demais eventos ignorados (sem duplicar).';


--
-- Name: estornar_conta(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estornar_conta(p_conta_id uuid, p_motivo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_c record;
BEGIN
  IF NOT ((auth.jwt() ->> 'role') = 'service_role'
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')) THEN
    RAISE EXCEPTION 'sem_permissao_estorno';
  END IF;
  SELECT * INTO v_c FROM public.contas WHERE id = p_conta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conta_nao_encontrada';
  END IF;
  UPDATE public.contas
  SET status = 'pendente', valor_pago = 0, pago_em = NULL, updated_at = now()
  WHERE id = p_conta_id;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (auth.uid(), 'conta_estornada', substring(p_conta_id::text, 1, 8) || ' motivo: ' || COALESCE(p_motivo, ''));
END;
$$;


--
-- Name: exigir_conferencia_para_pronto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exigir_conferencia_para_pronto() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'pronto' AND OLD.status = 'em_producao'
    AND current_setting('neia.fluxo_novo', true) = '1'
    AND OLD.conferido_em IS NULL AND NEW.conferido_em IS NULL THEN
    RAISE EXCEPTION 'Conferencia obrigatoria antes de pronto';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: FUNCTION exigir_conferencia_para_pronto(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.exigir_conferencia_para_pronto() IS 'E9.2: exige conferência com fluxo novo ligado. Default = legado.';


--
-- Name: gerar_cupons_pedidos_pagos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_cupons_pedidos_pagos() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pid uuid;
  v_count integer := 0;
BEGIN
  FOR v_pid IN
    SELECT id FROM public.pedidos
    WHERE pagamento_status = 'pago'
      AND COALESCE(impresso, false) = false
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = v_pid::text || ':pedido') THEN
      PERFORM public.enfileirar_cupom(v_pid);
      v_count := v_count + 1;
    END IF;
    UPDATE public.pedidos SET impresso = true WHERE id = v_pid;
  END LOOP;
  RETURN 'Gerados ' || v_count::text || ' cupons para pedidos pagos';
END;
$$;


--
-- Name: gerar_msg_apartamento(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_msg_apartamento(p_pedido_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pedido record;
  v_msg text;
BEGIN
  SELECT tipo_imovel, apartamento, bloco, torre, andar, interfone, pode_subir, cliente_nome
  INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id;

  IF NOT FOUND OR v_pedido.tipo_imovel != 'apartamento' THEN
    RETURN NULL;
  END IF;

  v_msg := '🛵 Seu pedido já saiu para entrega!' || E'\n\n';

  IF v_pedido.pode_subir THEN
    v_msg := v_msg || 'Você autorizou que o motoboy suba até o apartamento. ';
  ELSE
    v_msg := v_msg || 'Se possível, pedimos que aguarde o motoboy na portaria no momento da chegada. 😊' || E'\n\n';
    v_msg := v_msg || 'Isso ajuda a agilizar sua entrega e também as próximas entregas da nossa rota.' || E'\n\n';
    v_msg := v_msg || 'Obrigado pela compreensão! ❤️';
  END IF;

  -- Info extra para o motoboy
  v_msg := v_msg || E'\n\n📍 Detalhes do local:';
  IF v_pedido.apartamento IS NOT NULL AND v_pedido.apartamento != '' THEN
    v_msg := v_msg || E'\n• Apartamento: ' || v_pedido.apartamento;
  END IF;
  IF v_pedido.bloco IS NOT NULL AND v_pedido.bloco != '' THEN
    v_msg := v_msg || E'\n• Bloco: ' || v_pedido.bloco;
  END IF;
  IF v_pedido.torre IS NOT NULL AND v_pedido.torre != '' THEN
    v_msg := v_msg || E'\n• Torre: ' || v_pedido.torre;
  END IF;
  IF v_pedido.andar IS NOT NULL AND v_pedido.andar != '' THEN
    v_msg := v_msg || E'\n• Andar: ' || v_pedido.andar;
  END IF;
  IF v_pedido.interfone IS NOT NULL AND v_pedido.interfone != '' THEN
    v_msg := v_msg || E'\n• Interfone: ' || v_pedido.interfone;
  END IF;

  RETURN v_msg;
END;
$$;


--
-- Name: FUNCTION gerar_msg_apartamento(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gerar_msg_apartamento(p_pedido_id uuid) IS '0071: EXECUTE direto revogado (sem chamadores legítimos; auditoria K5.4). Uso futuro exigirá auth interna + grant explícito.';


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, telefone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome',''), COALESCE(NEW.raw_user_meta_data->>'telefone',''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


--
-- Name: impedir_parada_duplicada(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impedir_parada_duplicada() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rota_pedidos rp
    JOIN public.rotas_entrega r ON r.id = rp.rota_id
    WHERE rp.pedido_id = NEW.pedido_id
      AND rp.rota_id IS DISTINCT FROM NEW.rota_id
      AND r.status IN ('preparando', 'em_rota')
  ) THEN
    RAISE EXCEPTION 'Pedido % já está em rota ativa', NEW.pedido_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: FUNCTION impedir_parada_duplicada(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.impedir_parada_duplicada() IS 'E9.1: um pedido, uma rota ativa. Legado deve migrar para a RPC E4.';


--
-- Name: liberar_pedido_cozinha(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer DEFAULT 60) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.order_status;
  v_aceito timestamptz;
  v_liberado timestamptz;
  v_agendado timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'atendente') OR public.has_role(v_uid, 'producao') OR public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel operacional'::text; RETURN;
  END IF;
  SELECT p.status, p.aceito_em_atendente, p.liberado_em, p.agendado_para
    INTO v_status, v_aceito, v_liberado, v_agendado
    FROM public.pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  IF v_status <> 'recebido' THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'fora de Novos/Aceitos'::text; RETURN;
  END IF;
  IF v_aceito IS NULL THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'aceite da atendente ausente'::text; RETURN;
  END IF;
  IF v_liberado IS NOT NULL THEN
    RETURN QUERY SELECT 'conflito'::text, 'liberacao duplicada'::text; RETURN;
  END IF;
  -- E10.0.1: NULL→60, negativos→0, teto 1440 (1 dia). Parâmetro inválido
  -- nunca libera antecipado: NULL/negativo não zeram a janela.
  IF v_agendado IS NOT NULL AND now() < v_agendado - (LEAST(GREATEST(COALESCE(p_antecedencia_min, 60), 0), 1440) || ' minutes')::interval THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'agendado antes da janela'::text; RETURN;
  END IF;
  UPDATE public.pedidos
    SET liberado_em = now(), liberado_por = v_uid
    WHERE id = p_pedido_id AND liberado_em IS NULL AND status = 'recebido';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'condicao de corrida'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, 'liberacao registrada'::text;
END $$;


--
-- Name: FUNCTION liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer) IS 'E3: liberação para a cozinha. Não inicia preparo, não altera status/pagamento/promessa. Agendados respeitam a janela.';


--
-- Name: liberar_reserva_atomica(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r record; n integer := 0;
  v_dono uuid;
  v_eh_staff boolean;
BEGIN
  SELECT user_id INTO v_dono FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Autorização (0068): dono não-nulo ou staff operacional.
  v_eh_staff := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente');
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN 0;
    END IF;
  ELSIF v_dono IS DISTINCT FROM auth.uid() AND NOT v_eh_staff THEN
    RETURN 0;
  END IF;

  -- Só linhas 'ativa': repetir a chamada é no-op (idempotente).
  FOR r IN
    SELECT * FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id AND status = 'ativa'
    FOR UPDATE
  LOOP
    UPDATE public.produtos SET estoque = estoque + r.quantidade WHERE id = r.produto_id;
    UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = r.id;

    -- 0086: 'entrada' é valor VÁLIDO (antes: 'liberacao_reserva', inválido).
    INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
    VALUES (r.produto_id, 'entrada', r.quantidade, 'liberacao_reserva pedido:' || p_pedido_id::text);

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;


--
-- Name: FUNCTION liberar_reserva_atomica(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid) IS '0086: 0068 (auth dono/staff) com tipo válido em estoque_mov (''entrada''); só linhas ativa.';


--
-- Name: liberar_reserva_pedido(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mov record;
  v_tem_0030 boolean := false;
BEGIN
  -- Serializa liberações concorrentes do mesmo pedido; prova existência.
  PERFORM 1 FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  -- 0030 primeiro: restaura produtos.estoque e marca as reservas (no-op se
  -- vazio). Erro aqui aborta o cancel com mensagem visível (melhor que
  -- corromper saldo em silêncio). Só ignora se 0030 nunca foi aplicada.
  BEGIN
    PERFORM public.liberar_reserva_atomica(p_pedido_id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  -- Se 0030 engajou neste pedido, ela é dona do produtos.estoque: aqui só
  -- devolvemos os LOTES (modo legado = sem linhas 0030 → restaura tudo).
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.reservas_estoque WHERE pedido_id = p_pedido_id
    ) INTO v_tem_0030;
  EXCEPTION WHEN undefined_table THEN
    v_tem_0030 := false;
  END;

  -- Só reservas AINDA NÃO processadas (idempotente: repetir = no-op).
  FOR v_mov IN
    SELECT id, produto_id, lote_id, ABS(quantidade) AS qtd
    FROM public.estoque_movimentacoes
    WHERE referencia_id = p_pedido_id
      AND referencia_tipo = 'pedido'
      AND tipo = 'reserva'
      AND processada_em IS NULL
    FOR UPDATE
  LOOP
    -- Devolve ao lote
    IF v_mov.lote_id IS NOT NULL THEN
      UPDATE public.lotes
      SET restante = restante + v_mov.qtd
      WHERE id = v_mov.lote_id;
    END IF;

    -- Registra liberação (sem recreditar produtos.estoque se 0030 já o fez)
    PERFORM public.registrar_mov_estoque(
      v_mov.produto_id,
      'liberacao',
      v_mov.qtd,
      v_mov.lote_id,
      p_pedido_id,
      'pedido',
      NULL,
      'Liberação de reserva por cancelamento/alteração do pedido',
      NOT v_tem_0030
    );

    -- Marca como processada (metadado; valores e histórico preservados)
    UPDATE public.estoque_movimentacoes
    SET processada_em = now()
    WHERE id = v_mov.id;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION liberar_reserva_pedido(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid) IS '0069: idempotente via processada_em + lock do pedido; compatível com 0050.';


--
-- Name: pedidos_guard_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pedidos_guard_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Servidor (API Pix, jobs, backfill): trusted, como em 0074.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Papéis internos amplos: escrita total (0084 congela o financeiro à parte).
  IF public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro') THEN
    RETURN NEW;
  END IF;

  -- Motoboy: não toca valores/identidade (0070, com IS DISTINCT corrigido).
  IF public.has_role(auth.uid(), 'motoboy') THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
      OR NEW.desconto IS DISTINCT FROM OLD.desconto
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.cupom IS DISTINCT FROM OLD.cupom
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.numero IS DISTINCT FROM OLD.numero
      OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome
      OR NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      RAISE EXCEPTION 'motoboy_nao_pode_alterar_valores';
    END IF;

    -- Aceite legítimo: NULL -> próprio uid (não rouba de outro motoboy).
    IF NEW.motoboy_id IS DISTINCT FROM OLD.motoboy_id THEN
      IF OLD.motoboy_id IS NOT NULL THEN
        RAISE EXCEPTION 'motoboy_nao_pode_roubar_pedido';
      END IF;
      IF NEW.motoboy_id IS NOT DISTINCT FROM auth.uid() THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'motoboy_nao_pode_definir_outro_motoboy';
    END IF;

    -- Dono do pedido: demais campos operacionais liberados.
    IF OLD.motoboy_id IS NOT DISTINCT FROM auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'motoboy_sem_atribuicao';
  END IF;

  -- Cliente: só cancela o próprio pedido recebido.
  IF OLD.user_id = auth.uid() AND OLD.status = 'recebido' AND NEW.status = 'cancelado'
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.numero IS NOT DISTINCT FROM OLD.numero THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'operacao_nao_permitida';
END $$;


--
-- Name: FUNCTION pedidos_guard_update(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pedidos_guard_update() IS 'E10.0.1: 0070 estrito + bypass service_role. Corrige IS NOT DISTINCT de 0074:35-38.';


--
-- Name: profiles_guard_pontos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_guard_pontos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.pontos IS DISTINCT FROM OLD.pontos
     AND coalesce(current_setting('app.pontos_ok', true),'') <> '1'
     AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'pontos_nao_editaveis';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: profiles_guard_pontos_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_guard_pontos_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF coalesce(current_setting('app.pontos_ok', true),'') <> '1' AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.pontos := 0;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: receber_compra_item(uuid, numeric, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receber_compra_item(p_item_id uuid, p_qtd numeric, p_unidade text, p_validade date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ci record;
  v_ins record;
  v_compra record;
  v_forn record;
  v_base numeric;
  v_custo_base numeric;
  v_novo_custo numeric;
  v_saldo numeric;
  v_qtd_na_unidade numeric;
  v_tot_ped numeric;
  v_tot_rec numeric;
BEGIN
  IF NOT ((auth.jwt() ->> 'role') = 'service_role'
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')) THEN
    RAISE EXCEPTION 'sem_permissao_recebimento';
  END IF;

  SELECT * INTO v_ci FROM public.compra_itens WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_item_nao_encontrado';
  END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = v_ci.insumo_id;
  SELECT * INTO v_compra FROM public.compras WHERE id = v_ci.compra_id;
  IF v_compra.status = 'cancelada' THEN
    RAISE EXCEPTION 'compra_cancelada';
  END IF;
  IF v_compra.status = 'recebida_total' THEN
    RAISE EXCEPTION 'compra_ja_totalizada';
  END IF;

  v_base := public.converter_unidade(p_qtd, p_unidade, v_ins.unidade_base);
  IF v_base IS NULL OR v_base <= 0 THEN
    RAISE EXCEPTION 'unidade_invalida';
  END IF;

  -- Custo sempre pela unidade NEGOCIADA do item (não pela informada aqui).
  v_custo_base := v_ci.custo_unitario / public.converter_unidade(1, v_ci.unidade, v_ins.unidade_base);

  -- recebido acumulado convertido para a unidade do item; sem excesso.
  v_qtd_na_unidade := public.converter_unidade(v_base, v_ins.unidade_base, v_ci.unidade);
  IF v_ci.quantidade_recebida + v_qtd_na_unidade > v_ci.quantidade + 0.0005 THEN
    RAISE EXCEPTION 'recebimento_acima_do_pedido';
  END IF;

  v_saldo := v_ins.estoque_atual;
  IF v_saldo > 0 THEN
    v_novo_custo := (v_saldo * v_ins.custo_medio + v_base * v_custo_base) / (v_saldo + v_base);
  ELSE
    v_novo_custo := v_custo_base;
  END IF;

  INSERT INTO public.insumo_lotes
    (insumo_id, quantidade, restante, custo_unitario, validade, fornecedor_id, compra_id)
  VALUES
    (v_ins.id, v_base, v_base, v_custo_base, p_validade, v_compra.fornecedor_id, v_compra.id);

  UPDATE public.insumos
  SET estoque_atual = estoque_atual + v_base, custo_medio = v_novo_custo, updated_at = now()
  WHERE id = v_ins.id;

  INSERT INTO public.insumo_movimentacoes
    (insumo_id, tipo, quantidade, saldo_antes, saldo_depois, custo, referencia, usuario)
  VALUES
    (v_ins.id, 'entrada', v_base, v_saldo, v_saldo + v_base, v_custo_base,
     'compra:' || v_compra.id::text, auth.uid());

  UPDATE public.compra_itens
  SET quantidade_recebida = quantidade_recebida + v_qtd_na_unidade
  WHERE id = p_item_id;

  SELECT COALESCE(SUM(quantidade), 0), COALESCE(SUM(quantidade_recebida), 0)
  INTO v_tot_ped, v_tot_rec
  FROM public.compra_itens WHERE compra_id = v_compra.id;

  UPDATE public.compras
  SET status = CASE WHEN v_tot_rec >= v_tot_ped THEN 'recebida_total' ELSE 'recebida_parcial' END,
      recebida_em = now()
  WHERE id = v_compra.id;

  SELECT * INTO v_forn FROM public.fornecedores WHERE id = v_compra.fornecedor_id;
  INSERT INTO public.contas (tipo, descricao, categoria, fornecedor, valor, meio, status)
  VALUES ('pagar',
          'Compra ' || substring(v_compra.id::text, 1, 8) || ' — ' || v_ins.nome,
          'insumos',
          COALESCE(v_forn.nome, ''),
          p_qtd * v_ci.custo_unitario,
          'outro',
          'pendente');

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (auth.uid(), 'compra_recebida',
          v_ins.nome || ' +' || v_base::text || v_ins.unidade_base);
END;
$$;


--
-- Name: FUNCTION receber_compra_item(p_item_id uuid, p_qtd numeric, p_unidade text, p_validade date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.receber_compra_item(p_item_id uuid, p_qtd numeric, p_unidade text, p_validade date) IS 'K: recebe item de compra (lote FEFO + custo médio + conta a pagar). Parcial ou total.';


--
-- Name: registrar_mov_estoque(uuid, public.tipo_mov_estoque, integer, uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid DEFAULT NULL::uuid, p_referencia_id uuid DEFAULT NULL::uuid, p_referencia_tipo text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_saldo_anterior integer;
  v_saldo_posterior integer;
BEGIN
  -- Trava o produto para evitar race condition
  PERFORM * FROM public.produtos WHERE id = p_produto_id FOR UPDATE;

  SELECT estoque INTO v_saldo_anterior FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
  END IF;

  v_saldo_posterior := v_saldo_anterior + p_quantidade;
  IF v_saldo_posterior < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ficar negativo (produto: %, atual: %, tentando: %)',
      p_produto_id, v_saldo_anterior, p_quantidade;
  END IF;

  -- Atualiza estoque do produto
  UPDATE public.produtos SET estoque = v_saldo_posterior WHERE id = p_produto_id;

  -- Registra movimentação
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id, p_lote_id, p_tipo, p_quantidade,
    v_saldo_anterior, v_saldo_posterior,
    p_referencia_id, p_referencia_tipo, p_usuario_id, p_observacao
  );
END;
$$;


--
-- Name: registrar_mov_estoque(uuid, public.tipo_mov_estoque, integer, uuid, uuid, text, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid DEFAULT NULL::uuid, p_referencia_id uuid DEFAULT NULL::uuid, p_referencia_tipo text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_atualizar_estoque boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_saldo_anterior integer;
  v_saldo_posterior integer;
BEGIN
  -- Trava o produto para evitar race condition
  PERFORM * FROM public.produtos WHERE id = p_produto_id FOR UPDATE;

  SELECT estoque INTO v_saldo_anterior FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
  END IF;

  -- Modo trilha (0030 já moveu produtos.estoque): só registra, não soma 2x
  IF p_atualizar_estoque THEN
    v_saldo_posterior := v_saldo_anterior + p_quantidade;
    IF v_saldo_posterior < 0 THEN
      RAISE EXCEPTION 'Estoque não pode ficar negativo (produto: %, atual: %, tentando: %)',
        p_produto_id, v_saldo_anterior, p_quantidade;
    END IF;

    -- Atualiza estoque do produto
    UPDATE public.produtos SET estoque = v_saldo_posterior WHERE id = p_produto_id;
  ELSE
    v_saldo_posterior := v_saldo_anterior;
  END IF;

  -- Registra movimentação
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id, p_lote_id, p_tipo, p_quantidade,
    v_saldo_anterior, v_saldo_posterior,
    p_referencia_id, p_referencia_tipo, p_usuario_id, p_observacao
  );
END;
$$;


--
-- Name: FUNCTION registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid, p_referencia_id uuid, p_referencia_tipo text, p_usuario_id uuid, p_observacao text, p_atualizar_estoque boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid, p_referencia_id uuid, p_referencia_tipo text, p_usuario_id uuid, p_observacao text, p_atualizar_estoque boolean) IS '0050: p_atualizar_estoque=false registra trilha sem mover produtos.estoque (0030 é dona quando engajou).';


--
-- Name: reservar_estoque_atomica(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_estoque_atomica(p_pedido_id uuid, p_produto_id uuid, p_qtd integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_eh_staff   boolean;
  v_solicitado integer;
  v_ja_total   integer;
  v_falta      integer;
  v_estoque    integer;
  v_reserva_id uuid;
  v_mov_id     uuid;
  v_controlado boolean := false;
  v_orfa       integer;
BEGIN
  -- 1. Entrada válida (p_qtd segue exigido; é validado no passo 6).
  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RETURN false;
  END IF;

  -- 2. Autenticação (auth.uid() é a única fonte de identidade).
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 3. L1: travar o pedido e ler dono/status.
  SELECT user_id, status
    INTO v_dono, v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 4. Autorização: dono OU staff operacional (inalterado da 0068).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN false;
    END IF;
  ELSIF v_dono IS DISTINCT FROM v_uid AND NOT v_eh_staff THEN
    RETURN false;
  END IF;

  -- 5. Status elegível.
  IF v_status NOT IN ('recebido', 'em_producao') THEN
    RETURN false;
  END IF;

  -- 5b. Proveniência (0092): ler o controle de forma SEGURA. A 0092 pode não
  --     estar instalada; nesse caso to_regclass() devolve NULL e o regime
  --     controlado permanece desligado (sem marcador), sem exceção.
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT controlado
      INTO v_controlado
    FROM public.reserva_proveniencia_config
    WHERE id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;

  -- 6. VALIDAÇÃO DE ITEM e alvo autoritativo (Σ pedido_itens).
  SELECT COALESCE(SUM(quantidade), 0)
    INTO v_solicitado
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id
    AND produto_id = p_produto_id;

  IF v_solicitado <= 0 THEN
    RETURN false;   -- produto não pertence ao pedido
  END IF;
  IF p_qtd > v_solicitado THEN
    RETURN false;   -- pedido de reserva acima do total do item
  END IF;

  -- 6b. Regime controlado (0092): reserva ATIVA sem marcador confiável NÃO pode
  --     ser tratada como sucesso idempotente. Como a assinatura é boolean e a
  --     alternativa (false) dispararia caminho destrutivo no checkout atual,
  --     falhamos EXPLICITAMENTE (rollback total, sem débito e sem true).
  --     Nunca marca retroativamente: só considera "solucionado" com o marcador.
  IF v_controlado THEN
    SELECT COUNT(*)
      INTO v_orfa
    FROM public.reservas_estoque r
    WHERE r.pedido_id = p_pedido_id
      AND r.produto_id = p_produto_id
      AND r.status = 'ativa'
      AND NOT EXISTS (
        SELECT 1 FROM public.reserva_proveniencia rp
        WHERE rp.reserva_id = r.id
      );
    IF v_orfa > 0 THEN
      RAISE EXCEPTION
        'reconciliacao_pendente: reserva ativa sem proveniencia (pedido %, produto %)',
        p_pedido_id, p_produto_id;
    END IF;
  END IF;

  -- 7. Idempotência: quanto já reservado (inclui legado, postura conservadora).
  SELECT COALESCE(SUM(quantidade), 0)
    INTO v_ja_total
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND produto_id = p_produto_id
    AND status = 'ativa';

  v_falta := v_solicitado - v_ja_total;
  IF v_falta <= 0 THEN
    RETURN true;   -- já reservado: no-op idempotente
  END IF;

  -- 8. L2: travar o produto e ler o saldo disponível.
  SELECT estoque
    INTO v_estoque
  FROM public.produtos
  WHERE id = p_produto_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 9. Impedir saldo disponível negativo.
  IF v_estoque < v_falta THEN
    RETURN false;
  END IF;

  -- 10. Identidade própria da reserva.
  v_reserva_id := gen_random_uuid();

  -- 11. Débito ÚNICO do disponível.
  UPDATE public.produtos
     SET estoque = v_estoque - v_falta
   WHERE id = p_produto_id;

  -- 12. Cria a reserva (id explícito = chave de rastreabilidade).
  INSERT INTO public.reservas_estoque (id, pedido_id, produto_id, quantidade, status)
  VALUES (v_reserva_id, p_pedido_id, p_produto_id, v_falta, 'ativa');

  -- 13. Ledger de saldo (append; NÃO estoque_mov; NÃO registrar_mov_estoque).
  --     RETURNING id => amarra o marcador ao débito LEGÍTIMO desta transação.
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id,
    NULL,
    'reserva',
    -v_falta,
    v_estoque,
    v_estoque - v_falta,
    v_reserva_id,
    'reserva_estoque',
    v_uid,
    'Reserva de estoque (Modelo 2) pedido ' || p_pedido_id::text
  )
  RETURNING id INTO v_mov_id;

  -- 14. Marcador de proveniência (0092), na MESMA transação do débito legítimo.
  --     Só sob regime controlado. A FK composta valida a associação
  --     reserva<->pedido<->produto<->quantidade e o UNIQUE amarra ao débito
  --     exato (v_mov_id). Se a escrita obrigatória falhar, o erro aborta a
  --     transação inteira (sem sucesso parcial, sem marcador separado do débito).
  IF v_controlado THEN
    INSERT INTO public.reserva_proveniencia (
      reserva_id, pedido_id, produto_id, quantidade,
      origem, estoque_movimentacao_id, criado_por
    ) VALUES (
      v_reserva_id, p_pedido_id, p_produto_id, v_falta,
      '0088', v_mov_id, v_uid
    );
  END IF;

  RETURN true;
END;
$$;


--
-- Name: FUNCTION reservar_estoque_atomica(p_pedido_id uuid, p_produto_id uuid, p_qtd integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reservar_estoque_atomica(p_pedido_id uuid, p_produto_id uuid, p_qtd integer) IS '0088: reserva atômica (Modelo 2). Alvo autoritativo = Σ pedido_itens do par (pedido,produto); p_qtd apenas validado (≤ Σ). Exige produto pertencente ao pedido. Debita o disponível UMA vez, cria reserva com id próprio e registra no ledger estoque_movimentacoes (referencia_id=reserva.id, referencia_tipo=reserva_estoque, tipo=reserva). NÃO grava em estoque_mov. Proveniência (0092): sob regime controlado cria o marcador na mesma transação (com o id do débito); reserva ativa sem marcador => exceção reconciliacao_pendente. Idempotente por (pedido,produto). Legado órfão: contabilizado p/ evitar débito duplo sem regime controlado; classificação explícita pendente de mudança no checkout.';


--
-- Name: reservar_estoque_pedido(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
  v_ja_0030 boolean;
BEGIN
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
$$;


--
-- Name: FUNCTION reservar_estoque_pedido(p_pedido_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid) IS '0067: EXECUTE direto revogado (PUBLIC/anon/authenticated, sem GRANT residual); só trigger/interno. Autorização de dono/staff vem na 0068.';


--
-- Name: resgatar_fidelidade(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resgatar_fidelidade(p_telefone text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_tel text; v_saldo integer; v_meta integer := 200; v_valor numeric := 20; v_ativo boolean := true; v_codigo text; v_cfg record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  v_tel := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  IF length(v_tel) < 10 THEN RAISE EXCEPTION 'telefone_invalido'; END IF;
  SELECT fid_ativo, fid_meta_pontos, fid_recompensa_valor INTO v_cfg FROM public.crm_settings WHERE id = true;
  IF FOUND THEN v_ativo := coalesce(v_cfg.fid_ativo,true); v_meta := coalesce(v_cfg.fid_meta_pontos,200); v_valor := coalesce(v_cfg.fid_recompensa_valor,20); END IF;
  IF NOT v_ativo THEN RAISE EXCEPTION 'programa_desativado'; END IF;
  IF v_valor <= 0 OR v_valor > 100 OR v_meta <= 0 THEN RAISE EXCEPTION 'config_invalida'; END IF;
  SELECT pontos INTO v_saldo FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF coalesce(v_saldo,0) < v_meta THEN RAISE EXCEPTION 'pontos_insuficientes'; END IF;
  v_codigo := 'FID-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  INSERT INTO public.cupons (codigo, tipo, valor, minimo, ativo, cliente_telefone, validade_fim, max_usos, produtos_ids)
  VALUES (v_codigo, 'valor', v_valor, 0, true, v_tel, now() + interval '30 days', 1, '[]'::jsonb);
  PERFORM set_config('app.pontos_ok','1', true);
  UPDATE public.profiles SET pontos = pontos - v_meta, telefone = CASE WHEN telefone = '' THEN v_tel ELSE telefone END WHERE id = v_uid;
  PERFORM set_config('app.pontos_ok','', true);
  RETURN v_codigo;
END; $$;


--
-- Name: retirar_pedido_cliente(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean DEFAULT false) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.order_status;
  v_tipo text;
  v_conferido timestamptz;
  v_retirado timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'atendente') OR public.has_role(v_uid, 'producao') OR public.has_role(v_uid, 'admin')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel operacional'::text; RETURN;
  END IF;
  SELECT p.status, p.tipo_entrega, p.conferido_em, p.retirado_em
    INTO v_status, v_tipo, v_conferido, v_retirado
    FROM public.pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inexistente'::text, 'pedido nao encontrado'::text; RETURN;
  END IF;
  IF v_tipo <> 'retirada' THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'entrega usa fluxo de motoboy'::text; RETURN;
  END IF;
  IF v_status <> 'pronto' THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'fora de Prontos'::text; RETURN;
  END IF;
  IF p_exigir_conferencia AND v_conferido IS NULL THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'conferencia ausente'::text; RETURN;
  END IF;
  IF v_retirado IS NOT NULL THEN
    RETURN QUERY SELECT 'conflito'::text, 'retirada duplicada'::text; RETURN;
  END IF;
  UPDATE public.pedidos
    SET retirado_em = now(), retirado_por = v_uid, status = 'entregue'
    WHERE id = p_pedido_id AND retirado_em IS NULL AND status = 'pronto' AND tipo_entrega = 'retirada';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'condicao de corrida'::text; RETURN;
  END IF;
  INSERT INTO public.pedido_status_historico (pedido_id, de_status, para_status, actor, motivo)
    VALUES (p_pedido_id, 'pronto', 'entregue', v_uid, 'retirada confirmada');
  RETURN QUERY SELECT 'ok'::text, 'retirada registrada'::text;
END $$;


--
-- Name: FUNCTION retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean) IS 'E5: retirada física confirmada. Transição pronto→entregue (matriz 0041) + histórico. Nunca automática.';


--
-- Name: solicitar_reimpressao(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text DEFAULT 'pedido'::text, p_idempotencia text DEFAULT NULL::text) RETURNS TABLE(resultado text, detalhe text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_base record;
  v_uuid text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem autenticacao'::text; RETURN;
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'producao') OR public.has_role(v_uid, 'atendente')) THEN
    RETURN QUERY SELECT 'negado'::text, 'sem papel operacional'::text; RETURN;
  END IF;
  IF p_tipo NOT IN ('pedido', 'ficha_cozinha') THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'tipo invalido'::text; RETURN;
  END IF;
  IF NULLIF(trim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RETURN QUERY SELECT 'bloqueado'::text, 'motivo obrigatorio'::text; RETURN;
  END IF;
  SELECT f.payload INTO v_base FROM public.fila_impressao f
    WHERE f.pedido_id = p_pedido_id AND f.tipo = p_tipo AND f.status = 'impresso'
    ORDER BY f.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'inelegivel'::text, 'sem impressao concluida'::text; RETURN;
  END IF;
  -- E10.0.1: identidade por chave de idempotência (retry da mesma
  -- solicitação reusa a chave → conflito explícito, sem nova linha).
  -- Reimpressões intencionais usam chaves distintas. Sem clock_timestamp.
  v_uuid := p_pedido_id::text || ':reimp:' || COALESCE(NULLIF(trim(p_idempotencia), ''), gen_random_uuid()::text);
  INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, motivo_reimpressao, status, created_at, updated_at)
    VALUES (p_pedido_id, p_tipo, v_base.payload, 'Tanca TP-550', v_uuid, trim(p_motivo), 'pendente', now(), now())
    ON CONFLICT (trabalho_uuid) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'conflito'::text, 'solicitacao ja registrada'::text; RETURN;
  END IF;
  UPDATE public.fila_impressao SET reimpressoes = COALESCE(reimpressoes, 0) + 1, updated_at = now()
    WHERE id = (SELECT f.id FROM public.fila_impressao f
      WHERE f.pedido_id = p_pedido_id AND f.tipo = p_tipo AND f.status = 'impresso'
      ORDER BY f.created_at DESC LIMIT 1);
  RETURN QUERY SELECT 'ok'::text, 'reimpressao enfileirada'::text;
END $$;


--
-- Name: FUNCTION solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text) IS 'E6: reimpressão com motivo obrigatório + contador. E10.0.1: idempotência por chave; sem clock_timestamp.';


--
-- Name: trg_gerar_cupom_apos_itens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_gerar_cupom_apos_itens() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pid uuid;
BEGIN
  FOR v_pid IN SELECT DISTINCT pedido_id FROM new_itens LOOP
    PERFORM public.enfileirar_cupom(v_pid);
  END LOOP;
  RETURN NULL;
END;
$$;


--
-- Name: trg_pagamento_confirmado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_pagamento_confirmado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.pagamento_status = 'pago' AND OLD.pagamento_status IS DISTINCT FROM NEW.pagamento_status THEN
    PERFORM public.enfileirar_cupom(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_criar_fritura_fila(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_criar_fritura_fila() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item record;
  v_tempo integer;
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    -- Só itens COM produto (fritura_fila.produto_id é NOT NULL)
    FOR v_item IN
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      WHERE pi.pedido_id = NEW.id
        AND pi.produto_id IS NOT NULL
    LOOP
      v_tempo := public.calcular_tempo_fritura(v_item.produto_id, v_item.quantidade);
      INSERT INTO public.fritura_fila (pedido_id, produto_id, quantidade, tempo_previsto_segundos)
      VALUES (NEW.id, v_item.produto_id, v_item.quantidade, v_tempo)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trigger_criar_fritura_fila(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trigger_criar_fritura_fila() IS '0048: ignora itens sem produto (fritura_fila.produto_id é NOT NULL).';


--
-- Name: trigger_entrega_motoboy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_entrega_motoboy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mb uuid;
  v_restam integer;
BEGIN
  IF NEW.status = 'entregue' AND OLD.status = 'em_rota' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      UPDATE public.motoboys
      SET status = 'retornando_base',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'entrega_realizada',
        'Entregue pedido #' || NEW.numero || ' para ' || NEW.cliente_nome
      );

      SELECT count(*) INTO v_restam FROM public.pedidos
      WHERE motoboy_id = NEW.motoboy_id
        AND status IN ('em_rota', 'aguardando_motoboy');

      IF v_restam = 0 THEN
        UPDATE public.motoboys
        SET status = 'aguardando_nova_rota',
            ultima_atualizacao = now()
        WHERE id = v_mb;

        INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
        VALUES (
          v_mb,
          NULL,
          NEW.id,
          'retorno_base',
          'Retornando à base - sem mais pedidos em rota'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_reservar_estoque(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_reservar_estoque() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    PERFORM public.reservar_estoque_pedido(NEW.id);
  ELSIF NEW.status = 'recebido' AND OLD.status = 'em_producao' THEN
    PERFORM public.liberar_reserva_pedido(NEW.id);
  ELSIF NEW.status = 'cancelado' AND OLD.status IN ('recebido', 'em_producao') THEN
    PERFORM public.liberar_reserva_pedido(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_saida_motoboy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_saida_motoboy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mb uuid;
BEGIN
  IF NEW.status = 'em_rota' AND OLD.status = 'aguardando_motoboy' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      UPDATE public.motoboys
      SET status = 'em_rota',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'saida_base',
        'Iniciou rota de entrega para pedido #' || NEW.numero
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validar_dados_fiscais_emissao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_dados_fiscais_emissao() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_empresa record;
  v_item record;
  v_faltando text[];
BEGIN
  -- Só valida em transição para em_processamento/autorizada
  IF NEW.status NOT IN ('em_processamento', 'autorizada') THEN
    RETURN NEW;
  END IF;

  -- Valida empresa
  SELECT * INTO v_empresa FROM public.empresa_fiscal WHERE id = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração fiscal da empresa não encontrada (execute migração 0033)';
  END IF;

  v_faltando := ARRAY[]::text[];
  IF v_empresa.razao_social = '' THEN v_faltando := array_append(v_faltando, 'razao_social'); END IF;
  IF v_empresa.cnpj = '' THEN v_faltando := array_append(v_faltando, 'cnpj'); END IF;
  IF v_empresa.inscricao_estadual = '' THEN v_faltando := array_append(v_faltando, 'inscricao_estadual'); END IF;
  IF v_empresa.endereco = '' THEN v_faltando := array_append(v_faltando, 'endereco'); END IF;
  IF v_empresa.cidade = '' THEN v_faltando := array_append(v_faltando, 'cidade'); END IF;
  IF v_empresa.uf = '' THEN v_faltando := array_append(v_faltando, 'uf'); END IF;
  IF v_empresa.cep = '' THEN v_faltando := array_append(v_faltando, 'cep'); END IF;
  IF v_empresa.regime_tributario = '' THEN v_faltando := array_append(v_faltando, 'regime_tributario'); END IF;
  IF v_empresa.serie = '' THEN v_faltando := array_append(v_faltando, 'serie'); END IF;
  IF v_empresa.modelo_padrao = '' THEN v_faltando := array_append(v_faltando, 'modelo_padrao (55 ou 65)'); END IF;
  IF v_empresa.ambiente = '' THEN v_faltando := array_append(v_faltando, 'ambiente'); END IF;
  IF v_empresa.provedor = '' THEN v_faltando := array_append(v_faltando, 'provedor'); END IF;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION 'Configuração fiscal incompleta. Faltam: %', array_to_string(v_faltando, ', ');
  END IF;

  -- Itens avulsos (combo montado, produto_id NULL) não têm NCM próprio:
  -- bloqueia com mensagem clara em vez de emitir com tributo inventado.
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    WHERE pi.pedido_id = NEW.pedido_id AND pi.produto_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Pedido tem item avulso/combo sem produto vinculado. Desmembre em sabores com NCM/CFOP ou cadastre um produto kit antes de emitir.';
  END IF;

  -- Valida itens fiscais do pedido (usa NEW.pedido_id: no BEFORE INSERT a
  -- linha ainda não existe na tabela, então subquery em documentos_fiscais
  -- retornaria NULL e a validação seria silenciosamente pulada).
  FOR v_item IN
    SELECT DISTINCT p.id, p.nome, p.ncm, p.cst, p.csosn, p.cfop_padrao, p.origem_mercadoria
    FROM public.produtos p
    JOIN public.pedido_itens pi ON pi.produto_id = p.id
    WHERE pi.pedido_id = NEW.pedido_id
  LOOP
    v_faltando := ARRAY[]::text[];
    IF v_item.ncm IS NULL OR v_item.ncm = '' THEN v_faltando := array_append(v_faltando, 'NCM'); END IF;
    IF v_item.cst IS NULL AND v_item.csosn IS NULL THEN v_faltando := array_append(v_faltando, 'CST/CSOSN'); END IF;
    IF v_item.cfop_padrao IS NULL OR v_item.cfop_padrao = '' THEN v_faltando := array_append(v_faltando, 'CFOP'); END IF;
    IF v_item.origem_mercadoria IS NULL OR v_item.origem_mercadoria = '' THEN v_faltando := array_append(v_faltando, 'origem_mercadoria'); END IF;

    IF array_length(v_faltando, 1) > 0 THEN
      RAISE EXCEPTION 'Produto "%" sem dados fiscais obrigatórios: %', v_item.nome, array_to_string(v_faltando, ', ');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: validar_endereco_entrega(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_endereco_entrega() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.tipo_entrega = 'entrega' THEN
    IF NEW.endereco IS NULL OR NEW.endereco = '' THEN
      RAISE EXCEPTION 'Endereço é obrigatório para entrega';
    END IF;
    IF NEW.bairro IS NULL OR NEW.bairro = '' THEN
      RAISE EXCEPTION 'Bairro é obrigatório para entrega';
    END IF;
    IF NEW.cidade IS NULL OR NEW.cidade = '' THEN
      RAISE EXCEPTION 'Cidade é obrigatória para entrega';
    END IF;
    IF NEW.tipo_imovel = 'apartamento' THEN
      IF NEW.apartamento IS NULL OR NEW.apartamento = '' THEN
        RAISE EXCEPTION 'Número do apartamento é obrigatório';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validar_transicao_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_transicao_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  eh_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  -- Se não mudou, ignora
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admin pode tudo (com auditoria posterior)
  IF eh_admin THEN
    RETURN NEW;
  END IF;

  -- Verifica se transição é permitida
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_status_transicoes
    WHERE de_status = OLD.status AND para_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Transição de status não permitida: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: acertos_motoboy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acertos_motoboy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid NOT NULL,
    periodo_ini date NOT NULL,
    periodo_fim date NOT NULL,
    entregas integer DEFAULT 0 NOT NULL,
    taxas numeric(12,2) DEFAULT 0 NOT NULL,
    vales numeric(12,2) DEFAULT 0 NOT NULL,
    liquido numeric(12,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor uuid,
    acao text NOT NULL,
    detalhe text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ajuda_artigos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajuda_artigos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria text NOT NULL,
    titulo text NOT NULL,
    corpo text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: avaliacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avaliacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    user_id uuid NOT NULL,
    nota integer NOT NULL,
    comentario text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pedido_id uuid,
    prazo integer,
    atendimento integer,
    autoriza_publicar boolean DEFAULT false NOT NULL,
    aprovada boolean DEFAULT false NOT NULL,
    CONSTRAINT avaliacoes_atendimento_check CHECK (((atendimento IS NULL) OR ((atendimento >= 1) AND (atendimento <= 5)))),
    CONSTRAINT avaliacoes_nota_check CHECK (((nota >= 1) AND (nota <= 5))),
    CONSTRAINT avaliacoes_prazo_check CHECK (((prazo IS NULL) OR ((prazo >= 1) AND (prazo <= 5))))
);


--
-- Name: caixa_sessoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caixa_sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aberta_em timestamp with time zone DEFAULT now() NOT NULL,
    fechada_em timestamp with time zone,
    saldo_inicial numeric(10,2) DEFAULT 0 NOT NULL,
    saldo_informado numeric(10,2),
    diferenca numeric(10,2),
    responsavel uuid,
    status text DEFAULT 'aberta'::text NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    CONSTRAINT caixa_sessoes_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'fechada'::text])))
);


--
-- Name: TABLE caixa_sessoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.caixa_sessoes IS '0072: sessões de caixa (abertura/fechamento/conferência). Uma aberta por vez.';


--
-- Name: calculadora_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calculadora_config (
    id boolean DEFAULT true NOT NULL,
    permitir_personalizado boolean DEFAULT true NOT NULL,
    por_pessoa_padrao integer DEFAULT 20 NOT NULL,
    minimo_por_pessoa integer DEFAULT 15 NOT NULL,
    maximo_por_pessoa integer DEFAULT 40 NOT NULL,
    zap_contato text DEFAULT ''::text NOT NULL,
    orcamento_validade_dias integer DEFAULT 3 NOT NULL,
    CONSTRAINT calculadora_config_id_check CHECK ((id = true))
);


--
-- Name: COLUMN calculadora_config.zap_contato; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.calculadora_config.zap_contato IS 'WhatsApp que recebe os pedidos de orçamento (DDD + número, com ou sem 55).';


--
-- Name: COLUMN calculadora_config.orcamento_validade_dias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.calculadora_config.orcamento_validade_dias IS 'Validade padrão do orçamento em dias, informada ao cliente na página /calculadora.';


--
-- Name: campanha_cliques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campanha_cliques (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: carrinho_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carrinho_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    telefone text DEFAULT ''::text NOT NULL,
    etapa text DEFAULT 'carrinho'::text NOT NULL,
    itens jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: centros_custo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centros_custo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: compra_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compra_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    compra_id uuid NOT NULL,
    insumo_id uuid NOT NULL,
    quantidade numeric(14,3) NOT NULL,
    unidade text DEFAULT 'kg'::text NOT NULL,
    custo_unitario numeric(14,4) DEFAULT 0 NOT NULL,
    quantidade_recebida numeric(14,3) DEFAULT 0 NOT NULL,
    CONSTRAINT compra_itens_custo_unitario_check CHECK ((custo_unitario >= (0)::numeric)),
    CONSTRAINT compra_itens_quantidade_check CHECK ((quantidade > (0)::numeric)),
    CONSTRAINT compra_itens_quantidade_recebida_check CHECK ((quantidade_recebida >= (0)::numeric))
);


--
-- Name: compras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fornecedor_id uuid,
    status text DEFAULT 'rascunho'::text NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recebida_em timestamp with time zone,
    CONSTRAINT compras_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'enviada'::text, 'recebida_parcial'::text, 'recebida_total'::text, 'cancelada'::text])))
);


--
-- Name: contador_acessos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contador_acessos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario uuid,
    competencia text DEFAULT ''::text NOT NULL,
    acao text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    categoria text DEFAULT ''::text NOT NULL,
    fornecedor text DEFAULT ''::text NOT NULL,
    valor numeric(10,2) DEFAULT 0 NOT NULL,
    meio text DEFAULT 'dinheiro'::text NOT NULL,
    vencimento date,
    pago_em timestamp with time zone,
    status text DEFAULT 'pendente'::text NOT NULL,
    pedido_id uuid,
    parcela_atual integer DEFAULT 1 NOT NULL,
    parcela_total integer DEFAULT 1 NOT NULL,
    recorrente boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    centro_custo text DEFAULT ''::text NOT NULL,
    conta_bancaria_id uuid,
    anexo_url text DEFAULT ''::text NOT NULL,
    valor_pago numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT contas_meio_check CHECK ((meio = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'credito'::text, 'debito'::text, 'transferencia'::text, 'outro'::text]))),
    CONSTRAINT contas_parcela_atual_check CHECK ((parcela_atual >= 1)),
    CONSTRAINT contas_parcela_total_check CHECK ((parcela_total >= 1)),
    CONSTRAINT contas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'paga'::text, 'vencida'::text, 'cancelada'::text]))),
    CONSTRAINT contas_tipo_check CHECK ((tipo = ANY (ARRAY['pagar'::text, 'receber'::text]))),
    CONSTRAINT contas_valor_check CHECK ((valor >= (0)::numeric)),
    CONSTRAINT contas_valor_pago_check CHECK ((valor_pago >= (0)::numeric))
);


--
-- Name: TABLE contas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contas IS '0072: contas a pagar/receber (vencimento, parcelas, recorrência). Status vencida é derivado na leitura.';


--
-- Name: contas_bancarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas_bancarias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'banco'::text NOT NULL,
    saldo_inicial numeric(12,2) DEFAULT 0 NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contas_bancarias_tipo_check CHECK ((tipo = ANY (ARRAY['banco'::text, 'pix'::text, 'maquininha'::text, 'caixa'::text, 'outro'::text])))
);


--
-- Name: crm_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    segmento text DEFAULT 'inativo'::text NOT NULL,
    filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
    mensagem_template text DEFAULT ''::text NOT NULL,
    link_rastreavel text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_customers (
    telefone_norm text NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    user_id uuid,
    endereco_recente text DEFAULT ''::text NOT NULL,
    bairro text DEFAULT ''::text NOT NULL,
    cidade text DEFAULT ''::text NOT NULL,
    opt_out boolean DEFAULT false NOT NULL,
    notas text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    data_nascimento date,
    tipo_cliente text DEFAULT 'PF'::text NOT NULL,
    razao_social text DEFAULT ''::text NOT NULL,
    nome_fantasia text DEFAULT ''::text NOT NULL,
    cnpj text DEFAULT ''::text NOT NULL,
    responsavel text DEFAULT ''::text NOT NULL,
    CONSTRAINT crm_customers_tipo_check CHECK ((tipo_cliente = ANY (ARRAY['PF'::text, 'PJ'::text])))
);


--
-- Name: crm_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telefone_norm text NOT NULL,
    tipo text NOT NULL,
    pedido_id uuid,
    campaign_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_recipients (
    campaign_id uuid NOT NULL,
    telefone_norm text NOT NULL,
    nome_snapshot text DEFAULT ''::text NOT NULL,
    variaveis jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'apto'::text NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    sent_at timestamp with time zone
);


--
-- Name: crm_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_settings (
    id boolean DEFAULT true NOT NULL,
    ativo_ate_dias integer DEFAULT 14 NOT NULL,
    risco_apos_dias integer DEFAULT 21 NOT NULL,
    inativo_apos_dias integer DEFAULT 30 NOT NULL,
    muito_inativo_apos_dias integer DEFAULT 60 NOT NULL,
    intervalo_min_campanhas_dias integer DEFAULT 7 NOT NULL,
    campanhas_habilitadas boolean DEFAULT true NOT NULL,
    mensagem_padrao text DEFAULT 'Olá {{cliente}}! Sentimos sua falta aqui na Néia Salgados! Já faz {{dias_sem_comprar}} dias desde seu último pedido. Quer receber nosso cardápio? {{link_cardapio}}'::text NOT NULL,
    vip_min_pedidos integer DEFAULT 0 NOT NULL,
    vip_min_valor numeric(10,2) DEFAULT 500 NOT NULL,
    freq_min_pedidos integer DEFAULT 4 NOT NULL,
    sugestoes_ativas boolean DEFAULT true NOT NULL,
    recompra_ativa boolean DEFAULT true NOT NULL,
    carrinho_recuperacao_ativa boolean DEFAULT true NOT NULL,
    fid_ativo boolean DEFAULT true NOT NULL,
    fid_reais_por_ponto numeric(10,2) DEFAULT 5 NOT NULL,
    fid_meta_pontos integer DEFAULT 200 NOT NULL,
    fid_recompensa_valor numeric(10,2) DEFAULT 20 NOT NULL,
    CONSTRAINT crm_settings_singleton CHECK ((id = true))
);


--
-- Name: cupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    tipo text DEFAULT 'percentual'::text NOT NULL,
    valor numeric(10,2) NOT NULL,
    minimo numeric(10,2) DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    cliente_telefone text DEFAULT ''::text NOT NULL,
    validade_ini timestamp with time zone,
    validade_fim timestamp with time zone,
    max_usos integer DEFAULT 0 NOT NULL,
    produtos_ids jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: datas_demanda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datas_demanda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ocasiao text NOT NULL,
    data date NOT NULL,
    mensagem text,
    antecedencia_dias integer DEFAULT 10 NOT NULL,
    nivel text DEFAULT 'alta'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: degustacao_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.degustacao_regras (
    id boolean DEFAULT true NOT NULL,
    qtd_minima integer DEFAULT 500 NOT NULL,
    valor_minimo numeric DEFAULT 500 NOT NULL,
    pessoas_minimas integer DEFAULT 30 NOT NULL,
    CONSTRAINT deg_single CHECK ((id = true))
);


--
-- Name: degustacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.degustacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    orcamento_id uuid,
    pedido_id uuid,
    status text DEFAULT 'solicitada'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT degustacoes_status_check CHECK ((status = ANY (ARRAY['solicitada'::text, 'em_analise'::text, 'aprovada'::text, 'agendada'::text, 'preparar'::text, 'pronta'::text, 'realizada'::text, 'recusada'::text, 'cancelada'::text, 'nao_compareceu'::text])))
);


--
-- Name: despesas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despesas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    valor numeric(10,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documento_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documento_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    evento text NOT NULL,
    detalhe text DEFAULT ''::text NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documento_fiscal_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documento_fiscal_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documento_id uuid NOT NULL,
    produto_id uuid,
    n_item integer NOT NULL,
    codigo_produto text NOT NULL,
    descricao text NOT NULL,
    ncm text,
    cest text,
    cfop text,
    unidade text DEFAULT 'UN'::text NOT NULL,
    quantidade numeric(10,3) NOT NULL,
    valor_unitario numeric(10,2) NOT NULL,
    valor_total numeric(10,2) NOT NULL,
    icms_origem text,
    icms_cst text,
    icms_csosn text,
    icms_aliquota numeric(5,2),
    icms_valor numeric(10,2),
    icms_base numeric(10,2),
    ipi_cst text,
    ipi_aliquota numeric(5,2),
    ipi_valor numeric(10,2),
    pis_cst text,
    pis_aliquota numeric(5,2),
    pis_valor numeric(10,2),
    cofins_cst text,
    cofins_aliquota numeric(5,2),
    cofins_valor numeric(10,2),
    inf_adicionais text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documento_fiscal_itens_icms_origem_check CHECK ((icms_origem = ANY (ARRAY['0'::text, '1'::text, '2'::text, '3'::text, '4'::text, '5'::text, '6'::text, '7'::text, '8'::text])))
);


--
-- Name: TABLE documento_fiscal_itens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.documento_fiscal_itens IS 'Dados fiscais detalhados por item para geração do XML da NF-e/NFC-e.';


--
-- Name: documentos_fiscais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos_fiscais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    modelo text DEFAULT ''::text NOT NULL,
    serie text DEFAULT ''::text NOT NULL,
    numero integer,
    ambiente text DEFAULT 'homologacao'::text NOT NULL,
    status text DEFAULT 'nao_emitida'::text NOT NULL,
    chave_acesso text,
    protocolo text,
    codigo_rejeicao text,
    mensagem_rejeicao text,
    xml text,
    danfe_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documentos_fiscais_ambiente_check CHECK ((ambiente = ANY (ARRAY['homologacao'::text, 'producao'::text]))),
    CONSTRAINT documentos_fiscais_modelo_check CHECK ((modelo = ANY (ARRAY[''::text, '55'::text, '65'::text]))),
    CONSTRAINT documentos_fiscais_status_check CHECK ((status = ANY (ARRAY['nao_emitida'::text, 'em_processamento'::text, 'autorizada'::text, 'rejeitada'::text, 'cancelada'::text, 'inutilizada'::text, 'contingencia'::text, 'pendente'::text, 'erro_comunicacao'::text])))
);


--
-- Name: empresa_fiscal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_fiscal (
    id boolean DEFAULT true NOT NULL,
    razao_social text DEFAULT ''::text NOT NULL,
    nome_fantasia text DEFAULT ''::text NOT NULL,
    cnpj text DEFAULT ''::text NOT NULL,
    inscricao_estadual text DEFAULT ''::text NOT NULL,
    inscricao_municipal text DEFAULT ''::text NOT NULL,
    endereco text DEFAULT ''::text NOT NULL,
    numero text DEFAULT ''::text NOT NULL,
    complemento text DEFAULT ''::text NOT NULL,
    bairro text DEFAULT ''::text NOT NULL,
    cidade text DEFAULT ''::text NOT NULL,
    uf text DEFAULT 'SP'::text NOT NULL,
    cep text DEFAULT ''::text NOT NULL,
    regime_tributario text DEFAULT ''::text NOT NULL,
    serie text DEFAULT ''::text NOT NULL,
    numero_inicial integer DEFAULT 1 NOT NULL,
    ambiente text DEFAULT 'homologacao'::text NOT NULL,
    modelo_padrao text DEFAULT ''::text NOT NULL,
    provedor text DEFAULT ''::text NOT NULL,
    csc_id text DEFAULT ''::text NOT NULL,
    info_adicionais text DEFAULT ''::text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT empresa_fiscal_ambiente_check CHECK ((ambiente = ANY (ARRAY['homologacao'::text, 'producao'::text]))),
    CONSTRAINT empresa_fiscal_id_check CHECK ((id = true)),
    CONSTRAINT empresa_fiscal_modelo_padrao_check CHECK ((modelo_padrao = ANY (ARRAY[''::text, '55'::text, '65'::text])))
);


--
-- Name: enderecos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enderecos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    rua text NOT NULL,
    numero text DEFAULT ''::text NOT NULL,
    bairro text DEFAULT ''::text NOT NULL,
    complemento text DEFAULT ''::text NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entrega_atrasos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entrega_atrasos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    motoboy_id uuid,
    motivo public.atraso_motivo NOT NULL,
    descricao_outro text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    resolvido_em timestamp with time zone,
    criado_por uuid
);


--
-- Name: escalas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funcionario_id uuid NOT NULL,
    dia_semana integer NOT NULL,
    entrada time without time zone NOT NULL,
    saida time without time zone NOT NULL,
    CONSTRAINT escalas_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)))
);


--
-- Name: estoque_mov; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estoque_mov (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    tipo text DEFAULT 'ajuste'::text NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    motivo text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT estoque_mov_tipo CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'perda'::text, 'producao'::text])))
);


--
-- Name: estoque_movimentacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estoque_movimentacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    lote_id uuid,
    tipo public.tipo_mov_estoque NOT NULL,
    quantidade integer NOT NULL,
    saldo_anterior integer NOT NULL,
    saldo_posterior integer NOT NULL,
    referencia_id uuid,
    referencia_tipo text,
    usuario_id uuid,
    observacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processada_em timestamp with time zone,
    CONSTRAINT estoque_movimentacoes_quantidade_check CHECK ((quantidade <> 0))
);


--
-- Name: TABLE estoque_movimentacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estoque_movimentacoes IS 'Todas as movimentações de estoque (FEFO, reservas, liberações, ajustes). Nunca apagar.';


--
-- Name: extratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extratos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conta_bancaria_id uuid,
    arquivo text DEFAULT ''::text NOT NULL,
    linha integer DEFAULT 0 NOT NULL,
    data date NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    valor numeric(12,2) DEFAULT 0 NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    vinculo_tipo text DEFAULT ''::text NOT NULL,
    vinculo_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extratos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'conciliado'::text, 'ignorado'::text]))),
    CONSTRAINT extratos_vinculo_tipo_check CHECK ((vinculo_tipo = ANY (ARRAY[''::text, 'pedido'::text, 'conta'::text])))
);


--
-- Name: favoritos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favoritos (
    user_id uuid NOT NULL,
    produto_id uuid NOT NULL
);


--
-- Name: fechamentos_mensais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fechamentos_mensais (
    competencia text NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    enviado_em timestamp with time zone,
    conferido_em timestamp with time zone,
    fechado_por uuid,
    obs text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fechamentos_mensais_competencia_check CHECK ((competencia ~ '^[0-9]{4}-[0-9]{2}$'::text)),
    CONSTRAINT fechamentos_mensais_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'enviado'::text, 'conferido'::text, 'fechado'::text])))
);


--
-- Name: ficha_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ficha_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ficha_id uuid NOT NULL,
    insumo_id uuid NOT NULL,
    quantidade numeric(14,4) NOT NULL,
    unidade text DEFAULT 'g'::text NOT NULL,
    CONSTRAINT ficha_itens_quantidade_check CHECK ((quantidade > (0)::numeric))
);


--
-- Name: fichas_tecnicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fichas_tecnicas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    rendimento numeric(14,3) DEFAULT 1 NOT NULL,
    perda_pct numeric(5,2) DEFAULT 0 NOT NULL,
    por_cento boolean DEFAULT false NOT NULL,
    obs text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fichas_tecnicas_perda_pct_check CHECK (((perda_pct >= (0)::numeric) AND (perda_pct <= (100)::numeric))),
    CONSTRAINT fichas_tecnicas_rendimento_check CHECK ((rendimento > (0)::numeric))
);


--
-- Name: fila_fritura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fila_fritura (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid,
    produto_id uuid,
    quantidade integer DEFAULT 50 NOT NULL,
    tempo_est_s integer DEFAULT 210 NOT NULL,
    inicio timestamp with time zone,
    fim timestamp with time zone,
    tempo_real_s integer,
    status text DEFAULT 'aguardando'::text NOT NULL,
    funcionario text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fila_fritura_status_check CHECK ((status = ANY (ARRAY['aguardando'::text, 'fritando'::text, 'pronto'::text, 'cancelado'::text])))
);


--
-- Name: fila_impressao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fila_impressao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trabalho_uuid text NOT NULL,
    pedido_id uuid,
    tipo text DEFAULT 'pedido'::text NOT NULL,
    payload text DEFAULT ''::text NOT NULL,
    impressora text DEFAULT 'Tanca TP-550'::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    tentativa integer DEFAULT 0 NOT NULL,
    ultimo_erro text,
    reimpressoes integer DEFAULT 0 NOT NULL,
    motivo_reimpressao text,
    imprimir_apos timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fila_impressao_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'impresso'::text, 'erro'::text, 'cancelado'::text]))),
    CONSTRAINT fila_impressao_tipo_check CHECK ((tipo = ANY (ARRAY['pedido'::text, 'teste'::text, 'ficha_cozinha'::text])))
);


--
-- Name: fiscal_certificados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_certificados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id boolean DEFAULT true NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    ref_cofre text NOT NULL,
    senha_ref_cofre text,
    cnpj_titular text NOT NULL,
    validade_inicio date,
    validade_fim date,
    status text DEFAULT 'ativo'::text NOT NULL,
    ambiente text DEFAULT 'homologacao'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fiscal_certificados_ambiente_check CHECK ((ambiente = ANY (ARRAY['homologacao'::text, 'producao'::text]))),
    CONSTRAINT fiscal_certificados_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'vencido'::text, 'revogado'::text, 'teste'::text]))),
    CONSTRAINT fiscal_certificados_tipo_check CHECK ((tipo = ANY (ARRAY['A1'::text, 'A3'::text])))
);


--
-- Name: TABLE fiscal_certificados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fiscal_certificados IS 'Referências a certificados digitais no cofre seguro. NUNCA armazene .pfx ou senha aqui.';


--
-- Name: fiscal_provedor_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fiscal_provedor_config (
    id boolean DEFAULT true NOT NULL,
    provedor text DEFAULT 'focus'::text NOT NULL,
    ambiente text DEFAULT 'homologacao'::text NOT NULL,
    url_base text DEFAULT ''::text NOT NULL,
    token text DEFAULT ''::text NOT NULL,
    timeout_segundos integer DEFAULT 30 NOT NULL,
    homologacao_url text,
    producao_url text,
    homologacao_token text,
    producao_token text,
    certificado_ref text,
    certificado_senha_ref text,
    csc_id text,
    csc_token text,
    contingencia_habilitada boolean DEFAULT false NOT NULL,
    contingencia_tipo text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fiscal_provedor_config_ambiente_check CHECK ((ambiente = ANY (ARRAY['homologacao'::text, 'producao'::text]))),
    CONSTRAINT fiscal_provedor_config_contingencia_tipo_check CHECK ((contingencia_tipo = ANY (ARRAY['SVC-AN'::text, 'SVC-RS'::text, 'offline'::text]))),
    CONSTRAINT fiscal_provedor_config_id_check CHECK ((id = true)),
    CONSTRAINT fiscal_provedor_config_provedor_check CHECK ((provedor = ANY (ARRAY['focus'::text, 'nuvem_fiscal'::text, 'tecnospeed'::text, 'sefaz_direto'::text])))
);


--
-- Name: TABLE fiscal_provedor_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fiscal_provedor_config IS 'Configuração do provedor fiscal (Focus, Nuvem Fiscal, etc.). Singleton id=true.';


--
-- Name: fornecedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fornecedores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cnpj text DEFAULT ''::text NOT NULL,
    contato text DEFAULT ''::text NOT NULL,
    prazo_entrega_dias integer DEFAULT 7 NOT NULL,
    condicoes_pagamento text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fornecedores_prazo_entrega_dias_check CHECK ((prazo_entrega_dias >= 0))
);


--
-- Name: fritura_fila; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fritura_fila (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    quantidade integer NOT NULL,
    tempo_previsto_segundos integer NOT NULL,
    inicio timestamp with time zone,
    fim timestamp with time zone,
    status text DEFAULT 'pendente'::text NOT NULL,
    funcionario_id uuid,
    observacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fritura_fila_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT fritura_fila_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_fritura'::text, 'concluido'::text, 'pausado'::text, 'cancelado'::text]))),
    CONSTRAINT fritura_fila_tempo_previsto_segundos_check CHECK ((tempo_previsto_segundos > 0))
);


--
-- Name: TABLE fritura_fila; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fritura_fila IS '0051: grants p/ leitura staff (preenchida pelo trigger ao confirmar). Não confundir com fila_fritura (UI da produção).';


--
-- Name: funcionarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funcionarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    nome text NOT NULL,
    funcao text DEFAULT ''::text NOT NULL,
    tipo_remuneracao text DEFAULT 'mensal'::text NOT NULL,
    valor numeric(12,2) DEFAULT 0 NOT NULL,
    contato text DEFAULT ''::text NOT NULL,
    documentos text DEFAULT ''::text NOT NULL,
    admissao date,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT funcionarios_tipo_remuneracao_check CHECK ((tipo_remuneracao = ANY (ARRAY['mensal'::text, 'diaria'::text]))),
    CONSTRAINT funcionarios_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- Name: hero_carousel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hero_carousel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    imagem_url text NOT NULL,
    legenda text DEFAULT ''::text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: horario_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.horario_config (
    id boolean DEFAULT true NOT NULL,
    antecedencia_min integer DEFAULT 30 NOT NULL,
    teto_unidades_janela integer DEFAULT 2000 NOT NULL,
    tempo_fritura_50s integer DEFAULT 210 NOT NULL,
    CONSTRAINT horario_config_single CHECK ((id = true))
);


--
-- Name: indicacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indicacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    indicador_id uuid NOT NULL,
    codigo text NOT NULL,
    novo_user_id uuid,
    pontos_indicador integer DEFAULT 0 NOT NULL,
    pontos_novo integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT indicacoes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'valida'::text, 'fraude'::text, 'cancelada'::text])))
);


--
-- Name: insumo_lotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insumo_lotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    insumo_id uuid NOT NULL,
    quantidade numeric(14,3) NOT NULL,
    restante numeric(14,3) NOT NULL,
    custo_unitario numeric(14,4) DEFAULT 0 NOT NULL,
    validade date,
    fornecedor_id uuid,
    compra_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT insumo_lotes_custo_unitario_check CHECK ((custo_unitario >= (0)::numeric)),
    CONSTRAINT insumo_lotes_quantidade_check CHECK ((quantidade > (0)::numeric)),
    CONSTRAINT insumo_lotes_restante_check CHECK ((restante >= (0)::numeric))
);


--
-- Name: insumo_movimentacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insumo_movimentacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    insumo_id uuid NOT NULL,
    tipo text NOT NULL,
    quantidade numeric(14,3) NOT NULL,
    saldo_antes numeric(14,3) DEFAULT 0 NOT NULL,
    saldo_depois numeric(14,3) DEFAULT 0 NOT NULL,
    custo numeric(14,4),
    referencia text DEFAULT ''::text NOT NULL,
    usuario uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT insumo_movimentacoes_quantidade_check CHECK ((quantidade >= (0)::numeric)),
    CONSTRAINT insumo_movimentacoes_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text, 'perda'::text, 'ajuste'::text, 'inventario'::text, 'consumo'::text])))
);


--
-- Name: insumos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insumos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    categoria text DEFAULT ''::text NOT NULL,
    unidade_base text DEFAULT 'g'::text NOT NULL,
    estoque_atual numeric(14,3) DEFAULT 0 NOT NULL,
    estoque_minimo numeric(14,3) DEFAULT 0 NOT NULL,
    custo_medio numeric(14,4) DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT insumos_custo_medio_check CHECK ((custo_medio >= (0)::numeric)),
    CONSTRAINT insumos_estoque_atual_check CHECK ((estoque_atual >= (0)::numeric)),
    CONSTRAINT insumos_estoque_minimo_check CHECK ((estoque_minimo >= (0)::numeric)),
    CONSTRAINT insumos_unidade_base_check CHECK ((unidade_base = ANY (ARRAY['g'::text, 'kg'::text, 'ml'::text, 'l'::text, 'un'::text])))
);


--
-- Name: jornada_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jornada_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    etapa text NOT NULL,
    pedido_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT jornada_eventos_etapa_check CHECK ((etapa = ANY (ARRAY['visitou'::text, 'visualizou'::text, 'favoritou'::text, 'adicionou_carrinho'::text, 'iniciou_checkout'::text, 'comprou'::text, 'recebeu'::text, 'avaliou'::text, 'voltou'::text])))
);


--
-- Name: loja_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loja_config (
    id boolean DEFAULT true NOT NULL,
    nome text DEFAULT 'Néia Salgados'::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    endereco text DEFAULT ''::text NOT NULL,
    bairro text DEFAULT ''::text NOT NULL,
    cidade text DEFAULT ''::text NOT NULL,
    complemento text DEFAULT ''::text NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    instrucoes_retirada text DEFAULT ''::text NOT NULL,
    mapa_lat double precision,
    mapa_lng double precision,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    pix_chave text DEFAULT '24913937000116'::text NOT NULL,
    instagram text DEFAULT ''::text NOT NULL,
    facebook text DEFAULT ''::text NOT NULL,
    site text DEFAULT ''::text NOT NULL,
    google_avaliacao text DEFAULT ''::text NOT NULL,
    retirada_prazo_min integer DEFAULT 40 NOT NULL,
    retirada_prazo_max integer DEFAULT 60 NOT NULL,
    entrega_prazo_min integer DEFAULT 60 NOT NULL,
    entrega_prazo_max integer DEFAULT 90 NOT NULL,
    CONSTRAINT loja_config_id_check CHECK ((id = true)),
    CONSTRAINT loja_prazos_ordem_check CHECK (((retirada_prazo_min <= retirada_prazo_max) AND (entrega_prazo_min <= entrega_prazo_max))),
    CONSTRAINT loja_prazos_positivos_check CHECK (((retirada_prazo_min > 0) AND (retirada_prazo_max > 0) AND (entrega_prazo_min > 0) AND (entrega_prazo_max > 0)))
);


--
-- Name: COLUMN loja_config.instrucoes_retirada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.loja_config.instrucoes_retirada IS 'Texto que o cliente ve no checkout ao escolher retirada (ex: horario de funcionamento).';


--
-- Name: COLUMN loja_config.mapa_lat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.loja_config.mapa_lat IS 'Latitude da loja. Com latitude e longitude preenchidas, a loja aparece no mapa do pedido de retirada.';


--
-- Name: COLUMN loja_config.retirada_prazo_min; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.loja_config.retirada_prazo_min IS 'Prazo comercial mínimo da retirada em minutos (promessa ao cliente, não é tempo técnico).';


--
-- Name: COLUMN loja_config.entrega_prazo_max; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.loja_config.entrega_prazo_max IS 'Prazo comercial máximo da entrega em minutos (promessa ao cliente, não é tempo técnico).';


--
-- Name: lotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    codigo text NOT NULL,
    quantidade integer DEFAULT 0 NOT NULL,
    restante integer DEFAULT 0 NOT NULL,
    produzido_em date,
    validade date,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lotes_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'esgotado'::text, 'vencido'::text])))
);


--
-- Name: metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text DEFAULT 'mensal'::text NOT NULL,
    periodo_ref text DEFAULT ''::text NOT NULL,
    valor numeric(10,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metas_tipo CHECK ((tipo = ANY (ARRAY['diaria'::text, 'semanal'::text, 'mensal'::text])))
);


--
-- Name: motoboy_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motoboy_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid NOT NULL,
    rota_id uuid,
    pedido_id uuid,
    evento text NOT NULL,
    detalhe text,
    localizacao_lat double precision,
    localizacao_lng double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT motoboy_historico_evento_check CHECK ((evento = ANY (ARRAY['saida_base'::text, 'chegada_entrega'::text, 'entrega_realizada'::text, 'atraso'::text, 'retorno_base'::text, 'inicio_preparacao_saida'::text, 'fim_preparacao_saida'::text])))
);


--
-- Name: motoboys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motoboys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'disponivel_base'::text NOT NULL,
    ultima_base_em timestamp with time zone,
    user_id uuid,
    veiculo text,
    placa text,
    ultima_atualizacao timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text DEFAULT 'info'::text NOT NULL,
    titulo text DEFAULT ''::text NOT NULL,
    detalhe text DEFAULT ''::text NOT NULL,
    link text DEFAULT ''::text NOT NULL,
    lida boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orcamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orcamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    cliente_nome text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    tipo_evento text DEFAULT ''::text NOT NULL,
    pessoas integer DEFAULT 0 NOT NULL,
    data_evento date,
    horario text DEFAULT ''::text NOT NULL,
    mix jsonb DEFAULT '[]'::jsonb NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    taxa_entrega numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    pedido_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    validade date
);


--
-- Name: parceiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    categoria text NOT NULL,
    cidade text,
    bairro text,
    instagram text,
    site text,
    whatsapp text,
    descricao text,
    logo_url text,
    status text DEFAULT 'nova'::text NOT NULL,
    responsavel text,
    email text,
    cnpj text,
    proposta text,
    autoriza_divulgacao boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parceiros_status_check CHECK ((status = ANY (ARRAY['nova'::text, 'em_analise'::text, 'aprovada'::text, 'recusada'::text, 'contatada'::text, 'convertida'::text])))
);


--
-- Name: parceiros_publicos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.parceiros_publicos AS
 SELECT id,
    nome,
    categoria,
    cidade,
    bairro,
    instagram,
    site,
    descricao,
    logo_url
   FROM public.parceiros
  WHERE ((status = 'aprovada'::text) AND autoriza_divulgacao);


--
-- Name: pedido_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    produto_id uuid,
    nome text NOT NULL,
    preco_unitario numeric(10,2) NOT NULL,
    quantidade integer DEFAULT 1 NOT NULL
);


--
-- Name: pedido_lembretes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_lembretes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    tipo text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pedido_lembretes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'confirmado'::text, 'alterado'::text, 'cancelado'::text]))),
    CONSTRAINT pedido_lembretes_tipo_check CHECK ((tipo = ANY (ARRAY['7d'::text, '3d'::text, '24h'::text, 'dia'::text])))
);


--
-- Name: pedido_notas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_notas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    autor uuid,
    texto text DEFAULT ''::text NOT NULL,
    visivel_cliente boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pedido_numero_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedido_numero_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedido_status_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_status_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    de_status text,
    para_status text NOT NULL,
    actor uuid,
    motivo text,
    override boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pedido_status_historico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pedido_status_historico IS '0053: dono insere no próprio pedido (nascimento via checkout); staff como antes.';


--
-- Name: pedido_status_transicoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_status_transicoes (
    de_status public.order_status NOT NULL,
    para_status public.order_status NOT NULL
);


--
-- Name: TABLE pedido_status_transicoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pedido_status_transicoes IS 'Transições de status permitidas (admin ignora via role).';


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero integer DEFAULT nextval('public.pedido_numero_seq'::regclass) NOT NULL,
    user_id uuid,
    cliente_nome text NOT NULL,
    telefone text NOT NULL,
    endereco text NOT NULL,
    bairro text DEFAULT ''::text NOT NULL,
    complemento text DEFAULT ''::text NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    observacoes text DEFAULT ''::text NOT NULL,
    forma_pagamento public.pagamento DEFAULT 'pix'::public.pagamento NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    taxa_entrega numeric(10,2) DEFAULT 0 NOT NULL,
    desconto numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    cupom text,
    status public.order_status DEFAULT 'recebido'::public.order_status NOT NULL,
    producao_status public.prod_status DEFAULT 'aguardando'::public.prod_status NOT NULL,
    motoboy_id uuid,
    taxa_motoboy numeric(10,2) DEFAULT 6.00 NOT NULL,
    destino_lat double precision,
    destino_lng double precision,
    motoboy_lat double precision,
    motoboy_lng double precision,
    motoboy_atualizado_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    aceito_em timestamp with time zone,
    entregue_em timestamp with time zone,
    cidade text DEFAULT ''::text NOT NULL,
    agendado_para timestamp with time zone,
    agendamento_obs text DEFAULT ''::text NOT NULL,
    tipo_evento text DEFAULT ''::text NOT NULL,
    campanha_origem text DEFAULT ''::text NOT NULL,
    tipo_entrega text DEFAULT 'entrega'::text NOT NULL,
    pagamento_status text DEFAULT 'pendente'::text NOT NULL,
    pagamento_em timestamp with time zone,
    atrasado boolean DEFAULT false NOT NULL,
    problema text,
    agendamento_janela text,
    preparo_em timestamp with time zone,
    pronto_em timestamp with time zone,
    saiu_em timestamp with time zone,
    atraso_motivo text,
    atraso_descricao text,
    pode_subir boolean,
    tipo_imovel text,
    bloco text,
    apartamento text,
    interfone text,
    rota_id uuid,
    impresso boolean DEFAULT false NOT NULL,
    origem_parceiro_id uuid,
    indicado_por uuid,
    andar text,
    torre text,
    cpf_cnpj text,
    nome_fiscal text,
    origem_cliente text,
    cep text,
    confirmado_em timestamp with time zone,
    pago_em timestamp with time zone,
    pagamento_modalidade text DEFAULT 'online'::text NOT NULL,
    aceito_em_atendente timestamp with time zone,
    aceito_por uuid,
    liberado_em timestamp with time zone,
    liberado_por uuid,
    conferido_em timestamp with time zone,
    conferido_por uuid,
    conferencia_obs text,
    retirado_em timestamp with time zone,
    retirado_por uuid,
    aceito_motoboy_em timestamp with time zone,
    aceito_motoboy_por uuid,
    reserva_motoboy_em timestamp with time zone,
    CONSTRAINT pedidos_atraso_motivo_check CHECK (((atraso_motivo IS NULL) OR (atraso_motivo = ANY (ARRAY['transito'::text, 'chuva'::text, 'veiculo'::text, 'endereco'::text, 'cliente_ausente'::text, 'espera'::text, 'acidente_bloqueio'::text, 'outro'::text])))),
    CONSTRAINT pedidos_pagamento_modalidade_check CHECK ((pagamento_modalidade = ANY (ARRAY['online'::text, 'na_entrega'::text]))),
    CONSTRAINT pedidos_pagamento_status_check CHECK ((pagamento_status = ANY (ARRAY['pendente'::text, 'pago'::text, 'falhou'::text, 'reembolsado'::text]))),
    CONSTRAINT pedidos_tipo_entrega_check CHECK ((tipo_entrega = ANY (ARRAY['entrega'::text, 'retirada'::text])))
);


--
-- Name: TABLE pedidos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pedidos IS '...';


--
-- Name: COLUMN pedidos.motoboy_lat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.motoboy_lat IS 'Latitude do motoboy (atualizada via GPS). Visível para cliente dono do pedido, motoboy atribuído e staff.';


--
-- Name: COLUMN pedidos.motoboy_lng; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.motoboy_lng IS 'Longitude do motoboy (atualizada via GPS). Visível para cliente dono do pedido, motoboy atribuído e staff.';


--
-- Name: COLUMN pedidos.motoboy_atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.motoboy_atualizado_em IS 'Timestamp da última atualização de GPS. Visível para cliente dono do pedido, motoboy atribuído e staff.';


--
-- Name: COLUMN pedidos.cidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.cidade IS 'Cidade de entrega (obrigatória no checkout)';


--
-- Name: COLUMN pedidos.agendado_para; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.agendado_para IS 'Data/hora agendada para entrega/retirada';


--
-- Name: COLUMN pedidos.pagamento_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.pagamento_status IS 'Status financeiro, independente do status do pedido: pendente | pago | falhou | reembolsado.';


--
-- Name: COLUMN pedidos.pagamento_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.pagamento_em IS 'Quando o pagamento foi confirmado. Preenchido apenas por confirmação manual da loja.';


--
-- Name: COLUMN pedidos.pode_subir; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.pode_subir IS 'Se true, motoboy sobe até o apto; se false, cliente aguarda na portaria';


--
-- Name: COLUMN pedidos.tipo_imovel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.tipo_imovel IS 'casa | apartamento (para mensagem automática condominio)';


--
-- Name: COLUMN pedidos.confirmado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.confirmado_em IS 'Timestamp da confirmação de pagamento/pedido';


--
-- Name: COLUMN pedidos.pago_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.pago_em IS 'Timestamp da confirmação de pagamento (pix/dinheiro)';


--
-- Name: COLUMN pedidos.pagamento_modalidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.pagamento_modalidade IS 'Modalidade de pagamento: online (pix, credito, debito processados online) ou na_entrega (dinheiro, cartao/pix na entrega). Determina quando imprimir cupom.';


--
-- Name: COLUMN pedidos.aceito_em_atendente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.aceito_em_atendente IS 'E1: aceite da atendente (não reutiliza aceito_em do motoboy). Não altera pagamento_status.';


--
-- Name: COLUMN pedidos.liberado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.liberado_em IS 'E1: janela de liberação para a cozinha atingida.';


--
-- Name: COLUMN pedidos.conferido_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.conferido_em IS 'E1: conferência final da cozinha.';


--
-- Name: COLUMN pedidos.retirado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.retirado_em IS 'E1: confirmação autorizada de retirada (tipo_entrega=retirada).';


--
-- Name: COLUMN pedidos.aceito_motoboy_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.aceito_motoboy_em IS 'E5: aceite explícito do motoboy (distinto de aceito_em, que a atribuição admin preenche por compatibilidade legada).';


--
-- Name: COLUMN pedidos.reserva_motoboy_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos.reserva_motoboy_em IS 'E1: reserva para rota (motoboy_id segue = auth.users.id). E5: reserva NÃO altera motoboys.status (ver triggers de saída/retorno); "reservado" é derivado de rota preparando + este carimbo.';


--
-- Name: pedidos_recorrentes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos_recorrentes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    cliente_nome text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    endereco text DEFAULT ''::text NOT NULL,
    bairro text DEFAULT ''::text NOT NULL,
    cidade text DEFAULT ''::text NOT NULL,
    complemento text DEFAULT ''::text NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    forma_pagamento text DEFAULT 'pix'::text NOT NULL,
    itens jsonb DEFAULT '[]'::jsonb NOT NULL,
    frequencia text DEFAULT 'semanal'::text NOT NULL,
    proxima_execucao date DEFAULT CURRENT_DATE NOT NULL,
    modo_confirmacao text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pagamento_modalidade text DEFAULT 'online'::text NOT NULL,
    CONSTRAINT rec_frequencia CHECK ((frequencia = ANY (ARRAY['semanal'::text, 'quinzenal'::text, 'mensal'::text]))),
    CONSTRAINT rec_modo CHECK ((modo_confirmacao = ANY (ARRAY['manual'::text, 'whatsapp'::text]))),
    CONSTRAINT rec_status CHECK ((status = ANY (ARRAY['ativo'::text, 'pausado'::text, 'cancelado'::text]))),
    CONSTRAINT recorrentes_pagamento_modalidade_check CHECK ((pagamento_modalidade = ANY (ARRAY['online'::text, 'na_entrega'::text])))
);


--
-- Name: COLUMN pedidos_recorrentes.pagamento_modalidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedidos_recorrentes.pagamento_modalidade IS 'Modalidade de pagamento: online (pix, credito, debito processados online) ou na_entrega (dinheiro, cartao/pix na entrega). Determina quando imprimir cupom ao gerar pedido.';


--
-- Name: pix_notification_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pix_notification_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_hash text NOT NULL,
    source_app text NOT NULL,
    bank_name text,
    notification_title text NOT NULL,
    notification_text text NOT NULL,
    amount numeric(10,2),
    sender_name text,
    reference text,
    detected_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    status text DEFAULT 'PENDING'::text NOT NULL,
    matched_order_id uuid,
    environment text DEFAULT 'TEST'::text NOT NULL,
    device_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    device_identifier text,
    conferencia_motivo text
);


--
-- Name: TABLE pix_notification_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pix_notification_events IS 'Events from Android Pix notification listener. Tracks detected Pix notifications for order matching and payment processing.';


--
-- Name: COLUMN pix_notification_events.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_notification_events.status IS 'PENDING: waiting processing, PROCESSED: matched and identified, DUPLICATE: duplicate event, INVALID: invalid format, ERROR: processing error, TEST: test event';


--
-- Name: COLUMN pix_notification_events.environment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_notification_events.environment IS 'TEST: development/test environment, PRODUCTION: production environment';


--
-- Name: COLUMN pix_notification_events.device_identifier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_notification_events.device_identifier IS 'Identificador text do aparelho (igual a pix_reader_devices.device_identifier). device_id uuid legado mantido p/ compat.';


--
-- Name: COLUMN pix_notification_events.conferencia_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_notification_events.conferencia_motivo IS 'Quando status=CONFERIR: sem_pedido_valor | multiplos_pedidos_mesmo_valor.';


--
-- Name: pix_reader_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pix_reader_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_name text NOT NULL,
    device_identifier text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone DEFAULT now() NOT NULL,
    app_version text DEFAULT '1.0.0'::text NOT NULL,
    environment text DEFAULT 'TEST'::text NOT NULL,
    revoked_at timestamp with time zone,
    token_hash text
);


--
-- Name: TABLE pix_reader_devices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pix_reader_devices IS 'Authorized devices for Néia Pix Reader Android APK. Tracks registered devices for security and monitoring.';


--
-- Name: COLUMN pix_reader_devices.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_reader_devices.status IS 'ACTIVE: device active and authorized, INACTIVE: device inactive, REVOKED: device revoked by admin, TEST: test device';


--
-- Name: COLUMN pix_reader_devices.environment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_reader_devices.environment IS 'TEST: development/test environment, PRODUCTION: production environment';


--
-- Name: COLUMN pix_reader_devices.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pix_reader_devices.token_hash IS 'SHA-256 hex do token do aparelho. A API compara; token puro nunca é gravado.';


--
-- Name: plano_contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plano_contas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    grupo text DEFAULT 'despesas'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    CONSTRAINT plano_contas_grupo_check CHECK ((grupo = ANY (ARRAY['receitas'::text, 'custos_variaveis'::text, 'despesas_fixas'::text, 'impostos'::text, 'pro_labore'::text, 'investimentos'::text, 'outros'::text])))
);


--
-- Name: pontos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pontos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funcionario_id uuid NOT NULL,
    user_id uuid,
    data date DEFAULT CURRENT_DATE NOT NULL,
    entrada timestamp with time zone,
    saida timestamp with time zone,
    local_info text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pontos_creditos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pontos_creditos (
    pedido_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pontos integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: precificacao_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precificacao_config (
    id boolean DEFAULT true NOT NULL,
    margem_desejada_pct numeric(5,2) DEFAULT 40 NOT NULL,
    margem_baixa_pct numeric(5,2) DEFAULT 15 NOT NULL,
    mao_obra_hora numeric(10,2) DEFAULT 25 NOT NULL,
    gas_hora numeric(10,2) DEFAULT 8 NOT NULL,
    custos_fixos_mensais numeric(12,2) DEFAULT 6000 NOT NULL,
    volume_mensal_estimado integer DEFAULT 10000 NOT NULL,
    taxa_credito_pct numeric(5,2) DEFAULT 5 NOT NULL,
    taxa_debito_pct numeric(5,2) DEFAULT 2 NOT NULL,
    taxa_pix_pct numeric(5,2) DEFAULT 0 NOT NULL,
    taxa_ifood_pct numeric(5,2) DEFAULT 27 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT precificacao_config_custos_fixos_mensais_check CHECK ((custos_fixos_mensais >= (0)::numeric)),
    CONSTRAINT precificacao_config_gas_hora_check CHECK ((gas_hora >= (0)::numeric)),
    CONSTRAINT precificacao_config_mao_obra_hora_check CHECK ((mao_obra_hora >= (0)::numeric)),
    CONSTRAINT precificacao_config_margem_baixa_pct_check CHECK (((margem_baixa_pct >= (0)::numeric) AND (margem_baixa_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_margem_desejada_pct_check CHECK (((margem_desejada_pct >= (0)::numeric) AND (margem_desejada_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_credito_pct_check CHECK (((taxa_credito_pct >= (0)::numeric) AND (taxa_credito_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_debito_pct_check CHECK (((taxa_debito_pct >= (0)::numeric) AND (taxa_debito_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_ifood_pct_check CHECK (((taxa_ifood_pct >= (0)::numeric) AND (taxa_ifood_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_taxa_pix_pct_check CHECK (((taxa_pix_pct >= (0)::numeric) AND (taxa_pix_pct < (100)::numeric))),
    CONSTRAINT precificacao_config_uma_linha CHECK ((id = true)),
    CONSTRAINT precificacao_config_volume_mensal_estimado_check CHECK ((volume_mensal_estimado > 0))
);


--
-- Name: preco_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preco_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produto_id uuid NOT NULL,
    preco_antigo numeric(10,2) NOT NULL,
    preco_novo numeric(10,2) NOT NULL,
    usuario uuid,
    motivo text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    preco numeric(10,2) NOT NULL,
    preco_promocional numeric(10,2),
    imagem_url text,
    disponivel boolean DEFAULT true NOT NULL,
    estoque integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_venda text DEFAULT 'combo_50'::text NOT NULL,
    destaque boolean DEFAULT false NOT NULL,
    promo_inicio timestamp with time zone,
    promo_fim timestamp with time zone,
    promo_ativo boolean DEFAULT true NOT NULL,
    estoque_minimo integer DEFAULT 0 NOT NULL,
    estoque_maximo integer,
    unidade_medida text DEFAULT 'un'::text NOT NULL,
    custo numeric(10,2),
    tempo_fritura_50s integer DEFAULT 210 NOT NULL,
    descricao_fiscal text,
    ncm text,
    cest text,
    cfop_padrao text,
    cst text,
    csosn text,
    origem_mercadoria text,
    gtin text,
    tempo_fritura_s integer,
    embalagem_custo numeric(10,2),
    tempo_fritura_base_segundos integer DEFAULT 210,
    unidade_base_tempo_fritura integer DEFAULT 50,
    tempo_mao_obra_min numeric(8,2) DEFAULT 0.5 NOT NULL,
    CONSTRAINT produtos_tempo_fritura_base_segundos_check CHECK ((tempo_fritura_base_segundos > 0)),
    CONSTRAINT produtos_tempo_mao_obra_min_check CHECK ((tempo_mao_obra_min >= (0)::numeric)),
    CONSTRAINT produtos_tipo_venda_check CHECK ((tipo_venda = ANY (ARRAY['combo_50'::text, 'unidade'::text]))),
    CONSTRAINT produtos_unidade_base_tempo_fritura_check CHECK ((unidade_base_tempo_fritura > 0))
);


--
-- Name: COLUMN produtos.tipo_venda; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.tipo_venda IS 'combo_50 = múltiplos de 50; unidade = venda avulsa';


--
-- Name: COLUMN produtos.destaque; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.destaque IS 'Aparece na seção Destaques do cardápio';


--
-- Name: COLUMN produtos.custo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.custo IS 'Custo unitário do produto (para rentabilidade)';


--
-- Name: COLUMN produtos.embalagem_custo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.embalagem_custo IS 'Custo de embalagem por unidade';


--
-- Name: COLUMN produtos.tempo_fritura_base_segundos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.tempo_fritura_base_segundos IS 'Tempo base em segundos para unidade_base_tempo_fritura unidades (ex: 210s = 3:30 para 50un).';


--
-- Name: COLUMN produtos.tempo_mao_obra_min; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produtos.tempo_mao_obra_min IS 'Minutos de mão de obra por unidade (custo = tempo × R$/h ÷ rendimento).';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    nome text DEFAULT ''::text NOT NULL,
    telefone text DEFAULT ''::text NOT NULL,
    pontos integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE push_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.push_subscriptions IS '0055: staff lê existência (evita WhatsApp redundante); envio só via push-enviar.';


--
-- Name: reservas_estoque; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas_estoque (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    produto_id uuid,
    lote_id uuid,
    quantidade integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'ativa'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reservas_estoque_status_check CHECK ((status = ANY (ARRAY['ativa'::text, 'liberada'::text, 'consumida'::text, 'cancelada'::text])))
);


--
-- Name: rota_pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rota_pedidos (
    rota_id uuid NOT NULL,
    pedido_id uuid NOT NULL,
    ordem integer DEFAULT 1 NOT NULL
);


--
-- Name: rotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rotas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid NOT NULL,
    status text DEFAULT 'ativa'::text NOT NULL,
    observacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    concluida_em timestamp with time zone,
    CONSTRAINT rotas_status_check CHECK ((status = ANY (ARRAY['ativa'::text, 'concluida'::text, 'cancelada'::text])))
);


--
-- Name: rotas_entrega; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rotas_entrega (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid,
    status text DEFAULT 'preparando'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    saiu_em timestamp with time zone,
    chegou_em timestamp with time zone,
    CONSTRAINT rotas_entrega_status_check CHECK ((status = ANY (ARRAY['preparando'::text, 'em_rota'::text, 'concluida'::text, 'cancelada'::text])))
);


--
-- Name: solicitacoes_contador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitacoes_contador (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competencia text DEFAULT ''::text NOT NULL,
    texto text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'aberta'::text NOT NULL,
    resposta text DEFAULT ''::text NOT NULL,
    anexo_url text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    respondida_em timestamp with time zone,
    CONSTRAINT solicitacoes_contador_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'respondida'::text, 'fechada'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: vales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    funcionario_id uuid NOT NULL,
    valor numeric(12,2) NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    descricao text DEFAULT ''::text NOT NULL,
    descontado boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vales_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text,
    public boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.users (id, email, raw_user_meta_data, created_at) FROM stdin;
11111111-1111-1111-1111-111111111111	admin@homolog.local	{"nome": "Admin Homolog"}	2026-10-19 10:45:24.158428-03
22222222-2222-2222-2222-222222222222	atendente@homolog.local	{"nome": "Atendente Homolog"}	2026-10-19 10:45:24.158428-03
33333333-3333-3333-3333-333333333333	producao@homolog.local	{"nome": "Producao Homolog"}	2026-10-19 10:45:24.158428-03
44444444-4444-4444-4444-444444444444	cliente@homolog.local	{"nome": "Cliente Homolog"}	2026-10-19 10:45:24.158428-03
55555555-5555-5555-5555-555555555555	outsider@homolog.local	{"nome": "Outsider Homolog"}	2026-10-19 10:45:24.158428-03
66666666-6666-6666-6666-666666666666	motoboy@homolog.local	{"nome": "Motoboy Homolog"}	2026-10-19 10:45:24.158428-03
\.


--
-- Data for Name: acertos_motoboy; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.acertos_motoboy (id, motoboy_id, periodo_ini, periodo_fim, entregas, taxas, vales, liquido, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_logs (id, actor, acao, detalhe, created_at) FROM stdin;
\.


--
-- Data for Name: ajuda_artigos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ajuda_artigos (id, categoria, titulo, corpo, ativo) FROM stdin;
55bcafb3-cf02-4519-8d4a-b5fd3279957e	pedidos	Como acompanhar meu pedido?	Abra Conta → Meus pedidos ou o link do pedido. Os status mostram preparação, saída e entrega.	t
ffda40f8-0fc7-488e-a5f9-b5f882e2f666	combos	Por que combos são de 50 em 50?	Combos de festa são produzidos em caixas de 50. O carrinho arredonda para 50, 100, 150… Congelados e bebidas vendem por unidade.	t
fdb4b117-e0b7-45ef-8262-1b9fb188fbbf	entrega	Entrega ou retirada?	Entrega tem taxa e vai com motoboy. Retirada é na loja, sem taxa, com endereço e mapa no pedido.	t
c2a3f555-ce48-4c6f-915a-67d588b95777	pagamento	Como pago?	PIX com QR/Copia e Cola, dinheiro, crédito ou débito. O pagamento começa pendente e a loja confirma.	t
23145998-4ed6-4546-9278-68f0fcdd2393	agendamento	Posso agendar?	Sim, Seg–Sáb 08–12h e 13–22h (nunca 12–13h, Dom fechado), com 30min de antecedência.	t
\.


--
-- Data for Name: avaliacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.avaliacoes (id, produto_id, user_id, nota, comentario, created_at, pedido_id, prazo, atendimento, autoriza_publicar, aprovada) FROM stdin;
\.


--
-- Data for Name: caixa_sessoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.caixa_sessoes (id, aberta_em, fechada_em, saldo_inicial, saldo_informado, diferenca, responsavel, status, observacao) FROM stdin;
\.


--
-- Data for Name: calculadora_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.calculadora_config (id, permitir_personalizado, por_pessoa_padrao, minimo_por_pessoa, maximo_por_pessoa, zap_contato, orcamento_validade_dias) FROM stdin;
t	t	20	15	40		3
\.


--
-- Data for Name: campanha_cliques; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campanha_cliques (id, slug, created_at) FROM stdin;
\.


--
-- Data for Name: carrinho_eventos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.carrinho_eventos (id, user_id, telefone, etapa, itens, subtotal, created_at) FROM stdin;
\.


--
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categorias (id, nome, slug, ordem, ativo) FROM stdin;
e13cd9f4-0a52-4d27-b722-8519dd427594	Mini Congelados	mini-congelados	6	t
001b365c-2602-4cd9-9afa-0eab57405a43	Kits para Festa	kits-para-festa	7	t
6bf8fdcb-4097-442c-b0e5-4002752c96be	Bebidas	bebidas	8	t
da50d15c-c3ba-4392-976a-e7f140f55518	Mini Fritos	mini-fritos	1	t
ca6d98a9-0297-4c0f-8353-0ba797440806	Mini Assados	mini-assados	2	t
8a8056b6-5fef-4352-98d5-773983f9af9b	Mini Pastéis	mini-pasteis	3	t
47f479e0-af03-48be-a1da-595c29d7188f	Mini Pizzas	mini-pizzas	4	t
2fa005d3-850a-4ecc-b835-96dc3340c137	Mini Empadinhas	mini-empadinhas	5	t
99999999-9999-4999-8999-999999999999	Testes Homologacao	testes-homologacao	99	t
\.


--
-- Data for Name: centros_custo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.centros_custo (id, nome, ativo) FROM stdin;
ed40d2a5-7b36-4781-a544-5988efa7e86f	cozinha	t
ca74370c-09fa-4f32-86b3-a8edca3258d5	marketing	t
e133b6ef-fa94-45a9-9fa3-17e97d53f38d	administrativo	t
fe06f4f3-e3ec-429e-8e6b-9a20af0a4118	entrega	t
\.


--
-- Data for Name: compra_itens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compra_itens (id, compra_id, insumo_id, quantidade, unidade, custo_unitario, quantidade_recebida) FROM stdin;
\.


--
-- Data for Name: compras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compras (id, fornecedor_id, status, observacao, created_by, created_at, recebida_em) FROM stdin;
\.


--
-- Data for Name: contador_acessos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contador_acessos (id, usuario, competencia, acao, created_at) FROM stdin;
\.


--
-- Data for Name: contas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contas (id, tipo, descricao, categoria, fornecedor, valor, meio, vencimento, pago_em, status, pedido_id, parcela_atual, parcela_total, recorrente, created_by, created_at, updated_at, centro_custo, conta_bancaria_id, anexo_url, valor_pago) FROM stdin;
\.


--
-- Data for Name: contas_bancarias; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contas_bancarias (id, nome, tipo, saldo_inicial, ativa, created_at) FROM stdin;
\.


--
-- Data for Name: crm_campaigns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crm_campaigns (id, nome, segmento, filtros, mensagem_template, link_rastreavel, status, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: crm_customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crm_customers (telefone_norm, nome, email, user_id, endereco_recente, bairro, cidade, opt_out, notas, created_at, updated_at, data_nascimento, tipo_cliente, razao_social, nome_fantasia, cnpj, responsavel) FROM stdin;
\.


--
-- Data for Name: crm_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crm_events (id, telefone_norm, tipo, pedido_id, campaign_id, created_at, meta) FROM stdin;
\.


--
-- Data for Name: crm_recipients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crm_recipients (campaign_id, telefone_norm, nome_snapshot, variaveis, status, motivo, sent_at) FROM stdin;
\.


--
-- Data for Name: crm_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.crm_settings (id, ativo_ate_dias, risco_apos_dias, inativo_apos_dias, muito_inativo_apos_dias, intervalo_min_campanhas_dias, campanhas_habilitadas, mensagem_padrao, vip_min_pedidos, vip_min_valor, freq_min_pedidos, sugestoes_ativas, recompra_ativa, carrinho_recuperacao_ativa, fid_ativo, fid_reais_por_ponto, fid_meta_pontos, fid_recompensa_valor) FROM stdin;
t	30	31	46	91	7	t	Olá {{cliente}}! Sentimos sua falta aqui na Néia Salgados! Já faz {{dias_sem_comprar}} dias desde seu último pedido. Quer receber nosso cardápio? {{link_cardapio}}	0	500.00	4	t	t	t	t	5.00	200	20.00
\.


--
-- Data for Name: cupons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cupons (id, codigo, tipo, valor, minimo, ativo, cliente_telefone, validade_ini, validade_fim, max_usos, produtos_ids) FROM stdin;
325eb07b-1aeb-4d6b-ae00-9e75425930d8	NEIA10	percentual	10.00	50.00	t		\N	\N	0	[]
e4e61a19-9566-4344-9881-c27b6a4ba1da	FRETEGRATIS	valor	6.00	80.00	t		\N	\N	0	[]
50fce18b-ae68-4c8a-9dbc-098dc529bd82	TESTE10	percentual	10.00	0.00	t		\N	\N	0	[]
bc50c83b-204b-42fa-b9d3-31bbe27694eb	TESTEVALOR	valor	5.00	0.00	t		\N	\N	0	[]
2c8ada14-b71c-498f-a0ec-1dc2d21f521d	TESTEESGOTADO	percentual	10.00	0.00	t		\N	\N	1	[]
b7578e0a-607a-4b26-bed2-05f64f92b04a	TESTEINATIVO	percentual	10.00	0.00	f		\N	\N	0	[]
15f0c8e8-df81-450b-a024-7d4a1a16cf9e	TESTEMIN	percentual	10.00	1000.00	t		\N	\N	0	[]
8df2f2a0-8f9c-487b-aad5-94bb77bcca08	TESTEPRODUTO	percentual	10.00	0.00	t		\N	\N	0	["aaaaaaaa-aaaa-4aaa-8aaa-000000000008"]
d40758d4-9190-40e7-b45e-4b052a6d55ca	TESTECLIENTE	percentual	10.00	0.00	t	11999998888	\N	\N	0	[]
\.


--
-- Data for Name: datas_demanda; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.datas_demanda (id, ocasiao, data, mensagem, antecedencia_dias, nivel, ativo) FROM stdin;
\.


--
-- Data for Name: degustacao_regras; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.degustacao_regras (id, qtd_minima, valor_minimo, pessoas_minimas) FROM stdin;
t	500	500	30
\.


--
-- Data for Name: degustacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.degustacoes (id, user_id, orcamento_id, pedido_id, status, created_at) FROM stdin;
\.


--
-- Data for Name: despesas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.despesas (id, data, descricao, valor, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: documento_eventos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documento_eventos (id, documento_id, evento, detalhe, actor, created_at) FROM stdin;
\.


--
-- Data for Name: documento_fiscal_itens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documento_fiscal_itens (id, documento_id, produto_id, n_item, codigo_produto, descricao, ncm, cest, cfop, unidade, quantidade, valor_unitario, valor_total, icms_origem, icms_cst, icms_csosn, icms_aliquota, icms_valor, icms_base, ipi_cst, ipi_aliquota, ipi_valor, pis_cst, pis_aliquota, pis_valor, cofins_cst, cofins_aliquota, cofins_valor, inf_adicionais, created_at) FROM stdin;
\.


--
-- Data for Name: documentos_fiscais; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documentos_fiscais (id, pedido_id, modelo, serie, numero, ambiente, status, chave_acesso, protocolo, codigo_rejeicao, mensagem_rejeicao, xml, danfe_url, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: empresa_fiscal; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.empresa_fiscal (id, razao_social, nome_fantasia, cnpj, inscricao_estadual, inscricao_municipal, endereco, numero, complemento, bairro, cidade, uf, cep, regime_tributario, serie, numero_inicial, ambiente, modelo_padrao, provedor, csc_id, info_adicionais, atualizado_em) FROM stdin;
t											SP				1	homologacao					2026-10-19 10:44:53.284204-03
\.


--
-- Data for Name: enderecos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.enderecos (id, user_id, rua, numero, bairro, complemento, referencia, created_at) FROM stdin;
\.


--
-- Data for Name: entrega_atrasos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.entrega_atrasos (id, pedido_id, motoboy_id, motivo, descricao_outro, criado_em, resolvido_em, criado_por) FROM stdin;
\.


--
-- Data for Name: escalas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.escalas (id, funcionario_id, dia_semana, entrada, saida) FROM stdin;
\.


--
-- Data for Name: estoque_mov; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.estoque_mov (id, produto_id, tipo, quantidade, motivo, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: estoque_movimentacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.estoque_movimentacoes (id, produto_id, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior, referencia_id, referencia_tipo, usuario_id, observacao, created_at, processada_em) FROM stdin;
\.


--
-- Data for Name: extratos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.extratos (id, conta_bancaria_id, arquivo, linha, data, descricao, valor, referencia, status, vinculo_tipo, vinculo_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: favoritos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.favoritos (user_id, produto_id) FROM stdin;
\.


--
-- Data for Name: fechamentos_mensais; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fechamentos_mensais (competencia, status, enviado_em, conferido_em, fechado_por, obs, updated_at) FROM stdin;
\.


--
-- Data for Name: ficha_itens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ficha_itens (id, ficha_id, insumo_id, quantidade, unidade) FROM stdin;
1cd7e319-0c72-4382-a243-a1437ec92a41	8c883175-d71d-4520-9f6e-fbd591c63440	446f85a7-d100-47f5-be9a-658ec04d1e87	25.0000	g
\.


--
-- Data for Name: fichas_tecnicas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fichas_tecnicas (id, produto_id, rendimento, perda_pct, por_cento, obs, updated_at) FROM stdin;
8c883175-d71d-4520-9f6e-fbd591c63440	32bdea52-5866-4c75-ac2b-89be77bf51a2	1.000	4.00	f	DEMO — ficha de exemplo	2026-10-19 10:44:54.988891-03
\.


--
-- Data for Name: fila_fritura; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fila_fritura (id, pedido_id, produto_id, quantidade, tempo_est_s, inicio, fim, tempo_real_s, status, funcionario, created_at) FROM stdin;
\.


--
-- Data for Name: fila_impressao; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fila_impressao (id, trabalho_uuid, pedido_id, tipo, payload, impressora, status, tentativa, ultimo_erro, reimpressoes, motivo_reimpressao, imprimir_apos, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: fiscal_certificados; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fiscal_certificados (id, empresa_id, nome, tipo, ref_cofre, senha_ref_cofre, cnpj_titular, validade_inicio, validade_fim, status, ambiente, created_at, atualizado_em) FROM stdin;
\.


--
-- Data for Name: fiscal_provedor_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fiscal_provedor_config (id, provedor, ambiente, url_base, token, timeout_segundos, homologacao_url, producao_url, homologacao_token, producao_token, certificado_ref, certificado_senha_ref, csc_id, csc_token, contingencia_habilitada, contingencia_tipo, atualizado_em) FROM stdin;
t	focus	homologacao			30	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	2026-10-19 10:44:53.76348-03
\.


--
-- Data for Name: fornecedores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fornecedores (id, nome, cnpj, contato, prazo_entrega_dias, condicoes_pagamento, ativo, created_at) FROM stdin;
dddbcf29-ca48-4130-84b1-f911c5591581	DEMO Atacadão		(11) 90000-0000	3	à vista	t	2026-10-19 10:44:54.969619-03
\.


--
-- Data for Name: fritura_fila; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fritura_fila (id, pedido_id, produto_id, quantidade, tempo_previsto_segundos, inicio, fim, status, funcionario_id, observacao, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: funcionarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.funcionarios (id, user_id, nome, funcao, tipo_remuneracao, valor, contato, documentos, admissao, ativo, created_at) FROM stdin;
\.


--
-- Data for Name: hero_carousel; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hero_carousel (id, imagem_url, legenda, ordem, ativo, created_at) FROM stdin;
\.


--
-- Data for Name: horario_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.horario_config (id, antecedencia_min, teto_unidades_janela, tempo_fritura_50s) FROM stdin;
t	30	2000	210
\.


--
-- Data for Name: indicacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.indicacoes (id, indicador_id, codigo, novo_user_id, pontos_indicador, pontos_novo, status, created_at) FROM stdin;
\.


--
-- Data for Name: insumo_lotes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.insumo_lotes (id, insumo_id, quantidade, restante, custo_unitario, validade, fornecedor_id, compra_id, created_at) FROM stdin;
31f445d9-5230-4261-a686-70a727a0a3fa	446f85a7-d100-47f5-be9a-658ec04d1e87	5000.000	5000.000	0.0120	\N	dddbcf29-ca48-4130-84b1-f911c5591581	\N	2026-10-19 10:44:54.978689-03
9edacbd1-6034-459f-86c6-5f09990f3485	0782fc7a-6d26-49b2-9aca-b4e441d61e8a	5000.000	5000.000	0.0120	\N	dddbcf29-ca48-4130-84b1-f911c5591581	\N	2026-10-19 10:44:54.978689-03
5af030b9-e20a-4406-ae20-9957f2710ef6	f82ea7e1-2147-45f5-ba6c-da5bb25b9a08	5000.000	5000.000	0.0120	\N	dddbcf29-ca48-4130-84b1-f911c5591581	\N	2026-10-19 10:44:54.978689-03
\.


--
-- Data for Name: insumo_movimentacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.insumo_movimentacoes (id, insumo_id, tipo, quantidade, saldo_antes, saldo_depois, custo, referencia, usuario, created_at) FROM stdin;
dd13fd28-0af5-48e1-ba67-6b5de377eb39	446f85a7-d100-47f5-be9a-658ec04d1e87	entrada	5000.000	0.000	5000.000	0.0120	DEMO inicial	\N	2026-10-19 10:44:54.978689-03
2968f775-5658-408e-bc71-d14379892d38	0782fc7a-6d26-49b2-9aca-b4e441d61e8a	entrada	5000.000	0.000	5000.000	0.0120	DEMO inicial	\N	2026-10-19 10:44:54.978689-03
a953050c-7ce6-4316-a1c2-e2bcb9ac0602	f82ea7e1-2147-45f5-ba6c-da5bb25b9a08	entrada	5000.000	0.000	5000.000	0.0120	DEMO inicial	\N	2026-10-19 10:44:54.978689-03
\.


--
-- Data for Name: insumos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.insumos (id, nome, categoria, unidade_base, estoque_atual, estoque_minimo, custo_medio, ativo, created_at, updated_at) FROM stdin;
446f85a7-d100-47f5-be9a-658ec04d1e87	DEMO Frango desfiado	proteína	g	5000.000	2000.000	0.0120	t	2026-10-19 10:44:54.972688-03	2026-10-19 10:44:54.972688-03
0782fc7a-6d26-49b2-9aca-b4e441d61e8a	DEMO Farinha de trigo	secos	g	5000.000	2000.000	0.0120	t	2026-10-19 10:44:54.972688-03	2026-10-19 10:44:54.972688-03
f82ea7e1-2147-45f5-ba6c-da5bb25b9a08	DEMO Óleo de soja	óleos	g	5000.000	2000.000	0.0120	t	2026-10-19 10:44:54.972688-03	2026-10-19 10:44:54.972688-03
\.


--
-- Data for Name: jornada_eventos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jornada_eventos (id, user_id, etapa, pedido_id, created_at) FROM stdin;
\.


--
-- Data for Name: loja_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loja_config (id, nome, telefone, endereco, bairro, cidade, complemento, referencia, instrucoes_retirada, mapa_lat, mapa_lng, atualizado_em, pix_chave, instagram, facebook, site, google_avaliacao, retirada_prazo_min, retirada_prazo_max, entrega_prazo_min, entrega_prazo_max) FROM stdin;
t	Néia Salgados		Rua da Loja, 100	Centro	Sao Paulo				\N	\N	2026-10-19 10:44:52.810395-03	24913937000116					40	60	60	90
\.


--
-- Data for Name: lotes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lotes (id, produto_id, codigo, quantidade, restante, produzido_em, validade, status, created_at) FROM stdin;
\.


--
-- Data for Name: metas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.metas (id, tipo, periodo_ref, valor, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: motoboy_historico; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.motoboy_historico (id, motoboy_id, rota_id, pedido_id, evento, detalhe, localizacao_lat, localizacao_lng, created_at) FROM stdin;
\.


--
-- Data for Name: motoboys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.motoboys (id, nome, telefone, observacao, ativo, created_at, status, ultima_base_em, user_id, veiculo, placa, ultima_atualizacao) FROM stdin;
\.


--
-- Data for Name: notificacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notificacoes (id, tipo, titulo, detalhe, link, lida, created_at) FROM stdin;
\.


--
-- Data for Name: orcamentos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orcamentos (id, user_id, cliente_nome, telefone, tipo_evento, pessoas, data_evento, horario, mix, observacoes, subtotal, taxa_entrega, total, status, pedido_id, created_at, validade) FROM stdin;
\.


--
-- Data for Name: parceiros; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parceiros (id, nome, categoria, cidade, bairro, instagram, site, whatsapp, descricao, logo_url, status, responsavel, email, cnpj, proposta, autoriza_divulgacao, created_at) FROM stdin;
\.


--
-- Data for Name: pedido_itens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_itens (id, pedido_id, produto_id, nome, preco_unitario, quantidade) FROM stdin;
\.


--
-- Data for Name: pedido_lembretes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_lembretes (id, pedido_id, tipo, status, created_at) FROM stdin;
\.


--
-- Data for Name: pedido_notas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_notas (id, pedido_id, autor, texto, visivel_cliente, created_at) FROM stdin;
\.


--
-- Data for Name: pedido_status_historico; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_status_historico (id, pedido_id, de_status, para_status, actor, motivo, override, created_at) FROM stdin;
\.


--
-- Data for Name: pedido_status_transicoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_status_transicoes (de_status, para_status) FROM stdin;
recebido	em_producao
recebido	cancelado
em_producao	pronto
em_producao	cancelado
pronto	aguardando_motoboy
pronto	cancelado
aguardando_motoboy	em_rota
aguardando_motoboy	cancelado
em_rota	entregue
em_rota	cancelado
pronto	entregue
em_producao	recebido
pronto	em_producao
aguardando_motoboy	pronto
em_rota	aguardando_motoboy
\.


--
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedidos (id, numero, user_id, cliente_nome, telefone, endereco, bairro, complemento, referencia, observacoes, forma_pagamento, subtotal, taxa_entrega, desconto, total, cupom, status, producao_status, motoboy_id, taxa_motoboy, destino_lat, destino_lng, motoboy_lat, motoboy_lng, motoboy_atualizado_em, created_at, aceito_em, entregue_em, cidade, agendado_para, agendamento_obs, tipo_evento, campanha_origem, tipo_entrega, pagamento_status, pagamento_em, atrasado, problema, agendamento_janela, preparo_em, pronto_em, saiu_em, atraso_motivo, atraso_descricao, pode_subir, tipo_imovel, bloco, apartamento, interfone, rota_id, impresso, origem_parceiro_id, indicado_por, andar, torre, cpf_cnpj, nome_fiscal, origem_cliente, cep, confirmado_em, pago_em, pagamento_modalidade, aceito_em_atendente, aceito_por, liberado_em, liberado_por, conferido_em, conferido_por, conferencia_obs, retirado_em, retirado_por, aceito_motoboy_em, aceito_motoboy_por, reserva_motoboy_em) FROM stdin;
eeeeeeee-eeee-4eee-8eee-000000000001	1507	44444444-4444-4444-4444-444444444444	Consumo Cupom	11999998888	Retirada	Centro				pix	100.00	0.00	0.00	100.00	TESTEESGOTADO	recebido	aguardando	\N	6.00	\N	\N	\N	\N	\N	2026-10-19 12:14:48.477999-03	\N	\N	Sao Paulo	\N				retirada	pendente	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	online	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: pedidos_recorrentes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedidos_recorrentes (id, user_id, cliente_nome, telefone, endereco, bairro, cidade, complemento, referencia, forma_pagamento, itens, frequencia, proxima_execucao, modo_confirmacao, status, created_at, pagamento_modalidade) FROM stdin;
\.


--
-- Data for Name: pix_notification_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pix_notification_events (id, event_hash, source_app, bank_name, notification_title, notification_text, amount, sender_name, reference, detected_at, received_at, processed_at, status, matched_order_id, environment, device_id, created_at, metadata, device_identifier, conferencia_motivo) FROM stdin;
\.


--
-- Data for Name: pix_reader_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pix_reader_devices (id, device_name, device_identifier, status, registered_at, last_seen_at, last_sync_at, app_version, environment, revoked_at, token_hash) FROM stdin;
\.


--
-- Data for Name: plano_contas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plano_contas (id, nome, grupo, ativo) FROM stdin;
\.


--
-- Data for Name: pontos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pontos (id, funcionario_id, user_id, data, entrada, saida, local_info, created_at) FROM stdin;
\.


--
-- Data for Name: pontos_creditos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pontos_creditos (pedido_id, user_id, pontos, created_at) FROM stdin;
\.


--
-- Data for Name: precificacao_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.precificacao_config (id, margem_desejada_pct, margem_baixa_pct, mao_obra_hora, gas_hora, custos_fixos_mensais, volume_mensal_estimado, taxa_credito_pct, taxa_debito_pct, taxa_pix_pct, taxa_ifood_pct, updated_at) FROM stdin;
t	40.00	15.00	25.00	8.00	6000.00	10000	5.00	2.00	0.00	27.00	2026-10-19 10:44:54.65743-03
\.


--
-- Data for Name: preco_historico; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.preco_historico (id, produto_id, preco_antigo, preco_novo, usuario, motivo, created_at) FROM stdin;
\.


--
-- Data for Name: produtos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.produtos (id, categoria_id, nome, descricao, preco, preco_promocional, imagem_url, disponivel, estoque, created_at, tipo_venda, destaque, promo_inicio, promo_fim, promo_ativo, estoque_minimo, estoque_maximo, unidade_medida, custo, tempo_fritura_50s, descricao_fiscal, ncm, cest, cfop_padrao, cst, csosn, origem_mercadoria, gtin, tempo_fritura_s, embalagem_custo, tempo_fritura_base_segundos, unidade_base_tempo_fritura, tempo_mao_obra_min) FROM stdin;
aaaaaaaa-aaaa-4aaa-8aaa-000000000002	99999999-9999-4999-8999-999999999999	Produto Teste Combo 50		20.00	\N	\N	t	200	2026-10-19 10:45:24.158428-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000003	99999999-9999-4999-8999-999999999999	Produto Teste Sem Estoque		10.00	\N	\N	t	0	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000004	99999999-9999-4999-8999-999999999999	Produto Teste Indisponivel		10.00	\N	\N	f	10	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000005	99999999-9999-4999-8999-999999999999	Produto Teste Promocional		10.00	7.50	\N	t	50	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
999ee1eb-dc96-475a-8a01-3a6b93427d6a	e13cd9f4-0a52-4d27-b722-8519dd427594	Mini Pastel Congelado 50un	50 mini pastéis congelados sortidos	79.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
bd83c15f-c309-48e9-8dda-16557eefd513	e13cd9f4-0a52-4d27-b722-8519dd427594	Mini Mix Congelado 100un	100 mini salgados sortidos congelados	159.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
32bdea52-5866-4c75-ac2b-89be77bf51a2	e13cd9f4-0a52-4d27-b722-8519dd427594	Mini Coxinha Congelada 100un	100 mini coxinhas congeladas prontas para fritar	99.90	89.90	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
9aebba8c-0b0b-4466-8346-0c6a4f3ae671	001b365c-2602-4cd9-9afa-0eab57405a43	Kit Reunião 50 Mini	50 mini salgados sortidos ideais para escritório	94.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
f2daa179-452e-42f0-a3ef-49df111a9a16	001b365c-2602-4cd9-9afa-0eab57405a43	Kit Aniversário 200 Mini	200 mini salgados sortidos + 2 refrigerantes	329.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
a84899fc-1e04-4996-8e7b-22a1673cec3f	001b365c-2602-4cd9-9afa-0eab57405a43	Kit Festa 100 Mini Salgados	100 mini salgados sortidos + 1 refrigerante 2L	179.90	159.90	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
0a69e3ab-45dd-42fa-bf58-034a8e5bddfb	6bf8fdcb-4097-442c-b0e5-4002752c96be	Água Mineral 500ml	Água mineral sem gás	3.50	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
b76011fd-c734-4f84-b7a2-a671f7abd85c	6bf8fdcb-4097-442c-b0e5-4002752c96be	Suco Natural 500ml	Suco de laranja natural	8.00	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
9d15ba55-d2e9-4465-8cd8-9b8afff700b5	6bf8fdcb-4097-442c-b0e5-4002752c96be	Guaraná 2L	Refrigerante guaraná 2 litros	10.00	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
52f2392a-5ae6-46e1-ae44-282bc3c94692	6bf8fdcb-4097-442c-b0e5-4002752c96be	Coca-Cola 2L	Refrigerante gelado 2 litros	12.00	\N	\N	t	100	2026-10-19 10:44:52.05033-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000001	99999999-9999-4999-8999-999999999999	Produto Teste Unidade		10.00	\N	\N	t	100	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000006	99999999-9999-4999-8999-999999999999	Produto Teste Estoque 1		10.00	\N	\N	t	1	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000007	99999999-9999-4999-8999-999999999999	Produto Teste Estoque 5		10.00	\N	\N	t	5	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
aaaaaaaa-aaaa-4aaa-8aaa-000000000008	99999999-9999-4999-8999-999999999999	Produto Teste Outro		10.00	\N	\N	t	100	2026-10-19 10:45:24.158428-03	unidade	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
b6d1d889-ed25-41c4-b610-c46e438eaec2	da50d15c-c3ba-4392-976a-e7f140f55518	Mini Croquete 25un	25 mini croquetes de carne	42.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
870e8ca9-0a89-4957-8e02-96b1eff62ee4	da50d15c-c3ba-4392-976a-e7f140f55518	Mini Kibe Frito 25un	25 mini kibes de trigo crocantes	44.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
e1a78820-7b42-40b1-8a7f-c997ea01ffb0	da50d15c-c3ba-4392-976a-e7f140f55518	Mini Risole de Carne 25un	25 mini risoles de carne moída temperada	42.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
95cd9567-ecc5-410a-abfb-84a7f4eb7cf9	da50d15c-c3ba-4392-976a-e7f140f55518	Mini Bolinha de Queijo 25un	25 mini bolinhas de mussarela douradas	39.90	34.90	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
655d64c4-0c9a-408f-87ea-9bf97337a1d4	da50d15c-c3ba-4392-976a-e7f140f55518	Mini Coxinha 25un	25 mini coxinhas de frango fritas na hora	39.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
a70a9fe0-e595-4fbb-8ce6-f40407dddf00	ca6d98a9-0297-4c0f-8353-0ba797440806	Mini Trouxinha de Frango 20un	20 mini trouxinhas de frango com catupiry	49.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
857b79e9-a3f1-4f99-8f58-6a785d55bb38	ca6d98a9-0297-4c0f-8353-0ba797440806	Mini Quibe Assado 20un	20 mini quibes assados de trigo	47.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
bec7884b-7748-4694-af3b-eec7da996e56	ca6d98a9-0297-4c0f-8353-0ba797440806	Mini Enroladinho de Salsicha 20un	20 mini enroladinhos de massa macia	44.90	39.90	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
dae7e23b-5d5c-4ca3-9ef1-8d8b9ffb00cf	ca6d98a9-0297-4c0f-8353-0ba797440806	Mini Esfiha de Carne 20un	20 mini esfihas abertas assadas na hora	47.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
70fc996f-6f4f-4365-941c-f32020894983	8a8056b6-5fef-4352-98d5-773983f9af9b	Mini Pastel de Pizza 20un	20 mini pastéis de presunto, queijo e tomate	46.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
0de73035-cc61-4cc5-9c50-a6f6a19aefb4	8a8056b6-5fef-4352-98d5-773983f9af9b	Mini Pastel de Frango 20un	20 mini pastéis de frango desfiado	46.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
9dd1d741-5494-4869-b84a-b73383175c8c	8a8056b6-5fef-4352-98d5-773983f9af9b	Mini Pastel de Queijo 20un	20 mini pastéis de mussarela	44.90	39.90	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
3786b9fa-f7c8-421a-8874-560b5a25b29a	8a8056b6-5fef-4352-98d5-773983f9af9b	Mini Pastel de Carne 20un	20 mini pastéis de carne moída	44.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
b53b5e69-9e2a-4e8e-8619-75b3d5fc9f75	47f479e0-af03-48be-a1da-595c29d7188f	Mini Pizza Portuguesa 15un	15 mini pizzas de presunto, ovo e ervilha	59.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
3100c623-6a89-4952-bbd1-5304811df69b	47f479e0-af03-48be-a1da-595c29d7188f	Mini Pizza de Frango 15un	15 mini pizzas de frango com catupiry	59.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
d14d20cf-d7e9-409f-b0d8-272200aa09ca	47f479e0-af03-48be-a1da-595c29d7188f	Mini Pizza de Mussarela 15un	15 mini pizzas de mussarela e tomate	54.90	49.90	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
3c63e75d-9b08-4ba9-afa9-8821c1308d76	47f479e0-af03-48be-a1da-595c29d7188f	Mini Pizza de Calabresa 15un	15 mini pizzas de calabresa com mussarela	54.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
27f78468-7f2b-4442-a3e5-20c411f10f7b	2fa005d3-850a-4ecc-b835-96dc3340c137	Mini Empadinha de Carne 20un	20 mini empadinhas de carne moída	48.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
f1df5a98-62ca-4ce8-8e21-2c06aebbaa8b	2fa005d3-850a-4ecc-b835-96dc3340c137	Mini Empadinha de Palmito 20un	20 mini empadinhas de palmito	49.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
bd0f55a3-c2c9-4a54-b6e9-40a1f1f5da78	2fa005d3-850a-4ecc-b835-96dc3340c137	Mini Empadinha de Queijo 20un	20 mini empadinhas de queijo cremoso	46.90	41.90	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
d82d4041-de61-4dff-8fb8-4dbbd39b9435	2fa005d3-850a-4ecc-b835-96dc3340c137	Mini Empadinha de Frango 20un	20 mini empadinhas de frango	46.90	\N	\N	t	100	2026-10-19 10:44:52.05033-03	combo_50	f	\N	\N	t	0	\N	un	\N	210	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	210	50	0.50
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, nome, telefone, pontos, created_at) FROM stdin;
11111111-1111-1111-1111-111111111111	Admin Homolog		0	2026-10-19 10:45:24.158428-03
22222222-2222-2222-2222-222222222222	Atendente Homolog		0	2026-10-19 10:45:24.158428-03
33333333-3333-3333-3333-333333333333	Producao Homolog		0	2026-10-19 10:45:24.158428-03
44444444-4444-4444-4444-444444444444	Cliente Homolog		0	2026-10-19 10:45:24.158428-03
55555555-5555-5555-5555-555555555555	Outsider Homolog		0	2026-10-19 10:45:24.158428-03
66666666-6666-6666-6666-666666666666	Motoboy Homolog		0	2026-10-19 10:45:24.158428-03
\.


--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: reservas_estoque; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reservas_estoque (id, pedido_id, produto_id, lote_id, quantidade, status, created_at) FROM stdin;
\.


--
-- Data for Name: rota_pedidos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rota_pedidos (rota_id, pedido_id, ordem) FROM stdin;
\.


--
-- Data for Name: rotas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rotas (id, motoboy_id, status, observacao, created_at, concluida_em) FROM stdin;
\.


--
-- Data for Name: rotas_entrega; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rotas_entrega (id, motoboy_id, status, created_at, saiu_em, chegou_em) FROM stdin;
\.


--
-- Data for Name: solicitacoes_contador; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.solicitacoes_contador (id, competencia, texto, status, resposta, anexo_url, created_by, created_at, respondida_em) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (id, user_id, role) FROM stdin;
9120884a-7cf5-4a3b-87a0-b4c5a730761b	11111111-1111-1111-1111-111111111111	cliente
846385b6-0870-48b6-b7fc-a38652449226	22222222-2222-2222-2222-222222222222	cliente
947da045-af83-490b-83ac-4d68631612ab	33333333-3333-3333-3333-333333333333	cliente
03b9d5ae-22d9-48d0-a069-2b1d04a6f4a4	44444444-4444-4444-4444-444444444444	cliente
ec9f0483-1344-45f7-9ef4-2233dabc255a	55555555-5555-5555-5555-555555555555	cliente
2f0685f6-7a7c-4bd8-ab7d-c4d8d20f3e74	66666666-6666-6666-6666-666666666666	cliente
eb6f9458-0da4-4741-a550-86315840517d	11111111-1111-1111-1111-111111111111	admin
679a604b-c7c0-489f-a4d1-9130338eac51	22222222-2222-2222-2222-222222222222	atendente
9692a126-ca04-4294-8592-9a4f2cb7dce2	33333333-3333-3333-3333-333333333333	producao
671cc353-f7e1-46b6-bca8-6c401c195484	66666666-6666-6666-6666-666666666666	motoboy
\.


--
-- Data for Name: vales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vales (id, funcionario_id, valor, data, descricao, descontado, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at) FROM stdin;
hero	hero	t	5242880	{image/jpeg,image/png,image/webp,image/avif}	2026-10-19 10:44:52.773929-03
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: -
--

COPY storage.objects (id, bucket_id, name, owner, metadata, created_at) FROM stdin;
\.


--
-- Name: pedido_numero_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedido_numero_seq', 1527, true);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: acertos_motoboy acertos_motoboy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acertos_motoboy
    ADD CONSTRAINT acertos_motoboy_pkey PRIMARY KEY (id);


--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- Name: ajuda_artigos ajuda_artigos_categoria_titulo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajuda_artigos
    ADD CONSTRAINT ajuda_artigos_categoria_titulo_key UNIQUE (categoria, titulo);


--
-- Name: ajuda_artigos ajuda_artigos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajuda_artigos
    ADD CONSTRAINT ajuda_artigos_pkey PRIMARY KEY (id);


--
-- Name: avaliacoes avaliacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_pkey PRIMARY KEY (id);


--
-- Name: avaliacoes avaliacoes_produto_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_produto_id_user_id_key UNIQUE (produto_id, user_id);


--
-- Name: caixa_sessoes caixa_sessoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa_sessoes
    ADD CONSTRAINT caixa_sessoes_pkey PRIMARY KEY (id);


--
-- Name: calculadora_config calculadora_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculadora_config
    ADD CONSTRAINT calculadora_config_pkey PRIMARY KEY (id);


--
-- Name: campanha_cliques campanha_cliques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campanha_cliques
    ADD CONSTRAINT campanha_cliques_pkey PRIMARY KEY (id);


--
-- Name: carrinho_eventos carrinho_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrinho_eventos
    ADD CONSTRAINT carrinho_eventos_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_slug_key UNIQUE (slug);


--
-- Name: centros_custo centros_custo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centros_custo
    ADD CONSTRAINT centros_custo_pkey PRIMARY KEY (id);


--
-- Name: compra_itens compra_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_itens
    ADD CONSTRAINT compra_itens_pkey PRIMARY KEY (id);


--
-- Name: compras compras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_pkey PRIMARY KEY (id);


--
-- Name: contador_acessos contador_acessos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contador_acessos
    ADD CONSTRAINT contador_acessos_pkey PRIMARY KEY (id);


--
-- Name: contas_bancarias contas_bancarias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_bancarias
    ADD CONSTRAINT contas_bancarias_pkey PRIMARY KEY (id);


--
-- Name: contas contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pkey PRIMARY KEY (id);


--
-- Name: crm_campaigns crm_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaigns
    ADD CONSTRAINT crm_campaigns_pkey PRIMARY KEY (id);


--
-- Name: crm_customers crm_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_customers
    ADD CONSTRAINT crm_customers_pkey PRIMARY KEY (telefone_norm);


--
-- Name: crm_events crm_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_pkey PRIMARY KEY (id);


--
-- Name: crm_recipients crm_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_recipients
    ADD CONSTRAINT crm_recipients_pkey PRIMARY KEY (campaign_id, telefone_norm);


--
-- Name: crm_settings crm_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_settings
    ADD CONSTRAINT crm_settings_pkey PRIMARY KEY (id);


--
-- Name: cupons cupons_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons
    ADD CONSTRAINT cupons_codigo_key UNIQUE (codigo);


--
-- Name: cupons cupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupons
    ADD CONSTRAINT cupons_pkey PRIMARY KEY (id);


--
-- Name: datas_demanda datas_demanda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datas_demanda
    ADD CONSTRAINT datas_demanda_pkey PRIMARY KEY (id);


--
-- Name: degustacao_regras degustacao_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.degustacao_regras
    ADD CONSTRAINT degustacao_regras_pkey PRIMARY KEY (id);


--
-- Name: degustacoes degustacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.degustacoes
    ADD CONSTRAINT degustacoes_pkey PRIMARY KEY (id);


--
-- Name: despesas despesas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_pkey PRIMARY KEY (id);


--
-- Name: documento_eventos documento_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_eventos
    ADD CONSTRAINT documento_eventos_pkey PRIMARY KEY (id);


--
-- Name: documento_fiscal_itens documento_fiscal_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_fiscal_itens
    ADD CONSTRAINT documento_fiscal_itens_pkey PRIMARY KEY (id);


--
-- Name: documentos_fiscais documentos_fiscais_pedido_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_fiscais
    ADD CONSTRAINT documentos_fiscais_pedido_id_key UNIQUE (pedido_id);


--
-- Name: documentos_fiscais documentos_fiscais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_fiscais
    ADD CONSTRAINT documentos_fiscais_pkey PRIMARY KEY (id);


--
-- Name: empresa_fiscal empresa_fiscal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_fiscal
    ADD CONSTRAINT empresa_fiscal_pkey PRIMARY KEY (id);


--
-- Name: enderecos enderecos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enderecos
    ADD CONSTRAINT enderecos_pkey PRIMARY KEY (id);


--
-- Name: entrega_atrasos entrega_atrasos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrega_atrasos
    ADD CONSTRAINT entrega_atrasos_pkey PRIMARY KEY (id);


--
-- Name: escalas escalas_funcionario_id_dia_semana_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_funcionario_id_dia_semana_key UNIQUE (funcionario_id, dia_semana);


--
-- Name: escalas escalas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_pkey PRIMARY KEY (id);


--
-- Name: estoque_mov estoque_mov_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_mov
    ADD CONSTRAINT estoque_mov_pkey PRIMARY KEY (id);


--
-- Name: estoque_movimentacoes estoque_movimentacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_movimentacoes
    ADD CONSTRAINT estoque_movimentacoes_pkey PRIMARY KEY (id);


--
-- Name: extratos extratos_conta_bancaria_id_referencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_conta_bancaria_id_referencia_key UNIQUE (conta_bancaria_id, referencia);


--
-- Name: extratos extratos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_pkey PRIMARY KEY (id);


--
-- Name: favoritos favoritos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favoritos
    ADD CONSTRAINT favoritos_pkey PRIMARY KEY (user_id, produto_id);


--
-- Name: fechamentos_mensais fechamentos_mensais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamentos_mensais
    ADD CONSTRAINT fechamentos_mensais_pkey PRIMARY KEY (competencia);


--
-- Name: ficha_itens ficha_itens_ficha_id_insumo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ficha_itens
    ADD CONSTRAINT ficha_itens_ficha_id_insumo_id_key UNIQUE (ficha_id, insumo_id);


--
-- Name: ficha_itens ficha_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ficha_itens
    ADD CONSTRAINT ficha_itens_pkey PRIMARY KEY (id);


--
-- Name: fichas_tecnicas fichas_tecnicas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_tecnicas
    ADD CONSTRAINT fichas_tecnicas_pkey PRIMARY KEY (id);


--
-- Name: fichas_tecnicas fichas_tecnicas_produto_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_tecnicas
    ADD CONSTRAINT fichas_tecnicas_produto_id_key UNIQUE (produto_id);


--
-- Name: fila_fritura fila_fritura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_fritura
    ADD CONSTRAINT fila_fritura_pkey PRIMARY KEY (id);


--
-- Name: fila_impressao fila_impressao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_impressao
    ADD CONSTRAINT fila_impressao_pkey PRIMARY KEY (id);


--
-- Name: fila_impressao fila_impressao_trabalho_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_impressao
    ADD CONSTRAINT fila_impressao_trabalho_uuid_key UNIQUE (trabalho_uuid);


--
-- Name: fiscal_certificados fiscal_certificados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_certificados
    ADD CONSTRAINT fiscal_certificados_pkey PRIMARY KEY (id);


--
-- Name: fiscal_provedor_config fiscal_provedor_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_provedor_config
    ADD CONSTRAINT fiscal_provedor_config_pkey PRIMARY KEY (id);


--
-- Name: fornecedores fornecedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fornecedores
    ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id);


--
-- Name: fritura_fila fritura_fila_pedido_produto_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fritura_fila
    ADD CONSTRAINT fritura_fila_pedido_produto_key UNIQUE (pedido_id, produto_id);


--
-- Name: CONSTRAINT fritura_fila_pedido_produto_key ON fritura_fila; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT fritura_fila_pedido_produto_key ON public.fritura_fila IS '0049: 1 linha por pedido+produto — reconfirmar nunca frita em dobro.';


--
-- Name: fritura_fila fritura_fila_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fritura_fila
    ADD CONSTRAINT fritura_fila_pkey PRIMARY KEY (id);


--
-- Name: funcionarios funcionarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_pkey PRIMARY KEY (id);


--
-- Name: hero_carousel hero_carousel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hero_carousel
    ADD CONSTRAINT hero_carousel_pkey PRIMARY KEY (id);


--
-- Name: horario_config horario_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.horario_config
    ADD CONSTRAINT horario_config_pkey PRIMARY KEY (id);


--
-- Name: indicacoes indicacoes_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicacoes
    ADD CONSTRAINT indicacoes_codigo_key UNIQUE (codigo);


--
-- Name: indicacoes indicacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicacoes
    ADD CONSTRAINT indicacoes_pkey PRIMARY KEY (id);


--
-- Name: insumo_lotes insumo_lotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_lotes
    ADD CONSTRAINT insumo_lotes_pkey PRIMARY KEY (id);


--
-- Name: insumo_movimentacoes insumo_movimentacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_movimentacoes
    ADD CONSTRAINT insumo_movimentacoes_pkey PRIMARY KEY (id);


--
-- Name: insumos insumos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumos
    ADD CONSTRAINT insumos_pkey PRIMARY KEY (id);


--
-- Name: jornada_eventos jornada_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jornada_eventos
    ADD CONSTRAINT jornada_eventos_pkey PRIMARY KEY (id);


--
-- Name: loja_config loja_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loja_config
    ADD CONSTRAINT loja_config_pkey PRIMARY KEY (id);


--
-- Name: lotes lotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_pkey PRIMARY KEY (id);


--
-- Name: lotes lotes_produto_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_produto_id_codigo_key UNIQUE (produto_id, codigo);


--
-- Name: metas metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_pkey PRIMARY KEY (id);


--
-- Name: metas metas_tipo_periodo_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_tipo_periodo_ref_key UNIQUE (tipo, periodo_ref);


--
-- Name: motoboy_historico motoboy_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_historico
    ADD CONSTRAINT motoboy_historico_pkey PRIMARY KEY (id);


--
-- Name: motoboys motoboys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboys
    ADD CONSTRAINT motoboys_pkey PRIMARY KEY (id);


--
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);


--
-- Name: orcamentos orcamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_pkey PRIMARY KEY (id);


--
-- Name: parceiros parceiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros
    ADD CONSTRAINT parceiros_pkey PRIMARY KEY (id);


--
-- Name: pedido_itens pedido_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_itens
    ADD CONSTRAINT pedido_itens_pkey PRIMARY KEY (id);


--
-- Name: pedido_lembretes pedido_lembretes_pedido_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_lembretes
    ADD CONSTRAINT pedido_lembretes_pedido_id_tipo_key UNIQUE (pedido_id, tipo);


--
-- Name: pedido_lembretes pedido_lembretes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_lembretes
    ADD CONSTRAINT pedido_lembretes_pkey PRIMARY KEY (id);


--
-- Name: pedido_notas pedido_notas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_notas
    ADD CONSTRAINT pedido_notas_pkey PRIMARY KEY (id);


--
-- Name: pedido_status_historico pedido_status_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_status_historico
    ADD CONSTRAINT pedido_status_historico_pkey PRIMARY KEY (id);


--
-- Name: pedido_status_transicoes pedido_status_transicoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_status_transicoes
    ADD CONSTRAINT pedido_status_transicoes_pkey PRIMARY KEY (de_status, para_status);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);


--
-- Name: pedidos_recorrentes pedidos_recorrentes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_recorrentes
    ADD CONSTRAINT pedidos_recorrentes_pkey PRIMARY KEY (id);


--
-- Name: pix_notification_events pix_notification_events_event_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_notification_events
    ADD CONSTRAINT pix_notification_events_event_hash_key UNIQUE (event_hash);


--
-- Name: pix_notification_events pix_notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_notification_events
    ADD CONSTRAINT pix_notification_events_pkey PRIMARY KEY (id);


--
-- Name: pix_reader_devices pix_reader_devices_device_identifier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_reader_devices
    ADD CONSTRAINT pix_reader_devices_device_identifier_key UNIQUE (device_identifier);


--
-- Name: pix_reader_devices pix_reader_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pix_reader_devices
    ADD CONSTRAINT pix_reader_devices_pkey PRIMARY KEY (id);


--
-- Name: plano_contas plano_contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pkey PRIMARY KEY (id);


--
-- Name: pontos_creditos pontos_creditos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos_creditos
    ADD CONSTRAINT pontos_creditos_pkey PRIMARY KEY (pedido_id);


--
-- Name: pontos pontos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos
    ADD CONSTRAINT pontos_pkey PRIMARY KEY (id);


--
-- Name: precificacao_config precificacao_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precificacao_config
    ADD CONSTRAINT precificacao_config_pkey PRIMARY KEY (id);


--
-- Name: preco_historico preco_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preco_historico
    ADD CONSTRAINT preco_historico_pkey PRIMARY KEY (id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reservas_estoque reservas_estoque_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_estoque
    ADD CONSTRAINT reservas_estoque_pkey PRIMARY KEY (id);


--
-- Name: rota_pedidos rota_pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota_pedidos
    ADD CONSTRAINT rota_pedidos_pkey PRIMARY KEY (rota_id, pedido_id);


--
-- Name: rotas_entrega rotas_entrega_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotas_entrega
    ADD CONSTRAINT rotas_entrega_pkey PRIMARY KEY (id);


--
-- Name: rotas rotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotas
    ADD CONSTRAINT rotas_pkey PRIMARY KEY (id);


--
-- Name: solicitacoes_contador solicitacoes_contador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_contador
    ADD CONSTRAINT solicitacoes_contador_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: vales vales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vales
    ADD CONSTRAINT vales_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: admin_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_logs_created_idx ON public.admin_logs USING btree (created_at DESC);


--
-- Name: atrasos_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX atrasos_criado_idx ON public.entrega_atrasos USING btree (criado_em);


--
-- Name: atrasos_motoboy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX atrasos_motoboy_idx ON public.entrega_atrasos USING btree (motoboy_id);


--
-- Name: atrasos_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX atrasos_pedido_idx ON public.entrega_atrasos USING btree (pedido_id);


--
-- Name: avaliacoes_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avaliacoes_pedido_idx ON public.avaliacoes USING btree (pedido_id);


--
-- Name: caixa_sessao_aberta_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX caixa_sessao_aberta_unica ON public.caixa_sessoes USING btree (status) WHERE (status = 'aberta'::text);


--
-- Name: campanha_cliques_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campanha_cliques_slug_idx ON public.campanha_cliques USING btree (slug, created_at DESC);


--
-- Name: carrinho_eventos_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrinho_eventos_created_idx ON public.carrinho_eventos USING btree (created_at DESC);


--
-- Name: carrinho_eventos_tel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrinho_eventos_tel_idx ON public.carrinho_eventos USING btree (telefone, created_at DESC);


--
-- Name: compra_itens_compra_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compra_itens_compra_idx ON public.compra_itens USING btree (compra_id);


--
-- Name: compras_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compras_status_idx ON public.compras USING btree (status);


--
-- Name: contador_acessos_comp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contador_acessos_comp_idx ON public.contador_acessos USING btree (competencia);


--
-- Name: contas_banco_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_banco_idx ON public.contas USING btree (conta_bancaria_id);


--
-- Name: contas_pago_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_pago_em_idx ON public.contas USING btree (pago_em);


--
-- Name: contas_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_status_idx ON public.contas USING btree (status);


--
-- Name: contas_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_tipo_idx ON public.contas USING btree (tipo);


--
-- Name: contas_venc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contas_venc_idx ON public.contas USING btree (vencimento);


--
-- Name: crm_customers_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_customers_tipo_idx ON public.crm_customers USING btree (tipo_cliente);


--
-- Name: crm_events_tel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_events_tel_idx ON public.crm_events USING btree (telefone_norm, created_at DESC);


--
-- Name: crm_recipients_tel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_recipients_tel_idx ON public.crm_recipients USING btree (telefone_norm);


--
-- Name: cupons_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cupons_cliente_idx ON public.cupons USING btree (cliente_telefone) WHERE (cliente_telefone <> ''::text);


--
-- Name: despesas_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX despesas_data_idx ON public.despesas USING btree (data DESC);


--
-- Name: doc_fiscal_itens_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_fiscal_itens_doc_idx ON public.documento_fiscal_itens USING btree (documento_id);


--
-- Name: doc_fiscal_itens_prod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doc_fiscal_itens_prod_idx ON public.documento_fiscal_itens USING btree (produto_id);


--
-- Name: docev_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX docev_doc_idx ON public.documento_eventos USING btree (documento_id);


--
-- Name: docs_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX docs_pedido_idx ON public.documentos_fiscais USING btree (pedido_id);


--
-- Name: docs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX docs_status_idx ON public.documentos_fiscais USING btree (status);


--
-- Name: est_mov_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX est_mov_created_idx ON public.estoque_movimentacoes USING btree (created_at);


--
-- Name: est_mov_lote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX est_mov_lote_idx ON public.estoque_movimentacoes USING btree (lote_id);


--
-- Name: est_mov_produto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX est_mov_produto_idx ON public.estoque_movimentacoes USING btree (produto_id);


--
-- Name: est_mov_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX est_mov_tipo_idx ON public.estoque_movimentacoes USING btree (tipo);


--
-- Name: estoque_mov_prod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estoque_mov_prod_idx ON public.estoque_mov USING btree (produto_id, created_at DESC);


--
-- Name: extratos_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extratos_data_idx ON public.extratos USING btree (data);


--
-- Name: extratos_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extratos_status_idx ON public.extratos USING btree (status);


--
-- Name: ficha_itens_ficha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ficha_itens_ficha_idx ON public.ficha_itens USING btree (ficha_id);


--
-- Name: fila_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fila_status_idx ON public.fila_impressao USING btree (status);


--
-- Name: fiscal_cert_empresa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fiscal_cert_empresa_idx ON public.fiscal_certificados USING btree (empresa_id);


--
-- Name: fiscal_cert_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fiscal_cert_status_idx ON public.fiscal_certificados USING btree (status);


--
-- Name: fornecedores_nome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fornecedores_nome_idx ON public.fornecedores USING btree (nome);


--
-- Name: fritura_fila_funcionario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fritura_fila_funcionario_idx ON public.fritura_fila USING btree (funcionario_id);


--
-- Name: fritura_fila_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fritura_fila_pedido_idx ON public.fritura_fila USING btree (pedido_id);


--
-- Name: fritura_fila_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fritura_fila_status_idx ON public.fritura_fila USING btree (status);


--
-- Name: fritura_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fritura_status_idx ON public.fila_fritura USING btree (status);


--
-- Name: funcionarios_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funcionarios_user_idx ON public.funcionarios USING btree (user_id);


--
-- Name: hero_carousel_ativo_ordem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hero_carousel_ativo_ordem_idx ON public.hero_carousel USING btree (ativo, ordem);


--
-- Name: idx_pix_notification_events_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_notification_events_device ON public.pix_notification_events USING btree (device_id);


--
-- Name: idx_pix_notification_events_environment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_notification_events_environment ON public.pix_notification_events USING btree (environment);


--
-- Name: idx_pix_notification_events_event_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_notification_events_event_hash ON public.pix_notification_events USING btree (event_hash);


--
-- Name: idx_pix_notification_events_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_notification_events_received ON public.pix_notification_events USING btree (received_at);


--
-- Name: idx_pix_notification_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_notification_events_status ON public.pix_notification_events USING btree (status);


--
-- Name: idx_pix_reader_devices_environment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_reader_devices_environment ON public.pix_reader_devices USING btree (environment);


--
-- Name: idx_pix_reader_devices_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_reader_devices_identifier ON public.pix_reader_devices USING btree (device_identifier);


--
-- Name: idx_pix_reader_devices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pix_reader_devices_status ON public.pix_reader_devices USING btree (status);


--
-- Name: insumo_lotes_insumo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumo_lotes_insumo_idx ON public.insumo_lotes USING btree (insumo_id);


--
-- Name: insumo_lotes_validade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumo_lotes_validade_idx ON public.insumo_lotes USING btree (validade);


--
-- Name: insumo_mov_insumo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumo_mov_insumo_idx ON public.insumo_movimentacoes USING btree (insumo_id);


--
-- Name: insumo_mov_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumo_mov_ref_idx ON public.insumo_movimentacoes USING btree (referencia);


--
-- Name: insumo_mov_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumo_mov_tipo_idx ON public.insumo_movimentacoes USING btree (tipo);


--
-- Name: insumos_ativo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumos_ativo_idx ON public.insumos USING btree (ativo) WHERE ativo;


--
-- Name: insumos_nome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insumos_nome_idx ON public.insumos USING btree (nome);


--
-- Name: lotes_prod_validade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lotes_prod_validade_idx ON public.lotes USING btree (produto_id, validade);


--
-- Name: metas_periodo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metas_periodo_idx ON public.metas USING btree (tipo, periodo_ref DESC);


--
-- Name: motoboy_hist_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motoboy_hist_created_idx ON public.motoboy_historico USING btree (created_at);


--
-- Name: motoboy_hist_evento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motoboy_hist_evento_idx ON public.motoboy_historico USING btree (evento);


--
-- Name: motoboy_hist_motoboy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motoboy_hist_motoboy_idx ON public.motoboy_historico USING btree (motoboy_id);


--
-- Name: motoboys_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX motoboys_status_idx ON public.motoboys USING btree (status);


--
-- Name: motoboys_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX motoboys_user_idx ON public.motoboys USING btree (user_id);


--
-- Name: notificacoes_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notificacoes_created_idx ON public.notificacoes USING btree (created_at DESC);


--
-- Name: orcamentos_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orcamentos_user_idx ON public.orcamentos USING btree (user_id, created_at DESC);


--
-- Name: pedido_hist_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedido_hist_pedido_idx ON public.pedido_status_historico USING btree (pedido_id);


--
-- Name: pedido_itens_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedido_itens_pedido_idx ON public.pedido_itens USING btree (pedido_id);


--
-- Name: pedido_notas_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedido_notas_pedido_idx ON public.pedido_notas USING btree (pedido_id, created_at);


--
-- Name: pedidos_aceite_pendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_aceite_pendente_idx ON public.pedidos USING btree (created_at) WHERE ((aceito_em_atendente IS NULL) AND (status = 'recebido'::public.order_status));


--
-- Name: pedidos_agendado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_agendado_idx ON public.pedidos USING btree (agendado_para) WHERE (status <> 'cancelado'::public.order_status);


--
-- Name: pedidos_agendado_para_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_agendado_para_idx ON public.pedidos USING btree (agendado_para);


--
-- Name: pedidos_campanha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_campanha_idx ON public.pedidos USING btree (campanha_origem) WHERE (campanha_origem <> ''::text);


--
-- Name: pedidos_cidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_cidade_idx ON public.pedidos USING btree (cidade);


--
-- Name: pedidos_confirmado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_confirmado_em_idx ON public.pedidos USING btree (confirmado_em);


--
-- Name: pedidos_liberacao_pendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_liberacao_pendente_idx ON public.pedidos USING btree (liberado_em) WHERE ((liberado_em IS NULL) AND (status = 'recebido'::public.order_status));


--
-- Name: pedidos_pagamento_modalidade_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_pagamento_modalidade_idx ON public.pedidos USING btree (pagamento_modalidade);


--
-- Name: pedidos_pagamento_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_pagamento_status_idx ON public.pedidos USING btree (pagamento_status);


--
-- Name: pedidos_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_status_created_idx ON public.pedidos USING btree (status, created_at DESC);


--
-- Name: pedidos_tel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pedidos_tel_idx ON public.pedidos USING btree (telefone);


--
-- Name: pix_devices_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pix_devices_identifier_idx ON public.pix_reader_devices USING btree (device_identifier);


--
-- Name: pix_events_device_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pix_events_device_identifier_idx ON public.pix_notification_events USING btree (device_identifier);


--
-- Name: pontos_func_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pontos_func_data_idx ON public.pontos USING btree (funcionario_id, data);


--
-- Name: preco_hist_produto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX preco_hist_produto_idx ON public.preco_historico USING btree (produto_id);


--
-- Name: produtos_destaque_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX produtos_destaque_idx ON public.produtos USING btree (destaque) WHERE (destaque = true);


--
-- Name: produtos_tipo_venda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX produtos_tipo_venda_idx ON public.produtos USING btree (tipo_venda);


--
-- Name: push_sub_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_sub_user_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: rec_proxima_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rec_proxima_idx ON public.pedidos_recorrentes USING btree (proxima_execucao) WHERE (status = 'ativo'::text);


--
-- Name: rec_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rec_user_idx ON public.pedidos_recorrentes USING btree (user_id, status);


--
-- Name: reservas_pedido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservas_pedido_idx ON public.reservas_estoque USING btree (pedido_id);


--
-- Name: rota_pedidos_rota_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rota_pedidos_rota_idx ON public.rota_pedidos USING btree (rota_id);


--
-- Name: rotas_motoboy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rotas_motoboy_idx ON public.rotas USING btree (motoboy_id);


--
-- Name: rotas_preparando_motoboy_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rotas_preparando_motoboy_uniq ON public.rotas_entrega USING btree (motoboy_id) WHERE ((status = 'preparando'::text) AND (motoboy_id IS NOT NULL));


--
-- Name: rotas_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rotas_status_idx ON public.rotas USING btree (status);


--
-- Name: sol_contador_comp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sol_contador_comp_idx ON public.solicitacoes_contador USING btree (competencia);


--
-- Name: vales_func_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vales_func_idx ON public.vales USING btree (funcionario_id);


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: contas contas_fechamento_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contas_fechamento_trg BEFORE INSERT OR DELETE OR UPDATE ON public.contas FOR EACH ROW EXECUTE FUNCTION public.contas_fechamento_guard();


--
-- Name: pedidos pedidos_guard_update_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pedidos_guard_update_trg BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.pedidos_guard_update();


--
-- Name: profiles profiles_guard_pontos_ins_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_guard_pontos_ins_trg BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_pontos_insert();


--
-- Name: profiles profiles_guard_pontos_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_guard_pontos_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_pontos();


--
-- Name: fila_impressao trigger_adiar_cupom_agendado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_adiar_cupom_agendado BEFORE INSERT ON public.fila_impressao FOR EACH ROW EXECUTE FUNCTION public.adiar_cupom_agendado();


--
-- Name: pedidos trigger_congelar_colunas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_congelar_colunas BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.congelar_colunas_protegidas();


--
-- Name: pedidos trigger_consumir_insumos_producao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_consumir_insumos_producao AFTER UPDATE OF status ON public.pedidos FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = 'em_producao'::public.order_status))) EXECUTE FUNCTION public.consumir_insumos_pedido_trigger();


--
-- Name: pedidos trigger_criar_fritura_fila; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_criar_fritura_fila AFTER UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.trigger_criar_fritura_fila();


--
-- Name: pedidos trigger_entrega_motoboy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_entrega_motoboy AFTER UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.trigger_entrega_motoboy();


--
-- Name: pedidos trigger_exigir_conferencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_exigir_conferencia BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.exigir_conferencia_para_pronto();


--
-- Name: pedido_itens trigger_gerar_cupom_apos_itens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_gerar_cupom_apos_itens AFTER INSERT ON public.pedido_itens REFERENCING NEW TABLE AS new_itens FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gerar_cupom_apos_itens();


--
-- Name: rota_pedidos trigger_impedir_parada_duplicada; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_impedir_parada_duplicada BEFORE INSERT ON public.rota_pedidos FOR EACH ROW EXECUTE FUNCTION public.impedir_parada_duplicada();


--
-- Name: pedidos trigger_pagamento_confirmado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_pagamento_confirmado AFTER UPDATE ON public.pedidos FOR EACH ROW WHEN (((old.pagamento_status IS DISTINCT FROM new.pagamento_status) AND (new.pagamento_status = 'pago'::text))) EXECUTE FUNCTION public.trg_pagamento_confirmado();


--
-- Name: pedidos trigger_saida_motoboy; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_saida_motoboy AFTER UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.trigger_saida_motoboy();


--
-- Name: pedidos trigger_validar_endereco; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_validar_endereco BEFORE INSERT OR UPDATE OF tipo_entrega, endereco, bairro, cidade, tipo_imovel, apartamento ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.validar_endereco_entrega();


--
-- Name: TRIGGER trigger_validar_endereco ON pedidos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trigger_validar_endereco ON public.pedidos IS 'Escopo restrito a colunas de endereço (0047): troca de status nunca é barrada por endereço legado.';


--
-- Name: documentos_fiscais trigger_validar_fiscal_emissao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_validar_fiscal_emissao BEFORE INSERT OR UPDATE OF status ON public.documentos_fiscais FOR EACH ROW EXECUTE FUNCTION public.validar_dados_fiscais_emissao();


--
-- Name: pedidos trigger_validar_transicao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_validar_transicao BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.validar_transicao_status();


--
-- Name: acertos_motoboy acertos_motoboy_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acertos_motoboy
    ADD CONSTRAINT acertos_motoboy_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_logs admin_logs_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: avaliacoes avaliacoes_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: avaliacoes avaliacoes_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: avaliacoes avaliacoes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avaliacoes
    ADD CONSTRAINT avaliacoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: caixa_sessoes caixa_sessoes_responsavel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa_sessoes
    ADD CONSTRAINT caixa_sessoes_responsavel_fkey FOREIGN KEY (responsavel) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: carrinho_eventos carrinho_eventos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrinho_eventos
    ADD CONSTRAINT carrinho_eventos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: compra_itens compra_itens_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_itens
    ADD CONSTRAINT compra_itens_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE CASCADE;


--
-- Name: compra_itens compra_itens_insumo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compra_itens
    ADD CONSTRAINT compra_itens_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE RESTRICT;


--
-- Name: compras compras_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: compras compras_fornecedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT compras_fornecedor_id_fkey FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE SET NULL;


--
-- Name: contador_acessos contador_acessos_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contador_acessos
    ADD CONSTRAINT contador_acessos_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contas contas_conta_bancaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;


--
-- Name: contas contas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contas contas_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas
    ADD CONSTRAINT contas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: crm_campaigns crm_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_campaigns
    ADD CONSTRAINT crm_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: crm_customers crm_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_customers
    ADD CONSTRAINT crm_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: crm_events crm_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns(id) ON DELETE SET NULL;


--
-- Name: crm_events crm_events_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: crm_events crm_events_telefone_norm_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_events
    ADD CONSTRAINT crm_events_telefone_norm_fkey FOREIGN KEY (telefone_norm) REFERENCES public.crm_customers(telefone_norm) ON DELETE CASCADE;


--
-- Name: crm_recipients crm_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_recipients
    ADD CONSTRAINT crm_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns(id) ON DELETE CASCADE;


--
-- Name: crm_recipients crm_recipients_telefone_norm_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_recipients
    ADD CONSTRAINT crm_recipients_telefone_norm_fkey FOREIGN KEY (telefone_norm) REFERENCES public.crm_customers(telefone_norm) ON DELETE CASCADE;


--
-- Name: degustacoes degustacoes_orcamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.degustacoes
    ADD CONSTRAINT degustacoes_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES public.orcamentos(id) ON DELETE SET NULL;


--
-- Name: degustacoes degustacoes_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.degustacoes
    ADD CONSTRAINT degustacoes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: degustacoes degustacoes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.degustacoes
    ADD CONSTRAINT degustacoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: despesas despesas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despesas
    ADD CONSTRAINT despesas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documento_eventos documento_eventos_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_eventos
    ADD CONSTRAINT documento_eventos_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id);


--
-- Name: documento_eventos documento_eventos_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_eventos
    ADD CONSTRAINT documento_eventos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos_fiscais(id) ON DELETE CASCADE;


--
-- Name: documento_fiscal_itens documento_fiscal_itens_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_fiscal_itens
    ADD CONSTRAINT documento_fiscal_itens_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos_fiscais(id) ON DELETE CASCADE;


--
-- Name: documento_fiscal_itens documento_fiscal_itens_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documento_fiscal_itens
    ADD CONSTRAINT documento_fiscal_itens_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;


--
-- Name: documentos_fiscais documentos_fiscais_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos_fiscais
    ADD CONSTRAINT documentos_fiscais_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: enderecos enderecos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enderecos
    ADD CONSTRAINT enderecos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entrega_atrasos entrega_atrasos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrega_atrasos
    ADD CONSTRAINT entrega_atrasos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: entrega_atrasos entrega_atrasos_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrega_atrasos
    ADD CONSTRAINT entrega_atrasos_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.motoboys(id) ON DELETE SET NULL;


--
-- Name: entrega_atrasos entrega_atrasos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entrega_atrasos
    ADD CONSTRAINT entrega_atrasos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: escalas escalas_funcionario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas
    ADD CONSTRAINT escalas_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;


--
-- Name: estoque_mov estoque_mov_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_mov
    ADD CONSTRAINT estoque_mov_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: estoque_mov estoque_mov_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_mov
    ADD CONSTRAINT estoque_mov_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: estoque_movimentacoes estoque_movimentacoes_lote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_movimentacoes
    ADD CONSTRAINT estoque_movimentacoes_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES public.lotes(id) ON DELETE SET NULL;


--
-- Name: estoque_movimentacoes estoque_movimentacoes_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_movimentacoes
    ADD CONSTRAINT estoque_movimentacoes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: estoque_movimentacoes estoque_movimentacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_movimentacoes
    ADD CONSTRAINT estoque_movimentacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: extratos extratos_conta_bancaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;


--
-- Name: extratos extratos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extratos
    ADD CONSTRAINT extratos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: favoritos favoritos_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favoritos
    ADD CONSTRAINT favoritos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: favoritos favoritos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favoritos
    ADD CONSTRAINT favoritos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fechamentos_mensais fechamentos_mensais_fechado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fechamentos_mensais
    ADD CONSTRAINT fechamentos_mensais_fechado_por_fkey FOREIGN KEY (fechado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ficha_itens ficha_itens_ficha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ficha_itens
    ADD CONSTRAINT ficha_itens_ficha_id_fkey FOREIGN KEY (ficha_id) REFERENCES public.fichas_tecnicas(id) ON DELETE CASCADE;


--
-- Name: ficha_itens ficha_itens_insumo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ficha_itens
    ADD CONSTRAINT ficha_itens_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE RESTRICT;


--
-- Name: fichas_tecnicas fichas_tecnicas_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fichas_tecnicas
    ADD CONSTRAINT fichas_tecnicas_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: fila_fritura fila_fritura_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_fritura
    ADD CONSTRAINT fila_fritura_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: fila_fritura fila_fritura_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_fritura
    ADD CONSTRAINT fila_fritura_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;


--
-- Name: fila_impressao fila_impressao_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fila_impressao
    ADD CONSTRAINT fila_impressao_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: fiscal_certificados fiscal_certificados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fiscal_certificados
    ADD CONSTRAINT fiscal_certificados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa_fiscal(id);


--
-- Name: fritura_fila fritura_fila_funcionario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fritura_fila
    ADD CONSTRAINT fritura_fila_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fritura_fila fritura_fila_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fritura_fila
    ADD CONSTRAINT fritura_fila_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: fritura_fila fritura_fila_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fritura_fila
    ADD CONSTRAINT fritura_fila_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: funcionarios funcionarios_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcionarios
    ADD CONSTRAINT funcionarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: indicacoes indicacoes_indicador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicacoes
    ADD CONSTRAINT indicacoes_indicador_id_fkey FOREIGN KEY (indicador_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: indicacoes indicacoes_novo_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicacoes
    ADD CONSTRAINT indicacoes_novo_user_id_fkey FOREIGN KEY (novo_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: insumo_lotes insumo_lotes_compra_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_lotes
    ADD CONSTRAINT insumo_lotes_compra_fk FOREIGN KEY (compra_id) REFERENCES public.compras(id) ON DELETE SET NULL;


--
-- Name: insumo_lotes insumo_lotes_fornecedor_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_lotes
    ADD CONSTRAINT insumo_lotes_fornecedor_fk FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE SET NULL;


--
-- Name: insumo_lotes insumo_lotes_insumo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_lotes
    ADD CONSTRAINT insumo_lotes_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE CASCADE;


--
-- Name: insumo_movimentacoes insumo_movimentacoes_insumo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_movimentacoes
    ADD CONSTRAINT insumo_movimentacoes_insumo_id_fkey FOREIGN KEY (insumo_id) REFERENCES public.insumos(id) ON DELETE CASCADE;


--
-- Name: insumo_movimentacoes insumo_movimentacoes_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumo_movimentacoes
    ADD CONSTRAINT insumo_movimentacoes_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: jornada_eventos jornada_eventos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jornada_eventos
    ADD CONSTRAINT jornada_eventos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: jornada_eventos jornada_eventos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jornada_eventos
    ADD CONSTRAINT jornada_eventos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lotes lotes_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: metas metas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: motoboy_historico motoboy_historico_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_historico
    ADD CONSTRAINT motoboy_historico_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.motoboys(id) ON DELETE CASCADE;


--
-- Name: motoboy_historico motoboy_historico_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_historico
    ADD CONSTRAINT motoboy_historico_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: motoboy_historico motoboy_historico_rota_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_historico
    ADD CONSTRAINT motoboy_historico_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES public.rotas(id) ON DELETE SET NULL;


--
-- Name: motoboys motoboys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboys
    ADD CONSTRAINT motoboys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE SET NULL;


--
-- Name: orcamentos orcamentos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pedido_itens pedido_itens_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_itens
    ADD CONSTRAINT pedido_itens_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedido_itens pedido_itens_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_itens
    ADD CONSTRAINT pedido_itens_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;


--
-- Name: pedido_lembretes pedido_lembretes_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_lembretes
    ADD CONSTRAINT pedido_lembretes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedido_notas pedido_notas_autor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_notas
    ADD CONSTRAINT pedido_notas_autor_fkey FOREIGN KEY (autor) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pedido_notas pedido_notas_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_notas
    ADD CONSTRAINT pedido_notas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedido_status_historico pedido_status_historico_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_status_historico
    ADD CONSTRAINT pedido_status_historico_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id);


--
-- Name: pedido_status_historico pedido_status_historico_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_status_historico
    ADD CONSTRAINT pedido_status_historico_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pedidos pedidos_aceito_motoboy_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_aceito_motoboy_por_fkey FOREIGN KEY (aceito_motoboy_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_aceito_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_aceito_por_fkey FOREIGN KEY (aceito_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_conferido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_conferido_por_fkey FOREIGN KEY (conferido_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_indicado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_indicado_por_fkey FOREIGN KEY (indicado_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_liberado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_liberado_por_fkey FOREIGN KEY (liberado_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pedidos_recorrentes pedidos_recorrentes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos_recorrentes
    ADD CONSTRAINT pedidos_recorrentes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pedidos pedidos_retirado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_retirado_por_fkey FOREIGN KEY (retirado_por) REFERENCES auth.users(id);


--
-- Name: pedidos pedidos_rota_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES public.rotas_entrega(id) ON DELETE SET NULL;


--
-- Name: pedidos pedidos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pontos_creditos pontos_creditos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos_creditos
    ADD CONSTRAINT pontos_creditos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: pontos pontos_funcionario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos
    ADD CONSTRAINT pontos_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;


--
-- Name: pontos pontos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pontos
    ADD CONSTRAINT pontos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: preco_historico preco_historico_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preco_historico
    ADD CONSTRAINT preco_historico_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;


--
-- Name: preco_historico preco_historico_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preco_historico
    ADD CONSTRAINT preco_historico_usuario_fkey FOREIGN KEY (usuario) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: produtos produtos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reservas_estoque reservas_estoque_lote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_estoque
    ADD CONSTRAINT reservas_estoque_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES public.lotes(id) ON DELETE SET NULL;


--
-- Name: reservas_estoque reservas_estoque_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_estoque
    ADD CONSTRAINT reservas_estoque_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: reservas_estoque reservas_estoque_produto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas_estoque
    ADD CONSTRAINT reservas_estoque_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;


--
-- Name: rota_pedidos rota_pedidos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota_pedidos
    ADD CONSTRAINT rota_pedidos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE;


--
-- Name: rota_pedidos rota_pedidos_rota_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rota_pedidos
    ADD CONSTRAINT rota_pedidos_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES public.rotas_entrega(id) ON DELETE CASCADE;


--
-- Name: rotas_entrega rotas_entrega_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotas_entrega
    ADD CONSTRAINT rotas_entrega_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.motoboys(id) ON DELETE SET NULL;


--
-- Name: rotas rotas_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rotas
    ADD CONSTRAINT rotas_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.motoboys(id) ON DELETE CASCADE;


--
-- Name: solicitacoes_contador solicitacoes_contador_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitacoes_contador
    ADD CONSTRAINT solicitacoes_contador_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vales vales_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vales
    ADD CONSTRAINT vales_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vales vales_funcionario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vales
    ADD CONSTRAINT vales_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE;


--
-- Name: acertos_motoboy acertos staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acertos staff" ON public.acertos_motoboy TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: acertos_motoboy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acertos_motoboy ENABLE ROW LEVEL SECURITY;

--
-- Name: contador_acessos acessos insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acessos insert" ON public.contador_acessos FOR INSERT TO authenticated WITH CHECK ((usuario = auth.uid()));


--
-- Name: contador_acessos acessos read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acessos read" ON public.contador_acessos FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'contador'::public.app_role)));


--
-- Name: admin_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ajuda_artigos ajuda admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ajuda admin" ON public.ajuda_artigos USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ajuda_artigos ajuda read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ajuda read" ON public.ajuda_artigos FOR SELECT USING (true);


--
-- Name: ajuda_artigos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ajuda_artigos ENABLE ROW LEVEL SECURITY;

--
-- Name: entrega_atrasos atrasos staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "atrasos staff" ON public.entrega_atrasos USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: avaliacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: avaliacoes avaliacoes own write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "avaliacoes own write" ON public.avaliacoes TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: avaliacoes avaliacoes public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "avaliacoes public read" ON public.avaliacoes FOR SELECT TO anon, authenticated USING (true);


--
-- Name: contas_bancarias bancos staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bancos staff" ON public.contas_bancarias TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: caixa_sessoes caixa staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "caixa staff" ON public.caixa_sessoes TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: caixa_sessoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caixa_sessoes ENABLE ROW LEVEL SECURITY;

--
-- Name: calculadora_config calc admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "calc admin update" ON public.calculadora_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: calculadora_config calc select publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "calc select publico" ON public.calculadora_config FOR SELECT TO anon, authenticated USING (true);


--
-- Name: calculadora_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calculadora_config ENABLE ROW LEVEL SECURITY;

--
-- Name: campanha_cliques; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campanha_cliques ENABLE ROW LEVEL SECURITY;

--
-- Name: carrinho_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.carrinho_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: carrinho_eventos carrinho_eventos own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "carrinho_eventos own" ON public.carrinho_eventos TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias categorias admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categorias admin write" ON public.categorias TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categorias categorias public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categorias public read" ON public.categorias FOR SELECT TO anon, authenticated USING (true);


--
-- Name: centros_custo centros staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "centros staff" ON public.centros_custo TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: centros_custo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;

--
-- Name: campanha_cliques cliques admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cliques admin read" ON public.campanha_cliques FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: campanha_cliques cliques anon insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cliques anon insert" ON public.campanha_cliques FOR INSERT TO anon, authenticated WITH CHECK (((slug <> ''::text) AND (length(slug) <= 60)));


--
-- Name: compra_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compra_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: compra_itens compra_itens read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compra_itens read" ON public.compra_itens FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: compra_itens compra_itens write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compra_itens write" ON public.compra_itens TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: compras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

--
-- Name: compras compras read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compras read" ON public.compras FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: compras compras write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compras write" ON public.compras TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: contas_bancarias contador read bancos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read bancos" ON public.contas_bancarias FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: caixa_sessoes contador read caixa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read caixa" ON public.caixa_sessoes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: contas contador read contas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read contas" ON public.contas FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: documentos_fiscais contador read docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read docs" ON public.documentos_fiscais FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: documento_eventos contador read eventos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read eventos" ON public.documento_eventos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: empresa_fiscal contador read fiscal; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read fiscal" ON public.empresa_fiscal FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: pedidos contador read pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read pedidos" ON public.pedidos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: produtos contador read produtos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contador read produtos" ON public.produtos FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'contador'::public.app_role));


--
-- Name: contador_acessos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contador_acessos ENABLE ROW LEVEL SECURITY;

--
-- Name: contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

--
-- Name: contas contas staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contas staff" ON public.contas TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: contas_bancarias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_campaigns crm admin all campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crm admin all campaigns" ON public.crm_campaigns TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_customers crm admin all customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crm admin all customers" ON public.crm_customers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_events crm admin all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crm admin all events" ON public.crm_events TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_recipients crm admin all recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crm admin all recipients" ON public.crm_recipients TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_settings crm admin all settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crm admin all settings" ON public.crm_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: cupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;

--
-- Name: cupons cupons admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cupons admin write" ON public.cupons TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cupons cupons read ativos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cupons read ativos" ON public.cupons FOR SELECT TO anon, authenticated USING ((ativo = true));


--
-- Name: cupons cupons resgate proprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cupons resgate proprio" ON public.cupons FOR INSERT TO authenticated WITH CHECK (((codigo ~~ 'FID-%'::text) AND (tipo = 'valor'::text) AND (valor <= (100)::numeric) AND (max_usos = 1) AND (cliente_telefone <> ''::text) AND ((validade_fim IS NULL) OR (validade_fim > now()))));


--
-- Name: datas_demanda datas admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "datas admin" ON public.datas_demanda USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: datas_demanda datas read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "datas read" ON public.datas_demanda FOR SELECT USING (true);


--
-- Name: datas_demanda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.datas_demanda ENABLE ROW LEVEL SECURITY;

--
-- Name: degustacao_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.degustacao_regras ENABLE ROW LEVEL SECURITY;

--
-- Name: degustacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.degustacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: degustacoes degustacoes own/staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "degustacoes own/staff" ON public.degustacoes USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: despesas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

--
-- Name: despesas despesas financeiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "despesas financeiro" ON public.despesas TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: documento_fiscal_itens doc_fiscal_itens admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "doc_fiscal_itens admin" ON public.documento_fiscal_itens TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: documento_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documento_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: documento_fiscal_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documento_fiscal_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos_fiscais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos_fiscais ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_fiscal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresa_fiscal ENABLE ROW LEVEL SECURITY;

--
-- Name: enderecos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enderecos ENABLE ROW LEVEL SECURITY;

--
-- Name: enderecos enderecos own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "enderecos own" ON public.enderecos TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: entrega_atrasos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entrega_atrasos ENABLE ROW LEVEL SECURITY;

--
-- Name: escalas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.escalas ENABLE ROW LEVEL SECURITY;

--
-- Name: escalas escalas read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escalas read" ON public.escalas FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.funcionarios f
  WHERE ((f.id = escalas.funcionario_id) AND (f.user_id = auth.uid()))))));


--
-- Name: escalas escalas write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escalas write" ON public.escalas TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: estoque_movimentacoes est_mov staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "est_mov staff" ON public.estoque_movimentacoes USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: estoque_mov estoque staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "estoque staff" ON public.estoque_mov TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: estoque_mov; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estoque_mov ENABLE ROW LEVEL SECURITY;

--
-- Name: estoque_movimentacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: extratos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extratos ENABLE ROW LEVEL SECURITY;

--
-- Name: extratos extratos staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "extratos staff" ON public.extratos TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: favoritos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;

--
-- Name: favoritos favoritos own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favoritos own" ON public.favoritos TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: fechamentos_mensais fechamentos staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fechamentos staff" ON public.fechamentos_mensais TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'contador'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fechamentos_mensais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;

--
-- Name: ficha_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ficha_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: ficha_itens ficha_itens read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ficha_itens read" ON public.ficha_itens FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: ficha_itens ficha_itens write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ficha_itens write" ON public.ficha_itens TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fichas_tecnicas fichas read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fichas read" ON public.fichas_tecnicas FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: fichas_tecnicas fichas write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fichas write" ON public.fichas_tecnicas TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fichas_tecnicas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fichas_tecnicas ENABLE ROW LEVEL SECURITY;

--
-- Name: fila_impressao fila dono insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fila dono insert" ON public.fila_impressao FOR INSERT TO authenticated WITH CHECK (((tipo = 'pedido'::text) AND (status = 'pendente'::text) AND (trabalho_uuid = ((pedido_id)::text || ':confirmado'::text)) AND (EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = fila_impressao.pedido_id) AND (p.user_id = auth.uid()))))));


--
-- Name: fila_impressao fila staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fila staff" ON public.fila_impressao USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: fila_fritura; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fila_fritura ENABLE ROW LEVEL SECURITY;

--
-- Name: fila_impressao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fila_impressao ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_fiscal fiscal admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fiscal admin" ON public.empresa_fiscal TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documentos_fiscais fiscal docs admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fiscal docs admin" ON public.documentos_fiscais TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: documentos_fiscais fiscal docs own read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fiscal docs own read" ON public.documentos_fiscais FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = documentos_fiscais.pedido_id) AND (p.user_id = auth.uid())))));


--
-- Name: documento_eventos fiscal ev staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fiscal ev staff" ON public.documento_eventos TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fiscal_certificados fiscal_cert admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fiscal_cert admin" ON public.fiscal_certificados TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: fiscal_certificados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_certificados ENABLE ROW LEVEL SECURITY;

--
-- Name: fiscal_provedor_config fiscal_provedor admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fiscal_provedor admin" ON public.fiscal_provedor_config TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: fiscal_provedor_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_provedor_config ENABLE ROW LEVEL SECURITY;

--
-- Name: fornecedores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

--
-- Name: fornecedores fornecedores read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fornecedores read" ON public.fornecedores FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: fornecedores fornecedores write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fornecedores write" ON public.fornecedores TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: fila_fritura fritura staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fritura staff" ON public.fila_fritura USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: fritura_fila fritura staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fritura staff" ON public.fritura_fila USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: fritura_fila; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fritura_fila ENABLE ROW LEVEL SECURITY;

--
-- Name: funcionarios func proprio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "func proprio" ON public.funcionarios FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: funcionarios func staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "func staff" ON public.funcionarios TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: funcionarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

--
-- Name: hero_carousel hero admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hero admin all" ON public.hero_carousel TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: hero_carousel hero select publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hero select publico" ON public.hero_carousel FOR SELECT TO anon, authenticated USING ((ativo = true));


--
-- Name: hero_carousel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hero_carousel ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_status_historico hist dono insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hist dono insert" ON public.pedido_status_historico FOR INSERT TO authenticated WITH CHECK (((de_status IS NULL) AND (para_status = 'recebido'::text) AND (EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_status_historico.pedido_id) AND (p.user_id = auth.uid()))))));


--
-- Name: pedido_status_historico hist dono/staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hist dono/staff" ON public.pedido_status_historico FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_status_historico.pedido_id) AND ((p.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role))))));


--
-- Name: pedido_status_historico hist staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hist staff insert" ON public.pedido_status_historico FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_status_historico.pedido_id) AND (p.user_id = auth.uid()))))));


--
-- Name: horario_config horario admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "horario admin write" ON public.horario_config USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: horario_config horario public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "horario public read" ON public.horario_config FOR SELECT USING (true);


--
-- Name: horario_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.horario_config ENABLE ROW LEVEL SECURITY;

--
-- Name: indicacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: indicacoes indicacoes own/admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "indicacoes own/admin" ON public.indicacoes USING (((indicador_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((indicador_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: insumo_lotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insumo_lotes ENABLE ROW LEVEL SECURITY;

--
-- Name: insumo_lotes insumo_lotes read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumo_lotes read" ON public.insumo_lotes FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: insumo_lotes insumo_lotes write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumo_lotes write" ON public.insumo_lotes TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: insumo_movimentacoes insumo_mov admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumo_mov admin update" ON public.insumo_movimentacoes FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: insumo_movimentacoes insumo_mov read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumo_mov read" ON public.insumo_movimentacoes FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: insumo_movimentacoes insumo_mov write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumo_mov write" ON public.insumo_movimentacoes FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR (public.has_role(auth.uid(), 'producao'::public.app_role) AND (tipo = ANY (ARRAY['perda'::text, 'consumo'::text])))));


--
-- Name: insumo_movimentacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insumo_movimentacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: insumos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;

--
-- Name: insumos insumos delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumos delete" ON public.insumos FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: insumos insumos read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumos read" ON public.insumos FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: insumos insumos update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumos update" ON public.insumos FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: insumos insumos write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insumos write" ON public.insumos FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: pedido_itens itens insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "itens insert" ON public.pedido_itens FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_itens.pedido_id) AND (p.user_id = auth.uid())))));


--
-- Name: pedido_itens itens select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "itens select" ON public.pedido_itens FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_itens.pedido_id) AND ((p.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR (public.has_role(auth.uid(), 'motoboy'::public.app_role) AND ((p.motoboy_id = auth.uid()) OR ((p.motoboy_id IS NULL) AND (p.status = ANY (ARRAY['pronto'::public.order_status, 'aguardando_motoboy'::public.order_status]))))))))));


--
-- Name: pedido_itens itens select owner staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "itens select owner staff" ON public.pedido_itens FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_itens.pedido_id) AND ((p.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR (public.has_role(auth.uid(), 'motoboy'::public.app_role) AND ((p.motoboy_id = auth.uid()) OR ((p.motoboy_id IS NULL) AND (p.status = ANY (ARRAY['pronto'::public.order_status, 'aguardando_motoboy'::public.order_status]))))))))));


--
-- Name: pedido_itens itens staff operacional select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "itens staff operacional select" ON public.pedido_itens FOR SELECT TO authenticated USING (((public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)) AND (EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_itens.pedido_id) AND (p.status = ANY (ARRAY['recebido'::public.order_status, 'em_producao'::public.order_status, 'pronto'::public.order_status, 'aguardando_motoboy'::public.order_status, 'em_rota'::public.order_status, 'entregue'::public.order_status])))))));


--
-- Name: jornada_eventos jornada own/admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jornada own/admin" ON public.jornada_eventos USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: jornada_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jornada_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_lembretes lembretes staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lembretes staff" ON public.pedido_lembretes USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: admin_logs logs admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs admin" ON public.admin_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_logs logs staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs staff insert" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: loja_config loja admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loja admin update" ON public.loja_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: loja_config loja select publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loja select publico" ON public.loja_config FOR SELECT TO anon, authenticated USING (true);


--
-- Name: loja_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loja_config ENABLE ROW LEVEL SECURITY;

--
-- Name: lotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

--
-- Name: lotes lotes public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lotes public read" ON public.lotes FOR SELECT USING (true);


--
-- Name: lotes lotes staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lotes staff" ON public.lotes USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: metas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

--
-- Name: metas metas admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas admin" ON public.metas TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: motoboy_historico motoboy_hist staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "motoboy_hist staff" ON public.motoboy_historico USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: motoboy_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motoboy_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: motoboys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;

--
-- Name: motoboys motoboys admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "motoboys admin all" ON public.motoboys TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: motoboys motoboys self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "motoboys self insert" ON public.motoboys FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: motoboys motoboys self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "motoboys self read" ON public.motoboys FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: motoboys motoboys self status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "motoboys self status" ON public.motoboys FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: motoboys motoboys staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "motoboys staff" ON public.motoboys USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pedido_notas notas cliente visiveis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notas cliente visiveis" ON public.pedido_notas FOR SELECT TO authenticated USING (((visivel_cliente = true) AND (EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_notas.pedido_id) AND (p.user_id = auth.uid()))))));


--
-- Name: pedido_notas notas staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notas staff" ON public.pedido_notas TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR (public.has_role(auth.uid(), 'motoboy'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.pedidos p
  WHERE ((p.id = pedido_notas.pedido_id) AND ((p.motoboy_id = auth.uid()) OR (p.motoboy_id IS NULL)))))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: notificacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacoes notificacoes motoboy insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes motoboy insert" ON public.notificacoes FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: notificacoes notificacoes motoboy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes motoboy read" ON public.notificacoes FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: notificacoes notificacoes staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes staff" ON public.notificacoes TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orcamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: orcamentos orcamentos own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orcamentos own" ON public.orcamentos TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: profiles own profile insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: profiles own profile select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles own profile update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: parceiros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;

--
-- Name: parceiros parceiros admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parceiros admin read" ON public.parceiros FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: POLICY "parceiros admin read" ON parceiros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "parceiros admin read" ON public.parceiros IS '0096: leitura direta somente admin; publico usa a view parceiros_publicos.';


--
-- Name: parceiros parceiros admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parceiros admin write" ON public.parceiros TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: POLICY "parceiros admin write" ON parceiros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "parceiros admin write" ON public.parceiros IS '0096: update/delete/insert administrativo somente admin.';


--
-- Name: parceiros parceiros candidatura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parceiros candidatura" ON public.parceiros FOR INSERT TO anon, authenticated WITH CHECK (((status = 'nova'::text) AND ((length(nome) >= 1) AND (length(nome) <= 200)) AND (COALESCE(length(proposta), 0) <= 2000) AND (COALESCE(length(descricao), 0) <= 2000)));


--
-- Name: POLICY "parceiros candidatura" ON parceiros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "parceiros candidatura" ON public.parceiros IS '0096: candidatura publica somente status=nova e textos limitados.';


--
-- Name: pedido_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_lembretes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_lembretes ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_notas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_notas ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_status_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_status_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_status_transicoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedido_status_transicoes ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos pedidos atendente fluxo select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos atendente fluxo select" ON public.pedidos FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'atendente'::public.app_role) AND (status = ANY (ARRAY['recebido'::public.order_status, 'em_producao'::public.order_status, 'pronto'::public.order_status, 'aguardando_motoboy'::public.order_status, 'em_rota'::public.order_status, 'entregue'::public.order_status]))));


--
-- Name: pedidos pedidos atendente read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos atendente read" ON public.pedidos FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: pedidos pedidos insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos insert own" ON public.pedidos FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: pedidos pedidos motoboy claim; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos motoboy claim" ON public.pedidos FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'motoboy'::public.app_role) AND (motoboy_id IS NULL) AND (status = ANY (ARRAY['pronto'::public.order_status, 'aguardando_motoboy'::public.order_status])))) WITH CHECK (((motoboy_id = auth.uid()) AND (status = 'aguardando_motoboy'::public.order_status)));


--
-- Name: POLICY "pedidos motoboy claim" ON pedidos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "pedidos motoboy claim" ON public.pedidos IS '0070: só aceite atômico (sem dono -> próprio). UPDATE geral exige dono.';


--
-- Name: pedidos pedidos select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos select" ON public.pedidos FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR (public.has_role(auth.uid(), 'motoboy'::public.app_role) AND ((motoboy_id = auth.uid()) OR ((motoboy_id IS NULL) AND (status = ANY (ARRAY['pronto'::public.order_status, 'aguardando_motoboy'::public.order_status])))))));


--
-- Name: pedidos pedidos update motoboy gps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos update motoboy gps" ON public.pedidos FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'motoboy'::public.app_role) AND (motoboy_id = auth.uid()))) WITH CHECK ((public.has_role(auth.uid(), 'motoboy'::public.app_role) AND (motoboy_id = auth.uid())));


--
-- Name: pedidos pedidos update staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pedidos update staff" ON public.pedidos FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR (public.has_role(auth.uid(), 'motoboy'::public.app_role) AND (motoboy_id = auth.uid())) OR ((user_id = auth.uid()) AND (status = 'recebido'::public.order_status))));


--
-- Name: pedidos_recorrentes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos_recorrentes ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_notification_events pix_events_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pix_events_staff_read ON public.pix_notification_events FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: pix_notification_events pix_events_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pix_events_staff_update ON public.pix_notification_events FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: pix_notification_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pix_notification_events ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_reader_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pix_reader_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_reader_devices pix_reader_devices_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pix_reader_devices_staff_read ON public.pix_reader_devices FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: plano_contas plano staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plano staff" ON public.plano_contas TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: plano_contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;

--
-- Name: pontos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pontos ENABLE ROW LEVEL SECURITY;

--
-- Name: pontos pontos admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pontos admin update" ON public.pontos FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: pontos pontos insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pontos insert" ON public.pontos FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.funcionarios f
  WHERE ((f.id = pontos.funcionario_id) AND (f.user_id = auth.uid())))))));


--
-- Name: pontos pontos propria saida; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pontos propria saida" ON public.pontos FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (saida IS NULL))) WITH CHECK ((user_id = auth.uid()));


--
-- Name: pontos pontos read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pontos read" ON public.pontos FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.funcionarios f
  WHERE ((f.id = pontos.funcionario_id) AND (f.user_id = auth.uid()))))));


--
-- Name: pontos_creditos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pontos_creditos ENABLE ROW LEVEL SECURITY;

--
-- Name: pontos_creditos pontos_creditos own read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pontos_creditos own read" ON public.pontos_creditos FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: precificacao_config precificacao staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "precificacao staff" ON public.precificacao_config TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: precificacao_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.precificacao_config ENABLE ROW LEVEL SECURITY;

--
-- Name: preco_historico preco_hist staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "preco_hist staff" ON public.preco_historico TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: preco_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preco_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos produtos admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "produtos admin write" ON public.produtos TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: produtos produtos public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "produtos public read" ON public.produtos FOR SELECT TO anon, authenticated USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles atendente read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles atendente read" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'atendente'::public.app_role));


--
-- Name: push_subscriptions push own manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push own manage" ON public.push_subscriptions TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: push_subscriptions push staff existe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push staff existe" ON public.push_subscriptions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role)));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_recorrentes recorrentes own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recorrentes own" ON public.pedidos_recorrentes TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role)));


--
-- Name: degustacao_regras regras admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "regras admin" ON public.degustacao_regras USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: degustacao_regras regras read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "regras read" ON public.degustacao_regras FOR SELECT USING (true);


--
-- Name: reservas_estoque reservas staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reservas staff" ON public.reservas_estoque USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: reservas_estoque; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservas_estoque ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles roles admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "roles admin manage" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles roles select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "roles select own" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: rota_pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rota_pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: rota_pedidos rota_pedidos staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rota_pedidos staff" ON public.rota_pedidos USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: rotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;

--
-- Name: rotas rotas staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rotas staff" ON public.rotas USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role))) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: rotas_entrega rotas staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rotas staff" ON public.rotas_entrega USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role)));


--
-- Name: rotas_entrega; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rotas_entrega ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitacoes_contador solic admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solic admin update" ON public.solicitacoes_contador FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: solicitacoes_contador solic insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solic insert" ON public.solicitacoes_contador FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'contador'::public.app_role)));


--
-- Name: solicitacoes_contador solic read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solic read" ON public.solicitacoes_contador FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR public.has_role(auth.uid(), 'contador'::public.app_role)));


--
-- Name: solicitacoes_contador; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solicitacoes_contador ENABLE ROW LEVEL SECURITY;

--
-- Name: pedido_status_transicoes transicoes staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transicoes staff read" ON public.pedido_status_transicoes FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'atendente'::public.app_role) OR public.has_role(auth.uid(), 'producao'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role)));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: vales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vales ENABLE ROW LEVEL SECURITY;

--
-- Name: vales vales read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vales read" ON public.vales FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.funcionarios f
  WHERE ((f.id = vales.funcionario_id) AND (f.user_id = auth.uid()))))));


--
-- Name: vales vales write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vales write" ON public.vales TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'financeiro'::public.app_role)));


--
-- Name: objects hero bucket admin delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "hero bucket admin delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'hero'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: objects hero bucket admin insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "hero bucket admin insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'hero'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: objects hero bucket admin update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "hero bucket admin update" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'hero'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK (((bucket_id = 'hero'::text) AND public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: objects hero bucket select publico; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "hero bucket select publico" ON storage.objects FOR SELECT TO anon, authenticated USING ((bucket_id = 'hero'::text));


--
-- Name: FUNCTION aceitar_entrega_motoboy(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid) TO authenticated;


--
-- Name: FUNCTION aceitar_pedido_atendente(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid) TO authenticated;


--
-- Name: FUNCTION adiar_cupom_agendado(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.adiar_cupom_agendado() FROM PUBLIC;


--
-- Name: FUNCTION atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean) TO authenticated;


--
-- Name: FUNCTION calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer) FROM PUBLIC;


--
-- Name: FUNCTION conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text) TO authenticated;


--
-- Name: FUNCTION congelar_colunas_protegidas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.congelar_colunas_protegidas() FROM PUBLIC;


--
-- Name: FUNCTION consumir_insumos_pedido(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.consumir_insumos_pedido(p_pedido_id uuid) TO authenticated;


--
-- Name: FUNCTION converter_unidade(p_qtd numeric, p_de text, p_para text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.converter_unidade(p_qtd numeric, p_de text, p_para text) TO authenticated;


--
-- Name: FUNCTION creditar_pontos_pedido(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.creditar_pontos_pedido(p_pedido_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.creditar_pontos_pedido(p_pedido_id uuid) TO authenticated;


--
-- Name: FUNCTION enfileirar_cupom(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enfileirar_cupom(p_pedido_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.enfileirar_cupom(p_pedido_id uuid) TO service_role;


--
-- Name: FUNCTION enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text) TO authenticated;


--
-- Name: FUNCTION estornar_conta(p_conta_id uuid, p_motivo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.estornar_conta(p_conta_id uuid, p_motivo text) TO authenticated;


--
-- Name: FUNCTION exigir_conferencia_para_pronto(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.exigir_conferencia_para_pronto() FROM PUBLIC;


--
-- Name: FUNCTION gerar_cupons_pedidos_pagos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gerar_cupons_pedidos_pagos() TO authenticated;


--
-- Name: FUNCTION gerar_msg_apartamento(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gerar_msg_apartamento(p_pedido_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION impedir_parada_duplicada(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.impedir_parada_duplicada() FROM PUBLIC;


--
-- Name: FUNCTION liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer) TO authenticated;


--
-- Name: FUNCTION liberar_reserva_atomica(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid) TO authenticated;


--
-- Name: FUNCTION liberar_reserva_pedido(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION receber_compra_item(p_item_id uuid, p_qtd numeric, p_unidade text, p_validade date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.receber_compra_item(p_item_id uuid, p_qtd numeric, p_unidade text, p_validade date) TO authenticated;


--
-- Name: FUNCTION registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid, p_referencia_id uuid, p_referencia_tipo text, p_usuario_id uuid, p_observacao text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid, p_referencia_id uuid, p_referencia_tipo text, p_usuario_id uuid, p_observacao text) FROM PUBLIC;


--
-- Name: FUNCTION registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid, p_referencia_id uuid, p_referencia_tipo text, p_usuario_id uuid, p_observacao text, p_atualizar_estoque boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_mov_estoque(p_produto_id uuid, p_tipo public.tipo_mov_estoque, p_quantidade integer, p_lote_id uuid, p_referencia_id uuid, p_referencia_tipo text, p_usuario_id uuid, p_observacao text, p_atualizar_estoque boolean) FROM PUBLIC;


--
-- Name: FUNCTION reservar_estoque_atomica(p_pedido_id uuid, p_produto_id uuid, p_qtd integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(p_pedido_id uuid, p_produto_id uuid, p_qtd integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reservar_estoque_atomica(p_pedido_id uuid, p_produto_id uuid, p_qtd integer) TO authenticated;


--
-- Name: FUNCTION reservar_estoque_pedido(p_pedido_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION resgatar_fidelidade(p_telefone text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resgatar_fidelidade(p_telefone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resgatar_fidelidade(p_telefone text) TO authenticated;


--
-- Name: FUNCTION retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean) TO authenticated;


--
-- Name: FUNCTION solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text) TO authenticated;


--
-- Name: TABLE acertos_motoboy; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.acertos_motoboy TO authenticated;
GRANT ALL ON TABLE public.acertos_motoboy TO service_role;


--
-- Name: TABLE admin_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_logs TO service_role;
GRANT ALL ON TABLE public.admin_logs TO authenticated;


--
-- Name: TABLE ajuda_artigos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ajuda_artigos TO authenticated;
GRANT SELECT ON TABLE public.ajuda_artigos TO anon;


--
-- Name: TABLE avaliacoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.avaliacoes TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.avaliacoes TO authenticated;
GRANT ALL ON TABLE public.avaliacoes TO service_role;


--
-- Name: TABLE caixa_sessoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caixa_sessoes TO authenticated;
GRANT ALL ON TABLE public.caixa_sessoes TO service_role;


--
-- Name: TABLE calculadora_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calculadora_config TO service_role;
GRANT SELECT ON TABLE public.calculadora_config TO anon;
GRANT SELECT,UPDATE ON TABLE public.calculadora_config TO authenticated;


--
-- Name: TABLE campanha_cliques; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campanha_cliques TO service_role;
GRANT ALL ON TABLE public.campanha_cliques TO authenticated;


--
-- Name: TABLE carrinho_eventos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.carrinho_eventos TO service_role;
GRANT ALL ON TABLE public.carrinho_eventos TO authenticated;


--
-- Name: TABLE categorias; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.categorias TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.categorias TO authenticated;
GRANT ALL ON TABLE public.categorias TO service_role;


--
-- Name: TABLE centros_custo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.centros_custo TO authenticated;
GRANT ALL ON TABLE public.centros_custo TO service_role;


--
-- Name: TABLE compra_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.compra_itens TO authenticated;
GRANT ALL ON TABLE public.compra_itens TO service_role;


--
-- Name: TABLE compras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.compras TO authenticated;
GRANT ALL ON TABLE public.compras TO service_role;


--
-- Name: TABLE contador_acessos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.contador_acessos TO authenticated;
GRANT ALL ON TABLE public.contador_acessos TO service_role;


--
-- Name: TABLE contas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contas TO authenticated;
GRANT ALL ON TABLE public.contas TO service_role;


--
-- Name: TABLE contas_bancarias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contas_bancarias TO authenticated;
GRANT ALL ON TABLE public.contas_bancarias TO service_role;


--
-- Name: TABLE crm_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_campaigns TO service_role;
GRANT ALL ON TABLE public.crm_campaigns TO authenticated;


--
-- Name: TABLE crm_customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_customers TO service_role;
GRANT ALL ON TABLE public.crm_customers TO authenticated;


--
-- Name: TABLE crm_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_events TO service_role;
GRANT ALL ON TABLE public.crm_events TO authenticated;


--
-- Name: TABLE crm_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_recipients TO service_role;
GRANT ALL ON TABLE public.crm_recipients TO authenticated;


--
-- Name: TABLE crm_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.crm_settings TO service_role;
GRANT ALL ON TABLE public.crm_settings TO authenticated;


--
-- Name: TABLE cupons; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.cupons TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cupons TO authenticated;
GRANT ALL ON TABLE public.cupons TO service_role;


--
-- Name: TABLE datas_demanda; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.datas_demanda TO authenticated;
GRANT SELECT ON TABLE public.datas_demanda TO anon;


--
-- Name: TABLE degustacao_regras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.degustacao_regras TO authenticated;


--
-- Name: TABLE degustacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.degustacoes TO authenticated;


--
-- Name: TABLE despesas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.despesas TO service_role;
GRANT ALL ON TABLE public.despesas TO authenticated;


--
-- Name: TABLE documento_eventos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documento_eventos TO authenticated;


--
-- Name: TABLE documento_fiscal_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documento_fiscal_itens TO authenticated;


--
-- Name: TABLE documentos_fiscais; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documentos_fiscais TO authenticated;


--
-- Name: TABLE empresa_fiscal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.empresa_fiscal TO authenticated;


--
-- Name: TABLE enderecos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.enderecos TO authenticated;
GRANT ALL ON TABLE public.enderecos TO service_role;


--
-- Name: TABLE entrega_atrasos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.entrega_atrasos TO authenticated;


--
-- Name: TABLE escalas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.escalas TO authenticated;
GRANT ALL ON TABLE public.escalas TO service_role;


--
-- Name: TABLE estoque_mov; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.estoque_mov TO service_role;
GRANT ALL ON TABLE public.estoque_mov TO authenticated;


--
-- Name: TABLE estoque_movimentacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.estoque_movimentacoes TO authenticated;


--
-- Name: TABLE extratos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.extratos TO authenticated;
GRANT ALL ON TABLE public.extratos TO service_role;


--
-- Name: TABLE favoritos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.favoritos TO authenticated;
GRANT ALL ON TABLE public.favoritos TO service_role;


--
-- Name: TABLE fechamentos_mensais; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fechamentos_mensais TO authenticated;
GRANT ALL ON TABLE public.fechamentos_mensais TO service_role;


--
-- Name: TABLE ficha_itens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ficha_itens TO authenticated;
GRANT ALL ON TABLE public.ficha_itens TO service_role;


--
-- Name: TABLE fichas_tecnicas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fichas_tecnicas TO authenticated;
GRANT ALL ON TABLE public.fichas_tecnicas TO service_role;


--
-- Name: TABLE fila_fritura; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fila_fritura TO authenticated;


--
-- Name: TABLE fila_impressao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fila_impressao TO authenticated;


--
-- Name: TABLE fiscal_certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fiscal_certificados TO authenticated;


--
-- Name: TABLE fiscal_provedor_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fiscal_provedor_config TO authenticated;


--
-- Name: TABLE fornecedores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fornecedores TO authenticated;
GRANT ALL ON TABLE public.fornecedores TO service_role;


--
-- Name: TABLE fritura_fila; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fritura_fila TO authenticated;


--
-- Name: TABLE funcionarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.funcionarios TO authenticated;
GRANT ALL ON TABLE public.funcionarios TO service_role;


--
-- Name: TABLE hero_carousel; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hero_carousel TO service_role;
GRANT SELECT ON TABLE public.hero_carousel TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.hero_carousel TO authenticated;


--
-- Name: TABLE horario_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.horario_config TO authenticated;
GRANT SELECT ON TABLE public.horario_config TO anon;


--
-- Name: TABLE indicacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.indicacoes TO authenticated;


--
-- Name: TABLE insumo_lotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.insumo_lotes TO authenticated;
GRANT ALL ON TABLE public.insumo_lotes TO service_role;


--
-- Name: TABLE insumo_movimentacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.insumo_movimentacoes TO authenticated;
GRANT ALL ON TABLE public.insumo_movimentacoes TO service_role;


--
-- Name: TABLE insumos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.insumos TO authenticated;
GRANT ALL ON TABLE public.insumos TO service_role;


--
-- Name: TABLE jornada_eventos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jornada_eventos TO authenticated;


--
-- Name: TABLE loja_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.loja_config TO service_role;
GRANT SELECT ON TABLE public.loja_config TO anon;
GRANT SELECT,UPDATE ON TABLE public.loja_config TO authenticated;


--
-- Name: TABLE lotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lotes TO authenticated;
GRANT SELECT ON TABLE public.lotes TO anon;


--
-- Name: TABLE metas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.metas TO service_role;
GRANT ALL ON TABLE public.metas TO authenticated;


--
-- Name: TABLE motoboy_historico; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.motoboy_historico TO authenticated;


--
-- Name: TABLE motoboys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.motoboys TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.motoboys TO authenticated;


--
-- Name: TABLE notificacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notificacoes TO service_role;
GRANT ALL ON TABLE public.notificacoes TO authenticated;


--
-- Name: TABLE orcamentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orcamentos TO service_role;
GRANT ALL ON TABLE public.orcamentos TO authenticated;


--
-- Name: TABLE parceiros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parceiros TO authenticated;
GRANT INSERT ON TABLE public.parceiros TO anon;


--
-- Name: TABLE parceiros_publicos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.parceiros_publicos TO anon;
GRANT SELECT ON TABLE public.parceiros_publicos TO authenticated;


--
-- Name: TABLE pedido_itens; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.pedido_itens TO authenticated;
GRANT ALL ON TABLE public.pedido_itens TO service_role;


--
-- Name: TABLE pedido_lembretes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedido_lembretes TO authenticated;


--
-- Name: TABLE pedido_notas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedido_notas TO service_role;
GRANT ALL ON TABLE public.pedido_notas TO authenticated;


--
-- Name: TABLE pedido_status_historico; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedido_status_historico TO authenticated;
GRANT SELECT ON TABLE public.pedido_status_historico TO anon;


--
-- Name: TABLE pedido_status_transicoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pedido_status_transicoes TO authenticated;


--
-- Name: TABLE pedidos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.pedidos TO authenticated;
GRANT ALL ON TABLE public.pedidos TO service_role;


--
-- Name: COLUMN pedidos.motoboy_lat; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(motoboy_lat),UPDATE(motoboy_lat) ON TABLE public.pedidos TO authenticated;


--
-- Name: COLUMN pedidos.motoboy_lng; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(motoboy_lng),UPDATE(motoboy_lng) ON TABLE public.pedidos TO authenticated;


--
-- Name: COLUMN pedidos.motoboy_atualizado_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(motoboy_atualizado_em),UPDATE(motoboy_atualizado_em) ON TABLE public.pedidos TO authenticated;


--
-- Name: TABLE pedidos_recorrentes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pedidos_recorrentes TO service_role;
GRANT ALL ON TABLE public.pedidos_recorrentes TO authenticated;


--
-- Name: TABLE pix_notification_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.pix_notification_events TO authenticated;
GRANT ALL ON TABLE public.pix_notification_events TO service_role;


--
-- Name: TABLE pix_reader_devices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pix_reader_devices TO authenticated;
GRANT ALL ON TABLE public.pix_reader_devices TO service_role;


--
-- Name: TABLE plano_contas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plano_contas TO authenticated;
GRANT ALL ON TABLE public.plano_contas TO service_role;


--
-- Name: TABLE pontos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pontos TO authenticated;
GRANT ALL ON TABLE public.pontos TO service_role;


--
-- Name: TABLE pontos_creditos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pontos_creditos TO authenticated;
GRANT ALL ON TABLE public.pontos_creditos TO service_role;


--
-- Name: TABLE precificacao_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.precificacao_config TO authenticated;
GRANT ALL ON TABLE public.precificacao_config TO service_role;


--
-- Name: TABLE preco_historico; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preco_historico TO authenticated;
GRANT ALL ON TABLE public.preco_historico TO service_role;


--
-- Name: TABLE produtos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.produtos TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.produtos TO authenticated;
GRANT ALL ON TABLE public.produtos TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: TABLE reservas_estoque; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservas_estoque TO authenticated;


--
-- Name: TABLE rota_pedidos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rota_pedidos TO authenticated;


--
-- Name: TABLE rotas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rotas TO authenticated;


--
-- Name: TABLE rotas_entrega; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rotas_entrega TO authenticated;


--
-- Name: TABLE solicitacoes_contador; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.solicitacoes_contador TO authenticated;
GRANT ALL ON TABLE public.solicitacoes_contador TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE vales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vales TO authenticated;
GRANT ALL ON TABLE public.vales TO service_role;


--
-- PostgreSQL database dump complete
--

