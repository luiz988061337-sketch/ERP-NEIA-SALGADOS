# Estoque de Salgados — diagnóstico dos 26 sabores em homologação

Consulta de leitura no Supabase de homologação em 26/11/2026. Foram encontrados
31 produtos, todos com saldo legado positivo na coluna comercial, zero lotes,
zero movimentações, zero reservas e zero itens de pedidos com produto referenciado.
A tabela `sabores_estoque` ainda não existe. O indicador de 0 de 26 reflete a
ausência do cadastro oficial. Os valores legados não comprovam existência de
estoque físico e precisam de conciliação antes da operação. A leitura foi
reconfirmada em 26/11/2026 com destino explícito
`--project-ref lflzlcqinarrcgncafol`; nenhuma escrita remota foi executada.

**Vínculos unitários confirmáveis automaticamente: 0.** A lista abaixo identifica
os produtos existentes para conferência. Um candidato comercial não substitui
um registro unitário. Os UUIDs são referências de conferência e preservação dos
cadastros, sem exibição para o operador no painel.

| Categoria | Sabor oficial | Candidatos no catálogo | Decisão pendente |
| --- | --- | --- | --- |
| Fritos | Coxinha de frango | Mini Coxinha Congelada 100un (`213e5339-213e-4499-9462-e7966abadf17`)<br>Mini Coxinha 25un (`7c23eecb-5d7f-478f-9679-4bcffed1ec8c`) | Candidatos comerciais. Confirmar recheio e multiplicadores de 25/100. |
| Fritos | Bolinha de queijo | Mini Bolinha de Queijo 25un (`42632768-6e24-427b-adc3-22a8583d081e`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Fritos | Risoles de presunto e queijo | Mini Risole de Carne 25un (`902db50c-ccb8-4253-a4d9-61d66b013672`) | Recheio divergente. Risole de carne não serve para o de presunto e queijo. |
| Fritos | Croquete | Mini Croquete 25un (`adb27294-2de4-4fbd-987f-4d6e190b2d7f`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Fritos | Bolinho de calabresa | — | Sabor sem candidato identificado no catálogo. |
| Fritos | Bolinho de milho com queijo | — | Sabor sem candidato identificado no catálogo. |
| Fritos | Bolinho de azeitona | — | Sabor sem candidato identificado no catálogo. |
| Fritos | Trouxinha de milho com catupiry | — | Sabor sem candidato identificado no catálogo. |
| Fritos | Kibe | Mini Quibe Assado 20un (`f6f9b63a-12d6-4627-bbbb-4320beeb2b6f`)<br>Mini Kibe Frito 25un (`be8b1c2d-003a-4e5c-b8ea-fa5b4827beff`) | Kibe frito é candidato comercial. Quibe assado fica para confirmação de modalidade. |
| Mini Pastéis | Mini pastel de carne | Mini Pastel Congelado 50un (`31a252ef-f76f-42df-8121-4bc4ca8fe537`)<br>Mini Pastel de Carne 20un (`546b475c-6d22-4dd2-822e-8808cd3fd008`) | Candidato comercial identificado. O pacote sortido exige composição explícita. |
| Mini Pastéis | Mini pastel de queijo | Mini Pastel Congelado 50un (`31a252ef-f76f-42df-8121-4bc4ca8fe537`)<br>Mini Pastel de Queijo 20un (`ba4fff4e-acab-4bde-8fa9-69126d70b1d2`) | Candidato comercial identificado. O pacote sortido exige composição explícita. |
| Mini Pastéis | Mini pastel de pizza | Mini Pastel Congelado 50un (`31a252ef-f76f-42df-8121-4bc4ca8fe537`)<br>Mini Pastel de Pizza 20un (`d41679a0-ed64-4a59-8d32-b2e6f15e856c`) | Candidato comercial identificado. O pacote sortido exige composição explícita. |
| Mini Pastéis | Mini pastel de palmito | Mini Pastel Congelado 50un (`31a252ef-f76f-42df-8121-4bc4ca8fe537`) | Sabor ausente. O congelado é sortido e depende de composição explícita. |
| Assados | Esfirra de carne | Mini Esfiha de Carne 20un (`c2614fb0-edde-49d0-9c6b-f73c802ab944`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Assados | Esfirra de frango | — | Sabor sem candidato identificado no catálogo. |
| Assados | Esfirra de brócolis | — | Sabor sem candidato identificado no catálogo. |
| Assados | Enroladinho de presunto e queijo | — | Sabor sem candidato identificado no catálogo. |
| Assados | Hamburguinho | — | Sabor sem candidato identificado no catálogo. |
| Assados | Ricota com zaatar | — | Sabor sem candidato identificado no catálogo. |
| Assados | Trouxinha de calabresa | — | Sabor acrescentado ao cadastro oficial; sem candidato identificado no catálogo. |
| Assados | Enroladinho de salsicha | Mini Enroladinho de Salsicha 20un (`fcf21928-b16a-4e52-a06e-df6d89a9f33a`) | Embalagem comercial com nome ambíguo. Não vincular automaticamente ao sabor unitário; conferir unidade e modalidade com o proprietário. |
| Empadas | Mini empada de palmito | Mini Empadinha de Palmito 20un (`b29bbb13-dafe-47bd-86d2-532f59253a09`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Empadas | Mini empada de frango | Mini Empadinha de Frango 20un (`f96f2b19-4c9c-461b-b8f5-6ee7a82ed28d`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Mini Pizzas | Mini pizza de calabresa | Mini Pizza de Calabresa 15un (`f1d762a7-3710-4c40-af4c-f85512cdd4d0`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Mini Pizzas | Mini pizza de queijo | Mini Pizza de Mussarela 15un (`7e551b4d-5cca-4d50-9927-dfeaf32894f5`) | Candidato comercial identificado pelo nome. Validar composição e quantidade. |
| Mini Pizzas | Mini pizza de presunto e queijo | Mini Pizza Portuguesa 15un (`f0d646ac-73f5-4eb1-8d5e-cb3741b8e31b`) | Pizza portuguesa depende de confirmação. O nome não comprova o recheio. |

## Preparação para a vinculação

1. Aplicar o cadastro oficial e a rotina de lotes apenas após autorização. O
   script de cadastro registra a categoria e a chave oficial e conserva os
   IDs dos registros unitários reconhecidos. Nesta base, os 26 registros
   oficiais ainda terão o vínculo operacional pendente. O plano completo,
   verificações e reversão estão em
   [cadastro-oficial-salgados-26.md](cadastro-oficial-salgados-26.md).
2. Definir o identificador unitário de cada sabor. O estoque atual usa
   `produtos.id` nas chaves de lotes, reservas e movimentações. Para sabores
   sem um produto unitário, é necessário aprovar a representação técnica
   antes de criar registros. A coluna `preco` de produtos é obrigatória.
   Nenhum preço, lote, custo, saldo ou mínimo foi criado nesta revisão.
3. Associar cada modalidade comercial ao ID unitário preservando os IDs de
   cadastro, itens de pedidos e históricos existentes. Validar quantidades
   reais das embalagens e a composição dos sortidos. Os tamanhos no nome são
   indícios para conferência. O UUID de `Mini Enroladinho de Salsicha 20un`
   diverge em documentos históricos; o identificador conferido na leitura
   atual de homologação é o registrado na tabela acima e deve ser confirmado
   antes de qualquer vínculo.
4. Reutilizar a composição por unidade de `pedido_item_componentes` nos fluxos
   que já a consomem. A venda direta e as modalidades legadas devem resolver
   o mesmo ID unitário antes da reserva. A demanda de cada sabor deve entrar
   uma única vez, evitando somar o produto pai e seus componentes.
5. Homologar o caminho completo de confirmação, reserva, retirada FEFO e
   cancelamento parcial com dados reais autorizados. A rotina de lotes deste
   módulo foi preparada à parte. Os fluxos externos de produção e venda
   ainda precisam ter seu uso do estoque por sabor conferido antes da operação.
