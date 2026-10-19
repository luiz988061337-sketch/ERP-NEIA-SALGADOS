# RELATÓRIO PRÉ-FLIGHT DE CUTOVER — ERP NÉIA SALGADOS

**Data:** 2026-10-19
**Etapa:** pré-flight de execução (preparação). **Nenhuma operação de escrita em produção foi executada.**
**Referências:** `CHECKLIST-AUTORIZACAO-CUTOVER.md` · `PLANO-CUTOVER-FINAL.md` · `BUILD-CUTOVER.json` · `RELATORIO-PRE-CUTOVER.md` · `RELATORIO-FECHAMENTO-P0.md`

---

## A. ARTEFATO — versão/hash confirmados

| Item | Valor | Confirmação |
|------|-------|-------------|
| Versão | `1792429500000` | ✅ manifesto = bundle |
| Rótulo | `cutover-2026-10-19-a1` | ✅ |
| SHA-256 esperado | `9d13ed828e09e2936bd74f38cf20c115e0dc39711eda7417f7bfce1ad2203d1` | ✅ **recalculado sobre o artefato em disco = idêntico** |
| Arquivos no bundle | 270 | ✅ confere com o manifesto |
| Gerado em | 2026-10-19T17:06:37Z | ✅ |
| Publicação | **NÃO PUBLICADO** | ✅ |

**Código não mudou desde a homologação** (`scripts/preflight-artefato.mjs` → `PREFLIGHT_ARTEFATO_OK`):

- Nenhum arquivo **funcional** (`src/`, `drizzle/migrations/`, `print-agent/`, `package.json`, `vite.config.ts`, `tsconfig.json`) tem mtime posterior ao build.
- Alterações posteriores são **apenas** `scripts/preflight-*.mjs` (ferramentas de auditoria, fora do bundle) e documentos `.md`.
- **Nenhum rebuild silencioso foi feito.** O `.output/` é exatamente o artefato homologado.

**Provas re-executadas agora sobre o artefato em disco:**

| Prova | Resultado |
|-------|-----------|
| Call sites legados no bundle | **0** em 270 arquivos |
| `criar_pedido_com_reserva` (0095) | presente |
| `cancelar_pedido_atomico` (0093) | presente |
| `registrar_consumo_reserva` (0091) | presente |
| `reservar_pedido_atomico` (0089, interna) | presente |
| `/api/versao` + header `x-neia-build` | presentes |
| Versão `1792429500000` gravada no bundle | ✅ |
| `npm run typecheck` | ✅ sem erro |
| Suítes locais `scripts/*.test.mjs` | ✅ **28/28** |

---

## B. BACKUP — procedimento pronto (NÃO executado)

**Comando exato** (rodar **imediatamente antes** da etapa 5, com a loja fechada):

```powershell
$stamp = (Get-Date -Format "yyyyMMdd-HHmmss")
$dump  = "backup-producao-pre-corte-$stamp.dump"
$hash  = "$dump.sha256"

pg_dump "$env:DATABASE_URL" --format=custom --file $dump
if ($LASTEXITCODE -ne 0) { throw "BACKUP FALHOU - CORTE ABORTADO" }

Get-FileHash -Algorithm SHA256 $dump | Select-Object -ExpandProperty Hash | Set-Content $hash
if (-not (Test-Path $dump) -or (Get-Item $dump).Length -lt 1MB) { throw "BACKUP VAZIO - CORTE ABORTADO" }
```

**Validação obrigatória** (restore em banco descartável, antes de seguir):

```powershell
createdb homolog_restore_test
pg_restore --dbname homolog_restore_test $dump
psql homolog_restore_test -v ON_ERROR_STOP=1 -f docs\auditoria\homologacao-staging\verify-0095.sql
```

**Identificação:** nome com data/hora + SHA-256 em `baseline/MANIFEST.json` (substituindo o hash da baseline de homologação pelo dump real de produção).

