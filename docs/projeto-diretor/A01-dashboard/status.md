# A01 — Estado da implementação

| Item | Estado |
| --- | --- |
| Base da implementação | Checkpoint local 617d96fb35687b302f114f1e2b991e98f6f47201, com arquivos conferidos contra a publicação já em uso. |
| Dashboard operacional | Publicado com o commit ef1b0434a779a7c891b5d2c5d7ea6a3b15c0f4b4 e conferido em sessão autenticada. Indicadores, filtros, busca, notificações, atalhos, recomendações e estados de erro. |
| Checkpoint do GitHub | 0ff3d6aae49809bd3d3eea92f7470457679a0c82 preserva a base publicada anteriormente. |
| Migration de tarefas | Versionada em 9ba46eb75a323745a9e4facc993213c6589e0ad3. Aplicada no projeto lflzlcqinarrcgncafol na versão remota 20261125162414, após teste local. Teste RLS também aprovado em homologação. |
| Referência visual | [referencia-visual.png](referencia-visual.png), 1.672 × 941 px. Cópia do PNG fornecido pelo proprietário, com SHA-256 `2cbc053d0af8c93c24153ea414b80d58a0656ad28bd77515d06b30049f83b216`. |
| A02 | Consulta interativa da Néia Inteligência depende da próxima etapa. |
| Limitações de dados | Utilização de equipamentos e equipe por turno exigem registro próprio. O Comercial informa campanhas no estado existente “Pronta”. |
| Aprovação | Aguardando homologação do proprietário. |

## Publicação em 25/11/2026

- [Dashboard no endereço fixo de homologação](https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#dashboard).
- Projeto erp-neia-salgados, deployment dpl_F4MpNXiWV7WBj9yn6NUJrb5MfSux, estado READY.
- A conferência do destino confirmou o banco lflzlcqinarrcgncafol e as variáveis VITE_DEMO_PREVIEW=0 e NEIA_AMBIENTE=homologacao.
- O destino de publicação foi Preview. Histórico da branch e arquivos de produção foram preservados.

## Arquivos da A01

- `src/routes/admin.tsx` integra o Dashboard e o painel restrito de tarefas.
- `src/components/admin/dashboard-a01.tsx`, `dashboard-a01.css` e `tarefas-a01.tsx` compõem a interface operacional.
- `src/lib/dashboard-a01.ts`, `dashboard-a01-dados.ts`, `financeiro.ts` e `tarefas-a01.ts` tratam cálculos, leitura de dados e ações autorizadas.
- `drizzle/migrations/0125_a01_tarefas_administrativas.sql` versiona a estrutura de tarefas. `scripts/dashboard-a01.test.mjs` e `tarefas-rls.test.sql` registram os cenários de teste.

A base de teste consultada estava sem pedidos operacionais, lotes ativos e caixa em aberto. Testes cobriram os cálculos e usaram transações revertidas para as permissões de tarefas.
