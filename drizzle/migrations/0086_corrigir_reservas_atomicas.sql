-- 0086: corrigir reservas atômicas — compatibilidade com estoque_mov_tipo
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA.
-- NÃO executar sem autorização expressa. Revisão + staging antes de aplicar.
--
-- PROBLEMA (E1.7 — confirmado):
--   0030/0068 gravam em public.estoque_mov com tipo 'reserva' e
--   'liberacao_reserva'. A constraint estoque_mov_tipo (0003:36 — CONFIRMADA
--   no Supabase) aceita SOMENTE: entrada, saida, ajuste, perda, producao.
--   O INSERT viola o CHECK (SQLSTATE 23514) e, como a função não tem
--   EXCEPTION handler, a chamada inteira é abortada — inclusive o
--   UPDATE produtos.estoque e o INSERT reservas_estoque anteriores.
--   => as duas RPCs falham SEMPRE. No checkout, o fallback (insert direto em
--   reservas_estoque) é negado pela RLS "reservas staff" (0023:92-97) ao papel
--   'cliente', e o erro é engolido pelo catch => nada é reservado.
--
-- ESCOPO DESTA MIGRATION (mínimo e reversível):
--   - SOMENTE CREATE OR REPLACE nas duas funções (mesmas assinaturas/retornos).
--   - Preserva 100% da autorização, idempotência e busca de dados da 0068.
--   - NÃO altera tabelas, constraints, triggers, RLS, grants ou dados.
--   - Altera APENAS o `tipo` gravado em estoque_mov, para valores VÁLIDOS.
--
-- DECISÃO DE LEDGER (por que NÃO rotear para estoque_movimentacoes aqui):
--   A rota "canônica" (estoque_movimentacoes: enum tipo_mov_estoque + saldos
--   anterior/posterior) está BLOQUEADA por dúvidas técnicas abertas ainda não
--   resolvidas — ver seção BLOQUEADORES no fim do arquivo. Enquanto isso,
--   mantém-se o ledger atual (estoque_mov) com valores permitidos: é a
--   correção mínima, sem DDL, sem tocar dados e trivialmente reversível.
--
-- MAPEAMENTO DE TIPOS (estoque_mov.tipo — legado, texto + CHECK):
--   reserva            -> 'saida'    (baixa de estoque; motivo identifica a reserva)
--   liberacao_reserva  -> 'entrada'  (devolução de estoque)
--   O campo `motivo` mantém o nome do evento original para auditoria.
--
-- IDEMPOTÊNCIA (inalterada — herdada da 0068):
--   - reservar: desconta apenas o que ainda não está em reservas_estoque
--     com status 'ativa' (v_falta); repetir não debita duas vezes.
--   - liberar:  atua SOMENTE em linhas 'ativa'; repetir é no-op.
--
-- AUTORIZAÇÃO (inalterada — herdada da 0068):
--   - dono do pedido (pedidos.user_id = auth.uid(), ambos não nulos) OU
--     staff operacional (admin/producao/atendente); auth.uid() nulo => negado.
--   - status permitido: 'recebido' ou 'em_producao'; demais => sem efeito.
--
-- PERMISSÕES: CREATE OR REPLACE com a MESMA assinatura preserva a ACL vigente
--   (grants da 0031: EXECUTE a authenticated e service_role). Nenhum REVOKE
--   ou GRANT é emitido aqui.
--
-- ROLLBACK: reaplicar os corpos da 0068 (0068_auth_dono_staff.sql) via
--   CREATE OR REPLACE. Como esta migration não muda schema nem dados, a
--   reversão é total e não destrutiva.
--
-- DEPENDÊNCIAS: 0003 (estoque_mov), 0023 (reservas_estoque), 0031 (grants),
--   0068 (auth/idempotência, base copiada), 0000/0003 (order_status, has_role).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. reservar_estoque_atomica (assinatura preservada: uuid, uuid, integer -> boolean)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reservar_estoque_atomica(
  p_pedido_id uuid, p_produto_id uuid, p_qtd integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estoque integer;
  v_dono uuid;
  v_status public.order_status;
  v_eh_staff boolean;
  v_ja_reservado integer;
  v_falta integer;
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RETURN false; END IF;

  -- Pedido precisa existir; trava a linha do pedido (serializa retries).
  SELECT user_id, status INTO v_dono, v_status
  FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Autorização (0068): dono não-nulo ou staff operacional. Nunca só "logado".
  v_eh_staff := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente');
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN false;
    END IF;
  ELSIF v_dono IS DISTINCT FROM auth.uid() AND NOT v_eh_staff THEN
    RETURN false;
  END IF;

  -- Só reserva em estado válido.
  IF v_status NOT IN ('recebido', 'em_producao') THEN RETURN false; END IF;

  -- Idempotência (0068): desconta apenas o que ainda não foi reservado.
  SELECT COALESCE(SUM(quantidade), 0) INTO v_ja_reservado
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND produto_id = p_produto_id
    AND status = 'ativa';
  v_falta := p_qtd - v_ja_reservado;
  IF v_falta <= 0 THEN RETURN true; END IF;

  -- Lock da linha do produto: serializa reservas concorrentes.
  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_estoque < v_falta THEN RETURN false; END IF;
  UPDATE public.produtos SET estoque = estoque - v_falta WHERE id = p_produto_id;
  INSERT INTO public.reservas_estoque (pedido_id, produto_id, quantidade, status)
  VALUES (p_pedido_id, p_produto_id, v_falta, 'ativa');

  -- 0086: 'saida' é valor VÁLIDO em estoque_mov_tipo (antes: 'reserva', inválido).
  INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
  VALUES (p_produto_id, 'saida', v_falta, 'reserva pedido:' || p_pedido_id::text);

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) IS
  '0086: 0068 (auth dono/staff + idempotência) com tipo válido em estoque_mov (''saida'').';

