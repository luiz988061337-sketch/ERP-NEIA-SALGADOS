-- E10.1-B0 — Verificação definitiva (SOMENTE LEITURA), em BLOCOS.
-- O SQL Editor exibe só o último Results e oculta NOTICEs: rode UM BLOCO
-- por vez (colar → Run → copiar resultado). Sem INSERT/UPDATE/DELETE/DDL.
-- Sem nomes, telefones, endereços, chaves ou dados pessoais.

-- ================= BLOCO 1 — contagens (tabelas confirmadas) =================
SELECT
  (SELECT count(*) FROM public.pedidos) AS pedidos,
  (SELECT count(*) FROM public.pedido_itens) AS pedido_itens,
  (SELECT count(*) FROM public.profiles) AS profiles,
  (SELECT count(*) FROM public.user_roles) AS user_roles,
  (SELECT count(*) FROM public.motoboys) AS motoboys,
  (SELECT count(*) FROM public.rotas_entrega) AS rotas_entrega,
  (SELECT count(*) FROM public.fila_impressao) AS fila_impressao,
  (SELECT count(*) FROM public.entrega_atrasos) AS entrega_atrasos,
  (SELECT count(*) FROM public.motoboy_historico) AS motoboy_historico,
  (SELECT count(*) FROM public.pedido_status_historico) AS pedido_status_historico,
  (SELECT count(*) FROM public.pix_notification_events) AS pix_notification_events;

-- ================= BLOCO 2 — rota_pedidos (se der erro "relation does not
-- ================= existe", reporte AUSENTE e pule o último SELECT) =========
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'rota_pedidos'
  ORDER BY ordinal_position;

SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
  WHERE conrelid = 'public.rota_pedidos'::regclass;

SELECT relrowsecurity AS rls_ativa
  FROM pg_class
  JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE pg_namespace.nspname = 'public' AND pg_class.relname = 'rota_pedidos';

SELECT policyname, cmd, roles
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'rota_pedidos';

SELECT count(*) AS rota_pedidos FROM public.rota_pedidos;

-- ================= BLOCO 3A — guard existe? =================
SELECT proname AS guard_instalado
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'pedidos_guard_update';

-- ================= BLOCO 3B — qual guard? (só se 3A retornou linha) =========
-- tem_bug_0074=true → 0074 (trava tudo do motoboy). tem_allowlist_0070=true
-- → 0070 correto sem bypass. service_role indica bypass do servidor.
SELECT
  length(pg_get_functiondef('public.pedidos_guard_update()'::regprocedure)) AS tam,
  pg_get_functiondef('public.pedidos_guard_update()'::regprocedure) LIKE '%service_role%' AS tem_service_role,
  pg_get_functiondef('public.pedidos_guard_update()'::regprocedure) LIKE '%motoboy_nao_pode_alterar_valores%' AS tem_bug_0074,
  pg_get_functiondef('public.pedidos_guard_update()'::regprocedure) LIKE '%motoboy_sem_atribuicao%' AS tem_allowlist_0070;

-- ================= BLOCO 4 — dependências 0084/0085 =================
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pedidos') AS t_pedidos,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='motoboys') AS t_motoboys,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rotas_entrega') AS t_rotas_entrega,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fila_impressao') AS t_fila,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pedido_status_historico') AS t_hist,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pedido_itens') AS t_itens,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='has_role') AS f_has_role,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='motoboys' AND column_name='user_id') AS c_motoboys_user_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fila_impressao' AND column_name='trabalho_uuid') AS c_fila_uuid,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fila_impressao' AND column_name='imprimir_apos') AS c_fila_apos;

SELECT
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos' AND column_name IN
    ('aceito_em_atendente','liberado_em','conferido_em','retirado_em','reserva_motoboy_em','aceito_motoboy_em','aceito_motoboy_por')) AS ausencia_0084_ok,
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN
    ('aceitar_pedido_atendente','liberar_pedido_cozinha','conferir_pedido_cozinha','atribuir_pedido_motoboy','aceitar_entrega_motoboy','retirar_pedido_cliente','enfileirar_evento_cozinha','solicitar_reimpressao','adiar_cupom_agendado','impedir_parada_duplicada','congelar_colunas_protegidas','exigir_conferencia_para_pronto')) AS ausencia_rpcs_ok;

-- ================= BLOCO 5 — duplicatas (só contagens) =================
SELECT count(*) AS pedidos_multi_rota FROM (
  SELECT rp.pedido_id
    FROM public.rota_pedidos rp
    JOIN public.rotas_entrega r ON r.id = rp.rota_id
    WHERE r.status IN ('preparando', 'em_rota')
    GROUP BY rp.pedido_id HAVING count(*) > 1) d;

SELECT count(*) AS motoboys_multi_preparando FROM (
  SELECT motoboy_id
    FROM public.rotas_entrega
    WHERE status = 'preparando' AND motoboy_id IS NOT NULL
    GROUP BY motoboy_id HAVING count(*) > 1) d;

SELECT count(*) AS rotas_sem_motoboy FROM public.rotas_entrega WHERE motoboy_id IS NULL;

SELECT count(*) AS motoboys_sem_vinculo FROM public.motoboys WHERE user_id IS NULL;
