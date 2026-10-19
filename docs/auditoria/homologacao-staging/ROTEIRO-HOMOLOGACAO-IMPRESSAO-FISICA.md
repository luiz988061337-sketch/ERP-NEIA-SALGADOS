# Roteiro de homologação física de impressão — TANCA TP-550

**Status:** NÃO EXECUTADO. Este roteiro é para execução presencial, com a
impressora física. Nenhuma impressão foi simulada como se fosse hardware real.
Classificação no relatório pré-cutover: **homologação física pendente**.

## 1. Identificação do ambiente

Preencher antes de começar:

| Campo | Valor |
|---|---|
| Data/hora | |
| Responsável | |
| Loja/unidade | |
| Impressora | TANCA TP-550 (nº de série: ________) |
| Firmware | |
| Driver | XP-80C (versão: ________) |
| Porta | USB (nome no Windows: ________) |
| Largura do papel | 80 mm (72,1 mm imprimível) — bobina térmica |
| Agente de impressão | `print-agent` (versão/commit: ________) |
| Máquina | Windows (versão: ________) |
| Pedido fictício | nº ________ / UUID ________ |

Anexar ao final: foto da etiqueta da impressora, tela de `Get-Printer`, tela de
`Get-PnpDevice`/porta USB, e cupons físicos numerados.

## 2. Pré-requisitos

1. Impressora ligada, papel térmico 80 mm instalado, tampa fechada, sem erro
   luminoso.
2. Driver XP-80C instalado e selecionado como impressora padrão do agente.
3. `Get-Printer` mostra a TP-550 como `Pronto` (não `Offline`, não `Erro`).
4. Agente de impressão configurado com a impressora correta e fila
   `fila_impressao` acessível.
5. Nenhum outro processo/aba com o mesmo pedido aberto durante o teste.
6. Separar 5 cupons numerados (A–E) para evidência.

## 3. Testes obrigatórios

### T1 — Impressão normal de pedido fictício

1. Criar um pedido fictício **pago** com:
   - 2 itens de produtos diferentes;
   - 1 item com observação (`sem cebola`), se o fluxo permitir;
   - taxa de entrega ou retirada;
   - total com centavos (ex.: R$ 37,90).
2. Confirmar o pagamento para gerar o job.
3. Verificar no banco: **1 job** em `fila_impressao` para o pedido.
4. Acionar o agente uma única vez.

**Aceite:**
- [ ] Sai **exatamente 1** cupom.
- [ ] Cabeçalho com nome da loja, pedido, data/hora, cliente e telefone.
- [ ] Itens com quantidade, nome e preço unitário corretos.
- [ ] Total, taxa, desconto (se houver) e forma de pagamento corretos.
- [ ] Acentuação/ç/ã/õ saem legíveis (sem `?` ou caracteres trocados).
- [ ] Corte de papel funciona ao final, sem puxar o cupom pela metade.
- [ ] Largura útil respeitada: nenhuma linha cortada à direita.
- [ ] Cupom A anexado.

### T2 — Duplo clique / dupla execução do agente

1. Criar outro pedido pago (cupom B).
2. Clique duas vezes seguidas no botão de imprimir, ou execute o agente duas
   vezes em menos de 2 segundos.
3. Verificar `fila_impressao`: deve existir **1 job** (mesmo `trabalho_uuid`).

**Aceite:**
- [ ] Sai **1 cupom**, não 2.
- [ ] O segundo clique não cria job duplicado nem reimprime.
- [ ] Cupom B anexado.

### T3 — Reimpressão legítima

1. Criar pedido pago (cupom C).
2. Imprimir normalmente (1 cupom).
3. Usar a ação de **reimpressão** com motivo registrado (não o botão de
   impressão normal).
4. Verificar no banco: novo job com tipo/identificador de reimpressão e motivo.

**Aceite:**
- [ ] Sai **1 cupom adicional** (total 2 cupons físicos).
- [ ] O cupom de reimpressão é identificável (texto/marca de reimpressão, se
      implementado) ou o motivo está auditado.
- [ ] A reimpressão não duplica o job original.
- [ ] Cupom C (original + reimpressão) anexado.

### T4 — Pedido cancelado não imprime

1. Criar pedido pago (cupom D).
2. **Antes** de imprimir, cancelar o pedido pelo fluxo atômico (0093).
3. Executar o agente.

**Aceite:**
- [ ] Nenhum cupom novo sai para o pedido cancelado.
- [ ] Job antigo, se existir, permanece preservado e não é reenfileirado.
- [ ] `fila_impressao` não ganha job novo após o cancelamento.
- [ ] Cupom D **não** é anexado (não houve impressão).

### T5 — Caracteres, corte e largura

1. Criar pedido com nome de cliente e item contendo:
   - acentos: `João, pão, açúcar, linguiça, coração`;
   - cedilha e til: `Néia, São Paulo, endereço`;
   - símbolo de moeda e vírgula decimal: `R$ 12,34`;
   - nome longo (40+ caracteres) para testar quebra de linha.
2. Imprimir (cupom E).

**Aceite:**
- [ ] Todos os caracteres saem corretos no cupom físico.
- [ ] Nome longo quebra em linhas, sem truncar ou invadir a margem.
- [ ] Preços alinhados e com 2 casas decimais.
- [ ] Corte automático ao final.
- [ ] Cupom E anexado.

## 4. Evidências obrigatórias

- [ ] 5 cupons físicos (A–E), numerados e assinados pelo responsável.
- [ ] Foto da impressora com o cupom saindo.
- [ ] Print de `Get-Printer` com status `Pronto`.
- [ ] Print da porta USB e do driver XP-80C.
- [ ] Consulta SQL antes/depois de `fila_impressao` para T1–T4.
- [ ] Registro de qualquer ruído, falha de corte, papel enroscado ou caractere
      incorreto.

## 5. Critério de aprovação

A homologação física só é **APROVADA** se T1–T5 passarem integralmente e todas
as evidências estiverem anexadas. Qualquer falha de hardware/driver/corte exige
correção e repetição do teste correspondente.

Se a impressora/driver não estiverem disponíveis, o resultado é
**HOMOLOGAÇÃO FÍSICA PENDENTE** — não converter em “aprovado” por teste
simulado.
