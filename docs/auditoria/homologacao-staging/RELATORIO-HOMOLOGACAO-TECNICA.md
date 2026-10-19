# RELATÓRIO DE HOMOLOGAÇÃO TÉCNICA — MIGRATIONS 0087–0095

**Data:** 19/10/2026
**Branch:** `main` (commits recentes `748ea59`, `d1b83dc`, `0f170ce`)
**Ambiente:** PGlite 0.5.10 / PostgreSQL 18.6 (WASM), banco local descartável em
`%TEMP%\opencode\pg-homolog\pglite-data`
**Natureza:** homologação técnica local, com fixtures fictícias. **Não é Supabase real, não é staging e não é produção.**

> ## VEREDITO
>
> **NÃO APTO PARA CUTOVER/PRODUÇÃO NESTE ESTADO.**
>
> **GO CONDICIONAL apenas para a próxima etapa:** repetir os testes transacionais em
> PostgreSQL multi-sessão (ou Supabase staging) e fechar os bloqueios listados na
> seção U. O fluxo 0087–0095 funciona ponta a ponta no PGlite, com 187/187 asserções
> transacionais aprovadas, mas **concorrência real entre duas sessões não foi provada**,
> a montagem ainda não tem modelagem de composição, o legado 0088/checkout/PDV/
> atendente permanece ativo com flags OFF e as 19 reservas históricas não foram
> reconciliadas.

---

## A. Identificação do ambiente

| Item | Valor |
|---|---|
| Engine | PGlite 0.5.10, PostgreSQL 18.6 (WASM) |
| Banco | `%TEMP%\opencode\pg-homolog\pglite-data` (persistente local) |
| Bootstrap | roles `anon`/`authenticated`/`service_role`; schemas `auth`/`storage`/`extensions`; `auth.users`; `auth.uid()`; `auth.jwt()`; `storage.buckets/objects`; publication `supabase_realtime` |
| Migrations | 0000–0095, 98 arquivos |
| Aplicação | instrução por instrução em autocommit, simulando o SQL Editor |
| Fixtures | 6 usuários, 10 papéis, 8 produtos de teste, 9 cupons, categoria `99999999-9999-4999-8999-999999999999` |
| Estado base | `reserva_proveniencia_config.controlado = false`; gates de produção **não instalados** |
| Acesso externo | **nenhum** acesso ao Supabase real/produção; nenhuma chamada de rede a banco real |

**PostgreSQL nativo:** a instalação local 18.4 foi tentada, mas os processos backend
morriam com `exception 0xC0000142`; o servidor principal e o `initdb` funcionavam, os
backends não. Por isso a homologação foi feita no PGlite. Essa limitação é registrada
como bloqueio de ambiente, não como aprovação de concorrência.

---

## B. Escopo e limites respeitados

- Nenhum SQL foi aplicado no Supabase real; nenhum dado real foi lido ou alterado.
- Nenhuma flag foi ligada (`VITE_FF_*` OFF; `controlado=false` no estado base).
- Nenhum commit, push, deploy, impressão, WhatsApp, cobrança ou reembolso foi executado.
- Nenhum layout aprovado K7.2/K8.1/K9 foi alterado; L1 não foi revivido.
- Nenhuma regra comercial, composição, coordenada, GPS ou lançamento foi inventado.
- As 19 reservas históricas reais **não foram reconciliadas**; foram criadas fixtures
  fictícias equivalentes para provar o comportamento e especificar a conciliação futura.
- Montagem **não** foi declarada cobertura integral: a 0095 rejeita
  `montagem_sem_modelagem` e o gate de produção bloqueia `montagem`.
- O veredito não usa a palavra “APTO” isoladamente para produção.

---

## C. Artefatos auditados

| Artefato | Papel |
|---|---|
| `drizzle/migrations/0087_reserva_consumos.sql` | tabela de consumo físico |
| `drizzle/migrations/0088_reservar_estoque_atomica.sql` | reserva legada por produto (0088) |
| `drizzle/migrations/0089_reservar_pedido_atomico.sql` | reserva atômica por pedido |
| `drizzle/migrations/0090_liberar_pedido_atomico.sql` | cobertura e liberação fail-closed |
| `drizzle/migrations/0091_registrar_consumo_reserva.sql` | retirada física idempotente |
| `drizzle/migrations/0092_reserva_proveniencia.sql` | marcador de proveniência e configuração |
| `drizzle/migrations/0093_cancelar_pedido_atomico.sql` | cancelamento atômico |
| `drizzle/migrations/0094_protecao_pagamento_cancelado.sql` | proteção financeira ativa |
| `drizzle/migrations/0095_criar_pedido_com_reserva.sql` | RPC de criação atômica, cobertura e gates |
| `src/lib/criacao-atomica.ts` | wrapper 0095, parser, gate e attestation |
| `src/lib/reserva-integracao.ts` | wrappers 0089/0091/0093 e gate |
| `src/routes/checkout.tsx`, `pdv.tsx`, `atendente.tsx` | chamadores atrás de flag OFF |
| `src/routes/admin.tsx`, `pedido.$id.tsx`, `producao.tsx` | cancelamento/produção atrás de flag OFF |
| `docs/auditoria/homologacao-staging/verify-*.sql` | verificações estáticas read-only |
| `scripts/*.test.mjs` | 26 suítes locais |

