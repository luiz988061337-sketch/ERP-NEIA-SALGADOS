# Central da Atendente | Incidente P0 no prazo de assados

## Incidente em 27/11/2026

O endereço fixo permaneceu no commit `968664d`. Durante a validação do
integrado `e36c0bc`, o Supabase de homologação (`lflzlcqinarrcgncafol`)
rejeitou o item assado de um pedido com `transicao_nao_permitida`.
O gatilho `pedido_acrescentar_prazo_assado` da 0132 executava um UPDATE no
pedido. O `SECURITY DEFINER` mudava o papel efetivo do UPDATE, enquanto a
guarda `pedidos_guard_update` continuava vendo o JWT do cliente. O cliente
podia cancelar o próprio pedido recebido, e a guarda rejeitava as demais
alterações. A preservação de prazo da 0132 aceitava mudanças aninhadas em
geral e não resolvia a interação com a guarda.

| Registro em homologação | Situação |
| --- | --- |
| `20261127164234` (0130) e `20261127164318` (0131) | Ativos. |
| `20261127164358` (0132) | Aplicado e compensado por `20261127165105`. As colunas e o histórico foram preservados. |
| `VITE_FF_ACEITE_ATENDENTE` e `VITE_FF_RETIRADA` | Desligadas no Preview da branch oficial. |

O reteste após a compensação gravou o item assado com o papel do cliente.
A consulta à janela do incidente encontrou zero pedidos criados no período.

## Correção local

A [migration 0134](../../../drizzle/migrations/0134_pedido_prazo_comercial_correcao.sql)
verifica a assinatura da função e do gatilho de proteção encontrados em
homologação. Mantém o corpo da guarda, o RLS, os privilégios e a proteção
financeira. O único tratamento especial é o ajuste interno de uma janela
existente de pedido imediato recebido. O papel efetivo deve ser
`postgres` dentro da cadeia do gatilho, os dois horários devem avançar
exatamente dez minutos, o indicador deve mudar para verdadeiro e toda a
parte restante do pedido deve ser idêntica. A comparação inclui valores,
pagamento, status, identidade e agendamento.

O cálculo usa o cadastro do produto, inclusive no combo de composição
estruturada. O checkout legado envia uma indicação de assado quando grava
o combo como texto. Para esse caso, o adicional só entra após a gravação
de um item sem produto associado, com o formato de combo do checkout,
quantidade correspondente e categoria de assados do catálogo. O texto
legado continua sem a composição por sabor no banco. A indicação no
pedido, sozinha, mantém a janela base.

O lock do UPDATE e a reavaliação do indicador limitam o acréscimo a uma
vez por pedido. O gatilho considera pedidos criados a partir da
instalação, preserva prazos históricos e deixa os agendados com
`agendado_para` e a entrada na cozinha 1h30 antes. Os chamados a estoque,
reservas, baixas e FEFO ficam com as rotinas existentes. A 0129 e a 0133
continuam reservadas ao OpenCode, com seus registros livres na
conferência desta etapa.

## Validação e publicação

Passaram 24 verificações em PostgreSQL 17.11 local descartável com o
[roteiro de teste](../../../scripts/homologacao-pg17/prazo-comercial-0134.test.mjs).
O ensaio reproduziu a falha da 0132, exercitou a 0134 com a guarda vigente
e comprovou a reversão. Incluiu fritos, assados, pedidos mistos, combos,
congelados, as duas modalidades, agendamento, PDV, RLS, cancelamento,
proteção de valores, status e prazos, reenvio e duas sessões concorrentes.
Passaram também as 40 verificações Node das suítes selecionadas.

O ambiente local usa as regras de acesso pertinentes e claims de teste.
O ensaio do PDV executa o percurso SQL do balcão com papel de funcionário.
A validação com sessões reais de navegador fica para a homologação
autorizada.

1. Após autorização específica, reconferir o alias oficial, a base da
   branch e a assinatura da guarda. Validar o alvo explícito com a
   barreira de ambientes, `NEIA_AMBIENTE=homologacao` e
   `VITE_DEMO_PREVIEW=0`.
2. Aplicar e registrar apenas a 0134 em `lflzlcqinarrcgncafol`. Conferir
   a continuidade do histórico e repetir a compra de fritos e de
   assados com cliente de homologação enquanto o alias serve a versão
   estável. Validar combo, cancelamento e PDV.
3. Depois dos testes de banco, validar as dependências das flags e
   preparar a publicação no endereço fixo. Com cliente, atendente,
   Produção e Entregas, confirmar recebimento, som, aceite, prazos,
   avisos sem F5 e a finalização por modalidade.

## Reversão

Se a validação encontrar falha, manter ou voltar o alias para o
deployment estável `dpl_Bb2c6DRtASHpDqbW1vpynxG4G8ui` e manter as flags
desligadas. Em homologação, aplicar como compensação registrada o
[SQL de reversão](../../../scripts/homologacao-pg17/reverter-prazo-comercial-0134.sql).
Ele restaura a vinculação original da guarda, remove os gatilhos e as
funções de prazo e preserva as colunas, os pedidos e o histórico de
migrations. Depois, conferir a venda de assados com o papel cliente.
