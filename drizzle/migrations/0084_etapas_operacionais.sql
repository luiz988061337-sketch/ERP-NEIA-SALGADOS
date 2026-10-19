-- 0084: etapas operacionais Atendente → Cozinha → Despacho (E1, prompt mestre).
--
-- STATUS: PREPARADA, NÃO APLICADA. Não rodar sem autorização expressa.
-- Rode primeiro em staging/homologação, com backup. Ordem: APÓS 0083.
--
-- Escopo (aditivo, estratégia B — sem tocar no enum order_status):
--   - aceite da atendente (quem/quando), sem reutilizar aceito_em do motoboy;
--   - liberação para a cozinha (quem/quando);
--   - conferência final da cozinha (quem/quando);
--   - confirmação de retirada (quem/quando);
--   - reserva de motoboy (quando; identidade segue motoboy_id = auth.users.id).
--
-- Garantias:
--   - nenhuma tabela criada/removida/renomeada; nenhum enum alterado;
--   - todas as colunas NULLABLE (pedidos antigos continuam válidos);
--   - pagamento_status NÃO é tocado por nada aqui (aceite nunca confirma pagamento);
--   - triggers atuais (0041 validar_transicao_status, 0043 fritura, 0045/0047
--     motoboy, 0075 insumos, 0058/0062/0063 impressão) não disparam em coluna
--     nova — compatibilidade preservada;
--   - RLS mínima: SELECT de fluxo para atendente; NENHUM UPDATE direto
--     (E2: policy ampla removida — RLS não restringe por coluna).
--     Escritas só via função SECURITY DEFINER com trava e pré-condição.
--
-- Rollback: migration compensatória (DROP COLUMN IF EXISTS ...) — nunca
-- rollback destrutivo de dados. Feature flag no app decide o uso das colunas.
-- NOTA E10.0.1: REVOKE pós-CREATE em cada função (PostgreSQL concede EXECUTE
-- a PUBLIC por padrão em funções novas; dentro da mesma transação a função
-- ainda não é visível a outras sessões, logo não há janela de exposição).

-- =============================================
-- 1. Colunas de auditoria das etapas (todas nullable)
-- =============================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS aceito_em_atendente timestamptz,
  ADD COLUMN IF NOT EXISTS aceito_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS liberado_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS conferencia_obs text,
  ADD COLUMN IF NOT EXISTS retirado_em timestamptz,
  ADD COLUMN IF NOT EXISTS retirado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aceito_motoboy_em timestamptz,
  ADD COLUMN IF NOT EXISTS aceito_motoboy_por uuid REFERENCES auth.users(id),  ADD COLUMN IF NOT EXISTS reserva_motoboy_em timestamptz;

COMMENT ON COLUMN public.pedidos.aceito_em_atendente IS 'E1: aceite da atendente (não reutiliza aceito_em do motoboy). Não altera pagamento_status.';
COMMENT ON COLUMN public.pedidos.liberado_em IS 'E1: janela de liberação para a cozinha atingida.';
COMMENT ON COLUMN public.pedidos.conferido_em IS 'E1: conferência final da cozinha.';
COMMENT ON COLUMN public.pedidos.retirado_em IS 'E1: confirmação autorizada de retirada (tipo_entrega=retirada).';
COMMENT ON COLUMN public.pedidos.reserva_motoboy_em IS 'E1: reserva para rota (motoboy_id segue = auth.users.id). E5: reserva NÃO altera motoboys.status (ver triggers de saída/retorno); "reservado" é derivado de rota preparando + este carimbo.';
COMMENT ON COLUMN public.pedidos.aceito_motoboy_em IS 'E5: aceite explícito do motoboy (distinto de aceito_em, que a atribuição admin preenche por compatibilidade legada).';

-- =============================================
-- 2. Índices de fila (IF NOT EXISTS, só colunas existentes)
-- =============================================
CREATE INDEX IF NOT EXISTS pedidos_aceite_pendente_idx ON public.pedidos (created_at)
  WHERE aceito_em_atendente IS NULL AND status = 'recebido';
