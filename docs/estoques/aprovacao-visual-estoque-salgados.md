# Estoque de Salgados — registro de aprovação visual

Data: 26/11/2026<br>
Status: **visual aprovado; operacional pendente**.

O proprietário conferiu manualmente o Estoque de Salgados no endereço oficial de homologação e aprovou o layout exibido:

<https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#estoque-salgados>

Esta aprovação é somente visual. Ela não autoriza banco de dados, cadastro de sabores, vínculo com produtos comerciais, preços, saldos, lotes, reservas, movimentações, produção, migrations nem nova publicação.

## Versões correlatas

| Item | Commit / referência |
| --- | --- |
| Referência visual original preservada | `1dc0e0d0c0ddd7c008628f473d33799136d689e2` |
| Base operacional do E01 | `3307c87` |
| Restauração do layout aprovado no E01 | `02ce53f21f7e35607fa4e65a7f3d81ac69f3f2cc` |
| Base funcional revisada antes da aprovação | `92260acc22c7e10c65c3761c941abc800882b212` |
| Versão publicada e conferida no alias | `07b96de69afb52cba9c22005ba2ca209aa3c2c96` |
| Deployment servido no alias na conferência | `erp-neia-salgados-dwdd6uq3m-luiz988061337-3147s-projects.vercel.app` |

A base `92260ac` revisou janelas, indicadores, cadastro e segurança das operações. A versão `07b96de` aplicou a identidade definitiva do menu lateral compartilhado, preservada e aprovada em checkpoint separado. Nenhuma dessas versões executou escrita remota em banco.

## Evidências

- [E01 — restauração do layout](../homologacao/resgate-h01-h07/2026-11-25-E01-ESTOQUE-SALGADOS.md)
- [Revisão integral para homologação](revisao-integral-salgados.md)
- [Captura aprovada — desktop](../homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo/aprovado-estoque-salgados-desktop.png) — SHA-256 `b2f28d215336be0e7da380483bd9f43523c838e6341e7c660dd3fb7f0706939a`
- [Captura aprovada — celular](../homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo/aprovado-estoque-salgados-celular.png) — SHA-256 `e8ad47852dfc64b60bc5649ed8ff00ed11f73f794747d40c91bc572d35e8c0f2`

As capturas são evidência de referência do layout aprovado e não foram modificadas. O registro oficial da aprovação, com escopo e regras de alteração, está em [`docs/projeto-diretor/estoque-salgados/status.md`](../projeto-diretor/estoque-salgados/status.md).

## Escopo visual aprovado

- Cabeçalho, busca, indicadores e alertas operacionais.
- Grupos Fritos, Mini Pastéis, Assados, Empadas e Mini Pizzas na ordem aprovada.
- Janelas de detalhes e ações com contraste legível, fundo grafite e botões amarelos do padrão administrativo.
- Comportamento responsivo em celular, com rolagem horizontal da tabela sem transbordamento da página.
- Menu lateral compartilhado `AdminShell`/`MenuLateral`, preservado do checkpoint aprovado.

Não houve alteração visual adicional nesta etapa de registro.

## Limites da aprovação

A aprovação visual não cobre:

- a ampliação local do catálogo para 26 sabores;
- a criação da tabela `public.sabores_estoque` em homologação;
- vínculos entre sabores e os 31 produtos comerciais preservados;
- conversão de saldos legados em estoque físico;
- criação de quantidades, preços, custos, lotes ou mínimos;
- operações de entrada, reserva, retirada, perda, inventário ou impressão;
- alteração em produção;
- publicação de novo deployment.

O cadastro de 26 sabores e o plano de aplicação em homologação estão descritos em [cadastro-oficial-salgados-26.md](cadastro-oficial-salgados-26.md). A execução remota depende de autorização específica e do cumprimento da barreira P0 de ambientes.

## Checkpoint

Tag anotada: `checkpoint-estoque-salgados-visual-01`, sobre o commit de registro. O checkpoint `checkpoint-menu-lateral-01` foi preservado.
