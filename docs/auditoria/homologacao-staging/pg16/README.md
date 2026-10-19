# Suítes PG16 — evidência reproduzível

Scripts usados no PostgreSQL 16.4 descartável (`127.0.0.1:55435`). Requerem o
pacote `pg` do Node disponível no diretório de execução.

## Preparar

```powershell
$env:PGDATABASE='homolog_baseline_test'
node fixtures-pg16.mjs
```

`fixtures-pg16.mjs` recria usuários, papéis, produtos, cupons e categoria de
teste, e deixa `reserva_proveniencia_config.controlado=false`.

## Executar

```powershell
node suite-pg16.mjs              # 189 asserções transacionais
node combo-pg16.mjs              # 79 asserções de combo estruturado
node quarantine-proof-pg16.mjs   # 17 asserções de isolamento das 19 legadas
node concurrency-pg16.mjs        # 12 cenários multi-sessão
node cutover-smoke-pg16.mjs      # 32 asserções de smoke do corte
node cutover-lockout-pg16.mjs    # 10 asserções de bloqueio dos caminhos legados
```

Os scripts leem `PGDATABASE`; o padrão é `homolog_p0`. Para o teste de baseline,
use o banco criado por `scripts/baseline/apply-baseline.ps1`.

## Ensaio de cutover (ordem)

```powershell
# 1. banco de ensaio a partir do snapshot pré-0087
psql -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -f baseline/baseline-0086.full.sql
# 2. migrations necessárias (0088 NAO)
#    0087, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098
# 3. smoke do corte
$env:PGDATABASE='homolog_cutover'; node cutover-smoke-pg16.mjs
# 4. prova de bloqueio do legado (em um clone separado)
#    -c "CREATE DATABASE homolog_cutover_lock TEMPLATE homolog_cutover;"
psql -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover_lock -f cutover-lockdown.sql
$env:PGDATABASE='homolog_cutover_lock'; node cutover-lockout-pg16.mjs
```

## Cobertura relevante

- `suite-pg16.mjs`: criação atômica, reserva, apartamento/endereço, cupom,
  pagamento, cancelamento, 0094, impressão, RLS/ACL.
- `combo-pg16.mjs`: composição 30+20, 50 de 200, segundo 50, saldo, replay,
  consumo 20+10, over-balance, cancelamento com e sem consumo, categoria
  divergente, preço ausente, componente duplicado, idempotência divergente,
  RLS de componentes e ACL.
- `quarantine-proof-pg16.mjs`: 19 reservas legadas sintéticas (95 unidades, sem
  proveniência/ledger); novo pedido combo não é afetado; cancelamento legado
  falha fechado e não credita estoque.
- `concurrency-pg16.mjs`: 0095 duplicada, estoque concorrente, cupom `max_usos`,
  cancelamentos, consumo × cancelamento, consumos parciais, locks ordenados e
  deadlock bruto de controle.
- `cutover-smoke-pg16.mjs`: checkout retirada/entrega, PDV pago, atendimento,
  cliente em canal staff, combo 50 e misto 100, retirada parcial (com replay e
  over-balance), cancelamento com e sem consumo, cancelamento de pedido pago
  bloqueado, produção/entrega e cupom na fila de impressão.
- `cutover-lockout-pg16.mjs`: sob o lockdown de ACL, INSERT/UPDATE direto em
  `reservas_estoque`, `rpc reservar_estoque_atomica`, `rpc liberar_reserva_atomica`
  e `DELETE pedidos` retornam `42501`; o fluxo atômico novo continua
  funcionando; INSERT direto de pedido também é negado (`42501`).

## Limites

- Não são testes de produção.
- A impressão física não é exercitada; ver
  `ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md`.
- A baseline usada é a de homologação; para produção, substituir pelo dump
  read-only do banco congelado.
