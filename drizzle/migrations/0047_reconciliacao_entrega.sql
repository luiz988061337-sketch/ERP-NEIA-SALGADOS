-- 0047: reconciliação entrega/fiscal (pós 0044–0046).
-- Corrige 3 problemas reais que quebrariam produção:
--   (a) pedidos.motoboy_id guarda auth.users.id (não motoboys.id) — os triggers
--       0045 nunca achavam o motoboy e a escrita no histórico estourava FK,
--       abortando a saída para entrega;
--   (b) trigger_validar_endereco disparava em QUALQUER update (inclusive mudança
--       de status pelo motoboy) e barrava pedidos legados sem cidade;
--   (c) o front grava motivos novos (chuva/veiculo/endereco) mas o CHECK 0024 só
--       aceitava os nomes antigos — o atraso falhava no banco.
-- Idempotente. Rode APÓS 0046.

-- =============================================
-- 1. Garante os enums da 0044 (reexecutável)
-- =============================================
DO $$ BEGIN
  CREATE TYPE public.motoboy_status AS ENUM (
    'disponivel_base', 'preparando_saida', 'em_rota',
    'retornando_base', 'aguardando_nova_rota', 'offline'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.atraso_motivo AS ENUM (
    'transito', 'chuva', 'veiculo', 'endereco',
    'cliente_ausente', 'espera', 'acidente_bloqueio', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. Normaliza motivos legados + CHECK no vocabulário atual
-- =============================================
UPDATE public.pedidos SET atraso_motivo = 'chuva' WHERE atraso_motivo = 'chuva_via';
UPDATE public.pedidos SET atraso_motivo = 'veiculo' WHERE atraso_motivo = 'problema_veiculo';
UPDATE public.pedidos SET atraso_motivo = 'endereco' WHERE atraso_motivo IN ('endereco_dificil', 'problema_endereco');

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_atraso_motivo_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_atraso_motivo_check CHECK (
  atraso_motivo IS NULL OR atraso_motivo IN (
    'transito', 'chuva', 'veiculo', 'endereco',
    'cliente_ausente', 'espera', 'acidente_bloqueio', 'outro'
  )
);

-- =============================================
-- 3. Colunas do modelo 0044 que faltam em motoboys (0017)
-- =============================================
ALTER TABLE public.motoboys
  ADD COLUMN IF NOT EXISTS veiculo text,
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS ultima_atualizacao timestamptz NOT NULL DEFAULT now();

-- =============================================
-- 4a. validar_endereco: só em colunas de endereço (nunca em troca de status)
-- =============================================
CREATE OR REPLACE FUNCTION public.validar_endereco_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo_entrega = 'entrega' THEN
    IF NEW.endereco IS NULL OR NEW.endereco = '' THEN
      RAISE EXCEPTION 'Endereço é obrigatório para entrega';
    END IF;
    IF NEW.bairro IS NULL OR NEW.bairro = '' THEN
      RAISE EXCEPTION 'Bairro é obrigatório para entrega';
    END IF;
    IF NEW.cidade IS NULL OR NEW.cidade = '' THEN
      RAISE EXCEPTION 'Cidade é obrigatória para entrega';
    END IF;
    IF NEW.tipo_imovel = 'apartamento' THEN
      IF NEW.apartamento IS NULL OR NEW.apartamento = '' THEN
        RAISE EXCEPTION 'Número do apartamento é obrigatório';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_endereco ON public.pedidos;
CREATE TRIGGER trigger_validar_endereco
  BEFORE INSERT OR UPDATE OF tipo_entrega, endereco, bairro, cidade, tipo_imovel, apartamento
  ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_endereco_entrega();

-- =============================================
-- 4b. saída/entrega: resolve motoboy via user_id (pedidos.motoboy_id é
-- auth.users.id, conforme 0000 + motoboy.tsx). Sem vínculo, só troca o
-- status sem histórico (nunca aborta a entrega por FK).
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_saida_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mb uuid;
BEGIN
  IF NEW.status = 'em_rota' AND OLD.status = 'aguardando_motoboy' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      UPDATE public.motoboys
      SET status = 'em_rota',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'saida_base',
        'Iniciou rota de entrega para pedido #' || NEW.numero
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_entrega_motoboy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mb uuid;
  v_restam integer;
BEGIN
  IF NEW.status = 'entregue' AND OLD.status = 'em_rota' AND NEW.motoboy_id IS NOT NULL THEN
    SELECT id INTO v_mb FROM public.motoboys WHERE user_id = NEW.motoboy_id;
    IF v_mb IS NOT NULL THEN
      UPDATE public.motoboys
      SET status = 'retornando_base',
          ultima_atualizacao = now()
      WHERE id = v_mb;

      INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
      VALUES (
        v_mb,
        NULL,
        NEW.id,
        'entrega_realizada',
        'Entregue pedido #' || NEW.numero || ' para ' || NEW.cliente_nome
      );

      SELECT count(*) INTO v_restam FROM public.pedidos
      WHERE motoboy_id = NEW.motoboy_id
        AND status IN ('em_rota', 'aguardando_motoboy');

      IF v_restam = 0 THEN
        UPDATE public.motoboys
        SET status = 'aguardando_nova_rota',
            ultima_atualizacao = now()
        WHERE id = v_mb;

        INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
        VALUES (
          v_mb,
          NULL,
          NEW.id,
          'retorno_base',
          'Retornando à base - sem mais pedidos em rota'
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_saida_motoboy ON public.pedidos;
CREATE TRIGGER trigger_saida_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_saida_motoboy();

DROP TRIGGER IF EXISTS trigger_entrega_motoboy ON public.pedidos;
CREATE TRIGGER trigger_entrega_motoboy
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_entrega_motoboy();

COMMENT ON TRIGGER trigger_validar_endereco ON public.pedidos IS 'Escopo restrito a colunas de endereço (0047): troca de status nunca é barrada por endereço legado.';
