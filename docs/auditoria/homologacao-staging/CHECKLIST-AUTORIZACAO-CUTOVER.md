# CHECKLIST DE AUTORIZAÇÃO DE CUTOVER — ERP NÉIA SALGADOS

> **Documento de uso na janela.** Preencher na ordem. Marcar `[ ]` → `[x]`.
> Qualquer item **NÃO** marcado na coluna **OK?** = **NO-GO**.
> Referência: `PLANO-CUTOVER-FINAL.md` · `RELATORIO-PRE-CUTOVER.md` · `RELATORIO-FECHAMENTO-P0.md`.
>
> Documentos correlatos:
> - `RELATORIO-PREFLIGHT-CUTOVER.md` — pré-flight de execução (A–H), veredito e a **primeira operação que escreve em produção**.
> - `TESTES-REAIS-POS-CORTE.md` — os 20 testes reais pós-corte, com registro.
> - `RUNBOOK-CUTOVER.ps1` — runbook executável (modo simulação por padrão).
> - `preflight-inventario-migrations.sql` — inventário read-only 0087–0098.
> - `preflight-gate-19-reservas.sql` — gate read-only das 19 reservas.
> **Estado real de produção coletado em 2026-10-19** (read-only, PostgREST/OpenAPI):
> a produção está em estado **PRÉ-0087** — nenhuma das migrations 0087–0098 está
> aplicada. As **11 migrations do corte são todas necessárias**.
> Detalhes em `INVENTARIO-PRODUCAO.md`. Confirmar na hora da janela com
> `preflight-inventario-migrations.sql` (read-only).

---

## 0.0 ESTADO DA EXECUÇÃO (2026-10-19)

A execução foi **tentada** e está **BLOQUEADA por ausência de credencial de escrita**
neste ambiente — não por falha do plano. Detalhes em `RELATORIO-EXECUCAO-CUTOVER.md`.

| Item | Estado |
|---|---|
| Artefato | ✅ congelado e íntegro (SHA-256 conferido) |
| Produção | ✅ **intocada** — pré-0087, nenhuma migration aplicada |
| Credencial de banco em produção | ❌ **ausente** (sem `DATABASE_URL`, sem `service_role`, sem PAT) |
| Publicação do bundle | ❌ exige definir as `VITE_*` no ambiente de build da plataforma |
| 19 reservas | ⏸ gate pronto; **não contadas** (RLS staff) |

**Para executar, é preciso:** (a) a *connection string* do Postgres de produção
(ou um PAT) e (b) as variáveis `VITE_*` no ambiente de build da plataforma.
Com isso, as etapas 4→10 do runbook rodam de imediato.

---

## 0. IDENTIFICAÇÃO DO ARTEFATO DE CORTE

| Item | Valor |
|------|-------|
| Build de corte (versão) | `1792429500000` |
| Rótulo do build | `cutover-2026-10-19-a1` |
| SHA-256 do bundle | `0006762e66db57ad532b78cec8da95d24fefa6dfc98f1eb01f86a4bd9bf05329` |
| Manifesto | `docs/auditoria/homologacao-staging/BUILD-CUTOVER.json` |
| Gerado em | 2026-10-19T16:59:25Z |
| Estado do artefato | **local — NÃO publicado** |
| Reproduzir | `node scripts/build-cutover.mjs` |
| Versão **fixada** | `BUILD_VERSION=1792429500000 BUILD_LABEL=cutover-2026-10-19-a1 node scripts/build-cutover.mjs` |

> ⚠️ **O build não é byte-reproduzível** (o worker/nitro injeta nomes e timestamps). O SHA-256 acima identifica **o artefato específico que será publicado**. Na hora de publicar: conferir o SHA-256 em `BUILD-CUTOVER.json` e **re-ler o valor imediatamente antes do deploy** — se divergir do listado aqui, o valor do manifesto é o válido (a versão, essa, é fixa e não muda).

**Variáveis gravadas no bundle (compile-time):**

