# MAPEAMENTO FOTOS × PRODUTOS — Néia Salgados (documento de trabalho)

## REFINO VISUAL (verificação por abertura real dos arquivos — sem alterar ZIPs)
- `BEBIDAS/COCA-COLA.jpg` → garrafa + copo + caixa Néia → 🟢 ALTA p/ Coca-Cola 2L (`32b50bbc-418e-4869-b202-dcdf076640a8`). Nuance: rótulo "menos açúcar" — confirmar se o produto é esse ou tradicional.
- `FRITOS - 9 SABORES/AZEITONA.jpg` → salgado frito com recheio/corte de azeitona → 🟢 ALTA p/ Bolinha de azeitona 25un (`37dba3ef-18bd-4ef5-b8f2-05d1b455cb92`).
- `FRITOS - 9 SABORES/PRESUNTO E QUEIJO.jpg` → salgado FRITO recheado presunto+queijo, mas NÃO existe "bolinha presunto e queijo" no catálogo (só enroladinho assado e mini pizza) → 🔴 SEM PRODUTO (não associar).
- `ASSADOS/COMBOS/BRÓCOLIS.jpg` → esfiha assada com recheio de brócolis → 🟢 ALTA p/ Esfiha de brocolis 25un (`e6a42f57-43f8-42c2-a820-e41f5bf1b741`).
- `CONGELADOS/IMG_0665.jpg` → produto PRONTO estilizado (não embalagem congelada), recheio aparente de calabresa → 🟡 MÉDIA p/ Bolinha de calabresa Congelada 50un (`811c0112-6869-4386-ba41-ce7b688c8278`); regra §9 respeitada (só com aprovação).
- `MIX DA NÉIA/MIX DA NÉIA.jpg` → caixa sortida genérica (pastéis, esfihas, coxinhas, kibes, mini pizzas) → AMBÍGUA: candidata a Kit Festa 100 Mini (`8bf6f7d7-96bf-416a-b1a3-2914830754ba`) somente com aprovação explícita; senão, sem produto específico.

> FASE: diagnóstico. NADA foi gravado no banco. `produtos.imagem_url` intacto.
> Fonte de produtos: `Downloads/produtos-2026-10-05.csv` (90 itens; UUIDs reais estão
> só no banco — coluna UUID abaixo = A COLETAR via `select id, nome` antes de aplicar).
> Fonte de fotos: 4 ZIPs do Drive (zips 1–3 são 100% subconjuntos byte-idênticos do zip 4).
> Regra: 🟢 ALTA = pode associar | 🟡 MÉDIA = confirmar visualmente | 🔴 BAIXA = não associar.
> Nomes com acento quebrado (BR�COLIS/MIX DA N�IA) são encoding do ZIP, não do produto.

## Legenda de fotos (pasta base = zip 4 `drive-download-20261006T221612Z-1-001.zip`)

- `F9 = FRITOS/INDIVIDUAIS/FRITOS - 9 SABORES/`, `FRC = FRITOS/COMBOS/FRITOS/`,
  `FE = FRITOS/EXTRAS/`, `AEF = ASSADOS/EXTRAS/FRITOS/`, `AC = ASSADOS/COMBOS/`,
  `AI = ASSADOS/INDIVIDUAL/`, `CG = CONGELADOS/`, `MP = ASSADOS/MINI PIZZA/`,
  `PZ = FRITOS/INDIVIDUAIS/PASTELZINHO/` ou `FRITOS/COMBOS/PASTELZINHO/`,
  `IF = COMBOS _ iFood/`, `BB = BEBIDAS/`, `MX = MIX DA NÉIA/`

## Mini Fritos (18 produtos)

