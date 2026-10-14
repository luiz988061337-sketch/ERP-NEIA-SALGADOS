-- 0074: guard libera service_role (auto-confirm Pix + jobs do servidor)
-- Contexto: o corpo vigente de pedidos_guard_update() no banco (com as regras
-- de motoboy adicionadas após 0005) barrava QUALQUER update sem login staff.
-- service_role não tem auth.uid(), então o auto-confirm do leitor Pix
-- (POST /api/public/pix/event, que baixa o pedido via service_role) era
-- rejeitado com 'transicao_nao_permitida' e caía p/ conferência manual sempre.
-- Esta migration preserva o corpo vigente na íntegra e só adiciona o bypass
-- padrão no topo: service_role já bypassa RLS; o trigger não deve bloquear
-- o servidor. Idempotente.

CREATE OR REPLACE FUNCTION public.pedidos_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Servidor (API Pix, jobs, backfill): trusted. RLS já não se aplica a
  -- service_role; sem este bypass nenhum update via service_role passava.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admin/Produção/Atendente/Financeiro: podem tudo
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'producao')
     OR public.has_role(auth.uid(),'atendente')
     OR public.has_role(auth.uid(),'financeiro') THEN
    RETURN NEW;
  END IF;

  -- Motoboy: não pode alterar valores financeiros/cliente
  IF public.has_role(auth.uid(),'motoboy') THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
       OR NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.cupom IS DISTINCT FROM OLD.cupom
       OR NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       OR NEW.numero IS NOT DISTINCT FROM OLD.numero
       OR NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
       OR NEW.telefone IS NOT DISTINCT FROM OLD.telefone THEN
      RAISE EXCEPTION 'motoboy_nao_pode_alterar_valores';
    END IF;

    -- Permite aceitar pedido: definir motoboy_id de NULL -> seu user_id
    -- Mas não permite roubar pedido de outro motoboy (já tem motoboy_id definido)
    IF NEW.motoboy_id IS DISTINCT FROM OLD.motoboy_id THEN
      IF OLD.motoboy_id IS NOT NULL THEN
        RAISE EXCEPTION 'motoboy_nao_pode_roubar_pedido';
      END IF;
      IF NEW.motoboy_id IS NOT DISTINCT FROM auth.uid() THEN
        RETURN NEW; -- Aceitou o pedido: NULL -> seu user_id
      END IF;
      RAISE EXCEPTION 'motoboy_nao_pode_definir_outro_motoboy';
    END IF;

    RETURN NEW;
  END IF;

  -- Cliente: apenas cancelar próprio pedido recebido
  IF OLD.user_id = auth.uid() AND OLD.status = 'recebido' AND NEW.status = 'cancelado'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.numero IS NOT DISTINCT FROM OLD.numero
     AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
     AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
     AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco
     AND NEW.bairro IS NOT DISTINCT FROM OLD.bairro
     AND NEW.complemento IS NOT DISTINCT FROM OLD.complemento
     AND NEW.referencia IS NOT DISTINCT FROM OLD.referencia
     AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
     AND NEW.forma_pagamento IS NOT DISTINCT FROM OLD.forma_pagamento
     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.taxa_entrega IS NOT DISTINCT FROM OLD.taxa_entrega
     AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.cupom IS NOT DISTINCT FROM OLD.cupom
     AND NEW.cidade IS NOT DISTINCT FROM OLD.cidade
     AND NEW.producao_status IS NOT DISTINCT FROM OLD.producao_status
     AND NEW.motoboy_id IS NOT DISTINCT FROM OLD.motoboy_id
     AND NEW.taxa_motoboy IS NOT DISTINCT FROM OLD.taxa_motoboy
     AND NEW.agendado_para IS NOT DISTINCT FROM OLD.agendado_para
     AND NEW.agendamento_obs IS NOT DISTINCT FROM OLD.agendamento_obs
     AND NEW.tipo_evento IS NOT DISTINCT FROM OLD.tipo_evento
     AND NEW.campanha_origem IS NOT DISTINCT FROM OLD.campanha_origem
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.destino_lat IS NOT DISTINCT FROM OLD.destino_lat
     AND NEW.destino_lng IS NOT DISTINCT FROM OLD.destino_lng
     AND NEW.motoboy_lat IS NOT DISTINCT FROM OLD.motoboy_lat
     AND NEW.motoboy_lng IS NOT DISTINCT FROM OLD.motoboy_lng
     AND NEW.motoboy_atualizado_em IS NOT DISTINCT FROM OLD.motoboy_atualizado_em
     AND NEW.aceito_em IS NOT DISTINCT FROM OLD.aceito_em
     AND NEW.entregue_em IS NOT DISTINCT FROM OLD.entregue_em THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'transicao_nao_permitida';
END;
$$;

COMMENT ON FUNCTION public.pedidos_guard_update() IS
  'Anti-fraude em pedidos (staff total; motoboy sem valores; cliente só cancela o próprio recebido). service_role bypassa (servidor: API Pix, jobs).';