Evidências executadas:

| Evidência | Caminho |
|---|---|
| Resultado transacional | `%TEMP%\opencode\pg-homolog\suite-results.json` |
| Log transacional | `%TEMP%\opencode\pg-homolog\suite-log.txt` |
| Aplicação das migrations | `%TEMP%\opencode\pg-homolog\apply-pglite-results.json` |
| Verificações estáticas | `%TEMP%\opencode\pg-homolog\verify-results.txt` |
| Fixtures | `%TEMP%\opencode\pg-homolog\fixtures.mjs` |
| Smoke | `%TEMP%\opencode\pg-homolog\smoke.mjs` |
| Transição | `%TEMP%\opencode\pg-homolog\transition.mjs` |

---

## D. Método de aplicação

1. Bootstrap compatível com Supabase (`auth`, `storage`, roles, `auth.uid()`, `auth.jwt()`,
   `supabase_realtime`).
2. Aplicação de **0000–0095 instrução por instrução em autocommit**. Isso foi necessário
   porque `0003` adiciona valores ao enum `app_role` e os usa no mesmo arquivo; um
   `BEGIN` único falharia com “unsafe use of new value of enum”.
3. Fixtures fictícias criadas após o schema, sem dados reais.
4. Testes transacionais com `BEGIN`/`ROLLBACK`: cada cenário cria seus próprios pedidos,
   reservas, ledger e marcadores; nenhum cenário deixa resíduo no banco.
5. Testes de gate instalam triggers **somente dentro de transação** e fazem rollback.
6. Verificações estáticas `verify-*.sql` executadas como SELECTs read-only.

---

## E. Resultado da aplicação 0000–0095

**91/98 arquivos aplicados com sucesso; 7 falharam.** As falhas são de migrations
históricas, não das 0087–0095. Elas **não foram mascaradas nem corrigidas** neste
relatório.

| Migration | Erro observado | Classificação |
|---|---|---|
| `0001_migration.sql` | `function public.liberar_reserva_atomica(uuid) does not exist`; `reservar_estoque_atomica(uuid,uuid,integer)` não existe; `relation public.parceiros does not exist` | referência a objetos criados depois |
| `0002_secure_loyalty_and_partners.sql` | mesmas funções ausentes; `public.parceiros` ausente | referência a objetos criados depois |
| `0038_cardapio_sabores.sql` | FK `produtos_categoria_id_fkey` violada: categoria `aaefb477-bb46-4f7e-8ac8-8de1e79daf18` ausente | dado hardcoded ausente no catálogo |
| `0058_gerar_cupom_apos_itens.sql` | `syntax error at or near "("`; `syntax error at end of input` | erro de sintaxe |
| `0061_gerar_cupons_pagos.sql` | `no language specified`; função `public.gerar_cupons_pedidos_pagos` não existe | erro de sintaxe/ordem |
| `0062_trigger_pagamento_confirmado.sql` | `syntax error at end of input`; trigger não existe | erro de sintaxe |
| `0063_corrigir_fluxo_impressao_pix.sql` | `syntax error at end of input`; `no language specified` | erro de sintaxe |

**Estado final relevante:** as funções e tabelas esperadas existem porque `0073`/`0077`
redefinem o fluxo de impressão e porque `0087`–`0095` foram aplicadas depois. Ainda assim,
**o baseline 0000–0095 não é replayável do zero sem reparo**. Isso precisa ser tratado
como dívida de migrations, não como “falha irrelevante”.

---

## F. Estrutura final, ACL e triggers

### Funções

| Função | SECURITY DEFINER | `search_path` | EXECUTE |
|---|---|---|---|
| `criar_pedido_com_reserva(uuid,text,jsonb,jsonb)` | sim | `public` | `authenticated` sim; `service_role`/`anon` não |
| `pedido_cobertura_reserva(uuid)` | sim | `public` | `authenticated` sim; `service_role`/`anon` não |
| `reservar_pedido_atomico(uuid)` | sim | `public` | `authenticated` e `service_role` sim; `anon` não |
| `liberar_pedido_atomico(uuid)` | sim | `public` | **revogado** para `anon`, `authenticated` e `service_role` |
| `registrar_consumo_reserva(uuid,integer,uuid,uuid,text)` | sim | `public` | `authenticated` sim; `service_role`/`anon` não |
| `cancelar_pedido_atomico(uuid,text)` | sim | `public` | `authenticated` sim; `service_role`/`anon` não |
| `exigir_reserva_producao()` | sim | `public` | trigger preparado, **não instalado** |
| `exigir_consumo_producao()` | sim | `public` | trigger preparado, **não instalado** |

