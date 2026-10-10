-- 0063: RLS de UPDATE restrita ao motoboy dono + aceite atômico (K5 Fase 5).
-- PROBLEMA (auditoria K3/K4): a policy "pedidos update staff" (0000:168)
-- permite a QUALQUER motoboy atualizar pedidos com motoboy_id IS NULL,
-- inclusive status — e o guard 0005 só barra colunas de valores.
-- MODELO VERIFICADO (código local, sem presunção):
--   - pedidos.motoboy_id uuid REFERENCES auth.users(id) (0000:147) ->
--     motoboy_id É auth.uid() diretamente (aceitar: motoboy.tsx:161;
--     finalizar conta por motoboy_id = user.id: motoboy.tsx:202);
--   - vínculo cadastro<->login em motoboys.user_id (0032).
-- MUDANÇAS (aditivas na prática; DROP+CREATE só nas policies indicadas):
--   1) "pedidos update staff": SEM o braço motoboy-IS-NULL. Motoboy só
--      atualiza pedido com motoboy_id = auth.uid(). Demais braços
--      (admin, producao, dono-de-recebido) idênticos ao original.
--   2) Nova policy "pedidos motoboy claim": permite SÓ o aceite legítimo —
--      linha sem dono e pronta/aguardando, resultando em dono próprio e
--      status aguardando_motoboy (espelha motoboy.tsx:aceitar).
--   3) Guard pedidos_guard_update (OR REPLACE, mesmo trigger): motoboy
--      passa se (a) já é o dono e não toca valores/identidade (regra
--      antiga, preserva iniciar/finalizar/atraso/base), OU (b) é aceite
--      legítimo (sem dono -> próprio, pronto/aguardando -> aguardando)
--      com TODAS as demais colunas congeladas (só motoboy_id, aceito_em
--      e status podem mudar). RLS não compara OLD x NEW — por isso a
--      proteção de colunas vive neste trigger BEFORE (que enxerga ambos),
--      sem criar trigger novo (sem duplicidade/recursão).
--      Demais ramos (staff bypass, dono-cancela) idênticos ao 0005.
-- PRESERVADO: descoberta de entregas (SELECT com IS NULL intacto, 0000 e
-- 0041), aceite, iniciar (GPS), finalizar, atraso, base, cliente cancela,
-- produção, atendente, admin. GRANTs inalterados.
-- Idempotente (DROP IF EXISTS + OR REPLACE). NÃO aplicar sem autorização.

-- 1) UPDATE staff sem o braço motoboy-sem-dono
DROP POLICY IF EXISTS "pedidos update staff" ON public.pedidos;
CREATE POLICY "pedidos update staff" ON public.pedidos FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'producao')
  OR (public.has_role(auth.uid(),'motoboy') AND motoboy_id = auth.uid())
  OR (user_id = auth.uid() AND status = 'recebido')
);

-- 2) Aceite atômico: sem dono + pronto/aguardando -> próprio + aguardando
DROP POLICY IF EXISTS "pedidos motoboy claim" ON public.pedidos;
CREATE POLICY "pedidos motoboy claim" ON public.pedidos FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'motoboy')
  AND motoboy_id IS NULL
  AND status IN ('pronto','aguardando_motoboy')
)
WITH CHECK (
  motoboy_id = auth.uid()
  AND status = 'aguardando_motoboy'
);

