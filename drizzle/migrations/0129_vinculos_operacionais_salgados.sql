-- 0129 — Estoque Operacional do Estoque de Salgados (versão revista em 27/11/2026).
-- Preparada localmente. NÃO aplicar sem autorização expressa.
-- Destino permitido, quando autorizado: homologação lflzlcqinarrcgncafol.
--
-- Decisões incorporadas:
--   * os 26 sabores oficiais são a identidade canônica (sabores_estoque.chave);
--   * os 31 cadastros comerciais antigos NÃO são cardápio oficial e não são
--     vínculos automáticos; nenhum saldo comercial antigo vira estoque físico;
--   * um único estoque físico por sabor, com lotes, FEFO e unidades físicas;
--   * margem de segurança inicial de 100 unidades, configurável por sabor;
--   * conferência, liberação excepcional, solicitações e notificações usam
--     estruturas existentes e uma view de eventos, sem segundo motor de alertas;
--   * agendamentos podem virar compromissos futuros, nunca estoque fictício;
--   * falha técnica, dado não inventariado e margem atingida NÃO significam
--     falta de estoque: o modo padrão é monitoramento, sem alterar vendas.
--
-- Nada aqui altera preço, custo, regras comerciais aprovadas, cardápio público,
-- menu lateral ou layout aprovado. Produção permanece fora de escopo.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Papel operacional de Caixa/PDV e helpers de autorização
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'caixa'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'caixa';
  END IF;
END $$;

-- PL/pgSQL (não SQL): o papel `caixa` é criado nesta mesma transação e só pode
-- ser resolvido em tempo de execução, após o COMMIT.
CREATE OR REPLACE FUNCTION public.salgados_pode_consultar()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role)
      OR public.has_role(auth.uid(), 'atendente'::public.app_role)
      OR public.has_role(auth.uid(), 'caixa'::public.app_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.salgados_eh_responsavel()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- "Responsável autorizado" usa os papéis já aprovados até decisão específica
  -- sobre um papel separado. Motoboy e cliente ficam de fora.
  RETURN public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'producao'::public.app_role);
END;
$$;

REVOKE ALL ON FUNCTION public.salgados_pode_consultar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salgados_pode_consultar() TO authenticated;
REVOKE ALL ON FUNCTION public.salgados_eh_responsavel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salgados_eh_responsavel() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Vínculos comerciais opcionais — vazios por decisão do proprietário
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sabores_estoque_vinculos (
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('unitario', 'embalagem')),
  fator_unidades integer NOT NULL CHECK (fator_unidades > 0 AND fator_unidades <= 100000),
  ativo boolean NOT NULL DEFAULT true,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  observacao text,
  PRIMARY KEY (chave, produto_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sabores_vinculos_produto_ativo_idx
  ON public.sabores_estoque_vinculos (produto_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS sabores_vinculos_chave_ativo_idx
  ON public.sabores_estoque_vinculos (chave) WHERE ativo;
ALTER TABLE public.sabores_estoque_vinculos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sabores_estoque_vinculos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sabores_estoque_vinculos TO authenticated;
DROP POLICY IF EXISTS sabores_vinculos_leitura_equipe ON public.sabores_estoque_vinculos;
CREATE POLICY sabores_vinculos_leitura_equipe ON public.sabores_estoque_vinculos
  FOR SELECT TO authenticated USING (public.salgados_pode_consultar());
COMMENT ON TABLE public.sabores_estoque_vinculos IS
  $$Vínculos comerciais opcionais e conferidos. Nenhum vínculo é criado automaticamente: os cadastros antigos não representam o cardápio oficial. Não contém preço, custo, saldo, lote ou quantidade física.$$;

-- A foto canônica do sabor passa a poder ser guardada no próprio sabor, sem
-- exigir vínculo comercial. O valor existente em produto é apenas fallback de leitura.
ALTER TABLE public.sabores_estoque ADD COLUMN IF NOT EXISTS imagem_url text;

-- -----------------------------------------------------------------------------
-- 3. Identidade por sabor nas tabelas operacionais existentes
-- -----------------------------------------------------------------------------
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.lotes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lotes_identidade_sabor_ou_produto'
      AND conrelid = 'public.lotes'::regclass
  ) THEN
    ALTER TABLE public.lotes ADD CONSTRAINT lotes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS lotes_sabor_validade_idx ON public.lotes (sabor_chave, validade);

ALTER TABLE public.reservas_estoque ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.reservas_estoque ALTER COLUMN produto_id DROP NOT NULL;
ALTER TABLE public.reservas_estoque ADD COLUMN IF NOT EXISTS chave_idempotencia uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_identidade_sabor_ou_produto'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque ADD CONSTRAINT reservas_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_chave_idempotencia_unica'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque ADD CONSTRAINT reservas_chave_idempotencia_unica
      UNIQUE (chave_idempotencia);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reservas_sabor_idx ON public.reservas_estoque (sabor_chave, status);

ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_movimentacoes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentacoes_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_movimentacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS est_mov_sabor_idx ON public.estoque_movimentacoes (sabor_chave, created_at DESC);

ALTER TABLE public.reserva_consumos ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.reserva_consumos ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_consumos_identidade_sabor_ou_produto'
      AND conrelid = 'public.reserva_consumos'::regclass
  ) THEN
    ALTER TABLE public.reserva_consumos ADD CONSTRAINT reserva_consumos_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reserva_consumos_sabor_idx ON public.reserva_consumos (sabor_chave);

ALTER TABLE public.estoque_mov ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_mov ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_mov'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov ADD CONSTRAINT estoque_mov_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS estoque_mov_sabor_idx ON public.estoque_mov (sabor_chave, created_at DESC);

ALTER TABLE public.estoque_mov_operacoes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_mov_operacoes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_operacoes_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_mov_operacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov_operacoes ADD CONSTRAINT estoque_mov_operacoes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
-- A 0107 exigia quantidade > 0 para operações de produto. Ajuste por sabor pode
-- ter como alvo o saldo zero; a restrição é mantida integralmente para produto.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.estoque_mov_operacoes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%quantidade > 0%'
  LOOP
    EXECUTE format('ALTER TABLE public.estoque_mov_operacoes DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_operacoes_quantidade_sabor'
      AND conrelid = 'public.estoque_mov_operacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov_operacoes ADD CONSTRAINT estoque_mov_operacoes_quantidade_sabor
      CHECK (quantidade > 0 OR (sabor_chave IS NOT NULL AND quantidade = 0));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Configuração operacional por sabor e modo de ativação gradual
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sabores_estoque_config (
  chave text PRIMARY KEY REFERENCES public.sabores_estoque(chave) ON DELETE CASCADE,
  margem_seguranca integer NOT NULL DEFAULT 100
    CHECK (margem_seguranca >= 0 AND margem_seguranca <= 2147483647),
  estoque_minimo integer NOT NULL DEFAULT 0
    CHECK (estoque_minimo >= 0 AND estoque_minimo <= 2147483647),
  inventariado boolean NOT NULL DEFAULT false,
  imagem_url text,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sabores_estoque_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sabores_estoque_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sabores_estoque_config TO authenticated;
DROP POLICY IF EXISTS sabores_config_leitura_equipe ON public.sabores_estoque_config;
CREATE POLICY sabores_config_leitura_equipe ON public.sabores_estoque_config
  FOR SELECT TO authenticated USING (public.salgados_pode_consultar());
COMMENT ON TABLE public.sabores_estoque_config IS
  $$Margem de segurança, estoque mínimo de reposição e estado de inventário por sabor oficial. Margem não é baixa, perda nem reserva de cliente.$$;

INSERT INTO public.sabores_estoque_config (chave, margem_seguranca, estoque_minimo, inventariado)
SELECT chave, 100, 0, false FROM public.sabores_estoque
ON CONFLICT (chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.salgados_operacao_config (
  id boolean DEFAULT true PRIMARY KEY CHECK (id),
  modo text NOT NULL DEFAULT 'monitoramento'
    CHECK (modo IN ('monitoramento', 'validacao_assistida', 'controle_operacional')),
  habilitado boolean NOT NULL DEFAULT false,
  protecoes_essenciais boolean NOT NULL DEFAULT true CHECK (protecoes_essenciais),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.salgados_operacao_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.salgados_operacao_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.salgados_operacao_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.salgados_operacao_config TO authenticated;
DROP POLICY IF EXISTS salgados_modo_leitura_equipe ON public.salgados_operacao_config;
CREATE POLICY salgados_modo_leitura_equipe ON public.salgados_operacao_config
  FOR SELECT TO authenticated USING (public.salgados_pode_consultar());

-- -----------------------------------------------------------------------------
-- 5. Bloqueios, solicitações, autorizações e compromissos futuros
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salgados_bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT,
  inicio date NOT NULL,
  fim date NOT NULL CHECK (fim >= inicio),
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 3 AND 500),
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  desbloqueado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  desbloqueado_em timestamptz,
  ativo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS salgados_bloqueio_unico_idx
  ON public.salgados_bloqueios (chave, inicio, fim) WHERE ativo;
CREATE INDEX IF NOT EXISTS salgados_bloqueio_vigente_idx
  ON public.salgados_bloqueios (chave, inicio, fim) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.salgados_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('conferencia', 'liberacao_excepcional', 'agendamento_analise')),
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  quantidade_solicitada integer NOT NULL CHECK (quantidade_solicitada > 0),
  data_pedido date,
  solicitado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'parcial', 'recusada', 'cancelada', 'resolvida')),
  quantidade_conferida integer CHECK (quantidade_conferida >= 0),
  justificativa text NOT NULL CHECK (length(btrim(justificativa)) BETWEEN 3 AND 1000),
  decisao text CHECK (length(decisao) <= 1000),
  respondido_em timestamptz,
  resposta_expira_em timestamptz,
  usada_em timestamptz,
  ack_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ack_em timestamptz,
  -- Um único evento visual na tabela existente por resposta; o reconhecimento
  -- individual continua em ack_por/ack_em, sem marcar a notificação global.
  notificacao_id uuid,
  chave_idempotencia uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salgados_solicitacoes ADD COLUMN IF NOT EXISTS notificacao_id uuid;
