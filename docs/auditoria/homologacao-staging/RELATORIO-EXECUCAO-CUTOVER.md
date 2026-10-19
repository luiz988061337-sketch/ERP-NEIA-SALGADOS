# RELATÓRIO DE EXECUÇÃO DO CUTOVER — ERP NÉIA SALGADOS

**Data:** 2026-10-19
**Autorização:** "execute" (após `RELATORIO-PREFLIGHT-CUTOVER.md` → *PRONTO — AGUARDANDO AUTORIZAÇÃO PARA EXECUTAR*)
**Resultado:** **execução BLOQUEADA por ausência de credenciais de escrita no ambiente.** Nenhuma escrita foi feita em produção.

---

## 1. O QUE FOI EXECUTADO (com sucesso)

Tudo que é leitura foi executado de verdade contra o projeto de produção
`iqirsunzgavsuhgyjjsi` (host `iqirsunzgavsuhgyjjsi.supabase.co`, via proxy Lovable):

| # | Ação | Resultado |
|---|------|-----------|
| 1 | **Inventário de produção** (PostgREST/OpenAPI, read-only) | ✅ ver `INVENTARIO-PRODUCAO.md` |
| 2 | Estado por migration 0087–0098 | ✅ **produção está PRÉ-0087** |
| 3 | Categorias ativas + produtos `combo_50` | ✅ 5 categorias de combo, 54 produtos, **0 exigem configuração manual** |
| 4 | Verificação de conectividade/capacidade de DDL | ✅ **não existe caminho de escrita neste ambiente** |
| 5 | Confirmação do artefato congelado | ✅ `PREFLIGHT_ARTEFATO_OK` (SHA-256 idêntico) |
| 6 | Auditoria final de caminhos legados | ✅ `PREFLIGHT_LEGADO_OK` (0 vivos / 17 protegidos) |

### 1.1 Achado decisivo: **produção está em estado pré-0087**

| Objeto | Em produção |
|---|---|
| `reserva_consumos` (0087) | **AUSENTE** |
| `reservar_pedido_atomico` (0089) | **AUSENTE** |
| `liberar_pedido_atomico` (0090) | **AUSENTE** |
| `registrar_consumo_reserva` (0091) | **AUSENTE** |
| `reserva_proveniencia` / `reserva_proveniencia_config` (0092) | **AUSENTE** |
| `cancelar_pedido_atomico` (0093) | **AUSENTE** |
| `proteger_consistencia_financeira_pedido` (0094) | **AUSENTE** |
| `criar_pedido_com_reserva` / `pedido_cobertura_reserva` (0095) | **AUSENTE** |
| `pedido_item_componentes` / `categorias.combo_preco_unit` (0097) | **AUSENTE** |
| `reservar_estoque_atomica` / `liberar_reserva_atomica` (0030/0086) | PRESENTE (caminho legado) |

**Consequência para o plano:** as **11 migrations do corte são todas necessárias**
(0087, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098) — exatamente a lista
homologada. A **0088 permanece NÃO APLICAR**.

### 1.2 Combos em produção — nenhuma configuração manual

| Categoria | Itens `combo_50` | Preço (seed 0097) | Configuração |
|---|---|---|---|
| `mini-fritos` | 18 | 1.60 | não |
| `mini-assados` | 10 | 2.30 | não |
| `mini-pasteis` | 9 | 2.30 | não |
| `mini-pizzas` | 9 | 3.70 | não |
| `mini-empadinhas` | 8 | 2.40 | não |
| `bebidas` / `kits-para-festa` / `mini-congelados` | 0 | — | não são de combo |

**0 categorias exigem configuração.** A 0097 semeia exatamente os 5 slugs de produção.

---

## 2. ONDE A EXECUÇÃO PAROU — e por quê

A execução foi interrompida **antes da primeira escrita**, porque **não existe, neste
ambiente, credencial capaz de escrever em produção**. Isto não é uma decisão de
segurança do plano: é uma ausência de credencial. Verificações:

