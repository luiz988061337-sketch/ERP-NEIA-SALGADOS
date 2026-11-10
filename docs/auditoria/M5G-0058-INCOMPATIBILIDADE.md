# Migration 0058 — Incompatibilidade com o Baseline Atual (M5G-1A)

**Status: DOCUMENTAÇÃO APENAS.** Nenhuma ação foi tomada sobre
`drizzle/migrations/0058_gerar_cupom_apos_itens.sql`: o arquivo **não foi
executado, editado ou removido** (etapa M5G-1A, etapa G.1/M5G-A).

## Contexto

A auditoria M5G-A identificou que o staging de homologação, registrado em
`docs/auditoria/homologacao-staging/baseline/baseline-0086.full.sql`, **já
implementa** a funcionalidade que a 0058 propõe — em versão mais completa e
com correções posteriores. Aplicar a 0058 sobre esse baseline equivaleria a
sobrescrever o pipeline ativo por uma versão anterior e defeituosa.

## Evidências

### 1. Bug de sintaxe (falha no meio da migration)

`0058_gerar_cupom_apos_itens.sql:182`, dentro de
`public.handle_pagamento_confirmado()`:

```sql
PERFORM PERFORM set_config('app.pedido_id', NULL, false);
```

`PERFORM PERFORM` é sintaxe PL/pgSQL inválida (duplo PERFORM). Como a
migration é executada em ordem, as instruções anteriores (recriação da função
`gerar_cupom_pedido()` e do trigger `trigger_gerar_cupom_apos_itens`) **já
teriam sido aplicadas** antes do erro — restando estado inconsistente:
- 0058 linhas 19–164: cria `gerar_cupom_pedido()` (versão sem guardas do baseline);
- 0058 linhas 169–174: recria o trigger sobre `pedido_itens`;
- 0058 linha 182: **falha** — `handle_pagamento_confirmado` e
  `trigger_pagamento_confirmado` nunca são criados.

### 2. Triggers concorrentes de mesmo nome (sobrescrita)

| Nome | Origem | Situação no baseline-0086 |
|---|---|---|
| `trigger_gerar_cupom_apos_itens` | 0058:169–174 (`NEW TABLE`) | Baseline define `trg_gerar_cupom_apos_itens` (`baseline:2105–2117`, def. em `:6971`) chamando `enfileirar_cupom()` |
| `trigger_pagamento_confirmado` | 0058:199–204 | Baseline define `trg_pagamento_confirmado` (`:2124–2134`, def. `:6985`) |

A 0058 faria `DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens` — nome
diferente do `trg_*` do baseline, então os triggers do baseline
**sobreviveriam**; o resultado seriam **dois** pipelines ativos: o original
(`enfileirar_cupom`, correto) e o novo (`gerar_cupom_pedido`, versão antiga),
ambos disputando o mesmo `trabalho_uuid = '<pedido>:pedido'`. O que venceria
dependeria de ordem de execução/inserção — comportamento imprevisível para
formato do cupom.

### 3. Divergência semântica

A 0058 (`gerar_cupom_pedido`) regressa recursos já consolidados no baseline
(`enfileirar_cupom`, `baseline:769–855`):

| Regra | 0058 | baseline-0086 |
|---|---|---|
| Pagamento `na_entrega` gera cupom? | Não (exige `pagamento_status = 'pago'` para toda modalidade, `:80-85`) | Sim, isento (`:799-803`) |
| Pedido cancelado bloqueia? | Não (sem guard) | Sim (`:791-793`) |
| Agendamento (`imprimir_apos`) | Ignorado | Trigger `adiar_cupom_agendado` (`:300–322`, `:6929`) |
| Idempotência | `ON CONFLICT (trabalho_uuid)` | mesmo, + guardas |

### 4. Estado do cliente (front-end) já consistente com o pipeline do banco

`src/routes/checkout.tsx` **não possui mais** INSERT manual em
`fila_impressao` (auditoria M5G-A, sessão PDV/Checkout): a remoção ocorreu
conforme `RELATORIO_FINAL_0058.md:235–246`. O único resíduo — `payloadCozinha`
construído e nunca usado — **foi removido na etapa M5G-1A** (tarefa 4), junto
com os imports mortos (`textoCupom`, `tempoFritura`).

O efeito real da remoção: nenhum. Prova: a variável tinha **uma única
ocorrência** no arquivo (atribuição), nenhuma leitura posterior, nenhum
insert em `fila_impressao` no checkout; `textoCupom` é função pura (apenas
concatenação de strings); a fila do pedido é criada exclusivamente no servidor
(`enfileirar_cupom` via triggers do baseline). Impressões de conferência
continuam disponíveis em `/impressao`, Produção (`impressaoDireta`) e Admin
(`impressao.ts:129–175`).

## Conclusão e encaminhamento

1. **NÃO aplicar a 0058** no estado atual do banco staging/produção. Se algum
   ambiente corre o risco de executá-la por engano (ex.: rotina que varre
   `drizzle/migrations/`), a remoção/renomeação do arquivo depende de
   autorização formal — **não será feita sem ordem expressa**.
2. A necessidade original que motivou a 0058 ("garantir cupom com itens
   reais, sem INSERT manual no cliente") já está atendida pelo baseline.
3. Se no futuro a 0058 for considerada, deve ser **reescrita**: corrigir
   `PERFORM PERFORM`, adotar os nomes/trigger do baseline (`trg_*`), incluir
   guardas de cancelado/`na_entrega`/agendamento, e validar em ambiente de
   staging antes de qualquer produção.

## Histórico

| Etapa | Ação |
|---|---|
| M5G-A | Auditoria identifica conflito e o bug de sintaxe |
| M5G-1A | Este documento; migration mantida intacta em `drizzle/migrations/` |
