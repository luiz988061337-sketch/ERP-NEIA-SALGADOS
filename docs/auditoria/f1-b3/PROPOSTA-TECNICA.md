# F1-B3 — proposta técnica de pagamentos parciais

> **DOCUMENTAÇÃO DE REVISÃO — NÃO EXECUTAR.**
>
> Esta proposta não é migration, não é SQL pronto para aplicação e não autoriza staging ou produção. Blocos rotulados como rascunho são referências de desenho; não copiar para diretórios de migrations nem executar antes de revisão do schema real, decisão das pendências e autorização expressa.

Projeto: ERP Néia Salgados

Branch observada: `homologacao-finalizacao`

HEAD observado: `2e0418265590c4319a892a4ab739355a12ba5b21`

## 1. Estado atual observado

Leitura local de `AGENTS.md`, `src/routes/financeiro.tsx`, `src/lib/financeiro.ts`, `src/lib/ofx.ts` e migrations financeiras relacionadas. Não houve conexão ao Supabase. A migration `0072` declara no comentário de cabeçalho que não foi aplicada; o estado de aplicação de todas as migrations no banco permanece **desconhecido**.

### Schema local

- `0072_financeiro_caixa_contas.sql`: `contas.valor numeric(10,2)`, não negativo; `status` tem CHECK com `pendente`, `paga`, `vencida`, `cancelada`. O CHECK não aceita `parcial`.
- `0078_financeiro_completo.sql`: adiciona `contas.valor_pago numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0)`. O comentário da migration o descreve como baixa parcial, mas não há tabela de movimentações por pagamento.
- `0082_extratos_conciliacao.sql`: extrato tem `conta_bancaria_id` anulável e campos de status/vínculo; não existe linha financeira de pagamento vinculada ao extrato.
- `contas_bancarias` tem nome, tipo, saldo inicial e ativa; não contém identidade bancária externa validada.
- `0083_hardening.sql`: `contas_fechamento_guard()` bloqueia INSERT/UPDATE/DELETE de conta quando a competência calculada por vencimento/criação está fechada. `estornar_conta(uuid,text)` redefine status, valor pago e data para zero/nulo e registra em `admin_logs`; essa operação não é compatível com um ledger imutável sem ser substituída.

### Semântica e caminhos atuais

- `src/routes/financeiro.tsx::darBaixa` soma `valor_pago + entrada` no cliente. Não relê/bloqueia a conta no banco, não verifica o saldo atual sob concorrência e não impede `entrada > saldo`. `pago_em` só é preenchido ao quitar; pagamentos parciais não têm data individual.
- `mudarConta` grava `status='paga'` diretamente, sem registrar valor ou movimentação. `pagoValor` interpreta esse status como pagamento integral e usa `valor` mesmo quando `valor_pago` está diferente.
- A conciliação atual grava `valor_pago=valor da conta` e `status='paga'`; isso sobrescreve um total parcial anterior e não registra o valor específico do extrato como uma movimentação.
- `movimentoCaixa` cria uma conta já paga e grava `valor_pago=valor`, sem registro independente do movimento.
- `statusConta` em `src/lib/financeiro.ts` não tem estado `parcial`; `vencida` é derivada da data e prevalece para qualquer conta aberta. A interface calcula fluxo projetado como `valor - valor_pago`.
- O gráfico mensal de saídas usa `pago_em` da conta e o agregado `valor_pago`/`valor`; assim, não consegue atribuir vários pagamentos aos meses corretos.
- `montarDRE` recebe contas a pagar apenas quando estão pagas e soma o valor original. A DRE atual reconhece a conta inteira na quitação; isso não representa necessariamente o calendário de pagamentos parciais.
- `src/routes/contador.tsx` lê `valor`, `status`, `vencimento` e `pago_em`, mas não `valor_pago` nem movimentações. `pedidos.pagamento_status` é um fluxo separado; não deve ser contado também como baixa de uma conta a receber ligada ao mesmo pedido.
- A migration `0083` permite `estornar_conta` zerar o agregado e `admin_logs` é best-effort, não trilha imutável. A regra de mês fechado também precisa ser conciliada com pagamentos feitos em mês aberto de uma conta cuja competência original já fechou.

## 2. Fórmulas e estado propostos

Guardar valores da nova movimentação como centavos inteiros (`bigint`) ou `NUMERIC` exato. Recomendação: entrada da RPC em centavos inteiros; conversões para moeda ocorrem apenas para exibição. Nunca somar valores monetários usando `Number` como autoridade.

Para cada conta:

```text
total_pago_centavos = saldo_legado_validado_centavos
                    + soma(pagamentos_confirmados_centavos)
                    - soma(estornos_confirmados_centavos)

saldo_aberto_centavos = valor_original_centavos - total_pago_centavos
```

