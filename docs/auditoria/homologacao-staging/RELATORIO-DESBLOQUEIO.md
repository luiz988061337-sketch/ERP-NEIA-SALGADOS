# RELATÓRIO DE DESBLOQUEIO FINAL — ERP NÉIA SALGADOS

**Data:** 2026-10-19
**Etapa:** preparação final (sem nenhuma escrita em produção).
**Artefato de corte:** `1792429500000` / `cutover-2026-10-19-a1` / SHA-256 `0006762e66db57ad532b78cec8da95d24fefa6dfc98f1eb01f86a4bd9bf05329`

---

## 1. PREÇOS DOS 54 COMBOS — ✅ VALIDADO

Coletado por leitura direta no catálogo público de produção (PostgREST, papel `anon`).
Tabela completa: **`PRECO-COMBOS-PRODUCAO.md`**.

**Dois caminhos de venda, dois comparativos:**

| Caminho | Autoridade do preço | Antes | Depois | Itens IGUAL | Itens DIVERGENTE |
|---|---|---|---|---|---|
| **A** — combo montado (`/combo`) | preço **por unidade** | lista estática `COMBO_CATEGORIAS` (código publicado) | `categorias.combo_preco_unit` (seed da 0097) | **54 / 54** | **0** |
| **B** — venda avulsa no cardápio | `produtos.preco` | `produtos.preco` | `produtos.preco` (a 0095 não mexe) | **54 / 54** | **0** |

**A autoridade muda de lugar, não de valor:** o seed da 0097 usa exatamente os
mesmos 5 preços que a lista estática já usava (verificado contra o código
publicado em `git show HEAD:src/lib/combo.ts`).

| Categoria | Preço/un hoje | `combo_preco_unit` (0097) | Δ R$ | Δ % | Status |
|---|---|---|---|---|---|
| Mini Fritos | 1.60 | 1.60 | 0.00 | 0.0% | IGUAL |
| Mini Assados | 2.30 | 2.30 | 0.00 | 0.0% | IGUAL |
| Mini Pastéis | 2.30 | 2.30 | 0.00 | 0.0% | IGUAL |
| Mini Pizzas | 3.70 | 3.70 | 0.00 | 0.0% | IGUAL |
| Mini Empadinhas | 2.40 | 2.40 | 0.00 | 0.0% | IGUAL |

> **CRITÉRIO DE PREÇO ATENDIDO: nenhum dos 54 itens ativos muda de preço.**
> Não há decisão comercial pendente por mudança de preço no cutover.

### 1.1 Achado separado (pré-existente, **não** bloqueia o cutover)

O `produtos.preco` dos 54 itens é incoerente **dentro** de cada categoria —
isso já existe hoje e o cutover **não altera**:

| Semântica de `produtos.preco` | Itens | Exemplo |
|---|---|---|
| preço **por unidade** (= `combo_preco_unit`) | 28 | Bolinha de queijo 25un — R$ 1.60/un |
| preço **de caixa** (comercial, ±15% de unit×kit) | 21 | Mini Bolinha de Queijo 25un — R$ 39.90 / 25un |
| preço **de outra categoria** (defeito de catálogo) | 5 | Enroladinho de presunto e queijo 25un — R$ 2.30 (preço de mini-assados, em mini-fritos) |

Efeito real do cutover: **hoje um combo não debita estoque nenhum**; depois do
corte, cada sabor componente é debitado. Com linhas possivelmente duplicadas
(mesmo sabor em duas linhas, com preços e estoques diferentes), a contagem
física precisa fechar antes de abrir vendas.

| Questão para o responsável comercial | Resposta |
|---|---|
| O `estoque` dos 54 itens é contado em **unidades** ou em **caixas**? | ____________ |
| Linhas duplicadas do mesmo sabor são o **mesmo estoque**? | ____________ |
| O `produtos.preco` deve ser unificado (por unidade ou por kit)? | ____________ |

---

## 2. BUILD DE PRODUÇÃO — ✅ HOMOLOGADO

### 2.1 Modelo de deploy determinado: **B) a plataforma RECOMPILA**