CREATE INDEX IF NOT EXISTS salgados_solicitacoes_pendentes_idx
  ON public.salgados_solicitacoes (chave, status, created_at DESC);
CREATE INDEX IF NOT EXISTS salgados_solicitacoes_resposta_idx
  ON public.salgados_solicitacoes (respondido_em, ack_em);

CREATE TABLE IF NOT EXISTS public.salgados_autorizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL UNIQUE
    REFERENCES public.salgados_solicitacoes(id) ON DELETE RESTRICT,
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  quantidade_liberada integer NOT NULL CHECK (quantidade_liberada > 0),
  expira_em timestamptz NOT NULL,
  usada_em timestamptz,
  usada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usada_pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salgados_autorizacoes_ativas_idx
  ON public.salgados_autorizacoes (chave, expira_em) WHERE usada_em IS NULL;

CREATE TABLE IF NOT EXISTS public.salgados_compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  data_compromisso date NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'coberto', 'cancelado')),
  chave_idempotencia uuid NOT NULL UNIQUE,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  coberto_em timestamptz,
  cancelado_em timestamptz
);
CREATE INDEX IF NOT EXISTS salgados_compromissos_pendentes_idx
  ON public.salgados_compromissos (chave, data_compromisso) WHERE status = 'pendente';

CREATE TABLE IF NOT EXISTS public.salgados_compromisso_coberturas (
  compromisso_id uuid NOT NULL REFERENCES public.salgados_compromissos(id) ON DELETE RESTRICT,
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  -- Identificador da AÇÃO de cobertura. A unicidade é por par (compromisso,lote);
  -- uma mesma entrada pode cobrir vários compromissos sem violar chave única.
  acao_idempotencia uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (compromisso_id, lote_id)
);
ALTER TABLE public.salgados_compromisso_coberturas
  ADD COLUMN IF NOT EXISTS acao_idempotencia uuid;

DO $rls$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'public.salgados_bloqueios',
      'public.salgados_solicitacoes',
      'public.salgados_autorizacoes',
      'public.salgados_compromissos',
      'public.salgados_compromisso_coberturas'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE %s TO authenticated', t);
    EXECUTE format($pol$
      DROP POLICY IF EXISTS salgados_operacao_leitura ON %s;
      CREATE POLICY salgados_operacao_leitura ON %s
        FOR SELECT TO authenticated USING (public.salgados_pode_consultar())
    $pol$, t, t);
  END LOOP;
END
$rls$;

-- Solicitações contêm justificativa e quantidades: só o solicitante e o
-- responsável autorizado leem diretamente. A contagem agregada para o resto da
-- equipe continua disponível na view canônica.
DROP POLICY IF EXISTS salgados_operacao_leitura ON public.salgados_solicitacoes;
CREATE POLICY salgados_solicitacoes_leitura ON public.salgados_solicitacoes
  FOR SELECT TO authenticated
  USING (
    public.salgados_pode_consultar()
    AND (solicitado_por = auth.uid() OR public.salgados_eh_responsavel())
  );

COMMENT ON TABLE public.salgados_compromissos IS
  $$Compromisso futuro de fabricação aprovado. Não cria estoque físico, lote nem saldo.$$;
COMMENT ON TABLE public.salgados_autorizacoes IS
  $$Liberação excepcional pontual, com validade e uso único. Não altera a margem de segurança.$$;

-- -----------------------------------------------------------------------------
-- 6. View canônica de Estoque do Dia
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_saldos_sabores_estoque AS
WITH fisico AS (
  SELECT sabor_chave,
         coalesce(sum(restante), 0)::integer AS total,
         min(validade) FILTER (
           WHERE restante > 0 AND validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
         ) AS proxima_validade
  FROM public.lotes
  WHERE sabor_chave IS NOT NULL AND status = 'ativo'
    AND (validade IS NULL OR validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  GROUP BY sabor_chave
), vencidos AS (
  SELECT sabor_chave, count(*)::integer AS total
  FROM public.lotes
  WHERE sabor_chave IS NOT NULL AND restante > 0
    AND (status = 'vencido' OR (validade IS NOT NULL
      AND validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date))
  GROUP BY sabor_chave
), reservado AS (
  SELECT r.sabor_chave,
         coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0), 0)), 0)::integer AS total
  FROM public.reservas_estoque r
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(quantidade), 0) AS consumido
    FROM public.reserva_consumos
    WHERE reserva_id = r.id
  ) c ON true
  WHERE r.status = 'ativa' AND r.sabor_chave IS NOT NULL
  GROUP BY r.sabor_chave
), compromissos AS (
  SELECT chave, coalesce(sum(quantidade), 0)::integer AS total
  FROM public.salgados_compromissos
  WHERE status = 'pendente'
  GROUP BY chave
), pendentes AS (
  SELECT chave, count(*)::integer AS total
  FROM public.salgados_solicitacoes
  WHERE status = 'pendente'
  GROUP BY chave
), liberacoes AS (
  SELECT chave, coalesce(sum(quantidade_liberada), 0)::integer AS total
  FROM public.salgados_autorizacoes
  WHERE usada_em IS NULL AND expira_em > now()
  GROUP BY chave
), bloqueios AS (
  SELECT b.chave, bool_or(true) AS ativo
  FROM public.salgados_bloqueios b
  WHERE b.ativo
    AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN b.inicio AND b.fim
  GROUP BY b.chave
), ultima AS (
  SELECT sabor_chave, max(created_at) AS em
  FROM public.estoque_movimentacoes
  WHERE sabor_chave IS NOT NULL
  GROUP BY sabor_chave
), imagens AS (
  SELECT s.chave,
         coalesce(s.imagem_url, c.imagem_url, p.imagem_url) AS imagem_url
  FROM public.sabores_estoque s
  LEFT JOIN public.sabores_estoque_config c ON c.chave = s.chave
  LEFT JOIN public.produtos p ON p.id = s.produto_id
)
SELECT
  s.chave,
  s.categoria,
  s.nome,
  i.imagem_url,
  s.ordem,
  s.produto_id,
  coalesce(f.total, 0) AS fisico,
  coalesce(r.total, 0) AS reservado,
  greatest(coalesce(f.total, 0) - coalesce(r.total, 0), 0) AS disponivel,
  coalesce(c.margem_seguranca, 100) AS margem_seguranca,
  coalesce(c.estoque_minimo, 0) AS estoque_minimo,
  coalesce(c.inventariado, false) AS inventariado,
  coalesce(v.total, 0) AS vencidos,
  f.proxima_validade,
  coalesce(k.total, 0) AS compromissos_futuros,
  greatest(coalesce(f.total, 0) - coalesce(r.total, 0)
    - coalesce(c.margem_seguranca, 100) + coalesce(a.total, 0), 0) AS disponivel_imediato,
  coalesce(b.ativo, false) AS bloqueado_hoje,
  coalesce(pd.total, 0) AS solicitacoes_pendentes,
  CASE
    WHEN NOT coalesce(c.inventariado, false) THEN 'nao_inventariado'
    WHEN coalesce(r.total, 0) > coalesce(f.total, 0) THEN 'divergencia'
    WHEN coalesce(b.ativo, false) THEN 'bloqueado'
    WHEN coalesce(v.total, 0) > 0 THEN 'conferencia_vencidos'
    WHEN coalesce(f.total, 0) - coalesce(r.total, 0) <= coalesce(c.margem_seguranca, 100)
      THEN 'margem_atingida'
    ELSE 'operacional'
  END AS situacao,
  coalesce(c.atualizado_em, u.em, now()) AS atualizado_em
