-- Consulta SOMENTE LEITURA das dependências atômicas de combos/reservas.
-- Destino obrigatório e explícito: --project-ref lflzlcqinarrcgncafol.
-- Nenhum INSERT/UPDATE/DELETE/DDL/GRANT. Sem uso de .env como destino implícito.
BEGIN TRANSACTION READ ONLY;

WITH migracoes AS (
  SELECT version, name
  FROM supabase_migrations.schema_migrations
  WHERE name ILIKE '%combo%'
     OR name ILIKE '%reserva%'
     OR name ILIKE '%consumo%'
     OR name ILIKE '%sabores%'
     OR version IN ('20261126170000', '20261126190000')
  ORDER BY version
),
objetos AS (
  SELECT 'reserva_consumos' AS nome, to_regclass('public.reserva_consumos')::text AS valor
  UNION ALL SELECT 'pedido_item_componentes', to_regclass('public.pedido_item_componentes')::text
  UNION ALL SELECT 'reservar_pedido_atomico(uuid)', to_regprocedure('public.reservar_pedido_atomico(uuid)')::text
  UNION ALL SELECT 'reservar_estoque_atomica(uuid,uuid,integer)', to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)')::text
  UNION ALL SELECT 'cancelar_pedido_atomico(uuid,text)', to_regprocedure('public.cancelar_pedido_atomico(uuid,text)')::text
  UNION ALL SELECT 'criar_pedido_com_reserva(uuid,text,jsonb,jsonb)', to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)')::text
  UNION ALL SELECT 'pedido_cobertura_reserva(uuid)', to_regprocedure('public.pedido_cobertura_reserva(uuid)')::text
  UNION ALL SELECT 'exigir_reserva_producao()', to_regprocedure('public.exigir_reserva_producao()')::text
  UNION ALL SELECT 'exigir_consumo_producao()', to_regprocedure('public.exigir_consumo_producao()')::text
  UNION ALL SELECT 'registrar_consumo_reserva(uuid,integer,uuid,uuid,text)', to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)')::text
  UNION ALL SELECT 'reordenar_sabores_estoque(text[],text)', to_regprocedure('public.reordenar_sabores_estoque(text[],text)')::text
  UNION ALL SELECT 'sabores_estoque', to_regclass('public.sabores_estoque')::text
  UNION ALL SELECT 'sabores_estoque_vinculos', to_regclass('public.sabores_estoque_vinculos')::text
  UNION ALL SELECT 'vw_saldos_sabores_estoque', to_regclass('public.vw_saldos_sabores_estoque')::text
  ORDER BY nome
),
permissoes AS (
  SELECT p.proname AS nome,
         p.oid::regprocedure::text AS assinatura,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'reservar_pedido_atomico', 'reservar_estoque_atomica', 'cancelar_pedido_atomico',
      'criar_pedido_com_reserva', 'pedido_cobertura_reserva',
      'exigir_reserva_producao', 'exigir_consumo_producao',
      'registrar_consumo_reserva', 'reordenar_sabores_estoque'
    )
  ORDER BY p.proname, assinatura
),
acls AS (
  SELECT p.proname AS nome,
         p.oid::regprocedure::text AS assinatura,
         g.grantee::regrole::text AS concedido_a,
         g.privilege_type AS permissao
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) g
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'reservar_pedido_atomico', 'reservar_estoque_atomica', 'cancelar_pedido_atomico',
      'criar_pedido_com_reserva', 'registrar_consumo_reserva', 'reordenar_sabores_estoque'
    )
  UNION ALL
  SELECT p.proname, p.oid::regprocedure::text, 'PUBLIC (padrão)', 'EXECUTE'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proacl IS NULL
    AND p.proname IN (
      'reservar_pedido_atomico', 'reservar_estoque_atomica', 'cancelar_pedido_atomico',
      'criar_pedido_com_reserva', 'registrar_consumo_reserva', 'reordenar_sabores_estoque'
    )
  ORDER BY nome, assinatura, concedido_a
),
contratos AS (
  SELECT p.proname AS nome,
         p.oid::regprocedure::text AS assinatura,
         (p.prosrc ILIKE '%FOR UPDATE%') AS usa_lock_linha,
         (p.prosrc ILIKE '%reservas_estoque%') AS escreve_reserva,
         (p.prosrc ILIKE '%pedido_item_componentes%') AS considera_componentes,
         (p.prosrc ILIKE '%registrar_consumo_reserva%') AS delega_consumo
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'reservar_pedido_atomico', 'reservar_estoque_atomica', 'cancelar_pedido_atomico',
      'criar_pedido_com_reserva', 'registrar_consumo_reserva'
    )
  ORDER BY p.proname, assinatura
)
SELECT jsonb_pretty(jsonb_build_object(
  'migrations', (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM migracoes m),
  'objetos', (SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM objetos o),
  'permissoes', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM permissoes p),
  'acls', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM acls a),
  'contratos', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM contratos c)
)) AS relatorio;

ROLLBACK;
