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

A suíte PostgreSQL descartável
`scripts/homologacao-pg17/retirada-quitacao-balcao.test.sql` foi ampliada para
cobrir atendente com/sem capacidade, Admin sem capacidade, produção sem
conferência, parcial/troco, idempotência, auditoria e bloqueio de retirada.
**Não foi executada**: o daemon Docker/PostgreSQL local não está disponível
neste ambiente. Deve ser rodada em PostgreSQL 17 local antes da homologação.

## Segurança de ambientes

- Nenhuma migração remota, deploy, push, merge ou acesso à produção foi feito.
- Nenhuma credencial ou segredo foi impresso ou versionado.
- Todas as validações usaram destino explícito `lflzlcqinarrcgncafol`;
  `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao`.
- `.env.homolog.local` é local/ignorado e contém apenas configuração pública.

## Pendências reais

1. Estado remoto de homologação: deployments/aplicações `0135`/`0136`
   permanecem não confirmados. **Não reaplicar**. Antes de publicar, conferir o
   histórico remoto e coordenar a numeração `0139`–`0141` com as mudanças de
   estoque (que usam `0133` na branch própria). `0137`/`0138` não foram
   localizadas e não devem ser presumidas.
2. Provisão manual de `receber_pagamento` em homologação: o pré-voo anterior
   não encontrou perfil com essa capacidade nem motoboy vinculado.
3. Conferência visual no endereço oficial de homologação após publicação
   autorizada, com atendente sem Admin e com Admin sem capacidade.
4. Execução da suíte SQL local em PostgreSQL 17.

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
- Documentação: este relatório.
