# Estoque de Salgados — decisões operacionais aprovadas em 27/11/2026

Registro de deliberação do proprietário para a etapa de finalização do Estoque
Operacional. Este documento é fonte de requisitos; não é comprovação de que as
funcionalidades foram aplicadas em homologação.

Base: branch isolada `estoque-operacional-vinculos`, commit `9cab907`.
Destino futuro de integração: `resgate-visual-h01-h07-codex`.
Homologação: `lflzlcqinarrcgncafol`, endereço fixo oficial já existente.
Produção `ruioyioynwwwiqbjznoa` permanece protegida.

## 1. Cadastro comercial

- Os 31 produtos comerciais antigos foram cadastrados anteriormente pelo
  OpenCode e **não representam o cardápio oficial**.
- Desconsiderar os cadastros antigos de 15, 20 e 25 unidades.
- Não aproveitar os saldos legados de `100` como estoque físico.
- Preparar desativação dos cadastros incorretos somente após verificar
  dependências e preservar históricos; não excluir registros históricos.
- Os 26 sabores oficiais do Estoque de Salgados são a referência canônica.
- Preservar nomes, fotografias, chaves e sequência personalizada.
- Não adicionar novos sabores sem autorização.
- Bebidas permanecem fora do Estoque de Salgados.
- Reaproveitar regras comerciais e modalidades aprovadas; não inventar preços
  nem alterar regras já aprovadas, inclusive para congelados.

## 2. Estoque único por sabor

- Um único estoque físico por sabor, controlado individualmente por unidade.
- Modalidades frito, assado e congelado consomem as mesmas unidades quando
  corresponderem ao mesmo sabor.
- Combos de 50 e múltiplos de 50 seguem as regras comerciais aprovadas.
- Composição explícita por sabor; multiplicadores vêm da composição real, não
  dos nomes dos cadastros antigos.
- Nenhuma baixa duplicada entre produto pai e componentes.
- Reserva, consumo, cancelamento e perdas são auditados.
- Lotes e FEFO são obrigatórios.
- Integração futura com site, PDV, Central da Atendente e Produção/Cozinha.

## 3. Margem de segurança

- Margem inicial aprovada: **100 unidades para cada um dos 26 sabores**.
- Cada margem deve ser configurável individualmente pelo administrador.
- Distinguir estoque físico, reservado, não comprometido, margem de segurança,
  disponível para novas vendas e compromissos futuros de fabricação.
- Vendas imediatas usam a quantidade física utilizável menos reservas e margem.
- Lotes vencidos ou indisponíveis ficam fora da quantidade utilizável.
- Nunca gerar estoque negativo.
- Margem de segurança não é baixa, perda nem reserva de cliente.
- Estoque mínimo de reposição continua separado da margem de segurança.

## 4. Conferência física e liberação excepcional

Sequência aprovada: identificar causa; notificar conferência quando houver risco
físico imediato; atendente encaminha ao responsável; responsável conferencia;
ajuste autorizado e auditado quando houver divergência; liberação pontual de
quantidade específica; atendente recebe resultado; registrar funcionário,
responsável, horário, quantidade conferida, quantidade liberada e justificativa.

A liberação é pontual, não elimina a margem permanentemente e nunca compromete
reservas confirmadas. A atendente não pode ignorar diretamente o bloqueio.

## 5. Visões temporais e alertas

- Consultas de hoje, semana, mês e datas futuras, por sabor.
- Mostrar físico, reservas de hoje, reservas futuras, compromissos de
  fabricação, solicitações pendentes separadas de pedidos confirmados, entradas,
  consumo, vendas, perdas, ajustes, saldo projetado, margem, disponibilidade e
  necessidade de reposição.
- Saldo projetado não é saldo físico; reservas já descontadas não são somadas
  outra vez.
- Diferenciar proximidade da margem, compromisso futuro, risco para pedido
  confirmado, divergência física, agendamento em análise e bloqueio por data.
- Reutilizar a Néia Inteligência; não criar segundo motor de regras nem
  implementar previsão avançada de demanda nesta etapa.
- Preservar o layout aprovado; acrescentar somente controles necessários.

## 6. Agendamentos, bloqueios e site

- Pedidos agendados não são limitados ao estoque físico atual.
- Não há prazo fixo de antecedência; viabilidade depende de quantidade,
  composição, data/hora, estoque, pedidos confirmados, possibilidade de
  fabricação e bloqueios comerciais.
- Classificação: A estoque suficiente; B fabricação adicional ou disponibilidade
  incerta, encaminhar ao responsável; C sabor bloqueado na data, impedir venda.