| Variável | Valor | Justificativa |
|----------|-------|---------------|
| `VITE_FF_CRIACAO_ATOMICA` | `on` | Criação atômica 0095 obrigatória; remove o fallback legado do bundle |
| `VITE_FF_CONSUMO_RESERVA` | `on` | Retirada de reserva explícita (0091) no painel de produção |
| `VITE_FF_CANCELAMENTO_ATOMICO` | `on` | Cancelamento atômico 0093/0090; remove UPDATE direto |
| `VITE_FF_RESERVA_ATOMICA` | `off` | **Arquitetura final:** a reserva (0089) é chamada internamente pela 0095 como `SECURITY DEFINER`. O navegador nunca a chama; manter `on` abriria uma rota RPC desnecessária |
| `VITE_BUILD_VERSION` | `1792429500000` | Versão monotônica do bundle (protocolo de versão) |
| `VITE_VERSAO_MINIMA` | `1792429500000` | Piso de versão; pode ser elevado em runtime por `VERSAO_MINIMA` |
| `VITE_BUILD_LABEL` | `cutover-2026-10-19-a1` | Rótulo legível |

**Provas embutidas no build (o script falha se alguma não passar):**
- ✅ **0 call sites legados** em 282 arquivos de bundle (`reservar_estoque_atomica`, `liberar_reserva_atomica`, INSERT/UPDATE/DELETE direto em `reservas_estoque`, INSERT direto em `pedidos`/`estoque_movimentacoes`).
- ✅ Fluxo novo presente: `criar_pedido_com_reserva` (0095), `cancelar_pedido_atomico` (0093), `registrar_consumo_reserva` (0091).
- ✅ Versão do bundle gravada no artefato.

---

## 1. RESPONSÁVEIS (preencher — não há nomes pré-definidos)

| Papel | Nome | Contato | Presente? |
|-------|------|---------|-----------|
| Responsável pelo **GO** | ____________________ | ____________________ | [ ] |
| Responsável **técnico** (banco/build) | ____________________ | ____________________ | [ ] |
| Responsável **operacional** | ____________________ | ____________________ | [ ] |
| Responsável pelo **rollback** | ____________________ | ____________________ | [ ] |
| SECOND / ESCALONAMENTO | ____________________ | ____________________ | [ ] |

| Janela | Valor |
|--------|-------|
| Data | ____ / ____ / ______ |
| Hora de início | ____:____ |
| Janela máxima | ______ minutos |
| Hora limite para abortar | ____:____ |
| Critério de abortar | ____________________ (ver §4) |

---

## 2. CHECKLIST GO / NO-GO (curto — revisar antes de abrir a janela)

| # | Item | Como verificar | OK? |
|---|------|----------------|-----|
| 1 | **Backup** confirmado e validado | dump lido, SHA-256 registrado no `MANIFEST.json` | [ ] |
| 2 | **Migrations exatas** conferidas (0087, 0089–0098; **sem 0088**) | tabela §3.2 | [ ] |
| 3 | **`combo_preco_unit`** configurado em **todas** as categorias ativas | `select count(*) from categorias where ativo and combo_preco_unit is null` = 0 | [ ] |
| 4 | **Build definitivo** validado | `BUILD-CUTOVER.json` presente; SHA-256 confere | [ ] |
| 5 | **Protocolo de versão** validado | `node scripts/testar-protocolo-versao.mjs` → 10/10 OK | [ ] |
| 6 | **Responsáveis** presentes e comunicados | §1 | [ ] |
| 7 | **Rollback** disponível e ENTENDIDO | §4 revisado com o responsável | [ ] |
| 8 | Sistema pode ficar **temporariamente fechado** | aviso ao cliente publicado; canal de aviso pronto | [ ] |
| 9 | **Smoke tests** preparados | `cutover-smoke-pg16.mjs` (32 asserções) disponível | [ ] |
| 10 | **Impressão física** homologada (se indispensável no 1º dia) | §6 | [ ] |
| 11 | ACL/RLS validados | `scripts/auditoria-rls.mjs` → 79 tabelas OK | [ ] |
| 12 | 19 reservas históricas em **quarentena** (sem crédito) | §5 | [ ] |
| 13 | Ambiente de produção **intocado** até a autorização | — | [ ] |

**Regra:** qualquer item acima sem `[x]` = **NO-GO**. Não há "quase pronto".

---

## 3. ORDEM EXATA DO CORTE

### 3.1 Migrations exatas (ordem obrigatória)