### Tabelas e RLS

| Tabela | RLS | FORCE RLS | Owner |
|---|---|---|---|
| `reservas_estoque` | ligada | não | `postgres` |
| `reserva_consumos` | ligada | não | `postgres` |
| `reserva_proveniencia` | ligada | não | `postgres` |
| `reserva_proveniencia_config` | ligada | não | `postgres` |
| `estoque_movimentacoes` | ligada | não | `postgres` |

### Triggers instalados

- `trigger_proteger_consistencia_financeira` — 0094, `BEFORE UPDATE OF status, pagamento_status`, habilitado.
- `trigger_gerar_cupom_apos_itens` — cupom após itens.
- `trigger_pagamento_confirmado` — cupom após confirmação de pagamento.
- `trigger_validar_transicao`, `trigger_congelar_colunas`, `pedidos_guard_update_trg`,
  `trigger_validar_endereco`, `trigger_exigir_conferencia`, `trigger_consumir_insumos_producao`,
  `trigger_criar_fritura_fila`, `trigger_entrega_motoboy`, `trigger_saida_motoboy`.
- **Não instalados:** `trigger_exigir_reserva_producao`, `trigger_exigir_consumo_producao`.

### Configuração

`reserva_proveniencia_config.controlado = false` no estado base; `ativado_em` e
`ativado_por` nulos. Nenhum teste de `controlado=true` persistiu: todos rodaram em
transação com rollback.

---

## G. 0095 — criação atômica (71 asserções)

Todos os cenários passaram. A RPC cria, na mesma transação: pedido, itens, reserva
(0089), débito no ledger, histórico e, quando `controlado=true`, marcador de proveniência.

| Cenário | Resultado |
|---|---|
| Retirada válida com 2 unidades | `criado`; subtotal 20; taxa 0; total 20; estoque 100→98; reserva ativa 2; ledger `-2` 100→98; histórico `criacao_atomica:checkout`; cobertura `coberto` |
| Entrega | taxa default 6; total 26; endereço/CEP persistidos |
| Preço promocional | usa `COALESCE(preco_promocional, preco)`; 7,50 |
| Combo 50/100 | aceito; reserva 50/100 |
| Combo 49/51 | `regra_combo` |
| Montagem (`produto_id` nulo) | `montagem_sem_modelagem`; zero pedido/item/reserva/ledger/histórico |
| Produto inexistente | `produto_inexistente`; zero resíduos |
| Produto indisponível | `produto_indisponivel` |
| Quantidade 0 | `quantidade_invalida` |
| Quantidade -1, 1.5, texto | `itens_invalidos` |
| Estoque insuficiente | `estoque_insuficiente`; zero resíduos; estoque intacto |
| Cupom 10% | desconto 10; total 90 |
| Cupom valor fixo | desconto 5; total 95 |
| Cupom inexistente/inativo/mínimo/produto/cliente | `cupom_invalido` com motivo correspondente |
| Cupom esgotado | `cupom_esgotado` |
| Taxa configurável | com coluna `loja_config.taxa_entrega`, usa 9,90; sem coluna, default 6 |
| Desconto manual admin/atendente | aplicado; checkout ignora; limite ao subtotal; negativo ignorado |
| PDV dinheiro imediato | `pago` / `na_entrega` |
| PDV Pix imediato | `pendente` / `online` (Pix nunca nasce pago) |
| Checkout dinheiro imediato | `pendente` |
| PDV crédito imediato | `pago` / `online` |
| Idempotência mesma carga | `ja_criado`; sem duplicação; estoque debitado uma vez |
| Idempotência divergente (itens/dados) | `idempotencia_divergente`; sem alteração |
| Mesmo `p_id` por outro usuário | `pedido_de_outro_usuario` |
| Retry após falha de estoque | segunda chamada `criado`; sem resíduo da primeira |
| Dependência ausente (0089 renomeada) | `dependencia_ausente` |
| Canal inválido | `canal_invalido` |
| Sem sessão | `permissao_negada` |
| Cliente em `pdv`/`atendente` | `permissao_negada` |
| Admin em `pdv` / atendente em `atendente` | `criado` |
| `p_dados`/`p_itens` com tipo errado | `entrada_invalida` |
| `p_id` nulo | `entrada_invalida` motivo `p_id` |
| CEP/CPF/agendamento no passado/latitude inválida | `dados_invalidos` com campo |
| Campos forjados (`id`, `user_id`, `status`, `total`, `numero`, etc.) | ignorados; servidor recalcula |
| Produto UUID malformado | `itens_invalidos` motivo `produto_id` |
| Entrega sem endereço | `dados_invalidos` campo `endereco` |
| Apartamento sem número | `erro_interno` (`P0001` do trigger de endereço), sem resíduo |

