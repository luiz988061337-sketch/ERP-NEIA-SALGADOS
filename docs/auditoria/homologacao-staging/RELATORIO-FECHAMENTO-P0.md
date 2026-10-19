# Relatório de fechamento dos bloqueios P0 — ERP Néia Salgados

> **Atualização:** este relatório é a base do veredito **B**. O fechamento das
> ressalvas e o veredito final estão em `RELATORIO-PRE-CUTOVER.md`
> (**A. APTO PARA PLANEJAR CUTOVER**).

**Data:** 2026-10-19  
**Ambiente:** PostgreSQL 16.4 nativo portátil, porta `55435`, banco descartável
`homolog_p0` (`C:\Users\User\AppData\Local\Temp\pg16\pgsql\bin`).  
**Escopo:** fechamento técnico local dos P0 de reserva/estoque, concorrência,
baseline, impressão e ACL.  
**Fora de escopo:** Supabase real/produção, cutover, deploy, commit/push e
impressão física.

**Ambiente — tentativas:** Docker não está instalado; WSL não tem distribuição;
PostgreSQL 18.4 nativo aborta backends com `0xC0000142`. O PG16.4 portátil foi
o único ambiente que permitiu múltiplas sessões reais e foi usado em todos os
testes abaixo.

## Veredito

# **B. APTO COM RESSALVAS**

O núcleo transacional (criação atômica, cancelamento, consumo, idempotência e
concorrência multi-sessão) passou em testes reais de PostgreSQL com duas
sessões. O erro de apartamento/endereço foi corrigido e o consumo automático
indevido no “Iniciar preparo” foi removido.

Não é **A** porque ainda existem ressalvas obrigatórias antes do cutover:

1. as 19 reservas históricas não foram conciliadas (apenas especificação
   read-only e quarentena);
2. montagem/combo continua sem modelagem de composição e é recusada pelo gate
   atômico;
3. a retirada parcial não tem UI/ação explícita; a reserva permanece ativa;
4. a impressão não foi homologada fisicamente (não há TANCA/XP-80C nesta
   máquina);
5. o baseline novo ainda depende de snapshot canônico ou de manifesto, por
   causa de `0001`/`0002`/`0038`/`0058`/`0061`/`0062`/`0063`;
6. há grants históricos amplos (`service_role` na 0089, `PUBLIC/anon` na
   `liberar_reserva_atomica`, `service_role` nas tabelas da 0092).

Não é **C** porque os riscos acima estão isolados/fail-closed e têm condição
de entrada, correção ou quarentena definida; nenhum deles exige reescrever o
núcleo transacional que passou.

---

## 1. P0.1 — Concorrência real multi-sessão

**Status: FECHADO.**

Suíte `C:\Users\User\pgtest\concurrency-pg16.mjs` com duas conexões reais e
`application_name=p0_a/p0_b`. Resultado: **12/12 PASS**.

| Cenário | Resultado |
|---|---|
| Duplicação da 0095 pelo mesmo `id` | 1 pedido, 1 reserva, replay `ja_criado` |
| Duas compras do mesmo estoque | serialização; sem venda acima do saldo |
| Cupom `max_usos` concorrente | um uso efetivado; o outro recusado |
| Dois cancelamentos | 1 liberação; o segundo `ja_liberado` |
| Consumo × cancelamento (ordens A/B) | sem crédito duplicado; ordem determinística |
| Duas consumições parciais | restante correto; sem consumo acima do total |
| Mesmo `idem_key` de consumo | 1 linha de consumo; replay `ja_registrado` |
| Dois pedidos multi-produto | locks em ordem determinística; sem deadlock |
| Pagamento × cancelamento (ordens A/B) | 0094 impede `cancelado+pago` e rebaixamento |
| Deadlock bruto de controle | PostgreSQL retornou **`40P01 deadlock detected`** |

Evidências:

- espera/lock observados em **11/12** cenários via `pg_stat_activity`,
  `pg_blocking_pids` e `pg_locks` (advisory, `transactionid`, tuple/relation);
- PIDs das sessões registrados (ex.: `17276`/`3224`; deadlock `6164`/`7856`);
- `C:\Users\User\pgtest\concurrency-results.json`;
- `C:\Users\User\pgtest\concurrency-pg16.log`.

