-- 0005: hardening — GRANTs faltantes (0001/0003/0004), guarda de update em pedidos, alinhamento CRM
-- Rode no SQL Editor do Supabase APÓS 0000–0004. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação e confira os fluxos (admin, produção, motoboy, cliente cancela).

-- ============ 1. GRANTs p/ authenticated (RLS sozinha não basta) ============
-- Sem estes GRANTs, até o admin recebe 42501 nas tabelas abaixo.
GRANT ALL ON public.crm_customers TO authenticated;
GRANT ALL ON public.crm_settings TO authenticated;
GRANT ALL ON public.crm_campaigns TO authenticated;
GRANT ALL ON public.crm_recipients TO authenticated;
GRANT ALL ON public.crm_events TO authenticated;
GRANT ALL ON public.estoque_mov TO authenticated;
GRANT ALL ON public.despesas TO authenticated;
GRANT ALL ON public.admin_logs TO authenticated;
GRANT ALL ON public.orcamentos TO authenticated;
GRANT ALL ON public.carrinho_eventos TO authenticated;
GRANT ALL ON public.notificacoes TO authenticated;

-- ============ 2. Guarda de UPDATE em pedidos (anti-fraude de valores) ============
-- RLS permite ao cliente atualizar o próprio pedido 'recebido' SEM restrição de colunas.
-- Este trigger limita: cliente só pode cancelar (status → cancelado, demais colunas iguais);
-- motoboy não pode tocar em valores/identificação; staff segue o RLS.
CREATE OR REPLACE FUNCTION public.pedidos_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'producao')
     OR public.has_role(auth.uid(),'atendente')
     OR public.has_role(auth.uid(),'financeiro') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(),'motoboy') THEN
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
    RETURN NEW;
  END IF;

  -- cliente: apenas cancelar o próprio pedido recebido, sem alterar mais nada
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

  RAISE EXCEPTION 'operacao_nao_permitida';
END; $$;

DROP TRIGGER IF EXISTS pedidos_guard_update_trg ON public.pedidos;
CREATE TRIGGER pedidos_guard_update_trg
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_guard_update();

-- ============ 3. Alinhamento dos thresholds do CRM ao padrão do app ============
-- O seed original usava 14/21/30/60; o app usa 30/31/46/91 (DEFAULT_CRM_SETTINGS).
-- Atualiza SOMENTE se ainda estiver nos valores do seed (não sobrescreve ajuste manual).
UPDATE public.crm_settings
SET ativo_ate_dias = 30,
    risco_apos_dias = 31,
    inativo_apos_dias = 46,
    muito_inativo_apos_dias = 91
WHERE id = true
  AND ativo_ate_dias = 14
  AND risco_apos_dias = 21
  AND inativo_apos_dias = 30
  AND muito_inativo_apos_dias = 60;
