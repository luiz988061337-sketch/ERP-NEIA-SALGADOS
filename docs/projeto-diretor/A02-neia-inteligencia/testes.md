# A02.1 — Registro de testes

Data: 25/11/2026
Ambiente local: Windows, Node do projeto, Supabase de homologação
`lflzlcqinarrcgncafol`, `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao`.

## Regras e integração

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
- Nenhuma migration foi criada ou aplicada.
- Nenhum dado real foi gravado, alterado ou removido durante os testes.
- Nenhum teste tocou Production, `main` ou o banco de produção.

## Conferência sugerida no endereço fixo

1. Entrar com a conta administrativa de homologação e abrir o Dashboard.
2. Acionar **Consultar Néia Inteligência** e confirmar a abertura da aba.
3. Alternar Hoje, 7 e 30 dias e filtrar por categoria.
4. Conferir em cada cartão: natureza, prioridade, motivo, dados utilizados,
   atualização, ação e link do módulo.
5. Acionar **Sugerir tarefa**, revisar o formulário e confirmar a criação.
   Verificar a origem “inteligência” e o registro no histórico.
6. Abrir as seções A02.2 e A02.3 e confirmar o aviso de etapa não autorizada.
7. Conferir responsividade em computador, tablet e celular.
