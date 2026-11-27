# Central da Atendente — retomada operacional (checkpoint local)

Data: 27/11/2026  
Branch isolada: `central-atendente-retomada-opencode`  
Base: `resgate-visual-h01-h07-codex` @ `4c703e4`  
Publicação: **não realizada nesta etapa** (aguardando aprovação do proprietário).

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
    atualização de `pagamento_status`/`pagamento_em`. A única diferença em
    relação à 0106 é a guarda de autorização.
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
| `npm run teste:recebimento-balcao` (novo) | 7 testes passaram |
| `npm run teste:seguranca` | 31 testes passaram |
| `npm run build:homolog` | passou; bundle com 0 referências de produção |
| `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol` | destino autorizado (executado antes do build) |
| Ensaio PostgreSQL 17 descartável (`scripts/central-pg17/executar.ps1`) | 54 asserções `OK`; compatibilidade, comportamento, concorrência e reversão |

O ensaio PostgreSQL 17 foi executado em cluster **nativo descartável**
(`scripts/central-pg17/executar.ps1`), pois o daemon Docker não está disponível.
O runner aplicou a cadeia limpa até `0123`, depois `0136` + `0139`/`0140`/`0141`,
e rodou a suíte `retirada-quitacao-balcao.test.sql`, concorrência e reversão em
banco separado `central_retirada_teste`, sempre em `127.0.0.1`, com desligamento
ao final. **54 asserções `OK`** passaram. Evidência:
`C:\Users\User\AppData\Local\Temp\opencode\neia-central-atendente-pg17-852265c5842e4387971632c1588ec3fd\sql.log`.

Cobertura confirmada: atendente com `receber_pagamento` sem Admin; atendente e
Admin sem capacidade sem acesso ao botão `pode_receber`; Admin continua
autorizado na RPC financeira da 0106 (regra preservada, não aumento de escopo);
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
| `central-atendente-retomada-opencode` | `91dd909d473ac0725af148c2eaad0e260283826b` |
| `checkpoint-central-atendente-retomada-local-01` | tag anotada `609b739` → `91dd909` |
| `estoque-operacional-vinculos` | `ffd626574201da6f2a5f457a4d244d92842a48a1` |
| `checkpoint-estoque-operacional-vinculos-local-02` | tag anotada `540e29c` → `ffd6265` |

`git ls-remote` confirmou os quatro refs no remoto. As frentes Central e estoque
continuam separadas; nenhum merge foi feito.

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

## Segurança de ambientes

- Nenhuma migração remota, deploy, merge ou acesso à produção foi feito; o único
  push foi o backup explicitamente autorizado acima, em refs isolados.
- Nenhuma credencial ou segredo foi impresso ou versionado.
- Todas as validações usaram destino explícito `lflzlcqinarrcgncafol`;
  `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao`.
- `.env.homolog.local` é local/ignorado e contém apenas configuração pública.
- `npm run teste:seguranca` passou com 31/31 testes.

## Pendências reais

1. Provisão manual de `receber_pagamento` em homologação: o pré-voo anterior
   não encontrou perfil com essa capacidade nem motoboy vinculado.
2. Conferência visual no endereço oficial de homologação após publicação
   autorizada, com atendente sem Admin e com Admin sem capacidade.
3. Aplicação coordenada de `0139`/`0140`/`0141` em homologação, sem reaplicar
   `0134`–`0136`, com reconciliação de histórico se usada via SQL direto.
4. Integração com a frente de estoque e edição comercial completa permanecem
   aguardando autorização; não foram implementadas nesta rodada.

## Roteiro de publicação (somente após autorização)

1. Sincronizar com `origin`, conferir a base da branch oficial e os refs isolados.
2. Aplicar `0139` → `0140` → `0141` em homologação com destino declarado e
   barreira de segurança, registrando o histórico; **não reaplicar** `0134`–`0136`.
3. Rodar os testes de regressão pertinentes e provisionar um perfil de teste com
   `receber_pagamento`.
4. Publicar na branch oficial `resgate-visual-h01-h07-codex` no endereço fixo de
   homologação, com `VITE_DEMO_PREVIEW=0`; validar visualmente e aguardar
   aprovação manual do proprietário.
5. Produção permanece protegida: só após autorização expressa, janela combinada
   e registro documental.

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
