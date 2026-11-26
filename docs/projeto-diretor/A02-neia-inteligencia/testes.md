# A02.1 — Registro de testes

Data: 26/11/2026 (atualização A02.1.2)
Ambiente local: Windows, Node do projeto, Supabase de homologação
`lflzlcqinarrcgncafol`, `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao`.

## A02.1.2 — Permissões e comportamento no banco (26/11/2026)

| Verificação | Resultado |
| --- | --- |
| `supabase db query --linked -f docs/projeto-diretor/A02-neia-inteligencia/recomendacoes-tarefas-rls.test.sql` | Passou. Cobriu: `anon` sem leitura, equipe sem `admin` sem leitura/escrita, cliente sem acesso, registro com histórico, ciência, adiamento, limite de 24 horas para crítico, dispensa com motivo, resolução, reabertura, histórico somente leitura, anti-duplicidade de tarefa, conclusão que não resolve a recomendação, exclusão com motivo, lixeira, restauração, tarefa concluída excluída/restaurada e bloqueio de exclusão por quem não é administrador. Todos os dados do teste foram revertidos. |
| `supabase db query --linked -f docs/projeto-diretor/A01-dashboard/tarefas-rls.test.sql` | Passou (regressão A01 preservada após a migration 0127). |
| `node --test scripts/neia-recomendacoes-estado.test.mjs` | Passou. 14 testes: adiamento vencido, ciência/dispensa/resolução, decisão de ocorrência, expiração da dispensa em 7 dias, resolução automática exigindo fonte suficiente, filtro por situação, limite de 24 horas do crítico e motivo obrigatório. |
| `node --test scripts/neia-inteligencia.test.mjs scripts/dashboard-a01.test.mjs` | Passou. 26 testes (A02.1, A02.1.1, A02.1.2 e regressão A01). |
| `npm run typecheck` | Passou sem erros. |
| `npx eslint` nos arquivos da etapa | Sem erros (resta 1 aviso preexistente em `dashboard-a01.tsx`). |
| `npm run build` (variáveis de homologação) | Passou; bundle sem qualquer referência a `ruioyioynwwwiqbjznoa`. |

## Regras e integração (A02.1/A02.1.1)

| Verificação | Resultado |
| --- | --- |
| `node --test scripts/neia-inteligencia.test.mjs` | Passou. 9 testes: ausência total de dados, campos obrigatórios de cada recomendação, separação fato/estimativa/previsão, ordenação e ausência de duplicidade, dados zerados sem alerta, escopo aprovado da A01, regra de vendas, navegação administrativa e ausência de gravação no motor. |
| `node --test scripts/dashboard-a01.test.mjs` | Passou. Regressão A01: 9 cenários de estoque, datas, status, margem, cozinha, CRM e ledger. |
| `npm run typecheck` | Passou sem erros. |
| `npm run build` | Passou em modo de homologação, com o guarda de ambiente ativo. |
| `npx eslint` nos arquivos novos | Sem erros de tipo ou hooks; restam apenas avisos/formatadores preexistentes em arquivos antigos. |

## Cenários cobertos

1. **Sem dados**: nenhuma fonte disponível → zero recomendações, aviso explícito,
   nada é concluído por suposição.
2. **Dados completos**: recomendações nas cinco categorias, com prioridade,
   natureza, motivo, dados utilizados, atualização, ação e destino.
3. **Fatos x estimativas x previsões**: estoque e atrasos como fato, custos como
   estimativa, risco de agendados como previsão.
4. **Dados zerados**: contadores em zero não geram alerta.
5. **Duplicidade**: identificadores únicos e ordenação estável por prioridade.
6. **Escopo A01**: Dashboard recebe somente o conjunto aprovado; a tela A02.1
   recebe o conjunto completo.
7. **Navegação**: `#neia-inteligencia` é aba administrativa válida e o item
   existe no menu e no `TabsContent`.
8. **Tarefas**: o motor não grava nada; a sugestão só abre o formulário e a
   criação depende de confirmação na interface.

## Limites desta execução

- Não havia sessão autenticada disponível para conferência visual no endereço
  fixo. A validação autenticada (login, permissões reais e criação de tarefa)
  permanece pendente e deve ser feita pelo proprietário.
- Na A02.1/A02.1.1 nenhuma migration foi criada ou aplicada; na A02.1.2 as
  migrations 0125, 0126 e 0127 foram aplicadas **somente** em homologação.
- Nenhum dado real de operação foi gravado, alterado ou removido durante os
  testes: o teste SQL cria e reverte os próprios registros de teste.
- Nenhum teste tocou Production, `main` ou o banco de produção.

## Conferência sugerida no endereço fixo (A02.1.2)

1. Entrar com a conta administrativa de homologação e abrir a aba
   **Néia Inteligência**.
2. Conferir que cada recomendação mostra a situação e o filtro de situação
   (pendentes, cientes, adiadas, com tarefa, resolvidas, dispensadas).
3. **Marcar ciente** uma recomendação e conferir o registro no histórico.
4. **Adiar** com 1 hora e com "Amanhã"; em um alerta crítico, confirmar que os
   prazos acima de 24 horas ficam bloqueados e sinalizados.
5. **Dispensar** com motivo e conferir o motivo exibido no cartão.
6. **Sugerir tarefa**, confirmar a criação e conferir que o cartão passa a
   indicar "Tarefa vinculada"; tentar de novo e conferir a recusa de duplicidade.
7. Em **Minhas tarefas**: **Excluir** com motivo, conferir a aba **Lixeira**,
   **Restaurar** e **Reabrir** uma tarefa concluída; conferir o histórico.
8. Alterar o período (1/7/30 dias) e conferir que os filtros de setor e
   situação continuam combinados.
9. Abrir o Dashboard e conferir que o resumo da Néia Inteligência respeita as
   situações (recomendações resolvidas/dispensadas não aparecem).
10. Recarregar a página (F5) e conferir que as decisões permanecem.
