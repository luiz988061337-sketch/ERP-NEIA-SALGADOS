# Relatório pré-cutover — ERP Néia Salgados

**Data:** 2026-10-19  
**Base:** `RELATORIO-FECHAMENTO-P0.md` (veredito anterior **B. APTO COM
RESSALVAS**)  
**Ambiente de prova:** PostgreSQL 16.4 portátil, `127.0.0.1:55435`, bancos
descartáveis `homolog_p0` e `homolog_baseline_test`.  
**Escopo:** fechar as ressalvas que sustentavam o veredito **B**.  
**Fora de escopo:** acesso/ação em produção, execução de cutover, commit, push,
deploy e impressão física.

## Veredito

# **A. APTO PARA PLANEJAR CUTOVER**

Todas as ressalvas anteriores estão **RESOLVIDAS** ou classificadas como
**NÃO BLOQUEANTE / PÓS-CUTOVER**. Não há bloqueador lógico restante para
planejar o cutover. O que resta são **etapas obrigatórias de execução do
cutover** (dados, flags, impressão física e remoção do legado), listadas na
seção 8.

| Ressalva anterior | Classificação | Base |
|---|---|---|
| Combo/montagem sem modelagem | **RESOLVIDA** | `0097` + `pedido_item_componentes`; PG16 combo **79/79** |
| Retirada parcial sem ação | **RESOLVIDA** | ação explícita de retirada física na produção; PG16 consumo 20+10 |
| 19 reservas históricas | **NÃO BLOQUEANTE / PÓS-CUTOVER** | prova de isolamento **17/17**; sem crédito automático |
| Baseline/replay quebrado | **RESOLVIDA** | snapshot canônico + manifesto; **189/189** em banco novo |
| ACL ampla 0088–0095 | **RESOLVIDA** (RPC) + residual **NÃO BLOQUEANTE / PÓS-CUTOVER** | `0098`; matriz em `MATRIZ-ACL-PRE-CUTOVER.md` |
| Impressão sem homologação física | **HOMOLOGAÇÃO FÍSICA PENDENTE** (não é falha lógica) | roteiro físico criado |
| Legado/fallback ainda no código | **NÃO BLOQUEANTE / PÓS-CUTOVER** | flags atômicas ON; remover após zero chamador |
| `controlado=false` com fluxo novo | **RESOLVIDA** | `controlado=true` obrigatório e testado |
| `0088` substituindo RPC viva | **RESOLVIDA** | chamador documentado; `0098` revoga `anon/PUBLIC/service_role` |

### Adendo — pacote operacional definitivo (2026-10-19, após a autorização)

O veredito acima permanece **A**. Foi preparado o **pacote operacional** para a
janela de corte:

| Artefato | Conteúdo |
|---|---|
| `CHECKLIST-AUTORIZACAO-CUTOVER.md` | checklist GO/NO-GO, ordem exata dos 20 passos, rollback por etapa, responsáveis, evidências |
| `BUILD-CUTOVER.json` | build de corte gerado e validado (versão `1792429123701`, SHA-256 `31a5bacb…`), **não publicado** |
| `PLANO-CUTOVER-FINAL.md` §0 | fundamentação do pacote |

**Duas pendências do veredito anterior foram fechadas tecnicamente:**

- *"Legado/fallback ainda no código"* → o **bundle de corte não contém mais o caminho legado** (0 call sites de `reservar_estoque_atomica`/`liberar_reserva_atomica`/DML direto, provado por `scripts/build-cutover.mjs` sobre 282 arquivos). O código-fonte mantém o legado atrás de `if (!BUILD_DE_CORTE)` para os builds comuns; no bundle de corte ele é eliminado em tempo de build.
- *"Risco de bundle antigo em cache"* → **protocolo de versão** implantado em 3 camadas: (1) bundle sem legado; (2) guard de versão no cliente (`GET /api/versao`, `no-store`, auto-bloqueio do bundle desatualizado — não depende de F5); (3) lockdown de ACL no banco (revoke de DML/RPC legadas), que é a barreira real de segurança. Validado por `scripts/testar-protocolo-versao.mjs` (10/10) e `scripts/corte-build.test.mjs` (32/32).

