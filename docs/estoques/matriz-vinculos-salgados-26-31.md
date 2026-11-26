# Matriz de vínculos — 26 sabores oficiais × 31 produtos comerciais

Leitura somente leitura em homologação (`--project-ref lflzlcqinarrcgncafol`) em
26/11/2026. Nenhum vínculo foi gravado, nenhum saldo foi transferido e nenhuma
migration foi aplicada. Os UUIDs abaixo são apenas referências de conferência.

## Resumo

| Item | Resultado |
| --- | --- |
| Sabores oficiais em `sabores_estoque` | 26, ordem única, todos com `produto_id = null` |
| Produtos comerciais | 31, saldo legado `100` em todos, `unidade_medida = un` |
| Lotes / movimentações / reservas | 0 / 0 / 0 |
| Correspondência **confirmada** | 0 — não existe `produto_id` legado nem tabela `sabores_estoque_vinculos` |
| Correspondência **provável** por nome | 13 — candidato comercial, sem conferência oficial |
| Correspondência **inexistente** | 13 — sem produto unitário equivalente |
| Produtos sem vínculo unitário seguro | 18 — 4 bebidas, 3 kits, 4 genéricos/divergentes e 7 sabores comerciais fora do cadastro oficial |

`saldo_legado = 100` é o valor da coluna comercial `produtos.estoque`. Ele não
comprova unidades físicas, não é convertido em lote e não é usado como saldo do
sabor. O multiplicador de unidades só pode ser definido pelo proprietário: o
rótulo `15un`, `20un`, `25un`, `50un` ou `100un` descreve apresentação comercial
e **não** autoriza presumir `tipo = 'embalagem'` nem `fator_unidades`.

## 26 sabores oficiais

Tipo e fator abaixo são sempre **a decidir**. “Provável” significa apenas que
existe candidato por nome; não é vínculo conferido.

| # | Categoria | Sabor oficial | Produto comercial candidato | Tipo de vínculo | Fator de unidades | Saldo legado | Correspondência | Divergência que exige decisão |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- |
| 1 | Fritos | Coxinha de frango | `Mini Coxinha 25un` · `7c23eecb` | a decidir | a decidir | 100 | provável | Concorre com `Mini Coxinha Congelada 100un` (`213e5339`). Definir se o sabor unitário é o produto fresco, o congelado ou outro cadastro. |
| 2 | Fritos | Bolinha de queijo | `Mini Bolinha de Queijo 25un` · `42632768` | a decidir | a decidir | 100 | provável | Conferir se `25un` é embalagem (`fator 25`) ou apenas uma apresentação do produto unitário (`fator 1`). |
| 3 | Fritos | Risoles de presunto e queijo | `Mini Risole de Carne 25un` · `902db50c` | a decidir | a decidir | — | inexistente | O candidato é de carne, não de presunto e queijo. Decidir novo cadastro unitário ou exclusão do sabor oficial. |
| 4 | Fritos | Croquete | `Mini Croquete 25un` · `adb27294` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `25un`. |
| 5 | Fritos | Bolinho de calabresa | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 6 | Fritos | Bolinho de milho com queijo | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 7 | Fritos | Bolinho de azeitona | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 8 | Fritos | Trouxinha de milho com catupiry | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 9 | Fritos | Kibe | `Mini Kibe Frito 25un` · `be8b1c2d` | a decidir | a decidir | 100 | provável | Concorre com `Mini Quibe Assado 20un` (`f6f9b63a`). Definir preparo e grafia oficiais. |
| 10 | Mini Pastéis | Mini pastel de carne | `Mini Pastel de Carne 20un` · `546b475c` | a decidir | a decidir | 100 | provável | Concorre com `Mini Pastel Congelado 50un` (`31a252ef`). Definir fresco × congelado e fator. |
| 11 | Mini Pastéis | Mini pastel de queijo | `Mini Pastel de Queijo 20un` · `ba4fff4e` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `20un`. |
| 12 | Mini Pastéis | Mini pastel de pizza | `Mini Pastel de Pizza 20un` · `d41679a0` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `20un`. |
| 13 | Mini Pastéis | Mini pastel de palmito | `Mini Pastel Congelado 50un` · `31a252ef` | a decidir | a decidir | — | inexistente | Produto congelado é genérico; não comprova o recheio de palmito. |
| 14 | Assados | Esfirra de carne | `Mini Esfiha de Carne 20un` · `c2614fb0` | a decidir | a decidir | 100 | provável | Conferir padronização `Esfirra` × `Esfiha` e fator. |
| 15 | Assados | Esfirra de frango | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 16 | Assados | Esfirra de brócolis | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 17 | Assados | Enroladinho de presunto e queijo | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 18 | Assados | Hamburguinho | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 19 | Assados | Ricota com zaatar | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 20 | Empadas | Mini empada de palmito | `Mini Empadinha de Palmito 20un` · `b29bbb13` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `20un`. |
| 21 | Empadas | Mini empada de frango | `Mini Empadinha de Frango 20un` · `f96f2b19` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `20un`. |
| 22 | Mini Pizzas | Mini pizza de calabresa | `Mini Pizza de Calabresa 15un` · `f1d762a7` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `15un`. |
| 23 | Mini Pizzas | Mini pizza de queijo | `Mini Pizza de Mussarela 15un` · `7e551b4d` | a decidir | a decidir | 100 | provável | Equivalência `queijo × mussarela` precisa de confirmação. |
| 24 | Mini Pizzas | Mini pizza de presunto e queijo | `Mini Pizza Portuguesa 15un` · `f0d646ac` | a decidir | a decidir | — | inexistente | Cobertura diverge. Decidir novo cadastro ou exclusão do sabor. |
| 25 | Assados | Trouxinha de calabresa | — | a decidir | a decidir | — | inexistente | Nenhum produto comercial com este nome. |
| 26 | Assados | Enroladinho de salsicha | `Mini Enroladinho de Salsicha 20un` · `fcf21928` | a decidir | a decidir | 100 | provável | Conferir fator da apresentação `20un`. |

