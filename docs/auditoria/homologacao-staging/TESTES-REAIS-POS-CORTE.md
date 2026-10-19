# TESTES REAIS PÓS-CORTE — ERP NÉIA SALGADOS

> Documento de execução **após** a autorização e a execução do corte.
> Preencher **na ordem**. Um item sem `[x]` = corte **não** é considered concluído.
>
> Regra de dados: usar a **quantidade mínima possível de dados reais**.
> Preferir produtos de teste já cadastrados; para combos, usar a menor
> quantidade válida (**50**). Marcar o pedido de teste com
> `observacoes = 'TESTE CUTOVER <data>'` para rastreabilidade.

**Ambiente:** ______________________  **Responsável:** ______________________
**Início:** ____:____  **Fim:** ____:____

---

## 0. GUARDA DE PORTA

Antes do primeiro teste:

- [ ] `GET /api/versao` responde 200 com `minimo = 1792429500000` e `corte = true`
- [ ] `cache-control: no-store` na resposta de `/api/versao`
- [ ] Documento HTML com `cache-control: no-store`
- [ ] Um navegador **antigo** (bundle anterior) aberto **antes** do corte está **bloqueado** (tela "Atualização obrigatória")
- [ ] `controlado = true` confirmado:
      `select id, controlado from public.reserva_proveniencia_config where id = true;`
- [ ] Estoque inicial registrado (tabela abaixo)

| Produto | Estoque antes da janela | Estoque ao fim da janela | Δ esperado |
|---------|--------------------------|---------------------------|------------|
| ____________ | ______ | ______ | ______ |
| ____________ | ______ | ______ | ______ |
| ____________ | ______ | ______ | ______ |

---

## 1. CHECKLIST DE TESTES (20)

| # | Teste | Pedido utilizado | Estoque antes | Estoque depois | Resultado esperado | OK? |
|---|-------|------------------|---------------|----------------|--------------------|-----|
| 1 | **Checkout — retirada** | ____ | ____ | ____ | Pedido criado, `status=recebido`, `pagamento_status=pendente`, reserva ATIVA com a quantidade exata, estoque debitado 1× | [ ] |
| 2 | **Checkout — entrega** | ____ | ____ | ____ | Pedido criado com `tipo_entrega=entrega`, endereço validado, reserva ATIVA, estoque debitado 1× | [ ] |
| 3 | **PDV** | ____ | ____ | ____ | `canal=pdv` aceito por staff; cliente comum recebe `permissao_negada` | [ ] |
| 4 | **Atendimento** | ____ | ____ | ____ | Pedido criado via 0095 com reserva; canal `atendente` exige papel staff | [ ] |
| 5 | **Combo 50** | ____ | ____ | ____ | Composição 30+20 (soma = 50); **2** reservas (não 1); preço = `combo_preco_unit` × 50; estoque debitado por componente | [ ] |
| 6 | **Combo misto** | ____ | ____ | ____ | 3 sabores (ex.: 50+30+20 = 100); **3** reservas; nenhum componente duplicado; total correto | [ ] |
| 7 | **Pagamento Pix pendente** | ____ | ____ | ____ | `pagamento_status=pendente`; pedido **não** cancelável (0093 devolve `pagamento_nao_elegivel` após confirmação) | [ ] |
| 8 | **Pagamento presencial** | ____ | ____ | ____ | `forma_pagamento` na_loja; `pagamento_status` transiciona conforme regra; **cancelamento bloqueado** se `pago` | [ ] |
| 9 | **Reserva de estoque** | ____ | ____ | ____ | `reservas_estoque` com 1 linha por item/componente, `status=ativa`; `produtos.estoque` debitado exatamente 1× (sem débito duplo) | [ ] |
| 10 | **Produção** | ____ | ____ | ____ | `recebido → em_producao`; "Iniciar preparo" **NÃO** consome reserva; `reserva_consumos` **vazio** | [ ] |
| 11 | **Retirada parcial** | ____ | ____ | ____ | `registrar_consumo_reserva` grava 1 linha; `restante` = total − 20; reserva segue `ativa`; estoque **inalterado** (já foi debitado na reserva) | [ ] |
| 12 | **Segunda retirada parcial** | ____ | ____ | ____ | Nova linha em `reserva_consumos`; `restante` = total − 40; **sem** débitos adicionais; replay com a mesma chave devolve `ja_registrado` | [ ] |
| 13 | **Cancelamento sem consumo** | ____ | ____ | ____ | `status=cancelado`; reserva → `cancelada`/`liberada`; estoque **integralmente devolvido**; `liberacao.unidades` = reservado | [ ] |
| 14 | **Cancelamento com consumo** | ____ | ____ | ____ | Estoque devolve **somente** o não consumido (nunca o consumido); sem crédito duplicado; `reserva_consumos` preservado (rastro) | [ ] |
| 15 | **Pedido pago não cancelável** | ____ | ____ | ____ | `cancelar_pedido_atomico` → `pagamento_nao_elegivel`; pedido continua **ativo**; estoque **inalterado** | [ ] |
| 16 | **Central de entregas** | ____ | ____ | ____ | Pedido aparece na central; sem duplication; filtro de status correto | [ ] |
| 17 | **Motoboy** | ____ | ____ | ____ | Atribuição e rota visíveis para o motoboy **designado**; outsiders **não** veem o pedido | [ ] |
| 18 | **Localização** | ____ | ____ | ____ | Atualização de GPS do motoboy aceita e persistida; fora do papel, gravada negada | [ ] |
| 19 | **Fila de impressão** | ____ | ____ | ____ | 1 job `pendente` em `fila_impressao` com `trabalho_uuid = <pedido>:confirmado`; **sem** job duplicado no reenvio | [ ] |
| 20 | **Versão do frontend** | — | — | — | `GET /api/versao` → `atual = minimo = 1792429500000`; navegador antigo **bloqueado**; recarregar traz o bundle novo | [ ] |

