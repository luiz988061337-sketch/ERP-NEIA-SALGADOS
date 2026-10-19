# VERIFICAÇÃO FINAL DA CREDENCIAL — ERP NÉIA SALGADOS

**Data:** 2026-10-19
**Escopo:** verificação **somente leitura**. Nenhum cutover, nenhuma migration, nenhum dado alterado, nenhum deploy, nenhum commit/push.
**Nenhum segredo é exibido neste documento.**

---

## 1. DETECÇÃO DE CREDENCIAL

### CREDENCIAL_AUSENTE

| Local verificado | Resultado |
|---|---|
| Variáveis do processo (`DATABASE_URL`, `SUPABASE_DB_URL`, `POSTGRES_URL`, `PGURL`, `PGURI`, `PGPASSWORD`, `SUPABASE_DB_PASSWORD`, `PGHOST`/`PGUSER`/`PGDATABASE`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`/`PAT`/`TOKEN`) | **nenhuma presente** |
| `.env` (9 chaves) · `.env.example` (8) · `.env.production` (7) · `print-agent/.env.example` (6) | **nenhuma com conexão Postgres** |
| Variáveis de ambiente do Windows (escopo `User` e `Machine`) | **nenhuma** |
| Registro `HKCU:\Environment` | **nenhuma** |
| Perfis do PowerShell (todos os escopos) | **inexistentes** |
| `.pgpass` / `pgservice.conf` / `PGPASSFILE` | **ausentes** |
| Gerenciador de Credenciais do Windows (`cmdkey /list`) | apenas entradas Microsoft/GitHub — **nada de Postgres/Supabase** |
| `~/.supabase/access-token` (Management API) | **ausente** |
| `supabase` CLI no PATH | **ausente** |
| Varredura de **966 arquivos** (workspace + home + Documents/Desktop/Downloads) procurando URI/host de Postgres | **0 ocorrências** |
| Varredura de **1.790 arquivos** modificados nas últimas 6h | apenas scripts/logs próprios e arquivos do sistema — **nenhum arquivo de credencial criado** |

> A credencial PostgreSQL de produção **não está presente neste ambiente**, apesar
> da informação de que teria sido configurada. Pode ter sido configurada em outra
> sessão, em outra máquina, ou no painel da plataforma (de onde este agente não lê).

---

## 2. TESTE DE CONEXÃO (SOMENTE LEITURA)

**Não executável** — sem credencial não há sessão a abrir contra a produção.

O que **foi** verificado, com a única credencial funcional disponível (a instância
**local descartável** de homologação — `127.0.0.1:55435`, PostgreSQL **16.4**,
usuário `postgres`, bancos `homolog_0086`, `homolog_baseline_test`, `homolog_cutover`,
`homolog_cutover_lock`, `homolog_p0`):

| Consulta inofensiva | Resultado na instância local (descartável) |
|---|---|
| `SELECT current_database()` | `homolog_cutover` |
| `SELECT current_user()` | `postgres` |
| `SELECT version()` | `PostgreSQL 16.4, compiled by Visual C++` |

> **Essa instância NÃO é a produção.** A produção é o projeto Supabase
> `iqirsunzgavsuhgyjjsi` (host `iqirsunzgavsuhgyjjsi.supabase.co`), cujo
> acesso por SQL exige senha do banco ou token de Management API — nenhum dos
> dois está disponível. Nenhuma consulta com efeito colateral foi executada;
> nenhuma tabela de dados pessoais foi consultada.

---

## 3. FERRAMENTAS

| Ferramenta | Status | Observação |
|---|---|---|
| `psql` | ✅ **disponível** (16.4) | `C:\Users\User\AppData\Local\Temp\pg16\pgsql\bin\psql.exe` — **não está no PATH** |
| `pg_dump` | ✅ **disponível** (16.4) | mesma pasta; teste funcional feito em `--schema-only` contra a instância local descartável (**sem** backup completo, **sem** tocar em produção) |
| `pg_restore` | ❌ **AUSENTE** | o binário **não existe em nenhum lugar desta máquina** (verificado no diretório do PG16, em `Program Files\PostgreSQL` e em toda a varredura) |

**Impacto e correção aplicada:** o runbook usava `pg_dump --format=custom` +
`pg_restore`. O `RUNBOOK-CUTOVER.ps1` foi **corrigido** para:
- usar o caminho **absoluto** do `psql` (não está no PATH);
- gerar o dump em **formato plain (SQL)**, restaurável com **`psql -f`**;
- manter a observação de que, se o `pg_restore` for fornecido, o formato custom
  volta a ser válido.

---

## 4. CAPACIDADE FUTURA (confirmada por delegação)

| Operação futura | Ferramenta | Estado |
|---|---|---|
| Backup com `pg_dump` | ✅ disponível | bloqueada **apenas** pela ausência de credencial |
| Migrations com `psql -f` | ✅ disponível | idem |
| `verify-*.sql` (15 arquivos) | ✅ via `psql` | idem |
| Validação do backup (restore) | ✅ via `psql -f` (formato plain) | idem — o `pg_restore` deixou de ser obrigatório |
| Restore controlado (rollback) | ✅ via `psql -f` | idem |

> Com a credencial, **todas** as etapas de escrita ficam tecnicamente viáveis.
> O único bloqueio real é o acesso ao banco.

---

## 5. PROTEÇÃO DO AMBIENTE — ✅ CONFIRMADO

| Verificação | Método | Resultado |
|---|---|---|
| **Nenhuma migration aplicada** | leitura do catálogo público de produção (PostgREST/OpenAPI) | ✅ todas as RPCs/tabelas de 0087–0098 **continuam AUSENTES** (`criar_pedido_com_reserva`, `cancelar_pedido_atomico`, `registrar_consumo_reserva`, `reservar_pedido_atomico`, `liberar_pedido_atomico`, `reserva_consumos`, `reserva_proveniencia`, `reserva_proveniencia_config`, `pedido_item_componentes`) |
| **`controlado` inalterado** | leitura direta | ✅ a tabela `reserva_proveniencia_config` (0092) **não existe** → o campo `controlado` **não existe e não pode ter sido alterado** |
| **Nenhum dado modificado** | auditoria das chamadas feitas | ✅ somente requisições `GET`; nenhuma escrita |
| **Nenhum deploy** | `.output` local, nada publicado | ✅ `BUILD-CUTOVER.json`: `publicacao: "NAO PUBLICADO - artefato somente local"` |
| **Nenhuma flag publicada alterada** | `.env.production` é novo e **não commitado**; só afeta o build | ✅ nada publicado |
| **Nenhum commit/push** | `git log` / `git status` | ✅ `HEAD = 748ea59` (igual a `origin/main`); 160 arquivos modificados/novos, **todos não commitados** |
| **Nenhuma reserva reconciliada** | — | ✅ não houve acesso de escrita |
| **Nenhum backup gerado** | — | ✅ nenhum `pg_dump` executado |

**Artefato de corte:** inalterado e íntegro — `1792429500000` / `cutover-2026-10-19-a1` / SHA-256 `0006762e66db57ad532b78cec8da95d24fefa6dfc98f1eb01f86a4bd9bf05329` (`PREFLIGHT_ARTEFATO_OK`).

---

## 6. RESULTADO

### **CREDENCIAL_INSUFICIENTE**

**O que está faltando (sem revelar nenhum segredo):**

1. **Credencial PostgreSQL de produção ausente do ambiente** — nenhuma URI de
   conexão, nenhuma senha de banco, nenhum token de Management API, em nenhum
   dos locais verificados (variáveis de processo, arquivos `.env*`, variáveis do
   Windows, registro, perfis do PowerShell, `.pgpass`, Gerenciador de Credenciais,
   token do Supabase, CLI, varredura de 966 arquivos). Sem isso não há `pg_dump`
   (backup), `psql -f` (migrations 0087 e 0089–0098) nem restore.
   **Como fornecer:** a *connection string* do Postgres de produção
   (Supabase → Project Settings → Database → Connection string → URI), **ou** um
   Personal Access Token do Supabase, **ou** um DBA humano com acesso ao SQL
   Editor. A variável pode ser exposta como `DATABASE_URL` no ambiente.

2. *(Contornado)* `pg_restore` inexistente nesta máquina — o runbook foi
   corrigido para usar `psql -f` com dump em formato plain, que cobre backup,
   validação e restore. Se o binário for fornecido, o formato custom volta a ser
   válido.

**Com a credencial, as etapas 4→10 do `RUNBOOK-CUTOVER.ps1` executam de imediato**,
sem novo desenvolvimento. O bundle de corte já está gerado, validado e pronto
(aguardando apenas o `git push` que dispara a publicação da plataforma — decisão
do responsável, com 160 arquivos ainda não commitados).

**Nenhuma etapa do runbook foi executada. Nenhum backup foi gerado. Nenhuma
migration foi aplicada. Nada foi publicado.**
