-- 0092: reserva_proveniencia — marcador de proveniência confiável (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA / NÃO ATIVADA NO SISTEMA.
-- Não executar sem autorização expressa. Revisão + ambiente isolado antes.
--
-- O QUE É: tabela ADITIVA que registra, por reserva, a PROVA de que o débito no
-- ledger foi feito por um caminho transacional confiável (0088/0089) E de que a
-- reserva nasceu sob controle obrigatório de retirada física. É o MARCADOR de
-- proveniência que a 0090 (futuro) exigirá para liberar/devolver saldo.
--
-- PROBLEMA QUE RESOLVE (Etapa 1.36/1.37):
--   A origem no ledger (1 movimento 'reserva' coerente) prova o DÉBITO, mas NÃO
--   que as unidades permaneçam no freezer. Sem este marcador, a 0090 poderia
--   devolver integralmente uma reserva cujo consumo físico não foi registrado
--   (janela "0089 sem 0091"). O marcador distingue:
--     (a) reserva antiga sem histórico confiável     -> SEM marcador -> NÃO libera
--     (b) nova com débito mas sem garantia de registro-> SEM marcador -> NÃO libera
--     (c) criada sob controle obrigatório de retirada -> COM marcador -> liberável
--     (d) totalmente consumida (status 'consumida')   -> 0090 ignora (sem crédito)
--     (e) parcialmente consumida ('ativa' + marcador) -> libera (quantidade-Σ)
--     (f) não consumida confiável ('ativa' + marcador)-> libera a reserva inteira
--
-- NÃO USA created_at COMO PROVA: a confiança vem da EXISTÊNCIA da linha do
-- marcador (persistente e verificável), inserida SOMENTE na mesma transação que
-- cria a reserva e comprova o débito. Reservas anteriores NUNCA são marcadas
-- automaticamente (sem gatilho de backfill; ver C.5/C.6).
--
-- ============================================================================
-- ESTRUTURA (Etapa B)
-- ============================================================================
--   public.reserva_proveniencia
--     reserva_id             uuid PRIMARY KEY
--     pedido_id              uuid NOT NULL
--     produto_id             uuid NOT NULL  REFERENCES produtos(id)   (RESTRICT)
--     quantidade             integer NOT NULL CHECK (> 0)
--     origem                 text NOT NULL CHECK (IN ('0088','0089'))
--     estoque_movimentacao_id uuid NOT NULL UNIQUE REFERENCES estoque_movimentacoes(id) (RESTRICT)
--     criado_em              timestamptz NOT NULL DEFAULT now()
--     criado_por             uuid REFERENCES auth.users(id) (SET NULL)
--     FK COMPOSTA (reserva_id, pedido_id, produto_id, quantidade)
--       REFERENCES reservas_estoque(id, pedido_id, produto_id, quantidade)
--   - A FK composta GARANTE, por constraint, que o marcador não pode apontar para
--     OUTRO pedido/produto/quantidade da reserva (não só outro id).
--   - UNIQUE(estoque_movimentacao_id): um marcador por movimento de débito
--     (impede reutilizar o mesmo débito em dois marcadores).
--
--   Estrutura de apoio (para permitir a FK composta):
--     ALTER TABLE reservas_estoque ADD CONSTRAINT reservas_estoque_prov_uk
--       UNIQUE (id, pedido_id, produto_id, quantidade);
--     (id já é PK; o índice é aditivo e sempre único. quantidade é imutável após
--      a criação nos fluxos atuais — 0090/0091 não a alteram.)
--
-- ============================================================================
-- CONFIGURAÇÃO DE ATIVAÇÃO (Etapa D) — ESTADO INICIAL: DESATIVADO
-- ============================================================================
--   public.reserva_proveniencia_config (singleton id=true)
--     id boolean PRIMARY KEY DEFAULT true CHECK (id = true)
--     controlado boolean NOT NULL DEFAULT false   <-- DESATIVADO
--     ativado_em timestamptz
--     ativado_por uuid REFERENCES auth.users(id) (SET NULL)
--     observacao text
--   - Inserida com controlado = false. NÃO é ligada por migration.
--   - NÃO há RPC pública para ativar. A ativação futura exige as garantias
--     operacionais da Etapa D e é feita por caminho autorizado (fora desta migração).
--   - 0088/0089 (futuras) só inserirão o marcador quando controlado = true; assim
--     NENHUM marcador existe antes do regime controlado entrar em vigor.
--
-- ============================================================================
-- SEGURANÇA (Etapa C)
-- ============================================================================
--   - RLS HABILITADA nas duas tabelas.
--   - NENHUM INSERT/UPDATE/DELETE cedido a anon/authenticated (só SELECT, filtrado
--     por RLS). Escrita EXCLUSIVA do owner (funções SECURITY DEFINER) e service_role.
--   - SEM gatilhos de backfill; uma simples mudança de status NÃO cria marcador.
--   - Sem funções nesta migração (DDL aditiva). A criação do marcador será feita
--     por 0088/0089 (futuro) com SECURITY DEFINER + SET search_path = public.
--
-- ============================================================================
-- DEPENDÊNCIAS
-- ============================================================================
--   - 0023 reservas_estoque (id, pedido_id, produto_id, quantidade);
--   - 0023/0042 produtos, estoque_movimentacoes(id);
--   - 0000 profiles/auth.users, has_role(); 0003 app_role.
--
-- ============================================================================
-- NÃO FAZER AQUI (escopo)
-- ============================================================================
--   - NÃO cria marcadores para reservas existentes (nem as 19 antigas);
--   - NÃO liga `controlado`;
--   - NÃO cria RPC de ativação;
--   - NÃO altera 0087–0091;
--   - NÃO altera dados de reservas/pedidos/estoque.
--
-- ============================================================================
-- REVERSÃO
-- ============================================================================
--   Função/tabela INERTE (nada as usa ainda). Reverter apenas se vazias:
--     DROP TABLE IF EXISTS public.reserva_proveniencia;
--     DROP TABLE IF EXISTS public.reserva_proveniencia_config;
--     ALTER TABLE public.reservas_estoque DROP CONSTRAINT IF EXISTS reservas_estoque_prov_uk;
--   APÓS uso real: NÃO excluir marcadores como procedimento; reverter apenas o
--   CÓDIGO dependente e manter o histórico.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Base para a FK composta (aditivo; idempotente)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_estoque_prov_uk'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque
      ADD CONSTRAINT reservas_estoque_prov_uk
      UNIQUE (id, pedido_id, produto_id, quantidade);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Marcador de proveniência
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_proveniencia (
  reserva_id              uuid PRIMARY KEY,
  pedido_id               uuid NOT NULL,
  produto_id              uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade              integer NOT NULL CHECK (quantidade > 0),
  origem                  text NOT NULL CHECK (origem IN ('0088', '0089')),
  estoque_movimentacao_id uuid NOT NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  criado_por              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT reserva_proveniencia_mov_uk
    UNIQUE (estoque_movimentacao_id),
  CONSTRAINT reserva_proveniencia_reserva_fk
    FOREIGN KEY (reserva_id, pedido_id, produto_id, quantidade)
    REFERENCES public.reservas_estoque (id, pedido_id, produto_id, quantidade)
    ON DELETE RESTRICT
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_proveniencia_mov_fk'
      AND conrelid = 'public.reserva_proveniencia'::regclass
  ) THEN
    ALTER TABLE public.reserva_proveniencia
      ADD CONSTRAINT reserva_proveniencia_mov_fk
      FOREIGN KEY (estoque_movimentacao_id)
      REFERENCES public.estoque_movimentacoes(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reserva_proveniencia_pedido_idx
  ON public.reserva_proveniencia (pedido_id);
CREATE INDEX IF NOT EXISTS reserva_proveniencia_produto_idx
  ON public.reserva_proveniencia (produto_id);

-- ----------------------------------------------------------------------------
-- 3. Configuração de ativação (singleton, DESATIVADO)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_proveniencia_config (
  id          boolean PRIMARY KEY DEFAULT true,
  controlado  boolean NOT NULL DEFAULT false,
  ativado_em  timestamptz,
  ativado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao  text,
  CONSTRAINT reserva_proveniencia_config_single CHECK (id = true)
);
INSERT INTO public.reserva_proveniencia_config (id, controlado)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. RLS (habilitada; escrita negada a anon/authenticated)
-- ----------------------------------------------------------------------------
ALTER TABLE public.reserva_proveniencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserva_proveniencia leitura staff" ON public.reserva_proveniencia;
CREATE POLICY "reserva_proveniencia leitura staff" ON public.reserva_proveniencia
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
  );

ALTER TABLE public.reserva_proveniencia_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserva_proveniencia_config leitura admin" ON public.reserva_proveniencia_config;
CREATE POLICY "reserva_proveniencia_config leitura admin" ON public.reserva_proveniencia_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 5. Grants (mínimos; SEM escrita para anon/authenticated)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.reserva_proveniencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reserva_proveniencia TO authenticated;   -- RLS filtra por perfil
GRANT ALL ON public.reserva_proveniencia TO service_role;

REVOKE ALL ON public.reserva_proveniencia_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reserva_proveniencia_config TO authenticated;  -- RLS filtra (admin)
GRANT ALL ON public.reserva_proveniencia_config TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Documentação
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.reserva_proveniencia IS
  '0092: marcador de proveniência confiável (Modelo 2). Existência = reserva '
  'criada por caminho transacional confiável (0088/0089) sob controle de retirada. '
  'Ausência = reserva NÃO confiável (antiga ou sem garantia de registro) e NÃO '
  'liberável. Escrita apenas por função SECURITY DEFINER; nenhum backfill.';
COMMENT ON COLUMN public.reserva_proveniencia.estoque_movimentacao_id IS
  '0092: id do movimento de débito (estoque_movimentacoes) que comprova a baixa. '
  'Único por marcador; amarra o marcador ao débito real.';
COMMENT ON COLUMN public.reserva_proveniencia.origem IS
  '0092: caminho técnico que criou a reserva (0088 individual / 0089 por pedido).';
COMMENT ON TABLE public.reserva_proveniencia_config IS
  '0092: configuração de ativação do controle de proveniência. Inicia DESATIVADO '
  '(controlado=false). Não é ligada por migration; exige garantias operacionais.';
COMMENT ON COLUMN public.reserva_proveniencia_config.controlado IS
  '0092: false = 0088/0089 NÃO inserem marcador (sistema conservador; 0090 não '
  'libera). true = regime controlado ativo (só após autorização e comprovação).';