**Restore (se necessário):**

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --dbname "$env:DATABASE_URL" --clean --if-exists $dump
```

**Critérios para ABORTAR o corte:**

| # | Critério |
|---|-----------|
| 1 | `pg_dump` retorna exit ≠ 0 |
| 2 | Arquivo ausente ou com tamanho irreal (< 1 MB para um banco de produção) |
| 3 | `pg_restore` falha no banco de teste |
| 4 | `verify-*.sql` falha no banco restaurado |
| 5 | SHA-256 não registrado no manifesto |

---

## C. MIGRATIONS — lista exata e ordem

**Inventário do estado real:** rodar antes, em produção, `docs/auditoria/homologacao-staging/preflight-inventario-migrations.sql` (READ-ONLY, com `ROLLBACK`). Ele informa, por objeto, se cada migration já está aplicada.

| # | Migration | Aplicar? | Motivo | Risco | Ordem |
|---|-----------|----------|--------|-------|-------|
| 1 | `0087_reserva_consumos` | **SE AUSENTE** | Tabela `reserva_consumos` + índices + RLS (base do consumo 0091). Já no snapshot de homologação | Baixo | 1 |
| 2 | `0088_reservar_estoque_atomica` | **NÃO APLICAR** | Substitui a RPC legada cujo único chamador (checkout legado) **não existe** no bundle de corte. Nenhuma migration ≥ 0087 a chama. **Ver §C.1** | — | — |
| 3 | `0089_reservar_pedido_atomico` | **SE AUSENTE** | Reserva por pedido (usada internamente pela 0095) | Baixo | 2 |
| 4 | `0090_liberar_pedido_atomico` | **SE AUSENTE** | Liberação atômica (usada internamente pela 0093) | Baixo | 3 |
| 5 | `0091_registrar_consumo_reserva` | **SE AUSENTE** | Retirada física parcial/total + idempotência | Baixo | 4 |
| 6 | `0092_reserva_proveniencia` | **SE AUSENTE** | `reserva_proveniencia` + `reserva_proveniencia_config` (tabela do `controlado`) | Baixo | 5 |
| 7 | `0093_cancelar_pedido_atomico` | **SE AUSENTE** | Cancelamento atômico com liberação correta | Média | 6 |
| 8 | `0094_protecao_pagamento_cancelado` | **SE AUSENTE — ATIVA** | **ATIVA no corte.** Trigger de integridade financeira: bloqueia `cancelado`+`pago` e reabertura de cancelado | Média | 7 |
| 9 | `0095_criar_pedido_com_reserva` | **SE AUSENTE** | Núcleo: cria pedido + itens + reserva em 1 transação; valida combo, preço e idempotência | **Alta** (falha fechada) | 8 |
| 10 | `0096_reparo_parceiros_rls` | **SE AUSENTE — ATIVA** | **ATIVA no corte.** RLS/GRANT de parceiros/estoque | Baixa | 9 |
| 11 | `0097_modelagem_combo` | **SE AUSENTE** | `pedido_item_componentes` + `categorias.combo_preco_unit` + RLS/GRANT + seed dos 5 slugs | Média | 10 |
| 12 | `0098_acl_menor_privilegio` | **SE AUSENTE** | Matriz de menor privilégio: revoga `PUBLIC`/`anon`/`service_role` das RPCs novas | Baixa | 11 |

**Regras aplicadas:**
- Não reaplicar objeto já existente sem necessidade (o inventário decide).
- Não alterar migrations históricas já executadas.
- `0094` e `0096` são **ATIVAS** e entram na ordem.
- `0097` e `0098` entram explicitamente, na ordem.
- A 0095 **não instala** os triggers `exigir_reserva_producao` / `exigir_consumo_producao` (só as funções). **Não instalá-los antes da reconciliação das 19 reservas.** Verificado no clone: os triggers **não** existem.

### C.1. Prova de que a 0088 não é necessária

| Verificação | Resultado |
|---|---|
| Chamadores de `reservar_estoque_atomica` no **código-fonte** | 1 ocorrência (`src/routes/checkout.tsx:649`), **PROTEGIDA** por `if (!BUILD_DE_CORTE && !atomico)` |
| Chamadores de `reservar_estoque_atomica` no **bundle de corte** | **0** |
| Migrations ≥ 0087 que chamam `reservar_estoque_atomica` | **nenhuma** (0088 é a própria definição; 0093/0095 só a mencionam em comentário) |
| Trigger legado `trigger_reserva_estoque_pedido` (0042) | **removido** pela 0056/0057 — não existe no banco (verificado) ⇒ sem dupla reserva |
| `liberar_reserva_atomica` ainda chamada por trigger pré-0087? | Sim, por `liberar_reserva_pedido` (SECURITY DEFINER, dono) — **funciona sem a 0088**; a 0088 apenas reescreve a função |

**Conclusão:** a 0088 permanece **NÃO APLICAR**. Se, em produção, aparecer um chamador **vivo** de `reservar_estoque_atomica` (fora de bloco `!BUILD_DE_CORTE`), **PARAR e relatar**.

---

## D. CONFIGURAÇÃO — combos + controlado + flags

### D.0 Modelo de deploy — **B) a plataforma RECOMPILA**

| Evidência | Conclusão |
|---|---|
| `.gitignore`: *"`.env` é versionado de propósito: o build da Lovable lê as variáveis daqui"* + `git ls-files .env` | o build da plataforma lê o `.env` versionado |
| `AGENTS.md`: commits enviados ao branch conectado sincronizam com a Lovable | a plataforma **recompila** a partir do fonte |
| `.wrangler/deploy/config.json` → `.output/server/wrangler.json` | alvo Cloudflare Workers |

**Preparo do ambiente de build:** `.env.production` (versionável, carregado
pelo Vite **só** no modo `production`) com as 7 variáveis do corte — sem ele a
plataforma compilaria o bundle **legado** (flags OFF).

**Prova de equivalência:** `npm run build` **puro** (sem env explícito, como a
plataforma executa) → versão `1792429500000` presente, **0 call sites legados**,
fluxo novo (0095/0093/0091) e `/api/versao` presentes.

> O build **não é byte-reproduzível**: o SHA-256 identifica o artefato
> específico; a **versão** é o invariante (usada pelo guard de versão e pelo
> `VERSAO_MINIMA`). Registrar o SHA de `BUILD-CUTOVER.json` antes de publicar.

### D.1 Flags (compile-time, já gravadas no artefato)

| Flag | Valor | Estado |
|------|-------|--------|
| `VITE_FF_CRIACAO_ATOMICA` | `on` | ✅ no manifesto e no bundle |
| `VITE_FF_CONSUMO_RESERVA` | `on` | ✅ |
| `VITE_FF_CANCELAMENTO_ATOMICO` | `on` | ✅ |
| `VITE_FF_RESERVA_ATOMICA` | `off` | ✅ (0089 é interna à 0095; o cliente nunca a chama) |
| `VITE_BUILD_VERSION` / `VITE_VERSAO_MINIMA` | `1792429500000` | ✅ |

### D.2 Attestations

| Gate | Attestation | Estado no bundle de corte |
|------|-------------|----------------------------|
| Criação (0095) | `DEPENDENCIAS_CRIACAO_CORTE` (0095 + 0089 + 0092 + `fallback_checkout_removido`) | ✅ **completa** → gate "habilitado" |
| Cancelamento (0093/0090) | `DEPENDENCIAS_CANCELAMENTO_CORTE` (+ `controlado_ativo` + `cancelamentos_diretos_migrados`) | ✅ **completa** → gate "habilitado" |
| Consumo (0091) | `ATTESTACAO_CONSUMO` (0091 + 0087 + `producao_integrada`) | ✅ já completa |
| Build comum (sem as flags) | `DEPENDENCIAS_*_PADRAO` tudo `false` | ✅ gate fica "preparado" (fail-closed) — comportamento atual preservado |

### D.3 Combos — `combo_preco_unit`

Categorias com produtos `tipo_venda = 'combo_50'` (as únicas que exigem preço):

| Categoria (slug) | Nome | Preço atual | Configuração necessária | Status |
|---|---|---|---|---|
| `mini-fritos` | Mini Fritos | **1.60** | nenhuma (seed 0097) | ✅ OK |
| `mini-assados` | Mini Assados | **2.30** | nenhuma (seed 0097) | ✅ OK |
| `mini-pasteis` | Mini Pastéis | **2.30** | nenhuma (seed 0097) | ✅ OK |
| `mini-pizzas` | Mini Pizzas | **3.70** | nenhuma (seed 0097) | ✅ OK |
| `mini-empadinhas` | Mini Empadinhas | **2.40** | nenhuma (seed 0097) | ✅ OK |

Categorias ativas **sem** produtos de combo (não exigem preço): `bebidas`, `kits-para-festa`, `mini-congelados`.

**Ação (NÃO executada):** a 0097 já semeia esses 5 valores quando `combo_preco_unit IS NULL` (não sobrescreve configuração existente). Se o inventário em produção apontar alguma categoria de combo **sem preço**, aplicar:

```sql
UPDATE public.categorias SET combo_preco_unit = 1.60 WHERE slug = 'mini-fritos'     AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-assados'    AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-pasteis'    AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 3.70 WHERE slug = 'mini-pizzas'     AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.40 WHERE slug = 'mini-empadinhas' AND combo_preco_unit IS NULL;
```

**Regra:** nenhuma categoria de combo ativa pode ficar sem preço **antes** de abrir vendas. A 0095 falha fechada com `montagem_preco_ausente`.

### D.4 `controlado = true` (NÃO executar)

**Comando exato:**

```sql
UPDATE public.reserva_proveniencia_config SET controlado = true WHERE id = true
RETURNING id, controlado;
```

**Ponto de ativação (homologado):** DEPOIS das migrations (etapa 5) e do deploy do bundle (etapa 7), ANTES de abrir vendas (etapa 12).

**Coordenação exigida:**

| Estado proibido | Como a sequência impede |
|---|---|
| **fluxo novo + `controlado=false`** | O bundle de corte exige `controlado=true`: a 0095 falha fechada com `reconciliacao_pendente`/`inconsistencia_financeira`. Ordem: migrations → deploy → `controlado=true` → smoke → abrir. |
| **legado escrevendo reservas + `controlado=true`** | O bundle de corte **não contém** o caminho legado (0 call sites) e o lockdown de ACL (etapa 6) revoga o DML de `reservas_estoque`/`estoque_movimentacoes` e o EXECUTE das RPCs legadas para `authenticated`. |

**Rollback:** **não** reverter `controlado=true`. Se causar erro, corrigir a cobertura de reserva.

---

## E. TESTES REAIS — checklist preparado

Documento: **`docs/auditoria/homologacao-staging/TESTES-REAIS-POS-CORTE.md`** (20 testes + registro por teste + guarda de porta).

| # | Teste | Evidência esperada |
|---|-------|--------------------|
| 1 | Checkout — retirada | pedido + reserva ativa, estoque debitado 1× |
| 2 | Checkout — entrega | `tipo_entrega=entrega`, reserva ativa |
| 3 | PDV | staff ok; cliente comum `permissao_negada` |
| 4 | Atendimento | 0095 com reserva; canal exige papel |
| 5 | Combo 50 | 2 reservas (30+20), preço de categoria, débito por componente |
| 6 | Combo misto | 3 reservas, soma = quantidade, sem componente duplicado |
| 7 | Pix pendente | `pagamento_status=pendente` |
| 8 | Pagamento presencial | transição conforme regra; cancelamento bloqueado se `pago` |
| 9 | Reserva de estoque | 1 linha por item/componente, sem débito duplo |
| 10 | Produção | `em_producao`; "Iniciar preparo" **não** consome |
| 11 | Retirada parcial | `reserva_consumos` + `restante`; estoque inalterado |
| 12 | Segunda retirada parcial | 2ª linha; `restante` atualizado; replay idempotente |
| 13 | Cancelamento sem consumo | estoque integralmente devolvido |
| 14 | Cancelamento com consumo | devolve **só** o não consumido |
| 15 | Pedido pago não cancelável | `pagamento_nao_elegivel`; pedido ativo |
| 16 | Central de entregas | aparece 1× |
| 17 | Motoboy | visível só para o designado |
| 18 | Localização | GPS do motoboy aceito; fora do papel, negado |
| 19 | Fila de impressão | 1 job `pendente`, sem duplicata |
| 20 | Versão do frontend | `atual=minimo`; bundle antigo bloqueado |

**Uso mínimo de dados reais:** produto de teste, combo 50 (mínimo válido), Pix **pendente** (nunca confirmar Pix real), endereço de teste, motoboy de teste, sem imprimir cupom real se a impressão não estiver homologada.

**Critério de parada (§10 do checklist):** migration falha · estoque diverge · débito duplicado · crédito duplicado · pedido sem reserva · cancelamento sem liberação correta · frontend antigo opera · combo com quantidade errada · RLS/ACL permitindo legado · pagamento inconsistido ⇒ **PARAR, manter fechado, escalar. Não corrigir em produção.**

**Histórico:** a suíte automatizada equivalente já roda 32/32 no clone (`cutover-smoke-pg16.mjs`) e 10/10 no clone com lockdown (`cutover-lockout-pg16.mjs`).

---

## F. TEMPO ESTIMADO DA JANELA

| Etapa | Ação | Medido no clone | Estimativa em produção |
|------|------|-----------------|------------------------|
| 1 | Fechar vendas + confirmar ausência de escritas | — | 5 min |
| 2 | Backup + validação (dump + restore em banco descartável) | — | **10–20 min** (depende do tamanho do banco) |
| 3 | Inventário + verificações PRE (read-only) | < 2 s | 5 min |
| 4 | 11 migrations (DDL) | **1,95 s** somados | **2–5 min** (DDL em banco grande pode levar locks) |
| 5 | Configuração de combos | < 100 ms | 1 min |
| 6 | ACL/RLS (0098) + lockdown + auditoria RLS | ~0,2 s | 3 min |
| 7 | Deploy do bundle congelado | build local 3,4 s | **5–10 min** (depende do provedor) |
| 8 | Bloqueio de frontend antigo (`VERSAO_MINIMA`) | — | 2 min |
| 9 | `controlado = true` | < 50 ms | 1 min |
| 10 | Smoke (14 cenários) | 32 asserções em < 5 s | **15–20 min** |
| 11 | Decisão GO/NO-GO + reabertura | — | 5 min |
| | **TOTAL** | | **≈ 60–80 min** |

> **Janela máxima sugerida: 90 minutos.** O DDL é rápido; o tempo é dominado por **backup** e **deploy**. Se o backup passar de 20 min ou o deploy passar de 10 min, **abortar e reagendar** (o passo 1 é reversível a qualquer momento; a partir do passo 4 há DDL).

---

## G. PRIMEIRA OPERAÇÃO QUE ESCREVERIA EM PRODUÇÃO

**É a etapa 4 (migrations) — e, dentro dela, a primeira instrução da 0087:**

```sql
CREATE TABLE IF NOT EXISTS public.reserva_consumos (
  ...
);
```
(`drizzle/migrations/0087_reserva_consumos.sql`, linha 75)

Tudo que vem **antes** disso é leitura:
- etapa 1 (fechar vendas) → ação operacional, sem escrita no banco;
- etapa 2 (backup) → `pg_dump` só lê;
- etapa 3 (inventário, gate das 19, categorias de combo) → `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`;
- inventário de migrations → read-only;
- consultas de verificação → read-only.

**O primeiro comando que efetivamente escreve no banco de produção é, portanto:**

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle\migrations\0087_reserva_consumos.sql
```

