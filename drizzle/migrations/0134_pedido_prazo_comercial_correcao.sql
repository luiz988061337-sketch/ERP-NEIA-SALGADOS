-- Corrige a interação da 0132 com a proteção de pedidos após a reversão.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  -- Esta mudança foi validada com a guarda restaurada em homologação.
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
    WHERE oid = 'public.pedidos_guard_update()'::regprocedure
      AND prosecdef
      AND md5(replace(prosrc, chr(13), '')) = '8e4bc904ec461736b8d42664117a4432'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.pedidos'::regclass
      AND tgname = 'pedidos_guard_update_trg'
      AND tgfoid = 'public.pedidos_guard_update()'::regprocedure
      AND tgtype = 19 AND tgenabled = 'O' AND tgqual IS NULL
  ) THEN
    RAISE EXCEPTION '0134: executor ou guarda de pedidos diferente da base validada';
  END IF;
END;
$$;

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
  IF NEW.agendado_para IS NOT NULL OR NEW.tipo_entrega IS NULL
     OR NEW.tipo_entrega NOT IN ('retirada', 'entrega') THEN
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

  -- NULL com janela preenchida é o sinal provisório do combo textual.
  -- O INSERT do pedido sempre recebe a janela base, sem acréscimo.
  NEW.prazo_comercial_assados := CASE WHEN NEW.prazo_comercial_assados IS TRUE THEN NULL ELSE false END;
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
  v_combo_textual boolean := false;
BEGIN
  IF TG_RELID = 'public.pedido_itens'::regclass THEN
    v_pedido := NEW.pedido_id;
    IF NEW.produto_id IS NULL THEN
      -- Formato usado pelo checkout legado, com categoria e quantidade verificadas.
      SELECT EXISTS (
        SELECT 1 FROM public.categorias c
        WHERE c.slug ~ '(assad|pizza|empad)' AND c.slug !~ 'congel'
          AND starts_with(NEW.nome, format('Combo %s %sun (', c.nome, NEW.quantidade))
      ) INTO v_combo_textual;
    END IF;
  ELSE
    SELECT i.pedido_id INTO v_pedido FROM public.pedido_itens i WHERE i.id = NEW.pedido_item_id;
  END IF;

  IF NOT v_combo_textual AND NOT EXISTS (
    SELECT 1 FROM public.produtos p JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.id = NEW.produto_id
      AND c.slug ~ '(assad|pizza|empad)' AND c.slug !~ 'congel'
      AND coalesce(p.tipo_venda::text, '') !~ 'congel'
  ) THEN
    RETURN NEW;
  END IF;

  -- O UPDATE reavalia o indicador após o lock da linha, inclusive em concorrência.
  UPDATE public.pedidos p
     SET prazo_prometido_inicio_em = p.prazo_prometido_inicio_em + interval '10 minutes',
         prazo_prometido_em = p.prazo_prometido_em + interval '10 minutes',
         prazo_comercial_assados = true
   WHERE p.id = v_pedido AND p.status = 'recebido' AND p.agendado_para IS NULL
     AND p.created_at >= TG_ARGV[0]::timestamptz
     AND p.prazo_prometido_inicio_em IS NOT NULL AND p.prazo_prometido_em IS NOT NULL
     AND p.prazo_comercial_assados IS NOT TRUE
     AND (NOT v_combo_textual OR p.prazo_comercial_assados IS NULL);
  RETURN NEW;
END;
$$;

-- INVOKER para distinguir o papel real do UPDATE do papel declarado no JWT.
CREATE OR REPLACE FUNCTION public.pedido_preservar_prazo_comercial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'postgres' AND pg_catalog.pg_trigger_depth() > 1
     AND OLD.status = 'recebido' AND OLD.agendado_para IS NULL
     AND OLD.prazo_comercial_assados IS NOT TRUE AND NEW.prazo_comercial_assados IS TRUE
     AND NEW.prazo_prometido_inicio_em = OLD.prazo_prometido_inicio_em + interval '10 minutes'
     AND NEW.prazo_prometido_em = OLD.prazo_prometido_em + interval '10 minutes'
     AND (to_jsonb(NEW) - ARRAY['prazo_prometido_inicio_em','prazo_prometido_em','prazo_comercial_assados'])
       = (to_jsonb(OLD) - ARRAY['prazo_prometido_inicio_em','prazo_prometido_em','prazo_comercial_assados']) THEN
    RETURN NEW;
  END IF;

  NEW.prazo_prometido_inicio_em := OLD.prazo_prometido_inicio_em;
  NEW.prazo_prometido_em := OLD.prazo_prometido_em;
  NEW.prazo_comercial_assados := OLD.prazo_comercial_assados;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_registrar_prazo_comercial() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pedido_acrescentar_prazo_assado() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pedido_preservar_prazo_comercial() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS pedido_registrar_prazo_comercial ON public.pedidos;
CREATE TRIGGER pedido_registrar_prazo_comercial
  BEFORE INSERT ON public.pedidos FOR EACH ROW
  EXECUTE FUNCTION public.pedido_registrar_prazo_comercial();

DROP TRIGGER IF EXISTS pedido_preservar_prazo_comercial ON public.pedidos;
CREATE TRIGGER pedido_preservar_prazo_comercial
  BEFORE UPDATE ON public.pedidos FOR EACH ROW
  EXECUTE FUNCTION public.pedido_preservar_prazo_comercial();

-- WHEN roda no papel do UPDATE antes de entrar na função SECURITY DEFINER da guarda.
-- Só dispensa a guarda para o acréscimo interno exato, sem mudança em outra coluna.
DROP TRIGGER pedidos_guard_update_trg ON public.pedidos;
CREATE TRIGGER pedidos_guard_update_trg
  BEFORE UPDATE ON public.pedidos FOR EACH ROW
  WHEN (NOT COALESCE((
    current_user = 'postgres' AND pg_catalog.pg_trigger_depth() > 0
    AND OLD.status = 'recebido' AND OLD.agendado_para IS NULL
    AND OLD.prazo_comercial_assados IS NOT TRUE AND NEW.prazo_comercial_assados IS TRUE
    AND NEW.prazo_prometido_inicio_em = OLD.prazo_prometido_inicio_em + interval '10 minutes'
    AND NEW.prazo_prometido_em = OLD.prazo_prometido_em + interval '10 minutes'
    AND (to_jsonb(NEW) - ARRAY['prazo_prometido_inicio_em','prazo_prometido_em','prazo_comercial_assados'])
      = (to_jsonb(OLD) - ARRAY['prazo_prometido_inicio_em','prazo_prometido_em','prazo_comercial_assados'])
  ), false))
  EXECUTE FUNCTION public.pedidos_guard_update();

DO $$
DECLARE
  v_corte timestamptz := statement_timestamp();
BEGIN
  DROP TRIGGER IF EXISTS pedido_acrescentar_prazo_assado ON public.pedido_itens;
  DROP TRIGGER IF EXISTS pedido_acrescentar_prazo_assado ON public.pedido_item_componentes;
  EXECUTE format('CREATE TRIGGER pedido_acrescentar_prazo_assado
    AFTER INSERT ON public.pedido_itens FOR EACH ROW
    EXECUTE FUNCTION public.pedido_acrescentar_prazo_assado(%L)', v_corte);
  EXECUTE format('CREATE TRIGGER pedido_acrescentar_prazo_assado
    AFTER INSERT ON public.pedido_item_componentes FOR EACH ROW
    EXECUTE FUNCTION public.pedido_acrescentar_prazo_assado(%L)', v_corte);
END;
$$;

COMMIT;