---

## 2. REGISTRO DETALHADO (preencher por teste)

Copiar o bloco para cada teste executado.

```
TESTE #___ : ________________________________________________________
Data/hora  : ____ / ____ / ______  ____:____
Operador   : ____________________
Pedido     : nº ______  id ____________________________
Produtos   : ____________________  (quantidade: ______)

ESTOQUE
  produto A : antes ______  depois ______   Δ ______
  produto B : antes ______  depois ______   Δ ______

CONSULTAS DE VERIFICAÇÃO (read-only)
  select status, pagamento_status from public.pedidos where id = '<id>';
  select produto_id, quantidade, status from public.reservas_estoque where pedido_id = '<id>';
  select produto_id, quantidade from public.reserva_consumos rc
    join public.reservas_estoque r on r.id = rc.reserva_id where r.pedido_id = '<id>';

RESULTADO ESPERADO : _______________________________________________
RESULTADO OBTIDO   : _______________________________________________
DIVERGÊNCIA?       : [ ] não   [ ] sim -> PARAR (§10)
CONCLUSÃO           : [ ] PASSOU   [ ] FALHOU
```

---

## 3. USO MÍNIMO DE DADOS REAIS

| Situação | Ação |
|----------|------|
| Produto de teste disponível | usar o de estoque 0 (sem custo de estoque real) — mas com 1 unidade para validar o débito |
| Combo | usar **50** (mínimo válido) e componentes de baixo giro |
| Pagamento | Pix **pendente** (não confirmar) ou valor simbólico; **nunca** confirmar um Pix real durante o teste |
| Entrega | usar endereço de teste; se não houver, "retirada" |
| Motoboy | atribuir ao motoboy de teste; **não** deslocar motoboy real em rota |
| Impressão | **não** imprimir cupom real se a impressão automática não for homologada |

---

## 4. CRITÉRIO DE PARADA (§10)

**PARAR IMEDIATAMENTE**, manter a operação fechada e escalar, se ocorrer **qualquer** um destes:

| # | Situação | Como confirmar |
|---|----------|----------------|
| 1 | Migration falhou | erro do `psql` com `ON_ERROR_STOP=1` |
| 2 | Estoque diverge | `produtos.estoque` ≠ esperado em qualquer teste |
| 3 | Débito duplicado | 2 linhas de débito para o mesmo item/pedido |
| 4 | Crédito duplicado | estoque devolvido 2× |
| 5 | Pedido sem reserva | pedido criado com `reservas_estoque` vazia (itens reserváveis) |
| 6 | Cancelamento sem liberação correta | estoque não devolvido, ou devolvido a mais |
| 7 | Frontend antigo conseguiu operar | bundle anterior criou/cancelou pedido |
| 8 | Combo com quantidade incorreta | soma dos componentes ≠ quantidade do combo |
| 9 | RLS/ACL permitindo caminho legado | `reservar_estoque_atomica` / `liberar_reserva_atomica` executaram com sucesso |
| 10 | Pagamento inconsistente | `cancelado` + `pago`, ou `pago` sem `pagamento_em` |

> **Não corrigir nada diretamente em produção.** Registrar o erro (query, saída,
> horário, pedido) e manter a operação fechada.

---

## 5. IMPRESSÃO (TANCA TP-550 / XP-80C)

| Item | Valor |
|------|-------|
| Hardware disponível no momento dos testes? | [ ] sim [ ] não |
| T1 — impressão normal de pedido fictício | [ ] |
| T2 — duplo clique / dupla execução do agente | [ ] |
| T3 — reimpressão legítima | [ ] |
| T4 — pedido cancelado não imprime | [ ] |
| T5 — caracteres, corte e largura | [ ] |
| Contingência manual aceita pelo responsável | [ ] sim [ ] não — descrever: ____________________ |

> Se o hardware **não** estiver disponível: registrar
> **PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE**. Os demais testes **não** são bloqueados
> se existir contingência manual aceita. Se a impressão automática for
> **indispensável** ao primeiro dia e não houver contingência ⇒ **NO-GO OPERACIONAL**.

Roteiro completo: `ROTEIRO-HOMOLOGACAO-IMPRESSAO-FISICA.md`.

---

## 6. ENCERRAMENTO

| | |
|---|---|
| Testes executados | ____ / 20 |
| Testes aprovados | ____ / 20 |
| Divergências | ____________________________________________ |
| Estoque final confere com o inicial? | [ ] sim [ ] não |
| Houve crédito de estoque fora do esperado? | [ ] não [ ] sim |
| Necessário escalar para o financeiro? | [ ] não [ ] sim |
| Decisão | [ ] **Corte concluído com sucesso** [ ] **Corte revertido / operação mantida fechada** |
| Assinatura responsável técnico | ____________________ |
| Assinatura responsável operacional | ____________________ |