**Achados da 0095:**

1. **Contrato de status:** a quantidade `0` retorna `quantidade_invalida`, que não estava
   na lista documentada. A lista foi corrigida e a mensagem de UI foi adicionada em
   `src/lib/criacao-atomica.ts`; o comportamento não foi alterado.
2. **Apartamento sem número** cai em `erro_interno` em vez de `dados_invalidos` com campo
   específico. Não há escrita parcial, mas a classificação é pobre para a UI. Fica como
   ajuste de baixa severidade antes do cutover.
3. **Montagem:** rejeitada corretamente, mas isso significa que o fluxo de combo montado
   **não tem caminho de criação atômica** enquanto a composição não for modelada.
4. **Taxa:** o default de R$ 6 é server-side; a coluna `loja_config.taxa_entrega` não
   existe no estado base. A decisão “R$ 6 fixo ou configurável” continua pendente.
5. **Desconto manual:** aplicado somente em `pdv`/`atendente` para staff; checkout ignora.
   A decisão de quais papéis podem conceder desconto continua pendente.

---

## H. 0089 — reserva atômica

- A 0095 chama `reservar_pedido_atomico(p_id)` dentro da mesma transação.
- Cenário `controlado=false`: reserva ativa + ledger, **sem** marcador de proveniência.
- Cenário `controlado=true`: 1 marcador por reserva; com dois produtos, 2 marcadores,
  cada um apontando para o débito correto (`estoque_movimentacao_id`).
- Retry da 0089: `ja_reservado`; não debita de novo; contagens e estoque permanecem.
- Reserva ativa sem débito no ledger: `reconciliacao_pendente`, fail-closed.
- 0089 exige `auth.uid()` e autoriza dono do pedido ou staff (`admin`/`producao`/`atendente`).

**Conclusão:** a reserva por pedido funciona e é idempotente. A 0088 legada continua
existindo e é usada pelo checkout com flag OFF (seção S).

---

## I. 0092 — proveniência e `controlado`

- `controlado=false`: nenhum marcador é exigido/gerado; a 0095 cria reserva e ledger,
  e `pedido_cobertura_reserva` retorna `coberto` para o pedido novo.
- `controlado=true`: a 0089 grava exatamente um marcador por reserva, com
  `origem='0089'`, produto, quantidade e `estoque_movimentacao_id` do débito.
- Reserva ativa sem marcador com `controlado=true`: `pedido_cobertura_reserva` retorna
  `reconciliacao_pendente` motivo `proveniencia_ausente`; a 0090 falha fechada.
- Estrutura: FKs compostas para `reservas_estoque`, FK para `estoque_movimentacoes`,
  unique de movimento, checks de origem (`0088`/`0089`) e quantidade > 0.
- ACL: `authenticated` só tem `SELECT` em `reserva_proveniencia`,
  `reserva_consumos` e `reserva_proveniencia_config`; `config` é visível apenas para
  admin. Escrita só por `postgres`/`service_role` e funções definer.
- `reserva_proveniencia_config.controlado=false` no estado base.

**Conclusão:** o mecanismo de prova está consistente. O ponto de atenção é operacional:
ligar `controlado=true` sem reconciliar as reservas históricas faz a 0090 bloquear
cancelamentos e a produção.

---

## J. 0090 — cobertura e liberação

`pedido_cobertura_reserva(uuid)` responde:

| Status | Quando |
|---|---|
| `coberto` | itens reserváveis com reservas ativas/consumidas e débito comprovado |
| `sem_reserva` | há item reservável e nenhuma reserva; informa `faltante` |
| `montagem` | só itens sem `produto_id`; contados como montagem |
| `reconciliacao_pendente` | débito ausente/divergente, proveniência ausente, excesso de cobertura, reserva liberada/cancelada em pedido ativo |
| `cancelado` | pedido já cancelado |
| `pedido_de_outro_usuario` | leitura por terceiro sem staff |
| `pedido_invalido` | inexistente ou sem itens |

`liberar_pedido_atomico(uuid)`:

- Só libera pedido `cancelado`; `status_invalido` caso contrário.
- Exige débito exato no ledger (`referencia_id` da reserva, tipo `reserva`, quantidade
  negativa, saldo coerente).