| Caminho testado | Resultado |
|---|---|
| `POST {proxy}/pg-meta/query` | **404** `requested path is invalid` |
| `POST {supabase.co}/pg-meta/query` | **404** |
| `POST /rest/v1/rpc/exec_sql` | **404** `PGRST202` (função não existe) |
| `GET api.supabase.com/v1/projects` (Management API) | **401** `JWT could not be decoded` — sem PAT |
| `iqirsunzgavsuhgyjjsi.supabase.co:5432` | **timeout** |
| `iqirsunzgavsuhgyjjsi.supabase.co:6543` | **timeout** |
| `SUPABASE_SERVICE_ROLE_KEY` no ambiente | **ausente** |
| `SUPABASE_DB_PASSWORD` / `DATABASE_URL` | **ausente** → sem `psql`, sem `pg_dump` |
| MCP Supabase no opencode | **nenhum servidor configurado** |
| `SUPABASE_PUBLISHABLE_KEY` (a que existe) | leitura RLS sim; **escrita → `42501`** |

**A chave existente é *publicável*** (papel `anon`): ela lê o catálogo público e
**não** pode executar DDL, nem `pg_dump`, nem enxergar `reservas_estoque`
(RLS staff) — por isso as **19 reservas não puderam ser contadas** daqui.

### 2.1 Modelo de deploy — **B) a plataforma recompila** (RESOLVIDO em 2026-10-19)

A plataforma **recompila** a aplicação a partir do fonte e lê as variáveis do
`.env` versionado (`.gitignore`: *"o build da Lovable lê as variáveis daqui"*;
`AGENTS.md`: commits no branch conectado sincronizam com a Lovable).

**Resolvido:** as flags compile-time foram colocadas em **`.env.production`**
(versionável, carregado pelo Vite só no modo `production`). Prova: `npm run build`
**puro** — exatamente o que a plataforma executa — produz a versão
`1792429500000`, com **0 call sites legados** e o fluxo novo presente.
Sem esse arquivo, a plataforma publicaria o bundle **legado** (flags OFF).

Detalhe: `RELATORIO-DESBLOQUEIO.md` §2.

---

## 3. O QUE FALTA PARA EXECUTAR (desbloqueio)

Escolher **uma** das opções de credencial e **uma** das opções de publicação:

### 3.1 Credencial de banco (necessária para backup + migrations)

| Opção | O que habilita | Como obter |
|---|---|---|
| **A. Connection string do Postgres** (recomendada) | `psql` (migrations), `pg_dump` (backup), `pg_restore` (validação) | Dashboard Supabase → Project Settings → Database → Connection string (URI). Precisa da senha do banco. |
| **B. Personal Access Token (PAT)** | Management API → `/v1/projects/{ref}/database/query` (executa SQL) | Dashboard → Account → Access Tokens. |
| **C. `service_role` key** | PostgREST com privilégio total; **não** serve para DDL (só RPC) | Dashboard → Project Settings → API. **Não basta para as migrations.** |

> **A é a recomendada**: é a única que permite `pg_dump` (backup obrigatório antes
> do corte) **e** `psql -f` (migrations) com a mesma credencial.

### 3.2 Publicação do bundle

| Opção | O que fazer |
|---|---|
| **A. Definir as variáveis no ambiente de build da plataforma** e publicar pela plataforma | `VITE_FF_CRIACAO_ATOMICA=on`, `VITE_FF_CONSUMO_RESERVA=on`, `VITE_FF_CANCELAMENTO_ATOMICO=on`, `VITE_FF_RESERVA_ATOMICA=off`, `VITE_BUILD_VERSION=1792429500000`, `VITE_VERSAO_MINIMA=1792429500000`, `VITE_BUILD_LABEL=cutover-2026-10-19-a1` |
| **B. Publicar o `.output` já gerado** por um pipeline que injete essas variáveis | o artefato local está pronto e validado (SHA-256 conferido) |
| **C. `VERSAO_MINIMA` no runtime** | após publicar, para o servidor bloquear bundles antigos |

> ⚠️ **Antes de publicar**, o `git push` que dispara a publicação Lovable carregaria
> **155 arquivos** ainda não commitados (todo o trabalho de homologação). Decisão
> do responsável: commitar tudo em um único PR revisado, ou publicar a partir de um
> artefato pré-construído sem tocar no histórico.