## 31 produtos comerciais

Todos têm `saldo_legado = 100` e `unidade_medida = un`. `Disponível` reproduz a
coluna comercial; não é saldo físico apurado.

| UUID | Produto | Categoria | Tipo de venda | Disponível | Sabor oficial associado | Situação |
| --- | --- | --- | --- | --- | --- | --- |
| `24586a68-790b-46d4-a19a-4a67e5142563` | Água Mineral 500ml | bebidas | unidade | não | — | Fora do escopo de salgados |
| `14ff9c64-e093-499b-8723-f4211ca3545c` | Coca-Cola 2L | bebidas | unidade | sim | — | Fora do escopo de salgados |
| `df191fb2-9137-4993-9d99-0f3718199a35` | Guaraná 2L | bebidas | unidade | não | — | Fora do escopo de salgados |
| `68beabb7-8787-4903-ad3f-abbebdef6979` | Suco Natural 500ml | bebidas | unidade | não | — | Fora do escopo de salgados |
| `8b4ea873-0cb9-4639-8cbf-c6333c2595bf` | Kit Aniversário 200 Mini | kits-para-festa | unidade | sim | — | Apresentação múltipla, não vínculo unitário |
| `f38713e6-1b1f-431d-a83e-ade7d02c7de1` | Kit Festa 100 Mini Salgados | kits-para-festa | unidade | sim | — | Apresentação múltipla, não vínculo unitário |
| `cdd635d9-0996-49a2-a994-896bd99be811` | Kit Reunião 50 Mini | kits-para-festa | unidade | sim | — | Apresentação múltipla, não vínculo unitário |
| `fcf21928-b16a-4e52-a06e-df6d89a9f33a` | Mini Enroladinho de Salsicha 20un | mini-assados | combo_50 | sim | enroladinho-salsicha | Provável; fator a decidir |
| `c2614fb0-edde-49d0-9c6b-f73c802ab944` | Mini Esfiha de Carne 20un | mini-assados | combo_50 | sim | esfirra-carne | Provável; grafia/fator a decidir |
| `f6f9b63a-12d6-4627-bbbb-4320beeb2b6f` | Mini Quibe Assado 20un | mini-assados | combo_50 | sim | — | Divergente de `kibe` (assado × frito) |
| `5f1d5c9e-9651-4283-9621-2af762d7b2a2` | Mini Trouxinha de Frango 20un | mini-assados | combo_50 | sim | — | Divergente de `trouxinha-calabresa` e `trouxinha-milho-catupiry` |
| `213e5339-213e-4499-9462-e7966abadf17` | Mini Coxinha Congelada 100un | mini-congelados | unidade | sim | — | Divergente de `coxinha-frango` (congelado) |
| `21fd7f5f-07ed-4f07-8502-5b9900b27593` | Mini Mix Congelado 100un | mini-congelados | unidade | sim | — | Genérico, sem sabor unitário único |
| `31a252ef-f76f-42df-8121-4bc4ca8fe537` | Mini Pastel Congelado 50un | mini-congelados | unidade | sim | — | Genérico/divergente de `pastel-carne` e `pastel-palmito` |
| `a3c505c1-bc0e-4e51-912f-f2f061cf01f9` | Mini Empadinha de Carne 20un | mini-empadinhas | combo_50 | sim | — | Sabor fora do cadastro oficial |
| `f96f2b19-4c9c-461b-b8f5-6ee7a82ed28d` | Mini Empadinha de Frango 20un | mini-empadinhas | combo_50 | sim | empada-frango | Provável; fator a decidir |
| `b29bbb13-dafe-47bd-86d2-532f59253a09` | Mini Empadinha de Palmito 20un | mini-empadinhas | combo_50 | sim | empada-palmito | Provável; fator a decidir |
| `a216e9ed-6620-4aa5-80b5-b513c5d19863` | Mini Empadinha de Queijo 20un | mini-empadinhas | combo_50 | sim | — | Sabor fora do cadastro oficial |
| `42632768-6e24-427b-adc3-22a8583d081e` | Mini Bolinha de Queijo 25un | mini-fritos | combo_50 | sim | bolinha-queijo | Provável; fator a decidir |
| `7c23eecb-5d7f-478f-9679-4bcffed1ec8c` | Mini Coxinha 25un | mini-fritos | combo_50 | sim | coxinha-frango | Provável; fator a decidir |
| `adb27294-2de4-4fbd-987f-4d6e190b2d7f` | Mini Croquete 25un | mini-fritos | combo_50 | sim | croquete | Provável; fator a decidir |
| `be8b1c2d-003a-4e5c-b8ea-fa5b4827beff` | Mini Kibe Frito 25un | mini-fritos | combo_50 | sim | kibe | Provável; fator a decidir |
| `902db50c-ccb8-4253-a4d9-61d66b013672` | Mini Risole de Carne 25un | mini-fritos | combo_50 | sim | — | Divergente de `risoles-presunto-queijo` |
| `546b475c-6d22-4dd2-822e-8808cd3fd008` | Mini Pastel de Carne 20un | mini-pasteis | combo_50 | sim | pastel-carne | Provável; fator a decidir |
| `3f1c7040-ee16-4287-b570-5e4227122d82` | Mini Pastel de Frango 20un | mini-pasteis | combo_50 | sim | — | Sabor fora do cadastro oficial |
| `d41679a0-ed64-4a59-8d32-b2e6f15e856c` | Mini Pastel de Pizza 20un | mini-pasteis | combo_50 | sim | pastel-pizza | Provável; fator a decidir |
| `ba4fff4e-acab-4bde-8fa9-69126d70b1d2` | Mini Pastel de Queijo 20un | mini-pasteis | combo_50 | sim | pastel-queijo | Provável; fator a decidir |
| `f1d762a7-3710-4c40-af4c-f85512cdd4d0` | Mini Pizza de Calabresa 15un | mini-pizzas | combo_50 | sim | pizza-calabresa | Provável; fator a decidir |
| `afcbd8fe-7434-4996-9d55-f6bf859b4be4` | Mini Pizza de Frango 15un | mini-pizzas | combo_50 | sim | — | Sabor fora do cadastro oficial |
| `7e551b4d-5cca-4d50-9927-dfeaf32894f5` | Mini Pizza de Mussarela 15un | mini-pizzas | combo_50 | sim | pizza-queijo | Provável; equivalência a decidir |
| `f0d646ac-73f5-4eb1-8d5e-cb3741b8e31b` | Mini Pizza Portuguesa 15un | mini-pizzas | combo_50 | sim | — | Divergente de `pizza-presunto-queijo` |

## Regras para a conferência manual

1. Nenhuma linha “provável” pode ser gravada como vínculo sem confirmação do
   proprietário.
2. Para cada vínculo confirmado, decidir `tipo` (`unitario` ou `embalagem`) e
   `fator_unidades`. Não converter o saldo legado `100`.
3. Sabores com correspondência inexistente continuam operando por `chave`, sem
   produto comercial, desde que a `0129` seja aplicada e o painel use a chave.
4. Produtos divergentes ou genéricos permanecem na “Conferência de cadastros”;
   não entram no estoque unitário automático.
