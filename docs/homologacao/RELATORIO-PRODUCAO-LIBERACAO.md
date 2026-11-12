# RELATÓRIO — Correção funcional final da Produção (Avisar caixa / Liberar retirada)

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · SHA do código: `3e33be4` (deploy `2125ce4`)

---

## 1. O que estava errado

As duas ações faziam **a mesma transição** (`pronto → aguardando_motoboy`), inclusive em pedidos de **retirada** — contrariando o próprio fluxo do projeto (`STATUS_FLOW_RETIRADA`: `recebido → em_producao → pronto → entregue`, que **nunca** passa por `aguardando_motoboy`).

## 2. Estados e marcas reais usados (nada inventado)

| Recurso | Origem | Uso |
|---|---|---|
| `pedidos.status` | enum `order_status` (7 valores) | `pronto` = pronto; retirada nunca vira `aguardando_motoboy` |
| `pedidos.conferido_em` / `conferido_por` | migration 0084 — *"E1: conferência final da cozinha"* | **portão** das duas ações |
| `pedidos.pronto_em` | migration 0023 | momento em que o pedido ficou pronto |
| `pedidos.retirado_em` / `retirado_por` | schema | **confirmação da retirada** (preservada; não é marcada aqui) |
| `pedidos.motoboy_id` | identidade canônica (K9.2) | **não é tocado** por estas ações |
| `notificacoes` | tabela real, lida pela Central de Pedidos (`op-avisos`) | aviso interno ao caixa/balcão |
| `notificacoes_log` | auditoria com chave única `idempotencia` | `pedido\|status\|canal\|dia` (mesmo padrão de `lib/notificacoes.ts`) |
| `STATUS_FLOW_RETIRADA`, `ETAPAS_OPERACIONAIS`, `podeTransitar` | `lib/format.ts`, `lib/pedido-status.ts` | regras de fluxo canônicas |

> As RPCs `conferir_pedido_cozinha` / `retirar_pedido_cliente` (migration 0084) estão **desativadas por flag** (`VITE_FF_CONFERENCIA_FINAL`, `VITE_FF_*` ausentes no Vercel) — por isso a implementação usa as **colunas e a tabela reais** com a mesma semântica documentada no banco, sem ativar flag nem aplicar migration.

## 3. Transições implementadas

### 🔔 Avisar caixa (pedido de **entrega**)

| Etapa | Efeito |
|---|---|
| Pré-condições | `tipo_entrega = entrega` · `status = pronto` · `conferido_em` presente |
| Efeito 1 | INSERT em `notificacoes` (`tipo = pedido_pronto_caixa`, título com nº do pedido, cliente, modalidade e observações, `link = /central-entregas?pedido=<id>`, `lida = false`) |
| Efeito 2 | Auditoria idempotente em `notificacoes_log` (chave `pedido\|pronto\|caixa\|dia`, best-effort) |
| **Não faz** | ❌ não muda `status` (segue `pronto`) ❌ não atribui/liba motoboy (`motoboy_id` intocado) ❌ não envia WhatsApp ❌ não mexe em estoque/cupom/pagamento |
| Resultado | Pedido continua **disponível para o fluxo correto da Central de Entregas** (em `pronto`, aparece como "aguardando" até a atribuição, que é feito na Central) |

### 🏪 Liberar retirada (pedido de **retirada**)

| Etapa | Efeito |
|---|---|
| Pré-condições | `tipo_entrega = retirada` · `status = pronto` · `conferido_em` presente · `retirado_em` **ausente** |
| Efeito 1 | INSERT em `notificacoes` (`tipo = pedido_liberado_retirada`, "liberado para retirada", balcão, observações) |
| Efeito 2 | Auditoria idempotente em `notificacoes_log` (chave `pedido\|pronto\|retirada\|dia`) |
| **Não faz** | ❌ **nunca** `aguardando_motoboy` ❌ **nunca** `entregue` (não marca entregue ao cliente) ❌ não mexe em estoque/cupom/pagamento |
| Resultado | Pedido **liberado no balcão**; `status` permanece `pronto` (= "Pronto para retirada" no rótulo do projeto) e a **confirmação da retirada (`retirado_em`) continua disponível** para o balcão/cliente |

### ✓ Finalizar (em preparo → pronto) — gateways das ações

Passa a registrar a **conferência final** (`conferido_em`, `conferido_por`, `pronto_em`), exatamente como a RPC `conferir_pedido_cozinha` faz no banco (*"não muda status, não entrega, não substitui produtos"*), e muda o status para `pronto` (`ETAPAS_OPERACIONAIS.conferencia_ok → "pronto"`). Sem isso, nenhum pedido teria conferência e as duas ações ficariam sempre bloqueadas.

## 4. Testes (`npm run teste:producao` — 27 asserts, sem banco/rede)

| # | Cenário | Resultado |
|---|---|---|
| 1 | Entrega pronta + conferida → Avisar caixa | ✅ liberado; aviso com nº, cliente, modalidade, obs., link e `lida=false` |
| 2 | Retirada pronta + conferida → Liberar retirada | ✅ liberado; aviso descreve a liberação no balcão |
| 3 | Conferência pendente → bloquear | ✅ bloqueio com motivo "conferencia pendente" nos dois casos |
| 4 | Clique repetido → impedir duplicação | ✅ chave idempotente `pedido\|status\|canal\|dia`; retirada já confirmada é bloqueada |
| 5 | Ausência de efeitos indevidos | ✅ fluxo de retirada sem `aguardando_motoboy`; aviso não altera o pedido; entrega/retirada não se misturam; fora de `pronto` e cancelado não liberam |

Também: `npm run typecheck` ✅ · `npm run build` ✅ (22,5s / 18,8s / 5,3s) · `npm run teste:guard` ✅ 41/41 · `git diff --check` ✅

## 5. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-5skwucah0-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_DMC14Jh6QEzMwtFSZk467DQ7vDp6` |
| **Target** | `preview` — **NÃO é Production** |
| SHA deploy = SHA local | ✅ `2125ce48adc8ba5a188d838fb0366ba5393112b0` |
| Production | ✅ inalterada (`dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` · `main` @ `366074f`) |

## 6. Capturas

| Arquivo | Conteúdo |
|---|---|
| `docs/erp-dark/prints/producao-PREVIEW-desktop.png` | Produção desktop **do Preview hospedado** (Avisar caixa / Liberar retirada / Conferido em) |
| `docs/erp-dark/prints/producao-PREVIEW-celular.png` | Produção mobile (390×844) |
| `docs/erp-dark/prints/gestao-PREVIEW-desktop.png` | Dashboard — inalterado |
| `docs/erp-dark/prints/pdv-PREVIEW-desktop.png` | PDV — inalterado |

## 7. Seguranca

Nenhuma escrita remota durante os testes (regras puras + fixtures locais; no modo conferência as ações ficam bloqueadas com aviso). Sem migration, sem alteração de Supabase, sem alteração de Production, sem push para `main`.

**Aguardo a sua aprovação antes de publicar em Production e de seguir para a Central de Entregas.**