FROM public.sabores_estoque s
LEFT JOIN public.sabores_estoque_config c ON c.chave = s.chave
LEFT JOIN imagens i ON i.chave = s.chave
LEFT JOIN fisico f ON f.sabor_chave = s.chave
LEFT JOIN vencidos v ON v.sabor_chave = s.chave
LEFT JOIN reservado r ON r.sabor_chave = s.chave
LEFT JOIN compromissos k ON k.chave = s.chave
LEFT JOIN pendentes pd ON pd.chave = s.chave
LEFT JOIN liberacoes a ON a.chave = s.chave
LEFT JOIN bloqueios b ON b.chave = s.chave
LEFT JOIN ultima u ON u.sabor_chave = s.chave
-- Views rodam com o owner e não herdam RLS; o filtro funcional evita que
-- motoboy/cliente autenticado leia saldos mesmo com GRANT amplo do PostgREST.
WHERE public.salgados_pode_consultar();

REVOKE ALL ON TABLE public.vw_saldos_sabores_estoque FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vw_saldos_sabores_estoque TO authenticated;

CREATE OR REPLACE VIEW public.vw_salgados_notificacoes_atendente AS
SELECT
  q.id,
  q.tipo,
  q.chave,
  s.nome AS sabor_nome,
  q.pedido_id,
  q.status,
  q.decisao,
  q.quantidade_solicitada,
  q.quantidade_conferida,
  q.respondido_em,
  q.resposta_expira_em,
  q.solicitado_por,
  q.responsavel_id,
  q.created_at
FROM public.salgados_solicitacoes q
JOIN public.sabores_estoque s ON s.chave = q.chave
WHERE q.respondido_em IS NOT NULL
  AND q.ack_em IS NULL
  AND public.salgados_pode_consultar()
  AND (q.solicitado_por = auth.uid() OR public.salgados_eh_responsavel());
REVOKE ALL ON TABLE public.vw_salgados_notificacoes_atendente FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vw_salgados_notificacoes_atendente TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Configuração administrativa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configurar_salgado_estoque(
  p_chave text,
  p_margem_seguranca integer DEFAULT 100,
  p_estoque_minimo integer DEFAULT 0,
  p_inventariado boolean DEFAULT false,
  p_imagem_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_url text := nullif(btrim(coalesce(p_imagem_url, '')), '');
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_margem_seguranca IS NULL OR p_estoque_minimo IS NULL
     OR p_margem_seguranca < 0 OR p_margem_seguranca > 2147483647
     OR p_estoque_minimo < 0 OR p_estoque_minimo > 2147483647
     OR (v_url IS NOT NULL AND v_url !~ '^https://') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'sabor_inexistente');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:config:' || p_chave, 0));
  INSERT INTO public.sabores_estoque_config
    (chave, margem_seguranca, estoque_minimo, inventariado, imagem_url, atualizado_por, atualizado_em)
  VALUES
    (p_chave, p_margem_seguranca, p_estoque_minimo, coalesce(p_inventariado, false),
      v_url, v_ator, now())
  ON CONFLICT (chave) DO UPDATE SET
    margem_seguranca = excluded.margem_seguranca,
    estoque_minimo = excluded.estoque_minimo,
    inventariado = excluded.inventariado,
    imagem_url = coalesce(excluded.imagem_url, public.sabores_estoque_config.imagem_url),
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;

  UPDATE public.sabores_estoque SET imagem_url = coalesce(v_url, imagem_url) WHERE chave = p_chave;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_config_alterada', jsonb_build_object(
    'chave', p_chave, 'margem_seguranca', p_margem_seguranca,
    'estoque_minimo', p_estoque_minimo, 'inventariado', coalesce(p_inventariado, false)
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'chave', p_chave);
END;
$$;

