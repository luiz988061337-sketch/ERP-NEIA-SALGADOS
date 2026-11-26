# A02.1 — Néia Inteligência / Monitoramento Preventivo

Data: 25/11/2026
Branch: `resgate-visual-h01-h07-codex`
Ambiente: homologação `lflzlcqinarrcgncafol`, `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao`
Endereço fixo: `https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app`

## Objetivo

Transformar os alertas do Dashboard A01 em um módulo administrativo de
monitoramento preventivo, sem reconstruir o Dashboard e sem executar compras,
pagamentos, campanhas ou tarefas automaticamente.

## Escopo entregue

1. Item **Néia Inteligência** no grupo Gestão do menu administrativo.
2. Aba `#neia-inteligencia` com três seções:
   - **Monitoramento preventivo** (implementado nesta etapa).
   - **Previsões e cenários (A02.2)** — informa que a etapa não foi autorizada;
     nenhum cenário é calculado ou simulado.
   - **Consulta inteligente (A02.3)** — informa que a etapa não foi autorizada;
     nenhuma resposta em linguagem natural é simulada.
3. Botão **Consultar Néia Inteligência** do Dashboard ativo, apontando para a
   aba do módulo.
4. Motor único de regras (`src/lib/neia-inteligencia.ts`) consumido pelo
   Dashboard e pela tela dedicada, para que os alertas não divirjam.

## Reuso da A01

- `src/lib/dashboard-a01.ts`: períodos, vendas, margem, carga de cozinha,
  clientes e vínculo pedido/status.
- `src/lib/dashboard-a01-dados.ts`: consultas paginadas, financeiro e realtime.
- `src/lib/dashboard-a01-estoque.ts`: saldos, reservas, validade e reposição.
- `src/lib/tarefas-a01.ts`: modelo, permissões e fluxo de tarefas.
- `src/components/admin/tarefas-a01.tsx`: formulário de sugestão/aprovação.
- `src/components/admin/dashboard-a01.css`: identidade visual preta/grafite com
  dourado; a A02 acrescenta apenas estilos escopados em `.neia-a02`.

O Dashboard mantém o conjunto de alertas aprovado na A01 (`escopo: "a01"` no
motor). A tela A02.1 usa o escopo completo, que acrescenta acompanhamentos
preventivos de resultado, tempo de entrega e campanhas prontas.

## Fontes monitoradas

| Área | Dados usados |
| --- | --- |
| Estoque | Lotes ativos, reservas, consumos, mínimo por sabor e validade |
| Produção | Fila ativa, tempos de preparo, pedidos agendados e sinalização de atraso |
| Entregas | Pedidos aguardando coleta, motoboys disponíveis e tempos de saída/entrega |
| Financeiro | Contas a pagar, despesas pagas, margem por pedido e custos cadastrados |
| Comercial | Faturamento atual/anterior, CRM (reativação e opt-out) e campanhas prontas |

Cada área é lida em consultas paginadas já existentes, com atualização por
intervalo e realtime de pedidos herdados da A01.

## Estrutura de cada recomendação

Toda recomendação gerada contém:

- categoria (Estoque, Produção, Entregas, Financeiro ou Comercial);
- prioridade (Crítica, Alta, Normal ou Baixa);
- natureza (Fato, Estimativa ou Previsão);
- título e motivo objetivo;
- dados utilizados;
- data/hora de atualização em São Paulo;
- ação sugerida;
- link do módulo correspondente;
- opção **Sugerir tarefa**.

## Regras preventivas

