# PROMPT ÚNICO — CUTOVER NO LOVABLE CLOUD (ERP NÉIA SALGADOS)

> Este arquivo é o **prompt completo** a ser enviado à Lovable Cloud no dia do
> corte. Ele substitui qualquer nova auditoria: todas as decisões já estão
> tomadas, homologadas e registradas.
>
> **Antes de enviar**, preencher o bloco de autorização no final e anexar os
> arquivos do pacote (`docs/auditoria/cutover-final/`).

---

## MENSAGEM PARA A LOVABLE CLOUD

````text
# CUTOVER DO ERP NÉIA SALGADOS — EXECUÇÃO AUTORIZADA

Você vai executar o cutover do ERP Néia Salgados no projeto Supabase
`iqirsunzgavsuhgyjjsi` (host `iqirsunzgavsuhgyjjsi.supabase.co`) e publicar o
bundle de corte. Tudo já foi homologado. **Não crie novas análises, não
questione o plano, não improvise correções.**

Artefato de corte (já gerado, validado e pronto):
  versão   : 1792429500000
  rótulo   : cutover-2026-10-19-a1
  SHA-256  : 0006762e66db57ad532b78cec8da95d24fefa6dfc98f1eb01f86a4bd9bf05329
  manifesto: docs/auditoria/homologacao-staging/BUILD-CUTOVER.json

## REGRAS INEGOCIÁVEIS

1. A migration **0088 NÃO DEVE SER APLICADA**. Ela substitui uma RPC legada
   cujo único chamador não existe no bundle de corte (0 call sites
   comprovados). Se você notar qualquer chamador vivo de
   `reservar_estoque_atomica`, **PARE** e reporte.
2. As **19 reservas históricas** ficam em **QUARENTENA**: não reconcilie, não
   ajuste, não credite estoque, não mude status. A reconciliação é
   pós-cutover.
3. **Não altere `produtos.preco`** — nem dos 54 produtos `combo_50`, nem de
   qualquer outro. A única configuração de preço é
   `categorias.combo_preco_unit`, com os 5 valores do seed da 0097 (1.60 /
   2.30 / 2.30 / 3.70 / 2.40). O preço do combo não muda para o cliente.
4. **Nenhuma correção improvisada em produção.** Se algo divergir do esperado,
   **PARE**, mantenha a operação fechada e reporte o erro (comando, saída,
   horário, pedido envolvido).
5. Erro crítico = parar e manter fechado. Erro crítico = migration falha,
   estoque diverge, débito duplicado, crédito duplicado, pedido sem reserva,
   cancelamento sem liberação correta, frontend antigo consegue operar, combo
   com quantidade incorreta, RLS/ACL permitindo caminho legado, pagamento
   inconsistente.
6. Use `--set ON_ERROR_STOP=1` em **todo** comando psql: a primeira instrução
   que falhar aborta o script.
7. Os scripts do pacote são **fail-closed**: devolvem `PRECHECK_OK`,
   `CONFIGURACAO_OK`, `LOCKDOWN_OK`, `CONTROLADO_OK`, `VERIFY_POS_CORTE_OK`,
   `SMOKE_DATABASE_OK` ou `QUARANTENA_OK` — ou levantam `NO-GO` e param.
8. Os scripts estão em `docs/auditoria/cutover-final/`. Rode-os **da pasta**.

## SEQUÊNCIA (execute exatamente nesta ordem)

### 0. Fechar a operação
Publique o aviso de manutenção e bloqueie novos pedidos (cardápio/pedido e
balcão). A loja precisa ficar fechada do passo 1 ao passo 12.

### 1. Confirmar backup
Confirme que existe um backup válido e recente do Lovable Cloud para o projeto
`iqirsunzgavsuhgyjjsi` (data, tamanho, e que ele abre). Registre o identificador.
**Sem backup confirmado = PARE.**

### 2. Rodar `01_PRECHECK.sql` (read-only)
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 01_PRECHECK.sql
```
Esperado: `NOTICE: PRECHECK_OK`.
Se aparecer `EXCEPTION NO-GO: ...` → **PARE** e reporte a lista de condições.
Não aplique nada.

### 3. Aplicar as migrations
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 02_MIGRATIONS-CUTOVER.sql
```
Este arquivo consolida, **na ordem**, as 11 migrations homologadas:
0087, 0089, 0090, 0091, 0092, 0093, 0094, 0095, 0096, 0097, 0098.
**0088 não está nele e não deve ser aplicada.** Verifique o resultado com
`05_VERIFY-POS-CORTE.sql` depois da configuração.

### 4. Configurar os combos
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 03_CONFIGURACAO-CUTOVER.sql
```
Esperado: `NOTICE: CONFIGURACAO_OK`.
Se apontar uma categoria de combo ativa sem preço, **configure o preço dela** e
rode o script de novo. Não mexa em `produtos.preco`.

### 5. Fechar os caminhos legados (ACL)
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 08_LOCKDOWN-ACL.sql
```
Esperado: `NOTICE: LOCKDOWN_OK`. Este passo é obrigatório: fecha o DML direto
em `reservas_estoque`/`estoque_movimentacoes` e o EXECUTE das RPCs legadas
para `authenticated`.

