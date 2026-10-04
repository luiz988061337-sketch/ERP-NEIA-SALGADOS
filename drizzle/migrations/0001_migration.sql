ALTER FUNCTION public.liberar_reserva_atomica(uuid) SET search_path = '';
ALTER FUNCTION public.reservar_estoque_atomica(uuid,uuid,integer) SET search_path = '';

DROP POLICY IF EXISTS "lotes public read" ON public.lotes;

DROP POLICY IF EXISTS "parceiros read" ON public.parceiros;
CREATE POLICY "parceiros admin read" ON public.parceiros
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.parceiros_publicos AS
  SELECT id, nome, categoria, cidade, bairro, instagram, site, descricao, logo_url
  FROM public.parceiros
  WHERE status = 'aprovado' AND autoriza_divulgacao;
GRANT SELECT ON public.parceiros_publicos TO anon, authenticated;