- Exige marcador para reserva `ativa` quando `controlado=true`.
- Bloqueia reserva `cancelada` ou indeterminada.
- Bloqueia reserva `liberada` sem crédito comprovado.
- Bloqueia mistura `ativa` + `liberada`; aceita `ativa` + `consumida` coerente.
- Bloqueia quantidade inferior/superior ao item e produto estranho.
- Credita somente o restante; `ja_liberado` não credita de novo.
- `EXECUTE` revogado de `anon`, `authenticated` e `service_role`; só a 0093 (definer)
  ou `postgres` chama.

Cenários aprovados: liberação total, parcial (após consumo), retirada total sem crédito,
retry, reserva cancelada, liberada sem movimento, proveniência ausente, quantidades
divergentes, produto estranho, mistura ativa+consumida, mistura ativa+liberada,
pedido só de montagem e pedido sem reserva.

---

## K. 0091 — consumo/retirada física

- 11 asserções aprovadas.
- Retirada parcial 3 + 2 de 10: `consumido` com `restante` 7 e 5; reserva continua
  `ativa`; estoque **não** muda no consumo.
- Replay da mesma `idem_key`: `ja_registrado`.
- Mesma `idem_key` com quantidade diferente: `chave_conflito`.
- Produto informado diferente do produto da reserva: `produto_divergente`.
- Retirada total: `restante=0`; reserva vira `consumida`.
- Nova retirada após encerramento: `reserva_encerrada`.
- Cliente: `permissao_negada`.
- Pedido cancelado: `status_invalido`.
- Reserva ativa sem ledger: `reconciliacao_pendente`.
- `registrar_consumo_reserva` não faz `UPDATE produtos`; apenas grava `reserva_consumos`
  e atualiza o status da reserva quando fecha.
- ACL: `authenticated` sim; `anon` não; `service_role` não.

**Achado:** o gate `exigir_consumo_producao` aceita **retirada parcial** como suficiente
(2 de 5 unidades liberam a produção). Se a regra operacional exigir retirada total antes
da produção, o gate é insuficiente. Decisão pendente.

---

## L. 0093 — cancelamento atômico

30 asserções aprovadas:

| Cenário | Resultado |
|---|---|
| Ativo sem consumo | `cancelado`; libera 10; estoque 90→100; reserva `liberada`; ledger `+10`; histórico |
| Parcial 4 de 10 | `cancelado`; libera 6; estoque 96; ledger `+6` |
| Total 10 de 10 | `cancelado`; libera 0; estoque 90; sem ledger de liberação |
| Retry | `ja_cancelado`; sem novo crédito |
| 0090 após cancelamento | `ja_liberado`; sem novo crédito |
| Reserva cancelada/indeterminada | `reconciliacao_pendente` |
| Liberada sem crédito | `reconciliacao_pendente` |
| Ativa sem proveniência (`controlado=true`) | `reconciliacao_pendente` |
| Quantidade inferior/superior | `reconciliacao_pendente` |
| Produto estranho | `reconciliacao_pendente` |
| Ativa + consumida coerente | `liberado`; credita só a ativa |
| Ativa + liberada | `reconciliacao_pendente` |
| Só montagem | `cancelado` sem reserva |
| Sem reserva | `reconciliacao_pendente` motivo `sem_reserva`; pedido continua `recebido` |
| Só reservas liberadas | `reconciliacao_pendente` motivo `sem_reserva_ativa` |
| Terceiro | `permissao_negada` |
| Admin | `cancelado` |
| `em_producao` | `requer_analise` |
| `entregue` | `status_invalido` |
| Pago | `pagamento_nao_elegivel` |
| Sem itens | `pedido_invalido` |
| `controlado=false` com reserva ativa sem marcador | 0090 bloqueia; 0093 levanta `P0001` e a transação inteira faz rollback; pedido continua `recebido`, estoque 99 |

**Conclusão:** o cancelamento é fail-closed e não deixa pedido cancelado com estoque
preso quando a 0090 não consegue provar a liberação. A exceção `P0001` é convertida em
mensagem pelo wrapper.

---

## M. 0094 — proteção financeira

8 asserções aprovadas:

| Cenário | Resultado |
|---|---|
| `pendente → pago` | permitido |
| `pago → pendente` | bloqueado (`pagamento_confirmado_nao_rebaixavel`) |
| `pago → falhou` | bloqueado |
| `pago → reembolsado` | permitido |
| `cancelado + pago` no mesmo UPDATE | bloqueado (`inconsistencia_financeira`) |
| Cancelar pedido já pago | bloqueado |
| Reabrir `cancelado → recebido` | bloqueado (`reabertura_nao_permitida`) |
| `service_role` tentando `pago → pendente` | bloqueado; **não há bypass** |

O trigger é `BEFORE UPDATE OF status, pagamento_status`, `FOR EACH ROW`, habilitado,
para todos os papéis.

**Nota sobre `verify-0094.sql`:** o check estático `prosrc ILIKE '%update %'` retorna
`mexe_em_update=true` por causa do texto da mensagem “...por UPDATE direto...”; não há
DML no corpo da função. Os testes transacionais confirmam que o trigger só observa
`OLD`/`NEW` e levanta exceção. É falso positivo do verificador, não do código.

