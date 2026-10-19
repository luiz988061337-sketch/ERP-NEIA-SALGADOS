# ANÁLISE DE PREÇO DOS COMBOS — PRODUÇÃO (somente leitura)

**Coletado em:** 2026-10-19T18:32:24.269Z
**Fonte:** PostgREST com a chave *publicável* (papel `anon`, RLS ativo) — leitura do catálogo público.
**Nenhum preço foi alterado. Nenhuma escrita realizada.**

---

## 0. Como o preço do combo é determinado (antes e depois)

| | Autoridade do preço do combo | Origem |
|---|---|---|
| **Hoje (código publicado)** | `COMBO_CATEGORIAS` (lista estática) | `src/lib/combo.ts` → `COMBO_CATEGORIAS_FALLBACK` |
| **Depois do corte** | `categorias.combo_preco_unit` | coluna da migration **0097** (seed com os mesmos valores) |

> **A autoridade muda de lugar, mas não de valor.** O seed da 0097 usa exatamente os
> mesmos 5 preços que a lista estática já usava. Verificado contra o código publicado
> (`git show HEAD:src/lib/combo.ts`).

Há **dois caminhos de venda** para estes 54 itens, e ambos precisam ser comparados:

- **Caminho A — combo montado** (`/combo`): o item do carrinho é uma *montagem*
  (`produto_id = null` + `componentes`). O preço é **unitário** e vem da autoridade de cima.
  É o caminho que o cutover altera.
- **Caminho B — venda avulsa no cardápio**: o item entra pelo `product-card.tsx`, que
  já força `combo: true` e quantidade mínima 50. O preço vem de `produtos.preco`,
  que a 0095 **não altera**.

---

## 1. Tabela completa — 54 produtos `combo_50`