-- 3) Guard endurecido para motoboy (dono próprio ou aceite legítimo)
CREATE OR REPLACE FUNCTION public.pedidos_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'producao')
     OR public.has_role(auth.uid(),'atendente')
     OR public.has_role(auth.uid(),'financeiro') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(),'motoboy') THEN
    -- (a) Dono opera o próprio pedido sem tocar valores/identidade
    IF OLD.motoboy_id = auth.uid()
      AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
      AND NEW.taxa_entrega IS NOT DISTINCT FROM OLD.taxa_entrega
      AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto
      AND NEW.total IS NOT DISTINCT FROM OLD.total
      AND NEW.cupom IS NOT DISTINCT FROM OLD.cupom
      AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
      AND NEW.numero IS NOT DISTINCT FROM OLD.numero
      AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
      AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone THEN
      RETURN NEW;
    END IF;
    -- (b) Aceite legítimo: sem dono -> próprio, pronto/aguardando ->
    -- aguardando, com todo o resto congelado (só motoboy_id, aceito_em
    -- e status mudam; observacoes, endereço, valores, pagamento etc. não).
    IF OLD.motoboy_id IS NULL
      AND NEW.motoboy_id = auth.uid()
      AND OLD.status IN ('pronto','aguardando_motoboy')
      AND NEW.status = 'aguardando_motoboy'
      AND NEW.id IS NOT DISTINCT FROM OLD.id
      AND NEW.numero IS NOT DISTINCT FROM OLD.numero
      AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
      AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
      AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
      AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco
      AND NEW.bairro IS NOT DISTINCT FROM OLD.bairro
      AND NEW.complemento IS NOT DISTINCT FROM OLD.complemento
      AND NEW.referencia IS NOT DISTINCT FROM OLD.referencia
      AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
      AND NEW.forma_pagamento IS NOT DISTINCT FROM OLD.forma_pagamento
      AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
      AND NEW.taxa_entrega IS NOT DISTINCT FROM OLD.taxa_entrega
      AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto
      AND NEW.total IS NOT DISTINCT FROM OLD.total
      AND NEW.cupom IS NOT DISTINCT FROM OLD.cupom
      AND NEW.producao_status IS NOT DISTINCT FROM OLD.producao_status
      AND NEW.taxa_motoboy IS NOT DISTINCT FROM OLD.taxa_motoboy
      AND NEW.destino_lat IS NOT DISTINCT FROM OLD.destino_lat
      AND NEW.destino_lng IS NOT DISTINCT FROM OLD.destino_lng
      AND NEW.motoboy_lat IS NOT DISTINCT FROM OLD.motoboy_lat
      AND NEW.motoboy_lng IS NOT DISTINCT FROM OLD.motoboy_lng
      AND NEW.motoboy_atualizado_em IS NOT DISTINCT FROM OLD.motoboy_atualizado_em
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
      AND NEW.entregue_em IS NOT DISTINCT FROM OLD.entregue_em
      AND NEW.cidade IS NOT DISTINCT FROM OLD.cidade
      AND NEW.tipo_entrega IS NOT DISTINCT FROM OLD.tipo_entrega
      AND NEW.pagamento_status IS NOT DISTINCT FROM OLD.pagamento_status
      AND NEW.pagamento_em IS NOT DISTINCT FROM OLD.pagamento_em
      AND NEW.atrasado IS NOT DISTINCT FROM OLD.atrasado
      AND NEW.problema IS NOT DISTINCT FROM OLD.problema
      AND NEW.agendamento_janela IS NOT DISTINCT FROM OLD.agendamento_janela
      AND NEW.preparo_em IS NOT DISTINCT FROM OLD.preparo_em
      AND NEW.pronto_em IS NOT DISTINCT FROM OLD.pronto_em
      AND NEW.saiu_em IS NOT DISTINCT FROM OLD.saiu_em
      AND NEW.atraso_motivo IS NOT DISTINCT FROM OLD.atraso_motivo
      AND NEW.atraso_descricao IS NOT DISTINCT FROM OLD.atraso_descricao
      AND NEW.pode_subir IS NOT DISTINCT FROM OLD.pode_subir
      AND NEW.tipo_imovel IS NOT DISTINCT FROM OLD.tipo_imovel
      AND NEW.bloco IS NOT DISTINCT FROM OLD.bloco
      AND NEW.apartamento IS NOT DISTINCT FROM OLD.apartamento
      AND NEW.torre IS NOT DISTINCT FROM OLD.torre
      AND NEW.andar IS NOT DISTINCT FROM OLD.andar
      AND NEW.interfone IS NOT DISTINCT FROM OLD.interfone
      AND NEW.rota_id IS NOT DISTINCT FROM OLD.rota_id
      AND NEW.impresso IS NOT DISTINCT FROM OLD.impresso
      AND NEW.origem_parceiro_id IS NOT DISTINCT FROM OLD.origem_parceiro_id
      AND NEW.indicado_por IS NOT DISTINCT FROM OLD.indicado_por
      AND NEW.cpf_cnpj IS NOT DISTINCT FROM OLD.cpf_cnpj
      AND NEW.nome_fiscal IS NOT DISTINCT FROM OLD.nome_fiscal
      AND NEW.origem_cliente IS NOT DISTINCT FROM OLD.origem_cliente
      AND NEW.cep IS NOT DISTINCT FROM OLD.cep
      AND NEW.confirmado_em IS NOT DISTINCT FROM OLD.confirmado_em
      AND NEW.pago_em IS NOT DISTINCT FROM OLD.pago_em
      AND NEW.agendado_para IS NOT DISTINCT FROM OLD.agendado_para
      AND NEW.agendamento_obs IS NOT DISTINCT FROM OLD.agendamento_obs
      AND NEW.tipo_evento IS NOT DISTINCT FROM OLD.tipo_evento
      AND NEW.campanha_origem IS NOT DISTINCT FROM OLD.campanha_origem THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'motoboy_sem_atribuicao';
  END IF;

  -- cliente: apenas cancelar o próprio pedido recebido, sem alterar mais nada
  IF OLD.user_id = auth.uid() AND OLD.status = 'recebido' AND NEW.status = 'cancelado'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.numero IS NOT DISTINCT FROM OLD.numero
     AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
     AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
     AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco
     AND NEW.bairro IS NOT DISTINCT FROM OLD.bairro
     AND NEW.complemento IS NOT DISTINCT FROM OLD.complemento
     AND NEW.referencia IS NOT DISTINCT FROM OLD.referencia
     AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
     AND NEW.forma_pagamento IS NOT DISTINCT FROM OLD.forma_pagamento
     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.taxa_entrega IS NOT DISTINCT FROM OLD.taxa_entrega
     AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.cupom IS NOT DISTINCT FROM OLD.cupom
     AND NEW.cidade IS NOT DISTINCT FROM OLD.cidade
     AND NEW.producao_status IS NOT DISTINCT FROM OLD.producao_status
     AND NEW.motoboy_id IS NOT DISTINCT FROM OLD.motoboy_id
     AND NEW.taxa_motoboy IS NOT DISTINCT FROM OLD.taxa_motoboy
     AND NEW.agendado_para IS NOT DISTINCT FROM OLD.agendado_para
     AND NEW.agendamento_obs IS NOT DISTINCT FROM OLD.agendamento_obs
     AND NEW.tipo_evento IS NOT DISTINCT FROM OLD.tipo_evento
     AND NEW.campanha_origem IS NOT DISTINCT FROM OLD.campanha_origem
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.destino_lat IS NOT DISTINCT FROM OLD.destino_lat
     AND NEW.destino_lng IS NOT DISTINCT FROM OLD.destino_lng
     AND NEW.motoboy_lat IS NOT DISTINCT FROM OLD.motoboy_lat
     AND NEW.motoboy_lng IS NOT DISTINCT FROM OLD.motoboy_lng
     AND NEW.motoboy_atualizado_em IS NOT DISTINCT FROM OLD.motoboy_atualizado_em
     AND NEW.aceito_em IS NOT DISTINCT FROM OLD.aceito_em
     AND NEW.entregue_em IS NOT DISTINCT FROM OLD.entregue_em THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'operacao_nao_permitida';
END; $$;

COMMENT ON POLICY "pedidos motoboy claim" ON public.pedidos IS
  '0063: só aceite atômico (sem dono -> próprio). UPDATE geral exige dono.';
