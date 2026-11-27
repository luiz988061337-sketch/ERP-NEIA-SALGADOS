# Central da Atendente | Correções finais da homologação

O proprietário confirmou os fluxos básicos de aceite, Produção,
retirada e encaminhamento para Entregas no endereço oficial. A rodada
local trata dos desvios observados e dos atalhos aprovados. O endereço
oficial continua no deployment de homologação com a migration 0134.

## Alertas operacionais

- O gerenciador fica na raiz autenticada do ERP, com um canal de mudanças
  de pedidos e o Broadcast privado da cozinha já existente. O histórico
  segue na tabela `notificacoes`. A consulta periódica de 15 segundos é
  independente da repetição do áudio.
- Em navegadores com Web Locks e BroadcastChannel, apenas uma aba da
  sessão mantém as assinaturas. As demais recebem um sinal local para
  atualizar suas consultas, sem compartilhar dados do pedido.
- O aviso visual mostra o número do pedido, oferece acesso ao módulo e
  permite reconhecer cada motivo. O reconhecimento e as preferências
  ficam no navegador, por usuário, e sincronizam entre abas. O aceite,
  a retirada e a atribuição continuam sendo operações próprias.
- O som começa com 75% de volume e repetição de 30 segundos. Há opções
  de 15, 30 e 60 segundos. Um intervalo personalizado anterior continua
  disponível para preservação da preferência. Toque seguido de voz é o
  padrão. Os lembretes agrupam pedidos por motivo.
- A fala usa uma voz feminina local pt-BR identificada no navegador.
  A disponibilidade e a pronúncia variam por computador. Se não houver
  voz compatível ou a fala falhar, o toque continua disponível. O botão
  **Testar som** libera e testa cada alerta. A execução usa Web Locks
  quando disponível e limita a reprodução à aba em foco nos demais
  navegadores. Nenhum serviço externo de voz foi integrado.

## Retirada e pagamentos

- A janela de retirada consulta o saldo no ledger de pagamentos. Dinheiro
  exige o valor entregue e calcula o troco. Cartão exige confirmação do
  valor recebido. Pix quitado segue direto à confirmação de retirada.
- O recebimento usa `registrar_pagamento_pedido`, com a chave de
  idempotência para repetir a mesma tentativa. O pagamento parcial
  permanece gravado e o pedido fica aberto com o saldo restante.
  A checagem no banco impede finalizar retirada com saldo ou divergência.
- Mantidos os controles financeiros existentes, inclusive a capacidade
  `receber_pagamento` e os papéis aceitos pela RPC. O perfil administrativo
  atual de homologação precisa de um operador de Caixa de teste com essa
  capacidade, a ser provisionada separadamente. A Cozinha conserva a
  conferência. A regra de balcão deixa pedidos de entrega fora de seu
  escopo. Liberação com saldo exige uma autorização comercial auditável
  separada. Nenhum recebimento foi presumido para o pedido `2147000301`.

## H02, Produção e os atalhos de Entregas

- H02 usa a mesma promessa comercial da Central, com precedência do
  horário agendado. A fila real **A fazer** da Produção só inclui pedidos
  recebidos com aceite registrado.
- Os dois pedidos de teste têm 50 no campo de quantidade. O catálogo
  de `2147000301` identifica «Mini Bolinha de Queijo 25un» e o de
  `2147000302` identifica «Mini Trouxinha de Frango 20un». Quando o
  cadastro é ambíguo, Central e H02 exibem a quantidade registrada e
  pedem conferência da unidade física. A conciliação de embalagens,
  sabores, vínculos unitários e FEFO segue com o OpenCode.
- **Atribuir motoboy** abre a janela da Central de Entregas, com
  disponibilidade e pedidos reservados. **Montar rota** abre a seção
  existente com o pedido selecionado e permite completar a rota.
  Ambos respeitam os papéis atuais da Central de Entregas. A atribuição
  conserva a situação anterior à saída e a promessa ao cliente. O fluxo
  de liberação, confirmação de retirada pelo motoboy e início do
  percurso permanece com a etapa de roteirização.

## Verificações locais

- 51 testes Node passaram, incluindo alertas, permissões dos atalhos,
  prazos, quantidades, recebimento e regressões de Produção e segurança.
- PostgreSQL 17 local descartável validou 38 verificações das suítes
  de Central e retirada. O ensaio cobriu leitura restrita do Broadcast,
  saldo parcial, Pix quitado, restrições do Caixa e independência dos
  pedidos de entrega.
- Chrome local, com respostas interceptadas e voz simulada, confirmou
  o alerta em Entregas sem recarga, reconhecimento individual, troco,
  recebimento parcial, retirada quitada, abertura da janela de
  atribuição e pedido pré-selecionado na rota pelo H02.
- Typecheck e build protegidos passaram. O bundle foi verificado em
  396 arquivos e tinha zero referências à produção.
- A audição da voz disponível na estação, a operação com sessões reais
  e a roteirização completa ficam para a etapa de homologação.

## Integração futura

| Migration local | Efeito |
| --- | --- |
| `0135_alertas_entregas_realtime.sql` | Autoriza o papel Produção, que já acessa Entregas, a receber o sinal privado existente. O sinal carrega um objeto vazio e as políticas dos registros permanecem vigentes. |
| `0136_retirada_quitacao_balcao.sql` | Expõe somente o resumo financeiro necessário à retirada para Atendente e Admin. Exige quitação no banco para concluir retirada. |

Antes de publicar, reconferir numeração, papéis e capacidade de Caixa,
guardas vigentes e o destino `lflzlcqinarrcgncafol`. Aplicar apenas após
autorização específica e manter o deployment protegido no endereço fixo.
Em caso de reversão, voltar o alias para o deployment anterior e
registrar compensação para restaurar as duas políticas da 0131 e remover
o gatilho e as funções introduzidos pela 0136, preservando o ledger de
pagamentos, os pedidos e o histórico de migrations.

## Homologação final

O roteiro usa o endereço fixo de homologação e perfis separados quando
disponíveis. No pré-voo de 27/11/2026 havia uma conta Admin, nenhum
perfil com `receber_pagamento` e nenhum motoboy vinculado a um usuário.
Os cadastros e as permissões permanecem como estavam.

| Perfil | Passo manual |
| --- | --- |
| Atendente ou Admin | Abra **Testar som** para liberar o áudio. Navegue para outro painel, espere 30 segundos com dois pedidos pendentes, reconheça só um e confirme que o outro continua alertando. Aceite o segundo e confira que o aviso se encerra. |
| Produção | Confirme que só entram pedidos aceitos. Finalize as remessas, faça a conferência e publique os avisos pelos botões existentes. |
| Caixa autorizado | Teste dinheiro com troco, cartão, Pix já pago e recebimento parcial com pedidos de teste. Confira saldo, ausência de duplicidade e o Histórico da H02 após retirada. |
| Entregas e motoboy de teste | Abra os dois atalhos a partir de um pedido pronto. Confira os prazos e a atribuição sem início de percurso. A etapa de roteirização valida a liberação pela Central e a confirmação de retirada pelo motoboy. |

O pedido de teste `2147000301` já consta no Histórico com pagamento
pendente e serve para conferir a ocorrência anterior. O pedido
`2147000302` está pronto para o teste de Entregas. O ensaio de
recebimento usa novos pedidos identificados de homologação.

## Pendências de outras etapas

- A01.2, análise de vendas por hora, dia, semana e mês.
- Néia Inteligência, Assistente de Voz Operacional preventivo.
- Estoque do Dia.
- Fabricação Inteligente.
- Ampliação do Histórico de Pedidos.
