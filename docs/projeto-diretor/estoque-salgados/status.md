# Estoque de Salgados — aprovação visual

Data: 26/11/2026

Status: **aprovação visual definitiva do layout no endereço oficial de homologação**. Não é aprovação operacional, funcional em banco nem autorização para publicar o cadastro de sabores.

## Objeto aprovado

- Base funcional revisada: commit `92260acc22c7e10c65c3761c941abc800882b212` na branch `resgate-visual-h01-h07-codex`.
- Versão publicada e conferida pelo proprietário: commit `07b96de69afb52cba9c22005ba2ca209aa3c2c96`.
- Deployment de homologação conferido: `erp-neia-salgados-dwdd6uq3m-luiz988061337-3147s-projects.vercel.app`.
- Endereço oficial fixo: <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#estoque-salgados>.
- Configuração do build: `NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0`.
- Componentes do painel: `src/components/admin/estoque/` e catálogo em `src/lib/catalogo-sabores-estoque.ts`.
- Navegação: `AdminShell`/`MenuLateral` compartilhado, aprovado definitivamente em [checkpoint próprio](../menu-lateral/status.md). Nenhum menu independente foi criado ou alterado.

A aprovação cobre o layout em desktop e celular, os indicadores, filtros, grupos, janelas, contrastes e a navegação do Estoque de Salgados conforme conferência manual no alias oficial. Ela não cobre o cadastro operacional de 26 sabores preparado localmente na sequência, vínculos comerciais, preços, saldos, lotes, movimentações, migrations, produção nem novos deployments.

## Evidências preservadas

As capturas de referência aprovadas permanecem versionadas e não foram alteradas:

- [Desktop](../../homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo/aprovado-estoque-salgados-desktop.png) — SHA-256 `b2f28d215336be0e7da380483bd9f43523c838e6341e7c660dd3fb7f0706939a`.
- [Celular](../../homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo/aprovado-estoque-salgados-celular.png) — SHA-256 `e8ad47852dfc64b60bc5649ed8ff00ed11f73f794747d40c91bc572d35e8c0f2`.

As capturas foram geradas nas iterações anteriores de restauração e revisão; a conferência manual definitiva foi feita no endereço oficial servindo o commit `07b96de`. Detalhes, limites e correlação com os commits funcionais estão em [aprovacao-visual-estoque-salgados.md](../../estoques/aprovacao-visual-estoque-salgados.md).

## Relação com o cadastro de 26 sabores

O catálogo local passou a 26 sabores: Fritos 9, Mini Pastéis 4, Assados 8, Empadas 2 e Mini Pizzas 3. Os dois novos sabores, `Trouxinha de calabresa` e `Enroladinho de salsicha`, foram acrescentados ao fim da ordem existente, com ordens 25 e 26. Essa preparação é posterior à aprovação visual e **não** altera as capturas aprovadas. O cadastro foi aplicado em homologação com autorização específica e verificações registradas em [aplicacao-cadastro-oficial-26.md](../../estoques/aplicacao-cadastro-oficial-26.md), sem vínculos automáticos, saldos ou movimentações. A versão atualizada foi publicada no mesmo alias oficial no commit `9f18b364a2246b5b9d988e1c43c0172d2ea398c7`, deployment `dpl_24HZPn5hnmoorUJgjNuvzgmT4xkw`, sem alterar menu, layout, checkpoints anteriores ou Production; a conferência manual do proprietário permanece pendente para esta publicação.

## Checkpoint

Checkpoint versionado: tag anotada `checkpoint-estoque-salgados-visual-01`, criada sobre o commit de registro desta aprovação. A tag `checkpoint-menu-lateral-01` e o menu aprovado foram preservados.

## Regras de alteração

Qualquer alteração visual neste módulo exige autorização expressa do proprietário, nova conferência manual, atualização desta documentação e novo checkpoint. O cadastro dos 26 sabores foi executado em homologação e a organização da sequência foi autorizada, aplicada e registrada em [organizacao-sequencia-sabores.md](../../estoques/organizacao-sequencia-sabores.md), preservando menu, layout e checkpoints anteriores. A versão foi publicada no mesmo alias oficial no commit `6cc0cacdef75ee9b51b85be94128de2562bcb658`, deployment `dpl_B4hKmBtpke61FMfknMGXitu8M6ow`, sem alterar Production; a conferência manual do proprietário permanece pendente para esta publicação. Vinculação comercial, movimentação por lote, relatórios, impressões, cardápio público e produção continuam dependendo de etapas e autorizações próprias. Uma demonstração ou captura local não caracteriza aprovação operacional.
