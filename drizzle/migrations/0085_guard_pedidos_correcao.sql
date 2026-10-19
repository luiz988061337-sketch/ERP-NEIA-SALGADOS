-- 0085: guard de pedidos corrigido (E10.0.1, PREPARADA, NÃO APLICADA).
--
-- STATUS: PREPARADA, NÃO APLICADA. Não rodar sem autorização expressa.
-- Rode em staging APÓS 0084 (independente, mas mesma janela), com backup.
-- NÃO presume qual guard vive no remoto (0070 estrito × 0074 com bug);
-- CREATE OR REPLACE unifica ambos numa definição correta. Verificar antes
-- com: SELECT pg_get_functiondef('public.pedidos_guard_update()'::regprocedure);
--
-- Corrige (E9.1/E10.0):
--   - 0074:35-38 invertido (IS NOT DISTINCT congelava TODO update de motoboy);
--   - preserva bypass service_role (Pix/jobs) de 0074:16-18;
--   - preserva allowlist estrita de 0070 (dono + aceite + ~50 colunas);
--   - preserva cliente só-cancela e admin/producao/atendente/financeiro full.
-- Compatível com 0084 (trigger_congelar_colunas coexiste; matriz 0041 intacta).

CREATE OR REPLACE FUNCTION public.pedidos_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Servidor (API Pix, jobs, backfill): trusted, como em 0074.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Papéis internos amplos: escrita total (0084 congela o financeiro à parte).
  IF public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro') THEN
    RETURN NEW;
  END IF;

  -- Motoboy: não toca valores/identidade (0070, com IS DISTINCT corrigido).
  IF public.has_role(auth.uid(), 'motoboy') THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
      OR NEW.desconto IS DISTINCT FROM OLD.desconto
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.cupom IS DISTINCT FROM OLD.cupom
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.numero IS DISTINCT FROM OLD.numero
      OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome
      OR NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      RAISE EXCEPTION 'motoboy_nao_pode_alterar_valores';
    END IF;

    -- Aceite legítimo: NULL -> próprio uid (não rouba de outro motoboy).
    IF NEW.motoboy_id IS DISTINCT FROM OLD.motoboy_id THEN
      IF OLD.motoboy_id IS NOT NULL THEN
        RAISE EXCEPTION 'motoboy_nao_pode_roubar_pedido';
      END IF;
      IF NEW.motoboy_id IS NOT DISTINCT FROM auth.uid() THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'motoboy_nao_pode_definir_outro_motoboy';
    END IF;

    -- Dono do pedido: demais campos operacionais liberados.
    IF OLD.motoboy_id IS NOT DISTINCT FROM auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'motoboy_sem_atribuicao';
  END IF;

  -- Cliente: só cancela o próprio pedido recebido.
  IF OLD.user_id = auth.uid() AND OLD.status = 'recebido' AND NEW.status = 'cancelado'
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.numero IS NOT DISTINCT FROM OLD.numero THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'operacao_nao_permitida';
END $$;

COMMENT ON FUNCTION public.pedidos_guard_update() IS 'E10.0.1: 0070 estrito + bypass service_role. Corrige IS NOT DISTINCT de 0074:35-38.';
