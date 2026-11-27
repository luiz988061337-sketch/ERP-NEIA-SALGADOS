-- Os avisos e seu histórico permanecem em public.notificacoes.
-- A publicação gerenciada do Broadcast (realtime.messages) recebe só um sinal privado.
BEGIN;

DROP POLICY IF EXISTS central_atendente_receber_avisos ON realtime.messages;
CREATE POLICY central_atendente_receber_avisos
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    (SELECT realtime.topic()) = 'atendente-avisos-cozinha'
    AND extension = 'broadcast'
    AND (
      public.has_role((SELECT auth.uid()), 'atendente'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    )
  );

-- Restringe este tópico mesmo se uma política permissiva genérica existir no projeto.
DROP POLICY IF EXISTS central_atendente_limitar_leitura_avisos ON realtime.messages;
CREATE POLICY central_atendente_limitar_leitura_avisos
  ON realtime.messages AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    (topic IS DISTINCT FROM 'atendente-avisos-cozinha'
     AND (SELECT realtime.topic()) IS DISTINCT FROM 'atendente-avisos-cozinha')
    OR (
      extension = 'broadcast'
      AND (
        public.has_role((SELECT auth.uid()), 'atendente'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      )
    )
  );

DROP POLICY IF EXISTS central_atendente_bloquear_envio_cliente ON realtime.messages;
CREATE POLICY central_atendente_bloquear_envio_cliente
  ON realtime.messages AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    topic IS DISTINCT FROM 'atendente-avisos-cozinha'
    AND (SELECT realtime.topic()) IS DISTINCT FROM 'atendente-avisos-cozinha'
  );

-- Apenas a cozinha e admin podem originar estes avisos. Os demais tipos continuam
-- sujeitos às políticas existentes, inclusive os avisos do motoboy.
DROP POLICY IF EXISTS central_atendente_origem_aviso_cozinha ON public.notificacoes;
CREATE POLICY central_atendente_origem_aviso_cozinha
  ON public.notificacoes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    tipo NOT IN ('pedido_pronto_caixa', 'pedido_liberado_retirada')
    OR public.has_role((SELECT auth.uid()), 'producao'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS notificacoes_aviso_cozinha_tipo_link_idx
  ON public.notificacoes (tipo, link)
  WHERE tipo IN ('pedido_pronto_caixa', 'pedido_liberado_retirada');

CREATE OR REPLACE FUNCTION public.central_atendente_validar_aviso_cozinha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido uuid;
BEGIN
  -- O servidor valida a autoria antes de qualquer supressão silenciosa do INSERT.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'producao'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas a cozinha ou a administração podem emitir este aviso' USING ERRCODE = '42501';
  END IF;

  v_pedido := substring(NEW.link FROM '^/central-entregas[?]pedido=([0-9a-fA-F-]{36})$')::uuid;
  IF v_pedido IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = v_pedido AND p.status = 'pronto' AND p.conferido_em IS NOT NULL
      AND p.retirado_em IS NULL
      AND p.tipo_entrega = CASE NEW.tipo WHEN 'pedido_pronto_caixa' THEN 'entrega' ELSE 'retirada' END
  ) THEN
    RAISE EXCEPTION 'Aviso incompatível com o pedido ou a conferência da cozinha' USING ERRCODE = '23514';
  END IF;

  -- A API opera em READ COMMITTED. A trava serializa dois envios da mesma
  -- cozinha/modalidade sem exigir remoção de duplicatas históricas.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.tipo || ':' || v_pedido::text, 0));
  NEW.link := '/central-entregas?pedido=' || v_pedido::text;
  IF EXISTS (SELECT 1 FROM public.notificacoes n WHERE n.tipo = NEW.tipo AND n.link = NEW.link) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.central_atendente_publicar_aviso_cozinha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- O cliente recebe só o tipo de evento e relê o histórico com as permissões da sessão.
  PERFORM realtime.send('{}'::jsonb, 'aviso-cozinha', 'atendente-avisos-cozinha', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A gravação do aviso segue disponível para a consulta periódica.
  RAISE WARNING 'Realtime do aviso da cozinha indisponível (%)', SQLSTATE;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.central_atendente_validar_aviso_cozinha() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.central_atendente_publicar_aviso_cozinha() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS central_atendente_validar_aviso_cozinha ON public.notificacoes;
CREATE TRIGGER central_atendente_validar_aviso_cozinha
  BEFORE INSERT ON public.notificacoes FOR EACH ROW
  WHEN (NEW.tipo IN ('pedido_pronto_caixa', 'pedido_liberado_retirada'))
  EXECUTE FUNCTION public.central_atendente_validar_aviso_cozinha();

DROP TRIGGER IF EXISTS central_atendente_publicar_aviso_cozinha ON public.notificacoes;
CREATE TRIGGER central_atendente_publicar_aviso_cozinha
  AFTER INSERT ON public.notificacoes FOR EACH ROW
  WHEN (NEW.tipo IN ('pedido_pronto_caixa', 'pedido_liberado_retirada'))
  EXECUTE FUNCTION public.central_atendente_publicar_aviso_cozinha();

COMMIT;
