# Auditoria de impressão — payload, fila, renderer e TANCA TP-550/XP-80C

Data: 2026-10-19. **Nenhuma impressão física foi executada.**

## 1. Contrato da fila

Medido no PG16.4 (`fila_impressao`):

- `payload` é **`text` NOT NULL DEFAULT ''`**, não `jsonb`;
- `trabalho_uuid` é `text NOT NULL UNIQUE`;
- `impressora` é `text NOT NULL DEFAULT 'Tanca TP-550'`;
- `status` aceita `pendente`, `enviando`, `impresso`, `erro`, `cancelado`;
- `tipo` aceita `pedido`, `teste`, `ficha_cozinha`.

O payload é texto puro, uma linha por comando visual, sem ESC/POS binário.
Isso é compatível com o agente atual, que grava o texto em arquivo UTF-8 e o
entrega ao Windows.

## 2. Payload textual

`src/lib/impressao.ts`:

- `LARGURA_CUPOM = 42`;
- `semAcento()` normaliza NFD e remove tudo fora de `ASCII 0x20–0x7E`;
- `lin()` trunca cada linha em 42 colunas;
- `linhaItem()` foi corrigido para **reservar a largura do valor antes de
  truncar a descrição**. Antes, um nome longo produzia `R$ 80,` no cupom;
- `textoCupom()` monta: título ENTREGA/RETIRADA, data, **Entrega prevista**,
  marca, pedido, itens, cliente, endereço/bairro/CEP/complemento/referência,
  entregador, pagamento, totais e observações;
- `impressaoDireta()` agora passa `prevista` (antes calculava `horario` e
  descartava; a linha “Entrega prevista” nunca aparecia na via direta).

Teste local com pedido de nome longo:

- maior linha = **42** colunas;
- caracteres fora de ASCII = **0**;
- linha `Entrega prevista` presente;
- linha `Total` presente;
- preço preservado (`R$ 80,00`).

Evidência: `C:\Users\User\pgtest\print-payload-test.mts` (executado com
`npx tsx`, sem impressora) e regressões E6.21–E6.25 em
`scripts/e6-impressao.test.mjs`.

## 3. Renderer Windows

`print-agent/imprimir.ps1`:

- `System.Drawing.Printing.PrintDocument` (GDI+), não envio RAW/ESC-POS;
- fonte **Consolas Bold**, tamanho derivado da largura útil e limitado a
  6–18 pt;
- papel exato `80(72.1) x 3276 mm`, com fallback para qualquer papel que
  contenha `3276`;
- margens de 6 unidades e desenho em `MarginBounds`;
- `DrawString` síncrono via `add_PrintPage` (evita página em branco com
  `Register-ObjectEvent`);
- saída por exit code: 0 = enviado, 1 = falha.

Parser PowerShell: **0 erros** (`Parser::ParseFile`).

## 4. Hardware disponível nesta máquina

`Get-Printer` retornou apenas:

- Microsoft XPS Document Writer;
- Microsoft Print to PDF;
- HP Smart Tank 580-590;
- Fax.

**Não há TANCA TP-550 nem driver XP-80C instalado nesta máquina.** Portanto:

- não foi possível validar `PrinterSettings.IsValid`, o nome do papel, a
  largura real, o alinhamento ou o corte;
- o teste físico continua **pendente** e é pré-requisito para o cutover;
- o script está sintaticamente válido, mas não foi executado contra o alvo.

## 5. Compatibilidade provável

| Item | Avaliação |
|---|---|
| Texto ASCII | compatível com impressora térmica; evita acentos que quebram drivers |
| 42 colunas | conservador para 80 mm (XP-80C costuma operar em 42/48); não foi medido no papel |
| Papel 3276 mm | nome específico do driver XP-80C; se o driver não expuser, o fallback por `3276` cobre |
| GDI+ | depende do driver Windows; não é RAW ESC/POS. Pode haver diferença de fonte/margem |
| Consolas | presente no Windows padrão; se ausente, GDI+ pode cair em fonte proporcional e desalinhar |
| Acentuação | removida; “São” vira “So” — esperado, não é bug de layout |

## 6. Riscos residuais

1. **Duplicidade em falha de atualização**: o agente imprime e depois atualiza
   `fila_impressao`/`pedidos`; se a atualização falhar, o job pode voltar para
   `erro` e ser reimpresso. É entrega “at least once”; o `trabalho_uuid` evita
   duplicidade de enfileiramento, não de spool.
2. **Fallback `Out-Printer`**: imprime texto puro com a fonte padrão do
   Windows, sem o layout de 42 colunas. Foi mantido apenas como contingência;
   se aceitar o trabalho, o agente agora retorna sucesso (antes lançava erro e
   podia duplicar).
3. **`fichaDireta`** usa `trabalho_uuid: ficha:${Date.now()}`; dois cliques
   podem gerar duas fichas. Para produção, usar chave determinística por
   janela/evento.
4. **Campos não enviados na via direta**: `pedidosCliente`, `motoboy`,
   `agendadoEm`/`agendadoPara` não são passados por `impressaoDireta`; o
   entregador sai `-`. O checkout legado monta um payload mais completo, mas
   não o enfileira. Definir qual via é a oficial antes do cutover.
5. **Status de pagamento**: `impressaoDireta` só marca `PENDENTE_PGTO` quando
   `pagamento_status === "pendente"`; valores nulos/outros aparecem como
   `CONFIRMADO`. Validar o default real do pedido.

## 7. Veredito de impressão

**Compatível em nível textual/estrutural; não homologado fisicamente.**
Antes do cutover:

1. instalar o driver XP-80C e a TANCA TP-550 no notebook da loja;
2. rodar `textoTeste()` e um cupom real de 42 colunas;
3. conferir papel `80(72.1) x 3276 mm`, margem, fonte e ausência de corte;
4. testar reimpressão e falha de energia/rede;
5. só então considerar a impressão P0 fechada.
