-- verify-0070.sql — RLS do motoboy + aceite atômico + guard.
-- Somente leitura. Rode PRE antes de aplicar 0070; POST depois.

-- PRE: policy antiga com braço motoboy-IS-NULL; sem policy de claim.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'pedidos'
  AND policyname IN ('pedidos update staff', 'pedidos motoboy claim')
ORDER BY 1;

-- (aplicar drizzle/migrations/0070_motoboy_update_rls.sql)

-- POST: staff sem braço IS-NULL + claim com USING/WITH CHECK do aceite.
SELECT policyname, qual AS usando, with_check AS checagem
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'pedidos'
  AND policyname IN ('pedidos update staff', 'pedidos motoboy claim')
ORDER BY 1;

-- POST: guard com ramo do aceite legítimo.
SELECT CASE WHEN prosrc ILIKE '%motoboy_sem_atribuicao%'
            THEN 'OK-0070' ELSE 'DIVERGE' END AS guard
FROM pg_proc
WHERE proname = 'pedidos_guard_update';

-- Critério: 2 policies no POST (USING sem-dono→próprio + WITH CHECK
-- aguardando); guard OK. Testes funcionais: 2 motoboys disputam 1 pedido
-- (só 1 vence); dono atualiza GPS/finaliza; troca de valores negada;
-- SELECT de descoberta intacto. Falha no aceite legítimo = interromper.