- Como não existe módulo de fabricação, não presumir capacidade produtiva.
- Responsável pode aprovar agendamento assumindo compromisso futuro, sem gerar
  estoque físico, lote fictício ou saldo negativo.
- Entrada real de fabricação pode cobrir compromissos, com prioridades e sem
  duplicidade de reservas.
- Impedir envio para preparo sem cobertura física suficiente.
- Bloqueio comercial individual por sabor e data/período, com motivo,
  responsável, desbloqueio antecipado e histórico; não cancelar automaticamente
  pedidos confirmados.
- Solicitações do site pendentes não aparecem como confirmadas, não geram
  cobrança antecipada nem reserva definitiva; pagamento só após aprovação.
- Aprovação revalida atomicamente disponibilidade, bloqueios e compromissos;
  aprovações simultâneas não podem inconsistir o estoque.

## 7. Central da Atendente

- Solicitação de conferência, liberação excepcional e agendamento em análise
  devem ter contrato documentado com a Central da Atendente.
- Alerta sonoro: ativo por padrão, volume 75%, repetição a cada 30 segundos,
  encerramento após encaminhamento, solicitação visível até resolução, sem
  duplicidade.
- Reutilizar mecanismo existente. Arquivos em desenvolvimento pelo Codex não
  devem ser alterados; a dependência deve ser documentada.

## 8. Carga exemplificativa de homologação

Quantidades autorizadas apenas para teste em homologação:

| Nº | Sabor | Quantidade |
|---:|---|---:|
| 01 | Coxinha de frango | 5000 |
| 02 | Bolinha de queijo | 4000 |
| 03 | Risoles de presunto e queijo | 2000 |
| 04 | Croquete | 2500 |
| 05 | Bolinho de calabresa | 1500 |
| 06 | Bolinho de milho com queijo | 1200 |
| 07 | Bolinho de azeitona | 800 |
| 08 | Trouxinha de milho com catupiry | 1500 |
| 09 | Kibe | 3000 |
| 10 | Mini pastel de carne | 2500 |
| 11 | Mini pastel de queijo | 2000 |
| 12 | Mini pastel de pizza | 1500 |
| 13 | Mini pastel de palmito | 800 |
| 14 | Esfirra de carne | 2500 |
| 15 | Esfirra de frango | 2000 |
| 16 | Esfirra de brócolis | 600 |
| 17 | Enroladinho de presunto e queijo | 1800 |
| 18 | Hamburguinho | 1200 |
| 19 | Ricota com zaatar | 100 |
| 20 | Mini empada de palmito | 800 |
| 21 | Mini empada de frango | 1500 |
| 22 | Mini pizza de calabresa | 1500 |
| 23 | Mini pizza de queijo | 1200 |
| 24 | Mini pizza de presunto e queijo | 1200 |
| 25 | Trouxinha de calabresa | 80 |
| 26 | Enroladinho de salsicha | 1500 |

A carga deve ser idempotente, rastreável, feita por movimentações legítimas e
lotes `HOMOLOGAÇÃO-TESTE`. Deve haver procedimento seguro de reversão. Validades
são exclusivas dos cenários de teste. A carga remota não deve ser aplicada nesta
etapa e nunca deve ser transferida para produção. Inventário real precede a
entrada definitiva em operação.

## 9. Migration e permissões

- Revisar `0129` com base nas decisões; não aplicar os 13 vínculos prováveis.
- Migration separada deve reconciliar a intenção da `0098` para
  `reservar_estoque_atomica` e `reservar_pedido_atomico`, sem grants amplos.
- `authenticated` não basta para operação administrativa: validar papel
  funcional, `SECURITY DEFINER`, `search_path`, RLS e validações internas.
- Nenhuma alteração remota sem autorização expressa.

## 10. Funcionalidades adiadas

Fabricação Inteligente, planejamento avançado, capacidade/localização de
freezers, distribuição entre freezers, matérias-primas detalhadas, previsão de
demanda, custos/rendimento e impressão de relatórios não devem ser implementados
agora. Registro para futuro: fabricação própria normalmente de segunda a sábado;
sabores definidos por estoque, espaço e velocidade de saída; sem dias fixos por
sabor.

## 11. Continuidade comercial — complemento obrigatório

As novas regras não podem causar bloqueios comerciais indevidos nem parar as
vendas.

- Falha técnica não significa falta de estoque.
- Estoque não inventariado não significa produto esgotado.
- Margem de segurança atingida não significa indisponibilidade física.
- Pedidos agendados devem considerar a possibilidade de fabricação.
- Problemas em um sabor não bloqueiam todo o cardápio.
- Falhas da Néia Inteligência ou do Realtime não impedem atendimento.
- Erros de integração não podem perder o carrinho nem duplicar pedidos.

