-- 0110: operações persistidas do motoboy — lote 1: confirmação de retirada.
-- Apenas a Central atribui pedidos (0108/0109). O motoboy só confirma a retirada
-- de pedidos já atribuídos a ele e incluídos numa rota ativa.
-- Local/homologação. Não aplicar em produção sem staging autorizado.
-- Idempotente (DROP/CREATE). Execução isolada em PostgreSQL 17 descartável.

-- =============================================
-- 1. Colunas de rastreio da retirada pelo motoboy
--    (semântica distinta de retirado_em/retirado_por da retirada do cliente, 0084)
-- =============================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS retirada_em timestamptz,
  ADD COLUMN IF NOT EXISTS retirada_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS retirada_rota_id uuid REFERENCES public.rotas_entrega(id);

-- A prova de retirada só é gravada pela RPC ou por um operador de banco confiável.
CREATE OR REPLACE FUNCTION public.proteger_prova_retirada_motoboy()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF ROW(NEW.retirada_em, NEW.retirada_por, NEW.retirada_rota_id)
         IS DISTINCT FROM ROW(NULL::timestamptz, NULL::uuid, NULL::uuid) THEN
        RAISE EXCEPTION 'A retirada exige a RPC confirmar_retirada' USING ERRCODE = '42501';
      END IF;
    ELSIF ROW(NEW.retirada_em, NEW.retirada_por, NEW.retirada_rota_id)
        IS DISTINCT FROM ROW(OLD.retirada_em, OLD.retirada_por, OLD.retirada_rota_id) THEN
      RAISE EXCEPTION 'A retirada exige a RPC confirmar_retirada' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_prova_retirada_motoboy ON public.pedidos;
CREATE TRIGGER proteger_prova_retirada_motoboy
BEFORE INSERT OR UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.proteger_prova_retirada_motoboy();

COMMENT ON COLUMN public.pedidos.retirada_em IS 'Horário em que o motoboy confirmou a retirada do pedido para a rota (entrega).';
COMMENT ON COLUMN public.pedidos.retirada_por IS 'Usuário (auth.users.id) do motoboy que confirmou a retirada.';

-- =============================================
-- 2. RPC: confirmar_retirada
-- =============================================
CREATE OR REPLACE FUNCTION public.confirmar_retirada(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_status public.order_status;
  v_tipo text;
  v_dono uuid;
  v_rota_id uuid;
  v_ja_retirado timestamptz;
  v_retirada_por uuid;
  v_retirada_rota uuid;
BEGIN
  -- 1. Autenticação e papel do chamador.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Ponte login -> cadastro do motoboy (motoboys.user_id = auth.users.id).
  SELECT m.id INTO v_motoboy_row_id
    FROM public.motoboys m
   WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- 3. Trava a linha do pedido: serializa retiradas concorrentes do mesmo pedido.
  SELECT p.status, p.tipo_entrega, p.motoboy_id, p.retirada_em, p.retirada_por, p.retirada_rota_id
    INTO v_status, v_tipo, v_dono, v_ja_retirado, v_retirada_por, v_retirada_rota
    FROM public.pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'pedido_nao_encontrado');
  END IF;

  -- 4. Tipo de entrega: retirada do motoboy só se aplica a entregas.
  IF v_tipo <> 'entrega' THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'retirada_apenas_entrega');
  END IF;

  -- 5. Propriedade: o pedido deve estar atribuído a este motoboy (auth.users.id).
  IF v_dono IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'pedido_de_outro_motoboy');
  END IF;

  -- 6. Transição de status: pedido deve estar aguardando retirada do motoboy.
  IF v_status <> 'aguardando_motoboy' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'pedido_nao_aguarda_retirada');
  END IF;

  -- 7. O pedido deve pertencer a uma rota ativa deste mesmo motoboy (vinculo via rota_pedidos).
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;
  SELECT r.id INTO v_rota_id
    FROM public.rota_pedidos rp
    JOIN public.rotas_entrega r ON r.id = rp.rota_id
   WHERE rp.pedido_id = p_pedido_id
     AND r.motoboy_id = v_motoboy_row_id
     AND r.status = 'preparando'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'pedido_sem_rota_ativa');
  END IF;

  -- 8. Idempotência: retirada já confirmada para este pedido por este motoboy.
  IF v_ja_retirado IS NOT NULL AND v_retirada_por = v_uid AND v_retirada_rota = v_rota_id THEN
    RETURN jsonb_build_object(
      'status', 'ok',
      'motivo', 'retirada_ja_confirmada',
      'pedido_id', p_pedido_id,
      'rota_id', v_rota_id,
      'retirada_em', v_ja_retirado
    );
  END IF;

  -- 9. Confirma retirada na mesma transação que os travamentos acima.
  UPDATE public.pedidos
     SET retirada_em = now(),
         retirada_por = v_uid,
         retirada_rota_id = v_rota_id
   WHERE id = p_pedido_id
     AND status = 'aguardando_motoboy'
     AND motoboy_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'condicao_de_corrida');
  END IF;

  -- 10. Evento de histórico da operação (mesma transação, rollback automático).
  -- rota_id fica NULL: motoboy_historico.rota_id referencia a tabela legada rotas (0044),
  -- não rotas_entrega (0024/0108). A rota persistida fica na resposta JSON e em rotas_entrega.
  INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
  VALUES (
    v_motoboy_row_id,
    NULL,
    p_pedido_id,
    'saida_base',
    'Retirada confirmada pelo motoboy para pedido #' || (SELECT numero FROM public.pedidos WHERE id = p_pedido_id) || ' (rota ' || v_rota_id::text || ')'
  );

  RETURN jsonb_build_object(
    'status', 'ok',
    'motivo', 'retirada_confirmada',
    'pedido_id', p_pedido_id,
    'rota_id', v_rota_id,
    'retirada_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_retirada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_retirada(uuid) TO authenticated;
COMMENT ON FUNCTION public.confirmar_retirada(uuid) IS '0110: motoboy confirma retirada de pedido atribuído e em rota ativa. Transação única, idempotente.';
