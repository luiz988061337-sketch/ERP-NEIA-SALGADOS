-- A janela comercial é registrada no pedido, em todos os canais de criação.
-- Pedidos anteriores à migration continuam com os campos nulos.
BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS prazo_prometido_inicio_em timestamptz,
  ADD COLUMN IF NOT EXISTS prazo_prometido_em timestamptz,
  ADD COLUMN IF NOT EXISTS prazo_comercial_assados boolean;

CREATE OR REPLACE FUNCTION public.pedido_registrar_prazo_comercial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inicio integer;
  v_limite integer;
  v_base timestamptz := statement_timestamp();
BEGIN
  NEW.prazo_prometido_inicio_em := NULL;
  NEW.prazo_prometido_em := NULL;
  IF NEW.agendado_para IS NOT NULL OR NEW.tipo_entrega NOT IN ('retirada', 'entrega')
     OR NEW.tipo_entrega IS NULL THEN
    NEW.prazo_comercial_assados := NULL;
    RETURN NEW;
  END IF;

  SELECT CASE NEW.tipo_entrega WHEN 'retirada' THEN l.retirada_prazo_min ELSE l.entrega_prazo_min END,
         CASE NEW.tipo_entrega WHEN 'retirada' THEN l.retirada_prazo_max ELSE l.entrega_prazo_max END
    INTO v_inicio, v_limite
    FROM public.loja_config l WHERE l.id = true;

  IF NEW.tipo_entrega = 'retirada' THEN
    v_inicio := coalesce(v_inicio, 40);
    v_limite := coalesce(v_limite, 60);
  ELSE
    v_inicio := coalesce(v_inicio, 60);
    v_limite := coalesce(v_limite, 90);
  END IF;

  -- O checkout legado conhece os componentes de combos que ainda grava como
  -- um só item de texto. O único indício que o cliente pode enviar é +10 min.
  NEW.prazo_comercial_assados := coalesce(NEW.prazo_comercial_assados, false);
  IF NEW.prazo_comercial_assados THEN
    v_inicio := v_inicio + 10;
    v_limite := v_limite + 10;
  END IF;
  NEW.prazo_prometido_inicio_em := v_base + pg_catalog.make_interval(mins => v_inicio);
  NEW.prazo_prometido_em := v_base + pg_catalog.make_interval(mins => v_limite);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pedido_acrescentar_prazo_assado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido uuid;
BEGIN
  -- Categoria cadastrada (assados, mini pizzas ou mini empadinhas). Congelado
  -- explícito no catálogo fica fora, inclusive de uma categoria mista.
  IF NEW.produto_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.produtos p JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = NEW.produto_id
      AND c.slug ~ '(assad|pizza|empad)'
      AND c.slug !~ 'congel'
      AND coalesce(p.tipo_venda::text, '') !~ 'congel'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'pedido_itens' THEN
    v_pedido := NEW.pedido_id;
  ELSE
    SELECT i.pedido_id INTO v_pedido FROM public.pedido_itens i WHERE i.id = NEW.pedido_item_id;
  END IF;

  -- O lock de UPDATE, com a condição reavaliada no banco, aplica o adicional
  -- uma única vez mesmo com vários itens. Histórico e agendados ficam intactos.
  UPDATE public.pedidos
     SET prazo_prometido_inicio_em = prazo_prometido_inicio_em + interval '10 minutes',
         prazo_prometido_em = prazo_prometido_em + interval '10 minutes',
         prazo_comercial_assados = true
   WHERE id = v_pedido AND agendado_para IS NULL AND prazo_comercial_assados IS FALSE;
  RETURN NEW;
END;
$$;

-- A janela comercial já registrada não pode ser substituída por um PATCH.
CREATE OR REPLACE FUNCTION public.pedido_preservar_prazo_comercial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A atualização do adicional acontece dentro do trigger de itens.
  IF pg_catalog.pg_trigger_depth() = 1 THEN
    NEW.prazo_prometido_inicio_em := OLD.prazo_prometido_inicio_em;
    NEW.prazo_prometido_em := OLD.prazo_prometido_em;
    NEW.prazo_comercial_assados := OLD.prazo_comercial_assados;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_preservar_prazo_comercial() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pedido_preservar_prazo_comercial ON public.pedidos;
CREATE TRIGGER pedido_preservar_prazo_comercial
  BEFORE UPDATE ON public.pedidos FOR EACH ROW
  EXECUTE FUNCTION public.pedido_preservar_prazo_comercial();

REVOKE ALL ON FUNCTION public.pedido_registrar_prazo_comercial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pedido_acrescentar_prazo_assado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pedido_registrar_prazo_comercial ON public.pedidos;
CREATE TRIGGER pedido_registrar_prazo_comercial
  BEFORE INSERT ON public.pedidos FOR EACH ROW
  EXECUTE FUNCTION public.pedido_registrar_prazo_comercial();

DROP TRIGGER IF EXISTS pedido_acrescentar_prazo_assado ON public.pedido_itens;
CREATE TRIGGER pedido_acrescentar_prazo_assado
  AFTER INSERT ON public.pedido_itens FOR EACH ROW
  EXECUTE FUNCTION public.pedido_acrescentar_prazo_assado();

DROP TRIGGER IF EXISTS pedido_acrescentar_prazo_assado ON public.pedido_item_componentes;
CREATE TRIGGER pedido_acrescentar_prazo_assado
  AFTER INSERT ON public.pedido_item_componentes FOR EACH ROW
  EXECUTE FUNCTION public.pedido_acrescentar_prazo_assado();

COMMENT ON COLUMN public.pedidos.prazo_prometido_em IS
  'Limite comercial registrado para pedidos imediatos. Agendados usam agendado_para e pedidos históricos preservam NULL.';

COMMIT;
