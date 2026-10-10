-- 0068: autorização (dono/staff) + idempotência nas reservas 0030 (K5 Fase 3).
-- PROBLEMAS CORRIGIDOS (auditoria K3/K4, código local):
--   a) reservar/liberar_reserva_atomica não verificavam dono nem status:
--      qualquer authenticated com UUIDs válidos debitava/liberava estoque
--      de pedidos alheios (grants 0031 mantidos — o navegador PRECISA
--      chamar; a proteção passa a ser DENTRO da função).
--   b) retry/duplo clique debitava de novo (sem idempotência).
-- REGRAS (papéis reais: admin, producao, motoboy, cliente, atendente,
-- financeiro — 0000/0003; user_roles.user_id = auth.users.id):
--   - dono: pedidos.user_id = auth.uid(), com user_id e auth.uid() ambos
--     NÃO NULOS (NULL nunca equivale a propriedade);
--   - chamadas sem usuário autenticado são SEMPRE negadas (inclusive para
--     pedidos sem dono); service_role sem JWT de usuário também é negado
--     aqui — não há chamador de servidor hoje; se surgir, exigirá
--     mecanismo explícito próprio (nunca bypass genérico);
--   - staff operacional: admin, producao, atendente (quem opera pedidos;
--     motoboy/financeiro/cliente-terceiro NÃO reservam/liberam).
--   - reserva só com status 'recebido' (checkout) ou 'em_producao'
--     (reposição operacional); demais estados -> false, sem efeito.
--   - idempotência: já reservado (>= qtd, status 'ativa') -> pula o débito
--     e conta como sucesso; diferença parcial reserva só o restante.
--   - liberação: só linhas 'ativa' (já era idempotente) + mesma checagem
--     de dono/staff; pedido inexistente -> 0, sem efeito.
-- COMPATIBILIDADE (contratos inalterados):
--   - mesmas assinaturas, mesmos retornos (boolean/integer), DEFINER +
--     SET search_path = public, locks FOR UPDATE, grants 0031 intactos.
--   - checkout (dono, recebido) OK; cancela admin (admin) OK;
--     cancela cliente (dono) OK; service_role inalterado.
-- Idempotente (OR REPLACE). NÃO aplicar sem autorização. Staging antes.

CREATE OR REPLACE FUNCTION public.reservar_estoque_atomica(
  p_pedido_id uuid, p_produto_id uuid, p_qtd integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estoque integer;
  v_dono uuid;
  v_status public.order_status;
  v_eh_staff boolean;
  v_ja_reservado integer;
  v_falta integer;
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RETURN false; END IF;

  -- Pedido precisa existir; trava a linha do pedido (serializa retries).
  SELECT user_id, status INTO v_dono, v_status
  FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Autorização: dono (não-nulo) ou staff operacional. Nunca só "estar
  -- logado"; NULL nunca equivale a propriedade ou identidade.
  v_eh_staff := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente');
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF v_dono IS NULL THEN
    -- Pedido sem dono: só staff opera.
    IF NOT v_eh_staff THEN
      RETURN false;
    END IF;
  ELSIF v_dono IS DISTINCT FROM auth.uid() AND NOT v_eh_staff THEN
    RETURN false;
  END IF;

  -- Só reserva em estado válido (criação/confirmação e produção inicial).
  IF v_status NOT IN ('recebido', 'em_producao') THEN RETURN false; END IF;

  -- Idempotência: desconta apenas o que ainda não foi reservado.
  SELECT COALESCE(SUM(quantidade), 0) INTO v_ja_reservado
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND produto_id = p_produto_id
    AND status = 'ativa';
  v_falta := p_qtd - v_ja_reservado;
  IF v_falta <= 0 THEN RETURN true; END IF;

  -- Lock da linha do produto: serializa reservas concorrentes.
  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_estoque < v_falta THEN RETURN false; END IF;
  UPDATE public.produtos SET estoque = estoque - v_falta WHERE id = p_produto_id;
  INSERT INTO public.reservas_estoque (pedido_id, produto_id, quantidade, status)
  VALUES (p_pedido_id, p_produto_id, v_falta, 'ativa');
  INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
  VALUES (p_produto_id, 'reserva', v_falta, 'pedido:' || p_pedido_id::text);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; n integer := 0;
  v_dono uuid;
  v_eh_staff boolean;
BEGIN
  SELECT user_id INTO v_dono FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_eh_staff := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente');
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN 0;
    END IF;
  ELSIF v_dono IS DISTINCT FROM auth.uid() AND NOT v_eh_staff THEN
    RETURN 0;
  END IF;

  -- Só linhas 'ativa': repetir a chamada é no-op (idempotente).
  FOR r IN SELECT * FROM public.reservas_estoque WHERE pedido_id = p_pedido_id AND status = 'ativa' FOR UPDATE LOOP
    UPDATE public.produtos SET estoque = estoque + r.quantidade WHERE id = r.produto_id;
    UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = r.id;
    INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
    VALUES (r.produto_id, 'liberacao_reserva', r.quantidade, 'pedido:' || p_pedido_id::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) IS
  '0068: exige pedido existente, dono ou staff (admin/producao/atendente), status recebido/em_producao; idempotente por retry.';
COMMENT ON FUNCTION public.liberar_reserva_atomica(uuid) IS
  '0068: exige pedido existente, dono ou staff; só libera linhas ativa (repetir = no-op).';
