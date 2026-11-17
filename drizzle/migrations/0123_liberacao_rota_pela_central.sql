-- 0123: atribuição automática, sem aceite; saída exige liberação da Central.
-- Incremental: preserva 0111 e o histórico. Rotas preparando não recebem liberação retroativa.
ALTER TABLE public.rotas_entrega
 ADD COLUMN IF NOT EXISTS liberada_central_em timestamptz,
 ADD COLUMN IF NOT EXISTS liberada_central_por uuid REFERENCES auth.users(id),
 ADD COLUMN IF NOT EXISTS liberacao_pedidos uuid[],
 ADD COLUMN IF NOT EXISTS liberacao_motoboy uuid REFERENCES public.motoboys(id);

CREATE OR REPLACE FUNCTION public.proteger_liberacao_rota()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
   IF TG_OP = 'INSERT' THEN
     IF NEW.liberada_central_em IS NOT NULL OR NEW.liberada_central_por IS NOT NULL
        OR NEW.liberacao_pedidos IS NOT NULL OR NEW.liberacao_motoboy IS NOT NULL THEN
       RAISE EXCEPTION 'Liberação exige a RPC da Central' USING ERRCODE='42501';
     END IF;
   ELSIF ROW(NEW.liberada_central_em,NEW.liberada_central_por,NEW.liberacao_pedidos,NEW.liberacao_motoboy)
      IS DISTINCT FROM ROW(OLD.liberada_central_em,OLD.liberada_central_por,OLD.liberacao_pedidos,OLD.liberacao_motoboy) THEN
     RAISE EXCEPTION 'Liberação exige a RPC da Central' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER proteger_liberacao_rota BEFORE INSERT OR UPDATE ON public.rotas_entrega
 FOR EACH ROW EXECUTE FUNCTION public.proteger_liberacao_rota();

CREATE OR REPLACE FUNCTION public.liberar_rota_entrega(p_rota_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
 v_uid uuid := auth.uid(); v_pedidos uuid[]; v_driver uuid; v_user uuid; r public.rotas_entrega;
BEGIN
 IF v_uid IS NULL OR public.has_role(v_uid,'motoboy') OR NOT
    (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'producao')) THEN
   RETURN jsonb_build_object('status','negado','motivo','somente_central');
 END IF;
 SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) INTO v_pedidos
 FROM public.rota_pedidos rp WHERE rp.rota_id=p_rota_id;
 PERFORM p.id FROM public.pedidos p WHERE p.id=ANY(v_pedidos) ORDER BY p.id FOR UPDATE;
 SELECT motoboy_id INTO v_driver FROM public.rotas_entrega WHERE id=p_rota_id;
 SELECT m.user_id INTO v_user FROM public.motoboys m WHERE m.id=v_driver FOR UPDATE;
 SELECT * INTO r FROM public.rotas_entrega WHERE id=p_rota_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','inexistente','motivo','rota_nao_encontrada'); END IF;
 IF r.motoboy_id IS DISTINCT FROM v_driver OR v_user IS NULL OR v_user=v_uid THEN
   RETURN jsonb_build_object('status','negado','motivo','motoboy_invalido'); END IF;
 IF r.status <> 'preparando' THEN RETURN jsonb_build_object('status','inelegivel','motivo','rota_nao_esta_preparando'); END IF;
 IF v_pedidos IS NULL OR cardinality(v_pedidos) NOT BETWEEN 1 AND 3 OR v_pedidos IS DISTINCT FROM
    (SELECT array_agg(pedido_id ORDER BY pedido_id) FROM public.rota_pedidos WHERE rota_id=p_rota_id)
    OR EXISTS(SELECT 1 FROM public.pedidos p WHERE p.id=ANY(v_pedidos)
       AND (p.status <> 'aguardando_motoboy' OR p.tipo_entrega IS DISTINCT FROM 'entrega' OR p.motoboy_id IS DISTINCT FROM v_user)) THEN
   RETURN jsonb_build_object('status','bloqueado','motivo','pedidos_da_rota_invalidos'); END IF;
 IF r.liberada_central_em IS NOT NULL THEN
   IF r.liberacao_pedidos IS DISTINCT FROM v_pedidos OR r.liberacao_motoboy IS DISTINCT FROM v_driver THEN
     RETURN jsonb_build_object('status','bloqueado','motivo','rota_alterada_apos_liberacao'); END IF;
   RETURN jsonb_build_object('status','ok','motivo','rota_ja_liberada','liberada_em',r.liberada_central_em);
 END IF;
 UPDATE public.rotas_entrega SET liberada_central_em=now(),liberada_central_por=v_uid,
   liberacao_pedidos=v_pedidos,liberacao_motoboy=v_driver WHERE id=p_rota_id;
 RETURN jsonb_build_object('status','ok','motivo','rota_liberada','liberada_em',now());