| Evidência | Conclusão |
|---|---|
| `.gitignore` comentário: *"`.env` é versionado de propósito: o build da Lovable lê as variáveis daqui"* | o build da plataforma lê o `.env` versionado |
| `git ls-files .env` → versionado | as variáveis chegam ao build da plataforma |
| `AGENTS.md`: *"Commits you push to the connected branch sync back to Lovable"* | a plataforma **recompila** a partir do fonte |
| `.wrangler/deploy/config.json` → `..\..\.output\server\wrangler.json` | alvo: Cloudflare Workers, artefato gerado localmente **e recompilado** |

**Consequência:** publicar sem configurar as variáveis no ambiente de build
publicaria o bundle **legado** (flags OFF, com o caminho inseguro).

### 2.2 Ambiente de build preparado

Criado **`.env.production`** (versionável — não está no `.gitignore`), carregado
pelo Vite **somente no modo `production`**:

| Variável | Valor |
|---|---|
| `VITE_FF_CRIACAO_ATOMICA` | `on` |
| `VITE_FF_CONSUMO_RESERVA` | `on` |
| `VITE_FF_CANCELAMENTO_ATOMICO` | `on` |
| `VITE_FF_RESERVA_ATOMICA` | `off` |
| `VITE_BUILD_VERSION` | `1792429500000` |
| `VITE_VERSAO_MINIMA` | `1792429500000` |
| `VITE_BUILD_LABEL` | `cutover-2026-10-19-a1` |

> `npm run dev` / `npm run build:dev` (modo `development`) **não** leem este
> arquivo → o ambiente de desenvolvimento continua com as flags **desligadas**.

### 2.3 Build definitivo de produção (gerado, **não publicado**)

`BUILD_VERSION=1792429500000 BUILD_LABEL=cutover-2026-10-19-a1 node scripts/build-cutover.mjs`

| Item | Valor |
|---|---|
| Versão | `1792429500000` (fixada) |
| Rótulo | `cutover-2026-10-19-a1` |
| **SHA-256 do bundle** | `0006762e66db57ad532b78cec8da95d24fefa6dfc98f1eb01f86a4bd9bf05329` |
| Arquivos no bundle | 270 |
| Publicação | **NÃO PUBLICADO** |

### 2.4 Prova de equivalência com o build da plataforma

`npm run build` **puro** (sem variável de ambiente explícita — exatamente o que
a plataforma executa) produz:

| Verificação | Resultado |
|---|---|
| Versão `1792429500000` gravada no bundle | ✅ PRESENTE |
| Call sites legados | ✅ **0** |
| `criar_pedido_com_reserva` (0095) | ✅ presente |
| `cancelar_pedido_atomico` (0093) | ✅ presente |
| `registrar_consumo_reserva` (0091) | ✅ presente |
| Endpoint `/api/versao` | ✅ presente |

> **O build da plataforma É o build de corte.** Prova: `npm run build` puro → mesma
> versão, zero legado, fluxo novo presente.

> ⚠️ O build **não é byte-reproduzível** (a plataforma injeta nomes/timestamps).
> O SHA-256 identifica **o artefato específico**; a **versão** é o invariante
> (é ela que o guard de versão e o `VERSAO_MINIMA` usam). Registrar o SHA de
> `BUILD-CUTOVER.json` imediatamente antes de publicar.

### 2.5 Bateria de validação do build definitivo

| # | Verificação | Resultado |
|---|---|---|
| 1 | `npm run typecheck` | ✅ sem erro |
| 2 | `npm run build` | ✅ `✓ built` |
| 3 | `scripts/build-cutover.mjs` (provas de call site + versão + fluxo novo) | ✅ **0 call sites legados em 282 arquivos** |
| 4 | `scripts/corte-build.test.mjs` | ✅ **todos os testes passaram** (attestations, gates, decisões atômicas, legado protegido) |
| 5 | `scripts/versao-app.test.mjs` | ✅ **todos os testes passaram** (comparação, fail-closed, auto-bloqueio) |
| 6 | `scripts/preflight-legado.mjs` | ✅ `PREFLIGHT_LEGADO_OK` — **0 vivos / 17 protegidos** |
| 7 | `scripts/preflight-artefato.mjs` | ✅ `PREFLIGHT_ARTEFATO_OK` — SHA do disco = manifesto |
| 8 | Suítes locais `scripts/*.test.mjs` | ✅ **28/28** |

