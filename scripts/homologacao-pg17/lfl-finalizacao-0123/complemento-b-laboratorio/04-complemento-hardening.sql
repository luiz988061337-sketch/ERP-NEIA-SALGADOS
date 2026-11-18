-- ============================================================================
-- COMPLEMENTO DE HARDENING DO DELTA INCREMENTAL - ETAPA B-LABORATORIO
-- ============================================================================
-- LABORATORIO SEM DADOS REAIS. Nao aplicar em projeto remoto.
-- Este arquivo NAO substitui 0105-0123: ele roda DEPOIS de 03-capacidades.
--
-- Origem de cada regra (nenhuma regra nova foi inventada):
--   contas_fechamento_guard + contas_fechamento_trg -> drizzle/migrations/0083_hardening.sql:304-325
--   caixa_sessao_aberta_unica                       -> drizzle/migrations/0072_financeiro_caixa_contas.sql
--   rotas_preparando_motoboy_uniq                   -> drizzle/migrations/0084_etapas_operacionais.sql
--   notificacoes_log_idem_idx                       -> drizzle/migrations/0104_notificacoes_whatsapp.sql
--   ACL das RPCs financeiras                        -> convencao de 02-estorno-compativel.sql
--   menor privilegio das tabelas                    -> uso real observado em src/ (ver README)
--
-- NAO INSTALADO AQUI, POR DECISAO REGISTRADA:
--   trigger_exigir_reserva_producao e trigger_exigir_consumo_producao.
--   0095_criar_pedido_com_reserva.sql:1327-1340 declara "INSTALACAO FUTURA ...
--   NAO descomentar nesta etapa": exige reconciliacao dos pedidos historicos e
--   regime controlado=true. O delta mantem apenas as variantes de teste neia_*.
--   Instalar antes do cutover bloqueia pedidos legitimamente em producao.
-- ============================================================================
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
 OR current_user !~ '^restore_[a-f0-9]{12}$'
 OR current_setting('neia_homologacao.ensaio',true) IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
  RAISE EXCEPTION 'Complemento restrito ao laboratorio local isolado.';
 END IF;
END $local$;

-- ============================================================================
-- 1. FECHAMENTO DE COMPETENCIA (0083) - funcao e trigger ausentes do delta
-- ============================================================================
-- Sem este gatilho, lancamento em mes ja fechado continua permitido: a guarda
-- de fechamento existe no codigo historico e nao foi reproduzida no delta.
CREATE OR REPLACE FUNCTION public.contas_fechamento_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_comp text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_comp := COALESCE(to_char(OLD.vencimento, 'YYYY-MM'), to_char(OLD.created_at, 'YYYY-MM'));
  ELSE
    v_comp := COALESCE(to_char(NEW.vencimento, 'YYYY-MM'), to_char(NEW.created_at, 'YYYY-MM'));
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos_mensais WHERE competencia = v_comp AND status = 'fechado') THEN
    RAISE EXCEPTION 'mes_fechado:%', v_comp USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

COMMENT ON FUNCTION public.contas_fechamento_guard() IS
'0083: bloqueia INSERT/UPDATE/DELETE em contas de competencia fechada. Reposto no complemento B.';

REVOKE ALL ON FUNCTION public.contas_fechamento_guard() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS contas_fechamento_trg ON public.contas;
CREATE TRIGGER contas_fechamento_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.contas
  FOR EACH ROW
  EXECUTE FUNCTION public.contas_fechamento_guard();

-- ============================================================================
-- 2. INDICES UNICOS QUE A BASE ADITIVA NAO RECRIA
-- ============================================================================
-- Pre-checagens com mensagem util: se houver duplicidade, o operador recebe o
-- id conflitante em vez de um erro generico de indice unico. A duplicidade NAO
-- e corrigida automaticamente: exige decisao do proprietario.

DO $chk$ DECLARE v_ids text; BEGIN
  SELECT string_agg(id::text, ',' ORDER BY id) INTO v_ids
    FROM public.caixa_sessoes WHERE status = 'aberta';
  IF (SELECT count(*) FROM public.caixa_sessoes WHERE status = 'aberta') > 1 THEN
    RAISE EXCEPTION 'caixa_aberto_duplicado:%', v_ids
      USING HINT = '0072 exige no maximo uma sessao aberta. Decidir qual encerrar.';
  END IF;
END $chk$;

DO $chk$ DECLARE v_ids text; BEGIN
  SELECT string_agg(motoboy_id::text, ',' ORDER BY motoboy_id) INTO v_ids FROM (
    SELECT motoboy_id FROM public.rotas_entrega
     WHERE status = 'preparando' AND motoboy_id IS NOT NULL
     GROUP BY motoboy_id HAVING count(*) > 1) d;
  IF v_ids IS NOT NULL THEN
    RAISE EXCEPTION 'rota_preparando_duplicada:%', v_ids
      USING HINT = '0084 admite uma rota preparando por motoboy. Decidir qual cancelar.';
  END IF;
