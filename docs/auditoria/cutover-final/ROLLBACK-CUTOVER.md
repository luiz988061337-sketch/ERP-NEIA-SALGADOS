# ROLLBACK DO CUTOVER — ERP NÉIA SALGADOS

> Regras absolutas (válidas em todos os cenários):
> 1. **Nunca** usar a migration 0088 antiga/defeituosa como rollback.
> 2. **Nunca** gerar crédito automático de estoque. Correção de saldo só por RPC
>    de negócio (`cancelar_pedido_atomico` / `liberar_pedido_atomico`).
> 3. Depois que pedidos novos existem no regime controlado, **rollback de
>    aplicação não pode fingir que essas operações não existiram**.
> 4. Na dúvida: **manter a loja fechada** e escalar.

---

## A. FALHA ANTES DE QUALQUER PEDIDO NOVO

**Cenário:** falha no backup, no precheck, nas migrations ou na configuração —
**antes** de o bundle de corte operar e antes de qualquer pedido novo.

| Pode reverter? | Como reverter |
|---|---|
| Sim — tudo | Nenhuma escrita de negócio aconteceu. Reverter é só desfazer a preparação. |

| Não deve reverter cegamente | Motivo |
|---|---|
| O backup | O backup é a garantia de retorno; **mantê-lo**. |
| As migrations aplicadas (0087, 0089–0098) | São estruturais e idempotentes. Deixá-las aplicadas é mais seguro do que tentar desinstalar objetos (e mais rápido para a próxima tentativa). Se for realmente necessário desfazer, restaurar o snapshot do backup — **não** DROP manual de cada objeto. |
| `controlado = true` (se já tiver sido ativado) | **Não** reverter sem necessidade: o regime novo precisa dele. Se a causa da falha for o próprio `controlado`, o caminho é corrigir a cobertura de reserva, não desligar o regime. |

| Quando usar backup | Quando a restauração for inevitável: schema corrompido, objeto criado com erro estrutural, dump de dados inconsistente. Restaurar **todo** o banco a partir do dump, e então reaplicar as migrations. |
| Quando manter fechado | **Sempre**, até a causa ser entendida e corrigida. |
| Como preservar movimentações de estoque | Não há movimentações novas a preservar (nenhum pedido novo). O estoque do snapshot é o estoque correto. |

**Procedimento:**
1. Manter a loja fechada.
2. Identificar a etapa exata da falha.
3. Se for antes do passo 5: nada a reverter no banco.
4. Se for durante/após as migrations: avaliar restauração pelo backup
   (`psql -f dump.sql` — formato plain; o `pg_restore` não existe nesta máquina).
5. Reexecutar o precheck e o ciclo a partir do ponto da falha.

---

## B. FALHA DEPOIS DAS MIGRATIONS, MAS ANTES DO DEPLOY

**Cenário:** migrations e configuração aplicadas com sucesso; o bundle de corte
**ainda não** foi publicado. O sistema segue no bundle antigo (legado).

| Pode reverter? | Como reverter |
|---|---|
| Sim | O bundle antigo continua publicado e funcionando: o corte é "abortado" e nada mais precisa ser feito. |
| O `controlado` | **Não** reverter se já estiver `true`: com o bundle antigo, a criação legada continuaria funcionando e sem o regime novo, criando pedidos **sem reserva** — pior que o estado com regime novo. Manter `controlado=true` **e** o bundle antigo é seguro (o legado não é bloqueado pelo `controlado`). Manter fechado até resolver. |

| Não deve reverter cegamente | Motivo |
|---|---|
| As migrations | Estruturais, já validadas, e o próximo corte precisa delas. |
| O lockdown de ACL (`08_LOCKDOWN-ACL.sql`) | Se ele já foi aplicado, **mantê-lo**: sem o fallback legado no bundle novo, ele é a barreira real. Reverter o lockdown reabriria a porta para bundles antigos. O bundle antigo **precisa** dessas permissões — portanto, se o bundle novo não for publicado, é preciso republicar o bundle novo (não o antigo) ou reverter o lockdown **de forma consciente**, com a loja fechada. |
| `combo_preco_unit` | Não faz mal: a coluna é lida apenas pelo regime novo. |

| Quando usar backup | Não é necessário. Nada de negócio foi escrito. Use o backup apenas se houver corrupção de schema. |
| Quando manter fechado | **Sempre** — o bundle antigo pode criar pedidos sem reserva. |
| Como preservar movimentações de estoque | Não há movimentações novas. |

**Procedimento:**
1. Manter fechado; **não** republicar o bundle antigo.
2. Diagnosticar a falha de build/publicação.
3. Corrigir e republicar o **bundle de corte** (não o antigo).
4. Se for impossível publicar o bundle novo: manter `controlado=true` + lockdown
   **e** manter a loja fechada até resolver (é a condição mais segura).

---

## C. FALHA DEPOIS DO DEPLOY

**Cenário:** bundle de corte publicado, mas ainda **sem** pedidos novos (ou com
apenas smoke incompleto).

| Pode reverter? | Como reverter |
|---|---|
| O bundle | Sim — republicar a versão anterior. **Mas** o guard de versão bloqueia o bundle anterior (se `VERSAO_MINIMA` foi definido). Isso é **desejado**: um bundle antigo não deve operar com `controlado=true`. |
| `controlado` | **Não** reverter. |

