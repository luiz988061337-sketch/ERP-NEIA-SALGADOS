# INVENTÁRIO DE PRODUÇÃO (read-only) — ERP NÉIA SALGADOS

**Coletado em:** 2026-10-19T18:25:20.037Z
**Projeto Supabase:** `iqirsunzgavsuhgyjjsi`
**Host:** `iqirsunzgavsuhgyjjsi.supabase.co` (via proxy Lovable)
**Método:** somente leitura via PostgREST com a chave *publicável* (papel `anon`, RLS ativo).
**Nenhuma escrita realizada.** Nenhuma migration aplicada. Nenhum dado alterado.

---

## 1. Estado por migration (produção real)

| Migration | Objeto | Em produção? | Aplicar no corte? |
|---|---|---|---|
| `0087` | tabela `reserva_consumos` | **AUSENTE** | **SIM** |
| `0088` | fn `reservar_estoque_atomica` (substitui 0030) | PRESENTE | não |
| `0089` | fn `reservar_pedido_atomico` | **AUSENTE** | **SIM** |
| `0090` | fn `liberar_pedido_atomico` | **AUSENTE** | **SIM** |
| `0091` | fn `registrar_consumo_reserva` | **AUSENTE** | **SIM** |
| `0092` | tabela `reserva_proveniencia` | **AUSENTE** | **SIM** |
| `0092` | tabela `reserva_proveniencia_config` | **AUSENTE** | **SIM** |
| `0093` | fn `cancelar_pedido_atomico` | **AUSENTE** | **SIM** |
| `0094` | fn `proteger_consistencia_financeira_pedido` | **AUSENTE** | **SIM** |
| `0095` | fn `criar_pedido_com_reserva` | **AUSENTE** | **SIM** |
| `0095` | fn `pedido_cobertura_reserva` | **AUSENTE** | **SIM** |
| `0095` | fn `exigir_reserva_producao` (função; trigger NÃO deve ser instalado) | **AUSENTE** | **SIM** |
| `0095` | fn `exigir_consumo_producao` (função; trigger NÃO deve ser instalado) | **AUSENTE** | **SIM** |
| `0096` | RLS/GRANT de parceiros/estoque | PRESENTE | sim (idempotente; confirmar GRANTs) |
| `0097` | tabela `pedido_item_componentes` | **AUSENTE** | **SIM** |
| `0097` | coluna `categorias.combo_preco_unit` | **AUSENTE** | **SIM** |
| `0098` | matriz de menor privilégio (GRANT/REVOKE) | PRESENTE | sim (idempotente; confirmar GRANTs) |

> **Conclusão:** produção está em estado **pré-0087**. Nenhuma das migrations
> 0087–0098 está aplicada. **Todas as 11 migrations do corte são necessárias**
> (0087, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098).
> A **0088 permanece NÃO APLICAR** (nenhum chamador no bundle de corte).

## 2. Categorias de combo — configuração necessária

| Categoria | Nome | Itens combo_50 | Preço (seed 0097) | Configuração necessária |
|---|---|---|---|---|
| `bebidas` | Bebidas | 0 | — | não (não é combo) |
| `kits-para-festa` | Kits para Festa | 0 | — | não (não é combo) |
| `mini-assados` | Mini Assados | 10 | 2.30 | não (seed 0097) |
| `mini-congelados` | Mini Congelados | 0 | — | não (não é combo) |
| `mini-empadinhas` | Mini Empadinhas | 8 | 2.40 | não (seed 0097) |
| `mini-fritos` | Mini Fritos | 18 | 1.60 | não (seed 0097) |
| `mini-pasteis` | Mini Pastéis | 9 | 2.30 | não (seed 0097) |
| `mini-pizzas` | Mini Pizzas | 9 | 3.70 | não (seed 0097) |

**Categorias de combo: 5 · produtos `combo_50`: 54 · exigem configuração manual: 0.**

> A 0097 semeia exatamente os 5 slugs de produção. **Nenhuma configuração manual de combo é necessária.**
> Os itens `combo_50` são **sabores** do combo (ex.: *Bolinha de queijo 25un*); o frontend
> monta o item do carrinho como **montagem** (`produto_id = null` + `componentes`),
> que a 0095 valida (soma = quantidade, múltiplo de 50) e precifica com `combo_preco_unit`.

## 3. Capacidades verificadas no ambiente de execução

| Caminho | Resultado | Consequência |
|---|---|---|
| `GET /rest/v1/` (PostgREST) | **200** | leitura RLS disponível |
| `POST /pg-meta/query` (proxy Lovable) | **404** | sem DDL |
| `POST /pg-meta/query` (supabase.co direto) | **404** | sem DDL |
| `POST /rest/v1/rpc/exec_sql` | **404** (`PGRST202`) | sem DDL |
| `GET api.supabase.com/v1/projects` (Management API) | **401** (sem PAT) | sem Management API |
| `iqirsunzgavsuhgyjjsi.supabase.co:5432` / `:6543` | **timeout** | sem conexão direta |
| `SUPABASE_SERVICE_ROLE_KEY` no ambiente | **ausente** | sem DDL |
| `SUPABASE_DB_PASSWORD` / `DATABASE_URL` | **ausente** | sem `psql` e sem `pg_dump` |
| `SUPABASE_PUBLISHABLE_KEY` | presente | leitura RLS apenas; escrita → `42501` |
| MCP Supabase (opencode) | **nenhum servidor configurado** | sem ferramentas de SQL |
| Publicação do bundle (Lovable/Cloudflare) | sem credencial; `VITE_*` são compile-time no ambiente de build da plataforma | ver §5 |

## 4. Reservas históricas (19)

A chave *publicável* (papel `anon`) **não enxerga** `reservas_estoque` (RLS staff):

```
GET /rest/v1/reservas_estoque?status=eq.ativa  ->  HTTP 200, content-range=*/0  (0 linhas visíveis)
GET /rest/v1/pedidos?limit=1                      ->  HTTP 200, content-range=*/0  (0 linhas visíveis)
```

Portanto **as 19 reservas não puderam ser contadas/verificadas** a partir deste ambiente.
A verificação exige uma sessão `staff` (ou `service_role`) — ver a query read-only
`preflight-gate-19-reservas.sql` e `reconciliacao-19-reservas-legado.sql`.

## 5. Efeito colateral do bundle de corte sobre o catálogo

Os 54 produtos `combo_50` de produção são **sabores** com estoque próprio (100–200).
No bundle de corte, um item de combo no carrinho vira **montagem** (`produto_id = null`,
`componentes` = lista de sabores com quantidades), e não um `produto_id` de kit. Consequência:

- a 0095 debita **cada sabor** pela quantidade de unidades que ele recebe no combo;
- o preço vem de `categorias.combo_preco_unit` (autoridade do servidor), não do preço do kit;
- a soma dos componentes tem de ser **exatamente** a quantidade do combo (múltiplo de 50).

> O preço do **kit** (`produtos.preco` do item `combo_50`) deixa de ser a autoridade de
> preço do combo. Se o painel comercial depender do preço do kit, o valor exibido no
> cardápio de combo precisa vir de `combo_preco_unit`.

