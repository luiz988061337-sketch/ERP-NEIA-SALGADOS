# ACL, owner e chamadores — 0088 a 0095

Medição no PG16.4 descartável (`homolog_p0`), após replay 0000–0096.
`has_function_privilege` consultado para `anon`, `authenticated`, `service_role`
e `PUBLIC`.

## Matriz de funções

| Função | SECURITY DEFINER | search_path | anon | authenticated | service_role | PUBLIC | Chamador real |
|---|---|---|---|---|---|---|---|
| `reservar_estoque_atomica(uuid,uuid,integer)` (0088) | sim | `public` | não | sim | **sim** | não | checkout legado (`checkout.tsx:584`). |
| `liberar_reserva_atomica(uuid)` (0088/0030/0068) | sim | `public` | **sim** | sim | **sim** | **sim** | checkout/admin/pedido legados; 0090 pode usar? Não. |
| `reservar_pedido_atomico(uuid)` (0089) | sim | `public` | não | sim | **sim** | não | 0095 (`0095:715`) e wrapper de integração. |
| `liberar_pedido_atomico(uuid)` (0090) | sim | `public` | não | **não** | **não** | não | somente 0093 (`0093:438`). |
| `registrar_consumo_reserva(uuid,integer,uuid,uuid,text)` (0091) | sim | `public` | não | sim | não | não | `reserva-integracao.ts:475`; hoje **sem UI**. |
| `cancelar_pedido_atomico(uuid,text)` (0093) | sim | `public` | não | sim | não | não | admin e cliente (`admin.tsx:685`, `pedido.$id.tsx:167`). |
| `criar_pedido_com_reserva(uuid,text,jsonb,jsonb)` (0095) | sim | `public` | não | sim | não | não | checkout/PDV/atendente. |
| `pedido_cobertura_reserva(uuid)` (0095) | sim | `public` | não | sim | não | não | UI de cobertura. |
| `exigir_reserva_producao()` (0095) | sim | `public` | não | não | não | não | função de trigger, sem trigger instalado. |
| `exigir_consumo_producao()` (0095) | sim | `public` | não | não | não | não | função de trigger, sem trigger instalado. |
| `proteger_consistencia_financeira_pedido()` (0094) | não | `public` | sim | sim | sim | sim | trigger `trigger_proteger_consistencia_financeira` (função de trigger; não é RPC de app). |

## Conclusões

1. **0091, 0093 e 0095 não têm `service_role`.** Nenhum `GRANT` a
   `service_role` foi adicionado nesta etapa. O app chama como
   `authenticated`; a 0095 chama a 0089 como owner/definer.
2. **0090 é interna**: sem EXECUTE para `anon`, `authenticated` ou
   `service_role`; só 0093 (definer) a executa.
3. **0089 é a exceção histórica**: tem `service_role=true` por grant da própria
   0089. Não há consumidor comprovado que precise disso: a 0095 é definer e o
   wrapper do app usa `authenticated`. Recomendação: **revogar
   `service_role` antes do cutover**, salvo prova de consumidor backend.
4. **0088 é legado e mais amplo**:
   - `liberar_reserva_atomica` tem `PUBLIC` e `anon` (a função nega
     `auth.uid()` nulo, mas o grant é desnecessário);
   - `reservar_estoque_atomica` tem `service_role` (grant explícito da 0088).
   Não instalar/manter 0088 além da janela de cutover; quando todos os
   chamadores migrarem para 0095, ela pode ficar ausente.
5. **Funções de trigger** (`proteger_...`, `exigir_...`) não são RPC de app.
   A primeira tem `PUBLIC` por default; as duas da 0095 foram revogadas. Não
   são vetores de chamada direta porque retornam `trigger`.

## Tabelas novas (0092) e bypass

`reserva_consumos`, `reserva_proveniencia` e `reserva_proveniencia_config`
têm RLS e `authenticated` só com `SELECT` (staff/admin), mas **`service_role`
tem ALL** nessas três tabelas (grant histórico). `service_role` bypassa RLS;
logo, um portador dessa chave pode forjar consumo/proveniência. Não há
evidência de que o print-agent ou o app precisem disso. Recomendação:
revisar/revogar antes do cutover; não conceder `service_role` às novas RPCs.

## Observação de RLS em `reservas_estoque`

`authenticated` tem ALL na tabela, mas a policy `reservas staff` só permite
admin/produção/atendente/financeiro. O checkout do cliente usa a RPC definer,
não insert direto. O fallback legado de insert direto do checkout **não
funciona para cliente** (RLS) e é mais um motivo para não usá-lo como prova de
operação segura.

## Evidência

- `verify-0091.sql`, `verify-0093.sql`, `verify-0095.sql` (todos exit 0).
- `verify-0096.sql` (novo, exit 0) para o reparo de parceiros.
- Consultas `has_function_privilege`/`pg_policies` executadas no PG16;
  resultados em `C:\Users\User\pgtest\acl-matrix.mjs` e `acl-tables.mjs`.
