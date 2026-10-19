# Auditoria legado × fluxo atômico (P0)

Data: 2026-10-19. Escopo: checkout, PDV, atendente, admin, pedido do cliente,
produção. Flags `VITE_*` têm default **OFF** (`src/lib/criacao-atomica.ts`,
`src/lib/reserva-integracao.ts`).

## Regra de aceitação

Com a flag de criação atômica **ON**, nenhum canal pode:

1. inserir/atualizar `reservas_estoque` diretamente;
2. cair no fallback legado se a RPC falhar;
3. criar pedido sem reserva;
4. compensar por `DELETE` de pedido.

## Matriz por canal

| Canal | Flag OFF (legado) | Flag ON (atômico) | Situação |
|---|---|---|---|
| Checkout | insert de pedido + itens; `reservar_estoque_atomica` por item; fallback de insert direto; `DELETE` do pedido se itens falharem (`checkout.tsx:465-640`) | `decidirCriacaoAtomica`; sucesso define `atomico=true` e **pula todo o bloco legado**; `modo=erro` aborta sem fallback | **OK com flag ON**; legado permanece no código e só é alcançável com flag OFF. |
| PDV | insert de pedido/itens; **não reserva estoque**; `DELETE` compensatório (`pdv.tsx:296-390`) | `decidirCriacaoAtomica`; sucesso pula legado; erro aborta; `DELETE` só no ramo legado | **OK com flag ON**; legado é não atômico e não reserva. |
| Atendente | insert de pedido/itens; **não reserva estoque**; `DELETE` compensatório (`atendente.tsx:247-325`) | `decidirCriacaoAtomica`; sucesso pula legado; erro aborta | **OK com flag ON**; legado é não atômico e não reserva. |
| Admin cancelamento | `liberar_reserva_atomica` + update direto de reservas + update de status (`admin.tsx:685-715`) | `decidirCancelamentoAtomico`; sucesso retorna; erro aborta | **OK com flag ON**. |
| Cliente cancela | update direto + `liberar_reserva_atomica` + update de reservas (`pedido.$id.tsx:167-192`) | `decidirCancelamentoAtomico`; sucesso retorna; erro aborta | **OK com flag ON**. |
| Produção (“Iniciar preparo”) | sem consumo de reserva | sem consumo de reserva; nenhuma chamada a `registrarConsumoAtomico` | **Corrigido nesta etapa**: o clique não consome mais todas as reservas ativas. |
| Central/motoboy | não escreve reservas | não escreve reservas | OK. |

## Evidências de código

- `checkout.tsx:465` chama `decidirCriacaoAtomica`; `:609` insert direto e
  `:616` `liberar_reserva_atomica` estão no ramo legado.
- `pdv.tsx:296` e `atendente.tsx:247` chamam `decidirCriacaoAtomica`; os
  `DELETE` de pedido em `pdv.tsx:383`/`atendente.tsx:318` são do ramo legado.
- `admin.tsx:685` e `pedido.$id.tsx:167` chamam `decidirCancelamentoAtomico`;
  os updates diretos de reserva (`admin.tsx:710`, `pedido.$id.tsx:190`) só
  ocorrem se a decisão for `legado`.
- `producao.tsx:564-572` foi reescrito: “Iniciar preparo” apenas muda status;
  não há mais `registrarConsumoAtomico`. A RPC 0091 fica sem chamador de UI
  até existir ação explícita de retirada parcial.
- `rg 'registrarConsumoAtomico' src` retorna **0 chamadas**.

## Riscos residuais (não fechados por esta auditoria)

1. **Legado ainda existe** e é acionável com flag OFF; os `DELETE`
   compensatórios continuam no código. O cutover precisa manter as flags OFF
   até o código legado ser removido/desabilitado.
2. **PDV/atendente legados não reservam estoque**: com flag OFF, a venda pode
   ultrapassar o disponível. Não usar esses canais como “prova” de operação
   segura.
3. **Retirada parcial sem UI**: a 0091 preserva consumo parcial, mas só pode
   ser chamada por RPC/script. O clique “Iniciar preparo” não consome mais;
   não há ação explícita no layout K7.2. Isso é deliberado para não consumir
   reserva errada, mas é uma lacuna operacional.
4. **Combo/montagem**: itens com `produto_id` nulo continuam
   `montagem_sem_modelagem`; a 0095 recusa cobertura fictícia. Não há
   composição estruturada em `cart.tsx`/`pedido_itens`.
5. **`controlado=false`**: a 0095 cria reserva sem proveniência; a 0090
   depois não libera (`reconciliacao_pendente`). Não ligar 0093/0095 novos
   sem `controlado=true` e sem excluir o legado.
6. **ACL 0089**: `reservar_pedido_atomico` tem `service_role=true` histórico;
   não é necessário para a 0095 (owner/definer) nem para o app. Revogar antes
   do cutover, se não houver consumidor comprovado.
7. **ACL 0088**: `liberar_reserva_atomica` tem `PUBLIC/anon=true`; a função
   nega `auth.uid()` nulo, mas o grant é mais amplo que o necessário.

## Condição para dizer “flag ON é segura”

- `reserva_proveniencia_config.controlado=true`;
- `0096` aplicada (parceiros) e `0095`/`0093`/`0091` com grants
  `authenticated` apenas;
- nenhum caminho legado executável (flags OFF não é suficiente como estado
  permanente; remover/desabilitar o fallback e os `DELETE`);
- UI/ação explícita de retirada parcial definida (ou aceitar que a reserva
  permanece ativa até o pedido ser concluído/cancelado);
- composição de combo modelada ou combos bloqueados no canal atômico.