END $$;
REVOKE ALL ON FUNCTION public.liberar_rota_entrega(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.liberar_rota_entrega(uuid) TO authenticated;

-- Compatibilidade: clientes antigos recebem confirmação da atribuição, sem criar aceite
-- ou conceder liberação. Os registros aceito_motoboy_* históricos não são alterados.
CREATE OR REPLACE FUNCTION public.aceitar_rota(p_rota_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'motoboy') OR NOT EXISTS(
   SELECT 1 FROM public.rotas_entrega r JOIN public.motoboys m ON m.id=r.motoboy_id
   WHERE r.id=p_rota_id AND m.user_id=auth.uid()) THEN
   RETURN jsonb_build_object('status','negado','motivo','rota_sem_autorizacao'); END IF;
 RETURN jsonb_build_object('status','ok','motivo','aceite_nao_necessario','rota_id',p_rota_id);
END $$;
REVOKE ALL ON FUNCTION public.aceitar_rota(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aceitar_rota(uuid) TO authenticated;
COMMENT ON FUNCTION public.aceitar_rota(uuid) IS 'Compatibilidade 0123: não altera estado, não libera saída; aceite manual dispensado.';

CREATE OR REPLACE FUNCTION public.iniciar_rota(p_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_rota_status text;
  v_saiu_em timestamptz;
  v_rota_motoboy uuid;
  v_iniciados integer;
  v_total integer;
  v_nao_retirados integer;
  v_pedidos uuid[];
  v_pedidos_atuais uuid[];
BEGIN
  -- 1. Autenticacao e papel do chamador.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Ponte login -> cadastro do motoboy.
  SELECT m.id INTO v_motoboy_row_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- Mesma ordem da atribuição: pedidos, motoboy, rota. Confira os vínculos
  -- novamente com a rota já travada.
  SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) INTO v_pedidos
    FROM public.rota_pedidos rp WHERE rp.rota_id = p_rota_id;
  PERFORM p.id FROM public.pedidos p
   WHERE p.id = ANY(v_pedidos)
     AND EXISTS (SELECT 1 FROM public.rotas_entrega r WHERE r.id = p_rota_id
       AND r.motoboy_id = v_motoboy_row_id)
   ORDER BY p.id FOR UPDATE;
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;

  -- 3. Trava a rota: existencia e propriedade.
  SELECT r.status, r.saiu_em, r.motoboy_id INTO v_rota_status, v_saiu_em, v_rota_motoboy
    FROM public.rotas_entrega r
   WHERE r.id = p_rota_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'rota_nao_encontrada');
  END IF;
  IF v_rota_motoboy IS DISTINCT FROM v_motoboy_row_id THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'rota_de_outro_motoboy');
  END IF;

  -- 4. Idempotencia: rota ja iniciada com horario de saida.
  IF v_rota_status = 'em_rota' AND v_saiu_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ok', 'motivo', 'rota_ja_iniciada',
      'rota_id', p_rota_id, 'saiu_em', v_saiu_em
    );
  END IF;

  -- 5. Transicao: somente rotas preparando podem ser iniciadas.
  IF v_rota_status <> 'preparando' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_nao_esta_preparando');
  END IF;

  SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) INTO v_pedidos_atuais
    FROM public.rota_pedidos rp WHERE rp.rota_id = p_rota_id;
  IF v_pedidos_atuais IS DISTINCT FROM v_pedidos THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'vinculos_da_rota_alterados');
  END IF;
  IF v_pedidos IS NULL THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_sem_pedidos');
  END IF;
  v_total := cardinality(v_pedidos);
  SELECT count(*) INTO v_nao_retirados
    FROM public.pedidos p WHERE p.id = ANY(v_pedidos)
      AND (p.tipo_entrega IS DISTINCT FROM 'entrega'
        OR p.motoboy_id IS DISTINCT FROM v_uid
        OR p.retirada_em IS NULL
        OR p.retirada_por IS DISTINCT FROM v_uid
        OR p.retirada_rota_id IS DISTINCT FROM p_rota_id
        OR p.status IS DISTINCT FROM 'aguardando_motoboy');
  IF v_nao_retirados > 0 THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'retirada_de_todos_os_pedidos_obrigatoria',
      'total_pedidos', v_total, 'pendentes_retirada', v_nao_retirados);
  END IF;

  -- Liberação só vale para a mesma composição e motoboy. Aceites antigos não a substituem.
  IF NOT EXISTS (SELECT 1 FROM public.rotas_entrega r WHERE r.id=p_rota_id
      AND r.liberada_central_em IS NOT NULL AND r.liberada_central_por IS NOT NULL
      AND r.liberada_central_por IS DISTINCT FROM v_uid
      AND r.liberacao_pedidos = v_pedidos AND r.liberacao_motoboy = v_motoboy_row_id) THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','liberacao_da_central_obrigatoria');
  END IF;

  -- 6. Inicia a rota: em_rota + saiu_em, condicional (rollback automatico em falha).
  UPDATE public.rotas_entrega
     SET status = 'em_rota',
         saiu_em = now()
   WHERE id = p_rota_id
     AND status = 'preparando'
     AND saiu_em IS NULL;
  GET DIAGNOSTICS v_iniciados = ROW_COUNT;
  IF v_iniciados <> 1 THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'condicao_de_corrida');
  END IF;

  -- 7. Pedidos da rota deste motoboy saem para entrega (aguardando_motoboy -> em_rota).
  --    A matriz de transicoes (0041) e os triggers (0047) sao respeitados;
  --    pedidos ja em_rota ou de outro motoboy nao sao tocados.
  UPDATE public.pedidos
     SET status = 'em_rota'
   WHERE id = ANY(v_pedidos)
     AND motoboy_id = v_uid
     AND status = 'aguardando_motoboy';
  GET DIAGNOSTICS v_iniciados = ROW_COUNT;
  IF v_iniciados <> v_total THEN
    RAISE EXCEPTION 'A quantidade de pedidos não corresponde à rota; operação revertida';
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok', 'motivo', 'rota_iniciada',
    'rota_id', p_rota_id, 'saiu_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_rota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_rota(uuid) TO authenticated;
