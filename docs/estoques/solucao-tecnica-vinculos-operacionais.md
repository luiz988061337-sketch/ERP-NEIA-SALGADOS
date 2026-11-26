# Estoque de Salgados — solução técnica dos vínculos operacionais

Status: **preparada localmente, não aplicada, não publicada**. Data: 26/11/2026.
Branch isolada: `estoque-operacional-vinculos`. Base: `e50e750`. Commit local dos
artefatos iniciais: `9b24a16`. Nenhum push, deploy, migration remota ou escrita em
banco foi feito.

## Objetivo

Permitir que cada um dos 26 sabores oficiais tenha identidade de estoque própria,
independentemente da existência ou não de um produto comercial. Nenhum preço,
custo, saldo comercial antigo, lote, reserva, vínculo, layout de menu ou
funcionalidade aprovada é criado, alterado ou convertido por esta proposta.

## Leitura de homologação — único destino autorizado

Consultas somente leitura executadas com `--project-ref lflzlcqinarrcgncafol`,
`NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0`, sem usar variáveis do `.env`
como destino implícito:

- `docs/estoques/consulta-preflight-vinculos-readonly.sql`;
- `docs/estoques/consulta-preflight-atomicidade-readonly.sql`.

Resultado integral do primeiro preflight: `preflight-vinculos.json` no diretório
temporário aprovado. Nenhuma credencial foi impressa.

### Estado confirmado

| Objeto | Leitura |
| --- | --- |
| `sabores_estoque` | 26 linhas, ordem 1–26, contagens por categoria `[9, 4, 8, 2, 3]`, `produto_id = null` em todas |
| `produtos` | 31 produtos; `saldo_legado = 100` em todos; `unidade_medida = un` |
| `lotes`, `reservas_estoque`, `estoque_movimentacoes` | zero linhas em cada |
| `sabores_estoque_vinculos`, `vw_saldos_sabores_estoque` | inexistentes |
| `reserva_consumos`, `pedido_item_componentes`, `sabores_estoque` | presentes |
| `registrar_consumo_reserva(uuid,integer,uuid,uuid,text)`, `reordenar_sabores_estoque(text[],text)`, `cancelar_pedido_atomico(uuid,text)`, `criar_pedido_com_reserva(uuid,text,jsonb,jsonb)`, `pedido_cobertura_reserva(uuid)` | presentes e com `EXECUTE` para `authenticated` |
| `reservar_estoque_atomica(uuid,uuid,integer)`, `reservar_pedido_atomico(uuid)` | presentes, mas **sem `EXECUTE` para `authenticated`**; somente `postgres` |
| `exigir_reserva_producao()`, `exigir_consumo_producao()` | presentes, sem `EXECUTE` direto para `authenticated` (uso interno esperado) |
| `supabase_migrations.schema_migrations` | apenas `20261126170000` / `organizar_sabores_estoque` no filtro; `20261126190000` ausente |

As migrations 0087 e 0091 não inserem linha em `schema_migrations`; sua presença
foi confirmada pelos objetos `reserva_consumos` e
`registrar_consumo_reserva(uuid,integer,uuid,uuid,text)`. A 0128 inseriu
`20261126170000`. A 0129 permanece ausente.

`saldo_legado = 100` é apenas o valor da coluna comercial `produtos.estoque`.
Ele não comprova unidades físicas, não é convertido em lote e não é usado como
saldo do sabor.

### Divergência de ACL preexistente

A leitura mostrou que `reservar_estoque_atomica(uuid,uuid,integer)`, RPC usada
pelo painel para “Reservar estoque”, tem `EXECUTE` apenas para `postgres` em
homologação. As migrations versionadas 0031, 0088 e 0098 registram grants para
`authenticated`; portanto há divergência entre o histórico versionado e o estado
real. Isto **não foi corrigido** nesta etapa: precisa de decisão do proprietário
e do responsável pela área de reservas. Enquanto não for resolvido, o botão de
reserva manual do painel pode falhar por permissão, independentemente da 0129.

## Matriz 26 × 31

A matriz completa está em
[`matriz-vinculos-salgados-26-31.md`](matriz-vinculos-salgados-26-31.md).
Resumo:

- **0 vínculos confirmados**: nenhum `produto_id` legado e nenhuma tabela de
  vínculos em homologação;
- **13 correspondências prováveis** por nome, todas dependentes de conferência;
- **13 correspondências inexistente/sem equivalente unitário**;
- **18 produtos sem vínculo unitário seguro** (bebidas, kits, genéricos,
  divergentes e sabores comerciais fora do cadastro oficial).

Tipo (`unitario`/`embalagem`) e `fator_unidades` ficam como “a decidir”. Rótulos
`15un`, `20un`, `25un`, `50un` e `100un` descrevem apresentação comercial e não
autorizam presumir fator nem converter saldo. Nenhuma linha provável foi gravada.

