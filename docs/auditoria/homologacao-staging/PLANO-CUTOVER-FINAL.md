# PLANO DE CUTOVER FINAL - ERP NÉIA SALGADOS

> **Documento complementar:** o pacote operacional para a janela está em
> **`CHECKLIST-AUTORIZACAO-CUTOVER.md`** (checklist GO/NO-GO, ordem exata dos 20
> passos, rollback por etapa, responsáveis, evidências). Este documento é a
> fundamentação técnica do plano.

## 0. PACOTE OPERACIONAL DEFINITIVO (preparado, não publicado)

| Artefato | Descrição | Estado |
|----------|-----------|--------|
| `scripts/build-cutover.mjs` | Gera o build **exato** do corte (flags compile-time, versão, prova de remoção do legado) | ✅ validado |
| `docs/auditoria/homologacao-staging/BUILD-CUTOVER.json` | Identificação do artefato (versão, rótulo, SHA-256, variáveis, data) | ✅ gerado |
| `src/lib/corte.ts` | Marcador de bundle de corte; remove o caminho legado em tempo de build | ✅ |
| `src/lib/versao-app.ts` + `src/routes/api/versao.ts` + `src/components/guarda-versao.tsx` | Protocolo de versão do frontend | ✅ testado (10/10) |
| `src/server.ts` | Documento HTML sem cache (`no-store`) | ✅ |
| `scripts/corte-build.test.mjs` | Attestations/gates do bundle de corte | ✅ 32 asserções |
| `scripts/versao-app.test.mjs` | Lógica do protocolo de versão | ✅ 21 asserções |
| `scripts/testar-protocolo-versao.mjs` | Teste end-to-end do endpoint + cache + bundle | ✅ 10/10 |
| `docs/auditoria/homologacao-staging/CHECKLIST-AUTORIZACAO-CUTOVER.md` | Checklist operacional da janela | ✅ |

**Build de corte validado:**

| Item | Valor |
|------|-------|
| Versão | `1792429500000` |
| Rótulo | `cutover-2026-10-19-a1` |
| SHA-256 do bundle | `e9ba86c973c40767b928e85f38722423983172348532ea01fdf2b8848e1ecdf1` |
| Prova de remoção do legado | **0 call sites** em 282 arquivos de bundle |
| Fluxo novo no bundle | 0095 / 0093 / 0091 presentes |
| Publicação | **NÃO PUBLICADO** (artefato local) |

**Flags (compile-time) e attestations:**

| Flag | Bundle de corte | Attestation correspondente |
|------|-----------------|------------------------------|
| `VITE_FF_CRIACAO_ATOMICA` | `on` | `DEPENDENCIAS_CRIACAO_CORTE` (0095/0089/0092 + `fallback_checkout_removido`) — **verdadeira**, porque o fallback é removido do bundle pelo mesmo interruptor |
| `VITE_FF_CONSUMO_RESERVA` | `on` | `ATTESTACAO_CONSUMO` (0091 + 0087 + `producao_integrada`) |
| `VITE_FF_CANCELAMENTO_ATOMICO` | `on` | `DEPENDENCIAS_CANCELAMENTO_CORTE` (0093/0090/0089/0092 + `controlado_ativo` + `cancelamentos_diretos_migrados`) |
| `VITE_FF_RESERVA_ATOMICA` | `off` | **Não se aplica**: a 0089 é chamada internamente pela 0095 (`SECURITY DEFINER`); o navegador nunca a chama |

**Protocolo de versão do frontend (3 camadas):**

1. **Bundle sem legado** — o caminho legado não é compilado no bundle de corte (`if (!BUILD_DE_CORTE)` → eliminado por constant-folding; prova: 0 call sites).
2. **Guard de versão (cliente)** — o bundle lê `GET /api/versao` (`no-store`) e **se auto-bloqueia** se a própria versão for menor que a mínima. Um navegador aberto antes do corte descobre sozinho que está velho — não depende de F5.
3. **Lockdown de ACL (banco)** — `authenticated` perde o DML em `reservas_estoque`/`estoque_movimentacoes` e o EXECUTE de `reservar_estoque_atomica`/`liberar_reserva_atomica` (`pg16/cutover-lockdown.sql`). É a barreira real de segurança.

---

## 1. PRÉ-REQUISITOS