Preparar atendimento assistido seguro quando a validação automática não estiver
disponível: encaminhar ao responsável para conferência/decisão, preservar dados
do pedido, permitir novas tentativas idempotentes, não confirmar venda ou
pagamento indevidamente, não comprometer reservas existentes, não criar estoque
fictício e não gerar estoque negativo.

Ativação gradual com controles administrativos e feature flags:
monitoramento, validação assistida e controle operacional. Não alterar
silenciosamente o comportamento comercial existente; desativar novas regras não
pode remover proteções essenciais já existentes. A reversão segura não pode
perder pedidos, reservas, movimentações nem histórico.

Testes adicionais obrigatórios: venda com estoque suficiente, na margem e com
estoque não inventariado; divergência; falha de comunicação com banco; timeout
de RPC de reserva; falha de permissões; falha de Realtime; falha da Néia
Inteligência; agendamento dependente de fabricação; compra de outros sabores com
um sabor bloqueado; recuperação de conexão; repetição sem cobrança ou reserva
duplicada; ativação e desativação seguras. Regressão dos fluxos de site, PDV e
Central da Atendente. A etapa não pode ser considerada pronta para publicação
enquanto existir possibilidade conhecida de bloqueio comercial indevido.

## 12. Estoque do dia — complemento aprovado

A consulta operacional deve usar a mesma fonte canônica do Estoque de Salgados,
sem estoque paralelo, saldos duplicados ou segundo motor de disponibilidade.

Retornar, na sequência personalizada dos 26 sabores: nome, fotografia, estoque
físico, reservado, margem individual, disponibilidade imediata, compromissos
futuros, disponibilidade para data solicitada, bloqueios por sabor/data,
necessidade de conferência, solicitações em análise e data/hora da última
atualização. Deve ser possível consultar viabilidade por sabor, quantidade e
data, distinguindo indisponibilidade real, necessidade de análise, margem
atingida e falha técnica.

Permissões backend/RLS/RPCs:

| Perfil | Permissão |
|---|---|
| Atendente | Consultar; solicitar conferência, liberação e análise de agendamento; receber respostas. |
| Caixa/PDV | Mesmas permissões operacionais de consulta e solicitação. |
| Produção/Cozinha | Consultar físico e reservado. |
| Responsável autorizado | Conferir/solicitar conferência; autorizar total ou parcialmente; recusar; ajustar conforme permissão específica. |
| Administrador | Controle integral, margens, permissões e auditoria. |
| Motoboy | Sem acesso ao estoque. |

Contratos de solicitação: conferência física, liberação excepcional e análise
de agendamento; encaminhamento; autorização integral/parcial; recusa;
reconhecimento pela atendente. Registrar solicitante, responsável, sabor, data
do pedido, horários, justificativa e decisão. Autorização não pode ser
reutilizada em várias vendas; disponibilidade é revalidada na confirmação.

Notificações visuais e sonoras devem usar o sistema existente, com evento ao
responder, sem duplicidade e com reconhecimento individual. Falha técnica nunca
é estoque esgotado. A interface deve ser desenvolvida pelo Codex; nesta etapa
apenas os contratos, tipos, RPCs, permissões e eventos são preparados e
documentados, sem modificar Central da Atendente ou PDV.

## 13. Limites desta etapa

Implementação local e preparação técnica autorizadas. Não autorizados: escrita
remota, aplicação das migrations, carga remota, testes com escrita remota, push,
merge na oficial, deploy, alteração de `main`, acesso/alteração de produção e uso
do `.env` de produção como destino. Não interferir no trabalho paralelo do
Codex. Não declarar conclusão ou aprovação definitiva.

## 14. Controle de escopo — 27/11/2026

Por decisão do proprietário, fica **adiada** a implementação adicional da
interface “Estoque do dia”, incluindo entrada no menu lateral, painel lateral e
atalhos. Especificações, contratos e trabalhos já realizados são preservados e
registrados como pendência futura. Não acrescentar novas funcionalidades nem
reconstruir módulos aprovados.

Nesta etapa priorizar continuidade das vendas; reservas e baixas de estoque;
segurança e permissões; pedidos imediatos e agendados; integração entre módulos
existentes; testes transacionais; preparação para homologação. Correções
operacionais essenciais do Estoque de Salgados e da Central da Atendente
continuam autorizadas, sem alterar a branch do Codex nem os layouts aprovados.
Todas as restrições anteriores de segurança, integração e publicação permanecem.

