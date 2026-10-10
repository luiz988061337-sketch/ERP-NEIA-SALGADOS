-- verify-0060.sql — REVOKE de EXECUTE nas funções internas de estoque.
-- Somente leitura. Rode PRE antes de aplicar 0060; POST depois.
-- Não toca em reservar/liberar_estoque_atomica (0030/0031 intactos).

-- PRE e POST: privilégio efetivo por papel (esperado PRE=true, POST=false
-- para anon/authenticated; demais papéis fora do escopo desta migration).
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
    AND p.proname IN (
      'registrar_mov_estoque',     -- 2 overloads (0042: 8 args, 0050: 9 args)
      'reservar_estoque_pedido',
      'liberar_reserva_pedido',
      'calcular_tempo_fritura'
    )
) p
ORDER BY 2, 1;

-- POST adicional: ACL explícita sem PUBLIC/anon/authenticated.
SELECT p.oid::regprocedure AS funcao,
       COALESCE(p.proacl::text, '(default: EXECUTE aberto a PUBLIC)') AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'registrar_mov_estoque', 'reservar_estoque_pedido',
    'liberar_reserva_pedido', 'calcular_tempo_fritura'
  )
ORDER BY 1;

-- Critério: 5 assinaturas × 2 papéis com pode_executar=false no POST.
-- Teste funcional: RPC direta como anon/authenticated deve negar; triggers
-- internos e checkout (0030) continuam. Divergência = interromper.
