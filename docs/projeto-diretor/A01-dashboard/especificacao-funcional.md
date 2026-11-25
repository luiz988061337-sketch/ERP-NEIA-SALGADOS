# A01 — Dashboard administrativo da Néia Salgados

O Dashboard operacional integra o Admin existente em /admin#dashboard. Usa o menu da Administração, superfícies grafite e douradas, fontes legíveis e áreas que se reorganizam em larguras menores. As fotos de estoque vêm do cadastro de produtos. A referência oficial é o anexo original da etapa, com 1.672 × 941 pixels e valores ilustrativos.

## Indicadores e fontes

| Área | Fonte e critério |
| --- | --- |
| Período | Hoje, 7 dias, 30 dias ou intervalo de até 366 dias. Datas de São Paulo. Comparação com a faixa imediatamente anterior de igual duração. |
| Faturamento, pedidos e ticket | Pedidos criados no intervalo, excluídos os cancelados. Receita é o total registrado do pedido. Ticket divide receita por pedidos válidos. Comparativo percentual requer base anterior positiva. |
| Gráfico | Agrupamento por hora em um dia e por dia em intervalos maiores. Clique ou use o seletor para listar os pedidos da faixa. Destaque do maior volume de pedidos. |
| Status | Novos e aceitos se distinguem pela data de aceite. Em produção, prontos, em entrega, concluídos e cancelados são estados exclusivos. Atraso e agendamento são sinalizações. Agendados seguem a data programada. Os demais grupos seguem a data de criação. Os links mantêm o filtro na Central de Pedidos. |
| Produção | Fila atual com agendados até 90 min, médias de preparo a partir de eventos e estimativa por tipos de preparo. Ciclos de 50 por pedido, fritura 3,5 min, pastéis 2 min, assados 10 min, drenagem e embalagem. A estimativa usa capacidade nominal de 800 por fornada e a regra de 1 a 3 fritadeiras. Antecedência sobre a carga da fila sinaliza risco em agendados. Medição de equipamento e presença por turno dependem de registros próprios. |
| Estoque | Uma linha por sabor. Físico soma lotes ativos com saldo. Reserva soma quantidades pendentes após consumos. Disponível subtrai o reservado do físico. Destaque para validade, mínimo e insuficiência. |
| Entregas | Rotas e motoboys da Central, fila atual e entregas concluídas pela data da entrega. Tempo médio mede da saída até a entrega, com fallback para a saída registrada na rota. Atrasos usam sinal do pedido ou ocorrência aberta. |
| Financeiro | Recebimentos, pagamentos e estornos via ledger e fallback existente para pedidos pagos legados com data. O período filtra movimentos e despesas previstas por vencimento. Contas abertas exibem saldo remanescente atual. Caixa em dinheiro segue sessão em aberto desde a abertura. Saldo fica indisponível quando meio ou data impedem a conciliação. |
| Margem e lucro | Margem usa subtotal líquido de desconto e custo cadastrado dos itens. Só entram pedidos com todos os custos conhecidos. Exibe cobertura e sinaliza parcialidade. Lucro estimado combina margem e despesas pagas fora de insumos quando os dados permitem. Custos atuais servem de referência para períodos anteriores. |
| Clientes | Reutiliza o agrupamento do CRM por telefone e a configuração aprovada. Novos e recompra seguem o período. Segmento de atividade é o atual. Reativação usa as faixas 30–59, 60–89 e 90+ e exclui opt-out. Campanhas exibem o estágio real “Pronta”. |
| Notificações | Lê os avisos existentes, contagem de não lidos e marcação com a permissão vigente. Soma avisos pessoais de tarefas vencidas à central do Dashboard. |
| Néia Inteligência | Fatos, estimativas e previsões indicam dados e motivação. Sugestões de tarefa abrem uma confirmação humana e começam sob responsabilidade de quem aprova. A consulta interativa depende da A02. |
| Ações rápidas | Novo pedido e PDV abrem /pdv. Produção, compras, caixa e relatórios apontam para funcionalidades existentes. |

## Minhas tarefas

Criação, edição, prazo, prioridade, atribuição, visibilidade e conclusão usam a tabela A01 com RLS. O responsável recebe aviso no ERP a partir do primeiro dia após o prazo. Atualizações usam eventos do banco e consulta periódica. O histórico registra autor, ação, instante e versões anterior e atual. A conclusão é registrada pelo banco e encerra a edição. O contador de versão identifica alterações concorrentes.

| Papel | Tarefas | Histórico |
| --- | --- | --- |
| Administrador | Lê todas, cria, edita, atribui e conclui pendentes | Lê todos |
| Equipe interna | Lê tarefas próprias, atribuídas e compartilhadas. Cria para si. Edita e conclui as próprias e atribuídas. O criador pode alterar a visibilidade. | Lê histórico das suas e atribuídas |
| Cliente e visitante | Sem acesso a tarefas administrativas | Sem acesso |

Equipe interna contempla atendente, produção, financeiro e motoboy. O painel restrito em /admin#minhas-tarefas usa a mesma interface sem acesso às métricas do administrador. Notificações de atraso são internas, por responsável.

## Ambiente

Branch resgate-visual-h01-h07-codex. Supabase de homologação lflzlcqinarrcgncafol. VITE_DEMO_PREVIEW=0. NEIA_AMBIENTE=homologacao. Publicação usa o endereço fixo existente do projeto erp-neia-salgados. A autorização da migration de tarefas foi específica para homologação.