---

## N. Impressão e cupom

6 asserções aprovadas:

- Pedido pago gera exatamente 1 job `pedido:<id>:pedido`, status `pendente`.
- Payload é texto de cupom (`--- CUPOM FISCAL ---`) com itens, quantidades e total.
- `enfileirar_cupom` é idempotente: reenfileirar não duplica.
- Backfill `gerar_cupons_pedidos_pagos()` não duplica job existente.
- Pagamento confirmado depois da criação gera o job (trigger 0094/`trigger_pagamento_confirmado`).
- Pedido cancelado **não** gera novo job e **não** apaga job antigo.

**Nuance:** para testar “cancelado com job antigo”, foi inserido um job de fixture em
um pedido pendente e depois cancelado; no fluxo real, um pedido pago não pode ser
cancelado sem reembolso (0094), então esse cenário é de proteção de dados, não de
cancelamento de pedido pago.

**Achado:** `fila_impressao.payload` é `text`, não `jsonb`. Se K7.2/K8.1/K9 esperarem
payload estruturado, isso precisa ser alinhado antes do cutover; **nenhum layout foi
alterado**.

---

## O. Gates de produção

Os gates **não estão instalados** no estado base. Foram instalados apenas dentro de
transações de teste, com rollback.

| Cenário | Resultado |
|---|---|
| G1: sem trigger, `recebido → em_producao` | passa (prova que a transição base funciona) |
| G2: `controlado=true`, pedido sem reserva | bloqueia (`sem cobertura`) |
| G3: reserva ativa sem retirada | bloqueia (`reserva sem retirada física`) |
| G3: após consumo total | passa |
| G4: pedido só de montagem | bloqueia (`status=montagem`) |
| G5: `controlado=false` | gate inerte; transição passa |
| G6: legado com reserva ativa sem ledger | bloqueia (`debito_nao_comprovado`) |
| G7: retirada parcial 2 de 5 | **passa** (gate aceita consumo parcial) |

**Conclusão:** o gate de reserva é fail-closed e bloqueia montagem, coerente com a
exigência de não declarar cobertura integral sem composição. O gate de consumo é
fail-closed para “nenhum consumo”, mas **não exige consumo total**. A decisão sobre
retirada parcial precisa ser tomada antes de instalar.

---

## P. RLS e permissões

6 asserções aprovadas:

- Cliente e terceiro **não veem** `reservas_estoque` (0 linhas).
- Admin e produção veem a reserva (1 linha).
- Cliente tentando `INSERT` direto em `reservas_estoque`: `42501` (RLS).
- Cliente não lê `reserva_consumos` (0 linhas).
- `anon` não executa `criar_pedido_com_reserva`: `42501 permission denied for function`.
- `anon` não lê `pedidos`: `42501 permission denied for table`.

Políticas:

- `reservas_estoque`: `ALL` para staff (`admin`/`producao`/`atendente`/`financeiro`),
  `USING` e `WITH CHECK` iguais.
- `reserva_consumos`: `SELECT` para `admin`/`producao`/`financeiro`.
- `reserva_proveniencia`: `SELECT` para `admin`/`producao`/`financeiro`.
- `reserva_proveniencia_config`: `SELECT` apenas `admin`.
- `pedidos`: `DELETE` só para `postgres` e `service_role`; `authenticated` **não** tem
  `DELETE`. Isso é relevante para as compensações legadas por `.delete()` (seção S).

---

## Q. Idempotência, atomicidade e rollback

- **187/187 asserções transacionais**, zero falhas.
- Falhas da 0095 não deixam pedido/item/reserva/ledger/histórico: T5, T6, T9, T33.
- Falha da 0095 por dependência ausente retorna `dependencia_ausente` (não grava).
- Idempotência da 0095: `ja_criado`, `idempotencia_divergente`, `pedido_de_outro_usuario`.
- Retry após falha de estoque: segunda tentativa cria; primeira não deixou resíduo.
- Falha da 0090 dentro da 0093: `P0001`, rollback integral; pedido continua `recebido`.
- `0094` bloqueia antes de qualquer escrita financeira.
- O `pg_advisory_xact_lock(hashtext('criar_pedido_com_reserva:'||p_id))` está no corpo
  da 0095 e serializa por `p_id` no PostgreSQL. **No PGlite não foi possível provar
  espera/bloqueio entre duas sessões** (seção R).

---

## R. Concorrência: bloqueio e o que não foi provado

**Bloqueio registrado:** o PGlite é single-connection. Não é possível abrir duas
sessões PostgreSQL reais simultâneas e provar:

