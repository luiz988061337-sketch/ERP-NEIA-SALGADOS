# Especificação de reconciliação das 19 reservas históricas

## Status

**Não conciliado e não corrigido.** Este documento e o SQL
`reconciliacao-19-reservas-legado.sql` são apenas especificação auditável
read-only. Nenhum `UPDATE`, crédito de estoque, remoção de reserva ou
marcação retroativa de proveniência foi executado nos dados reais.

## Por que existe

O relatório de auditoria registrou **19 reservas ativas / 215 unidades sem
movimentação em nenhum ledger**, originadas do fallback antigo do checkout
(insert direto em `reservas_estoque`, sem `reserva_proveniencia`). A 0088
classifica essas linhas como “órfãs” e, no regime `controlado=true`, a 0089
passa a recusar a criação/renovação de reserva para o mesmo par sem marcador.
Isso é fail-closed, mas não reconcilia o passado.

## Regra central: não inventar evidência

A existência de uma reserva **não prova** que o estoque disponível foi
debitado. O fallback antigo inseria a reserva depois do pedido e podia falhar
sem débito, ou podia ser apenas um insert direto sem ledger. Portanto:

- não creditar `produtos.estoque` automaticamente;
- não apagar a reserva “porque está órfã”;
- não criar `reserva_proveniencia` retroativa sem um `estoque_movimentacao_id`
  real e compatível;
- não marcar como `consumida`/`liberada` sem evidência física/operacional.

## Classes da especificação

| Classe | Evidência | Ação proposta |
|---|---|---|
| `comprovada_por_proveniencia_e_consumo` | marcador 0088/0089 + débito `reserva` compatível + consumo total | sem ação |
| `comprovada_por_proveniencia` | marcador + débito `reserva` compatível; consumo parcial ou nenhum | sem ação (consumo é decisão operacional) |
| `comprovada_por_consumo` | sem marcador, mas `reserva_consumos` soma exatamente a quantidade e status `consumida` | sem ação |
| `legado_sem_evidencia` | ativa, sem marcador e sem consumo | **quarentena sem crédito** |
| `parcial_sem_proveniencia` | sem marcador, com consumo parcial | revisão manual |
| `divergente_*` | produto/pedido/quantidade/movimento inconsistente, múltiplos marcadores ou consumo acima do reservado | revisão manual; não corrigir por UPDATE em massa |
| `pedido_cancelado_reserva_ativa` | pedido cancelado, reserva ainda ativa | revisão manual (não liberar/creditar automaticamente) |
| `fora_do_escopo_status` | `liberada`/`cancelada` | sem ação nesta spec |

## Consulta

Executar `reconciliacao-19-reservas-legado.sql` em transação `READ ONLY`.
A query:

1. lista cada reserva com classe e ação proposta;
2. resume por classe (reservas/unidades) para confirmar se o universo é
   realmente 19 — **se não for, parar e reconciliar o universo antes**;
3. checa reservas sem produto/pedido, quantidade inválida e ativas sem
   proveniência;
4. termina em `ROLLBACK`.

## Critérios para uma futura correção (fora desta etapa)

Somente depois de autorização explícita:

1. identificar a causa de cada linha (pedido, data, produto, saldo atual,
   ledger, consumo, status do pedido);
2. comparar com estoque físico e com `estoque_movimentacoes`;
3. se houve débito legítimo sem marcador, criar o marcador apenas com o
   `estoque_movimentacao_id` correspondente e na mesma transação de uma
   correção auditada;
4. se não houve débito, decidir entre (a) manter a reserva e registrar o
   débito, ou (b) liberar com ajuste explícito — nunca “creditar” por
   suposição;
5. registrar `usuario_id`, motivo, aprovação e antes/depois em
   `estoque_movimentacoes` e no histórico operacional;
6. reexecutar a consulta e provar que as classes restantes são esperadas.

## Evidência local

- SQL executado no PG16.4 descartável (`homolog_p0`) sem erro.
- Resultado no ambiente de homologação após fixtures: 0 reservas ativas
  (as fixtures não reproduzem as 19 reais), o que comprova apenas a
  validade sintática/semântica da consulta, **não** a reconciliação real.
