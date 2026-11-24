# Continuação da homologação visual

**24 de novembro de 2026 · Aprovação pendente**

- Referência visual · Preview histórico `7eqm3sjsv`, commit [`1dc0e0d`](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/commit/1dc0e0d0c0ddd7c008628f473d33799136d689e2).
- Operacional anterior · Preview `7me4obc0t`, commit `2be5e0c1707b3f175ac6b2e4663644184fa12611`.
- Revisão em homologação · branch `resgate-visual-h01-h07-codex`, commit publicado [`146cd63`](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/commit/146cd638029de34aa0862bcfbb7aab89f7c61859), [Preview protegido](https://erp-neia-salgados-obz7is0xe-luiz988061337-3147s-projects.vercel.app/admin), deployment `dpl_FbgpHbVRYSeMe9ABZvKEqzECKZEH`.
- [Atualização da Issue #3](https://github.com/luiz988061337-sketch/ERP-NEIA-SALGADOS/issues/3#issuecomment-7137311049) · [Relatório anterior](2026-11-24-RESGATE-REFERENCIA-21NOV.md)

## Comparativos

[Antes · aprovado · depois no desktop](validacao-premium/comparativo-desktop.jpg) · [Antes · aprovado · depois no celular](validacao-premium/comparativo-mobile.jpg)

As capturas de origem foram feitas com viewport de 1440×900 e 390×844. A coluna aprovado reproduz localmente o build do commit histórico em seu modo demonstrativo. Antes e depois usam seus respectivos commits operacionais e a mesma resposta controlada no Chromium. As chamadas externas e as escritas no Supabase ficaram bloqueadas nesses testes. Os comparativos preservam a ordem das colunas e são reduzidos para leitura. A comparação autenticada nos Previews operacionais depende de uma sessão de homologação.

## Diferenças e alterações

| Tela | Diferença observada e correção | Estado |
| --- | --- | --- |
| Compras `/admin#compras` | Antes havia uma lista e um formulário no mesmo cartão. A estrutura dourada aprovada ganhou cabeçalho, quatro indicadores, tabela com busca e status, criação de pedido separada e card de reposição. Os quatro indicadores usam a lista de compras, seus itens e os saldos de insumos. Ver abre o mesmo fluxo real de itens, envio, cancelamento e recebimento. O banco registra data de recebimento. A previsão do mockup e o formulário de itens antes de salvar o pedido ficam pendentes. | **Depende de dados e aprovação**. Arquivo `estoque/compras-admin.tsx`, commit `2018993`. |
| Fornecedores `/admin#fornecedores` | Antes havia uma lista compacta seguida do formulário. O aprovado tem quatro indicadores, cadastro acima da tabela, busca, filtros, situação, edição e dois quadros inferiores. A revisão aplica essa hierarquia, mantém os campos persistidos e usa prazo, atividade, contato e pagamento. Categoria, atrasos e aumentos do mockup carecem de fonte operacional específica. | **Depende de dados e aprovação**. Arquivo `estoque/fornecedores-admin.tsx`, commit `ed1530f`. |
| Campanhas `/campanhas` | Antes abria o formulário estreito. O aprovado abre no painel comercial com navegação horizontal, seis indicadores e blocos em duas colunas. A revisão usa a mesma composição e CSS, com públicos baseados no CRM, abas de campanhas e resultados, editor, cupom, recuperação de carrinho e simulador. Os números de retorno e os motivos ilustrativos do aprovado só entram quando houver fonte operacional. A consulta de intervalo entre campanhas precisa responder para liberar ações. | **Depende de dados e aprovação**. Arquivos `campanhas.tsx` e `campanhas-painel.tsx`, commit `7fa6071`. |
| Produtos `/admin#produtos` | Lista simples passou a ter cabeçalho, cinco indicadores, filtros de busca/categoria/situação e tabela com controles. Formulário, categorias, exportação, disponibilidade e ajuste de estoque foram preservados. | **Depende de dados e aprovação**. Arquivo `admin.tsx`, commit `146cd63`. |
| Insumos `/admin#insumos` | Cabeçalho, faixa de quatro indicadores, consulta e cadastro em cartões. Mantidos lotes FEFO, perdas, inventário e movimentos. Editar mantém a unidade base já cadastrada. | **Depende de dados e aprovação**. Arquivo `estoque/insumos-admin.tsx`, commit `146cd63`. |
| Embalagens `/admin#embalagens` | Nova entrada para as embalagens identificadas pelo campo categoria, sobre o estoque de insumos já existente. Inclui consulta e cadastro em unidade. Os campos de conversão por fardo/pacote e a classificação detalhada do aprovado exigem modelo persistido próprio. | **Divergente**. O comparativo registra a diferença. Arquivos `insumos-admin.tsx`, `admin.tsx`, `admin-nav.ts` e `paineis-staff.ts`, commit `146cd63`. |
| Combos fixos `/preview/combos` | O aprovado tem cadastro de composição por sabor. O banco consultado oferece produtos, modalidades de venda e reserva por produto. O cadastro persistido de composição de combos fixos carece de integração. A montagem pública existente continua distinta deste cadastro. | **Divergente**, com captura do aprovado. |
| Estoque de Salgados `/preview/estoque-salgados` | O aprovado mostra uma visão dedicada de físico, reservado, disponível, validade e movimentos. Existem produtos, lotes e reservas no banco. A tela dedicada e a vinculação das modalidades ao saldo correto continuam pendentes. A ação Estoque segue disponível no cadastro operacional de produtos. | **Divergente**, com captura do aprovado. |

Pesquisas, Sugestões e Reembolsos continuam pendentes de integração operacional. Resultados abre o histórico e desempenho existente de Campanhas. Fichas Técnicas, Fiscal, Contador, Equipe e os demais painéis permanecem no inventário anterior. O comparativo desta rodada cobre os oito módulos da tabela. A comparação integral e a aprovação das demais telas seguem pendentes.

## Testes

- TypeScript e build Vercel local passaram. A suíte selecionada de regressão passou com 75 testes.
- O Chromium local abriu oito destinos por menu em cada tamanho, com apenas um documento. Validou a tabela e os itens de compra, o botão de recebimento, a abertura da edição de fornecedor, os dados exibidos no painel de Campanhas, o botão inativo quando o público está vazio, as abas de Campanhas e Resultados, voltar/avançar, Produtos, o filtro real de Embalagens e Insumos. [Resultado local](validacao-premium/resultado-fluxo-local.json)
- A regressão geral repetiu 14 cliques sem F5 em cada tamanho, voltou e avançou no histórico e testou a recarga de Pedidos. [Resultado da regressão](validacao-premium/resultado-local.json)
- O Preview respondeu HTTP 200 para o documento e o JavaScript. O código publicado aponta apenas para o Supabase de testes e a Vercel confirmou a proteção. O link direto abriu o login preservando `/admin#compras`.
- As estruturas de dados de staging foram consultadas em modo de leitura. O deploy foi destinado ao projeto Supabase `lflzlcqinarrcgncafol`. Operações e permissões com uma conta de homologação continuam pendentes. `main`, produção, banco, credenciais e migrations foram preservados.