| Produto | UUID (banco) | Foto candidata | Confiança | Observação |
| --- | --- | --- | --- | --- |
| Bolinha de azeitona 25un | A COLETAR | `F9/AZEITONA.jpg` | 🟡 MÉDIA | Sabor certo; confirmar que é o salgado (não a azeitona) |
| Bolinha de calabresa 25un | A COLETAR | `F9/CALABRESA.jpg` + `CALABRESA OU AZEITONA (1-3).jpg` | 🟡 MÉDIA | Escolher 1 após revisão; demais sabores incertos |
| Bolinha de milho 25un | A COLETAR | `F9/MILHO - 1 (1-4).jpg`, `MILHO - 2*.jpg` | 🟡 MÉDIA | Muitas variantes; escolher 1 |
| Bolinha de queijo 25un | A COLETAR | `F9/BOLINHA DE QUEIJO (1-4).jpg` + `BOLINHA DE QUEIJO.jpg` | 🟡 MÉDIA | Escolher 1 após revisão |
| Coxinha de frango 25un | A COLETAR | `F9/COXINHA (1-6).jpg` | 🟡 MÉDIA | Escolher 1; vale p/ Mini Coxinha 25un também (não usar a mesma 2× sem decidir) |
| Croquete de frango 25un | A COLETAR | `F9/CROQUETE (1-2).jpg` | 🟡 MÉDIA | Escolher 1 |
| Hamburguinho 25un | A COLETAR | `AC/HAMBURGUINHO (1-2).jpg` | 🟡 MÉDIA | Escolher 1 |
| Kibe 25un | A COLETAR | `F9/KIBE (1-3).jpg` | 🟡 MÉDIA | Escolher 1; vale p/ Mini Kibe Frito (decidir) |
| Mini Bolinha de Queijo 25un | A COLETAR | (mesmo pool bolinha) | 🟡 MÉDIA | Não repetir foto da Bolinha 25un sem decisão |
| Mini Coxinha 25un | A COLETAR | (mesmo pool coxinha) | 🟡 MÉDIA | Não repetir foto sem decisão |
| Mini Croquete 25un | A COLETAR | (mesmo pool croquete) | 🟡 MÉDIA | Não repetir foto sem decisão |
| Mini Kibe Frito 25un | A COLETAR | (mesmo pool kibe) | 🟡 MÉDIA | Não repetir foto sem decisão |
| Mini Risole de Carne 25un | A COLETAR | — | — | SEM FOTO (nenhum arquivo "risole") |
| Risole de carne 25un | A COLETAR | — | — | SEM FOTO |
| Trouxinha de calabresa 25un | A COLETAR | `AC/CALABRESA (1-2).jpg`? | 🟡 MÉDIA | Incerto: pode ser bolinha; confirmar visualmente |
| Trouxinha de milho com catupiry 25un | A COLETAR | (pool MILHO) | 🟡 MÉDIA | Sabor certo, formato incerto |
| Trouxinha de ricota com zaatar 25un | A COLETAR | `AC/RICOTA COM ZAATAR (1-2).jpg` | 🟡 MÉDIA | Escolher 1 |
| Enroladinho de presunto e queijo 25un | A COLETAR | `F9/PRESUNTO E QUEIJO.jpg`? | 🔴 BAIXA | Pasta fritos × produto enroladinho; confirmar ou sem foto |

## Mini Congelados (29 produtos)

Fotos `CG/IMG_06xx.jpg` não nomeiam sabor → todas 🟡 MÉDIA (categoria certa, produto incerto).
Exceções: `CG/IMG_9955.jpg` tem 15MB (ver qualidade); `CG/IMG_0634.jpg` (out/13).

| Produto | UUID (banco) | Foto candidata | Confiança | Observação |
| --- | --- | --- | --- | --- |
| Bolinha de azeitona/calabresa/milho/queijo Congelada 50un (4) | A COLETAR | pool `CG/` | 🟡 MÉDIA | Impossível distinguir sabor pelo nome |
| Coxinha Congelada 50un | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Croquete de frango Congelado 50un | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Empadinha de frango/palmito Congelada 50un (2) | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Enroladinho de presunto e queijo/salsicha Congelado 50un (2) | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Esfiha de brocolis/carne/frango Congelada 50un (3) | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Hamburguinho Congelado 50un | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Kibe Congelado 50un | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Mini Coxinha Congelada 100un | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Mini Mix Congelado 100un | A COLETAR | `MX/MIX DA NÉIA.jpg` ou pool `CG/` | 🟡 MÉDIA | `MX/` é ambiente, não pack |
| Mini Pastel Congelado 50un | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Mini pizza de calabresa/frango/mussarela/presunto e queijo Congelada 50un (4) | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Pastel de carne/frango/palmito/pizza/queijo Congelado 50un (5) | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |
| Risole de carne Congelado 50un | A COLETAR | pool `CG/` | 🟡 MÉDIA | Único "risole" possível é genérico |
| Trouxinha de calabresa/milho/ricota Congelada 50un (3) | A COLETAR | pool `CG/` | 🟡 MÉDIA | — |

## Mini Empadinhas (8 produtos) — TODOS SEM FOTO
Empadinha de carne/frango/palmito/queijo 25un; Mini Empadinha de Carne/Frango/Palmito/queijo 20un. Nenhum arquivo "empad".

## Mini Assados (10 produtos)