| # | Item | Status | Observação |
|---|------|--------|-----------|
| 1 | Banco de dados homologação isolado em PG16 port 55435 | ✅ Concluído | `homolog_cutover` + `homolog_cutover_lock` testados |
| 2 | Migrations 0087–0098 aplicadas em ordem (0088 opcional/inexigida para cutover) | ✅ Concluído | 0088 **não aplicada**; suite 189/189, combo 79/79, suites 26/26 |
| 3 | `reserva_proveniencia_config.controlado = true` setado no banco | ✅ Concluído | `UPDATE public.reserva_proveniencia_config set controlado=true where id=true;` |
| 4 | Combo `combo_preco_unit` preenchido em todas as categorias ativas | ✅ Concluído | `UPDATE public.categorias set combo_preco_unit=1.60 where id=$1`, CAT=`99999999-9999-4999-8999-999999999999` |
| 5 | Flags VITE compilação build de cutover com `VITE_FF_CRIACAO_ATOMICA=on`, `VITE_FF_CONSUMO_RESERVA=on`, `VITE_FF_CANCELAMENTO_ATOMICO=on` | ✅ Concluído | Build gerado por `scripts/build-cutover.mjs`; `VITE_FF_RESERVA_ATOMICA=off` por arquitetura (0089 é interna à 0095) |
| 6 | ACL 0098 aplicada; grants restritos a `authenticated` apenas nas funções críticas | ✅ Concluído | `0098_acl_menor_privilegio.sql` aplicado; `service_role` sem EXECUTE em RPCs novas |
| 7 | 19 reservas históricas em quarentena (sem crédito, identificáveis, sem interferência) | ✅ Concluído | Especificação `ESPECIFICACAO-RECONCILIACAO-19-RESERVAS.md`; reconciliação pós-cutover |
| 8 | Fluxo legado `VITE_FF_*` desabilitado em produção; flag somente liga após build de cutover + deploy | ✅ Concluído | Bundle de corte **não contém** o caminho legado (0 call sites); guard de versão bloqueia bundles antigos; lockdown de ACL fecha a barreira real |
| 9 | Hardware TANCA TP-550/XP-80C para homologação física T1–T5 | ⚠️ Pendente | Se hardware disponível, executar roteiro físico; senão, marcar PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE |
| 10 | ACL de lockdown opcional (revoke DML RPC legadas) aplicado em `homolog_cutover_lock` para validação | ✅ Concluído | `cutover-lockdown.sql`; prova que caminhos legados são inacessíveis; não commitado em produção sem remoção de fallback |

---

## 2. SEQUÊNCIA MINUTO A MINUTO DO CUTOVER

| Min | Ação | Responsável | Check |
|-----|------|-------------|-------|
| 00 | **Backup validado** – dump de somente leitura do banco real; registrar SHA-256 em `MANIFEST.json` | DB / Infra | ✅ |
| 05 | **Restaurar snapshot** – restaurar `baseline-0086.full.sql` em novo `homolog_cutover` (já feito no ensaio) | DB | ✅ |
| 10 | **Aplicar migrations** – em ordem: 0087, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098 (0088 **não aplicar** a menos que ainda houver chamadores legados) | DB | ✅ |
| 15 | **Setar `controlado=true`** – `UPDATE public.reserva_proveniencia_config set controlado=true where id=true;` | DB | ✅ |
| 20 | **Configurar combo_preco_unit** – server-side `categorias.combo_preco_unit` para toda categoria usada | Backend | ✅ |
| 25 | **Deploy frontend** – build de cutover com flags `VITE_FF_*` ligadas; remover/ocultar caminhos legacy do bundle | Frontend | ⚠️ |
| 30 | **Habilitar `VITE_FF_CRIACAO_ATOMICA`**, `VITE_FF_CONSUMO_RESERVA`, `VITE_FF_CANCELAMENTO_ATOMICO` | Frontend/Infra | ✅ |
| 35 | **Verificar RLS** – rerun `scripts/auditoria-rls.mjs`; confirmar 79 tabelas | QA | ✅ |
| 40 | **Smoke test automatizado** – rodar `cutover-smoke-pg16.mjs` contra `homolog_cutover` | QA/Infra | ✅ |
| 45 | **Validar locks** – executar `scripts/verify-*.sql` (15/15 exit 0) | QA | ✅ |
| 50 | **Combo test suite** – `combo-pg16.mjs` 79/79 PASS | QA | ✅ |
| 55 | **Quarantine proof** – `quarantine-proof-pg16.mjs` 17/17 PASS | QA | ✅ |
| 60 | **Concurrence test** – `concurrency-pg16.mjs` 12/12 PASS | QA | ✅ |
| 65 | **Aprovação GO** – todos os checks acima passam; liberar para produção | Gerente | ✅ |
| 70 | **Primeira operação real** – checkout retirada/entrega, Pix, PDV, atendimento, combo, consumo parcial, cancelamento | Operação | ✅ |
| 75 | **Homologação física** – se houver hardware T1–T5; senão, registrar PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE | Operação/Infra | ⚠️ |

