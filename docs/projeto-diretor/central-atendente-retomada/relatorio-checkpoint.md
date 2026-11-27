# Central da Atendente — retomada operacional (checkpoint local)

Data: 27/11/2026  
Branch isolada: `central-atendente-retomada-opencode`  
Base: `resgate-visual-h01-h07-codex` @ `4c703e4`  
Publicação: ver
[relatório de publicação](relatorio-publicacao.md) (conferência visual pendente).

## Objetivo

Corrigir, sem reconstruir a Central aprovada, as limitações confirmadas de
recebimento, navegação e edição segura de observações. Nenhuma funcionalidade
aprovada foi substituída; `ffd6265`, a tag
`checkpoint-estoque-operacional-vinculos-local-02` e a branch oficial foram
preservados.

## O que foi corrigido

### 1. Recebimento direto na Central — migrations 0139 e 0141

- `0139_recebimento_balcao_atendente.sql`
  - `consultar_recebimento_retirada` passa a aceitar
    `recebido | em_producao | pronto | aguardando_motoboy` e não exige mais
    `conferido_em` para **receber**. A conferência continua exigida para
    **retirar**, nas regras próprias da 0136.
  - `pode_receber` passa a ser
    `neia_operacao.tem_capacidade(ator, 'receber_pagamento')`. Admin deixa de
    ser pré-requisito: Admin sem capacidade não recebe; atendente com
    capacidade recebe.
  - `registrar_pagamento_pedido` mantém integralmente o ledger
    `pedido_pagamento_eventos`, a chave de idempotência, o travamento
    `pg_advisory_xact_lock`, os limites de valor, a autoria (`actor`) e a
    atualização de `pagamento_status`/`pagamento_em`. Diante da divergência
    encontrada em homologação, a guarda de `receber_pagamento` da 0106 foi
    preservada para **todos** os papéis; a única diferença é a inclusão da
    atendente na lista de papéis. Admin/Financeiro sem capacidade continuam
    bloqueados também na RPC.
- `0141_guard_recebimento_com_capacidade.sql`
  - A 0084 congelava `pagamento_status`/`pagamento_em` para não-admin e
    bloquearia a atendente mesmo após o ledger ser gravado.
  - A exceção exige capacidade financeira, nenhuma outra coluna congelada
    alterada, transição apenas para `pendente`/`pago` e, para `pago`, ledger já
    quitado no momento do `UPDATE`. Valores, identidade, promessa e entrega
    continuam protegidos.
  - A 0094 (não ocultar pagamento confirmado) e a 0136
    (`exigir_quitacao_para_retirada`) **não foram alteradas**.

### 2. Edição segura de observações — migration 0140

- Escopo restrito a `pedidos.observacoes`; itens, valores, pagamento, prazos,
  entrega, status e identidade permanecem bloqueados.
- Motivo obrigatório (mínimo 3 caracteres) e auditoria em
  `pedido_edicoes_auditoria` com valor anterior, valor novo, motivo, autor e
  data. Texto vazio é gravado como `''`, respeitando a coluna `NOT NULL`.
- A integração comercial/estoque continua **apenas especificada** no contrato
  `docs/estoques/contrato-edicao-pedidos-estoque.md`; não foi implementada.

### 3. Interface e navegação

- A Central agora abre um diálogo de **Registrar recebimento** independente de
  **Confirmar retirada**. Recebimento funciona em produção, com dinheiro, Pix,
  cartão, parciais e cálculo de troco; a retirada continua bloqueada com saldo
  pendente.
- Mensagens de falta de capacidade financeira não citam mais Admin.
- `Ver detalhes` mantém fundo escuro e contorno amarelo; `Atribuir motoboy` e
  `Montar rota` usam `#FFD252`; `Editar pedido` usa `#FFD252` e aparece na
  Central e no H02.
- Item `Central da Atendente` inserido no `AdminShell`/`MenuLateral` ao lado de
  PDV/Balcão, visível somente para Admin ou atendente. Paleta, largura de
  224 px, grupos e rodapé do menu aprovado preservados. Atalho H02 preservado.
- Correção de teste antigo: a verificação de reconhecimento de avisos estava
  desatualizada desde a migração da persistência para
  `useAlertasOperacionais`; a implementação aprovada não foi alterada.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | passou |
