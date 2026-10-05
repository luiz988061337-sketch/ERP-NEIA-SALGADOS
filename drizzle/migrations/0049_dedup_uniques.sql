-- 0049: unicidades que faltavam (idempotência real + sem fritar 2x).
--   (a) fritura_fila sem UNIQUE: o ON CONFLICT DO NOTHING nunca disparava e,
--       como 0041 permite voltar em_producao→recebido, reconfirmar o pedido
--       enfileirava tudo de novo (cozinha frita em dobro). Agora 1 linha por
--       pedido+produto.
--   (b) ajuda_artigos sem UNIQUE: reaplicar 0028 duplicava os 5 artigos.
-- Idempotente (dedup por ctid antes da constraint). Rode APÓS 0048.

-- (a) fritura_fila: mantém a linha mais antiga por pedido+produto
DELETE FROM public.fritura_fila a
USING public.fritura_fila b
WHERE a.ctid < b.ctid
  AND a.pedido_id = b.pedido_id
  AND a.produto_id IS NOT DISTINCT FROM b.produto_id;

ALTER TABLE public.fritura_fila
  DROP CONSTRAINT IF EXISTS fritura_fila_pedido_produto_key;
ALTER TABLE public.fritura_fila
  ADD CONSTRAINT fritura_fila_pedido_produto_key UNIQUE (pedido_id, produto_id);

-- (b) ajuda_artigos: mantém o artigo mais antigo por categoria+título
DELETE FROM public.ajuda_artigos a
USING public.ajuda_artigos b
WHERE a.ctid < b.ctid
  AND a.categoria = b.categoria
  AND a.titulo = b.titulo;

ALTER TABLE public.ajuda_artigos
  DROP CONSTRAINT IF EXISTS ajuda_artigos_categoria_titulo_key;
ALTER TABLE public.ajuda_artigos
  ADD CONSTRAINT ajuda_artigos_categoria_titulo_key UNIQUE (categoria, titulo);

COMMENT ON CONSTRAINT fritura_fila_pedido_produto_key ON public.fritura_fila
  IS '0049: 1 linha por pedido+produto — reconfirmar nunca frita em dobro.';