O teste bruto de deadlock foi executado de propósito para provar que o detector
do PG16 está ativo; ele **não** representa falha do fluxo. Nos cenários de
negócio, a ordem de locks de 0095 (produtos ordenados) e 0091/0093 (pedido
primeiro) evitou deadlock.

---

## 2. P0.2 — Criação atômica, idempotência e retry

**Status: FECHADO no escopo transacional.**

- `criar_pedido_com_reserva` (0095) cria pedido + itens + reserva + histórico
  na mesma transação.
- `pg_advisory_xact_lock(hashtext('criar_pedido_com_reserva:'||id))` serializa
  o mesmo pedido; `ja_criado` é replay idempotente.
- Produtos são bloqueados em ordem determinística antes do pedido.
- Cupom é revalidado com `FOR UPDATE`.
- Falha de reserva reverte o bloco; não sobra pedido sem reserva.
- `controlado=true` é obrigatório para o fluxo novo; com `controlado=false`,
  a reserva nasce sem proveniência e a 0090 recusa liberar
  (`reconciliacao_pendente`). Isso é fail-closed e está documentado.

Suíte transacional PG16: **189/189 asserções PASS** (inclui T1b de apartamento,
T32 de resíduo, T38/T39 de canais, K1 de consumo parcial, C3 e PG1).
Evidência: `C:\Users\User\pgtest\suite-pg16.log`.

---

## 3. P0.3 — Apartamento/endereço incompleto retornando `erro_interno`

**Status: CORRIGIDO E TESTADO.**

Antes, o trigger `0045/0047` levantava `P0001` e a 0095 convertia em
`erro_interno`. Agora a 0095 valida, **antes do INSERT**:

- `tipo_imovel` só `casa|apartamento`;
- se `tipo_entrega='entrega'`, `endereco`, `bairro` e `cidade` mínimos;
- se `tipo_imovel='apartamento'`, `apartamento` obrigatório;
- limite de 50 caracteres para os campos estruturados.

Retorno esperado: `{"status":"dados_invalidos","campo":"apartamento"}` (ou
`endereco`/`bairro`/`cidade`/`tipo_imovel`), sem pedido, item, reserva,
proveniência ou movimento.

Teste T1b no PG16:

```json
{"campo":"apartamento","status":"dados_invalidos"}
{"pedidos":0,"itens":0,"reservas":0,"prov":0,"hist":0,"movs":0}
```

---

## 4. P0.4 — Baseline e migrations problemáticas

**Status: PARCIAL — classificado, reparo de parceiros pronto; snapshot
canônico ainda é decisão de cutover.**

Replay 0000–0095 no PG16.4: **91/98 arquivos OK**, **7 arquivos com falha**,
**33 instruções com falha**:

- `0001_migration.sql` (5): patch tardio que referencia `parceiros` (0028) e
  funções (0088) antes de existirem;
- `0002_secure_loyalty_and_partners.sql` (3): mesmo problema;
- `0038_cardapio_sabores.sql` (13): `categoria_id` hardcoded ausente em
  ambiente novo;
- `0058` (3), `0061` (2), `0062` (2), `0063` (5): erros históricos de sintaxe e
  funções; o estado final é reparado por `0073/0077`
  (`trg_pagamento_confirmado`, `trg_gerar_cupom_apos_itens`,
  `gerar_cupons_pedidos_pagos`).

Foi identificado que existem **dois `0001_*` e dois `0002_*`**. A ordenação
lexicográfica executa os patches tardios antes da tabela/funções. Isso precisa
ser resolvido no histórico do Supabase, não apenas no filesystem.

**Reparo criado:** `drizzle/migrations/0096_reparo_parceiros_rls.sql`.

A 0028 deixava `parceiros read`/`parceiros write` permissivas (`USING true`) e
`anon` sem INSERT para o formulário público. A 0096:

- remove as policies permissivas;
- cria `parceiros admin read`, `parceiros candidatura` e
  `parceiros admin write`;
- concede INSERT a `anon/authenticated` apenas como `status='nova'`;
- revoga SELECT direto de `anon` e mantém a view `parceiros_publicos`;
- não concede `service_role`.