| `npm run teste:central` | 41 asserções passaram |
| `npm run teste:aceite-local` | 7 cenários e verificações estáticas passaram |
| `npm run teste:recebimento-balcao` (novo) | 8 testes passaram |
| `npm run teste:seguranca` | 31 testes passaram |
| `npm run build:homolog` | passou; bundle com 0 referências de produção |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` | destino autorizado (executado antes do build) |
| Ensaio PostgreSQL 17 descartável (`scripts/central-pg17/executar.ps1`) | 55 asserções `OK`; compatibilidade, comportamento, concorrência e reversão |

O ensaio PostgreSQL 17 foi executado em cluster **nativo descartável**
(`scripts/central-pg17/executar.ps1`), pois o daemon Docker não está disponível.
O runner aplicou a cadeia limpa até `0123`, depois `0136` + `0139`/`0140`/`0141`,
e rodou a suíte `retirada-quitacao-balcao.test.sql`, concorrência e reversão em
banco separado `central_retirada_teste`, sempre em `127.0.0.1`, com desligamento
ao final. **55 asserções `OK`** passaram. Evidência:
`C:\Users\User\AppData\Local\Temp\opencode\neia-central-atendente-pg17-962d06b90a6e4325808d6d8065663b6d\sql.log`.

Cobertura confirmada: atendente com `receber_pagamento` sem Admin; atendente e
Admin sem capacidade sem acesso ao botão `pode_receber`; Admin sem capacidade
também bloqueado na RPC, igual à 0106 de homologação (sem aumento de escopo);
recebimento em produção sem conferência; Pix já quitado; pagamento divergente em
revisão; parciais, saldo, idempotência, chave conflitante, valor acima do saldo e
troco (o ledger registra só o devido); colunas congeladas e ledger íntegro;
edição de observações com motivo/auditoria e escopo mínimo; bloqueio de retirada
com saldo e liberação após quitação; duas sessões concorrentes com a mesma chave
geraram **1** evento e as duas chaves distintas somaram a quitação; reversão
restaurou `0084`/`0106`/`0136`, preservou ledger/auditoria e a reaplicação não
duplicou histórico. Nenhuma asserção depende de banco remoto.

## Backup no GitHub

Confirmado que não há workflows em `.github/` e que `vercel.json` só desativa
deploys da branch oficial; o push de refs isoladas não publica produção. Feito
push **sem force** de apenas quatro refs:

| Ref | Alvo |
| --- | --- |
| `central-atendente-retomada-opencode` | `d9e4102` (validação PG17), depois ajuste da `0139` |
| `checkpoint-central-atendente-retomada-local-01` | tag anotada `609b739` → `91dd909` |
| `estoque-operacional-vinculos` | `ffd626574201da6f2a5f457a4d244d92842a48a1` |
| `checkpoint-estoque-operacional-vinculos-local-02` | tag anotada `540e29c` → `ffd6265` |

`git ls-remote` confirmou os refs no remoto. `d9e4102` foi preservado antes das
verificações finais; o ajuste da `0139` foi publicado na mesma branch isolada.
As frentes Central e estoque continuam separadas.

## Homologação — somente leitura

Com `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol`
autorizando o destino explícito, foi feita apenas consulta de leitura
(`supabase db query --linked --project-ref lflzlcqinarrcgncafol`) via
`scripts/central-pg17/inventario-homologacao*.sql`. Nenhuma escrita, migration ou
reaplicação foi executada.

| Registro remoto | Interpretação | Evidência |
| --- | --- | --- |
| `20261127172951` | `0134` aplicada | gatilho `pedido_preservar_prazo_comercial` |
| `20261127202230` | `0135` aplicada | políticas `central_atendente_*` em `realtime.messages` |
| `20261127202504` | `0136` aplicada | `pode_receber` = `has_role(ator,'admin') AND tem_capacidade(...)` e gatilho `exigir_quitacao_para_retirada` |
| `0139`/`0140`/`0141` | não aplicadas | consulta ainda exige Admin; `editar_observacoes_pedido` e `pedido_edicoes_auditoria` ausentes; guarda da 0084 sem `pagamento_sem_ledger_integro` |

Portanto `0134`/`0135`/`0136` **não devem ser reaplicadas**. `0137`/`0138` não
foram localizadas e não devem ser presumidas. A numeração `0139`–`0141` ficou
reservada à Central; a frente de estoque (`ffd6265`) permanece com sua própria
numeração e integração coordenada.

## Divergência de autorização financeira (resolvida antes da aplicação)

A verificação final em homologação (`scripts/central-pg17/verificacao-final-homolog.sql`)
revelou que a `0106` instalada contém uma guarda que não existia na cópia local:

```sql
IF NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento') THEN
  RETURN jsonb_build_object('status','nao_autorizado');