| # | Migration | Objeto | Precisa aplicar? | Ativa | Risco |
|---|-----------|--------|------------------|-------|-------|
| 1 | `0087_reserva_consumos.sql` | `reserva_consumos`, `reserva_proveniencia` | **Não** (já no snapshot) | inativa p/ corte | baixo |
| 2 | `0088_reservar_estoque_atomica.sql` | substitui 0030 | **NÃO APLICAR** | inativa | — |
| 3 | `0089_reservar_pedido_atomico.sql` | 0089 + grant `authenticated` | **Sim** | ativa | baixo |
| 4 | `0090_liberar_pedido_atomico.sql` | 0090 + grant `authenticated` | **Sim** | ativa | baixo |
| 5 | `0091_registrar_consumo_reserva.sql` | 0091 + trigger | **Sim** | ativa | baixo |
| 6 | `0092_reserva_proveniencia.sql` | `reserva_proveniencia_config` + RLS | **Sim** | ativa | baixo |
| 7 | `0093_cancelar_pedido_atomico.sql` | 0093 | **Sim** | ativa | média |
| 8 | `0094_protecao_pagamento_cancelado.sql` | trigger de proteção de pagamento | **Sim** | ativa | média |
| 9 | `0095_criar_pedido_com_reserva.sql` | RPC 0095 (núcleo) | **Sim** | ativa | **alta** (falha fechada) |
| 10 | `0096_reparo_parceiros_rls.sql` | reforço RLS | **Sim** | ativa | baixa |
| 11 | `0097_modelagem_combo.sql` | `pedido_item_componentes`, `combo_preco_unit` | **Sim** | ativa | média |
| 12 | `0098_acl_menor_privilegio.sql` | matriz de menor privilégio | **Sim** | ativa | baixa |

> **0088 não entra.** O fluxo de corte (0095 → 0089, 0091, 0093 → 0090) não usa `reservar_estoque_atomica`/`liberar_reserva_atomica`. Aplicá-la seria trocar uma versão antiga por uma que ninguém chama — sem ganho e com risco. **Decisão registrada.**

### 3.2 Sequência (20 passos, sem ambiguidade)

| # | Passo | Ação | Verificação | OK? |
|---|-------|------|-------------|-----|
| 1 | Fechar vendas | Bloquear novos pedidos (banner "manutençãoemporária") | Nenhum pedido novo entrando | [ ] |
| 2 | Ausência de escrita | `select count(*) from pedidos where created_at > now() - interval '2 min'` estável | valor não sobe | [ ] |
| 3 | **Backup** | Dump completo; SHA-256 no `MANIFEST.json`; cópia off-site | arquivo + hash conferidos | [ ] |
| 4 | Estado pré-cutover | `select * from drizzle.__drizzle_migrations` / inventário de objetos 0087–0098 | tabela §3.3 preenchida | [ ] |
| 5 | **Migrations** | aplicar 0087, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098 (`ON_ERROR_STOP=1`) | exit 0 em todas; sem WARNING | [ ] |
| 6 | **Combos** | `UPDATE categorias SET combo_preco_unit = <preço> WHERE <cat de combo>` | 0 categorias de combo sem preço | [ ] |
| 7 | **ACL / RLS** | conferir 0098; `scripts/auditoria-rls.mjs` | 79 tabelas OK | [ ] |
| 8 | `controlado=true` | `UPDATE reserva_proveniencia_config SET controlado=true WHERE id=true` | retorna 1 linha | [ ] |
| 9 | **Publicar build** | publicar o artefato `1792429500000` (SHA-256 conferido) | `/api/versao` devolve `atual=1792429500000` | [ ] |
| 10 | **Bloqueio de versão** | `VERSAO_MINIMA=1792429500000` no runtime do servidor | `/api/versao` devolve `minimo=1792429500000`, `corte=true` | [ ] |
| 11 | **Fluxos coordenados** | checkout + PDV + atendimento + recorrentes já migrados no **mesmo** bundle | bundle único, sem versão intermediária | [ ] |
| 12 | **Inacessibilidade do legado** | aplicar `cutover-lockdown.sql` (revoke DML/RPC legadas) | `42501` em INSERT `reservas_estoque`, `rpc reservar_estoque_atomica`, `rpc liberar_reserva_atomica`, `DELETE pedidos` | [ ] |
| 13 | **Smoke test** | §6 | 32/32 | [ ] |
| 14 | **Estoque** | conferir `produtos.estoque` antes/depois do smoke | sem débitos extras | [ ] |
| 15 | **Criação** | checkout retirada + entrega + PDV + atendimento | 4 pedidos criados com reserva | [ ] |
| 16 | **Produção/consumo** | retirada parcial (20 de 50) e total | `reserva_consumos` gravado; estoque sem crédito indevido | [ ] |
| 17 | **Cancelamento** | cancelar sem consumo e com consumo | estoque devolve só o não consumido | [ ] |
| 18 | **Pagamentos** | Pix pendente → pago; tentar cancelar pedido pago | cancelamento de pago **bloqueado** | [ ] |
| 19 | **Entregas / impressão** | status até `em_rota`; cupom na fila `pendente` | fila com job `pendente` (sem hardware) | [ ] |
| 20 | **Decidir GO** | §2 conferido de novo; reabrir | decisão registrada | [ ] |

