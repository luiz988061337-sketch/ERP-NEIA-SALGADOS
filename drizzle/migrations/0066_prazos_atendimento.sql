-- 0066: prazos comerciais de atendimento em loja_config (Fase 1.6.4).
-- Retirada 40-60 min, entrega 60-90 min (valores iniciais = regra comercial atual).
-- Escopo: SOMENTE configuração. Nenhum consumidor (motor, producao, checkout,
-- vitrine) lê estas colunas ainda — a integração é a Fase 1.6.5.
-- Não cria tabela, não duplica loja_config, não altera RLS (políticas da 0021
-- já cobrem a tabela: SELECT público, UPDATE só admin). Idempotente.

ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS retirada_prazo_min integer NOT NULL DEFAULT 40;
ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS retirada_prazo_max integer NOT NULL DEFAULT 60;
ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS entrega_prazo_min integer NOT NULL DEFAULT 60;
ALTER TABLE public.loja_config ADD COLUMN IF NOT EXISTS entrega_prazo_max integer NOT NULL DEFAULT 90;

-- Validações básicas (sem rigidez excessiva: o admin pode alterar os prazos
-- no futuro, ex. retirada 30-50; só impede valores sem sentido).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loja_prazos_positivos_check') THEN
    ALTER TABLE public.loja_config ADD CONSTRAINT loja_prazos_positivos_check CHECK (
      retirada_prazo_min > 0 AND retirada_prazo_max > 0
      AND entrega_prazo_min > 0 AND entrega_prazo_max > 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loja_prazos_ordem_check') THEN
    ALTER TABLE public.loja_config ADD CONSTRAINT loja_prazos_ordem_check CHECK (
      retirada_prazo_min <= retirada_prazo_max
      AND entrega_prazo_min <= entrega_prazo_max
    );
  END IF;
END;
$$;

COMMENT ON COLUMN public.loja_config.retirada_prazo_min IS
  'Prazo comercial mínimo da retirada em minutos (promessa ao cliente, não é tempo técnico).';
COMMENT ON COLUMN public.loja_config.entrega_prazo_max IS
  'Prazo comercial máximo da entrega em minutos (promessa ao cliente, não é tempo técnico).';
