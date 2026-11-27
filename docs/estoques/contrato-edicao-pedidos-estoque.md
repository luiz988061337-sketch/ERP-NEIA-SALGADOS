# Contrato técnico — edição de pedidos e estoque

Data: 27/11/2026. Worktree isolada `estoque-operacional-vinculos`.

**Status: especificação de integração, não implementação.** O proprietário aprovou
a edição de pedidos na Central da Atendente e no H02. A interface pertence ao
Codex (`src/components/admin/pedidos-h02*.tsx`, `src/lib/pedidos-h02.ts`,
`src/components/central-pedidos.tsx`, `src/lib/central-pedidos.ts`) e **não foi
alterada nesta worktree**. Este documento define apenas as invariantes de estoque
que a edição precisa cumprir. Nenhuma RPC, migration, tela, rota, CSS ou
`types.ts` foi criado ou modificado por causa deste contrato.

## 1. Premissa e limites

A edição de um pedido é uma **operação de estoque**, não um UPDATE de campos.
O cliente nunca escreve `pedido_itens`, `reservas_estoque`, `lotes` ou valores
financeiros diretamente. `pedidos_guard_update` (`0085`, realinhado pela `0134`),
`trigger_congelar_colunas` (`0084`) e as proteções financeiras da `0094`/`0106`
permanecem intactas: **não há bypass, não há UPDATE de `agendado_para` feito
à parte e não há rebaixamento de pagamento confirmado**.

Não duplicar funcionalidade existente: este contrato **reusa** as RPCs canônicas
da `0129`, a reserva atômica da `0089`, a liberação da `0090`, o ledger de consumo
da `0091`, o cancelamento da `0093` e a curadoria FEFO da `0087`. Nenhuma dessas
funções é reescrita aqui.

## 2. Invariantes não negociáveis

1. **Sabor canônico.** Toda quantidade é por `sabores_estoque.chave` (26 sabores
   oficiais). Nunca criar, renomear, excluir ou reordenar sabor, foto ou sequência.
2. **Consumo é imutável.** `reserva_consumos` é append-only. O histórico gravado
   por `registrar_consumo_reserva` (`0091`) nunca é alterado ou apagado. A edição
   pode devolver **somente** `reserva.quantidade - Σ(reserva_consumos.quantidade)`.
3. **FEFO sempre.** Nova reserva usa `reservar_sabor_estoque`
   (`0129:802-889`): lote ativo, não vencido, `ORDER BY validade NULLS LAST,
   created_at, id`. Estorno devolve ao `lote_id` original registrado na reserva,
   nunca a um lote escolhido arbitrariamente.
4. **Sem dupla baixa e sem duplo crédito.** Uma operação lógica = uma chave de
   idempotência. Retry devolve `ja_registrado`/`sem_alteracao`; payload divergente
   para a mesma chave devolve `idempotencia_divergente` sem escrever nada.
5. **Saldo nunca negativo.** Margem de segurança (`100` por padrão), estoque
   mínimo, bloqueios por data e validade continuam sendo avaliados pelo banco.
   Front-end nunca calcula disponibilidade nem inventa saldo.
6. **Data futura é compromisso.** Edição que muda o agendamento para depois de
   hoje não cria reserva física: usa `registrar_compromisso_salgado` / caminho B7
   e revalida na confirmação. Nunca gerar lote fictício.
7. **Valores não vêm do cliente.** `subtotal`, `taxa_entrega`, `desconto`,
   `total`, `cupom` e `pagamento_status` são recalculados pelo caminho de
   precificação vigente. Pedido pago exige RPC de estorno autorizada
   (`estornar_pagamento_pedido`, `0106`), nunca repreço silencioso.
8. **Atomicidade.** Todos os passos ocorrem em **uma** transação. Se qualquer
   revalidação falhar, nada é gravado: nem item, nem reserva, nem liberação,
   nem compromisso, nem auditoria, nem cobrança.

## 3. Modelo de entrada — plano, não resultado

A RPC sugerida (nome a coordenar com o Codex, por exemplo
`editar_pedido_com_estoque`) recebe um **plano de diferenças**:

```text
p_pedido_id uuid
p_motivo text                    -- obrigatório, >= 3 chars, sem dado sensível
p_chave_idempotencia uuid        -- estável por tentativa de edição
p_operacoes jsonb[]              -- [{ chave, acao, quantidade, data, reserva_id? }]
```

