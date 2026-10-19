-- 0087: reserva_consumos — ledger de retiradas parciais do freezer (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA.
-- NÃO executar sem autorização expressa. Revisão + staging antes de aplicar.
-- Somente DDL ADITIVA (nova tabela + índices + RLS). NÃO altera nenhuma
-- tabela/coluna/função existente.
--
-- CONTEXTO (Modelo 2 — adotado nas etapas 1.18–1.20):
--   - produtos.estoque = saldo DISPONÍVEL (já líquido de reservas);
--   - a reserva debita o disponível UMA vez (na confirmação do pedido);
--   - a RETIRADA do freezer CONSOME a reserva e NÃO debita novamente o saldo;
--   - cancelamentos devolvem apenas o que ainda está no freezer (não consumido);
--   - físico = disponível + Σ(quantidade − consumido) das reservas ativas.
--
-- PAPEL DESTA TABELA:
--   Registrar cada retirada parcial de forma append-only, com identidade do
--   funcionário e chave idempotente, permitindo:
--     - restante = reservas_estoque.quantidade − Σ(reserva_consumos.quantidade);
--     - status 'consumida' quando o restante chega a zero (feito pela função);
--     - liberação (cancelamento) devolvendo apenas o restante, sem perder
--       o histórico das retiradas já realizadas.
--
-- POR QUE NÃO GERA LINHA EM estoque_movimentacoes:
--   a retirada NÃO altera produtos.estoque (o débito ocorreu na reserva).
--   Registrar em estoque_movimentacoes (quantidade != 0) duplicaria a baixa.
--   O ledger de SALDO continua sendo estoque_movimentacoes (0042);
--   esta tabela é o ledger de CONSUMO FÍSICO.
--
-- ESCRITA: exclusivamente por função autorizada SECURITY DEFINER (etapa 0090).
--   Nenhum INSERT/UPDATE/DELETE é concedido a anon/authenticated.
--
-- IGUALDADE COM O PEDIDO: consultado por reserva e por pedido (índices abaixo).
--
-- DEPENDÊNCIAS CONFIRMADAS LOCALMENTE:
--   0023_base_operacional.sql  -> public.reservas_estoque (id uuid PK)
--   0000_neia_salgados_schema.sql -> public.pedidos (id uuid PK),
--                                    public.produtos (id uuid PK), has_role()
--   0003_operacao.sql          -> papéis atendente/financeiro (app_role)
--   auth.users(id)             -> identidade autenticada (funcionario_id)
--
-- COMPATIBILIDADE: PostgreSQL 17 (gen_random_uuid nativo; IF NOT EXISTS; RLS).
--
-- SEGURANÇA DE REEXECUÇÃO: idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS /
--   REVOKE+GRANT reaplicáveis).
--
-- INTEGRIDADE (PENDÊNCIA — não implementada aqui):
--   A consistência reserva_id ↔ pedido_id ↔ produto_id NÃO é garantida por FK
--   composta nesta migração, pois exigiria UNIQUE(id,pedido_id,produto_id) em
--   public.reservas_estoque (ALTER em tabela EXISTENTE — fora do escopo). Deve
--   ser validada de forma TRANSACIONAL na função SECURITY DEFINER da 0090,
--   conferindo que a reserva pertence ao pedido e ao produto informados.
--
-- IDENTIDADE DO FUNCIONÁRIO:
--   funcionario_id é NOT NULL e usa ON DELETE RESTRICT: todo consumo tem um
--   responsável e o vínculo histórico NÃO é zerado por exclusão de usuário.
--   Dados pessoais permanecem apenas em profiles (sem duplicação). Desligamento
--   de colaborador deve ser feito por papel/perfil, não por exclusão do auth user.
--
-- APPEND-ONLY:
--   Sem políticas/grants de INSERT/UPDATE/DELETE para anon/authenticated; a
--   escrita ocorre apenas por função SECURITY DEFINER (owner). NÃO se adiciona
--   trigger de bloqueio nesta etapa, para não impedir manutenção legítima e
--   autorizada (reavaliar em migração futura, se necessário).
--
-- REVERSÃO:
--   - ANTES de uso (tabela vazia/inerte): DROP TABLE IF EXISTS public.reserva_consumos;
--   - APÓS histórico real: NÃO excluir registros como procedimento padrão;
--     reverter apenas o CÓDIGO dependente (funções/triggers da 0090) e manter a
--     tabela como arquivo histórico; exportar/backup antes de qualquer ação.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_consumos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: protege o histórico — não se apaga uma reserva com consumo.
  reserva_id      uuid NOT NULL REFERENCES public.reservas_estoque(id) ON DELETE RESTRICT,
  -- RESTRICT: preserva o histórico — não se apaga um pedido com consumo.
  pedido_id       uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  -- RESTRICT: preserva o histórico — não se apaga um produto com consumo.
  produto_id      uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  -- Retirada sempre positiva (nunca negativa/zero).
  quantidade      integer NOT NULL CHECK (quantidade > 0),
  -- Identidade confiável: preenchida com auth.uid() pela função DEFINER.
  -- NOT NULL: todo consumo tem um responsável (rastreabilidade).
  -- RESTRICT: preserva o vínculo histórico (não zera ao excluir usuário).
  funcionario_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Idempotência: chave obrigatória e única (o app reenvia a mesma em retries).
  idem_key        uuid NOT NULL UNIQUE,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Índices (consulta por reserva e por pedido; produto para relatórios)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS reserva_consumos_reserva_idx
  ON public.reserva_consumos (reserva_id);