### 3.3 Sessão staff (necessária só para o gate das 19 reservas)

Para rodar `preflight-gate-19-reservas.sql` e ver as 19 reservas, é necessária
**uma sessão `staff`** (`staff_email` + `staff_password`) ou `service_role`. Sem
isso, o gate roda, mas com **visibilidade zero** sobre as reservas (o que o torna
inconclusivo).

---

## 4. SEQUÊNCIA DE EXECUÇÃO (pronta, aguardando credencial)

O runbook `RUNBOOK-CUTOVER.ps1` já implementa os 12 passos em modo simulação.
Com `-Executar -Url "<DATABASE_URL>" -Etapa <n>`:

| Etapa | Ação | Escreve em produção? |
|---|---|---|
| 1 | Fechar novas vendas | ❌ (ação operacional) |
| 2 | Confirmar ausência de gravações em andamento | ❌ (read-only) |
| 3 | Backup + validação (dump + restore) | ❌ (leitura) |
| 4 | Verificações PRE (gate das 19, categorias de combo, inventário) | ❌ (read-only) |
| 5 | **11 migrations + configuração de combos** | ✅ **PRIMEIRA ESCRITA** (`0087` → `CREATE TABLE public.reserva_consumos`) |
| 6 | ACL/RLS: 0098 + lockdown + auditoria RLS | ✅ (GRANT/REVOKE) |
| 7 | Deploy do bundle congelado | ✅ (publicação) |
| 8 | Bloqueio de frontend antigo (`VERSAO_MINIMA`) | ✅ (config de runtime) |
| 9 | `controlado = true` | ✅ (1 linha) |
| 10 | Smoke (20 testes) | ✅ (pedidos de teste) |
| 11 | Decisão GO/NO-GO | ❌ |
| 12 | Reabrir operação | ❌ (ação operacional) |

**A linha travada é a etapa 5.** O `psql` que abre a conexão com a credencial
`DATABASE_URL` é, literalmente, o primeiro comando que escreve.

---

## 5. ESTADO FINAL VERIFICADO (inalterado)

| Item | Estado |
|---|---|
| Artefato de corte | `1792429500000` / `cutover-2026-10-19-a1` / SHA-256 `0006762e…bf05329` — **idêntico**, não reconstruído |
| Migrações aplicadas em produção | **nenhuma** (produção intacta, pré-0087) |
| `controlado` em produção | **inalterado** (a tabela 0092 nem existe) |
| Flags publicadas | **inalteradas** (bundle não publicado) |
| Dados reais | **inalterados** (só leitura RLS) |
| 19 reservas | **não reconciliadas** (nem contadas — RLS staff) |
| Código local | inalterado desde o build (só `scripts/preflight-*.mjs` e documentos novos) |
| Commit / push | **nenhum** |

---

## 6. VEREDITO DA EXECUÇÃO

**NO-GO — BLOQUEIO ENCONTRADO**

O bloqueio **não é técnico nem do plano**: o plano está validado e o artefato está
congelado e íntegro. O bloqueio é **de credencial**: este ambiente não possui
nenhum caminho para escrever no banco de produção, e a publicação do bundle exige
configurar variáveis compile-time no ambiente de build da plataforma.

**Para desbloquear, é preciso UMA das opções de §3.1 (credencial de banco) e a
definição das variáveis de §3.2 (publicação).** Com a credencial em mãos, os passos
4→10 do runbook podem ser executados de imediato, sem novo desenvolvimento.

Itens que continuam exigindo decisão humana (inalterados):

1. Nomes dos 4 responsáveis, data, hora de início e **hora limite para abortar**.
2. Disponibilidade do TANCA TP-550/XP-80C → T1–T5; se a impressão automática for
   **indispensável** ao 1º dia e não houver contingência ⇒ **NO-GO OPERACIONAL**.
3. Decisão sobre o `git push` que dispara a publicação (155 arquivos).
4. Prazo de `VERSAO_MINIMA` pós-cutover.
5. Reconciliação das 19 reservas: pós-cutover (como planejado) — exige sessão staff
   para o gate e para a contagem.
