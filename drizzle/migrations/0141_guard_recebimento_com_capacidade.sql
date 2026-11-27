-- 0141 — exceção estrita ao congelamento financeiro para recebimento no balcão.
--
-- A 0084 congela pagamento_status/pagamento_em para todos exceto service_role,
-- admin e financeiro. Isso impedia a atendente com `receber_pagamento` de
-- concluir o registro feito pela RPC 0139, mesmo com o ledger já gravado.
--
-- Esta migration NÃO afrouxa o guard para escrita direta: a exceção exige
--   (a) capacidade financeira explícita;
--   (b) nenhuma outra coluna congelada alterada;
--   (c) transição apenas para 'pendente' ou 'pago';
--   (d) para 'pago', ledger já quitado integralmente no momento do UPDATE.
-- O bloqueio da 0094 (pago -> pendente/falhou) e a quitação da retirada (0136)
-- permanecem intactos. Reversão: restaurar o corpo exato de 0084.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.congelar_colunas_protegidas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pago bigint;
  v_total bigint;
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'financeiro') THEN
    RETURN NEW;
  END IF;

  -- Exceção estrita: somente o fechamento do recebimento já registrado no
  -- ledger pela RPC de pagamento. Nenhum outro campo financeiro é liberado.
  IF neia_operacao.tem_capacidade(v_uid, 'receber_pagamento')
     AND (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status
          OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em) THEN
    IF NEW.pagamento_modalidade IS DISTINCT FROM OLD.pagamento_modalidade
       OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
       OR NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.cupom IS DISTINCT FROM OLD.cupom
       OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
       OR NEW.agendado_para IS DISTINCT FROM OLD.agendado_para
       OR NEW.agendamento_obs IS DISTINCT FROM OLD.agendamento_obs
       OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
    END IF;
    IF NEW.pagamento_status NOT IN ('pendente', 'pago') THEN
      RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
    END IF;
    IF NEW.pagamento_status = 'pago' THEN
      v_total := round(NEW.total * 100)::bigint;
      SELECT coalesce(sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END), 0)
        INTO v_pago FROM public.pedido_pagamento_eventos WHERE pedido_id = NEW.id;
      IF v_total <= 0 OR v_pago <> v_total THEN
        RAISE EXCEPTION 'pagamento_sem_ledger_integro';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Corpo integral da 0084, inalterado para todos os demais casos.
  IF (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status
    OR NEW.pagamento_modalidade IS DISTINCT FROM OLD.pagamento_modalidade
    OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
    OR NEW.desconto IS DISTINCT FROM OLD.desconto
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.cupom IS DISTINCT FROM OLD.cupom
    OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
    OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em
    OR NEW.agendado_para IS DISTINCT FROM OLD.agendado_para
    OR NEW.agendamento_obs IS DISTINCT FROM OLD.agendamento_obs
    OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
    OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.congelar_colunas_protegidas() IS
  'E9.1 + 0141: congela financeiro/promessa/identidade; operador com receber_pagamento pode fechar pagamento já presente no ledger.';

COMMIT;