COMMENT ON FUNCTION public.iniciar_rota(uuid) IS '0112: motoboy inicia a própria rota (preparando -> em_rota) com horario de saida. Idempotente.';

-- Rotas concluídas que ainda precisam de solicitação aparecem no App sem dados do cliente.
CREATE OR REPLACE FUNCTION public.motoboy_listar_rotas_atribuidas()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'motoboy') THEN
    RAISE EXCEPTION 'rota_sem_autorizacao' USING ERRCODE = '42501';
  END IF;
  SELECT m.id INTO v_motoboy_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'motoboy_sem_cadastro' USING ERRCODE = '42501'; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'status',r.status,'saiu_em',r.saiu_em,
      'liberada_central_em',CASE WHEN r.liberacao_motoboy=r.motoboy_id AND r.liberacao_pedidos =
        (SELECT array_agg(pedido_id ORDER BY pedido_id) FROM public.rota_pedidos WHERE rota_id=r.id)
        THEN r.liberada_central_em ELSE NULL END,
      'pedidos', CASE WHEN r.status = 'concluida' THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'retirada_em',p.retirada_em,'id',p.id,'ordem',rp.ordem,'numero',p.numero,'status',p.status,
          'cliente_nome',p.cliente_nome,'endereco',p.endereco,'bairro',p.bairro,
          'complemento',p.complemento,'observacoes',p.observacoes
        ) ORDER BY rp.ordem,p.id)
        FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
        WHERE rp.rota_id = r.id AND p.motoboy_id = v_uid AND p.tipo_entrega = 'entrega'
      ),'[]'::jsonb) END
    ) ORDER BY r.created_at,r.id)
    FROM public.rotas_entrega r
    WHERE r.motoboy_id = v_motoboy_id
      AND (r.status IN ('preparando','em_rota') OR (r.status = 'concluida' AND NOT EXISTS (
        SELECT 1 FROM public.acertos_rota a WHERE a.rota_id = r.id AND a.status <> 'rejeitado'
      )))
  ),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.motoboy_listar_rotas_atribuidas() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.motoboy_listar_rotas_atribuidas() TO authenticated;
