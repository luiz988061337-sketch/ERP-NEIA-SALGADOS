# A01 — Registro de testes

| Verificação | Resultado |
| --- | --- |
| node --test scripts/dashboard-a01.test.mjs | Passou. Sete cenários de cálculos, datas, status, custos, cozinha, CRM e ledger. |
| npm run typecheck e npm run build | Passaram com o ambiente de homologação e modo demo desligado. |
| Interface operacional no Edge | Passou em 390, 820 e 1.672 px. Incluiu filtros, navegação, alertas, criação de tarefa, acesso da equipe e redirecionamento de usuário sem sessão. A execução interceptou chamadas para manter os dados de teste fora do banco. |
| npm run teste:guard | 41 testes passaram, incluindo o bloqueio dos destinos de produção. |
| npm run teste:central | Passou. Filtros, status, alerta e aceite. |
| npm run teste:producao | Passou. Aviso ao caixa, retirada e fluxos de liberação. |
| node scripts/competencia.test.mjs | Passou. Limites mensais de São Paulo e DRE. |
| tarefas-rls.test.sql | Passou no PostgreSQL 17 local e no Supabase lflzlcqinarrcgncafol. |
| Dados de homologação | Consultas autorizadas verificaram fontes e permissões. A base consultada estava sem pedidos, lotes ativos e sessão de caixa. Cenários com valores foram cobertos pelos testes de cálculo. |
| Preservação do alias | O checkpoint local reconcilia arquivos de fonte com os SHA-1 do deployment anterior. |

## Permissões das tarefas

O teste SQL alterna os papéis anon e authenticated com contas de teste e termina em ROLLBACK. A consulta posterior confirmou zero usuários de teste remanescentes e zero tarefas ou históricos de teste. Verifica leitura privada e compartilhada, criação e atribuição pelo admin, edição e conclusão pelo responsável, tentativa de edição por terceiro, tentativa de aprovação em nome de outro, atribuição inválida, concorrência por versão e proteção da auditoria.

## Conferência do proprietário

1. Entrar com a conta de homologação e abrir o Dashboard no endereço fixo.
2. Alternar Hoje, 7 dias, 30 dias e Período. Selecionar um grupo de pedidos e verificar o filtro aplicado.
3. Abrir os atalhos de estoque, produção, entregas, mapa, financeiro, comercial e PDV.
4. Criar uma tarefa individual e outra compartilhada. Atribuir uma tarefa a um usuário de equipe autorizado e conferir a visão em /admin#minhas-tarefas.
5. Definir prazo vencido, conferir o alerta do responsável, editar a prioridade, concluir a tarefa e abrir o histórico.
6. Conferir a responsividade em computador, tablet e celular.