Testado no PG16: candidatura anônima sem `RETURNING` OK; tentativa
`status='aprovada'` falha por RLS; leitura direta anônima falha (42501); view
pública OK. `verify-0096.sql`: **exit 0**.

Recomendação: para ambiente novo, usar **snapshot canônico** autorizado; se
replay for inevitável, excluir/reordenar `0001_migration`/`0002_secure`, semear
categorias da `0038` e aceitar/documentar as falhas de `0058`/`0061`/`0062`/
`0063` até `0073/0077`.

Detalhes: `BASELINE-E-REPAROS.md`.

---

## 5. P0.5 — Montagem/combo sem `produto_id`

**Status: PARCIAL / BLOQUEADO POR DECISÃO DE MODELAGEM.**

Auditoria:

- `src/lib/cart.tsx` guarda apenas `nome` textual, `produtoId: null` e
  `combo: true`;
- `pedido_itens` não tem composição estruturada (componente + quantidade);
- a 0095 recusa cobertura fictícia e classifica como
  `montagem_sem_modelagem`.

Não foi inventada composição. O gate atômico **não permite** que um combo seja
tratado como “coberto” por estoque inexistente. Consequência: com flag ON, item
de montagem não passa na criação atômica até existir modelagem/decisão
comercial. Isso é uma ressalva de negócio, não um bug de concorrência.

---

## 6. P0.6 — 19 reservas históricas

**Status: PARCIAL — especificação read-only pronta; nenhuma reconciliação
automática.**

Criado:

- `ESPECIFICACAO-RECONCILIACAO-19-RESERVAS.md`;
- `reconciliacao-19-reservas-legado.sql`.

A consulta abre `BEGIN TRANSACTION READ ONLY`, classifica cada reserva por
evidência (`proveniencia`, movimento `reserva` compatível, consumo, status do
pedido) e termina em `ROLLBACK`. Classes: comprovada por proveniência/consumo,
legado sem evidência, parcial sem proveniência, divergente, pedido cancelado
com reserva ativa, fora do escopo.

**Nenhum crédito de estoque, `UPDATE`, remoção ou marcação retroativa foi
executado.** A ação para `legado_sem_evidencia` é
`quarentena_sem_credito`, com revisão manual e autorização explícita.

A consulta foi executada no PG16 sem erro; o ambiente de fixtures não contém
as 19 reais (0 linhas), o que valida sintaxe/semântica, não a reconciliação.

---

## 7. P0.7 — Legado × novo fluxo

**Status: PARCIAL — flag ON é fail-closed; legado permanece no código.**

Matriz completa em `AUDITORIA-LEGADO-VS-ATOMICO.md`. Resumo:

| Canal | Flag ON |
|---|---|
| Checkout | `decidirCriacaoAtomica`; sucesso pula legado; erro aborta; sem fallback |
| PDV | idem; sem `DELETE` no ramo atômico |
| Atendente | idem; sem `DELETE` no ramo atômico |
| Admin cancela | `decidirCancelamentoAtomico`; sucesso retorna; erro aborta |
| Cliente cancela | idem |
| Produção | **não consome mais reserva no “Iniciar preparo”** |
| Central/motoboy | não escreve reserva |

Riscos residuais:

- com flag OFF, o legado ainda insere/atualiza reservas diretamente, usa
  fallback e `DELETE` compensatório;
- PDV/atendente legados **não reservam estoque**;
- não há UI de retirada parcial;
- `controlado=false` + 0095/0093 novos é inconsistente (não ligar).

Evidências: `checkout.tsx:465/609/616`, `pdv.tsx:296/383`,
`atendente.tsx:247/318`, `admin.tsx:685/710`, `pedido.$id.tsx:167/190`,
`producao.tsx:564-572`. `rg 'registrarConsumoAtomico' src` = 0 chamadas.

---

## 8. P0.8 — ACL/caller 0089–0095

**Status: PARCIAL — documentado; ajustes de menor privilégio pendentes.**

