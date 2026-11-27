# Central da Atendente | Finalização operacional local

27/11/2026. A implementação parte de `591a37f`, na branch `central-atendente-codex`. O [registro anterior](status.md) conserva a referência visual e as decisões da etapa recuperada.

## Permissões e migrations

| Arquivo | Correção preparada |
| --- | --- |
| `0130_central_atendente_leitura_operacional.sql` | Políticas de leitura de itens e remessas para o papel atendente nos pedidos que ainda fazem parte da sua fila. A regra já existente dos componentes passa pelo item autorizado. O painel pede as colunas operacionais e exibe a contagem de remessas concluídas nos detalhes. |
| `0131_central_atendente_realtime_avisos.sql` | Protege um tópico privado para admin e atendente. A gravação de um aviso válido na tabela existente publica um sinal sem dados de cliente. A origem do aviso exige Produção ou admin, modalidade compatível, pedido pronto e conferência. |
| `0132_pedido_prazo_comercial.sql` | Registra o início e o limite da janela comercial no pedido imediato novo. As gravações do site, PDV e atendimento usam a mesma regra no banco, inclusive quando a criação atômica grava os itens na mesma transação. |

| Perfil | Itens e sabores | Remessas | Avisos da cozinha |
| --- | --- | --- | --- |
| Atendente | Itens, sabores, quantidades, observações e situação dos pedidos em atendimento. A ampliação de itens se limita à fila ativa, incluindo pedidos prontos sem despacho. | Leitura dos pedidos ativos. Concluir remessa continua no fluxo da Produção. | Lê pelo histórico existente e recebe o tópico privado. Reconhece cada aviso neste navegador e por login. |
| Administrador | Acesso anterior, preservado. | Acesso anterior, preservado. | Pode emitir em pedido pronto e conferido e receber pelo tópico privado. |
| Produção | Acesso operacional anterior, preservado. | Acesso anterior, preservado. | Emite conforme modalidade e conferência. O tópico é destinado à Central. |
| Cliente titular | Mantém os direitos sobre os próprios pedidos e itens. | Sem ampliação de acesso. | Acompanha o status na página do pedido. |
| Cliente terceiro, anônimo, motoboy e financeiro | Direitos anteriores preservados. A atribuição ao motoboy segue seu fluxo próprio. | Sem ampliação de acesso. | O tópico privado fica bloqueado. As políticas anteriores de leitura REST da tabela de notificações continuam vigentes nos painéis que já a usam. |

A ampliação se limita a `SELECT` e se baseia no papel cadastrado pelo ERP. As políticas efetivas de homologação precisam ser reconferidas antes da aplicação autorizada, em especial a política de componentes, os grants e as políticas existentes em `realtime.messages`.

## Avisos em tempo real

- A tabela `public.notificacoes` segue como histórico e fonte dos dados. O Realtime usa a publicação gerenciada de `realtime.messages` com o Broadcast privado `atendente-avisos-cozinha`. Eventos de outros tipos ficam no fluxo atual. O navegador, ao receber o sinal ou reassinar o tópico, relê os avisos com a sessão autorizada.
- A consulta de 15 s continua em primeiro plano. Uma indisponibilidade do transporte preserva o aviso no banco. O reconhecimento permanece por login e navegador, por pedido e modalidade. O botão conserva o aviso visível e indica o reconhecimento.
- A deduplicação do produtor usa o par tipo e pedido, com trava transacional no caminho padrão READ COMMITTED. Duplicatas históricas já existentes permanecem registradas. A Central exibe um aviso válido por pedido e modalidade. A confirmação do WebSocket gerenciado e da identidade de quem recebe é parte da homologação oficial.
- O alerta de pedido novo mantém som ativo, 75%, 30 s e os controles anteriores. O alerta de solicitação de agendamento será conectado ao fluxo existente após definição do contrato.

## Horários prometidos

- Fonte canônica para pedido imediato novo: `pedidos.prazo_prometido_inicio_em` e `pedidos.prazo_prometido_em`. A regra usa os parâmetros existentes de `loja_config` e os padrões de 40–60 min (retirada) e 60–90 min (entrega). A configuração é aplicada na criação e o registro permanece estável.
- Assados do catálogo ou da composição registrada adicionam 10 minutos uma vez, tanto no início como no limite. Congelados explicitamente identificados ficam fora do adicional. Quando o checkout legado dispõe dos componentes validados do combo, envia apenas o indicador do adicional. Um combo legado sem composição ou categoria verificável usa a janela base, sem deduzir assado do texto do item.
- O agendamento usa `agendado_para` e entra na fila da cozinha 1h30 antes. O site, o PDV, a Central da Atendente, a Produção e a Central de Entregas leem os dados persistidos. Os horários comerciais são exibidos no fuso de São Paulo.
- Os registros históricos continuam com os campos imediatos vazios. A Central e a Produção indicam prazo ausente. Pedidos com prazo vencido usam os destaques de atraso já existentes. A diferença entre prazo prometido e previsão técnica continua preservada.

## Dependência do OpenCode

A Central mantém os mesmos IDs, papéis, alertas e estados existentes. Os pontos para conexão ao contrato definitivo são:

- **Composição e modalidade.** Quantidades por chave de sabor, separadas das unidades ou combos comerciais, e modalidade escolhida por item, inclusive congelado. Saldo, margem de segurança inicial de 100 un. por sabor e disponibilidade diária, semanal e mensal vêm do estoque único.
- **Análise de agendamentos.** O contrato precisa indicar a solicitação pendente, cobertura prevista, sabor/data bloqueados, motivo, encaminhamento e decisão do responsável. Conferência física e liberação excepcional são registradas pela frente de estoque, com responsável e trilha de auditoria. Pedidos confirmados preservam seus compromissos. Solicitações pendentes aparecem separadas dos confirmados na previsão.
- **Pagamento, alerta e estoque.** A emissão da cobrança depende da aprovação quando houver análise. A Central precisará de um identificador estável, estado de encaminhamento e evento autenticado para usar o alerta existente até encaminhar ao responsável. Reserva por sabor, FEFO, bloqueio e desbloqueio antecipado permanecem no contrato do OpenCode.
- A integração e o teste real de 26 sabores, vínculos por modalidade, reserva e consumo aguardam essa entrega. A migration 0129 segue em frente própria.

## Validação realizada

- Typecheck sem erros e build de homologação aprovado. O verificador encontrou 450 arquivos no bundle, com 12 referências ao projeto de homologação e zero referências a produção.
- 101 testes Node passaram, incluindo segurança de ambiente, regressões dos módulos protegidos e cinco testes novos de prazo, modalidade e reconhecimento. Esses testes usam lógica pura, inspeção estática ou mocks conforme a suíte.
- As migrations 0130–0132 foram executadas em PostgreSQL 17.11 local descartável, com dados sintéticos. Foram verificados RLS por papel, os triggers, o histórico, a deduplicação, a indisponibilidade do transporte e as janelas de prazo. A função gerenciada de Broadcast foi substituída por um stub no teste de banco.
- O navegador passou em 8 cenários com HTTP, WebSocket e áudio interceptados localmente. Conferiu aviso privado, sinal repetido, reconhecimento após recarga, reconexão, fallback; repetiu a validação de alerta de novo pedido, navegação H02 sem F5 e responsividade. O som em dispositivo físico e o WebSocket gerenciado serão exercitados na homologação.
- Foi validado o comportamento de RLS no banco local. A validação com usuários e dados de teste no Supabase de homologação, os ciclos multi-sessão de estoque e a conferência manual do proprietário estão pendentes.

## Homologação manual com contas reais

1. Com uma conta de cliente, criar em homologação um pedido de retirada imediato, um de entrega com assado e um agendamento. Conferir a janela anunciada, o horário agendado e o histórico sem prazo persistido. Conferir também um pedido no PDV. Usar pedidos e pagamentos de teste após autorização.
2. Com conta exclusiva de atendente, abrir a Central pelo link da H02 e acompanhar os pedidos sem F5. Confirmar o som em 75%, a repetição de 30 s, o reconhecimento individual e a persistência após recarregar. Conferir itens, sabores, quantidades, observações e remessas. Uma conta cliente de terceiros ou perfil sem autorização deve ficar fora da Central.
3. Aceitar o pedido e confirmar a autoria no histórico. Conferir a fila da cozinha e a entrada do agendado 1h30 antes. Depois da entrega do OpenCode, conferir quando a reserva acontece conforme o canal, revisar o vínculo unitário e testar o consumo FEFO. Incluir um agendamento pendente para verificar o encaminhamento, o alerta, o bloqueio por sabor/data e a cobrança após aprovação.
4. Com Produção, iniciar, preparar e conferir. Usar **Liberar retirada** ou **Avisar caixa**. A Central deve receber o aviso da modalidade certa, preservar o histórico, aceitar reconhecimento individual e recuperar o aviso após reconectar. Repetir o envio e verificar um só registro novo. Simular indisponibilidade de Realtime e conferir o fallback.
5. Confirmar a retirada no balcão. Para entrega, conferir a passagem à Central de Entregas e o mesmo prazo prometido. Verificar que dupla ação não repete aceite, retirada, aviso ou movimentação de estoque. Conferir autoria, horários e histórico ao fim do fluxo.

## Integração e publicação após autorização

1. Confirmar o topo da branch oficial e o SHA servido pelo [endereço fixo da Central](https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#central-atendente). O ponto registrado nesta etapa é `968664d` publicado e `e50e750` como base Git da Central. Conferir alterações posteriores e simular a integração seletiva em worktree isolada.
2. Conferir o destino `lflzlcqinarrcgncafol`, a vigência da configuração de `loja_config`, as relações de pedidos, a disponibilidade da função gerenciada de Broadcast e os papéis efetivos. Coordenar a numeração e a ordem com o OpenCode. Aplicar as migrations autorizadas da Central antes do build que consulta os novos campos. A 0129 exige sua autorização própria.
3. Executar as regressões da branch candidata, validar a Vercel com `NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0`, publicar pelo fluxo da branch oficial e verificar o SHA no endereço já existente. Rodar o roteiro manual e registrar o aceite do proprietário em checkpoint próprio.

Foram preservados Dashboard A01/A01.1, Néia Inteligência A02.1/A02.1.1, Minhas tarefas, H02, Estoque, os 26 sabores e sua sequência e fotografias, Financeiro e a estrutura visual aprovada. Produção/Cozinha e Central de Entregas receberam apenas a leitura do prazo comercial nos componentes existentes. O layout base da Central foi preservado.

A etapa ficou local. Produção, homologação, GitHub e Vercel seguem com o estado anterior. A aprovação definitiva depende dos testes do proprietário.
