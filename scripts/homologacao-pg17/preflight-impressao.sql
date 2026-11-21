-- Somente leitura. Executar em staging identificado, com o esquema public acessível.
-- Não infere migrations aplicadas pelo nome de arquivo nem por um único objeto.
BEGIN READ ONLY;

SELECT
  to_regclass('public.pix_notification_events') IS NOT NULL AS eventos_pix,
  to_regclass('public.pix_reader_devices') IS NOT NULL AS dispositivos_pix,
  to_regprocedure('public.enfileirar_cupom(uuid)') IS NOT NULL AS enfileirar_cupom,
  to_regprocedure('public.gerar_cupons_pedidos_pagos()') IS NOT NULL AS reprocessamento,
  to_regprocedure('public.handle_pagamento_confirmado()') IS NOT NULL AS funcao_legada_pagamento,
  to_regprocedure('public.gerar_cupom_pedido()') IS NOT NULL AS funcao_legada_cupom;

SELECT rel.relname AS tabela, t.tgname AS trigger, t.tgenabled AS habilitado,
       pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
  AND rel.relname IN ('pedidos', 'pedido_itens')
  AND NOT t.tgisinternal
  AND t.tgname ~ '(cupom|pagamento_confirmado)'
ORDER BY rel.relname, t.tgname;

ROLLBACK;