## Diagnóstico que motivou a proposta

- A rotina preparada pelo Codex em
  `scripts/preparar-operacoes-lotes-salgados.sql` cria o schema privado
  `estoque_salgados_privado` e a tabela `lotes_operacoes`, duplicando a
  idempotência já existente em `public.estoque_mov_operacoes`. Além disso, exige
  `sabores_estoque.produto_id`, rejeita saldo legado, mistura lotes ativos e
  válidos, não grava `estoque_mov`/`admin_logs` e mantém ACL incompleta. Por
  isso, **não será aplicada como está**.
- Os 31 produtos comerciais permanecem intactos e os saldos antigos não são
  migrados para lotes.
- A sequência aprovada permanece em `sabores_estoque.ordem`, gerida por
  `reordenar_sabores_estoque`.

## Modelo proposto

### 1. Identidade unitária

`public.sabores_estoque.chave` passa a ser a identidade canônica do estoque. O
campo `produto_id` existente fica apenas como compatibilidade comercial; não é
apagado, não é preenchido automaticamente e não passa a ser a chave do estoque.

### 2. Vínculo comercial opcional e conferido

`public.sabores_estoque_vinculos` registra, por par `(chave, produto_id)`:

- `tipo`: `unitario` ou `embalagem`;
- `fator_unidades`: quantas unidades do sabor a apresentação comercial contém;
- `ativo`, `conferido_por`, `conferido_em` e `observacao`.

Não há coluna de preço, custo, saldo, lote ou quantidade física. Um índice
parcial impede que o mesmo produto comercial fique ativo em dois sabores. Os
vínculos preexistentes em `sabores_estoque.produto_id`, se houver, são copiados
como `unitario`/`fator_unidades = 1` sem sobrescrever nada. Nesta base a cópia
produz zero linhas.

As RPCs `vincular_sabor_estoque_produto` e
`desvincular_sabor_estoque_produto` exigem `admin`, gravam `admin_logs` e
serializam alterações do mesmo sabor com `pg_advisory_xact_lock`. Nenhuma delas
escreve em `sabores_estoque.produto_id`.

### 3. Estruturas reaproveitadas

As tabelas operacionais continuam sendo as mesmas de sempre. Todas recebem
apenas a coluna opcional `sabor_chave`, com constraint garantindo que exista
`produto_id` **ou** `sabor_chave`:

- `lotes`;
- `reservas_estoque`;
- `reserva_consumos`;
- `estoque_movimentacoes`;
- `estoque_mov`;
- `estoque_mov_operacoes`.

Não há novo schema privado, nova tabela de idempotência, novo ledger ou nova
tabela de saldo. Dados antigos recebem `sabor_chave` quando o `produto_id`
corresponde ao produto legado do sabor **ou** a um vínculo conferido ativo.
A mesma resolução é usada pela view, pela RPC e pelo painel. Registros ambíguos
permanecem com `sabor_chave` nulo e continuam legíveis pelo caminho comercial.

### 4. Saldo exibido

A view `public.vw_saldos_sabores_estoque` expõe, por sabor:

- `fisico = Σ lotes com status ativo`;
- `reservado = Σ (quantidade − consumido) das reservas ativas`;
- `disponivel = fisico − reservado`;
- `vencidos` e `proxima_validade` separados para alerta.

Lotes vencidos com saldo continuam visíveis no físico e no alerta, como no painel
aprovado, mas **não entram na baixa FEFO**, que usa apenas lotes com
`validade >= hoje` da loja.

### 5. Movimentação

`public.movimentar_lote_salgado` é reescrita sobre `public.estoque_mov_operacoes`:

- ACL: `admin` ou `producao`; `ajuste` somente `admin`;
- lock do sabor, da chave idempotente, da reserva e do pedido quando aplicável;
- chave idempotente existente com mesma assinatura devolve `ja_registrado`;
  assinatura diferente aborta;
- `entrada`, `perda`, `ajuste` e `retirada` com validações próprias;
- perda/ajuste exigem lote, saldo conferido e motivo;
- retirada FEFO por `validade, created_at, id`, sem estoque negativo e sem
  comprometer reservas;
- consumo de reserva delega a `registrar_consumo_reserva` (0091), sem segunda
  baixa em `produtos.estoque`;
- grava `estoque_mov`, `estoque_movimentacoes`, `estoque_mov_operacoes` e
  `admin_logs` na mesma transação;
- `registrar_movimento_sabor` é helper interno sem `EXECUTE` para clientes.

A rotina não atualiza `produtos.estoque`. Isso preserva a regra já aprovada de
que o saldo comercial é dono apenas dos fluxos comerciais existentes.