CREATE OR REPLACE FUNCTION public.configurar_modo_salgados(
  p_modo text,
  p_habilitado boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_modo text := lower(btrim(coalesce(p_modo, '')));
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF v_modo NOT IN ('monitoramento', 'validacao_assistida', 'controle_operacional')
     OR p_habilitado IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:modo', 0));
  UPDATE public.salgados_operacao_config
     SET modo = v_modo, habilitado = p_habilitado,
         protecoes_essenciais = true, atualizado_por = v_ator, atualizado_em = now()
   WHERE id = true;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_modo_alterado', jsonb_build_object(
    'modo', v_modo, 'habilitado', p_habilitado, 'protecoes_essenciais', true
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'modo', v_modo, 'habilitado', p_habilitado);
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Consulta operacional e avaliação por sabor, quantidade e data
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consultar_estoque_dia_salgados(p_data date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_data date := coalesce(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_modo jsonb;
  v_itens jsonb;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_pode_consultar() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  SELECT jsonb_build_object('modo', c.modo, 'habilitado', c.habilitado)
    INTO v_modo FROM public.salgados_operacao_config c WHERE c.id = true;
  SELECT coalesce(jsonb_agg(
           to_jsonb(v) || jsonb_build_object(
             'data', v_data,
             'bloqueado_na_data', coalesce(d.bloqueado, false),
             'compromissos_na_data', coalesce(d.compromisso, 0),
             'liberacao_ativa', coalesce(d.liberacao, 0),
             'disponivel_na_data', greatest(
               v.fisico - v.reservado - coalesce(d.compromisso, 0)
                 + coalesce(d.liberacao, 0), 0)
           )
           ORDER BY v.ordem), '[]'::jsonb)
    INTO v_itens
    FROM public.vw_saldos_sabores_estoque v
    LEFT JOIN LATERAL (
      SELECT
        (SELECT bool_or(true) FROM public.salgados_bloqueios b
          WHERE b.chave = v.chave AND b.ativo AND v_data BETWEEN b.inicio AND b.fim) AS bloqueado,
        (SELECT coalesce(sum(k.quantidade), 0)::integer FROM public.salgados_compromissos k
          WHERE k.chave = v.chave AND k.status = 'pendente'
            AND k.data_compromisso <= v_data) AS compromisso,
        (SELECT coalesce(sum(a.quantidade_liberada), 0)::integer
          FROM public.salgados_autorizacoes a
          WHERE a.chave = v.chave AND a.usada_em IS NULL AND a.expira_em > now()) AS liberacao
    ) d ON true;
  RETURN jsonb_build_object(
    'status', 'ok', 'data', v_data,
    'modo', coalesce(v_modo->'modo', '"monitoramento"'::jsonb),
    'habilitado', coalesce(v_modo->'habilitado', 'false'::jsonb),
    'itens', v_itens
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.avaliar_venda_salgado(
  p_chave text,
  p_quantidade integer,
  p_data date DEFAULT NULL,
  p_pedido_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_data date := coalesce(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v public.vw_saldos_sabores_estoque%ROWTYPE;
  v_bloqueado boolean;
  v_compromisso integer;
  v_base integer;
  v_liberacao integer;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_pode_consultar() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  SELECT * INTO v FROM public.vw_saldos_sabores_estoque WHERE chave = p_chave;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'sabor_inexistente');
  END IF;

  SELECT bool_or(true) INTO v_bloqueado
  FROM public.salgados_bloqueios
  WHERE chave = p_chave AND ativo AND v_data BETWEEN inicio AND fim;
  SELECT coalesce(sum(quantidade), 0)::integer INTO v_compromisso
  FROM public.salgados_compromissos
  WHERE chave = p_chave AND status = 'pendente' AND data_compromisso <= v_data;
  SELECT coalesce(sum(quantidade_liberada), 0)::integer INTO v_liberacao
  FROM public.salgados_autorizacoes
  WHERE chave = p_chave AND usada_em IS NULL AND expira_em > now()
    AND (pedido_id IS NULL OR pedido_id = p_pedido_id);

  v_base := v.fisico - v.reservado - v_compromisso + v_liberacao;
  RETURN jsonb_build_object(
    'status',
      CASE
        WHEN coalesce(v_bloqueado, false) THEN 'bloqueado'
        WHEN NOT v.inventariado THEN 'analise_necessaria'
        WHEN v.reservado > v.fisico THEN 'divergencia'
        WHEN v_data > (now() AT TIME ZONE 'America/Sao_Paulo')::date
             AND p_quantidade > greatest(v_base, 0) THEN 'analise_necessaria'
        WHEN p_quantidade > greatest(v_base, 0) AND p_quantidade <= greatest(v.fisico - v.reservado + v_liberacao, 0)
          THEN 'margem_atingida'
        WHEN p_quantidade > greatest(v_base, 0) THEN 'indisponivel'
        ELSE 'disponivel'
      END,
    'chave', p_chave,
    'data', v_data,
    'fisico', v.fisico,
    'reservado', v.reservado,
    'margem_seguranca', v.margem_seguranca,
    'compromissos_futuros', v_compromisso,
    'liberacao_ativa', v_liberacao,
    'inventariado', v.inventariado,
    'disponivel_imediato', v.disponivel_imediato,
    'quantidade', p_quantidade,
    'pedido_id', p_pedido_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.avaliar_preparo_salgado(
  p_chave text,
  p_quantidade integer,
  p_pedido_id uuid,
  p_data date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_avaliacao jsonb;
BEGIN
  v_avaliacao := public.avaliar_venda_salgado(p_chave, p_quantidade, p_data, p_pedido_id);
  RETURN v_avaliacao || jsonb_build_object(
    'preparo', CASE
      WHEN v_avaliacao->>'status' = 'disponivel' THEN 'liberado'
      ELSE 'aguardando_analise'
    END
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Reserva, liberação e consumo por sabor canônico
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_sabor_estoque(
  p_chave text,
  p_quantidade integer,
  p_pedido_id uuid,
  p_chave_idempotencia uuid,
  p_data date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_data date := coalesce(p_data, v_hoje);
  v_avaliacao jsonb;
  v_reserva_id uuid;
  v_lote_id uuid;
BEGIN
  IF v_ator IS NULL OR NOT (public.salgados_pode_consultar()) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_quantidade IS NULL OR p_quantidade < 1
     OR p_pedido_id IS NULL OR p_chave_idempotencia IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF v_data < v_hoje THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'data_passada');
  END IF;
  -- Compromisso futuro não é reserva física: usar registrar_compromisso_salgado
  -- e revalidar na confirmação efetiva.
  IF v_data > v_hoje THEN
    RETURN jsonb_build_object(
      'status', 'analise_necessaria', 'data', v_data,
      'mensagem', 'Agendamento futuro: registrar como compromisso e revalidar na confirmação.'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:reserva:' || p_chave, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));

  SELECT id INTO v_reserva_id FROM public.reservas_estoque
  WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'reserva_id', v_reserva_id);
  END IF;

  SELECT public.avaliar_venda_salgado(p_chave, p_quantidade, v_data, p_pedido_id)
    INTO v_avaliacao;
  IF v_avaliacao->>'status' <> 'disponivel' THEN
    RETURN jsonb_build_object(
      'status', v_avaliacao->>'status', 'avaliacao', v_avaliacao,
      'mensagem', 'Não foi confirmada nova reserva; encaminhe para conferência quando necessário.'
    );
  END IF;

  SELECT id INTO v_lote_id
  FROM public.lotes
  WHERE sabor_chave = p_chave AND status = 'ativo' AND restante > 0
    AND (validade IS NULL OR validade >= v_data)
  ORDER BY validade NULLS LAST, created_at, id
  LIMIT 1
  FOR UPDATE;

  INSERT INTO public.reservas_estoque
    (pedido_id, produto_id, lote_id, quantidade, status, sabor_chave, chave_idempotencia)
  VALUES (p_pedido_id, NULL, v_lote_id, p_quantidade, 'ativa', p_chave, p_chave_idempotencia)
  RETURNING id INTO v_reserva_id;

  INSERT INTO public.estoque_movimentacoes
    (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
     referencia_id, referencia_tipo, usuario_id, observacao)
  SELECT NULL, p_chave, v_lote_id, 'reserva', p_quantidade,
         (v_avaliacao->>'fisico')::integer,
         (v_avaliacao->>'fisico')::integer,
         v_reserva_id, 'reserva_sabor', v_ator, 'Reserva por sabor oficial';

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'reserva_sabor_gravada', jsonb_build_object(
    'reserva_id', v_reserva_id, 'chave', p_chave, 'quantidade', p_quantidade,
    'pedido_id', p_pedido_id, 'data', v_data,
    'chave_idempotencia', p_chave_idempotencia
  )::text);

  RETURN jsonb_build_object('status', 'ok', 'reserva_id', v_reserva_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_reserva_sabor(
  p_reserva_id uuid,
  p_motivo text,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_reserva public.reservas_estoque%ROWTYPE;
  v_liberado integer;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_pode_consultar() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_reserva_id IS NULL OR p_chave_idempotencia IS NULL
     OR length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));
  PERFORM 1 FROM public.pedidos WHERE id IN (
    SELECT pedido_id FROM public.reservas_estoque WHERE id = p_reserva_id
  ) FOR UPDATE;
  SELECT * INTO v_reserva FROM public.reservas_estoque WHERE id = p_reserva_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_inexistente');
  END IF;
  IF EXISTS (
    SELECT FROM public.estoque_movimentacoes
    WHERE tipo = 'liberacao' AND referencia_id = p_reserva_id
      AND referencia_tipo = 'liberacao_reserva_sabor'
  ) THEN
    RETURN jsonb_build_object('status', 'ja_liberada', 'reserva_id', p_reserva_id);
  END IF;
  IF v_reserva.status <> 'ativa' THEN
    RETURN jsonb_build_object('status', 'sem_alteracao', 'reserva_id', p_reserva_id);
  END IF;
  SELECT coalesce(sum(quantidade), 0)::integer INTO v_liberado
  FROM public.reserva_consumos WHERE reserva_id = p_reserva_id;
  IF v_liberado > v_reserva.quantidade THEN
    RETURN jsonb_build_object('status', 'divergencia');
  END IF;

  UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = p_reserva_id;
  INSERT INTO public.estoque_movimentacoes
    (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
     referencia_id, referencia_tipo, usuario_id, observacao)
  VALUES (NULL, v_reserva.sabor_chave, v_reserva.lote_id, 'liberacao',
    v_reserva.quantidade - v_liberado, 0, 0, p_reserva_id,
    'liberacao_reserva_sabor', v_ator, left(btrim(p_motivo), 200));
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'reserva_sabor_liberada', jsonb_build_object(
    'reserva_id', p_reserva_id, 'motivo', left(btrim(p_motivo), 500),
    'chave_idempotencia', p_chave_idempotencia
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'reserva_id', p_reserva_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. Solicitações, respostas e autorização de uso único
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solicitar_salgado(
  p_tipo text,
  p_chave text,
  p_quantidade integer,
  p_motivo text,
  p_chave_idempotencia uuid,
  p_data date DEFAULT NULL,
  p_pedido_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_id uuid;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_pode_consultar() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF v_tipo NOT IN ('conferencia', 'liberacao_excepcional', 'agendamento_analise')
     OR p_chave IS NULL OR p_quantidade IS NULL OR p_quantidade < 1
     OR p_chave_idempotencia IS NULL
     OR length(btrim(coalesce(p_motivo, ''))) < 3
     OR NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));
  SELECT id INTO v_id FROM public.salgados_solicitacoes
  WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'solicitacao_id', v_id);
  END IF;
  IF EXISTS (
    SELECT FROM public.salgados_solicitacoes
    WHERE tipo = v_tipo AND chave = p_chave AND status = 'pendente'
      AND pedido_id IS NOT DISTINCT FROM p_pedido_id
      AND data_pedido IS NOT DISTINCT FROM p_data
  ) THEN
    RETURN jsonb_build_object('status', 'ja_pendente', 'chave', p_chave);
  END IF;

  INSERT INTO public.salgados_solicitacoes
    (tipo, chave, pedido_id, quantidade_solicitada, data_pedido, solicitado_por,
     justificativa, status, chave_idempotencia)
  VALUES
    (v_tipo, p_chave, p_pedido_id, p_quantidade, p_data, v_ator,
     left(btrim(p_motivo), 1000), 'pendente', p_chave_idempotencia)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_solicitacao_enviada', jsonb_build_object(
    'solicitacao_id', v_id, 'tipo', v_tipo, 'chave', p_chave,
    'quantidade', p_quantidade, 'pedido_id', p_pedido_id
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'solicitacao_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.responder_solicitacao_salgado(
  p_solicitacao_id uuid,
  p_decisao text,
  p_quantidade_conferida integer DEFAULT NULL,
  p_quantidade_liberada integer DEFAULT NULL,
  p_justificativa text DEFAULT NULL,
  p_expira_em timestamptz DEFAULT NULL,
  p_chave_idempotencia uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_sol public.salgados_solicitacoes%ROWTYPE;
  v_decisao text := lower(btrim(coalesce(p_decisao, '')));
  v_qtd integer;
  v_liberada integer := 0;
  v_status text;
  v_autorizacao_id uuid;
  v_expira timestamptz;
  v_avaliacao jsonb;
  v_notificacao_id uuid;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF v_decisao NOT IN ('aprovada', 'parcial', 'recusada')
     OR p_solicitacao_id IS NULL
     OR length(btrim(coalesce(p_justificativa, ''))) < 3 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_solicitacao_id::text, 0));
  SELECT * INTO v_sol FROM public.salgados_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'solicitacao_inexistente');
  END IF;
  IF v_sol.status <> 'pendente' OR v_sol.respondido_em IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ja_respondida', 'status_atual', v_sol.status);
  END IF;

  v_qtd := coalesce(p_quantidade_conferida, v_sol.quantidade_solicitada);
  IF v_decisao = 'aprovada' THEN
    v_liberada := coalesce(p_quantidade_liberada, 0);
    v_status := 'aprovada';
  ELSIF v_decisao = 'parcial' THEN
    v_liberada := coalesce(p_quantidade_liberada, 0);
    IF v_liberada < 1 OR v_liberada >= v_sol.quantidade_solicitada THEN
      RETURN jsonb_build_object('status', 'quantidade_parcial_invalida');
    END IF;
    v_status := 'parcial';
  ELSE
    v_status := 'recusada';
  END IF;

  IF v_liberada > 0 THEN
    v_avaliacao := public.avaliar_venda_salgado(
      v_sol.chave, v_liberada, v_sol.data_pedido, v_sol.pedido_id
    );
    IF v_avaliacao->>'status' IN ('permissao_negada', 'dados_invalidos', 'sabor_inexistente',
      'divergencia', 'indisponivel', 'bloqueado') THEN
      RETURN jsonb_build_object('status', 'liberacao_nao_permitida', 'avaliacao', v_avaliacao);
    END IF;
    -- Mesmo em análise/margem, a liberação excepcional exige cobertura física:
    -- nunca autorizar preparo sem unidades reais descomprometidas.
    IF (v_avaliacao->>'fisico')::integer - (v_avaliacao->>'reservado')::integer < v_liberada THEN
      RETURN jsonb_build_object(
        'status', 'liberacao_sem_cobertura_fisica', 'avaliacao', v_avaliacao
      );
    END IF;
    v_expira := coalesce(p_expira_em, now() + interval '2 hours');
    IF v_expira <= now() THEN
      RETURN jsonb_build_object('status', 'validade_invalida');
    END IF;
    IF EXISTS (
      SELECT FROM public.salgados_autorizacoes WHERE solicitacao_id = v_sol.id
    ) THEN
      RETURN jsonb_build_object('status', 'ja_autorizada');
    END IF;
    INSERT INTO public.salgados_autorizacoes
      (solicitacao_id, chave, pedido_id, quantidade_liberada, expira_em, criado_por)
    VALUES (v_sol.id, v_sol.chave, v_sol.pedido_id, v_liberada, v_expira, v_ator)
    RETURNING id INTO v_autorizacao_id;
  END IF;

  UPDATE public.salgados_solicitacoes
     SET status = v_status,
         responsavel_id = v_ator,
         quantidade_conferida = v_qtd,
         decisao = left(btrim(p_justificativa), 1000),
         respondido_em = now(),
         resposta_expira_em = v_expira,
         updated_at = now()
   WHERE id = v_sol.id;

  -- Evento visual/sonoro reaproveitando a tabela de notificações já existente.
  -- Texto genérico: a RLS legada de notificacoes é ampla (inclui motoboy), então
  -- sabor, quantidade e decisão ficam apenas na view autorizada de resposta.
  IF v_sol.notificacao_id IS NULL THEN
    INSERT INTO public.notificacoes (tipo, titulo, detalhe, link, lida)
    VALUES (
      'salgados_resposta',
      'Resposta do responsável',
      'Há uma resposta sobre o estoque do dia. Confira na Central da Atendente.',
      '/atendente',
      false
    )
    RETURNING id INTO v_notificacao_id;
    UPDATE public.salgados_solicitacoes
       SET notificacao_id = v_notificacao_id
     WHERE id = v_sol.id;
  END IF;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_solicitacao_respondida', jsonb_build_object(
    'solicitacao_id', v_sol.id, 'decisao', v_decisao,
    'quantidade_conferida', v_qtd, 'quantidade_liberada', v_liberada,
    'autorizacao_id', v_autorizacao_id, 'chave_idempotencia', p_chave_idempotencia
  )::text);

  RETURN jsonb_build_object(
    'status', 'ok', 'solicitacao_id', v_sol.id, 'decisao', v_decisao,
    'autorizacao_id', v_autorizacao_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconhecer_resposta_salgado(p_solicitacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_sol public.salgados_solicitacoes%ROWTYPE;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_pode_consultar() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  SELECT * INTO v_sol FROM public.salgados_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'solicitacao_inexistente');
  END IF;
  IF v_sol.respondido_em IS NULL THEN
    RETURN jsonb_build_object('status', 'sem_resposta');
  END IF;
  IF v_sol.ack_em IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ja_reconhecida', 'ack_em', v_sol.ack_em);
  END IF;
  UPDATE public.salgados_solicitacoes
     SET ack_por = v_ator, ack_em = now(), updated_at = now()
   WHERE id = v_sol.id AND ack_em IS NULL;
  RETURN jsonb_build_object('status', 'ok', 'solicitacao_id', v_sol.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.usar_autorizacao_salgado(
  p_autorizacao_id uuid,
  p_pedido_id uuid,
  p_quantidade integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_aut public.salgados_autorizacoes%ROWTYPE;
  v_avaliacao jsonb;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_pode_consultar() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_autorizacao_id IS NULL OR p_pedido_id IS NULL OR p_quantidade IS NULL OR p_quantidade < 1 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_autorizacao_id::text, 0));
  SELECT * INTO v_aut FROM public.salgados_autorizacoes WHERE id = p_autorizacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'autorizacao_inexistente');
  END IF;
  IF v_aut.usada_em IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ja_utilizada', 'usada_em', v_aut.usada_em);
  END IF;
  IF v_aut.expira_em <= now() THEN
    RETURN jsonb_build_object('status', 'expirada');
  END IF;
  IF p_quantidade > v_aut.quantidade_liberada
     OR (v_aut.pedido_id IS NOT NULL AND v_aut.pedido_id <> p_pedido_id) THEN
    RETURN jsonb_build_object('status', 'fora_da_autorizacao');
  END IF;

  v_avaliacao := public.avaliar_venda_salgado(v_aut.chave, p_quantidade, NULL, p_pedido_id);
  IF v_avaliacao->>'status' IN ('permissao_negada', 'dados_invalidos', 'sabor_inexistente',
     'divergencia', 'indisponivel', 'bloqueado')
     OR (v_avaliacao->>'fisico')::integer - (v_avaliacao->>'reservado')::integer < p_quantidade THEN
    RETURN jsonb_build_object('status', 'revalidacao_falhou', 'avaliacao', v_avaliacao);
  END IF;

  UPDATE public.salgados_autorizacoes
     SET usada_em = now(), usada_por = v_ator, usada_pedido_id = p_pedido_id
   WHERE id = v_aut.id AND usada_em IS NULL;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_autorizacao_utilizada', jsonb_build_object(
    'autorizacao_id', v_aut.id, 'pedido_id', p_pedido_id, 'quantidade', p_quantidade
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'autorizacao_id', v_aut.id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 11. Bloqueio por sabor e data
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bloquear_sabor_salgados(
  p_chave text,
  p_inicio date,
  p_fim date,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio
     OR length(btrim(coalesce(p_motivo, ''))) < 3
     OR NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:bloqueio:' || p_chave, 0));
  IF EXISTS (
    SELECT FROM public.salgados_bloqueios
    WHERE chave = p_chave AND ativo AND p_inicio <= fim AND p_fim >= inicio
  ) THEN
    RETURN jsonb_build_object('status', 'periodo_sobreposto');
  END IF;
  INSERT INTO public.salgados_bloqueios (chave, inicio, fim, motivo, criado_por)
  VALUES (p_chave, p_inicio, p_fim, left(btrim(p_motivo), 500), v_ator)
  RETURNING id INTO v_id;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_bloqueio_criado', jsonb_build_object(
    'bloqueio_id', v_id, 'chave', p_chave, 'inicio', p_inicio, 'fim', p_fim
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'bloqueio_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.desbloquear_sabor_salgados(
  p_bloqueio_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_bloqueio_id IS NULL OR length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  UPDATE public.salgados_bloqueios
     SET ativo = false, desbloqueado_por = v_ator, desbloqueado_em = now()
   WHERE id = p_bloqueio_id AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'sem_alteracao');
  END IF;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_bloqueio_desfeito', jsonb_build_object(
    'bloqueio_id', p_bloqueio_id, 'motivo', left(btrim(p_motivo), 500)
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'bloqueio_id', p_bloqueio_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 12. Compromissos futuros e cobertura por entrada real
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_compromisso_salgado(
  p_chave text,
  p_quantidade integer,
  p_data date,
  p_pedido_id uuid,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_id uuid;
  v_bloqueado boolean;
BEGIN
  IF v_ator IS NULL OR NOT public.salgados_eh_responsavel() THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_quantidade IS NULL OR p_quantidade < 1 OR p_data IS NULL
     OR p_pedido_id IS NULL OR p_chave_idempotencia IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:compromisso:' || p_chave, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));
  SELECT id INTO v_id FROM public.salgados_compromissos
  WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'compromisso_id', v_id);
  END IF;
  SELECT bool_or(true) INTO v_bloqueado FROM public.salgados_bloqueios
  WHERE chave = p_chave AND ativo AND p_data BETWEEN inicio AND fim;
  IF coalesce(v_bloqueado, false) THEN
    RETURN jsonb_build_object('status', 'bloqueado');
  END IF;
  INSERT INTO public.salgados_compromissos
    (chave, pedido_id, quantidade, data_compromisso, status, chave_idempotencia, criado_por)
  VALUES (p_chave, p_pedido_id, p_quantidade, p_data, 'pendente', p_chave_idempotencia, v_ator)
  RETURNING id INTO v_id;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'salgados_compromisso_aberto', jsonb_build_object(
    'compromisso_id', v_id, 'chave', p_chave, 'quantidade', p_quantidade,
    'data', p_data, 'pedido_id', p_pedido_id
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'compromisso_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cobrir_compromissos_salgados(
  p_lote_id uuid,
  p_chave_idempotencia uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_lote public.lotes%ROWTYPE;
  v_comp public.salgados_compromissos%ROWTYPE;
  v_coberto integer;
  v_restante integer;
  v_retira integer;
  v_total integer := 0;
BEGIN
  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id FOR UPDATE;
  IF NOT FOUND OR v_lote.sabor_chave IS NULL THEN
    RETURN jsonb_build_object('status', 'lote_inexistente');
  END IF;
  v_restante := v_lote.restante;
  FOR v_comp IN
    SELECT * FROM public.salgados_compromissos
    WHERE chave = v_lote.sabor_chave AND status = 'pendente'
      AND (v_lote.validade IS NULL OR data_compromisso <= v_lote.validade)
    ORDER BY data_compromisso, criado_em, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    SELECT coalesce(sum(quantidade), 0)::integer INTO v_coberto
    FROM public.salgados_compromisso_coberturas WHERE compromisso_id = v_comp.id;
    v_retira := least(v_restante, greatest(v_comp.quantidade - v_coberto, 0));
    IF v_retira <= 0 THEN CONTINUE; END IF;
    INSERT INTO public.salgados_compromisso_coberturas
      (compromisso_id, lote_id, quantidade, acao_idempotencia)
    VALUES (v_comp.id, v_lote.id, v_retira, p_chave_idempotencia)
    ON CONFLICT (compromisso_id, lote_id) DO UPDATE SET
      quantidade = excluded.quantidade,
      acao_idempotencia = excluded.acao_idempotencia;
    v_restante := v_restante - v_retira;
    v_total := v_total + v_retira;
    SELECT coalesce(sum(quantidade), 0)::integer INTO v_coberto
    FROM public.salgados_compromisso_coberturas WHERE compromisso_id = v_comp.id;
    IF v_coberto >= v_comp.quantidade THEN
      UPDATE public.salgados_compromissos
         SET status = 'coberto', coberto_em = now()
       WHERE id = v_comp.id AND status = 'pendente';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('status', 'ok', 'coberto', v_total, 'lote_id', p_lote_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 13. Movimentação de lotes por sabor — FEFO, idempotente e auditada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_movimento_sabor(
  p_chave text,
  p_produto_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_usuario_id uuid,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_mov_id uuid;
  v_tipo_estoque_mov text;
BEGIN
  v_tipo_estoque_mov := CASE p_tipo
    WHEN 'entrada' THEN 'entrada'
    WHEN 'perda' THEN 'perda'
    WHEN 'ajuste' THEN 'ajuste'
    ELSE 'saida'
  END;
  INSERT INTO public.estoque_mov (produto_id, sabor_chave, tipo, quantidade, motivo, created_by)
  VALUES (p_produto_id, p_chave, v_tipo_estoque_mov, abs(p_quantidade),
    left(btrim(coalesce(p_motivo, '')), 200), p_usuario_id)
  RETURNING id INTO v_mov_id;
  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.movimentar_lote_salgado(
  p_sabor text, p_produto uuid, p_tipo text, p_quantidade integer, p_chave uuid,
  p_lote uuid DEFAULT NULL, p_codigo text DEFAULT NULL, p_fabricacao date DEFAULT NULL,
  p_validade date DEFAULT NULL, p_observacao text DEFAULT NULL, p_saldo_esperado integer DEFAULT NULL,
  p_reserva uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_autor uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sabor public.sabores_estoque%ROWTYPE;
  v_operacao public.estoque_mov_operacoes%ROWTYPE;
  v_lote public.lotes%ROWTYPE;
  v_reserva public.reservas_estoque%ROWTYPE;
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_tipo_operacao text;
  v_tipo_ledger public.tipo_mov_estoque;
  v_motivo text := left(btrim(coalesce(p_observacao, '')), 200);
  v_produto uuid;
  v_fisico integer;
  v_reservado integer;
  v_anterior integer;
  v_posterior integer;
  v_corrente integer;
  v_delta integer;
  v_resto integer;
  v_retira integer;
  v_novo_id uuid;
  v_mov_id uuid;
  v_consumo jsonb;
  v_afeta_saldo boolean := true;
BEGIN
  IF v_autor IS NULL
     OR NOT (public.has_role(v_autor, 'admin'::public.app_role)
             OR public.has_role(v_autor, 'producao'::public.app_role))
     OR (v_tipo = 'ajuste' AND NOT public.has_role(v_autor, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Permissão insuficiente para movimentar o estoque';
  END IF;
  IF v_tipo NOT IN ('entrada', 'perda', 'ajuste', 'retirada')
     OR p_quantidade IS NULL
     OR p_quantidade < (CASE WHEN v_tipo = 'ajuste' THEN 0 ELSE 1 END)
     OR p_quantidade > 2147483647
     OR p_chave IS NULL OR p_sabor IS NULL
     OR (p_reserva IS NOT NULL AND v_tipo <> 'retirada') THEN
    RAISE EXCEPTION 'Dados de movimentação inválidos';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:' || p_sabor, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave::text, 0));

  -- Ordem determinística de locks: pedido -> produto -> reserva -> sabor/lote.
  IF p_reserva IS NOT NULL THEN
    SELECT * INTO v_reserva FROM public.reservas_estoque WHERE id = p_reserva;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reserva indisponível para este sabor';
    END IF;
    PERFORM 1 FROM public.pedidos WHERE id = v_reserva.pedido_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido da reserva indisponível';
    END IF;
  END IF;
  IF p_produto IS NOT NULL THEN
    PERFORM 1 FROM public.produtos WHERE id = p_produto FOR UPDATE;
  END IF;
  IF p_reserva IS NOT NULL THEN
    SELECT * INTO v_reserva FROM public.reservas_estoque WHERE id = p_reserva FOR UPDATE;
    IF v_reserva.sabor_chave IS DISTINCT FROM p_sabor THEN
      RAISE EXCEPTION 'Reserva indisponível para este sabor';
    END IF;
  END IF;

  SELECT * INTO v_sabor FROM public.sabores_estoque WHERE chave = p_sabor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sabor oficial inexistente';
  END IF;
  IF p_produto IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.sabores_estoque_vinculos
    WHERE chave = p_sabor AND produto_id = p_produto AND ativo
  ) THEN
    RAISE EXCEPTION 'Produto não vinculado ao sabor oficial';
  END IF;
  v_produto := p_produto;

  v_tipo_operacao := CASE v_tipo WHEN 'retirada' THEN 'saida' ELSE v_tipo END;
  SELECT * INTO v_operacao FROM public.estoque_mov_operacoes
  WHERE chave_idempotencia = p_chave;
  IF FOUND THEN
    IF v_operacao.sabor_chave IS DISTINCT FROM p_sabor
       OR v_operacao.produto_id IS DISTINCT FROM v_produto
       OR v_operacao.tipo IS DISTINCT FROM v_tipo_operacao
       OR v_operacao.quantidade IS DISTINCT FROM p_quantidade
       OR v_operacao.motivo IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'Chave de movimentação já utilizada';
    END IF;
    RETURN 'ja_registrado';
  END IF;

  SELECT coalesce(sum(restante), 0)::integer INTO v_fisico
  FROM public.lotes
  WHERE sabor_chave = p_sabor AND status = 'ativo'
    AND (validade IS NULL OR validade >= v_hoje);
  SELECT coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0), 0)), 0)::integer
    INTO v_reservado
  FROM public.reservas_estoque r
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(quantidade), 0) AS consumido
    FROM public.reserva_consumos
    WHERE reserva_id = r.id
  ) c ON true
  WHERE r.status = 'ativa' AND r.sabor_chave = p_sabor;
  IF v_fisico < v_reservado THEN
    RAISE EXCEPTION 'Reserva excede o estoque físico do sabor';
  END IF;
  v_anterior := v_fisico;

  IF v_tipo IN ('perda', 'ajuste') THEN
    IF p_lote IS NULL OR p_saldo_esperado IS NULL OR v_motivo = '' THEN
      RAISE EXCEPTION 'Lote, saldo conferido e motivo são obrigatórios';
    END IF;
    SELECT * INTO v_lote FROM public.lotes
    WHERE id = p_lote AND sabor_chave = p_sabor FOR UPDATE;
    IF NOT FOUND OR v_lote.restante IS DISTINCT FROM p_saldo_esperado THEN
      RAISE EXCEPTION 'Lote ou saldo mudou. Confira o saldo e informe o motivo.';
    END IF;
  ELSIF v_tipo = 'retirada' AND p_lote IS NOT NULL THEN
    -- Reversão/retirada pontual: só consome o lote conferido, nunca FEFO de
    -- outros lotes quando o chamador declarou o destino.
    IF p_saldo_esperado IS NULL THEN
      RAISE EXCEPTION 'Saldo conferido é obrigatório quando o lote é informado';
    END IF;
    SELECT * INTO v_lote FROM public.lotes
    WHERE id = p_lote AND sabor_chave = p_sabor FOR UPDATE;
    IF NOT FOUND OR v_lote.restante IS DISTINCT FROM p_saldo_esperado
       OR v_lote.status <> 'ativo'
       OR (v_lote.validade IS NOT NULL AND v_lote.validade < v_hoje) THEN
      RAISE EXCEPTION 'Lote ou saldo mudou. Confira o saldo e informe o motivo.';
    END IF;
    IF p_quantidade > v_lote.restante THEN
      RAISE EXCEPTION 'A retirada ultrapassa o saldo do lote informado';
    END IF;
  END IF;

  IF v_tipo = 'entrada' THEN
    IF nullif(btrim(coalesce(p_codigo, '')), '') IS NULL OR length(p_codigo) > 80
       OR p_fabricacao IS NULL OR p_validade IS NULL
       OR p_fabricacao > v_hoje OR p_validade < greatest(p_fabricacao, v_hoje)
       OR EXISTS (
         SELECT FROM public.lotes
         WHERE sabor_chave = p_sabor AND lower(codigo) = lower(btrim(p_codigo))
       ) THEN
      RAISE EXCEPTION 'Código já utilizado ou datas do lote inválidas';
    END IF;
    v_delta := p_quantidade;
    v_tipo_ledger := 'entrada_manual';
  ELSIF v_tipo = 'perda' THEN
    IF p_quantidade > v_lote.restante THEN
      RAISE EXCEPTION 'A perda ultrapassa o saldo do lote';
    END IF;
    v_afeta_saldo := v_lote.status = 'ativo'
      AND (v_lote.validade IS NULL OR v_lote.validade >= v_hoje);
    IF v_afeta_saldo AND v_fisico - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'A perda compromete as reservas';
    END IF;
    v_delta := CASE WHEN v_afeta_saldo THEN -p_quantidade ELSE 0 END;
    v_tipo_ledger := CASE WHEN v_afeta_saldo THEN 'perda' ELSE 'vencimento' END;
  ELSIF v_tipo = 'ajuste' THEN
    IF p_quantidade = v_lote.restante
       OR v_lote.status NOT IN ('ativo', 'esgotado')
       OR (v_lote.status = 'esgotado' AND v_lote.restante <> 0)
       OR (v_lote.validade IS NOT NULL AND v_lote.validade < v_hoje)
       OR v_fisico + p_quantidade - v_lote.restante < v_reservado THEN
      RAISE EXCEPTION 'Inventário sem diferença válida ou com saldo reservado protegido';
    END IF;
    v_delta := p_quantidade - v_lote.restante;
    v_tipo_ledger := 'ajuste';
  ELSE
    IF v_fisico - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente';
    END IF;
    IF p_quantidade > v_fisico THEN
      RAISE EXCEPTION 'Saldo físico insuficiente';
    END IF;
    v_delta := -p_quantidade;
    v_tipo_ledger := 'venda';
  END IF;

  v_mov_id := public.registrar_movimento_sabor(
    p_sabor, v_produto, v_tipo_operacao, p_quantidade, v_autor, v_motivo
  );
  v_posterior := v_anterior + v_delta;
  IF v_posterior < 0 OR v_posterior > 2147483647 THEN
    RAISE EXCEPTION 'Saldo do sabor fora do limite permitido';
  END IF;

  IF v_tipo = 'entrada' THEN
    INSERT INTO public.lotes
      (produto_id, sabor_chave, codigo, quantidade, restante, produzido_em, validade, status)
    VALUES (v_produto, p_sabor, btrim(p_codigo), p_quantidade, p_quantidade,
      p_fabricacao, p_validade, 'ativo')
    RETURNING id INTO v_novo_id;
    INSERT INTO public.estoque_movimentacoes
      (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       referencia_id, referencia_tipo, usuario_id, observacao)
    VALUES (v_produto, p_sabor, v_novo_id, v_tipo_ledger, p_quantidade,
      v_anterior, v_posterior, v_mov_id, 'lote_salgado', v_autor, v_motivo);
    PERFORM public.cobrir_compromissos_salgados(v_novo_id, p_chave);
  ELSIF v_tipo IN ('perda', 'ajuste') THEN
    IF v_tipo = 'perda' THEN
      UPDATE public.lotes
         SET restante = restante - p_quantidade,
             status = CASE WHEN restante = p_quantidade THEN 'esgotado' ELSE status END
       WHERE id = v_lote.id;
    ELSE
      UPDATE public.lotes
         SET restante = p_quantidade,
             status = CASE WHEN p_quantidade = 0 THEN 'esgotado' ELSE 'ativo' END
       WHERE id = v_lote.id;
    END IF;
    INSERT INTO public.estoque_movimentacoes
      (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       referencia_id, referencia_tipo, usuario_id, observacao)
    VALUES (v_produto, p_sabor, v_lote.id, v_tipo_ledger,
      CASE WHEN v_delta = 0 THEN p_quantidade ELSE v_delta END,
      v_anterior, v_posterior, v_mov_id, 'lote_salgado', v_autor, v_motivo);
  ELSE
    IF p_reserva IS NOT NULL AND v_reserva.produto_id IS NOT NULL THEN
      SELECT public.registrar_consumo_reserva(
        p_reserva, p_quantidade, p_chave, v_reserva.produto_id, v_motivo
      ) INTO v_consumo;
      IF v_consumo->>'status' NOT IN ('consumido', 'ja_registrado') THEN
        RAISE EXCEPTION 'Consumo da reserva não confirmado: %', v_consumo->>'status';
      END IF;
    ELSIF p_reserva IS NOT NULL THEN
      INSERT INTO public.reserva_consumos
        (reserva_id, pedido_id, produto_id, quantidade, funcionario_id, idem_key,
         observacao, sabor_chave)
      VALUES (p_reserva, v_reserva.pedido_id, NULL, p_quantidade, v_autor, p_chave,
        v_motivo, p_sabor)
      ON CONFLICT (idem_key) DO NOTHING;
    END IF;
    v_resto := p_quantidade;
    v_corrente := v_anterior;
    FOR v_lote IN
      SELECT * FROM public.lotes
      WHERE sabor_chave = p_sabor AND status = 'ativo' AND restante > 0
        AND (validade IS NULL OR validade >= v_hoje)
        AND (p_lote IS NULL OR id = p_lote)
      ORDER BY validade NULLS LAST, created_at, id
      FOR UPDATE
    LOOP
      v_retira := least(v_lote.restante, v_resto);
      UPDATE public.lotes
         SET restante = restante - v_retira,
             status = CASE WHEN restante = v_retira THEN 'esgotado' ELSE status END
       WHERE id = v_lote.id;
      INSERT INTO public.estoque_movimentacoes
        (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
         referencia_id, referencia_tipo, usuario_id, observacao)
      VALUES (v_lote.produto_id, p_sabor, v_lote.id, v_tipo_ledger, -v_retira,
        v_corrente, v_corrente - v_retira, v_mov_id, 'lote_salgado', v_autor, v_motivo);
      v_corrente := v_corrente - v_retira;
      v_resto := v_resto - v_retira;
      EXIT WHEN v_resto = 0;
    END LOOP;
    IF v_resto <> 0 OR v_corrente <> v_posterior THEN
      RAISE EXCEPTION 'Saldo FEFO mudou';
    END IF;
  END IF;

  INSERT INTO public.estoque_mov_operacoes
    (chave_idempotencia, produto_id, sabor_chave, tipo, quantidade, motivo, movimento_id, actor)
  VALUES (p_chave, v_produto, p_sabor, v_tipo_operacao, p_quantidade, v_motivo, v_mov_id, v_autor);

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_autor, 'movimentacao_lote_salgado', jsonb_build_object(
    'chave_idempotencia', p_chave,
    'sabor', p_sabor,
    'produto_id', v_produto,
    'tipo', v_tipo,
    'quantidade', p_quantidade,
    'lote_id', p_lote,
    'saldo_anterior', v_anterior,
    'saldo_posterior', v_posterior
  )::text);

  RETURN 'registrado';
