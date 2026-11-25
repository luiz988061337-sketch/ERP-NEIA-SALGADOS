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
| Oportunidade de reativação | Comercial | Fato | Normal | Clientes sem compra há 60–89 dias e sem opt-out | Revisar lista elegível |
| Campanhas prontas | Comercial | Fato | Baixa | Campanha com status pronta | Revisar público e mensagem |

## Dados insuficientes e duplicidade

- Regra sem dado obrigatório não é avaliada e não gera alerta.
- A tela informa quais fontes estão indisponíveis na consulta.
- Quando nenhuma fonte responde, o módulo declara ausência de dados e não
  conclui nada.
- As recomendações são consolidadas por identificador; não há alerta repetido
  para o mesmo fato.
- Não há dado fictício no código operacional: sem leitura real, o alerta
  correspondente simplesmente não aparece.

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
- Novas migrations, novas tabelas, APIs pagas ou modelos externos.
- Alteração de Production, da branch `main` ou do banco de produção.
