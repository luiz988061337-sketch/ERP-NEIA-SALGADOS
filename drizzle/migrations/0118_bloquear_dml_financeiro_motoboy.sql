-- 0118: fecha atalhos de escrita direta nas tabelas de acerto e turno.
-- Os registros devem ser criados por RPCs SECURITY DEFINER com validação de papel.
-- O pagamento do turno fica bloqueado até existir fluxo de confirmação pelo Financeiro.

DROP POLICY IF EXISTS "acertos rota inserir motoboy" ON public.acertos_rota;
REVOKE INSERT ON public.acertos_rota FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "acertos eventos inserir" ON public.acertos_rota_eventos;
REVOKE INSERT ON public.acertos_rota_eventos FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "turnos inserir motoboy" ON public.turnos_motoboy;
REVOKE INSERT ON public.turnos_motoboy FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "turnos eventos inserir" ON public.turnos_motoboy_eventos;
REVOKE INSERT ON public.turnos_motoboy_eventos FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.pagar_fechamento_turno(uuid, bigint, text, text, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pagar_fechamento_turno(uuid, bigint, text, text, text)
  IS '0118: execução bloqueada para authenticated; pagamento deve receber RPC/painel de confirmação por Financeiro.';

-- Impede classificar um turno como véspera de Natal em outra data (ou
-- classificar 24/12 como turno normal). NOT VALID preserva dados legados,
-- mas aplica a regra a novas gravações e atualizações.
DO $$
BEGIN
  ALTER TABLE public.turnos_motoboy
    ADD CONSTRAINT turnos_motoboy_tipo_data_chk
    CHECK ((tipo = 'vespera_natal') =
      (EXTRACT(MONTH FROM data_turno) = 12 AND EXTRACT(DAY FROM data_turno) = 24))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
