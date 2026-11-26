-- Consulta SOMENTE LEITURA para a etapa de vínculos operacionais.
-- Destino obrigatório e explícito: --project-ref lflzlcqinarrcgncafol.
-- Nenhum INSERT/UPDATE/DELETE/DDL/GRANT. Sem uso de .env como destino implícito.
-- Um único SELECT final para que o CLI devolva o resultado completo.
BEGIN TRANSACTION READ ONLY;

WITH migracoes AS (
  SELECT version, name
  FROM supabase_migrations.schema_migrations
  WHERE name ILIKE '%reserva_consumo%'
     OR name ILIKE '%registrar_consumo_reserva%'
     OR name ILIKE '%organizar_sabores%'
     OR version IN ('20261126170000', '20261126190000')
  ORDER BY version
),
objetos AS (
  SELECT 'reserva_consumos' AS nome, to_regclass('public.reserva_consumos')::text AS valor
  UNION ALL SELECT 'registrar_consumo_reserva', to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)')::text
  UNION ALL SELECT 'reordenar_sabores_estoque', to_regprocedure('public.reordenar_sabores_estoque(text[],text)')::text
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
    AND p.proname IN ('registrar_consumo_reserva', 'reordenar_sabores_estoque')
  ORDER BY p.proname, assinatura
),
sabores AS (
  SELECT chave, ordem, categoria, nome, produto_id::text AS produto_id
  FROM public.sabores_estoque
  ORDER BY ordem
),
produtos AS (
  SELECT p.id::text AS id,
         p.nome,
         coalesce(c.slug, '') AS categoria,
         coalesce(p.tipo_venda, '') AS tipo_venda,
         coalesce(p.unidade_medida, '') AS unidade_medida,
         coalesce(p.estoque, 0) AS saldo_legado,
         coalesce(p.disponivel, false) AS disponivel
  FROM public.produtos p
  LEFT JOIN public.categorias c ON c.id = p.categoria_id
  ORDER BY c.slug, p.nome
),
contagens AS (
  SELECT 'produtos' AS nome, count(*)::integer AS total FROM public.produtos
  UNION ALL SELECT 'sabores_estoque', count(*)::integer FROM public.sabores_estoque
  UNION ALL SELECT 'lotes', count(*)::integer FROM public.lotes
  UNION ALL SELECT 'reservas_estoque', count(*)::integer FROM public.reservas_estoque
  UNION ALL SELECT 'estoque_movimentacoes', count(*)::integer FROM public.estoque_movimentacoes
  ORDER BY nome
)
SELECT jsonb_pretty(jsonb_build_object(
  'migrations', (SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM migracoes m),
  'objetos', (SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM objetos o),
  'permissoes', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM permissoes p),
  'sabores', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM sabores s),
  'produtos', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM produtos p),
  'contagens', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM contagens c)
)) AS relatorio;

ROLLBACK;
