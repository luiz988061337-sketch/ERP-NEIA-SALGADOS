# H02 — Central de Pedidos administrativa

Status em 26/11/2026: implementação em validação, com aprovação manual do proprietário pendente.

[Abrir Pedidos na homologação oficial](https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#pedidos)

## Referências

- Pacote original `ERP_NEIA_H02_PEDIDOS_REFERENCIA_E_PROMPT.zip`, com `PROMPT_H02_PEDIDOS.md` e `referencia_h02_pedidos.png`. A imagem recuperada apresenta as quatro colunas de operação.
- `referencia_h02_central_de_pedidos.png`, enviada pelo proprietário. Orienta a hierarquia de indicadores, filtros e cartões, e a identificação visual das quatro colunas.
- Tag `visual-aprovados-01` em `37ea9d07`, commit histórico `1dc0e0d0c0ddd7c008628f473d33799136d689e2` e [endereço histórico de referência](https://erp-neia-salgados-7eqm3sjsv-luiz988061337-3147s-projects.vercel.app).
- [Auditoria do resgate H02](../../homologacao/referencias-originais/H02-PEDIDOS-ORIGINAL-ESPECIFICACAO.md) e checkpoint `checkpoint-menu-lateral-01`. A auditoria descreve a tabela legada. O prompt atual e as imagens da H02 determinam a organização em quatro colunas.

## Fluxo recuperado

- `/admin#pedidos` abria a Central da Atendente e deixava a gestão administrativa dentro de um painel recolhível. Agora Pedidos abre a H02. `/admin#central-atendente` abre a Atendente. As duas rotas compartilham os pedidos reais do Supabase e o menu existente.
- Os quatro grupos cobrem pedidos novos, aceitos, em produção e prontos. Em entrega, finalizados e cancelados aparecem na consulta complementar. O aceite registrado separa a espera da produção física quando ambos compartilham o mesmo estado persistido.
- A consulta distingue carregamento, erro, recorte vazio e ausência de dados de pagamento ou de prazo. A lista recente é limitada a 400 pedidos e a pesquisa por período é paginada.
- Aceite, cancelamento com justificativa e fila de impressão reutilizam os fluxos existentes e dependem da autorização original. A interface mantém a produção, a liberação de retirada e o despacho nos módulos responsáveis. Alterações administrativas em detalhe ficam restritas ao fluxo de notas já existente.
- A produção preserva a janela de 1h30 dos agendados. A referência de prazo usa o horário persistido do agendamento ou o atraso registrado. O esquema atual precisa de suporte ao prazo prometido para pedidos imediatos para determinar automaticamente os atrasos nesses casos.
- A H02 não registra pagamentos. O valor recebido, o saldo de pagamentos parciais e o troco efetivo dependem de dados financeiros persistidos. O painel mostra o troco solicitado se registrado no pedido.

## Pendências

- Homologar com dados reais e usuários operacionais. Conferir aceite, impressão, cancelamento e as permissões em conjunto com os responsáveis. As ações de escrita da validação automatizada usam respostas locais isoladas.
- Aceite e cancelamento atômico continuam condicionados às flags de corte existentes. O Preview oficial tem as variáveis de ambiente e as chaves de homologação configuradas por branch. A ativação dos fluxos exige uma validação operacional separada, incluindo as dependências de estoque e a compatibilidade das RPCs.
- Conferir os vínculos do cardápio e das modalidades aos 26 sabores oficiais, com lotes e saldos reais, antes de validar reserva, consumo FEFO e cancelamento ponta a ponta. O cadastro concluído pelo OpenCode está descrito em [Estoque de Salgados](../estoque-salgados/status.md).
- Definir a persistência e a autorização de prioridade manual e de edição de dados operacionais. Os fluxos atuais não disponibilizam essas edições pela H02.
- Manter para etapa própria a central de impressão e reimpressão, relatórios de vendas por período, modalidade, forma de pagamento e cancelamento, e exportação PDF e Excel.
