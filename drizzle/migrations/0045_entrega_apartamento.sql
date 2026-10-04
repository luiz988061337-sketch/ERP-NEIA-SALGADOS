-- 0045: endereco_entrega completo + tipos de imovel + mensagem condominio
-- Idempotente. Rode APÓS 0044.

-- =============================================
-- 1. Endereço de entrega estruturado (já existe em pedidos, mas vamos garantir)
-- =============================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_imovel text CHECK (tipo_imovel IN ('casa', 'apartamento')),
  ADD COLUMN IF NOT EXISTS apartamento text,
  ADD COLUMN IF NOT EXISTS bloco text,
  ADD COLUMN IF NOT EXISTS torre text,
  ADD COLUMN IF NOT EXISTS andar text,
  ADD COLUMN IF NOT EXISTS interfone text,
  ADD COLUMN IF NOT EXISTS pode_subir boolean DEFAULT false;

-- =============================================
-- 2. Trigger: ao sair para entrega, atualiza status motoboy + histórico
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_saida_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'em_rota' AND OLD.status = 'aguardando_motoboy' THEN
    -- Atualiza motoboy
    UPDATE public.motoboys
    SET status = 'em_rota',
        ultima_atualizacao = now()
    WHERE id = NEW.motoboy_id;

    -- Histórico
    INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
    VALUES (
      NEW.motoboy_id,
      NULL,
      NEW.id,
      'saida_base',
      'Iniciou rota de entrega para pedido #' || NEW.numero
    );
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- 3. Trigger: ao entregar, atualiza motoboy + histórico
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_entrega_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'entregue' AND OLD.status = 'em_rota' THEN
    -- Atualiza motoboy
    UPDATE public.motoboys
    SET status = 'retornando_base',
        ultima_atualizacao = now()
    WHERE id = NEW.motoboy_id;

    -- Histórico
    INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
    VALUES (
      NEW.motoboy_id,
      NULL,
      NEW.id,
      'entrega_realizada',
      'Entregue pedido #' || NEW.numero || ' para ' || NEW.cliente_nome
    );

    -- Verifica se motoboy tem mais pedidos em rota
    IF NOT EXISTS (
      SELECT 1 FROM public.pedidos
      WHERE motoboy_id = NEW.motoboy_id
        AND status IN ('em_rota', 'aguardando_motoboy')
    ) THEN
      -- Se não tem mais, marca como aguardando nova rota
      UPDATE public.motoboys
      SET status = 'aguardando_nova_rota',
          ultima_atualizacao = now()
      WHERE id = NEW.motoboy_id;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        NEW.motoboy_id,
        NULL,
        NEW.id,
        'retorno_base',
        'Retornando à base - sem mais pedidos em rota'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Aplica triggers
DROP TRIGGER IF EXISTS trigger_saida_motoboy ON public.pedidos;
CREATE TRIGGER trigger_saida_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_saida_motoboy();

DROP TRIGGER IF EXISTS trigger_entrega_motoboy ON public.pedidos;
CREATE TRIGGER trigger_entrega_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_entrega_motoboy();

-- =============================================
-- 4. Função: mensagem automática para apartamento/condomínio
-- =============================================
CREATE OR REPLACE FUNCTION public.gerar_msg_apartamento(p_pedido_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- =============================================
-- 5. Trigger: ao criar pedido com apartamento, envia mensagem automática
-- =============================================
-- (O envio real é via WhatsApp no frontend/backend, esta função serve para gerar o texto)

-- =============================================
-- 6. Trigger: ao agendar, valida endereço completo
-- =============================================
CREATE OR REPLACE FUNCTION public.validar_endereco_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS trigger_validar_endereco ON public.pedidos;
CREATE TRIGGER trigger_validar_endereco
  BEFORE INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_endereco_entrega();

COMMENT ON TABLE public.pedidos IS '...';
COMMENT ON COLUMN public.pedidos.tipo_imovel IS 'casa | apartamento (para mensagem automática condominio)';
COMMENT ON COLUMN public.pedidos.pode_subir IS 'Se true, motoboy sobe até o apto; se false, cliente aguarda na portaria';