- espera do advisory lock da 0095 por `p_id`;
- corrida de duas criações do mesmo pedido;
- duas reservas concorrentes do mesmo produto;
- duas retiradas concorrentes da mesma reserva;
- cancelamento concorrente com consumo;
- deadlock entre 0093/0090 e 0091;
- comportamento de `FOR UPDATE` sob duas transações.

O PostgreSQL nativo 18.4 também não permitiu: os backends morriam com `0xC0000142`.
Portanto, **não se afirma ausência de deadlock nem de corrida**. A análise estática e os
testes de uma sessão provam a lógica, não a concorrência.

**Próximo passo obrigatório:** repetir os cenários em PostgreSQL multi-sessão (ou
Supabase staging), com duas conexões e `pg_locks`/`pg_stat_activity`, antes de qualquer
cutover.

---

## S. Legado/0088 e caminhos ainda ativos

### Flags e attestation

- `VITE_FF_CRIACAO_ATOMICA` controla a 0095 em `checkout`, `pdv`, `atendente`.
- `VITE_FF_RESERVA_ATOMICA`, `VITE_FF_CONSUMO_RESERVA`, `VITE_FF_CANCELAMENTO_ATOMICO`
  controlam 0089/0091/0093 em `admin`, `pedido.$id` e produção.
- `ATTESTACAO_CRIACAO` e `DEPENDENCIAS_PADRAO` estão **todos `false`**. Flag ON sem
  attestation deixa o gate em `preparado`; **não executa** e **não cai no legado**.
- Com flag OFF, o caminho legado permanece intacto.

### Checkout (flag OFF)

- `INSERT` direto em `pedidos` e `pedido_itens`.
- Reserva por item via **0088** `reservar_estoque_atomica`.
- Se a 0088 não existir/falhar: fallback de `INSERT` direto em `reservas_estoque`
  (sem garantia de concorrência).
- Compensação de falha de itens: `DELETE` em `pedidos` (sem grant para
  `authenticated`; falha silenciosa).
- Sem estoque: tenta `liberar_reserva_atomica`, atualiza status para `cancelado` e grava
  histórico, tudo best-effort.

### PDV (flag OFF)

- `INSERT` direto em `pedidos` e `pedido_itens`; **não chama 0088/0089**.
- Compensação por `DELETE` em `pedidos` (sem grant; falha silenciosa).
- Não há reserva de estoque no caminho legado do PDV.

### Atendente (flag OFF)

- `INSERT` direto em `pedidos` e `pedido_itens`; **não chama 0088/0089**.
- Compensação por `DELETE` em `pedidos` (sem grant; falha silenciosa).
- Não há reserva de estoque no caminho legado do atendente.
- Abre WhatsApp após criar o pedido (não executado nesta homologação).

### Admin e cliente (cancelamento legado)

- `admin.tsx`: `liberar_reserva_atomica` (0088), `UPDATE reservas_estoque ... cancelada`
  e `UPDATE pedidos status`.
- `pedido.$id.tsx`: `UPDATE pedidos status='cancelado'` antes de liberar reserva;
  `liberar_reserva_atomica` e `UPDATE reservas_estoque` em `try/catch`.
- Não são fail-closed: se a liberação falhar, o pedido pode ficar cancelado com estoque
  debitado.

### 0088

- `reservar_estoque_atomica` continua existindo e é chamada pelo checkout legado.
- A 0092 permite que a 0088 grave marcador quando `controlado=true`; ainda assim, a 0088
  é caminho legado e não substitui a 0095/0089.
- O gate `fallback_checkout_removido` cobre o checkout; **não cobre PDV/atendente**.
  O cutover precisa migrar os três canais e remover os fallbacks.

**Conclusão:** o legado não foi removido. As flags OFF preservam o comportamento atual,
mas também preservam os riscos de oversell/compensação por DELETE. Nada disso pode
conviver com a flag ON: a 0095 só deve ser ligada depois de remover/migrar esses caminhos.

---

## T. Migrations antigas, fixtures e conflitos

- 98 arquivos, 91 OK, 7 falhas históricas (seção E).
- `0003` exige autocommit por adicionar valores ao enum e usá-los no mesmo arquivo.
- `0038` depende de categoria hardcoded que não existe no catálogo base.
- `0058`/`0061`/`0062`/`0063` têm erros de sintaxe; `0073`/`0077` redefinem o fluxo final
  de impressão, e o estado final foi verificado.
- `0001`/`0002` referenciam funções/tabelas que só existem depois; não são replayáveis
  na ordem atual.
- Fixtures: 6 usuários (`admin`, `atendente`, `producao`, `cliente`, `outsider`, `motoboy`),
  8 produtos (`unit`, `combo_50`, estoque 0, indisponível, promo, estoque 1, estoque 5,
  outro), 9 cupons (incluindo `TESTEESGOTADO` com pedido sentinela), categoria fictícia.
