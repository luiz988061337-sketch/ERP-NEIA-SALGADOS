# Complemento B — hardening do delta incremental (laboratório)

Etapa **B-Laboratório**. Nada aqui foi aplicado no Supabase hospedado, no Auth,
no Storage ou no job `processar_lembretes`. Todo o material é local e isolado;
o lote original (`00-*` a `03-*`, `ORIGEM.json`, `executar-local.ps1`) **não foi
alterado**.

## 1. Arquivos

| Arquivo | Papel |
|---|---|
| `04-complemento-hardening.sql` | Complemento único, transacional, com guarda de laboratório |
| `complemento-hardening.test.sql` | Testes T1–T6, só em `lfl_partial` |
| `README.md` | Este registro de decisões e evidências |

Teste estático (sem banco): `node scripts/homologacao-complemento.test.mjs`.

## 2. O que o complemento faz — e de onde veio cada regra

Nenhuma regra foi inventada. Cada item reproduz uma migration já aprovada.

| Item | Origem | Efeito |
|---|---|---|
| `contas_fechamento_guard()` + `contas_fechamento_trg` | `0083_hardening.sql:304-325` | Bloqueia INSERT/UPDATE/DELETE em `contas` de competência fechada |
| `caixa_sessao_aberta_unica` | `0072_financeiro_caixa_contas.sql` | No máximo uma sessão de caixa `aberta` |
| `rotas_preparando_motoboy_uniq` | `0084_etapas_operacionais.sql` | No máximo uma rota `preparando` por motoboy |
| `notificacoes_log_idem_idx` | `0104_notificacoes_whatsapp.sql` | Idempotência única no log de notificações |
| ACL das 10 RPCs financeiras + 1 função de trigger | convenção de `02-estorno-compativel.sql` | Fecha `EXECUTE` herdado do DEFAULT ACL |
| Menor privilégio nas tabelas | uso real medido em `src/` | Remove `DELETE` (e escrita em 2 tabelas) |

### 2.1 Correção de uma conclusão anterior

A análise da Fase B afirmou que **22 das 29 tabelas não tinham policy**. Isso era
um **falso negativo de grep**: as policies existem, mas estão escritas como
blocos `DO $policy$ ... EXECUTE 'CREATE POLICY ...'` em
`00-permissoes-novas.sql:176-231`. A cobertura real é **45 policies em 29/29
tabelas**.

Por isso o complemento **não cria policy nenhuma**. O teste estático
`regressao: as 29 tabelas novas tem policy` existe para impedir que esse falso
negativo volte.

### 2.2 Triggers de reserva/consumo: deliberadamente fora

`0095_criar_pedido_com_reserva.sql:1319-1340` marca `exigir_reserva_producao` e
`exigir_consumo_producao` como **"NAO INSTALADO"** e instrui: *"descomentar
SOMENTE na etapa de ativação, após a reconciliação dos pedidos históricos e com
controlado=true. NAO descomentar nesta etapa."*

O delta mantém apenas as variantes de teste `neia_exigir_*`. Instalar os
gatilhos reais agora bloquearia pedidos legítimos. **Decisão pendente do
proprietário**, registrada em comentário no SQL.

## 3. Menor privilégio: o que foi medido

Varredura de `src/**/*.{ts,tsx}`:

- **Nenhuma** das 15 tabelas abaixo sofre `.delete()` no app.
- Escrita direta existe em: `contas`, `caixa_sessoes`, `contas_bancarias`,
  `extratos`, `fechamentos_mensais`, `precificacao_config`, `preco_historico`,
  `acertos_motoboy`, `funcionarios`, `escalas`, `pontos`, `vales`,
  `config_entrega`.
- `plano_contas` e `centros_custo`: **zero referência** em `src/` (só tipos).

Aplicado:

1. `REVOKE DELETE ... FROM authenticated` nas 15 tabelas.
2. `REVOKE INSERT,UPDATE` em `plano_contas` e `centros_custo` (ficam `SELECT`).

Leitura e as escritas usadas pelo app foram preservadas — o teste T6 falha se
alguma delas desaparecer.

## 4. Evidências executadas

### 4.1 Teste estático — 12/12