-- ----------------------------------------------------------------------------
-- 2. liberar_reserva_atomica (assinatura preservada: uuid -> integer)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liberar_reserva_atomica(p_pedido_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; n integer := 0;
  v_dono uuid;
  v_eh_staff boolean;
BEGIN
  SELECT user_id INTO v_dono FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Autorização (0068): dono não-nulo ou staff operacional.
  v_eh_staff := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente');
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN 0;
    END IF;
  ELSIF v_dono IS DISTINCT FROM auth.uid() AND NOT v_eh_staff THEN
    RETURN 0;
  END IF;

  -- Só linhas 'ativa': repetir a chamada é no-op (idempotente).
  FOR r IN
    SELECT * FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id AND status = 'ativa'
    FOR UPDATE
  LOOP
    UPDATE public.produtos SET estoque = estoque + r.quantidade WHERE id = r.produto_id;
    UPDATE public.reservas_estoque SET status = 'liberada' WHERE id = r.id;

    -- 0086: 'entrada' é valor VÁLIDO (antes: 'liberacao_reserva', inválido).
    INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo)
    VALUES (r.produto_id, 'entrada', r.quantidade, 'liberacao_reserva pedido:' || p_pedido_id::text);

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.liberar_reserva_atomica(uuid) IS
  '0086: 0068 (auth dono/staff) com tipo válido em estoque_mov (''entrada''); só linhas ativa.';

-- ============================================================================
-- BLOQUEADORES — rota canônica (estoque_movimentacoes) NÃO implementada aqui
-- ============================================================================
-- A migração para a estrutura canônica foi INTERROMPIDA por dúvidas técnicas
-- abertas. Não decidir unilateralmente; resolver antes de escrever uma 0087.
--
-- B1) Colisão com liberar_reserva_pedido (0069).
--     Se reservar_estoque_atomica passar a gravar tipo='reserva' com
--     referencia_tipo='pedido' em estoque_movimentacoes, a função 0069
--     (liberar_reserva_pedido) passa a "ver" essas linhas no seu scan
--     (WHERE referencia_id=pedido AND referencia_tipo='pedido' AND tipo='reserva'
--      AND processada_em IS NULL) e emitiria uma SEGUNDA linha 'liberacao'
--     para a mesma reserva (dupla trilha) + marcaria processada_em.
--     -> depende de definir um referencia_tipo próprio (ex.: 'reserva_atomica')
--        ou um guard; é uma decisão de contrato canônico.
--
-- B2) Semântica de saldo em registrar_mov_estoque(..., p_atualizar_estoque=false).
--     A 0050 grava `saldo_posterior := saldo_anterior` no modo trilha (não
--     reflete a redução real já feita por 0030/0068). Portanto, para ter
--     saldo_anterior/saldo_posterior CORRETOS seria necessário INSERT direto
--     em estoque_movimentacoes (não via registrar_mov_estoque) — o que duplica
--     lógica e diverge do helper canônico. Decisão pendente.
--
-- B3) Overloads de registrar_mov_estoque.
--     Existem 2 assinaturas locais (8 args em 0042; 9 args em 0050). A
--     presença de ambas no banco real não é verificável apenas pelo repositório.
--     Qualquer dependência do helper deve ser confirmada em staging.
--
-- B4) Conviveência FEFO x atômica.
--     reservar_estoque_atomica reserva por produto_id (sem lote), enquanto o
--     subsistema FEFO (0042/0048/0050/0069) controla lotes.restante. Gravar
--     trilha 'reserva' sem lote pode divergir do controle de lotes.
--
-- B5) Histórico/relatórios.
--     A UI do admin lê estoque_mov (admin.tsx:2326). Migrar as reservas para
--     estoque_movimentacoes deixa os dois ledgers explicitamente separados —
--     exige um plano de consolidação (migração dedicada, com backup).
--
-- ESBOÇO (comentado, NÃO executar) — destino canônico, pendente de decisão:
--   -- INSERT INTO public.estoque_movimentacoes (
--   --   produto_id, lote_id, tipo, quantidade,
--   --   saldo_anterior, saldo_posterior,
--   --   referencia_id, referencia_tipo, usuario_id, observacao
--   -- ) VALUES (
--   --   p_produto_id, NULL, 'reserva', -v_falta,
--   --   v_estoque, v_estoque - v_falta,
--   --   p_pedido_id, 'reserva_atomica', auth.uid(), 'reserva pedido:' || p_pedido_id::text
--   -- );
--   -- (liberação: tipo 'liberacao', quantidade positiva, referencia_tipo idem)
--   -- REQUER: decisão sobre B1 (referencia_tipo), B2 (saldos), B4 (lotes) e
--   -- confirmação de B3 em staging.
-- ============================================================================
