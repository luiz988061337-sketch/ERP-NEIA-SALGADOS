-- ============================================================================
-- PASSO-5f - 0012_recorrencia.sql (rode sozinho)
-- RODE CADA ARQUIVO EM UM "New query" SEPARADO (um Run por arquivo).
-- ============================================================================


-- 0012: pedidos recorrentes (nunca auto-confirmados; confirmação sempre manual)
-- Rode no SQL Editor do Supabase APÓS 0000–0011. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

CREATE TABLE IF NOT EXISTS public.pedidos_recorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  forma_pagamento text NOT NULL DEFAULT 'pix',
  itens jsonb NOT NULL DEFAULT '[]',
  frequencia text NOT NULL DEFAULT 'semanal',
  proxima_execucao date NOT NULL DEFAULT CURRENT_DATE,
  modo_confirmacao text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rec_frequencia CHECK (frequencia IN ('semanal','quinzenal','mensal')),
  CONSTRAINT rec_status CHECK (status IN ('ativo','pausado','cancelado')),
  CONSTRAINT rec_modo CHECK (modo_confirmacao IN ('manual','whatsapp'))
);
CREATE INDEX IF NOT EXISTS rec_proxima_idx ON public.pedidos_recorrentes (proxima_execucao) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS rec_user_idx ON public.pedidos_recorrentes (user_id, status);

ALTER TABLE public.pedidos_recorrentes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pedidos_recorrentes TO service_role;
GRANT ALL ON public.pedidos_recorrentes TO authenticated;

DROP POLICY IF EXISTS "recorrentes own" ON public.pedidos_recorrentes;
CREATE POLICY "recorrentes own" ON public.pedidos_recorrentes FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));