| Regra | Categoria | Natureza | Prioridade | Condição | Ação sugerida |
| --- | --- | --- | --- | --- | --- |
| Vendas em alta/queda | Comercial | Fato | Baixa/Alta | Variação de faturamento contra o período anterior | Acompanhar ritmo ou revisar mix e preços |
| Revisar estoque | Estoque | Fato | Crítica/Alta | Sabor abaixo do mínimo, vencendo ou vencido | Conferir lotes e registrar reposição |
| Risco nos agendados | Produção | Previsão | Alta | Prazo agendado dentro do tempo estimado da fila | Reordenar o preparo |
| Pedidos em atraso | Produção | Fato | Crítica | Pedido ativo sinalizado com atraso | Priorizar conclusão e avisar o cliente |
| Organizar próxima saída | Entregas | Fato | Alta | Pedidos aguardando coleta e nenhum motoboy disponível | Conferir equipe e endereços |
| Tempo de entrega acima do usual | Entregas | Estimativa | Normal | Média acima de 60 min com fila pendente | Revisar rotas e ordem de coleta |
| Conferir contas vencidas | Financeiro | Fato | Crítica | Saldo pendente em contas vencidas | Programar pagamento com o responsável |
| Resultado do período negativo | Financeiro | Fato | Alta | Lucro estimado negativo | Revisar despesas e preços |
| Completar cadastro de custos | Financeiro | Estimativa | Normal | Pedidos sem todos os custos registrados | Completar custo dos produtos |
| Oportunidade de reativação | Comercial | Fato | Normal | Clientes sem compra há 30–59, 60–89 ou 90+ dias, sem opt-out | Revisar lista elegível |
| Campanhas prontas | Comercial | Fato | Baixa | Campanha com status pronta | Revisar público e mensagem |
| Sabores sem estoque cadastrado | Estoque | Fato | Alta | Sabor sem nenhum lote físico registrado | Registrar o primeiro lote ou confirmar fora de linha |
| Estoque físico zerado | Estoque | Fato | Crítica | Sabor com lote cadastrado e saldo físico zero | Repor ou pausar a venda do sabor |
| Reserva acima do estoque físico | Estoque | Fato | Crítica | Reservas ativas maiores que o saldo físico | Conferir reservas e estoque |
| Definir estoque mínimo | Estoque | Fato | Normal | Sabor sem estoque mínimo cadastrado | Definir o mínimo operacional |
| Contas próximas do vencimento | Financeiro | Previsão | Normal | Contas a pagar vencendo nos próximos 7 dias | Programar pagamentos antes do vencimento |
| Recebimentos atrasados | Financeiro | Fato | Alta | Contas a receber já vencidas | Cobrar os valores em atraso |
| Entregas em atraso | Entregas | Fato | Crítica | Atraso de entrega registrado e não resolvido | Conferir o pedido e avisar o cliente |

## Dados insuficientes e duplicidade

- Regra sem dado obrigatório não é avaliada e não gera alerta.
- A tela informa a situação de cada fonte com cor própria:
  - **Dados suficientes** (verde) — leitura completa;
  - **Dados parciais** (ouro) — leitura com lacunas (ex.: sabor sem mínimo,
    carga da cozinha incompleta, CRM ou campanhas indisponíveis);
  - **Sem registros** (azul) — a consulta respondeu, mas não há registros;
  - **Falha na consulta** (vermelho) — a leitura não foi concluída.
- Ausência de registros e falha de consulta nunca são tratadas como operação
  normal; quando todas as fontes estão nesses estados, o módulo declara
  ausência de dados e não conclui nada.
- As recomendações são consolidadas por identificador; não há alerta repetido
  para o mesmo fato.
- Não há dado fictício no código operacional: sem leitura real, o alerta
  correspondente simplesmente não aparece.

## Ajustes A02.1.1 (26/11/2026)

1. **Estoque por sabor**: o motor recebe o saldo de cada sabor e separa
   ausência de cadastro (nunca teve lote) de estoque zerado (lote cadastrado,
   saldo zero), além de apontar sabores sem mínimo e reservas acima do físico.
2. **Situação das fontes**: `ResultadoNeia.fontes` passa a carregar a situação
   completa (suficiente, parcial, sem registros, falha) informada pela tela,
   que distingue erro de consulta de ausência de registros.
3. **Reativação em três faixas**: 30–59, 60–89 e 90+ dias, sempre respeitando
   o opt-out do CRM; a elegibilidade continua sendo conferida antes do envio.
4. **Variação de vendas 0%**: é apresentada como "Vendas estáveis" (prioridade
   baixa, tom azul) e nunca como queda.
5. **Financeiro completo**: contas a pagar próximas do vencimento (7 dias),
   recebimentos atrasados e, quando houver dados, entregas com atraso
   registrado e não resolvido.
6. **Abrir recomendação**: cada cartão abre em detalhe sob demanda; o link do
   módulo e o botão **Sugerir tarefa** ficam dentro do detalhe, e a criação da
   tarefa continua dependendo da confirmação no formulário da A01.
7. **Menu lateral e identidade**: o item Néia Inteligência permanece no grupo
   Gestão do menu compartilhado com a A01, sem alteração de estrutura; a paleta
   grafite/dourado e os estilos escopados `.neia-a02` são mantidos.