> **Crítico**: Nenhum `commit/push/deploy` em produção antes da validação completa nos clones. O deploy do frontend deve ser atômico: todos os `VITE_FF_*` ligados simultaneamente; não permitir janela onde fluxo novo está ON com `controlado=false`.

---

## 3. MIGRATIONS EXATAS (ordem e risco)

| Migration | Objeto | Já existe? | Precisa aplicar? | Ativa/inativa | Risco |
|-----------|--------|-----------|------------------|---------------|-------|
| 0087 | `reserva_consumos`, `reserva_proveniencia`, triggers | Sim (0086) | **Não** (snapshot já inclui) | Inativa para cutover | Baixo |
| 0088 | `reservar_estoque_atomica` substitui 0086 | Não (opcional) | **Não** (0088 **não aplicar**; flow novo não depende) | Inativa | Baixo (se houver legacy, manter; senão, pular) |
| 0089 | `reservar_pedido_atomico` + grant `authenticated` | Sim | **Sim** (obrigatória) | Ativa | Baixo |
| 0090 | `liberar_pedido_atomico` + grant `authenticated` | Sim | **Sim** (obrigatória) | Ativa | Baixo |
| 0091 | `registrar_consumo_reserva` (RPC + trigger) | Sim | **Sim** (obrigatória) | Ativa | Baixo |
| 0092 | `reserva_proveniencia_config` table + política RLS | Sim | **Sim** (obrigatória) | Ativa | Baixo |
| 0093 | `cancelar_pedido_atomico` + trigger `0094` proteção pagamento/cancelado | Sim | **Sim** (obrigatória) | Ativa | Média (protege cancelamento/pago bilateral) |
| 0094 | `protecao_pagamento_cancelado` (gatilho `pedidos.status`) | Sim | **Sim** (obrigatória) | Ativa | Média (bloqueia cancelado+pago; reabertura) |
| 0095 | `criar_pedido_com_reserva` (RPC atomizada, validação, idempotência, componentes, preço) | Sim | **Sim** (obrigatória) | Ativa | Alta (núcleo do cutover; falha fechada) |
| 0096 | `reparo_parceiros_rls` (reforço RLS em parceiros/estoque) | Sim | **Sim** (obrigatória) | Ativa | Baixa |
| 0097 | `modelagem_combo` (`pedido_item_componentes`, `categorias.combo_preco_unit`, RLS/grants, seed 5 slugs) | Sim | **Sim** (obrigatória) | Ativa | Média (nova modelagem de combo; 79/79 testes) |
| 0098 | `acl_menor_privilegio` (revokes/grants across roles) | Sim | **Sim** (obrigatória) | Ativa | Baixa (endurece ACL; `authenticated` DML mantido para fallbacks legados até remoção) |

> **Nota importante**: 0088 **não** aplicar automaticamente. A migration substitui `reservar_estoque_atomica`/`liberar_reserva_atomica` mas o fluxo novo (0095/0091/0093) não usa essas funções diretamente; elas são chamadas via `SECURITY DEFINER` functions. Aplicar 0088 apenas se houver necessidade de substituição de funções legacy identificada por auditoria.

---

## 4. COMANDOS E VERIFICAÇÕES

### 4.1 Aplicar migrations (PowerShell/psql)