- Nenhum dado real foi usado.
- As 19 reservas históricas reais continuam **não reconciliadas**.

**Recomendação:** não aplicar 0000–0095 em produção “do zero” sem um baseline reparado.
As 0087–0095 podem ser aplicadas sobre o schema real existente, mas a dívida das
migrations antigas precisa ser tratada separadamente.

---

## U. Veredito, condições e próximos passos

### Veredito

**NÃO APTO PARA CUTOVER/PRODUÇÃO.** O fluxo 0087–0095 está **funcionalmente provado no
PGlite**, com 187/187 asserções transacionais, mas os bloqueios abaixo impedem declarar
produção:

**Bloqueios P0 (impedem cutover):**

1. **Concorrência não provada:** repetir em PostgreSQL multi-sessão (ou staging) os
   cenários de advisory lock, reserva simultânea, consumo simultâneo, cancelamento
   simultâneo e deadlock.
2. **Montagem sem modelagem:** a 0095 rejeita `montagem_sem_modelagem` e o gate bloqueia
   `montagem`; combos montados não têm caminho atômico até a composição ser modelada.
3. **Legado ativo:** checkout/PDV/atendente ainda têm `INSERT` direto, fallback por
   `DELETE` e, no PDV/atendente, nenhuma reserva de estoque. O cutover exige migrar os
   três canais e remover os fallbacks.
4. **19 reservas históricas não reconciliadas:** ligar `controlado=true` ou instalar o
   gate de produção antes disso bloqueia pedidos legítimos e/ou mascara divergências.
5. **Migrations antigas não replayáveis:** 0001/0002/0038/0058/0061/0062/0063 falham;
   é preciso baseline/reparo antes de qualquer aplicação “from zero”.

**Decisões pendentes (P1):**

- Retirada parcial: o gate aceita 2 de 5; definir se isso é permitido.
- Taxa de entrega: R$ 6 fixo ou `loja_config.taxa_entrega` configurável.
- Desconto manual: quais papéis podem conceder, em quais canais.
- Modelagem da montagem/composição de combos.
- `service_role` sem EXECUTE em 0095/0092/0091/0093 (0089 tem): decidir se automações server-side precisam
  de grant ou se permanecem authenticated-only.
- Compensações legadas por `DELETE` sem grant: remover ou criar política/grant.
- `pedido_cobertura_reserva` para pedido de outro usuário: hoje `pedido_de_outro_usuario`;
  confirmar se staff de leitura deve ver todos.
- Apartamento sem número retornando `erro_interno`: melhorar classificação.
- Payload de impressão em texto vs. estruturado, se os layouts aprovados exigirem JSON.

### O que está aprovado para a próxima etapa

- A lógica transacional de 0087–0095 em uma sessão PostgreSQL 18.6.
- A criação atômica com idempotência, preço server-side, cupom revalidado, Pix nunca pago,
  rollback integral e cobertura.
- A reserva 0089, a proveniência 0092, a cobertura/liberação 0090, o consumo 0091, o
  cancelamento 0093 e a proteção financeira 0094.
- A impressão idempotente e o gate fail-closed (quando instalado).
- RLS: cliente não vê reservas; staff vê; anon não executa RPC.

### Ordem de cutover recomendada (não executada)

1. Reparar o baseline histórico ou definir migrations 0087–0095 como aplicação sobre o
   schema real existente.
2. Migrar checkout/PDV/atendente para a 0095 e remover fallbacks/`DELETE`.
3. Rodar os testes multi-sessão em PostgreSQL real/staging.
4. Reconciliar as 19 reservas históricas e decidir os pedidos `recebido` sem cobertura.
5. Ativar `controlado=true` somente após a reconciliação.
6. Instalar `trigger_exigir_reserva_producao` e `trigger_exigir_consumo_producao` em
   migration separada, com auditoria.
7. Ligar `VITE_FF_CRIACAO_ATOMICA` + attestation e as flags de reserva/consumo/
   cancelamento; rodar smoke tests.
8. Só então declarar produção.

---

## Anexo — evidências resumidas

```text
PGlite 0.5.10 / PostgreSQL 18.6 (WASM)
0000–0095: 91/98 OK; 7 falhas históricas documentadas
Transacionais: 187/187 (0 falhas)
  Estrutura/ACL: 31
  0095 criação: 71
  Cobertura/proveniência: 15
  0091 consumo: 11
  0093/0090 cancelamento: 30
  0094 pagamento: 8
  Impressão: 6
  Gates: 9
  RLS: 6
Verificações estáticas: 6 arquivos, 0 erros de execução
Suítes locais: 26 arquivos, todas exit 0
Typecheck: OK
Build: OK
Nada commitado, nada pushado, nada aplicado no Supabase real.
```

**Fim do relatório.**
