-- verify-0071.sql — REVOKE de EXECUTE em gerar_msg_apartamento.
-- Somente leitura. Rode PRE antes de aplicar 0071; POST depois.

-- PRE e POST: privilégio efetivo (esperado PRE=true, POST=false
-- para anon/authenticated).
SELECT r.rolname AS papel,
       p.oid::regprocedure AS funcao,
       has_function_privilege(r.oid, p.oid, 'EXECUTE') AS pode_executar
FROM (SELECT oid, rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')) r
CROSS JOIN (
  SELECT p.oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'gerar_msg_apartamento'
) p
ORDER BY 2, 1;

-- Critério: POST com pode_executar=false. A função não tem chamadores
-- (app usa mensagem local); dono mantém uso manual via SQL Editor.
-- Chamador legítimo negado = interromper e reverter com GRANT explícito.