```
node scripts/homologacao-complemento.test.mjs
✔ complemento e' uma unica transacao, com guarda de laboratorio
✔ complemento nao executa operacao administrativa nem cria estrutura de negocio
✔ os 3 indices unicos sao identicos aos das migrations de origem
✔ guarda de fechamento reproduz 0083 e o trigger e' identico
✔ todo objeto criado em 03-capacidades recebe tratamento de ACL
✔ as 10 RPCs financeiras: revoga PUBLIC/anon/service_role e concede authenticated
✔ funcao de trigger do ledger nao e' executavel por ninguem
✔ DELETE so' e' revogado das tabelas que realmente tinham DELETE concedido
✔ escrita direta e' removida apenas das tabelas sem uso no app
✔ regressao: as 29 tabelas novas tem policy (nao repetir o falso negativo)
✔ triggers de reserva/consumo permanecem NAO instalados (decisao de 0095)
✔ nenhum GRANT de tabela e' ampliado pelo complemento
```

### 4.2 Aplicação real em mini-laboratório

O laboratório original (`lfl_partial` com o dump) **não existe mais** neste
ambiente: `partial-restore.list` e `roles-definitions-local.sql` (suporte privado
do `ORIGEM.json`) não estão presentes, e reconstruí-los exige nova autorização.

Substituto usado, claramente rotulado: banco `lfl_partial` descartável no cluster
local da porta 5433, com apenas os objetos que o complemento toca, as 11
assinaturas exatas e o mesmo efeito de GRANT de `00-permissoes-novas.sql`.
As guardas do complemento foram satisfeitas de verdade
(`127.0.0.1`, db `lfl_partial`, role `restore_0123456789ab`, GUC do ensaio).

Resultado:

```
CREATE DATABASE / bootstrap ............ EXIT 0
04-complemento-hardening.sql ........... EXIT 0  (COMMIT)
complemento-hardening.test.sql ......... EXIT 0  "COMPLEMENTO B: testes locais aprovados (T1-T6)"
re aplicação (idempotência) ............ EXIT 0
banco e role de teste removidos ........ 0 db / 0 role
```

Matriz final de `authenticated` (mini-lab):

```
acertos_motoboy      INSERT,SELECT,UPDATE
caixa_sessoes        INSERT,SELECT,UPDATE
centros_custo        SELECT
config_entrega       INSERT,SELECT,UPDATE
contas               INSERT,SELECT,UPDATE
contas_bancarias     INSERT,SELECT,UPDATE
escalas              INSERT,SELECT,UPDATE
extratos             INSERT,SELECT,UPDATE
fechamentos_mensais  INSERT,SELECT,UPDATE
funcionarios         INSERT,SELECT,UPDATE
plano_contas         SELECT
pontos               INSERT,SELECT,UPDATE
precificacao_config  INSERT,SELECT,UPDATE
preco_historico      INSERT,SELECT,UPDATE
vales                INSERT,SELECT,UPDATE
```

`notificacoes_log` e `rotas_entrega` aparecem com `DELETE` **apenas** porque o
bootstrap de teste concede DML amplo; no delta real `notificacoes_log` nunca
recebe `DELETE` e `rotas_entrega` é tabela antiga, fora das 29.

## 5. Decisões que dependem do proprietário

1. **Triggers de reserva/consumo**: instalar só após reconciliação dos pedidos
   históricos e virada de `reserva_proveniencia_config.controlado` para `true`.
2. **`plano_contas` / `centros_custo`**: hoje `SELECT` apenas. Se houver cadastro
   pela UI de administração, é preciso conceder `INSERT/UPDATE` — ou criar RPC
   dedicada (preferível).
3. **UPDATE direto em `contas`, `extratos`, `fechamentos_mensais`**: mantido
   porque o app usa hoje. Migrar para RPC exclusiva é endurecimento posterior.
4. **`preco_historico`**: app só insere; `UPDATE` foi mantido por precaução.

## 6. Riscos que continuam abertos

- Nada foi provado sobre Auth, PostgREST, RLS hospedada, ACLs gerenciadas
  (441 diferenças em `role_table_grants`), `pg_cron`, Vault ou Realtime.
- As pre-checagens dos 3 índices **param** a aplicação se houver duplicidade.
  Isso é intencional: corrigir dados históricos exige decisão do proprietário.
- O complemento substitui `contas_fechamento_guard` (função nova, não existia
  hospedada) e instala trigger sobre `public.contas`. Em base com lançamentos em
  competência fechada, o gatilho passa a bloquear escrita — comportamento
  desejado, mas precisa de janela.

## 7. Ordem de execução no laboratório

```
psql ... -c "SET neia_homologacao.ensaio='LFL_LOCAL_ADITIVO_0123';" \
     -c "SET ROLE restore_<12 hex>;" -v ON_ERROR_STOP=1 \
     -f 04-complemento-hardening.sql \
     -f complemento-hardening.test.sql
```

Deve rodar **depois** de `03-capacidades-financeiras.sql`, porque as 11
assinaturas precisam existir para o `REVOKE`/`GRANT`.