END $chk$;

DO $chk$ DECLARE v_ids text; BEGIN
  SELECT string_agg(idempotencia, ',' ORDER BY idempotencia) INTO v_ids FROM (
    SELECT idempotencia FROM public.notificacoes_log
     GROUP BY idempotencia HAVING count(*) > 1) d;
  IF v_ids IS NOT NULL THEN
    RAISE EXCEPTION 'notificacao_idempotencia_duplicada:%', v_ids
      USING HINT = '0104 exige idempotencia unica. Decidir a trilha correta antes de indexar.';
  END IF;
END $chk$;

CREATE UNIQUE INDEX IF NOT EXISTS caixa_sessao_aberta_unica
  ON public.caixa_sessoes (status) WHERE status = 'aberta';

CREATE UNIQUE INDEX IF NOT EXISTS rotas_preparando_motoboy_uniq
  ON public.rotas_entrega (motoboy_id) WHERE status = 'preparando' AND motoboy_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_log_idem_idx
  ON public.notificacoes_log (idempotencia);

-- ============================================================================
-- 3. ACL DAS RPCs FINANCEIRAS (11 public + 1 funcao de trigger)
-- ============================================================================
-- Todas nascem com EXECUTE para PUBLIC pelo DEFAULT ACL do schema public.
-- Todas tem guarda interna por neia_operacao.tem_capacidade, mas a ausencia de
-- REVOKE e' inconsistente com o resto do projeto: fecha-se explicitamente.
-- Padrao adotado: 02-estorno-compativel.sql (revoga PUBLIC/anon/service_role,
-- concede apenas authenticated).

REVOKE ALL ON FUNCTION public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text) TO authenticated;

REVOKE ALL ON FUNCTION public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_pagamento_conta(uuid,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_conta(uuid,bigint,text) TO authenticated;

REVOKE ALL ON FUNCTION public.estornar_pagamento_conta(uuid,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_conta(uuid,bigint,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancelar_conta_financeira(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_conta_financeira(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.conciliar_extrato_atomico(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.conciliar_extrato_atomico(uuid,text,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_movimento_caixa(text,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_movimento_caixa(text,bigint,text) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido(uuid,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_pedido(uuid,bigint,text) TO authenticated;

REVOKE ALL ON FUNCTION public.estornar_pagamento_pedido(uuid,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_pedido(uuid,bigint,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.estornar_conta(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.estornar_conta(uuid,text) TO authenticated;

-- Funcao de trigger: nao e' RPC, nao pode ser executada por ninguem.
REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido_status_ledger() FROM PUBLIC,anon,authenticated,service_role;

-- ============================================================================
-- 4. MENOR PRIVILEGIO NAS TABELAS NOVAS
-- ============================================================================
-- 4.1 DELETE: nenhuma das 15 tabelas abaixo tem .delete() no app (src/).
--     Revogar nao quebra nenhum fluxo atual e fecha exclusao silenciosa de
--     lancamento financeiro por chamada direta ao PostgREST.
REVOKE DELETE ON TABLE public."contas" FROM authenticated;
REVOKE DELETE ON TABLE public."caixa_sessoes" FROM authenticated;
REVOKE DELETE ON TABLE public."contas_bancarias" FROM authenticated;
REVOKE DELETE ON TABLE public."centros_custo" FROM authenticated;
REVOKE DELETE ON TABLE public."plano_contas" FROM authenticated;
REVOKE DELETE ON TABLE public."extratos" FROM authenticated;
REVOKE DELETE ON TABLE public."fechamentos_mensais" FROM authenticated;
REVOKE DELETE ON TABLE public."precificacao_config" FROM authenticated;
REVOKE DELETE ON TABLE public."preco_historico" FROM authenticated;
REVOKE DELETE ON TABLE public."acertos_motoboy" FROM authenticated;
REVOKE DELETE ON TABLE public."funcionarios" FROM authenticated;
REVOKE DELETE ON TABLE public."escalas" FROM authenticated;
REVOKE DELETE ON TABLE public."pontos" FROM authenticated;
REVOKE DELETE ON TABLE public."vales" FROM authenticated;
REVOKE DELETE ON TABLE public."config_entrega" FROM authenticated;

-- 4.2 Plano de contas e centros de custo: zero referencia em src/.
--     Escrita somente por RPC/administracao futura; leitura permanece.
REVOKE INSERT,UPDATE ON TABLE public."plano_contas" FROM authenticated;
REVOKE INSERT,UPDATE ON TABLE public."centros_custo" FROM authenticated;

COMMIT;
