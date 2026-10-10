-- verify-0059.sql — prazos comerciais em loja_config (40-60 / 60-90).
-- Somente leitura. Rode PRE antes de aplicar 0059; POST depois.

-- PRE: colunas devem estar ausentes (0 linhas).
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'loja_config'
  AND column_name IN (
    'retirada_prazo_min', 'retirada_prazo_max',
    'entrega_prazo_min', 'entrega_prazo_max'
  )
ORDER BY 1;

-- (aplicar drizzle/migrations/0059_prazos_atendimento.sql)

-- POST: 4 colunas com defaults 40/60/60/90.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'loja_config'
  AND column_name IN (
    'retirada_prazo_min', 'retirada_prazo_max',
    'entrega_prazo_min', 'entrega_prazo_max'
  )
ORDER BY 1;

-- POST: 2 CHECKs presentes.
SELECT conname
FROM pg_constraint
WHERE conname IN ('loja_prazos_positivos_check', 'loja_prazos_ordem_check')
ORDER BY 1;

-- Critério: PRE 0 linhas; POST 4 colunas + 2 constraints.
-- Teste funcional (dados sintéticos): UPDATE com 0 ou min>max deve falhar;
-- UPDATE válido só com papel admin (RLS 0021). Divergência = interromper.