| produto_id | nome | categoria | slug | qtd kit | preço atual do produto | combo_preco_unit (0097) | preço novo regime (A) | dif. R$ (A) | dif. % (A) | status (A) | status (B) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `37dba3ef-18bd-4ef5-b8f2-05d1b455cb92` | Bolinha de azeitona 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `4a57ea03-7155-4709-86a0-5704804d4a2e` | Bolinha de calabresa 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `a931d3e4-254c-4c74-996b-30afc3febdf1` | Bolinha de milho 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `ae294afa-164d-4abe-9049-694f4e8dc17d` | Bolinha de queijo 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `072ec5c8-064a-4a1a-8c35-59efd982141e` | Coxinha de frango 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `96ee6609-049e-486b-ba29-3be548087efc` | Croquete de frango 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `d27f3343-8ed9-4425-a590-a09fa22684f5` | Empadinha de carne 25un | Mini Empadinhas | `mini-empadinhas` | 25 | R$ 2.40 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `1904e5f7-d260-4b82-ae6d-76f566f0191d` | Empadinha de frango 25un | Mini Empadinhas | `mini-empadinhas` | 25 | R$ 2.40 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `8cd040af-3a03-4392-844a-ceef5591081d` | Empadinha de palmito 25un | Mini Empadinhas | `mini-empadinhas` | 25 | R$ 2.40 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `77dbf650-e3dc-409c-ad26-f8c86f48e5dd` | Empadinha de queijo 25un | Mini Empadinhas | `mini-empadinhas` | 25 | R$ 2.40 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `d8c2a1bb-b94f-4217-8997-1920027cee98` | Enroladinho de presunto e queijo 25un | Mini Fritos | `mini-fritos` | 25 | R$ 2.30 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `c746dd2b-e205-4e56-a9b6-c3098f6f6dab` | Enroladinho de salsicha 25un | Mini Assados | `mini-assados` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `e6a42f57-43f8-42c2-a820-e41f5bf1b741` | Esfiha de brocolis 25un | Mini Assados | `mini-assados` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `48315ded-3b31-4c25-abd8-6adb98b4c0df` | Esfiha de carne 25un | Mini Assados | `mini-assados` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `d0ae231c-0010-4cd3-99a9-86088197b4b3` | Esfiha de frango 25un | Mini Assados | `mini-assados` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `deef3bf8-9403-4efd-a292-9c22576cbe57` | Hamburguinho 25un | Mini Fritos | `mini-fritos` | 25 | R$ 2.30 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `54717928-d601-4ce1-b6c7-14cf1ee2998e` | Kibe 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `e1d62ce7-c806-4204-bb5d-5277cda062c7` | Mini Bolinha de Queijo 25un | Mini Fritos | `mini-fritos` | 25 | R$ 39.90 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `5f59df73-8081-435e-8213-0b72caf615d2` | Mini Coxinha 25un | Mini Fritos | `mini-fritos` | 25 | R$ 39.90 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `6badc5e6-db2c-472d-b9e1-bea17df97f59` | Mini Croquete 25un | Mini Fritos | `mini-fritos` | 25 | R$ 42.90 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `64d71833-4558-49fa-a8e1-e44b0926b22c` | Mini Empadinha de Carne 20un | Mini Empadinhas | `mini-empadinhas` | 20 | R$ 48.90 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `90b8d945-a01e-44ee-b07f-be7d8a4eada4` | Mini Empadinha de Frango 20un | Mini Empadinhas | `mini-empadinhas` | 20 | R$ 46.90 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `e41684a2-eb7a-4aa6-a2f5-f521a9698c4c` | Mini Empadinha de Palmito 20un | Mini Empadinhas | `mini-empadinhas` | 20 | R$ 49.90 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `3470d21c-9ba7-4e7f-a0eb-148e44d7d5ba` | Mini Empadinha de Queijo 20un | Mini Empadinhas | `mini-empadinhas` | 20 | R$ 46.90 | 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `d3f85646-931c-4023-a023-2a6a3617ca33` | Mini Enroladinho de Salsicha 20un | Mini Assados | `mini-assados` | 20 | R$ 44.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `67a05fbd-fe1a-4fd2-9610-1cd7cd16ca6d` | Mini Esfiha de Carne 20un | Mini Assados | `mini-assados` | 20 | R$ 47.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `86f56c89-32aa-47c9-868d-f0064dac1519` | Mini Kibe Frito 25un | Mini Fritos | `mini-fritos` | 25 | R$ 44.90 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `242740ec-01af-4800-a4ac-e46e3b0df4b0` | Mini Pastel de Carne 20un | Mini Pastéis | `mini-pasteis` | 20 | R$ 44.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `68329eec-d1b0-4767-8168-2210d4c27c60` | Mini Pastel de Frango 20un | Mini Pastéis | `mini-pasteis` | 20 | R$ 46.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `7b7a4d96-8d2a-4d7a-a8ea-349ba09407df` | Mini Pastel de Pizza 20un | Mini Pastéis | `mini-pasteis` | 20 | R$ 46.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `9cd3f353-4e6c-4efd-b7a1-39a16e3df4af` | Mini Pastel de Queijo 20un | Mini Pastéis | `mini-pasteis` | 20 | R$ 44.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `8d192135-a68c-42a8-b795-fb22f70f7b81` | Mini Pizza de Calabresa 15un | Mini Pizzas | `mini-pizzas` | 15 | R$ 54.90 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `6c6ff74d-1a36-4028-ba9b-3a55dfb800db` | Mini pizza de calabresa 25un | Mini Pizzas | `mini-pizzas` | 25 | R$ 3.70 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `90041cfd-3a9a-4a59-bd8e-127fa7e983e9` | Mini Pizza de Frango 15un | Mini Pizzas | `mini-pizzas` | 15 | R$ 59.90 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `2dc40464-f67e-4243-940a-d8f5c3d07afd` | Mini pizza de frango 25un | Mini Pizzas | `mini-pizzas` | 25 | R$ 3.70 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `b719c26f-def7-4b4a-84e8-46b7aed4d000` | Mini Pizza de Mussarela 15un | Mini Pizzas | `mini-pizzas` | 15 | R$ 54.90 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `ce3bc94b-3ecb-4a82-8a4a-94d5d7a5ad03` | Mini pizza de presunto e queijo 25un | Mini Pizzas | `mini-pizzas` | 25 | R$ 3.70 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `69446d99-a58c-46bc-baec-334963239566` | Mini pizza mussarela 25un | Mini Pizzas | `mini-pizzas` | 25 | R$ 3.70 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `b055c172-850d-4ef0-98dd-8c142f039867` | Mini Pizza Portuguesa 15un | Mini Pizzas | `mini-pizzas` | 15 | R$ 59.90 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `f976d500-c6d8-4457-b9dd-1b150e5aadd0` | Mini pizza portuguesa 25un | Mini Pizzas | `mini-pizzas` | 25 | R$ 3.70 | 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `31da21cc-80ad-49c4-b93a-0b044bdaa168` | Mini Quibe Assado 20un | Mini Assados | `mini-assados` | 20 | R$ 47.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `f21c3adc-0617-4153-aef3-46559681e149` | Mini Risole de Carne 25un | Mini Fritos | `mini-fritos` | 25 | R$ 42.90 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `f5661533-58de-4d40-91d3-a734125f8b02` | Mini Trouxinha de Frango 20un | Mini Assados | `mini-assados` | 20 | R$ 49.90 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `b8adee7f-f8a2-4ddd-aba8-e1b88f609c81` | Pastel de carne 25un | Mini Pastéis | `mini-pasteis` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `3fcbff34-85c8-4cc8-8f92-ee046fe1bffa` | Pastel de frango 25un | Mini Pastéis | `mini-pasteis` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `9c287833-0471-41ff-af07-9e8f3a0edaaf` | Pastel de palmito 25un | Mini Pastéis | `mini-pasteis` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `997430ac-9990-4b98-b2a8-93a92fe9832e` | Pastel de pizza 25un | Mini Pastéis | `mini-pasteis` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `f97235fe-02c7-449c-b8cc-14db7028e5d0` | Pastel de queijo 25un | Mini Pastéis | `mini-pasteis` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `30e066f4-fb67-49c6-9801-53ec880c9042` | Quibe assado 25un | Mini Assados | `mini-assados` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `86dce5ea-d6a7-44c9-a50b-ef0db8141cea` | Risole de carne 25un | Mini Fritos | `mini-fritos` | 25 | R$ 1.60 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `d1a8838b-f749-41a7-9694-f0f0cec4c633` | Trouxinha de calabresa 25un | Mini Fritos | `mini-fritos` | 25 | R$ 2.30 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `c2472e9c-8855-4b82-95c9-d691461d516e` | Trouxinha de frango 25un | Mini Assados | `mini-assados` | 25 | R$ 2.30 | 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `ded9608e-294a-45d6-be32-5997537fb3ea` | Trouxinha de milho com catupiry 25un | Mini Fritos | `mini-fritos` | 25 | R$ 2.30 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |
| `60651bb2-d1c5-4538-ae13-00193c71209b` | Trouxinha de ricota com zaatar 25un | Mini Fritos | `mini-fritos` | 25 | R$ 2.30 | 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** | IGUAL |

