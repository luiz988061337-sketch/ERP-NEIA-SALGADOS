ALTER FUNCTION public.liberar_reserva_atomica(uuid) SET search_path = public;
ALTER FUNCTION public.reservar_estoque_atomica(uuid,uuid,integer) SET search_path = public;

-- Parceiros: candidaturas abertas, mas só como novas e não divulgadas
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;
CREATE POLICY "parceiros candidatura" ON public.parceiros FOR INSERT TO anon, authenticated
WITH CHECK (status = 'nova' AND length(nome) BETWEEN 1 AND 200 AND coalesce(length(proposta),0) <= 2000 AND coalesce(length(descricao),0) <= 2000);

-- Pontos: só funções do servidor ou admin alteram
CREATE OR REPLACE FUNCTION public.profiles_guard_pontos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pontos IS DISTINCT FROM OLD.pontos
     AND coalesce(current_setting('app.pontos_ok', true),'') <> '1'
     AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'pontos_nao_editaveis';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_guard_pontos_trg ON public.profiles;
CREATE TRIGGER profiles_guard_pontos_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_pontos();

CREATE OR REPLACE FUNCTION public.profiles_guard_pontos_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.pontos_ok', true),'') <> '1' AND NOT public.has_role(auth.uid(),'admin') THEN
    NEW.pontos := 0;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_guard_pontos_ins_trg ON public.profiles;
CREATE TRIGGER profiles_guard_pontos_ins_trg BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_pontos_insert();

CREATE TABLE IF NOT EXISTS public.pontos_creditos (
  pedido_id uuid PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pontos integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pontos_creditos TO authenticated;
GRANT ALL ON public.pontos_creditos TO service_role;
ALTER TABLE public.pontos_creditos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pontos_creditos own read" ON public.pontos_creditos FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.creditar_pontos_pedido(p_pedido_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ped record; v_cfg record; v_pts integer;
BEGIN
  SELECT id, user_id, total, status INTO v_ped FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND OR v_ped.user_id IS DISTINCT FROM auth.uid() OR v_ped.status = 'cancelado' THEN RETURN 0; END IF;
  SELECT fid_ativo, fid_reais_por_ponto INTO v_cfg FROM public.crm_settings WHERE id = true;
  IF FOUND AND NOT coalesce(v_cfg.fid_ativo, true) THEN RETURN 0; END IF;
  v_pts := floor(coalesce(v_ped.total,0) / greatest(coalesce(v_cfg.fid_reais_por_ponto, 1), 0.01));
  IF v_pts <= 0 THEN RETURN 0; END IF;
  INSERT INTO public.pontos_creditos (pedido_id, user_id, pontos) VALUES (p_pedido_id, v_ped.user_id, v_pts)
  ON CONFLICT (pedido_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM set_config('app.pontos_ok','1', true);
  UPDATE public.profiles SET pontos = pontos + v_pts WHERE id = v_ped.user_id;
  PERFORM set_config('app.pontos_ok','', true);
  RETURN v_pts;
END; $$;
REVOKE ALL ON FUNCTION public.creditar_pontos_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creditar_pontos_pedido(uuid) TO authenticated;

-- Resgate: validado no servidor, código imprevisível
DROP POLICY IF EXISTS "cupons resgate proprio" ON public.cupons;
CREATE OR REPLACE FUNCTION public.resgatar_fidelidade(p_telefone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_tel text; v_saldo integer; v_meta integer := 200; v_valor numeric := 20; v_ativo boolean := true; v_codigo text; v_cfg record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  v_tel := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  IF length(v_tel) < 10 THEN RAISE EXCEPTION 'telefone_invalido'; END IF;
  SELECT fid_ativo, fid_meta_pontos, fid_recompensa_valor INTO v_cfg FROM public.crm_settings WHERE id = true;
  IF FOUND THEN v_ativo := coalesce(v_cfg.fid_ativo,true); v_meta := coalesce(v_cfg.fid_meta_pontos,200); v_valor := coalesce(v_cfg.fid_recompensa_valor,20); END IF;
  IF NOT v_ativo THEN RAISE EXCEPTION 'programa_desativado'; END IF;
  IF v_valor <= 0 OR v_valor > 100 OR v_meta <= 0 THEN RAISE EXCEPTION 'config_invalida'; END IF;
  SELECT pontos INTO v_saldo FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF coalesce(v_saldo,0) < v_meta THEN RAISE EXCEPTION 'pontos_insuficientes'; END IF;
  v_codigo := 'FID-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  INSERT INTO public.cupons (codigo, tipo, valor, minimo, ativo, cliente_telefone, validade_fim, max_usos, produtos_ids)
  VALUES (v_codigo, 'valor', v_valor, 0, true, v_tel, now() + interval '30 days', 1, '[]'::jsonb);
  PERFORM set_config('app.pontos_ok','1', true);
  UPDATE public.profiles SET pontos = pontos - v_meta, telefone = CASE WHEN telefone = '' THEN v_tel ELSE telefone END WHERE id = v_uid;
  PERFORM set_config('app.pontos_ok','', true);
  RETURN v_codigo;
END; $$;
REVOKE ALL ON FUNCTION public.resgatar_fidelidade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resgatar_fidelidade(text) TO authenticated;