CREATE INDEX IF NOT EXISTS pedidos_liberacao_pendente_idx ON public.pedidos (liberado_em)
  WHERE liberado_em IS NULL AND status = 'recebido';

-- =============================================
-- 3. RLS mínima por papel (aditiva, sem afrouxar o existente)
-- =============================================
DROP POLICY IF EXISTS "pedidos atendente fluxo select" ON public.pedidos;
CREATE POLICY "pedidos atendente fluxo select" ON public.pedidos FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'atendente')
  AND status IN ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy', 'em_rota', 'entregue')
);

DROP POLICY IF EXISTS "pedidos atendente fluxo update" ON public.pedidos;
-- E2 (correção de segurança): NENHUMA policy UPDATE direta para atendente.
-- RLS não faz restrição por coluna: a policy ampla anterior permitiria gravar
-- pagamento_status, valores, motoboy_id e até recebido→em_producao.
-- Toda escrita passa pela função transacional abaixo, que só toca as 2
-- colunas do aceite, com trava FOR UPDATE e pré-condição (claim atômico).

-- =============================================
-- 4. Aceite atômico (SECURITY DEFINER, privilégio mínimo)
-- =============================================
CREATE OR REPLACE FUNCTION public.aceitar_pedido_atendente(p_pedido_id uuid)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.aceitar_pedido_atendente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aceitar_pedido_atendente(uuid) TO authenticated;
COMMENT ON FUNCTION public.aceitar_pedido_atendente(uuid) IS 'E2: aceite atômico da atendente. Não altera status, pagamento_status, prometido, valores ou motoboy_id. Não libera agendados.';

