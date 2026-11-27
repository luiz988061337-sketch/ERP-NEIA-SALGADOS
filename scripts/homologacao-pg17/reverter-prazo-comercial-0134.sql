-- Compensação da 0134. Preserva pedidos, prazos, avisos e o histórico.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.pedidos'::regclass
      AND tgname = 'pedidos_guard_update_trg'
      AND tgfoid = 'public.pedidos_guard_update()'::regprocedure
      AND tgtype = 19 AND tgenabled = 'O' AND tgqual IS NOT NULL
      AND pg_catalog.pg_get_triggerdef(oid) LIKE '%prazo_comercial_assados%'
  ) THEN
    RAISE EXCEPTION 'Reversão da 0134: a guarda em uso precisa ser revisada';
  END IF;
END;
$$;

DROP TRIGGER pedidos_guard_update_trg ON public.pedidos;
CREATE TRIGGER pedidos_guard_update_trg
  BEFORE UPDATE ON public.pedidos FOR EACH ROW
  EXECUTE FUNCTION public.pedidos_guard_update();

DROP TRIGGER pedido_acrescentar_prazo_assado ON public.pedido_item_componentes;
DROP TRIGGER pedido_acrescentar_prazo_assado ON public.pedido_itens;
DROP TRIGGER pedido_registrar_prazo_comercial ON public.pedidos;
DROP TRIGGER pedido_preservar_prazo_comercial ON public.pedidos;
DROP FUNCTION public.pedido_acrescentar_prazo_assado();
DROP FUNCTION public.pedido_registrar_prazo_comercial();
DROP FUNCTION public.pedido_preservar_prazo_comercial();

COMMIT;
