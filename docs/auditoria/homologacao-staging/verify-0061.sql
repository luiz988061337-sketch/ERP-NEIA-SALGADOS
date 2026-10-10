-- verify-0061.sql — auth dono/staff + idempotência na 0030.
-- Somente leitura. Rode PRE antes de aplicar 0061; POST depois.

-- PRE: corpo atual SEM checagem de dono (documentar o antes).
SELECT proname,
       CASE WHEN prosrc ILIKE '%v_eh_staff%' THEN 'COM-auth' ELSE 'SEM-auth' END AS auth
FROM pg_proc
WHERE proname IN ('reservar_estoque_atomica', 'liberar_reserva_atomica');

-- (aplicar drizzle/migrations/0061_auth_dono_staff.sql)

-- POST: corpo com auth + idempotência + comentários 0061.
SELECT proname,
       CASE WHEN prosrc ILIKE '%v_eh_staff%' THEN 'COM-auth' ELSE 'SEM-auth' END AS auth,
       CASE WHEN prosrc ILIKE '%v_falta%' OR prosrc ILIKE '%status = ''ativa''%'
            THEN 'COM-idempotencia' ELSE 'SEM-idempotencia' END AS idempotencia,
       obj_description(oid) AS comentario
FROM pg_proc
WHERE proname IN ('reservar_estoque_atomica', 'liberar_reserva_atomica');

-- POST: grants 0031 intactos (navegador precisa chamar; proteção é interna).
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('reservar_estoque_atomica', 'liberar_reserva_atomica')
ORDER BY 1, 2;

-- Critério: COM-auth + COM-idempotencia nas 2 funções; grants authenticated
-- presentes. Testes funcionais (JWTs sintéticos por papel): dono reserva;
-- staff admin/producao/atendente opera; anon, alheio, motoboy e financeiro
-- negados; retry não debita 2x; status fora de recebido/em_producao nega.
-- Qualquer negação legítima ou débito duplo = interromper.
