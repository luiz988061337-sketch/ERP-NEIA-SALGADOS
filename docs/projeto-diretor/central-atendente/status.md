# Central da Atendente

**Status em 26/11/2026 — implementação na branch `central-atendente-codex`, aguardando integração e conferência visual.**

[Endereço oficial de homologação](https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#central-atendente)

> Atualização de 27/11/2026. A [finalização operacional local](finalizacao-operacional.md) documenta as correções de permissão, os avisos Realtime, os prazos e a homologação pendente.

## Referências

- [Projeto Diretor](../README.md), [menu lateral aprovado](../menu-lateral/status.md) e [H02](../H02-central-pedidos/status.md).
- Checkpoints `checkpoint-menu-lateral-01` e `checkpoint-h02-central-pedidos-visual-01`. Base oficial da implementação `e50e750`.
- Referência histórica `1dc0e0d0c0ddd7c008628f473d33799136d689e2`, [captura ERP Dark](../../erp-dark/prints/central-atendente-PREVIEW-desktop.png) e [captura da prévia histórica](../../preview-captures/prints/preview-central-atendente-desktop.png).
- Imagem complementar `referencia_central_da_atendente.png` enviada pelo proprietário. O menu permanece o do checkpoint oficial.

## Implementação

- O painel reutiliza `CentralPedidos`, os componentes do shell oficial e as visões de `sincronizacao-paineis`. A H02 continua em `/admin#pedidos` e consulta a mesma tabela `pedidos`. Administradores e atendentes têm acesso à rota da Central de acordo com seus papéis.
- Em análise, Em produção e Prontos distinguem novos pedidos, fila da cozinha, preparo, retirada no balcão e despacho. O painel recebe pedidos e avisos via Realtime, com atualização periódica de 30 s para pedidos e 15 s para avisos.
- Em produção, o horário de entrada dos agendados deriva da mesma janela de 1h30 usada na cozinha. O atraso usa o compromisso registrado quando disponível ou o alerta persistido. Um pedido sem prazo verificável aparece como tal.
- A contagem de salgados reutiliza os componentes gravados no pedido e o mesmo cálculo da H02. Os combos usam as remessas registradas ou o múltiplo de 50 quando a quantidade de salgados é conhecida.
- O aceite usa `executarAceiteAtendente` e a RPC registra operador e horário. A confirmação de retirada usa `retirarPedidoCliente` e exige conferência da cozinha. A interface atualiza o estado após confirmação. Produção e despacho pertencem aos respectivos painéis.
- Som ativo por padrão, 75% e 30 s. O reconhecimento é individual e persistente no navegador. O teste de som permite liberar o áudio quando o navegador bloqueia a reprodução automática.

## Pendências operacionais

- Validar pedidos reais, permissões de leitura das relações, publicação Realtime e ciclos de aceite e retirada na homologação oficial. As flags existentes de aceite e retirada permanecem com a configuração anterior.
- Confirmar o vínculo unitário e as reservas e o consumo FEFO após a integração do trabalho do Estoque, incluindo a migration 0129. Esta etapa não executa migração.
- Persistir o prazo efetivamente prometido nos pedidos imediatos. As janelas de 40–60 min para retirada, 60–90 min para entrega e o acréscimo de 10 min para assados são referências operacionais, sem substituir o compromisso assumido. Uma previsão de conclusão da cozinha depende de uma fonte disponível no fluxo de Produção.
- Conferir a versão no endereço oficial após autorização de integração. O checkpoint definitivo depende da aprovação visual do proprietário.