8. O Dashboard A01 continua com `escopo: "a01"`: recebe as correções de
   regra (0% neutro, faixas de reativação) sem receber os novos alertas da
   A02.1.1.

## A02.1.2 — Gerenciamento de recomendações preventivas e tarefas (26/11/2026)

### Objetivo

Dar ciclo de vida às recomendações (pendente, ciente, adiada, com tarefa,
resolvida, dispensada) e completar o gerenciamento das tarefas com exclusão
lógica, lixeira, restauração e reabertura. A decisão administrativa passa a
ficar registrada no servidor, com responsável, data, hora e motivo.

### Situações da recomendação

| Situação | Efeito |
| --- | --- |
| Pendente | Alerta aberto, aguardando decisão |
| Ciente | Administrador registrou ciência; continua visível |
| Adiada | some até o prazo; ao vencer, volta a ser pendente |
| Com tarefa | Existe tarefa ativa vinculada à ocorrência |
| Resolvida | A leitura atual deixou de confirmar o alerta |
| Dispensada | Decisão administrativa com motivo; vale por 7 dias |

Ações disponíveis no detalhe: **Marcar ciente**, **Adiar** (1h, 3h, amanhã,
7 dias ou data/hora), **Dispensar** (motivo obrigatório) e **Histórico**.

### Filtros

- Setor/categoria e período (1/7/30 dias) continuam independentes.
- Filtro de situação: pendentes, cientes, adiadas, com tarefa, resolvidas e
  dispensadas.

### Recorrência e resolução automática

- Problema que volta depois de resolvido gera **nova ocorrência**.
- Dispensa vencida (7 dias) ou prioridade mais grave **reativam** o alerta.
- A resolução automática só ocorre quando o alerta deixa de aparecer em duas
  leituras seguidas do mesmo período **e** a fonte está com dados suficientes.
  Sem registros, dados parciais ou falha de consulta nunca resolvem.
- Concluir ou excluir uma tarefa **não** resolve nem dispensa a recomendação.

### Gestão de tarefas

- **Excluir** (administrador): exige motivo e confirmação; registro vai para a
  **Lixeira** com data, responsável e motivo; histórico preservado.
- **Restaurar** (administrador): devolve a tarefa às listas ativas com os dados
  originais.
- **Reabrir**: tarefa concluída volta ao estado pendente; a conclusão anterior
  fica no histórico.
- Vínculo com a recomendação (recomendação, chave e ocorrência) impede duas
  tarefas ativas da mesma ocorrência, inclusive em solicitações simultâneas.

### Dashboard A01

- Layout e escopo `a01` preservados.
- O resumo passa a respeitar as situações: alertas resolvidos ou dispensados
  não aparecem; os demais exibem a situação atual.

### Auditoria e permissões

- `a02_recomendacoes_historico` é somente leitura para o aplicativo; a gravação
  ocorre apenas pela trigger do banco, com responsável, data/hora e detalhe.
- Leitura e gestão das recomendações: apenas `admin`.
- Exclusão e restauração de tarefas: apenas `admin`; demais ações seguem a A01.
- Nenhuma decisão é guardada em `localStorage`/`sessionStorage`.

## Tarefas

- **Sugerir tarefa** abre o formulário da A01 já preenchido com título e
  descrição da recomendação.
- A tarefa só é criada após confirmação explícita do administrador.
- A origem fica registrada como `inteligencia`.
- Nenhuma tarefa, compra, pagamento, campanha ou alteração de estoque é
  executada automaticamente pelo motor.

## Permissões

- A aba só é renderizada no bloco administrativo autenticado (`isAdmin`).
- As consultas usam o cliente Supabase com a sessão do usuário; a RLS existente
  continua sendo a autoridade.
- Dados financeiros não são expostos fora da área administrativa.
- O link do Dashboard usa a mesma sessão; sem permissão, o ERP mantém o bloqueio
  já existente.

## Fora do escopo desta etapa

- A02.2 Previsões e cenários.
- A02.3 Consulta inteligente em linguagem natural.
- APIs pagas ou modelos externos.
- Alteração de Production, da branch `main` ou do banco de produção.
- Compras, pagamentos, campanhas ou movimentações automáticas.

> Nota: a A02.1.2 introduce as migrations `0126` (recomendações) e `0127`
> (tarefas), aplicadas somente em homologação conforme autorização do
> proprietário. A linha "Novas migrations, novas tabelas" da versão anterior
> desta especificação foi superada por essa etapa autorizada.