Invariantes no servidor: `0 <= total_pago <= valor_original`; `saldo_aberto = valor_original - total_pago`; pagamento novo `> 0`; pagamento novo `<= saldo_aberto`. Saldo negativo ou valor acima do saldo sempre resulta em conflito, sem crédito/adiantamento implícito.

Estados persistidos propostos:

- `pendente`: total pago zero e saldo positivo.
- `parcial`: total pago positivo e saldo positivo.
- `paga`: saldo exatamente zero.
- `cancelada`: somente por operação autorizada, preservando pagamentos e exigindo decisão sobre saldo/estornos.
- `vencida`: manter compatibilidade histórica; preferir derivar atraso da data e saldo. Para saldo parcialmente pago e vencido, a apresentação deve mostrar as duas dimensões (por exemplo, “parcial vencida”), sem confundir com quitação.

Adicionar `parcial` exige adaptar o CHECK local de status e os tipos/leitores do frontend em etapa futura. Não presumir o nome da constraint no banco; obtê-lo em catálogo no staging. Corrigir colisões históricas antes de validar um CHECK novo.

`valor_pago` pode permanecer como total materializado para compatibilidade, atualizado exclusivamente dentro da RPC. A fonte de verdade passa a ser o ledger mais o saldo legado validado. `pago_em` permanece a data da quitação total; cada movimento guarda sua própria data. Não atualizar `valor` original para refletir pagamentos.

## 3. Estrutura aditiva proposta

### `conta_pagamentos` (ledger append-only)

Uma linha por pagamento ou estorno confirmado:

- `id`, `conta_id` (FK com exclusão restrita), `tipo_conta` (`pagar`/`receber`).
- `evento` (`pagamento`/`estorno`), `valor_centavos` assinado; pagamento positivo e estorno negativo.
- `ocorrido_em` gerado pelo servidor, `meio`, `origem` (`manual`, `conciliacao_bancaria`, `caixa`), `extrato_id` opcional.
- `responsavel_id` derivado de `auth.uid()`, `idempotency_key`, `reverte_pagamento_id` e motivo obrigatório para estorno.
- Estado de linha confirmado. Erros de negócio não criam movimentação; uma chamada que falha inesperadamente reverte integralmente.

Restrições conceituais: chave idempotente única por ator; um extrato pode vincular no máximo uma linha de pagamento; cada estorno aponta para pagamento da mesma conta e não pode exceder seu saldo ainda não estornado. Não permitir UPDATE/DELETE comum do ledger. Correções geram movimentos compensatórios.

### `conta_saldos_legados`

Um snapshot auditável por conta na migração, com saldo pago legado em centavos, classificação da evidência, instante de captura, validador/motivo se revisado. Não criar pagamentos fictícios para valores agregados antigos; data, meio e responsável de cada parcela passada são desconhecidos. O snapshot não substitui nem apaga `contas.valor_pago`.

Contas antigas em que `status='paga'` mas `valor_pago` é zero/menor que `valor`, `valor_pago > valor`, valores inválidos, cancelamento com pagamento ou estado inconsistente devem ser marcadas para revisão. Não inferir movimentações nem corrigir esses valores silenciosamente.

### `financeiro_eventos`

Trilha append-only de ações confirmadas: ator, data/hora do servidor, conta, pagamento/estorno, extrato, valor, saldo antes/depois e resultado. Leitura para papéis financeiros/admin; INSERT somente pelas RPCs; UPDATE/DELETE negados aos papéis da aplicação. Eventos de tentativas rejeitadas podem exigir trilha separada: uma exceção que reverte toda a transação também reverte o evento escrito nela.

### Importação e identidade (continuidade F1-B1/B2)

- Requerer `conta_bancaria_id` validada para importação automatizada. A seleção de CSV é manual e deve ser identificada como tal; não inferir conta por conteúdo financeiro.
- A identidade bancária deve mapear instituição + conta de forma validada, sem expor números integrais desnecessariamente. OFX pode trazer identificadores, mas o parser atual só extrai FITID e transações; a validação/mapeamento ainda precisa ser desenhada.
- Hash dos bytes originais do arquivo, por conta. Nome é metadado, não identidade.
- FITID guardado separadamente e único somente dentro da conta validada. CSV sem FITID não recebe dedupe por data/descrição/valor.
- Lote `extrato_importacoes` com unicidade `(conta_bancaria_id, sha256)`; linhas com unicidade `(importacao_id, linha)`. Uma RPC grava lote e todas as linhas na mesma transação. Mesmo arquivo/conta concorrente retorna “já importado”, sem inserir cópia.
- FITID repetido na mesma conta e conflitos históricos devem retornar conflito revisável; nunca `ON CONFLICT DO NOTHING` sem notificação.

