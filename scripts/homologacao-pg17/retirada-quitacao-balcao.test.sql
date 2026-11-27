\set ON_ERROR_STOP on
-- Suíte PostgreSQL local descartável. Nunca executar contra homologação/produção.
DO $$
BEGIN
  IF current_database() <> 'central_retirada_teste' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Somente PostgreSQL local descartável';
  END IF;
END;
$$;
CREATE SCHEMA auth;
CREATE SCHEMA neia_operacao;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- Perfis simulados pelo sufixo do UUID:
--   01 = Admin com capacidade; 02 = atendente sem capacidade;
--   03 = produção; 04 = atendente com capacidade; 05 = Admin sem capacidade.
CREATE FUNCTION public.has_role(usuario uuid, papel text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT right(usuario::text,2) = CASE papel
    WHEN 'admin' THEN '01'
    WHEN 'atendente' THEN '02'
    WHEN 'producao' THEN '03' END
  OR (papel = 'admin' AND right(usuario::text,2) = '05')
  OR (papel = 'atendente' AND right(usuario::text,2) = '04');
$$;
CREATE FUNCTION neia_operacao.tem_capacidade(usuario uuid, capacidade text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT right(usuario::text,2) IN ('01','04') AND capacidade = 'receber_pagamento';
$$;
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY, tipo_entrega text, status text, conferido_em timestamptz, retirado_em timestamptz,
  forma_pagamento text, pagamento_status text, total numeric,
  observacoes text NOT NULL DEFAULT '', pagamento_em timestamptz,
  pagamento_modalidade text, subtotal numeric DEFAULT 0, taxa_entrega numeric DEFAULT 0,
  desconto numeric DEFAULT 0, cupom text, pago_em timestamptz,
  agendado_para timestamptz, agendamento_obs text, user_id uuid
);
CREATE TABLE public.pedido_pagamento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id uuid, tipo text, valor_centavos bigint,
  forma_pagamento text, chave_idempotencia text UNIQUE, actor uuid, created_at timestamptz DEFAULT now()
);
\ir ../../drizzle/migrations/0136_retirada_quitacao_balcao.sql
-- 0139/0140 substituem somente as regras necessárias; 0136 permanece com a
-- trigger de quitação intacta.
\ir ../../drizzle/migrations/0139_recebimento_balcao_atendente.sql
\ir ../../drizzle/migrations/0140_edicao_observacoes_auditada.sql
\ir ../../drizzle/migrations/0141_guard_recebimento_com_capacidade.sql
CREATE TRIGGER trigger_congelar_colunas BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.congelar_colunas_protegidas();

INSERT INTO public.pedidos VALUES
  ('00000000-0000-4000-8000-000000000010','retirada','pronto',now(),NULL,'dinheiro','pendente',100,'',NULL),
  ('00000000-0000-4000-8000-000000000011','retirada','em_producao',NULL,NULL,'dinheiro','pendente',80,'',NULL),
  ('00000000-0000-4000-8000-000000000012','retirada','recebido',NULL,NULL,'pix','pendente',60,'',NULL),
  ('00000000-0000-4000-8000-000000000020','retirada','pronto',now(),NULL,'pix','pago',80,'',now()),
  ('00000000-0000-4000-8000-000000000030','entrega','pronto',now(),NULL,'dinheiro','pendente',75,'',NULL),
  ('00000000-0000-4000-8000-000000000040','retirada','pronto',now(),NULL,'pix','pago',90,'',now());
INSERT INTO public.pedido_pagamento_eventos (pedido_id, tipo, valor_centavos, chave_idempotencia) VALUES
  ('00000000-0000-4000-8000-000000000010','pagamento',2500,'legado:10'),
  ('00000000-0000-4000-8000-000000000020','pagamento',8000,'legado:20');

CREATE FUNCTION pg_temp.ok(condicao boolean, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condicao IS DISTINCT FROM true THEN RAISE EXCEPTION 'Falhou: %', caso; END IF;
  RAISE NOTICE 'OK: %', caso;
END;
$$;

-- ---------------------------------------------------------------------------
-- Consulta: capacidade financeira é a autoridade, Admin não é pré-requisito.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false) IS NOT NULL;
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'saldo_centavos')::int = 7500,
  'saldo parcial vem do ledger');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'pode_receber')::boolean,
  'administrador com capacidade pode registrar recebimento');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false) IS NOT NULL;
SELECT pg_temp.ok(NOT (public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'pode_receber')::boolean,
  'Admin sem capacidade financeira NÃO pode receber');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false) IS NOT NULL;
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'pode_receber')::boolean,
  'atendente com receber_pagamento pode receber mesmo sem Admin');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000011')->>'status') = 'pendente',
  'recebimento é consultado durante a produção');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000012')->>'status') = 'pendente',
  'recebimento não exige conferido_em');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000020')->>'status') = 'quitado',
  'Pix confirmado dispensa novo recebimento');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000040')->>'status') = 'revisao_necessaria',
  'pagamento divergente passa por revisão');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false) IS NOT NULL;