END;
$$;

-- -----------------------------------------------------------------------------
-- 14. Vínculos comerciais opcionais (sem aplicação automática)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_sabor_estoque_produto(
  p_chave text,
  p_produto_id uuid,
  p_fator_unidades integer DEFAULT 1,
  p_tipo text DEFAULT 'unitario',
  p_observacao text DEFAULT NULL,
  p_substituir boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_tipo text := lower(btrim(coalesce(p_tipo, 'unitario')));
  v_atual public.sabores_estoque_vinculos%ROWTYPE;
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_produto_id IS NULL OR p_fator_unidades IS NULL
     OR p_fator_unidades < 1 OR p_fator_unidades > 100000
     OR v_tipo NOT IN ('unitario', 'embalagem') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'sabor_inexistente');
  END IF;
  IF NOT EXISTS (SELECT FROM public.produtos WHERE id = p_produto_id) THEN
    RETURN jsonb_build_object('status', 'produto_inexistente');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:vinculo:' || p_chave, 0));
  SELECT * INTO v_atual FROM public.sabores_estoque_vinculos
  WHERE chave = p_chave AND produto_id = p_produto_id;
  IF FOUND AND v_atual.ativo
     AND (v_atual.tipo <> v_tipo OR v_atual.fator_unidades <> p_fator_unidades)
     AND NOT coalesce(p_substituir, false) THEN
    RETURN jsonb_build_object('status', 'conflito', 'tipo_atual', v_atual.tipo,
      'fator_atual', v_atual.fator_unidades);
  END IF;
  IF FOUND AND v_atual.ativo AND v_atual.tipo = v_tipo
     AND v_atual.fator_unidades = p_fator_unidades THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'chave', p_chave,
      'produto_id', p_produto_id);
  END IF;
  BEGIN
    INSERT INTO public.sabores_estoque_vinculos
      (chave, produto_id, tipo, fator_unidades, ativo, conferido_por, conferido_em, observacao)
    VALUES
      (p_chave, p_produto_id, v_tipo, p_fator_unidades, true, v_ator, now(),
        left(btrim(coalesce(p_observacao, '')), 500))
    ON CONFLICT (chave, produto_id) DO UPDATE SET
      tipo = excluded.tipo,
      fator_unidades = excluded.fator_unidades,
      ativo = true,
      conferido_por = excluded.conferido_por,
      conferido_em = excluded.conferido_em,
      observacao = excluded.observacao;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'produto_ja_vinculado', 'produto_id', p_produto_id);
  END;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'sabor_estoque_vinculo_gravado', jsonb_build_object(
    'chave', p_chave, 'produto_id', p_produto_id, 'tipo', v_tipo,
    'fator_unidades', p_fator_unidades
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'chave', p_chave,
    'produto_id', p_produto_id, 'tipo', v_tipo, 'fator_unidades', p_fator_unidades);