> *preço novo regime (A)* = preço **por unidade** do combo sob a 0097 (`combo_preco_unit`).
> *status (B)* = venda avulsa: `produtos.preco` antes e depois (a 0095 não mexe nele).

---

## 2. Resumo por categoria

| categoria | slug | itens | qtd kit | preço/un hoje (A) | combo_preco_unit (0097) | dif. R$ | dif. % | status |
|---|---|---|---|---|---|---|---|---|
| Mini Fritos | `mini-fritos` | 18 | 25 | R$ 1.60 | R$ 1.60 | +0.00 | +0.0% | **IGUAL** |
| Mini Empadinhas | `mini-empadinhas` | 8 | 25 | R$ 2.40 | R$ 2.40 | +0.00 | +0.0% | **IGUAL** |
| Mini Assados | `mini-assados` | 10 | 25 | R$ 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** |
| Mini Pastéis | `mini-pasteis` | 9 | 20 | R$ 2.30 | R$ 2.30 | +0.00 | +0.0% | **IGUAL** |
| Mini Pizzas | `mini-pizzas` | 9 | 15 | R$ 3.70 | R$ 3.70 | +0.00 | +0.0% | **IGUAL** |

---

## 3. Critério de corte — preço

> **NO-GO** se qualquer item **ativo** mudar de preço sem decisão comercial explícita.

| Caminho | Itens | IGUAL | DIVERGENTE | Conclusão |
|---|---|---|---|---|
| **A** — combo montado (o que o cutover altera) | 54 | 54 | 0 | **nenhum item muda de preço** |
| **B** — venda avulsa no cardápio | 54 | 54 | 0 | **nenhum item muda de preço** |

- Itens inativos (`disponivel = false`): 0 (não alters o critério, mas listados abaixo).

> ### ✅ CRITÉRIO DE PREÇO ATENDIDO — nenhum dos 54 itens muda de preço no cutover.

---

## 4. Achado separado (PRÉ-EXISTENTE, não causado pelo cutover)

O `produtos.preco` dos 54 itens é **incoerente** dentro de cada categoria: alguns
linhas guardam o preço **por unidade** e outras o preço **do kit** (caixa).

| semântica de `produtos.preco` | itens | exemplo |
|---|---|---|
| preço **por unidade** (igual ao `combo_preco_unit`) | 28 | Bolinha de queijo 25un — R$ 1.60/un |
| preço **de caixa** (comercial, dentro de ±15% de unit×kit) | 21 | Mini Bolinha de Queijo 25un — R$ 39.90 por 25un |
| preço **de outra categoria** (defeito de catálogo) | 5 | Enroladinho de presunto e queijo 25un; Hamburguinho 25un; Trouxinha de calabresa 25un |
| indecifrável | 0 | — |

**Consequências:**

1. **O cutover não altera nenhum desses preços** (caminho B = `produtos.preco`, preservado).
2. Mas **o estoque deixa de ser decorativo**: hoje um combo não debita estoque nenhum;
   depois do corte, cada sabor componente é debitado. Em dois pontos de vista divergentes
   (`preco` por unidade vs. do kit), o mesmo item aparece com preços diferentes —
   isso é um **dado de catálogo pré-existente** que precisa de decisão do responsável
   comercial, **não** de correção técnica no cutover.
3. Duplicate flavors possibly spread over multiple rows (e.g. *Bolinha de queijo 25un*
   and *Mini Bolinha de Queijo 25un*) mean the physical stock is fragmented across rows.
   O regime novo passa a debitar cada linha separadamente — a contagem física precisa
   fechar antes de abrir vendas.

**Nada disso bloqueia o cutover**, mas o responsável precisa saber antes de abrir vendas:

| Questão para o responsável comercial | Resposta |
|---|---|
| O `estoque` dos 54 itens é contado em **unidades** ou em **caixas**? | ____________________ |
| As linhas duplicadas do mesmo sabor (ex.: *Bolinha de queijo* / *Mini Bolinha de Queijo*) são o **mesmo estoque**? | ____________________ |
| O `produtos.preco` deve ser unificado (por unidade ou por kit)? | ____________________ |

---

## 5. Itens inativos (informativo)

Nenhum item `combo_50` está com `disponivel = false`.