| Produto | UUID (banco) | Foto candidata | Confiança | Observação |
| --- | --- | --- | --- | --- |
| Enroladinho de salsicha 25un | A COLETAR | — | — | SEM FOTO |
| Esfiha de brocolis 25un | A COLETAR | `AC/BRÓCOLIS.jpg`, `BRÓCOLIS (2).jpg` | 🟡 MÉDIA | Pode ser pizza; confirmar |
| Esfiha de carne/frango 25un | A COLETAR | — | — | SEM FOTO |
| Mini Enroladinho de Salsicha 20un | A COLETAR | — | — | SEM FOTO |
| Mini Esfiha de Carne 20un | A COLETAR | — | — | SEM FOTO |
| Mini Quibe Assado 20un | A COLETAR | — | — | SEM FOTO (KIBE* são fritos — confirmar) |
| Mini Trouxinha de Frango 20un | A COLETAR | — | — | SEM FOTO |
| Quibe assado 25un | A COLETAR | — | — | SEM FOTO (idem) |
| Trouxinha de frango 25un | A COLETAR | — | — | SEM FOTO |

## Kits para Festa (3 produtos) — TODOS SEM FOTO específica
Kit Aniversário 200 Mini; Kit Festa 100 Mini Salgados; Kit Reunião 50 Mini. Fotos `COMBOS DE 1 SABOR (1-4).jpg` e `COMBO - todos os sabores.jpg` são de combos avulsos, não dos kits → 🔴 BAIXA, não associar.

## Mini Pastéis (9 produtos)

| Produto | UUID (banco) | Foto candidata | Confiança | Observação |
| --- | --- | --- | --- | --- |
| Mini Pastel de Carne/Frango/Pizza/Queijo 20un + Pastel de carne/frango/palmito/pizza/queijo 25un (9) | A COLETAR | `PZ/PASTELZINHO/INDIVIDUAL (1-5).jpg` | 🟡 MÉDIA | 5 fotos p/ 9 produtos; sabor indistinguível; escolher após revisão |

## Mini Pizzas (9 produtos)

| Produto | UUID (banco) | Foto candidata | Confiança | Observação |
| --- | --- | --- | --- | --- |
| Mini Pizza de Calabresa/Frango/Mussarela/Portuguesa 15un + Mini pizza de calabresa/frango/mussarela/presunto e queijo/portuguesa 25un (9) | A COLETAR | `MP/INDIVIDUAL/IMG_95xx.jpg`, `MP/COMBO/*`, `IF/*` | 🟡 MÉDIA | Sabor indistinguível pelo nome; escolher após revisão |

## Bebidas (4 produtos)

| Produto | UUID (banco) | Foto candidata | Confiança | Observação |
| --- | --- | --- | --- | --- |
| Coca-Cola 2L | A COLETAR | `BB/COCA-COLA.jpg` | 🟢 ALTA | Única foto ↔ único produto |
| Água Mineral 500ml | A COLETAR | — | — | SEM FOTO |
| Guaraná 2L | A COLETAR | — | — | SEM FOTO (`FANTA.jpg` é outro refrigerante) |
| Suco Natural 500ml | A COLETAR | — | — | SEM FOTO |

## FOTOS SEM PRODUTO (não associar, não excluir)
`BB/FANTA.jpg`, `BB/VEDETE.jpg`, `BB/EXTRA.jpg`, `MX/EXTRA (1-2).jpg`, `MX/MIX DA NÉIA.jpg` (ambiente), `AI/IMG_0005–0032` e `IMG_0741–0760` (individuais sem sabor), `MP/COMBO/*` sem sabor, `AC/IMG_0035.jpg`, `AC/IMG_0043.jpg`, `AC/FRANGO (3-4).jpg`, `AC/DOGUINHO (1-2).jpg`, `AC/PALMITO (1-2).jpg`, `AC/PRESUNTO E QUEIJO (1-2).jpg`, `IF/*` sem sabor, `PZ/*` sem sabor, todos `CG/IMG_*`.

## DUPLICATAS (bytes idênticos — não apagar, só registrar)
- zips 1–3 ⊂ zip 4 (14 + 10 + 5 arquivos, tamanhos iguais).
- Dentro do zip 4: 13 arquivos `FE/*` ≡ `AEF/*` (ex.: IMG_6741=814068, IMG_6746=898368, IMG_6721=718071, IMG_6714=890046, IMG_6732=940043, IMG_6740=883983, IMG_6733=851903, IMG_6712=831818, IMG_6730=817039, IMG_6738=833949, IMG_6719=801806, IMG_6745=875458, IMG_6715=871748).

## QUALIDADE (a tratar antes do upload)
- `AC/IMG_9955.jpg` 15MB — comprimir/redimensionar.
- Demais: 540KB–1MB cada — comprimir para web (sugestão: máx 1600px, ~150–250KB).
- Acentos quebrados em 4 nomes (encoding do ZIP) — renomear cópias de trabalho, nunca o ZIP.
- Resolução/orientação: NÃO VERIFICADO em lote (exige abertura individual).