SELECT pg_temp.ok(NOT (public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'pode_receber')::boolean,
  'atendente sem capacidade pode consultar, mas não receber');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false) IS NOT NULL;
SELECT pg_temp.ok(public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'status' = 'nao_autorizado',
  'cozinha não consulta pagamento');
SET ROLE anon;
SELECT pg_temp.ok(NOT has_function_privilege(current_user,'public.consultar_recebimento_retirada(uuid)','EXECUTE'),
  'cliente anônimo sem consulta financeira');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Registro: atendente autorizada, parcial, troco, idempotência e duplicidade.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false) IS NOT NULL;
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 3000, 'sem-capacidade')::jsonb->>'status' = 'nao_autorizado',
  'atendente sem capacidade não registra pagamento');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false) IS NOT NULL;
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 3000, 'admin-sem-capacidade')::jsonb->>'status' = 'nao_autorizado',
  'Admin sem capacidade não registra pagamento');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false) IS NOT NULL;
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 3000, 'parcial:11')::jsonb->>'status' = 'registrado',
  'atendente com capacidade registra recebimento parcial em produção');
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 3000, 'parcial:11')::jsonb->>'status' = 'repetido',
  'mesma chave não duplica recebimento');
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 3000, 'chave-reutilizada')::jsonb->>'status' = 'chave_idempotencia_conflitante',
  'chave reutilizada com outro pedido é recusada');
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 99999, 'acima-saldo')::jsonb->>'status' = 'valor_superior_ao_saldo',
  'valor acima do saldo é recusado');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000011')->>'saldo_centavos')::int = 5000,
  'saldo correto após recebimento parcial');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.pedido_pagamento_eventos WHERE pedido_id='00000000-0000-4000-8000-000000000011'),
  'ledger registra apenas o recebimento parcial válido');
DO $$
BEGIN
  BEGIN
    UPDATE public.pedidos SET total=1 WHERE id='00000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Atendente alterou valor protegido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Coluna protegida%' THEN RAISE; END IF;
    RAISE NOTICE 'OK: capacidade financeira não libera alteração de valores';
  END;
  BEGIN
    UPDATE public.pedidos SET pagamento_status='pago'
      WHERE id='00000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Pagamento marcado sem ledger íntegro';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'pagamento_sem_ledger_integro' THEN RAISE; END IF;
    RAISE NOTICE 'OK: não é possível marcar pago sem ledger quitado';
  END;
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Edição de observações: motivo obrigatório, auditoria e escopo mínimo.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false) IS NOT NULL;
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000011', 'Cliente ligou: deixar na portaria', '   ')::jsonb->>'status' = 'dados_invalidos',
  'motivo vazio bloqueia a edição');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000011', 'Cliente ligou: deixar na portaria', 'Correção informada pelo cliente')::jsonb->>'status' = 'editado',
  'atendente edita observação com motivo');
SELECT pg_temp.ok((SELECT observacoes='Cliente ligou: deixar na portaria' AND total=80 AND pagamento_status='pendente'
  FROM public.pedidos WHERE id='00000000-0000-4000-8000-000000000011'),
  'somente observações mudam; valores e pagamento permanecem');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.pedido_edicoes_auditoria
  WHERE pedido_id='00000000-0000-4000-8000-000000000011' AND campo='observacoes'
    AND valor_anterior='' AND motivo='Correção informada pelo cliente' AND actor=auth.uid()),
  'auditoria registra valor anterior, novo, motivo e autor');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000011', NULL, 'Limpar observação')::jsonb->>'observacoes' = '',
  'observação vazia é gravada como texto vazio (coluna NOT NULL)');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- A quitação continua obrigatória na retirada (0136 permanece intacta).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.pedidos SET status='entregue',retirado_em=now() WHERE id='00000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Retirada com saldo indevida';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'retirada_recebimento_pendente' THEN RAISE; END IF;
    RAISE NOTICE 'OK: retirada com saldo parcial é bloqueada no banco';
  END;
END;
$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false) IS NOT NULL;
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000011', 5000, 'quitar:11')::jsonb->>'status' = 'registrado',
  'atendente quita o saldo restante antes da retirada');
RESET ROLE;
UPDATE public.pedidos SET status='entregue',retirado_em=now() WHERE id='00000000-0000-4000-8000-000000000011';
SELECT pg_temp.ok((SELECT retirado_em IS NOT NULL FROM public.pedidos WHERE id='00000000-0000-4000-8000-000000000011'),
  'retirada é concluída após quitação integral');
UPDATE public.pedidos SET status='entregue',retirado_em=now() WHERE id='00000000-0000-4000-8000-000000000020';
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.pedido_pagamento_eventos WHERE pedido_id='00000000-0000-4000-8000-000000000020'),
  'retirada quitada não cria outro pagamento');
UPDATE public.pedidos SET status='entregue' WHERE id='00000000-0000-4000-8000-000000000030';
SELECT pg_temp.ok((SELECT status='entregue' AND pagamento_status='pendente' FROM public.pedidos WHERE id='00000000-0000-4000-8000-000000000030'),
  'pedido com pagamento na entrega não passa pela regra de balcão');
