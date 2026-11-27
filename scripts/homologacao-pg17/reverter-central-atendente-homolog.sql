-- Reversão compensatória das migrations 0130–0132 da Central da Atendente.
-- Executar apenas em homologação, após autorização e reversão do alias.
-- Os prazos já registrados, os pedidos, os avisos e o histórico são preservados.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP TRIGGER IF EXISTS pedido_acrescentar_prazo_assado ON public.pedido_item_componentes;
DROP TRIGGER IF EXISTS pedido_acrescentar_prazo_assado ON public.pedido_itens;
DROP TRIGGER IF EXISTS pedido_registrar_prazo_comercial ON public.pedidos;
DROP TRIGGER IF EXISTS pedido_preservar_prazo_comercial ON public.pedidos;
DROP FUNCTION IF EXISTS public.pedido_acrescentar_prazo_assado();
DROP FUNCTION IF EXISTS public.pedido_registrar_prazo_comercial();
DROP FUNCTION IF EXISTS public.pedido_preservar_prazo_comercial();

DROP TRIGGER IF EXISTS central_atendente_publicar_aviso_cozinha ON public.notificacoes;
DROP TRIGGER IF EXISTS central_atendente_validar_aviso_cozinha ON public.notificacoes;
DROP FUNCTION IF EXISTS public.central_atendente_publicar_aviso_cozinha();
DROP FUNCTION IF EXISTS public.central_atendente_validar_aviso_cozinha();
DROP INDEX IF EXISTS public.notificacoes_aviso_cozinha_tipo_link_idx;
DROP POLICY IF EXISTS central_atendente_origem_aviso_cozinha ON public.notificacoes;
DROP POLICY IF EXISTS central_atendente_bloquear_envio_cliente ON realtime.messages;
DROP POLICY IF EXISTS central_atendente_limitar_leitura_avisos ON realtime.messages;
DROP POLICY IF EXISTS central_atendente_receber_avisos ON realtime.messages;

DROP POLICY IF EXISTS central_atendente_remessas_ativas ON public.producao_remessas;
DROP POLICY IF EXISTS central_atendente_itens_ativos ON public.pedido_itens;

COMMIT;