#### Decisão sobre `p_produto`

A assinatura SQL da 0129 foi preservada: `p_produto uuid` é obrigatório na
chamada, mas aceita `null`. Os tipos gerados foram alinhados para
`p_produto: string | null` e o painel passa `produto?.id ?? null`. Assim, sabores
sem produto comercial são operáveis pela chave sem alterar a sobrecarga da
função nem os `GRANT`s. A reserva pelo RPC legado continua exigindo produto,
pois o pedido comercial referencia `pedido_itens.produto_id`; esse limite foi
mantido e sinalizado ao usuário.

## Combos e reservas — conclusões da análise

- Combos fixos de 50 e 100 unidades e combos personalizados são debitados no
  momento da **reserva**, pelo caminho atômico, com ledger negativo; a retirada
  consome a reserva sem debitar `produtos.estoque` uma segunda vez.
- 100 unidades é tratado como 2 × 50; não há multiplicador implícito novo.
- Itens de combo gravam `produto_id = NULL` e a composição em
  `pedido_item_componentes`; o débito é por componente/sabor.
- Múltiplos combos no mesmo pedido são agregados por produto antes da reserva.
- A 0095 bloqueia item com `produto_id` **e** componentes, evitando soma dupla
  no caminho controlado.
- `pedido_item_componentes` existe em homologação e as funções
  `criar_pedido_com_reserva`, `cancelar_pedido_atomico` e
  `reservar_pedido_atomico` referenciam componentes. A 0088 isolada, porém, não
  considera componentes: a proteção depende da validação da 0095 e da convenção
  de escrita.
- Risco residual: o checkout legado não persiste a composição. Item inconsistente
  com produto pai e componentes poderia somar duas vezes na 0088. Nenhuma
  alteração de checkout foi feita nesta etapa.
- O `fator_unidades` da 0129 não é consumido pela 0088/0089; ele descreve apenas
  a apresentação comercial conferida, não uma regra automática de débito.

## Integração local do painel

Preparada, **não publicada**, sem mudança visual:

- `consultarSalgados()` lê vínculos por `chave` e operações por `sabor_chave`,
  com fallback legado por `produto_id` quando a 0129 ainda não existe;
- lotes, reservas, consumos e movimentações são mesclados sem duplicar registros;
- `organizarSaboresEstoque()` aceita `operacoesPorChave` e preserva a ordem
  persistida;
- `lerSituacaoSalgado()` recebe a operação do sabor, mantendo “Não cadastrado”;
- `HistoricoSalgados` filtra por `sabor_chave` quando disponível e mantém o
  fallback por `produto_id`, com os mesmos rótulos e controles;
- movimentação usa `p_sabor: chave` e `p_produto: produto?.id ?? null`;
- nenhum arquivo de menu lateral, `src/routes/admin.tsx`, Central da Atendente
  ou CSS foi alterado.

Não foi acrescentada interface de vinculação: os vínculos devem ser gravados
pelo proprietário, após autorização, pelas RPCs conferidas ou por ferramenta
administrativa aprovada em etapa posterior.

## Artefatos locais

- `drizzle/migrations/0129_vinculos_operacionais_salgados.sql`: DDL, view, RPCs,
  grants/revokes e reconciliação de histórico em `schema_migrations`;
- `scripts/estoque-vinculos-salgados.test.mjs`: teste estático do contrato;
- `docs/estoques/diagnostico-vinculos-salgados.md`: candidatos e ambiguidades;
- `docs/estoques/consulta-preflight-vinculos-readonly.sql`: leitura de estado;
- `docs/estoques/consulta-preflight-atomicidade-readonly.sql`: leitura de
  dependências atômicas e ACL;
- `docs/estoques/matriz-vinculos-salgados-26-31.md`: matriz definitiva para
  conferência manual;
- painel e tipos gerados com a integração de dados por chave descrita acima.

## Revisão da 0129

| Aspecto | Conclusão local |
| --- | --- |
| Atomicidade | `BEGIN`/`COMMIT` únicos; DDL, grants e reconciliação na mesma transação |
| Concorrência | `pg_advisory_xact_lock` e `FOR UPDATE` em sabor, reserva, pedido e lote; concorrência real entre sessões **não provada localmente** |
| Idempotência | `estoque_mov_operacoes` reaproveitado; mesma assinatura retorna `ja_registrado`; divergência aborta |
| Permissões | `admin`/`producao`, `ajuste` só `admin`; helper interno sem acesso ao cliente; ACL da 0129 revisada estaticamente |
| FEFO | `validade NULLS LAST, created_at, id`; vencidos ficam fora da baixa e continuam no alerta |
| Reservas | Saldo protegido antes de perda/ajuste/retirada; consumo delega à 0091 sem dupla baixa |
| Cancelamentos | Não reescrito; usa `cancelar_pedido_atomico` (0093), presente em homologação |
| Auditoria | `estoque_mov`, `estoque_movimentacoes`, `estoque_mov_operacoes` e `admin_logs` na mesma transação |
| Compatibilidade | `produto_id` opcional; legado por `produto_id`; `.env` de produção não é destino; nenhuma referência a `ruioyioynwwwiqbjznoa` na migration |