> **Janelas proibidas.** (a) fluxo novo ON com `controlado=false`; (b) checkout novo ativo com PDV/atendimento ainda no legado — impossível aqui, porque o bundle é único e o legado **não existe** nele; (c) bundle legado escrevendo reservas depois de `controlado=true` — barrado pelo lockdown (passo 12) e pelo guard de versão (passo 10).

### 3.3 Estado real × migrations (preencher na janela)

| Migration | Objeto | Já existe? | Precisa aplicar? | Ativa/inativa | Risco |
|-----------|--------|-----------|------------------|---------------|-------|
| 0087 | `reserva_consumos`/`reserva_proveniencia` | **não** | **SIM** | ativa | baixo |
| 0088 | `reservar_estoque_atomica` | sim (0030/0086) | **NÃO** | inativa | — |
| 0089 | `reservar_pedido_atomico` | **não** | **SIM** | ativa | baixo |
| 0090 | `liberar_pedido_atomico` | **não** | **SIM** | ativa | baixo |
| 0091 | `registrar_consumo_reserva` | **não** | **SIM** | ativa | baixo |
| 0092 | `reserva_proveniencia_config` | **não** | **SIM** | ativa | baixo |
| 0093 | `cancelar_pedido_atomico` | **não** | **SIM** | ativa | média |
| 0094 | trigger proteção pagamento | **não** | **SIM — ATIVA** | ativa | média |
| 0095 | `criar_pedido_com_reserva` | **não** | **SIM** | ativa | **alta** |
| 0096 | reparo RLS parceiros | parcial | **SIM — ATIVA** | ativa | baixa |
| 0097 | `pedido_item_componentes` + `combo_preco_unit` | **não** | **SIM** | ativa | média |
| 0098 | matriz ACL | a confirmar | **SIM** | ativa | baixa |

---

## 4. ROLLBACK OPERACIONAL (por etapa)

| Etapa | Pode voltar? | Como voltar | Manter fechado? | Dados já escritos? |
|-------|--------------|-------------|-----------------|--------------------|
| 1–2 (fechar vendas) | Sim | reabrir vendas | não | nenhum |
| 3 (backup) | Sim | nenhuma ação | sim | nenhum |
| 4 (estado pré) | Sim | nenhuma ação | sim | nenhum |
| 5 (migrations) | **Sim, até o passo 8** | `ROLLBACK` transacional; se a transação já fechou, restaurar o snapshot `baseline-0086.full.sql`; reaplicar de onde parou. **Nunca** restaurar a 0088 antiga. | sim | nenhum (só DDL) |
| 6 (combos) | Sim | reverter `combo_preco_unit` ao valor anterior (anotar antes!) | sim | só `categorias` |
| 7 (ACL/RLS) | Sim | reaplicar 0098 / restaurar snapshot | sim | só `pg_*` |
| 8 (`controlado=true`) | **NÃO remover** | manter `true`; a mensagem de erro orienta a completar a cobertura | sim | nenhum |
| 9–11 (publicar build / version) | Sim | republicar o bundle anterior; **manter** `VERSAO_MINIMA` no bundle novo → o bundle anterior se auto-bloqueia (desejado) | **sim** | nenhum |
| 12 (lockdown) | **Não** (é a barreira) | manter revogado; o bundle sem fallback não depende dessas permissões | sim | nenhum |
| 13–19 (smoke / operação) | **Parcial** | pedidos criados sob o regime controlado **existem e continuam**; rollback de aplicação não pode "fingir" que não existiram. Para desfazer um pedido de teste: `cancelar_pedido_atomico` (libera o saldo não consumido). **Nunca** `UPDATE produtos.estoque` para compensar. | até concluir a análise | **sim** — pedidos de teste, reservas, consumos, estoque |
| 20 (reabrir) | — | — | — | — |

> **Regras absolutas de rollback**
> 1. **Nenhum crédito automático de estoque.** Correção de saldo só via RPC de negócio (`cancelar_pedido_atomico` / `liberar_pedido_atomico`).
> 2. **A 0088 nunca é fonte de rollback.**
> 3. Depois do passo 13, a operação volta **para o regime controlado**, não para o legado. Reverter o bundle com `controlado=true` mantém o bloqueio de version: o bundle antigo não opera.
> 4. Se a análise de um pedido criado durante a janela exigir reversão, o caminho é **cancelamento atômico** (0093), que devolve apenas o saldo não consumido e deixa rastro em `reserva_consumos`.

