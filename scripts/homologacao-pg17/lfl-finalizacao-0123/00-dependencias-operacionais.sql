-- Dependencias EXATAS selecionadas da referencia versionada, sem replay da 0084.
BEGIN;
DO $$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' OR current_user !~ '^restore_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Somente laboratorio'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer DEFAULT 60)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean DEFAULT false, p_obs text DEFAULT NULL::text)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean, p_obs text) TO authenticated;

CREATE OR REPLACE FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean DEFAULT false, p_exigir_conferencia boolean DEFAULT false)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.atribuir_pedido_motoboy(p_pedido_id uuid, p_motoboy_id uuid, p_autorizar_extra boolean, p_exigir_conferencia boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean DEFAULT false)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adiar_cupom_agendado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.adiar_cupom_agendado() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text DEFAULT 'pedido'::text, p_idempotencia text DEFAULT NULL::text)
 RETURNS TABLE(resultado text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text, p_idempotencia text) TO authenticated;

CREATE OR REPLACE FUNCTION public.impedir_parada_duplicada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.impedir_parada_duplicada() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.congelar_colunas_protegidas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;

REVOKE ALL ON FUNCTION public.congelar_colunas_protegidas() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.exigir_conferencia_para_pronto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pronto' AND OLD.status = 'em_producao'
    AND current_setting('neia.fluxo_novo', true) = '1'
    AND OLD.conferido_em IS NULL AND NEW.conferido_em IS NULL THEN
    RAISE EXCEPTION 'Conferencia obrigatoria antes de pronto';
  END IF;
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public.exigir_conferencia_para_pronto() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER trigger_impedir_parada_duplicada BEFORE INSERT ON public.rota_pedidos FOR EACH ROW EXECUTE FUNCTION impedir_parada_duplicada();

CREATE TRIGGER trigger_congelar_colunas BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION congelar_colunas_protegidas();

CREATE TRIGGER trigger_exigir_conferencia BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION exigir_conferencia_para_pronto();

CREATE TRIGGER trigger_adiar_cupom_agendado BEFORE INSERT ON public.fila_impressao FOR EACH ROW EXECUTE FUNCTION adiar_cupom_agendado();

INSERT INTO public.pedido_status_transicoes (de_status, para_status) VALUES
  -- Fluxo normal
  ('recebido', 'em_producao'),
  ('recebido', 'cancelado'),
  ('em_producao', 'pronto'),
  ('em_producao', 'cancelado'),
  ('pronto', 'aguardando_motoboy'),
  ('pronto', 'cancelado'),
  ('aguardando_motoboy', 'em_rota'),
  ('aguardando_motoboy', 'cancelado'),
  ('em_rota', 'entregue'),
  ('em_rota', 'cancelado'),
  -- Retirada
  ('pronto', 'entregue'),
  -- Permitir voltar um passo (override admin com justificativa)
  ('em_producao', 'recebido'),
  ('pronto', 'em_producao'),
  ('aguardando_motoboy', 'pronto'),
  ('em_rota', 'aguardando_motoboy')
ON CONFLICT DO NOTHING;

COMMIT;