## 4. Contratos das RPCs

Estes contratos não são implementados nesta etapa. Resultados de sucesso e conflitos esperados podem ser objetos estruturados. Erros inesperados devem abortar a transação.

### `registrar_pagamento_conta`

Entrada: `p_conta_id`, `p_valor_centavos bigint`, `p_meio`, `p_idempotency_key uuid`. Origem manual fixada no servidor; não aceitar que o cliente se declare conciliação ou caixa.

Servidor: autentica usuário; valida papel e meio; bloqueia conta `FOR UPDATE`; valida conta ativa, saldo, situação, valor e competência; verifica idempotência e payload; insere movimento; recalcula agregado/status; registra auditoria; retorna `pagamento_id`, total pago, saldo e estado. Repetição da mesma chave/payload retorna o resultado anterior; a mesma chave com payload diferente retorna conflito.

### `conciliar_extrato_pagamento`

Entrada: `p_extrato_id`, `p_conta_id`, `p_idempotency_key`. Não aceita valor do navegador: o servidor lê o valor do extrato.

Servidor bloqueia extrato primeiro e conta depois (ordem fixa); valida extrato pendente e sem vínculo, sinal positivo para receber/negativo para pagar, tipo compatível, conta elegível e `abs(valor_extrato) <= saldo_aberto`. Insere uma movimentação de pagamento parcial ou integral, recalcula total/saldo/status, vincula o extrato e registra auditoria, tudo na mesma transação. Um extrato só pode vincular uma conta; divisão entre contas fica fora do escopo.

O caminho atual de conciliação com `pedido` não deve ser convertido silenciosamente em conta a receber. Até haver decisão sobre pagamentos parciais de pedidos, manter o contrato de pedido separado e proibir que o mesmo recebimento seja contado no pedido e numa conta vinculada.

### `estornar_pagamento`

Entrada: `p_pagamento_id`, `p_valor_centavos`, `p_motivo`, `p_idempotency_key`. Insere movimento compensatório, nunca apaga nem altera pagamento original. Bloqueia conta e pagamento em ordem definida; limita estorno ao saldo não estornado; atualiza agregado/estado e registra evento. Papel autorizador para estornos ainda precisa de aprovação do proprietário.

### Fechamento e chamadas antigas

Criar RPC sem retirar writes atuais deixa caminho de bypass: `contas` e `extratos` têm policies/grants de DML e `darBaixa`, `mudarConta`, `movimentoCaixa`, `conciliar` e `estornar_conta` escrevem diretamente ou zeram agregados. A migration 0083 precisa de substituição compatível; não basta adicionar a tabela de pagamentos.

## 5. Rascunho conceitual de migration — documentação, NÃO EXECUTAR

O bloco é um desenho incompleto para discussão, não uma migration válida/pronta. Nomes de constraints, papéis, extensões e schema devem ser confirmados no staging. O rascunho não foi enviado a diretório de execução.

```sql
-- DOCUMENTO DE PROPOSTA F1-B3 — NÃO EXECUTAR EM NENHUM BANCO.
-- A migration final será aditiva e dependerá de preflight do schema/dados.
-- Conceito: ledger imutável, snapshot legado, eventos e lote de importação.
CREATE TABLE public.conta_pagamentos ( ... campos descritos nesta proposta ... );
CREATE TABLE public.conta_saldos_legados ( ... snapshot sem inventar pagamentos ... );
CREATE TABLE public.financeiro_eventos ( ... append-only, ator e saldos ... );
CREATE TABLE public.extrato_importacoes ( ... conta + hash + ator + estado ... );
-- Índices conceituais: idempotência; conta/FITID não nulo; lote/linha;
-- extrato vinculado no máximo uma vez; nunca FITID global.
-- Alterar CHECK de contas.status para admitir 'parcial' apenas após preflight.
-- Não definir NOT NULL retroativo nem apagar, consolidar ou reidentificar históricos.
```

Antes de DDL real: confirmar se 0072, 0078, 0082, 0083 e 0085 estão aplicadas; obter constraints e grants reais; levantar dados fora de invariantes; definir escopo da identidade bancária e do fechamento.

## 6. Segurança e matriz proposta

| Papel | Contas/ledger | Registrar ou conciliar | Conta bancária/identidade | Estorno/correção |
|---|---|---|---|---|
| Anônimo/cliente | Sem leitura/escrita | Negado | Negado | Negado |
| Funcionário sem papel financeiro | Sem operações restritas | Negado | Sem acesso financeiro | Negado |
| `financeiro` autenticado | Leitura autorizada; sem DML direto no ledger | Permitido após grant explícito e validação da RPC | Selecionar conta validada; alterar mapeamento somente se aprovado | Pendente de aprovação de papel e limite |
| `admin` autenticado | Leitura e gestão conforme política | Permitido | Gerir/validar identidade, com auditoria | Aprovação administrativa proposta |
| `service_role` | Não usado pelo frontend | Sem EXECUTE em RPCs financeiras | Sem uso operacional da UI | Negado |

