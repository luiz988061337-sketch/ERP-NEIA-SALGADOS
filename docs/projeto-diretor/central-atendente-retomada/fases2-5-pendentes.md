# Fases 2–5 — pendências registradas, sem autorização nesta rodada

Data: 27/11/2026  
Branch isolada: `central-atendente-retomada-opencode`  
Referência: diagnóstico operacional entregue ao proprietário e
[status H02](../../projeto-diretor/H02-central-pedidos/status.md).

A numeração abaixo consolida o diagnóstico entregue. Se o proprietário definir
outra divisão, este registro será ajustado **antes** de qualquer implementação.
Nesta rodada nada foi implementado, aplicado em banco remoto ou publicado para
estas fases. A [Fase 1](fase1-forma-efetiva.md) foi concluída localmente e
também aguarda autorização para aplicação/deploy.

## Fase 2 — Fluxos existentes, mas incompletos

Classificação: **Existente, mas incompleta**.

| Item | Situação constatada | O que exigiria autorização |
| --- | --- | --- |
| Cancelamento | H02 oferece cancelar, mas `0093_cancelar_pedido_atomico.sql` está marcada como proposta/não aplicada e a RPC devolve `requer_analise`. | Aplicar/ajustar migration, definir regras de estorno e liberar flag, com testes PG17 e homologação. |
| Edição operacional | Somente observações são editáveis (0140/0142); itens, valores, prazos e entrega permanecem bloqueados. Integração comercial/estoque existe apenas como contrato `docs/estoques/contrato-edicao-pedidos-estoque.md`. | Decisão sobre escopo, autoria e reconciliação com estoque antes de qualquer migration. |
| Estornos e correções | Ledger registra estorno e há proteção da 0094, mas não há fluxo completo de correção de lançamento já quitado. | Regras de estorno parcial/total, motivo e aprovação; testes de idempotência. |
| Reimpressão | `solicitar_reimpressao` existe na 0084, mas o helper está atrás de `VITE_FF_IMPRESSAO_ETAPA` (default off) e não há chamada na UI. | Ativação explícita da flag, UI com motivo e homologação com impressora física. |
| Contato e problemas operacionais | Dados e atalhos existem, Sem fluxo padronizado de acompanhamento/resolução. | Definição de estados, responsáveis e registro de evidências. |
| Histórico e detalhamento | Aba Pagamento/Histórico lê o ledger; informações antigas sem forma efetiva/troco são exibidas como “não registrado”. | Nenhuma alteração de dados históricos: inventar valores é proibido. |

Não alterar a 0094, a 0136, a quitação da balcão nem o ledger existente sem
decisão expressa e ensaio isolado.

## Fase 3 — Regras comerciais/financeiras não implementadas

Classificação: **Não implementada**.

- Alteração da forma efetiva **depois** do recebimento registrado: exigiria
  estorno/correção auditada; não pode ser feita por edição silenciosa do ledger.
- Renegociação de prazo e alteração de agendamento com aprovação: hoje há
  proteção de prazo comercial (`pedido_preservar_prazo_comercial`), mas sem
  fluxo de renegociação.
- Cliente que não comparece: sem consumo/reserva ou reagendamento padronizado.
- Alteração de quantidades e sabores após aceite: bloqueada pelas guardas de
  estoque e pelo contrato de edição; depende de reconciliação de reserva FEFO.

Todas essas regras mudam critérios financeiros/comerciais aprovados. Portanto
**dependem de autorização expressa do proprietário**, especificação escrita,
migration própria, testes PG17 e homologação antes de qualquer código.

## Fase 4 — Dependências de outros módulos

Classificação: **Dependente de outro módulo**.

- Entrega não concluída (motoboy/rota, retorno, acerto e GPS) pertence ao fluxo
  do App Motoboy e às migrations 0108–0123; não deve ser reimplementada na
  Central nem na H02.
- Estoque/reserva FEFO e vínculos de sabores/lotes pertencem à frente isolada
  `estoque-operacional-vinculos` @ `ffd6265`; integração só após conferência da
  base e coordenação de numeração de migrations.
- Cancelamento atômico e reimpressão dependem das frentes Comercial/Impressão,
  respectivamente, conforme responsabilidades do protocolo.

Nenhuma worktree deve editar simultaneamente os mesmos arquivos nem integrar
mudanças entre frentes sem autorização.

## Fase 5 — Homologação operacional e publicação

Classificação: **Bloqueada por autorização e perfil de teste**.

- Homologação não possui perfil `atendente`; apenas a conta administrativa
  autorizada recebeu `receber_pagamento`. Não foi criado usuário, papel ou
  capacidade adicional, e a RLS do ledger não foi ampliada.
- Não foram executados testes manuais com pedido real, nem conferência visual
  após a Fase 1. Automatização e mocks **não** caracterizam aprovação operacional.
- A aplicação de `0142` e a publicação do front dependem de autorização, janela
  combinada, reconciliação de histórico, testes de regressão e conferência manual
  no alias oficial:
  <https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app>.
- Produção `ruioyioynwwwiqbjznoa` continua somente leitura; qualquer alteração
  depende de autorização expressa, janela combinada e registro documental.

## Estado atual do isolamento

- Branch isolada: `central-atendente-retomada-opencode`, checkpoint local
  `checkpoint-central-fase1-forma-efetiva-local-01`, com a Fase 1 commitada
  localmente e **sem push**.
- Branch oficial: `resgate-visual-h01-h07-codex` @ `ba684a2`, sem integração
  desta rodada.
- Nenhum force push, `reset --hard`, `clean` ou `stash` foi usado.
