-- 0064: restringir EXECUTE direto em gerar_msg_apartamento (K5.4).
-- PROBLEMA (auditoria K5.3, confirmado em K5.4): public.gerar_msg_apartamento
-- (0045, RETURNS text, SECURITY DEFINER) devolve detalhes de entrega
-- (apartamento, bloco, torre, andar, interfone, pode_subir) de QUALQUER
-- pedido_id, sem verificar dono, papel ou autenticação — e não há nenhum
-- REVOKE/GRANT sobre ela em 0045 (default: EXECUTE aberto, inclusive anon
-- via PostgREST, onde foi vista exposta na Etapa K0).
-- INVESTIGAÇÃO (greps no repo inteiro): ZERO chamadores em frontend,
-- Edge Functions, triggers, scripts, print-agent ou outras funções SQL
-- (só a definição em 0045 + cópia no PASSO-4 + entrada auto-gerada em
-- types.ts, que não é chamada). As mensagens de condomínio são montadas
-- no app (mensagemPortaria/checkout), sem usar esta RPC.
-- CORREÇÃO (Alternativa A, menor possível): REVOKE total de PUBLIC, anon
-- e authenticated, SEM nenhum GRANT — nem mesmo service_role, pois não há
-- chamador de servidor comprovado (regra: sem permissão preventiva).
-- Triggers seguem intactos (nenhum a chama) e o dono (postgres) conserva o
-- acesso para uso manual via SQL Editor, se um dia necessário.
-- Idempotente. NÃO aplicar sem autorização. Staging + backup antes.

REVOKE ALL ON FUNCTION public.gerar_msg_apartamento(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.gerar_msg_apartamento(uuid) IS
  '0064: EXECUTE direto revogado (sem chamadores legítimos; auditoria K5.4). Uso futuro exigirá auth interna + grant explícito.';
