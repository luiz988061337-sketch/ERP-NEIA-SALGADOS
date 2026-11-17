-- As restrições de corte só entram em vigor após habilitação explícita pelo dono do banco.
CREATE SCHEMA IF NOT EXISTS neia_operacao;
REVOKE ALL ON SCHEMA neia_operacao FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS neia_operacao.motoboy_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  corte_rpc boolean NOT NULL DEFAULT false
);
INSERT INTO neia_operacao.motoboy_config DEFAULT VALUES ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.motoboy_corte_rpc_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((SELECT corte_rpc FROM neia_operacao.motoboy_config WHERE id),false)
$$;
REVOKE ALL ON FUNCTION public.motoboy_corte_rpc_ativo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.motoboy_corte_rpc_ativo() TO authenticated;

-- Mantém as policies de leitura. Vínculos de rota são alterados pelas RPCs.
CREATE OR REPLACE FUNCTION public.bloquear_escrita_legada_motoboy()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_user = 'authenticated' AND public.motoboy_corte_rpc_ativo() AND (
     TG_TABLE_NAME IN ('rotas_entrega','rota_pedidos','rotas') OR
     (public.has_role(auth.uid(),'motoboy')
      AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao')
               OR public.has_role(auth.uid(),'atendente')))
  ) THEN
    RAISE EXCEPTION 'Operação do motoboy exige a RPC autorizada' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bloquear_escrita_legada_motoboy() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER bloquear_escrita_legada_motoboy BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_legada_motoboy();
CREATE TRIGGER bloquear_escrita_legada_motoboy BEFORE INSERT OR UPDATE OR DELETE ON public.motoboys
FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_legada_motoboy();
CREATE TRIGGER bloquear_escrita_legada_motoboy BEFORE INSERT OR UPDATE OR DELETE ON public.rotas_entrega
FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_legada_motoboy();
CREATE TRIGGER bloquear_escrita_legada_motoboy BEFORE INSERT OR UPDATE OR DELETE ON public.rota_pedidos
FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_legada_motoboy();
CREATE TRIGGER bloquear_escrita_legada_motoboy BEFORE INSERT OR UPDATE OR DELETE ON public.rotas
FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_legada_motoboy();
CREATE TRIGGER bloquear_escrita_legada_motoboy BEFORE INSERT ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.bloquear_escrita_legada_motoboy();

CREATE OR REPLACE FUNCTION public.informar_retorno_loja(p_rota_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy public.motoboys%ROWTYPE;
  v_rota public.rotas_entrega%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'motoboy') THEN
    RETURN jsonb_build_object('status','negado','motivo','autenticacao_ou_papel_invalido');
  END IF;
  SELECT * INTO v_motoboy FROM public.motoboys WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','negado','motivo','motoboy_sem_cadastro'); END IF;
  SELECT * INTO v_rota FROM public.rotas_entrega WHERE id = p_rota_id AND motoboy_id = v_motoboy.id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','negado','motivo','rota_nao_atribuida'); END IF;
  IF v_rota.status <> 'em_rota' THEN
    RETURN jsonb_build_object('status','inelegivel','motivo','rota_nao_estava_em_rota');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rota_pedidos WHERE rota_id = p_rota_id)
     OR EXISTS (
       SELECT 1 FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
       WHERE rp.rota_id = p_rota_id
         AND (p.status NOT IN ('entregue','cancelado') OR p.motoboy_id IS DISTINCT FROM v_uid)
     ) THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','rota_com_pendentes');
  END IF;
  IF v_motoboy.status::text = 'retornando_base' THEN
    RETURN jsonb_build_object('status','ok','motivo','retorno_ja_informado','rota_id',p_rota_id);
  END IF;
  UPDATE public.motoboys SET status = 'retornando_base', ultima_atualizacao = now() WHERE id = v_motoboy.id;
  INSERT INTO public.motoboy_historico(motoboy_id,evento,detalhe)
  VALUES(v_motoboy.id,'retorno_base','Motoboy retornando à loja (rota ' || p_rota_id::text || ')');
  INSERT INTO public.notificacoes(tipo,titulo,detalhe,link)
  VALUES('motoboy_retorno','Motoboy retornando à base','Rota ' || p_rota_id::text || ' sem entregas pendentes.','/central-entregas');
  RETURN jsonb_build_object('status','ok','motivo','retorno_informado','rota_id',p_rota_id);