**Impressão física** permanece **PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE**: se a impressão automática for indispensável ao primeiro dia e o hardware TANCA não estiver homologado (T1–T5), o corte é **NO-GO OPERACIONAL**.

---

## 1. Combo / montagem — RESOLVIDA

### Problema anterior

O carrinho guardava apenas o nome textual (“Combo … 50un”), `produto_id: null`
e a quantidade. Sem produto/quantidade escolhidos, o servidor não tinha como
reservar/debitar componentes; a `0095` recusava com
`montagem_sem_modelagem`. O preço do combo vinha de constante do frontend.

### Solução implementada

1. **`0097_modelagem_combo.sql`**
   - tabela `public.pedido_item_componentes (pedido_item_id, produto_id,
     quantidade)`;
   - coluna `public.categorias.combo_preco_unit` (preço unitário autoritativo);
   - RLS: dono do pedido, motoboy atribuído e staff (`admin`, `atendente`,
     `producao`) leem; escrita só por função `SECURITY DEFINER`;
   - seed dos cinco slugs de combo conhecidos
     (`COMBO_CATEGORIAS_FALLBACK`); categorias sem preço falham fechado.
2. **Frontend**
   - `src/lib/combo-componentes.ts`: soma, validação, escala proporcional exata
     e mesclagem por produto (evita duplicado ao somar o mesmo combo);
   - `src/lib/cart.tsx`: `CartItem.componentes`; ao adicionar/mesclar/alterar
     quantidade, a composição é reescalada para somar exatamente o total;
   - `src/routes/combo.tsx`: monta `componentes` estruturados e lê o preço da
     categoria;
   - `src/routes/checkout.tsx`: valida soma/categoria, lê o preço autoritativo e
     envia os componentes ao payload atômico;
   - `src/routes/conta.tsx`: histórico seleciona `pedido_item_componentes(*)` e
     recompõe quando existir; combo legado continua sem composição.
3. **Servidor**
   - `0095`: valida componentes (soma = quantidade, mesma categoria, sem
     duplicado, múltiplo de 50), trava produtos em ordem determinística, lê
     `categorias.combo_preco_unit`, grava componentes e usa o total de
     componentes na cobertura/idempotência;
   - `0089`: soma componentes no plano de reserva;
   - `0090`: cobertura/liberação considera componentes;
   - `0091`: aceita item direto ou componente na posse da reserva;
   - `0093`: contagem de itens reserváveis inclui componentes.

### Evidência PG16 (`combo-pg16.mjs`, **79/79 PASS**)

- criação 50 com composição 30+20; item pai `produto_id NULL`, preço de
  categoria, 2 componentes, 2 reservas, 2 débitos, 2 proveniências;
- **50 de 200**, segundo 50, saldo, cancelamento e replay sem re-débito;
- replay idempotente `ja_criado`; replay divergente `idempotencia_divergente`;
- consumo parcial 20 + 10, over-balance 11, replay `ja_registrado`;
- cancelamento sem consumo devolve tudo; cancelamento após consumo devolve só o
  restante;
- soma divergente, componente duplicado, categoria divergente, preço ausente,
  total não múltiplo de 50, componente em produto normal;
- RLS de `pedido_item_componentes` testada por papel: dono, admin, atendente e
  producao leem; terceiro e financeiro não leem; motoboy atribuído ao pedido
  lê. ACL: `anon`/`service_role` sem `EXECUTE`/`SELECT`.

### Regra preservada

Combo legado/sem composição **continua fail-closed** com
`montagem_sem_modelagem`. Não foi inventada composição histórica.

### Condição de dados no cutover

- Configurar `categorias.combo_preco_unit` para **toda** categoria de combo
  ativa; sem preço, a criação atômica recusa (`montagem_preco_ausente`).
- Reordenar combo antigo pelo histórico exige remontar a composição; o legado
  sem componentes não passa pela via atômica.

---

## 2. Retirada parcial — RESOLVIDA

### Problema anterior

Não havia ação operacional que representasse a retirada física do freezer. O
“Iniciar preparo” havia sido corrigido para **não** consumir reserva, mas não
existia substituto.

### Solução implementada