END;
$$;

CREATE OR REPLACE FUNCTION public.desvincular_sabor_estoque_produto(
  p_chave text,
  p_produto_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_produto_id IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:vinculo:' || p_chave, 0));
  UPDATE public.sabores_estoque_vinculos
     SET ativo = false
   WHERE chave = p_chave AND produto_id = p_produto_id AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'sem_alteracao', 'chave', p_chave,
      'produto_id', p_produto_id);
  END IF;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'sabor_estoque_vinculo_desativado', jsonb_build_object(
    'chave', p_chave, 'produto_id', p_produto_id,
    'motivo', left(btrim(coalesce(p_motivo, '')), 500)
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'chave', p_chave, 'produto_id', p_produto_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 15. ACL mínima. authenticated é apenas transporte: toda RPC valida papel.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.configurar_salgado_estoque(text, integer, integer, boolean, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.configurar_salgado_estoque(text, integer, integer, boolean, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.configurar_modo_salgados(text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.configurar_modo_salgados(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.consultar_estoque_dia_salgados(date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.consultar_estoque_dia_salgados(date) TO authenticated;
REVOKE ALL ON FUNCTION public.avaliar_venda_salgado(text, integer, date, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.avaliar_venda_salgado(text, integer, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.avaliar_preparo_salgado(text, integer, uuid, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.avaliar_preparo_salgado(text, integer, uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.reservar_sabor_estoque(text, integer, uuid, uuid, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reservar_sabor_estoque(text, integer, uuid, uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.liberar_reserva_sabor(uuid, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_sabor(uuid, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.solicitar_salgado(text, text, integer, text, uuid, date, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.solicitar_salgado(text, text, integer, text, uuid, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.responder_solicitacao_salgado(uuid, text, integer, integer, text, timestamptz, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.responder_solicitacao_salgado(uuid, text, integer, integer, text, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reconhecer_resposta_salgado(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconhecer_resposta_salgado(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.usar_autorizacao_salgado(uuid, uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.usar_autorizacao_salgado(uuid, uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.bloquear_sabor_salgados(text, date, date, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.bloquear_sabor_salgados(text, date, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.desbloquear_sabor_salgados(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desbloquear_sabor_salgados(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_compromisso_salgado(text, integer, date, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_compromisso_salgado(text, integer, date, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cobrir_compromissos_salgados(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vincular_sabor_estoque_produto(text, uuid, integer, text, text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vincular_sabor_estoque_produto(text, uuid, integer, text, text, boolean)
  TO authenticated;
REVOKE ALL ON FUNCTION public.desvincular_sabor_estoque_produto(text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desvincular_sabor_estoque_produto(text, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimento_sabor(text, uuid, text, integer, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.movimentar_lote_salgado(text, uuid, text, integer, uuid, uuid, text, date, date, text, integer, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.movimentar_lote_salgado(text, uuid, text, integer, uuid, uuid, text, date, date, text, integer, uuid)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 16. Histórico versionado (reconciliação desta revisão, não reaplicação cega)
-- -----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261126190000',
  'vinculos_operacionais_salgados',
  ARRAY[$mig$-- 0129 revisão 27/11/2026: identidade por chave canônica, sem vínculos automáticos,
-- margem configurável, controle de lotes, solicitações, bloqueios e compromissos futuros.
-- Aplicar somente em homologação com destino explícito.$mig$]::text[]
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