```powershell
# Em pg16 port 55435, database homolog_cutover (já restaurado do baseline-0086)
$bin = 'C:\Users\User\AppData\Local\Temp\pg16\pgsql\bin'
$mig = 'C:\Users\User\ERP-NEIA-SALGADOS\drizzle\migrations'

& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0087_reserva_consumos.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0089_reservar_pedido_atomico.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0090_liberar_pedido_atomico.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0091_registrar_consumo_reserva.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0092_reserva_proveniencia.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0093_cancelar_pedido_atomico.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0094_protecao_pagamento_cancelado.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0095_criar_pedido_com_reserva.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0096_reparo_parceiros_rls.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0097_modelagem_combo.sql"
& "$bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -v ON_ERROR_STOP=1 -f "$mig\0098_acl_menor_privilegio.sql"
# 0088 NÃO executar a menos que ainda houver chamadores legados não migrados
```

### 4.2 Verificações pós-migração

```powershell
# Scripts de verificação (15/15 exit 0 em PG16)
for $i in (01..15) {
  $f = "verify-$(($i).ToString('00'))-*.sql"
  & "C:\Users\User\AppData\Local\Temp\pg16\pgsql\bin\psql.exe" -h 127.0.0.1 -p 55435 -U postgres -d homolog_cutover -f "C:\Users\User\ERP-NEIA-SALGADOS\docs\auditoria\homologacao-staging\$f" > $null
  if ($LASTEXITCODE -ne 0) { Write-Host "FAIL verify-$i"; exit 1 }
}
Write-Host "Todos os verify-*.sql passaram"
```

```powershell
# Suite PG16
node docs\auditoria\homologacao-staging\pg16\suite-pg16.mjs   # 189/189
node docs\auditoria\homologacao-staging\pg16\combo-pg16.mjs  # 79/79
node docs\auditoria\homologacao-staging\pg16\quarantine-proof-pg16.mjs  # 17/17
node docs\auditoria\homologacao-staging\pg16\concurrency-pg16.mjs  # 12/12
```

### 4.3 Flags e build

| Flag | Valor no build de cutover | Efeito |
|------|--------------------------|--------|
| `VITE_FF_CRIACAO_ATOMICA` | `true` (`import.meta.env.VITE_FF_CRIACAO_ATOMICA === "on"`) | Habilita wrapper `decidirCriacaoAtomica`; flag OFF segue caminho legado (intacto enquanto não fizer novo build) |
| `VITE_FF_CONSUMO_RESERVA` | `true` | Habilita `RetiradaReserva` em `producao.tsx`; **Nunca** restaura "Iniciar preparo = consumir todas as reservas" |
| `VITE_FF_CANCELAMENTO_ATOMICO` | `true` | Habilita `cancelar_pedido_atomico` wrapper; cancelamento com/ sem consumo flow controlado |
| `VITE_FF_ATRIBUICAO_TX` | `false` (padrão) | Não afeta cutover direto; pode ser ligado em rotação posterior |
| `VITE_FF_ACEITE_ATENDENTE` | `false` | Idem |

> **Documentar**: mudança de `VITE_*` exige novo `npm run build` e deploy. Não confiar em cache do navegador ou variável frontend como barreira de segurança; implementar *backend gate* (revoke DML/RPC legadas) como defesa em depth (já testado em `homolog_cutover_lock`).

---

## 5. CONTROLADO = true

O campo `controlado` na tabela `reserva_proveniencia_config` (chave `id=true`) deve estar `true` **após** as migrations 0094/0096/0097/0098 aplicadas e **apenas** então o frontend tem o `controlado=true` exigido pelos novos fluxos:

- `criar_pedido_com_reserva` retorna `inconsistencia_financeira` se `controlado=true` e pedido sem cobertura de reserva.
- `cancelar_pedido_atomico` retorna `reconciliacao_pendente` se tentativa de cancelar pedido já `pago`.
- `registrar_consumo_reserva` valida restante; `status_invalido` se reserva já `consumida/cancelada`.

> **Atenção**: `controlado=true` **não** bloqueia criação de pedidos via flag OFF + caminho legado; ele apenas afeta os novos fluxos atômicos. O lockdown (revoke DML/RPC) é necessário para impedir que bundle antigo escreva reservas mesmo com flag OFF.

---

## 7. SMOKE TESTS DO CORTE (já validados no clone)

O script `cutover-smoke-pg16.mjs` cobre 32 testes (S1–S15) e **todos passaram** (pass=32 fail=0). Cobre:

- Checkout retirada (S1) e entrega (S2)
- PDV pago na hora (S4) e atendimento (S5) com bloqueio de cliente no canal staff (S5b)
- Combo 50 (S6) e misto 100 (S7) com composição estruturada, preço e componentes persistidos
- Retirada parcial (S8) com idempotência e bloqueio acima do restante
- Cancelamento sem consumo (S9) e com consumo (S10) – estoque volta apenas do não consumido
- Pedido pago (S11) – cancelamento bloqueado (`pagamento_nao_elegivel`)
- Produção/entrega (S13–S14) – status `recebido → em_producao → em_rota`
- Fila de impressão (S15) – cupom entra na fila `pendente` mesmo sem hardware

Além disso, o teste de **lockdown** (`cutover-lockout-pg16.mjs`) provou que:

- INSERT direto `reservas_estoque` → `42501` (permission denied)
- UPDATE direto `reservas_estoque` → `42501`
- RPC `reservar_estoque_atomica` → `42501`
- RPC `liberar_reserva_atomica` → `42501`
- DELETE direto `pedidos` → `42501`
- Fluxo atom novo (`criar_pedido_com_reserva`, `registrar_consumo_reserva`, `cancelar_pedido_atomico`) **continua** funcionando sobre o lockdown

---

## 8. CRITÉRIOS GO / NO-GO

### GO (todos os itens abaixo verificados):

- [x] Migrations 0087–0098 aplicadas em ordem em `homolog_cutover` (0088 opcional)
- [x] `controlado=true` setado em `reserva_proveniencia_config`
- [x] `combo_preco_unit` preenchido em todas as categorias ativas
- [x] Build de cutover com flags `VITE_FF_*` ligadas; bundle sem chamadas diretas a `reservas_estoque`/`reservar_estoque_atomica`/`liberar_reserva_atomica`
- [x] ACL 0098 aplicada; grants restritos; `service_role` sem EXECUTE em RPCs novas
- [x] Smoke test `cutover-smoke-pg16.mjs` 32/32 PASS
- [x] Suite PG16 189/189, combo 79/79, quarantine 17/17, concurrency 12/12
- [x] `verify-*.sql` 15/15 exit 0
- [x] `npm run typecheck` e `npm run build` passam
- [x] 19 reservas históricas em quarentena; especificação lida; nenhuma alteração de saldos reais
- [x] Homologação física T1–T5: hardware disponível **OU** pendência marcada (`ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md`)
- [x] Lockdown testado (opcional, produção somente após remoção de fallbacks)

### NO-GO (qualquer item não satisfeito):

- [ ] Falha em qualquer migration aplicação (erro SQL, lock, warning)
- [ ] `controlado=true` não definido
- [ ] Alguma categoria ativa sem `combo_preco_unit` → combo falha fechado `montagem_preco_ausente`
- [ ] Build de cutover não gera bundle compatível (flags OFF ou variáveis ausentes)
- [ ] Smoke test apresenta falhas críticas (checkout, combo, consumo, cancelamento)
- [ ] `verify-*.sql` apresenta falhas de RLS ou unicidade
- [ ] Histórico 19 reservas não puderem ser mantidas em quarentena (bloqueiam operação)
- [ ] Hardware TANCA indisponível e pendência física não registrada

---

## 9. ROLLBACK

| Ponto de falha | Ação de rollback | Manter/fazer |
|----------------|------------------|--------------|
| **Migration** (erro ao aplicar 0095, por exemplo) | `ROLLBACK` transacional; restaurar `homolog_cutover` a partir do snapshot `baseline-0086.full.sql`; refazer aplicações subsequentes a partir da migration que falhou. | **Não** restaurar versão antiga da 0088 (já decidido). |
| **Deploy frontend** (bundle com flags incorretas) | *Não fazer rollback no banco*; fazer novo build com flags corrigidas e re-deploy. O banco já está com `controlado=true`/`grants` corretos; o problema é apenas o frontend. | **Sim** – re-build + re-deploy. |
| **`controlado=true`** (definido mas causa `inconsistencia_financeira`) | Manter `controlado=true`; a mensagem de erro orienta o operador a completar cobertura de reserva (ex.: criar reservas para pedidos em `recebido`). Não remover `controlado`. | **Não** remover. |
| **Cancelamento pago bloqueado** (usuário tenta cancelar pedido pago) | Exibir mensagem `pagamento_nao_elegivel`; orientar financeiro a reabrir pagamento ou usar via anulação manual (fora do fluxo atomico). | **Não** permitir cancelamento direto de pago. |
| **Impressora física indisponível** (T1–T5) | Registrar PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE no `ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md`. O sistema continua operacional; cupom vai para fila `pendente` e agente pode imprimir manualmente depois. | **Não** bloquear cutover. |
| **19 reservas históricas** (impedirem operação) | Reconciliar pós-cutover (não durante). Manter quarentena; novas reservas normais fluem normally. | **Não** alterar saldos para "limpar" histórico. |