- `src/routes/producao.tsx`: componente `RetiradaReserva`, exibido em
  “Retirada física do freezer”, lista reservas ativas por produto e registra
  quantidade explícita via `registrarConsumoAtomico` (0091) com atestação
  `ATTESTACAO_CONSUMO`.
- **O layout K7.2 não foi redesenhado.** A ação é separada do fluxo de status.
- `mudarStatus` (“Iniciar preparo”) **não** chama `registrarConsumoAtomico`;
  teste estático E9.1.8b garante que o bloco de status não consome.
- A ação fica atrás de `FLAGS_INTEGRACAO.consumo`
  (`VITE_FF_CONSUMO_RESERVA`), junto das demais flags atômicas.

### Evidência

- PG16 `combo-pg16.mjs`: consumo 20 (restante 10), over-balance 11, consumo 10
  (restante 0, reserva `consumida`), replay `ja_registrado`, excesso em reserva
  encerrada `reserva_encerrada`.
- Cancelamento após consumo devolve apenas o restante (unit 80, outro 100).
- `scripts/criar...`/`reserva-integracao` locais passando; E9.1.8b/E9.1.8c
  passando.

### Condição de cutover

Ligar `VITE_FF_CONSUMO_RESERVA=on` junto com as flags de reserva/cancelamento.
Se ficar OFF, a retirada parcial não aparece e a reserva permanece ativa até
cancelamento — decisão operacional, não falha lógica.

---

## 3. 19 reservas históricas — NÃO BLOQUEANTE / PÓS-CUTOVER

### Regra mantida

Nenhum `UPDATE`, crédito de estoque, remoção ou marcação retroativa de
proveniência. A especificação `ESPECIFICACAO-RECONCILIACAO-19-RESERVAS.md` e o
SQL read-only `reconciliacao-19-reservas-legado.sql` continuam sendo o único
caminho.

### Prova de isolamento (`quarantine-proof-pg16.mjs`, **17/17 PASS**)

Cenário sintético com **19 pedidos legados**: 19 reservas ativas, 95 unidades,
sem proveniência e sem ledger, estoque não debitado.

- **novo pedido combo criado com as 19 presentes**: `criado`, cobertura
  `coberto`, estoque debitado 70/80, 2 reservas/proveniências/ledger do novo;
- as 19 permanecem **ativas e intactas**;
- cancelar o novo devolve o estoque do novo (100/100) e **não toca** nas 19;
- tentar cancelar pedido legado falha fechado
  (`reconciliacao_pendente`) e **não credita** estoque;
- indicadores de quarentena: 19 ativas, 95 unidades, 0 consumo.

### Por que não bloqueia o cutover

- novos pedidos/reservas não são afetados pelas 19;
- a `0090`/`0093` não libera crédito sem proveniência/ledger;
- as funções de trigger `exigir_reserva_producao`/`exigir_consumo_producao` da
  `0095` **não estão instaladas**; a própria `0095` orienta não instalá-las
  antes da reconciliação.

### Ação pós-cutover

Executar a spec read-only no banco real, confirmar o universo, manter
`legado_sem_evidencia` em quarentena e só ajustar com aprovação dupla + ledger.
Não instalar os triggers de exigência antes disso.

---

## 4. Baseline canônica — RESOLVIDA

### Estratégia escolhida

**Snapshot canônico + migrations incrementais**, sem editar migrations
aplicadas. O replay linear de 0000–0086 é não reprodutível (prefixos duplicados
`0001`/`0002`, patches fora de ordem, seed da `0038` e falhas históricas
`0058`/`0061`/`0062`/`0063`).

Artefatos:

- `docs/auditoria/homologacao-staging/baseline/baseline-0086.full.sql` —
  snapshot de homologação pré-0087 (schema + seeds/config),
  SHA-256 `4edddff00c3f488e9b715efc0abe38cafe966b688b2eb06bf34736353c2bc10a`;
- `MANIFEST.json` — hashes das 12 migrations 0087–0098 e resultados;
- `scripts/baseline/apply-baseline.ps1` — recria o banco, restaura o snapshot e
  aplica 0087–0098 em ordem.

### Teste real de ambiente novo