END $$;
REVOKE ALL ON FUNCTION public.informar_retorno_loja(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.informar_retorno_loja(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.encerrar_rota_pela_central(p_rota uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy uuid;
  v_rota public.rotas_entrega%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'atendente')
                           OR public.has_role(v_uid,'producao')) THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  SELECT motoboy_id INTO v_motoboy FROM public.rotas_entrega WHERE id = p_rota;
  IF v_motoboy IS NULL THEN RETURN jsonb_build_object('status','inexistente'); END IF;
  PERFORM 1 FROM public.motoboys WHERE id = v_motoboy FOR UPDATE;
  SELECT * INTO v_rota FROM public.rotas_entrega WHERE id = p_rota AND motoboy_id = v_motoboy FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','inexistente'); END IF;
  IF v_rota.status = 'concluida' THEN RETURN jsonb_build_object('status','repetido'); END IF;
  IF v_rota.status <> 'em_rota' OR NOT EXISTS (SELECT 1 FROM public.rota_pedidos WHERE rota_id = p_rota)
     OR EXISTS (
       SELECT 1 FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
       WHERE rp.rota_id = p_rota AND p.status NOT IN ('entregue','cancelado')
     ) THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','rota_com_pendentes');
  END IF;
  UPDATE public.rotas_entrega SET status = 'concluida', chegou_em = now() WHERE id = p_rota;
  UPDATE public.motoboys SET status = 'disponivel_base', ultima_atualizacao = now() WHERE id = v_motoboy;
  INSERT INTO public.motoboy_historico(motoboy_id,evento,detalhe)
  VALUES (v_motoboy,'retorno_base','Central encerrou a rota ' || p_rota::text || ' (ator ' || v_uid::text || ')');
  RETURN jsonb_build_object('status','ok','rota_id',p_rota);
END $$;
REVOKE ALL ON FUNCTION public.encerrar_rota_pela_central(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.encerrar_rota_pela_central(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_atraso_entrega(
  p_pedido uuid, p_motivo text, p_descricao text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pedido public.pedidos%ROWTYPE;
  v_motoboy uuid;
  v_rota uuid;
  v_staff boolean;
BEGIN
  v_staff := public.has_role(v_uid,'admin') OR public.has_role(v_uid,'atendente') OR public.has_role(v_uid,'producao');
  IF v_uid IS NULL OR NOT (v_staff OR public.has_role(v_uid,'motoboy')) THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  IF p_motivo IS NULL OR p_motivo NOT IN
     ('transito','chuva','veiculo','endereco','cliente_ausente','espera','acidente_bloqueio','outro')
     OR coalesce(length(btrim(p_descricao)),0) > 240
     OR (p_motivo = 'outro' AND nullif(btrim(p_descricao),'') IS NULL) THEN
    RETURN jsonb_build_object('status','dados_invalidos');
  END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND OR v_pedido.tipo_entrega IS DISTINCT FROM 'entrega' THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  IF NOT v_staff AND v_pedido.motoboy_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  SELECT id INTO v_motoboy FROM public.motoboys WHERE user_id = v_pedido.motoboy_id FOR UPDATE;
  BEGIN
    SELECT r.id INTO STRICT v_rota FROM public.rotas_entrega r JOIN public.rota_pedidos rp ON rp.rota_id = r.id
    WHERE rp.pedido_id = p_pedido AND r.motoboy_id = v_motoboy
      AND r.status IN ('preparando','em_rota') FOR UPDATE OF r;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RETURN jsonb_build_object('status','inelegivel');
  END;
  IF v_pedido.status NOT IN ('aguardando_motoboy','em_rota') THEN
    RETURN jsonb_build_object('status','inelegivel');
  END IF;
  IF v_pedido.atrasado AND v_pedido.atraso_motivo = p_motivo
     AND coalesce(v_pedido.atraso_descricao,'') = coalesce(btrim(p_descricao),'') THEN
    RETURN jsonb_build_object('status','repetido');
  END IF;
  UPDATE public.pedidos SET atrasado = true, atraso_motivo = p_motivo,
    atraso_descricao = nullif(btrim(p_descricao),'') WHERE id = p_pedido;
  RETURN jsonb_build_object('status','registrado');
END $$;
REVOKE ALL ON FUNCTION public.registrar_atraso_entrega(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_atraso_entrega(uuid,text,text) TO authenticated;

-- Última amostra, vinculada à rota. Sem histórico de coordenadas nem leitura direta.
CREATE TABLE IF NOT EXISTS neia_operacao.localizacao_rota (
  rota_id uuid PRIMARY KEY REFERENCES public.rotas_entrega(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  precisao double precision NOT NULL,
  capturado_em timestamptz NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION public.registrar_localizacao_rota(
  p_rota uuid, p_latitude double precision, p_longitude double precision,
  p_precisao double precision, p_capturado_em timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_agora timestamptz := clock_timestamp();
  v_rota public.rotas_entrega%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'motoboy') THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  IF NOT coalesce(p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180
    AND p_precisao BETWEEN 0 AND 1000 AND p_capturado_em BETWEEN v_agora - interval '60 seconds'
      AND v_agora + interval '5 seconds',false) THEN
    RETURN jsonb_build_object('status','dados_invalidos');
  END IF;

  SELECT r.* INTO v_rota FROM public.rotas_entrega r JOIN public.motoboys m ON m.id = r.motoboy_id
    WHERE r.id = p_rota AND m.user_id = v_uid FOR UPDATE OF r;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','negado'); END IF;
  IF v_rota.status <> 'em_rota' OR v_rota.saiu_em IS NULL OR p_capturado_em < v_rota.saiu_em OR NOT EXISTS (
    SELECT 1 FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
    WHERE rp.rota_id = p_rota AND p.retirada_rota_id = p_rota
      AND p.status = 'em_rota' AND p.motoboy_id = v_uid
  ) THEN
    RETURN jsonb_build_object('status','inelegivel');
  END IF;
  INSERT INTO neia_operacao.localizacao_rota AS loc(rota_id,latitude,longitude,precisao,capturado_em,recebido_em)
  VALUES (p_rota,p_latitude,p_longitude,p_precisao,p_capturado_em,v_agora)
  ON CONFLICT (rota_id) DO UPDATE
    SET latitude = excluded.latitude, longitude = excluded.longitude, precisao = excluded.precisao,
      capturado_em = excluded.capturado_em, recebido_em = excluded.recebido_em
    WHERE loc.capturado_em < excluded.capturado_em AND loc.recebido_em <= v_agora - interval '5 seconds';
  RETURN jsonb_build_object('status',CASE WHEN FOUND THEN 'registrado' ELSE 'ignorado' END);
END $$;

CREATE OR REPLACE FUNCTION public.consultar_localizacao_entrega(p_pedido uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('latitude',loc.latitude,'longitude',loc.longitude,'capturado_em',loc.capturado_em)
    FROM public.pedidos p JOIN public.rotas_entrega r ON r.id = p.retirada_rota_id
    JOIN public.rota_pedidos rp ON rp.rota_id = r.id AND rp.pedido_id = p.id
    JOIN public.motoboys m ON m.id = r.motoboy_id
    JOIN neia_operacao.localizacao_rota loc ON loc.rota_id = r.id
    WHERE p.id = p_pedido AND p.status = 'em_rota' AND r.status = 'em_rota'
      AND p.motoboy_id = m.user_id AND loc.capturado_em > now() - interval '90 seconds'
      AND auth.uid() IS NOT NULL AND (
        p.user_id = auth.uid() OR m.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'producao')
      )
$$;

CREATE OR REPLACE FUNCTION public.limpar_localizacao_rota_encerrada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  DELETE FROM neia_operacao.localizacao_rota WHERE rota_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER limpar_localizacao_rota_encerrada AFTER UPDATE OF status ON public.rotas_entrega
FOR EACH ROW WHEN (OLD.status = 'em_rota' AND NEW.status <> 'em_rota')
EXECUTE FUNCTION public.limpar_localizacao_rota_encerrada();

CREATE OR REPLACE FUNCTION public.consultar_localizacoes_entregas(p_pedidos uuid[])
RETURNS TABLE(pedido uuid, localizacao jsonb) LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT p.pedido, l.localizacao
  FROM (SELECT DISTINCT pedido FROM unnest(p_pedidos) AS pedido
        WHERE cardinality(p_pedidos) BETWEEN 1 AND 50) p
  CROSS JOIN LATERAL (SELECT public.consultar_localizacao_entrega(p.pedido) AS localizacao) l
  WHERE l.localizacao IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.registrar_localizacao_rota(uuid,double precision,double precision,double precision,timestamptz)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.consultar_localizacao_entrega(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.consultar_localizacoes_entregas(uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.limpar_localizacao_rota_encerrada() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_localizacao_rota(uuid,double precision,double precision,double precision,timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_localizacao_entrega(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_localizacoes_entregas(uuid[]) TO authenticated;