---

## 5. RESERVAS HISTÓRICAS (19) — comportamento esperado

| Expectativa | Verificação | OK? |
|-------------|-------------|-----|
| Continuam identificáveis | `reconciliacao-19-reservas-legado.sql` (read-only) retorna 19 | [ ] |
| Não recebem crédito | `produtos.estoque` inalterado pela leitura | [ ] |
| Não interferem em novos pedidos | smoke de criação passa sem ajuste | [ ] |
| Não bloqueiam a operação | nenhum pedido novo travado | [ ] |
| Reconciliação real é **pós-cutover** | não é pré-requisito da janela | [ ] |

> **Não alterar saldos para "limpar" histórico.** A especificação é read-only (`ESPECIFICACAO-RECONCILIACAO-19-RESERVAS.md`).

---

## 6. SMOKE TESTS E IMPRESSÃO

### 6.1 Smoke tests (32 asserções — `cutover-smoke-pg16.mjs`)

| # | Cenário | Resultado esperado | OK? |
|---|---------|--------------------|-----|
| 1 | Checkout retirada | criado, reserva ativa, estoque debitado, Pix pendente | [ ] |
| 2 | Checkout entrega | criado, `tipo_entrega=entrega` | [ ] |
| 3 | PDV pago na hora | criado, `pagamento_status=pago` | [ ] |
| 4 | Atendimento | criado | [ ] |
| 5 | Cliente em canal staff | `permissao_negada` | [ ] |
| 6 | Combo 50 (30+20) | 2 reservas, preço de categoria, componentes persistidos | [ ] |
| 7 | Combo misto 100 (50+30+20) | criado, 3 reservas | [ ] |
| 8 | Retirada parcial 20/50 | `consumido`, restante 30, estoque inalterado; replay idempotente; acima do restante bloqueado | [ ] |
| 9 | Cancelamento sem consumo | estoque devolvido; replay = `ja_cancelado` | [ ] |
| 10 | Cancelamento com consumo (30/50) | devolve **só** 20 | [ ] |
| 11–12 | Pedido pago | cancelamento bloqueado (`pagamento_nao_elegivel`); pedido segue ativo | [ ] |
| 13–14 | Produção / entrega | `recebido → em_producao → em_rota` | [ ] |
| 15 | Impressão | cupom na fila `pendente` (sem hardware) | [ ] |

### 6.2 Impressão física — TANCA TP-550 / XP-80C

| Item | Estado |
|------|--------|
| Hardware disponível antes do go-live? | [ ] sim [ ] não |
| Roteiro T1–T5 executado (`ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md`) | [ ] |
| Contingência manual previamente aprovada? | [ ] sim [ ] não — descrever: ____________________ |
| A impressão automática é **indispensável** para a operação do 1º dia? | [ ] sim [ ] não |

> **Se a impressão automática for indispensável e o hardware não estiver homologado → `NO-GO OPERACIONAL`.**
> Registrar como **PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE** caso não seja indispensável (a fila funciona; o agente imprime depois).

---

## 7. EVIDÊNCIAS ESPERADAS (arquivar junto do relatório da janela)