1. banco vazio `homolog_baseline_test` (`TEMPLATE template0`);
2. restauração do snapshot;
3. aplicação de 0087, 0088, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096,
   0097, 0098 — todas exit 0;
4. resultados no banco novo:

| Suíte | Resultado |
|---|---|
| `suite-pg16.mjs` | **189/189 PASS** |
| `combo-pg16.mjs` | **79/79 PASS** |
| `quarantine-proof-pg16.mjs` | **17/17 PASS** |
| `concurrency-pg16.mjs` | **12/12 PASS** |

O snapshot de homologação contém fixtures e **não** é seed de produção. No
cutover, substituir por dump read-only do banco real congelado, mantendo o
manifesto. Não aplicar 0087–0098 duas vezes em produção.

---

## 5. ACL / grants / RLS — RESOLVIDA (RPC) + residual pós-cutover

### Fechamentos

- `0098_acl_menor_privilegio.sql` revoga `PUBLIC`/`anon`/`service_role` em
  excesso, inclusive:
  - `service_role` da `reservar_pedido_atomico` (0089);
  - `PUBLIC`/`anon` da `liberar_reserva_atomica`;
  - `service_role` da função `0091` e das tabelas da `0092`;
  - grants de `pedido_item_componentes`.
- `0089` foi ajustada para conceder `EXECUTE` apenas a `authenticated`.
- Nenhuma RPC nova recebeu `service_role`.
- `0096` é migration **ativa** (RLS/GRANT de parceiros); `0097` e `0098`
  também são ativas.

### Matriz

`MATRIZ-ACL-PRE-CUTOVER.md` cobre funções 0088–0098 e tabelas
`reservas_estoque`, `reserva_consumos`, `reserva_proveniencia`,
`reserva_proveniencia_config`, `pedido_item_componentes`,
`estoque_movimentacoes` e `fila_impressao`, para `anon`, `authenticated`
(admin/atendente/producao/financeiro/motoboy), `service_role`, `PUBLIC` e
funções internas.

### Residual conhecido

`authenticated` ainda tem DML direto em `reservas_estoque` e
`estoque_movimentacoes` porque os fallbacks legados continuam no código. Está
protegido por RLS staff, mas a matriz de menor privilégio só fecha 100% depois
de remover os fallbacks. Ordem correta: ligar flags → confirmar zero chamador →
remover fallback → migration de revogação → repetir matriz.

**Classificação:** NÃO BLOQUEANTE / PÓS-CUTOVER.

---

## 6. Impressão — HOMOLOGAÇÃO FÍSICA PENDENTE

Não há TANCA TP-550/XP-80C nesta máquina. Nenhuma impressão foi simulada como
hardware real.

- Texto/renderer corrigidos: preço preservado em nome longo, `prevista` enviada,
  fallback `Out-Printer` não lança após sucesso, payload ASCII 42 colunas.
- `ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md` define T1–T5: impressão normal,
  duplo clique, reimpressão legítima, pedido cancelado, caracteres/corte/largura
  e evidências obrigatórias.
- Testes locais E6 (21–25) passam.

**Classificação:** pendência de execução física, **não** falha lógica. Deve ser
executada antes de liberar a operação, mas não impede planejar o cutover.

---

## 7. Revalidação do cutover

Ordem e condições verificadas:

1. **Migrations ativas:** `0094` (trigger financeiro), `0096` (RLS parceiros),
   `0097` (modelagem combo) e `0098` (ACL) são ativas e entram no cutover.
2. **`0088`** substitui a RPC viva de reserva; o chamador legado existe enquanto
   o fallback existir. `0098` revoga `anon/PUBLIC/service_role`. Manter
   `authenticated` até remover o fallback.
3. **`controlado=true`** é obrigatório antes de ligar `0095`/`0093`. Nunca
   `controlado=false` com o fluxo novo.
4. **Novas reservas nunca nascem `controlado=false`.** `0089` grava
   proveniência quando controlado; sem isso a `0090` recusa liberar.
5. **Checkout, PDV e atendimento mudam juntos:** todos usam
   `decidirCriacaoAtomica`; com flag ON não há fallback.