**Até aqui, este pré-flight não escreveu nada em produção.** A partir desse comando, é necessário **nova autorização explícita**.

---

## H. VEREDITO

### PRONTO — AGUARDANDO AUTORIZAÇÃO PARA EXECUTAR

**Itens que ainda exigem decisão humana (não bloqueiam o pacote, mas precisam de dono):**

| # | Item | Quem decide |
|---|------|-------------|
| 1 | Nomes dos 4 responsáveis e a janela (data, início, hora limite para abortar) | Gestor de operações |
| 2 | Disponibilidade do TANCA TP-550/XP-80C → T1–T5; se a impressão automática for **indispensável** ao 1º dia e não houver contingência ⇒ **NO-GO OPERACIONAL** | Responsável operacional |
| 3 | Autorização de acesso **read-only** ao Supabase de produção para obter o dump (substitui a baseline de homologação no `MANIFEST.json`) | Gestor / DBA |
| 4 | Confirmação do inventário de produção: as categorias de combo ativas são exatamente as 5 com preço do seed | DBA (via `preflight-inventario-migrations.sql`) |
| 5 | Definição do prazo de `VERSAO_MINIMA` pós-cutover (para invalidar bundles antigos sem novo deploy) | Responsável técnico |
| 6 | Decisão sobre reconciliação das 19 reservas: pós-cutover (planejado) | Financeiro / admin |

**Estado do que foi feito nesta etapa:** somente leitura e auditoria local. Nenhuma migration aplicada, nenhum `controlado` alterado, nenhum deploy, nenhuma alteração de dado real, nenhuma reconciliação, nenhum commit/push.

**A linha entre preparação e execução é o comando `psql … -f 0087_reserva_consumos.sql`.** Até lá, este relatório vale.