Para RPC `SECURITY DEFINER`: `auth.uid()` obrigatório, `has_role` validado dentro da função, `search_path` fixo e objetos qualificados, sem aceitar ator/estado/total do cliente, `REVOKE EXECUTE` de `PUBLIC`, `anon` e `service_role`, `GRANT EXECUTE` somente a `authenticated`. Como a função contorna RLS, a própria validação de papel e invariantes é obrigatória.

Não usar `admin_logs` como única evidência: a migration 0003 permite INSERT de staff e UPDATE/DELETE via policy administrativa; a migration 0083 registra estorno ali best-effort. A tabela nova de eventos deve ser imutável para papéis da aplicação.

## 7. Compatibilidade e não duplicação

- `contas.valor` é principal original e permanece imutável após pagamentos; ajuste de valor vira operação auditada separada.
- `contas.valor_pago` continua como agregado materializado por compatibilidade; ledger/snapshot é fonte para recalcular. Nenhum client grava esse agregado diretamente após cutover.
- `contas.pago_em` significa quitação integral; cada parcela usa seu próprio `ocorrido_em`.
- `pagoValor` não pode continuar tratando status pago como substituto automático do total financeiro sem reconciliar os casos antigos.
- Caixa deve somar movimentações por data e meio, não o total agregado da conta em `pago_em`. Suprimento/sangria precisam criar movimento no mesmo fluxo e não contar duas vezes.
- DRE deve ter regra aprovada: competência/acréscimo do valor original ou caixa por movimento. Hoje `montarDRE` recebe contas somente quando status pago e usa valor original. Não escolher uma regra contábil nesta proposta.
- Recebimentos em `pedidos.pagamento_status` são fluxo separado. Conta ligada a pedido não pode produzir uma segunda entrada; decidir se uma futura operação registra o pedido, a conta ou ambos atomicamente com uma única movimentação econômica.
- Reembolsos de pedidos não são pagamentos de conta automaticamente. `pagamento_status='reembolsado'` não prova saída real; estorno precisa de evento e comprovação próprios.
- Preservar extratos já conciliados, pagamentos/estornos novos, IDs e atores. A migration não elimina duplicidades históricas.

## 8. Sequência e rollback

1. Preflight somente leitura em staging: migrations efetivamente aplicadas, grants/RLS/triggers, estados e valores de `contas`, extratos e fechamentos; classificar históricos ambíguos.
2. Aprovar decisões de DRE, conta ligada a pedido, origem CSV, estornos e competência fechada.
3. Migration aditiva de ledger, snapshot histórico, eventos, lotes/identidade bancária e status `parcial`; sem apagar/alterar valores históricos sem validação.
4. Instalar RPCs e grants com feature flag desligada; testes RLS, concorrência, idempotência e rollback em ambiente isolado.
5. Migrar todos os writes financeiros para RPCs; compatibilizar `contas_fechamento_guard` e substituir `estornar_conta`; revisar cada relatório/caixa.
6. Cutover coordenado para impedir que clientes antigos e novos gravem simultaneamente. Ativar primeiro em staging; nenhuma produção sem nova autorização.

Rollback: desligar a feature/RPC, interromper novas escritas temporariamente, reconciliar chamadas em curso e manter ledger, snapshots e eventos. Não remover registros nem restaurar agregados manualmente. Não reativar writes antigos que possam zerar `valor_pago` ou ignorar o ledger. Preferir correção aditiva forward; qualquer rollback de app precisa manter os campos compatíveis.

## 9. Decisões ainda necessárias

1. A DRE segue competência ou fluxo de caixa para parcelas?
2. Conta ligada a pedido pode receber parcela? Qual sistema de registro e regra para não duplicar receita?
3. CSV sempre exige seleção da conta? Quem valida mapeamento bancário OFX?
4. Financeiro pode estornar ou somente admin? Quais limites e motivos?
5. Conta com saldo zero no cadastro é válida? Como tratar conta antiga paga sem prova granular?
6. Como movimentações de pagamento interagem com fechamento mensal quando o vencimento está em competência fechada?
7. Tamanho máximo de arquivo/linhas de uma RPC e necessidade de importação em lotes?
8. Quais migrations estão realmente aplicadas em staging?

**Esta documentação não autoriza implementação, migration, ativação, teste em banco nem operação financeira.**