| Função | anon | authenticated | service_role | PUBLIC | Chamador |
|---|---|---|---|---|---|
| `reservar_estoque_atomica` (0088) | não | sim | **sim** | não | checkout legado |
| `liberar_reserva_atomica` (0088) | **sim** | sim | **sim** | **sim** | checkout/admin/pedido legado |
| `reservar_pedido_atomico` (0089) | não | sim | **sim** | não | 0095 + wrapper |
| `liberar_pedido_atomico` (0090) | não | **não** | **não** | não | somente 0093 |
| `registrar_consumo_reserva` (0091) | não | sim | não | não | wrapper; sem UI |
| `cancelar_pedido_atomico` (0093) | não | sim | não | não | admin/cliente |
| `criar_pedido_com_reserva` (0095) | não | sim | não | não | checkout/PDV/atendente |

- **0091/0093/0095 não têm `service_role`.** Nenhum grant a `service_role`
  foi adicionado nesta etapa.
- **0090 é interna** (sem EXECUTE para app).
- **0089 tem `service_role=true` histórico**, sem consumidor comprovado;
  recomenda-se revogar antes do cutover.
- **0088 tem `PUBLIC/anon` em `liberar_reserva_atomica`** e `service_role` em
  `reservar_estoque_atomica`; é legado e deve sair após a migração.
- `reserva_consumos`/`reserva_proveniencia`/`reserva_proveniencia_config` têm
  `service_role ALL` (bypass de RLS). Revisar/revogar se não houver consumidor
  comprovado.

Detalhes e evidências: `AUDITORIA-ACL-0089-0095.md`,
`C:\Users\User\pgtest\acl-matrix.mjs`, `acl-tables.mjs`.

---

## 9. P0.9 — Impressão (payload, fila, renderer, TANCA)

**Status: PARCIAL — texto corrigido; homologação física pendente.**

- `fila_impressao.payload` é **`text`**, não JSON; `trabalho_uuid` é UNIQUE;
  `impressora` default `Tanca TP-550`.
- Payload ASCII, máximo **42 colunas**.
- Corrigido `linhaItem()` para não truncar o preço quando o nome é longo.
- Corrigido `impressaoDireta()` para enviar `prevista` (a linha “Entrega
  prevista” não saía).
- `imprimir.ps1` usa GDI+ (`PrintDocument`), Consolas Bold, papel
  `80(72.1) x 3276 mm`, margens 6; parser PowerShell: **0 erros**.
- `agent.ts`: se o fallback `Out-Printer` aceitar o trabalho, não lança mais
  erro (evita marcar como erro e reimprimir).
- **Não há TANCA TP-550/XP-80C instalada nesta máquina** (`Get-Printer` lista
  apenas XPS/PDF/HP/Fax). Nenhuma impressão física foi feita.

Teste de payload: maior linha 42, 0 caracteres não ASCII, `Entrega prevista` e
`Total` presentes, preço preservado.

Riscos: falha de atualização pós-impressão pode reimprimir; `fichaDireta` usa
`Date.now()`; fallback `Out-Printer` perde o layout de 42 colunas; campos
`motoboy`/`pedidosCliente` não são enviados na via direta. Detalhes:
`AUDITORIA-IMPRESSAO.md`.

---

## 10. P0.10 — Retirada parcial e quando a reserva vira consumida

**Status: PARCIAL — consumo automático removido; ação explícita ainda não
existe na UI.**

- `producao.tsx` **não chama mais** `registrarConsumoAtomico` ao clicar
  “Iniciar preparo”. O clique não prova retirada total.
- A 0091 registra consumo por quantidade e mantém a reserva `ativa` enquanto
  `consumido_total < quantidade`; só vira `consumida` quando o total é
  retirado.
- A 0090 libera apenas o restante; não credita o que já foi consumido.
- A 0093 permite cancelar pedido com reserva `consumida` e não devolve saldo.
- Enquanto não houver UI de retirada parcial, a reserva fica ativa; isso é
  deliberado para não consumir errado. O layout K7.2 não foi alterado.

---

## 11. P0.11 — Reexecução de verificações

**Status: FECHADO no ambiente local.**

- Migrations 0087–0095 reaplicadas/verificadas no PG16; 0096 aplicada e
  verificada.
