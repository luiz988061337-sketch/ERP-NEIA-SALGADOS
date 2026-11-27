# ERP Néia Salgados — Estoque Operacional — Etapa de Deliberação Final

Data: 27/11/2026. Base: branch isolada `estoque-operacional-vinculos`, commit local `9cab907`.

Este documento prepara decisões. Ele **não confirma vínculos**, não altera saldos,
não aplica a migration `0129`, não modifica layouts, não faz push, merge, deploy,
escrita remota nem acesso à produção. Homologação foi consultada somente por
leitura, com destino explícito `--project-ref lflzlcqinarrcgncafol`,
`NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0`. O `.env` local aponta para
produção e não foi usado como destino.

As sugestões abaixo são apenas propostas para conferência do proprietário.

## Legenda das tabelas de saldo

| Código | Significado |
| --- | --- |
| **A** | Manter o cadastro comercial intacto; não converter saldo em lote; inventariar antes de movimentar. |
| **B** | Aguardar decisão de vínculo e multiplicador; só abrir estoque físico com entrada real conferida. |
| **C** | Manter fora do estoque de salgados; não vincular nem incorporar saldo. |
| **R1** | Duplicidade se o `100` comercial for copiado para lote e permanecer em `produtos.estoque`. |
| **R2** | Duplicidade se `15un`, `20un`, `25un`, `50un` ou `100un` forem tratados como fator automático sem conferência. |
| **R3** | Duplicidade se um item de combo somar o produto pai e seus componentes. |
| **D1** | Decidir se `100` é apenas referência comercial e autorizar inventário físico. |
| **D2** | Decidir vínculo, tipo e multiplicador da apresentação. |
| **D3** | Decidir se o cadastro permanece fora do escopo do estoque de salgados. |

---

## 1. Os 26 sabores oficiais, na sequência aprovada

Vínculo atual de **todas** as linhas: **nenhum** — `sabores_estoque.produto_id`
está nulo e `sabores_estoque_vinculos` não existe em homologação.

