# F1-B3 — matriz futura de testes

> **ROTEIRO DE REVISÃO — NÃO EXECUTAR CONTRA PRODUÇÃO.**
>
> Estes casos são especificação para uma futura homologação isolada. Não foram executados: dependem das RPCs e do schema propostos em `PROPOSTA-TECNICA.md`. Usar somente staging separado e dados sintéticos/sanitizados após autorização.

## A. Regras de valor e estado

| Caso | Preparação / ação | Resultado esperado |
|---|---|---|
| Pagamento integral | Conta aberta de 50.000 centavos; registrar 50.000 | Um movimento, total pago 50.000, saldo zero, status `paga`, `pago_em` definido uma vez |
| Duas parcelas | Conta 50.000; registrar 20.000 e 15.000 com chaves diferentes | Dois movimentos independentes; agregado 35.000; saldo 15.000; `parcial` |
| Três parcelas | 10.000, 20.000, 20.000 | Três linhas e datas/meios distintos; total exato 50.000; saldo zero somente na última |
| Recebível parcial | Conta tipo `receber`, 50.000; entrada bancária de 20.000 | Movimento positivo de 20.000; saldo 30.000; conta parcialmente recebida |
| Pagável parcial | Conta tipo `pagar`, 50.000; saída bancária de 20.000 | Movimento da conta compatível com sinal; saldo 30.000; conta parcialmente paga |
| Conta quitada repetida | Tentar registrar mais após saldo zero | Conflito; nenhum novo movimento, saldo nunca negativo |
| Valor acima do saldo | Saldo 15.000; tentar 15.001 | Rejeição no banco, sem movimento nem mudança na conta |
| Valor zero/negativo | Tentar 0, -1 ou payload fora da faixa | Rejeição antes de gravar; nenhum evento de pagamento confirmado |
| Centavos exatos | 0,01 + 0,02 e montantes com duas casas | Soma 0,03 exata; sem erro de ponto flutuante |
| Conta de valor original zero | Tentar registrar pagamento | Nenhum pagamento zero; resultado coerente com decisão aprovada sobre conta de saldo zero |
| Conta inexistente/cancelada | Informar ID ausente ou cancelado | Rejeição sem insert; cancelamento e histórico permanecem |

Repetir regras tanto para `pagar` quanto `receber`. Validar estado atrasado e parcialmente pago como dimensões distintas.

## B. Concorrência e idempotência

| Caso | Execução concorrente / repetida | Resultado esperado |
|---|---|---|
| Dois operadores no mesmo saldo | Saldo 30.000; ambos tentam 20.000 | Uma transação vence; outra relê saldo bloqueado e falha; total <= 30.000 |
| Dois operadores no mesmo extrato | Chamadas simultâneas de conciliação do mesmo `extrato_id` | Um único vínculo/movimento; segunda chamada retorna já conciliado ou resultado idempotente |
| Duas chamadas, mesma chave e payload | Repetir após simular resposta perdida | Um movimento; retry retorna o mesmo `pagamento_id` e totais originais |
| Mesma chave, payload diferente | Reutilizar chave para outra conta/valor/meio | Conflito de idempotência; nenhuma segunda operação |
| Chaves diferentes, mesmo extrato | Dois usuários usam chaves próprias | Unicidade do vínculo do extrato ainda impede segundo pagamento |
| Mesma importação e conta | Submeter hash/bytes de arquivo igual em paralelo, nomes iguais ou diferentes | Um lote e uma cópia das linhas; segunda chamada retorna lote existente |
| Mesmo FITID em contas distintas | Dois bancos/contas validados com FITID igual | Ambas as transações permitidas; FITID não é global |
| FITID repetido na mesma conta | Novo lote traz FITID já usado naquela conta | Conflito explícito para revisão; não descartar silenciosamente |

## C. Falhas, atomicidade e retry

Injetar falha controlada em staging, em cada ponto da transação:

1. Após bloquear conta/extrato e antes de inserir o pagamento.
2. Depois do insert do pagamento, antes de atualizar `contas.valor_pago/status`.
3. Depois da atualização da conta, antes de vincular o extrato.
4. Depois do vínculo, antes do evento de auditoria.
5. Durante a inserção de uma linha do lote de importação.

Em cada caso, confirmar rollback de todas as alterações da operação: movimento, agregado, status, extrato/lote/linhas e evento de sucesso. Nenhuma UI deve mostrar sucesso se o servidor retornou falha.

Depois de uma falha/transporte interrompido, repetir com a mesma chave: se houve commit, retornar o resultado anterior; se houve rollback, executar uma única vez. Um retry não pode multiplicar movimento nem omitir saldo.

## D. Histórico, estornos e fechamento

- Snapshot legado com `valor_pago=0`, parcial válido, conta marcada paga com agregado menor, agregado maior que `valor`, nulo/inválido e conta cancelada com valor pago: não apagar nem corrigir automaticamente; exceções ficam sinalizadas para revisão.
- Pagamentos anteriores continuam consultáveis com valor, ator, hora, meio, origem e extrato; não são sobrescritos por parcelas subsequentes.
- Estorno integral/parcial autorizado cria movimento compensatório e evento, liga ao original e não exclui ou edita o movimento inicial; limite acumulado de estornos não ultrapassa o movimento original.
- Conta de competência fechada com pagamento ocorrido em período aberto segue regra aprovada: sem bypass acidental de `contas_fechamento_guard` e sem alterar competência fechada.
- Falha da RPC de estorno deixa original, saldo e status intactos.

## E. Segurança, RLS e integração do ERP

- `admin` e `financeiro` autenticados chamam somente as RPCs permitidas; empregado sem papel financeiro, cliente, `anon` e `service_role` não executam operações.
- Tentar forjar `responsavel_id`, valor pago, saldo, estado, origem ou hora no payload: servidor ignora/rejeita campos não aceitos e deriva ator/estado do banco.
- Chamadas diretas antigas a `contas.valor_pago`, `status`, `pago_em` e `extratos.status/vinculo` são negadas após cutover, sem bloquear leitura ou fluxos não financeiros autorizados.
- Data de cada pagamento atualiza caixa mensal pelo movimento e meio; conta não gera ao mesmo tempo receita/saída em `contas` e `pedidos`.
- Suprimento/sangria não duplicam valor entre conta e movimento de caixa.
- DRE com parcial segue somente a política contábil aprovada, sem reconhecer total original e parcelas em duplicidade.
- Pedido cancelado/reembolsado não é considerado pagamento de conta nem estorno financeiro sem movimento comprovado.
- CSV exige seleção explícita de conta; não usa descrição/data/valor para deduplicação. OFX só recebe escopo FITID depois do mapeamento de conta validado.

## Critérios de aprovação em staging

- Schema e migrations reais do staging registrados; não inferidos da pasta local.
- Usuários de teste com papéis definidos e contas/extratos sintéticos.
- Evidência de uma única escrita sob concorrência, replay idempotente e rollback integral.
- Contagens e hashes pré/pós conferidos; históricos e saldos antigos preservados.
- Matriz RLS/grants, `SECURITY DEFINER`, `search_path` e funções antigas revisadas por segundo revisor.
- Fechamento mensal, DRE, pedidos, caixa, importações e reversões reconciliados por cenário.
- Plano de restauração e decisão explícita do proprietário antes de qualquer ativação fora de staging.
