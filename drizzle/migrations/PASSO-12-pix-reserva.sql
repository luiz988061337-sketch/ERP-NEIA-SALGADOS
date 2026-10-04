-- PASSO-12: 0029 (pix loja) + 0030 (reserva atomica)


-- ============ 0029_loja_pix.sql ============
-- 0029: loja pix_chave (tira hardcoded do frontend)
ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS pix_chave text NOT NULL DEFAULT '24913937000116';
UPDATE public.loja_config SET pix_chave = '24913937000116' WHERE pix_chave IS NULL OR pix_chave = '';


-- ============ 0030_reserva_atomica.sql ============
-- 0030: reserva atÃ´mica â€” impede estoque negativo por concorrÃªncia.
-- Dois clientes simultÃ¢neos nunca vendem acima do estoque: lock por produto.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.reservar_estoque_atomica(
  p_pedido_id uuid, p_produto_id uuid, p_qtd integer
) RETURNS boolean AS $$
DECLARE
  v_estoque integer;
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RETURN false; END IF;
  -- Lock da linha do produto: serializa reservas concorrentes
  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_estoque < p_qtd THEN RETURN false; END IF;
  UPDATE public.produtos SET estoque = estoque - p_qtd WHERE id = p_produto_id;
  INSERT INTO public.reservas_estoque (pedido_id, produto_id, quantidade, status)
  VALUES (p_pedido_id, p_produto_id, p_qtd, 'ativa');
  INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
  VALUES (p_produto_id, 'reserva', p_qtd, 'pedido:' || p_pedido_id::text);
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid) RETURNS integer AS $$
DECLARE
  r record; n integer := 0;
BEGIN
  FOR r IN SELECT * FROM public.reservas_estoque WHERE pedido_id = p_pedido_id AND status = 'ativa' FOR UPDATE LOOP
    UPDATE public.produtos SET estoque = estoque + r.quantidade WHERE id = r.produto_id;
    UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = r.id;
    INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
    VALUES (r.produto_id, 'liberacao_reserva', r.quantidade, 'pedido:' || p_pedido_id::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

