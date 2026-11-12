-- 0104_notificacoes_whatsapp.sql
-- FASE 6 — Auditoria/idempotência das notificações de status (push + WhatsApp).
--
-- NÃO APLICADA NO BANCO REAL. Esta migration deve ser aplicada em ambiente de
-- testes/homologação antes de qualquer ativação. Nada no código escreve na
-- tabela em produção até a integração do WhatsApp ser autorizada.
--
-- Objetivo:
--   • Registrar TODA tentativa de notificação (canal, resultado, mensagem).
--   • Chave de idempotência (pedido + status + canal + dia) evita mensagens
--     duplicadas em reenvios/refresh da página de operação.
--   • Sem cliente de produção afetado: a tabela serve de trilha de auditoria.

CREATE TABLE IF NOT EXISTS public.notificacoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  pedido_id uuid REFERENCES public.pedidos (id) ON DELETE SET NULL,
  status text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('push', 'whatsapp')),
  resultado text NOT NULL CHECK (resultado IN ('enviado', 'falhou', 'desativado', 'indisponivel', 'simulado')),
  mensagem text,
  telefone_norm text,
  idempotencia text NOT NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

-- Uma tentativa por (pedido, status, canal, dia): antiduplicidade por reenvio.
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_log_idem_idx
  ON public.notificacoes_log (idempotencia);

CREATE INDEX IF NOT EXISTS notificacoes_log_pedido_idx
  ON public.notificacoes_log (pedido_id, created_at DESC);

ALTER TABLE public.notificacoes_log ENABLE ROW LEVEL SECURITY;

-- Equipe operacional pode registrar e consultar a trilha; público: nada.
DROP POLICY IF EXISTS "notificacoes_log staff read" ON public.notificacoes_log;
CREATE POLICY "notificacoes_log staff read" ON public.notificacoes_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'motoboy')
  );

DROP POLICY IF EXISTS "notificacoes_log staff insert" ON public.notificacoes_log;
CREATE POLICY "notificacoes_log staff insert" ON public.notificacoes_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'motoboy')
  );

GRANT SELECT, INSERT ON public.notificacoes_log TO authenticated;