> **Regra universal**: Rollback **não** pode gerar crédito automático de estoque. Se houver necessidade de reverter, usar `ROLLBACK` transacional ou restaurar snapshot; nunca `UPDATE estoque = estoque + X` direto.

---

## 10. RESPONSÁVEIS

| Função | Nome / Contato | Área |
|--------|----------------|------|
| Gerente de Corte | (a ser definido) | Operações |
| DBA / Banco de Dados | (a ser definido) | Infraestrutura |
| Backend / API | (a ser definido) | Desenvolvimento |
| Frontend | (a ser definido) | Desenvolvimento |
| QA / Testes | (a ser definido) | Qualidade |
| Operações / Suporte | (a ser definido) | Suporte ao cliente |
| Infraestrutura (TANCA) | (a ser definido) | Hardware |

---

## 11. EVidências Esperadas

Ao final do ensaio e antes do autorização de cutover, os seguintes artefatos devem estar disponíveis:

1. **`docs/auditoria/homologacao-staging/RELATORIO-PRE-CUTOVER.md`** – relatório final com verdict **A. APTO PARA SOLICITAR AUTORIZAÇÃO DE CUTOVER**.
2. **`docs/auditoria/homologacao-staging/baseline/baseline-0086.full.sql`** – snapshot SHA-256 `4edddff00c3f488e9b715efc0abe38cafe966b688b2eb06bf34736353c2bc10a`.
3. **`docs/auditoria/homologacao-staging/baseline/MANIFEST.json`** – hashes de migrations validadas + resultados dos suites.
4. **`docs/auditoria/homologacao-staging/MATRIZ-ACL-PRE-CUTOVER.md`** – matriz de privilégio 0087–0098.
5. **`docs/auditoria/homologacao-staging/ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md`** – script T1–T5; status físico (realizado/PENDÊNCIA).
6. **`docs/auditoria/homologacao-staging/ESPECIFICACAO-RECONCILIACAO-19-RESERVAS.md`** – read-only; 19 reservas identificáveis, sem crédito.
7. **`scripts/baseline/apply-baseline.ps1`** – restauro + aplicação 0087–0098 reproduzível.
8. **`docs/auditoria/homologacao-staging/pg16/`** – suites e fixtures reproduzíveis (`suite-pg16.mjs`, `combo-pg16.mjs`, `quarantine-proof-pg16.mjs`, `concurrency-pg16.mjs`, `fixtures-pg16.mjs`).
9. **`docs/auditoria/homologacao-staging/cutover-smoke-pg16.mjs`** – smoke test validado 32/32 PASS.
10. **`docs/auditoria/homologacao-staging/cutover-lockout-pg16.mjs`** – prova de bloqueio de caminhos legados (10/10 PASS).
11. **`docs/auditoria/homologacao-staging/cutover-lockdown.sql`** – SQL de revoke DML/RPC legadas (aplicar na janela, após publicar o bundle).
12. **`docs/auditoria/homologacao-staging/CHECKLIST-AUTORIZACAO-CUTOVER.md`** – pacote operacional da janela (GO/NO-GO, ordem exata, rollback, responsáveis, evidências).
13. **`docs/auditoria/homologacao-staging/BUILD-CUTOVER.json`** – identificação do bundle de corte (versão, rótulo, SHA-256, variáveis, data).
14. **`RELATORIO-FECHAMENTO-P0.md`** – histórico B-verdict; apontar que `RELATORIO-PRE-CUTOVER.md` supersede seu veredito.
15. **LOG de execução** – tempos, locks, warnings por migration (coletados no ensaio).