END IF;
IF NOT (public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'financeiro')) THEN ...
```

A `0139` original removia a primeira guarda para Admin/Financeiro, o que
ampliaria a autorização além da regra aprovada. A divergência foi apresentada ao
proprietário **antes de qualquer escrita remota** e a decisão foi ajustar a
`0139`: a guarda de capacidade permanece obrigatória para todos os papéis e a
atendente passa a constar apenas na lista de papéis. Corpo da `0106` remota:
3135 bytes, md5 `c641a752f7b488f36606f902b8fee3c9`; a reversão local restaura
exatamente esse corpo, verificado por asserção no ensaio PG17.

Demais verificações finais: assinaturas de `has_role`/`tem_capacidade` compatíveis,
objetos da `0140` livres, `pedidos.observacoes` `text NOT NULL DEFAULT ''`, ledger
com RLS e sem `INSERT/UPDATE/DELETE` para `authenticated`, grants das RPCs
restritos a `authenticated`, versões reservadas livres e guarda da `0084` íntegra.

## Segurança de ambientes

- As únicas escritas remotas autorizadas foram em `lflzlcqinarrcgncafol`:
  `0139`/`0140`/`0141`, reconciliação de histórico e publicação no alias de
  homologação. Produção não foi acessada para escrita nem promovida.
- Nenhum push com force, `git reset --hard`, `git clean` ou `git stash` foi usado.
- Nenhuma credencial ou segredo foi impresso ou versionado; variáveis sensíveis
  foram lidas de arquivos locais ignorados e injetadas somente no processo.
- Todas as operações usaram destino explícito `lflzlcqinarrcgncafol`,
  `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao`.
- Um deployment intermediário com banner de demonstração foi descartado antes
  de receber o alias; o build publicado foi refeito com as variáveis da branch.
- `npm run teste:seguranca` passou com 31/31 testes.

## Pendências reais

1. Provisão manual de `receber_pagamento` em homologação: o inventário encontrou
   apenas o usuário administrador sem essa capacidade e nenhum papel
   `atendente`. Nenhum perfil, Admin ou capacidade foi criado pelo agente.
2. Conferência manual no alias oficial, com atendente sem Admin e com Admin sem
   capacidade, antes de qualquer aprovação definitiva.
3. Integração com a frente de estoque e edição comercial completa permanecem
   aguardando autorização; não foram implementadas nesta rodada.

## Publicação executada

O roteiro anterior foi concluído com autorização e registrado em
[relatório de publicação](relatorio-publicacao.md):

1. Sincronização com `origin` e base da oficial confirmada em `4c703e4`.
2. `0139` → `0140` → `0141` aplicadas em homologação, sem reaplicar
   `0134`–`0136`, com reconciliação documentada do histórico.
3. Testes de regressão e barreiras de ambiente executados; não foi criado perfil
   de teste com `receber_pagamento`.
4. Integração por fast-forward e push na branch oficial
   `resgate-visual-h01-h07-codex` @ `438518f`; publicação no alias fixo de
   homologação com `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao`.
5. Produção permanece protegida; a conferência manual do proprietário ainda é
   a etapa final de homologação.

## Arquivos alterados

- Migrations: `0139_recebimento_balcao_atendente.sql`,
  `0140_edicao_observacoes_auditada.sql`,
  `0141_guard_recebimento_com_capacidade.sql`.
- Frontend: `src/components/central-pedidos.tsx`/`.css`,
  `src/components/editar-observacoes-pedido.tsx` (novo),
  `src/components/admin/admin-nav.ts`, `admin-shell.tsx`, `pedidos-h02.tsx`,
  `pedidos-h02-detalhes.tsx`, `pedidos-h02.css`, `src/routes/admin.tsx`,
  `src/routes/__root.tsx`.
- Testes: `scripts/recebimento-balcao-atendente.test.mjs` (novo),
  `scripts/homologacao-pg17/retirada-quitacao-balcao.test.sql`,
  `scripts/aceite-atendente-local.test.mjs`, `package.json`.
- Ensaio/validação: `scripts/central-pg17/` (runner PG17 descartável, checagens
  de compatibilidade/concorrência/reversão e consultas somente leitura de
  homologação).
- Documentação: este relatório.
