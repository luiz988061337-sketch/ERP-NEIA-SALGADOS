# Continuidade — retomada das integrações pelo OpenCode

Data: 27/11/2026. Worktree isolada `estoque-operacional-vinculos`. Checkpoint
desta entrega: tag `checkpoint-estoque-operacional-vinculos-local-02`, acima de
`checkpoint-estoque-operacional-vinculos-local-01`.

Objetivo deste documento: permitir que o OpenCode assuma, **sem repetir trabalho
já concluído**, as integrações pendentes de checkout, PDV, Central da Atendente,
B7 e edição de pedidos quando o Codex encerrar a etapa atual. Ele é um índice
operacional, não uma nova especificação de produto.

## 1. Estado do que já está pronto (não refazer)

| Item | Estado | Onde |
| --- | --- | --- |
| Corretiva B7 completa | Rascunho, flag desligada, ensaio PG17 aprovado | `scripts/estoque-operacional/correcao-b7-agendamentos-rascunho.sql` |
| Reversão B7 | Não destrutiva, idempotente, ensaiada duas vezes | `scripts/reverter-correcao-b7-agendamentos.sql` |
| Reversões `0129`/`0133` | Ensaiadas em PG17 descartável | `scripts/reverter-0129-*.sql`, `scripts/reverter-0133-*.sql` |
| Runner e fixtures B7 | Reproduzíveis | `scripts/estoque-pg17/executar-b7.ps1`, `b7-setup.sql`, `b7-testes.sql`, `b7-verificar.sql` |
| Preflight read-only | Preservado, não repetir sem mudança de catálogo | `docs/estoques/preflight-integracao-homologacao-objetivo.md` e `consulta-preflight-*.sql` |
| Contrato `0129` | Atualizado com `0134`–`0136` e B7 | `docs/estoques/contrato-integracao-codex-estoque-dia.md` |
| Contrato de edição | Especificado, sem implementação | `docs/estoques/contrato-edicao-pedidos-estoque.md` |
| Carga dos 26 sabores | Conferida por leitura, **não aplicada** | `scripts/carga-exemplo-salgados-homolog.sql` e reversão |

**Não repetir:** suítes já aprovadas no checkpoint 01, reversões `0129`/`0133`,
ciclo B7 completo (solicitação → análise → aprovação/recusa → compromisso →
pedido definitivo → cobertura real → reserva FEFO → cancelamento e liberação),
nem a inspeção estática das `0134`–`0136`.

## 2. Inventário de RPCs que a retomada precisa conhecer

### 2.1 Canônicas da `0129` (já especificadas, não aplicadas em remoto)

`consultar_estoque_dia_salgados(date)`, `avaliar_venda_salgado(text,int,date,uuid)`,
`avaliar_preparo_salgado(...)`, `reservar_sabor_estoque(text,int,uuid,uuid,date)`,
`liberar_reserva_sabor(uuid,text,uuid)`, `solicitar_salgado(...)`,
`responder_solicitacao_salgado(...)`, `reconhecer_resposta_salgado(uuid)`,
`usar_autorizacao_salgado(...)`, `bloquear_sabor_salgados(...)`,
`desbloquear_sabor_salgados(...)`, `registrar_compromisso_salgado(...)`,
`cobrir_compromissos_salgados(...)`, `configurar_salgado_estoque(...)`,
`configurar_modo_salgados(...)`, `movimentar_lote_salgado(...)`.
View: `public.vw_saldos_sabores_estoque` (fonte única de disponibilidade).

### 2.2 B7 — novas RPCs do rascunho (somente após migration autorizada)

| RPC | Assinatura | Papel |
| --- | --- | --- |
| `configurar_b7_salgados` | `(boolean)` | `admin`; liga/desliga a flag (padrão `false`). |
| `criar_pedido_com_reserva` | `(uuid,text,jsonb,jsonb)` | Mantém a assinatura pública; wrapper chama `_base`. |
| `criar_pedido_com_reserva_base` | `(uuid,text,jsonb,jsonb)` | Interna; `EXECUTE` revogado de `authenticated`. |
| `registrar_compromisso_aprovado_b7` | `(uuid,uuid)` | Responsável autorizado. |
| `vincular_pedido_compromisso_b7` | `(uuid,uuid,uuid)` | Responsável autorizado. |
| `converter_compromisso_reserva_b7` | `(uuid,uuid,uuid)` | Responsável autorizado. |
| `cancelar_compromisso_b7` | `(uuid,text,uuid)` | Responsável autorizado. |
| `registrar_compromisso_futuro_b7` | `(text,int,date,uuid,text)` | Interna; nunca exposta ao cliente. |

Tabelas: `salgados_b7_config`, `salgados_agendamentos_b7` (situações
`analise_pendente`, `reserva_fisica_protegida`, `compromisso_aprovado`,
`pedido_vinculado`, `reserva_convertida`, `cancelado`, `recusado`).

### 2.3 RPCs existentes que a edição de pedidos deve reutilizar

`reservar_pedido_atomico` (`0089`), `liberar_pedido_atomico` (`0090`),
`registrar_consumo_reserva` (`0091`), `cancelar_pedido_atomico` (`0093`),
`estornar_pagamento_pedido` (`0106`), `pedidos_guard_update` (`0085`, realinhado
pela `0134`). **Nenhuma deve ser reescrita.**

## 3. Pontos de integração por superfície (Codex é dono dos arquivos)

