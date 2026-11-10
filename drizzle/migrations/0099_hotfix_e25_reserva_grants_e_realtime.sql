-- =====================================================================
-- 0099: HOTFIX E2E — funcionalidade obrigatória quebrada no staging
-- (ruioyioynwwwiqbjznoa), achada no teste E2E da Production e corrigida:
--   1. trigger on_auth_user_created (idêntica à 0000) inexistente =>
--      cliente sem perfil; Nome/WhatsApp do checkout nunca eram gravados;
--   2. EXECUTE de reservar_estoque_atomica/liberar_reserva_atomica negado a
--      authenticated => pedido do cliente nunca reservava estoque;
--   3. reservar_estoque_atomica legado (0030) violava CHECK estoque_mov_tipo
--      (usava estoque_mov) => substituída pela versão 0088 (autoriza
--      dono/staff, alvo autoritativo = Σ pedido_itens, ledger
--      estoque_movimentacoes); liberar_reserva_atomica reescrita no mesmo
--      padrão (idempotente, dono OU staff, credita saldo + ledger).
--   4. publication supabase_realtime VAZIA => nenhum listener postgres_changes
--      funcionava (produção/central/motoboy/detalhe). Adiciona pedidos.
-- Aplicada via Management API (database/query) em 2026-11-10.
-- =====================================================================

-- HOTFIX E2E (staging ruioyioynwwwiqbjznoa) — mínimo, aditivo e reversível:
-- 1) trigger de novos usuários (idêntica à 0000): cria perfil + role cliente
-- 2) EXECUTE de reserva/liberação para authenticated (o cliente dono opera as próprias reservas)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, telefone)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome',''), coalesce(new.raw_user_meta_data->>'telefone',''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'cliente') on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

grant execute on function public.reservar_estoque_atomica(uuid, uuid, integer) to authenticated;
grant execute on function public.liberar_reserva_atomica(uuid) to authenticated;

-- HOTFIX E2E #2 (staging): substituir o par reserva/liberação pela versão
-- alinhada ao design aprovado (0088) — autorização dono/staff, arvo autoritativo
-- (Σ pedido_itens), ledger `estoque_movimentacoes` (0042). Idempotente.

CREATE OR REPLACE FUNCTION public.reservar_estoque_atomica(
  p_pedido_id  uuid,
  p_produto_id uuid,
  p_qtd        integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_eh_staff   boolean;
  v_solicitado integer;
  v_ja_total   integer;
  v_falta      integer;
  v_estoque    integer;
  v_reserva_id uuid;
  v_mov_id     uuid;
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RETURN false; END IF;
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT user_id, status INTO v_dono, v_status
    FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');
  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN RETURN false; END IF;
  ELSIF v_dono IS DISTINCT FROM v_uid AND NOT v_eh_staff THEN
    RETURN false;
  END IF;

  IF v_status NOT IN ('recebido', 'em_producao') THEN RETURN false; END IF;

  SELECT COALESCE(SUM(quantidade), 0) INTO v_solicitado
    FROM public.pedido_itens
   WHERE pedido_id = p_pedido_id AND produto_id = p_produto_id;
  IF v_solicitado <= 0 THEN RETURN false; END IF;
  IF p_qtd > v_solicitado THEN RETURN false; END IF;

  SELECT COALESCE(SUM(quantidade), 0) INTO v_ja_total
    FROM public.reservas_estoque
   WHERE pedido_id = p_pedido_id AND produto_id = p_produto_id AND status = 'ativa';

  v_falta := v_solicitado - v_ja_total;
  IF v_falta <= 0 THEN RETURN true; END IF;  -- idempotente

  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_estoque < v_falta THEN RETURN false; END IF;

  v_reserva_id := gen_random_uuid();
  UPDATE public.produtos SET estoque = v_estoque - v_falta WHERE id = p_produto_id;
  INSERT INTO public.reservas_estoque (id, pedido_id, produto_id, quantidade, status)
       VALUES (v_reserva_id, p_pedido_id, p_produto_id, v_falta, 'ativa');

  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id, NULL, 'reserva', -v_falta, v_estoque, v_estoque - v_falta,
    v_reserva_id, 'reserva_estoque', v_uid,
    'Reserva de estoque (Modelo 2) pedido ' || p_pedido_id::text
  ) RETURNING id INTO v_mov_id;

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.liberar_reserva_atomica(uuid);

CREATE OR REPLACE FUNCTION public.liberar_reserva_atomica(
  p_pedido_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_dono     uuid;
  v_status   public.order_status;
  v_eh_staff boolean;
  v_estoque  integer;
  r          record;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT user_id, status INTO v_dono, v_status
    FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente')
             OR public.has_role(v_uid, 'financeiro');
  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN RETURN; END IF;
  ELSIF v_dono IS DISTINCT FROM v_uid AND NOT v_eh_staff THEN
    RETURN;  -- terceiro não autorizado
  END IF;

  IF v_status NOT IN ('recebido', 'em_producao', 'pronto', 'cancelado') THEN
    RETURN;  -- nunca credita em entrega/em rota
  END IF;

  -- L2 produtos: trava os produtos com reserva ativa (ordem pedidos→produtos)
  FOR r IN SELECT DISTINCT produto_id FROM public.reservas_estoque
            WHERE pedido_id = p_pedido_id AND status = 'ativa'
            ORDER BY produto_id
  LOOP
    PERFORM 1 FROM public.produtos WHERE id = r.produto_id FOR UPDATE;
  END LOOP;

  FOR r IN
    SELECT qr.* FROM public.reservas_estoque qr
     WHERE qr.pedido_id = p_pedido_id AND qr.status = 'ativa'
     ORDER BY qr.id
  LOOP
    SELECT estoque INTO v_estoque FROM public.produtos WHERE id = r.produto_id;
    IF v_estoque IS NULL THEN RETURN; END IF;

    UPDATE public.produtos SET estoque = v_estoque + r.quantidade
     WHERE id = r.produto_id;

    UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = r.id;

    INSERT INTO public.estoque_movimentacoes (
      produto_id, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
      referencia_id, referencia_tipo, usuario_id, observacao
    ) VALUES (
      r.produto_id, NULL, 'liberacao', r.quantidade, v_estoque, v_estoque + r.quantidade,
      r.id, 'reserva_estoque', v_uid,
      'Liberação de reserva (Modelo 2) pedido ' || p_pedido_id::text
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO authenticated;

-- 4. Realtime: postgres_changes para pedidos
alter publication supabase_realtime add table public.pedidos;