CREATE INDEX IF NOT EXISTS reserva_consumos_pedido_idx
  ON public.reserva_consumos (pedido_id);
CREATE INDEX IF NOT EXISTS reserva_consumos_produto_idx
  ON public.reserva_consumos (produto_id);
-- idem_key já tem índice implícito por UNIQUE.

-- ----------------------------------------------------------------------------
-- 3. RLS (habilita; NENHUMA política de escrita para usuários comuns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.reserva_consumos ENABLE ROW LEVEL SECURITY;

-- Leitura mínima: perfis operacionais (admin, producao, financeiro).
-- Consumo é dado de produção/relatório; não expor a anon nem a cliente.
DROP POLICY IF EXISTS "reserva_consumos leitura staff" ON public.reserva_consumos;
CREATE POLICY "reserva_consumos leitura staff" ON public.reserva_consumos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
  );

-- Sem políticas de INSERT/UPDATE/DELETE => negado por RLS para authenticated.
-- Escrita ocorrerá APENAS via função SECURITY DEFINER (owner), na 0090.

-- ----------------------------------------------------------------------------
-- 4. Grants (mínimos; sem escrita ampla)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.reserva_consumos FROM anon, authenticated;
-- Somente leitura para usuários autenticados (o RLS filtra por perfil).
GRANT SELECT ON public.reserva_consumos TO authenticated;
-- Backend confiável (bypassa RLS) — papel de operação/manutenção, não usuário
-- comum. A escrita de runtime continua exclusiva da função DEFINER da 0090.
GRANT ALL ON public.reserva_consumos TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Documentação
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.reserva_consumos IS
  '0087: ledger append-only de retiradas parciais do freezer (Modelo 2). '
  'NÃO altera produtos.estoque; a baixa ocorre na reserva. Escrita somente '
  'por função SECURITY DEFINER autorizada.';
COMMENT ON COLUMN public.reserva_consumos.idem_key IS
  '0087: chave idempotente única; reenvio com a mesma chave = replay sem duplicar.';
COMMENT ON COLUMN public.reserva_consumos.funcionario_id IS
  '0087: identidade confiável, sempre auth.uid() da função DEFINER (nunca do cliente). '
  'NOT NULL + ON DELETE RESTRICT preservam a rastreabilidade histórica.';
COMMENT ON COLUMN public.reserva_consumos.quantidade IS
  '0087: quantidade retirada (> 0); restante = reservas_estoque.quantidade − Σ consumos.';