| Superfície | Arquivos do Codex | O que falta | Não fazer |
| --- | --- | --- | --- |
| Checkout | `src/routes/checkout.tsx`, `src/lib/criacao-atomica.ts` | Aceitar `analise_necessaria` em `interpretarCriacao` e devolver estado sem `pedidoId`, sem cobrança e sem “estoque esgotado”. | Não criar pedido nem pagamento nesse estado; não alterar assinatura da RPC. |
| PDV | `src/routes/pdv.tsx` | Tratar `analise_necessaria` como “aguardando aprovação” apesar de `agendado_para`/`pagamento_imediato`. | Não redirecionar para pedido inexistente; não marcar venda concluída. |
| Central da Atendente | `src/components/central-pedidos.tsx`, `src/lib/central-pedidos.ts`, `src/routes/atendente.tsx` | Incluir `salgados_resposta` no filtro de notificações; opcionalmente exibir `data_solicitada`; ligar RPCs de aprovação/recusa B7 e ações de edição. | Não recriar rota `/atendente`; não duplicar menu lateral; não alterar `pedidos_guard_update`. |
| H02 / edição | `src/components/admin/pedidos-h02.tsx`, `pedidos-h02-detalhes.tsx`, `src/lib/pedidos-h02.ts` | Consumir o contrato de `docs/estoques/contrato-edicao-pedidos-estoque.md` quando a RPC existir. | Não escrever `pedido_itens`/reservas diretamente; não re precificar pedido pago. |
| Tipos | `src/integrations/supabase/types.ts` | Regenerar **depois** da migration autorizada, incluindo as RPCs B7 de cliente; excluir auxiliares internos. | Não editar manualmente nesta worktree nem antes da migration. |
| Cliente Supabase | `src/integrations/supabase/client.ts` | Nenhuma alteração prevista. | Não tocar. |

Mapa anterior de linhas está em
`docs/estoques/relatorio-preparacao-final-central-atendente.md`, seção 5. Usar
busca por símbolo antes de editar: os arquivos evoluíram no topo `4c703e4`.

## 4. Orem de retomada (somente com autorização expressa)

1. `git fetch origin` e conferir o topo oficial; hoje `4c703e4` com `0134`–`0136`
   já aplicadas em homologação. Base comum desta frente: `e50e750d0…`.
2. Negociar a numeração da corretiva B7 e da edição: **livre a partir de `0137`**.
   `0135` e `0136` estão ocupadas; nunca renomear ou duplicar migration publicada.
3. Preflight read-only com destino explícito, antes de qualquer escrita:
   `npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol`.
4. Integrar em worktree isolada, com commits normais; conferir conflitos. Proibido
   force push, rebase/amend de histórico publicado e alteração de `main`.
5. Aplicar migrations apenas em homologação, com `NEIA_PROJETO_ALVO` declarado no
   processo, e registrar reconciliação de histórico se SQL direto for usado.
6. Regenerar `types.ts`, ligar a UI e executar regressão pertinente.
7. Validar no endereço oficial e aguardar aprovação manual do proprietário.

Modelo seguro por comando (declarar no processo, nunca em arquivo versionado):

```powershell
$env:VITE_SUPABASE_URL = 'https://lflzlcqinarrcgncafol.supabase.co'
$env:VITE_SUPABASE_PROJECT_ID = 'lflzlcqinarrcgncafol'
$env:NEIA_PROJETO_ALVO = 'lflzlcqinarrcgncafol'
$env:NEIA_AMBIENTE = 'homologacao'
$env:VITE_DEMO_PREVIEW = '0'
npm run seguranca:destino -- --project-ref lflzlcqinarrcgncafol
```

## 5. Testes — o que fazer e o que não fazer

**Já concluídos, não repetir:**
- reversões `0129`/`0133` em PostgreSQL 17 descartável (`OK`);
- ciclo B7 completo em PostgreSQL 17 descartável (`B7 PG17 OK`), com evidência
  em `sql.log` referenciada em `docs/estoques/correcao-b7-agendamentos.md`;
- inspeção estática de convivência entre B7 e `0134`–`0136`.

**Pendentes, específicos da retomada:**
- integrar `0134`–`0136` + `0129`/`0133` + B7 em cluster descartável, validando
  `current_user = 'postgres'`, MD5 da guarda `8e4bc904ec461736b8d42664117a4432`,
  policies de `realtime.messages` e o gatilho de quitação na retirada;
- conferir no catálogo real as assinaturas e grants antes de aplicar qualquer
  migration;
- cenários de edição de pedidos do contrato (seção 9), inclusive concorrência;
- regressão de checkout, PDV, Central e H02 após ligar a UI;
- preflight final no endereço oficial antes da aprovação manual.

Reprodução do ciclo B7, quando necessária:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File \
  'scripts\estoque-pg17\executar-b7.ps1' \
  -Scratch 'C:\Users\User\AppData\Local\Temp\opencode'
```

## 6. Bloqueadores que permanecem

1. Autorização expressa para numerar, aplicar migrations, carregar lotes e
   publicar. Nada disso foi feito nesta frente.
2. `src/integrations/supabase/types.ts` e os componentes do Codex não podem ser
   editados na worktree isolada.
3. Conferência do catálogo real de homologação após `0134`–`0136`; presença de
   arquivo no Git não comprova aplicação no banco.
4. Homologação final da Central da Atendente pelo proprietário.
5. Definição coordenada da numeração a partir de `0137`.
6. A edição de pedidos existe como contrato; não há RPC implementada nem teste
   executado para ela. Uma especificação não caracteriza funcionalidade operacional.

## 7. Preservação

26 sabores oficiais, fotografias e sequência personalizada intactos; nenhum lote
de homologação carregado; nenhum acesso a produção; nenhum push, merge, deploy ou
migration remota. Menu lateral, layouts aprovados, `types.ts`, Central, PDV e
checkout permanecem sob responsabilidade do Codex e intocados aqui.