`acao` ∈ `acrescimo | reducao | substituicao | reagendamento | cancelamento`.
O servidor **recalcula** o estado atual a partir das reservas ativas do pedido e
do ledger de consumo — não confia em `quantidade` enviada pelo cliente como
“valor atual”. A quantidade efetiva de uma reserva é
`reservas_estoque.quantidade - Σ(reserva_consumos.quantidade)`.

Resposta mínima:

```text
status, pedido_id, itens_antes, itens_depois,
reservas_criadas[], reservas_libadas[], compensacoes[],
compromissos_ajustados[], consumo_preservado,
revalidacao, idempotencia, mensagem
```

`consumo_preservado` informa quantas unidades já retiradas do freezer foram
mantidas fora de qualquer estorno. Isso é obrigatório para a atendente ver que
uma redução não “devolveu” unidade já consumida.

## 4. Regras por operação

### 4.1 Acréscimo de quantidade

1. Calcular `delta = alvo - quantidade_efetiva_atual` do sabor.
2. `avaliar_venda_salgado(chave, delta, hoje, pedido_id)` deve devolver
   `disponivel`. Qualquer outro status (`analise_necessaria`, `margem_atingida`,
   `indisponivel`, `bloqueado`, `divergencia`, `nao_inventariado`) **não é
   “esgotado”**: a edição é suspensa e encaminhada para análise, sem erro
   técnico ao usuário e sem liberar reserva existente.
3. Chamar `reservar_sabor_estoque` **uma vez** por sabor com chave determinística
   `md5('editar:' || pedido_id || ':' || chave || ':' || versao_plano)`.
4. Atualizar o item do pedido somente dentro da mesma transação, com valores
   recalculados.

### 4.2 Redução de quantidade

1. `restante = reserva.quantidade - Σ(reserva_consumos)`.
2. `devolver = least(delta, greatest(restante, 0))`.
3. `devolver > 0` → `liberar_reserva_sabor(reserva_id, motivo, chave)`; a função
   já grava `estoque_movimentacoes` com `quantidade = quantidade - consumido` e
   devolve ao `lote_id` original (`0129:931-949`).
4. `delta > devolver` → a diferença corresponde a unidade **já consumida**;
   **não pode ser creditada**. Exige justificativa explícita, `admin_logs` com
   `consumo_preservado`, e o item do pedido é ajustado apenas até o efetivamente
   liberável. Nunca `DELETE` em `reserva_consumos` e nunca ajuste manual de lote
   para “fechar” a conta.
5. Redução a zero equivale à liberação integral do não consumido; o histórico de
   consumo permanece.

### 4.3 Substituição de sabor

É um par atômico `reducao(sabor antigo) + acrescimo(sabor novo)` na mesma
transação, com duas chaves de idempotência derivadas da chave da edição. Se o
acréscimo falhar, a liberação do sabor antigo é revertida pelo rollback — nunca
fica “meia substituição”. Unidades já consumidas do sabor antigo continuam
registradas e não são transferidas para o novo sabor.

### 4.4 Alteração de agendamento

- **Para hoje:** revalidar com `avaliar_venda_salgado` e, se houver compromisso
  coberto, usar `converter_compromisso_reserva_b7` (B7, se autorizado) para
  transformar cobertura real em reserva FEFO. Nenhuma reserva nova se já existir
  uma ativa para o mesmo `pedido_id`/sabor/chave.
- **Para data futura:** não reservar. Registrar/ajustar compromisso com
  `registrar_compromisso_salgado` ou via fluxo B7; a reserva física existente só
  permanece se ainda cobrir a data corrente. Mudança de data com pedido já em
  preparação exige decisão explícita da atendente, não automação.
- **Bloqueio na nova data:** `analise_necessaria`; pedidos confirmados não são
  cancelados por bloqueio novo.

### 4.5 Cancelamento

`cancelar_pedido_atomico` (`0093`) continua sendo a autoridade. O caminho de
edição apenas o invoca; não faz UPDATE de status. Para agendamentos B7 aprovados,
chamar `cancelar_compromisso_b7`, que cancela compromissos pendentes/cobertos e
libera reservas convertidas via `liberar_reserva_sabor`. Em todos os casos,
unidades consumidas permanecem no ledger e não são devolvidas ao lote.

## 5. Ordem de travamento e concorrência

