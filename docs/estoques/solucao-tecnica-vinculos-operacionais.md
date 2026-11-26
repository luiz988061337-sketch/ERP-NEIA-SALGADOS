# Estoque de Salgados — solução técnica dos vínculos operacionais

Status: **preparada localmente, não aplicada, não publicada**. Data: 26/11/2026.
Branch isolada: `estoque-operacional-vinculos`. Base: `e50e750`.

## Objetivo

Permitir que cada um dos 26 sabores oficiais tenha identidade de estoque própria,
independentemente da existência ou não de um produto comercial. Nenhum preço,
custo, saldo comercial antigo, lote, reserva, vínculo, layout de menu ou
funcionalidade aprovada é criado, alterado ou convertido por esta proposta.

## Diagnóstico que motivou a proposta

- Os 26 sabores oficiais estão cadastrados em `sabores_estoque` com `produto_id`
  nulo e ordem persistida; a sequência aprovada permanece em
  `sabores_estoque.ordem`, gerida por `reordenar_sabores_estoque`.
- Os 31 produtos comerciais permanecem intactos. Os saldos antigos da coluna
  comercial não comprovam existência física e não são migrados para lotes.
- Homologação tinha zero lotes, zero reservas, zero movimentações e zero vínculos
  operacionais no momento do diagnóstico.
- A rotina preparada pelo Codex em
  `scripts/preparar-operacoes-lotes-salgados.sql` cria o schema privado
  `estoque_salgados_privado` e a tabela `lotes_operacoes`, duplicando a
  idempotência já existente em `public.estoque_mov_operacoes`. Além disso, exige
  `sabores_estoque.produto_id`, rejeita saldo legado, mistura lotes ativos e
  válidos, não grava `estoque_mov`/`admin_logs` e mantém ACL incompleta. Por
  isso, **não será aplicada como está**.

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
como `unitario`/`fator_unidades = 1` sem sobrescrever nada.

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
A mesma resolução é usada pela view e pela RPC. Registros ambíguos permanecem
com `sabor_chave` nulo e continuam legíveis pelo caminho comercial.

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

## Artefatos locais

- `drizzle/migrations/0129_vinculos_operacionais_salgados.sql`: DDL, view, RPCs,
  grants/revokes e reconciliação de histórico em `schema_migrations`.
- `scripts/estoque-vinculos-salgados.test.mjs`: teste estático do contrato acima.
- `docs/estoques/diagnostico-vinculos-salgados.md`: candidatos comerciais e
  ambiguidades que continuam dependendo de conferência manual.

Nenhum arquivo de menu, `src/routes/admin.tsx`, Central de Pedidos, Central da
Atendente ou `src/lib/reserva-integracao.ts` foi alterado.

## Dependências antes de aplicar

1. Confirmar por leitura, no destino explícito
   `--project-ref lflzlcqinarrcgncafol`, que `sabores_estoque`,
   `reordenar_sabores_estoque`, `reserva_consumos` e
   `registrar_consumo_reserva(uuid,integer,uuid,uuid,text)` estão presentes.
2. Não aplicar se houver migrations concorrentes no mesmo banco ou publicação
   conflitante na branch oficial.
3. Conferir manualmente os vínculos unitários e os multiplicadores de
   embalagens. Nenhum vínculo é inferido por nome.
4. Conciliar os saldos legados dos 31 produtos antes de habilitar movimentação
   com dados reais.

## Limites atuais

- O painel aprovado ainda resolve o sabor pelo campo
  `sabores_estoque.produto_id` e bloqueia a movimentação quando ele está nulo.
  O banco proposto já suporta sabor sem produto, mas a interface só passará a
  operar assim após uma alteração de lógica de dados, sem mudança visual,
  aprovada e aplicada em etapa separada.
- Central de Relatórios e Impressão fica para etapa posterior.
- Produção (`ruioyioynwwwiqbjznoa`) permanece protegida e intocada.
- Nenhuma DDL, DML, GRANT, deploy, publicação ou alteração remota foi feita
  nesta etapa.

## Validação local e aplicação futura

Comandos executados nesta preparação:

```bash
node --test scripts/sabores-estoque.test.mjs scripts/sabores-estoque-ordem.test.mjs scripts/operacoes-salgados.test.mjs scripts/estoque-operacao-atomica.test.mjs scripts/estoque-movimento.test.mjs scripts/reserva-integracao.test.mjs scripts/estoque-vinculos-salgados.test.mjs
npm run typecheck
npm run build:homolog
npm run teste:seguranca
npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol
```

Os testes são estáticos e de contrato: concorrência real, rollback do
PostgreSQL, RLS e idempotência em banco exigem homologação isolada. O `.env`
local aponta para produção, portanto `build:homolog` e `seguranca:destino` foram
executados com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`,
`SUPABASE_PROJECT_ID`, `NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0`
definidos explicitamente na invocação; nenhuma credencial foi impressa e
nenhuma conexão remota foi aberta. `npm ci --ignore-scripts` foi necessário
apenas para instalar `tsc`/`vite` localmente.

Somente após autorização expressa:

```bash
npm run sql:homolog -- --arquivo drizzle/migrations/0129_vinculos_operacionais_salgados.sql --project-ref lflzlcqinarrcgncafol --confirmar
```

Depois: publicar no alias oficial
`https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app/admin#estoque-salgados`,
registrar checkpoint versionado e aguardar conferência manual do proprietário.
