# Matriz ACL de pré-cutover (0087–0098)

Medição no PostgreSQL 16.4 descartável (`homolog_baseline_test`), restaurado da
baseline `baseline-0086.full.sql` e com 0087–0098 aplicadas em ordem.

## Regra

- `anon` não executa nenhuma RPC nova.
- `authenticated` executa somente as RPCs de app listadas.
- `service_role` **não** recebe `EXECUTE` em RPC nova sem chamador provado.
- Funções internas (chamadas só por `SECURITY DEFINER`) e funções de trigger não
  têm `EXECUTE` para `PUBLIC`/`anon`/`authenticated`/`service_role`.
- Tabelas novas: leitura por `authenticated` + RLS; escrita somente por funções
  `SECURITY DEFINER`.
- Nenhum grant para `anon` em tabela de reserva/consumo/proveniência.

## Funções

| Função | SECURITY DEFINER | search_path | anon | authenticated | service_role | PUBLIC | Chamador real |
|---|---|---|---|---|---|---|---|
| `reservar_estoque_atomica(uuid,uuid,integer)` (0088) | sim | `public` | não | sim | não | não | checkout legado e 0095 (definer) |
| `liberar_reserva_atomica(uuid)` (0088/0030/0068) | sim | `public` | não | sim | não | não | checkout/admin/pedido legados |
| `reservar_pedido_atomico(uuid)` (0089) | sim | `public` | não | sim | não | não | 0095 (definer) e wrapper |
| `liberar_pedido_atomico(uuid)` (0090) | sim | `public` | não | não | não | não | somente 0093 (definer) |
| `registrar_consumo_reserva(uuid,integer,uuid,uuid,text)` (0091) | sim | `public` | não | sim | não | não | painel de produção (retirada física) |
| `cancelar_pedido_atomico(uuid,text)` (0093) | sim | `public` | não | sim | não | não | admin/pedido (atrás de flag) |
| `criar_pedido_com_reserva(uuid,text,jsonb,jsonb)` (0095) | sim | `public` | não | sim | não | não | checkout/PDV/atendente (atrás de flag) |
| `pedido_cobertura_reserva(uuid)` (0095) | sim | `public` | não | sim | não | não | produção/trigger interno |
| `exigir_reserva_producao()` (0095) | sim | `public` | não | não | não | não | trigger (não instalado) |
| `exigir_consumo_producao()` (0095) | sim | `public` | não | não | não | não | trigger (não instalado) |
| `proteger_consistencia_financeira_pedido()` (0094) | não | `public` | não | não | não | não | trigger instalado em `pedidos` |

## Tabelas

| Tabela | anon | authenticated | service_role | Escrita |
|---|---|---|---|---|
| `reservas_estoque` | não | `SELECT, INSERT, UPDATE, DELETE` (RLS staff) | não | legado + funções definer |
| `reserva_consumos` (0087) | não | `SELECT` (RLS staff) | não | somente 0091 |
| `reserva_proveniencia` (0092) | não | `SELECT` (RLS staff) | não | somente 0089 |
| `reserva_proveniencia_config` (0092) | não | `SELECT` (RLS admin) | não | migration/admin fora do app |
| `pedido_item_componentes` (0097) | não | `SELECT` (RLS dono/staff) | não | somente 0095 |
| `estoque_movimentacoes` | não | `SELECT/DML` (RLS staff) | não | funções definer + legado |
| `fila_impressao` | não | `SELECT/DML` (RLS dono/staff) | não | app/print-agent |

## RLS de `pedido_item_componentes`

`SELECT` permitido para:

- dono do pedido (`pedidos.user_id = auth.uid()`);
- motoboy atribuído (`pedidos.motoboy_id = auth.uid()`);
- `admin`, `atendente`, `producao`.

`financeiro` **não** lê componentes por padrão. Se o fechamento financeiro
precisar, a liberação deve ser uma decisão explícita e testada.

Testado no PG16 (`combo-pg16.mjs`, C7): dono, `admin`, `atendente` e `producao`
leem; terceiro e `financeiro` não leem; `motoboy` atribuído ao pedido lê.

## Residual conhecido (não bloqueante para o cutover, mas obrigatório depois)

`authenticated` ainda tem DML direto em `reservas_estoque` e
`estoque_movimentacoes` porque os fallbacks legados de admin/pedido/checkout
continuam no código. Esses caminhos são protegidos por RLS staff, mas a matriz
de menor privilégio só fecha 100% quando os fallbacks forem removidos
(`fallback_checkout_removido`, `cancelamentos_diretos_migrados`).

**Não** revogar esse DML antes de remover os fallbacks: quebraria o caminho
legado durante a janela de cutover. A ordem correta é:

1. ligar as flags atômicas;
2. confirmar que não há mais chamador legado;
3. remover os fallbacks;
4. rodar uma migration de revogação do DML direto;
5. repetir a matriz.

## Evidência

```sql
-- funções
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('reservar_estoque_atomica','liberar_reserva_atomica',
    'reservar_pedido_atomico','liberar_pedido_atomico',
    'registrar_consumo_reserva','cancelar_pedido_atomico',
    'criar_pedido_com_reserva','pedido_cobertura_reserva');

-- tabelas
select tablename,
       has_table_privilege('anon', format('public.%I', tablename), 'SELECT') as anon_select,
       has_table_privilege('service_role', format('public.%I', tablename), 'SELECT') as svc_select
from pg_tables
where schemaname='public'
  and tablename in ('reservas_estoque','reserva_consumos','reserva_proveniencia',
    'reserva_proveniencia_config','pedido_item_componentes','estoque_movimentacoes');
```

Resultado local: todas as RPCs novas com `anon=false`, `service_role=false`;
`authenticated=true` somente nas RPCs de app. `pedido_item_componentes` sem
`SELECT` para `anon`/`service_role`.

## Classificação

- **0098 é migration ativa** (altera ACL).
- **0097 é migration ativa** (cria tabela/coluna e política RLS).
- Nenhum `GRANT` novo para `service_role`.
- Residual de DML legado: **NÃO BLOQUEANTE / PÓS-CUTOVER**, condicionado à
  remoção dos fallbacks.