| # | Evidência | Onde | OK? |
|---|-----------|-------|-----|
| 1 | `BUILD-CUTOVER.json` (hash, variáveis, data) | `docs/auditoria/homologacao-staging/` | [ ] |
| 2 | Saída do `build-cutover.mjs` (provas de call site e versão) | log da janela | [ ] |
| 3 | `node scripts/testar-protocolo-versao.mjs` → 10/10 | log da janela | [ ] |
| 4 | `node scripts/corte-build.test.mjs` → tudo OK | log da janela | [ ] |
| 5 | `node scripts/versao-app.test.mjs` → tudo OK | log da janela | [ ] |
| 6 | 28/28 suítes locais (`scripts/*.test.mjs`) | log da janela | [ ] |
| 7 | `npm run typecheck` + `npm run build` sem erro | log da janela | [ ] |
| 8 | `suite-pg16` 189/189 · `combo-pg16` 79/79 · `quarantine` 17/17 · `concurrency` 12/12 | log da janela | [ ] |
| 9 | `verify-*.sql` 15/15 exit 0 | log da janela | [ ] |
| 10 | `scripts/auditoria-rls.mjs` → 79 tabelas | log da janela | [ ] |
| 11 | `cutover-smoke-pg16.mjs` 32/32 | log da janela | [ ] |
| 12 | `cutover-lockout-pg16.mjs` 10/10 (lockdown) | log da janela | [ ] |
| 13 | Saída das 11 migrations (duração, warnings, locks) | log da janela | [ ] |
| 14 | DUMP novo do baseline de produção + SHA-256 no `MANIFEST.json` | `baseline/` | [ ] |
| 15 | Saída do `reconciliacao-19-reservas-legado.sql` (read-only) | log da janela | [ ] |
| 16 | Evidência de impressão T1–T5 (ou PENDÊNCIA registrada) | `ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md` | [ ] |
| 17 | Este checklist preenchido e assinado | `CHECKLIST-AUTORIZACAO-CUTOVER.md` | [ ] |
| 18 | **Testes reais** pós-corte preparados | `TESTES-REAIS-POS-CORTE.md` (20 testes + registro) | [ ] |
| 19 | **Runbook** conferido (modo simulação) | `RUNBOOK-CUTOVER.ps1` sem `-Executar` | [ ] |
| 20 | **Pré-flight** lido e aceito | `RELATORIO-PREFLIGHT-CUTOVER.md` (veredito + 1ª operação que escreve) | [ ] |
| 21 | **Inventário de produção** conferido | `preflight-inventario-migrations.sql` (read-only) | [ ] |
| 22 | **Preços dos 54 combos** validados (nenhum muda de preço) | `PRECO-COMBOS-PRODUCAO.md` — 54/54 IGUAL | [ ] |
| 23 | **Ambiente de build** com as 7 variáveis do corte | `.env.production` versionado (modo `production`) | [ ] |
| 24 | **Build da plataforma** = bundle de corte (prova) | `npm run build` puro → versão presente + 0 legado | [ ] |
| 25 | **Credencial** de produção disponível | connection string / PAT / DBA | [ ] |

---

## 8. PROTOCOLO DE VERSÃO DO FRONTEND (resumo operacional)

**Problema.** As flags `VITE_*` são compile-time. Um navegador aberto antes do corte continua com o bundle antigo em cache e poderia criar pedido sem reserva atômica.

**Solução implantada (3 camadas, nenhuma depende de o usuário apertar F5):**

| Camada | O que faz | Onde |
|--------|-----------|------|
| **1. Bundle sem legado** | o caminho legado **não é compilado** no bundle de corte (prova: 0 call sites) | `src/lib/corte.ts` + blocos `if (!BUILD_DE_CORTE)` |
| **2. Guard de versão (cliente)** | o bundle lê `GET /api/versao` (`no-store`) e **se auto-bloqueia** se a própria versão for menor que a mínima | `src/lib/versao-app.ts`, `src/components/guarda-versao.tsx` |
| **3. Lockdown de ACL (banco)** | `authenticated` perde o DML em `reservas_estoque`/`estoque_movimentacoes` e o EXECUTE das RPCs legadas | `pg16/cutover-lockdown.sql` (aplicar no passo 12) |

**Regras de cache:** `/api/versao` → `no-store, no-cache, must-revalidate, max-age=0`; documento HTML → `no-store, no-cache, must-revalidate, max-age=0`; `/assets/*` → `immutable` (nome com hash de conteúdo, seguro).

**Comportamento de falha:** se o endpoint não responder, o bundle usa a mínima assada no build e **bloqueia** (fail-closed). Indisponibilidade de rede nunca libera um bundle velho.

**No teste local (`scripts/testar-protocolo-versao.mjs`, 10/10):** endpoint 200 com `no-store`; `atual=minimo=versão`; `corte=true`; HTML sem cache; 0 call sites legados.

**Pós-cutover:** para invalidar um bundle sem novo deploy, subir `VERSAO_MINIMA` no runtime do servidor (o piso sobe; bundles antigos se auto-bloqueiam).

---

## 9. DECISÃO

| | |
|---|---|
| Data/hora da decisão | ____ / ____ / ______  ____:____ |
| Decisão | [ ] **GO — reabrir**  [ ] **NO-GO — manter fechado** |
| Motivo (se NO-GO) | ____________________________________________ |
| Assinatura — Responsável pelo GO | ____________________ |
| Assinatura — Responsável técnico | ____________________ |
| Assinatura — Responsável pela operação | ____________________ |

---

PRONTO PARA AUTORIZAÇÃO HUMANA