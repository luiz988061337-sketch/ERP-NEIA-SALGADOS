# Fase 1 — forma efetiva de pagamento, ledger e guarda de edição

Data: 27/11/2026  
Branch isolada: `central-atendente-retomada-opencode` (base `c9f0891`)  
Checkpoint local: tag `checkpoint-central-fase1-forma-efetiva-local-01` (sem push)  
Status: **preparada e validada localmente; NÃO aplicada em homologação, NÃO publicada**.

Esta etapa é somente a Fase 1 autorizada nesta rodada. Fases 2–5 estão registradas
em [fases2-5-pendentes.md](fases2-5-pendentes.md) e continuam aguardando
autorização específica. Nenhuma alteração foi integrada na branch oficial
`resgate-visual-h01-h07-codex`, nenhum deploy foi feito e produção não foi
acessada.

## Regras implementadas

- A forma escolhida na criação do pedido continua sendo apenas a **preferência
  original**. Cada recebimento informa a forma **efetivamente usada**: dinheiro,
  Pix, crédito ou débito.
- Pix e cartão só são contabilizados após **confirmação efetiva explícita**;
  selecionar a modalidade não basta. O Pix é destinado à conta da Néia Salgados
  usando `loja_config.pix_chave` — não existe chave fixa no código.
- Dinheiro informa o valor entregue. O excedente é **troco** gravado no evento,
  nunca receita. Não é permitido valor acima do saldo.
- Pagamentos parciais e mistos no mesmo pedido geram **um evento por recebimento**,
  com valor líquido, forma efetiva, valor entregue quando aplicável, troco,
  data/hora, responsável, chave de idempotência e saldo resultante.
- Falha de conexão não informa sucesso: a tentativa mantém a mesma chave, pode ser
  consultada por `verificar_recebimento_por_chave`, não cria nova cobrança e
  bloqueia a retirada até confirmação no ledger. Não há fila offline nesta etapa.
- Pedidos já quitados pelo site não recebem nova cobrança (`sem_saldo`).
- A edição de observações passou a ter guarda de estágio também no backend:
  estados terminais/`em_rota` e retirada confirmada são recusados;
  `pronto`/`aguardando_motoboy` exigem admin; `recebido`/`em_producao` aceitam
  admin ou atendente. Motivo, autoria, horário e valores anterior/posterior
  continuam auditados.

## Preservação

- Ledger `pedido_pagamento_eventos`, idempotência, travamento por chave, limites
  de valor e quitação da 0136 permanecem intactos.
- A capacidade `receber_pagamento` continua sendo autoridade para **todos** os
  papéis, inclusive Admin. Não foi criado papel, usuário ou permissão nova.
- `consultar_recebimento_retirada` continua devolvendo a forma original; a nova
  `forma_pagamento_efetiva` é gravada somente no evento do recebimento.
- A assinatura antiga `registrar_pagamento_pedido(uuid,bigint,text)` foi
  preservada, mas não grava: exige a RPC nova com forma efetiva. Não há
  sobrecarga de função nem caminho paralelo de gravação.
- Eventos anteriores **não foram alterados**: as colunas novas são anuláveis e
  a interface mostra “não registrado” quando não há dado — sem inventar troco
  nem forma.
- RLS do ledger permanece intacta. Perfil sem `SELECT` recebe
  “Ledger indisponível para este perfil”, nunca “Sem valor recebido”.
- Menu lateral aprovado, 224 px, paleta, botões amarelos, alertas com voz
  feminina em pt-BR, repetição/reconhecimento, aceite, cozinha, retirada,
  Histórico/Financeiro Premium e atalho Montar rota foram preservados.

## Arquivos da Fase 1

- `drizzle/migrations/0142_forma_efetiva_pagamentos.sql` — preparada, não aplicada.
- `scripts/central-pg17/reverter-0142.sql` — reversão local sem perda de colunas.
- `scripts/central-pg17/fase1-forma-efetiva.verificar.sql` e
  `fase1-forma-efetiva.test.sql` — verificação estrutural e comportamento.
- `scripts/central-pg17/executar.ps1`, `concorrencia-registrar.sql`,
  `scripts/homologacao-pg17/retirada-quitacao-balcao.test.sql` — runner e suítes
  atualizados para a assinatura com forma efetiva.
- `src/lib/recebimento-retirada.ts`, `src/lib/pedido-status.ts`,
  `src/lib/pedido-pagamento-ledger.ts`, `src/lib/financeiro.ts` — regras puras,
  guarda de edição, leitura canônica do ledger e agregação pela forma efetiva.
- `src/components/central-pedidos.tsx`, `recebimentos-pedido.tsx`,
  `editar-observacoes-pedido.tsx`, `admin/pedidos-h02.tsx`,
  `admin/pedidos-h02-detalhes.tsx`, `src/routes/financeiro.tsx` — seleção da
  forma efetiva, confirmação de Pix/cartão, chave da loja, inconclusivo, aba
  Pagamento/Histórico, CSV do ledger e Financeiro Premium sem duplicidade.
- `scripts/recebimento-balcao-atendente.test.mjs` — 14 testes estáticos e de regra.

## Validação executada (somente local)

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | passou |
| `npm run teste:recebimento-balcao` | 14/14 |
| `npm run teste:seguranca` | 31/31 |
| `npm run build:homolog` | passou; bundle com 0 referência de produção |
| `scripts/central-pg17/executar.ps1` | todas as etapas `OK`: compatibilidade, 0142, comportamento, concorrência e reversão |

O ensaio PostgreSQL 17 usou cluster nativo descartável em `127.0.0.1`, com a
cadeia limpa até `0123`, `0136`/`0139`/`0140`/`0141`, depois `0142`. Foram
**94 asserções `pg_temp.ok`** nas verificações SQL (31 da suíte nova da Fase 1,
8 de verificação estrutural, 8 de compatibilidade, 32 de retirada/quitação,
5 de concorrência e 10 de reversão), além das 4 checagens de status em sessões
concorrentes. A reversão restaurou as RPCs anteriores e preservou as colunas
anuláveis, sem apagar histórico.

O primeiro `build:homolog` foi **bloqueado corretamente** pela barreira porque o
terminal herdava `VITE_SUPABASE_URL` de produção. O build foi refeito com as
variáveis explícitas de homologação lidas de `.env.homolog.local` (sem imprimir
segredos) e passou com `arquivos com referência de produção: 0`.

## Situação em homologação (28/11/2026)

1. Concluído: `0142` aplicada em `lflzlcqinarrcgncafol` com destino declarado em
   `--project-ref`, histórico reconciliado na versão `20261128071000` sem
   reaplicação de DDL.
2. Concluído: checkpoint `412fc03` integrado por fast-forward na branch oficial
   `resgate-visual-h01-h07-codex`, sincronizado com `origin`, e publicado no
   alias fixo com `NEIA_AMBIENTE=homologacao` e `VITE_DEMO_PREVIEW=0`.
3. Pendente: validação manual do proprietário e testes com perfil `atendente`
   real. Homologação não possui esse perfil e a RLS do ledger não foi ampliada;
   nenhum teste manual foi executado nesta etapa.
4. Produção não foi promovida. `ruioyioynwwwiqbjznoa` permanece protegida.

O relatório completo da homologação está em `homologacao-fase1.md`.