---

## 3. CREDENCIAL — ❌ `CREDENCIAL_PENDENTE`

Verificação feita **sem exibir nenhum segredo**:

| Verificação | Resultado |
|---|---|
| `DATABASE_URL` / `SUPABASE_DB_PASSWORD` / `PGPASSWORD` / `POSTGRES_URL` no ambiente | **ausentes** |
| `.env` (9 chaves) / `.env.example` (8) / `.env.production` (7) / `print-agent/.env.example` (6) | **nenhuma** com conexão Postgres |
| Token de Management API (`~/.supabase/access-token`) | **ausente** |
| `supabase` CLI no PATH | **ausente** |
| Teste funcional de abertura de sessão | **impossível** (não há URI) |

> **CREDENCIAL_PENDENTE.** Sem ela não há `pg_dump` (backup), nem `psql`
> (migrations), nem `pg_restore` (validação do backup).

**O que desbloqueia** (uma das opções):

| Opção | Habilita |
|---|---|
| **A. Connection string do Postgres** (recomendada) | `pg_dump` + `psql -f` + `pg_restore` com a mesma credencial |
| **B. Personal Access Token do Supabase** | Management API → `/v1/projects/{ref}/database/query` (executa SQL; **não** faz `pg_dump`) |
| **C. Um DBA humano** executando as 11 migrations no SQL Editor + o gate read-only com sessão staff | sem credencial no agente |

---

## 4. RUNBOOK — ✅ APONTANDO PARA O ARTEFATO CORRETO

`RUNBOOK-CUTOVER.ps1` atualizado:

| Parâmetro | Valor | Confere com o artefato? |
|---|---|---|
| `-BuildVersion` | `1792429500000` | ✅ |
| `-BuildLabel` | `cutover-2026-10-19-a1` | ✅ |
| `-BuildSha256` | `0006762e…bf05329` | ✅ (SHA-256 do manifesto) |
| Etapas | 1–12, com comando, resultado esperado, critério de erro e rollback | ✅ |
| Modo padrão | **simulação** (não executa nada sem `-Executar`) | ✅ |
| Etapa 5 (migrations) | 11 migrations, **sem a 0088** | ✅ |
| Etapa 7 (deploy) | confere `PREFLIGHT_ARTEFATO_OK` antes de publicar | ✅ |
| Etapa 9 | `controlado=true` no ponto homologado | ✅ |

---

## 5. VEREDITO

| Condição exigida | Estado |
|---|---|
| Credencial disponível | ❌ **`CREDENCIAL_PENDENTE`** |
| Preços dos 54 combos validados | ✅ 54/54 IGUAL (caminhos A e B) |
| Build definitivo da plataforma homologado | ✅ `.env.production` + `npm run build` puro = bundle de corte; 8/8 verificações |
| `RUNBOOK-CUTOVER.ps1` apontando para o artefato correto | ✅ versão, rótulo e SHA conferem |

### **NO-GO**

**Bloqueio restante (único):**

> **CREDENCIAL_PENDENTE** — este ambiente não possui *connection string* do
> Postgres de produção, nem `service_role`, nem PAT do Supabase. Sem credencial
> não é possível executar `pg_dump` (backup), `psql -f` (migrations 0087 e
> 0089–0098) nem `pg_restore` (validação do backup).
>
> **Como desbloquear:** fornecer a *connection string* do Postgres de produção
> (Supabase → Project Settings → Database → Connection string URI) **ou** um PAT
> do Supabase **ou** um DBA humano com acesso ao SQL Editor.
>
> Com a credencial em mãos, as etapas 4→10 do `RUNBOOK-CUTOVER.ps1` executam de
> imediato, sem novo desenvolvimento. O bundle de corte já está gerado,
> validado e pronto para publicação (falta apenas o `git push` que dispara a
> publicação da plataforma).

---

### Estado do que foi feito nesta etapa (leitura + geração local)

Nenhuma migration aplicada · `controlado` inalterado · nada publicado · nenhum
dado real alterado · nenhuma reserva reconciliada · nenhum commit/push ·
nenhum preço alterado em produção.
