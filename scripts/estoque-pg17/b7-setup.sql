-- Fixture local descartável do B7. Nunca aplicar em homologação ou produção.
-- Cria produtos com estoque legado (usado pela base 0095/0103) e lotes reais
-- (usados pela classificação da corretiva). Todas as identidades são fixas.
BEGIN;

INSERT INTO public.produtos (id, categoria_id, nome, preco, estoque, tipo_venda, disponivel)
SELECT
  md5('b7:produto:' || v.chave)::uuid,
  (SELECT id FROM public.categorias WHERE slug = 'categoria-teste-estoque' LIMIT 1),
  'B7 ' || v.chave,
  10,
  v.estoque,
  'unidade'::public.tipo_venda,
  true
FROM (VALUES
  ('coxinha', 1000),
  ('pizza', 1000)
) v(chave, estoque)
ON CONFLICT (id) DO UPDATE SET
  estoque = EXCLUDED.estoque,
  preco = EXCLUDED.preco,
  disponivel = true;

UPDATE public.sabores_estoque
   SET produto_id = md5('b7:produto:coxinha')::uuid
 WHERE chave = 'coxinha-frango';
UPDATE public.sabores_estoque
   SET produto_id = md5('b7:produto:pizza')::uuid
 WHERE chave = 'pizza-queijo';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.configurar_salgado_estoque('coxinha-frango', 100, 0, true, NULL);
  IF v->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'b7-setup: configurar coxinha falhou: %', v;
  END IF;
  v := public.configurar_salgado_estoque('pizza-queijo', 100, 0, true, NULL);
  IF v->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'b7-setup: configurar pizza falhou: %', v;
  END IF;

  IF public.movimentar_lote_salgado(
    p_sabor => 'coxinha-frango', p_produto => NULL, p_tipo => 'entrada',
    p_quantidade => 80, p_chave => md5('b7:lote:coxinha-1')::uuid,
    p_codigo => 'B7-FEFO-1', p_fabricacao => DATE '2026-11-20',
    p_validade => DATE '2027-01-31', p_observacao => 'Fixture local B7'
  ) NOT IN ('registrado', 'ja_registrado') THEN
    RAISE EXCEPTION 'b7-setup: lote FEFO-1 falhou';
  END IF;

  IF public.movimentar_lote_salgado(
    p_sabor => 'coxinha-frango', p_produto => NULL, p_tipo => 'entrada',
    p_quantidade => 70, p_chave => md5('b7:lote:coxinha-2')::uuid,
    p_codigo => 'B7-FEFO-2', p_fabricacao => DATE '2026-11-21',
    p_validade => DATE '2027-02-28', p_observacao => 'Fixture local B7'
  ) NOT IN ('registrado', 'ja_registrado') THEN
    RAISE EXCEPTION 'b7-setup: lote FEFO-2 falhou';
  END IF;
END $$;

RESET ROLE;
COMMIT;