| # | Sabor oficial | Chave canônica | Produto comercial correspondente | Modalidades comerciais existentes | Vínculo atual | Vínculo sugerido | Multiplicador sugerido | Motivo da sugestão | Decisão necessária |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Coxinha de frango | `coxinha-frango` | `Mini Coxinha 25un` · `7c23eecb` | `Mini Coxinha 25un`; `Mini Coxinha Congelada 100un` | Nenhum | Candidato por nome: `Mini Coxinha 25un` — não confirmado | A decidir | Nome coincide; concorre com versão congelada. | Confirmar ou rejeitar o candidato; definir fresco × congelado e fator de `25un`. |
| 2 | Bolinha de queijo | `bolinha-queijo` | `Mini Bolinha de Queijo 25un` · `42632768` | `Mini Bolinha de Queijo 25un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide com o sabor oficial. | Confirmar se `25un` é embalagem com 25 unidades ou apenas apresentação unitária. |
| 3 | Risoles de presunto e queijo | `risoles-presunto-queijo` | — | `Mini Risole de Carne 25un` · `902db50c` | Nenhum | Nenhum | Não aplicável | O único candidato é de carne; recheio divergente. | Manter sem produto, criar cadastro unitário ou remover o sabor da lista. |
| 4 | Croquete | `croquete` | `Mini Croquete 25un` · `adb27294` | `Mini Croquete 25un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide com o sabor oficial. | Confirmar o vínculo e o fator da apresentação `25un`. |
| 5 | Bolinho de calabresa | `bolinho-calabresa` | — | Nenhuma | Nenhum | Nenhum | Não aplicável | Nenhum cadastro comercial com este nome. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 6 | Bolinho de milho com queijo | `bolinho-milho-queijo` | — | Nenhuma | Nenhum | Nenhum | Não aplicável | Nenhum cadastro comercial com este nome. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 7 | Bolinho de azeitona | `bolinho-azeitona` | — | Nenhuma | Nenhum | Nenhum | Não aplicável | Nenhum cadastro comercial com este nome. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 8 | Trouxinha de milho com catupiry | `trouxinha-milho-catupiry` | — | `Mini Trouxinha de Frango 20un` · `5f1d5c9e` é divergente | Nenhum | Nenhum | Não aplicável | Recheio de frango não comprova milho com catupiry. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 9 | Kibe | `kibe` | `Mini Kibe Frito 25un` · `be8b1c2d` | `Mini Kibe Frito 25un`; `Mini Quibe Assado 20un` · `f6f9b63a` | Nenhum | Candidato por nome: `Mini Kibe Frito 25un` — não confirmado | A decidir | Preparo frito corresponde; quibe assado diverge. | Confirmar grafia/preparo oficiais, fator e destino do quibe assado. |
| 10 | Mini pastel de carne | `pastel-carne` | `Mini Pastel de Carne 20un` · `546b475c` | `Mini Pastel de Carne 20un`; `Mini Pastel Congelado 50un` · `31a252ef` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide; pacote congelado é sortido e depende de composição. | Confirmar fresco × congelado, fator e composição do sortido. |
| 11 | Mini pastel de queijo | `pastel-queijo` | `Mini Pastel de Queijo 20un` · `ba4fff4e` | `Mini Pastel de Queijo 20un`; `Mini Pastel Congelado 50un` · `31a252ef` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide; pacote congelado é sortido. | Confirmar fresco × congelado, fator e composição do sortido. |
| 12 | Mini pastel de pizza | `pastel-pizza` | `Mini Pastel de Pizza 20un` · `d41679a0` | `Mini Pastel de Pizza 20un`; `Mini Pastel Congelado 50un` · `31a252ef` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide; pacote congelado é sortido. | Confirmar fresco × congelado, fator e composição do sortido. |
| 13 | Mini pastel de palmito | `pastel-palmito` | — | Somente `Mini Pastel Congelado 50un` · `31a252ef` | Nenhum | Nenhum | Não aplicável | Produto congelado é genérico; não comprova recheio de palmito. | Criar cadastro unitário, definir composição do sortido ou remover o sabor. |
| 14 | Esfirra de carne | `esfirra-carne` | `Mini Esfiha de Carne 20un` · `c2614fb0` | `Mini Esfiha de Carne 20un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide, mas há divergência de grafia `Esfirra` × `Esfiha`. | Confirmar grafia oficial, vínculo e fator. |
| 15 | Esfirra de frango | `esfirra-frango` | — | `Mini Pastel de Frango 20un` · `3f1c7040` é produto diferente | Nenhum | Nenhum | Não aplicável | Não existe `Mini Esfiha de Frango`; pastel não é esfirra. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 16 | Esfirra de brócolis | `esfirra-brocolis` | — | Nenhuma | Nenhum | Nenhum | Não aplicável | Nenhum cadastro comercial com este nome. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 17 | Enroladinho de presunto e queijo | `enroladinho-presunto-queijo` | — | `Mini Enroladinho de Salsicha 20un` · `fcf21928` é divergente | Nenhum | Nenhum | Não aplicável | Recheio de salsicha não comprova presunto e queijo. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 18 | Hamburguinho | `hamburguinho` | — | Nenhuma | Nenhum | Nenhum | Não aplicável | Nenhum cadastro comercial com este nome. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 19 | Ricota com zaatar | `ricota-zaatar` | — | Nenhuma | Nenhum | Nenhum | Não aplicável | Nenhum cadastro comercial com este nome. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 20 | Mini empada de palmito | `empada-palmito` | `Mini Empadinha de Palmito 20un` · `b29bbb13` | `Mini Empadinha de Palmito 20un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide com o sabor oficial. | Confirmar vínculo e fator da apresentação `20un`. |
| 21 | Mini empada de frango | `empada-frango` | `Mini Empadinha de Frango 20un` · `f96f2b19` | `Mini Empadinha de Frango 20un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide com o sabor oficial. | Confirmar vínculo e fator da apresentação `20un`. |
| 22 | Mini pizza de calabresa | `pizza-calabresa` | `Mini Pizza de Calabresa 15un` · `f1d762a7` | `Mini Pizza de Calabresa 15un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide com o sabor oficial. | Confirmar vínculo e fator da apresentação `15un`. |
| 23 | Mini pizza de queijo | `pizza-queijo` | `Mini Pizza de Mussarela 15un` · `7e551b4d` | `Mini Pizza de Mussarela 15un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide, mas `queijo` × `mussarela` exige confirmação. | Confirmar equivalência de nomes, vínculo e fator. |
| 24 | Mini pizza de presunto e queijo | `pizza-presunto-queijo` | — | `Mini Pizza Portuguesa 15un` · `f0d646ac` é divergente | Nenhum | Nenhum | Não aplicável | Cobertura da pizza portuguesa diverge do recheio oficial. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 25 | Trouxinha de calabresa | `trouxinha-calabresa` | — | `Mini Trouxinha de Frango 20un` · `5f1d5c9e` é divergente | Nenhum | Nenhum | Não aplicável | Recheio de frango não comprova calabresa. | Manter por chave, criar cadastro unitário ou remover o sabor. |
| 26 | Enroladinho de salsicha | `enroladinho-salsicha` | `Mini Enroladinho de Salsicha 20un` · `fcf21928` | `Mini Enroladinho de Salsicha 20un` | Nenhum | Candidato por nome — não confirmado | A decidir | Nome coincide; documentos históricos divergem quanto ao UUID. | Confirmar UUID atual, vínculo e fator da apresentação `20un`. |

Resumo: 13 candidatos prováveis por nome, 13 sabores sem equivalente unitário.
Nenhum foi confirmado.

---

## 2. Os 18 produtos sem vínculo unitário seguro

Não foi encontrado cadastro duplicado idêntico. Existem pares próximos por nome,
preparo ou embalagem, listados abaixo como modalidades ou produtos divergentes.

| # | UUID | Produto | Tipo no cadastro | Classificação | Modalidade comercial | Relação sugerida com o estoque | Decisão necessária |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `24586a68-790b-46d4-a19a-4a67e5142563` | Água Mineral 500ml | unidade | Bebida | Garrafa 500 ml | Manter fora do estoque de salgados; não vincular. | Confirmar permanência fora do escopo. |
| 2 | `14ff9c64-e093-499b-8723-f4211ca3545c` | Coca-Cola 2L | unidade | Bebida | Garrafa 2 L | Manter como bebida comercial; não vincular a sabor. | Confirmar permanência fora do escopo. |
| 3 | `df191fb2-9137-4993-9d99-0f3718199a35` | Guaraná 2L | unidade | Bebida | Garrafa 2 L | Manter como bebida comercial; não vincular a sabor. | Confirmar permanência fora do escopo. |
| 4 | `68beabb7-8787-4903-ad3f-abbebdef6979` | Suco Natural 500ml | unidade | Bebida | Garrafa 500 ml | Manter como bebida comercial; não vincular a sabor. | Confirmar permanência fora do escopo. |
| 5 | `8b4ea873-0cb9-4639-8cbf-c6333c2595bf` | Kit Aniversário 200 Mini | unidade | Kit/apresentação múltipla | 200 mini salgados | Não é unidade de sabor. Só poderia virar estoque com composição explícita por sabor. | Decidir se permanece como kit comercial ou recebe composição conferida. |
| 6 | `f38713e6-1b1f-431d-a83e-ade7d02c7de1` | Kit Festa 100 Mini Salgados | unidade | Kit/apresentação múltipla | 100 mini salgados | Não é unidade de sabor. Exige composição antes de qualquer débito. | Decidir se permanece como kit comercial ou recebe composição conferida. |
| 7 | `cdd635d9-0996-49a2-a994-896bd99be811` | Kit Reunião 50 Mini | unidade | Kit/apresentação múltipla | 50 mini salgados | Não é unidade de sabor. Exige composição antes de qualquer débito. | Decidir se permanece como kit comercial ou recebe composição conferida. |
| 8 | `f6f9b63a-12d6-4627-bbbb-4320beeb2b6f` | Mini Quibe Assado 20un | combo_50 | Produto individual divergente | Quibe assado, 20 unidades | Não vincular ao sabor `kibe`, que é frito. Manter cadastro separado ou criar sabor próprio. | Confirmar se é modalidade distinta ou cadastro fora do estoque por sabor. |
| 9 | `5f1d5c9e-9651-4283-9621-2af762d7b2a2` | Mini Trouxinha de Frango 20un | combo_50 | Produto divergente por recheio | Trouxinha de frango, 20 unidades | Não vincular a `trouxinha-calabresa` nem a `trouxinha-milho-catupiry`. | Confirmar cadastro separado ou novo sabor oficial. |
| 10 | `213e5339-213e-4499-9462-e7966abadf17` | Mini Coxinha Congelada 100un | unidade | Modalidade comercial congelada | 100 unidades congeladas | Só poderia ser embalagem de `coxinha-frango` se o proprietário confirmar o mesmo unitário e o fator. | Decidir fresco × congelado e multiplicador. |
| 11 | `21fd7f5f-07ed-4f07-8502-5b9900b27593` | Mini Mix Congelado 100un | unidade | Sortido genérico | 100 unidades sortidas | Sem sabor único. Não debitar por sabor sem composição explicitamente conferida. | Decidir a composição por sabor ou manter fora do estoque unitário. |
| 12 | `31a252ef-f76f-42df-8121-4bc4ca8fe537` | Mini Pastel Congelado 50un | unidade | Sortido genérico | 50 unidades sortidas | Afeta carne, queijo, pizza e palmito. Não vincular a um único sabor sem composição. | Decidir a composição do sortido ou manter fora do estoque unitário. |
| 13 | `a3c505c1-bc0e-4e51-912f-f2f061cf01f9` | Mini Empadinha de Carne 20un | combo_50 | Sabor comercial fora da lista oficial | 20 unidades | Manter cadastro separado; não criar vínculo com sabor não listado sem decisão. | Decidir incluir novo sabor ou manter fora da lista dos 26. |
| 14 | `a216e9ed-6620-4aa5-80b5-b513c5d19863` | Mini Empadinha de Queijo 20un | combo_50 | Sabor comercial fora da lista oficial | 20 unidades | Manter cadastro separado; não criar vínculo com sabor não listado sem decisão. | Decidir incluir novo sabor ou manter fora da lista dos 26. |
| 15 | `902db50c-ccb8-4253-a4d9-61d66b013672` | Mini Risole de Carne 25un | combo_50 | Produto divergente por recheio | 25 unidades | Não vincular a `risoles-presunto-queijo`. Manter separado. | Confirmar se vira sabor próprio ou permanece fora do estoque unitário. |
| 16 | `3f1c7040-ee16-4287-b570-5e4227122d82` | Mini Pastel de Frango 20un | combo_50 | Sabor comercial fora da lista oficial | 20 unidades | Não vincular a `esfirra-frango`; são produtos diferentes. | Decidir incluir novo sabor ou manter fora da lista dos 26. |
| 17 | `afcbd8fe-7434-4996-9d55-f6bf859b4be4` | Mini Pizza de Frango 15un | combo_50 | Sabor comercial fora da lista oficial | 15 unidades | Manter cadastro separado; não criar vínculo com sabor não listado sem decisão. | Decidir incluir novo sabor ou manter fora da lista dos 26. |
| 18 | `f0d646ac-73f5-4eb1-8d5e-cb3741b8e31b` | Mini Pizza Portuguesa 15un | combo_50 | Produto divergente por cobertura | 15 unidades | Não vincular a `pizza-presunto-queijo` sem confirmação do recheio. | Confirmar cobertura oficial ou manter cadastro separado. |

---

## 3. Conciliação dos 31 saldos legados

Leitura de homologação: os 31 produtos têm `produtos.estoque = 100`,
`unidade_medida = un`, **zero lotes**, **zero reservas** e **zero movimentações**.
O valor `100` é saldo comercial legado e **não comprova unidade física**. Nenhum
valor foi somado, transferido, excluído ou zerado.

| # | Produto ou sabor | Saldo comercial legado | Saldo físico apurado | Reservado | Disponível apurado | Lotes existentes | Destino sugerido | Risco de duplicidade | Decisão necessária |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | Água Mineral 500ml | 100 | 0 | 0 | 0 | Nenhum | C | Sem risco de salgados; não incluir por engano | D3 |
| 2 | Coca-Cola 2L | 100 | 0 | 0 | 0 | Nenhum | C | Sem risco de salgados; não incluir por engano | D3 |
| 3 | Guaraná 2L | 100 | 0 | 0 | 0 | Nenhum | C | Sem risco de salgados; não incluir por engano | D3 |
| 4 | Suco Natural 500ml | 100 | 0 | 0 | 0 | Nenhum | C | Sem risco de salgados; não incluir por engano | D3 |
| 5 | Kit Aniversário 200 Mini | 100 | 0 | 0 | 0 | Nenhum | C | R2, R3 se virar kit de estoque sem composição | D3 ou composição conferida |
| 6 | Kit Festa 100 Mini Salgados | 100 | 0 | 0 | 0 | Nenhum | C | R2, R3 se virar kit de estoque sem composição | D3 ou composição conferida |
| 7 | Kit Reunião 50 Mini | 100 | 0 | 0 | 0 | Nenhum | C | R2, R3 se virar kit de estoque sem composição | D3 ou composição conferida |
| 8 | Mini Enroladinho de Salsicha 20un · `fcf21928` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 9 | Mini Esfiha de Carne 20un · `c2614fb0` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 10 | Mini Quibe Assado 20un · `f6f9b63a` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 11 | Mini Trouxinha de Frango 20un · `5f1d5c9e` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 12 | Mini Coxinha Congelada 100un · `213e5339` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D2 |
| 13 | Mini Mix Congelado 100un · `21fd7f5f` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2, R3 | D1, composição |
| 14 | Mini Pastel Congelado 50un · `31a252ef` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2, R3 | D1, composição |
| 15 | Mini Empadinha de Carne 20un · `a3c505c1` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 16 | Mini Empadinha de Frango 20un · `f96f2b19` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 17 | Mini Empadinha de Palmito 20un · `b29bbb13` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 18 | Mini Empadinha de Queijo 20un · `a216e9ed` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 19 | Mini Bolinha de Queijo 25un · `42632768` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 20 | Mini Coxinha 25un · `7c23eecb` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 21 | Mini Croquete 25un · `adb27294` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 22 | Mini Kibe Frito 25un · `be8b1c2d` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 23 | Mini Risole de Carne 25un · `902db50c` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 24 | Mini Pastel de Carne 20un · `546b475c` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 25 | Mini Pastel de Frango 20un · `3f1c7040` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 26 | Mini Pastel de Pizza 20un · `d41679a0` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 27 | Mini Pastel de Queijo 20un · `ba4fff4e` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 28 | Mini Pizza de Calabresa 15un · `f1d762a7` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 29 | Mini Pizza de Frango 15un · `afcbd8fe` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |
| 30 | Mini Pizza de Mussarela 15un · `7e551b4d` | 100 | 0 | 0 | 0 | Nenhum | B | R1, R2 | D1, D2 |
| 31 | Mini Pizza Portuguesa 15un · `f0d646ac` | 100 | 0 | 0 | 0 | Nenhum | A | R1, R2 | D1, D3 |

Reservas, lotes e histórico existentes foram preservados. Como não havia lotes nem
reservas na leitura, o disponível físico apurado é zero em todas as linhas; o
`100` continua restrito à coluna comercial.

---

## 4. Divergência da ACL de `reservar_estoque_atomica`

### Permissões atuais em homologação

Leitura somente leitura executada em 27/11/2026 com destino explícito
`lflzlcqinarrcgncafol`:

| Função | `authenticated` | `postgres` | `service_role` | Observação |
| --- | --- | --- | --- | --- |
| `reservar_estoque_atomica(uuid,uuid,integer)` | **não** | sim | não | RPC usada pelo painel para “Reservar estoque” |
| `reservar_pedido_atomico(uuid)` | **não** | sim | não | Existe, mas não é a RPC usada pelo painel |
| `cancelar_pedido_atomico(uuid,text)` | sim | sim | não | RPC de cancelamento |
| `criar_pedido_com_reserva(uuid,text,jsonb,jsonb)` | sim | sim | não | RPC de criação atômica |
| `registrar_consumo_reserva(uuid,integer,uuid,uuid,text)` | sim | sim | não | Consumo de reserva |
| `reordenar_sabores_estoque(text[],text)` | sim | sim | sim | Ordem aprovada dos sabores |
| `pedido_cobertura_reserva(uuid)` | sim | — | — | Leitura de cobertura |
| `exigir_reserva_producao()`, `exigir_consumo_producao()` | não | — | — | Uso interno esperado por trigger/definer |

Não há grant para `PUBLIC` nem `anon` nas funções consultadas.

### Permissões existentes no histórico versionado

| Migration | Intenção registrada para `reservar_estoque_atomica` | Intenção registrada para `reservar_pedido_atomico` |
| --- | --- | --- |
| `0031_reserva_grants.sql` | `GRANT EXECUTE` para `authenticated` e `service_role` | — |
| `0088_reservar_estoque_atomica.sql` | `REVOKE` de `PUBLIC, anon`; `GRANT` para `authenticated, service_role` | — |
| `0089_reservar_pedido_atomico.sql` | — | `REVOKE` de `PUBLIC, anon`; `GRANT` para `authenticated` |
| `0098_acl_menor_privilegio.sql` | `REVOKE` de `PUBLIC, anon, service_role`; `GRANT` somente para `authenticated` | `REVOKE` de `PUBLIC, anon, service_role`; `GRANT` somente para `authenticated` |
| `PASSO-4-bootstrap-completo.sql` | `GRANT` para `authenticated` e `service_role` | Não localizado neste bootstrap |

O estado real de homologação não corresponde à matriz de menor privilégio da
`0098`: as duas funções de reserva ficaram executáveis apenas por `postgres`.

### Impactos de segurança e operação

- **Impacto funcional:** um operador autenticado que tenta reservar pelo painel
  recebe erro de permissão. Isso acontece independentemente da `0129`.
- **Impacto de auditoria:** o histórico versionado diz uma coisa e o banco faz
  outra. Sem reconciliação documentada, uma futura migration pode reaplicar um
  grant já esperado ou mascarar divergência anterior.
- **Impacto de privilégio:** o estado atual reduz o acesso, mas não é a matriz
  aprovada. Ampliar para `service_role` ou `PUBLIC` sem chamador provado
  aumentaria a superfície de ataque sem necessidade.
- As funções internas `exigir_*` sem `EXECUTE` direto são coerentes com o desenho
  de uso por `SECURITY DEFINER`/trigger e não devem ser expostas.

### Recomendação técnica fundamentada

Restaurar, em etapa separada e somente após autorização, exatamente a intenção da
`0098`: `EXECUTE` para `authenticated` nas duas funções de reserva, sem `PUBLIC`,
sem `anon` e sem `service_role`. Mantê-las apenas com `postgres` deixa a aplicação
quebrada; conceder `service_role` contraria a própria justificativa da `0098`.

### Plano de correção, se aprovado

1. Obter autorização expressa do proprietário e do responsável por Reservas.
2. Repetir as consultas somente leitura com `--project-ref lflzlcqinarrcgncafol`.
3. Preparar migration versionada separada, sem inclusão na `0129`, contendo
   `REVOKE ... FROM PUBLIC, anon, service_role` e
   `GRANT EXECUTE ... TO authenticated` para as duas funções.
4. Aplicar somente em homologação com destino explícito e `--confirmar`; registrar
   reconciliação de histórico se for usado SQL direto; nunca reaplicar para
   “consertar” histórico.
5. Validar com sessão `authenticated`: operador autorizado consegue reservar;
   `anon` e `service_role` não conseguem; reserva repetida não debita duas vezes.
6. Nenhuma alteração de permissão foi feita nesta etapa. Produção não é tocada.

---

## 5. Testes transacionais a preparar

Situação atual: existem testes estáticos/de contrato e mocks locais. Parte dos
caminhos 0089/0091/0093/0095 já foi exercitada em PGlite/PG 18.6 em trabalhos
anteriores, mas **isso não cobre a `0129`**. A `0129` não foi aplicada e não há
harness executável pronto para ela neste worktree. Concorrência real entre
sessões, RLS e rollback do PostgreSQL permanecem pendentes.

Todos os testes abaixo que executam `INSERT`, `UPDATE`, `DELETE`, chamada de RPC
que grava, DDL ou `GRANT`, mesmo dentro de `BEGIN ... ROLLBACK`, são escrita
remota e exigem autorização expressa, janela combinada e destino
`lflzlcqinarrcgncafol`. Somente consultas de leitura já estão autorizadas.

| # | Teste | O que validar | Situação atual | Exige autorização em homologação? |
| ---: | --- | --- | --- | --- |
| 1 | Concorrência com mesma chave | Duas sessões enviam a mesma chave idempotente; uma grava, a outra devolve `ja_registrado`. | Pendente | **Sim** |
| 2 | Locks de sabor, reserva, pedido e lote | Transação longa mantém `FOR UPDATE`/`pg_advisory_xact_lock`; segunda sessão espera e vê saldo atualizado. | Staticamente conferido na `0129`; pendente em banco real | **Sim** |
| 3 | Rollback | Forçar erro após gravar ledger; nenhuma linha parcial permanece em tabela de movimento, reserva ou auditoria. | Pendente | **Sim** |
| 4 | RLS | `admin`, `producao`, `ajuste`, operador comum e `anon` têm acessos distintos conforme a regra aprovada. | Pendente | **Sim** |
| 5 | Idempotência | Replay com mesma assinatura retorna sucesso; mesma chave com assinatura diferente aborta. | Estático e mock local; pendente em banco | **Sim** |
| 6 | Reservas simultâneas | Dois pedidos reservam o mesmo lote; o segundo recebe insuficiência sem saldo negativo. | Parcial em PGlite para 0089/0091/0093; pendente para 0129 | **Sim** |
| 7 | Cancelamento de pedido | Cancelar após reserva devolve quantidade, encerra reserva e grava auditoria sem dupla baixa. | Parcial em PGlite; pendente para 0129 | **Sim** |
| 8 | Consumo parcial | Consumir parte da reserva; `pendente` diminui; nova retirada não debita novamente o produto pai. | Mock local; transacional pendente para 0129 | **Sim** |
| 9 | Perdas | Perda com e sem reserva; bloqueio quando compromete reservado; saldo e lote coerentes. | Estático; pendente em banco | **Sim** |
| 10 | Combos 50, 100 e personalizado | Composição gravada por componente; 100 = 2 × 50; múltiplos combos agregados antes da reserva. | Análise estática; pendente em banco | **Sim** |
| 11 | Proteção contra baixa duplicada | Item com produto pai e componentes é rejeitado; checkout legado não gera dupla baixa. | Análise estática da 0095; risco residual pendente | **Sim** |
| 12 | Preservação do histórico | `estoque_mov`, `estoque_movimentacoes`, `estoque_mov_operacoes` e `admin_logs` gravados na mesma transação; ordem 1–26 intacta. | Estático; pendente em banco | **Sim** |
| 13 | FEFO e vencidos | Baixa escolhe lote válido mais antigo; lote vencido com saldo continua visível no alerta e fora da baixa. | Estático; pendente em banco | **Sim** |

---

## 6. Preservação obrigatória

Nada nesta etapa alterou:

- Dashboard A01 e A01.1;
- Néia Inteligência;
- Minhas tarefas;
- Central de Pedidos H02;
- Central da Atendente;
- Estoque de Salgados, sua sequência personalizada, cores, formulários e menu lateral;
- demais módulos aprovados.

Destino futuro de integração continua sendo a branch oficial
`resgate-visual-h01-h07-codex`, com o endereço fixo oficial de homologação já
existente. Não foi criado outro ERP, outro projeto ou outro endereço.

---

## 7. Perguntas ao proprietário

Responda com “sim”, “não” ou com a opção indicada. Não é necessário conhecer
termos técnicos: as perguntas se referem apenas ao que deve acontecer no cadastro
e na operação.

1. A ordem atual dos 26 sabores, de 1 a 26, deve ser mantida exatamente como está? (sim/não)

2. Sabor 1, Coxinha de frango: confirmar `Mini Coxinha 25un` como vínculo comercial? Se sim, `25un` significa 1 unidade ou 25 unidades dentro da embalagem?

3. Sabor 2, Bolinha de queijo: confirmar `Mini Bolinha de Queijo 25un`? Se sim, o número `25` é quantidade física ou só nome comercial?

4. Sabor 4, Croquete: confirmar `Mini Croquete 25un` e definir se `25un` é embalagem com 25 unidades?

5. Sabor 9, Kibe: confirmar `Mini Kibe Frito 25un` e manter `Mini Quibe Assado 20un` como produto separado?

6. Sabor 10, Mini pastel de carne: confirmar `Mini Pastel de Carne 20un`, e o `Mini Pastel Congelado 50un` deve continuar fora do vínculo por ser sortido?

7. Sabor 11, Mini pastel de queijo: confirmar `Mini Pastel de Queijo 20un` e manter o sortido congelado fora do vínculo?

8. Sabor 12, Mini pastel de pizza: confirmar `Mini Pastel de Pizza 20un` e manter o sortido congelado fora do vínculo?

9. Sabor 14, Esfirra de carne: a grafia oficial do cadastro deve ser `Esfirra` ou `Esfiha`? Confirmar `Mini Esfiha de Carne 20un`?

10. Sabor 20, Mini empada de palmito: confirmar `Mini Empadinha de Palmito 20un`?

11. Sabor 21, Mini empada de frango: confirmar `Mini Empadinha de Frango 20un`?

12. Sabor 22, Mini pizza de calabresa: confirmar `Mini Pizza de Calabresa 15un`?

13. Sabor 23, Mini pizza de queijo: `Mussarela` é o mesmo sabor que `queijo` para o cadastro oficial? Confirmar `Mini Pizza de Mussarela 15un`?

14. Sabor 26, Enroladinho de salsicha: confirmar o UUID atual de `Mini Enroladinho de Salsicha 20un` e o vínculo?

15. Sabor 3, Risoles de presunto e queijo: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

16. Sabor 5, Bolinho de calabresa: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

17. Sabor 6, Bolinho de milho com queijo: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

18. Sabor 7, Bolinho de azeitona: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

19. Sabor 8, Trouxinha de milho com catupiry: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

20. Sabor 13, Mini pastel de palmito: manter sem produto, definir composição do sortido congelado ou criar cadastro unitário?

21. Sabor 15, Esfirra de frango: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

22. Sabor 16, Esfirra de brócolis: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

23. Sabor 17, Enroladinho de presunto e queijo: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

24. Sabor 18, Hamburguinho: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

25. Sabor 19, Ricota com zaatar: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

26. Sabor 24, Mini pizza de presunto e queijo: manter sem produto, confirmar que `Mini Pizza Portuguesa` é o mesmo recheio ou criar cadastro unitário?

27. Sabor 25, Trouxinha de calabresa: manter sem produto, criar cadastro unitário novo ou remover do cadastro oficial?

28. Nos produtos com `15un`, `20un` e `25un`, o número no nome representa quantas unidades físicas existem dentro da embalagem, ou é apenas uma descrição comercial sem multiplicador?

29. Para os combos de 50 e 100 unidades e para os pacotes sortidos (`Mini Mix Congelado 100un` e `Mini Pastel Congelado 50un`), qual é a composição exata por sabor?

30. Os produtos `Mini Quibe Assado`, `Mini Trouxinha de Frango`, `Mini Risole de Carne`, `Mini Pizza Portuguesa`, `Mini Empadinha de Carne`, `Mini Empadinha de Queijo`, `Mini Pastel de Frango` e `Mini Pizza de Frango` devem virar sabores oficiais adicionais ou permanecer como cadastros separados fora da lista dos 26?

31. O número `100` existente nos 31 produtos deve continuar **apenas** como referência do cadastro comercial, sem virar estoque físico? (sim/não)

32. Antes de qualquer movimentação real, você autoriza um inventário físico dos 31 produtos para apurar lotes verdadeiros? (sim/não)

33. Você autoriza corrigir a permissão da função de reserva para que operadores autenticados consigam reservar, mantendo `anon` e `service_role` sem acesso? (sim/não)

34. Você autoriza executar os testes transacionais listados na seção 5 em homologação, com escrita temporária e rollback, somente no banco `lflzlcqinarrcgncafol`? (sim/não)

35. A branch oficial `resgate-visual-h01-h07-codex` e o endereço fixo de homologação devem continuar sendo os únicos destinos futuros? (sim/não)

---

## Estado final desta etapa

- Nenhuma resposta foi presumida ou preenchida pelo agente.
- Nenhum vínculo provável foi gravado.
- Nenhum saldo foi transferido, somado, excluído ou zerado.
- Nenhuma permissão foi alterada.
- Nenhuma migration, publicação, push, merge, deploy ou escrita remota foi feito.
- Produção permanece protegida e intocada.
- A aplicação da `0129`, a correção de ACL e os testes transacionais aguardam
  aprovação expressa.