- `verify-*`: **15/15 arquivos com exit 0** (14 existentes + `verify-0096`).
- Suíte transacional: **189/189 PASS**.
- Concorrência: **12/12 PASS**.
- Testes locais `scripts/*.test.mjs`: **26/26 arquivos exit 0**.
- `scripts/auditoria-rls.mjs`: “TUDO OK (78 tabelas com RLS+GRANT)”.
- `npm run typecheck`: **pass**.
- `npm run build`: **pass** (`✓ built in 3.27s`).
- Pix: `pix-reader.test.mjs` pass; impressão: `e6-impressao.test.mjs` pass
  (E6.21–E6.25 cobrem 42 colunas, preço e `prevista`); ACL/RLS:
  `auditoria.test.mjs` 201/201 e `auditoria-rls` OK.
- `npm run lint` não foi usado como gate (a tentativa expirou em 10 min);
  não há falha de typecheck/build.

---

## 12. Condições obrigatórias antes de cutover

1. **Baseline:** escolher snapshot canônico autorizado ou manifesto de replay;
   resolver os prefixos duplicados `0001`/`0002` no histórico do Supabase;
   semear categorias da `0038` ou excluí-la com seed separado.
2. **Parceiros:** aplicar `0096` em staging e produção, com autorização, e
   rodar `verify-0096.sql`.
3. **Proveniência:** `reserva_proveniencia_config.controlado=true` antes de
   habilitar 0095/0093; nunca `controlado=false` com o fluxo novo.
4. **19 reservas:** executar a spec read-only; confirmar o universo; manter
   `legado_sem_evidencia` em quarentena; qualquer ajuste com aprovação dupla e
   ledger, nunca crédito automático.
5. **Combo:** modelar composição (componente + quantidade) ou bloquear combos
   nos canais atômicos. Não liberar cobertura fictícia.
6. **Retirada parcial:** definir UI/ação explícita ou aceitar formalmente que a
   reserva permanece ativa até conclusão/cancelamento; não reintroduzir
   consumo total no “Iniciar preparo”.
7. **Legado:** remover/desabilitar fallback, insert direto e `DELETE`
   compensatório; flags OFF não podem ser o estado permanente.
8. **ACL:** revogar `service_role` da 0089 e `PUBLIC/anon` da
   `liberar_reserva_atomica` se não houver consumidor comprovado; revisar
   `service_role ALL` nas tabelas da 0092; não conceder `service_role` às
   novas RPCs.
9. **Impressão:** instalar TANCA TP-550/XP-80C, validar papel `80(72.1) x 3276
   mm`, margem/fonte/42 colunas, reimpressão e falha de energia/rede.
10. **Smoke final:** repetir suíte, concorrência, verify, typecheck/build no
    staging autorizado com `controlado=true` e flags na ordem do cutover.

---

## 13. Artefatos

- `RELATORIO-HOMOLOGACAO-TECNICA.md` — relatório base A–U.
- `BASELINE-E-REPAROS.md` — replay e classificação das 7 migrations.
- `AUDITORIA-LEGADO-VS-ATOMICO.md` — matriz por canal.
- `AUDITORIA-ACL-0089-0095.md` — grants/callers.
- `AUDITORIA-IMPRESSAO.md` — payload/renderer/hardware.
- `ESPECIFICACAO-RECONCILIACAO-19-RESERVAS.md` + SQL read-only.
- `drizzle/migrations/0096_reparo_parceiros_rls.sql`.
- `verify-0096.sql`.
- `C:\Users\User\pgtest\concurrency-results.json`.
- `C:\Users\User\pgtest\suite-pg16.log`.
- `C:\Users\User\pgtest\apply-pg16-results.json`.
- `C:\Users\User\pgtest\verify-pg16\` (inclui `verify-0096.out.txt`).
- `C:\Users\User\pgtest\typecheck-final.log`.
- `C:\Users\User\pgtest\build-final.log`.
- `C:\Users\User\pgtest\print-payload-test.mts`.

## 14. Declaração de escopo

Nenhuma migration foi aplicada no Supabase real, nenhum cutover foi executado,
nenhum pedido real foi alterado, nenhum crédito de estoque foi feito, nenhuma
impressão física foi disparada e nada foi commitado/pushado/deployado nesta
etapa. O `0096` é uma migration preparada e testada apenas no PG16 descartável.