### 6. Verificar o estado do banco
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 05_VERIFY-POS-CORTE.sql
```
Esperado: `NOTICE: VERIFY_POS_CORTE_OK`.
(Neste momento `controlado` ainda está `false`; o script sinaliza isso como
condição até o passo 8. Não é erro neste ponto.)

### 7. Publicar o bundle de corte
O bundle é compilado pela plataforma a partir do fonte, lendo `.env.production`
(versionado). Confirme que o arquivo versionado contém:
```
VITE_FF_CRIACAO_ATOMICA=on
VITE_FF_CONSUMO_RESERVA=on
VITE_FF_CANCELAMENTO_ATOMICA=on
VITE_FF_RESERVA_ATOMICA=off
VITE_BUILD_VERSION=1792429500000
VITE_VERSAO_MINIMA=1792429500000
VITE_BUILD_LABEL=cutover-2026-10-19-a1
```
Publique. Depois confirme:
```bash
curl -s -D- https://<host>/api/versao
```
Esperado: HTTP 200, `cache-control: no-store`,
`"atual":"1792429500000"`, `"minimo":"1792429500000"`, `"corte":true`.
Defina `VERSAO_MINIMA=1792429500000` no runtime do servidor (bloqueia bundles
antigos). **Se `/api/versao` não responder com esses valores, PARE.**

### 8. Ativar `controlado` (ponto exato do plano homologado)
Só agora, com migrations aplicadas, lockout feito e bundle publicado:
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 04_ATIVAR-CONTROLADO.sql
```
Esperado: `NOTICE: CONTROLADO_OK`.
O script falha fechado se a tabela não existir, se houver mais de um registro,
ou se `controlado` já estiver `true`.

### 9. Verificações finais
```bash
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 05_VERIFY-POS-CORTE.sql
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 06_SMOKE-DATABASE.sql
psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 07_QUARENTENA-19-RESERVAS.sql
```
Esperado: `VERIFY_POS_CORTE_OK`, `SMOKE_DATABASE_OK`, `QUARANTENA_OK`.
Confirme também que um navegador **com bundle antigo** (aberto antes do corte)
aparece bloqueado com a tela "Atualização obrigatória".

### 10. Smoke funcional (no aplicativo, pedidos de teste)
Execute com **quantidade mínima de dados reais** e registre pedido, estoque
antes, estoque depois, resultado esperado e obtido:
1. checkout — retirada
2. checkout — entrega
3. PDV
4. atendimento
5. combo 50 e combo misto (composição, soma = quantidade, estoque por componente)
6. estoque conferido antes/depois
7. retirada parcial (e segunda retirada parcial)
8. cancelamento sem consumo (devolve tudo)
9. cancelamento com consumo (devolve **só** o não consumido)
10. pagamento: Pix pendente e pagamento confirmado; cancelamento de pedido pago **bloqueado**
11. produção (entrar em produção **não** consome reserva)
12. entrega (até `em_rota`)
13. fila de impressão (1 job `pendente`; sem hardware necessário)
14. `/api/versao` respondendo `corte: true`

### 11. Decidir
- Todos os passos verdes → **GO**: reabrir a operação.
- Qualquer divergência → **NO-GO**: manter a operação fechada, reaplicar
  `ROLLBACK-CUTOVER.md` conforme o cenário (A/B/C/D) e reportar.

### 12. Reabrir
Só após o GO. Publique o aviso de reabertura e reative o canal de pedidos.

## RELATÓRIO FINAL (entregar ao responsável)

Para cada passo: comando, saída (NOTICE/resultado), tempo, e qualquer
divergência. Inclua:
- identificador do backup usado;
- as 11 migrations aplicadas, na ordem, com saída;
- `combo_preco_unit` final por categoria;
- saída de `05_VERIFY`, `06_SMOKE`, `07_QUARANTENA`;
- resultado do smoke funcional (14 itens, com estoque antes/depois);
- confirmação de que as 19 reservas seguem em quarentena e sem crédito;
- confirmação de que o frontend antigo está bloqueado;
- decisão final: GO ou NO-GO, com horário e responsável.

## NÃO FAZER (em nenhuma hipótese)

- aplicar a migration 0088;
- reconciliar, ajustar ou creditar as 19 reservas;
- alterar `produtos.preco` de qualquer produto;
- usar `UPDATE`/`DELETE` direto em `pedidos`, `pedido_itens` ou
  `reservas_estoque` — a escrita passa pelas RPCs (0095/0091/0093);
- corrigir estoque manualmente ("ajustar" saldo) — só via `cancelar_pedido_atomico`;
- restaurar backup para "voltar atrás" depois de haver pedidos novos (apaga
  pedidos, reservas, consumos e ledger — e gera crédito indireto);
- reabrir a operação antes do smoke funcional verde.
````

---

## BLOCO DE AUTORIZAÇÃO (preencher antes de enviar)

| Campo | Valor |
|---|---|
| Autorizado por | ____________________ |
| Data/hora da autorização | ____ / ____ / ______  ____:____ |
| Janela de execução | ____:____ → ____:____ |
| Hora limite para abortar | ____:____ |
| Responsável pelo GO | ____________________ |
| Responsável técnico | ____________________ |
| Responsável pela operação | ____________________ |
| Responsável pelo rollback | ____________________ |
| Impressão automática é indispensável no 1º dia? | [ ] sim [ ] não |
| TANCA T1–T5 homologado? | [ ] sim [ ] não — PENDÊNCIA OPERACIONAL PRÉ-GO-LIVE |

**Anexar ao prompt:** `01_PRECHECK.sql`, `02_MIGRATIONS-CUTOVER.sql`,
`03_CONFIGURACAO-CUTOVER.sql`, `04_ATIVAR-CONTROLADO.sql`,
`05_VERIFY-POS-CORTE.sql`, `06_SMOKE-DATABASE.sql`,
`07_QUARENTENA-19-RESERVAS.sql`, `08_LOCKDOWN-ACL.sql`.
