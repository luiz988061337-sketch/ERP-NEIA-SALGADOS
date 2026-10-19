# Baseline canônica de homologação (pré-0087)

## O que é

`baseline-0086.full.sql` é um snapshot **de homologação** do banco no estado
imediatamente anterior à migration `0087`. Contém schema + dados de
seed/configuração (transições de status, loja, catálogo de teste, cupons etc.).

Ele **não** é um dump de produção. Nenhum banco de produção foi acessado.

O snapshot foi produzido a partir de uma cópia de `homolog_p0` (PG16.4) com os
objetos de 0087–0098 removidos de forma controlada. O `MANIFEST.json` registra:

- SHA-256 do snapshot;
- lista exata de migrations aplicadas depois da baseline;
- SHA-256 de cada migration;
- resultados dos testes executados.

## Por que existe

O replay cego de `0000`–`0098` não é reprodutível: há migrations históricas com
prefixos duplicados (`0001`, `0002`), patches fora de ordem (`0001_migration`,
`0002_secure_loyalty_and_partners`) e seeds que dependem de objetos criados
depois. Reescrever essas migrations aplicadas seria pior: mudaria o histórico
que o Supabase/Lovable já conhece.

A estratégia segura é:

1. congelar um snapshot schema+dados canônico;
2. aplicar somente as migrations **posteriores** ao freeze, em ordem;
3. registrar hashes e resultados no manifesto.

## Como reproduzir localmente

Requisitos: PostgreSQL 16 limpo, `psql` e `pg_dump` no PATH (ou passe o caminho).

```powershell
# 1. Criar banco vazio e restaurar a baseline
psql -h 127.0.0.1 -p 55435 -U postgres -d postgres -c "DROP DATABASE IF EXISTS homolog_baseline;"
psql -h 127.0.0.1 -p 55435 -U postgres -d postgres -c "CREATE DATABASE homolog_baseline TEMPLATE template0 ENCODING 'UTF8';"
psql -h 127.0.0.1 -p 55435 -U postgres -d homolog_baseline -v ON_ERROR_STOP=1 -f baseline-0086.full.sql

# 2. Aplicar 0087–0098, nesta ordem
$files = @(
  '0087_reserva_consumos.sql','0088_reservar_estoque_atomica.sql',
  '0089_reservar_pedido_atomico.sql','0090_liberar_pedido_atomico.sql',
  '0091_registrar_consumo_reserva.sql','0092_reserva_proveniencia.sql',
  '0093_cancelar_pedido_atomico.sql','0094_protecao_pagamento_cancelado.sql',
  '0095_criar_pedido_com_reserva.sql','0096_reparo_parceiros_rls.sql',
  '0097_modelagem_combo.sql','0098_acl_menor_privilegio.sql'
)
foreach ($f in $files) {
  psql -h 127.0.0.1 -p 55435 -U postgres -d homolog_baseline -v ON_ERROR_STOP=1 -f "drizzle/migrations/$f"
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $f" }
}
```

O script `scripts/baseline/apply-baseline.ps1` automatiza os dois passos.

## Resultado validado (2026-10-19)

Banco `homolog_baseline_test` restaurado do snapshot e migrations aplicadas:

| Suíte | Resultado |
|---|---|
| `suite-pg16.mjs` (transacional, multi-sessão) | **189/189 PASS** |
| `combo-pg16.mjs` (combo estruturado, 50/200, parcial, replay, over-balance, cancelamento) | **79/79 PASS** |
| `quarantine-proof-pg16.mjs` (19 reservas legadas sintéticas) | **17/17 PASS** |
| `concurrency-pg16.mjs` (12 cenários multi-sessão) | **12/12 PASS** |
| ACL `anon`/`PUBLIC`/`service_role` | sem `EXECUTE` nas RPCs novas; `authenticated` conforme matriz |

## Regras para o cutover

1. **Não aplicar 0087–0098 duas vezes** no banco de produção.
2. Antes de executar, substituir `baseline-0086.full.sql` por um dump
   **read-only** do banco real congelado, com schema + seeds/config. Gerar novo
   SHA-256 e registrar no `MANIFEST.json`.
3. O snapshot de homologação contém dados de fixture; não usá-lo como seed de
   produção.
4. O baseline não inclui `pedido_item_componentes` nem
   `categorias.combo_preco_unit`: eles são criados por 0097.
5. A ordem é obrigatória: 0092 depende de 0087; 0093 depende de 0090; 0095
   depende de 0089/0092; 0096 depende de `parceiros`; 0097 depende de
   `pedido_itens`; 0098 depende de todas as funções/tabelas.