| Não deve reverter cegamente | Motivo |
|---|---|
| `VERSAO_MINIMA` | Baixá-lo reabriria a janela para bundles antigos **com** `controlado=true` — exatamente o que o protocolo de versão existe para impedir. Manter o piso alto. |
| O lockdown de ACL | Manter. |
| As migrations | Manter. |

| Quando usar backup | Só se o bundle novo tiver deixado o banco inconsistente (o que não deveria ocorrer: a 0095 é atômica). Na prática, **não** é preciso restaurar. |
| Quando manter fechado | **Sempre**, até republicar um bundle de corte funcional. |
| Como preservar movimentações de estoque | Nenhum pedido novo (ou só pedidos de smoke, que serão cancelados via 0093 — devolve só o não consumido). |

**Procedimento:**
1. Manter fechado.
2. Se o problema for no bundle: republicar o bundle de corte corrigido
   (mesma `VITE_BUILD_VERSION` só se o comportamento for idêntico; melhor
   subir a versão e atualizar `VERSAO_MINIMA`).
3. Se o problema for no banco: usar o `05_VERIFY-POS-CORTE.sql` para localizar;
   as migrations são a origem provável.
4. Reexecutar o smoke antes de reabrir.

---

## D. FALHA DEPOIS DE PEDIDOS NOVOS NO REGIME CONTROLADO

**Cenário:** já existem pedidos criados sob o regime controlado (0095), com
reservas, consumos e estoque movimentado. **Este é o cenário mais delicado.**

| Pode reverter? | Como reverter |
|---|---|
| A aplicação (bundle) | Sim, mas **não** para uma versão sem o regime novo. Republicar o bundle de corte é seguro; a versão antiga **não** deve operar (ela criaria pedidos sem reserva). |
| Os pedidos novos | **Não** desfazer. Eles existem, são legítimos e têm rastro (`reserva_proveniencia`, `reserva_consumos`, `estoque_movimentacoes`). |
| O estoque | **Não** "repor" manualmente. O estoque é a verdade; pedidos de teste que precisam sair são cancelados via `cancelar_pedido_atomico` (0093), que devolve **somente** o saldo não consumido. |

| Não deve reverter cegamente | Motivo |
|---|---|
| Restore do backup | **NÃO** restaurar: apagaria os pedidos novos, as reservas, os consumos e o ledger — e o estoque voltaria a um estado anterior, divergindo do que já foi vendido/servido. Isso é **crédito automático indireto** e está proibido. |
| `controlado = true` | **Não** reverter. |
| O lockdown de ACL | Manter. |
| Apagar pedidos/reservas "para limpar" | **Proibido.** Reconciliação só por decisão comercial explícita, com registro em `estoque_movimentacoes` e segunda aprovação. |
| Desinstalar as migrations | **Proibido.** O regime novo é o que保证了 a integridade dos pedidos já criados. |

| Quando usar backup | **Quase nunca.** Só para corrupção de schema comprovada (ex.: DDL interrompido no meio), e somente com a operação já parada, analyzing o que se perde: nesse caso, a perda inclui os pedidos novos, e isso precisa ser comunicado ao responsável e ao financeiro. |
| Quando manter fechado | **Sempre** até: (a) a causa ser identificada; (b) os pedidos de teste serem encerrados de forma limpa (cancelamento atômico); (c) o estoque bater com o esperado; (d) o responsável decidir. |
| Como preservar movimentações de estoque | Deixando o ledger falar. Sequence para encerrar a janela: (1) `06_SMOKE-DATABASE.sql` → inventário; (2) `07_QUARENTENA-19-RESERVAS.sql` → confirmar que as 19 legadas seguem isoladas; (3) cancelar via 0093 os pedidos de teste; (4) conferir `produtos.estoque` contra o inventário; (5) **só então** decidir GO/NO-GO. |

**Procedimento:**
1. Manter a loja fechada.
2. Inventário: `06_SMOKE-DATABASE.sql` + contagem de `reserva_proveniencia` /
   `reserva_consumos` por pedido.
3. Encerrar os pedidos de teste com `cancelar_pedido_atomico` (nunca com
   `UPDATE` direto, nunca com ajuste manual de estoque).
4. Conferir o estoque contra o esperado.
5. Se houver divergência: **parar**. Registrar o erro (query, horário, pedido) e
   escalar. **Não** corrigir com UPDATE em produção.
6. As 19 reservas legadas continuam em quarentena — sem crédito, sem ajuste.

---

## RESUMO RÁPIDO

| Cenário | Reverter aplicação? | Reverter banco? | Manter fechado | Usar backup |
|---|---|---|---|---|
| A. antes de pedidos novos | sim | não (só se corrompido) | sim | só se necessário |
| B. após migrations, antes do deploy | sim (republicar o bundle **de corte**) | não | sim | raro |
| C. após deploy, sem pedidos novos | sim (bundle de corte) | não | sim | raro |
| D. após pedidos novos | não desfazer pedidos | **NÃO** restaurar | sim | só se corrupção de schema, com ciência do responsável |

> Em **todos** os casos: `0088` nunca é rollback, `controlado` nunca é
> revertido cegamente, e **nenhum crédito automático de estoque** é gerado.