6. **Cancelamentos migram juntos:** admin/cliente usam
   `decidirCancelamentoAtomico`; `0093` orquestra `0090`/`0094`.
7. **Consumo preparado:** `0091` + ação explícita de retirada; “Iniciar preparo”
   não consome.
8. **Dados do combo:** preencher `categorias.combo_preco_unit` de todas as
   categorias ativas.
9. **Baseline:** restaurar snapshot de produção congelado + 0087–0098, sem
   reaplicar.
10. **19 reservas:** manter quarentena; não instalar triggers de exigência antes
    da reconciliação.

---

## 8. Condições obrigatórias de execução (não bloqueiam o planejamento)

1. Substituir o snapshot de homologação pelo dump read-only do banco real
   congelado e registrar novo SHA-256 no manifesto.
2. Aplicar `0094`, `0096`, `0097` e `0098` conforme a ordem do cutover.
3. Ligar `controlado=true` e as flags atômicas (`reserva`, `cancelamento`,
   `consumo`) na ordem definida.
4. Configurar `combo_preco_unit` de todas as categorias de combo.
5. Executar a spec read-only das 19 reservas e manter quarentena.
6. Executar a homologação física de impressão (T1–T5).
7. Remover fallbacks legados após confirmar zero chamador e então revogar o DML
   direto residual.
8. Repetir `suite-pg16`, `combo-pg16`, `quarantine-proof-pg16`,
   `concurrency-pg16`, `verify-*`, `typecheck`, `build` no staging autorizado.

---

## 9. Testes e verificações desta etapa

| Verificação | Resultado |
|---|---|
| `suite-pg16.mjs` (`homolog_p0` e baseline) | **189/189 PASS** |
| `combo-pg16.mjs` (`homolog_p0` e baseline) | **79/79 PASS** |
| `quarantine-proof-pg16.mjs` (baseline) | **17/17 PASS** |
| `concurrency-pg16.mjs` (baseline) | **12/12 PASS** |
| `verify-*.sql` (15 arquivos) | **15/15 exit 0** |
| `scripts/*.test.mjs` (26 arquivos) | **26/26 exit 0** |
| `scripts/auditoria-rls.mjs` | **OK (79 tabelas com RLS+GRANT)** |
| ACL `acl-matrix.mjs` / `acl-tables.mjs` | RPC novas sem `anon`/`service_role`; `authenticated` conforme matriz |
| `npm run typecheck` | **pass** |
| `npm run build` | **pass** |
| `npm run lint` | não usado como gate (expirou em 600 s); sem falha de typecheck/build |

Ambiente: PostgreSQL 16.4 portátil. Docker/WSL indisponíveis; PG18.4 nativo
abortava com `0xC0000142`. O PG16.4 foi o único ambiente com múltiplas sessões
reais.

---

## 10. Artefatos

- `RELATORIO-FECHAMENTO-P0.md` — base do veredito anterior (B).
- `MATRIZ-ACL-PRE-CUTOVER.md` — matriz de menor privilégio.
- `ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md` — roteiro físico T1–T5.
- `baseline/baseline-0086.full.sql`, `baseline/MANIFEST.json`,
  `baseline/README.md` — snapshot canônico e manifesto.
- `pg16/suite-pg16.mjs`, `pg16/combo-pg16.mjs`,
  `pg16/quarantine-proof-pg16.mjs`, `pg16/concurrency-pg16.mjs`,
  `pg16/fixtures-pg16.mjs`, `pg16/README.md` — suítes reproduzíveis.
- `scripts/baseline/apply-baseline.ps1` — restauração + 0087–0098.
- `drizzle/migrations/0087…0098` — migrations incrementais.
- `src/lib/combo-componentes.ts`, `src/lib/cart.tsx`, `src/routes/combo.tsx`,
  `src/routes/checkout.tsx`, `src/routes/conta.tsx`,
  `src/routes/producao.tsx` — integração de combo e retirada parcial.

---

## 11. Declaração de escopo

Nenhum acesso ou ação em produção. Nenhuma migration aplicada no Supabase real.
Nenhum cutover executado. Nenhum pedido real alterado. Nenhum crédito de
estoque gerado. Nenhuma impressão física disparada. Nada foi commitado,
pushed ou deployado.
