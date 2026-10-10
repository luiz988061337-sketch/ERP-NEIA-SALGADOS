# Baseline 0000→0059 (staging zerado, fail-fast)

Aplique **um arquivo por `New query`**, nesta ordem exata, conferindo
`Success` em cada um. Qualquer erro **para a sequência** (sem `WARNING`
abafador — ver `gerar-bootstrap.mjs`, proibido aqui).

Exceção conhecida: `0003_operacao.sql` contém `ALTER TYPE ... ADD VALUE`
(papéis `atendente`, `financeiro`), que **não roda dentro de transação**.
Rode essas 2 linhas sozinhas, uma por vez, e depois o resto do arquivo.

## Ordem (58 arquivos)

```
0000_neia_salgados_schema.sql
0001_migration.sql
0001_neia_tipos_crm.sql
0002_itens_rls.sql
0002_secure_loyalty_and_partners.sql
0003_operacao.sql            ← enum isolado (ver acima)
0004_inteligencia.sql
0005_hardening.sql
0006_recorrencia.sql
0007_orcamento_validade.sql
0008_atendimento.sql
0009_b2b.sql
0010_resgate.sql
0011_papeis.sql
0012_recorrencia.sql
0013_cliques.sql
0014_fidelidade.sql
0015_hero_carousel.sql
0016_calculadora_config.sql
0017_motoboys.sql
0018_tipo_entrega.sql
0019_orcamento_contato.sql
0020_storage_hero.sql
0021_loja_config.sql
0022_pagamento_status.sql
0023_base_operacional.sql
0024_entrega.sql
0025_impressao.sql
0026_cozinha.sql
0027_lembretes.sql
0028_crm_experiencia.sql
0029_loja_pix.sql
0030_reserva_atomica.sql
0031_reserva_grants.sql
0032_entrega_fase3.sql
0033_fiscal_base.sql
0034_fila_cliente.sql
0035_loja_social.sql
0036_fritura_produto.sql
0037_pedidos_cep.sql
0038_cardapio_sabores.sql
0039_tipo_venda_produto.sql
0040_pedido_cidade_status.sql
0041_status_transicoes_rls.sql
0042_estoque_reserva_fefo.sql
0043_fritura_fila.sql
0044_motoboy_rotas.sql
0045_entrega_apartamento.sql
0046_fiscal_integracao.sql
0047_reconciliacao_entrega.sql
0048_combo_sem_produto.sql
0049_dedup_uniques.sql
0050_estoque_unico.sql
0051_grants_faltantes.sql
0052_tempo_fritura_blocos.sql
0053_historico_dono.sql
0054_push_subscriptions.sql
0055_push_staff_read.sql
0056_desativa_trigger_fefo_status.sql
0057_desativa_reserva_lotes_preparo.sql
0058_parceiros_publicos_view_fix.sql
0059_prazos_atendimento.sql
```

Notas:

- `meta/_journal.json` para em `0002` — **não** usar como controle.
- `PASSO-4-bootstrap-completo.sql` para em `0055` e abafa falhas — **não** usar.
- `0001_*`/`0002_*` duplicados: aplicar ambos, na ordem acima.
- `0056`+`0057` removem o mesmo trigger (redundância documentada): aplicar ambos.
- Após a baseline, rodar os blocos K5.6 (A–H) e só então iniciar
  `verify-0056-0057.sql` → … → `verify-0064.sql`.