Ordem canônica (já usada por `0091`): **pedidos → produtos → reservas → lotes**,
com `FOR UPDATE` e advisory locks `hashtextextended('salgados:reserva:' || chave, 0)`
e pela chave de idempotência, na mesma ordem em todas as RPCs. Isso evita
deadlock com checkout, retirada parcial na cozinha e entrada de lote concorrentes.
Nenhuma revalidação pode acontecer **depois** da escrita: ela é sempre
anterior, dentro da transação, com os locks já tomados.

## 6. Auditoria

Uma linha em `admin_logs` por edição, com `acao = 'pedido_editado_estoque'` e
`detalhe` contendo:

- `pedido_id`, `ator`, `motivo` (texto truncado, sem dado sensível);
- snapshot de `itens_antes` e `itens_depois` por `chave`;
- `reservas_criadas`, `reservas_libadas`, `compromissos_ajustados`;
- `consumo_preservado` por sabor;
- `chave_idempotencia` e o plano recebido (sem PII).

O log é append-only. Não gravar CPF, telefone, endereço, token ou valor de
pagamento. Falha de auditoria aborta a edição.

## 7. Permissões

| Perfil | Edição de estoque |
| --- | --- |
| Atendente | Pode editar quantidade, sabor e agendamento; não re precifica pedido pago. |
| Administrador | Todas as operações, inclusive justificativas de consumo preservado. |
| Produção | Pode registrar consumo; não edita pedido do cliente. |
| Financeiro | Somente estorno autorizado de pedido pago; não toca reserva. |
| Cliente / anon / motoboy | Sem acesso à RPC de edição. |

A RPC de edição é `SECURITY DEFINER`, com `SET search_path` explícito, verificação
de `auth.uid()` e papel no corpo, `REVOKE` de `PUBLIC`/`anon`/`service_role` e
`GRANT EXECUTE` restrito. Helpers internos permanecem revogados de
`authenticated`. Views e helpers do `0129` continuam filtrando por papel funcional.

## 8. Sequência de integração (somente após autorização)

1. Confirmar no catálogo real de homologação as assinaturas de `avaliar_venda_salgado`,
   `reservar_sabor_estoque`, `liberar_reserva_sabor`, `registrar_consumo_reserva`,
   `cancelar_pedido_atomico` e da guarda realinhada pela `0134`.
2. Definir numeração de migration coordenada (a partir de `0137`), sem tocar em
   `0134`–`0136` já publicadas.
3. Implementar a RPC em migration própria, com reversão não destrutiva.
4. Regenerar `types.ts` (Codex) e só então ligar os componentes de edição.
5. Ensaiar em PostgreSQL descartável com `0134`–`0136` + `0129`/`0133` + B7,
   incluindo concorrência de retirada parcial e de entrada de lote.
6. Preflight read-only novamente, com destino declarado; publicar só com
   autorização expressa e aprovação manual no endereço oficial.

## 9. Cenários de aceite a ensaiar (pendentes — não executados nesta etapa)

| Cenário | Resultado exigido |
| --- | --- |
| Acréscimo com disponibilidade | Uma reserva FEFO nova; item recalculado; sem duplicidade. |
| Acréscimo sem disponibilidade | Nenhuma escrita; status de análise; reserva antiga intacta. |
| Redução abaixo do consumido | Devolve só o não consumido; `consumo_preservado` > 0; lote sem crédito indevido. |
| Substituição com segunda reserva indisponível | Rollback total; nenhuma liberação persistida. |
| Reagendamento para o futuro | Compromisso, nunca reserva física; sem lote fictício. |
| Reagendamento para hoje com cobertura real | Cobertura convertida em reserva FEFO uma única vez. |
| Cancelamento com consumo parcial | Reserva liberada pelo restante; histórico preservado. |
| Retry com a mesma chave | `ja_registrado`/`sem_alteracao`; nenhum item, reserva ou log duplicado. |
| Mesma chave, plano divergente | `idempotencia_divergente`; nenhuma escrita. |
| Pedido pago | Sem repreço; exige estorno autorizado. |
| Concorrência com retirada na cozinha | Ordem de locks respeitada; sem saldo negativo nem dupla baixa. |

Os ensaios já aprovados (`0129`/`0133` e B7) **não devem ser repetidos**; apenas
os cenários acima, ainda não executados, entram na próxima etapa.