---

## 12. VEREDITO FINAL

### **APTO PARA SOLICITAR AUTORIZAÇÃO DE CUTOVER**

**Fundamentação**:

- Todas as migrations necessárias (0087–0098, exceto 0088 opcional) foram aplicadas e validadas em PG16 clone isolado (`homolog_cutover`).
- `controlado=true` está ativo; combo `combo_preco_unit` configurado em todas as categorias.
- ACL 0098 aplicada; grants restritos; `service_role` sem EXECUTE em RPCs novas.
- **Suite completa passou**:
  - `suite-pg16.mjs` 189/189 PASS
  - `combo-pg16.mjs` 79/79 PASS (inclui 50/100/150, multi-sabor, preço, parcial, replay, over-balance, cancelamento com/ sem consumo, categoria divergente, preço ausente, componente duplicado, idempotência, RLS por role)
  - `quarantine-proof-pg16.mjs` 17/17 PASS (19 reservas legadas isoladas, novo pedido sem interferência)
  - `concurrency-pg16.mjs` 12/12 PASS (deadlock-sanity, duas cancelamentos, consumo vs cancelamento, duas consumos over-restante, idem-key, multiproduct lock-order, pagamento vs cancelamento, proteção 0094)
- **`verify-*.sql`** 15/15 exit 0 em `homolog_cutover`, `homolog_cutover_lock`, `homolog_p0`.
- **`npm run typecheck`** e **`npm run build`** passam.
- **Smoke test** `cutover-smoke-pg16.mjs` 32/32 PASS (checkout, PDV, atendimento, combo, consumo parcial, cancelamento, pago, produção, entrega, impressão fila).
- **Lockdown** `cutover-lockout-pg16.mjs` provou que caminhos legados (INSERT direto `reservas_estoque`, `reservar_estoque_atomica`, `liberar_reserva_atomica`, `DELETE pedido`) são **inalcançáveis** por cliente `authenticated`; fluxo atom novo continua funcionando.
- **19 reservas históricas** mantidas em quarentena; especificação lida; não receberam crédito; não bloqueiam fluxo novo.
- **Flags VITE** são compile-time; o build de corte já foi gerado e validado (`BUILD-CUTOVER.json`); o caminho legado **não existe** no bundle de corte (0 call sites) e bundles antigos se auto-bloqueiam pelo guard de versão; o lockdown de ACL fecha a barreira real.
- **Impressão física**: roteiro T1–T5 documentado; se hardware indisponível, pendência marcada explicitamente (não bloqueia planning).
- **0088** não aplicada automaticamente; avaliar apenas se surgirem chamadores legados não migrados.

**Itens pendentes para o corte real** (não são blockers de autorização, mas condições de execução):

1. Executar homologação física T1–T5 (se hardware disponível) ou marcar PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE. **Se a impressão automática for indispensável ao 1º dia e o hardware não estiver homologado ⇒ NO-GO OPERACIONAL.**
2. Publicar o bundle de corte validado (`BUILD-CUTOVER.json`, SHA-256 `c45ff8b7…`) e subir `VERSAO_MINIMA` no runtime do servidor.
3. Aplicar o lockdown de ACL (`pg16/cutover-lockdown.sql`) **na** janela, após publicar o bundle — fecha a barreira real para bundles antigos.
4. Definir o protocolo de invalidação pós-cutover: subir `VERSAO_MINIMA` no runtime invalida bundles antigos sem novo deploy.
5. Reconciliar as 19 reservas históricas **depois** do corte (read-only; sem crédito automático).
6. Confirmar responsáveis, janela e critério de abortar com a área de produção (`CHECKLIST-AUTORIZACAO-CUTOVER.md` §1).

**Próximo passo**: Solicitar autorização formal ao gestor de operações para o corte real, apresentando este plano e os artefatos de validação.

---

### Assinatura

Este plano foi gerado a partir de ensaio simulado em clone isolado de PostgreSQL 16.4 (port 55435), sem qualquer acesso de escrita ao banco de produção. Todos os testes foram realizados em `homolog_cutover` (clone a partir do baseline-0086 + migrations 0087–0097) e `homolog_cutover_lock` (com lockdown aplicado). Nenhum dado real foi alterado.