A reconciliação de histórico usa SQL direto e já está documentada como tal.
A migration não deve ser reaplicada para “consertar” histórico.

## Limites atuais

- Não há harness PGlite executável no worktree. Existem harnesses PG16/PG17
  versionados, mas não prontos para execução local. Os testes da 0129 são
  estáticos; rollback real, RLS e concorrência entre sessões continuam pendentes.
- O `.env` local aponta para produção (`ruioyioynwwwiqbjznoa`). Ele não foi
  modificado e não é autoridade de destino; `scripts/verificar-banco.mjs` lê esse
  arquivo implicitamente e não deve ser usado com a configuração atual.
- Central de Relatórios e Impressão fica para etapa posterior.
- Produção permanece protegida e intocada.
- Nenhuma DDL, DML, GRANT, deploy, publicação ou alteração remota foi feita nesta
  etapa.

## Validação local

Comandos executados nesta preparação:

```bash
node --test scripts/sabores-estoque.test.mjs scripts/sabores-estoque-ordem.test.mjs scripts/operacoes-salgados.test.mjs scripts/estoque-operacao-atomica.test.mjs scripts/estoque-movimento.test.mjs scripts/reserva-integracao.test.mjs scripts/estoque-vinculos-salgados.test.mjs
npm run typecheck
npm run build:homolog
npm run teste:seguranca
npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol
```

`build:homolog` e `seguranca:destino` foram executados com variáveis de destino
explícitas para homologação, sem imprimir credenciais. `npm ci --ignore-scripts`
foi necessário apenas para instalar `tsc`/`vite` localmente.

Resultado da última execução: 24/24 testes locais, `typecheck` sem erros,
`build:homolog` concluído com bundle limpo (somente homologação), 31/31 testes de
segurança e destino autorizado para `lflzlcqinarrcgncafol`. Nenhuma credencial
foi impressa e nenhuma conexão de escrita foi aberta.

## Plano definitivo de aplicação — somente após autorização expressa

1. **Autorização e base**: obter autorização escrita do proprietário; sincronizar
   GitHub; confirmar que a branch oficial e o banco de homologação não têm
   migrations concorrentes nem publicação em andamento.
2. **Decisões pendentes**: fechar a matriz 26 × 31, definindo vínculos, `tipo` e
   `fator_unidades`; deliberar sobre a ACL de `reservar_estoque_atomica`; conciliar
   os 31 saldos legados. Nada disso é inferido automaticamente.
3. **Pré-flight final**: repetir as duas consultas somente leitura com
   `--project-ref lflzlcqinarrcgncafol`; exigir ausência de
   `sabores_estoque_vinculos`/view e de `20261126190000`.
4. **Testes locais**: rodar suíte SQL estática, `typecheck`, `build:homolog`,
   `teste:seguranca` e `seguranca:destino`; registrar saídas e Git status.
5. **Aplicar a 0129 em homologação**:

   ```bash
   npm run sql:homolog -- --arquivo drizzle/migrations/0129_vinculos_operacionais_salgados.sql --project-ref lflzlcqinarrcgncafol --confirmar
   ```

   Nunca com `--linked`, sem `--project-ref`, com `.env` implícito ou em produção.
6. **Verificação pós-migration por leitura**: confirmar tabela, view, colunas,
   funções, grants, linha `20261126190000` e zero vínculos criados sem decisão.
7. **Publicação da integração do painel**: somente no alias oficial de
   homologação, com `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao`, após a
   migration. Conferir manualmente lista, ordem, cores, formulários, histórico,
   movimentação sem produto e ausência de duplicação de baixa.
8. **Cenários obrigatórios de aceite**: entrada, perda, inventário, retirada FEFO,
   reserva/cancelamento com combo 50, 100 e personalizado, múltiplos combos,
   lote vencido com saldo, replay da chave idempotente e auditoria.
9. **Registro**: documentar resultado visual, testes, arquivos, Git status e
   pendências; criar checkpoint versionado; aguardar aprovação manual do
   proprietário antes de qualquer integração na branch oficial ou produção.

Em caso de falha antes do `COMMIT`, a transação da 0129 reverte. Depois do
`COMMIT`, não reaplicar: registrar o incidente e preparar correção versionada
separada, com novo destino explícito e autorização.