-- =============================================
-- 5. Liberação para a cozinha (E3, não ativada)
-- =============================================
-- Elegibilidade: status='recebido' + aceite da atendente registrado
-- (pedidos antigos sem aceite: aceitar primeiro — sem bypass).
-- Agendados: só quando agora >= agendado_para − antecedência (padrão 60 min).
-- Liberação NÃO inicia preparo (não toca status/producao_status).
CREATE OR REPLACE FUNCTION public.liberar_pedido_cozinha(p_pedido_id uuid, p_antecedencia_min integer DEFAULT 60)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.liberar_pedido_cozinha(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberar_pedido_cozinha(uuid, integer) TO authenticated;
COMMENT ON FUNCTION public.liberar_pedido_cozinha(uuid, integer) IS 'E3: liberação para a cozinha. Não inicia preparo, não altera status/pagamento/promessa. Agendados respeitam a janela.';

-- =============================================
-- 6. Conferência final da cozinha (E3, não ativada)
-- =============================================
-- Elegibilidade: status='em_producao' (preparo em curso, ainda não pronto).
-- Registro com confirmação explícita (p_confirmado) + responsável + obs.
-- Não muda status (o "marcar pronto" segue o fluxo existente) e nunca
-- marca como entregue; retirada segue aguardando o cliente, entrega segue
-- aguardando despacho.
CREATE OR REPLACE FUNCTION public.conferir_pedido_cozinha(p_pedido_id uuid, p_confirmado boolean DEFAULT false, p_obs text DEFAULT NULL)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.conferir_pedido_cozinha(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conferir_pedido_cozinha(uuid, boolean, text) TO authenticated;
COMMENT ON FUNCTION public.conferir_pedido_cozinha(uuid, boolean, text) IS 'E3: conferência final. Não muda status, não entrega, não substitui produtos.';

-- =============================================
-- 7. Reserva e atribuição atômica (E4, não ativada)
-- =============================================
-- Identidade canônica (K9.2): pedidos.motoboy_id = auth.users.id;
-- rotas_entrega.motoboy_id = motoboys.id; ponte = motoboys.user_id.
-- NUNCA copiar um identificador no campo do outro (estoura FK).
-- Reserva = linha em rota_pedidos + reserva_motoboy_em; motoboys.status NÃO
-- é alterado aqui (transições seguem os triggers de saída/retorno).
-- saiu_em canônico = rotas_entrega.saiu_em (padrão atual de fallback);
-- pedidos.saiu_em permanece legado e intocado.
-- Limite: 3 paradas por rota; 4ª+ exige p_autorizar_extra (auditável).
CREATE OR REPLACE FUNCTION public.atribuir_pedido_motoboy(
  p_pedido_id uuid,
  p_motoboy_id uuid,
  p_autorizar_extra boolean DEFAULT false,
  p_exigir_conferencia boolean DEFAULT false
)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.atribuir_pedido_motoboy(uuid, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atribuir_pedido_motoboy(uuid, uuid, boolean, boolean) TO authenticated;
COMMENT ON FUNCTION public.atribuir_pedido_motoboy(uuid, uuid, boolean, boolean) IS 'E4: reserva/atribuição/rota em transação única. Sem auto-atribuição; promessa preservada. E5: aceito_em aqui é compat legada; aceite explícito vive em aceitar_entrega_motoboy.';

-- =============================================
-- 8. Aceite explícito do motoboy (E5, não ativado)
-- =============================================
-- Desambiguação (E5 §1): aceito_em segue preenchido pela atribuição admin
-- por compatibilidade com leitores legados; o aceite EXPLÍCITO do motoboy
-- vive em aceito_motoboy_em. Atribuição ≠ aceite. Saída e entrega seguem o
-- fluxo existente (motoboy.iniciar/finalizar + trigger_saida/entrega_motoboy).
CREATE OR REPLACE FUNCTION public.aceitar_entrega_motoboy(p_pedido_id uuid)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.aceitar_entrega_motoboy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aceitar_entrega_motoboy(uuid) TO authenticated;
COMMENT ON FUNCTION public.aceitar_entrega_motoboy(uuid) IS 'E5: aceite explícito do motoboy. Não altera status/pagamento; não é saída nem entrega.';

-- =============================================
-- 9. Confirmação de retirada (E5, não ativada)
-- =============================================
-- Elegível: tipo_entrega='retirada', status='pronto' (transição
-- pronto→entregue permitida pela matriz 0041), conferência quando exigida.
-- Nunca marca retirado só porque a cozinha finalizou: exige entrega física
-- (retirado_em/por) + status ainda 'pronto'. Histórico auditável no ato.
CREATE OR REPLACE FUNCTION public.retirar_pedido_cliente(p_pedido_id uuid, p_exigir_conferencia boolean DEFAULT false)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.retirar_pedido_cliente(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retirar_pedido_cliente(uuid, boolean) TO authenticated;
COMMENT ON FUNCTION public.retirar_pedido_cliente(uuid, boolean) IS 'E5: retirada física confirmada. Transição pronto→entregue (matriz 0041) + histórico. Nunca automática.';

-- =============================================
-- 10. Impressão por evento (E6, não ativada)
-- =============================================
-- Auditoria (§1): cupom fiscal automático vive em enfileirar_cupom (0073,
-- uuid <id>:pedido, tipo 'pedido', regra online-só-se-pago); ficha de
-- cozinha hoje é só manual (fichaDireta); aceite/liberado/conferido/
-- retirado não geram nada. Para não duplicar a mesma necessidade:
--   'liberado'   → ficha_cozinha (a cozinha precisa da ficha na liberação);
--   'aceito', 'conferido', 'retirada', 'despacho' → ignorado (cupom/ficha
--   já cobrem; nada de automático para todos os eventos).
-- uuid fixo por evento + ON CONFLICT DO NOTHING: retry/clique duplo não
-- duplicam. Compatível com o print-agent (mesma tabela/status/impressora).
CREATE OR REPLACE FUNCTION public.enfileirar_evento_cozinha(p_pedido_id uuid, p_evento text)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.enfileirar_evento_cozinha(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enfileirar_evento_cozinha(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.enfileirar_evento_cozinha(uuid, text) IS 'E6: ficha automática só no liberado. Demais eventos ignorados (sem duplicar).';

-- =============================================
-- 11. Reimpressão autorizada com motivo (E6, não ativada)
-- =============================================
-- Motivo obrigatório; responsável e horário registrados; contador na ficha
-- mais recente do mesmo pedido+tipo; nova linha (nunca reusa uuid) para o
-- agente processar como tentativa nova. Não toca status/pagamento do pedido.
CREATE OR REPLACE FUNCTION public.solicitar_reimpressao(p_pedido_id uuid, p_motivo text, p_tipo text DEFAULT 'pedido', p_idempotencia text DEFAULT NULL)
RETURNS TABLE (resultado text, detalhe text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.solicitar_reimpressao(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.solicitar_reimpressao(uuid, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.solicitar_reimpressao(uuid, text, text, text) IS 'E6: reimpressão com motivo obrigatório + contador. E10.0.1: idempotência por chave; sem clock_timestamp.';

-- =============================================
-- 13. Trava de parada duplicada + guard financeiro (E9.1, não ativada)
-- =============================================
-- Saneamento staging (somente leitura, rodar ANTES de aplicar):
--   pedidos em >1 rota ativa:
--     SELECT rp.pedido_id, count(*) FROM rota_pedidos rp
--     JOIN rotas_entrega r ON r.id = rp.rota_id
--     WHERE r.status IN ('preparando','em_rota')
--     GROUP BY 1 HAVING count(*) > 1;
--   motoboys com >1 rota preparando:
--     SELECT motoboy_id, count(*) FROM rotas_entrega
--     WHERE status = 'preparando' GROUP BY 1 HAVING count(*) > 1;
-- Zerar essas listas antes de aplicar (resolver manualmente no staging).
DROP TRIGGER IF EXISTS trigger_impedir_parada_duplicada ON public.rota_pedidos;
CREATE OR REPLACE FUNCTION public.impedir_parada_duplicada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.impedir_parada_duplicada() FROM PUBLIC;
CREATE TRIGGER trigger_impedir_parada_duplicada
  BEFORE INSERT ON public.rota_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.impedir_parada_duplicada();
COMMENT ON FUNCTION public.impedir_parada_duplicada() IS 'E9.1: um pedido, uma rota ativa. Legado deve migrar para a RPC E4.';

-- Guard: congela colunas financeiras/promessa/identidade para quem não é
-- admin/financeiro. E9.2: SEM isenção por GUC — GUC de placeholder pode ser
-- definida por qualquer sessão, logo nunca prova autorização. Isenção é
-- desnecessária: nenhuma RPC E1–E8 grava coluna congelada (verificado por
-- teste estático). Bypass real continua só via service_role no guard 0074.
CREATE OR REPLACE FUNCTION public.congelar_colunas_protegidas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.congelar_colunas_protegidas() FROM PUBLIC;
DROP TRIGGER IF EXISTS trigger_congelar_colunas ON public.pedidos;
CREATE TRIGGER trigger_congelar_colunas
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.congelar_colunas_protegidas();
COMMENT ON FUNCTION public.congelar_colunas_protegidas() IS 'E9.1: congela financeiro/promessa/identidade p/ não-admin+financeiro. RPCs isentas via GUC.';

-- =============================================
-- 14. Fechamento P1 (E9.2, não ativado)
-- =============================================
-- (a) Reserva exclusiva: uma rota preparando por motoboy. Legado sempre
--     insere 'em_rota' (não afetado). Exige saneamento prévio (queries §13).
-- (b) Conferência obrigatória: com neia.fluxo_novo='1', em_producao→pronto
--     exige conferido. Direção segura: flag só endurece; default = legado.
--     GUC aqui NÃO autoriza nada — apenas liga exigência.
-- (c) Itens para staff operacional: atendente/financeiro liam pedidos sem
--     itens (0041 só cobre dono/admin/producao/motoboy). Escopo mínimo:
--     pedidos em status de fluxo. Motoboy/PII: sem mudança (canal com
--     filter + mascaramento decididos na ativação).
DROP TRIGGER IF EXISTS trigger_exigir_conferencia ON public.pedidos;
CREATE OR REPLACE FUNCTION public.exigir_conferencia_para_pronto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pronto' AND OLD.status = 'em_producao'
    AND current_setting('neia.fluxo_novo', true) = '1'
    AND OLD.conferido_em IS NULL AND NEW.conferido_em IS NULL THEN
    RAISE EXCEPTION 'Conferencia obrigatoria antes de pronto';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.exigir_conferencia_para_pronto() FROM PUBLIC;
CREATE TRIGGER trigger_exigir_conferencia
  BEFORE UPDATE OF status ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.exigir_conferencia_para_pronto();
COMMENT ON FUNCTION public.exigir_conferencia_para_pronto() IS 'E9.2: exige conferência com fluxo novo ligado. Default = legado.';

-- =============================================
-- Verificação em staging (somente leitura, antes de aplicar 0084)
-- =============================================
-- -- Guard vigente: qual corpo está no remoto (0070 estrito × 0074 fraco)?
-- SELECT pg_get_functiondef('public.pedidos_guard_update()'::regprocedure);
-- -- Triggers de impressão vigentes (0073/0077 × 0058/0062/0063)?
-- SELECT tgname FROM pg_trigger WHERE tgname IN
--   ('trigger_pagamento_confirmado','trigger_gerar_cupom_apos_itens');
-- -- Formato real de motoboys/rotas (0017 × 0044, 0024 × 0044)?
-- -- \d public.motoboys | \d public.rota_pedidos | \d public.rotas_entrega
-- -- 0084 já aplicada? (esperado: 0 linhas)
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='pedidos'
--   AND column_name IN ('aceito_em_atendente','liberado_em','conferido_em',
--     'retirado_em','reserva_motoboy_em','aceito_motoboy_em','aceito_motoboy_por');
-- SELECT proname FROM pg_proc WHERE proname IN
--   ('aceitar_pedido_atendente','liberar_pedido_cozinha','conferir_pedido_cozinha',
--    'atribuir_pedido_motoboy','aceitar_entrega_motoboy','retirar_pedido_cliente',
--    'enfileirar_evento_cozinha','solicitar_reimpressao','adiar_cupom_agendado',
--    'impedir_parada_duplicada','congelar_colunas_protegidas','exigir_conferencia_para_pronto');

CREATE UNIQUE INDEX IF NOT EXISTS rotas_preparando_motoboy_uniq
  ON public.rotas_entrega (motoboy_id) WHERE status = 'preparando' AND motoboy_id IS NOT NULL;

DROP POLICY IF EXISTS "itens staff operacional select" ON public.pedido_itens;
CREATE POLICY "itens staff operacional select" ON public.pedido_itens FOR SELECT TO authenticated USING (
  (public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro'))
  AND EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.status IN ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy', 'em_rota', 'entregue')
  )
);

-- =============================================
-- 12. Anti-impressão antecipada de agendados (E7, não ativada)
-- =============================================
-- Incompatibilidade (§4): enfileirar_cupom (0073) ignora agendado_para e
-- imprimir_apos fica NULL → o agente imprime ASAP, mesmo com entrega futura.
-- Correção aditiva: BEFORE INSERT em fila_impressao preenche imprimir_apos
-- (agendado − 30 min) quando o pedido tem agendado_para futuro. O agente já
-- respeita imprimir_apos (pula trabalhos futuros). Não bloqueia, não duplica,
-- não toca em pagamento/status; NULL quando sem agendamento (comporta atual).
DROP TRIGGER IF EXISTS trigger_adiar_cupom_agendado ON public.fila_impressao;
CREATE OR REPLACE FUNCTION public.adiar_cupom_agendado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.adiar_cupom_agendado() FROM PUBLIC;
CREATE TRIGGER trigger_adiar_cupom_agendado
  BEFORE INSERT ON public.fila_impressao
  FOR EACH ROW EXECUTE FUNCTION public.adiar_cupom_agendado();
COMMENT ON FUNCTION public.adiar_cupom_agendado() IS 'E7: adia cupom de agendado via imprimir_apos. Sem bloqueio, sem duplicata.';
